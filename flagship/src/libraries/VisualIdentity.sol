// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { DNA } from "./DNA.sol";
import { EvolutionMath } from "./EvolutionMath.sol";
import { IRelicsHook } from "../interfaces/IRelicsHook.sol";

library VisualIdentity {
    function compositionHash(
        uint256 dna,
        IRelicsHook.GlobalMarketState memory market
    )
        internal
        pure
        returns (bytes32)
    {
        uint256 entropy = uint256(DNA.entropy(dna));
        uint8 composition = uint8((DNA.geometry(dna) + DNA.temperament(dna) + (entropy & 7)) % 8);
        uint8 symmetry = uint8((DNA.temperament(dna) + ((entropy >> 9) & 7)) % 6);
        uint8 layoutBucket =
            uint8((DNA.biome(dna) + DNA.geometry(dna) + market.epoch + ((entropy >> 21) & 7)) % 8);
        return keccak256(abi.encode(DNA.species(dna) % 6, composition, symmetry, layoutBucket));
    }

    function silhouetteHash(
        uint256 dna,
        IRelicsHook.GlobalMarketState memory market
    )
        internal
        pure
        returns (bytes32)
    {
        uint256 entropy = uint256(DNA.entropy(dna));
        uint8 scaleBucket =
            uint8((uint256(DNA.energy(dna)) + (entropy & 15) + market.drawdownBand) % 16);
        uint8 asymmetryBucket = uint8((uint256(DNA.temperament(dna)) + ((entropy >> 32) & 15)) % 16);
        uint8 limbBucket = uint8((uint256(DNA.geometry(dna)) + ((entropy >> 64) & 15)) % 16);
        return keccak256(abi.encode(DNA.species(dna) % 6, scaleBucket, asymmetryBucket, limbBucket));
    }

    function densityHash(
        uint256 dna,
        IRelicsHook.GlobalMarketState memory market,
        uint256 activeHolders
    )
        internal
        pure
        returns (bytes32)
    {
        uint8 holderTier = EvolutionMath.holderTier(activeHolders);
        uint8 liquidityTier = EvolutionMath.liquidityTier(market.cumulativeLiquidityMagnitude);
        uint8 volumeTier =
            EvolutionMath.volumeTier(market.cumulativeBuyVolume, market.cumulativeSellVolume);
        uint8 densityBucket = uint8(
            (uint256(DNA.mutationPotential(dna))
                    / 32
                    + market.stress
                    / 20
                    + holderTier
                    + volumeTier) % 16
        );
        return keccak256(
            abi.encode(densityBucket, liquidityTier, volumeTier, DNA.raritySeed(dna) / 4096)
        );
    }

    function fingerprint(
        uint256 dna,
        IRelicsHook.GlobalMarketState memory market,
        uint256 activeHolders
    )
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                compositionHash(dna, market),
                silhouetteHash(dna, market),
                densityHash(dna, market, activeHolders)
            )
        );
    }
}
