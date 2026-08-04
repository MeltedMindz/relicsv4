// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IExampleHook
/// @notice Read surface + events for the Uniswap v4 hook that maintains compact global
/// "market state" used purely as ARTISTIC ENTROPY by the renderer.
///
/// @dev This is deliberately NOT a price oracle. Every field here is a coarse, cumulative
/// or bounded signal. None of it must ever gate a financial outcome (payout, mint access,
/// lottery, reward). See docs/07-market-state-as-art.md.
interface IExampleHook {
    /// @notice Compact, single-slot-friendly snapshot of observed pool activity.
    /// Packed to keep hook callbacks cheap and bounded — no arrays, no per-token work.
    struct GlobalMarketState {
        uint64 swapCount; // number of observed swaps on the canonical pool
        uint64 liquidityEventCount; // number of observed add-liquidity events
        uint64 lastActivityBlock; // block.number of the most recent observation
        uint64 epoch; // coarse "age" bucket derived from activity counts
        uint128 cumulativeBuyVolume; // cumulative token-in flow (bounded add)
        uint128 cumulativeSellVolume; // cumulative token-out flow (bounded add)
        int24 lastTick; // most recently observed pool tick
        int24 highTick; // highest tick ever observed (all-time-high proxy)
        uint32 drawdownBand; // 0..10000 how far below highTick we currently sit
        uint32 volatility; // EMA of tick movement magnitude
        bytes32 entropy; // rolling hash mixed on every observation
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
        bytes32 indexed poolId, int256 amount0, int256 amount1, int24 tick, uint64 swapCount
    );
    event LiquidityObserved(
        bytes32 indexed poolId, int256 liquidityDelta, int24 tick, uint64 liquidityEventCount
    );
    event MarketStateUpdated(
        uint64 indexed epoch, uint32 drawdownBand, uint32 volatility, bytes32 entropy
    );

    function getGlobalState() external view returns (GlobalMarketState memory);
    function canonicalPoolId() external view returns (bytes32);
    function isPoolBound() external view returns (bool);
    function expectedSqrtPriceX96() external view returns (uint160);
    function expectedInitialTick() external view returns (int24);
}
