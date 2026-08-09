# 03 — Art runtimes

> Not deployed on any chain yet. Internal review only — no external audit.
> See [08 — Status and limitations](08-status.md).

You choose one of two runtimes at launch, as `LaunchParams.artMode`:

```solidity
enum ArtMode { SOLIDITY_SVG, JAVASCRIPT }
```

The choice is permanent. It is part of the launch parameters, and there is no upgrade path.

## The honest picture first

Launchpad marketing usually blurs three different things. Here they are separated, because you
should pick a runtime knowing what actually ships:

| Thing | Where it lives | Who computes it |
| --- | --- | --- |
| `tokenURI` JSON + SVG | Fully on chain, computed at read time | `ProjectCollection` |
| Your art bytes (`artConfig`) | On chain, as contract code via SSTORE2, hash-committed at launch | Stored by the factory during `launch()` |
| The render of your JavaScript | Off chain, by a viewer | A client, under an on-chain-derived seed |

**In the current build, `ProjectCollection.tokenURI` does not call your art.** It returns a fully
on-chain data URI whose image is a small deterministic SVG built from the token's DNA and the
hook's live `organicSwapCount` / `organicNetFlow` — a dark field with a hue derived from DNA and a
ring count that moves with swap history. The `SoliditySvgTemplate` and `JsPassthroughTemplate`
libraries exist in the source and define the render and seed contracts, but they are not wired into
`tokenURI` in this build.

That is worth knowing before you plan a collection around it. It does not make the storage
meaningless — your bytes are on chain and hash-committed, so any renderer can reproduce your work
from chain data alone — but "the contract draws my art in `tokenURI`" is not something you can say
about this build today.

## A. `SOLIDITY_SVG` — a registered on-chain template plus your configuration

You pick a template that is already registered and active, and supply a per-launch configuration
blob.

- `artTemplateId` must be non-zero **and** active in the template registry, or the launch reverts
  with `BadTemplate()`.
- `artConfig` is your configuration. It may be empty — an empty config stores no data contract and
  simply records the commitment.
- The shipped `SoliditySvgTemplate` renders a 256×256 SVG from `(dna, organicSwapCount,
  organicNetFlow, config)`: hue and saturation from DNA, bar count from swap history, and a
  background that flips depending on whether net flow is positive.

The template registry has an authority that can register new templates and deactivate old ones.
This affects **future launches only**. A launched project's art is bound by its stored bytes and
committed hash, never by a mutable registry pointer, so deactivating a template cannot alter or
brick a project that already launched.

Choose this if you want the smallest surface, no off-chain renderer, and are happy working within
a template's parameter space.

## B. `JAVASCRIPT` — your own deterministic script, stored on chain

You supply the script source as `artConfig` and set `artTemplateId` to `0` (anything else reverts
`BadTemplate()`).

- The bytes go to an SSTORE2-style store during the launch transaction, chunked at **24,575 bytes**
  per data contract (24,576 minus the STOP byte SSTORE2 prepends).
- `artScriptHash` is `keccak256` over the **whole** input, not per chunk, and the factory rejects
  the launch if it does not match (`BadArtHash()`).
- There is no delete, overwrite, or update function anywhere in the store. Stored is stored.
- **The contract never executes JavaScript.** No `eval`, no on-chain interpreter, no p5 or three.js
  on chain. The render happens in a viewer.

Choose this if you already write generative sketches and want full expressive control.

### The seed contract

A JavaScript-mode renderer must seed itself from this value, so that every viewer computes the same
image:

```solidity
seed = keccak256(abi.encode(dna, organicSwapCount, organicNetFlow, scriptHash))
```

and the per-token DNA it depends on is fixed forever at first mint:

```solidity
dna = keccak256(abi.encodePacked(collectionAddress, projectId, tokenId))
```

Everything in that seed is either immutable or a bounded on-chain read. Nothing is block time,
block hash, or caller. Two people opening your piece a second apart see the same thing; two people
opening it across a hundred swaps do not, and that is the point.

### Determinism is your responsibility, and nothing enforces it

Be clear-eyed about this: **there is no validator.** Nothing in the contracts, the SDK, or the
studio statically analyzes your script or rejects `Math.random()`, `Date.now()`, `fetch()`,
`performance.now()`, or `crypto.getRandomValues()`. The word "sandboxed" in the source describes
the intended off-chain execution model, not a shipped checker. The studio never executes your
JavaScript at all — it hex-encodes your text and meters its size.

If you ship a non-deterministic script, it will launch cleanly and then render differently for
every viewer and every reload, permanently, with no way to fix it. Nothing will warn you.

A safe skeleton looks like this — one seeded PRNG, no ambient entropy, no network:

```js
// Everything downstream flows from `seed`. Nothing else may enter.
function makeRng(seedHex) {
  let s = 0;
  for (let i = 2; i < seedHex.length; i += 8) {
    s = (s ^ parseInt(seedHex.slice(i, i + 8), 16)) >>> 0;
  }
  return function rng() {                    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Provided by the host: seed (hex string), and the bounded market reads.
const rng = makeRng(seed);
const hue = Math.floor(rng() * 360);
const intensity = Math.min(1, organicSwapCount / 500);   // derive, never sample time
```

Rules that follow from the seed contract:

- Draw every random value from one PRNG seeded only by `seed`.
- Never read wall-clock time, never call the network, never read anything about the viewer.
- If you animate, drive the animation from a frame counter and make the *still* frame — the one a
  marketplace screenshots — a pure function of the seed.
- Treat the market reads as inputs, not as triggers. A piece that "reacts" by sampling the current
  time between swaps is not deterministic.

## Market state as an input

Both runtimes read the same two bounded values off your hook: `organicSwapCount()` and
`organicNetFlow()`. How strongly those drive your art is configured, not coded, through
`LaunchParams.marketStateConfig` — a bounded **sensor → transform → art parameter** graph.

- It is configuration data, never executable code.
- It is capped at **2048 bytes**, and only its `keccak256` is stored on chain.
- The studio's builder exposes a closed vocabulary of sensors, transforms with per-parameter
  minimum/maximum/step bounds, and destinations, with a limit of 8 mappings.

"Organic" excludes the protocol's own fee-conversion swaps, and it does so by checking the sender —
not by trusting a flag in call data that anyone could set.

## Reproducing a project's art from chain data

If you are building a renderer, an archive, or a marketplace, this is the retrieval path:

1. Read the project record from the registry for the collection and hook addresses.
2. Recover the stored script bytes. The factory emits `ArtStored(projectId, scriptHash, length)`,
   and the store emits `ScriptStored(scriptHash, totalLength, chunkCount)`. **The factory does not
   keep the chunk pointers**, so pointer recovery is an indexing job against those events and the
   store's writes — there is no getter that hands you the pointers from a `projectId`.
3. Concatenate the chunks in order and verify `keccak256(bytes) == scriptHash`. The store exposes
   `readChunked(pointers)` and `verify(pointers, expectedHash)` for exactly this.
4. Read `dna` per token and the hook's counters, compute the seed, and render.

Step 3's verification is not optional politeness — it is what makes the art content-addressed. If
the hash does not match, you are not looking at the artist's work.

## What the studio preview is not

The studio and sandbox previews are driven by a shared deterministic preview renderer that is
explicitly **not** the on-chain renderer, and the eleven market scenarios in the sandbox are
labeled SIMULATION because they are generated from the seed, not read from a chain. Use the
sandbox to explore composition and to check your byte budget. Do not use it as proof of what a
viewer will see.
