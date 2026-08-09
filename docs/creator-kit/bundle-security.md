# Treating every bundle as hostile

A `.relics` file arrives from someone you do not know, and a browser tab or a server route has to
read it. This document says what the kit assumes, what it defends against, and where the
boundaries actually are.

The short version: **the format is small on purpose**. Most of the defence is not a check, it is
the absence of a field. A bundle cannot name a contract because there is no key for one. A bundle
cannot expand to a gigabyte because the container is uncompressed. A bundle cannot fetch a host
because no field holds a URL and the sandbox has no `fetch`.

---

## Threat model

An attacker controls the bundle bytes completely. They want to:

1. write a file outside the extraction directory
2. exhaust memory, CPU or disk on the machine that reads it
3. run code in the importer's context, or reach the host realm from a sandbox
4. get a secret out of the machine that reads it
5. put executable or protocol-replacing configuration through the one-click path
6. show a document (an SVG) that scripts, fetches, or freezes a viewer
7. get a bundle admitted whose content differs from what its hashes claim

They do not control the schema package, the reader, or the sandbox.

---

## Layer 1 — the container

Refusals, all before a byte of content is copied out:

- **Zip bombs are structurally impossible.** The container is STORE-only, so
  `compressedSize == uncompressedSize` is an invariant. A deflated entry is refused outright;
  there is no decompressor to attack and no ratio to bound.
- **Path traversal**: `..`, `.`, empty segments, absolute paths, drive letters, backslashes.
- **Symlinks**: entries must have zero external attributes, which refuses the symlink mode bits
  along with everything else.
- **Unicode path confusion**: control characters, zero-width characters, bidi overrides,
  non-NFC names, and any non-ASCII name at all. Paths are printable ASCII, so "same path" is a
  byte comparison in every runtime.
- **Duplicate normalized paths**: names are compared case-folded, because `Assets/a.png` and
  `assets/a.png` land on one file on a case-insensitive filesystem.
- **Lying headers**: local and central records must agree on name, CRC and both sizes; entry data
  must lie inside the archive, must not overlap the central directory, and must not overlap
  another entry's data; CRCs are verified.
- **Structural exotica**: ZIP64, multi-disk, encryption, streaming data descriptors, trailing
  bytes after the end record, a mismatched entry count, a missing archive comment.
- **Limits**: 20 MB per bundle, 4 MB per entry, 512 entries, 180-byte paths, 6 path segments.

The reader never repairs a hostile path into a safe one. A repaired path and the creator's
declared checksums would describe different files.

## Layer 2 — the documents

- **Prototype pollution**: bundle JSON is parsed by `safeJsonParse`, which drops `__proto__`,
  `constructor` and `prototype` at every level and returns null-prototype objects. Depth and node
  count are bounded.
- **Malformed JSON** is an error with a location, not a crash.
- **Closed schemas**: the manifest, the trait schema, the market mappings and the collection
  metadata all enumerate their keys. An unknown key is an error.
- **No URLs where a fetch could happen**: collection images are bundle-relative paths under
  `assets/`. A remote image URL is refused, because an importer that fetched one would be making
  a request to an attacker-chosen host at import time.
- **Numeric bounds**: every market transform parameter has a published `[min,max]`, and every
  transform clamps on every branch. The test suite drives the full input range, `NaN` and
  `Infinity` included, and asserts the output never leaves `[0,1]`.

## Layer 3 — the generator, before it runs

Static analysis rejects, with a specific message each:

