# The `.relics` project bundle

One file. One schema. One set of hashes on both sides.

A creator builds a project locally, exports a `.relics` bundle, and imports it in the RELICS
Launchpad creator app. The importer derives the same project hash, the same config hash and the
same component hashes the CLI printed at export time, because both sides run the same code:
`@relics/project-schema` (`packages/project-schema/`), a zero-dependency ES module package with
no build step. There is no second handwritten schema anywhere.

Nothing in this kit signs or broadcasts anything; it builds one file. Whether a given chain will
accept a launch is a separate question, and per-chain deployment and launch state is stated once,
in [`../launchpad/08-status.md`](../launchpad/08-status.md) — not restated here, so it cannot go
stale here.

New to the kit? Start at [Getting started](./getting-started.md).

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

### Local media versus published metadata

`metadata/collection.json` and `assets/` are local bundle inputs. They make the bundle reviewable
and hashable; they are not already public URLs.

Before a launch writes project metadata, the importer must normalize the chosen collection image,
publish it to an allowed public URI (`ipfs://`, `https://` or `ar://`), verify the bytes, and then
write that URI through `ProjectMetadataRegistry`. Relative asset paths and `data:` URIs are
therefore valid inside the bundle but invalid as contract-level media. The per-NFT artwork remains
separate: `tokenURI(id)` renders from the on-chain art binding, not from the collection image.

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

### The second hash family: keccak256

Everything above is sha256, and sha256 addresses **files** — reproducible with `shasum`, readable
in a diff. But the EVM computes keccak256, and a launch stores keccak256. So the binding block
restates the same documents under keccak:

```
keccakJson(document) = keccak256(utf8(canonicalJson(parsed document)))

artConfigHash        = keccak256(the exact bytes the launch stores, appendix included)
artConfigVisualHash  = keccak256(abi.encode(1, flags, background, palette, layers))   ACV1 only
artConfigTraitSchemaHash
                     = keccak256(abi.encode(1, traits))                               ACV1 only
templateParamsHash   = keccakJson(generator/params.json)
generatorSourceHash  = keccakJson({ "generator/…": sha256, … })
traitSchemaDocumentHash
                     = keccakJson(traits/schema.json)
marketMappingHash    = keccakJson(market/mappings.json)
metadataHash         = keccakJson(metadata/collection.json)
bundleCommitment     = keccak256(utf8("relics-project-bundle/1\n"
                            + projectConfigHash + "\n" + contentHash))
```

`bundleCommitment` hashes the identical preimage as `bundleHash`, so one `bytes32` names the
bundle in a launch without inventing a second notion of what "this bundle" means. It lives in
`integrity`, which `projectConfigHash` excludes — otherwise the binding would be hashing itself.

