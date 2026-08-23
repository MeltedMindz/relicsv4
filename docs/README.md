# Documentation

Three separate things live in this repository. Pick the one you are here for.

| | For | Start at |
| --- | --- | --- |
| **The creator kit** (primary) | building a project and exporting a `.relics` bundle | **[creator-kit/getting-started.md](creator-kit/getting-started.md)** |
| **The launchpad** | what the transaction you eventually sign actually does | [launchpad/](launchpad/) |
| **The starter template** (advanced) | forking a Solidity codebase and deploying it yourself | [00-make-it-your-own.md](00-make-it-your-own.md) |

---

## The creator kit

Write generative art, wire market signals to it, export one file.

| | |
| --- | --- |
| [Getting started](creator-kit/getting-started.md) | fresh clone → exported bundle, step by step |
| [Create with an agent](creator-kit/create-with-an-agent.md) | building a project with an AI agent |
| [The CLI](creator-kit/cli.md) | every command, every flag, every check |
| [The `.relics` bundle format](creator-kit/bundle-format.md) | the container, the layout, every hash recipe |
| [Treating every bundle as hostile](creator-kit/bundle-security.md) | the threat model, and what is *not* defended |
| [Importing a bundle](creator-kit/importing.md) | for anyone writing an importer |
| [Requesting a custom art runtime](creator-kit/requesting-an-art-runtime.md) | the rare case the generic runtime cannot express |

## The launchpad

| | |
| --- | --- |
| [Overview](launchpad/) | the guide index |
| [01 — What the launchpad is](launchpad/01-what-it-is.md) | the one-paragraph version, and who it is for |
| [02 — What a launch produces](launchpad/02-what-a-launch-produces.md) | the exact artifacts one call creates |
| [03 — Art runtimes](launchpad/03-art-runtimes.md) | Solidity-SVG vs. deterministic JavaScript |
| [04 — Constraints that bite](launchpad/04-constraints.md) | byte budgets, EIP-170, determinism, legibility |
| [05 — The creator flow](launchpad/05-creator-flow.md) | draft → studio → preview/cover → launch |
| [06 — Fees and revenue](launchpad/06-fees-and-revenue.md) | the split, stated precisely |
| [07 — Integrating](launchpad/07-integrating.md) | the SDK and ABI surface |
| [08 — Status and limitations](launchpad/08-status.md) | what is proven, what is not, what is missing |
| [09 — FAQ](launchpad/09-faq.md) | short answers to the questions people actually ask |
| [10 — Deployments and quote assets](launchpad/10-deployments-and-quote-assets.md) | per-chain state and the quote-token reference |
| [11 — Governance and upgradeability](launchpad/11-governance-and-upgradeability.md) | who can change what |
| [12 — Launch protection](launchpad/12-launch-protection.md) | the election every launch makes, once and permanently |
| [13 — Metadata and contractURI](launchpad/13-metadata-and-contracturi.md) | birth metadata, the two digests, and why a pin receipt is not evidence |
| [14 — Glossary](launchpad/14-glossary.md) | the terms, defined once |
| [15 — Art runtimes, in depth](launchpad/15-art-runtimes.md) | what a runtime is given, and what decides whether a launch can bind it |

---

# The starter template (advanced)

**This is not the creator kit.** It is a clean-room, MIT-licensed Solidity codebase you fork and
deploy yourself — no launchpad, no factory, no fee split. You deploy all of it, you own all of it,
and you are responsible for all of it. It is educational and **not production-ready**.

Fork it, change a small, clearly-marked set of things, and ship your collection without reading the
whole codebase. You customize four layers:

1. the **ERC-20 token** — name, symbol, supply;
2. the **v4 hook logic** — which market signals drive the art, and how strongly;
3. the **on-chain renderer** — your art; three sample systems ship, or bring your own;
4. the **deployment tooling** — fully parameterized: mine → bind → pool → liquidity → lock.

Everything a forker edits lives in one config surface
([`config/collection.config.ts`](../config/collection.config.ts) + your `.env`) or is pointed to
from there.

```
immutable per-token DNA  +  live market state  =  a phenotype that evolves with the market
```

There is no stored image, no IPFS, no API. `tokenURI` reads Ethereum state at query time and
returns base64 JSON with an embedded base64 SVG.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge` ≥ 1.0)
- Node.js ≥ 20 and npm
- git

## Quick start (~15 minutes, no network, no secrets)

```bash
git clone https://github.com/MeltedMindz/relicsv4.git
cd relicsv4
# no submodules: all Solidity dependencies are vendored under lib/

forge build
forge test

# deterministic example art → output/examples/
forge script script/GenerateExamples.s.sol --tc GenerateExamples

