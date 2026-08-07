// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IRelicsHook } from "./IRelicsHook.sol";

interface IRelicsNFT {
    /// @notice Every input, other than the token id and the recipient, that influences
    /// a VIRGIN Relic's identity. Read live inside {IRelicsNFT-awaken}, in the block its
    /// caller chose, and passed as a memory value -- it is NEVER stored. (The stored
    /// forge commitment that used to pin it, `_forgeCommitment` and `_pinnedBacklog`, is
    /// what was removed; this struct was not.) A dormant id reawakening is unaffected:
    /// its identity is storage.
    struct ForgeWitness {
        IRelicsHook.GlobalMarketState market;
        uint256 holders;
        bytes32 entropy;
        uint64 mintBlock;
    }

    event RelicForged(uint256 indexed tokenId, address indexed owner, uint256 dna);
    event RelicTransmuted(uint256 indexed tokenId, uint256 state);
    /// @notice `tokenId` went dormant. ALWAYS accompanied, in the same frame, by the
    /// canonical `Transfer(owner, address(0), tokenId)`; this event is the semantic
    /// annotation, never the substitute for it.
    event RelicDormant(uint256 indexed tokenId, address indexed owner);
    /// @notice A dormant id came back with its original DNA, art, provenance and
    /// history. Always accompanied by `Transfer(address(0), owner, tokenId)`.
    event RelicReawakened(uint256 indexed tokenId, address indexed owner);
    event MetadataUpdate(uint256 indexed tokenId);
    event BatchMetadataUpdate(uint256 indexed fromTokenId, uint256 indexed toTokenId);

    /// @notice `count` Relics were retired to dormancy by their owner's own selection,
    /// ahead of a sale larger than one automatic send budget.
    event RelicsPrepared(address indexed owner, uint256 count);

    /// @notice `count` Relics were materialised by their owner's own explicit call.
    /// ALWAYS accompanied, in the same frame, by one canonical
    /// `Transfer(address(0), owner, id)` per id. `count` is never zero: a call that
    /// cannot reach its own floor reverts instead of emitting.
    event RelicsAwakened(address indexed owner, uint256 count);

    function MAX_SUPPLY() external view returns (uint256);
    function SEND_BUDGET() external view returns (uint256);
    function AUTO_AWAKEN_CAP_PER_OWNER() external view returns (uint256);
    function PREPARE_SELL_MAX() external view returns (uint256);

    function mint() external returns (uint256 tokenId);

    // -- token-only sync surface --------------------------------------------
    function syncBalances(address from, address to) external;

    // -- owner-paced ---------------------------------------------------------

    /// @notice Materialise Relics against the CALLER'S OWN latent capacity. The only
    /// mint site in the collection: `msg.sender` is always the recipient, there is no
    /// recipient parameter, and no inbound-$RELICS path mints anything. An unrelated
    /// account therefore cannot cause a dormant Relic to become active for another
    /// address by any route, at any price.
    ///
    /// `namedRelicIds` -- normally {nextAwakening}/{awakenPreview}, strictly ascending --
    /// is the set of identities the caller authorises itself to receive. NOTHING OUTSIDE
    /// IT CAN BE MATERIALISED BY THIS CALL. The canonical lowest-id-first draw decides
    /// what is actually offered, and the call fills the longest prefix of that draw which
    /// lies inside the named set, clipped to the caller's latent capacity and to
    /// {AUTO_AWAKEN_CAP_PER_OWNER}.
    ///
    /// `minCount` is the caller's floor: at least 1, at most `namedRelicIds.length`.
    /// Below it the whole call unwinds and nothing is written. Pass
    /// `namedRelicIds.length` for strict all-or-nothing; pass 1 to take whatever of the
    /// named set is still drawable rather than be reverted by unrelated pool churn.
    function awaken(
        uint256[] calldata namedRelicIds,
        uint256 minCount
    )
        external
        returns (uint256 awakened);
    function prepareSell(uint256[] calldata tokenIds) external returns (uint256 count);

    // -- views ---------------------------------------------------------------
    function evolve(uint256 tokenId) external returns (uint256 newState);
    function dnaOf(uint256 tokenId) external view returns (uint256);
    function packedStateOf(uint256 tokenId) external view returns (uint256);
    function visualFingerprintOf(uint256 tokenId) external view returns (bytes32);
    function originalMinterOf(uint256 tokenId) external view returns (address);
    function dormantIdentityOf(uint256 tokenId)
        external
        view
        returns (uint256 dna, uint256 packedState, address originalMinter, bytes32 fingerprint);
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function totalSupply() external view returns (uint256);
    function dormantSupply() external view returns (uint256);
    function forgedSupply() external view returns (uint256);
    function relicOfOwnerByIndex(address account, uint256 index) external view returns (uint256);
    function relicIndexOf(uint256 tokenId) external view returns (uint256);
    function backlogOf(address account) external view returns (uint256);
    function wholeUnitCapacity(address account) external view returns (uint256);
    function activeRelicCount(address account) external view returns (uint256);
    function latentRelicCapacity(address account) external view returns (uint256);
    function awakenPreview(uint256 count) external view returns (uint256[] memory ids);
    function nextAwakening(address account) external view returns (uint256[] memory ids);
    function lastOwnedRelic(address owner) external view returns (uint256 tokenId);
    function preparationFor(
        address owner,
        uint256 relicsAmount
    )
        external
        view
        returns (uint256 deficit, uint256 callsRequired);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
