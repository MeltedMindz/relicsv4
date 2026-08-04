# 12 — Token sort order decides routability

In Uniswap v4, a PoolKey's `currency0` and `currency1` are the two tokens **sorted by address,
ascending**. `currency0` is the numerically smaller address. You do not choose this per pool — it
is a function of the deployed addresses.

## Why it matters for a single-sided launch

A v4 position is active over the **half-open** interval `[tickLower, tickUpper)`. For a
single-sided genesis position placed from the launch tick upward:

- If your art token is **currency0**, the pool opens at `tickLower` (inside the range) → active
  liquidity is **non-zero** at genesis.
- If your art token is **currency1**, the pool opens at `tickUpper` (excluded by the half-open
  rule) → active liquidity is **zero** at genesis.

Both orderings are economically identical for the actual first trade. But smart-order-routers
often admit a pool only when it has non-zero active liquidity or some tracked TVL. In the
currency1 ordering, a single-sided pool can show **zero** active liquidity and **zero** quote TVL
at genesis — so a router may **filter it out** and refuse to quote or execute the first buy.
Direct swaps still work, but the polished "swap on the big aggregator UI" path can break.

Conclusion for this style of launch: you generally want the **art token to be currency0** (sort
**below** the quote token).

## How to control it

`new ExampleToken(...)` is a plain `CREATE`, so its address — and therefore its sort order — is
decided by deployer nonce. That is roughly a coin flip (worse: about 1-in-4 chance of landing on
the "wrong" side against a fixed quote token).

To make it deterministic, deploy the **token** via CREATE2 with a mined salt, exactly like you
mine the hook address — but here you are searching for an address that sorts below the quote
token. A large fraction of the address space qualifies, so the search is cheap.

`script/DeployExample.s.sol` logs a warning if the token sorts as currency1 so you notice before
you initialize the pool (after which the ordering is baked into the canonical PoolKey forever).

## Test both orderings regardless

Whatever ordering you target, your hook and UI must handle both. The buy/sell sign convention and
the single-sided range direction (`[launchTick, maxTick]` vs `[minTick, launchTick]`) both flip.
`test/unit/ExampleV4Hook.t.sol` exercises each.
