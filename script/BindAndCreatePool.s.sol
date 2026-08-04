// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ChainConfig } from "./ChainConfig.s.sol";
import { console2 } from "forge-std/Script.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { ExampleV4Hook } from "../src/ExampleV4Hook.sol";

/// @notice Bind the canonical PoolKey to the hook (one-shot), THEN initialize the pool. Order
/// matters: binding first is what lets `_afterInitialize` reject any unexpected opening price.
///
///   POOL_MANAGER=0x... HOOK=0x... ART_TOKEN=0x... WETH=0x... LAUNCH_TICK=-23040 \
///     forge script script/BindAndCreatePool.s.sol --tc BindAndCreatePool \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $HOOK_OWNER_PRIVATE_KEY
contract BindAndCreatePool is ChainConfig {
    function run() external {
        IPoolManager poolManager = IPoolManager(_poolManager());
        ExampleV4Hook hook = ExampleV4Hook(vm.envAddress("HOOK"));
        address artToken = vm.envAddress("ART_TOKEN");
        address weth = _weth();
        int24 launchTick = int24(vm.envInt("LAUNCH_TICK"));
        require(launchTick % TICK_SPACING == 0, "LAUNCH_TICK must be a multiple of tickSpacing");

        (Currency c0, Currency c1) = artToken < weth
            ? (Currency.wrap(artToken), Currency.wrap(weth))
            : (Currency.wrap(weth), Currency.wrap(artToken));

        PoolKey memory key = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(launchTick);
        bytes32 poolId = PoolId.unwrap(key.toId());

        vm.startBroadcast();
        hook.bindCanonicalPool(
            poolId,
            Currency.unwrap(c0),
            Currency.unwrap(c1),
            POOL_FEE,
            TICK_SPACING,
            sqrtPriceX96,
            launchTick
        );
        int24 initTick = poolManager.initialize(key, sqrtPriceX96);
        vm.stopBroadcast();

        _logHeader("Canonical pool bound + initialized");
        console2.logBytes32(poolId);
        console2.log("currency0:", Currency.unwrap(c0));
        console2.log("currency1:", Currency.unwrap(c1));
        console2.log("launch tick:", int256(launchTick));
        console2.log("init tick:  ", int256(initTick));
    }
}
