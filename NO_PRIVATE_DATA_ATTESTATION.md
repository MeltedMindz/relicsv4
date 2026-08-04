# No private data attestation

This document attests to how `relics-v4-starter` was produced and what it deliberately does not
contain. It is provided so an independent reviewer can verify the repository is safe to publish.

## Attestation

1. **Clean-room construction.** Every source file, script, test, doc, and config in this
   repository was **written originally** for this starter. The repository was created from an
   explicit allowlist (`PUBLIC_EXPORT_ALLOWLIST.md`), not by copying a private repository and
   removing sensitive files.

2. **No production material.** This repository contains **no** production contract source,
   renderer/art logic, addresses, CREATE2 salts, Uniswap position ids, pool ids, transaction
   hashes, deployment proofs, incident reports, private runbooks, or any private `CLAUDE.md`
   content. It contains **no** private keys, mnemonics, wallet/keystore files, `.env` values, API
   keys, or RPC credentials.

3. **Inspired, not copied.** The design is *inspired by lessons* from building fully on-chain
   generative art on Uniswap v4. The lessons in `docs/10-twenty-lessons.md` are stated **generically**,
   with no private incident details, timelines, or identifiers.

4. **Dependencies are references, not copies.** Third-party libraries are fetched as git
   submodules / from the public npm registry. Their source is not vendored into this repository.
   See `THIRD_PARTY_NOTICES.md` (note the Uniswap v4-core BUSL-1.1 dependency).

5. **No secrets by construction.** The default `forge test` suite and the web app's core flows
   require **no** secrets. All deployment scripts and opt-in fork tests read secrets from the
   environment; only `*.example` templates (names + placeholders) are tracked.

6. **Not audited, no endorsement.** This is unaudited educational software. Nothing here implies
   endorsement or affiliation by Uniswap, OpenZeppelin, OpenSea, any auditor, or any production
   collection.

## Verification steps a reviewer can run

```bash
# 1) No populated secrets or credential-bearing URLs in tracked files:
bash scripts/secret-scan.sh
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest dir /repo --config /repo/.gitleaks.toml

# 2) No third-party source is committed (only submodule gitlinks under lib/):
git ls-files lib | grep -v '^lib/forge-std$' | grep -v '^lib/uniswap-hooks$' || echo "clean"

# 3) Everything builds and tests from the checked-in sources:
forge build && forge test
npm install && npm run web:build

# 4) Manifest matches the tree:
node scripts/gen-manifest.mjs --check
```

Publication is gated on an **independent** review of these properties; the authoring process does
not self-approve release.
