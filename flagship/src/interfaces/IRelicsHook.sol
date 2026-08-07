// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IRelicsHook {
    struct GlobalMarketState {
        uint64 swapCount;
        uint64 liquidityEventCount;
        uint64 lastSwapBlock;
        uint64 epoch;
        uint128 cumulativeBuyVolume;
        uint128 cumulativeSellVolume;
        uint128 cumulativeLiquidityMagnitude;
        int128 netFlow;
        int24 lastTick;
        int24 athTick;
        uint32 drawdownBand;
        uint32 stress;
        uint32 volatility;
        bytes32 marketSeed;
    }

    event CanonicalPoolBound(
        bytes32 indexed poolId,
        address indexed currency0,
        address indexed currency1,
        uint24 fee,
        int24 tickSpacing,
        uint160 expectedSqrtPriceX96,
        int24 expectedInitialTick
    );
    event SwapObserved(
        bytes32 indexed poolId,
        int256 amount0,
        int256 amount1,
        int24 tick,
        uint64 swapCount,
        bytes32 marketSeed
    );
    event LiquidityObserved(
        bytes32 indexed poolId,
        int128 liquidityDelta,
        uint256 amount0,
        uint256 amount1,
        uint64 liquidityEventCount
    );
    event MarketStateUpdated(
        uint64 indexed epoch,
        uint32 stress,
        uint32 volatility,
        uint32 drawdownBand,
        bytes32 marketSeed
    );
    event EpochAdvanced(uint64 indexed previousEpoch, uint64 indexed newEpoch);

    function bindCanonicalPool(
        bytes32 poolId,
        address currency0,
        address currency1,
        uint24 fee,
        int24 tickSpacing,
        uint160 expectedSqrtPriceX96,
        int24 expectedInitialTick
    )
        external;

    function observeSwap(
        bytes32 poolId,
        int256 amount0,
        int256 amount1,
        int24 tick,
        bytes32 salt
    )
        external;

    function observeLiquidity(
        bytes32 poolId,
        int128 liquidityDelta,
        uint256 amount0,
        uint256 amount1,
        int24 tick
    )
        external;

    function getGlobalState() external view returns (GlobalMarketState memory);
    function canonicalPoolId() external view returns (bytes32);
    function expectedSqrtPriceX96() external view returns (uint160);
    function expectedInitialTick() external view returns (int24);
    function isPoolBound() external view returns (bool);
}
