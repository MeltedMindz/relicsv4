# 06 — Fees and revenue

> RC5 platform contracts are deployed on Ethereum, Base and Robinhood Chain, but public creator
> launches are still closed (`PREPARED`). Internal review only — no external audit.
> See [08 — Status and limitations](08-status.md).

This page states the fee mechanics precisely, because vague fee language is how creators get
surprised. Every number here is a compile-time constant in the launchpad contracts, not a policy
someone can change by calling a setter on the shipped deployment.

## The pool fee

Every launched project trades on one canonical Uniswap v4 pool with a **static 1.00% LP fee**
(`POOL_FEE_PIPS = 10_000`). It is not dynamic; the hook has no fee-override path. You do not pick
the tier.

Separately, Uniswap governance can enable a **protocol fee** on any v4 pool through the
PoolManager's `protocolFeeController`. That is Uniswap's mechanism, not the launchpad's: the
protocol cannot enable it, disable it, or receive it. When one is live, v4 does not simply add the
two fees — it compounds them:

```
swapFee = protocolFee + lpFee - floor(protocolFee * lpFee / 1_000_000)
```

So a trader's total effective fee is a function of live pool state, and any honest UI should read
it rather than printing "1%". The launchpad ships `FeeModel` for exactly this: it reads the live
`Slot0` and reproduces the formula for both swap directions.

## The split of collected LP fees

LP fees that the genesis position actually earns are split:

| Share | Bps | Goes to |
| --- | --- | --- |
| Creator | `7_500` (75%) | You — claimable from the locker |
| Platform | `2_500` (25%) | The protocol |

Two precision points that matter:

1. **The split applies to fees actually collected**, computed from the position's realized
   `BalanceDelta` — never from raw trade volume, never from token balances the locker happens to
   hold. Tokens donated to the locker do not enter the split.
2. **75% of volume is not your revenue.** 75% of *collected LP fees* is. If Uniswap governance
   enables a protocol fee on your pool, the protocol fee is taken from the swap input before LP fee
   growth accrues, so the absolute fees your position earns per unit of volume fall — while the
   75/25 split of whatever *is* collected stays exactly the same.

Say: *"75% of collected LP fees."* Do not say: *"0.75% of all volume, forever."*

## Collaborator sub-splits

`LaunchParams.collaborators` is an array of `{address recipient, uint16 bps}`. Those bps are a
fraction of **the creator's 75% only** — they can never reach the platform share — and they must
sum to at most `10_000` of the creator share. Set them at launch; they are part of the immutable
fee policy the locker registers.

## Inside the platform's 25%

The platform share subdivides at a rate fixed in `ImmutableEconomicKernel` (and, for multi-quote
markets, in `MultiQuoteEconomicKernel`) as a compile-time constant with no setter,
`RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE`. Read its value from the contract, or from
`@relics/project-schema`, which mirrors it as the single off-chain declaration:

```js
import { RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE, NOMINAL_ALLOCATION_PERCENT } from "@relics/project-schema";
```

It currently resolves to:

| Slice | Share of the platform 25% | Nominal share of all collected LP fees |
| --- | --- | --- |
| $RELICS buy-and-entomb reserve | 50% | **12.50%** |
| Retained by the protocol Safe | 50% | **12.50%** |

The technical statement is: **50% of the launchpad's net platform-fee revenue is allocated to
$RELICS buy-and-entomb.** Read that phrase literally. It is *not* 50% of all trading fees, not 50%
of creator fees, not 50% of the pool fee, and not a Uniswap protocol fee.

The buyback slice is carved only from platform revenue. It never reads or touches a creator or
collaborator ledger, and the creator's 75% is untouched by this subdivision — it was 75% when the
platform split its own share 25/75, and it is 75% now.

### Which asset the platform is paid in

The platform's 25% is denominated in the market's **selected quote**, and the 50/50 divides it
there — not in WETH. WETH is the special case, not the definition.