- network reaches (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`)
- host access (`process`, `window`, `document`, `globalThis`, `navigator`, `localStorage`, …)
- non-determinism (`Date`, `Math.random`, `performance`, `crypto`, `Intl`)
- dynamic code (`eval`, `Function`, `new Function`, `import()`)
- asynchrony (`await`, `async function`, timers, microtask queues)
- worker and shared-memory escapes (`Worker`, `postMessage`, `Atomics`, `SharedArrayBuffer`)
- prototype walking (`.constructor`, computed `__proto__`/`prototype` access)
- unbounded loops in their literal forms (`while (true)`, `for (;;)`)
- external URLs and embedded base64 blobs
- any import that is not a `./sibling.js` inside `generator/`
- a script over the 36,000-byte budget

The scan runs on comment-stripped source, so a forbidden identifier cannot hide behind `//`. An
ambiguous `/` is treated as code, which can only make the scan stricter. The two W3C SVG/xlink
namespace declarations are the only exempted URLs.

## Layer 4 — the sandbox

**No host object ever reaches generator code.** This is the rule that makes the sandbox worth
anything: handing sandboxed code a host object lets it walk `obj.constructor.constructor` back to
the host realm's `Function` and escape. So the render context is built **inside** the realm from a
JSON string, using a PRNG whose source is injected from the shared schema package. Only strings
cross the boundary, in both directions.

Inside the realm: about fifty ambient globals are deleted, `Math.random` is replaced by a thrower,
`Math` and `JSON` are frozen, and code generation from strings is disabled — so even a `Function`
reference recovered through a constructor chain throws instead of compiling.

Two backends:

| Backend | Isolation | Used by |
| --- | --- | --- |
| in-process `node:vm` realm | stripped globals, per-render wall-clock timeout | `dev`, `preview` |
| separate `node` process | all of the above **plus a hard heap cap and a hard process timeout** | `validate`, `test-seeds`, `export` |

An unbounded allocation or an infinite loop takes the child process and nothing else; the host
reports a refusal. That is why `export` uses the isolated backend by default.

## Layer 5 — the output

A render returns an SVG, and an SVG is a document, not an image. Every output — and every `.svg`
shipped in `assets/` or `previews/`, because the importer displays those too — is inspected for:

`<script>`, `<foreignObject>`, `<iframe>`, `<embed>`/`<object>`/`<audio>`/`<video>`, `<!DOCTYPE>`,
`<!ENTITY>` (entity expansion and external entity attacks), inline `on…=` handlers, `javascript:`
URLs, external `href`/`xlink:href` references, and any external URL scheme.

Also: output must start with `<svg` and end with `</svg>`, must contain drawable elements, must
not be blank, and must be under 512 KB — a render large enough to freeze a tab is refused before
anything tries to display it.

## Layer 6 — secrets

Every text entry is scanned for:

- a populated private key, in a field or bare
- a mnemonic phrase, BIP-39 shaped, inside a quoted string
- a keystore document or a PEM private-key block
- an RPC URL with an embedded credential
- cloud and messaging platform tokens, and JWTs
- pinning-service credentials and generic credential assignments
- a URL with inline credentials

A hit is an error: nothing secret travels in a bundle.

The patterns are chosen to have essentially no innocent explanation inside a bundle. The mnemonic
pattern in particular is anchored on both quotes, so a quoted string that is nothing but twelve
lowercase words trips it and a sentence of prose does not.

## Layer 7 — integrity

`checksums.json` carries a digest for every entry. The manifest carries component hashes and the
three integrity hashes. The validator recomputes all of it and reports any disagreement, so a
bundle edited after it was signed off fails on arrival rather than launching quietly.

---

## No arbitrary hook Solidity

A bundle may configure art code, traits, metadata, declarative sensor-to-art mappings, earnings,
supply and artwork backing. It may not carry hook Solidity, and it structurally cannot replace
ArtHook, the economic kernel, the liquidity kernel, ProjectToken, ProjectCollection, the sale
escrow, the router or the buyback.

Two independent mechanisms:

1. **File type.** `.sol`, `.vy`, `.yul`, `.wasm`, executables, shell scripts and interpreter
   sources are refused everywhere, each with its own reason.
2. **Schema shape.** The manifest key space is closed and contains no field for contract code,
   bytecode, an init-code hash, an address to call, a library to link or a template to compile.
   Twenty-eight specific attempts are refused by name at every nesting level.

Fixtures `hostile/arbitrary-hook-solidity.relics` and `hostile/protocol-override.relics` prove
both. A custom hook needs a separate reviewed process; there is no bundle path to one.

---

## What this does not defend against

Stated plainly, because a security document that claims completeness is not a security document.

- **The in-process backend has no memory bound.** `node:vm` cannot cap a heap. A generator that
  allocates without bound during `dev` or `preview` will exhaust the CLI process. That is a
  creator running their own code on their own machine; anything that decides whether a bundle is
  admissible uses the isolated backend, which does have a cap.
- **A server or browser importer must supply its own isolation.** The validator's core is pure
  and the execution capability is injected. A host that passes an evaluator running on the main
  thread has removed the protection; run it in a worker that can be terminated, or in a child
  process, and treat "the sandbox failed" as a refusal rather than an inconclusive result.
- **Static analysis is a regex layer, not a parser.** It is a first line, not the boundary — it
  catches the literal shapes, and the sandbox catches the rest. Neither is trusted alone.
- **Timeouts are wall-clock.** A generator just under the limit on fast hardware may exceed it on
  slow hardware. Budget accordingly; the limit is published so it can be designed against.
- **The kit says nothing about whether art is good, original, or yours.** It checks that the same
  seed draws the same picture, not that the picture should exist.
