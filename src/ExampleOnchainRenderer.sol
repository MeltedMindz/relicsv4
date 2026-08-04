// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { RendererBase } from "./RendererBase.sol";
import { IExampleHook } from "./interfaces/IExampleHook.sol";
import { ArtDNA } from "./libraries/ArtDNA.sol";
import { Trig } from "./libraries/Trig.sol";

/// @title ExampleOnchainRenderer — the "Sigil" art system (sample #1 of 3)
/// @notice Concentric rings around a rotating polygon core, tinted by market state. A NEUTRAL
/// placeholder identity — NOT the art of any production collection. This is one of three sample
/// systems (see also `StrataRenderer`, `OrbitalRenderer`) so the range is obvious.
///
/// SIGNAL → ART MAPPING (this is the "art" half of the seam; edit freely):
///   - volatility  → twists the core polygon
///   - drawdownBand→ fades the accent (a "wounded", drawn-down look)
///   - recoveryBand→ brightens the ring stroke (climbing back)
///   - swapCount   → number of orbiting marks (HARD-CAPPED, never unbounded)
///
/// To ship YOUR art, either edit `_renderArt` below or write a new RendererBase subclass and
/// point the NFT at it. See docs/06-onchain-renderer.md and docs/00-make-it-your-own.md.
contract ExampleOnchainRenderer is RendererBase {
    using ArtDNA for bytes32;

    uint256 private constant RING_GAP = 20;
    uint256 private constant MAX_ORBITERS = 12; // bounded: never loop on unbounded input

    function _styleName() internal pure override returns (string memory) {
        return "Sigil";
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

        uint256 twist = market.volatility % 45;
        uint256 accentOpacity =
            market.drawdownBand >= 10_000 ? 20 : 100 - (market.drawdownBand / 125);
        uint256 ringOpacity = 20 + (market.recoveryBand / 250); // 20..60 as we recover

        return string.concat(
            '<rect width="500" height="500" fill="',
            bg,
            '"/>',
            _rings(t, ink, ringOpacity),
            _core(t, accent, accentOpacity, twist),
            _orbiters(t, market, ink),
            _footer(tokenId, market, ink)
        );
    }

    function _rings(
        ArtDNA.Traits memory t,
        string memory ink,
        uint256 ringOpacity
    )
        private
        pure
        returns (string memory out)
    {
        for (uint256 i = 0; i < t.ringCount; ++i) {
            uint256 r = t.coreScale + RING_GAP * (i + 1);
            out = string.concat(
                out,
                '<circle cx="250" cy="250" r="',
                _uint(r),
                '" fill="none" stroke="',
                ink,
                '" stroke-opacity="0.',
                _two(ringOpacity),
                '" stroke-width="2"/>'
            );
        }
    }

    function _core(
        ArtDNA.Traits memory t,
        string memory accent,
        uint256 accentOpacity,
        uint256 twist
    )
        private
        pure
        returns (string memory)
    {
        string memory points = "";
        uint256 step = 360 / t.sides;
        for (uint256 i = 0; i < t.sides; ++i) {
            uint256 dir = Trig.dirFromDegrees(t.rotation + twist + i * step);
            int256 r = int256(t.coreScale + (i * t.jitter) % 8);
            int256 x = int256(CENTER) + (r * Trig.cosDir(dir)) / Trig.SCALE;
            int256 y = int256(CENTER) + (r * Trig.sinDir(dir)) / Trig.SCALE;
            points = string.concat(points, _int(x), ",", _int(y), " ");
        }
        return string.concat(
            '<polygon points="',
            points,
            '" fill="',
            accent,
            '" fill-opacity="0.',
            _two(accentOpacity),
            '" stroke="',
            accent,
            '" stroke-width="3"/>'
        );
    }

    function _orbiters(
        ArtDNA.Traits memory t,
        IExampleHook.MarketState memory market,
        string memory ink
    )
        private
        pure
        returns (string memory out)
    {
        uint256 count = market.swapCount > MAX_ORBITERS ? MAX_ORBITERS : market.swapCount;
        uint256 orbitR = t.coreScale + RING_GAP * (t.ringCount + 1);
        for (uint256 i = 0; i < count; ++i) {
            uint256 dir = Trig.dirFromDegrees(t.rotation + i * (360 / MAX_ORBITERS));
            int256 x = int256(CENTER) + (int256(orbitR) * Trig.cosDir(dir)) / Trig.SCALE;
            int256 y = int256(CENTER) + (int256(orbitR) * Trig.sinDir(dir)) / Trig.SCALE;
            out = string.concat(
                out, '<circle cx="', _int(x), '" cy="', _int(y), '" r="4" fill="', ink, '"/>'
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
            "  epoch ",
            _uint(market.epoch),
            "</text>"
        );
    }
}
