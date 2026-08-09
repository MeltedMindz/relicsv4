# The `.relics` project bundle

One file. One schema. One set of hashes on both sides.

A creator builds a project locally, exports a `.relics` bundle, and imports it in the RELICS
Launchpad creator app. The importer derives the same project hash, the same config hash and the
same component hashes the CLI printed at export time, because both sides run the same code:
`@relics/project-schema` (`packages/project-schema/`), a zero-dependency ES module package with
no build step. There is no second handwritten schema anywhere.

The launchpad is `PREPARED_NOT_DEPLOYED` on Ethereum (1), Base (8453) and Robinhood Chain (4663),
and its review to date is internal only. Nothing in this kit signs or broadcasts anything.

---

## The container

A `.relics` file is a **STORE-only ZIP**: every entry is stored uncompressed, entries are sorted
by path, timestamps are the fixed 1980-01-01 DOS epoch, general-purpose flags are zero, external
attributes are zero, no directory entries are written, no extra fields are emitted, and the
archive comment is exactly `relics-project-bundle/1`.

Standard `unzip` reads it. `unzip -t` verifies it.

### Why STORE-only rather than a deflated ZIP

**Determinism.** Two bundles with the same files are byte-identical on every machine. A deflated
archive is only as reproducible as the zlib build that wrote it: the same bytes at the same level
can compress differently across zlib versions and across Node/browser implementations, which
would change the bundle hash for reasons that have nothing to do with the project.

**Zip bombs stop being a category.** Stored entries have an expansion ratio of exactly 1:1, so
`compressedSize == uncompressedSize` is an invariant the reader checks before it allocates
anything. There is no decompressor to attack and no ratio to bound.

**No decompression dependency.** The same reader runs in Node, on a browser main thread, and
inside a worker with no polyfill and no streaming API.

The cost is size: JSON and JavaScript are stored raw. The format caps a bundle at 20 MB and a
generator script at 36,000 bytes, and PNG/WebP assets are already compressed, so the trade is
cheap.

### What the reader refuses

| Refused | Why |
| --- | --- |
| any compression method other than STORE | the ratio invariant, and the zip-bomb class with it |
| ZIP64 layouts, multi-disk archives | a 64-bit layout this reader deliberately does not implement |
| encrypted entries, streaming data descriptors | sizes and content must be known before anything is read |
| non-zero external attributes | this is also what refuses symlinks |
| `..`, `.`, empty segments, absolute paths, drive letters | path traversal |
| backslashes | a Windows separator some extractors treat as a directory boundary |
| control, zero-width and bidirectional characters | path confusion |
| non-NFC names, any non-ASCII name | two visually identical names that are not the same bytes |
| dotfiles, Windows reserved device names, trailing dot/space | extraction hazards |
| duplicate paths after case folding | `Assets/a.png` and `assets/a.png` land on one file |
| entries past the size, count, depth or path-length limits | resource exhaustion |
| overlapping entry data, out-of-range offsets, CRC failures | a lying central directory |
| trailing bytes after the end record | an appended payload |
| a missing or wrong archive comment | an ordinary ZIP renamed `.relics` |

---

## Layout

```
relics.project.json     the manifest — generated, never hand-written
checksums.json          per-file digests plus the three integrity hashes — generated
README.md               optional
LICENSE                 optional
generator/
  generate.js           exactly one script; exports render(context)
  params.json           SOLIDITY_SVG only: declarative template parameters
traits/schema.json      trait dimensions and weights
market/mappings.json    sensor -> transform -> destination wiring
metadata/collection.json  collection-level metadata
assets/                 images and other media the metadata references
previews/               deterministic sample renders
```

Extensions are allowlisted per directory. `.sol`, `.vy`, `.yul`, `.wasm`, executables, shell
scripts, interpreter sources, key material, `.env` and `.html` are refused everywhere, each with
its own message.

Exactly one `.js` file may live under `generator/`. A launch stores one script, so a generator
split across files could not be submitted as written; refusing it at export beats discovering it
at prepare time.

---

## Hashes

All SHA-256, lowercase hex, no `0x` prefix.

```
fileHash(path)      = sha256(raw file bytes)
jsonHash(document)  = sha256(utf8(canonicalJson(parsed document)))

scriptHash          = fileHash(generator/generate.js)
generatorHash       = jsonHash({ "generator/…": fileHash, … })   sorted by path
traitSchemaHash     = jsonHash(traits/schema.json)
marketMappingHash   = jsonHash(market/mappings.json)
metadataHash        = jsonHash(metadata/collection.json)
mediaHashes         = { "assets/…": fileHash, … }

contentHash         = jsonHash({ every entry except relics.project.json
                                 and checksums.json: fileHash })
projectConfigHash   = jsonHash(manifest with `integrity` removed)
bundleHash          = sha256(utf8("relics-project-bundle/1\n"
                              + projectConfigHash + "\n" + contentHash))
```

`integrity` is excluded from `projectConfigHash`, so nothing is circular: the manifest fully
determines its own config hash, the entries determine the content hash, and the bundle hash is a
pure function of the two. An importer recomputes all three and compares.

**Canonical JSON** sorts keys at every level, emits no insignificant whitespace, and refuses
anything with no single canonical form (non-finite numbers, bigints, functions, undefined). JSON
documents are stored pretty-printed for human reading; the hashes that matter are computed on the
parsed canonical form, so formatting cannot move them.

