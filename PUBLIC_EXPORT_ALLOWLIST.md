# Public export allowlist

This repository was built **clean-room** for public release. It was assembled from an **explicit
allowlist** of original, genericized files — never by copying a private repository and deleting
sensitive parts. Every tracked file falls into one of the categories below. The machine-readable
inventory with per-file hashes and verdicts is `PUBLIC_EXPORT_MANIFEST.json`.

## Allowlisted categories (what MAY be in this repo)

1. **Original Solidity source** (`src/**`) — genericized example contracts written for this
   starter. No production contract source, no production addresses, salts, position ids, pool ids,
   or tx hashes.
2. **Original Foundry scripts** (`script/**`) — deployment/verification templates that read all
   infrastructure addresses from environment variables. No baked-in production address book.
3. **Original tests** (`test/**`) — unit, fuzz, invariant, fork (self-skipping), and deployment
   integration tests, plus local mocks.
4. **Original web app** (`apps/web/**`) — a neutral Next.js starter. No production addresses; no
   required third-party project id or API key for core flows.
5. **Original documentation** (`docs/**`, `README.md`, and the root policy docs) — teaching prose
   with no private incident details, timelines, or identifiers.
6. **Configuration** (`foundry.toml`, `remappings.txt`, `package.json`, `apps/web/*` config,
   `.github/**`, `.gitignore`, `.gitleaks.toml`, `*.example`) — standard tooling config with no
   secrets.
7. **License and notices** (`LICENSE`, `THIRD_PARTY_NOTICES.md`, this file, the attestation).
8. **Dependency references** (`.gitmodules` and the `lib/*` submodule gitlinks) — pointers to
   public upstream repos. No third-party source is copied into this repo.

## Explicitly EXCLUDED (what must NEVER be in this repo)

- Any production contract source, renderer, or art logic copied verbatim from a private project.
- Any real address, CREATE2 salt, position id, pool id, or transaction hash from a production
  deployment.
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
