# The creator kit

Build your project locally, then hand the launchpad one file.

**New here? → [Getting started](./getting-started.md)** walks the whole path, from a fresh clone to
an exported bundle, in about twenty minutes. **Want an agent to do the writing? →
[Create with an agent](./create-with-an-agent.md).**

```bash
npm run kit -- init my-project --template market-responsive
npm run kit -- dev my-project              # local studio on 127.0.0.1
npm run kit -- validate my-project         # every check; writes nothing
npm run kit -- export my-project --output my-project.relics
npm run kit:status                         # bundled deployment record + launch state
```

Import `my-project.relics` in the RELICS Launchpad creator app. It derives the same bundle hash,
config hash and component hashes the CLI printed, and the draft arrives filled in — art, traits,
market mappings, metadata, earnings, supply, chains. Nothing is re-entered by hand.

Every command above is offline: none of them signs, broadcasts or contacts a network, and together
they build one `.relics` file. The chain-facing commands are a separate, opt-in group documented in
[The autonomous launch agent](./autonomous-launch-agent.md); they refuse to act without an
authorization file the creator writes, and they are loaded only when one of them is called.
Public creator launches are open on Ethereum (1), Base (8453) and Robinhood
Chain (4663), and RC6 is not deployed on BNB Smart Chain (56); for the current per-chain deployment
state read [`../launchpad/08-status.md`](../launchpad/08-status.md) and
[`../launchpad/10-deployments-and-quote-assets.md`](../launchpad/10-deployments-and-quote-assets.md),
or run `npm run kit:status` for the record bundled with this commit.

## Which file do I edit?

| File | Yours or generated | What it is |
| --- | --- | --- |
| `relics.config.json` | **yours — edit this** | The project's source of truth: name, symbol, supply, art runtime, earnings, chains, quote asset. |
| `generator/generate.js` | **yours** | The art. Deterministic, sandboxed, no I/O. |
| `traits/schema.json`, `market/mappings.json`, `metadata/collection.json` | **yours** | Trait dimensions, market-to-art mappings, collection metadata. |
| `previews/seed-*.svg` | **generated** by `relics preview`; **rewritten** at export from the live render | Deterministic previews. Never hand-edit — export writes these from the generator, so a hand-edit is discarded. |
| `relics.project.json` | **generated at export** | The bundle manifest, derived from your config and files. It does **not** exist in your project directory; it exists only inside the `.relics` file. Editing it changes nothing except making the hashes disagree. |
| `checksums.json` | **generated at export** | Per-file digests plus the bundle hash and commitment. |

---

After you launch, your NFT collection's metadata is already handled — but your ERC-20's
discoverability metadata is not. See [Token metadata](./token-metadata.md).

## The pages

| Page | What it covers |
| --- | --- |
| **[Getting started](./getting-started.md)** | fresh clone → exported bundle, step by step, with the failure modes |
| **[Create with an agent](./create-with-an-agent.md)** | building a project with an AI agent, and what it may not decide for you |
| **[The autonomous launch agent](./autonomous-launch-agent.md)** | the opt-in second path: the authorization file field by field, the signer boundary, the receipt chain, and a prompt you can paste |
| **[The CLI](./cli.md)** | every command, every flag, and what each check means |
| **[The `.relics` bundle format](./bundle-format.md)** | the container, the layout, the manifest, and every hash recipe |
| **[Treating every bundle as hostile](./bundle-security.md)** | the threat model, the seven defence layers, and what is *not* defended |
| **[Importing a bundle](./importing.md)** | the contract for the web importer, and the parity/hostile fixtures |
| **[Requesting a custom art runtime](./requesting-an-art-runtime.md)** | the rare case the generic runtime cannot express, and how to ask |
| **[Live deployments and quote assets](../launchpad/10-deployments-and-quote-assets.md)** | per-chain launch state and the quote-token reference |

## What lives where

| Path | What it is |
| --- | --- |
| `packages/project-schema/` | `@relics/project-schema` — the ONE schema, container, validator and hash implementation. Zero dependencies, plain ESM, no build step. Both the CLI and the web importer use this exact code. |
| `packages/creator-cli/` | the `relics` CLI and its starter templates |
| `packages/launch-sdk/`, `packages/agent-flow/`, `packages/signer-protocol/` | the opt-in launch path: live chain capability, deterministic chain selection, the prepare/predict/simulate/build pipeline, the state machine and receipt chain, and the signer boundary |
| `packages/project-schema/fixtures/parity/` | valid bundles plus `expected.json` — an importer must reproduce every value |
| `packages/project-schema/fixtures/hostile/` | bundles that must be refused, plus the expected refusal for each |

## Checks

```bash
npm run kit:test        # schema, container, validator, sandbox, and every fixture
npm run kit:templates   # every starter template scaffolds, validates and exports
npm run kit:fixtures    # regenerate the fixtures (deterministic; a diff means drift)
```

All three run in CI on every push — see [`creator-kit.yml`](../../.github/workflows/creator-kit.yml).

## The three rules worth knowing before you start

**A bundle configures art, never contracts.** It may carry art code, traits, metadata,
declarative sensor-to-art mappings, earnings, supply and artwork backing. It cannot carry hook
Solidity, and it structurally cannot replace ArtHook, the economic kernel, the liquidity kernel,
ProjectToken, ProjectCollection, the sale escrow, the router or the buyback — there is no manifest
field for any of it and no file type that could hold it. A custom hook needs a separate reviewed
process.

**A render is a pure function of its inputs.** No clock, no network, no `Math.random`. The same
seed draws the same picture on your laptop, in the importer, and in ten years. Validation renders
each seed twice and refuses a generator whose output moves.

**Approved is not the same as launchable.** Both art runtimes — `SOLIDITY_SVG` and `JAVASCRIPT` —
are approved: the format accepts them, and every shipped template validates, previews and exports.
Only `SOLIDITY_SVG` is currently bound and rendered by a deployed collection, so the JavaScript
templates are marked `preview only` in `relics templates`, `relics init` and `relics validate`
rather than quietly presented as launchable. A template on a gated runtime is marked, never deleted
and never oversold.
