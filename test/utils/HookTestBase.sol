// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { PoolManager } from "@uniswap/v4-core/src/PoolManager.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolModifyLiquidityTest } from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import { PoolSwapTest } from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { SwapParams, ModifyLiquidityParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { HookMiner } from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import { ExampleV4Hook } from "../../src/ExampleV4Hook.sol";
import { MintableERC20 } from "../mocks/MintableERC20.sol";

/// @dev Shared scaffolding for hook + deployment tests: a real, locally-deployed v4
/// PoolManager and the v4-core test routers. No forking, no secrets.
abstract contract HookTestBase is Test {
    uint160 internal constant HOOK_FLAGS = uint160(
        Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG
    );
    uint24 internal constant FEE = 3000;
    int24 internal constant TICK_SPACING = 60;

    PoolManager internal manager;
    PoolModifyLiquidityTest internal modifyRouter;
    PoolSwapTest internal swapRouter;

    function _deployCore() internal {
        manager = new PoolManager(address(this));
        modifyRouter = new PoolModifyLiquidityTest(manager);
        swapRouter = new PoolSwapTest(manager);
    }

    /// @dev Mine a CREATE2 salt whose address carries exactly the 0x1440 permission bits, then
    /// deploy the hook to it. `artToken` must be one of the two pool currencies.
    function _mineAndDeployHook(address artToken) internal returns (ExampleV4Hook hook) {
        bytes memory args = abi.encode(manager, artToken, address(this));
        (address predicted, bytes32 salt) =
            HookMiner.find(address(this), HOOK_FLAGS, type(ExampleV4Hook).creationCode, args);
        hook = new ExampleV4Hook{ salt: salt }(manager, artToken, address(this));
        require(address(hook) == predicted, "hook address mismatch");
    }

    /// @dev Sort two token addresses into (currency0, currency1) as v4 requires (ascending).
    function _sorted(address a, address b) internal pure returns (Currency c0, Currency c1) {
        (address lo, address hi) = a < b ? (a, b) : (b, a);
        return (Currency.wrap(lo), Currency.wrap(hi));
    }

    /// @dev Build the canonical PoolKey for a bound hook.
    function _poolKey(
        ExampleV4Hook hook,
        Currency c0,
        Currency c1
    )
        internal
        pure
        returns (PoolKey memory)
    {
        return PoolKey({
            currency0: c0,
            currency1: c1,
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
    }

    /// @dev Bind the canonical pool (one-shot) then initialize it at `launchTick`.
    function _bindAndInit(
        ExampleV4Hook hook,
        PoolKey memory key,
        int24 launchTick
    )
        internal
        returns (uint160 sqrtPriceX96)
    {
        sqrtPriceX96 = TickMath.getSqrtPriceAtTick(launchTick);
        bytes32 poolId = PoolId.unwrap(key.toId());
        hook.bindCanonicalPool(
            poolId,
            Currency.unwrap(key.currency0),
            Currency.unwrap(key.currency1),
            key.fee,
            key.tickSpacing,
            sqrtPriceX96,
            launchTick
        );
        manager.initialize(key, sqrtPriceX96);
    }

    /// @dev Fund + approve the routers and add a two-sided liquidity range.
    function _addLiquidity(
        PoolKey memory key,
        int24 lower,
        int24 upper,
        int256 liquidityDelta
    )
        internal
    {
        _fundAndApprove(Currency.unwrap(key.currency0), address(modifyRouter));
        _fundAndApprove(Currency.unwrap(key.currency1), address(modifyRouter));
        modifyRouter.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: lower, tickUpper: upper, liquidityDelta: liquidityDelta, salt: bytes32(0)
            }),
            ""
        );
    }

    /// @dev Perform an exact-input swap on the pool.
    function _swap(PoolKey memory key, bool zeroForOne, int256 amountSpecified) internal {
        _fundAndApprove(Currency.unwrap(key.currency0), address(swapRouter));
        _fundAndApprove(Currency.unwrap(key.currency1), address(swapRouter));
        uint160 limit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne, amountSpecified: amountSpecified, sqrtPriceLimitX96: limit
            }),
            PoolSwapTest.TestSettings({ takeClaims: false, settleUsingBurn: false }),
            ""
        );
    }

    function _fundAndApprove(address currency, address spender) private {
        MintableERC20(currency).mint(address(this), 1_000_000 ether);
        MintableERC20(currency).approve(spender, type(uint256).max);
    }
}
