# Art runtime request

<!--
  For a project asking RELICS to register a custom art runtime.
  Read docs/creator-kit/requesting-an-art-runtime.md before filling this in.

  Almost no project needs this. If your art fits the generic SOLIDITY_SVG runtime's palette,
  layers, sensors, curves and traits, use it — no request, no contract, no waiting.

  This repository is PUBLIC. Do not paste a private key, a mnemonic, a keystore, a credentialed
  RPC URL, or any other secret into this pull request.
-->

## The project

- Project name:
- Chains requested (id and name):
- Deployed runtime address, per chain:
- Verified source URL on each chain's explorer:
- Where the runtime's source lives (this PR, or repository + commit):

## Why the generic runtime is not enough

<!--
  Be specific about what the ACV1 vocabulary cannot express: the palette, the 8 layer primitives
  (STRATA / RINGS / BARS / GRID / SHARDS / VEIL), the market sensors, the response curves, the
  element bands, the traits. "We wanted something custom" is not an answer.
-->

## What the contract reports

Fill these in from the deployed contract, not from your source:

| | Value |
| --- | --- |
| `runtimeMode()` | |
| `runtimeVersion()` | |
| `runtimeTag()` | |
| `maxOutputBytes()` | |
| Runtime size, from `forge build --sizes` | ` / 24576 bytes` |
| Deployed codehash | |

## Your configuration format

- Format name and a one-line description:
- Exact bytes you intend to launch with:
- `validateConfigV1(<those bytes>)` returns:
- Is this an ACV1 document, or your own format?

<!--
  Your runtime is the only thing that validates its own configuration. Describe the whole accepted
  space, not just the bytes you plan to use — that space is what a reviewer has to believe your
  renderer can draw.
-->

## Evidence

- How to run your tests:
- Which configurations you rendered, including boundary cases:
- Fork test against real launched state (yes/no, and where):

## Checklist

Tick only what is true. An untrue tick is worse than an empty one.

- [ ] `renderV1` and `tokenUriV1` are `view` and make **no external call** of any kind.
- [ ] The render is deterministic: no caller, block, timestamp, gas, randomness, or mutable
      storage on the render path.
- [ ] The contract has **no owner, no admin, no setter, no proxy** and no other path that can
      change what it draws after registration.
- [ ] There is no `delegatecall`, contract creation, or self-destruct in the runtime.
- [ ] `renderV1` and `tokenUriV1` are non-reverting **by construction**: every loop bounded by a
      validated count, every buffer preallocated to a capacity the validated budget cannot exceed,
      every arithmetic operation bounded or saturating.
- [ ] `validateConfigV1` is exhaustive and accepts nothing the renderer cannot draw.
- [ ] I rendered every configuration `validateConfigV1` accepts, including the boundary cases.
- [ ] The output is a complete `data:` URI computed from the request — not a redirect, a gateway
      URL, an IPFS pointer, or a placeholder.
- [ ] `maxOutputBytes()` is the real worst case, not a round number.
- [ ] The runtime is under 24,576 bytes; the `forge build --sizes` line is above.
- [ ] Source is verified on the explorer for **every** chain requested, resolving by name against
      the deployed bytecode.
- [ ] `runtimeMode()` returns the named `ArtRuntimeMode` constant, not a bare literal.
      (`ArtRuntimeMode.SOLIDITY_SVG_V1` is `1`; the launch-parameter enum the kit mirrors gives `1`
      a different meaning, and getting this backwards binds the wrong lane permanently.)
- [ ] I have read [15 — The art runtime contract](../../docs/launchpad/15-art-runtimes.md) and
      understand that successful registration exercises none of my render paths.
- [ ] I understand a launched project's runtime binding is one-shot, has no setter, and cannot be
      changed by anyone — including RELICS — after launch.
- [ ] Repository CI is green, including `npm run docs:links` and `npm run export:manifest`.
- [ ] This pull request contains no key, mnemonic, keystore, credentialed RPC URL, or other
      private material.

## Notes for reviewers

<!-- Anything you are unsure about, or that deserves a closer look. -->
