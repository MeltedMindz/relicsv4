# 00 — Make it your own

This is a **fork-and-launch template**. You can ship YOUR own fully on-chain art collection —
linked to an ERC-20, with a Uniswap v4 hook turning swaps, liquidity, volatility, and market
history into live artistic evolution — by customizing four layers and running the tooling. **The
market becomes the art.**

You do not need to read the whole codebase. Change the small, clearly-marked set of things below.

---

## The one config surface

There are two config entry points, mirrored to each other:

| File | Drives | Language |
| --- | --- | --- |
| [`config/collection.config.ts`](../config/collection.config.ts) | the web app + human identity | TypeScript |
| [`.env`](../.env.example) → [`script/config/DeployConfig.s.sol`](../script/config/DeployConfig.s.sol) | the Foundry deploy scripts | env vars |

Keep them in sync (name, symbol, supply, max supply, fee, tick spacing, art style). Everything a
forker changes is reachable from these, or pointed to from here (the on-chain art-mapping WEIGHTS
live in the contracts, marked `CUSTOMIZE`, and are called out below).

Inside the contracts, search for **`CUSTOMIZE`** — every knob is tagged.

---

## Step 1 — Rebrand

- Set `tokenName`, `tokenSymbol`, `nftName`, `nftSymbol`, `tagline`, `description` in
  `config/collection.config.ts`.
- Mirror them in your `.env`: `COLLECTION_TOKEN_NAME`, `COLLECTION_TOKEN_SYMBOL`,
  `COLLECTION_NFT_NAME`, `COLLECTION_NFT_SYMBOL`.

## Step 2 — Set tokenomics

- `tokenSupply` / `COLLECTION_TOKEN_SUPPLY` — total fixed supply (minted once).
- `tokenDecimals` — 18 by default (leave it unless you have a strong reason).
- `maxNftSupply` / `COLLECTION_MAX_NFT_SUPPLY` — the collection's hard cap.
- Keep the token **plain**: no tax, blacklist, pause, or hidden mint. `ExampleToken` has a
  `CUSTOMIZE` block; the only knob is `HOLDER_THRESHOLD` (the minimum balance counted as an
  "active holder", a signal your art can read).

## Step 3 — Choose your market → art mapping (the fun part)

The hook (`src/ExampleV4Hook.sol`) captures these signals into a `MarketState`:

- **swaps**, **buy vs sell volume**, **volatility**, **all-time-high tick**, **drawdown**,
  **recovery**, **liquidity events**. (**Holder growth** is a token signal, injected into
  `MarketState.holderCount` by the NFT at render time.)

You change how strongly each drives the art in exactly two marked places:

1. The **weights/scales** constant block (`CUSTOMIZE ── market → art signal weights & scales`).
2. `_evolveState(MarketState, MarketEvent)` — the single pure function mapping each event to the
   next state. You never touch the v4 plumbing.

**To add a signal:** add a field to `IExampleHook.MarketState`, populate it in `_evolveState`,
read it in your renderer. **To remove one:** stop reading it.

Set `config.signals` (and the Home page will advertise which signals your collection uses).

## Step 4 — Replace the renderer with your art

The renderer is the art. This starter ships **three distinct sample systems** so the range is
obvious:

| Renderer | Idea | Signals it leans on |
| --- | --- | --- |
| `ExampleOnchainRenderer` ("Sigil") | rings + rotating polygon core | volatility, drawdown, recovery, swaps |
| `StrataRenderer` ("Strata") | market history as sediment bands | epoch, buy/sell, drawdown, recovery |
| `OrbitalRenderer` ("Orbital") | nucleus + orbiting bodies | holders, swaps, volatility, drawdown |

Pick one with `rendererStyle` / `RENDERER_STYLE` (`sigil` | `strata` | `orbital`). Preview any of
them offline:

```bash
RENDERER_STYLE=orbital MARKET_HOLDERS=25 MARKET_SWAPS=12 \
  forge script script/GenerateExamples.s.sol --tc GenerateExamples
```

**Bring your own art:** extend [`RendererBase`](../src/RendererBase.sol) and implement the single
seam `_renderArt(tokenId, dna, market) → SVG`. The base does the JSON + base64 + canvas wrapping
and gives you shared palette/number helpers. Keep `_renderArt` pure and BOUNDED (no unbounded
loops) and watch the EIP-170 size gate:

```bash
forge build --sizes | grep -E "Renderer"
```

See [06 — On-chain renderer](06-onchain-renderer.md) and [16 — Size budget](16-renderer-size-budget.md).

