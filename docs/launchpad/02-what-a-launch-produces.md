# 02 — What a launch produces

> Not deployed on any chain yet. Internal review only — no external audit.
> See [08 — Status and limitations](08-status.md).

One call to `ILaunchpadFactory.launch(LaunchParams)` is atomic. Either the whole project exists at
the end of it, or nothing does — there is no half-launched state with a token but no pool, or a
pool but no liquidity.

## What comes out

`launch()` returns a `LaunchResult`:

```solidity
struct LaunchResult {
    address projectToken;      // your fixed-supply ERC-20
    address projectCollection; // your ERC-721
    address artHook;           // your Uniswap v4 hook, at a 0x1440-encoded address
    uint256 projectId;         // key into ProjectRights, the registry, and the fee locker
    PoolKey poolKey;           // currency0, currency1, fee, tickSpacing, hooks
    PoolId  poolId;
    uint128 genesisLiquidity;  // the position minted in this same call
}
```

Inside that one transaction, the factory does all of the following (read the source for the exact
ordering):

- Stores your art script or template configuration on chain.
- Deploys your **project token** (ERC-20) at a CREATE2 address whose sort order against WETH is
  what you mined for, minting the whole supply to the fee locker.
- Deploys your **art hook** at an address whose low bits encode the `0x1440` permission mask, and
  **binds** it to your pool key and market-state config — one-shot, factory-only.
- Deploys your **project collection** (ERC-721).
- Mints your **ProjectRights** position to `creatorRecipient`, deploying a collaborator splitter
  first if you named any.
- Initializes the canonical **project-token / WETH pool** at a price derived from your starting
  preset. The binding must happen before initialization; an unbound hook rejects it.
- Registers the immutable **fee-routing policy** (the 75/25 split plus any collaborator
  sub-splits).
- Mints the **genesis liquidity** directly against the PoolManager, single-sided, with **zero
  seeded WETH**, held by the shared fee locker. There is no PositionManager NFT.
- Publishes the **ProjectRegistry** record and leaves the pool tradeable.

## What you supply

```solidity
struct LaunchParams {
    string   name;
    string   symbol;
    uint256  totalSupply;          // whole tokens * 1e18
    uint256  artworkBackingUnits;  // whole units reserved as artwork backing == max active artworks
    StartingPreset startingPreset; // LOW | MID | HIGH
    bytes32  tokenSalt;            // CREATE2 salt: sets sort order vs WETH
    bytes32  hookSalt;             // CREATE2 salt: must land on the 0x1440 mask
    ArtMode  artMode;              // SOLIDITY_SVG | JAVASCRIPT
    uint256  artTemplateId;        // registered template id for SOLIDITY_SVG, 0 for JS
    bytes32  artScriptHash;        // keccak of the reconstructed script bytes
    bytes    artConfig;            // template config, or the JS script manifest
    bytes    marketStateConfig;    // your bounded sensor -> transform -> art-parameter graph
    address  creatorRecipient;     // ProjectRights holder + payout destination
    Collaborator[] collaborators;  // sub-splits of the creator 75% (may be empty)
}
```

Note what is **not** in there: no tick, no `sqrtPriceX96`, no liquidity amount, no fee tier, no
beneficiary list, no token ordering. The factory computes all of those. `startingPreset` is the
only raw pricing input a creator supplies — you choose a tier, not a number.

The two salts are mined **off chain** before you submit, because both addresses have to satisfy
constraints: the token address must sort correctly against WETH, and the hook address must carry
the permission flags in its low 14 bits. The SDK mines both.

## The token ↔ artwork relationship

Launchpad projects use an **explicit escrow** model. This is deliberately *not* the balance-coupled
dormancy model the flagship RELICS collection uses — the contracts say so in their own headers, and
it matters if you are porting expectations across.

- `artworkBackingUnits` is the maximum number of artworks that can be live at once, and each live
  artwork is backed by whole project tokens held **in escrow by the collection contract**.
- **Receiving the token mints nothing.** No transfer, and no swap output, does any ERC-721 work.
- `awaken(count)` pulls the backing tokens *in* and mints you that many ERC-721s. The transfer
  happens before the mint, so an artwork can never exist unbacked.
- `redeem(id)` / `redeemMany(ids)` burn the artwork and release exactly its backing tokens back to
  you. Batches are capped at 32 for both.
- The **identity** survives. A redeemed id returns to a dormant pool keeping its immutable DNA, its
  birth block, and an incrementing awaken count, and comes back unchanged when it is drawn again.
  `dnaOf(id)`, `historyOf(id)`, `dormantCount()` and `isFullyBacked()` are public reads.
- The ERC-20 has **no burn path** and no transfer hooks. Escrow moves tokens; it never destroys
  them.

This is **not** ERC-404 or DN-404 and not a wrapper. Both contracts are ordinary standards; the
relationship between them is explicit calls you make, not hidden transfer hooks.

For an instant launch, one whole token backs one artwork. Sale-mode launches can set a higher
backing ratio, which is how a billion-supply token can still have a collection of a few thousand.

## Launch modes

`launch()` is the instant path. Two staged paths exist for projects that want a primary sale before
the market opens:

