# The `relics` CLI

The local half of the creator kit. It scaffolds a project, renders it deterministically, checks
it against every rule the importer enforces, and writes one `.relics` bundle.

Nothing in it signs a transaction, broadcasts anything, or contacts a network.

## Running it

From this repository, with Node 20 or newer:

```bash
npm run kit -- <command> [...]
# or directly
node packages/creator-cli/bin/relics.js <command> [...]
```

Examples below use `relics` for readability.

---

## `relics status`

Prints the RC5 platform deployment record bundled with this kit: release tag, freeze commit,
factory addresses, launch-access state, and the size of the Robinhood stock-token quote reference.

```bash
npm run kit:status
# or
npm run kit -- status
```

This command is offline. It does not poll a chain or try to infer whether public launch has opened.
When public creation opens, the deployment record in `packages/project-schema/src/deployments.js`
will change from `PREPARED` to `PUBLIC`.

---

## `relics init <directory> [--template <id>] [--name …] [--symbol …] [--force]`

Copies a starter template into a new directory and sets its name and symbol. `relics templates`
lists what is available.

Every template ships a placeholder `earnings.creatorRecipient` that validation refuses on
purpose, so nobody exports a project that pays a placeholder.

## `relics templates`

Lists the starter templates and the art runtime each one targets.

| id | runtime | what it shows |
| --- | --- | --- |
| `minimal` | JAVASCRIPT | the smallest complete project |
| `market-responsive` | JAVASCRIPT | four sensors wired to four art parameters, and a SPLIT earnings config |
| `static-art` | JAVASCRIPT | no mappings at all — the art never changes |
| `onchain-js` | JAVASCRIPT | writing for the 36,000-byte script budget |
| `solidity-svg-params` | SOLIDITY_SVG | parameters for a registered on-chain template, with a local preview |

There is no p5-style template. p5 is not an approved art runtime, so the schema refuses a bundle
that names it rather than shipping a template that could not launch.

## `relics dev [directory] [--port 4321]`

Serves a local studio on `127.0.0.1`. Render any seed, drag the market destinations to see how
the art responds, read the derived traits. The project is re-read on every request, so editing
`generator/generate.js` and refreshing is the whole loop.

The page is self-contained: no CDN, no fonts, no analytics, nothing to fetch. The market values
are sliders, not chain reads.

## `relics preview [directory] [--seeds 1,2,3 | --count 8] [--out previews] [--size 240]`

Writes deterministic SVGs into `previews/` and a contact sheet at
`preview-contact-sheet.html` in the project root. (The sheet stays out of `previews/` because
HTML is not a file type a bundle may carry.)

## `relics test-seeds [directory] [--count 100]`

Renders a sample in the isolated sandbox and reports what the collection actually looks like at
scale: how many seeds failed, how many rendered blank, how many were non-deterministic, how many
distinct artworks came out, the average output size, and the trait duplicate rate against the
schema's combination space.

## `relics validate [directory] [--bundle file.relics] [--count 24] [--in-process] [--structural-only]`

Runs every check and writes nothing. This is the same code path `export` uses on the same
assembled bytes, so "validate passed" means "export would produce this".

`--bundle` checks an exported file instead of a project directory. `--in-process` uses the faster
in-process sandbox instead of the isolated child process. `--structural-only` skips execution
entirely.

### The checks

| Check | What it means |
| --- | --- |
| container structure | the ZIP layer: methods, sizes, offsets, CRCs, attributes, comment |
| layout and entry paths | allowed directories, allowed extensions, required entries, path safety |
| no contract code or protocol override | no `.sol`/`.wasm`/…; no refused manifest key |
| manifest schema | closed key space, types, ranges, cross-document agreement |
| approved art runtime | `SOLIDITY_SVG` or `JAVASCRIPT`, nothing else |
| allowed dependencies | one generator script, relative sibling imports only, no packages |
| no external network dependency | no `fetch`/`XMLHttpRequest`/`WebSocket`, no external URL |
| script byte budget | `generate.js` within 36,000 bytes, and the manifest agrees |
| trait schema | dimension and value counts, names, weights, duplicates |
| market mapping bounds | closed vocabulary, published numeric bounds, contested destinations |
| collection metadata | required fields, bundle-relative images, https-only links |
| earnings configuration | mode, recipient, collaborator bps sum, no placeholder recipient |
| supply and artwork backing | backing model consistency, artworks backed by tokens that exist |
| requested chains | 1, 8453 or 4663; no duplicates |
| secret scan | key material, credentialed RPC URLs, tokens, keystores, mnemonics |
| hash integrity | every declared hash recomputed from the bytes |
| art binding matches the bundle | the runtime, art config, generator, trait, mapping and metadata hashes recomputed from the container; the output commitment checked against a real render; no chain fact asserted |
| generator runs without errors | the generator loads and renders |
| no blank or unsafe outputs | drawable content, size bounds, and SVG document safety |
| deterministic output | each seed rendered twice must produce identical bytes |
| trait duplicate rate | distinct outputs and trait-set repetition across the sample |

