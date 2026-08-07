// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { RelicsToken } from "../src/RelicsToken.sol";
import { RelicsNFT } from "../src/RelicsNFT.sol";
import { RelicsRenderer } from "../src/RelicsRenderer.sol";
import { RelicsV4Hook } from "../src/RelicsV4Hook.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

/// Behavioral proof of the seller-exit path over the EXACT production sources:
/// ordinary transfers, 0 / 1 / 16 / >16 retirements, holder-only batch preparation,
/// full-balance exit with no third-party involvement, allowance/operator paths, and
/// atomic failure. All four production contracts (token, NFT, renderer, hook) are the
/// byte-identical Etherscan-verified sources vendored in this directory; the hook is
/// constructed at a flag-valid address so BaseHook's permission validation runs for real.
/// No forge-std: only the vm.etch/vm.prank cheatcodes through a minimal interface.
interface Vm {
    function etch(address target, bytes calldata code) external;
    function prank(address sender) external;
}

contract TokenNftSyncExitTest {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    // Any address whose low 14 bits equal the hook's declared permission mask 0x1440.
    address internal constant HOOK_AT = address(uint160(0x1440));
    address internal constant POOL = address(0xBEEF); // relicSyncPool stand-in (the AMM vault)
    address internal constant PM = address(0xDEAD1); // PoolManager stand-in for the hook ctor
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant OPERATOR = address(0xCA7);

    uint256 internal constant UNIT = 1 ether;

    RelicsToken internal token;
    RelicsNFT internal nft;
    RelicsV4Hook internal hook;
    RelicsRenderer internal renderer;

    error PreparationRequired(uint256 deficit, uint256 sendBudget, uint256 callsRequired);
    error NotRelicOwner(uint256 tokenId, address caller);
    error PreparationBatchTooLarge(uint256 requested, uint256 maximum);
    error EmptyPreparation();
    error InsufficientLatentCapacity(uint256 requested, uint256 available);

    function setUp() public {
        // Same wiring order as the production deployment: token, hook, renderer, NFT,
        // then the one-shot owner registrations. The test contract plays the deployer
        // (initialRecipient == notMintableAccount == owner), which per the production
        // design can hold and move $RELICS but can never receive a Relic NFT.
        token = new RelicsToken(address(this), UNIT);
        hook = _deployHookAt(HOOK_AT, abi.encode(IPoolManager(PM), address(token), address(this)));
        renderer = new RelicsRenderer(address(token), address(hook));
        nft = new RelicsNFT(address(renderer), address(hook), address(token));
        token.setRelicsNFT(address(nft));
        token.setRelicSyncPool(POOL);
    }

    /// forge-std's deployCodeTo, inlined: run the constructor AT the target address so
    /// BaseHook's address-flag validation executes against the flag-valid address and
    /// the immutables are baked into the runtime that ends up there.
    function _deployHookAt(address where, bytes memory args) internal returns (RelicsV4Hook) {
        vm.etch(where, abi.encodePacked(type(RelicsV4Hook).creationCode, args));
        (bool ok, bytes memory runtime) = where.call("");
        require(ok, "hook constructor failed at flag address");
        vm.etch(where, runtime);
        return RelicsV4Hook(where);
    }

    function _fund(address who, uint256 units) internal {
        token.transfer(who, units * UNIT);
    }

    /// Awaken `n` Relics for `who` (n <= 8 per production cap) via the caller-only path.
    function _awaken(address who, uint256 n) internal returns (uint256 awakened) {
        uint256[] memory preview = nft.awakenPreview(n);
        require(preview.length == n, "preview shorter than requested");
        vm.prank(who);
        awakened = nft.awaken(preview, n);
        require(awakened == n, "partial fill unexpected in test");
    }

    // ---------------------------------------------------------------- ordinary paths

    function test_OrdinaryTransferDoesNoNftWork() public {
        _fund(ALICE, 10);
        vm.prank(ALICE);
        token.transfer(BOB, 3 * UNIT);
        require(token.balanceOf(ALICE) == 7 * UNIT, "sender balance");
        require(token.balanceOf(BOB) == 3 * UNIT, "receiver balance");
        require(nft.totalSupply() == 0 && nft.forgedSupply() == 0, "no ERC-721 work");
    }

    function test_InflowNeverMints() public {
        _fund(ALICE, 5);
        require(nft.balanceOf(ALICE) == 0, "receive must not mint");
        require(nft.latentRelicCapacity(ALICE) == 5, "latent capacity is derived only");
    }

    function test_TransferWithZeroRetirements() public {
        _fund(ALICE, 10);
        _awaken(ALICE, 2);
        vm.prank(ALICE);
        token.transfer(BOB, 8 * UNIT); // entitlement 2 >= active 2: deficit 0
        require(nft.balanceOf(ALICE) == 2, "no retirement owed");
        require(nft.totalSupply() == 2, "supply unchanged");
    }

    // ------------------------------------------------------------------- retirements

    function test_TransferRetiresExactlyOneLifo() public {
        _fund(ALICE, 10);
        _awaken(ALICE, 2);
        uint256 newest = nft.lastOwnedRelic(ALICE);
        vm.prank(ALICE);
        token.transfer(BOB, 9 * UNIT); // entitlement 1, active 2: deficit 1
        require(nft.balanceOf(ALICE) == 1, "exactly one retired");
        require(nft.dormantSupply() == 1, "retired id is dormant, identity kept");
        require(nft.lastOwnedRelic(ALICE) != newest, "LIFO: newest retires first");
    }

    function test_FullExitAtSendBudgetSixteen() public {
        _fund(ALICE, 16);
        _awaken(ALICE, 8);
        _awaken(ALICE, 8);
        require(nft.balanceOf(ALICE) == 16, "sixteen awakened");
        vm.prank(ALICE);
        token.transfer(BOB, 16 * UNIT); // deficit 16 == SEND_BUDGET: allowed
        require(token.balanceOf(ALICE) == 0, "entire balance exited in one transfer");
        require(nft.balanceOf(ALICE) == 0, "all sixteen retired with burn events");
        require(nft.dormantSupply() == 16 && nft.totalSupply() == 0, "identities preserved dormant");
    }

    function test_TransferRevertsAboveSendBudgetAtomically() public {
        _fund(ALICE, 17);
        _awaken(ALICE, 8);
        _awaken(ALICE, 8);
        _awaken(ALICE, 1);
        uint256 balanceBefore = token.balanceOf(ALICE);
        uint256 activeBefore = nft.balanceOf(ALICE);
        uint256 dormantBefore = nft.dormantSupply();

        vm.prank(ALICE);
        try token.transfer(BOB, 17 * UNIT) {
            revert("transfer above SEND_BUDGET must revert");
        } catch (bytes memory err) {
            require(bytes4(err) == PreparationRequired.selector, "wrong error");
            (uint256 deficit, uint256 budget, uint256 calls) =
                abi.decode(_slice(err), (uint256, uint256, uint256));
            require(deficit == 17 && budget == 16 && calls == 1, "exact preparation quote");
        }
        require(token.balanceOf(ALICE) == balanceBefore, "ERC-20 leg unwound");
        require(token.balanceOf(BOB) == 0, "receiver got nothing");
        require(nft.balanceOf(ALICE) == activeBefore, "no Relic quietly retired");
        require(nft.dormantSupply() == dormantBefore, "dormancy pool untouched");
    }

    function test_PrepareSellThenFullExitNoThirdParty() public {
        _fund(ALICE, 17);
        _awaken(ALICE, 8);
        _awaken(ALICE, 8);
        _awaken(ALICE, 1);
        uint256[] memory ids = new uint256[](1);
        ids[0] = nft.lastOwnedRelic(ALICE);
        vm.prank(ALICE);
        uint256 prepared = nft.prepareSell(ids); // holder chooses which Relic goes dormant
        require(prepared == 1, "one prepared");
        vm.prank(ALICE);
        token.transfer(BOB, 17 * UNIT); // deficit now 16: full exit clears
        require(token.balanceOf(ALICE) == 0 && nft.balanceOf(ALICE) == 0, "complete exit");
    }

    // ------------------------------------------------- authority and operator limits

    function test_PrepareSellIsHolderOnly() public {
        _fund(ALICE, 2);
        _awaken(ALICE, 1);
        uint256 id = nft.lastOwnedRelic(ALICE);
        vm.prank(ALICE);
        nft.setApprovalForAll(OPERATOR, true); // full ERC-721 operator authority
        vm.prank(ALICE);
        token.approve(OPERATOR, type(uint256).max); // full ERC-20 allowance too
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.prank(OPERATOR);
        try nft.prepareSell(ids) {
            revert("operator must not prepare for the holder");
        } catch (bytes memory err) {
            require(bytes4(err) == NotRelicOwner.selector, "wrong error");
        }
    }

    function test_AwakenIsSenderOnlyCapacity() public {
        _fund(ALICE, 2);
        uint256[] memory preview = nft.awakenPreview(1);
        vm.prank(OPERATOR); // no $RELICS at all: no capacity to materialise against
        try nft.awaken(preview, 1) {
            revert("no-capacity awaken must revert");
        } catch (bytes memory err) {
            require(bytes4(err) == InsufficientLatentCapacity.selector, "wrong error");
        }
    }

    function test_AllowanceTransferFromSyncsTheSender() public {
        _fund(ALICE, 3);
        _awaken(ALICE, 3);
        vm.prank(ALICE);
        token.approve(BOB, 2 * UNIT);
        vm.prank(BOB);
        token.transferFrom(ALICE, BOB, 2 * UNIT); // entitlement 1, active 3: deficit 2
        require(nft.balanceOf(ALICE) == 1, "spender-driven outflow retires like a direct one");
        require(nft.balanceOf(BOB) == 0, "receiver side stays untouched");
    }

    function test_PrepareSellBatchBounds() public {
        _fund(ALICE, 1);
        uint256[] memory empty = new uint256[](0);
        vm.prank(ALICE);
        try nft.prepareSell(empty) {
            revert("empty preparation must revert");
        } catch (bytes memory err) {
            require(bytes4(err) == EmptyPreparation.selector, "wrong error");
        }
        uint256[] memory tooMany = new uint256[](17);
        vm.prank(ALICE);
        try nft.prepareSell(tooMany) {
            revert("oversized preparation must revert");
        } catch (bytes memory err) {
            require(bytes4(err) == PreparationBatchTooLarge.selector, "wrong error");
        }
    }

    // ------------------------------------------------------------------------ utils

    function _slice(bytes memory err) private pure returns (bytes memory data) {
        data = new bytes(err.length - 4);
        for (uint256 i; i < data.length; ++i) {
            data[i] = err[i + 4];
        }
    }
}

