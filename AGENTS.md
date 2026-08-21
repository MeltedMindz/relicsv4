# AGENTS.md — the creator-agent contract

Guidance for **any** AI coding agent — Claude Code, Codex, Cursor, Copilot-style agents, Aider,
or anything else — working in this repository. This is the canonical agent guide. `CLAUDE.md`
points here and adds nothing.

Read this file before you touch anything. If you are helping someone build an art project, §1–§9
are your job and you can ignore the rest. If you are helping someone fork the Solidity template,
read §11.

---

## 0. What an agent is NOT allowed to do

These are not style preferences. Each one is a way to produce a broken project or a false claim,
so treat every line as a hard stop.

1. **Never edit `packages/project-schema/` to make a project validate.** The schema is the single
   definition of the `.relics` format, shared byte-for-byte with the importer. Widening it locally
   does not make a bundle launchable — it makes a bundle that passes on your machine and is refused
   everywhere else. If a project does not fit the schema, change the project.
2. **Never invent a manifest field, sensor, transform, destination, runtime, or trait key.** All of
   these are closed sets. An unknown key is refused, not ignored. When you need a name, read it out
   of `packages/project-schema/src/vocabulary.js` — do not guess from context.
3. **Never bypass, weaken, or work around validation.** No hand-assembled `.relics`, no editing a
   bundle after export, no patching a hash to match. Every file is digest-pinned and the importer
   re-derives everything.
4. **Never fabricate an address, a chain status, a hash, or a deployment claim.** If you need
   deployment state, run `npm run kit:status` and quote what it prints. Do not restate it from
   memory and do not carry it between sessions — it moves.
5. **Never describe protocol internals you have not read in this repo.** The launchpad's contract
   source is not here. If you cannot point at a file, say you do not know.
6. **Never commit, push, or publish.** Commit locally at most, and only when asked. Publication is
   a human decision.
7. **Never write a secret anywhere** — no keys, mnemonics, keystores, `.env` values, or
   credentialed RPC URLs. `npm run secrets:scan` before any commit.

If a creator asks you to do any of these, refuse and explain which one. "The validator won't let
me" is the correct answer, not a problem to route around.

---

## 1. START HERE — "help me make an art project"

This is the request the repository exists to answer. The creator wants a **`.relics` bundle**: one
file describing a generative art project, which they later import into the RELICS Launchpad creator
app. Everything is local. Nothing in this CLI signs a transaction, broadcasts, or contacts a
network.

Every command is `npm run kit -- <command>`. **The `--` is required** — without it npm swallows the
flags.

```bash
npm install                                             # once, in the repo root

npm run kit -- templates                                # what you can start from
npm run kit -- init ../my-project --template minimal \
    --name "My Project" --symbol MYPRJ                  # scaffold OUTSIDE the repo (see §2)

# edit ../my-project/relics.config.json, generator/, traits/, market/, metadata/

npm run kit -- preview ../my-project --count 12         # deterministic SVGs you can look at
npm run kit -- test-seeds ../my-project --count 100     # does it hold up across the collection?
npm run kit -- validate ../my-project                   # every check; writes nothing; exit 1 on failure
npm run kit -- export ../my-project --output ../my-project.relics
npm run kit -- inspect ../my-project.relics             # read back what you just shipped
```

`validate` and `export` exit `0` on success and `1` on failure. Warnings never fail a run; errors
always do. **Check the exit code — do not eyeball the output.**

### The loop that actually works

`init` → edit → `preview` → look at the art → edit → `test-seeds` → `validate` → fix → `export`.

Iterate on `preview` while the art is changing; it is fast and non-blocking. Only run `test-seeds`
and `validate` when you think you are close — they render in an isolated child process and cost
real seconds.

---

## 2. Scaffold outside the repository

`relics init <dir>` writes wherever you point it. **Point it outside this repo.** A project created
at the repo root shows up as untracked files in `git status`, is not covered by `.gitignore`, and
will be swept into a commit by anyone running `git add -A`.

```bash
npm run kit -- init ../my-project --template minimal      # good
npm run kit -- init my-project --template minimal         # bad: lands inside the repo
```

The creator's project is their work product, not a change to this repository. Keep them separate,
and tell the creator the absolute path you used.