---

## The manifest

`relics.project.json` is a **closed schema**. Every accepted key is enumerated; an unknown key is
an error, not a passthrough.

```jsonc
{
  "schemaVersion": "1.0.0",
  "creatorKitVersion": "1.0.0",
  "runtimeVersion": "relics-art-runtime/1",
  "protocolReleaseCompatibility": "v4-art-launchpad/g-1.1",

  "project":  { "name", "symbol", "description", "license", "website?", "twitterHandle?" },
  "supply":   { "totalSupplyWhole", "artworkSupply", "backingModel", "tokensPerArtwork?" },
  "art":      { "runtime", "templateId", "entry", "seed", "scriptBytes", "traitDimensions?" },
  "market":   { "startingPreset", "launchMode", "mappingCount", "sale?" },
  "earnings": { "mode", "creatorRecipient", "collaborators", "creatorAllocationBps?" },
  "chains":   { "requested": [1 | 8453 | 4663, …] },
  "media":    { "cover?": { "path", "sha256", "cid?" }, "files?": {} },

  "hashes":    { "algorithm", "script", "dependencies", "generator",
                 "traitSchema", "marketMapping", "metadata", "media?" },
  "integrity": { "contentHash", "projectConfigHash", "bundleHash" }
}
```

### There is no field for contract code

The manifest has no key for hook source, contract bytecode, an init-code hash, an address to
call, a library to link, or a template to compile. Combined with the forbidden-extension list,
that means a one-click bundle **cannot express** "run this contract" — not as code, not as a
reference, not as a hint. Replacing ArtHook, the economic kernel, the liquidity kernel,
ProjectToken, ProjectCollection, the sale escrow, the router or the buyback is not something the
format can say.

Attempts get their own error rather than a generic one. `hook`, `hooks`, `hookAddress`,
`hookSource`, `hookBytecode`, `bytecode`, `initCode`, `initCodeHash`, `contracts`, `solidity`,
`kernel`, `economicKernel`, `liquidityKernel`, `projectToken`, `projectCollection`, `saleEscrow`,
`router`, `buyback`, `calls`, `multicall`, `delegatecall`, `scripts`, `postinstall`, `rpcUrl`,
`rpc`, `apiKey`, `privateKey` and `mnemonic` are all refused by name, at every nesting level.

A custom hook goes through a separate reviewed process. There is no bundle path to one.

---

## The art runtime

`render(context)` returns an SVG string. `context` is frozen plain data:

| Field | What it is |
| --- | --- |
| `seed` | the token's seed, a string |
| `random` | a seeded PRNG — `next`, `float`, `int`, `chance`, `pick`, `weighted` |
| `market` | destination values in `[0,1]`, one per mapping you declared |
| `sensors` | raw sensor readings in `[-1,1]` |
| `size` | canvas edge in user units |
| `project` | name, symbol, artworkSupply |

No clock, no network, no filesystem, no host object. `Math.random` throws. A destination you have
not mapped is absent rather than zero, so read it with a fallback and the piece still renders
before its first trade.

Approved runtimes are `SOLIDITY_SVG` and `JAVASCRIPT`. Naming an unapproved runtime (`P5`,
`WEBGL`, `WASM`, …) is a specific error, not an unknown-value error: adding a runtime is a
protocol decision, not a bundle setting.

---

## Market mappings

`market/mappings.json` is a closed vocabulary: a sensor id, a transform id, numeric parameters
inside published bounds, and a destination id. No expression to parse, no callback, no address.
At most eight mappings.

Sensors: `buying_pressure`, `selling_pressure`, `volume`, `tick`, `volatility`, `drawdown`,
`recovery`, `liquidity`, `holder_growth`, `epoch`, `market_seed`.

Transforms: `threshold`, `range`, `clamp`, `smoothing`, `tier`, `accumulation`, `decay`,
`inverse`, `weighted_mix` — each with its own parameter list and `[min,max]` bounds.

Destinations: `palette`, `brightness`, `density`, `scale`, `symmetry`, `fracture`, `line_weight`,
`distortion`, `geometry`, `scar`, `animation`.

Every transform clamps on every branch, so a destination can never receive an out-of-range value
however strange the sensor reading is. The test suite asserts this across the full input range
including `NaN` and `Infinity`.

---

## Versioning

Four version strings travel in every bundle:

- `schemaVersion` — the bundle format. An importer accepts a bundle whose MAJOR it knows and whose
  MINOR is at or below its own.
- `creatorKitVersion` — the CLI that produced it.
- `runtimeVersion` — the `render(context)` contract the generator was written against.
- `protocolReleaseCompatibility` — the launchpad parameter surface it was built for. This
  identifies a parameter surface, never a deployment.

---

## Fixtures

`packages/project-schema/fixtures/`:

- `parity/` — valid bundles built by the CLI from the shipped templates, plus `expected.json`
  holding every hash, the studio-draft projection, the provenance block, and per-seed output
  digests. An importer must reproduce all of it.
- `hostile/` — bundles that must be refused, plus `expectations.json` naming the layer and the
  error code each one is expected to trip.

Regenerate both with `node packages/project-schema/fixtures/build.mjs`. The output is
deterministic.
