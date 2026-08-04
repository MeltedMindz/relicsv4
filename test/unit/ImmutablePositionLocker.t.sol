// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { ImmutablePositionLocker } from "../../src/ImmutablePositionLocker.sol";
import { MintableERC20 } from "../mocks/MintableERC20.sol";
import { MockPositionManager } from "../mocks/MockPositionManager.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract ImmutablePositionLockerTest is Test {
    MockPositionManager internal pm;
    MintableERC20 internal c0;
    MintableERC20 internal c1;
    address internal recipient0 = makeAddr("recipient0");
    address internal recipient1 = makeAddr("recipient1");

    uint256 internal constant POSITION_ID = 42;
    uint128 internal constant LIQUIDITY = 1e18;

    function setUp() public {
        pm = new MockPositionManager();
        // Deploy two tokens and use them in sorted order as the pool currencies.
        MintableERC20 a = new MintableERC20("C0", "C0");
        MintableERC20 b = new MintableERC20("C1", "C1");
        (c0, c1) = address(a) < address(b) ? (a, b) : (b, a);
        pm.mintPosition(POSITION_ID, address(this), _key(address(c0), address(c1)), LIQUIDITY);
    }

    function _key(address x0, address x1) internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(x0),
            currency1: Currency.wrap(x1),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
    }

    function _deployLocker() internal returns (ImmutablePositionLocker locker) {
        locker = new ImmutablePositionLocker(
            address(pm), address(c0), address(c1), recipient0, recipient1, POSITION_ID
        );
    }

    function _secure(ImmutablePositionLocker locker) internal {
        pm.safeTransferFrom(address(this), address(locker), POSITION_ID);
    }

    // ---- constructor validation ----

    function test_constructorRejectsZeroAndIdentical() public {
        vm.expectRevert(
            abi.encodeWithSelector(ImmutablePositionLocker.ZeroAddress.selector, "positionManager")
        );
        new ImmutablePositionLocker(
            address(0), address(c0), address(c1), recipient0, recipient1, POSITION_ID
        );

        vm.expectRevert(ImmutablePositionLocker.IdenticalCurrencies.selector);
        new ImmutablePositionLocker(
            address(pm), address(c0), address(c0), recipient0, recipient1, POSITION_ID
        );

        vm.expectRevert(ImmutablePositionLocker.InvalidPositionId.selector);
        new ImmutablePositionLocker(
            address(pm), address(c0), address(c1), recipient0, recipient1, 0
        );
    }

    function test_constructorRejectsForbiddenRecipient() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ImmutablePositionLocker.ForbiddenRecipient.selector, "recipient0", address(1)
            )
        );
        new ImmutablePositionLocker(
            address(pm), address(c0), address(c1), address(1), recipient1, POSITION_ID
        );
    }

    function test_constructorRejectsCurrencyMismatch() public {
        // Swap the currency order vs the actual position.
        vm.expectRevert();
        new ImmutablePositionLocker(
            address(pm), address(c1), address(c0), recipient0, recipient1, POSITION_ID
        );
    }

    function test_constructorRejectsNoLiquidity() public {
        pm.mintPosition(7, address(this), _key(address(c0), address(c1)), 0);
        vm.expectRevert(
            abi.encodeWithSelector(ImmutablePositionLocker.PositionHasNoLiquidity.selector, 7)
        );
        new ImmutablePositionLocker(
            address(pm), address(c0), address(c1), recipient0, recipient1, 7
        );
    }

    function test_constructorRecordsGenesisLiquidityAndPolicyHash() public {
        ImmutablePositionLocker locker = _deployLocker();
        assertEq(locker.GENESIS_LIQUIDITY(), LIQUIDITY);
        assertTrue(locker.feePolicyHash() != bytes32(0));
    }

    // ---- custody ----

    function test_custodyAcceptsOnlyCorrectPositionOnce() public {
        ImmutablePositionLocker locker = _deployLocker();
        _secure(locker);
        assertTrue(locker.positionSecured());
        assertEq(locker.custodian(), address(locker));

        // A second delivery (from the PM context) reverts.
        vm.prank(address(pm));
        vm.expectRevert(
            abi.encodeWithSelector(
                ImmutablePositionLocker.PositionAlreadySecured.selector, POSITION_ID
            )
        );
        locker.onERC721Received(address(pm), address(this), POSITION_ID, "");
    }

    function test_custodyRejectsUnexpectedSender() public {
        ImmutablePositionLocker locker = _deployLocker();
        vm.expectRevert(
            abi.encodeWithSelector(ImmutablePositionLocker.UnexpectedNFT.selector, address(this))
        );
        locker.onERC721Received(address(this), address(this), POSITION_ID, "");
    }

    function test_custodyRejectsWrongTokenId() public {
        ImmutablePositionLocker locker = _deployLocker();
        pm.mintPosition(99, address(this), _key(address(c0), address(c1)), LIQUIDITY);
        vm.expectRevert(
            abi.encodeWithSelector(ImmutablePositionLocker.UnexpectedTokenId.selector, 99)
        );
        pm.safeTransferFrom(address(this), address(locker), 99);
    }

    // ---- fee collection ----

    function test_collectFeesRoutesDirectlyToRecipients() public {
        ImmutablePositionLocker locker = _deployLocker();
        _secure(locker);

        c0.mint(address(pm), 3 ether);
        c1.mint(address(pm), 5 ether);
        pm.setPendingFees(3 ether, 5 ether);

        (uint256 got0, uint256 got1) = locker.collectFees();
        assertEq(got0, 3 ether);
        assertEq(got1, 5 ether);
        assertEq(c0.balanceOf(recipient0), 3 ether);
        assertEq(c1.balanceOf(recipient1), 5 ether);
        // The locker never holds a fee asset.
        assertEq(c0.balanceOf(address(locker)), 0);
        assertEq(c1.balanceOf(address(locker)), 0);
        // Principal is untouched.
        assertEq(locker.custodiedLiquidity(), LIQUIDITY);
    }

    function test_collectFeesWithZeroPendingIsNoOp() public {
        ImmutablePositionLocker locker = _deployLocker();
        _secure(locker);
        (uint256 got0, uint256 got1) = locker.collectFees();
        assertEq(got0, 0);
        assertEq(got1, 0);
    }

    function test_collectFeesBeforeCustodyReverts() public {
        ImmutablePositionLocker locker = _deployLocker();
        vm.expectRevert(
            abi.encodeWithSelector(
                ImmutablePositionLocker.PositionNotInCustody.selector, POSITION_ID, address(this)
            )
        );
        locker.collectFees();
    }

    /// @notice The headline lesson: donating tokens AND pushing extra NFTs into the locker
    /// changes NOTHING about fee collection. No balance the locker holds is read for control.
    function test_donationDoesNotAlterFeeCollection() public {
        ImmutablePositionLocker locker = _deployLocker();
        _secure(locker);

        // Donate ERC-20s straight into the locker...
        c0.mint(address(locker), 1000 ether);
        c1.mint(address(locker), 2000 ether);
        // ...and push a stray position NFT into it (simulating a plain transferFrom donation).
        pm.mintPosition(777, address(locker), _key(address(c0), address(c1)), 12_345);

        // Real fees still route exactly, and the donations stay stranded (unspent).
        c0.mint(address(pm), 4 ether);
        c1.mint(address(pm), 6 ether);
        pm.setPendingFees(4 ether, 6 ether);

        (uint256 got0, uint256 got1) = locker.collectFees();
        assertEq(got0, 4 ether);
        assertEq(got1, 6 ether);
        assertEq(c0.balanceOf(recipient0), 4 ether);
        assertEq(c1.balanceOf(recipient1), 6 ether);
        // Donated balances are untouched — inert dust.
        assertEq(c0.balanceOf(address(locker)), 1000 ether);
        assertEq(c1.balanceOf(address(locker)), 2000 ether);
    }
}
