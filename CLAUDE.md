# CLAUDE.md — relics-v4-starter

**The canonical agent guide for this repository is [`AGENTS.md`](AGENTS.md).** It is
tool-agnostic (Claude, Cursor, Copilot, Codex, …); read it first. This file is a pointer so
the two cannot drift.

This is a **public, clean-room, fork-and-launch template** for fully on-chain generative art
linked to an ERC-20, with a Uniswap v4 hook turning market activity into live artistic
evolution. It is educational, unaudited, MIT-licensed, and not affiliated with any production
collection. Original to this repo — not the memory of any private project.

Non-negotiable rules (full detail in `AGENTS.md`):

- **No private data, ever** — no keys, mnemonics, `.env` values, RPC credentials, or private
  docs. Run `npm run secrets:scan` before committing. Scoped exception: `flagship/` +
  `submissions/` hold the operator-authorized production reference (verified source + public
  on-chain facts only).
- **Deps are vendored, pinned, byte-exact under `lib/`; never float or partially update them.**
- **Keep every public word true**; never call locked LP "burned".
- **Self-update rule:** code and its `docs/` change in the same set.
- **Do not self-publish;** commit locally, scan, and stop.

Start here → [`AGENTS.md`](AGENTS.md) → [`docs/00-make-it-your-own.md`](docs/00-make-it-your-own.md).
