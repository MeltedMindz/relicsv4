# RELICS Creator Kit

**Write generative art as one JavaScript file or a set of Solidity-SVG parameters, wire market
signals to it, render a hundred seeds until you like them, and export a single `.relics` file that
a launchpad can turn into a token, an NFT collection and a Uniswap v4 pool.**

### Two ways in. Pick one.

| | |
| --- | --- |
| 🤖 **AI AGENT — CREATE + LAUNCH**<br>[→ The autonomous launch agent](docs/creator-kit/autonomous-launch-agent.md) | You describe the collection and write one authorization file. A coding agent writes the art, runs every check, reads the live chains, simulates the exact transaction, hands it to a signer that holds a key the agent never sees, and takes it to `VERIFIED` on chain. **Needs a wallet, a pinning provider and a network**, and it does nothing until you turn it on. |
| 🎨 **CREATOR KIT — OFFLINE**<br>[→ Getting started](docs/creator-kit/getting-started.md) | Seven commands, **no network, no wallet, no signer**. Scaffold → preview → validate → export. You end with one `.relics` file and you take it to the creator app yourself, whenever you want. You can do all of it on a plane. |

The offline path is the default and the whole of it is real today. The launch path is the same
authoring work with a chain-facing tail on the end — it adds steps, it removes none, and every
safety rule from the offline path still holds inside it.

```
IDEA → ART → TEST → CONFIGURE → LIVE CHAIN PREFLIGHT → SIMULATE → POLICY → SIGN → BROADCAST → VERIFY
└──────── CREATOR KIT — OFFLINE ────────┘└─────────── what the launch agent adds ──────────────┘
                                        │
                    or stop here, export one .relics file,
                       and import it at relics.wtf/create
```

