// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import { Actions } from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import { ActionConstants } from "@uniswap/v4-periphery/src/libraries/ActionConstants.sol";

/// @dev The v4 PositionManager is also an ERC-721, but `IPositionManager` does not expose the
/// ERC-721 read surface. Only the two reads this contract needs are declared here. There is
/// DELIBERATELY no declaration of `approve`, `setApprovalForAll`, `transferFrom`,
/// `safeTransferFrom`, `permit`, `subscribe`, etc., so NO such call can be compiled into this
/// contract's bytecode — the position can never leave.
interface IPositionManagerERC721View {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

/// @dev Minimal balance-only ERC-20 surface, used ONLY to report event amounts for recipient
/// addresses. `IERC20` is not imported on purpose: this contract must not be able to compile
/// an ERC-20 `transfer`/`transferFrom`/`approve`.
interface IERC20BalanceOf {
    function balanceOf(address account) external view returns (uint256);
}

/// @title ImmutablePositionLocker
/// @notice An ownerless, non-upgradeable, eternal custodian for ONE Uniswap v4 LP position
/// NFT. It separates PRINCIPAL FINALITY (the position is locked forever) from FEE COLLECTION
/// (fees can still be realized), and it routes fees DIRECTLY to immutable recipients — never
/// through this contract's own balance.
///
/// WHY DIRECT ROUTING MATTERS (the donation-DoS lesson — see docs/09-locker-and-lp-finality.md):
///   If a locker forwarded fees by first taking them into its OWN balance and then calling
///   `transfer`, its behavior could depend on balances it holds. An attacker could donate
///   unexpected tokens to change or brick that path. This contract NEVER reads its own token
///   balance for control flow and NEVER holds a fee asset. It encodes:
///
///       DECREASE_LIQUIDITY(POSITION_ID, liquidity = 0, min0 = 0, min1 = 0, "")  // fee poke
///       TAKE(currency0, recipient0, OPEN_DELTA)   // straight to recipient0
///       TAKE(currency1, recipient1, OPEN_DELTA)   // straight to recipient1
///
///   The `liquidity = 0` DECREASE is the canonical v4 "fee poke": it credits accrued fees and
///   leaves principal untouched. Because the principal delta is provably zero, `min0`/`min1`
///   of 0 protect nothing that needs protecting. The two TAKEs name the FINAL recipients, so
///   the PoolManager pays them directly. Donated balances are inert dust here.
///
/// WHAT THIS CONTRACT CANNOT DO: no owner, no admin, no proxy, no initializer, no delegatecall,
/// no selfdestruct, no fallback, no receive, no arbitrary call. The only action bytes ever
/// encoded are DECREASE_LIQUIDITY and TAKE, and the DECREASE amount is the LITERAL zero — a
/// principal withdrawal cannot be expressed by this bytecode.
///
/// EDUCATIONAL REFERENCE — NOT PRODUCTION SOFTWARE. See SECURITY.md. This is a teaching artifact. Verify every
/// property against the v4-periphery version you deploy against, on a fork, before trusting it.
contract ImmutablePositionLocker is IERC721Receiver, ReentrancyGuard {
    error ZeroAddress(string field);
    error InvalidPositionId();
    error IdenticalCurrencies();
    error ForbiddenRecipient(string field, address value);
    error PositionCurrencyMismatch(
        address expected0, address expected1, address actual0, address actual1
    );
    error PositionHasNoLiquidity(uint256 tokenId);
    error UnexpectedNFT(address sender);
    error UnexpectedTokenId(uint256 tokenId);
    error PositionAlreadySecured(uint256 tokenId);
    error PositionNotInCustody(uint256 tokenId, address currentOwner);
    error LiquidityInvariantViolated(uint256 tokenId, uint128 before, uint128 nowLiquidity);
    error CustodyInvariantViolated(uint256 tokenId, address currentOwner);

    /// @notice Emitted once, when the position enters permanent custody.
    event PositionSecured(uint256 indexed tokenId);
    /// @notice Emitted after every permissionless fee collection.
    event FeesCollected(
        address indexed caller, uint256 amount0ToRecipient0, uint256 amount1ToRecipient1
    );

    IPositionManager public immutable positionManager;
    address public immutable currency0;
    address public immutable currency1;
    address public immutable recipient0;
    address public immutable recipient1;
    uint256 public immutable POSITION_ID;
    uint128 public immutable GENESIS_LIQUIDITY;
    /// @notice Reproducible commitment to the full immutable fee policy.
    bytes32 public immutable feePolicyHash;

    /// @notice True once the position NFT has been delivered into permanent custody.
    /// {collectFees} never reads this, so it can never gate the fee route.
    bool public positionSecured;

    /// @param positionManager_ The v4 PositionManager holding `positionId_`.
    /// @param currency0_ Expected pool currency0 (must match the position's pool).
    /// @param currency1_ Expected pool currency1 (must match the position's pool).
    /// @param recipient0_ Immutable recipient of all currency0 fees.
    /// @param recipient1_ Immutable recipient of all currency1 fees.
    /// @param positionId_ The one position id this locker will custody.
    constructor(
        address positionManager_,
        address currency0_,
        address currency1_,
        address recipient0_,
        address recipient1_,
        uint256 positionId_
    ) {
        if (positionManager_ == address(0)) revert ZeroAddress("positionManager");
        if (currency0_ == address(0)) revert ZeroAddress("currency0");
        if (currency1_ == address(0)) revert ZeroAddress("currency1");
        if (recipient0_ == address(0)) revert ZeroAddress("recipient0");
        if (recipient1_ == address(0)) revert ZeroAddress("recipient1");
        if (currency0_ == currency1_) revert IdenticalCurrencies();
        if (positionId_ == 0) revert InvalidPositionId();

        // A recipient equal to a v4 action sentinel (address(1)=MSG_SENDER, address(2)=
        // ADDRESS_THIS) or to this contract would silently re-route a TAKE back into this
        // contract, reintroducing the donation-DoS surface. Refuse all three for both.
        _requireSafeRecipient("recipient0", recipient0_);
        _requireSafeRecipient("recipient1", recipient1_);

        positionManager = IPositionManager(positionManager_);
        currency0 = currency0_;
        currency1 = currency1_;
        recipient0 = recipient0_;
        recipient1 = recipient1_;
        POSITION_ID = positionId_;

        // Deploy-time binding to the REAL position: prove on-chain, before the NFT is ever
        // sent, that the tokenId exists and its pool is exactly this currency pair in this
        // order (the order the two TAKEs hard-code). A wrong id or ordering cannot deploy.
        (PoolKey memory key,) =
            IPositionManager(positionManager_).getPoolAndPositionInfo(positionId_);
        address actual0 = Currency.unwrap(key.currency0);
        address actual1 = Currency.unwrap(key.currency1);
        if (actual0 != currency0_ || actual1 != currency1_) {
            revert PositionCurrencyMismatch(currency0_, currency1_, actual0, actual1);
        }

        uint128 liquidity = IPositionManager(positionManager_).getPositionLiquidity(positionId_);
        if (liquidity == 0) revert PositionHasNoLiquidity(positionId_);
        GENESIS_LIQUIDITY = liquidity;

        feePolicyHash = keccak256(
            abi.encode(
                "IMMUTABLE_POSITION_LOCKER_V1_DIRECT_TAKE",
                positionManager_,
                currency0_,
                currency1_,
                recipient0_,
                recipient1_,
                positionId_
            )
        );
    }

    /// @notice Accepts ONLY {POSITION_ID}, ONLY from {positionManager}, and AT MOST ONCE.
    /// Note the honest scope: this guards `safeTransferFrom` only. A plain `transferFrom`
    /// never consults a receiver hook, so arbitrary NFTs can still be pushed here — that is
    /// harmless BY CONSTRUCTION (see {collectFees}), and such donations are permanently
    /// stranded, the accepted cost of having no rescue path.
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    )
        external
        returns (bytes4)
    {
        if (msg.sender != address(positionManager)) revert UnexpectedNFT(msg.sender);
        if (tokenId != POSITION_ID) revert UnexpectedTokenId(tokenId);
        if (positionSecured) revert PositionAlreadySecured(tokenId);
        positionSecured = true;
        emit PositionSecured(tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Permissionless fee crank. Anyone may call; the caller supplies and receives
    /// nothing. Safe with zero accrued fees (a zero credit resolves to a clean no-op).
    /// O(1) in every balance anywhere, so no donation of any size can price this out.
    function collectFees()
        external
        nonReentrant
        returns (uint256 amount0ToRecipient0, uint256 amount1ToRecipient1)
    {
        uint256 tokenId = POSITION_ID;
        IPositionManagerERC721View pmNft = IPositionManagerERC721View(address(positionManager));

        address ownerBefore = pmNft.ownerOf(tokenId);
        if (ownerBefore != address(this)) revert PositionNotInCustody(tokenId, ownerBefore);
        uint128 liquidityBefore = positionManager.getPositionLiquidity(tokenId);

        // Observational only: RECIPIENT balances, never this contract's; no branch depends on
        // them. They exist so the event reports real numbers.
        uint256 r0Before = IERC20BalanceOf(currency0).balanceOf(recipient0);
        uint256 r1Before = IERC20BalanceOf(currency1).balanceOf(recipient1);

        bytes memory actions = abi.encodePacked(
            bytes1(uint8(Actions.DECREASE_LIQUIDITY)),
            bytes1(uint8(Actions.TAKE)),
            bytes1(uint8(Actions.TAKE))
        );
        bytes[] memory params = new bytes[](3);
        // (tokenId, liquidity=LITERAL 0, amount0Min=0, amount1Min=0, hookData="")
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        // (currency, recipient, amount=OPEN_DELTA). Recipients are immutables, never ADDRESS_THIS.
        params[1] =
            abi.encode(Currency.wrap(currency0), recipient0, uint256(ActionConstants.OPEN_DELTA));
        params[2] =
            abi.encode(Currency.wrap(currency1), recipient1, uint256(ActionConstants.OPEN_DELTA));

        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);

        // Post-conditions: nobody can cause these to fail — increasing/decreasing/burning this
        // position needs owner/approval on the PositionManager, which this contract never grants.
        uint128 liquidityAfter = positionManager.getPositionLiquidity(tokenId);
        if (liquidityAfter != liquidityBefore) {
            revert LiquidityInvariantViolated(tokenId, liquidityBefore, liquidityAfter);
        }
        address ownerAfter = pmNft.ownerOf(tokenId);
        if (ownerAfter != address(this)) revert CustodyInvariantViolated(tokenId, ownerAfter);

        unchecked {
            // Both recipients only ever received across this call, so neither subtraction can
            // underflow in practice. `unchecked` is deliberate: a wrong event number must never
            // be allowed to revert and take down the treasury's only fee route.
            amount0ToRecipient0 = IERC20BalanceOf(currency0).balanceOf(recipient0) - r0Before;
            amount1ToRecipient1 = IERC20BalanceOf(currency1).balanceOf(recipient1) - r1Before;
        }
        emit FeesCollected(msg.sender, amount0ToRecipient0, amount1ToRecipient1);
    }

    /// @notice Live liquidity of the custodied position. Must always equal {GENESIS_LIQUIDITY}.
    function custodiedLiquidity() external view returns (uint128) {
        return positionManager.getPositionLiquidity(POSITION_ID);
    }

    /// @notice Live owner of the custodied position. Must equal `address(this)` once secured.
    function custodian() external view returns (address) {
        return IPositionManagerERC721View(address(positionManager)).ownerOf(POSITION_ID);
    }

    function _requireSafeRecipient(string memory field, address value) private view {
        if (
            value == ActionConstants.MSG_SENDER || value == ActionConstants.ADDRESS_THIS
                || value == address(this)
        ) {
            revert ForbiddenRecipient(field, value);
        }
    }
}
