# Getting started

From a fresh clone to an exported `.relics` bundle. About twenty minutes, no wallet, no network.

If you would rather have an agent do the writing, read
[Create with an agent](./create-with-an-agent.md) instead — it covers the same ground with a
different division of labour.

---

## What you need

| | |
| --- | --- |
| **Node.js 20 or newer** | `node --version` |
| **git** | to clone |
| a text editor | you will edit one JavaScript file and one JSON file |

That is the whole list. You do **not** need Foundry, a wallet, an RPC endpoint, testnet funds, or a
Docker daemon. Foundry is only needed for the [starter template](../00-make-it-your-own.md), which
is a different, advanced path.

```bash
git clone https://github.com/MeltedMindz/relicsv4.git
cd relicsv4
npm install
```

`npm install` pulls dependencies for the demo web app and the test tooling. The creator kit itself
has **zero runtime dependencies** — it is plain ESM with no build step — so `npm run kit` works
before the install finishes.

---

## 1. Pick a starting point

```bash
npm run kit -- templates
```

Five templates ship. Two things to notice in the output: the **runtime** each one targets, and
whether that runtime is currently **launchable**.

| Template | Runtime | Start here if… |
| --- | --- | --- |
| `minimal` | `ONCHAIN_JAVASCRIPT_V1` | you want the smallest complete project to read end to end |
| `market-responsive` | `ONCHAIN_JAVASCRIPT_V1` | you want four sensors already wired to four art parameters |
| `static-art` | `ONCHAIN_JAVASCRIPT_V1` | the art should never change after mint |
| `onchain-js` | `ONCHAIN_JAVASCRIPT_V1` | you want the 36,000-byte script budget in view from line one |
| `solidity-svg-params` | `SOLIDITY_SVG_V1` | you want the generic parameter surface a launch binds |
| `geometric-recursion-compass` | `GEOMETRIC_RECURSION_V1` | recursive geometry: rings of rings, coloured by level |
| `vector-composition-alluvium` | `VECTOR_COMPOSITION_V1` | layered vector fields: sediment the market writes |

**Approved and launchable are not the same question.** Every runtime here is approved: the format
accepts them, and all seven templates validate, preview and export. Three are *bound and rendered*
by a deployed collection, so the four JavaScript templates are marked `preview only` in
`relics templates`, in `relics init`, and in `relics validate`. They are real, valid projects that
cannot be launched — not broken ones, and not launchable ones being described loosely.

The two Wave-1 engines are launchable through the autonomous terminal workflow
(`relics agent ...`) while Studio integration is being completed. That is the whole claim: there is
no Studio picker for them yet, and this page does not offer one.

The JavaScript refusal is **structural, not a schedule**: `ArtRuntimeRegistry.modeAvailable` is a
`pure` function admitting the Solidity-SVG mode alone, so registering a JavaScript runtime reverts
and no operator or governance action can register one. This document does not know when that
changes, so it does not say. Nothing you write is wasted either way — a JavaScript project authors,
previews, validates and exports exactly like a Solidity-SVG one, and the kit will never convert it,
suggest switching runtime to unlock a launch, or delete a generator.

## 2. Scaffold

```bash
npm run kit -- init my-project --template minimal
```

You get a directory that looks like this:

```
my-project/
├── relics.config.json      ← the project's source of truth. YOU EDIT THIS.
├── generator/generate.js   ← the art. YOU EDIT THIS.
├── traits/schema.json      ← trait dimensions and weights
├── market/mappings.json    ← sensor → transform → destination wiring
├── metadata/collection.json← name, description, cover image
├── previews/               ← written by `relics preview`
├── README.md
└── LICENSE
```