npm install
npm run web:dev   # http://localhost:3000
```

The web app works offline with deterministic local fixtures and fails closed on any surface you
have not configured.

### Tests

```bash
forge test                                 # unit + fuzz + invariant + local deployment
forge test --match-path "test/fork/*"      # fork tests (self-skip if MAINNET_RPC_URL is unset)
forge build --sizes | grep -E "Renderer"   # EIP-170 budget check (all art systems)
```

### Generating art

```bash
mkdir -p output/examples   # first time only
RENDERER_STYLE=orbital forge script script/GenerateExamples.s.sol --tc GenerateExamples
# styles: sigil (default) | strata | orbital
# knobs: EXAMPLE_COUNT, MARKET_DRAWDOWN, MARKET_SWAPS, MARKET_VOLATILITY, MARKET_HOLDERS, MARKET_EPOCH
```

Regeneration at the same commit is byte-identical. That reproducibility is your art-integrity
check.

## The numbered guides

| # | Guide |
| --- | --- |
| 00 | [Make it your own (start here)](00-make-it-your-own.md) |
| 01 | [System overview](01-system-overview.md) |
| 02 | [Contracts and the token](02-contracts-and-token.md) |
| 03 | [Uniswap v4 hooks, from zero](03-uniswap-v4-hooks.md) |
| 04 | [The hook in detail](04-the-hook.md) |
| 05 | [NFT and awakening](05-nft-and-awakening.md) |
| 06 | [On-chain renderer](06-onchain-renderer.md) |
| 07 | [Market state as art](07-market-state-as-art.md) |
| 08 | [Genesis liquidity](08-genesis-liquidity.md) |
| 09 | [Locker and LP finality](09-locker-and-lp-finality.md) |
| 10 | [Twenty hard-won lessons](10-twenty-lessons.md) |
| 11 | [PositionManager token id](11-position-manager-token-id.md) |
| 12 | [Token sort order](12-token-sort-order.md) |
| 13 | [Mining the hook address](13-mining-hook-address.md) |
| 14 | [Deploy and pool](14-deploy-and-pool.md) |
| 15 | [Launch economics](15-launch-economics.md) |
| 16 | [Renderer size budget](16-renderer-size-budget.md) |
| 17 | [Frontend integration](17-frontend-integration.md) |
| 18 | [FAQ](18-faq.md) |
| + | [Exporting on-chain SVG as PNG](exporting-onchain-svg-as-png.md) |

## Project layout

```
config/     collection.config.ts — the ONE web/human config surface
src/        token, hook, NFT, RendererBase + 3 art systems, locker, interfaces/, libraries/
script/     Foundry tooling: config + mine/deploy/bind/liquidity/lock/verify/art
test/       unit/ fuzz/ invariant/ fork/ deployment/ + mocks/ + utils/
apps/web/   config-driven Next.js app (wagmi/viem, EIP-6963)
lib/        vendored, production-pinned deps: forge-std, uniswap-hooks,
            v4-core, v4-periphery, OZ, solmate, permit2
```

## Mainnet safety checklist

Only after your own security, legal and economic review.

- [ ] Full rehearsal on a fork / Sepolia, including a real swap and a fee collection.
- [ ] Token sort order chosen deliberately (art token as currency0 for single-sided routing).
- [ ] Hook address bits verified `== 0x1440`; mined against the real constructor args.
- [ ] Canonical pool bound **before** initialize; opening price asserted.
- [ ] Position id read from the confirmed receipt (never a simulation).
- [ ] LP locked in the immutable custodian; `feePolicyHash()` recorded.
- [ ] Owner powers (token/hook) renounced only after proofs exist; never claim a renounce before
      the tx and post-state reads exist.
- [ ] No project-funded bootstrap buy. Launch on real, independent trades.
- [ ] Honest launch language ([15](15-launch-economics.md)); never "LP burned."
- [ ] No signing secret in any hosting environment.
- [ ] Independent security + legal review completed.

## Security warnings

Read [`SECURITY.md`](../SECURITY.md). Highlights: hook callbacks must stay bounded; only the
canonical pool may drive art state; market signals and randomness must never gate financial
outcomes; the renderer must stay under EIP-170; treat marketplace metadata as a cache of the
canonical `tokenURI`.

---

## Glossary

- **hook** — a contract the Uniswap v4 PoolManager calls at specific pool events (initialize,
  add/remove liquidity, swap, donate). Its address bits declare which callbacks it implements.
- **PoolKey** — the struct identifying a pool: `currency0`, `currency1`, `fee`, `tickSpacing`,
  `hooks`.
- **PoolId** — `keccak256(abi.encode(poolKey))`, a `bytes32` handle for a pool.
- **tick** — an integer price index; each tick is a 0.01% step. Tick 0 is price 1.0.
- **sqrtPriceX96** — the pool price stored as `sqrt(price) * 2**96` (Q64.96 fixed point).
- **PositionManager NFT** — the ERC-721 the v4 periphery mints to represent a liquidity position;
  its token id comes from a shared counter (read it, don't predict it).
- **tokenURI** — the ERC-721 metadata function; here it returns an on-chain `data:` URI.
- **CREATE2** — deploys a contract to a pre-computable address derived from
  `keccak256(0xff, deployer, salt, keccak256(initCode))`; used to mine hook addresses.

### Creator-kit vocabulary

- **`.relics` bundle** — one deterministic, uncompressed ZIP holding your generator, traits, market
  mappings, metadata and previews, plus a generated manifest and per-file checksums.
- **`relics.config.json`** — the file **you** write. The project's source of truth.
- **`relics.project.json`** — the manifest, **generated** at export. It exists only inside the
  `.relics` file, never in your project directory.
- **sensor** — a named market reading (`drawdown`, `volume`, `volatility`, …), delivered in
  `[-1, 1]`.
- **transform** — a named shaping function (`clamp`, `smoothing`, `accumulation`, …) that maps a
  sensor reading to `[0, 1]`.
- **destination** — a named art parameter (`fracture`, `density`, `brightness`, …) your generator
  reads from `context.market`.
- **art runtime** — how a collection's art is rendered on chain: `SOLIDITY_SVG_V1` or
  `ONCHAIN_JAVASCRIPT_V1`.
- **approved vs launchable** — approved means the bundle format accepts the runtime; launchable
  means a deployed collection will actually bind and render through it. They are not the same
  question and the kit never collapses them.
