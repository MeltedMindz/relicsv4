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

/// @title ExampleV4Hook
/// @notice A Uniswap v4 hook that OBSERVES one canonical pool and maintains compact global
/// "market state" used purely as ARTISTIC ENTROPY. It never returns a delta, never touches
/// NFTs, never renders, and never loops over user-controlled input.
///
/// KEY LESSONS THIS HOOK TEACHES (see docs/03-uniswap-v4-hooks.md and docs/04-the-hook.md):
///   1. A hook's ADDRESS encodes its permission flags. The low 14 bits of this contract's
///      deployed address MUST equal 0x1440 = AFTER_INITIALIZE (1<<12) | AFTER_ADD_LIQUIDITY
///      (1<<10) | AFTER_SWAP (1<<6). You mine a CREATE2 salt to find such an address; see
///      script/MineHookAddress.s.sol. BaseHook's constructor validates this and reverts
///      otherwise.
///   2. Bind the canonical PoolKey (one-shot) BEFORE the pool is initialized, and reject any
///      unexpected initial price in `_afterInitialize`.
///   3. Validate the FULL PoolKey — including `hooks == address(this)` — in every callback,
///      so no spoofed pool can drive the art state.
///   4. Keep callbacks BOUNDED: fixed-size struct writes only. No arrays, no external calls
///      into untrusted code, no NFT work, no rendering.
///
/// EDUCATIONAL — NOT AUDITED. See SECURITY.md.
contract ExampleV4Hook is BaseHook, Ownable, IExampleHook {
    using BalanceDeltaLibrary for BalanceDelta;
    using StateLibrary for IPoolManager;

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

    GlobalMarketState private _state;

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
    /// initialized. Records the exact PoolKey fields and the exact expected opening price, so
    /// initialization at any other price reverts.
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

    function getGlobalState() external view returns (GlobalMarketState memory) {
        return _state;
    }

    // ------------------------------------------------------------------
    // hook callbacks (bounded, observation only)
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
        _state.lastActivityBlock = uint64(block.number);
        _state.entropy = keccak256(abi.encode(_state.entropy, tick, block.number));
        return BaseHook.afterInitialize.selector;
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
        _recordLiquidity(_toInt128(params.liquidityDelta), tick);
        return (BaseHook.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
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
        _recordSwap(delta.amount0(), delta.amount1(), tick);
        return (BaseHook.afterSwap.selector, 0);
    }

    // ------------------------------------------------------------------
    // state math (private, bounded, no external calls)
    // ------------------------------------------------------------------

    function _recordSwap(int256 amount0, int256 amount1, int24 tick) private {
        GlobalMarketState memory s = _state;

        // v4 deltas are from the swapper's perspective. A positive art-token amount means the
        // swapper received the art token: treat that as a BUY.
        int256 artAmount = artTokenIsCurrency0 ? amount0 : amount1;
        uint256 volume = _abs(artAmount);
        if (artAmount >= 0) {
            s.cumulativeBuyVolume = _addU128(s.cumulativeBuyVolume, volume);
        } else {
            s.cumulativeSellVolume = _addU128(s.cumulativeSellVolume, volume);
        }

        uint32 move = s.swapCount == 0 ? 0 : _tickDistance(s.lastTick, tick);
        if (tick > s.highTick) s.highTick = tick;

        unchecked {
            ++s.swapCount;
        }
        s.lastTick = tick;
        s.lastActivityBlock = uint64(block.number);
        s.volatility = uint32((uint256(s.volatility) * 7 + move) / 8);
        s.drawdownBand = _drawdown(tick, s.highTick);
        s.epoch = _epoch(s.swapCount, s.liquidityEventCount);
        s.entropy = keccak256(
            abi.encode(s.entropy, amount0, amount1, tick, block.number, block.prevrandao)
        );

        _state = s;
        emit SwapObserved(canonicalPoolId, amount0, amount1, tick, s.swapCount);
        emit MarketStateUpdated(s.epoch, s.drawdownBand, s.volatility, s.entropy);
    }

    function _recordLiquidity(int128 liquidityDelta, int24 tick) private {
        GlobalMarketState memory s = _state;
        if (tick > s.highTick) s.highTick = tick;

        unchecked {
            ++s.liquidityEventCount;
        }
        s.lastTick = tick;
        s.lastActivityBlock = uint64(block.number);
        s.drawdownBand = _drawdown(tick, s.highTick);
        s.epoch = _epoch(s.swapCount, s.liquidityEventCount);
        s.entropy =
            keccak256(abi.encode(s.entropy, liquidityDelta, tick, block.number, block.prevrandao));

        _state = s;
        emit LiquidityObserved(canonicalPoolId, liquidityDelta, tick, s.liquidityEventCount);
        emit MarketStateUpdated(s.epoch, s.drawdownBand, s.volatility, s.entropy);
    }

    // ------------------------------------------------------------------
    // validation
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

    // ------------------------------------------------------------------
    // pure helpers
    // ------------------------------------------------------------------

    /// @dev Drawdown band in [0, 10000]: 1 tick below the high == 1 unit, capped at 10000.
    function _drawdown(int24 tick, int24 highTick) private pure returns (uint32) {
        if (tick >= highTick) return 0;
        uint256 distance = uint256(int256(highTick) - int256(tick));
        return distance > 10_000 ? 10_000 : uint32(distance);
    }

    /// @dev Coarse "age" bucket. Monotonic, bounded, cheap.
    function _epoch(uint64 swaps, uint64 liq) private pure returns (uint64) {
        return (swaps + liq * 2) / 20;
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