## `relics export [directory] --output my-project.relics`

Validates, then writes. A project that fails validation is never packaged, and there is no
`--force`: a bundle that fails here is a bundle the launchpad refuses anyway, and writing one
would only move the failure somewhere less useful.

Prints the bundle hash. Import the file in the creator app; it derives the same one.

## `relics inspect <file.relics> [--json] [--draft]`

Reads a bundle and prints what it declares — entries, sizes, identity, supply, art runtime,
market, earnings, chains, and every hash — followed by the structural checks.

**The generator is never executed.** Inspect is what you run on a bundle someone sent you.
`--json` emits the whole report; `--draft` emits the studio-draft projection the importer builds.

---

## Exit codes

`0` when the command succeeded and validation passed, `1` otherwise. Warnings do not fail a run;
errors do.

## `relics migrate`

```
relics migrate <file.relics> [--out directory]
```

Opens a bundle exported by an older creator kit into a project directory you can finish.

### Previews cannot go stale

`relics export` **writes** `previews/seed-*.svg` into the bundle from the render it just performed
— it does not copy whatever sits in your `previews/` directory. Editing the generator and
forgetting to re-render can no longer ship images of the old art.

`relics validate` still tells you when the copies **in your project** are behind, as
`PREVIEW_STALE` warnings naming the file and the fix (`relics preview`). The bundle is correct
either way; the warning is so you do not believe the images in your repo are current.

A bundle assembled by hand or by an older kit is checked directly: `PREVIEWS_FRESH` compares each
`previews/seed-N.svg` against what the generator draws for that seed and fails with
`PREVIEW_STALE`, `PREVIEW_MISSING`, or warns `PREVIEW_UNEXPECTED` for a preview of a seed nothing
verifies.

### `relics export --draft`

Writes a **`.relics-draft`** you can circulate for review before the final details — a treasury
address, a recipient — exist.

A draft is not a renamed bundle. Three things say so, and none of them is the filename:

- the **archive marker** is `relics-project-draft/1`, so the importer refuses it outright;
- the **manifest** carries `status: "DRAFT"`, which is inside both integrity hashes;
- the **commitment** is computed over the draft marker, so a draft and a final bundle with
  identical content commit to different values.

`mv project.relics-draft project.relics` therefore produces a file the launchpad still refuses.
Re-run `relics export` without `--draft` to produce the real thing.

### Choosing a quote asset

Your project is priced and traded in a **quote asset**, and you request it in
`relics.config.json` under `market.quoteAsset`:

```json
"market": {
  "quoteAsset": { "mode": "DEFAULT" }
}
```

- `{"mode": "DEFAULT"}` — the importing chain's default. The portable choice; every chain has one.
- `{"mode": "ADDRESS", "address": "0x…", "expectedKind": "STABLE"}` — a specific asset. The
  address is **a request, not a claim**: the importer re-resolves it against the live registry, and
  `expectedKind` is a cross-check that can only ever cause a refusal, never an approval.

**Requested is not approved.** A bundle naming an asset the registry does not currently enable
imports as a draft with launch readiness BLOCKED, and you pick another. A bundle can never widen
the set of assets the platform accepts. Multi-quote is a Robinhood Chain capability; Ethereum and
Base admit only WETH in this release. BNB Smart Chain is deferred.

The complete RC5 Robinhood stock/ETF reference is exported from
`packages/project-schema/src/robinhood-stock-tokens.js`. For example:

```js
import { robinhoodStockTokenBySymbol } from "@relics/project-schema";

const gme = robinhoodStockTokenBySymbol("GME");
// gme.address === "0x1b0E319c6A659F002271B69dB8A7df2F911c153E"
```

A pre-3.0.0 Solidity bundle **cannot** be converted automatically, and this command does not
pretend otherwise. ACV1 needs a market sensor and a response curve for every layer, a literal RGB
palette and a background index; a 2.x bundle records none of them. Its palette is an index into a
colour table that lives in a template's preview sketch, not in the bundle.

So `migrate` carries over everything that is recoverable — project identity, supply, earnings, trait
schema, market mappings, metadata, assets, generator — and writes `generator/params.json` with every
artist-supplied field explicitly `null`, alongside the vocabularies and bounds for each one and your
previous parameters kept for reference. Nothing is defaulted and nothing is borrowed from a
template.

`relics export` refuses those nulls by name, listing every outstanding decision at once rather than
one per attempt. The source bundle hash is recorded as provenance; re-exporting mints a new one,
because a different artwork is a different bundle.
