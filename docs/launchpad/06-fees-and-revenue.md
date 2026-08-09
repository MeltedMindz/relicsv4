# 06 — Fees and revenue

> Not deployed on any chain yet. Internal review only — no external audit.
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

The platform share subdivides at a rate fixed in `ImmutableEconomicKernel` as a compile-time
constant with no setter:

```
RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE = 2500   // 25% of the platform share
```

Which resolves to:

| Slice | Share of the platform 25% | Share of all collected LP fees |
| --- | --- | --- |
| $RELICS buyback | 25% | **6.25%** |
| Retained by the protocol Safe | 75% | **18.75%** |

The buyback slice is carved only from platform revenue. It never reads or touches a creator or
collaborator ledger.

## What "buyback and burn" actually means here

The buyback executor spends tracked platform WETH to buy $RELICS on the one canonical RELICS/WETH
Uniswap v4 pool and sends **100% of the acquired $RELICS to the entombment address**
`0x000000000000000000000000000000000000dEaD`, in the same transaction. The tokens never sit with
the executor, a treasury, or the caller.

Be exact about what that does:

- **Circulating supply falls.** The entombed $RELICS are at an address nobody controls and are
  unrecoverable.
- **`totalSupply` does not change.** $RELICS has **no burn function**; its `totalSupply()` is a
  constant `10_000e18` and always will be. A buyback moves tokens; it does not shrink the ledger.

Both halves of that have to be said together. "We burn $RELICS" on its own implies the supply
number goes down, and it does not.

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

Your fees accrue in **both** currencies — WETH and your own project token — because a v4 position
earns fees on both sides.

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