---

## 3. Choose a template — and be honest about launchability

```bash
npm run kit -- templates
```

**Launchability is TWO questions — the RUNTIME and the CHAIN — and you must answer both.** The
runtime half: only `SOLIDITY_SVG` is bound and rendered by a launch, so the four JAVASCRIPT
templates cannot be launched anywhere yet, on an open chain or otherwise. The chain half: creator
launches are open on Ethereum (1), Base (8453) and Robinhood Chain (4663), and RC6 is not deployed
on BNB Smart Chain (56) — run `npm run kit:status` and quote that, never this table. Collapsing the
two into one "can I launch this?" gets a creator the wrong answer in both directions. The column
below is the runtime half only.

| id | runtime | bound and rendered first? | use it when |
| --- | --- | --- | --- |
| `minimal` | JAVASCRIPT | **no — preview only** | smallest complete project; a good first step |
| `market-responsive` | JAVASCRIPT | **no — preview only** | the pool's own trading history drives the image |
| `static-art` | JAVASCRIPT | **no — preview only** | seed-driven art that never changes after mint |
| `onchain-js` | JAVASCRIPT | **no — preview only** | writing tight against the 36,000-byte script budget |
| `solidity-svg-params` | SOLIDITY_SVG | **yes** | configuring a registered on-chain Solidity renderer by parameters |

**Approved is not launchable, and you must say so out loud.** `APPROVED_ART_RUNTIMES` is what the
bundle format accepts; `LAUNCHABLE_ART_RUNTIMES`
(`packages/project-schema/src/vocabulary.js`) is what the launchpad will actually bind and render.
Today only `SOLIDITY_SVG` is in the second set. A JAVASCRIPT project authors, previews, validates
and exports perfectly — and cannot launch yet. Nothing about the bundle has to change when that is
enabled.

The CLI already prints this at `init`, at `templates`, in `validate` (`ART_RUNTIME_PREVIEW_ONLY`)
and at `export`. Do not suppress it or paraphrase it away. **If a creator's priority is launching
soonest, that is `solidity-svg-params`; if their priority is the art, JavaScript is far more
expressive. State the trade-off and let them choose — do not choose silently.**

`relics templates` may also print a **reviewed protocol templates** section. Those are
operator-registered economics bindings, not art scaffolds, and they are never `relics init` targets.
The creator kit registers none, so the section is normally absent entirely. If you do see one, it is
still not a starting point for a creator project — ignore it unless a maintainer has explicitly told
you otherwise.

---

## 4. What the creator edits

| Path | What it is |
| --- | --- |
| `relics.config.json` | **the project's source of truth** — name, symbol, supply, runtime, earnings, chains, quote asset |
| `generator/generate.js` | the art: one deterministic, sandboxed script |
| `traits/schema.json` | trait dimensions and value weights |
| `market/mappings.json` | which market sensors drive which art parameters |
| `metadata/collection.json` | collection name, description, image, token name pattern |
| `previews/seed-*.svg` | **generated** — written by `preview` and rewritten at export. Never hand-edit |
| `relics.project.json`, `checksums.json` | **generated at export**, inside the `.relics` file only |

`relics.config.json` is the one an agent forgets. Supply, ticker, earnings and chains all live
there, and so does the mandatory recipient edit in §7.

---

## 5. Writing the generator

`generator/generate.js` exports `render(context)` and returns an **SVG string**. `context` is
frozen plain data:

| Field | What it is |
| --- | --- |
| `seed` | the token's seed, a string |
| `random` | seeded PRNG: `next()`, `float(min,max)`, `int(min,max)`, `chance(p)`, `pick(arr)`, `weighted(arr,weights)` |
| `market` | destination values in `[0,1]` — **only** the destinations declared in `market/mappings.json` |
| `sensors` | raw sensor readings in `[-1,1]` |
| `size` | canvas edge in user units |
| `project` | `name`, `symbol`, `artworkSupply` |

A destination you did not map is **absent, not zero**. Read every market value through a fallback
so the piece still renders honestly before its first trade:

```js
const fracture = typeof market.fracture === "number" ? market.fracture : 0;
```

