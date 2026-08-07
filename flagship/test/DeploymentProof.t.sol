// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { RelicsV4Hook } from "../src/RelicsV4Hook.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";

/// Offline proof that this exact source tree, compiled with the profile in
/// ../foundry.toml, reproduces the init code that deployed the production
/// RELICS hook on Ethereum mainnet. No RPC, no network, no forge-std.
///
/// The chain of evidence:
///   1. keccak256(creationCode ++ constructorArgs) equals the init-code hash
///      recorded when the hook address was CREATE2-mined before launch.
///   2. CREATE2(deployer, salt, initCodeHash) equals the live hook address.
///   3. The low 14 bits of that address encode exactly the three enabled
///      callbacks (afterInitialize | afterAddLiquidity | afterSwap = 0x1440),
///      which Uniswap v4 reads from the address itself.
/// A single changed byte anywhere in src/ or lib/, or a changed compiler
/// setting, changes the creation code and every assertion below fails.
contract DeploymentProofTest {
    // Ethereum mainnet, chain id 1. All values are public on-chain facts.
    address internal constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address internal constant RELICS_TOKEN = 0x8F294a99a0609822C233b24867F331c292cE2DA9;
    address internal constant INITIAL_OWNER = 0x0Bda97b911575B158c9364865389833c75619893; // since renounced to address(0)
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address internal constant DEPLOYED_HOOK = 0xA6f73cc88723f04b85E2c2aF3e35F759Dc1A9440;
    bytes32 internal constant SALT = bytes32(uint256(0x1302));
    bytes32 internal constant MINED_INIT_CODE_HASH =
        0x8a34afeab7eb2fc0646a49fa6917a159c1ef5f2e959445ecfb53b42fde808535;
    uint160 internal constant EXPECTED_FLAGS = 0x1440;

    function _constructorArgs() internal pure returns (bytes memory) {
        return abi.encode(IPoolManager(POOL_MANAGER), RELICS_TOKEN, INITIAL_OWNER);
    }

    function _initCode() internal pure returns (bytes memory) {
        return abi.encodePacked(type(RelicsV4Hook).creationCode, _constructorArgs());
    }

    function test_ConstructorArgsMatchVerifiedRecord() public pure {
        // Byte-exact constructor arguments published with the Etherscan verification.
        bytes memory recorded =
            hex"000000000000000000000000000000000004444c5dc75cb358380d2e3de08a900000000000000000000000008f294a99a0609822c233b24867f331c292ce2da90000000000000000000000000bda97b911575b158c9364865389833c75619893";
        require(keccak256(_constructorArgs()) == keccak256(recorded), "constructor args drifted");
    }

    function test_InitCodeHashMatchesMinedRecord() public pure {
        require(keccak256(_initCode()) == MINED_INIT_CODE_HASH, "init code drifted from deployed revision");
    }

    function test_Create2AddressMatchesDeployedHook() public pure {
        address predicted = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, SALT, keccak256(_initCode()))
                    )
                )
            )
        );
        require(predicted == DEPLOYED_HOOK, "CREATE2 derivation does not reach the live hook address");
    }

    function test_AddressEncodesExactlyTheDeclaredPermissions() public pure {
        require(uint160(DEPLOYED_HOOK) & Hooks.ALL_HOOK_MASK == EXPECTED_FLAGS, "address flag bits changed");
        // Cross-check the flag constants against v4-core's own bit definitions.
        uint160 declared = Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG;
        require(declared == EXPECTED_FLAGS, "declared permission set is not 0x1440");
    }
}
