// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IExampleHook
/// @notice Read surface + events for the Uniswap v4 hook that turns pool activity into the
/// `MarketState` used as ARTISTIC ENTROPY by the renderer.
///
/// @dev This is deliberately NOT a price oracle. Every field is a coarse, cumulative, or bounded
/// signal. None of it must ever gate a financial outcome (payout, mint access, lottery, reward).
/// See docs/07-market-state-as-art.md.
interface IExampleHook {
    /// @notice Compact snapshot of the market signals that drive the art.
    ///
    /// Each field is a "signal" a renderer can read. To ADD a signal, add a field here, populate
    /// it in the hook's `_evolveState`, and read it in your renderer. To REMOVE one, stop reading
    /// it (leaving a field unused is harmless). See docs/00-make-it-your-own.md.
    struct MarketState {
        uint64 swapCount; // how many swaps have been observed
        uint64 liquidityEventCount; // how many add-liquidity events have been observed
        uint64 epoch; // coarse "age" bucket derived from activity
        uint64 lastActivityBlock; // block.number of the most recent observation
        uint128 cumulativeBuyVolume; // cumulative art-token buy flow (saturating)
        uint128 cumulativeSellVolume; // cumulative art-token sell flow (saturating)
        int24 lastTick; // most recently observed pool tick
        int24 highTick; // highest tick ever observed (all-time-high proxy)
        int24 lowTick; // lowest tick since the last all-time-high (for recovery)
        uint32 drawdownBand; // 0..10000: how far BELOW highTick we currently sit
        uint32 recoveryBand; // 0..10000: how far we have climbed back from lowTick
        uint32 volatility; // EMA of tick-movement magnitude
        uint64 holderCount; // active token holders (injected by the NFT at render time)
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
        uint64 indexed epoch,
        uint32 drawdownBand,
        uint32 recoveryBand,
        uint32 volatility,
        bytes32 entropy
    );

    function getMarketState() external view returns (MarketState memory);
    function canonicalPoolId() external view returns (bytes32);
    function isPoolBound() external view returns (bool);
    function expectedSqrtPriceX96() external view returns (uint160);
    function expectedInitialTick() external view returns (int24);
}
