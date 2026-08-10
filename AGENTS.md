# AGENTS.md — relics-v4-starter

Guidance for any AI coding agent (Claude, Cursor, Copilot, Codex, Aider, …) working in this
repository. This is the canonical agent guide; `CLAUDE.md` points here. If you help someone
fork and launch their own collection, read this first, then `docs/00-make-it-your-own.md`.

---

## START HERE: "how do I create a project?"

This is the request the repository exists to answer. The user wants a `.relics` bundle — one
file describing a generative art project, which they import into the RELICS Launchpad creator
app. It is entirely local: nothing in this CLI signs, broadcasts, or contacts a network.

```bash
npm install                                  # once
npm run kit -- templates                     # what they can start from
npm run kit -- init my-project --template minimal
# REQUIRED before export: set earnings.creatorRecipient in my-project/relics.config.json
# to your own wallet. The scaffold ships a placeholder and validation fails until you change it.
npm run kit -- dev my-project                # local studio on 127.0.0.1
npm run kit -- test-seeds my-project --count 100
npm run kit -- validate my-project           # every check, writes nothing
npm run kit -- export my-project --output my-project.relics
```

The `--` in `npm run kit -- <command>` is required; without it npm swallows the flags.

**Templates:** `minimal`, `solidity-svg-params`, `onchain-js`, `market-responsive`,
`static-art`. Start a beginner on `minimal`. Reach for `market-responsive` when they want the
pool's own trading history to drive the image — that is the platform's whole idea, and the
template demonstrates the sensor→transform→destination vocabulary so they don't invent one.

**What a creator edits:** `generator/` (the art), `traits/schema.json`,
`market/mappings.json`, `metadata/collection.json`. Read `docs/creator-kit/` before
improvising: the manifest key space is closed, and the validator — not your intuition — is the
authority on what a bundle may contain.

**`export` refuses to write a bundle that fails validation, and there is no `--force`.** When
it fails, fix the project. Never hand-assemble a `.relics` file, never edit one after export,
and never route around the validator: every file is digest-pinned and the importer re-checks.

### When `validate` fails

The message names the file and the rule. In practice it is almost always one of these:

| Symptom | Cause |
|---|---|
| `EARNINGS_RECIPIENT_PLACEHOLDER` | the scaffold's placeholder wallet. Edit `relics.config.json`; the message says so |
| `ART_BINDING_MISMATCH` | the manifest's binding does not follow from the bundle's own bytes. Something was hand-edited — re-export instead of patching |
| `ART_BINDING_CHAIN_CLAIM` | a bundle tried to state `runtimeCodeHash` or `scriptPointer`. Those are chain facts; they are always `null` |
| `METADATA_NO_IMAGE` (warn) | no collection image; marketplaces show a blank tile |
| `TRAITS_SPACE_TOO_SMALL` (warn) | the trait schema expresses fewer combinations than the mint size |
| non-determinism | `Math.random()`, `Date.now()`, or state carried between renders. Use the seeded PRNG. |
| byte budget | the script is stored on chain and has a hard ceiling |
| network access | a generator that fetches anything is refused; assets travel in the bundle |
| blank / duplicate output | `test-seeds --count 100` catches collapse-to-one-image and dead seeds |
| market mapping rejected | sensors, transforms and destinations are a closed set — check against the schema |

### Five things you must not tell a creator

Accuracy rules, not style. Each one is a false claim if you get it wrong.

1. **The launchpad is not deployed** (`PREPARED_NOT_DEPLOYED` on 1 / 8453 / 4663) and there is
   no launchpad address. A creator can build and export today; they cannot launch.
