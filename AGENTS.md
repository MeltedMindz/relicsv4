# AGENTS.md — relics-v4-starter

Guidance for any AI coding agent (Claude, Cursor, Copilot, Codex, Aider, …) working in this
repository. This is the canonical agent guide; `CLAUDE.md` points here. If you help someone
fork and launch their own collection, read this first, then `docs/00-make-it-your-own.md`.

## What this repo is

A **fork-and-launch template** for a fully on-chain generative art collection linked to an
ERC-20, with a **Uniswap v4 hook** that turns swaps, liquidity, volatility, and market
history into live on-chain artistic evolution. The market becomes the art. A forker changes
a small, clearly marked set of things and ships their own collection without reading the
whole codebase.

It is **educational, unaudited, and MIT-licensed**, and **not affiliated** with Uniswap,
OpenZeppelin, OpenSea, or any production collection. It contains no production deployment.
Every contract here is an original, genericized `Example*` implementation.

## Ground rules — do not break these

1. **Clean-room / no private data, ever.** Never add production addresses, CREATE2 salts,
   position ids, pool ids, tx hashes, deploy keys, mnemonics, `.env` values, audit proofs, or
   any private document. See `NO_PRIVATE_DATA_ATTESTATION.md` and `PUBLIC_EXPORT_ALLOWLIST.md`.
   Run `npm run secrets:scan` before every commit.
2. **Reference dependencies; do not vendor them.** Solidity deps are git submodules (`lib/`);
   the web app uses public npm. Do not copy third-party source into the tree.
3. **Keep every public word true.** This is a teaching repo. No "audited", no "guaranteed",
   no affiliation claims, no financial promises. Never call locked LP "burned".
4. **Self-update rule.** Any change to contracts, tokenomics, deploy behavior, the renderer's
   size/visual language, or the safety posture MUST update the affected `docs/` in the same
   change set. A doc that contradicts the code is a bug.
5. **Do not self-publish.** Commit locally, run the secret scan, and stop. Publication is a
   human decision after an independent secret/privacy/provenance review.

## Repository map

```
src/
  ExampleToken.sol           fixed-supply ERC-20; constructor-driven identity; stays plain
  ExampleV4Hook.sol          observes ONE canonical pool; maps events -> MarketState
  ExampleArtNFT.sol          ERC-721, on-chain metadata, explicit awaken model, holderCount
  RendererBase.sol           shared JSON/base64/canvas + the single _renderArt seam
  ExampleOnchainRenderer.sol  sample renderer "Sigil"   (rings + rotating core)
  StrataRenderer.sol          sample renderer "Strata"  (market history as sediment)
  OrbitalRenderer.sol         sample renderer "Orbital" (nucleus + orbiters)
  ImmutablePositionLocker.sol ownerless LP custodian: principal locked, fees route immutably
  interfaces/  libraries/
config/collection.config.ts  ONE config surface for the web app + human identity
script/
  config/DeployConfig.s.sol  contract-side config, read from .env
  MineHookAddress · DeployExample · BindAndCreatePool · AddLiquidity · LockPosition ·
  VerifyDeployment · GenerateExamples · ChainConfig
apps/web/                    Next.js App Router, wagmi + viem, EIP-6963, no WalletConnect id
test/                        unit / fuzz / invariant / fork (self-skipping) / deployment
docs/                        00 (make it your own) … 18 (FAQ) + PNG-export guide
```

Deps: Foundry (`forge`), Node ≥ 20 (npm workspaces; web lives in `apps/web`).

## The customization surface (what a forker actually edits)

Two mirrored config entry points — keep them in sync:

| File | Drives | Language |
| --- | --- | --- |
| `config/collection.config.ts` | web app + identity | TypeScript |
| `.env` → `script/config/DeployConfig.s.sol` | Foundry deploy scripts | env vars |

Inside the contracts, everything a forker changes is tagged **`CUSTOMIZE`** — grep for it.
The four layers to change, in order (full walkthrough in `docs/00-make-it-your-own.md`):

1. **Rebrand** — token/NFT name, symbol, tagline in the config + `COLLECTION_*` env.
2. **Tokenomics** — fixed `tokenSupply`, `maxNftSupply`. Keep the token plain: no tax,
   blacklist, pause, or hidden mint. The one knob is `HOLDER_THRESHOLD`.
