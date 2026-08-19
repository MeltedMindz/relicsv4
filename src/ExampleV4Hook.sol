// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BaseHook } from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta, BalanceDeltaLibrary } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams, ModifyLiquidityParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { IExampleHook } from "./interfaces/IExampleHook.sol";

/// @title ExampleV4Hook — the market becomes the art
/// @notice A Uniswap v4 hook that OBSERVES one canonical pool and distills its activity into a
/// `MarketState` used purely as ARTISTIC ENTROPY. It never returns a delta, never touches NFTs,
/// never renders, and never loops over user-controlled input.
///
/// ┌──────────────────────────────────────────────────────────────────────────────────────┐
/// │ HOW TO CUSTOMIZE (see docs/00-make-it-your-own.md)                                      │
/// │                                                                                        │
/// │ You almost never touch the v4 "plumbing" (the callbacks + PoolKey validation). To      │
/// │ change how the MARKET drives the ART, edit exactly TWO things, both marked `CUSTOMIZE`: │
/// │   1. the signal WEIGHTS / scales (the constants block below), and                      │
/// │   2. `_evolveState(...)` — the single pure function that maps each market EVENT         │
/// │      (a swap or a liquidity add) into the next `MarketState`.                           │
/// │                                                                                        │
/// │ Signals captured today: swap count, buy vs sell volume, volatility, all-time-high tick,│
/// │ drawdown, recovery, and liquidity events. (Holder growth is a TOKEN signal, injected    │
/// │ into `MarketState.holderCount` by the NFT at render time.) To add a signal, add a field │
/// │ to `IExampleHook.MarketState`, populate it in `_evolveState`, and read it in your        │
/// │ renderer. To remove one, stop reading it.                                               │
/// └──────────────────────────────────────────────────────────────────────────────────────┘
///
/// EDUCATIONAL REFERENCE — NOT PRODUCTION SOFTWARE. See SECURITY.md.
contract ExampleV4Hook is BaseHook, Ownable, IExampleHook {
    using BalanceDeltaLibrary for BalanceDelta;
    using StateLibrary for IPoolManager;

    // =====================================================================================
    // CUSTOMIZE ── market → art signal weights & scales
    // These are the "how strongly does each signal drive the art" knobs. Change them freely.
    // =====================================================================================

    /// @notice Volatility is an EMA of tick movement: `v = (v*NUM + move) / DEN`. Higher NUM/DEN
    /// ratio == smoother, slower-reacting volatility. (7/8 ≈ react over ~8 events.)
    uint256 internal constant VOLATILITY_SMOOTHING_NUM = 7;
    uint256 internal constant VOLATILITY_SMOOTHING_DEN = 8;

    /// @notice Ticks below the all-time-high that read as "maximum drawdown" (band == 10000).
    /// Smaller == the art reacts to shallower dips.
    int256 internal constant DRAWDOWN_FULL_SCALE_TICKS = 10_000;

    /// @notice How much each event type ages the collection, and how many weighted events make
    /// one epoch. Larger EVENTS_PER_EPOCH == the collection ages more slowly.
    uint64 internal constant EPOCH_SWAP_WEIGHT = 1;
    uint64 internal constant EPOCH_LIQUIDITY_WEIGHT = 2;
    uint64 internal constant EVENTS_PER_EPOCH = 20;

    // =====================================================================================
    // v4 plumbing (you rarely need to touch anything below this line)
    // =====================================================================================

    error ZeroAddress();
    error InvalidPool();
    error InvalidInitialPrice();
    error CanonicalPoolAlreadyBound();
    error ArtTokenNotInPool();
    error HookAddressMismatch();
    error UnauthorizedPool(bytes32 poolId);
    error UnexpectedInitialPrice(
        uint160 expectedSqrtPriceX96,
        uint160 actualSqrtPriceX96,
        int24 expectedTick,
        int24 actualTick
    );
    error Int128Overflow();

    /// @notice A normalized market event handed to `_evolveState`. Building this from the raw v4
    /// callback data is "plumbing"; interpreting it is "art".
    struct MarketEvent {
        bool isSwap; // true for a swap, false for a liquidity add
        bool isBuy; // (swaps) did the swapper receive the art token?
        uint256 volume; // (swaps) magnitude of the art-token flow
        int128 liquidityDelta; // (liquidity) signed liquidity change
        int24 tick; // pool tick after the event
    }

    /// @notice The art ERC-20 that must be one of the pool currencies.
    address public immutable artToken;

    // --- canonical pool binding (written once by {bindCanonicalPool}) ---
    bytes32 public canonicalPoolId;
    address public currency0;
    address public currency1;
    uint24 public poolFee;
    int24 public poolTickSpacing;
    uint160 public expectedSqrtPriceX96;
    int24 public expectedInitialTick;
    bool public artTokenIsCurrency0;
    bool public isPoolBound;

    MarketState private _state;

    constructor(
        IPoolManager poolManager_,
        address artToken_,
        address initialOwner
    )
        BaseHook(poolManager_)
        Ownable(initialOwner)
    {
        if (address(poolManager_) == address(0) || artToken_ == address(0)) revert ZeroAddress();
        artToken = artToken_;
        _state.entropy = keccak256(abi.encode(block.chainid, address(this), block.number));
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice One-shot binding of the canonical pool. MUST be called before the pool is
    /// initialized. Records the exact PoolKey fields and the exact expected opening price.
    function bindCanonicalPool(
        bytes32 poolId,
        address currency0_,
        address currency1_,
        uint24 fee,
        int24 tickSpacing,
        uint160 expectedSqrtPriceX96_,
        int24 expectedInitialTick_
    )
        external
        onlyOwner
    {
        if (isPoolBound) revert CanonicalPoolAlreadyBound();
        if (poolId == bytes32(0) || currency0_ == currency1_) revert InvalidPool();
        if (expectedSqrtPriceX96_ == 0) revert InvalidInitialPrice();
        if (currency0_ != artToken && currency1_ != artToken) revert ArtTokenNotInPool();

        canonicalPoolId = poolId;
        currency0 = currency0_;
        currency1 = currency1_;
        poolFee = fee;
        poolTickSpacing = tickSpacing;
        expectedSqrtPriceX96 = expectedSqrtPriceX96_;
        expectedInitialTick = expectedInitialTick_;
        artTokenIsCurrency0 = currency0_ == artToken;
        isPoolBound = true;

        emit CanonicalPoolBound(
            poolId,
            currency0_,
            currency1_,
            fee,
            tickSpacing,
            expectedSqrtPriceX96_,
            expectedInitialTick_
        );
    }

    function getMarketState() external view returns (MarketState memory) {
        return _state;
    }

    // ------------------------------------------------------------------
    // hook callbacks (bounded, observation only) — build a MarketEvent, then evolve state
    // ------------------------------------------------------------------

    function _afterInitialize(
        address,
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        int24 tick
    )
        internal
        override
        returns (bytes4)
    {
        _validatePoolKey(key);
        if (sqrtPriceX96 != expectedSqrtPriceX96 || tick != expectedInitialTick) {
            revert UnexpectedInitialPrice(
                expectedSqrtPriceX96, sqrtPriceX96, expectedInitialTick, tick
            );
        }
        _state.lastTick = tick;
        _state.highTick = tick;
        _state.lowTick = tick;
        _state.lastActivityBlock = uint64(block.number);
        _state.entropy = keccak256(abi.encode(_state.entropy, tick, block.number));
        return BaseHook.afterInitialize.selector;
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        BalanceDelta delta,
        bytes calldata
    )
        internal
        override
        returns (bytes4, int128)
    {
        _validatePoolKey(key);
        (, int24 tick,,) = poolManager.getSlot0(key.toId());

        // v4 deltas are from the swapper's perspective. A positive art-token amount means the
        // swapper RECEIVED the art token: a BUY.
        int256 amount0 = delta.amount0();
        int256 amount1 = delta.amount1();
        int256 artAmount = artTokenIsCurrency0 ? amount0 : amount1;

        MarketEvent memory e = MarketEvent({
            isSwap: true,
            isBuy: artAmount >= 0,
            volume: _abs(artAmount),
            liquidityDelta: 0,
            tick: tick
        });
        _state = _evolveState(_state, e);
        emit SwapObserved(canonicalPoolId, amount0, amount1, tick, _state.swapCount);
        _emitStateUpdated();
        return (BaseHook.afterSwap.selector, 0);
    }

    function _afterAddLiquidity(
        address,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    )
        internal
        override
        returns (bytes4, BalanceDelta)
    {
        _validatePoolKey(key);
        (, int24 tick,,) = poolManager.getSlot0(key.toId());
        MarketEvent memory e = MarketEvent({
            isSwap: false,
            isBuy: false,
            volume: 0,
            liquidityDelta: _toInt128(params.liquidityDelta),
            tick: tick
        });
        _state = _evolveState(_state, e);
        emit LiquidityObserved(canonicalPoolId, e.liquidityDelta, tick, _state.liquidityEventCount);
        _emitStateUpdated();
        return (BaseHook.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    // =====================================================================================
    // CUSTOMIZE ── THE MARKET → ART MAPPING
    //
    // This is the heart of the collection. Given the current `MarketState` and one `MarketEvent`,
    // return the next `MarketState`. It is `view` (reads block data) and does NOTHING external —
    // keep it that way so it can never affect swaps. No loops, no external calls, no NFT work.
    //
    // Ideas: make buys warm the palette (via drawdown/recovery), make volatility fracture the
    // geometry, make sell pressure darken it, make liquidity events add structure. See the
    // "recipes" in docs/00-make-it-your-own.md.
    // =====================================================================================
    function _evolveState(
        MarketState memory s,
        MarketEvent memory e
    )
        internal
        view
        returns (MarketState memory)
    {
        // --- counts + volume ---
        if (e.isSwap) {
            uint32 move = s.swapCount == 0 ? 0 : _tickDistance(s.lastTick, e.tick);
            s.volatility = uint32(
                (uint256(s.volatility) * VOLATILITY_SMOOTHING_NUM + move) / VOLATILITY_SMOOTHING_DEN
            );
            if (e.isBuy) s.cumulativeBuyVolume = _addU128(s.cumulativeBuyVolume, e.volume);
            else s.cumulativeSellVolume = _addU128(s.cumulativeSellVolume, e.volume);
            unchecked {
                ++s.swapCount;
            }
        } else {
            unchecked {
                ++s.liquidityEventCount;
            }
        }

        // --- price extremes: high ratchets up (and resets the low), low ratchets down ---
        if (e.tick > s.highTick) {
            s.highTick = e.tick;
            s.lowTick = e.tick; // a fresh high resets the recovery window
        } else if (e.tick < s.lowTick) {
            s.lowTick = e.tick;
        }

        // --- drawdown: how far BELOW the all-time-high, scaled 0..10000 ---
        s.drawdownBand = _band(int256(s.highTick) - int256(e.tick), DRAWDOWN_FULL_SCALE_TICKS);

        // --- recovery: how far back UP from the low within the drawdown window, 0..10000 ---
        // After the extremes update above, lowTick <= tick <= highTick, so the ratio is a clean
        // non-negative value in [0, 10000] and the cast is safe.
        int256 window = int256(s.highTick) - int256(s.lowTick);
        if (window <= 0) {
            s.recoveryBand = 10_000;
        } else {
            uint256 climbed = uint256(int256(e.tick) - int256(s.lowTick));
            s.recoveryBand = uint32((climbed * 10_000) / uint256(window));
        }

        // --- coarse age + bookkeeping ---
        s.epoch = (s.swapCount * EPOCH_SWAP_WEIGHT + s.liquidityEventCount * EPOCH_LIQUIDITY_WEIGHT)
            / EVENTS_PER_EPOCH;
        s.lastTick = e.tick;
        s.lastActivityBlock = uint64(block.number);
        s.entropy = keccak256(
            abi.encode(
                s.entropy, e.isSwap, e.isBuy, e.volume, e.tick, block.number, block.prevrandao
            )
        );
        return s;
    }

    // ------------------------------------------------------------------
    // validation (do not weaken)
    // ------------------------------------------------------------------

    function _validatePoolKey(PoolKey calldata key) private view {
        if (address(key.hooks) != address(this)) revert HookAddressMismatch();
        bytes32 poolId = PoolId.unwrap(key.toId());
        if (
            !isPoolBound || poolId != canonicalPoolId || Currency.unwrap(key.currency0) != currency0
                || Currency.unwrap(key.currency1) != currency1 || key.fee != poolFee
                || key.tickSpacing != poolTickSpacing
        ) {
            revert UnauthorizedPool(poolId);
        }
    }

    function _emitStateUpdated() private {
        emit MarketStateUpdated(
            _state.epoch,
            _state.drawdownBand,
            _state.recoveryBand,
            _state.volatility,
            _state.entropy
        );
    }

    // ------------------------------------------------------------------
    // pure helpers
    // ------------------------------------------------------------------

    /// @dev Scale a non-negative tick distance into a 0..10000 band, capped.
    function _band(int256 distance, int256 fullScaleTicks) private pure returns (uint32) {
        if (distance <= 0) return 0;
        if (distance >= fullScaleTicks) return 10_000;
        return uint32(uint256((distance * 10_000) / fullScaleTicks));
    }

    function _tickDistance(int24 a, int24 b) private pure returns (uint32) {
        int256 d = int256(a) - int256(b);
        uint256 abs = d < 0 ? uint256(-d) : uint256(d);
        return abs > type(uint32).max ? type(uint32).max : uint32(abs);
    }

    function _abs(int256 v) private pure returns (uint256) {
        return v < 0 ? uint256(-v) : uint256(v);
    }

    function _addU128(uint128 current, uint256 value) private pure returns (uint128) {
        uint256 sum = uint256(current) + value;
        return sum > type(uint128).max ? type(uint128).max : uint128(sum);
    }

    function _toInt128(int256 v) private pure returns (int128) {
        if (v < type(int128).min || v > type(int128).max) revert Int128Overflow();
        return int128(v);
    }
}