2. **No external audit has happened.** Review is internal only.
3. **Creator art reaches `tokenURI` through the art binding — and only through it.** A bundle
   carries an `artBinding` block naming the runtime (`ONCHAIN_JAVASCRIPT_V1`, `SOLIDITY_SVG_V1`)
   and the keccak256 of the exact bytes that runtime is given; a launch writes that record into
   the collection, and `tokenURI` renders from it. Two things stay true and must be said if
   asked: the launchpad is **not deployed anywhere**, so nobody can launch yet (rule 1); and the
   binding a bundle carries is the launchpad release named in
   `protocolReleaseCompatibility` — a bundle never states which renderer is deployed at which
   address. `runtimeCodeHash` and `scriptPointer` are chain facts, always `null` in a bundle,
   and refused by name if filled in.
4. **Approved is not launchable.** `APPROVED_ART_RUNTIMES` is what the format accepts;
   `LAUNCHABLE_ART_RUNTIMES` is what the launchpad binds and renders. A template on an approved
   but gated runtime ships and is MARKED — never deleted, never presented as launchable.
5. **A bundle can never carry protocol code.** `.sol`/`.vy`/`.yul`/`.wasm` are refused by
   extension and the manifest key space is closed, so no bundle can replace the hook, token,
   collection, escrow, router or buyback. A custom hook needs a separate reviewed process.

---

## What this repo is

Three things under one roof:

1. **`docs/launchpad/` — the RELICS Launchpad creator guide.** Documentation only: how an
   artist or developer builds and launches a project on the launchpad, what one `launch()`
   produces, the art runtimes, the constraints, the creator flow, the fee split, and the
   SDK/ABI surface. **The launchpad is `PREPARED_NOT_DEPLOYED` on Ethereum (1), Base (8453)
   and Robinhood Chain (4663)** — no factory, locker or registry exists on any chain. Review
   to date is **internal only**; there is **no external audit**. No launchpad contract source
   lives in this repo.
2. **The fork-and-launch template** (`src/`, `script/`, `test/`, `apps/web/`, `docs/00`–`18`)
   for a fully on-chain generative art collection linked to an ERC-20, with a **Uniswap v4
   hook** that turns swaps, liquidity, volatility, and market history into live on-chain
   artistic evolution. A forker changes a small, clearly marked set of things and ships their
   own collection without reading the whole codebase. It is **educational, unaudited, and
   MIT-licensed**, and **not affiliated** with Uniswap, OpenZeppelin, OpenSea, or any
   production collection. Every contract here is an original, genericized `Example*`
   implementation.
3. **`flagship/`** — the operator-authorized production source of the live RELICS v4 hook.
4. **The creator kit** (`packages/project-schema/`, `packages/creator-cli/`, `docs/creator-kit/`)
   — the local half of the launchpad creator flow. `@relics/project-schema` is the ONE
   definition of the `.relics` project bundle: container, schema, validator, hashes and the
   studio-draft projection, in zero-dependency ESM with no build step. The `relics` CLI
   (`npm run kit -- …`) scaffolds, previews, validates and exports a bundle; the launchpad web
   importer consumes the same package so both sides derive identical hashes.

   **Never fork the schema.** If a field, a limit or a vocabulary entry changes, change it in
   `packages/project-schema/` and nowhere else — a schema that is closed on one side and open on
   the other is not closed. A bundle configures art, traits, metadata, declarative sensor
   mappings, earnings, supply and artwork backing; it may **never** carry hook Solidity,
   bytecode, an address to call, or anything that could replace ArtHook, the economic or
   liquidity kernels, ProjectToken, ProjectCollection, the sale escrow, the router or the
   buyback. Custom hooks go through a separate reviewed process.

   Gates: `npm run kit:test`, `npm run kit:templates`, `npm run kit:fixtures` (regenerating the
   fixtures must produce no diff). Hostile and parity fixtures live in
   `packages/project-schema/fixtures/`.

The template and the launchpad are **separate systems that share no code**. Do not describe
template behavior as launchpad behavior or vice versa, and do not let one guide's numbers
(fee tiers, splits, byte budgets) leak into the other. The creator kit belongs to the launchpad
side: it produces launchpad project bundles, never template deployments.

