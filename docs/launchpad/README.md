# Building on the RELICS Launchpad

A creator's guide to launching a fully on-chain generative art collection that is bound to its own
Uniswap v4 pool from the first block.

> **Status: RC5 deployed, public launch closed.** Platform contracts are deployed on Ethereum (1),
> Base (8453) and Robinhood Chain (4663), but every factory is still `PREPARED`. Ordinary creator
> launches remain closed until a separate opening transaction moves the factories to public
> creation. BNB Smart Chain (56) is deferred in this release. Read
> [08 — Status and limitations](08-status.md) before you plan anything real, and
> [11 — Governance and upgradeability](11-governance-and-upgradeability.md) for who can change
> what, and how fast.

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
| 10 | [Deployments and quote assets](10-deployments-and-quote-assets.md) | RC5 addresses and the complete Robinhood stock-token reference |
| 11 | [Governance and upgradeability](11-governance-and-upgradeability.md) | Who can change what, how fast, and the two things that can never change |
| 12 | [Launch protection](12-launch-protection.md) | The mandatory buy-fee decay, the two hook generations and which is deployed, and the launch modes you can pick today |

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