**The sandbox has no ambient capabilities.** `Math.random()` throws by design. `Date`, `console`,
`fetch`, `URL`, `Proxy`, `Reflect`, `TextEncoder`, `Buffer`, timers and the rest are deleted from
the realm before your code runs (the full list is `STRIPPED_GLOBALS` in
`packages/creator-cli/src/sandbox.js`). Do not reach for a debugger statement or a `console.log` —
they are not there. Debug by rendering and looking at the output.

Hard limits, from `packages/project-schema/src/limits.js`:

| Limit | Value |
| --- | --- |
| script bytes (`generate.js`) | 36,000 |
| files in `generator/` | 16 |
| one render | 4,000 ms |
| one SVG output | 512 KB max, 64 bytes min |
| whole bundle | 20 MB, 512 entries |

Determinism is the contract: the same seed must draw the same bytes forever. Validation renders
each seed **twice** and refuses any generator whose output moves. No clock, no ambient state, no
mutation of module-level variables between renders.

**Separate the two jobs.** The seed decides what a piece *is* — its palette, structure, rhythm.
The market decides what condition it is *in*. Keep those independent and the collection stays
coherent: every token is recognisably itself, and the whole collection moves together as the market
moves.

---

## 6. Market mappings

`market/mappings.json` is a closed vocabulary — a sensor id, a transform id, numeric parameters
inside published bounds, and a destination id. No expressions, no callbacks, no addresses. **At
most eight mappings.**

- **Sensors:** `buying_pressure`, `selling_pressure`, `volume`, `tick`, `volatility`, `drawdown`,
  `recovery`, `liquidity`, `holder_growth`, `epoch`, `market_seed`
- **Transforms:** `threshold`, `range`, `clamp`, `smoothing`, `tier`, `accumulation`, `decay`,
  `inverse`, `weighted_mix`
- **Destinations:** `palette`, `brightness`, `density`, `scale`, `symmetry`, `fracture`,
  `line_weight`, `distortion`, `geometry`, `scar`, `animation`

Every transform clamps on every branch, so a destination can never receive an out-of-range value.
Nothing here reaches a fee, a liquidity parameter, or an external call — market state is art
entropy, never an oracle.

### Previewing what the market does to the art

`preview` and `test-seeds` do **not** render at a market condition you choose. Each seed is given
**seed-derived pseudo-sensor readings** spanning the full range — `neutralSensors()` in
`packages/project-schema/src/validate.js`, which despite the name is repeatable-but-arbitrary per
seed, not zeroed. So a preview grid varies the art seed *and* the market at the same time, which is
exactly what you cannot reason about.

To hold the seed fixed and move only the market, use the local studio's HTTP endpoints. This is the
only way to do it, and it works headlessly:

```bash
npm run kit -- dev ../my-project --port 4321      # BLOCKING: background it, then poll
```

```
GET /                      the studio page (a human opens this)
GET /state                 JSON: sensors, destinations, declared mappings, derived traits
GET /render?seed=7&size=1000
       &market.<destination>=0..1     force a destination directly
       &sensor.<id>=-1..1             drive a sensor through your declared mappings
```

```bash
curl -s "http://127.0.0.1:4321/render?seed=7&market.fracture=0.9&market.scar=0.95" -o crash.svg
curl -s "http://127.0.0.1:4321/render?seed=7&market.fracture=0&market.scar=0"      -o calm.svg
```

Render the same seed at calm and at stress, and compare. That is how you prove to a creator that
their mapping does what they asked for.

**`relics dev` blocks until interrupted.** Never run it in the foreground of a non-interactive
session — start it in the background, poll `/state` until it answers, and stop it when you are
done. The sliders are sliders; nothing reads a chain.

---

## 7. Validation — what it means and what actually fails

```bash
npm run kit -- validate ../my-project
```

Same code path `export` uses on the same assembled bytes, so "validate passed" means "export would
produce this". It prints a PASS/FAIL/WARN line per check and a detail block per issue naming the
file and the rule. The full check table is in `docs/creator-kit/cli.md`.

**The errors that actually happen** when adapting a template to a real brief:

