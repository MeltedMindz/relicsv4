# Contributing

Thanks for helping improve this educational starter. Contributions are judged by how well they
**teach a real pattern**, not by production polish.

## Ground rules

1. **Keep it clean-room and public-safe.** Never add a secret, private key, mnemonic, real
   deployment address, transaction hash, pool id, salt, or any non-public material. This repo is
   public. See `NO_PRIVATE_DATA_ATTESTATION.md`.
2. **No implied endorsement.** Do not imply that Uniswap, OpenZeppelin, OpenSea, or any auditor
   endorses this project. It uses their open-source work; it is not affiliated with them.
3. **Truth over hype.** Follow the launch-language rules in `docs/15-launch-economics.md`. Never
   call the locked LP "burned"; never present an initialized price as market-validated.

## Local setup

```bash
# contracts
forge build && forge test && forge fmt

# after any renderer edit
forge build --sizes | grep ExampleOnchainRenderer   # must stay < 24,576 bytes

# web app
npm install
npm run web:build && npm run web:lint && npm run web:typecheck

# secret scan (run before every commit)
npm run secrets:scan
```

## Pull requests

- Run `forge fmt` and `forge test`; make sure both pass.
- If you change contracts, tokenomics, or deployment behavior, update the relevant `docs/` and
  `CLAUDE.md` in the **same** change set. A stale doc that contradicts the code is a bug.
- If you touch the renderer, include before/after `--sizes` output.
- Fill in the PR template checklist honestly, including the "no private data" box.

## Style

- Solidity: `forge fmt` settings in `foundry.toml` are authoritative (100 cols, 4-space tabs,
  double quotes). Prefer small pure libraries for shared math.
- TypeScript/React: `eslint` + `tsc` must pass. Keep public env access **static** (see
  `docs/17-frontend-integration.md`).

## What makes a great contribution

- A clearer explanation of a v4 concept, with a test that demonstrates it.
- A new bounded, well-commented example of a pattern (a different renderer archetype, an
  alternative awakening policy) that keeps the teaching goals intact.
- Better tests: more currency-ordering coverage, more fuzz/invariant properties, more hostile
  cases for the locker.