```
platform 25% entitlement, in the SELECTED QUOTE
├─ 50% retained treasury → claimable IN THE QUOTE ASSET, immediately
└─ 50% $RELICS buyback   → QUOTE-denominated; becomes WETH only when an approved
                            route exists. Retryable. Never called settled until
                            WETH is actually received.
```

So on a `PROJECT/USDG` market the protocol Safe claims USDG and the buyback reserve holds USDG
waiting for a route; on a `PROJECT/WETH` market both halves are WETH the moment the split happens,
because there is nothing left to convert.

Two things this does **not** change:

- **The platform still takes no direct claim in your project token.** That share converts into the
  selected quote first, exactly as before.
- **The buyback still ends in WETH.** It just gets there later — or, for now, not yet.

### Allocated is not settled

The 12.50% figures above are **nominal**: ratios applied to collected LP fees. A buyback half
sitting in USDG is *allocated*, not *settled*. The claim "50% of net platform revenue is allocated
to $RELICS buy-and-entomb" is only honest while what is pending is visibly pending, so the SDK and
the indexer keep the quote-denominated reserve in a field of its own
(`platformBuybackReserveQuote`, carrying the asset and its decimals) and leave the WETH field empty
until WETH arrives. "Waiting for a route" is a normal state with its own status
(`BUYBACK_ALLOCATED_AWAITING_ROUTE`) — not an error, and not a zero.

Nobody should promise that exactly 12.50% of gross trading volume reaches either destination.
Volume is not fee revenue, and settlement is not free.

**Conversion costs fall only on the platform share, never on the creator's** — in either direction.
Getting the platform's own slice from a project token into the quote, and from the quote into WETH,
is the platform's problem, paid out of the platform's own share.

### BNB Smart Chain is deferred in RC5

The schema keeps BNB Smart Chain (56) in its chain vocabulary, and the settlement lesson still
matters: a BNB deployment would denominate its native quote in **WBNB**, not WETH. But BNB is not
deployed in RC5. It is deferred rather than shipped with an unproven egress route.

WBNB is not WETH, so the buy-and-entomb half stays **WBNB-denominated until an approved route to
WETH exists**. That would be the ordinary `BUYBACK_ALLOCATED_AWAITING_ROUTE` state described
above, but it is not a live RC5 launch path.

Any interface that prints "WETH" for a BNB market is naming the wrong token. The symbol comes from
the chain's own profile — `wrappedNativeSymbolFor(chainId)` in `@relics/project-schema`, which
**throws on an unknown chain rather than returning a default**. There is no `?? "WETH"` anywhere,
because that default was correct on every chain that existed when it was written and silently wrong
on the first one that followed.

### Quote admission does not wait for a WETH route

A quote asset can be enabled for new launches without the platform's route from that quote to WETH
having been proven, because the treasury half is claimable in the quote regardless and the buyback
half is allowed to wait. Do not read "enabled" as "a WETH route exists".

That is a different route from the one your `QUOTE_ONLY` mode needs. `QUOTE_ONLY` still requires a
proven route from the **project token into the quote**, because that conversion is what the mode
promises *you*. The two are separate requirements on separate routes; the launchpad will not offer
you `QUOTE_ONLY` without the second one.

## What "buy-and-entomb" actually means here

The economic kernel routes the buyback slice to a reserve recipient fixed at deployment. The
buy-and-entomb executor that spends it is a **separately deployable part of the operational layer**
— it is not part of the RC5 factory/locker/registry deployment record in
`@relics/project-schema`. What follows is what that component does by design, not a description of
buyback activity that has happened.

The executor spends tracked platform WETH to buy $RELICS on the one canonical RELICS/WETH Uniswap
v4 pool and sends **100% of the acquired $RELICS to the entombment address**
`0x000000000000000000000000000000000000dEaD`, in the same transaction. The tokens never sit with
the executor, a treasury, or the caller.

Be exact about what that does:

- **Spendable and circulating supply fall.** The entombed $RELICS are at an address nobody controls
  and are unrecoverable.