| Code | What it means |
| --- | --- |
| `EARNINGS_RECIPIENT_PLACEHOLDER` | every template ships a placeholder wallet on purpose. Set `earnings.creatorRecipient` in `relics.config.json` to the creator's own address. **Ask them for it — never invent one, never use your own, never use a burn address.** |
| `EARNINGS_COLLABORATORS` | `earnings.collaborators` must be present and an array. Use `[]` for a solo project |
| earnings mode | `SPLIT` requires at least one collaborator. A solo creator wants `SOLO` |
| `SUPPLY_RELATIONSHIP` | `tokensPerArtwork` must equal `floor(totalSupplyWhole / artworkSupply)`. **Changing the mint size means recomputing this** — it is the most common slip |
| `ART_BINDING_MISMATCH` | the manifest's binding does not follow from the bundle's own bytes. Something was hand-edited: re-export, never patch |
| `ART_BINDING_CHAIN_CLAIM` | a bundle tried to state `runtimeCodeHash` or `scriptPointer`. Those are chain facts; always `null` |
| `GEN_FORBIDDEN_IDENTIFIER` / `GEN_EXTERNAL_URL` | the generator touched the network. Assets travel inside the bundle |
| `GEN_RENDER_THREW` | the generator crashed. Usually a stripped global (§5) |
| non-determinism | `Math.random()`, `Date.now()`, or state carried between renders |
| script byte budget | `generate.js` over 36,000 bytes |
| market mapping rejected | a sensor, transform or destination outside the closed vocabulary (§6) |
| `.sol` / `.wasm` in the project | refused by extension before anything else runs |

**Warnings you must raise with the creator rather than silently accept:**

| Code | Say this |
| --- | --- |
| `ART_RUNTIME_PREVIEW_ONLY` | "this runtime is not launchable yet" — always surface it (§3) |
| `TRAITS_SPACE_TOO_SMALL` | the trait schema expresses fewer combinations than the mint size, so trait **labels** repeat. The artwork can still be unique. Only a problem if they wanted unique labels — ask, then either add a dimension or accept it deliberately |
| `METADATA_NO_IMAGE` | no collection image; marketplaces will show a blank tile |
| `PREVIEW_MISSING` | the binding seeds are `1,2,3,5,8,13,21,34`, so a default 8-seed preview misses three of them. Clear it with `preview --seeds 1,2,3,5,8,13,21,34`. Export writes them into the bundle regardless |

A clean run ends `OK`. Fix **every** error. Treat every warning **explicitly** — either clear it or
tell the creator in plain words why it is being accepted.

---

## 8. Export

```bash
npm run kit -- export ../my-project --output ../my-project.relics
npm run kit -- inspect ../my-project.relics
```

**`export` validates first and refuses to write a bundle that fails. No flag overrides that** —
`--force` is an `init` flag and does nothing here. A bundle that fails locally is a bundle the
importer refuses anyway.

`export --draft` writes a `.relics-draft` for circulation. It is **not** a way around validation:
it runs the identical checks and a placeholder recipient still blocks it. A draft carries a
different archive marker, `status: "DRAFT"` inside both integrity hashes, and a different
commitment, so renaming one to `.relics` produces a file the launchpad still refuses.

Then `inspect` the artifact and **tell the creator the absolute path of the output file.** Confirm
identity, supply, runtime, earnings recipient and the bundle hash back to them. Do not end the task
having produced a file whose location you never stated.

---

## 9. Six things you must not tell a creator

Accuracy rules. Each one is a false claim if you get it wrong.

1. **Name the chain; never say "the launchpad is live" or "closed everywhere".** RC6 is deployed on
   Ethereum (1), Base (8453) and Robinhood Chain (4663), and open to ordinary, permissionless
   creator launches on all three. Deployment landed 2026-08-19; the factories were opened by
   `openPublicLaunches()` on 2026-08-19 (4663) and 2026-08-20 (8453, then 1). It is NOT deployed on BNB Smart Chain (56),
   which is deferred, and **no date is announced for it** — do not turn a deferred chain into a
   roadmap. The factory is the same CREATE2 address on all three open chains; that is determinism,
   not a transcription error, so do not "correct" it. This repository DOES publish the RC6
   addresses, in `packages/project-schema/src/deployments.js`, which is GENERATED by
   `npm run kit:deployments:sync` from a source that states each address was read back off the
   chain — never hand-typed, and never to be hand-edited. It publishes none of RC5's: that
   generation is superseded, its factories still read `PREPARED`, and an address a creator can
   reach and can never launch through is worse than no address at all. **Run `npm run kit:status`
   for the current per-chain state and quote that** — never restate an address or a status from
   memory.
