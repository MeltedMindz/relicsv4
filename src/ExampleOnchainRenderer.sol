// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IExampleHook } from "./interfaces/IExampleHook.sol";
import { IExampleRenderer } from "./interfaces/IExampleRenderer.sol";
import { ArtDNA } from "./libraries/ArtDNA.sol";
import { Trig } from "./libraries/Trig.sol";

/// @title ExampleOnchainRenderer
/// @notice A fully on-chain, deterministic renderer producing base64 JSON with an embedded
/// base64 SVG. There is NO stored image, NO IPFS, NO API — `tokenURI` is computed from
/// Ethereum state at query time.
///
/// VISUAL IDENTITY IS A NEUTRAL PLACEHOLDER. The "sigil" here — concentric rings around a
/// rotating polygon core, tinted by market state — is generic starter art. It is NOT the
/// art of any production collection. Replace `_svg`, the palettes, and `ArtDNA` with your
/// own visual language. See docs/06-onchain-renderer.md and docs/16-renderer-size-budget.md.
///
/// @dev This contract holds no storage and has no owner: it is a pure/view function of its
/// inputs. Immutability of DNA + determinism of this function is what makes the collection
/// verifiable. Keep it under the EIP-170 runtime limit (24,576 bytes) — a size test pins it.
contract ExampleOnchainRenderer is IExampleRenderer {
    using Strings for uint256;
    using ArtDNA for bytes32;

    uint256 private constant CANVAS = 500;
    uint256 private constant CENTER = 250;
    uint256 private constant RING_GAP = 20;
    uint256 private constant MAX_ORBITERS = 12; // bounded: never loop on unbounded input

    /// @inheritdoc IExampleRenderer
    function tokenURI(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.GlobalMarketState calldata market
    )
        external
        view
        returns (string memory)
    {
        string memory svg = _svg(tokenId, dna, market);
        string memory json = string.concat(
            '{"name":"Example Sigil #',
            tokenId.toString(),
            '","description":"A fully on-chain generative sigil for the relics-v4-starter. ',
            "Immutable DNA rendered against live Uniswap v4 market state. Educational sample art, not a real collection.",
            '","attributes":',
            _attributes(dna, market),
            ',"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @inheritdoc IExampleRenderer
    function renderSVG(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.GlobalMarketState calldata market
    )
        external
        pure
        returns (string memory)
    {
        return _svg(tokenId, dna, market);
    }

    // ------------------------------------------------------------------
    // SVG
    // ------------------------------------------------------------------

    function _svg(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.GlobalMarketState memory market
    )
        internal
        pure
        returns (string memory)
    {
        ArtDNA.Traits memory t = dna.decode();
        (string memory bg, string memory ink, string memory accent) = _palette(t.palette);

        // Market state MODULATES the render without changing DNA:
        //  - volatility twists the core polygon
        //  - drawdownBand fades the accent (a "wounded", drawn-down look)
        uint256 twist = market.volatility % 45;
        uint256 accentOpacity =
            market.drawdownBand >= 10_000 ? 20 : 100 - (market.drawdownBand / 125); // 100 down to ~20 as drawdown grows

        string memory doc = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
            '<rect width="500" height="500" fill="',
            bg,
            '"/>',
            _rings(t, ink),
            _core(t, accent, accentOpacity, twist),
            _orbiters(t, market, ink),
            _footer(tokenId, market, ink)
        );
        return doc;
    }

    function _rings(
        ArtDNA.Traits memory t,
        string memory ink
    )
        private
        pure
        returns (string memory out)
    {
        // Bounded: t.ringCount is 2..6 by construction (ArtDNA), so this never loops wildly.
        for (uint256 i = 0; i < t.ringCount; ++i) {
            uint256 r = t.coreScale + RING_GAP * (i + 1);
            out = string.concat(
                out,
                '<circle cx="250" cy="250" r="',
                r.toString(),
                '" fill="none" stroke="',
                ink,
                '" stroke-opacity="0.35" stroke-width="2"/>'
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
            uint256 angle = t.rotation + twist + i * step;
            uint256 dir = Trig.dirFromDegrees(angle);
            // jitter nudges the radius per vertex for an organic, hand-cut feel
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
        IExampleHook.GlobalMarketState memory market,
        string memory ink
    )
        private
        pure
        returns (string memory out)
    {
        // The number of orbiting marks tracks observed swaps, but is HARD-CAPPED so the
        // render cost can never grow with market activity. This is the key on-chain-art
        // lesson: art can respond to the market without unbounded per-swap work.
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
        IExampleHook.GlobalMarketState memory market,
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
            tokenId.toString(),
            "  epoch ",
            uint256(market.epoch).toString(),
            "</text>"
        );
    }

    // ------------------------------------------------------------------
    // metadata
    // ------------------------------------------------------------------

    function _attributes(
        bytes32 dna,
        IExampleHook.GlobalMarketState memory market
    )
        private
        pure
        returns (string memory)
    {
        ArtDNA.Traits memory t = dna.decode();
        return string.concat(
            "[",
            _trait("Archetype", ArtDNA.archetypeName(t.sides)),
            ",",
            _traitNum("Palette", t.palette),
            ",",
            _traitNum("Sides", t.sides),
            ",",
            _traitNum("Rings", t.ringCount),
            ",",
            _traitNum("Epoch", market.epoch),
            ",",
            _traitNum("Drawdown Band", market.drawdownBand),
            ",",
            _traitNum("Volatility", market.volatility),
            ",",
            _traitNum("Observed Swaps", market.swapCount),
            "]"
        );
    }

    function _trait(string memory k, string memory v) private pure returns (string memory) {
        return string.concat('{"trait_type":"', k, '","value":"', v, '"}');
    }

    function _traitNum(string memory k, uint256 v) private pure returns (string memory) {
        return string.concat('{"trait_type":"', k, '","value":', v.toString(), "}");
    }

    // ------------------------------------------------------------------
    // palettes (neutral, dark backgrounds)
    // ------------------------------------------------------------------

    function _palette(uint256 index)
        private
        pure
        returns (string memory bg, string memory ink, string memory accent)
    {
        if (index == 0) return ("#0d0f14", "#c8d0dc", "#5aa9e6");
        if (index == 1) return ("#12100c", "#e8dcc0", "#e0a94b");
        if (index == 2) return ("#0a1410", "#bfe6cf", "#3fbf7f");
        if (index == 3) return ("#140a12", "#e6c0dc", "#c65aa9");
        if (index == 4) return ("#0c0c14", "#cccce6", "#8a7ff0");
        return ("#141010", "#e6cccc", "#e0605a");
    }

    // ------------------------------------------------------------------
    // number helpers
    // ------------------------------------------------------------------

    /// @dev Render an int as a decimal string (coords are non-negative here, but the signed
    /// helper keeps the geometry robust if constants ever change).
    function _int(int256 v) private pure returns (string memory) {
        if (v < 0) return string.concat("-", uint256(-v).toString());
        return uint256(v).toString();
    }

    /// @dev Two-digit fractional part for opacity (e.g. 20 -> "20", 5 -> "05", 100 -> "99").
    function _two(uint256 v) private pure returns (string memory) {
        if (v >= 100) return "99";
        if (v < 10) return string.concat("0", v.toString());
        return v.toString();
    }
}
