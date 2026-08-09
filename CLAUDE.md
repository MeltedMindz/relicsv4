# CLAUDE.md — relics-v4-starter

**The canonical agent guide for this repository is [`AGENTS.md`](AGENTS.md).** It is
tool-agnostic (Claude, Cursor, Copilot, Codex, …); read it first. This file is a pointer so
the two cannot drift.

This public repo holds three things: the **RELICS Launchpad creator guide**
(`docs/launchpad/`, documentation only), a **clean-room fork-and-launch template** for fully
on-chain generative art linked to an ERC-20 with a Uniswap v4 hook, and the
operator-authorized production reference in `flagship/`. The template and the launchpad are
separate systems that share no code.

Non-negotiable rules (full detail in `AGENTS.md`):

- **No private data, ever** — no keys, mnemonics, `.env` values, RPC credentials, or private
  docs. Run `npm run secrets:scan` before committing. Scoped exception: `flagship/` +
  `submissions/` hold the operator-authorized production reference (verified source + public
  on-chain facts only).
- **Deps are vendored, pinned, byte-exact under `lib/`; never float or partially update them.**
- **Keep every public word true**; never call locked LP "burned".
- **The launchpad is NOT deployed** (`PREPARED_NOT_DEPLOYED` on chains 1 / 8453 / 4663) and
  has had **no external audit**. Never write otherwise, and never publish a launchpad address.
- **Fees are of collected LP fees, never volume.** On the $RELICS buyback, always state both
  halves: circulating supply falls, `totalSupply` stays fixed at 10,000 (no burn function).
- **Self-update rule:** code and its `docs/` change in the same set.
- **Do not self-publish;** commit locally, scan, and stop.

Start here → [`AGENTS.md`](AGENTS.md) → [`docs/launchpad/`](docs/launchpad/) (launchpad) or
[`docs/00-make-it-your-own.md`](docs/00-make-it-your-own.md) (template).
