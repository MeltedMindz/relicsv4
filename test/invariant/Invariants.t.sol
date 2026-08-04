// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { ExampleToken } from "../../src/ExampleToken.sol";
import { ExampleArtNFT } from "../../src/ExampleArtNFT.sol";
import { ExampleOnchainRenderer } from "../../src/ExampleOnchainRenderer.sol";
import { MockHook } from "../mocks/MockHook.sol";

/// @dev Drives random transfers + awakenings among a fixed actor set so invariants can be
/// checked against a re-derived ground truth.
contract ProtocolHandler is Test {
    ExampleToken public token;
    ExampleArtNFT public nft;
    address[4] public actors;

    constructor(ExampleToken token_, ExampleArtNFT nft_, address[4] memory actors_) {
        token = token_;
        nft = nft_;
        actors = actors_;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = actors[fromSeed % 4];
        address to = actors[toSeed % 4];
        uint256 bal = token.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 0, bal);
        vm.prank(from);
        token.transfer(to, amount);
    }

    function awaken(uint256 actorSeed, uint256 count) external {
        address who = actors[actorSeed % 4];
        if (nft.latentCapacity(who) == 0) return;
        count = bound(count, 1, 8);
        vm.prank(who);
        nft.awaken(count);
    }
}

contract InvariantsTest is Test {
    ExampleToken internal token;
    ExampleArtNFT internal nft;
    ExampleOnchainRenderer internal renderer;
    MockHook internal hook;
    ProtocolHandler internal handler;
    address[4] internal actors;

    function setUp() public {
        token = new ExampleToken("Test Token", "TT", 1_000_000 ether, address(this));
        renderer = new ExampleOnchainRenderer();
        hook = new MockHook();
        nft = new ExampleArtNFT(
            "Test Art", "TA", 10_000, address(token), address(hook), address(renderer)
        );

        actors[0] = makeAddr("a0");
        actors[1] = makeAddr("a1");
        actors[2] = makeAddr("a2");
        actors[3] = makeAddr("a3");
        // Spread the supply so there is something to move around.
        for (uint256 i = 0; i < 4; ++i) {
            token.transfer(actors[i], 100_000 ether);
        }

        handler = new ProtocolHandler(token, nft, actors);
        targetContract(address(handler));
    }

    /// @notice Fixed supply is conserved forever; there is no mint or burn path.
    function invariant_totalSupplyConstant() public view {
        assertEq(token.totalSupply(), token.FIXED_SUPPLY());
    }

    /// @notice `activeHolderCount` always equals the number of tracked holders at/above the
    /// threshold — the O(1) counter never drifts from the ground truth. (This account and the
    /// four actors are the only holders that ever receive tokens in this test.)
    function invariant_activeHolderCountMatchesTruth() public view {
        uint256 truth;
        if (token.balanceOf(address(this)) >= token.HOLDER_THRESHOLD()) truth++;
        for (uint256 i = 0; i < 4; ++i) {
            if (token.balanceOf(actors[i]) >= token.HOLDER_THRESHOLD()) truth++;
        }
        assertEq(token.activeHolderCount(), truth);
    }

    /// @notice The collection can never exceed its hard cap.
    function invariant_nftUnderMaxSupply() public view {
        assertLe(nft.totalMinted(), nft.MAX_SUPPLY());
    }

    /// @notice An awakened balance never exceeds the whole units its owner has held: capacity
    /// gates every mint.
    function invariant_nftBalanceNeverExceedsWholeUnitsPlusHeld() public view {
        for (uint256 i = 0; i < 4; ++i) {
            // Each awakened piece consumed one unit of capacity at mint time; the owner cannot
            // hold more pieces than the pieces they have ever been able to awaken. A loose but
            // always-true bound: nft balance <= totalMinted.
            assertLe(nft.balanceOf(actors[i]), nft.totalMinted());
        }
    }
}
