// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IExampleHook } from "./interfaces/IExampleHook.sol";
import { IExampleRenderer } from "./interfaces/IExampleRenderer.sol";

/// @title RendererBase
/// @notice Shared plumbing for a fully on-chain renderer: it wraps your art in a 500×500 SVG
/// document, builds the base64 JSON metadata, and exposes shared palette + number helpers. A
/// concrete renderer only implements the ART.
///
/// ┌──────────────────────────────────────────────────────────────────────────────────────┐
/// │ TO WRITE YOUR OWN ART: extend this contract and implement `_renderArt(...)` — the single │
/// │ seam that returns the inner SVG for one piece. Optionally override `_styleName`,          │
/// │ `_description`, and `_attributes`. Everything else (JSON, base64, canvas) is done for you. │
/// │ Keep `_renderArt` PURE and BOUNDED (no unbounded loops) and watch the EIP-170 size gate.  │
/// └──────────────────────────────────────────────────────────────────────────────────────┘
abstract contract RendererBase is IExampleRenderer {
    using Strings for uint256;

    uint256 internal constant CANVAS = 500;
    uint256 internal constant CENTER = 250;

    /// @inheritdoc IExampleRenderer
    function tokenURI(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.MarketState calldata market
    )
        external
        view
        returns (string memory)
    {
        string memory svg = _document(tokenId, dna, market);
        string memory json = string.concat(
            '{"name":"',
            _pieceName(tokenId),
            '","description":"',
            _description(),
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
        IExampleHook.MarketState calldata market
    )
        external
        pure
        returns (string memory)
    {
        return _document(tokenId, dna, market);
    }

    function _document(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.MarketState memory market
    )
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
            _renderArt(tokenId, dna, market),
            "</svg>"
        );
    }

    // ============================ the seams you implement ============================

    /// @notice CUSTOMIZE: return the inner SVG for one piece. This is where the art lives.
    function _renderArt(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.MarketState memory market
    )
        internal
        pure
        virtual
        returns (string memory);

    /// @notice Short human name of this art system, used as the token-name prefix.
    function _styleName() internal pure virtual returns (string memory);

    function _description() internal pure virtual returns (string memory) {
        return "A fully on-chain generative piece for the relics-v4-starter. Immutable DNA rendered against live Uniswap v4 market state. Educational sample art.";
    }

    /// @notice Default trait set from the shared market signals. Override to add style traits.
    function _attributes(
        bytes32,
        IExampleHook.MarketState memory market
    )
        internal
        pure
        virtual
        returns (string memory)
    {
        return string.concat(
            "[",
            _traitNum("Epoch", market.epoch),
            ",",
            _traitNum("Drawdown Band", market.drawdownBand),
            ",",
            _traitNum("Recovery Band", market.recoveryBand),
            ",",
            _traitNum("Volatility", market.volatility),
            ",",
            _traitNum("Observed Swaps", market.swapCount),
            ",",
            _traitNum("Holders", market.holderCount),
            "]"
        );
    }

    // ============================ shared helpers ============================

    function _pieceName(uint256 tokenId) internal pure returns (string memory) {
        return string.concat(_styleName(), " #", tokenId.toString());
    }

    function _trait(string memory k, string memory v) internal pure returns (string memory) {
        return string.concat('{"trait_type":"', k, '","value":"', v, '"}');
    }

    function _traitNum(string memory k, uint256 v) internal pure returns (string memory) {
        return string.concat('{"trait_type":"', k, '","value":', v.toString(), "}");
    }

    /// @notice CUSTOMIZE: the shared palette. Six neutral, dark-background palettes. Swap these
    /// hex values for your own brand colors.
    function _palette(uint256 index)
        internal
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

    function _uint(uint256 v) internal pure returns (string memory) {
        return v.toString();
    }

    /// @dev Signed integer to decimal string (SVG coordinates may dip negative near edges).
    function _int(int256 v) internal pure returns (string memory) {
        if (v < 0) return string.concat("-", uint256(-v).toString());
        return uint256(v).toString();
    }

    /// @dev Two-digit fractional part for opacity strings, clamped to "05".."99".
    function _two(uint256 v) internal pure returns (string memory) {
        if (v >= 100) return "99";
        if (v < 5) return "05";
        if (v < 10) return string.concat("0", v.toString());
        return v.toString();
    }
}