| Mode | Flow | What it does |
| --- | --- | --- |
| `InstantV4` | one call: `launch()` | Whole supply becomes canonical liquidity immediately; the pool is tradeable at the end of the transaction |
| `FixedPriceSaleToV4` | `launchSale()` then `finalizeSale()` | Buyers purchase at a flat price per token during a window, then the remainder graduates into the pool |
| `BondingCurveSaleToV4` | `launchSale()` then `finalizeSale()` | Same, priced along a fixed audited curve preset (linear or constant-product-like) |

All three end in the same canonical pool with the same 1% fee, the same hook, and the same
economics. `finalizeSale()` is permissionless — anyone can trigger graduation once the terms are
met, so a creator who disappears cannot strand a completed sale.

Things to know before choosing a sale mode:

- **There is no sell-back before graduation.** A buyer's only exits are claiming tokens after a
  successful sale, or a full refund if the sale fails its minimum raise by the deadline. This is a
  deliberate design decision, not an oversight — disclose it plainly to your buyers.
- **Sale-phase purchases are not art history.** Your artwork's market state begins at pool
  initialization; presale activity is a pre-market event and the hook never sees it.
- **There is no platform fee on sale-phase purchases.**
- **A creator token allocation is capped at zero today.** The field exists in the supply config and
  the capability does not. Do not plan around it or advertise it.

## Supply rules

- Decimals are fixed at 18 and `totalSupply` must be an exact multiple of `1e18`.
- `artworkBackingUnits * 1e18` must not exceed `totalSupply`.
- Supply has a measured upper bound derived from Uniswap v4's per-tick liquidity cap at tick
  spacing 60, and the bound is tightest on the `HIGH` preset. The staged sale path checks this
  before taking buyer money; the instant path lets an over-supplied launch revert atomically, with
  nothing at risk but gas.
- Name and symbol have **no on-chain validation** — no length limit, no charset rule, no
  uniqueness. They are CREATE2 constructor arguments, so changing either after mining invalidates
  your `tokenSalt`.

## The hook

Your hook is a Uniswap v4 hook with the permission mask `0x1440`:

```
AFTER_INITIALIZE (0x1000) | AFTER_ADD_LIQUIDITY (0x400) | AFTER_SWAP (0x40) = 0x1440
```

Only "after" callbacks. There is no `beforeSwap`, no `afterRemoveLiquidity`, no donate or
return-delta permission — the constructor verifies its own address against the mask and refuses to
deploy otherwise, and every unused callback reverts unconditionally. That shape is the point: the
hook **observes** and records, and structurally cannot tax a trade, block a trade, or change its
price. Because `beforeSwap` always reverts, there is no dynamic-fee override path at all, which is
what makes "the LP fee is static 1%" a structural fact rather than a promise.

What it records, all O(1):

| Read | Meaning |
| --- | --- |
| `organicSwapCount()` | Number of organic swaps |
| `organicBuyVolume()` | Cumulative WETH in on buys |
| `organicSellVolume()` | Cumulative WETH out on sells |
| `organicNetFlow()` | Buys minus sells, in WETH terms |

"Organic" is load-bearing: the protocol's own fee-conversion swaps are excluded by sender, not by a
flag in call data that anyone could forge. The hook also keeps a small tick-cumulative oracle used
for fee conversion, which fails closed rather than falling back to spot price.

The hook also **refuses liquidity from anyone but the locker**. External LPs cannot add to your
pool position; `afterAddLiquidity` reverts for any other sender.

The v4 flag semantics are identical on every chain, so the mask is the same everywhere. The mined
hook *address* is per chain and per release, because the hook's init code embeds that chain's
factory, PoolManager, and locker references.

## ProjectRights — what the creator actually holds

You do not receive the liquidity position. You receive a **ProjectRights** ERC-721 whose token id
is your `projectId`, minted to `creatorRecipient`. Understand it precisely, because it is the most
transferable and most misunderstood thing a launch produces.

**It carries:** all unclaimed and all future creator fee revenue, the payout-recipient override,
and (through the metadata registry) control of the project's profile.

**It does not carry:** the LP fee tier, the platform share, the liquidity, the hook, the pool, the
art bytes, the total supply, or any escrow authority in a sale.

**Transferring it transfers the money.** The locker resolves the payout recipient live at claim
time, so the moment the rights token moves, every unclaimed and future creator fee follows it.
Already-claimed revenue does not. The contract carries this warning on chain as
`TRANSFER_WARNING()`, and any interface that offers a transfer should read that string live and
show it rather than hardcoding a paraphrase.

**It cannot be burned.** Transfers to the zero address revert on every path, and no burn function
exists — a rights token cannot be destroyed and orphan a project's revenue.

`setPayoutRecipient(projectId, recipient)` is rights-owner-only and lets you send payouts somewhere
other than the token holder; `address(0)` means "follow the owner". Note that the override
deliberately persists across transfers, which is how a collaborator splitter stays attached when
the rights token changes hands.

If you named collaborators at launch, the factory deploys an immutable `Splitter`, sets it as the
payout recipient, and hands you the rights token — so creator revenue lands in the splitter and
anyone can release it to the named shares.

## Preview before you sign

```solidity
function predict(LaunchParams calldata params, address creator)
    external view
    returns (address projectToken, address projectCollection, address artHook, PoolId poolId);
```

`predict` is deterministic and side-effect free, so a front end can show the exact addresses a
parameter set will produce before anyone spends gas. The launch review screen is built on it. It is
the canonical prediction — the SDK's pure off-chain address math exists as a cross-check, not as a
substitute.
