# Public export allowlist

This repository was built **clean-room** for public release. It was assembled from an **explicit
allowlist** of original, genericized files — never by copying a private repository and deleting
sensitive parts. Every tracked file falls into one of the categories below. The machine-readable
inventory with per-file hashes and verdicts is `PUBLIC_EXPORT_MANIFEST.json`.

## Allowlisted categories (what MAY be in this repo)

0. **Authorized production flagship reference (added 2026-08-07)** — `flagship/**` (the exact
   Etherscan-verified RELICS production hook closure + offline deployment proof + provenance),
   `submissions/**` (the public Programmable Builder Beta application package), and vendored
   pinned dependency trees under `lib/**` with their upstream licenses. Public on-chain facts
   only; explicitly authorized by the RELICS operator. No private material.

1. **Original Solidity source** (`src/**`) — genericized example contracts (token, hook, NFT,
   `RendererBase` + three sample art systems, locker) written for this starter. No private
   launchpad contract source, salts, position ids, pool ids, or deployment broadcasts.
2. **Original config surface** (`config/collection.config.ts`) — a neutral, editable collection
   config with empty per-chain address maps. No production addresses.
3. **Original Foundry scripts** (`script/**`, incl. `script/config/DeployConfig.s.sol`) —
   parameterized deployment/verification templates that read all identity + infrastructure values
   from environment variables. No baked-in production address book.
3. **Original tests** (`test/**`) — unit, fuzz, invariant, fork (self-skipping), and deployment
   integration tests, plus local mocks.
4. **Original web app** (`apps/web/**`) — a neutral Next.js starter. No production addresses; no
   required third-party project id or API key for core flows.
5. **Original documentation** (`docs/**`, `README.md`, the root policy docs, and the agent guides
   `AGENTS.md` + `CLAUDE.md`) — teaching prose original to this starter, with no private incident
   details, timelines, or identifiers.
5a. **Public launchpad reference data** (`packages/project-schema/src/deployments.js`,
    `packages/project-schema/src/robinhood-stock-tokens.js`, and documentation that cites them) —
    source-verified RC5 deployment addresses, public launch-access state, and the complete official
    Robinhood stock-token quote reference. These are public chain/API facts exported so artists and
    integrators can prepare `.relics` bundles against the actual deployed platform while public
    launch remains closed.
6. **Configuration** (`foundry.toml`, `remappings.txt`, `package.json`, `apps/web/*` config,
   `.github/**`, `.gitignore`, `.gitleaks.toml`, `*.example`) — standard tooling config with no
   secrets.
7. **License and notices** (`LICENSE`, `THIRD_PARTY_NOTICES.md`, this file, the attestation).
8. **Dependency references** (`.gitmodules` and the `lib/*` submodule gitlinks) — pointers to
   public upstream repos. No third-party source is copied into this repo.

## Explicitly EXCLUDED (what must NEVER be in this repo)

- Any private production contract source, renderer, or art logic copied verbatim from a private
  project, except the separately authorized public `flagship/**` reference.
- Any private CREATE2 salt, position id, pool id, transaction hash, deployment broadcast, Safe
  payload, or proof artifact not explicitly authorized as public reference data. Public RC5
  launchpad contract addresses and Robinhood quote-token addresses are allowed only in the
  dedicated reference files and docs described above.
- `.env` files, wallet/keystore/mnemonic/private-key files, deployment broadcast artifacts, or
  mainnet proofs.
- Private docs, incident reports, internal runbooks, or any `CLAUDE.md` content from a private
  repository (the `CLAUDE.md` here is original to this starter).
- Local absolute paths, home-directory names, API keys, or RPC credentials.
- `.vercel/`, `broadcast/`, `out/`, `cache/`, `node_modules/`, and other build/output artifacts.

## How the allowlist is enforced

- `.gitignore` keeps secrets and build artifacts out of tracking.
- `.gitleaks.toml` + `scripts/secret-scan.sh` + CI scan for secrets on every push.
- `scripts/check-links.mjs` verifies docs integrity.
- `PUBLIC_EXPORT_MANIFEST.json` records a hash and a public-safe verdict for every tracked file;
  regenerate it with `node scripts/gen-manifest.mjs` after changes.
