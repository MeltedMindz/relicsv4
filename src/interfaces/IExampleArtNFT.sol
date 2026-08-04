// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title IExampleArtNFT
/// @notice Read surface for the fully on-chain art collection.
interface IExampleArtNFT is IERC721 {
    /// @notice Immutable DNA assigned to a token at awaken time. Reverts if not minted.
    function dnaOf(uint256 tokenId) external view returns (bytes32);

    /// @notice Latent capacity of `account`: whole ExampleToken units it holds minus the
    /// pieces it has already awakened, floored at zero. DERIVED, never stored.
    function latentCapacity(address account) external view returns (uint256);

    /// @notice Total number of pieces awakened so far.
    function totalMinted() external view returns (uint256);
}
