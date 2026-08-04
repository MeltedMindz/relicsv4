// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IExampleHook } from "./IExampleHook.sol";

/// @title IExampleRenderer
/// @notice Pure/view renderer surface. Given a token id, its immutable DNA, and a snapshot
/// of global market state, produce a complete data: tokenURI (base64 JSON with an embedded
/// base64 SVG). The renderer holds NO storage and NO owner — it is a deterministic function.
interface IExampleRenderer {
    /// @notice Full ERC-721 metadata data URI for one piece.
    function tokenURI(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.GlobalMarketState calldata market
    )
        external
        view
        returns (string memory);

    /// @notice Just the SVG document (not base64-wrapped). Handy for previews and tests.
    function renderSVG(
        uint256 tokenId,
        bytes32 dna,
        IExampleHook.GlobalMarketState calldata market
    )
        external
        pure
        returns (string memory);
}
