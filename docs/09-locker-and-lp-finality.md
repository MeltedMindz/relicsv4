# 09 — LP finality and the fee-forwarding locker

`ImmutablePositionLocker` is an **ownerless, non-upgradeable, eternal custodian** for one Uniswap
v4 LP position NFT. It exists to solve one problem: how do you make LP principal *permanent* while
keeping fee collection *possible forever*?

## Separate principal finality from fee collection

A common but crude approach is to "burn the LP" by sending the position NFT to `0xdead`. That
does make principal permanent — but it also **destroys the ability to ever collect fees**, because
collecting fees requires an owner action on the position.

The locker does better:

- It **holds** the position NFT forever. It has no `transfer`, `approve`, `burn`, or
  `decreaseLiquidity`-of-principal path in its bytecode, so principal can never leave.
- It exposes one permissionless function, `collectFees()`, that realizes accrued fees.

Result: principal is locked as hard as a burn, but fees keep flowing. This starter says
"principal held by an ownerless custodian with no withdrawal path; fees route to recipients
fixed at construction" — it never says "LP burned," and it never claims more permanence than the
bytecode actually provides.

## Zero-liquidity DECREASE realizes fees without touching principal

```solidity
DECREASE_LIQUIDITY(POSITION_ID, liquidity = 0, min0 = 0, min1 = 0, "")  // fee poke
TAKE(currency0, recipient0, OPEN_DELTA)
TAKE(currency1, recipient1, OPEN_DELTA)
```

A decrease of **zero** liquidity is the canonical v4 "fee poke": it credits accrued fees and
leaves principal untouched. The `liquidity` argument is a **literal 0** in the bytecode, so a
principal withdrawal cannot even be expressed.

## Direct routing beats a contract-held balance (donation-DoS)

The two `TAKE` actions name the **final recipients directly**, so the PoolManager pays them
without the fees ever touching the locker's balance. This matters:

> If a locker first took fees into its **own** balance and then `transfer`red them, its behavior
> could depend on balances it holds — and an attacker could **donate** unexpected tokens to change
> or brick that path. Routing directly makes donated balances **inert**.

The locker never reads its own token balance for control flow. Donating tokens or pushing stray
NFTs into it changes nothing and costs nothing — the donation is permanently stranded dust. The
test `test_donationDoesNotAlterFeeCollection` proves it.

## Constructor binds to the real position

At deploy time the locker reads `getPoolAndPositionInfo(positionId)` and reverts unless the
position's pool currencies match the configured order, and reverts if liquidity is zero. So a
wrong id or ordering **cannot be deployed**. It also refuses recipients equal to the v4 action
sentinels (`address(1)`, `address(2)`) or itself, which would silently re-route a `TAKE`.

## Fees can be routed anywhere immutable

`recipient0` and `recipient1` are fixed at construction. A project might send quote-token fees to a
treasury and route its own-token fees to a dead address ("entombment") — but that is a policy
choice you encode in the constructor, reproducible via `feePolicyHash()`. Entombing tokens is
**not** a supply burn: they remain in `totalSupply`, merely inaccessible.
