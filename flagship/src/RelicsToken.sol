// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IRelicsToken } from "./interfaces/IRelicsToken.sol";
import { IRelicsNFT } from "./interfaces/IRelicsNFT.sol";

contract RelicsToken is ERC20, Ownable, IRelicsToken {
    error InvalidHolderThreshold();
    error InvalidInitialRecipient();
    error ZeroAddress();
    error RelicSyncAlreadyConfigured();
    error RelicSyncPoolAlreadySet();
    error RelicLockerAlreadySet();
    error RelicSyncNotConfigured();
    error UnauthorizedRelicSync();
    error AddressCannotReceiveRelic(address account);
    error ExcludedAddressHoldsRelics(address account);

    uint256 public constant FIXED_SUPPLY = 10_000 ether;
    uint256 public constant UNIT_PER_RELIC = 1 ether;

    /// @notice Canonical entombment address. $RELICS sent here are permanently
    /// inaccessible but are NOT burned: they remain in {totalSupply}.
    ///
    /// The tomb is PERMANENTLY EXCLUDED from the whole-unit sync layer (see
    /// {canReceiveRelic}): no Relic NFT can ever be minted to, moved to, or held
    /// by this address. This is a hard liveness requirement, not an aesthetic
    /// choice, and it survives the move to explicit awakening -- with a simpler
    /// reason than the one it was introduced with.
    ///
    /// ORIGINALLY: awakening happened automatically on an inbound $RELICS transfer, in
    /// a quantity derived from the recipient's CUMULATIVE balance. The tomb's balance
    /// only ever grows, so a transfer into it would have driven one ERC-721 write per
    /// whole unit it had ever accumulated -- an unbounded, externally-fundable loop that
    /// anyone could push past a block's gas limit, permanently bricking every contract
    /// whose only exit is a transfer to the tomb.
    ///
    /// NOW: nothing awakens on inbound $RELICS at all, so that loop no longer exists for
    /// ANY address. The exclusion stays because the tomb has no key and no code, and
    /// therefore can never call `RelicsNFT.awaken`: a Relic that reached it would be
    /// permanently immobile liveness debt against a balance that only grows. Keeping
    /// `relicEntitlement` at zero is what makes every transfer into and out of the tomb
    /// O(1) forever, and what keeps `RelicsNFT.retireStranded` able to clear anything
    /// that arrives by hand -- most importantly for
    /// RelicsGenesisPositionLocker.collectFees(), the treasury's sole fee route.
    address public constant ENTOMBMENT_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice The canonical deterministic CREATE2 deployer (Arachnid's, present at the
    /// same address on every chain this launches on). {setRelicLocker} derives the
    /// locker's address through it instead of accepting one, which is what stops the
    /// pre-renounce owner from branding an address that already holds Relics.
    address public constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    uint256 public immutable HOLDER_THRESHOLD;
    address public immutable notMintableAccount;

    address public relicsNFT;
    address public relicSyncPool;

    /// @notice The immutable genesis LP fee locker (RelicsGenesisPositionLocker).
    /// Set once, before the locker can ever hold $RELICS, and never changed.
    /// Excluded from the whole-unit sync layer for the same reason as
    /// {ENTOMBMENT_ADDRESS}: its crank must forward its ENTIRE $RELICS balance
    /// atomically, anyone can push $RELICS into it, and it has no code path that could
    /// ever call `RelicsNFT.awaken` -- so any Relic that reached it would be immobile
    /// liveness debt on the treasury's only fee route.
    address public relicLocker;

    uint256 private _activeHolderCount;
    mapping(address account => bool active) private _activeHolders;
    bool private _relicTransferInProgress;

    constructor(
        address initialRecipient,
        uint256 holderThreshold
    )
        ERC20("Relics", "RELICS")
        Ownable(initialRecipient)
    {
        if (initialRecipient == address(0)) revert InvalidInitialRecipient();
        if (holderThreshold == 0 || holderThreshold > FIXED_SUPPLY) {
            revert InvalidHolderThreshold();
        }
        HOLDER_THRESHOLD = holderThreshold;
        notMintableAccount = initialRecipient;
        _mint(initialRecipient, FIXED_SUPPLY);
    }

    function setRelicsNFT(address relicsNFT_) external onlyOwner {
        if (relicsNFT != address(0)) revert RelicSyncAlreadyConfigured();
        if (relicsNFT_ == address(0)) revert ZeroAddress();
        relicsNFT = relicsNFT_;
        emit RelicSyncConfigured(relicsNFT_);
    }

    function setRelicSyncPool(address pool) external onlyOwner {
        if (relicSyncPool != address(0)) revert RelicSyncPoolAlreadySet();
        if (pool == address(0)) revert ZeroAddress();
        _requireHoldsNoRelics(pool);
        relicSyncPool = pool;
        _deactivateHolder(pool);
        emit RelicSyncPoolSet(pool);
    }

    /// @notice One-shot registration of the immutable genesis LP fee locker.
    /// Mirrors {setRelicSyncPool}: owner-only, single-assignment, zero-address
    /// rejecting, and it removes the locker from the active-holder count (holder
    /// count is a live art input; the locker is protocol infrastructure, not a
    /// participant). Once registered the locker can never receive a Relic NFT, so
    /// RelicsGenesisPositionLocker.collectFees() is O(1) in its $RELICS balance
    /// forever after -- see {ENTOMBMENT_ADDRESS} for why that matters.
    ///
    /// SHOULD be called before the locker can hold any $RELICS. The canonical
    /// deployment (script/deployment/AddGenesisLiquidityLadder.s.sol) computes the
    /// locker's CREATE2 address and registers it here in the transaction immediately
    /// after the genesis LP mint -- before the locker is deployed and before the pool
    /// has been open long enough for anyone to act -- so there is no window in which
    /// the locker exists unregistered.
    ///
    /// DELIBERATELY NOT GUARDED BY {_requireHoldsNoRelics}, unlike {setRelicSyncPool}.
    /// The locker's address is a CREATE2 address derived from the genesis position ids,
    /// so it becomes publicly computable the moment the genesis LP is minted and cannot
    /// be known before then. A `_requireHoldsNoRelics` guard here therefore hands any
    /// third party a permanent veto over the registration: a Relic delivered by hand to
    /// the (code-less, key-less) predicted address can never be moved off it again, and
    /// the registration would revert forever. That is fatal once ownership is renounced.
    ///
    /// The price of that veto ROSE with explicit awakening and is stated exactly. A
    /// $RELICS push at the predicted address now awakens NOTHING -- no inbound-$RELICS
    /// path materialises a Relic, and the address has no code with which to call
    /// `RelicsNFT.awaken` -- so the one-whole-unit version of this attack no longer
    /// exists. What remains is an ERC-721 `transferFrom` of a Relic the attacker
    /// already owns, which costs them the Relic and its whole backing unit and is
    /// visible on chain. Dropping the guard is the same decision either way; only the
    /// attacker's cost changed, and it changed upward.
    ///
    /// Registering regardless is safe because the state it admits is transient and
    /// publicly repairable, not permanent: from this call on, the locker's
    /// {relicEntitlement} is zero and {canReceiveRelic} is false, so NOT ONE further
    /// Relic can reach it by any path, and anyone may retire whatever arrived first
    /// through `RelicsNFT.retireStranded` in batches of {IRelicsNFT.PREPARE_SELL_MAX}.
    /// The canonical deployment does exactly that before taking custody and asserts a
    /// zero balance afterwards. {setRelicSyncPool} keeps its guard because it is
    /// registered before the sync layer is live at all, when no Relic can exist.
    ///
    /// GUARDED INSTEAD BY THE CREATE2 DERIVATION, which is what makes dropping the
    /// emptiness guard safe for HOLDERS as well as for the launch. The caller does not
    /// name an address; it names the `(salt, initCodeHash)` pair the locker will be
    /// deployed with, and the address is DERIVED here from {CREATE2_DEPLOYER}. Pointing
    /// this registration at an address that already exists -- a holder's wallet, a vault,
    /// an exchange -- therefore requires finding a CREATE2 preimage for that exact 160-bit
    /// address, which is ~2^160 work. Without this, an owner who had not yet renounced
    /// could register a LIVE HOLDER as the locker: their {relicEntitlement} would fall to
    /// zero forever, {canReceiveRelic} would be false forever, and their entire Relic
    /// inventory would become permissionlessly burnable through `retireStranded`. That
    /// power no longer exists, and it is closed in the contract rather than only in the
    /// deployment runbook.
    ///
    /// The trade the emptiness guard could not make is now available: a THIRD PARTY still
    /// cannot veto the registration (nothing about the target's balance is checked), and
    /// the OWNER still cannot aim it at a bystander.
    function setRelicLocker(
        bytes32 create2Salt,
        bytes32 initCodeHash
    )
        external
        onlyOwner
        returns (address locker)
    {
        if (relicLocker != address(0)) revert RelicLockerAlreadySet();
        locker = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, create2Salt, initCodeHash)
                    )
                )
            )
        );
        // Unreachable in practice -- it would be a 160-bit collision with the zero
        // address -- but the state it would create is permanent, so it is refused rather
        // than argued about.
        if (locker == address(0)) revert ZeroAddress();
        relicLocker = locker;
        _deactivateHolder(locker);
        emit RelicLockerSet(locker);
    }

    function transferRelicToken(address from, address to) external {
        if (msg.sender != relicsNFT) revert UnauthorizedRelicSync();
        if (!canReceiveRelic(to)) revert AddressCannotReceiveRelic(to);

        _relicTransferInProgress = true;
        _transfer(from, to, UNIT_PER_RELIC);
        _relicTransferInProgress = false;
    }

    /// @notice The whole-unit backing line for `account`: the maximum number of Relic
    /// NFTs it may hold at this instant.
    ///
    /// The ERC-721 layer does NOT derive its balances from this. `RelicsNFT.balanceOf`
    /// is OpenZeppelin's stored balance and changes only through eventful ownership
    /// transitions; this value is the bound that `RelicsNFT._update` ENFORCES BY
    /// REVERT after every inbound transition. A shortfall in $RELICS can therefore
    /// never silently invalidate a Relic -- it can only make a further transfer either
    /// retire Relics with real burn events or revert outright.
    ///
    /// Pure storage reads and one division. It CANNOT REVERT, so no read or settlement
    /// path can be bricked through it.
    function relicEntitlement(address account) external view returns (uint256) {
        return canReceiveRelic(account) ? balanceOf(account) / UNIT_PER_RELIC : 0;
    }

    function activeHolderCount() external view returns (uint256) {
        return _activeHolderCount;
    }

    function isActiveHolder(address account) external view returns (bool) {
        return _activeHolders[account];
    }

    function totalSupply() public view override(ERC20, IRelicsToken) returns (uint256) {
        return super.totalSupply();
    }

    function balanceOf(address account)
        public
        view
        override(ERC20, IRelicsToken)
        returns (uint256)
    {
        return super.balanceOf(account);
    }

    /// @dev O(1) in `value`. Exactly ONE external call into the ERC-721 layer per
    /// ERC-20 transfer. `value` is deliberately not passed: the NFT reads the live
    /// post-transfer balances through {relicEntitlement}, so there is no pre/post-state
    /// ambiguity and no delta arithmetic that could desync.
    ///
    /// `syncBalances` MAY REVERT, and that is the point: when the sender is over its
    /// post-transfer backing line by more than RelicsNFT.SEND_BUDGET, the whole
    /// transfer unwinds and the holder is told exactly how much preparation it owes.
    /// Nothing is settled halfway and no Relic is ever quietly invalidated.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        _syncHolder(from);
        if (to != from) _syncHolder(to);

        address nft = relicsNFT;
        if (nft == address(0) || relicSyncPool == address(0)) return;
        // A self-transfer changes no entitlement on either side. Returning early is
        // what stops the sync layer double-counting one account as both sender and
        // receiver of the same units.
        if (from == to) return;
        // The reciprocal leg of a DIRECT Relic transfer. The ERC-721 layer is already
        // mid-transfer and is moving the matching whole unit itself: both sides end
        // with their Relic count and their entitlement changed by the same one, so
        // there is nothing for the sync layer to settle and re-entering it here would
        // let the receiving side act twice on a unit that is already spoken for.
        if (_relicTransferInProgress) return;

        IRelicsNFT(nft).syncBalances(from, to);
    }

    function _requireHoldsNoRelics(address account) private view {
        address nft = relicsNFT;
        if (nft == address(0)) return;
        if (IRelicsNFT(nft).balanceOf(account) != 0) {
            revert ExcludedAddressHoldsRelics(account);
        }
    }

    function _syncHolder(address account) private {
        if (account == address(0) || account == relicSyncPool || account == relicLocker) return;

        bool active = balanceOf(account) >= HOLDER_THRESHOLD;
        bool wasActive = _activeHolders[account];
        if (active == wasActive) return;

        _activeHolders[account] = active;
        if (active) {
            unchecked {
                ++_activeHolderCount;
            }
        } else {
            unchecked {
                --_activeHolderCount;
            }
        }

        emit HolderThresholdCrossed(account, active, balanceOf(account));
    }

    function _deactivateHolder(address account) private {
        if (!_activeHolders[account]) return;
        _activeHolders[account] = false;
        unchecked {
            --_activeHolderCount;
        }
        emit HolderThresholdCrossed(account, false, balanceOf(account));
    }

    /// @notice The set of addresses that can never hold a Relic NFT.
    /// - address(0): not an account.
    /// - relicSyncPool: the AMM's vault; its balance is the float, not a holding.
    /// - notMintableAccount: the deployer, which seeds the pool and must not
    ///   materialise Relics on the way through.
    /// - relicLocker and ENTOMBMENT_ADDRESS: excluded to keep every transfer into
    ///   and out of them O(1). Both are monotone-balance sinks on the fee path, and
    ///   neither has any code path that could call `RelicsNFT.awaken`, so a Relic that
    ///   reached either would be permanently immobile. See {ENTOMBMENT_ADDRESS}.
    ///
    /// Consequence, stated plainly: NO Relic NFT ever awakens at the tomb. $RELICS
    /// entombed at {ENTOMBMENT_ADDRESS} are ERC-20 only. A holder who sends whole
    /// $RELICS units to the tomb has their Relics RETIRED to the dormancy pool with
    /// real ERC-721 burn events rather than moved into the tomb; the DNA is preserved
    /// and those token ids reawaken, unchanged, when the next holders explicitly
    /// materialise capacity of their own.
    ///
    /// The exclusion is enforced on BOTH ERC-721 entry points. An excluded address has
    /// `relicEntitlement == 0`, so `RelicsNFT._update` reverts any mint or inbound
    /// transfer to it, and {transferRelicToken} rejects it outright, so nobody can
    /// hand-deliver a Relic to the tomb, the pool or the locker either.
    function canReceiveRelic(address account) public view returns (bool) {
        return account != address(0) && account != relicSyncPool && account != notMintableAccount
            && account != relicLocker && account != ENTOMBMENT_ADDRESS;
    }
}
