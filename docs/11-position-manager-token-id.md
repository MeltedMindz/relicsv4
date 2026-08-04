# 11 — The PositionManager token id: read it, never predict it

When you add liquidity in Uniswap v4, the **PositionManager** mints an ERC-721 to represent your
position. Its **token id** is drawn from a **single, shared, monotonically increasing counter**
across *every* user of that PositionManager.

## Why simulation lies

It is tempting to simulate your mint, observe "the next id will be N," and hardcode `N` into your
lock script or records. This is a bug waiting to happen:

- Between your simulation and your real transaction, **anyone else** can mint a position and take
  `N`. Now your mint gets `N+1`, and any record keyed to `N` points at a stranger's position.
- Re-orgs, mempool ordering, and bundlers make the id you get non-deterministic ahead of time.

## Read it from the receipt / ownership

After your mint confirms, determine the id from ground truth:

- Parse the `Transfer(0x0 -> you, tokenId)` event on the PositionManager in your tx receipt, or
- Query ownership on chain: the id you now own with the liquidity/pool you expect.

Only then feed that id to `script/LockPosition.s.sol`.

## Defense in depth: the locker re-verifies on chain

`ImmutablePositionLocker`'s constructor does not trust the id blindly. It reads
`getPoolAndPositionInfo(positionId)` and reverts unless:

- the position's `currency0`/`currency1` match the configured pair **in order**, and
- the position has non-zero liquidity.

So even if you pass a wrong id, the locker refuses to deploy against it. Belt **and** suspenders:
read the real id, and let the locker check it again.

## Rule of thumb

> Any identifier assigned by a shared counter (position ids, request ids, auction ids) must be
> **observed from a confirmed result**, never predicted from a simulation.
