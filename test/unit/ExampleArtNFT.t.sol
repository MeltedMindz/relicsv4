// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { ExampleToken } from "../../src/ExampleToken.sol";
import { ExampleArtNFT } from "../../src/ExampleArtNFT.sol";
import { ExampleOnchainRenderer } from "../../src/ExampleOnchainRenderer.sol";
import { IERC4906 } from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import { MockHook } from "../mocks/MockHook.sol";

contract ExampleArtNFTTest is Test {
    ExampleToken internal token;
    ExampleArtNFT internal nft;
    ExampleOnchainRenderer internal renderer;
    MockHook internal hook;

    address internal deployer = address(this);
    address internal alice = makeAddr("alice");

    function setUp() public {
        token = new ExampleToken(deployer);
        renderer = new ExampleOnchainRenderer();
        hook = new MockHook();
        nft = new ExampleArtNFT(address(token), address(hook), address(renderer));
    }

    function test_constructorRejectsZeroDeps() public {
        vm.expectRevert(ExampleArtNFT.ZeroAddress.selector);
        new ExampleArtNFT(address(0), address(hook), address(renderer));
    }

    function test_inflowDoesNotMint() public {
        // Sending tokens to alice raises capacity but mints NOTHING on its own.
        token.transfer(alice, 5 ether);
        assertEq(nft.balanceOf(alice), 0, "no auto-mint on inflow");
        assertEq(nft.latentCapacity(alice), 5);
    }

    function test_awakenRequiresCapacity() public {
        vm.expectRevert(abi.encodeWithSelector(ExampleArtNFT.NoLatentCapacity.selector, alice));
        vm.prank(alice);
        nft.awaken(1);
    }

    function test_awakenMintsUpToCapacityAndCap() public {
        token.transfer(alice, 20 ether); // capacity 20

        vm.prank(alice);
        (uint256 firstId, uint256 minted) = nft.awaken(8); // capped by MAX_AWAKEN_PER_CALL
        assertEq(firstId, 1);
        assertEq(minted, 8);
        assertEq(nft.balanceOf(alice), 8);
        assertEq(nft.totalMinted(), 8);

        // capacity is now 20 - 8 = 12; another full call mints 8 more
        vm.prank(alice);
        (, uint256 minted2) = nft.awaken(8);
        assertEq(minted2, 8);
        assertEq(nft.latentCapacity(alice), 4);
    }

    function test_awakenClampsToCapacity() public {
        token.transfer(alice, 3 ether); // capacity 3
        vm.prank(alice);
        (, uint256 minted) = nft.awaken(8);
        assertEq(minted, 3, "clamped to capacity");
    }

    function test_awakenRejectsZeroAndOversizedCount() public {
        token.transfer(alice, 10 ether);
        vm.startPrank(alice);
        vm.expectRevert(ExampleArtNFT.AwakenCountZero.selector);
        nft.awaken(0);
        vm.expectRevert(abi.encodeWithSelector(ExampleArtNFT.AwakenCountTooLarge.selector, 9, 8));
        nft.awaken(9);
        vm.stopPrank();
    }

    function test_tokenURIrendersOnchain() public {
        token.transfer(alice, 1 ether);
        vm.prank(alice);
        nft.awaken(1);
        string memory uri = nft.tokenURI(1);
        assertTrue(bytes(uri).length > 0);
        // DNA is immutable and set at awaken
        assertTrue(nft.dnaOf(1) != bytes32(0));
    }

    function test_tokenURIRevertsForNonexistent() public {
        vm.expectRevert(abi.encodeWithSelector(ExampleArtNFT.NonexistentToken.selector, 999));
        nft.tokenURI(999);
    }

    function test_supportsErc4906() public view {
        assertTrue(nft.supportsInterface(type(IERC4906).interfaceId));
        assertTrue(nft.supportsInterface(0x80ac58cd)); // ERC-721
    }

    function test_awakenEmitsMetadataUpdate() public {
        token.transfer(alice, 1 ether);
        vm.expectEmit(true, false, false, false);
        emit IERC4906.MetadataUpdate(1);
        vm.prank(alice);
        nft.awaken(1);
    }
}