2. **Never assert an audit status in either direction.** Do not write "audited", "security
   reviewed", "unaudited", "not audited", or anything a reader takes as third-party assurance or
   as its absence. State checkable facts instead — source verification, runtime hashes, which
   gates run — and let those stand on their own.
3. **Creator art reaches `tokenURI` through the art binding, and only through it.** A bundle carries
   an `artBinding` block naming the runtime and the keccak256 of the exact bytes that runtime is
   given; a launch writes that record into the collection and `tokenURI` renders from it. A bundle
   never names a deployed renderer: `runtimeCodeHash` and `scriptPointer` are chain facts, always
   `null`, and refused by name if filled in.
4. **A bundle can never carry protocol code.** `.sol`/`.vy`/`.yul`/`.wasm` are refused by extension
   and the manifest key space is closed, so no bundle can replace the hook, token, collection,
   escrow, router, or buyback. A custom hook needs a separate reviewed process — do not try to
   smuggle one into a bundle.
5. **`contractURI()` and `tokenURI()` are different surfaces.** `tokenURI(id)` renders per-NFT art
   from the art binding. `contractURI()` is the ERC-7572 project/token profile. A deployed token is
   not launch-complete for DEX or token-discovery tooling until ERC-20 `contractURI()` reads
   non-empty JSON with a public image URI.
6. **Fees are a share of collected LP fees, never of volume.** The numbers are declared exactly once,
   in `packages/project-schema/src/economics.js` — import them, never type a percentage or a bps
   figure. `npm run kit:economics` fails on a second declaration. Say **buy-and-entomb**, never
   "burn", and state all three parts together: spendable and circulating supply fall, `totalSupply`
   does **not** fall, and no ERC-20 burn event occurs because the token has no burn function.

Also standing: never call locked LP "burned", "locked forever", "permanent", or say "fees route
immutably" — describe custody by what the bytecode contains. No attack, brick, or fee-collection
exploit mechanics anywhere. The RELICS art collection lives at `https://www.relics.wtf`; the creator
app is not publicly hosted, so do not invent URLs.

---

## 10. Reference map

| You need | Read |
| --- | --- |
| the creator walkthrough, in plain language | `docs/creator-kit/create-with-an-agent.md` |
| every command and flag, and every check | `docs/creator-kit/cli.md` |
| the container, manifest, hashes, render contract | `docs/creator-kit/bundle-format.md` |
| the threat model and what is *not* defended | `docs/creator-kit/bundle-security.md` |
| the importer contract and fixtures | `docs/creator-kit/importing.md` |
| deployment state and quote assets | `npm run kit:status`, then `docs/launchpad/` |
| the closed vocabularies, verbatim | `packages/project-schema/src/vocabulary.js` |
| the hard limits, verbatim | `packages/project-schema/src/limits.js` |

Gates: `npm run kit:test`, `npm run kit:templates`, `npm run kit:fixtures` (regenerating fixtures
must produce no diff), `npm run kit:economics`, `npm run secrets:scan`.

> If a gate is already failing on an untouched checkout, that is a pre-existing repository issue.
> Report it. **Do not "fix" it by editing the schema** — see §0.1.

---

## 11. The rest of this repository — do not blend these

Four separate things live under one roof. They share no code, and their numbers (fee tiers, splits,
byte budgets) must never leak between them.

1. **The creator kit** — `packages/project-schema/`, `packages/creator-cli/`, `docs/creator-kit/`.
   Everything above. `@relics/project-schema` is the ONE definition of the `.relics` bundle:
   container, schema, validator, hashes, studio-draft projection. Zero dependencies, plain ESM, no
   build step. The launchpad web importer consumes this exact package, so both sides derive
   identical hashes. **Never fork it.**
