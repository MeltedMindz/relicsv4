# 07 — Market state as art (never an oracle)

The hook maintains a compact `MarketState`:

| Field | Meaning | Used for |
| --- | --- | --- |
| `swapCount` | observed swaps | orbiting marks/bodies, epoch |
| `liquidityEventCount` | observed adds | epoch |
| `epoch` | coarse age bucket | strata depth, metadata |
| `cumulativeBuyVolume` / `cumulativeSellVolume` | flow magnitudes (saturating) | palette/band skew |
| `lastTick` / `highTick` / `lowTick` | current, all-time-high, and low-since-high | drawdown + recovery |
| `drawdownBand` | 0..10000, how far below the high | fade / darken |
| `recoveryBand` | 0..10000, how far back up from the low | brighten / horizon |
| `volatility` | EMA of tick movement | geometry twist / spread |
| `holderCount` | active token holders (injected by the NFT at render) | nucleus size (Orbital) |
| `entropy` | rolling keccak hash | future mixing |

You change how each maps to art in the hook's `_evolveState` (the mapping) and your renderer's
`_renderArt` (the drawing). See [00 — Make it your own](00-make-it-your-own.md).

## The one rule

**These are inputs to art, not financial truth.** Ticks, volumes, and liquidity are manipulable —
especially in shallow liquidity, a single large swap or a wash trade can move them. That is fine
for texture and *catastrophic* for anything with money attached.

Never let market state (or `block.prevrandao`, block data, or any on-chain randomness) decide:

- payouts, refunds, or fee splits,
- mint access, allowlists, or ordering,
- lotteries, raffles, or rewards.

Randomness and market signals feed the *look* of the piece. Money decisions must be
deterministic and adversary-resistant.

## Why "drawdown leaves a mark"

`highTick` only ratchets up; `drawdownBand` measures how far below it the current tick sits. As a
market draws down, the renderer fades the accent color — the art visibly carries the scar of the
market's history. When new highs print, the band resets. This is the emotional core of a
"forged by the market" collection, achieved with two integers and zero oracles.

## There is no `afterRemoveLiquidity`

The hook does not observe liquidity *leaving*. So the art can never truthfully claim a "liquidity
drought" — it simply has no signal for it. Do not present unobservable states as observed. If you
need that signal, add the callback (and the flag bit, and re-mine the address).
