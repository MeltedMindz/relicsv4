# CLAUDE.md — relics-v4-starter

**Read [`AGENTS.md`](AGENTS.md).** It is the canonical, tool-agnostic agent guide for this
repository, and it is kept current. This file exists only so Claude Code finds it; it deliberately
does not restate the rules, because a second copy of them would drift out of date.

## Orientation

This repository holds four separate things that share no code. Do not blend them.

1. **The creator kit** — `packages/project-schema/`, `packages/creator-cli/`, `docs/creator-kit/`.
   Builds a `.relics` art-project bundle locally. This is what most requests are about.
2. **`docs/launchpad/`** — the RELICS Launchpad creator guide. Documentation only.
3. **The fork-and-launch Solidity template** — `src/`, `script/`, `apps/web/`, `docs/00`–`18`.
   Clean-room, MIT, educational — **not production software**.
4. **`flagship/`** — operator-authorized production reference for the live RELICS artwork.

## If the user asks "how do I create a project?"

They want a `.relics` bundle. Follow **[`AGENTS.md` §1–§9](AGENTS.md)** — the scaffold-outside-the-repo
rule, the template launchability table, the render contract, the market-preview endpoints, the
validation codes and the export contract are all there.

Hand a non-technical creator
[`docs/creator-kit/create-with-an-agent.md`](docs/creator-kit/create-with-an-agent.md); it contains a
copy/paste prompt they can give to any agent, including you.

## The rules most likely to be broken

Full statements and reasoning in [`AGENTS.md` §0](AGENTS.md) and [§9](AGENTS.md).

- Never edit `packages/project-schema/` to make a project validate. Change the project instead.
- Never invent a schema field, sensor, transform, destination, or runtime. They are closed sets.
- Never bypass validation, hand-assemble a bundle, or edit one after export.
- Never fabricate an address, a hash, or a chain status. Run `npm run kit:status` and quote it.
  Public creator launch is closed; no chain is publicly open.
- Never claim any review was an external audit. Review is internal only.
- Never write a secret. `npm run secrets:scan` before any commit.
- Never commit or push unless asked. Never publish.

## Commands

```bash
npm run kit -- <command>     # the creator CLI; the `--` is required
npm run kit:status           # deployment state — quote this, never memory
npm run secrets:scan         # before any commit
```

Gates: `npm run kit:test`, `kit:templates`, `kit:fixtures`, `kit:economics`. If one already fails on
an untouched checkout, report it — do not "fix" it by editing the schema.
