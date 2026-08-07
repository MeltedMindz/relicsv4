// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { DNA } from "./DNA.sol";
import { IRelicsHook } from "../interfaces/IRelicsHook.sol";

library EvolutionMath {
    uint256 internal constant MAX_INTENSITY = 255;

    function epochFromCounts(
        uint64 swapCount,
        uint64 liquidityEventCount
    )
        internal
        pure
        returns (uint64)
    {
        return uint64((uint256(swapCount) + uint256(liquidityEventCount) * 2) / 16);
    }

    function drawdownBand(int24 lastTick, int24 athTick) internal pure returns (uint32) {
        if (lastTick >= athTick) return 0;
        uint256 distance = uint256(int256(athTick) - int256(lastTick));
        if (distance < 50) return 0;
        if (distance < 250) return 1;
        if (distance < 1000) return 2;
        if (distance < 2500) return 3;
        return 4;
    }

    function stress(
        uint32 drawdown,
        uint32 volatility,
        uint64 swapCount,
        uint64 liquidityEvents
    )
        internal
        pure
        returns (uint32)
    {
        uint256 eventPressure = (uint256(swapCount % 32) + uint256(liquidityEvents % 16) * 2);
        uint256 raw = uint256(drawdown) * 18 + uint256(volatility) / 20 + eventPressure;
        return uint32(raw > 100 ? 100 : raw);
    }

    function holderTier(uint256 activeHolders) internal pure returns (uint8) {
        if (activeHolders < 10) return 0;
        if (activeHolders < 50) return 1;
        if (activeHolders < 100) return 2;
        if (activeHolders < 500) return 3;
        if (activeHolders < 1000) return 4;
        return 5;
    }

    function liquidityTier(uint128 liquidityMagnitude) internal pure returns (uint8) {
        if (liquidityMagnitude < 100 ether) return 0;
        if (liquidityMagnitude < 1000 ether) return 1;
        if (liquidityMagnitude < 10_000 ether) return 2;
        if (liquidityMagnitude < 100_000 ether) return 3;
        if (liquidityMagnitude < 1_000_000 ether) return 4;
        return 5;
    }

    function volumeTier(uint128 buyVolume, uint128 sellVolume) internal pure returns (uint8) {
        uint256 volume = uint256(buyVolume) + uint256(sellVolume);
        if (volume < 100 ether) return 0;
        if (volume < 1000 ether) return 1;
        if (volume < 10_000 ether) return 2;
        if (volume < 100_000 ether) return 3;
        if (volume < 1_000_000 ether) return 4;
        return 5;
    }

    function mutationIntensity(
        uint256 dna,
        uint256 state,
        IRelicsHook.GlobalMarketState memory market,
        uint256 activeHolders
    )
        internal
        pure
        returns (uint256)
    {
        uint8 relicSpecies = DNA.species(dna);
        uint8 hTier = holderTier(activeHolders);
        uint8 lTier = liquidityTier(market.cumulativeLiquidityMagnitude);
        uint8 vTier = volumeTier(market.cumulativeBuyVolume, market.cumulativeSellVolume);
        uint256 bias = uint256(uint16(DNA.entropy(dna))) % 29;
        uint256 base = uint256(market.stress) + uint256(DNA.mutationPotential(dna)) / 3 + bias
            + evolveCount(state);

        if (relicSpecies == 0) return cap(base + uint256(market.drawdownBand) * 22);
        if (relicSpecies == 1) {
            return cap(base + uint256(market.drawdownBand) * 13 + uint256(market.stress) / 4);
        }
        if (relicSpecies == 2) return cap(base + uint256(vTier) * 20);
        if (relicSpecies == 3) return cap(base + uint256(lTier) * 22);
        if (relicSpecies == 4) return cap(base + uint256(hTier) * 21);
        if (relicSpecies == 5) {
            return cap(base / 2 + ageEpochs(dna, market) * 8 + uint256(market.drawdownBand) * 9);
        }
        return cap(base + uint256((relicSpecies + hTier + vTier + lTier) % 7) * 12);
    }

    function scarIntensity(
        uint256 dna,
        uint256 state,
        IRelicsHook.GlobalMarketState memory market
    )
        internal
        pure
        returns (uint256)
    {
        uint256 speciesFactor = DNA.species(dna) == 1 ? 18 : DNA.species(dna) == 0 ? 7 : 11;
        return cap(
            scars(state) + uint256(market.drawdownBand) * speciesFactor + uint256(market.volatility)
                / 25
        );
    }

    function rarityClass(uint256 dna) internal pure returns (uint8) {
        uint16 seed = DNA.raritySeed(dna);
        if (seed > 65_000) return 5;
        if (seed > 62_000) return 4;
        if (seed > 54_000) return 3;
        if (seed > 38_000) return 2;
        if (seed > 18_000) return 1;
        return 0;
    }

    function lineage(
        uint256 dna,
        uint256 state,
        IRelicsHook.GlobalMarketState memory market,
        uint256 activeHolders
    )
        internal
        pure
        returns (uint32)
    {
        return uint32(
            uint256(
                keccak256(abi.encode(dna, state, market.marketSeed, activeHolders, market.epoch))
            )
        );
    }

    function recoveryIntensity(
        uint256 state,
        IRelicsHook.GlobalMarketState memory market
    )
        internal
        pure
        returns (uint256)
    {
        if (market.drawdownBand > 1) return 0;
        return cap(
            resonance(state) / 3
                + (market.cumulativeBuyVolume > market.cumulativeSellVolume ? 24 : 0)
        );
    }

    function historicalRarity(
        uint256 dna,
        uint256 state,
        IRelicsHook.GlobalMarketState memory market,
        uint256 activeHolders
    )
        internal
        pure
        returns (uint8)
    {
        uint256 score = uint256(rarityClass(dna)) * 20 + ageEpochs(dna, market) * 3 + scars(state)
            / 12 + resonance(state) / 16 + transferCount(state) / 4 + holderTier(activeHolders) * 7;
        if (market.drawdownBand >= 3 && DNA.birthEpoch(dna) < market.epoch) score += 20;
        if (score > 100) return 5;
        if (score > 76) return 4;
        if (score > 54) return 3;
        if (score > 32) return 2;
        if (score > 14) return 1;
        return 0;
    }

    function cap(uint256 value) internal pure returns (uint256) {
        return value > MAX_INTENSITY ? MAX_INTENSITY : value;
    }

    function ageEpochs(
        uint256 dna,
        IRelicsHook.GlobalMarketState memory market
    )
        internal
        pure
        returns (uint256)
    {
        uint16 birth = DNA.birthEpoch(dna);
        return market.epoch > birth ? market.epoch - birth : 0;
    }

    function absInt256(int256 value) internal pure returns (uint256) {
        return value < 0 ? uint256(-value) : uint256(value);
    }

    function absInt24(int24 value) internal pure returns (uint32) {
        return value < 0 ? uint32(uint24(-value)) : uint32(uint24(value));
    }

    function mintBlock(uint256 state) internal pure returns (uint64) {
        return uint64(state);
    }

    function transferCount(uint256 state) internal pure returns (uint32) {
        return uint32(state >> 64);
    }

    function evolveCount(uint256 state) internal pure returns (uint16) {
        return uint16(state >> 96);
    }

    function scars(uint256 state) internal pure returns (uint32) {
        return uint32(state >> 112);
    }

    function resonance(uint256 state) internal pure returns (uint32) {
        return uint32(state >> 144);
    }

    function storedLineage(uint256 state) internal pure returns (uint32) {
        return uint32(state >> 176);
    }

    function birthEpochFromState(uint256 state) internal pure returns (uint16) {
        return uint16(state >> 208);
    }

    function lastEvolveBlock(uint256 state) internal pure returns (uint32) {
        return uint32(state >> 224);
    }
}
