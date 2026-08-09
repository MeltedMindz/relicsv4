# The creator kit

Build your project locally, then hand the launchpad one file.

```bash
npm run kit -- init my-project --template market-responsive
npm run kit -- dev my-project              # local studio on 127.0.0.1
npm run kit -- validate my-project         # every check; writes nothing
npm run kit -- export my-project --output my-project.relics
```

Import `my-project.relics` in the RELICS Launchpad creator app. It derives the same bundle hash,
config hash and component hashes the CLI printed, and the draft arrives filled in — art, traits,
market mappings, metadata, earnings, supply, chains. Nothing is re-entered by hand.

The launchpad is `PREPARED_NOT_DEPLOYED` on Ethereum (1), Base (8453) and Robinhood Chain (4663),
and its review to date is internal only. Nothing in this kit signs or broadcasts anything.

---

## The four pages

| Page | What it covers |
| --- | --- |
| **[The `.relics` bundle format](./bundle-format.md)** | the container, the layout, the manifest, and every hash recipe |
| **[The CLI](./cli.md)** | every command, every flag, and what each check means |
| **[Treating every bundle as hostile](./bundle-security.md)** | the threat model, the seven defence layers, and what is *not* defended |
| **[Importing a bundle](./importing.md)** | the contract for the web importer, and the parity/hostile fixtures |

## What lives where

| Path | What it is |
| --- | --- |
| `packages/project-schema/` | `@relics/project-schema` — the ONE schema, container, validator and hash implementation. Zero dependencies, plain ESM, no build step. Both the CLI and the web importer use this exact code. |
| `packages/creator-cli/` | the `relics` CLI and its starter templates |
| `packages/project-schema/fixtures/parity/` | valid bundles plus `expected.json` — an importer must reproduce every value |
| `packages/project-schema/fixtures/hostile/` | bundles that must be refused, plus the expected refusal for each |

## Checks

```bash
npm run kit:test        # schema, container, validator, sandbox, and every fixture
npm run kit:templates   # every starter template scaffolds, validates and exports
npm run kit:fixtures    # regenerate the fixtures (deterministic; a diff means drift)
```

## The two rules worth knowing before you start

**A bundle configures art, never contracts.** It may carry art code, traits, metadata,
declarative sensor-to-art mappings, earnings, supply and artwork backing. It cannot carry hook
Solidity, and it structurally cannot replace ArtHook, the economic kernel, the liquidity kernel,
ProjectToken, ProjectCollection, the sale escrow, the router or the buyback — there is no manifest
field for any of it and no file type that could hold it. A custom hook needs a separate reviewed
process.

**A render is a pure function of its inputs.** No clock, no network, no `Math.random`. The same
seed draws the same picture on your laptop, in the importer, and in ten years. Validation renders
each seed twice and refuses a generator whose output moves.
