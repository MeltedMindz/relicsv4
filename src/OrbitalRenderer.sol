// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { RendererBase } from "./RendererBase.sol";
import { IExampleHook } from "./interfaces/IExampleHook.sol";
import { ArtDNA } from "./libraries/ArtDNA.sol";
import { Trig } from "./libraries/Trig.sol";

/// @title OrbitalRenderer — the "Orbital" art system (sample #3 of 3)
/// @notice A nucleus surrounded by orbiting bodies. Growth and turbulence are the story here. A
/// NEUTRAL sample identity — replace with your own art.
///
/// SIGNAL → ART MAPPING:
///   - holderCount → nucleus SIZE (a growing community grows the core)
///   - swapCount   → number of orbiting bodies (HARD-CAPPED)
///   - volatility  → how far the orbit is pushed out / spread (turbulence)
///   - recoveryBand→ brightens the accent
///   - drawdownBand→ fades the whole system (a drawn-down market goes quiet)
contract OrbitalRenderer is RendererBase {
    using ArtDNA for bytes32;

    uint256 private constant MAX_BODIES = 16; // bounded

    function _styleName() internal pure override returns (string memory) {
        return "Orbital";
    }

    function _renderArt(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.MarketState memory market
    )
        internal
        pure
        override
        returns (string memory)
    {
        ArtDNA.Traits memory t = dna.decode();
        (string memory bg, string memory ink, string memory accent) = _palette(t.palette);

        // Fade everything as the market draws down; brighten a touch as it recovers.
        uint256 systemOpacity = market.drawdownBand >= 9000 ? 25 : 100 - (market.drawdownBand / 120);
        uint256 nucleusR = 26 + (market.holderCount > 40 ? 40 : market.holderCount);

        return string.concat(
            '<rect width="500" height="500" fill="',
            bg,
            '"/>',
            _orbitRings(t, ink, systemOpacity),
            _nucleus(nucleusR, accent, market),
            _bodies(t, market, ink, accent, systemOpacity, nucleusR),
            _footer(tokenId, market, ink)
        );
    }

    function _orbitRings(
        ArtDNA.Traits memory t,
        string memory ink,
        uint256 op
    )
        private
        pure
        returns (string memory out)
    {
        for (uint256 i = 0; i < t.ringCount; ++i) {
            uint256 r = 70 + i * 45;
            out = string.concat(
                out,
                '<circle cx="250" cy="250" r="',
                _uint(r),
                '" fill="none" stroke="',
                ink,
                '" stroke-opacity="0.',
                _two(op / 5),
                '" stroke-width="1"/>'
            );
        }
    }

    function _nucleus(
        uint256 nucleusR,
        string memory accent,
        IExampleHook.MarketState memory market
    )
        private
        pure
        returns (string memory)
    {
        uint256 op = 60 + (market.recoveryBand / 300); // brighter as we recover
        return string.concat(
            '<circle cx="250" cy="250" r="',
            _uint(nucleusR),
            '" fill="',
            accent,
            '" fill-opacity="0.',
            _two(op),
            '"/>'
        );
    }

    function _bodies(
        ArtDNA.Traits memory t,
        IExampleHook.MarketState memory market,
        string memory ink,
        string memory accent,
        uint256 systemOpacity,
        uint256 nucleusR
    )
        private
        pure
        returns (string memory out)
    {
        uint256 count = market.swapCount > MAX_BODIES ? MAX_BODIES : market.swapCount;
        // Volatility pushes bodies further out and widens their spread.
        uint256 spread = 30 + (market.volatility % 90);
        for (uint256 i = 0; i < count; ++i) {
            uint256 dir = Trig.dirFromDegrees(t.rotation + i * (360 / MAX_BODIES));
            uint256 orbitR = nucleusR + spread + (i * 7) % 60;
            int256 x = int256(CENTER) + (int256(orbitR) * Trig.cosDir(dir)) / Trig.SCALE;
            int256 y = int256(CENTER) + (int256(orbitR) * Trig.sinDir(dir)) / Trig.SCALE;
            string memory fill = (i % 3 == 0) ? accent : ink;
            out = string.concat(
                out,
                '<circle cx="',
                _int(x),
                '" cy="',
                _int(y),
                '" r="5" fill="',
                fill,
                '" fill-opacity="0.',
                _two(systemOpacity),
                '"/>'
            );
        }
    }

    function _footer(
        uint256 tokenId,
        IExampleHook.MarketState memory market,
        string memory ink
    )
        private
        pure
        returns (string memory)
    {
        return string.concat(
            '<text x="24" y="476" font-family="monospace" font-size="14" fill="',
            ink,
            '" fill-opacity="0.6">#',
            _uint(tokenId),
            "  holders ",
            _uint(market.holderCount),
            "</text>"
        );
    }
}
