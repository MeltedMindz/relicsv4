// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IRelicsRenderer {
    function tokenURI(
        uint256 tokenId,
        uint256 dna,
        uint256 state
    )
        external
        view
        returns (string memory);
}
