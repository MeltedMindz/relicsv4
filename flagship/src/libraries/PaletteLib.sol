// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { DNA } from "./DNA.sol";

library PaletteLib {
    struct Palette {
        string background;
        string primary;
        string secondary;
        string accent;
        string scar;
        string glow;
    }

    function palette(
        uint256 dna,
        uint64,
        uint32,
        uint32 drawdown,
        uint8,
        uint8
    )
        internal
        pure
        returns (Palette memory p)
    {
        uint256 family = DNA.palette(dna) % 6;
        if (family == 0) {
            p = Palette("#030005", "#5d1a68", "#a82238", "#ff5b20", "#551326", "#9b3bff");
        } else if (family == 1) {
            p = Palette("#070808", "#9a783f", "#5b6267", "#34b6c3", "#2d2118", "#d89d47");
        } else if (family == 2) {
            p = Palette("#060b10", "#dffbff", "#60d4e6", "#f0cf67", "#6b5c9f", "#ffffff");
        } else if (family == 3) {
            p = Palette("#07100a", "#4fc985", "#1f6762", "#e3d3a0", "#153141", "#87efd6");
        } else if (family == 4) {
            p = Palette("#0c0906", "#cdb68a", "#756852", "#2aa06f", "#4c2d1b", "#efd9b5");
        } else {
            p = Palette("#09050b", "#ff8720", "#1d72ef", "#fff0b6", "#a10d2f", "#ff3f70");
        }

        if (drawdown >= 3) {
            p.background = "#050507";
            p.scar = "#ff315a";
        }
    }

    function speciesName(uint8 species) internal pure returns (string memory) {
        if (species == 0) return "Void";
        if (species == 1) return "Organic";
        if (species == 2) return "Mechanical";
        if (species == 3) return "Crystal";
        if (species == 4) return "Neural";
        if (species == 5) return "Ancient";
        if (species == 6) return "Solar";
        if (species == 7) return "Gravitic";
        if (species == 8) return "Mythic Circuit";
        if (species == 9) return "Ashen";
        if (species == 10) return "Chronal";
        if (species == 11) return "Obsidian";
        if (species == 12) return "Lattice";
        if (species == 13) return "Harmonic";
        if (species == 14) return "Abyssal";
        return "Primeval";
    }

    function biomeName(uint8 biome) internal pure returns (string memory) {
        if (biome == 0) return "Ruin";
        if (biome == 1) return "Vault";
        if (biome == 2) return "Temple";
        if (biome == 3) return "Archive";
        if (biome == 4) return "Crater";
        if (biome == 5) return "Foundry";
        if (biome == 6) return "Sanctum";
        if (biome == 7) return "Market Scar";
        if (biome == 8) return "Black Circuit";
        if (biome == 9) return "Chronicle";
        if (biome == 10) return "Catacomb";
        if (biome == 11) return "Spire";
        if (biome == 12) return "Deep Well";
        if (biome == 13) return "Signal Field";
        if (biome == 14) return "Mirror Waste";
        return "Genesis Core";
    }
}