/// Offline CREATE2 proof for the token, mirroring DeploymentProof.t.sol for the hook:
/// this exact source tree at these compiler settings reproduces the init code whose
/// mined hash produced the recorded token address (which is what made $RELICS sort
/// below WETH as currency0).
contract TokenDeploymentProofTest {
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address internal constant DEPLOYED_TOKEN = 0x8F294a99a0609822C233b24867F331c292cE2DA9;
    address internal constant INITIAL_RECIPIENT = 0x0Bda97b911575B158c9364865389833c75619893;
    bytes32 internal constant SALT = bytes32(0);
    bytes32 internal constant MINED_INIT_CODE_HASH =
        0x95cfac7b69dfa4cf7dba9347bad5345a2f0be69e1b3ee4728514d477bc096330;

    function _initCode() internal pure returns (bytes memory) {
        return abi.encodePacked(
            type(RelicsToken).creationCode, abi.encode(INITIAL_RECIPIENT, uint256(1 ether))
        );
    }

    function test_TokenInitCodeHashMatchesMinedRecord() public pure {
        require(keccak256(_initCode()) == MINED_INIT_CODE_HASH, "token init code drifted");
    }

    function test_TokenCreate2AddressMatchesDeployedToken() public pure {
        address predicted = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, SALT, keccak256(_initCode()))
                    )
                )
            )
        );
        require(predicted == DEPLOYED_TOKEN, "CREATE2 derivation does not reach the live token");
    }
}
