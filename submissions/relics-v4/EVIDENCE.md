# Evidence — relics-v4 (proposal revision)

Structured evidence for this exact submission revision. Builder statements, local tool
results, and independent on-chain facts are kept separate. Nothing here claims audit,
acceptance, deployment authorization, provider support, or availability.

## Local tool results (this repository, reproducible)

| Check | Command | Tool | Result |
| --- | --- | --- | --- |
| Flagship byte-exactness proof | `cd flagship && forge test` | forge 1.5.1-stable, solc 0.8.26 | 4/4 PASS (constructor args, init-code hash `0x8a34afea…0535`, CREATE2 → `0xA6f7…9440`, flags `0x1440`) |
| Template build + tests | `forge build && forge test` (repo root) | forge 1.5.1-stable | 62/62 PASS across 10 suites |
| Deterministic beta preflight | `cli.mjs check submissions/relics-v4/submission.json --repository-root .` | Programmable Builder v0.2.1 | Committed `compatibility-report.json`; Solidity closure `complete`; decision `REDESIGN_REQUIRED` preserved intentionally (fee-integration-pending + two named maintainer decisions) |

## Independent on-chain facts (chain id 1; verify with any RPC)

| Fact | Value |
| --- | --- |
| Hook runtime code | 8,644 bytes; keccak256 `0xd45977dd7bd1d3cc8209989cdce8e27495ef03d56820078db54dc8425a337fc6` |
| Hook `owner()` | `0x0000000000000000000000000000000000000000` |
| Hook `canonicalPoolId()` | `0x33d9b4089069272e5aeaeccf24bc710a7ee8cf65f4ecde682187a2fc355531ed` |
| Token `owner()` | `0x0000000000000000000000000000000000000000` |
| Token `totalSupply()` | 10,000 × 1e18, fixed (no mint/burn path) |
| Etherscan verification | Hook, token, NFT and renderer all verified with source published at the live addresses |

The 30 files under `flagship/` are byte-identical to the hook's Etherscan-verified
standard-JSON input (verified file-by-file during preparation of this application; any party
can re-run the comparison against the Etherscan API). Machine-readable provenance:
`flagship/PROVENANCE.json`.

## Dependency evidence (stable ids from `submission.json`)

- `uniswap-v4-poolmanager` — chain 1, `0x000000000004444c5dc75cB358380D2e3dE08A90`, trusted
  deployment record `v4-poolmanager-ethereum`; interface bound at compile time from vendored
  v4-core 1.0.2 sources (byte-exact with the verified closure).
- `weth9` — chain 1, `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`, canonical wrapped ether,
  verified explorer source; pool quote currency only.

## Builder statements (not tool results)

- The RELICS operator (GitHub `MeltedMindz`, user id 95740781) authorizes publication of the
  exact production hook source in this repository as a public flagship reference.
- The private production pipeline ran unit/integration/fuzz/invariant/reentrancy/differential/
  fork suites and release gates (published-numbers, launch geometry, fee canon 3000,
  `projectFundedBootstrapBuy = false`) before the 2026-08-03 launch. Stated as provenance;
  not bound as beta evidence.
- The genesis LP position NFT is held in a third-party UNCX liquidity lock (lock id 103).
  Stated neutrally; holder balances and awakened Relics are independent of that position.

## Missing / not applicable at this stage

- No `gate-status.json`, dependency lock, or review-target hash is bound: proposal stage.
- No static-analysis run is bound for the flagship in this repository (the deployed instance
  cannot change; the template carries its own CI). If maintainers scope a launch variant,
  the full prototype evidence battery in `TEST_PLAN.md` §C applies.
- No routing, provider, or availability evidence exists or is claimed.
