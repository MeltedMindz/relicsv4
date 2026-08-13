# 01 — What the RELICS Launchpad is

> RC5 platform contracts are deployed on Ethereum, Base and Robinhood Chain, but public creator
> launches are still closed (`PREPARED`). BNB Smart Chain is deferred in this release.
> Internal review only — no external audit. See [08 — Status and limitations](08-status.md).

## The one paragraph

The RELICS Launchpad is a protocol for launching **generative art collections that own their own
market**. You bring the art — either a registered Solidity-SVG template with your configuration, or
a deterministic JavaScript script stored on chain — plus a handful of parameters. One transaction
deploys your ERC-20, your ERC-721 collection, a Uniswap v4 hook mined to a valid address, opens the
canonical pool, mints the genesis liquidity, and publishes the project record. From then on, every
swap in your pool writes market state, and `tokenURI` computes metadata and an SVG from chain state
at read time.

## What "on-chain" means here, precisely

This is the part most launchpads are vague about, so here is the exact division:

- **`tokenURI` is fully on chain.** It returns a `data:application/json;base64` document with an
  embedded `data:image/svg+xml;base64` image, computed at read time from the token's immutable DNA
  and two live reads off your hook (`organicSwapCount()`, `organicNetFlow()`). No IPFS CID, no API,
  no gateway in that path.
- **Your art bytes are stored on chain, and the launch commits to their hash.**
  `artScriptHash` must equal `keccak256(artConfig)` or the launch reverts (`BadArtHash`), and in
  JavaScript mode the bytes themselves are written as contract code through an SSTORE2-style store.
  Nobody — including the platform — can swap your art for different bytes afterwards.
- **The on-chain contract never executes JavaScript.** In JavaScript mode the canonical render is
  performed off chain by a client that reads the stored bytes and runs them under a seed derived on
  chain. See [03 — Art runtimes](03-art-runtimes.md), which is blunt about exactly what the shipped
  `tokenURI` draws today versus what the template libraries can do.
- **The market is not decoration.** Your pool's activity is an input the artwork reads. A
  collection that never trades looks different from one that has been through real volume.
- **Collection-level media is different from token art.** Your cover, banner and featured images
  are raster assets pinned to IPFS. That is marketplace furniture, not the artwork, and it is not
  in the `tokenURI` render path.

## Who it is for

- **Artists** who want their work to be genuinely on chain and to keep working when every service
  around it goes away, and who want the market to be part of the piece rather than a scoreboard
  next to it.
- **Creative coders** who already write deterministic generative sketches and want a path to
  chain that does not require learning Uniswap v4 hook mining.
- **Solidity developers** who want the artifact set, the ABI, and the fee mechanics documented
  precisely enough to build a marketplace, an indexer, or a custom front end against.

## Who it is not for

- Anyone wanting a static PFP trait stack with rarity tiers. The art here is driven by market
  state, not by a fixed attribute table. You can attach trait names as metadata, but they do not
  determine the image.
- Anyone wanting an off-chain metadata API, a mutable `baseURI`, or an admin who can change the
  art after launch. Those levers do not exist.
- Anyone looking for a guaranteed price, a floor, or a return. Read
  [06 — Fees and revenue](06-fees-and-revenue.md) for what the protocol actually promises, which is
  a fee split and nothing more.

## What you give up compared to rolling your own

| You get | You give up |
| --- | --- |
| One atomic launch — token, collection, hook, pool, liquidity, registry | Choice of pool fee tier (it is fixed at 1%) |
| A hook mined to a valid v4 address without you running a miner | Direct custody of the genesis liquidity position |
| A shared, non-upgradeable fee locker that splits every collection | 25% of collected LP fees to the platform |
| Explorer, marketplace and indexer metadata wired at launch | Freedom to redesign the token↔artwork relationship |
| A studio, a sandbox, a preflight checklist, and address prediction | A creator token allocation — the cap is currently `0` |

If those trades are wrong for you, the [starter template](../00-make-it-your-own.md) in this repo
is the fork-it-yourself alternative with no launchpad and no split.

## The RC5 target chains

| Chain | Chain ID | Explorer | Platform contracts |
| --- | --- | --- | --- |
| Ethereum | 1 | `etherscan.io` | Deployed, `PREPARED` |
| Base | 8453 | `basescan.org` | Deployed, `PREPARED` |
| Robinhood Chain | 4663 | `robinhoodchain.blockscout.com` | Deployed, `PREPARED` |
| BNB Smart Chain | 56 | `bscscan.com` | Deferred |

Protocol policy is chain-invariant by design: the same 1% pool fee, the same 75/25 split, the same
`0x1440` hook mask apply on every target chain. The addresses differ per chain, and per-chain gas
and script budgets must be measured independently rather than assumed from Ethereum's numbers.
See [10 — Deployments and quote assets](10-deployments-and-quote-assets.md) for the live address
record.

## Its relationship to the RELICS collection

RELICS itself — the collection at `https://www.relics.wtf` — is the flagship that the launchpad
generalizes. It is live on Ethereum mainnet; the launchpad is deployed separately and public
creator launches are not open yet. They are separate systems: launching on the
launchpad does not mint, wrap, or entitle you to $RELICS, and holding $RELICS does not grant
launchpad privileges. The only link is economic, and it runs one way: a slice of platform fee
revenue buys $RELICS on the open market and sends it to an entombment address
([06 — Fees and revenue](06-fees-and-revenue.md)).

The exact production source of the live RELICS v4 hook is published in this repo under
[`flagship/`](../../flagship/) as an authorized reference. Read it if you want to see what a
finished, deployed instance of this design looks like.
