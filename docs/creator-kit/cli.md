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
