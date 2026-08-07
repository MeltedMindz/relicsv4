// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IRelicsNFT } from "./interfaces/IRelicsNFT.sol";
import { IRelicsRenderer } from "./interfaces/IRelicsRenderer.sol";
import { IRelicsHook } from "./interfaces/IRelicsHook.sol";
import { IRelicsToken } from "./interfaces/IRelicsToken.sol";
import { DNA } from "./libraries/DNA.sol";
import { EvolutionMath } from "./libraries/EvolutionMath.sol";
import { VisualIdentity } from "./libraries/VisualIdentity.sol";

/// @title RelicsNFT -- eventful bounded sync. ERC-721 state is the source of truth.
///
/// # The one rule
///
/// `balanceOf` and `ownerOf` are OpenZeppelin's, unmodified. Nothing in this
/// contract derives, masks, filters or reinterprets them. A Relic exists exactly
/// while `_owners[tokenId] != 0`, and that word changes ONLY inside
/// `ERC721._update`, which emits `Transfer` on every single change. There is
/// therefore no reachable state in which `balanceOf`/`ownerOf` disagree with the
/// event history, because there is no code path that can move ownership without
/// going through the function that emits the event.
///
/// # The backing invariant
///
/// For every account `a`:
///
///     balanceOf(a) <= floor(RELICS.balanceOf(a) / 1e18)     (the BACKING LINE)
///
/// It is enforced by REVERT, never by concealment. {_update} re-checks it against
/// live token state after every inbound ownership transition, so a violating state
/// is unreachable rather than merely unreached.
///
/// # Bounded, eventful work
///
/// - INFLOW: an ERC-20 receive performs NO ERC-721 WORK OF ANY KIND. It moves fungible
///   balance, which raises the receiver's LATENT CAPACITY -- a quantity that is
///   DERIVED, never stored -- and this contract writes nothing at all. See "Awakening
///   is an act, not a side effect" below; this is the marketplace-safety property.
/// - AWAKENING: {awaken} is the ONLY path that materialises a Relic. It is
///   `msg.sender`-only, takes no recipient, takes at most
///   {AUTO_AWAKEN_CAP_PER_OWNER} ids per call, and materialises NOTHING the caller did
///   not name. Every one emits `Transfer(0, msg.sender, id)`.
/// - OUTFLOW: an ERC-20 send computes `deficit = balanceOf(from) - postEntitlement`
///   and makes exactly that many Relics dormant, each with a real
///   `Transfer(owner, 0, id)`. Above {SEND_BUDGET} it REVERTS with
///   {PreparationRequired} rather than doing unbounded work or hiding anything.
/// - PREPARATION: {prepareSell} lets the OWNER choose which Relics go dormant, in
///   batches of at most {PREPARE_SELL_MAX}, so no deterministic boundary can retire
///   a prized Relic without consent.
///
/// # Awakening is an act, not a side effect
///
/// For every account `a`:
///
///     wholeUnitCapacity(a)  = floor(RELICS.balanceOf(a) / 1e18)
///     activeRelicCount(a)   = balanceOf(a)                 <= wholeUnitCapacity(a)
///     latentRelicCapacity(a)= wholeUnitCapacity(a) - activeRelicCount(a)
///
/// A $RELICS transfer moves the first line. ONLY {awaken}, called by `a` itself,
/// moves the second. The token layer cannot tell a swap the receiver authorised from
/// a donation an attacker made -- an attacker can name any victim as the output
/// recipient of a UniversalRouter swap -- so no inbound-$RELICS path is allowed to
/// mint. That removes, structurally, the shape this contract previously priced:
/// pushing one whole unit at a former owner to rematerialise a Relic they had listed
/// and never cancelled, making their abandoned order fillable at the abandoned price.
///
/// THE PROPERTY: an unrelated account cannot cause a dormant Relic to become active
/// for another address. There is no argument about cost here, because there is no
/// reachable code path: the single `_mint` site is inside {awaken}, whose recipient
/// is `msg.sender` and whose ids are supplied by `msg.sender`.
///
/// What an unrelated account CAN still do is hand-deliver a LIVE Relic it already
/// owns by an ordinary ERC-721 transfer. That is the universal ERC-721 shape, it
/// costs the sender the Relic and its whole backing unit, and it is not a
/// dormant-to-active transition. The dormancy seal below is what keeps it from
/// reaching an abandoned order.
///
/// This also retired the STORED FORGE COMMITMENT the inflow path used to write -- the
/// `_forgeCommitment` and `_pinnedBacklog` slots, now free; the {IRelicsNFT.ForgeWitness}
/// struct itself remains, read live inside {awaken} and never stored. It was a pinned
/// generative context, re-pinned on a high-water mark, so that art materialised later
/// could not be re-rolled by a stranger pushing dust. The stranger cannot materialise
/// anything now, so the pin defended nothing -- while making an account's latent
/// capacity UNSPENDABLE if the pinned context could not be reproduced, on what is now
/// the primary user action. It was removed with the threat it existed for. A dormant
/// id's identity was never rolled in the first place (it is storage), so the only
/// behaviour that moved is that a VIRGIN id is rolled in the block its owner chooses
/// to awaken it in, rather than the block they bought in.
///
/// # The dormancy pool is a SET, drawn by id -- never by insertion order
///
/// Dormant ids live in a bitmap keyed by the id itself, and {_drawIfNamed} always draws
/// the LOWEST dormant id. The pool therefore has no insertion order to manipulate: it is
/// a set, and the draw is the canonical minimum of that set.
///
/// The draw is no longer the stale-order defence -- {awaken} is (see above). It remains
/// a set drawn at its minimum for two reasons that still hold.
///
/// FIRST, THE DRAW IS NOT SELECTABLE BY ANYONE, including the caller. `awaken` does not
/// let the caller pick ids; the list it takes is a VETO, never a choice. The caller names
/// the ids it authorises itself to receive, the canonical lowest-id-first ordering
/// decides what is offered, and an offer the caller did not name stops the call rather
/// than being skipped over. To obtain a chosen dormant id `X` a caller must therefore
/// still draw, and simultaneously hold, every dormant id below `X`, each backed by its
/// own whole $RELICS unit. `rank(X)` is a property of the pool that no action can lower,
/// and a set has no insertion order for `prepareSell` to permute.
///
/// SECOND, and stated plainly rather than papered over: that bound is a REFUNDABLE PEAK,
/// not an expenditure -- a caller who does the whole acquisition in one transaction nets
/// out at ~1 unit at every pool depth measured (to 1,000), so the binding barrier is gas
/// and the AMM round trip, not principal. `cost(X) <= X`, so low-numbered ids are
/// permanently the cheapest to draw. Rank also decays for free as others buy, so a
/// patient party may poll {nextDormantId} and take a target for one unit when organic
/// churn brings it to the head. What the minimum draw buys is that nobody can STEER --
/// cannot MAKE an id the head and cannot lower its rank -- not that nobody can WAIT.
///
/// None of that is now a route to somebody else's abandoned order, because whoever pays
/// it receives the Relic THEMSELVES. Reaching a victim from there requires handing them a
/// live Relic by an ordinary ERC-721 transfer, which is the universal ERC-721 shape and
/// is what the dormancy seal addresses. See {dormantBitmapWord} and {nextDormantId}; both
/// are public because the draw is derivable from chain state anyway, and because
/// {awaken} requires the caller to have read them.
///
/// # What naming ids costs in liveness, and the floor that bounds it
///
/// A draw that belongs to the whole pool means the head moves for reasons that have
/// nothing to do with any one caller: a competing {awaken}, a permissionless
/// {retireStranded}, an ordinary holder's market sell, or an attacker retiring a low id
/// on purpose. If a caller had to restate the draw exactly, every one of those events
/// would revert EVERY awakening in flight -- a cheap, repeatable denial of the primary
/// user action, for the price of one {prepareSell}.
///
/// {awaken} therefore takes a FLOOR, not an exact list. It fills the longest prefix of the
/// draw that lies inside the ids the caller named, and reverts only below that floor. A
/// party who moves the head can now, at most, reduce how many a caller gets in one call:
///
///   - ids taken from under the caller by someone else are SKIPPED in the caller's list,
///     so the rest of the batch still lands;
///   - an id pushed into the middle of the caller's batch stops the fill there, and the
///     ids before it still land;
///   - an id pushed BELOW everything the caller named stops the fill at zero -- the
///     caller is never handed it -- and the honest answer is that this residual cannot
///     be removed while the draw is the canonical minimum AND the caller only ever
///     receives ids it named. The lever against it is that the caller may NAME ids it
///     does not expect: whoever pushes a low id in is offering it to the first caller
///     who names it, and loses it.
///
/// See {awaken} for the exact rule and {AwakeningShortfall} for what a refusal reports.
///
/// # The dormancy seal on operator authority
///
/// Dormancy is a real burn and a reawakening is a real mint of the SAME id, so a
/// marketplace order signed before dormancy names an id that can exist again. Per-token
/// approvals die with the burn, but collection-wide operator approvals are stored per
/// `(owner, operator)` and no burn touches them.
///
/// Explicit awakening removes the case where a THIRD PARTY exploits that. It does not
/// remove the case where the OWNER does. An owner who lists Relic `X`, retires it, and
/// later awakens it themselves would -- without the seal -- rematerialise `X` under a
/// still-live conduit approval and an order they never cancelled, at which point ANY
/// passer-by can fill it at the abandoned price. The owner's own hand is on the trigger,
/// but the harm and the counterparty are the same.
///
/// {_operatorAuthorized} closes it with a seal keyed on the PAIR `(tokenId, owner)`:
/// an operator approval reaches a Relic only if the grant strictly postdates the last
/// SEAL EVENT for that Relic AND THAT OWNER. There are exactly two seal events:
///
///   1. the owner loses it to dormancy ({_makeDormant});
///   2. the owner RE-ACQUIRES an id that already carries a seal against them
///      ({_update}) -- which now covers both a self-awakening and a hand-delivery.
///
/// WHAT THE SEAL DOES NOT COVER, STATED PLAINLY. Event 1 fires only on loss to dormancy,
/// and event 2 is conditional on an existing seal, so AN OWNER WHO LOSES A RELIC BY AN
/// ORDINARY ERC-721 TRANSFER IS NEVER STAMPED -- sold on another venue, moved to a vault
/// -- and someone who later returns that id to them can still reach an order they signed
/// before the loss. Doing it costs that someone the Relic itself plus its whole backing
/// unit, and it is the shape every ERC-721 has. Extending event 1 to every outbound loss
/// would close it and force ordinary marketplace sellers onto a re-approval treadmill,
/// and each forced re-approval re-arms the abandoned orders the seal exists to keep dead.
/// The seal is set here deliberately and the residual is documented rather than denied.
///
/// Keying on the owner is also what keeps the seal from taxing the whole market. A
/// Relic that went dormant under Alice carries NO seal against Bob, so Bob's standing
/// marketplace approval covers everything he awakens or buys and he never re-approves --
/// except when Bob re-acquires an id he himself retired. Since awakening is now an
/// explicit call whose ids the caller has already read and restated, a front-end knows
/// exactly when that happens and can bundle the re-approval; nothing about it is
/// invisible any more, and none of it happens inside a swap. See {isAuthorizedForRelic}
/// for the view a marketplace should read.
///
/// # Why the awakening cap is per call, and why 8
///
/// {AUTO_AWAKEN_CAP_PER_OWNER} bounds the identities materialised by ONE explicitly
/// authorised acquisition. It cannot be reset or bypassed by repeated purchases, split
/// purchases, multi-router paths, self-transfers or dormancy cycles, because NONE of
/// those materialise anything at all -- there is exactly one mint site and it is inside
/// {awaken}. A donation cannot consume it either: a donation raises the recipient's
/// latent capacity and leaves the cap untouched.
///
/// `AUTO_AWAKEN_CAP_PER_OWNER <= SEND_BUDGET` is the liveness invariant. A holder who
/// awakens one batch can always dispose of the whole position in a single ERC-20
/// transfer without preparing, because the outflow deficit of that sale is at most
/// {SEND_BUDGET}. Awakening more than one batch is a deliberate, repeated act, and
/// {preparationFor} tells the holder in advance what it will cost them to exit.
contract RelicsNFT is ERC721, IRelicsNFT {
    error MaxSupplyReached();
    error ZeroAddress();
    error TokenSyncOnly();
    error NoRelicsOwned(address owner);
    error UnauthorizedEvolve();

    /// @notice The sender is over its post-transfer backing line by more than a
    /// single automatic budget. Nothing was written; the caller must first choose
    /// `callsRequired` batches of Relics to retire with {prepareSell}.
    /// @param deficit Relics that must go dormant for this transfer to settle.
    /// @param sendBudget The automatic allowance, {SEND_BUDGET}.
    /// @param callsRequired {prepareSell} calls of {PREPARE_SELL_MAX} ids needed
    /// before this exact transfer succeeds.
    error PreparationRequired(uint256 deficit, uint256 sendBudget, uint256 callsRequired);
    error PreparationBatchTooLarge(uint256 requested, uint256 maximum);
    error EmptyPreparation();
    error NotRelicOwner(uint256 tokenId, address caller);

    /// @notice {awaken} was called in a shape that could succeed while materialising
    /// nothing: an empty id list, or a `minCount` of zero. A successful awakening always
    /// materialises at least one identity, so a caller never has to distinguish "it
    /// worked and you got nothing" from "it worked".
    error EmptyAwakening();

    /// @notice {awaken} was called with more than {AUTO_AWAKEN_CAP_PER_OWNER} ids.
    error AwakeningBatchTooLarge(uint256 requested, uint256 maximum);

    /// @notice The caller asked to materialise more Relics than its latent capacity
    /// `floor(RELICS.balanceOf(caller)/1e18) - balanceOf(caller)` allows. Nothing was
    /// written. Raised against `minCount`: a caller may NAME more ids than it can hold
    /// (see {awaken}), it may only require a floor it can actually reach.
    error InsufficientLatentCapacity(uint256 requested, uint256 available);

    /// @notice {awaken} requires its id list strictly ascending and free of id 0, which
    /// is what {awakenPreview}/{nextAwakening} return. The check is what makes a repeated
    /// id impossible and lets the match run in one pass over the draw.
    error AwakeningIdsUnordered(uint256 index, uint256 previous, uint256 current);

    /// @notice The caller's floor was not reached: only `awakened` of the ids it named
    /// were still drawable, and it required `minCount`. NOTHING was written -- the whole
    /// call is unwound.
    ///
    /// `blockedBy` is the id the canonical draw offered when the fill stopped: an id the
    /// caller did NOT name, sitting at the head. A caller that had named `blockedBy`
    /// would have been given it. `blockedBy == 0` means the opposite shape -- the draw has
    /// moved past EVERY id still left in the caller's list, so there was nothing at the
    /// head to refuse. Either way: re-read {nextAwakening} and call again.
    error AwakeningShortfall(uint256 awakened, uint256 minCount, uint256 blockedBy);

    /// @notice {retireStranded} was pointed at an id that is not held by an address the
    /// token layer permanently excludes from the sync layer.
    error NotStranded(uint256 tokenId, address owner);

    /// @notice The backing line, asserted after an inbound ownership transition.
    /// Unreachable in the shipped flows; it exists so that it is unreachable rather
    /// than merely unreached.
    error BackingLineExceeded(address owner, uint256 active, uint256 entitlement);

    uint256 public constant MAX_SUPPLY = 10_000;

    /// @notice Relics made dormant automatically inside ONE ERC-20 send. Above this
    /// the transfer reverts with {PreparationRequired}. MUST be at least
    /// {AUTO_AWAKEN_CAP_PER_OWNER} or a holder who awakened one batch could be trapped.
    uint256 public constant SEND_BUDGET = 16;

    /// @notice Ids materialised by ONE {awaken} call -- the ceiling on an explicitly
    /// authorised acquisition. Compile-time constant: no setter, no owner, never
    /// `gasleft()`-adaptive (a gas-dependent state transition makes simulation diverge
    /// from execution and hands a griefer a lever on outcomes).
    ///
    /// No other path materialises anything, so this cannot be reset or bypassed by
    /// repeated purchases, split purchases, multi-router paths, self-transfers or
    /// dormancy cycles, and a donation cannot consume it. Capacity above it stays
    /// LATENT until its owner calls again.
    uint256 public constant AUTO_AWAKEN_CAP_PER_OWNER = 8;

    /// @notice Maximum ids per {prepareSell} call.
    uint256 public constant PREPARE_SELL_MAX = 16;

    IRelicsRenderer public immutable renderer;
    IRelicsHook public immutable marketHook;
    IRelicsToken public immutable relicsToken;

    uint256 private _nextTokenId = 1;

    /// @dev Live Relics. `+1` per mint, `-1` per burn, both inside {_update}, so it is
    /// `sum over a of balanceOf(a)` by construction rather than by reconciliation.
    uint256 private _activeSupply;

    mapping(uint256 tokenId => uint256 dna) private _dna;
    mapping(uint256 tokenId => uint256 state) private _packedState;
    mapping(uint256 tokenId => address minter) private _originalMinter;
    mapping(uint256 tokenId => bytes32 fingerprint) private _visualFingerprint;
    mapping(bytes32 fingerprint => bool used) private _usedVisualFingerprints;

    /// @dev Enumeration of an owner's live Relics, and the source of the LIFO order
    /// the AUTOMATIC dormancy path uses. Every element is a live token whose
    /// `ownerOf` is this owner; the array and `_balances` move together inside
    /// {_update} and can never disagree.
    mapping(address owner => uint256[] tokenIds) private _ownedRelics;
    mapping(uint256 tokenId => uint256 index) private _ownedRelicIndex;

    /// @dev Ids that have gone dormant with a real burn `Transfer`, awaiting reuse, as a
    /// BITMAP KEYED BY ID: bit `tokenId & 0xff` of word `tokenId >> 8` is set exactly
    /// while `tokenId` is dormant. Their DNA, art, provenance and history are untouched,
    /// so an id drawn from here reawakens as the same Relic.
    ///
    /// A bitmap rather than an array because the pool must be a SET. An array records
    /// the order ids were pushed in, and that order was attacker-controlled through
    /// {prepareSell}; a bitmap records only membership, so the draw can be the canonical
    /// minimum and there is nothing left to permute.
    mapping(uint256 word => uint256 bits) private _dormantBitmap;

    /// @dev Level-0 summary and population count, packed into one slot so a draw costs
    /// two cold reads rather than a scan:
    ///   - bits 0..63: bit `w` is set exactly while `_dormantBitmap[w] != 0`;
    ///   - bits 64..79: the number of dormant ids ({dormantSupply}).
    ///
    /// 64 summary bits cover ids `0 .. 16,383`, and {MAX_SUPPLY} is 10,000, so word
    /// indices never exceed 39 and the summary can never overflow its field. The count
    /// is bounded by {MAX_SUPPLY} and so can never overflow its 16 bits either.
    uint256 private _dormantIndex;

    /// @notice Monotonic seal counter. Bumped exactly once per SEAL EVENT -- a Relic
    /// retired to dormancy, or a Relic re-acquired by an owner who had previously lost
    /// it -- and never decremented, so it orders every seal event against every
    /// operator grant in a single total order, including two events inside the same
    /// block or the same transaction.
    uint64 public dormancyEpoch;

    /// @notice The epoch stamped against the PAIR `(tokenId, owner)`. `0` means this
    /// owner has never lost this Relic to dormancy, so a standing operator grant
    /// reaches it normally.
    ///
    /// MONOTONE BY CONSTRUCTION: the only two writers both assign `++dormancyEpoch`,
    /// so no sequence of actions by anyone -- owner, operator or attacker -- can lower
    /// a seal. Authority is therefore only ever withheld, never restored, except by a
    /// deliberate fresh grant from the owner.
    mapping(uint256 tokenId => mapping(address owner => uint64 epoch)) public ownerTokenSeal;

    /// @notice The epoch at which `owner` last granted `operator` collection-wide
    /// authority, recorded as `dormancyEpoch + 1`. `0` means never granted, or revoked.
    ///
    /// The `+1` is what makes the comparison in {_operatorAuthorized} an exact
    /// happened-before test rather than an approximation: a dormancy that fires AFTER
    /// this grant necessarily stamps an epoch of at least this value, and a grant made
    /// after a dormancy necessarily exceeds that dormancy's epoch -- even when both
    /// land in the same transaction.
    mapping(address owner => mapping(address operator => uint64 epoch)) public
        operatorApprovalEpoch;

    constructor(
        address renderer_,
        address marketHook_,
        address relicsToken_
    )
        ERC721("Relics", "RELICS")
    {
        if (renderer_ == address(0) || marketHook_ == address(0) || relicsToken_ == address(0)) {
            revert ZeroAddress();
        }
        renderer = IRelicsRenderer(renderer_);
        marketHook = IRelicsHook(marketHook_);
        relicsToken = IRelicsToken(relicsToken_);
    }

    function mint() external pure returns (uint256) {
        revert TokenSyncOnly();
    }

    // ==================================================================
    // token-only sync surface
    // ==================================================================

    /// @notice The whole sync layer, in one call, O(1) in the transferred amount.
    ///
    /// IT IS OUTFLOW ONLY, AND `to` IS DELIBERATELY IGNORED. There is no inflow half.
    /// A receive of $RELICS raises the receiver's latent capacity -- a DERIVED quantity,
    /// `wholeUnitCapacity - activeRelicCount`, with no storage of its own -- and this
    /// contract writes nothing, emits nothing and draws nothing on that side. The
    /// parameter is kept so the token layer's call site stays a single unconditional
    /// call, and so that anyone reading either contract can see that the receiver is
    /// named here and still nothing happens to it.
    ///
    /// That asymmetry is the marketplace-safety property. The token layer cannot tell a
    /// swap the receiver authorised from a donation an attacker made -- an attacker can
    /// name any address as a UniversalRouter output recipient -- so anything done here
    /// on behalf of `to` would be doable to a stranger by a stranger.
    ///
    /// The outflow half REVERTS -- deliberately -- when the sender is over its
    /// post-transfer line by more than {SEND_BUDGET}. This is the FIRST thing the
    /// function does and the first thing this contract does in the enclosing
    /// transaction, so nothing here has been written when it fires and the ERC-20 leg
    /// unwinds with it. The alternative (letting the transfer through while quietly
    /// invalidating Relics) is what this design exists to remove.
    function syncBalances(address from, address to) external {
        if (msg.sender != address(relicsToken)) revert TokenSyncOnly();
        to; // see above: the receiving side of a $RELICS transfer does no ERC-721 work.
        _settleOutflow(from);
    }

    // ==================================================================
    // owner-paced entry points
    // ==================================================================

    /// @notice Materialise Relics against YOUR OWN latent capacity. THE ONLY MINT SITE
    /// IN THE CONTRACT.
    ///
    /// `msg.sender`-only, with no recipient parameter, and that is the whole
    /// marketplace-safety argument: there is no reachable code path by which one account
    /// causes a dormant Relic to become active for another. Not a cheap one, not an
    /// expensive one -- none. An ERC-721 operator holding `setApprovalForAll` cannot
    /// call this for an owner, and neither can an ERC-20 spender holding an allowance;
    /// both would have to BE the owner, and then they are not a third party.
    ///
    /// `namedRelicIds` is the identity preview, restated: the ids from
    /// {awakenPreview}/{nextAwakening}, strictly ascending, with no repeats and no id 0.
    /// THE CALLER RECEIVES NOTHING ELSE. Every value this function forges was READ OUT OF
    /// THAT ARRAY -- the accepted ids are copied from `namedRelicIds` into the front of
    /// `draw`, and each is then passed to {_drawIfNamed}, which consumes the head only if
    /// the head equals the value handed to it. So the claim survives even if the match
    /// below were wrong: there is no branch that mints an unnamed id, at any pool state,
    /// for any list, however the two cursors move.
    ///
    /// `minCount` is the caller's FLOOR, and it is what keeps this function live. The
    /// draw is a property of the whole pool, not of the caller, so any dormancy or any
    /// competing awakening moves it -- an attacker's {prepareSell} of a lower id, a
    /// competing {awaken}, a permissionless {retireStranded}, or an ordinary holder's
    /// market sell with no attacker at all. An all-or-nothing restatement hands every one
    /// of those events the power to revert every pending awakening in the mempool. So the
    /// fill is a PARTIAL FILL down to `minCount`:
    ///
    ///   - The canonical draw is walked against the named list with one cursor each.
    ///   - Drawn id EQUALS the named id at the cursor: materialise it, advance both.
    ///   - Drawn id is ABOVE the named id at the cursor: that named id was drawn by
    ///     somebody else between the preview and now. Skip past it and keep going --
    ///     nothing about it is owed to this caller.
    ///   - Drawn id is BELOW every id the caller still has left to name: an identity the
    ///     caller never saw is at the head. STOP. The caller is not handed it.
    ///
    /// The result is the longest prefix of the canonical draw that lies inside the named
    /// list, clipped to the caller's latent capacity and to
    /// {AUTO_AWAKEN_CAP_PER_OWNER}. That is the MOST a call can be given without handing
    /// over an unnamed identity -- the draw is forced, so anything further would mean
    /// skipping a drawn id, which is exactly the selection power the pool exists to deny.
    /// Below `minCount` the whole call unwinds with {AwakeningShortfall} and nothing is
    /// written; `minCount == namedRelicIds.length` is the strict all-or-nothing mode.
    ///
    /// The match is decided in memory against {awakenPreview} BEFORE anything is drawn,
    /// so a refused call writes nothing, emits nothing and does not pay to forge
    /// identities it is about to unwind. Being griefed is cheap for the victim.
    ///
    /// A caller may NAME ids it does not expect to receive -- up to
    /// {AUTO_AWAKEN_CAP_PER_OWNER} of them -- and receive only as many as it can back.
    /// That is the answer to a griefer who front-runs by pushing a lower id into the
    /// pool: name that id too, and the front-run hands it to the victim instead of
    /// blocking them, at the cost of the griefer's own Relic.
    ///
    /// Bounded three ways, all decided before anything is written: at most
    /// {AUTO_AWAKEN_CAP_PER_OWNER} ids named and at most that many materialised, never
    /// more than the caller's latent capacity MATERIALISED (naming more is allowed; the
    /// fill is clipped), and never past {MAX_SUPPLY}.
    ///
    /// A DORMANT id reawakens with its stored identity: same DNA, fingerprint, original
    /// minter, scars, resonance, lineage and evolve count. Nothing stored about it is
    /// rolled, so the preview is exact. (The RENDERED `tokenURI` still reads live market
    /// state, exactly as it does for a Relic that was never dormant.) A VIRGIN id is
    /// forged against the live generative context of the block the CALLER chose to call
    /// in -- which is the only block anyone can put it in, since nobody else can mint for
    /// them.
    ///
    /// AWAKENING PAST ONE BATCH IS A CHOICE WITH A CONSEQUENCE: a holder who materialises
    /// more than {SEND_BUDGET} Relics must retire the excess with {prepareSell} before
    /// selling that much of their position in one transaction. {preparationFor} prices
    /// that in advance. One batch never owes it, because
    /// `AUTO_AWAKEN_CAP_PER_OWNER <= SEND_BUDGET`.
    /// @param namedRelicIds Ids the caller authorises itself to receive, strictly
    /// ascending. Nothing outside this list can be materialised by this call.
    /// @param minCount The fewest ids the caller will accept. Must be at least 1 and at
    /// most `namedRelicIds.length`.
    /// @return awakened Ids materialised, a prefix of the canonical draw contained in
    /// `namedRelicIds`. Always `>= minCount` on success.
    function awaken(
        uint256[] calldata namedRelicIds,
        uint256 minCount
    )
        external
        returns (uint256 awakened)
    {
        uint256 count = namedRelicIds.length;
        if (count == 0 || minCount == 0) revert EmptyAwakening();
        if (count > AUTO_AWAKEN_CAP_PER_OWNER) {
            revert AwakeningBatchTooLarge(count, AUTO_AWAKEN_CAP_PER_OWNER);
        }
        if (minCount > count) revert AwakeningBatchTooLarge(minCount, count);

        // A floor above what the caller can back is unsatisfiable; say so before doing
        // any work. NAMING more ids than that is allowed and is the point (see above).
        uint256 latent = _latentCapacity(msg.sender);
        if (minCount > latent) revert InsufficientLatentCapacity(minCount, latent);

        // Strictly ascending, starting above id 0. This is the duplicate check -- a
        // repeated id fails here rather than at the second draw -- and it is what lets
        // the match below run in a single pass over two ascending sequences (the draw is
        // ascending because every dormant id was forged and is therefore below every
        // virgin id, and both halves are drawn low-first).
        uint256 previous;
        for (uint256 i; i < count; ++i) {
            uint256 id = namedRelicIds[i];
            if (id <= previous) revert AwakeningIdsUnordered(i, previous, id);
            previous = id;
        }

        // DECIDE FIRST, THEN ACT. The whole match runs in memory against
        // {awakenPreview}, which is the draw itself, so a call that cannot reach its
        // floor reverts having WRITTEN NOTHING, MINTED NOTHING, EMITTED NOTHING and
        // burned no gas forging identities it is about to throw away. A griefer's reward
        // for moving the head is therefore a cheap revert for the victim, not an
        // expensive one.
        uint256 room = latent < count ? latent : count;
        uint256[] memory draw = awakenPreview(room);
        uint256 cursor;
        uint256 blockedBy;

        for (uint256 d; d < draw.length; ++d) {
            uint256 offered = draw[d];
            // Skip every id the caller named that the draw has already left behind --
            // taken by somebody else between the preview and now. Nothing is owed on it.
            while (cursor < count && namedRelicIds[cursor] < offered) {
                unchecked {
                    ++cursor;
                }
            }
            if (cursor == count) break; // the draw has passed the caller's whole list
            if (namedRelicIds[cursor] != offered) {
                // An id the caller never named is at the head. Refuse it and stop; the
                // caller is told what it was, and a caller that had named it would have
                // been given it.
                blockedBy = offered;
                break;
            }
            // Compact the accepted ids to the front of `draw`, TAKEN FROM THE CALLER'S
            // OWN LIST. Everything forged below is a value read out of `namedRelicIds`.
            draw[awakened] = namedRelicIds[cursor];
            unchecked {
                ++cursor;
                ++awakened;
            }
        }

        if (awakened < minCount) {
            // `draw` shorter than `room` with every one of it accepted means the
            // collection itself ran out, not that anything was refused. Unreachable while
            // any holder is entitled to more (see {_drawIfNamed}).
            if (awakened == draw.length && draw.length < room) revert MaxSupplyReached();
            revert AwakeningShortfall(awakened, minCount, blockedBy);
        }

        ForgeWitness memory witness = _currentWitness();
        for (uint256 i; i < awakened; ++i) {
            // {_drawIfNamed} consumes the head ONLY if it equals the id passed in, and the
            // id passed in came out of `namedRelicIds`. That is the whole proof that this
            // -- the collection's only `_mint` -- can never materialise an unnamed
            // identity, and it does not depend on the match above being correct.
            (uint256 offered, bool taken) = _drawIfNamed(draw[i]);
            if (!taken) revert AwakeningShortfall(i, minCount, offered);
            _forge(msg.sender, offered, witness);
        }
        emit RelicsAwakened(msg.sender, awakened);
    }

    /// @notice Retire Relics OF YOUR OWN CHOOSING to dormancy, so that a large sale
    /// settles inside the automatic {SEND_BUDGET}.
    ///
    /// This is the only place an owner's Relics can be selected for dormancy by id,
    /// and it is `msg.sender`-only. An ERC-721 operator or per-token approval is
    /// DELIBERATELY NOT sufficient. Marketplace approvals are handed out to move
    /// Relics, not to destroy their liveness: an operator who could call this could
    /// pick a holder's rarest piece and retire it, gaining nothing and costing the
    /// holder the exact thing approvals were never meant to put at risk. The transfer
    /// authority an operator already has is strictly weaker -- it moves a Relic to a
    /// party who still owns it, with a Transfer event and a marketplace trail.
    ///
    /// Each id emits `Transfer(msg.sender, address(0), tokenId)`, clears that id's
    /// per-token approval (OpenZeppelin's `_burn` does it), preserves DNA, art,
    /// original minter, fingerprint, scars, lineage and evolve count, and returns the
    /// id to the dormancy pool where it reawakens unchanged.
    ///
    /// Fully atomic: a batch containing an id you do not own, or the same id twice,
    /// reverts in its entirety.
    function prepareSell(uint256[] calldata tokenIds) external returns (uint256 count) {
        count = tokenIds.length;
        if (count == 0) revert EmptyPreparation();
        if (count > PREPARE_SELL_MAX) revert PreparationBatchTooLarge(count, PREPARE_SELL_MAX);

        for (uint256 i; i < count; ++i) {
            uint256 tokenId = tokenIds[i];
            // A duplicate id fails here on its second appearance: the first burn set
            // the raw owner to zero.
            if (_ownerOf(tokenId) != msg.sender) revert NotRelicOwner(tokenId, msg.sender);
            _makeDormant(msg.sender, tokenId);
        }

        emit RelicsPrepared(msg.sender, count);
    }

    /// @notice Retire Relics stranded at an address the token layer PERMANENTLY
    /// EXCLUDES from the whole-unit sync layer, returning the ids to the dormancy pool
    /// with their identity intact.
    ///
    /// Permissionless and bounded, and it is neither of those by accident.
    ///
    /// An excluded address (`relicsToken.canReceiveRelic(owner) == false`) has a
    /// {IRelicsToken.relicEntitlement} of zero forever and can never be sent another
    /// Relic, so any Relic sitting there is unbacked liveness debt: the address's next
    /// $RELICS outflow carries a deficit equal to its ENTIRE Relic balance, and above
    /// {SEND_BUDGET} that outflow reverts. For the genesis LP locker -- whose
    /// `collectFees()` forwards its whole balance in one call and has no way to reach
    /// {prepareSell} -- that is the difference between an O(1) fee crank and a dead
    /// one. Anyone may therefore clear it, and clearing it takes nothing from anybody:
    /// an excluded address cannot spend, sell or transfer a Relic under any
    /// circumstance.
    ///
    /// The set of addresses this can ever touch is closed and tiny: `address(0)`,
    /// `relicSyncPool`, the deployer, `relicLocker` and the tomb. `relicSyncPool` is
    /// registered before any Relic can exist, the deployer and the tomb can never
    /// receive one, and `relicLocker` is the only member that can be registered after
    /// Relics are circulating -- which is exactly the case this exists for. See
    /// {IRelicsToken.setRelicLocker}.
    ///
    /// Reverts atomically on an id that is dormant, never forged, or held by an address
    /// that CAN receive Relics, so it can never be pointed at a real holder.
    function retireStranded(uint256[] calldata tokenIds) external returns (uint256 count) {
        count = tokenIds.length;
        if (count == 0) revert EmptyPreparation();
        if (count > PREPARE_SELL_MAX) revert PreparationBatchTooLarge(count, PREPARE_SELL_MAX);

        for (uint256 i; i < count; ++i) {
            uint256 tokenId = tokenIds[i];
            // A duplicate id fails here on its second appearance: the first burn set
            // the raw owner to zero, and `address(0)` can always receive nothing.
            address owner = _ownerOf(tokenId);
            if (owner == address(0) || relicsToken.canReceiveRelic(owner)) {
                revert NotStranded(tokenId, owner);
            }
            _makeDormant(owner, tokenId);
        }
    }

    // ==================================================================
    // evolution
    // ==================================================================

    /// @notice Permanently mutate YOUR OWN Relic's art. `msg.sender`-only, by exactly
    /// the argument {prepareSell} makes: an ERC-721 operator or per-token approval is
    /// DELIBERATELY NOT sufficient. Marketplace approvals are handed out to move
    /// Relics, not to rewrite them. Evolution is irreversible -- `scars`, `resonance`,
    /// `lineage` and `evolveCount` only ever accumulate -- so an approved venue that
    /// could call this could permanently alter the piece a collector bought, gaining
    /// nothing and destroying exactly the thing the approval was never meant to touch.
    /// The authority an operator does have is strictly weaker: it moves a Relic to a
    /// party who still owns it, with a `Transfer` event and a marketplace trail.
    function evolve(uint256 tokenId) external returns (uint256 newState) {
        address owner = _requireOwned(tokenId);
        if (msg.sender != owner) revert UnauthorizedEvolve();

        uint256 dna = _dna[tokenId];
        uint256 state = _packedState[tokenId];
        IRelicsHook.GlobalMarketState memory market = marketHook.getGlobalState();
        uint256 holders = relicsToken.activeHolderCount();

        uint32 nextScars = _cap32(
            EvolutionMath.scars(state) + EvolutionMath.scarIntensity(dna, state, market) / 8
        );
        uint32 nextResonance = _cap32(
            EvolutionMath.resonance(state)
                + EvolutionMath.mutationIntensity(dna, state, market, holders) / 6
        );
        uint16 nextEvolveCount = EvolutionMath.evolveCount(state) == type(uint16).max
            ? type(uint16).max
            : EvolutionMath.evolveCount(state) + 1;

        newState = _packState(
            EvolutionMath.mintBlock(state),
            EvolutionMath.transferCount(state),
            nextEvolveCount,
            nextScars,
            nextResonance,
            EvolutionMath.lineage(dna, state, market, holders),
            EvolutionMath.birthEpochFromState(state),
            uint32(block.number)
        );
        _packedState[tokenId] = newState;

        emit RelicTransmuted(tokenId, newState);
        emit MetadataUpdate(tokenId);
    }

    // ==================================================================
    // metadata
    // ==================================================================

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, IRelicsNFT)
        returns (string memory)
    {
        _requireOwned(tokenId);
        return renderer.tokenURI(tokenId, _dna[tokenId], _packedState[tokenId]);
    }

    function dnaOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _dna[tokenId];
    }

    function packedStateOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _packedState[tokenId];
    }

    function visualFingerprintOf(uint256 tokenId) external view returns (bytes32) {
        _requireOwned(tokenId);
        return _visualFingerprint[tokenId];
    }

    function originalMinterOf(uint256 tokenId) external view returns (address) {
        _requireOwned(tokenId);
        return _originalMinter[tokenId];
    }

    /// @notice Provenance of a DORMANT id, readable while `ownerOf` correctly reverts.
    /// Proves that dormancy preserves identity without pretending the Relic exists.
    function dormantIdentityOf(uint256 tokenId)
        external
        view
        returns (uint256 dna, uint256 packedState, address originalMinter, bytes32 fingerprint)
    {
        return (
            _dna[tokenId],
            _packedState[tokenId],
            _originalMinter[tokenId],
            _visualFingerprint[tokenId]
        );
    }

    // ==================================================================
    // ownership views -- OpenZeppelin's, unmodified
    // ==================================================================

    /// @dev Pure delegation. Present only because `IRelicsNFT` also declares it.
    function balanceOf(address owner) public view override(ERC721, IRelicsNFT) returns (uint256) {
        return super.balanceOf(owner);
    }

    /// @dev Pure delegation. Present only because `IRelicsNFT` also declares it.
    function ownerOf(uint256 tokenId) public view override(ERC721, IRelicsNFT) returns (address) {
        return super.ownerOf(tokenId);
    }

    /// @notice `sum over a of balanceOf(a)`, maintained inside {_update} alongside the
    /// per-owner balances themselves.
    function totalSupply() external view returns (uint256) {
        return _activeSupply;
    }

    /// @notice Ids in the dormancy pool, awaiting reawakening.
    function dormantSupply() external view returns (uint256) {
        return (_dormantIndex >> 64) & 0xffff;
    }

    /// @notice Word `word` of the dormancy bitmap: bit `b` is set exactly while the id
    /// `(word << 8) | b` is dormant. Published so the whole pool is enumerable off-chain
    /// without an array, and so the draw order is verifiable by anyone.
    function dormantBitmapWord(uint256 word) external view returns (uint256) {
        return _dormantBitmap[word];
    }

    /// @notice The id the next reawakening will draw, or `0` when the pool is empty and
    /// a virgin id would be cut instead.
    ///
    /// Deliberately public. The draw is the minimum of a set that is already visible in
    /// storage, so hiding it would buy nothing; publishing it lets a marketplace or a
    /// holder see exactly which id is exposed, and lets anyone verify that no sequence
    /// of {prepareSell} calls moved it.
    function nextDormantId() external view returns (uint256) {
        uint256 summary = _dormantIndex & type(uint64).max;
        if (summary == 0) return 0;
        uint256 word = _lowestSetBit(summary);
        unchecked {
            return (word << 8) | _lowestSetBit(_dormantBitmap[word]);
        }
    }

    /// @notice Distinct ids ever brought into existence.
    function forgedSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Enumerate `account`'s live Relics. Every index in
    /// `[0, balanceOf(account))` resolves through `ownerOf` to `account`.
    function relicOfOwnerByIndex(address account, uint256 index) external view returns (uint256) {
        return _ownedRelics[account][index];
    }

    /// @notice The enumeration index of a live `tokenId`.
    function relicIndexOf(uint256 tokenId) external view returns (uint256) {
        return _ownedRelicIndex[tokenId];
    }

    /// @notice Whole units the account backs but has not materialised. Alias of
    /// {latentRelicCapacity}, kept because it predates the name.
    function backlogOf(address account) external view returns (uint256) {
        return _latentCapacity(account);
    }

    /// @notice `floor(RELICS.balanceOf(account) / 1e18)` -- the maximum Relics this
    /// account may hold at this instant. Zero for the addresses the token layer
    /// permanently excludes (see {IRelicsToken.canReceiveRelic}).
    function wholeUnitCapacity(address account) external view returns (uint256) {
        return relicsToken.relicEntitlement(account);
    }

    /// @notice Relics the account holds right now. OpenZeppelin's stored balance.
    function activeRelicCount(address account) external view returns (uint256) {
        return super.balanceOf(account);
    }

    /// @notice `wholeUnitCapacity - activeRelicCount`: capacity acquired but not yet
    /// spent. It is created by inbound $RELICS and by {prepareSell}, it is spent only by
    /// {awaken}, and only its owner can spend it.
    function latentRelicCapacity(address account) external view returns (uint256) {
        return _latentCapacity(account);
    }

    /// @notice The exact ids the next `count` awakenings will materialise, in draw
    /// order: the lowest dormant ids first, then virgin ids. THE IDENTITY PREVIEW.
    ///
    /// This is what a front-end shows and what a caller names in {awaken}. It is
    /// caller-independent by construction -- the draw depends on the pool and on nothing
    /// else -- so two parties reading it in the same block see the same answer, and
    /// whichever of them lands first takes the head. The other is not handed a
    /// substitute: it keeps whichever of the ids it named are still drawable, down to its
    /// own floor, and is refused with {AwakeningShortfall} below it.
    ///
    /// Strictly ascending, which is the order {awaken} requires: every dormant id was
    /// forged and is therefore below every virgin id.
    ///
    /// Truncates rather than reverting if `count` exceeds what remains forgeable.
    function awakenPreview(uint256 count) public view returns (uint256[] memory ids) {
        ids = new uint256[](count);
        uint256 filled;
        uint256 summary = _dormantIndex & type(uint64).max;

        while (filled < count && summary != 0) {
            uint256 word = _lowestSetBit(summary);
            uint256 bits = _dormantBitmap[word];
            while (filled < count && bits != 0) {
                unchecked {
                    ids[filled++] = (word << 8) | _lowestSetBit(bits);
                    bits &= bits - 1;
                }
            }
            summary &= ~(uint256(1) << word);
        }

        uint256 virgin = _nextTokenId;
        while (filled < count && virgin <= MAX_SUPPLY) {
            unchecked {
                ids[filled++] = virgin++;
            }
        }
        if (filled != count) {
            assembly ("memory-safe") {
                mstore(ids, filled)
            }
        }
    }

    /// @notice The identity preview for `account`'s next {awaken} call: its whole latent
    /// capacity, clipped to one batch. Pass the result straight back to {awaken} with the
    /// floor the caller is willing to settle for -- `ids.length` for all-or-nothing, `1`
    /// to take whatever of it is still there. A caller that wants to be robust to another
    /// party pushing a LOWER id in front of it names those ids too; this view cannot see
    /// them, because they are not dormant yet.
    function nextAwakening(address account) external view returns (uint256[] memory ids) {
        uint256 latent = _latentCapacity(account);
        if (latent > AUTO_AWAKEN_CAP_PER_OWNER) latent = AUTO_AWAKEN_CAP_PER_OWNER;
        return awakenPreview(latent);
    }

    /// @notice The most recently acquired live Relic -- the first one the AUTOMATIC
    /// dormancy path would retire.
    function lastOwnedRelic(address owner) external view returns (uint256 tokenId) {
        uint256[] storage stack = _ownedRelics[owner];
        uint256 length = stack.length;
        if (length == 0) revert NoRelicsOwned(owner);
        return stack[length - 1];
    }

    /// @notice What `owner` must do before sending `relicsAmount` wei of $RELICS.
    /// `deficit` Relics will go dormant; `callsRequired` is how many {prepareSell}
    /// batches must precede the transfer for it not to revert. Both zero means the
    /// transfer performs no ERC-721 work at all.
    ///
    /// Pure view, no side effects, safe for wallets and routers to call before quoting.
    function preparationFor(
        address owner,
        uint256 relicsAmount
    )
        external
        view
        returns (uint256 deficit, uint256 callsRequired)
    {
        uint256 active = super.balanceOf(owner);
        if (active == 0) return (0, 0);
        uint256 balance = relicsToken.balanceOf(owner);
        uint256 remaining = balance > relicsAmount ? balance - relicsAmount : 0;
        uint256 entitlement =
            relicsToken.canReceiveRelic(owner) ? remaining / relicsToken.UNIT_PER_RELIC() : 0;
        if (active <= entitlement) return (0, 0);
        unchecked {
            deficit = active - entitlement;
        }
        callsRequired =
            deficit > SEND_BUDGET ? _ceilDiv(deficit - SEND_BUDGET, PREPARE_SELL_MAX) : 0;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0x49064906 || super.supportsInterface(interfaceId);
    }

    // ==================================================================
    // operator authority -- the per-token dormancy seal
    // ==================================================================

    /// @notice Whether `spender` may move `tokenId` RIGHT NOW. This is the exact
    /// predicate the transfer path enforces, so a marketplace or wallet that checks it
    /// before signing an order learns the truth that `isApprovedForAll` alone cannot
    /// tell it: whether a collection-wide approval still reaches THIS Relic.
    ///
    /// Returns false for a dormant or never-forged id rather than reverting, so it is
    /// safe to call speculatively.
    function isAuthorizedForRelic(address spender, uint256 tokenId) external view returns (bool) {
        return _isAuthorized(_ownerOf(tokenId), spender, tokenId);
    }

    /// @dev THE FIX for permissionless stale-order reactivation across dormancy.
    ///
    /// A Relic goes dormant with a real `_burn`, which clears its per-token approval,
    /// and reawakens under the SAME id. Collection-wide operator approvals are stored
    /// per `(owner, operator)` and no burn touches them, so before this seal an
    /// operator approval granted months earlier still authorised the reawakened id --
    /// and because inbound $RELICS reawakens Relics, ANY third party could push one
    /// whole unit at a lister to force a listed id back into their hands and fill their
    /// pre-dormancy order in the same transaction, without the lister ever acting.
    ///
    /// The operator branch therefore additionally requires that the grant strictly
    /// postdate the last seal event for THIS `(tokenId, owner)` pair. It FAILS CLOSED:
    /// authority is withheld unless the owner deliberately grants it again while
    /// holding the Relic.
    ///
    /// The pair key is the whole point. A seal keyed on the id alone was undone by the
    /// re-approval it forced: every id an active trader bought carried a fresh global
    /// stamp, so trading at all required a re-grant, and one re-grant re-armed every
    /// abandoned order the trader had ever signed. Keyed on the pair, an id sealed
    /// under its previous owner is unsealed for its next one, so the ordinary buyer
    /// never re-approves and the abandoned order stays unreachable.
    ///
    /// `isApprovedForAll` is deliberately NOT changed -- it remains the honest
    /// collection-level boolean the ERC-721 standard defines. Per-token divergence from
    /// a collection-level approval is already part of ERC-721 (`getApproved`), and
    /// {isAuthorizedForRelic} publishes the per-token truth.
    function _operatorAuthorized(
        address owner,
        address operator,
        uint256 tokenId
    )
        private
        view
        returns (bool)
    {
        return isApprovedForAll(owner, operator)
            && operatorApprovalEpoch[owner][operator] > ownerTokenSeal[tokenId][owner];
    }

    /// @dev The owner branch and the per-token `approve()` branch are OpenZeppelin's,
    /// untouched: per-token approvals are already cleared by `_burn` and cannot survive
    /// dormancy. Only the operator branch carries the seal.
    function _isAuthorized(
        address owner,
        address spender,
        uint256 tokenId
    )
        internal
        view
        override
        returns (bool)
    {
        if (spender == address(0)) return false;
        if (owner == spender || _getApproved(tokenId) == spender) return true;
        return _operatorAuthorized(owner, spender, tokenId);
    }

    /// @dev Stamp the grant with the current epoch, so {_operatorAuthorized} can order
    /// it against every dormancy. Revocation clears the stamp, so a later re-grant is
    /// never mistaken for the revoked one.
    function _setApprovalForAll(address owner, address operator, bool approved) internal override {
        super._setApprovalForAll(owner, operator, approved);
        unchecked {
            operatorApprovalEpoch[owner][operator] = approved ? dormancyEpoch + 1 : 0;
        }
    }

    /// @dev Close the elevation path around the seal. OpenZeppelin's `_approve`
    /// authorises the approver with a bare `isApprovedForAll`, NOT with
    /// {_isAuthorized}, so without this override a sealed operator could mint itself a
    /// per-token approval and move the very Relic the seal withheld. The seal has to
    /// gate the granting of authority as well as its use, or it gates nothing.
    ///
    /// Everything else is OpenZeppelin's: `auth == address(0)` (the internal
    /// approval-clearing call inside every `_update`) still reads and writes nothing
    /// extra, and the owner still approves whomever they like.
    function _approve(address to, uint256 tokenId, address auth, bool emitEvent) internal override {
        if (auth != address(0)) {
            address owner = _requireOwned(tokenId);
            if (owner != auth && !_operatorAuthorized(owner, auth, tokenId)) {
                revert ERC721InvalidApprover(auth);
            }
        }
        super._approve(to, tokenId, auth, emitEvent);
    }

    // ==================================================================
    // the single ownership writer
    // ==================================================================

    /// @dev `_ownerOf` is deliberately NOT overridden and neither are `balanceOf`,
    /// `ownerOf`, `_getApproved`, `getApproved` or `isApprovedForAll`. OpenZeppelin's
    /// approval-clearing and duplicate-owner checks run unmodified, and so does its
    /// authorization check apart from the one strictly-narrowing operator condition in
    /// {_operatorAuthorized} -- which can only ever REFUSE a transfer OpenZeppelin
    /// would have allowed, never allow one it would have refused.
    ///
    /// Every ownership transition in this contract funnels through here, and
    /// `super._update` emits `Transfer` on every one of them, so:
    ///   - no ownership transition exists without a `Transfer`;
    ///   - no `Transfer` exists without the corresponding state transition;
    ///   - `_activeSupply` and `_ownedRelics` are updated in the same frame as
    ///     `_balances` and `_owners` and cannot lag them.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    )
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);

        if (from == address(0)) {
            unchecked {
                ++_activeSupply;
            }
        } else {
            _removeOwnedRelic(from, tokenId);
        }

        if (to == address(0)) {
            unchecked {
                --_activeSupply;
            }
        }

        // A hand-moved Relic carries its backing with it: exactly one whole $RELICS
        // unit moves from the sender to the receiver in the same frame. That is what
        // makes a direct ERC-721 transfer incapable of leaving EITHER side off its
        // backing line, and it is why `canReceiveRelic` (which rejects the pool, the
        // locker, the deployer and the tomb) is the donation guard.
        if (from != address(0) && to != address(0) && from != to) {
            uint256 state = _packedState[tokenId];
            uint32 nextCount = EvolutionMath.transferCount(state) == type(uint32).max
                ? type(uint32).max
                : EvolutionMath.transferCount(state) + 1;
            _packedState[tokenId] =
                (state & ~(uint256(type(uint32).max) << 64)) | (uint256(nextCount) << 64);
            emit MetadataUpdate(tokenId);
            relicsToken.transferRelicToken(from, to);
        }

        if (to != address(0)) {
            // SEAL EVENT 2 -- RE-SEAL ON RE-ACQUISITION. A Relic arriving at an owner
            // who has previously lost it is stamped again, so an operator grant made
            // between the loss and the return does not reach it. This is what makes
            // the seal hold against a third party rather than only against an idle
            // market: the attacker's own delivery of the listed id -- by unit push
            // (mint) or by hand (transfer), atomic or not -- is itself the act that
            // re-seals it, so an abandoned order cannot be filled by anyone who is not
            // the owner acting deliberately afterwards.
            //
            // An id the receiver has NEVER lost carries no stamp and is not touched,
            // which is precisely why an ordinary buyer's standing marketplace approval
            // keeps working on everything they buy.
            if (from != to && ownerTokenSeal[tokenId][to] != 0) {
                unchecked {
                    ownerTokenSeal[tokenId][to] = ++dormancyEpoch;
                }
            }
            _addOwnedRelic(to, tokenId);
            // THE BACKING LINE, re-derived from live token state after every single
            // inbound transition -- mint, hand-transfer, marketplace fill, reentrant
            // frame, anything. Enforced by revert, so an over-backed account is
            // UNREACHABLE rather than merely unreached, and no ERC-721 is ever
            // invalidated to make the arithmetic work.
            uint256 active = super.balanceOf(to);
            uint256 entitlement = relicsToken.relicEntitlement(to);
            if (active > entitlement) revert BackingLineExceeded(to, active, entitlement);
        }
    }

    // ==================================================================
    // sync internals
    // ==================================================================

    /// @dev Bring `from` back onto its backing line with real burn events, or revert.
    function _settleOutflow(address from) private {
        if (from == address(0)) return;
        uint256 active = super.balanceOf(from);
        if (active == 0) return;

        uint256 entitlement = relicsToken.relicEntitlement(from);
        if (active <= entitlement) return; // deficit == 0: no ERC-721 work at all.

        uint256 deficit;
        unchecked {
            deficit = active - entitlement;
        }
        if (deficit > SEND_BUDGET) {
            revert PreparationRequired(
                deficit, SEND_BUDGET, _ceilDiv(deficit - SEND_BUDGET, PREPARE_SELL_MAX)
            );
        }

        uint256[] storage stack = _ownedRelics[from];
        for (uint256 i; i < deficit; ++i) {
            // LIFO: the most recently acquired Relic retires first, so an owner's
            // earliest pieces survive longest. An owner who wants a different order
            // calls {prepareSell} first and arrives here with a zero deficit.
            _makeDormant(from, stack[stack.length - 1]);
        }
    }

    // ==================================================================
    // core primitives
    // ==================================================================

    function _latentCapacity(address account) private view returns (uint256) {
        uint256 entitlement = relicsToken.relicEntitlement(account);
        uint256 active = super.balanceOf(account);
        unchecked {
            return entitlement > active ? entitlement - active : 0;
        }
    }

    /// @dev Retire ONE live Relic to dormancy. `_burn` clears the per-token approval,
    /// emits `Transfer(owner, address(0), tokenId)` and removes the id from the
    /// owner's enumeration through {_update}. Identity storage is untouched, so the id
    /// reawakens as the same Relic with the same DNA, art, provenance and history.
    ///
    /// SEAL EVENT 1 -- THE DORMANCY SEAL. Retiring an id stamps the next epoch against
    /// THE OWNER WHO IS LOSING IT. Operator authority that owner granted before the
    /// stamp no longer reaches this id (see {_operatorAuthorized}), so a marketplace
    /// order they signed before dormancy cannot be filled against the reawakened Relic.
    /// The stamp is against them alone: the next holder of the same id starts unsealed
    /// and their standing approvals work normally. `unchecked` is safe by inspection:
    /// the counter is `uint64` and the collection would have to record 1.8e19 seal
    /// events to reach it.
    function _makeDormant(address owner, uint256 tokenId) private {
        unchecked {
            ownerTokenSeal[tokenId][owner] = ++dormancyEpoch;
        }
        _burn(tokenId);
        _addDormant(tokenId);
        emit RelicDormant(tokenId, owner);
        emit MetadataUpdate(tokenId);
    }

    /// @dev Put `tokenId` into the dormancy set. Idempotent-safe by construction rather
    /// than by check: the only caller is {_makeDormant}, which has already burned the id,
    /// and a burn of an id that is already dormant is impossible (`_ownerOf` is zero).
    /// Setting a bit that is already set would corrupt the count, so the assumption is
    /// stated here and enforced by the burn.
    function _addDormant(uint256 tokenId) private {
        uint256 word = tokenId >> 8;
        uint256 bits = _dormantBitmap[word];
        unchecked {
            _dormantBitmap[word] = bits | (1 << (tokenId & 0xff));
            uint256 index = _dormantIndex;
            if (bits == 0) index |= (1 << word);
            // +1 in the count field (bits 64..79). Bounded by MAX_SUPPLY, so it can
            // neither overflow the field nor disturb the summary below it.
            _dormantIndex = index + (1 << 64);
        }
    }

    /// @dev THE DRAW, GUARDED BY THE CALLER'S OWN LIST. Report the id the canonical
    /// lowest-id-first ordering offers right now, and CONSUME IT ONLY IF IT EQUALS
    /// `named`.
    ///
    /// The lowest dormant id first, then virgin ids. `offered == 0` means neither is
    /// available: id 0 is never forged, so word 0 bit 0 is never set and `_nextTokenId`
    /// starts at 1, which makes the zero unambiguous in both halves.
    ///
    /// THE DRAW IS NOT SELECTABLE, BY ANYONE. It is the minimum of the dormant set, so it
    /// depends on WHICH ids are dormant and on nothing else -- not on who is calling, not
    /// on the order they were retired in, not on anything anyone can arrange. `named`
    /// cannot steer it: it is a veto, never a choice. A caller who names an id the draw is
    /// not offering is refused and told what was offered; it is never given the offer.
    /// Obtaining a chosen id therefore still costs one whole $RELICS of live backing for
    /// that id AND for every dormant id below it, all held at once, BY THE PARTY WHO
    /// RECEIVES IT. See the contract natspec.
    ///
    /// THIS IS THE SOLE PROOF OBLIGATION BEHIND "{awaken} never materialises an identity
    /// its caller did not name": the two `_dormantIndex`/`_nextTokenId` writes below are
    /// the only way an id leaves the drawable set, both sit strictly after
    /// `offered != named` has returned, and `taken == true` is returned only on those two
    /// paths. {awaken} forges only when `taken` is true, and forges `offered`.
    ///
    /// Exhaustion is in fact unreachable: every forged id is either live or dormant,
    /// `sum over a of balanceOf(a) <= sum over a of floor(bal(a)/1e18) <= 10,000`, and a
    /// virgin id is only cut when the dormancy pool is empty -- so `_nextTokenId` can
    /// never pass {MAX_SUPPLY} while a holder is entitled to more. The zero return is kept
    /// as a belt on top of that proof, never as the mechanism.
    ///
    /// Two SLOADs and at most two SSTOREs regardless of pool depth: the summary word
    /// locates the first non-empty bitmap word, and the bitmap word locates the id. No
    /// scan, no length slot, and -- the point of the whole construction -- no insertion
    /// order for anyone to arrange.
    /// @return offered The id the draw is presenting, or 0 when nothing is drawable.
    /// @return taken True exactly when `offered == named` and the id was removed.
    function _drawIfNamed(uint256 named) private returns (uint256 offered, bool taken) {
        uint256 index = _dormantIndex;
        uint256 summary = index & type(uint64).max;

        if (summary != 0) {
            uint256 word = _lowestSetBit(summary);
            uint256 bits = _dormantBitmap[word];
            unchecked {
                offered = (word << 8) | _lowestSetBit(bits);
            }
            if (offered != named) return (offered, false);
            unchecked {
                bits &= bits - 1; // clear the lowest set bit
                _dormantBitmap[word] = bits;
                if (bits == 0) index &= ~(uint256(1) << word);
                _dormantIndex = index - (1 << 64);
            }
            return (offered, true);
        }

        uint256 virgin = _nextTokenId;
        if (virgin > MAX_SUPPLY) return (0, false);
        if (virgin != named) return (virgin, false);
        unchecked {
            _nextTokenId = virgin + 1;
        }
        return (virgin, true);
    }

    /// @dev Index of the least significant set bit. Callers guarantee `x != 0`.
    function _lowestSetBit(uint256 x) private pure returns (uint256 r) {
        unchecked {
            x &= ~x + 1; // isolate the lowest set bit
            if (x & 0xffffffffffffffffffffffffffffffff == 0) {
                r += 128;
                x >>= 128;
            }
            if (x & 0xffffffffffffffff == 0) {
                r += 64;
                x >>= 64;
            }
            if (x & 0xffffffff == 0) {
                r += 32;
                x >>= 32;
            }
            if (x & 0xffff == 0) {
                r += 16;
                x >>= 16;
            }
            if (x & 0xff == 0) {
                r += 8;
                x >>= 8;
            }
            if (x & 0xf == 0) {
                r += 4;
                x >>= 4;
            }
            if (x & 0x3 == 0) {
                r += 2;
                x >>= 2;
            }
            if (x & 0x1 == 0) r += 1;
        }
    }

    function _removeOwnedRelic(address owner, uint256 tokenId) private {
        uint256[] storage stack = _ownedRelics[owner];
        uint256 index = _ownedRelicIndex[tokenId];
        uint256 last = stack.length - 1;
        if (index != last) {
            uint256 moved = stack[last];
            stack[index] = moved;
            _ownedRelicIndex[moved] = index;
        }
        stack.pop();
        delete _ownedRelicIndex[tokenId];
    }

    function _addOwnedRelic(address owner, uint256 tokenId) private {
        uint256[] storage stack = _ownedRelics[owner];
        _ownedRelicIndex[tokenId] = stack.length;
        stack.push(tokenId);
    }

    function _currentWitness() private view returns (ForgeWitness memory witness) {
        witness.market = marketHook.getGlobalState();
        witness.holders = relicsToken.activeHolderCount();
        witness.entropy = block.number > 0 ? blockhash(block.number - 1) : bytes32(0);
        witness.mintBlock = uint64(block.number);
    }

    /// @dev Materialise `tokenId` for `to`. THE ONLY `_mint` IN THE CONTRACT, and it has
    /// exactly one caller: {awaken}, where `to` is `msg.sender`.
    ///
    /// `_mint`, never `_safeMint`: an `onERC721Received` callback here would be a revert
    /// oracle and a reentrancy surface, and the receiver is the caller in any case, so
    /// the acceptance check the callback performs is already answered by the call.
    function _forge(address to, uint256 tokenId, ForgeWitness memory witness) private {
        if (_dna[tokenId] == 0) {
            uint256 dna;
            bytes32 fingerprint;
            for (uint256 attempt; attempt < 8; ++attempt) {
                dna = DNA.generate(
                    tokenId,
                    to,
                    witness.market.marketSeed,
                    witness.market.epoch,
                    keccak256(abi.encode(witness.entropy, tokenId, to, attempt))
                );
                fingerprint = VisualIdentity.fingerprint(dna, witness.market, witness.holders);
                if (!_usedVisualFingerprints[fingerprint]) break;
            }
            _usedVisualFingerprints[fingerprint] = true;
            uint256 state = _packState(
                witness.mintBlock,
                0,
                0,
                0,
                uint32(EvolutionMath.mutationIntensity(dna, 0, witness.market, witness.holders)),
                EvolutionMath.lineage(dna, 0, witness.market, witness.holders),
                uint16(witness.market.epoch),
                0
            );

            _dna[tokenId] = dna;
            _packedState[tokenId] = state;
            _originalMinter[tokenId] = to;
            _visualFingerprint[tokenId] = fingerprint;

            emit RelicForged(tokenId, to, dna);
        } else {
            emit RelicReawakened(tokenId, to);
        }

        _mint(to, tokenId);
        emit MetadataUpdate(tokenId);
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        unchecked {
            return a == 0 ? 0 : (a - 1) / b + 1;
        }
    }

    // Packed state layout:
    // bits 0..63 mintBlock, 64..95 transferCount, 96..111 evolveCount,
    // 112..143 scars, 144..175 resonance, 176..207 lineage,
    // 208..223 birthEpoch, 224..255 lastEvolveBlock.
    function _packState(
        uint64 mintBlock_,
        uint32 transferCount_,
        uint16 evolveCount_,
        uint32 scars_,
        uint32 resonance_,
        uint32 lineage_,
        uint16 birthEpoch_,
        uint32 lastEvolveBlock_
    )
        private
        pure
        returns (uint256 state)
    {
        state = uint256(mintBlock_);
        state |= uint256(transferCount_) << 64;
        state |= uint256(evolveCount_) << 96;
        state |= uint256(scars_) << 112;
        state |= uint256(resonance_) << 144;
        state |= uint256(lineage_) << 176;
        state |= uint256(birthEpoch_) << 208;
        state |= uint256(lastEvolveBlock_) << 224;
    }

    function _cap32(uint256 value) private pure returns (uint32) {
        return value > type(uint32).max ? type(uint32).max : uint32(value);
    }
}
