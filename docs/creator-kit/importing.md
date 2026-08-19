# Importing a bundle

What the RELICS Launchpad creator app — or any other importer — does with a `.relics` file, and
what it must not do.

Public creator launches are not open yet, and review to date is internal only. Importing a bundle
fills in a draft; it does not deploy anything. Per-chain deployment and launch state is stated
once, in [`../launchpad/08-status.md`](../launchpad/08-status.md).

---

## Use the schema package, do not reimplement it

`packages/project-schema/` is plain ESM with zero dependencies and no build step. Vendor the
directory verbatim or install it as `@relics/project-schema`. Do not write a second copy of the
schema: the whole point of the format is that both sides derive identical hashes from identical
code, and two implementations of a canonical serializer will eventually disagree on some edge
your users will find first.

The only file that knows where the package lives is `packages/creator-cli/src/schema.js`, a
one-line re-export. Do the same on your side.

## The flow

```js
import { readContainer, validateBundle, toStudioDraft } from "@relics/project-schema";

// 1. Read the container. This throws on every structural attack.
const container = readContainer(bytes);

// 2. Validate. `evaluate` is the host's isolation boundary — see below.
const result = validateBundle(container.byPath, { evaluate, seeds: 24 });
if (!result.ok) return refuse(result.issues);

// 3. Project onto the studio draft.
const { draft, provenance } = toStudioDraft(result, container.byPath, { draftId });
```

`result.checks` is a stable, ordered list of check ids with pass/warn/fail/skipped and a detail
string — render it directly. `result.issues` carries a code, a location and a message per
finding.

## Supplying isolation

`validateBundle` is pure with respect to the host: no filesystem, no network, no `node:` APIs. It
cannot execute a generator by itself, because isolation is a host concern. Pass an `evaluate`
capability:

```ts
evaluate?: (files: Map<string, string>, entry: string) => { render(context): unknown }
```

Without it, the four execution checks report `skipped` rather than pretending to have run.

**Server-side (Node):** reuse `packages/creator-cli/src/sandbox.js`. `renderSeedsIsolated` runs a
seed batch in a child process with a hard heap cap and a hard timeout and returns only strings;
`makeReplayEvaluator` turns that recording into the synchronous capability `validateBundle` wants.
That is exactly what `relics validate` does.

**Browser:** run the generator in a Worker you can `terminate()`, and treat a terminated worker as
a refusal, never as an inconclusive result. The rules the sandbox has to enforce are in
[`bundle-security.md`](./bundle-security.md); the important one is that **no host object may reach
generator code** — build the render context inside the worker from a JSON string using
`makeRandom` from the schema package, exactly as the Node sandbox does. Handing sandboxed code a
host object lets it walk `obj.constructor.constructor` back out.

Whatever you do, `skipExecution: true` is honest and `evaluate: () => hostRealmEval(...)` is not.

## Never execute on inspect

Showing a user what a bundle contains must not run its generator. `relics inspect` validates with
`skipExecution: true` for that reason. Execution is a deliberate, separate step the user asks for.

## Hash parity

The provenance block returned by `toStudioDraft` carries every hash the CLI printed at export:
`bundleHash`, `projectConfigHash`, `contentHash`, `generatorHash`, `scriptHash`,
`traitSchemaHash`, `marketMappingHash`, `metadataHash`, `mediaHashes`, plus the requested chains
and the earnings configuration. Display the bundle hash next to the imported draft so a creator
can compare it with what their CLI printed.

If your recomputed hash differs from the bundle's declared `integrity.bundleHash`, the validator
has already reported it as a `HASH_INTEGRITY` failure. Do not import "with a warning".

## Publishing project metadata

Imported media paths are not on-chain metadata yet. The app must normalize collection/profile
media, pin or publish it to an allowed public URI (`ipfs://`, `https://` or `ar://`), verify the
published bytes, and write the resulting URI into `ProjectMetadataRegistry` after the project
record exists. Relative bundle paths and `data:` URIs must not be written as contract-level media.

Keep the two read paths separate in your UI:

- `contractURI()` is the project/collection profile and should be non-empty after the metadata
  registry is bound.
- `tokenURI(id)` is the artwork metadata for an awakened NFT and renders from the immutable
  on-chain art binding.

Do not show a deployed token as launch-complete until the ERC-20 `contractURI()` readback includes
the published image. That is the surface DEX/token-discovery tooling can use beyond
`name()`/`symbol()`/`decimals()`.

## Parity fixtures

`packages/project-schema/fixtures/parity/` holds bundles built by the CLI from the shipped
templates, plus `expected.json`:

| Field | What to assert |
| --- | --- |
| `integrity` | your recomputed bundle/config/content hashes match exactly |
| `hashes` | script, generator, trait schema, market mapping, metadata |
| `studioDraft` | your projection equals it under canonical JSON |
| `provenance` | same |
| `entries[].sha256` | per-file digests |
| `representativeOutputs` | sha256 of the generator's SVG for seeds 1, 2, 3, 5, 8, 13, 21, 34 |

`representativeOutputs` is the strongest signal: if your sandbox reproduces those digests, your
render context, your PRNG and your market evaluation all agree with the CLI's.

## Hostile fixtures

`packages/project-schema/fixtures/hostile/` holds bundles that must be refused, with
`expectations.json` naming the layer (`container`, `parser`, `validator`, `sandbox`) and the error
codes each is expected to trip. Wire them into your own test suite. Fixtures marked
`requiresExecution` only fail when an `evaluate` capability is supplied — an importer that skips
execution must still refuse the rest.

Regenerate both sets with `node packages/project-schema/fixtures/build.mjs`; the output is
deterministic.

## What a bundle can never ask for

A bundle configures art code, traits, metadata, declarative sensor-to-art mappings, earnings,
supply and artwork backing. It cannot carry hook Solidity, and it cannot replace ArtHook, the
economic kernel, the liquidity kernel, ProjectToken, ProjectCollection, the sale escrow, the
router or the buyback — there is no manifest field for any of it and no file type that could hold
it. Custom hooks go through a separate reviewed process.

If you add a field to the manifest schema, add it to `MANIFEST_KEYS` in the shared package, not to
a local extension in the web app. A schema that is closed on one side and open on the other is not
closed.
