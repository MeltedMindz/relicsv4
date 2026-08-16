// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IExampleToken } from "./interfaces/IExampleToken.sol";

/// @title ExampleToken — the traded asset that powers the art
/// @notice A minimal, fixed-supply ERC-20. Boring on purpose: no tax, no blacklist, no owner, no
/// mint after construction. The whole supply is minted once to a single holder (who then seeds
/// the Uniswap v4 pool).
///
/// ┌──────────────────────────────────────────────────────────────────────────────────────┐
/// │ HOW TO CUSTOMIZE (see docs/00-make-it-your-own.md)                                      │
/// │  - name / symbol / supply: pass them to the constructor (the deploy scripts read these  │
/// │    from your config/.env, so you usually change them THERE, not here).                  │
/// │  - decimals: 18 by default (standard). Override `decimals()` below only if you must.     │
/// │  - holder threshold: `HOLDER_THRESHOLD` — the minimum balance counted as an "active      │
/// │    holder" (a signal your art can read via `MarketState.holderCount`).                   │
/// │  KEEP IT PLAIN. Do not add a transfer tax, blacklist, pause, or hidden mint — those break │
/// │  the "no rug surface" promise and change the whole security story.                       │
/// └──────────────────────────────────────────────────────────────────────────────────────┘
///
/// EDUCATIONAL. See SECURITY.md.
contract ExampleToken is ERC20, IExampleToken {
    error ZeroHolder();
    error ZeroSupply();

    /// @notice Total fixed supply, minted once at construction. Constant forever after.
    uint256 public immutable FIXED_SUPPLY;

    // CUSTOMIZE: minimum balance to count as an "active holder" (one whole unit by default).
    // Dust below this cannot inflate the holder-growth signal.
    uint256 public constant HOLDER_THRESHOLD = 1 ether;

    /// @notice Number of addresses currently holding at least `HOLDER_THRESHOLD`. Maintained in
    /// O(1) on every balance change — this is the "holder growth" market signal for the art.
    uint256 public activeHolderCount;

    mapping(address account => bool active) private _isActiveHolder;

    /// @param name_ Collection token name (e.g. "Aurora Machines").
    /// @param symbol_ Token symbol (e.g. "AURA").
    /// @param supply_ Total fixed supply in the smallest unit (e.g. 1_000_000 ether).
    /// @param initialHolder The single recipient of the entire supply (usually the deployer).
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        address initialHolder
    )
        ERC20(name_, symbol_)
    {
        if (initialHolder == address(0)) revert ZeroHolder();
        if (supply_ == 0) revert ZeroSupply();
        FIXED_SUPPLY = supply_;
        _mint(initialHolder, supply_);
    }

    /// @notice True if `account` currently holds at least `HOLDER_THRESHOLD`.
    function isActiveHolder(address account) external view returns (bool) {
        return _isActiveHolder[account];
    }

    /// @dev O(1) active-holder accounting under every transfer path (mint, transfer, transferFrom).
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0)) _refreshActiveHolder(from);
        if (to != address(0)) _refreshActiveHolder(to);
    }

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
