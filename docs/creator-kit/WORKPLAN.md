# Creator kit + bundle pipeline — workplan

Branch: `feat/creator-kit`. Starting commit: `eccdf10`.

## Goal

Make this repo the canonical creator-facing local kit. A creator clones it, customizes
generative art, previews deterministic output, configures traits and market-to-art mappings,
validates bounds, and exports **one** canonical `.relics` bundle. The RELICS Launchpad web
importer reads that same bundle and derives the **same** hashes, so nothing is re-entered by
hand.

The launchpad itself is `PREPARED_NOT_DEPLOYED` on Ethereum (1), Base (8453) and Robinhood
Chain (4663); its review is internal only. Nothing in this kit broadcasts a transaction.

## Slices

1. **Workplan** (this file).
2. **`packages/project-schema`** — `@relics/project-schema`, zero-dependency ESM. One source
   for the CLI, the web importer, and any SDK: vocabulary, limits, types, canonical JSON,
   sha256, validators, hostile-bundle guards, deterministic container reader/writer, and the
   mapping into the launchpad studio draft shape.
3. **Deterministic container** — `.relics`, a STORE-only (uncompressed) ZIP with normalized
   ordering, fixed timestamps and fixed external attributes. Justification in
   `docs/creator-kit/bundle-format.md`.
4. **Validator** — all required checks, usable server-side and inside an isolated worker.
5. **CLI** — `relics init | dev | preview | validate | test-seeds | export | inspect`, with
   `export` refusing to write when validation fails.
6. **Templates** — minimal, market-responsive, static-art, on-chain JavaScript, and a
   Solidity-SVG *parameter* template (config bytes only; no creator Solidity is ever carried).
7. **Hostile fixtures + parity fixtures** — reusable by the web importer.
8. **Docs** — bundle format, CLI reference, security model, importer contract.

## Hard rules for this work

- Public repo: no keys, mnemonics, wallet JSON, RPC secrets, API keys, DB credentials.
  `npm run secrets:scan` before the final commit.
- Never call the launchpad deployed, audited, or externally reviewed.
- Never write that the RELICS LP is "burned", "locked forever", or that "fees route immutably".
- $RELICS removal: circulating supply falls, `totalSupply` stays fixed at 10,000, and $RELICS
  has no burn function. Always both halves.
- A bundle may configure art, traits, metadata, declarative sensor mappings, earnings, supply
  and artwork backing. It may **never** carry hook Solidity, bytecode, addresses to call, or
  anything that could replace ArtHook, the economic/liquidity kernels, ProjectToken,
  ProjectCollection, the sale escrow, the router or the buyback.
- Zero public-chain transactions. Never run `vercel`.
