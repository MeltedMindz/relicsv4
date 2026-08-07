// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BaseHook } from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta, BalanceDeltaLibrary } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { SwapParams, ModifyLiquidityParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { IRelicsHook } from "./interfaces/IRelicsHook.sol";
import { EvolutionMath } from "./libraries/EvolutionMath.sol";

contract RelicsV4Hook is BaseHook, Ownable, IRelicsHook {
    using BalanceDeltaLibrary for BalanceDelta;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    error ZeroAddress();
    error InvalidPool();
    error InvalidInitialPrice();
    error CanonicalPoolAlreadyBound();
    error RelicTokenNotInPool();
    error HookAddressMismatch();
    error UnauthorizedPool(bytes32 poolId);
    error UnexpectedInitialPrice(
        uint160 expectedSqrtPriceX96,
        uint160 actualSqrtPriceX96,
        int24 expectedTick,
        int24 actualTick
    );
    error Int256MinUnsupported();
    error Uint128Overflow();
    error Int128Overflow();

    address public immutable relicsToken;

    bytes32 public canonicalPoolId;
    address public currency0;
    address public currency1;
    uint24 public poolFee;
    int24 public poolTickSpacing;
    uint160 public expectedSqrtPriceX96;
    int24 public expectedInitialTick;
    bool public relicIsCurrency0;
    bool public isPoolBound;

    GlobalMarketState private _state;

    constructor(
        IPoolManager poolManager_,
        address relicsToken_,
        address initialOwner
    )
        BaseHook(poolManager_)
        Ownable(initialOwner)
    {
        if (address(poolManager_) == address(0) || relicsToken_ == address(0)) {
            revert ZeroAddress();
        }
        relicsToken = relicsToken_;
        _state.marketSeed = keccak256(abi.encode(block.chainid, address(this), block.number));
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
        _bindPool(
            poolId,
            currency0_,
            currency1_,
            fee,
            tickSpacing,
            expectedSqrtPriceX96_,
            expectedInitialTick_
        );
    }

    function observeSwap(bytes32, int256, int256, int24, bytes32) external pure {
        revert HookAddressMismatch();
    }

    function observeLiquidity(bytes32, int128, uint256, uint256, int24) external pure {
        revert HookAddressMismatch();
    }

    function getGlobalState() external view returns (GlobalMarketState memory) {
        return _state;
    }

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
        bytes32 poolId = PoolId.unwrap(key.toId());
        _validatePoolKey(key);
        if (sqrtPriceX96 != expectedSqrtPriceX96 || tick != expectedInitialTick) {
            revert UnexpectedInitialPrice(
                expectedSqrtPriceX96, sqrtPriceX96, expectedInitialTick, tick
            );
        }

        GlobalMarketState memory next = _state;
        if (next.swapCount == 0 && next.liquidityEventCount == 0) {
            next.lastTick = tick;
            next.athTick = tick;
            next.marketSeed = keccak256(abi.encode(next.marketSeed, poolId, tick, block.number));
            _state = next;
            emit MarketStateUpdated(
                next.epoch, next.stress, next.volatility, next.drawdownBand, next.marketSeed
            );
        }
        return BaseHook.afterInitialize.selector;
    }

    function _afterAddLiquidity(
        address,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata
    )
        internal
        override
        returns (bytes4, BalanceDelta)
    {
        _validatePoolKey(key);
        (, int24 tick,,) = poolManager.getSlot0(key.toId());
        int128 liquidityDelta = _toInt128(params.liquidityDelta);
        uint256 amount0 = _abs(delta.amount0());
        uint256 amount1 = _abs(delta.amount1());
        _recordLiquidity(PoolId.unwrap(key.toId()), liquidityDelta, amount0, amount1, tick);
        return (BaseHook.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    )
        internal
        override
        returns (bytes4, int128)
    {
        _validatePoolKey(key);
        (, int24 tick,,) = poolManager.getSlot0(key.toId());
        bytes32 salt = hookData.length >= 32
            ? abi.decode(hookData, (bytes32))
            : bytes32(uint256(params.sqrtPriceLimitX96));
        _recordSwap(PoolId.unwrap(key.toId()), delta.amount0(), delta.amount1(), tick, salt);
        return (BaseHook.afterSwap.selector, 0);
    }

    function _bindPool(
        bytes32 poolId,
        address currency0_,
        address currency1_,
        uint24 fee,
        int24 tickSpacing,
        uint160 expectedSqrtPriceX96_,
        int24 expectedInitialTick_
    )
        private
    {
        if (poolId == bytes32(0) || currency0_ == currency1_) revert InvalidPool();
        if (expectedSqrtPriceX96_ == 0) revert InvalidInitialPrice();
        if (currency0_ != relicsToken && currency1_ != relicsToken) revert RelicTokenNotInPool();

        canonicalPoolId = poolId;
        currency0 = currency0_;
        currency1 = currency1_;
        poolFee = fee;
        poolTickSpacing = tickSpacing;
        expectedSqrtPriceX96 = expectedSqrtPriceX96_;
        expectedInitialTick = expectedInitialTick_;
        relicIsCurrency0 = currency0_ == relicsToken;
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

    function _validatePoolKey(PoolKey calldata key) private view {
        _validateKeyHook(key);
        bytes32 poolId = PoolId.unwrap(key.toId());
        if (
            !isPoolBound || poolId != canonicalPoolId || Currency.unwrap(key.currency0) != currency0
                || Currency.unwrap(key.currency1) != currency1 || key.fee != poolFee
                || key.tickSpacing != poolTickSpacing
        ) {
            revert UnauthorizedPool(poolId);
        }
    }

    function _validateKeyHook(PoolKey calldata key) private view {
        if (address(key.hooks) != address(this)) revert HookAddressMismatch();
    }

    function _recordSwap(
        bytes32 poolId,
        int256 amount0,
        int256 amount1,
        int24 tick,
        bytes32 salt
    )
        private
    {
        GlobalMarketState memory next = _state;
        uint64 previousEpoch = next.epoch;
        uint32 tickMove = next.swapCount == 0 ? 0 : _tickDistance(next.lastTick, tick);

        int256 relicAmount = relicIsCurrency0 ? amount0 : amount1;
        uint256 volume = _abs(relicAmount);
        if (relicAmount >= 0) {
            next.cumulativeBuyVolume = _addUint128(next.cumulativeBuyVolume, volume);
        } else {
            next.cumulativeSellVolume = _addUint128(next.cumulativeSellVolume, volume);
        }
        next.netFlow = _addInt128(next.netFlow, relicAmount);

        if (next.swapCount == 0 && next.liquidityEventCount == 0) next.athTick = tick;
        else if (tick > next.athTick) next.athTick = tick;

        unchecked {
            ++next.swapCount;
        }
        next.lastSwapBlock = uint64(block.number);
        next.lastTick = tick;
        next.volatility = uint32((uint256(next.volatility) * 7 + tickMove) / 8);
        next.drawdownBand = EvolutionMath.drawdownBand(tick, next.athTick);
        next.stress = EvolutionMath.stress(
            next.drawdownBand, next.volatility, next.swapCount, next.liquidityEventCount
        );
        next.epoch = EvolutionMath.epochFromCounts(next.swapCount, next.liquidityEventCount);
        next.marketSeed = keccak256(
            abi.encode(
                next.marketSeed,
                poolId,
                amount0,
                amount1,
                tick,
                salt,
                block.number,
                block.prevrandao
            )
        );

        _state = next;
        if (next.epoch != previousEpoch) emit EpochAdvanced(previousEpoch, next.epoch);
        emit SwapObserved(poolId, amount0, amount1, tick, next.swapCount, next.marketSeed);
        emit MarketStateUpdated(
            next.epoch, next.stress, next.volatility, next.drawdownBand, next.marketSeed
        );
    }

    function _recordLiquidity(
        bytes32 poolId,
        int128 liquidityDelta,
        uint256 amount0,
        uint256 amount1,
        int24 tick
    )
        private
    {
        GlobalMarketState memory next = _state;
        uint64 previousEpoch = next.epoch;
        uint256 liquidityMagnitude = amount0 + amount1 + _abs(liquidityDelta);

        next.cumulativeLiquidityMagnitude =
            _addUint128(next.cumulativeLiquidityMagnitude, liquidityMagnitude);
        if (next.swapCount == 0 && next.liquidityEventCount == 0) {
            next.lastTick = tick;
            next.athTick = tick;
        } else if (tick > next.athTick) {
            next.athTick = tick;
        }

        unchecked {
            ++next.liquidityEventCount;
        }
        next.drawdownBand = EvolutionMath.drawdownBand(tick, next.athTick);
        next.stress = EvolutionMath.stress(
            next.drawdownBand, next.volatility, next.swapCount, next.liquidityEventCount
        );
        next.epoch = EvolutionMath.epochFromCounts(next.swapCount, next.liquidityEventCount);
        next.marketSeed = keccak256(
            abi.encode(
                next.marketSeed,
                poolId,
                liquidityDelta,
                amount0,
                amount1,
                tick,
                block.number,
                block.prevrandao
            )
        );

        _state = next;
        if (next.epoch != previousEpoch) emit EpochAdvanced(previousEpoch, next.epoch);
        emit LiquidityObserved(poolId, liquidityDelta, amount0, amount1, next.liquidityEventCount);
        emit MarketStateUpdated(
            next.epoch, next.stress, next.volatility, next.drawdownBand, next.marketSeed
        );
    }

    function _abs(int256 value) private pure returns (uint256) {
        if (value == type(int256).min) revert Int256MinUnsupported();
        return EvolutionMath.absInt256(value);
    }

    function _addUint128(uint128 current, uint256 value) private pure returns (uint128) {
        if (value > type(uint128).max || uint256(current) + value > type(uint128).max) {
            revert Uint128Overflow();
        }
        return uint128(uint256(current) + value);
    }

    function _addInt128(int128 current, int256 value) private pure returns (int128) {
        int256 next = int256(current) + value;
        if (next < type(int128).min || next > type(int128).max) revert Int128Overflow();
        return int128(next);
    }

    function _toInt128(int256 value) private pure returns (int128) {
        if (value < type(int128).min || value > type(int128).max) revert Int128Overflow();
        return int128(value);
    }

    function _tickDistance(int24 a, int24 b) private pure returns (uint32) {
        int256 diff = int256(a) - int256(b);
        return uint32(EvolutionMath.absInt256(diff));
    }
}
