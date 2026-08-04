// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IExampleToken } from "./interfaces/IExampleToken.sol";

/// @title ExampleToken
/// @notice A minimal, fixed-supply ERC-20 for the on-chain-art + Uniswap v4 hook starter.
///
/// This token is intentionally boring and auditable:
///   - The ENTIRE supply is minted once, in the constructor, to a single recipient.
///   - There is NO mint function, NO owner, NO tax/fee-on-transfer, NO blacklist/allowlist,
///     NO pause, NO proxy/upgrade, and NO rebasing. `totalSupply()` is constant forever.
///   - It adds ONE educational feature on top of a plain ERC-20: an O(1) "active holder"
///     count maintained inside `_update`, to demonstrate how to keep an on-chain aggregate
///     correct under every transfer path (mint, transfer, transferFrom).
///
/// EDUCATIONAL — NOT AUDITED. See SECURITY.md. This is a teaching artifact, not production
/// code. Do your own security, legal, and economic review before deploying anything.
///
/// @dev The active-holder count is a *signal for art entropy*, never a governance oracle.
/// It is manipulable by any account willing to hold `HOLDER_THRESHOLD`; it resists dust
/// spam but not capital-backed Sybil behavior. Treat it accordingly.
contract ExampleToken is ERC20, IExampleToken {
    /// @notice Total fixed supply, minted once at construction. 1,000,000 whole units.
    uint256 public constant FIXED_SUPPLY = 1_000_000 ether;

    /// @notice Minimum balance for an address to be counted as an "active holder".
    /// One whole unit, so dust transfers cannot inflate the count.
    uint256 public constant HOLDER_THRESHOLD = 1 ether;

    /// @notice Number of addresses currently holding at least `HOLDER_THRESHOLD`.
    /// Maintained in O(1) on every balance change. Never iterates.
    uint256 public activeHolderCount;

    /// @dev Whether an address is currently counted as active. Private mirror used to make
    /// the count update branch-exact (we must know the *previous* activeness).
    mapping(address account => bool active) private _isActiveHolder;

    /// @param initialHolder The single recipient of the entire fixed supply. Typically the
    /// deployer, who then seeds the Uniswap v4 pool with the whole supply as one-sided
    /// liquidity (see the deployment guide). Must be non-zero.
    constructor(address initialHolder) ERC20("Example Onchain Token", "EXON") {
        require(initialHolder != address(0), "EXON: zero holder");
        _mint(initialHolder, FIXED_SUPPLY);
    }

    /// @notice True if `account` currently holds at least `HOLDER_THRESHOLD`.
    function isActiveHolder(address account) external view returns (bool) {
        return _isActiveHolder[account];
    }

    /// @dev Single override that both moves balances (via `super`) and refreshes the active
    /// holder count for exactly the two addresses whose balances changed. `address(0)` (the
    /// mint/burn sentinel) is never counted. There is no burn path in this contract, but the
    /// zero-address guard keeps the accounting correct even if one were ever added.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0)) _refreshActiveHolder(from);
        if (to != address(0)) _refreshActiveHolder(to);
    }

    /// @dev Recomputes one address's active flag and adjusts the aggregate by at most 1.
    /// O(1), no loops, cannot underflow (a false->false or true->true transition is a no-op).
    function _refreshActiveHolder(address account) private {
        bool nowActive = balanceOf(account) >= HOLDER_THRESHOLD;
        bool wasActive = _isActiveHolder[account];
        if (nowActive == wasActive) return;
        _isActiveHolder[account] = nowActive;
        if (nowActive) {
            unchecked {
                ++activeHolderCount;
            }
        } else {
            unchecked {
                --activeHolderCount;
            }
        }
    }
}