### Launchpad-doc accuracy rules — never relax these

- Never write that the launchpad is live, deployed, launched, or shipping. Never publish a
  launchpad contract address; none is deployed.
- Never call any review "audited", "externally audited", or "security reviewed".
- The fee split is of **collected LP fees**, never of volume: 75% creator / 25% platform;
  the platform's own share splits in half, so nominally 75.00 / 12.50 / 12.50. The technical
  sentence is "50% of the launchpad's net platform-fee revenue is allocated to RELICS
  buy-and-entomb" — never "50% of all trading fees", "of creator fees", "of the pool fee", or
  anything involving Uniswap's protocol fee. The exact invariant is on net SETTLED platform
  WETH, after conversion fees, slippage and rounding; those costs fall on the platform share
  only, never on the creator's.
- Say **buy-and-entomb**, never "burn". $RELICS is bought and sent permanently to `0x…dEaD`, so
  spendable and circulating supply fall — but `totalSupply` does NOT fall and no ERC-20 burn
  event occurs, because the token has no burn function. State all three together.
- **Never restate the numbers.** `packages/project-schema/src/economics.js` declares them once;
  everything else imports. `npm run kit:economics` fails on a second declaration or a retired
  figure outside a supersession header.
- Never claim the RELICS genesis LP is "burned", "locked forever", or "permanent", and never
  write "fees route immutably". Describe custody by what the bytecode contains.
- No attack, brick, or fee-collection exploit mechanics, thresholds, or costs — anywhere.
- The RELICS art collection lives at `https://www.relics.wtf`. The creator app is not
  publicly hosted; do not invent URLs or link to routes you have not confirmed exist.

## Ground rules — do not break these

1. **No private data, ever.** Never add deploy keys, mnemonics, wallet/keystore files, `.env`
   values, RPC credentials, internal audit proofs, or any private document. See
   `NO_PRIVATE_DATA_ATTESTATION.md` and `PUBLIC_EXPORT_ALLOWLIST.md`. Run
   `npm run secrets:scan` before every commit. One scoped exception exists: `flagship/` and
   `submissions/` carry the RELICS operator's explicitly authorized production reference —
   Etherscan-verified source plus public on-chain identifiers only (addresses, pool id, CREATE2
   salt/init-code hash). Public chain facts in that scope are allowed; private material never is.
2. **Dependencies are vendored, pinned and byte-exact.** Solidity deps live as real files under
   `lib/` (production-pinned trees: v4-core 1.0.2, uniswap-hooks 1.2.2, OpenZeppelin 5.6.1,
   v4-periphery 1.0.3, solmate, permit2, forge-std); the web app uses public npm. Never float,
   swap or partially update a vendored tree — the flagship deployment proof depends on exact
   bytes. See `THIRD_PARTY_NOTICES.md` for licenses.
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
  ImmutablePositionLocker.sol ownerless LP custodian: no withdrawal path; fees to fixed recipients
  interfaces/  libraries/
config/collection.config.ts  ONE config surface for the web app + human identity
script/
  config/DeployConfig.s.sol  contract-side config, read from .env
  MineHookAddress · DeployExample · BindAndCreatePool · AddLiquidity · LockPosition ·
  VerifyDeployment · GenerateExamples · ChainConfig
apps/web/                    Next.js App Router, wagmi + viem, EIP-6963, no WalletConnect id
test/                        unit / fuzz / invariant / fork (self-skipping) / deployment
docs/                        00 (make it your own) … 18 (FAQ) + PNG-export guide
docs/launchpad/              RELICS Launchpad creator guide (docs only; separate system)
docs/creator-kit/            bundle format, CLI, security model, importer contract
packages/project-schema/     @relics/project-schema — the ONE .relics definition + fixtures
packages/creator-cli/        the `relics` CLI and its starter templates
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
