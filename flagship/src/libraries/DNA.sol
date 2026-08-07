// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library DNA {
    uint256 private constant SPECIES_SHIFT = 0;
    uint256 private constant BIOME_SHIFT = 4;
    uint256 private constant PALETTE_SHIFT = 8;
    uint256 private constant GEOMETRY_SHIFT = 12;
    uint256 private constant ENERGY_SHIFT = 16;
    uint256 private constant TEMPERAMENT_SHIFT = 20;
    uint256 private constant MUTATION_SHIFT = 24;
    uint256 private constant RARITY_SHIFT = 32;
    uint256 private constant BIRTH_EPOCH_SHIFT = 48;
    uint256 private constant ENTROPY_SHIFT = 64;

    uint256 private constant FOUR_BITS = 0xF;
    uint256 private constant EIGHT_BITS = 0xFF;
    uint256 private constant SIXTEEN_BITS = 0xFFFF;

    function generate(
        uint256 tokenId,
        address minter,
        bytes32 marketSeed,
        uint64 birthEpoch_,
        bytes32 blockEntropy
    )
        internal
        pure
        returns (uint256 dna)
    {
        uint256 entropySeed =
            uint256(keccak256(abi.encode(tokenId, minter, marketSeed, birthEpoch_, blockEntropy)));

        dna = (entropySeed & FOUR_BITS) << SPECIES_SHIFT;
        dna |= ((entropySeed >> 8) & FOUR_BITS) << BIOME_SHIFT;
        dna |= ((entropySeed >> 16) & FOUR_BITS) << PALETTE_SHIFT;
        dna |= ((entropySeed >> 24) & FOUR_BITS) << GEOMETRY_SHIFT;
        dna |= ((entropySeed >> 32) & FOUR_BITS) << ENERGY_SHIFT;
        dna |= ((entropySeed >> 40) & FOUR_BITS) << TEMPERAMENT_SHIFT;
        dna |= ((entropySeed >> 48) & EIGHT_BITS) << MUTATION_SHIFT;
        dna |= ((entropySeed >> 64) & SIXTEEN_BITS) << RARITY_SHIFT;
        dna |= (uint256(uint16(birthEpoch_)) & SIXTEEN_BITS) << BIRTH_EPOCH_SHIFT;
        dna |= (entropySeed >> ENTROPY_SHIFT) << ENTROPY_SHIFT;
    }

    function species(uint256 dna) internal pure returns (uint8) {
        return uint8((dna >> SPECIES_SHIFT) & FOUR_BITS);
    }

    function biome(uint256 dna) internal pure returns (uint8) {
        return uint8((dna >> BIOME_SHIFT) & FOUR_BITS);
    }

    function palette(uint256 dna) internal pure returns (uint8) {
        return uint8((dna >> PALETTE_SHIFT) & FOUR_BITS);
    }

    function geometry(uint256 dna) internal pure returns (uint8) {
        return uint8((dna >> GEOMETRY_SHIFT) & FOUR_BITS);
    }

    function energy(uint256 dna) internal pure returns (uint8) {
        return uint8((dna >> ENERGY_SHIFT) & FOUR_BITS);
    }

    function temperament(uint256 dna) internal pure returns (uint8) {
        return uint8((dna >> TEMPERAMENT_SHIFT) & FOUR_BITS);
    }

    function mutationPotential(uint256 dna) internal pure returns (uint8) {
        return uint8((dna >> MUTATION_SHIFT) & EIGHT_BITS);
    }

    function raritySeed(uint256 dna) internal pure returns (uint16) {
        return uint16((dna >> RARITY_SHIFT) & SIXTEEN_BITS);
    }

    function birthEpoch(uint256 dna) internal pure returns (uint16) {
        return uint16((dna >> BIRTH_EPOCH_SHIFT) & SIXTEEN_BITS);
    }

    function entropy(uint256 dna) internal pure returns (uint192) {
        return uint192(dna >> ENTROPY_SHIFT);
    }
}
