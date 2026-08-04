// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC4906 } from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IExampleToken } from "./interfaces/IExampleToken.sol";
import { IExampleHook } from "./interfaces/IExampleHook.sol";
import { IExampleRenderer } from "./interfaces/IExampleRenderer.sol";
import { IExampleArtNFT } from "./interfaces/IExampleArtNFT.sol";

/// @title ExampleArtNFT — the collection
/// @notice A fully on-chain ERC-721 whose metadata is computed at query time from immutable
/// per-token DNA plus live Uniswap v4 market state. No base URI, no owner, no proxy, no off-chain
/// override.
///
/// ┌──────────────────────────────────────────────────────────────────────────────────────┐
/// │ HOW TO CUSTOMIZE (see docs/00-make-it-your-own.md)                                      │
/// │  - name / symbol / max supply: constructor params (set them in your config/.env).       │
/// │  - the ACQUISITION MODEL is `awaken` below — a clear, swappable pattern:                 │
/// │      * receiving the token mints NOTHING (no auto-mint on inflow),                       │
/// │      * a holder explicitly calls `awaken(count)`, `msg.sender`-only and bounded,         │
/// │      * capacity is DERIVED from token holdings, never stored.                            │
/// │    Want a paid public sale, an allowlist, or a free mint instead? Replace `awaken` with  │
/// │    your model — the rest of the system (hook, renderer) does not care how pieces are      │
/// │    minted, only that each has immutable DNA.                                             │
/// └──────────────────────────────────────────────────────────────────────────────────────┘
///
/// EDUCATIONAL — NOT AUDITED. See SECURITY.md.
contract ExampleArtNFT is ERC721, IERC4906, IExampleArtNFT {
    error ZeroAddress();
    error ZeroMaxSupply();
    error AwakenCountZero();
    error AwakenCountTooLarge(uint256 requested, uint256 maxPerCall);
    error NoLatentCapacity(address account);
    error MaxSupplyReached();
    error NonexistentToken(uint256 tokenId);

    /// @notice Hard cap on the collection size (immutable; set at deploy from your config).
    uint256 public immutable MAX_SUPPLY;

    // CUSTOMIZE: maximum pieces one `awaken` call may materialize. Bounds the only minting loop.
    uint256 public constant MAX_AWAKEN_PER_CALL = 8;

    // CUSTOMIZE: how many whole token units establish capacity for one piece (one, by default).
    uint256 public constant UNIT = 1 ether;

    IExampleToken public immutable token;
    IExampleHook public immutable hook;
    IExampleRenderer public immutable renderer;

    uint256 private _nextId;
    mapping(uint256 tokenId => bytes32 dna) private _dna;

    event Awakened(address indexed owner, uint256 indexed tokenId, bytes32 dna);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        address token_,
        address hook_,
        address renderer_
    )
        ERC721(name_, symbol_)
    {
        if (token_ == address(0) || hook_ == address(0) || renderer_ == address(0)) {
            revert ZeroAddress();
        }
        if (maxSupply_ == 0) revert ZeroMaxSupply();
        MAX_SUPPLY = maxSupply_;
        token = IExampleToken(token_);
        hook = IExampleHook(hook_);
        renderer = IExampleRenderer(renderer_);
    }

    // ------------------------------------------------------------------
    // acquisition model (swappable)
    // ------------------------------------------------------------------

    /// @notice Materialize up to `count` pieces to the caller, bounded by both
    /// {MAX_AWAKEN_PER_CALL} and the caller's {latentCapacity}. Reverts if the caller has no
    /// capacity, so an unsolicited token transfer alone can never mint.
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
            // `_mint` (not `_safeMint`): the recipient is `msg.sender`. See docs/05.
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

    /// @notice Fully on-chain metadata: immutable DNA rendered against live market state. The
    /// "holder growth" signal is a TOKEN fact, so we read it here and inject it into the state the
    /// renderer sees — it stays live without any per-swap work in the hook.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);
        IExampleHook.MarketState memory market = hook.getMarketState();
        market.holderCount = uint64(token.activeHolderCount());
        return renderer.tokenURI(tokenId, _dna[tokenId], market);
    }

    /// @dev ERC-165: advertise ERC-4906 in addition to ERC-721.
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
