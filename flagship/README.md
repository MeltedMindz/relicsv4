# RELICS production hook — public flagship reference

This directory is the **exact production source** of the RELICS Uniswap v4 hook that is live
on Ethereum mainnet, published here by the RELICS operator as an explicitly authorized public
flagship reference. It is not an example and not a rewrite: every `.sol` file below is
byte-identical to the standard-JSON input that Etherscan verified for the deployed contract.

| Fact | Value |
| --- | --- |
| Hook contract | [`0xA6f73cc88723f04b85E2c2aF3e35F759Dc1A9440`](https://etherscan.io/address/0xA6f73cc88723f04b85E2c2aF3e35F759Dc1A9440#code) |
| Chain | Ethereum mainnet (chain id 1) |
| $RELICS token (currency0) | `0x8F294a99a0609822C233b24867F331c292cE2DA9` |
| PoolManager (v4 singleton) | `0x000000000004444c5dc75cB358380D2e3dE08A90` |
| Canonical pool id | `0x33d9b4089069272e5aeaeccf24bc710a7ee8cf65f4ecde682187a2fc355531ed` |
| Pool | $RELICS/WETH, fee 3000 (0.30%), tick spacing 60 |
| Hook permission flags | `0x1440` = `afterInitialize \| afterAddLiquidity \| afterSwap` |
| Hook `owner()` | `address(0)` (renounced) |
| Compiler | solc `v0.8.26+commit.8a97fa7a`, optimizer runs 1, via-IR, EVM `cancun`, no metadata hash, no CBOR |
| Runtime code | 8,644 bytes, keccak256 `0xd45977dd7bd1d3cc8209989cdce8e27495ef03d56820078db54dc8425a337fc6` |

Machine-readable provenance, including the CREATE2 record and upstream revision hashes, is in
[`PROVENANCE.json`](./PROVENANCE.json).

## What the hook does

> **This page is about the flagship art collection's hook, not the launchpad's.** The mask and the
> observer description below are true of `RelicsV4Hook` and of nothing else. A project launched
> through the RELICS Launchpad binds a per-project ArtHook of a later generation, on a different
> mask, that sets a dynamic LP fee in `beforeSwap` — see
> [`docs/launchpad/12-launch-protection.md`](../docs/launchpad/12-launch-protection.md). Carrying
> either fact across to the other is the single easiest mistake to make here.

`RelicsV4Hook` turns real market history into permanent on-chain state that the RELICS
renderer reads as visual condition. It is an **observer**:

- Only three callbacks are enabled — `afterInitialize`, `afterAddLiquidity`, `afterSwap`.
  There are no before-hooks, no return-delta permissions, and no donate hooks, so the hook
  records market state and structurally cannot alter, tax, or refuse a trade.
- Each swap and liquidity event on the canonical pool updates one packed
  `GlobalMarketState`: cumulative buy/sell volume, net flow, swap and liquidity counts,
  a volatility EMA, drawdown band, stress, epoch, and a rolling `marketSeed`.
- `bindCanonicalPool` is owner-only and one-shot. It was spent at launch and ownership was
  then renounced, so the binding is permanent. Every callback validates the full `PoolKey`
  against the bound canonical pool and reverts `UnauthorizedPool` for any other pool, which
  also means no second pool can ever initialize against this hook.

## Verify it yourself

**1. Offline, from this directory alone** (no RPC needed):

```bash
cd flagship
forge test
```

`test/DeploymentProof.t.sol` recompiles this exact tree with the deployed settings and
proves `keccak256(creationCode ++ constructorArgs)` equals the pre-launch mined init-code
hash `0x8a34afea…0535`, that its CREATE2 derivation (deployer `0x4e59…956C`, salt `0x…1302`)
lands on the live hook address, and that the address's low 14 bits encode exactly the three
declared permissions. Any changed byte in `src/` or `lib/`, or any changed compiler setting,
fails the suite.

**2. Against the chain:**

```bash
# runtime code hash of the live hook
cast keccak "$(cast code 0xA6f73cc88723f04b85E2c2aF3e35F759Dc1A9440 --rpc-url $RPC)"
# expect 0xd45977dd7bd1d3cc8209989cdce8e27495ef03d56820078db54dc8425a337fc6

cast call 0xA6f73cc88723f04b85E2c2aF3e35F759Dc1A9440 'owner()(address)' --rpc-url $RPC          # address(0)
cast call 0xA6f73cc88723f04b85E2c2aF3e35F759Dc1A9440 'canonicalPoolId()(bytes32)' --rpc-url $RPC # 0x33d9…31ed
```

**3. Against Etherscan:** the contract's verified standard-JSON contains exactly the 30
`.sol` files in this directory, at the same paths, byte for byte.

## Layout

```
flagship/
├── src/                      4 RELICS files: RelicsV4Hook + IRelicsHook, DNA, EvolutionMath
├── lib/                      26 pinned dependency files, exactly as compiled and verified
│   ├── v4-core/              @uniswap/v4-core 1.0.2 (types, libraries, interfaces)
│   ├── uniswap-hooks/        @openzeppelin/uniswap-hooks 1.2.2 (BaseHook)
│   └── openzeppelin-contracts/  @openzeppelin/contracts 5.6.1 (Ownable, Context)
├── test/DeploymentProof.t.sol   offline byte-exactness proof
├── foundry.toml              the deployed compiler profile — do not change
├── remappings.txt            the deployed import remappings
└── PROVENANCE.json           machine-readable deployment record
```

The `lib/` files are vendored on purpose: the proof requires the exact dependency bytes that
were compiled and verified, not whatever a submodule or package manager resolves today.

## Relationship to the rest of this repository

The repository root is a clean-room **starter template** (`Example*` contracts) for builders
who want the same architecture. This `flagship/` directory is the deployed real thing the
template is modeled on. The two share no code: the template is a teaching rewrite, the
flagship is the production artifact.

## License

All 30 source files carry `SPDX-License-Identifier: MIT` upstream: the four RELICS files
(MIT, this project), Uniswap `v4-core` 1.0.2 files (MIT), OpenZeppelin `uniswap-hooks` 1.2.2
(MIT), and OpenZeppelin `contracts` 5.6.1 (MIT). Copyright remains with their respective
authors.