**[→ Create with an agent, in plain language](docs/creator-kit/create-with-an-agent.md)** ·
**[→ See how it works](#what-a-relics-file-is)** ·
**[→ Take the file to the launchpad yourself](#take-it-to-the-launchpad)**

[![creator kit 4.0.0](https://img.shields.io/badge/creator%20kit-4.0.0-c9a227)](packages/creator-cli/)
[![bundle schema 4.0.0](https://img.shields.io/badge/bundle%20schema-4.0.0-8a8681)](docs/creator-kit/bundle-format.md)
[![protocol v4-art-launchpad/rc6](https://img.shields.io/badge/protocol-v4--art--launchpad%2Frc6-8a8681)](docs/launchpad/08-status.md)
[![creator-kit CI](https://github.com/MeltedMindz/relicsv4/actions/workflows/creator-kit.yml/badge.svg)](https://github.com/MeltedMindz/relicsv4/actions/workflows/creator-kit.yml)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-8a8681)](package.json)
[![MIT](https://img.shields.io/badge/license-MIT-8a8681)](LICENSE)


![Four deterministic renders from the shipped starter templates, arranged left to right. Each is a
dark square: concentric pale rings around a lit core; a fractured line lattice with two bright
accent scars cutting across it; a dense field of short strokes; a single geometric form with a halo.
Each caption pairs a seed number with the trait labels the kit derived for it — labels are metadata,
drawn from their own seeded stream, so they name the token rather than describe the
image.](docs/assets/hero.svg)

*Every image above came out of `relics preview`. Same seed, same picture — on your laptop, in the
importer, and in ten years.*

---

## Table of contents

- [What you actually build](#what-you-actually-build)
- [Create with an AI agent](#create-with-an-ai-agent)
- [Launch with an AI agent](#launch-with-an-ai-agent)
- [Build it yourself](#build-it-yourself)
- [The one file you edit](#the-one-file-you-edit)
- [The whole path, end to end](#the-whole-path-end-to-end)
- [What a `.relics` file is](#what-a-relics-file-is)
- [Take it to the launchpad](#take-it-to-the-launchpad)
- [The starter templates](#the-starter-templates)
- [Market history is the medium](#market-history-is-the-medium)
- [Launch protection, chains and fees](#launch-protection-chains-and-fees)
- [Advanced paths](#advanced-paths)
- [Status, honestly](#status-honestly)

---

## What you actually build

A RELICS project is a directory on your machine. It holds:

- **a generator** — one JavaScript file exporting `render(context)`, or a parameter file for a
  registered on-chain Solidity renderer;
- **a trait schema** — the named dimensions and weights the collection draws from;
- **market mappings** — declarative wiring from market signals to art parameters;
- **collection metadata** — name, symbol, description, cover image;
- **`relics.config.json`** — supply, earnings, chains, runtime.

`relics export` packs all of it into one `.relics` file with hashes over its own contents. That
file is what you hand the launchpad — by hand, or through the launch agent.

**Everything up to and including that file is offline.** Scaffolding, the studio, previews, seed
sweeps, validation, export and inspection contact no network, need no wallet and hold no key. The
only part of this repository that reaches a chain is the launch agent, it is off until you
configure it, and it is documented separately in
[The autonomous launch agent](docs/creator-kit/autonomous-launch-agent.md).

---

## Create with an AI agent

You describe the collection. The agent writes the generator, wires the market mappings, runs the
checks, and iterates until the previews look right.

```bash
git clone https://github.com/MeltedMindz/relicsv4.git
cd relicsv4
npm install
```

Then open your agent in this directory and paste:

> Read `docs/creator-kit/create-with-an-agent.md` and `AGENTS.md`, then help me build a RELICS
> project. Scaffold it with `npm run kit -- init`, write the generator, and use
> `npm run kit -- preview` and `npm run kit -- validate` after every change until validation
> passes with no errors. Ask me about the art before you write any code.

**[→ The full prompt, and what the agent may and may not decide for you](docs/creator-kit/create-with-an-agent.md)**

---

## Build it yourself

Seven commands. Everything below was run against this commit.

```bash
git clone https://github.com/MeltedMindz/relicsv4.git
cd relicsv4
npm install
```

```bash
# 1. see what you can start from
npm run kit -- templates

# 2. scaffold a project
npm run kit -- init my-project --template minimal

# 3. open the local studio on 127.0.0.1 — render any seed, drag the market sliders
npm run kit -- dev my-project

# 4. write deterministic SVGs and a contact sheet
npm run kit -- preview my-project --count 8

# 5. sweep a wide seed range for failures, blanks and duplicate traits
npm run kit -- test-seeds my-project --count 100

# 6. run every check the importer will run. Writes nothing.
npm run kit -- validate my-project

# 7. validate, then write the bundle
npm run kit -- export my-project --output my-project.relics

# read a bundle someone sent you — without executing its generator
npm run kit -- inspect my-project.relics
```

Four more exist and none of them is part of the loop: `doctor` checks that this machine can run
the kit and contacts nothing; `status` prints the deployment record and which chains take a
creator launch; `migrate` reopens a bundle from an older schema as a project you can finish; and
`help <command>` prints every flag. `npm run kit -- --help` lists all eleven.

> **A fresh project fails validation on purpose, and there are TWO refusals, not one.** Both are
> decisions the kit will not make on your behalf, because both are written on chain and permanent:
>
> - `EARNINGS_RECIPIENT_PLACEHOLDER` — every template ships
>   `earnings.creatorRecipient: "0x1111…1111"`. A launch with a placeholder here pays nobody.
> - `MARKET_ANTI_SNIPE_UNSPECIFIED` — every template ships `market.antiSnipeMode: "UNSPECIFIED"`,
>   which is a draft value. A final bundle must elect `NONE` or `PROTECTED_98_MINUTES` by name.
>   Neither is a default and neither is required of you; see
>   [Launch protection, chains and fees](#launch-protection-chains-and-fees).
>
> Fix both in `relics.config.json` and `validate` goes green. Nothing else stands between a
> scaffolded template and a clean run.

The CLI has **zero runtime dependencies** — plain ESM, no build step. `npm install` is for the demo
web app and the test tooling; `npm run kit` works in a freshly cloned repo before it finishes.

**[→ Getting started, step by step](docs/creator-kit/getting-started.md)** ·
**[→ Every command and flag](docs/creator-kit/cli.md)**

---

## The one file you edit

This is the single most common confusion, so it gets its own section.

| File | Where it lives | Who writes it |
| --- | --- | --- |
| **`relics.config.json`** | your project directory | **YOU.** Name, symbol, supply, runtime, earnings, chains. |
| `relics.project.json` | **only inside the `.relics` file** | **GENERATED at export.** Never appears in your project directory. |

`relics.project.json` is derived from your config and your files at export time. Hand-editing it
cannot change what launches — it can only make the hashes disagree, and then the importer refuses
the bundle. If you find yourself opening it, you want `relics.config.json` instead.

---

## The whole path, end to end

```mermaid
flowchart TD
    A["relics init<br/>scaffold from a template"] --> B["edit generator/generate.js<br/>+ relics.config.json"]
    B --> C["relics dev<br/>local studio, market sliders"]
    C --> D["relics preview<br/>deterministic SVGs"]
    D --> E["relics test-seeds<br/>100 seeds: blanks, dupes, drift"]
    E -->|not right yet| B
    E --> F["relics validate<br/>every importer check"]
    F -->|errors| B
    F -->|clean| G["relics export<br/>one .relics file"]
    G --> H["import in the launchpad<br/>hashes re-derived from your bytes"]
    H --> I["review the derived draft<br/>art, traits, supply, earnings"]
    I --> J["sign one transaction"]

    style A fill:#1a1a1c,stroke:#c9a227,color:#e8e6e3
    style G fill:#1a1a1c,stroke:#c9a227,color:#e8e6e3
    style J fill:#1a1a1c,stroke:#c9a227,color:#e8e6e3
```

Every step through `relics export` works today, offline, with no wallet. The import and signing
steps depend on the launchpad's current launch state — see [Status, honestly](#status-honestly).

---

## What a `.relics` file is

One deterministic, uncompressed ZIP. Standard `unzip` reads it. It carries dual **SHA-256** and
**keccak-256** commitments over its own contents, so an importer re-derives every hash from the
bytes you uploaded and can prove it is reading exactly what you exported.

Here is a real bundle, exported from the `minimal` template with `antiSnipeMode: "NONE"` —
16 entries, 19,608 bytes. `npm run kit:readme` reproduces exactly this from the commands above,
which is why the number is safe to print:

```
my-project.relics
├── generator/generate.js        2,501 B   ← YOU WROTE THIS   (the art)
├── traits/schema.json             720 B   ← YOU WROTE THIS   (dimensions + weights)
├── market/mappings.json            37 B   ← YOU WROTE THIS   (sensor → transform → destination)
├── metadata/collection.json       241 B   ← YOU WROTE THIS   (name, description, cover)
├── assets/                                ← YOU WROTE THIS   (cover image, if any)
├── README.md                    2,643 B   ← optional
├── LICENSE                        435 B   ← optional
│
├── previews/seed-1.svg            971 B   ⟵ GENERATED  written from the live render at export,
├── previews/seed-2.svg            595 B   ⟵ GENERATED  not copied from your previews/ directory
├── previews/seed-3.svg            565 B   ⟵ GENERATED
├── …seeds 5, 8, 13, 21, 34                ⟵ GENERATED
│
├── relics.project.json          3,120 B   ⟵ GENERATED  the manifest
└── checksums.json               1,808 B   ⟵ GENERATED  per-file digests + the bundle hash
```

**A bundle configures art, never contracts.** It cannot carry `.sol`, `.wasm`, executables, shell
scripts, key material or `.env` files — those extensions are refused everywhere, each with its own
message. There is no manifest field in which a bundle could supply a hook, a token, a router or a
fee. A custom hook is a separate, reviewed process.

**A render is a pure function of its inputs.** No clock, no network, no `Math.random`. Validation
renders every sampled seed twice and refuses a generator whose output moves between the two runs.

**[→ The bundle format: every field, every hash recipe](docs/creator-kit/bundle-format.md)** ·
**[→ Why every bundle is treated as hostile](docs/creator-kit/bundle-security.md)** ·
**[→ Writing an importer](docs/creator-kit/importing.md)**

---

## Take it to the launchpad

The file is the handover. Open **<https://www.relics.wtf/create>**, choose **Import a .relics
project**, and give it the file `relics export` wrote.

What happens then, in order:

1. **The bundle is inspected and re-hashed** from the bytes you uploaded. It is never executed in
   the page. The bundle hash it shows you must equal the one `relics export` printed — if it does
   not, the file changed after export and you should re-run the export rather than proceed.
2. **It becomes a draft in the studio**, projected from your own manifest: your generator, your
   traits, your market mappings, your supply and earnings. Drafts live in that browser only.
3. **You pick the chain and the quote asset**, and every figure that depends on that choice is
   recomputed in front of you. `relics status` prints which chains take a creator launch; the
   studio re-reads the factory rather than trusting either that table or this page.
4. **The collection media is pinned and read back** by the content address the pin provider
   returned, re-hashed, and re-parsed before it is committed. A receipt is not evidence that
   anybody can read the bytes.
5. **You sign one transaction.** Token, collection, art runtime binding, birth metadata and the
   Uniswap v4 pool are created together. There is no second transaction to bind metadata
   afterwards and no pending state to come back to.

Everything before step 5 is free, reversible and off chain. Nothing in this repository can sign,
broadcast or reach a network on your behalf — the CLI has no wallet and no RPC in it at all.

---

## The starter templates

Five ship. All five scaffold, validate and export cleanly — that is checked in CI on every push
(`npm run kit:templates`). The output below is verbatim from that check.

| Template | Runtime | Market-responsive | Runtime a launch can bind |
| --- | --- | --- | --- |
| `solidity-svg-params` | `SOLIDITY_SVG_V1` | yes | **yes** |
| `market-responsive` | `ONCHAIN_JAVASCRIPT_V1` | yes — 4 mappings | no |
| `minimal` | `ONCHAIN_JAVASCRIPT_V1` | no | no |
| `onchain-js` | `ONCHAIN_JAVASCRIPT_V1` | no | no |
| `static-art` | `ONCHAIN_JAVASCRIPT_V1` | no, by design | no |

**That last column is about the RUNTIME, not the chain, and the two are independent.** The chain
half is a separate question with its own answer — run `npm run kit:status` and read it rather than
trusting any table, including this one. The runtime half is what the column asks: which runtime a
launch can bind and render. That is `SOLIDITY_SVG_V1`, and it is the only one, so the four
JavaScript templates cannot be launched — on an open chain or any other.

**The JavaScript refusal is structural, not a queue position.** `ArtRuntimeRegistryV1.modeAvailable`
is a `pure` function that admits the Solidity-SVG mode alone, so registering a JavaScript runtime
reverts `RuntimeModeNotAvailable` and no operator, no signer and no governance action can register
one. This README does not know when that changes, so it does not say — and you should treat any
sentence anywhere that implies a date as something nobody read off a chain.

**None of that costs you your work, and the kit will never trade it away for you.** A JavaScript
project authors, previews, sweeps, validates, exports and inspects exactly like a Solidity-SVG one,
and the bundle you export stays valid — nothing about it has to change if the runtime is ever
bound. The kit does not convert a JavaScript project to Solidity SVG, does not suggest switching
runtime to unlock a launch, and does not delete a generator. Those are two different artworks, and
which one you meant is not a question a validator gets to answer.

**Approved and launchable are different questions, and the kit does not collapse them.** Both
runtimes are approved: the format accepts them, they validate, they preview, they export. The
JavaScript templates are marked "preview only" everywhere they appear — in `relics templates`, in
`relics init`, in `relics validate` and in the CI table — rather than quietly presented as
launchable.

- **`solidity-svg-params`** — configure a registered on-chain Solidity renderer by parameters, with
  a local preview of the same shapes.
- **`market-responsive`** — a lattice that fractures under drawdown, thickens with volume, and
  keeps its scars. Four sensors wired to four art parameters, and a split-earnings config.
- **`minimal`** — the smallest complete project: one generator, two trait dimensions, no market
  mappings.
- **`onchain-js`** — a compact generator written with the 36,000-byte script budget in view the
  whole time.
- **`static-art`** — seed-driven composition with no market mappings at all. The art never changes.

There is no p5-style template, because p5 is not an approved runtime and the schema refuses a
bundle that names one. Shipping a template that could not export would be a worse answer than
shipping none.

---

## Market history is the medium

The art is not a stored image. A collection reads its own market and renders from it:

```
IMMUTABLE DNA  +  MARKET HISTORY  +  CURRENT MARKET STATE  =  THE ART YOU SEE NOW
```

- **Immutable DNA** — the token's seed. Fixed at mint, forever. It decides what the piece *is*.
- **Current market state** — what the pool looks like right now.
- **Market history** — carried by transforms that remember: `accumulation` is a monotonic running
  total that never decreases, `decay` falls back toward baseline over a half-life in epochs, and
  `smoothing` is an exponential moving average over a window of samples. A scar driven by
  `accumulation` stays in the composition after the drawdown that cut it has recovered.

You wire it in `market/mappings.json`, and every id comes from a closed vocabulary. There is no
expression to parse, no callback, no address:

```json
{
  "id": "drawdown-fracture",
  "sensor": "drawdown",
  "transform": "clamp",
  "transformParams": { "min": 0, "max": 0.85 },
  "destination": "fracture"
}
```

**11 sensors** — what the market is doing:

`buying_pressure` · `selling_pressure` · `volume` · `tick` (price) · `volatility` · `drawdown` ·
`recovery` · `liquidity` · `holder_growth` · `epoch` · `market_seed`

**9 transforms** — how the signal is shaped:

`threshold` · `range` · `clamp` · `smoothing` · `tier` · `accumulation` · `decay` · `inverse` ·
`weighted_mix`

**11 destinations** — what changes in the art:

`palette` · `brightness` · `density` · `scale` · `symmetry` · `fracture` · `line_weight` ·
`distortion` · `geometry` · `scar` · `animation`

A sensor reading arrives in `[-1, 1]`; every transform clamps its output to `[0, 1]`, so a
destination can never receive an out-of-range value however strange the reading is. Your generator
reads them as `context.market.fracture`, `context.market.density`, and so on — with a fallback, so
a preview on day zero, before a single trade, still renders something honest rather than blank.

The validator refuses any id outside those three lists, any transform parameter outside its
published bounds, and warns when two mappings contest the same destination.

### Where the picture actually comes from

- **`tokenURI(id)`** is the artwork. It renders from the collection's immutable on-chain art
  binding — the runtime, the art configuration bytes and their hash — not from a file you uploaded.
  There is no IPFS pin to rot and no API to go down.
- **`contractURI()`** is the collection profile: name, description, the cover image. That one *is*
  published media, so the importer normalizes it, pins the exact bytes, reads them back by the
  content address the pin provider returned, re-hashes them, and only then commits. The committed
  URI is a **content address** — an immutable `ipfs://`. A plain `https://` URL is not accepted as
  canonical media: a website can change or vanish and a launched collection's image must not, so an
  external URL is fetched server-side and an immutable copy is pinned instead. Relative paths and
  `data:` URIs are valid inside your bundle and invalid as contract-level media.

Keep the two separate in your head and the metadata story stops being confusing. The full
sequence — two digests, what each one commits to, and why a pin receipt is not evidence — is in
**[13 — Metadata and contractURI](docs/launchpad/13-metadata-and-contracturi.md)**.

---

## Launch protection, chains and fees

**Fees.** Collected LP fees are split between the creator and the platform, and the platform's
share divides again into a $RELICS buy-and-entomb allocation and the retained protocol treasury.
Two things about that are easy to state wrongly. They are ratios applied to **fees actually
collected**, never to trading volume. And buy-and-entomb is **not a burn**: circulating supply
falls, `totalSupply` does not, and no burn event is emitted. The numbers themselves are declared
exactly once, in `packages/project-schema/src/economics.js`, and explained in
[06 — Fees and revenue](docs/launchpad/06-fees-and-revenue.md); this page deliberately does not
restate them, because a percentage asserted in two places is how a retired one survives a change.

**Chains.** The bundle format understands four — Ethereum (1), Base (8453), Robinhood Chain
(4663) and BNB Smart Chain (56) — and all four pass `chains.requested` validation. Ethereum, Base
and Robinhood quote in WETH; BNB quotes in WBNB, which is never to be called WETH. **RC6 is
deployed on Ethereum, Base and Robinhood Chain and open to public creator launches on all three
since 2026-08-19 (deployment) and 2026-08-19/20 (the one-way `openPublicLaunches()` call, per
chain); it is not deployed on BNB Smart Chain, which is deferred, and no date is set for
it.** The factory is the same CREATE2 address on all three — determinism, not a transcription
error. This repository publishes those addresses in `packages/project-schema/src/deployments.js`,
generated by `npm run kit:deployments:sync` from a source that states each one was read back off
the chain, and every RC6 contract is source-verified on its own chain's explorer. It publishes none
of RC5's, which still read `PREPARED` and would refuse a launch forever. Requesting a chain in a
bundle is a schema fact; it is not that chain being open.
Current table: [08 — Status](docs/launchpad/08-status.md#the-chains).

**Launch protection.** Two launch methods are offered — **Instant V4** and **Bonding curve**.
Fixed-price sale is withdrawn, because its sale phase had no per-buyer cap, no cooldown and no
maximum per transaction, so one address could take the whole allocation in one transaction. It is
refused in two places, and the difference matters:

- **Here, when you build.** `relics validate` and `relics export` refuse a bundle that elects
  `FIXED_PRICE_SALE_TO_V4`, by name, with the reason. You cannot export one.
- **At launch.** The deployed sale contract refuses it for every caller, including the protocol
  Safe and the pre-public canary path. That refusal is a comparison against a compile-time enum
  member — there is no setter and no flag that lifts it. It is a statement about the bytecode that
  is deployed, not a claim of immutability: that contract sits behind a proxy whose upgrade
  authority is a 2-of-3 Safe with no timelock, as
  [11 — Governance and upgradeability](docs/launchpad/11-governance-and-upgradeability.md) sets out.

The mode name itself stays in the format. Launch modes are an on-chain enum, and deleting a member
renumbers the ones after it, which would silently change what an already-written bundle means.

Separately, every launch elects launch protection once and permanently. **It is an election, never
a requirement** — the protocol does not impose a schedule on you and neither does this kit:

- **`PROTECTED_98_MINUTES`** — the buy-side LP fee starts at 99% and decays to 1% over 98 minutes.
  The sell side is 1% throughout. This is the studio default for a *draft*.
- **`NONE`** — a flat 1% both ways from the first block. It takes an explicit acknowledgement, and
  it is never to be described as protected.

**A draft may default; a final bundle may not.** `market.antiSnipeMode` scaffolds as `UNSPECIFIED`
and `relics export` refuses to turn that into either answer — see
[the two refusals](#build-it-yourself). The election is written on chain at launch and no selector
changes it afterwards, which is exactly why a tool guessing on your behalf would be the wrong tool.

There are no exemptions; the hook reads nothing about who is swapping. Protection makes immediate
acquisition expensive and removes the block-one speed advantage. It does **not** guarantee equal
allocation, identify anyone, or stop a buyer from simply waiting. It is
not Sybil-resistant: it limits what one address can do, and an attacker can split across addresses
for the cost of gas. Full detail:
[12 — Launch protection](docs/launchpad/12-launch-protection.md).

![Buy-side LP fee against minutes since the pool opened: with PROTECTED_98_MINUTES the buy fee falls from 99% to 1% over 98 minutes, while with NONE it is a flat 1% from the first block; the sell fee is a flat 1% in both modes, drawn on the same line as the unprotected buy fee because they are the same number.](docs/assets/launch-protection.svg)

Checkpoints, as text: 0 min 99% · 1 min 98% · 10 min 89% · 30 min 69% · 60 min 39% · 90 min 9% ·
98 min and after, 1%. The sell side is 1% at every instant, in both modes.

**Burn policy** is the third permanent choice, and it is about YOUR token, not $RELICS.
`supply.burnPolicy` is `NONE` unless you say otherwise, and the other two — `HOLDER_BURN` and
`HOLDER_AND_ALLOWANCE_BURN` — are written into the token at launch with no setter, no admin and no
migration. Under a non-`NONE` policy your project's own `totalSupply` really does fall and a real
`Transfer` to the zero address is emitted. That is a different thing from the buy-and-entomb
allocation described above, which moves $RELICS to an address nobody can spend from and destroys
nothing. `HOLDER_AND_ALLOWANCE_BURN` is listed last because it has the largest surface, not because
it is better; nothing here recommends one.

**[→ The launchpad guide](docs/launchpad/)**

---

## Advanced paths

Two other things live in this repository. Neither is the creator kit, and neither is where a
first-time reader should start.

### Fork the starter template and deploy it yourself

A clean-room, MIT-licensed Solidity codebase: a fixed-supply ERC-20, a Uniswap v4 hook mined to a
valid address, an ERC-721 with fully on-chain metadata, three shipped renderers, and an immutable
position locker. No launchpad, no factory, no fee split — you deploy all of it, you own all of it,
and you are responsible for all of it.

Requires Foundry as well as Node. Educational; not production-ready.

**[→ Make it your own](docs/00-make-it-your-own.md)** ·
**[→ All 19 numbered guides](docs/)**

### Flagship reference

The exact production source of the live RELICS Uniswap v4 hook, byte-identical to its verified
source and proven offline to reproduce the deployed init code. It shares no code with the starter
template and is here to be read, not forked.

**[→ `flagship/`](flagship/)**

---

## Status, honestly

**You can build and export a real `.relics` bundle on any of the four chains. You can broadcast
one on Ethereum (1), Base (8453) or Robinhood Chain (4663).** Scaffolding, the studio, previews,
seed sweeps, validation, export and inspection are all real and all work offline right now. RC6 is
deployed on those three and its factory reads `PUBLIC` on each; it is not deployed on BNB Smart
Chain (56), which is deferred, and no date is set for it. The RC6 addresses are published in this
repository and printed by `npm run kit:status` — see
[08 — Status](docs/launchpad/08-status.md). Note separately that every launchable template targets
`SOLIDITY_SVG`, so a JavaScript-runtime bundle cannot be launched on any chain, open or not.

**And the path has been walked by somebody who is not us.** A project called `666` was launched
through the RC6 factory on Robinhood Chain from an ordinary wallet — not from the protocol Safe,
not through the pre-public canary path, and with nobody's permission. That is one launch, not a
track record, and it is offered here as evidence that the door opens rather than as a
recommendation. The creator app is served from the same origin as the RELICS collection:
**<https://www.relics.wtf/create>**.

**Verify before you rely on any of this**, including on this README. This repository is educational
software provided "as is", without warranty. It is not affiliated with or endorsed by Uniswap,
OpenZeppelin, OpenSea, Foundry, or any production collection. Nothing here is financial, legal or
investment advice. Deploying tokens, launching liquidity and distributing NFTs
carry real security, legal, tax and regulatory consequences — get your own qualified review before
doing anything real.

---

## Repository map

```
packages/project-schema/   the ONE schema, container, validator and hash implementation.
                           Zero dependencies. The CLI and the web importer run this exact code.
packages/creator-cli/      the `relics` CLI and its five starter templates
docs/creator-kit/          the kit: getting started, CLI, bundle format, security, importing
docs/launchpad/            what the transaction you eventually sign actually does
docs/00-…18-*.md           the fork-it-yourself starter template guides
src/ script/ test/         the starter template's Solidity, tooling and tests
apps/web/                  a config-driven Next.js demo app for the starter template
flagship/                  the deployed RELICS production hook + its offline CREATE2 proof
```

## Checks you can run

```bash
npm run kit:test          # schema, container, validator, sandbox, and every fixture
npm run kit:templates     # every starter template scaffolds, validates and exports
npm run kit:readme        # the quickstart above, executed out of this file
npm run kit:parity        # this schema is byte-identical to the one the importer runs
npm run kit:launch-claims # no document answers a launchability question the protocol answers no
npm run kit:fixtures      # regenerate the fixtures — a diff means drift
npm run kit:status        # the bundled deployment record and launch-access state
```

All of these run in CI on every push. See
[`.github/workflows/creator-kit.yml`](.github/workflows/creator-kit.yml).

## Contributing and licence

[`CONTRIBUTING.md`](CONTRIBUTING.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) ·
[`SECURITY.md`](SECURITY.md)

MIT — see [`LICENSE`](LICENSE). Third-party dependencies keep their own licences; note that
**Uniswap v4-core is BUSL-1.1**. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
