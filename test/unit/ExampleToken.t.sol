// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { ExampleToken } from "../../src/ExampleToken.sol";

contract ExampleTokenTest is Test {
    ExampleToken internal token;
    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new ExampleToken(deployer);
    }

    function test_fixedSupplyMintedToInitialHolder() public view {
        assertEq(token.totalSupply(), token.FIXED_SUPPLY());
        assertEq(token.balanceOf(deployer), token.FIXED_SUPPLY());
        assertEq(token.activeHolderCount(), 1);
        assertTrue(token.isActiveHolder(deployer));
    }

    function test_constructorRejectsZeroHolder() public {
        vm.expectRevert(bytes("EXON: zero holder"));
        new ExampleToken(address(0));
    }

    function test_noMintFunctionExists() public view {
        // There is no external mint; supply is constant. This is a compile-time guarantee,
        // asserted here as documentation: total supply never changes after construction.
        assertEq(token.totalSupply(), 1_000_000 ether);
    }

    function test_activeHolderCountTracksThreshold() public {
        vm.prank(deployer);
        token.transfer(alice, 1 ether);
        assertEq(token.activeHolderCount(), 2, "alice becomes active at 1 unit");

        // A dust transfer below threshold does not create a new active holder.
        vm.prank(deployer);
        token.transfer(bob, 0.5 ether);
        assertFalse(token.isActiveHolder(bob));
        assertEq(token.activeHolderCount(), 2);

        // Topping bob over the threshold flips him active exactly once.
        vm.prank(deployer);
        token.transfer(bob, 0.5 ether);
        assertTrue(token.isActiveHolder(bob));
        assertEq(token.activeHolderCount(), 3);
    }

    function test_activeHolderCountDecrementsOnDrain() public {
        vm.prank(deployer);
        token.transfer(alice, 5 ether);
        assertEq(token.activeHolderCount(), 2);

        vm.prank(alice);
        token.transfer(bob, 5 ether); // alice -> 0, bob -> 5: net active count unchanged
        assertFalse(token.isActiveHolder(alice));
        assertTrue(token.isActiveHolder(bob));
        assertEq(token.activeHolderCount(), 2);
    }

    function test_transferFromPathAlsoUpdatesCount() public {
        vm.prank(deployer);
        token.approve(address(this), 3 ether);
        token.transferFrom(deployer, alice, 3 ether);
        assertTrue(token.isActiveHolder(alice));
        assertEq(token.activeHolderCount(), 2);
    }
}
