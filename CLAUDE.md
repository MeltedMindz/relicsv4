# CLAUDE.md — relics-v4-starter

> Project memory for anyone (human or AI) working on this **public, clean-room educational
> starter**. This is not the memory of any private project; it is original to this repo.

## What this repo is

A teaching starter for **fully on-chain generative art driven by a Uniswap v4 hook**. Five
contracts: `ExampleToken` (fixed-supply ERC-20), `ExampleV4Hook` (observes one canonical pool),
`ExampleArtNFT` (ERC-721, on-chain metadata, explicit awakening), `ExampleOnchainRenderer`
(deterministic SVG/JSON, neutral placeholder art), `ImmutablePositionLocker` (ownerless LP
custodian). Plus Foundry scripts/tests and a neutral Next.js app under `apps/web/`.

It is **educational and unaudited**, and **not affiliated** with Uniswap, OpenZeppelin, OpenSea,
or any production collection. Keep every public word true.

## Clean-room / public-safety rules (never break)

- **No private data, ever.** No production addresses, CREATE2 salts, position ids, pool ids, tx
  hashes, deploy keys, mnemonics, `.env` values, proofs, or private docs. See
  `NO_PRIVATE_DATA_ATTESTATION.md` and `PUBLIC_EXPORT_ALLOWLIST.md`.
- **Reference dependencies, don't vendor them.** Solidity deps are git submodules; the web app
  uses public npm. Do not copy third-party source into the tree.
- **Run the secret scan before committing:** `npm run secrets:scan`.
- **Regenerate the manifest after adding/removing files:** `node scripts/gen-manifest.mjs`.

## Architecture facts that bite

- **Hook flags == address bits.** `ExampleV4Hook` needs `afterInitialize | afterAddLiquidity |
  afterSwap` → low 14 bits must equal `0x1440`. Mine a CREATE2 salt against the EXACT init code +
  constructor args (`HookMiner`). Change an arg → re-mine. `BaseHook`'s constructor enforces it.
- **Bind before initialize.** `bindCanonicalPool` is one-shot and records the exact expected
  opening price; `_afterInitialize` reverts otherwise. Every callback validates the full PoolKey
  including `hooks == address(this)`.
- **Callbacks are bounded.** Fixed-size struct writes only. No arrays, no untrusted external
  calls, no NFT work, no rendering in a swap path.
- **Market state is art entropy, never an oracle.** Randomness/ticks/volumes never gate a
  financial outcome.
- **Awakening is explicit.** Receiving the token mints nothing; `awaken(count)` is
  `msg.sender`-only, bounded to 8/call, capacity DERIVED (`balanceOf/1e18 - nft.balanceOf`), never
  stored. `_mint` not `_safeMint` (recipient is the caller).
- **Locker separates principal finality from fee collection.** Zero-liquidity DECREASE + two
  direct `TAKE`s to immutable recipients; the locker never holds a fee asset (donation-DoS proof).
  Never say "LP burned" — say "principal locked; fees route immutably."
- **Token sort order decides routability.** For a single-sided launch, the art token usually wants
  to be currency0 (sort below the quote). See `docs/12`.
- **Read the PositionManager token id from the receipt, never a simulation.** See `docs/11`.

## Renderer

Neutral "sigil" identity (rings + rotating polygon), NOT any production art. Deterministic; pure
`view`. Respect **EIP-170 (24,576 bytes)** — a test pins the runtime size. Measure with
`forge build --sizes | grep ExampleOnchainRenderer` after every edit. Trig uses 15°-snapped
integer tables (no floats). All market-driven loops (rings, vertices, orbiters) are hard-capped.

## Web app

Next.js App Router, wagmi + viem, EIP-6963 injected wallets, **no** WalletConnect projectId and
**no** server secret for core flows. **Static** public env access only — never `process.env[key]`,
`Object.entries`, or spread. Fail-closed registry: unset/zero addresses render "not configured."

## Self-update rule

Any change to contracts, tokenomics, deployment behavior, the renderer's size/visual language, or
the public-safety posture MUST update the affected `docs/` and this file in the same change set.
A stale doc that contradicts the code is a bug.

## Commands

```bash
forge build && forge test && forge fmt          # core loop
forge build --sizes | grep ExampleOnchainRenderer   # after every renderer edit
forge script script/GenerateExamples.s.sol --tc GenerateExamples
npm install && npm run web:build && npm run web:lint && npm run web:typecheck
npm run secrets:scan                            # before committing
node scripts/gen-manifest.mjs                    # refresh export manifest
node scripts/check-links.mjs                     # docs link integrity
```

## Publication

Do NOT self-publish. First commit locally, run the secret scan, and stop. Publication happens
only after an independent secret/privacy/provenance review.
