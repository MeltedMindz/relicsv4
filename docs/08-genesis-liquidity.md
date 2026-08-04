# 08 — Genesis liquidity (single-sided)

This starter demonstrates a **single-sided** genesis position: the whole token supply is placed
as liquidity from the launch tick upward, with **zero quote token seeded**.

## Why single-sided

If the entire supply sits in one position starting at the launch tick, then:

- the launch tick is the **price minimum** — there is no liquidity below it,
- every position is **executable ask liquidity** (tokens available to buy),
- there is **no bid depth** until a real buyer arrives and their quote token accumulates in the
  pool above the launch tick,
- the swap fee makes every round trip end above the launch price.

This is a clean, capital-efficient way to open a market: you are not pre-funding a floor with
quote assets, and you are not manufacturing fake demand.

## The half-open range subtlety

A v4 position is active over the **half-open** interval `[tickLower, tickUpper)`. Combined with
token ordering, this decides whether the pool is even active at genesis:

- If the art token is **currency0**, the pool opens at `tickLower`, which is **inside** the range
  → active liquidity is non-zero at genesis.
- If the art token is **currency1**, the pool opens at `tickUpper`, which is **excluded** → active
  liquidity is **zero** at genesis.

Both orderings are economically identical for the first buy, but the second ordering can make
routers refuse to quote your pool. This is why token sort order matters — see
[12 — Token sort order](12-token-sort-order.md).

## Initialized price vs market price

A single-sided pool has a perfectly valid **initialized price** (from its opening
`sqrtPriceX96`) and **zero quote reserves**. These are different things:

- *Initialized price* — the price the pool opens at. Real, but not validated by any trade.
- *Market-established price* — requires actual independent trading.

Never present the initialized price (or a "fully diluted valuation" computed from it) as a
market-validated number. See [15 — Launch economics](15-launch-economics.md).

## The script

`script/AddLiquidity.s.sol` mints the single-sided position via the PositionManager. It is a
**template**: fill in your infra addresses and the exact `LAUNCH_TICK` / `LIQUIDITY`, run it on a
fork first, and **read the resulting position id from the receipt** — never from a simulation
(see [11](11-position-manager-token-id.md)).