2. **`docs/launchpad/`** — the RELICS Launchpad creator guide. Documentation only; the launchpad's
   contract source is not in this repo.
3. **The fork-and-launch template** — `src/`, `script/`, `test/`, `apps/web/`, `docs/00`–`18`. A
   clean-room, MIT-licensed, **educational, not production** starter for a fully on-chain generative
   collection linked to an ERC-20 with a Uniswap v4 hook. Not affiliated with Uniswap, OpenZeppelin,
   OpenSea, or any production collection. Every contract is an original, genericized `Example*`
   implementation. **A bundle is not a deployment: creator-kit work never touches this tree.**
4. **`flagship/`** — the operator-authorized production reference for the live RELICS artwork.
   Verified source and public on-chain identifiers only.

### If you are helping fork the Solidity template

Everything a forker changes is tagged `CUSTOMIZE` — grep for it. Two mirrored config entry points,
kept in sync: `config/collection.config.ts` (web app + identity) and `.env` →
`script/config/DeployConfig.s.sol` (Foundry). Full walkthrough in `docs/00-make-it-your-own.md`.

Architecture facts that bite:

- **Hook flags == address bits.** `ExampleV4Hook` needs `afterInitialize | afterAddLiquidity |
  afterSwap`, so the address's low 14 bits must equal `0x1440`. Mine a CREATE2 salt against the
  EXACT init code and constructor args. Change any constructor arg → re-mine.
- **Bind before initialize.** `bindCanonicalPool` is one-shot and records the exact expected opening
  price. Every callback validates the full PoolKey including `hooks == address(this)`.
- **Callbacks are bounded.** Fixed-size struct writes only — no arrays, no untrusted external calls,
  no NFT work, no rendering in a swap path.
- **Market state is art entropy, never an oracle.** It must never gate what anyone can buy, sell, or
  withdraw.
- **Awakening is explicit.** Receiving the token mints nothing. Capacity is DERIVED
  (`balanceOf/1e18 − nft.balanceOf`), never stored. `_mint`, never `_safeMint`.
- **EIP-170 is a hard wall (24,576 bytes).** Run `forge build --sizes | grep -E "Renderer"` after
  **every** renderer edit.
- **Token sort order decides routability**, and read the PositionManager token id from the receipt,
  never a simulation (`docs/12`, `docs/11`).
- **The web app uses STATIC public env only** — never `process.env[key]`, `Object.entries`, or a
  spread over env. Unset addresses render "not configured".

```bash
forge build && forge test && forge fmt
forge build --sizes | grep -E "Renderer"            # after EVERY renderer edit
npm run web:dev
npm run web:build && npm run web:lint && npm run web:typecheck && npm run web:test
npm run secrets:scan                                # REQUIRED before committing
node scripts/gen-manifest.mjs                       # refresh export manifest after file changes
node scripts/check-links.mjs                        # docs link integrity
```

Deploy flow (testnet first; env-driven, no code edits): `DeployExample` → `BindAndCreatePool` →
`AddLiquidity` (read the position id from the receipt) → `LockPosition` → `VerifyDeployment`.
Mainnet only after the forker's own security, legal and economic review. No project-funded bootstrap
buy, ever.

---

## 12. Repository ground rules

1. **No private data, ever.** No deploy keys, mnemonics, keystores, `.env` values, RPC credentials,
   or internal audit material. See `NO_PRIVATE_DATA_ATTESTATION.md` and
   `PUBLIC_EXPORT_ALLOWLIST.md`. `flagship/` and `submissions/` carry the operator's explicitly
   authorized production reference — verified source and public on-chain identifiers only.
2. **Dependencies under `lib/` are vendored, pinned and byte-exact.** Never float, swap, or
   partially update a vendored tree. Licenses in `THIRD_PARTY_NOTICES.md`.
3. **Keep every public word true.** This is a teaching repo. No third-party assurance claim and no
   disclaimer of one either (§9.2), no "guaranteed", no affiliation claims, no financial promises.
4. **Self-update rule.** Any change to contracts, tokenomics, deploy behavior, the renderer, or the
   safety posture MUST update the affected docs in the same change set. A doc that contradicts the
   code is a bug.
5. **Do not self-publish.** Commit locally, run the secret scan, stop.
