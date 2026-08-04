// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { RendererBase } from "./RendererBase.sol";
import { IExampleHook } from "./interfaces/IExampleHook.sol";
import { ArtDNA } from "./libraries/ArtDNA.sol";

/// @title StrataRenderer — the "Strata" art system (sample #2 of 3)
/// @notice Market history as geological sediment: each epoch lays down another horizontal band,
/// so the piece literally grows a deeper record as the market lives. A NEUTRAL sample identity.
///
/// SIGNAL → ART MAPPING:
///   - epoch        → number of sediment bands (the collection's "age" as strata depth)
///   - buy vs sell  → whether bands skew toward the accent (buying) or the ink (selling)
///   - drawdownBand → a darkening overlay (a drawn-down market buries the strata)
///   - recoveryBand → a bright horizon line rising as the market climbs back
///
/// This shows a completely different way to read the SAME `MarketState`. Swap in your own by
/// editing `_renderArt` or writing another RendererBase subclass. See docs/00-make-it-your-own.md.
contract StrataRenderer is RendererBase {
    using ArtDNA for bytes32;

    uint256 private constant MAX_BANDS = 16; // bounded: never loop on unbounded epoch

    function _styleName() internal pure override returns (string memory) {
        return "Strata";
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

        uint256 bands = market.epoch + 3;
        if (bands > MAX_BANDS) bands = MAX_BANDS;
        bool buyDominant = market.cumulativeBuyVolume >= market.cumulativeSellVolume;

        return string.concat(
            '<rect width="500" height="500" fill="',
            bg,
            '"/>',
            _bands(bands, buyDominant, ink, accent),
            _drawdownOverlay(market),
            _recoveryHorizon(market, accent),
            _footer(tokenId, market, ink)
        );
    }

    function _bands(
        uint256 bands,
        bool buyDominant,
        string memory ink,
        string memory accent
    )
        private
        pure
        returns (string memory out)
    {
        uint256 bandH = CANVAS / bands;
        for (uint256 i = 0; i < bands; ++i) {
            uint256 y = i * bandH;
            // Alternate ink/accent; the phase flips with buy vs sell dominance.
            string memory fill = ((i + (buyDominant ? 0 : 1)) % 2 == 0) ? accent : ink;
            uint256 op = 22 + (i * 55) / bands; // deeper (older) bands read heavier
            out = string.concat(
                out,
                '<rect x="0" y="',
                _uint(y),
                '" width="500" height="',
                _uint(bandH + 1),
                '" fill="',
                fill,
                '" fill-opacity="0.',
                _two(op),
                '"/>'
            );
        }
    }

    function _drawdownOverlay(IExampleHook.MarketState memory market)
        private
        pure
        returns (string memory)
    {
        uint256 darken = market.drawdownBand / 200; // 0..50
        if (darken == 0) return "";
        return string.concat(
            '<rect width="500" height="500" fill="#000000" fill-opacity="0.', _two(darken), '"/>'
        );
    }

    function _recoveryHorizon(
        IExampleHook.MarketState memory market,
        string memory accent
    )
        private
        pure
        returns (string memory)
    {
        if (market.recoveryBand == 0) return "";
        // The horizon rises from the bottom (band 0) toward the top as recovery approaches 10000.
        uint256 y = 500 - (uint256(market.recoveryBand) * 500) / 10_000;
        uint256 op = 30 + (market.recoveryBand / 250); // 30..70
        return string.concat(
            '<line x1="0" y1="',
            _uint(y),
            '" x2="500" y2="',
            _uint(y),
            '" stroke="',
            accent,
            '" stroke-width="3" stroke-opacity="0.',
            _two(op),
            '"/>'
        );
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
            "  strata ",
            _uint(market.epoch),
            "</text>"
        );
    }
}