There is no `relics.project.json` here, and there never will be. That file is **generated at
export** and exists only inside the `.relics` bundle. See
[Which file do I edit?](./README.md#which-file-do-i-edit) — it is the single most common confusion
in this kit.

## 3. Set your recipient — the project will not export without it

Open `relics.config.json` and replace the placeholder:

```json
"earnings": {
  "mode": "SOLO",
  "creatorRecipient": "0x1111111111111111111111111111111111111111",
  "collaborators": []
}
```

Every template ships that placeholder, and validation refuses it by name:

```
error EARNINGS_RECIPIENT_PLACEHOLDER relics.project.json#earnings.creatorRecipient
```

This is deliberate. Nobody exports a project that pays a placeholder, and the gate is the only
thing standing between a freshly scaffolded template and a clean run.

While you are in the file, set `project.name`, `project.symbol`, `supply` and `chains.requested`
to what you actually want.

## 4. Open the studio

```bash
npm run kit -- dev my-project
```

Serves a page on `127.0.0.1` — render any seed, drag the market sliders to see how the art
responds, read the derived traits. The project is re-read on every request, so **edit
`generator/generate.js`, refresh, look** is the whole loop.

The page is self-contained: no CDN, no fonts, no analytics, nothing to fetch. The market values are
sliders, not chain reads — there is no chain to read yet.

## 5. Write the art

`generator/generate.js` exports one function:

```js
export function render(context) {
  // return an SVG string
}
```

`context` is frozen plain data, and it is everything the generator is allowed to know:

| | |
| --- | --- |
| `context.seed` | the token's seed, as a string |
| `context.random` | a **seeded** random helper — `next` / `float` / `int` / `chance` / `pick` / `weighted` |
| `context.market` | one value in `[0,1]` per destination you mapped |
| `context.sensors` | raw sensor readings in `[-1,1]` (usually you want `context.market`) |
| `context.size` | the canvas edge, in user units |
| `context.project` | name, symbol, artworkSupply |

There is no clock, no network, no filesystem and no host object. `Math.random` is not available.

**Read `context.market` with a fallback.** Before a single trade has happened, a mapped destination
may be absent, and a preview that renders blank on day zero is a preview that tells you nothing:

```js
const fracture = typeof market.fracture === "number" ? market.fracture : 0;
```

Keep the seed's job and the market's job separate. The seed decides what the piece **is**; the
market decides what condition it is **in**. Get that separation right and every token stays
recognisably itself while the whole collection moves together.

## 6. Look at a lot of seeds

```bash
npm run kit -- preview my-project --count 8
npm run kit -- test-seeds my-project --count 100
```

`preview` writes deterministic SVGs into `previews/` plus a contact sheet at
`preview-contact-sheet.html` in the project root.

`test-seeds` runs a sample in the isolated sandbox and tells you what the collection looks like at
scale:

```
  rendered               60 / 60
  failed                 0
  blank                  0
  non-deterministic      0
  distinct outputs       60
  average size           771 B
  distinct trait sets    37
  trait duplicate rate   38.3%
  combination space      60
```

`combination space` is how many distinct trait combinations your `traits/schema.json` can express.
If it is smaller than your artwork supply, trait **labels** will repeat — validation warns about
this. That is only a problem if you meant the labels to be unique; the artwork itself can still be
distinct for every seed.

`non-deterministic` must be `0`. Anything else means your generator is reading something it should
not, and export will refuse it.

## 7. Validate

```bash
npm run kit -- validate my-project
```

Runs every check the importer runs, and writes nothing. This is the same code path `export` uses on
the same assembled bytes, so *validate passed* means *export would produce this*. There are
[twenty-odd checks](./cli.md#the-checks) covering the container, the layout, the manifest, the
runtime, the traits, the market bounds, the metadata, the earnings, the supply, the chains, a
secret scan, every hash, and four execution checks.

Warnings do not fail a run; errors do. Exit code is `0` on pass, `1` otherwise.

## 8. Export

```bash
npm run kit -- export my-project --output my-project.relics
```

Validates, then writes. A project that fails validation is never packaged, and there is no
`--force`: a bundle that fails here is a bundle the importer refuses anyway.

It prints a bundle hash. Keep it — the importer derives the same one from your bytes, and you can
compare them.

```bash
npm run kit -- inspect my-project.relics
```

Reads a bundle and prints what it declares — entries, sizes, identity, supply, runtime, market,
earnings, chains, and every hash — **without executing the generator**. This is what you run on a
bundle somebody sent you.

## 9. Circulate a draft, if you need to

```bash
npm run kit -- export my-project --output my-project.relics-draft --draft
```

A draft is for circulating work in progress. It still has to pass every check a final bundle
passes — including a real `creatorRecipient`, so `--draft` is not a way to skip step 3 — and it is
not a renamed bundle: the archive marker, the manifest status and the commitment all differ, so
`mv draft.relics-draft final.relics` still produces a file the launchpad refuses.

---

## Where to go next

| | |
| --- | --- |
| [Every command and flag](./cli.md) | the complete CLI reference, and what each check means |
| [The bundle format](./bundle-format.md) | every field, every hash recipe, generated vs yours |
| [Treating every bundle as hostile](./bundle-security.md) | the threat model and what is *not* defended |
| [Importing a bundle](./importing.md) | for anyone building an importer of their own |
| [The launchpad guide](../launchpad/) | what the transaction you eventually sign actually does |

## When something goes wrong

| Symptom | What it means |
| --- | --- |
| `EARNINGS_RECIPIENT_PLACEHOLDER` | you have not set `earnings.creatorRecipient` yet — [step 3](#3-set-your-recipient--the-project-will-not-export-without-it) |
| `PREVIEW_STALE` / `PREVIEW_MISSING` | the SVGs in your `previews/` directory are behind the generator. The **bundle** is still correct — export writes previews from the live render — but run `relics preview` so your repo is not lying to you. |
| non-deterministic output | the generator is reading a clock, the network, or `Math.random`. Validation renders every seed twice and compares. |
| `MARKET_SENSOR` / `MARKET_DESTINATION` / `MARKET_TRANSFORM` | an id outside the closed vocabulary. The error message lists every allowed value. |
| `MARKET_PARAM_BOUNDS` | a transform parameter outside its published range. |
| `MARKET_DESTINATION_CONTESTED` (warning) | two mappings drive the same destination; the later one wins, which is rarely what anyone means. |
| a blank render | a mapped `context.market` value was absent and you read it without a fallback — [step 5](#5-write-the-art). |
| `unknown option --x` | the CLI uses long options only and refuses flags it does not recognise rather than ignoring them. |

Exit `0` means the command succeeded and validation passed. Exit `1` means it did not.