**Every digest is stored bare — no `0x`.** `0x` followed by 64 hex characters is exactly the shape
of a raw private key, which the bundle's own secret scanner refuses everywhere. Prefixing these
would have meant either a manifest that trips the scanner or a scanner taught to ignore the one
shape it exists to catch. The CLI prints them with the prefix, because on screen you are about to
compare the value against a transaction.

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
  "schemaVersion": "3.2.0",
  "creatorKitVersion": "3.10.0",
  "runtimeVersion": "relics-art-runtime/1",
  "protocolReleaseCompatibility": "v4-art-launchpad/g-1.2",

  "project":  { "name", "symbol", "description", "license", "website?", "twitterHandle?" },
  "supply":   { "totalSupplyWhole", "artworkSupply", "backingModel", "tokensPerArtwork?",
               "burnPolicy?" },
  "art":      { "runtime", "templateId", "entry", "seed", "scriptBytes", "traitDimensions?" },
  "market":   { "startingPreset", "launchMode", "mappingCount", "sale?", "chainId?",
                "quoteAsset?", "creatorLpFeeAssetMode?" },
  "earnings": { "mode", "creatorRecipient", "collaborators", "creatorAllocationBps?" },
  "chains":   { "requested": [1 | 8453 | 4663, …] },
  "media":    { "cover?": { "path", "sha256", "cid?" }, "files?": {} },

  "hashes":     { "algorithm", "script", "dependencies", "generator",
                  "traitSchema", "marketMapping", "metadata", "media?" },
  "artBinding": { "schemaVersion", "runtime", "runtimeId", "runtimeIdHash",
                  "artRuntimeVersion", "artMode", "templateId", "artConfigSource",
                  "artConfigFormat", "artConfig", "artConfigBytes", "artConfigHash",
                  "artConfigVisualHash", "artConfigTraitSchemaHash",
                  "templateParamsHash", "generatorSourceHash", "traitSchemaDocumentHash",
                  "marketMappingHash", "metadataHash", "representativeOutputsHash",
                  "runtimeCodeHash": null, "scriptPointer": null },
  "integrity":  { "contentHash", "projectConfigHash", "bundleHash", "bundleCommitment" }
}
```

## The art binding

This is the block a collection renders from. Before it existed, a bundle described its art to a
human and to a validator and to nobody else: the launch stored the script bytes on chain, but
`ProjectCollection.tokenURI` never referenced them, so every project rendered the same built-in
shapes regardless of what its creator drew. The binding is the record that closes that — an
immutable statement of which runtime renders a project and which exact bytes it renders from.

**It is derived, never authored.** The builder computes it from the entries; the validator
recomputes it from the finished container and refuses any difference. Edit the generator and
`artConfigHash` moves. Edit the mappings and `marketMappingHash` moves. Edit the block itself and
it stops matching the files it claims to describe. There is nothing in it an importer has to take
on trust, which is exactly why an importer can build launch parameters straight from it.

| field | what it is |
|---|---|
| `runtimeId` | the stable, versioned renderer identity — `ONCHAIN_JAVASCRIPT_V1`, `SOLIDITY_SVG_V1`. The version is in the name so a future runtime gets a new id and an existing collection stays bound to the one it launched with. |
| `artConfigFormat` | how the configuration is laid out: `ACV1` for the Solidity runtime, `JS_SOURCE_V1` for the JavaScript one. Named separately from the runtime because an importer needs it to decode and display the art. |
| `artConfig` | **the configuration itself**, as bare hex, for `ACV1`. A bundle carries its art, not merely a digest of it, so a reviewer can decode and read the palette and layer graph without re-deriving anything. `null` for `JS_SOURCE_V1`, where the bytes are already an entry and restating them would let a manifest disagree with its own file. |
| `artConfigHash` | keccak256 of the exact bytes the launch stores — the value the factory checks `keccak256(artConfig)` against, and that `ProjectCollection.bindArt` re-checks against the bytes it reads back out of storage. Taken over the **whole transmitted byte string, appendix included**: two ACV1 documents that decode identically can hash differently, so hashing a re-encode of a decoded document is silently wrong. |
| `artConfigVisualHash` / `artConfigTraitSchemaHash` | the two commitments the runtime derives from the decoded ACV1 document, using `abi.encode` (padded), not `encodePacked`. `traitSchemaHash` is what `validateConfigV1` returns and the collection stores, so the kit prints a value the chain will hold before any launch exists. `null` for a JavaScript generator, which declares no such program. |
| `templateParamsHash` | keccak256 of `generator/params.json`, the creator's **authoring document**. The configuration bytes are derived from it inside assembly, so a bundle cannot carry art its own parameters do not produce. |
| `generatorSourceHash` / `traitSchemaDocumentHash` | keccak over this bundle's generator **source-file digests**, and over `traits/schema.json`. **Named apart from the chain's fields deliberately.** `ProjectCollection` derives values it also calls `generatorHash` and `traitSchemaHash`, and they are different quantities: the collection's `generatorHash` is `keccak256(abi.encode(mode, runtimeVersion, runtimeCodeHash, artConfigHash, traitSchemaHash, marketMappingHash))` — which necessarily includes `runtimeCodeHash`, a chain fact a bundle is forbidden from asserting, so the two can never agree by construction — and its `traitSchemaHash` is over the traits decoded from the ACV1 bytes, which this bundle carries separately as `artConfigTraitSchemaHash`. Both pairs are honest commitments to the same subject matter; neither is computable from the other. Sharing the names invited an equality assertion that could only be satisfied by making one side wrong. |
| `representativeOutputsHash` | a commitment to what the generator actually draws for eight fixed seeds. An importer re-renders them in its own sandbox; a mismatch means the art in the file is not the art that was validated. |

### A bundle can never state a chain fact

`runtimeCodeHash` and `scriptPointer` are always `null`, and a bundle that fills either one in is
refused by name:

- `runtimeCodeHash` is the deployed renderer's `EXTCODEHASH`. The importer reads it from the chain
  the creator is launching on. A bundle that could assert one could pin a renderer of its choosing.
- `scriptPointer` is the SSTORE2 address the launch writes. It does not exist until the launch
  transaction executes.

They are present as explicit `null` rather than absent, so the bundle's shape and the on-chain
record's shape line up field for field, and so a forgery is caught by name rather than by a generic
unknown-key check. This is the same REQUEST-never-APPROVAL rule the quote asset follows.

### Approved is not launchable

`APPROVED_ART_RUNTIMES` is what the format accepts. `LAUNCHABLE_ART_RUNTIMES` is what the
launchpad currently binds and renders. A runtime can be approved and not yet launchable; when it
is, its templates still ship, still preview, still export — the kit marks them rather than
deleting the work or implying they can be launched.

Launchability is deliberately **not** a manifest field. It is a property of the protocol on the day
you ask, and folding it into the bundle hash would mean enabling a runtime invalidated every bundle
exported while it was gated.

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

### `supply.burnPolicy` — chosen at launch, immutable afterwards

Optional. One of `NONE` (the default), `HOLDER_BURN`, or `HOLDER_AND_ALLOWANCE_BURN`. It mirrors
the launchpad's `ProjectToken.BurnPolicy` enum index for index.

| Policy | What it allows |
| --- | --- |
| `NONE` | Supply can never decrease. No burn entry point exists on the token. |
| `HOLDER_BURN` | Any holder may permanently destroy their own tokens. |
| `HOLDER_AND_ALLOWANCE_BURN` | Holders may burn directly or authorize another contract to burn within an allowance. Supports burn-to-activate, burn-to-mint, and buyback-and-burn integrations. |

**Omitting the field means `NONE`**, which is exactly what every bundle written before schema
3.2.0 meant — no project token could burn at all. That is why 3.2.0 is a MINOR: no existing bundle
changes meaning. In the other direction the compatibility rule does the work, and should: a 3.2.0
bundle declaring `HOLDER_BURN` is refused by a 3.1.0 importer rather than silently launching a
non-burnable token.

The policy is written into the token at launch and **can never be changed**. A creator must
confirm they understand that before a burning policy can be selected.

**`currentSupply` and `cumulativeBurned` are not bundle fields and are refused by name.** They are
live chain state — one changes with every burn, the other is zero at launch by construction — so a
bundle asserting either would be asserting a history that has not happened. Same rule, same
reason, as `runtimeCodeHash` and `scriptPointer`.

> **This describes YOUR project token.** It does not describe the original RELICS token, which is
> non-burnable: RELICS uses buy-and-entomb, its supply is removed from circulation rather than
> destroyed, and its `totalSupply` stays fixed at 10,000.

### Why 3.0.0 is a MAJOR

Both of this schema's MAJOR triggers fire, again.

A **required field appeared**. A bundle must now carry the exact art configuration its launch would
use: `artConfigFormat`, the configuration bytes, and their keccak256. Schema 2 recorded which
runtime renders a project but, for the Solidity runtime, deliberately left `artConfigHash` null —
no published parameter layout existed, so the kit refused to state a value it could not derive.
ACV1 is that layout. The reason for the null is gone.

A **field changed meaning**. `artConfigHash` was "null, because unknowable" for `SOLIDITY_SVG`. It
is now the value the factory checks `keccak256(artConfig)` against.

#### Why a 2.x bundle cannot simply be migrated

A 2.x Solidity bundle has a `generator/params.json`, so it looks like the values are already there
and only need re-shaping. They are not.

ACV1 requires, for every layer, a market **sensor** and a response **curve**, plus a literal RGB
palette and a background index. A 2.x parameter document carries none of them. Its palette is an
**index** into a colour table that exists only inside that template's local preview sketch — and
that sketch overrides the index at render time from market state. Deriving a palette from it would
mean choosing a generic template's colours and publishing them as the artist's, which is the exact
failure this release exists to eliminate.

So the migration refuses rather than guesses. `relics migrate` opens a 2.x bundle as a **draft**,
carries over everything that is recoverable, and writes an art configuration whose artist-supplied
fields are explicitly `null` — with the vocabularies and bounds needed to fill them. `relics export`
refuses those nulls **by name and all at once**, so a creator is told every decision that is theirs
rather than one per attempt. The source bundle hash is kept as provenance; the re-export mints a new
one, because a different artwork is a different bundle.

A 1.x or 2.x bundle is refused with the reason and the fix, not with a bare "incompatible". No
public creator launch accepted a 1.x or 2.x bundle before this release, so the break strands
nothing.

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
