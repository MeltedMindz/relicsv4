// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IExampleHook } from "./IExampleHook.sol";

/// @title IExampleRenderer
/// @notice Pure/view renderer surface. Given a token id, its immutable DNA, and a snapshot of
/// `MarketState`, produce a complete data: tokenURI (base64 JSON with an embedded base64 SVG).
/// A renderer holds NO storage and NO owner — it is a deterministic function.
///
/// This is the "swap the art" seam. Any contract implementing this interface can be plugged into
/// `ExampleArtNFT` at construction. This starter ships THREE sample renderers (Sigil, Strata,
/// Orbital) so the range is obvious — pick one, or bring your own. See docs/06 and docs/00.
interface IExampleRenderer {
    /// @notice Full ERC-721 metadata data URI for one piece.
    function tokenURI(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.MarketState calldata market
    )
        external
        view
        returns (string memory);

    /// @notice Just the SVG document (not base64-wrapped). Handy for previews and tests.
    function renderSVG(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.MarketState calldata market
    )
        external
        pure
        returns (string memory);
}
