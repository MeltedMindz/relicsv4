# relics-v4

**On-chain generative art that owns its own market** — an ERC-721 collection linked to an ERC-20,
with a Uniswap v4 hook turning swaps, liquidity, volatility and market history into live artistic
evolution.

**The market becomes the art.**

This repository holds two ways in, plus the production reference.

| | What it is | Start here |
| --- | --- | --- |
| 🚀 **Build on the RELICS Launchpad** | A protocol where you supply art and parameters and **one transaction** deploys and wires the whole project — token, collection, hook, pool, liquidity, registry. | **[docs/launchpad/](docs/launchpad/)** |
| 🔧 **Fork the starter template** | A clean-room, MIT-licensed codebase you customize and deploy **yourself**, with no launchpad, no factory, and no fee split. | **[docs/00 — Make it your own](docs/00-make-it-your-own.md)** |
| 🏛️ **Flagship reference** | The exact production source of the live RELICS Uniswap v4 hook. | **[flagship/](flagship/)** |

> ⚠️ **The RELICS Launchpad is NOT deployed.** It is marked `PREPARED_NOT_DEPLOYED` on Ethereum
> (1), Base (8453) and Robinhood Chain (4663) — there is no factory, locker or registry address on
> any chain, and no launch can succeed today. All review to date is **internal only**; there has
> been **no external audit**. See
> [docs/launchpad/08 — Status and limitations](docs/launchpad/08-status.md).

