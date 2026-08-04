// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { HookTestBase } from "../utils/HookTestBase.sol";
import { ExampleV4Hook } from "../../src/ExampleV4Hook.sol";
import { IExampleHook } from "../../src/interfaces/IExampleHook.sol";
import { MintableERC20 } from "../mocks/MintableERC20.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";

contract ExampleV4HookTest is HookTestBase {
    MintableERC20 internal tokenA;
    MintableERC20 internal tokenB;

    function setUp() public {
        _deployCore();
        tokenA = new MintableERC20("Art", "ART");
        tokenB = new MintableERC20("Quote", "QUOTE");
    }

    // ---- address flags ----

    function test_plainDeployWithWrongFlagsReverts() public {
        // A CREATE (no mined salt) almost never lands on a 0x1440 address, so BaseHook's
        // constructor validation must reject it. This is the "hook address encodes flags" lesson.
        vm.expectRevert();
        new ExampleV4Hook(manager, address(tokenA), address(this));
    }

    function test_minedHookHasExactFlagBits() public {
        ExampleV4Hook hook = _mineAndDeployHook(address(tokenA));
        assertEq(uint160(address(hook)) & 0x3FFF, 0x1440, "low 14 bits must equal 0x1440");
    }

    // ---- binding + init price ----

    function test_bindThenInitAtExpectedPrice() public {
        (ExampleV4Hook hook, PoolKey memory key,) = _boundPool(address(tokenA), 0);
        assertTrue(hook.isPoolBound());
        IExampleHook.MarketState memory s = hook.getMarketState();
        assertEq(s.lastTick, 0);
        assertEq(s.highTick, 0);
    }

    function test_doubleBindReverts() public {
        (ExampleV4Hook hook, PoolKey memory key,) = _boundPool(address(tokenA), 0);
        vm.expectRevert(ExampleV4Hook.CanonicalPoolAlreadyBound.selector);
        hook.bindCanonicalPool(
            PoolId.unwrap(key.toId()),
            Currency.unwrap(key.currency0),
            Currency.unwrap(key.currency1),
            key.fee,
            key.tickSpacing,
            TickMath.getSqrtPriceAtTick(0),
            0
        );
    }

    function test_initAtUnexpectedPriceReverts() public {
        ExampleV4Hook hook = _mineAndDeployHook(address(tokenA));
        (Currency c0, Currency c1) = _sorted(address(tokenA), address(tokenB));
        PoolKey memory key = _poolKey(hook, c0, c1);
        // Bind expecting tick 0, then initialize at tick 60 -> revert.
        hook.bindCanonicalPool(
            PoolId.unwrap(key.toId()),
            Currency.unwrap(c0),
            Currency.unwrap(c1),
            FEE,
            TICK_SPACING,
            TickMath.getSqrtPriceAtTick(0),
            0
        );
        vm.expectRevert();
        manager.initialize(key, TickMath.getSqrtPriceAtTick(60));
    }

    function test_spoofedPoolCannotDriveState() public {
        (ExampleV4Hook hook,,) = _boundPool(address(tokenA), 0);
        // Try to initialize a DIFFERENT pool (different fee) using the same hook. The full
        // PoolKey validation rejects it: poolId != canonicalPoolId.
        (Currency c0, Currency c1) = _sorted(address(tokenA), address(tokenB));
        PoolKey memory spoof = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: 500, // different fee => different poolId
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
        vm.expectRevert();
        manager.initialize(spoof, TickMath.getSqrtPriceAtTick(0));
    }

    // ---- observation, both orderings ----

    function test_buyClassification_artIsCurrency0() public {
        (Currency c0,) = _sorted(address(tokenA), address(tokenB));
        address art = Currency.unwrap(c0);
        (ExampleV4Hook hook, PoolKey memory key,) = _boundPool(art, 0);
        assertTrue(hook.artTokenIsCurrency0());

        _addLiquidity(key, -600, 600, 1e21);
        // Buy art (currency0): swapper receives currency0 -> zeroForOne = false, exact input.
        _swap(key, false, -1e15);

        IExampleHook.MarketState memory s = hook.getMarketState();
        assertEq(s.swapCount, 1);
        assertGt(s.cumulativeBuyVolume, 0);
        assertEq(s.cumulativeSellVolume, 0);
    }

    function test_sellClassification_artIsCurrency1() public {
        (, Currency c1) = _sorted(address(tokenA), address(tokenB));
        address art = Currency.unwrap(c1);
        (ExampleV4Hook hook, PoolKey memory key,) = _boundPool(art, 0);
        assertFalse(hook.artTokenIsCurrency0());

        _addLiquidity(key, -600, 600, 1e21);
        // Sell art (currency1): swapper gives currency1 -> zeroForOne = false gives currency1?
        // zeroForOne=false means swap currency1 -> currency0, i.e. paying art (currency1): SELL.
        _swap(key, false, -1e15);

        IExampleHook.MarketState memory s = hook.getMarketState();
        assertEq(s.swapCount, 1);
        assertGt(s.cumulativeSellVolume, 0);
        assertEq(s.cumulativeBuyVolume, 0);
    }

    function test_liquidityObservationIncrementsCounter() public {
        (ExampleV4Hook hook, PoolKey memory key,) = _boundPool(address(tokenA), 0);
        _addLiquidity(key, -600, 600, 1e21);
        IExampleHook.MarketState memory s = hook.getMarketState();
        assertEq(s.liquidityEventCount, 1);
    }

    function test_entropyChangesOnEveryObservation() public {
        (ExampleV4Hook hook, PoolKey memory key,) = _boundPool(address(tokenA), 0);
        bytes32 e0 = hook.getMarketState().entropy;
        _addLiquidity(key, -600, 600, 1e21);
        bytes32 e1 = hook.getMarketState().entropy;
        _swap(key, false, -1e15);
        bytes32 e2 = hook.getMarketState().entropy;
        assertTrue(e0 != e1 && e1 != e2, "entropy must advance");
    }

    // ---- helper ----

    function _boundPool(
        address art,
        int24 launchTick
    )
        internal
        returns (ExampleV4Hook hook, PoolKey memory key, uint160 sqrtPriceX96)
    {
        hook = _mineAndDeployHook(art);
        (Currency c0, Currency c1) = _sorted(address(tokenA), address(tokenB));
        key = _poolKey(hook, c0, c1);
        sqrtPriceX96 = _bindAndInit(hook, key, launchTick);
    }
}
