# Building on the RELICS Launchpad

A creator's guide to launching a fully on-chain generative art collection that is bound to its own
Uniswap v4 pool from the first block.

> **Status: not deployed yet.** The launchpad contracts are prepared for Ethereum (1), Base (8453)
> Robinhood Chain (4663) and BNB Smart Chain (56), and are marked `PREPARED_NOT_DEPLOYED` on all
> four. No factory,
> locker or registry address exists on any mainnet. Everything below describes a system you can
> read, reason about, and prepare art for — not one you can transact against today. Review to date
> is **internal only**; there has been no external audit. See
> [08 — Status and limitations](08-status.md) before you plan anything real.

## Read in this order

| # | Page | What you get |
| --- | --- | --- |
| 01 | [What the launchpad is](01-what-it-is.md) | The one-paragraph version, and who it is for |
| 02 | [What a launch produces](02-what-a-launch-produces.md) | The exact on-chain artifacts one `launch()` creates |
| 03 | [Art runtimes](03-art-runtimes.md) | Solidity-SVG template vs. deterministic JavaScript |
| 04 | [Constraints that actually bite](04-constraints.md) | Byte budgets, EIP-170, determinism, legibility |
| 05 | [The creator flow](05-creator-flow.md) | Draft → studio → preview/cover → launch |
| 06 | [Fees and revenue](06-fees-and-revenue.md) | The 75/25 split, stated precisely |
| 07 | [Integrating](07-integrating.md) | The SDK and ABI surface for builders |
| 08 | [Status and limitations](08-status.md) | What is proven, what is not, what is missing |
| 09 | [FAQ](09-faq.md) | Short answers to the questions people actually ask |

## How this differs from the starter template in this repo

This repository holds two related but separate things.

- **This guide** describes the **RELICS Launchpad**: a protocol where you supply art and
  parameters and one factory transaction deploys and wires the whole project for you. You do not
  write or deploy the token, the hook, or the pool yourself.
- **The [starter template](../00-make-it-your-own.md)** at the repo root is an independent,
  MIT-licensed, clean-room codebase you fork and deploy **yourself**, with no launchpad involved.
  It shares the ideas — on-chain art, a v4 hook, single-sided genesis liquidity — but none of the
  code, and none of the fee split.

Pick the launchpad if you want the plumbing solved. Pick the template if you want to own every
line and answer for it yourself.

## The one thing to understand first

A launch is not a mint page with a token bolted on. The collection and the market are the same
object:

```
immutable per-token DNA  +  live market state from your own v4 pool
                        ‖
        what tokenURI computes, on chain, at read time
```

`tokenURI` returns a base64 JSON document with an embedded base64 SVG — no image file, no IPFS
CID, and no metadata API in that path. Your pool's history is an input to the artwork, permanently.

[03 — Art runtimes](03-art-runtimes.md) is specific about where your own art bytes sit in that
picture, including the part most launchpad marketing skips: what the shipped `tokenURI` actually
draws today.