- **`totalSupply` does not change.** $RELICS has **no burn function**; its `totalSupply()` is a
  constant `10_000e18` and always will be. A buyback moves tokens; it does not shrink the ledger.
- **No ERC-20 burn event occurs.** There is no `Transfer`-to-zero, no `Burn` log, nothing an indexer
  could read as a supply decrease — because the deployed token has no supply-decreasing path at all.

All three of those have to be said together. "We burn $RELICS" on its own implies the supply number
goes down, and it does not. Say *buy-and-entomb*, *buyback and permanent removal*, or *permanently
removes purchased $RELICS from circulation*.

Buys are guarded — the executor anchors to its own TWAP oracle rather than spot price, bounds
deviation, caps each buy against live pool reserves, and reverts rather than accepting a partial
fill. The design intent is that a keeper calling it cannot extract value or steer the outcome:
keepers receive no $RELICS, choose no recipient, and can only tighten the minimum-out, never
loosen it.

## Claiming your fees

The shipped locker's external surface is small and deliberately has no principal-withdrawal
function. What exists:

| Function | Who calls it | Effect |
| --- | --- | --- |
| `collectFees(poolId)` | anyone | Realizes accrued fees and applies the 75/25 split |
| `claimCreator(projectId)` | anyone (pays the creator) | Pays out the creator's accrued WETH and token share |
| `claimPlatformWeth(projectId)` | anyone (pays the platform) | Pays out the platform's accrued WETH |
| `convertPlatformTokenFees(...)` | anyone | Converts the platform's project-token share to WETH via a TWAP-anchored swap |

Read-only companions let a UI show pending amounts before anyone spends gas:
`claimableCreatorWeth`, `claimableCreatorToken`, `claimablePlatformWeth`, `creatorWethAccrued`,
`creatorTokenAccrued`, `platformWethAccrued`, `platformTokenPendingConversion`,
`platformWethFromConversion`, `genesisLiquidity`, `poolIdOf`.

## Which assets you are paid in

A v4 position earns fees on **both** sides of the pair, so a project's collected fees arrive as the
project token *and* the market's quote asset. What happens to the creator's half of that is fixed
at launch and **immutable for the life of the project**:

| Mode | What the creator accrues | What the creator claims |
| --- | --- | --- |
| `DUAL_ASSET` | project token **and** the selected quote asset | both, unconverted |
| `QUOTE_ONLY` | the same two | the project-token entitlement is converted through the canonical pool into the **selected quote asset** |

`QUOTE_ONLY` is **not** "WETH-only". The asset it settles in is whatever the market is quoted in: a
`PROJECT/USDG` market settles the creator in USDG, a `PROJECT/NVDA` market in NVDA, a `PROJECT/WETH`
market in WETH. Any interface that prints "WETH" for a quote-only market it has not read the quote
asset of is lying to the creator.

Two boundaries that hold in both modes:

- **Creator assets never enter the platform settlement pipeline.** The platform's route to WETH
  moves the platform's own buckets and nothing else.
- **Creator conversion costs apply only to the creator's own entitlement**, and platform conversion
  costs apply only to the platform's.

## What the protocol does not promise

- No price, floor, or return. Genesis liquidity is single-sided: at launch there is executable ask
  liquidity and **no bid depth** until real buyers put quote currency into the pool.
- No revenue if nobody trades. The split is of fees that exist; zero volume is zero fees.
- No control over Uniswap's protocol fee, which is outside this system entirely.
- No project-funded bootstrap buying to manufacture volume or holders. Launch on real trades.

## Custody, stated neutrally

The genesis liquidity is minted directly against the PoolManager and is held under the shared
`ArtStreamableFeesLocker`, not sent to you. The creator receives a **ProjectRights** position that
carries the fee entitlement, not the liquidity position. The shipped locker exposes the functions
listed above and no principal-withdrawal path — verify that yourself against the source before you
rely on it, and treat any stronger permanence claim you read elsewhere as unverified.