## Step 5 — Decide how pieces are acquired

`ExampleArtNFT` ships the **awaken** model: receiving the token mints nothing; a holder explicitly
calls `awaken(count)`, capacity derived from holdings, bounded per call. It is a clean, swappable
pattern. Want a paid public sale, an allowlist, or a free mint instead? Replace `awaken` — the
hook and renderer do not care HOW a piece is minted, only that it has immutable DNA. See
[05 — NFT and awakening](05-nft-and-awakening.md).

## Step 6 — Run the tests + generate art

```bash
forge test
RENDERER_STYLE=<your style> forge script script/GenerateExamples.s.sol --tc GenerateExamples
node apps/web/... # or: npm run web:dev  (Explore renders your configured art style)
```

## Step 7 — Deploy to a testnet, create the pool, add + lock liquidity

Set your infra + secrets in `.env` and run the parameterized scripts — **no code edits**:

```bash
# mine + deploy (identity comes from your COLLECTION_* env / config)
forge script script/DeployExample.s.sol --tc DeployExample --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
# bind + init the pool (fee/spacing/tick from your env)
forge script script/BindAndCreatePool.s.sol --tc BindAndCreatePool --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $HOOK_OWNER_PRIVATE_KEY
# single-sided genesis liquidity; READ the position id from the receipt (docs/11)
forge script script/AddLiquidity.s.sol --tc AddLiquidity --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
# lock principal, keep fees flowing
forge script script/LockPosition.s.sol --tc LockPosition --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
# verify wiring
forge script script/VerifyDeployment.s.sol --tc VerifyDeployment --rpc-url $SEPOLIA_RPC_URL
```

Full detail + ordering rules: [14 — Deploy and pool](14-deploy-and-pool.md),
[08 — Genesis liquidity](08-genesis-liquidity.md), [12 — Token sort order](12-token-sort-order.md).

## Step 8 — Wire the web app

Put your deployed addresses into `config/collection.config.ts` → `addressesByChain[<chainId>]`
(or set the `NEXT_PUBLIC_*` env vars, which override). The Home / Acquire / Mint / Explore pages
render your collection from the config + on-chain reads, failing closed on anything unset. See
[17 — Frontend integration](17-frontend-integration.md).

## Step 9 — Mainnet, after review

Only after your own security + legal + economic review. Follow the
[mainnet safety checklist](../README.md#20-mainnet-safety-checklist). No project-funded bootstrap
buy; honest launch language ([15](15-launch-economics.md)); never call the locked LP "burned".

---

## Recipes: change the market → art mapping

All of these are small edits to the hook's `CUSTOMIZE` block and `_evolveState`, and to your
renderer's `_renderArt`.

### "Make volatility scar the art"
In `_evolveState`, volatility already tracks tick movement. Lower `VOLATILITY_SMOOTHING_NUM/DEN`
so it reacts faster. In `_renderArt`, drive a jagged overlay or stroke roughness from
`market.volatility` (e.g. offset polygon vertices by `volatility % N`, as the Sigil core twist
does).

### "Make holder growth brighten it"
The NFT injects `market.holderCount`. In `_renderArt`, scale a glow/opacity or a core size with
`holderCount` (as `OrbitalRenderer` grows its nucleus). No hook change needed.

### "Make a drawdown bury the piece, recovery lift it"
`drawdownBand` and `recoveryBand` are already computed. In `_renderArt`, fade/darken with
`drawdownBand` and brighten/raise a horizon with `recoveryBand` (as `StrataRenderer` does).

### "Make buying warm the palette, selling cool it"
Compare `cumulativeBuyVolume` vs `cumulativeSellVolume` in `_renderArt` and pick a warmer/cooler
palette or skew band colors (as `StrataRenderer` flips its band phase on buy/sell dominance).

### "Age the collection faster"
Lower `EVENTS_PER_EPOCH` in the hook, or raise the per-event weights, so `epoch` climbs sooner —
`StrataRenderer` lays down bands per epoch, so the piece grows deeper faster.

### "Add a brand-new signal (e.g. average trade size)"
Add `avgTradeSize` to `MarketState`, update it in `_evolveState` (running mean of `e.volume` over
`swapCount`), and read it in `_renderArt`. Update the web ABI tuple in `apps/web/lib/abis.ts` if
the web needs to read it.

---

> Reminder: this is an **educational template**, **not audited**, and **not affiliated with**
> Uniswap, OpenZeppelin, OpenSea, or any auditor. Your fork is your responsibility — get your own
> security, legal, and economic review before launching.