3. **Market → art mapping** (the interesting part) — the hook captures swaps, buy/sell volume,
   volatility, all-time-high tick, drawdown, recovery, liquidity events (holder growth is
   injected by the NFT). Change strength in two marked places: the weights/scales block and
   the single pure `_evolveState(MarketState, MarketEvent)`. You never touch v4 plumbing.
4. **Renderer** — the renderer is the art. Pick a sample with `rendererStyle`
   (`sigil|strata|orbital`), or bring your own by extending `RendererBase` and implementing
   `_renderArt(tokenId, dna, market) → SVG`. Keep it pure, deterministic, and bounded.

Acquisition is swappable too: `ExampleArtNFT` ships the `awaken(count)` model, but the hook
and renderer only require a piece to have immutable DNA — replace `awaken` with a sale,
allowlist, or free mint if you prefer (`docs/05`).

## Architecture facts that bite

- **Hook flags == address bits.** `ExampleV4Hook` needs `afterInitialize | afterAddLiquidity
  | afterSwap` → the address's low 14 bits must equal `0x1440`. Mine a CREATE2 salt against
  the EXACT init code + constructor args (`HookMiner`). Change any constructor arg → re-mine.
- **Bind before initialize.** `bindCanonicalPool` is one-shot and records the exact expected
  opening price; `_afterInitialize` reverts otherwise. Every callback validates the full
  PoolKey including `hooks == address(this)`.
- **Callbacks are bounded.** Fixed-size struct writes only — no arrays, no untrusted external
  calls, no NFT work, and no rendering in a swap path.
- **Market state is art entropy, never an oracle.** Ticks/volumes/randomness must never gate
  a financial outcome (what anyone can buy, sell, or withdraw).
- **Awakening is explicit.** Receiving the token mints nothing. `awaken(count)` is
  `msg.sender`-only, bounded per call, with capacity DERIVED (`balanceOf/1e18 −
  nft.balanceOf`) and never stored. Uses `_mint`, not `_safeMint` (recipient is the caller).
- **Renderer respects EIP-170 (24,576 bytes).** `test/unit/Renderers.t.sol` pins each
  renderer's size; measure with `forge build --sizes | grep -E "Renderer"` after every edit.
  Trig uses 15°-snapped integer tables (no floats); all market-driven loops are hard-capped.
- **Token sort order decides routability.** For a single-sided launch the art token usually
  wants to be `currency0` (sort below the quote asset). See `docs/12`.
- **Read the PositionManager token id from the receipt, never a simulation.** See `docs/11`.
- **Web app uses STATIC public env only.** Never `process.env[key]`, `Object.entries`, or
  spread over env. Unset/zero addresses render "not configured" (fail-closed).

## Commands

```bash
forge build && forge test && forge fmt              # core Solidity loop
forge build --sizes | grep -E "Renderer"            # after EVERY renderer edit (EIP-170 gate)
forge script script/GenerateExamples.s.sol --tc GenerateExamples   # render sample art offline
RENDERER_STYLE=orbital MARKET_HOLDERS=25 forge script script/GenerateExamples.s.sol \
  --tc GenerateExamples                             # preview a style with market inputs

npm install
npm run web:dev                                     # local site (Explore renders your art)
npm run web:build && npm run web:lint && npm run web:typecheck && npm run web:test

npm run secrets:scan                                # REQUIRED before committing
node scripts/gen-manifest.mjs                       # refresh export manifest after file changes
node scripts/check-links.mjs                        # docs link integrity
```

Deploy flow (testnet first; all scripts are env-driven, no code edits): `DeployExample` →
`BindAndCreatePool` → `AddLiquidity` (read the position id from the receipt) → `LockPosition`
→ `VerifyDeployment`. Detail in `docs/14`, `docs/08`, `docs/12`; mainnet only after your own
security, legal, and economic review (`README.md` §20). No project-funded bootstrap buy.

## When you help a forker

Verify claims against the actual code and the size gate, not against memory. Keep the token
plain and the callbacks bounded. Keep the config surface and `docs/` in sync with any change.
Preserve fail-closed behavior in the web app. And keep every public word true — this repo's
credibility is that it does exactly what it says.
