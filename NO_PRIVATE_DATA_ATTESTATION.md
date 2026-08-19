# No private data attestation

This document attests to how `relics-v4-starter` was produced and what it deliberately does not
contain. It is provided so an independent reviewer can verify the repository is safe to publish.

## Attestation

1. **Clean-room construction.** Every source file, script, test, doc, and config in this
   repository was **written originally** for this starter. The repository was created from an
   explicit allowlist (`PUBLIC_EXPORT_ALLOWLIST.md`), not by copying a private repository and
   removing sensitive files.

2. **No private material.** This repository contains **no** private keys, mnemonics,
   wallet/keystore files, `.env` values, API keys, RPC credentials, incident reports, private
   runbooks, or any private `CLAUDE.md` content. **Amended 2026-08-07:** with the RELICS
   operator's explicit authorization, `flagship/` now carries the exact production **hook**
   source (byte-identical to its Etherscan-verified standard-JSON) together with public
   on-chain identifiers (contract addresses, pool id, CREATE2 salt and init-code hash), and
   `submissions/` carries a public Programmable Builder Beta application. Everything in that
   scope is already public on Ethereum or Etherscan; the private renderer/token/NFT sources,
   internal audits and proofs remain excluded. The template layers (`src/`, `apps/`, `script/`,
   `test/`) remain clean-room.

3. **Inspired, not copied.** The design is *inspired by lessons* from building fully on-chain
   generative art on Uniswap v4. The lessons in `docs/10-twenty-lessons.md` are stated **generically**,
   with no private incident details, timelines, or identifiers.

4. **Dependencies are vendored, pinned copies (amended 2026-08-07).** Third-party Solidity
   libraries are redistributed as byte-exact, production-pinned trees under `lib/`, each with
   its upstream license file; the web app still uses the public npm registry. See
   `THIRD_PARTY_NOTICES.md` (note Uniswap v4-core BUSL-1.1 and solmate AGPL-3.0).

5. **No secrets by construction.** The default `forge test` suite and the web app's core flows
   require **no** secrets. All deployment scripts and opt-in fork tests read secrets from the
   environment; only `*.example` templates (names + placeholders) are tracked.

6. **No assurance, no endorsement.** This is educational software with no production deployment. Nothing here implies
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
