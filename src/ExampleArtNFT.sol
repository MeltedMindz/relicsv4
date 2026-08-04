// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC4906 } from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IExampleToken } from "./interfaces/IExampleToken.sol";
import { IExampleHook } from "./interfaces/IExampleHook.sol";
import { IExampleRenderer } from "./interfaces/IExampleRenderer.sol";
import { IExampleArtNFT } from "./interfaces/IExampleArtNFT.sol";

/// @title ExampleArtNFT
/// @notice A fully on-chain ERC-721 whose metadata is computed at query time from immutable
/// per-token DNA plus live Uniswap v4 market state. There is no base URI, no owner, no proxy,
/// and no way to override metadata off chain.
///
/// AWAKENING MODEL (the core lesson — generalized, NOT any production mechanism):
///   - Receiving ExampleToken does NOTHING on its own. There is no auto-mint on inflow.
///   - A holder must EXPLICITLY call {awaken}. It is `msg.sender`-only and bounded per call.
///   - Mint capacity is DERIVED from token holdings (`latentCapacity`), never stored, and the
///     NFT is independent once minted (this starter does NOT retire NFTs on token outflow —
///     that coupling is a separate, advanced design; see docs/05-nft-and-awakening.md).
///
/// EDUCATIONAL — NOT AUDITED. See SECURITY.md.
contract ExampleArtNFT is ERC721, IERC4906, IExampleArtNFT {
    error ZeroAddress();
    error AwakenCountZero();
    error AwakenCountTooLarge(uint256 requested, uint256 maxPerCall);
    error NoLatentCapacity(address account);
    error MaxSupplyReached();
    error NonexistentToken(uint256 tokenId);

    /// @notice Hard cap on the collection size.
    uint256 public constant MAX_SUPPLY = 10_000;

    /// @notice Maximum pieces one {awaken} call may materialize. Bounds the only loop that
    /// mints, so gas is predictable and no call can be griefed into an out-of-gas revert.
    uint256 public constant MAX_AWAKEN_PER_CALL = 8;

    /// @notice One whole ExampleToken unit establishes capacity for one active piece.
    uint256 public constant UNIT = 1 ether;

    IExampleToken public immutable token;
    IExampleHook public immutable hook;
    IExampleRenderer public immutable renderer;

    uint256 private _nextId; // last minted id; ids are 1-based and strictly increasing
    mapping(uint256 tokenId => bytes32 dna) private _dna;

    event Awakened(address indexed owner, uint256 indexed tokenId, bytes32 dna);

    constructor(
        address token_,
        address hook_,
        address renderer_
    )
        ERC721("Example Onchain Art", "EXART")
    {
        if (token_ == address(0) || hook_ == address(0) || renderer_ == address(0)) {
            revert ZeroAddress();
        }
        token = IExampleToken(token_);
        hook = IExampleHook(hook_);
        renderer = IExampleRenderer(renderer_);
    }

    // ------------------------------------------------------------------
    // awakening
    // ------------------------------------------------------------------

    /// @notice Materialize up to `count` pieces to the caller, bounded by both
    /// {MAX_AWAKEN_PER_CALL} and the caller's {latentCapacity}. Reverts if the caller has no
    /// capacity at all, so an unsolicited token transfer alone can never mint.
    /// @param count How many pieces the caller wishes to awaken this call (1..8).
    /// @return firstId The id of the first piece minted (ids are contiguous within the call).
    /// @return minted The number of pieces actually minted (min of count, capacity, headroom).
    function awaken(uint256 count) external returns (uint256 firstId, uint256 minted) {
        if (count == 0) revert AwakenCountZero();
        if (count > MAX_AWAKEN_PER_CALL) revert AwakenCountTooLarge(count, MAX_AWAKEN_PER_CALL);

        uint256 capacity = latentCapacity(msg.sender);
        if (capacity == 0) revert NoLatentCapacity(msg.sender);

        uint256 toMint = count < capacity ? count : capacity;
        uint256 headroom = MAX_SUPPLY - _nextId;
        if (headroom == 0) revert MaxSupplyReached();
        if (toMint > headroom) toMint = headroom;

        firstId = _nextId + 1;
        for (uint256 i = 0; i < toMint; ++i) {
            uint256 tokenId = firstId + i;
            bytes32 dna = keccak256(
                abi.encode(
                    tokenId, msg.sender, block.number, block.prevrandao, blockhash(block.number - 1)
                )
            );
            _dna[tokenId] = dna;
            // `_mint` (not `_safeMint`): the recipient is `msg.sender`, who initiated this
            // call, so a receiver callback would only add a reentrancy/revert surface without
            // adding any real acceptance check. See docs/05-nft-and-awakening.md.
            _mint(msg.sender, tokenId);
            emit Awakened(msg.sender, tokenId, dna);
            emit MetadataUpdate(tokenId); // ERC-4906
        }
        _nextId = firstId + toMint - 1;
        minted = toMint;
    }

    // ------------------------------------------------------------------
    // views
    // ------------------------------------------------------------------

    /// @inheritdoc IExampleArtNFT
    function latentCapacity(address account) public view returns (uint256) {
        uint256 wholeUnits = token.balanceOf(account) / UNIT;
        uint256 active = balanceOf(account);
        return wholeUnits > active ? wholeUnits - active : 0;
    }

    /// @inheritdoc IExampleArtNFT
    function totalMinted() external view returns (uint256) {
        return _nextId;
    }

    /// @inheritdoc IExampleArtNFT
    function dnaOf(uint256 tokenId) external view returns (bytes32) {
        _requireMinted(tokenId);
        return _dna[tokenId];
    }

    /// @notice Fully on-chain metadata: immutable DNA rendered against live market state.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);
        IExampleHook.GlobalMarketState memory market = hook.getGlobalState();
        return renderer.tokenURI(tokenId, _dna[tokenId], market);
    }

    /// @dev ERC-165: advertise ERC-4906 (metadata update events) in addition to ERC-721.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC4906).interfaceId || super.supportsInterface(interfaceId);
    }

    function _requireMinted(uint256 tokenId) private view {
        if (_ownerOf(tokenId) == address(0)) revert NonexistentToken(tokenId);
    }
}