> ⚠️ **The starter template is educational. NOT audited. NOT affiliated with or endorsed by
> Uniswap, OpenZeppelin, OpenSea, or any auditor.** The template layers contain no private
> material and are a clean-room teaching rewrite. Get your own security, legal, and economic
> review before deploying or trading anything. See the [Disclaimer](#26-disclaimer).

> 🏛️ **Flagship reference:** [`flagship/`](flagship/) contains the **exact production source of
> the live RELICS Uniswap v4 hook** on Ethereum mainnet
> (`0xA6f73cc88723f04b85E2c2aF3e35F759Dc1A9440`), published here by the RELICS operator as an
> explicitly authorized public reference. Every file there is byte-identical to the
> Etherscan-verified source, and `flagship/test/DeploymentProof.t.sol` proves offline that the
> tree reproduces the deployed init code. The template and the flagship share no code.

---

## Building on the RELICS Launchpad

If you want the plumbing solved — a hook mined to a valid address, a pool opened at a computed
price, genesis liquidity minted, marketplace and explorer metadata wired, all in one atomic call —
that is the launchpad. You bring art and a handful of parameters.

**[→ Read the creator guide](docs/launchpad/)**

| # | Page | What you get |
| --- | --- | --- |
| 01 | [What the launchpad is](docs/launchpad/01-what-it-is.md) | The one-paragraph version, and who it is for |
| 02 | [What a launch produces](docs/launchpad/02-what-a-launch-produces.md) | The exact artifacts one `launch()` creates |
| 03 | [Art runtimes](docs/launchpad/03-art-runtimes.md) | Solidity-SVG template vs. deterministic JavaScript |
| 04 | [Constraints that actually bite](docs/launchpad/04-constraints.md) | Byte budgets, EIP-170, determinism, legibility |
| 05 | [The creator flow](docs/launchpad/05-creator-flow.md) | Draft → studio → preview/cover → launch |
| 06 | [Fees and revenue](docs/launchpad/06-fees-and-revenue.md) | The 75/25 split, stated precisely |
| 07 | [Integrating](docs/launchpad/07-integrating.md) | The SDK and ABI surface for builders |
| 08 | [Status and limitations](docs/launchpad/08-status.md) | What is proven, what is not, what is missing |
| 09 | [FAQ](docs/launchpad/09-faq.md) | Short answers to the questions people actually ask |

Headline economics, stated the way they should always be stated: your project pool has a static
**1% LP fee**; LP fees **actually collected** are split **75% creator / 25% platform**; within the
platform share, **6.25% of collected fees** buys $RELICS and sends it permanently to
`0x…dEaD` — circulating supply falls, while `totalSupply` stays fixed at 10,000 because $RELICS has
no burn function — and **18.75%** is retained by the protocol Safe.

---

## The starter template

Everything from here down describes the fork-it-yourself template, which is independent of the
launchpad and shares no code with it.

## 1. The promise

Fork this repo, change a small, clearly-marked set of things, and ship YOUR collection — without
reading the whole codebase. You customize **four layers**, then launch:

1. the **ERC-20 token** (name, symbol, supply),
2. the **v4 hook logic** (which market signals drive the art, and how strongly),
3. the **on-chain renderer** (your art — three sample systems ship, or bring your own),
4. the **deployment tooling** (fully parameterized: mine → bind → pool → liquidity → lock).

Then: **generate art locally → deploy to a testnet → create the pool → add + lock liquidity →
go to mainnet after your own review.** Everything a forker edits lives in one config surface
([`config/collection.config.ts`](config/collection.config.ts) + your `.env`) or is pointed to
from there. Start with **[docs/00 — Make it your own](docs/00-make-it-your-own.md)**.

The core idea:

```
immutable per-token DNA  +  live market state  =  a phenotype that evolves with the market
```

There is no stored image, no IPFS, no API. `tokenURI` reads Ethereum state at query time and
returns a base64 JSON with an embedded base64 SVG.

## 2. What you will build

Deployed and wired together, driven by your config:

- **`ExampleToken`** — a fixed-supply ERC-20 with no tax, blacklist, or hidden mint.
- **`ExampleV4Hook`** — a Uniswap v4 hook mined to the correct address, distilling pool activity
  into a `MarketState` via one clearly-marked mapping function you customize.
- **`ExampleArtNFT`** — an ERC-721 with fully on-chain metadata and a swappable acquisition model.
- **A renderer** — one of three shipped art systems (**Sigil**, **Strata**, **Orbital**) or your
  own, behind a single `_renderArt(dna, marketState)` seam.
- **`ImmutablePositionLocker`** — an ownerless custodian whose bytecode contains no path to
  withdraw LP principal, while keeping fee collection permissionless.
- A **config-driven Next.js web app** (Home / Acquire / Mint / Explore / Technical).

## 3. Who this is for

- Solidity developers who have never written a Uniswap v4 hook and want a working, commented
  example.
- Artists/tinkerers curious how on-chain generative art actually renders from state.
- Anyone who wants a **correct, honest** template for a single-sided v4 launch and immutable LP
  finality — with the sharp edges labeled.

No prior v4 knowledge is assumed. Every term is defined in [Glossary](#glossary) and in
[`docs/03`](docs/03-uniswap-v4-hooks.md).

## 4. Architecture

```
                      ┌─────────────────────┐
                      │   ExampleToken       │  fixed-supply ERC-20
                      └──────────┬──────────┘
                                 │ one canonical v4 pool
                                 ▼
   ┌──────────────┐      ┌──────────────────┐      ┌─────────────────────────┐
   │ Uniswap v4   │◀────▶│  ExampleV4Hook   │      │ ImmutablePositionLocker │
   │ PoolManager  │      │ observes swaps + │      │ principal locked;       │
   └──────┬───────┘      │ liquidity → state│      │ fees to fixed recipients│
          │ mints LP NFT └────────┬─────────┘      └─────────────────────────┘
          ▼                       │ read (view)
   ┌──────────────┐               ▼
   │PositionManager│      ┌──────────────────┐   ┌────────────────────────┐
   │  (v4 NFT)     │      │  ExampleArtNFT   │──▶│  Renderer (your art):  │
   └──────────────┘      │  ERC-721 + 4906  │   │  Sigil / Strata /      │
                         │ injects holder ct │   │  Orbital / bring-your- │
                         └──────────────────┘   │  own via RendererBase  │
                                                └────────────────────────┘
```

## 5. How it works (5 steps)

1. **Deploy** the token, then the hook (to a CREATE2-mined address whose bits declare its
   permissions), then the renderer and NFT.
2. **Bind** the canonical PoolKey to the hook (one-shot), recording the exact opening price.
3. **Initialize** the pool at that price; the hook rejects any other price.
4. **Add** the whole supply as a single-sided position and **lock** the LP NFT in the custodian.
5. **Trade.** Every swap updates market state; `tokenURI` renders each piece from its DNA plus
   that live state.

## 6. Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge` ≥ 1.0)
- Node.js ≥ 20 and npm
- git

## 7. Quick start (~15 minutes)

```bash
git clone <your-fork-url> relics-v4-starter
cd relics-v4-starter
# no submodules: all Solidity dependencies are vendored under lib/

# contracts
forge build
forge test

# generate example art (writes deterministic SVGs to output/examples/)
forge script script/GenerateExamples.s.sol --tc GenerateExamples

# web app
npm install
npm run web:dev   # http://localhost:3000
```

That is the whole loop with no network and no secrets. Everything below is optional and for
taking it on-chain.

## 8. Run the tests

```bash
forge test                       # unit + fuzz + invariant + local deployment integration
forge test --match-path "test/fork/*"   # fork tests (self-skip if MAINNET_RPC_URL is unset)
forge build --sizes | grep -E "Renderer"   # EIP-170 budget check (all art systems)
```

Test layout: `test/unit`, `test/fuzz`, `test/invariant`, `test/fork`, `test/deployment`, with
mocks under `test/mocks` and shared v4 scaffolding in `test/utils`.

## 9. Generate art

```bash
mkdir -p output/examples   # first time only
RENDERER_STYLE=orbital forge script script/GenerateExamples.s.sol --tc GenerateExamples
# styles: sigil (default) | strata | orbital
# optional knobs: EXAMPLE_COUNT, MARKET_DRAWDOWN, MARKET_SWAPS, MARKET_VOLATILITY, MARKET_HOLDERS, MARKET_EPOCH
```

Regeneration at the same commit is byte-identical — that reproducibility is your art-integrity
check.

## 10. Start the web app

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # optional; edit to point at a deployment
npm run web:dev
```

The app works offline with deterministic local fixtures (Explore page) and fails closed on any
surface you have not configured.

## 11. Customize the art

Pick one of three shipped art systems with `rendererStyle` (`sigil` | `strata` | `orbital`), or
**bring your own**: extend [`RendererBase`](src/RendererBase.sol) and implement the single seam
`_renderArt(tokenId, dna, market)`. The base handles JSON + base64 + canvas and gives you shared
palette/number helpers. Keep every market-driven loop bounded, and after every edit run
`forge build --sizes` — every renderer must stay under 24,576 bytes. See
[`docs/00`](docs/00-make-it-your-own.md), [`docs/06`](docs/06-onchain-renderer.md), and
[`docs/16`](docs/16-renderer-size-budget.md).

## 12. Customize the hook (market → art mapping)

Edit `src/ExampleV4Hook.sol` in two clearly-marked places: the `CUSTOMIZE` signal weights, and
`_evolveState(MarketState, MarketEvent)` — the single function mapping each market event to the
next state. You do NOT touch the v4 plumbing. If you change which callbacks the hook uses, update
`getHookPermissions` **and** the flag constant, then re-mine the address. Keep callbacks bounded;
never render or loop over NFTs inside them. See [`docs/04`](docs/04-the-hook.md) and
[`docs/00`](docs/00-make-it-your-own.md).

## 13. Mine the hook address

```bash
POOL_MANAGER=0x... ART_TOKEN=0x... HOOK_OWNER=0x... \
  forge script script/MineHookAddress.s.sol --tc MineHookAddress
```

Mine against the **exact** constructor args you will deploy with. See
[`docs/13`](docs/13-mining-hook-address.md).

## 14. Deploy to Sepolia

```bash
POOL_MANAGER=0x... WETH=0x... INITIAL_HOLDER=0x... HOOK_OWNER=0x... \
  forge script script/DeployExample.s.sol --tc DeployExample \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

Look up the canonical Uniswap v4 addresses for your chain from the official Uniswap deployments
docs; this repo ships no baked-in address book. Full sequence in
[`docs/14`](docs/14-deploy-and-pool.md).

## 15. Create the pool

```bash
POOL_MANAGER=0x... HOOK=0x... ART_TOKEN=0x... WETH=0x... LAUNCH_TICK=-23040 \
  forge script script/BindAndCreatePool.s.sol --tc BindAndCreatePool \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $HOOK_OWNER_PRIVATE_KEY
```

Bind **before** initialize so a wrong opening price is rejected.

## 16. Add liquidity

```bash
POSITION_MANAGER=0x... PERMIT2=0x... ART_TOKEN=0x... WETH=0x... HOOK=0x... \
LP_RECIPIENT=0x... LAUNCH_TICK=-23040 LIQUIDITY=... \
  forge script script/AddLiquidity.s.sol --tc AddLiquidity \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

Single-sided by design. **Read the new position id from the tx receipt** — never a simulation
([`docs/11`](docs/11-position-manager-token-id.md), [`docs/08`](docs/08-genesis-liquidity.md)).

## 17. Lock liquidity (preserving fees)

```bash
POSITION_MANAGER=0x... ART_TOKEN=0x... WETH=0x... TREASURY=0x... \
ENTOMBMENT=0x000000000000000000000000000000000000dEaD POSITION_ID=<from receipt> \
  forge script script/LockPosition.s.sol --tc LockPosition \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

Principal becomes permanent; `collectFees()` stays permissionless and routes to immutable
recipients. This is **not** a burn ([`docs/09`](docs/09-locker-and-lp-finality.md)).

## 18. Verify the contracts

```bash
TOKEN=0x... HOOK=0x... RENDERER=0x... NFT=0x... \
  forge script script/VerifyDeployment.s.sol --tc VerifyDeployment --rpc-url $SEPOLIA_RPC_URL
```

Reverts on the first inconsistency, so it doubles as an operational gate. Also verify source on a
block explorer for your chain.

## 19. Configure the website

Put your identity and deployed addresses in [`config/collection.config.ts`](config/collection.config.ts)
(`addressesByChain[<chainId>]`). For per-deploy hosting you can also set `NEXT_PUBLIC_*` in
`apps/web/.env.local` (see `apps/web/.env.example`), which override the config. Unset surfaces stay
"not configured." Public env is read **statically** — never dynamically
([`docs/17`](docs/17-frontend-integration.md)).

## 20. Mainnet safety checklist

- [ ] Full rehearsal on a fork / Sepolia, including a real swap and a fee collection.
- [ ] Token sort order chosen deliberately (art token as currency0 for single-sided routing).
- [ ] Hook address bits verified `== 0x1440`; mined against the real constructor args.
- [ ] Canonical pool bound **before** initialize; opening price asserted.
- [ ] Position id read from the confirmed receipt (never a simulation).
- [ ] LP locked in the immutable custodian; `feePolicyHash()` recorded.
- [ ] Owner powers (token/hook) renounced only after proofs exist; never claim a renounce before
      the tx and post-state reads exist.
- [ ] No project-funded bootstrap buy. Launch on real, independent trades.
- [ ] Honest launch language (see [`docs/15`](docs/15-launch-economics.md)); never "LP burned."
- [ ] No signing secret in any hosting environment.
- [ ] Independent security + legal review completed.

## 21. Security warnings

Read [`SECURITY.md`](SECURITY.md). Highlights: hook callbacks must stay bounded; only the
canonical pool may drive art state; market signals and randomness must never gate financial
outcomes; the renderer must stay under EIP-170; treat marketplace metadata as a cache of the
canonical `tokenURI`.

## 22. Project structure

```
config/         collection.config.ts — the ONE web/human config surface
src/            contracts: token, hook, NFT, RendererBase + 3 art systems, locker, interfaces/, libraries/
script/         Foundry tooling (config/DeployConfig.s.sol + mine/deploy/bind/liquidity/lock/verify/art)
test/           unit/ fuzz/ invariant/ fork/ deployment/ + mocks/ + utils/
apps/web/       config-driven Next.js app (wagmi/viem, EIP-6963)
docs/           make-it-your-own guide + 18 numbered guides
docs/launchpad/ RELICS Launchpad creator guide (the launchpad is a separate system)
scripts/        secret scan, manifest generator, link checker (Node)
.github/        CI workflows + issue/PR templates
lib/            vendored, production-pinned deps (forge-std, uniswap-hooks, v4-core, v4-periphery, OZ, solmate, permit2)
flagship/       the exact deployed RELICS production hook (byte-identical to Etherscan) + offline CREATE2 proof
submissions/    Programmable Builder Beta application package (relics-v4)
```

## 23. Docs index

| # | Guide |
| --- | --- |
| 00 | [Make it your own (start here)](docs/00-make-it-your-own.md) |
| 01 | [System overview](docs/01-system-overview.md) |
| 02 | [Contracts and the token](docs/02-contracts-and-token.md) |
| 03 | [Uniswap v4 hooks, from zero](docs/03-uniswap-v4-hooks.md) |
| 04 | [The hook in detail](docs/04-the-hook.md) |
| 05 | [NFT and awakening](docs/05-nft-and-awakening.md) |
| 06 | [On-chain renderer](docs/06-onchain-renderer.md) |
| 07 | [Market state as art](docs/07-market-state-as-art.md) |
| 08 | [Genesis liquidity](docs/08-genesis-liquidity.md) |
| 09 | [Locker and LP finality](docs/09-locker-and-lp-finality.md) |
| 10 | [Twenty hard-won lessons](docs/10-twenty-lessons.md) |
| 11 | [PositionManager token id](docs/11-position-manager-token-id.md) |
| 12 | [Token sort order](docs/12-token-sort-order.md) |
| 13 | [Mining the hook address](docs/13-mining-hook-address.md) |
| 14 | [Deploy and pool](docs/14-deploy-and-pool.md) |
| 15 | [Launch economics](docs/15-launch-economics.md) |
| 16 | [Renderer size budget](docs/16-renderer-size-budget.md) |
| 17 | [Frontend integration](docs/17-frontend-integration.md) |
| 18 | [FAQ](docs/18-faq.md) |
| + | [Exporting on-chain SVG as PNG](docs/exporting-onchain-svg-as-png.md) |

Building on the RELICS Launchpad instead of forking this template? That is a separate guide:
[`docs/launchpad/`](docs/launchpad/).

## 24. Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
Contributions are judged by how well they teach a real pattern. Never add secrets or private data.

## 25. License

MIT — see [`LICENSE`](LICENSE). Third-party dependencies keep their own licenses; note that
**Uniswap v4-core is BUSL-1.1** (a dependency, not vendored here) — see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## 26. Disclaimer

This is **educational** software provided "as is," without warranty of any kind. It is **not
audited** and **not production-ready**. It is **not affiliated with or endorsed by** Uniswap,
OpenZeppelin, OpenSea, Foundry, any auditor, or any production collection. It contains **no
private or production material** — no real addresses, keys, or proofs. Nothing here is financial,
legal, or investment advice. Deploying tokens, launching liquidity, and distributing NFTs can
carry serious security, legal, tax, and regulatory consequences; obtain your own qualified review
before doing anything real. You are solely responsible for your use of this code.

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
