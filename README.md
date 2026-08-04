# relics-v4-starter

**A beginner-friendly starter for building fully on-chain generative art whose look is forged by a
Uniswap v4 pool.** Three contracts compose into a living collection: a fixed-supply ERC-20, an
ERC-721 whose SVG is computed on chain, and a v4 hook that turns real market activity into visual
entropy.

> ⚠️ **Educational starter. NOT audited. NOT affiliated with Uniswap, OpenZeppelin, OpenSea, or
> any production collection or auditor.** It contains no private or production material. Get your
> own security, legal, and economic review before deploying or trading anything. See the
> [Disclaimer](#26-disclaimer).

---

## 1. What this is

`relics-v4-starter` is a clean-room teaching repo. It shows, end to end, the architecture behind
"market-forged" on-chain art:

```
immutable per-token DNA  +  global market state  =  live phenotype
```

There is no stored image, no IPFS, no API. `tokenURI` reads Ethereum state at query time and
returns a base64 JSON with an embedded base64 SVG.

## 2. What you will build

By the end you will have deployed and wired together:

- **`ExampleToken`** — a fixed-supply ERC-20 with no tax, blacklist, or hidden mint.
- **`ExampleV4Hook`** — a Uniswap v4 hook mined to the correct address, observing one canonical
  pool and maintaining compact market state.
- **`ExampleArtNFT`** — an ERC-721 with fully on-chain metadata and explicit, capacity-gated
  awakening.
- **`ExampleOnchainRenderer`** — a deterministic SVG/JSON generator (neutral placeholder art).
- **`ImmutablePositionLocker`** — an ownerless custodian that locks LP principal forever while
  keeping fee collection permissionless.
- A **neutral Next.js web app** to browse and interact with it.

## 3. Who this is for

- Solidity developers who have never written a Uniswap v4 hook and want a working, commented
  example.
- Artists/tinkerers curious how on-chain generative art actually renders from state.
- Anyone who wants a **correct, honest** template for a single-sided v4 launch and immutable LP
  finality — with the sharp edges labeled.

No prior v4 knowledge is assumed. Every term is defined in [Glossary](#glossary) and in
[`docs/03`](docs/03-uniswap-v4-hooks.md).

## 4. Architecture

```
                      ┌─────────────────────┐
                      │   ExampleToken       │  fixed-supply ERC-20
                      └──────────┬──────────┘
                                 │ one canonical v4 pool
                                 ▼
   ┌──────────────┐      ┌──────────────────┐      ┌─────────────────────────┐
   │ Uniswap v4   │◀────▶│  ExampleV4Hook   │      │ ImmutablePositionLocker │
   │ PoolManager  │      │ observes swaps + │      │ principal locked;       │
   └──────┬───────┘      │ liquidity → state│      │ fees route immutably    │
          │ mints LP NFT └────────┬─────────┘      └─────────────────────────┘
          ▼                       │ read (view)
   ┌──────────────┐               ▼
   │PositionManager│      ┌──────────────────┐   ┌────────────────────────┐
   │  (v4 NFT)     │      │  ExampleArtNFT   │──▶│ ExampleOnchainRenderer │
   └──────────────┘      │  ERC-721 + 4906  │   │  base64 JSON + SVG     │
                         └──────────────────┘   └────────────────────────┘
```

## 5. How it works (5 steps)

1. **Deploy** the token, then the hook (to a CREATE2-mined address whose bits declare its
   permissions), then the renderer and NFT.
2. **Bind** the canonical PoolKey to the hook (one-shot), recording the exact opening price.
3. **Initialize** the pool at that price; the hook rejects any other price.
4. **Add** the whole supply as a single-sided position and **lock** the LP NFT in the custodian.
5. **Trade.** Every swap updates market state; `tokenURI` renders each piece from its DNA plus
   that live state.

## 6. Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge` ≥ 1.0)
- Node.js ≥ 20 and npm
- git (for submodule dependencies)

## 7. Quick start (~15 minutes)

```bash
git clone --recursive <your-fork-url> relics-v4-starter
cd relics-v4-starter
# if you forgot --recursive:
git submodule update --init --recursive

# contracts
forge build
forge test

# generate example art (writes deterministic SVGs to output/examples/)
forge script script/GenerateExamples.s.sol --tc GenerateExamples

# web app
npm install
npm run web:dev   # http://localhost:3000
```

That is the whole loop with no network and no secrets. Everything below is optional and for
taking it on-chain.

## 8. Run the tests

```bash
forge test                       # unit + fuzz + invariant + local deployment integration
forge test --match-path "test/fork/*"   # fork tests (self-skip if MAINNET_RPC_URL is unset)
forge build --sizes | grep ExampleOnchainRenderer   # EIP-170 budget check
```

Test layout: `test/unit`, `test/fuzz`, `test/invariant`, `test/fork`, `test/deployment`, with
mocks under `test/mocks` and shared v4 scaffolding in `test/utils`.

## 9. Generate art

```bash
mkdir -p output/examples   # first time only
forge script script/GenerateExamples.s.sol --tc GenerateExamples
# optional knobs: EXAMPLE_COUNT, MARKET_DRAWDOWN, MARKET_SWAPS, MARKET_VOLATILITY
```

Regeneration at the same commit is byte-identical — that reproducibility is your art-integrity
check.

## 10. Start the web app

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # optional; edit to point at a deployment
npm run web:dev
```

The app works offline with deterministic local fixtures (Explore page) and fails closed on any
surface you have not configured.

## 11. Customize the art

Edit `src/ExampleOnchainRenderer.sol` (the `_svg`, `_palette`, geometry) and
`src/libraries/ArtDNA.sol` (trait decoding). Keep every market-driven loop bounded, and after
every edit run `forge build --sizes` — the renderer must stay under 24,576 bytes. See
[`docs/06`](docs/06-onchain-renderer.md) and [`docs/16`](docs/16-renderer-size-budget.md).

## 12. Customize the hook

Edit `src/ExampleV4Hook.sol`. If you change which callbacks it uses, update `getHookPermissions`
**and** the flag constant, then re-mine the address (the bits must match). Keep callbacks bounded
and never render or loop over NFTs inside them. See [`docs/04`](docs/04-the-hook.md).

## 13. Mine the hook address

```bash
POOL_MANAGER=0x... ART_TOKEN=0x... HOOK_OWNER=0x... \
  forge script script/MineHookAddress.s.sol --tc MineHookAddress
```

Mine against the **exact** constructor args you will deploy with. See
[`docs/13`](docs/13-mining-hook-address.md).

## 14. Deploy to Sepolia

```bash
POOL_MANAGER=0x... WETH=0x... INITIAL_HOLDER=0x... HOOK_OWNER=0x... \
  forge script script/DeployExample.s.sol --tc DeployExample \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

Look up the canonical Uniswap v4 addresses for your chain from the official Uniswap deployments
docs; this repo ships no baked-in address book. Full sequence in
[`docs/14`](docs/14-deploy-and-pool.md).

## 15. Create the pool

```bash
POOL_MANAGER=0x... HOOK=0x... ART_TOKEN=0x... WETH=0x... LAUNCH_TICK=-23040 \
  forge script script/BindAndCreatePool.s.sol --tc BindAndCreatePool \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $HOOK_OWNER_PRIVATE_KEY
```

Bind **before** initialize so a wrong opening price is rejected.

## 16. Add liquidity

```bash
POSITION_MANAGER=0x... PERMIT2=0x... ART_TOKEN=0x... WETH=0x... HOOK=0x... \
LP_RECIPIENT=0x... LAUNCH_TICK=-23040 LIQUIDITY=... \
  forge script script/AddLiquidity.s.sol --tc AddLiquidity \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

Single-sided by design. **Read the new position id from the tx receipt** — never a simulation
([`docs/11`](docs/11-position-manager-token-id.md), [`docs/08`](docs/08-genesis-liquidity.md)).

## 17. Lock liquidity (preserving fees)

```bash
POSITION_MANAGER=0x... ART_TOKEN=0x... WETH=0x... TREASURY=0x... \
ENTOMBMENT=0x000000000000000000000000000000000000dEaD POSITION_ID=<from receipt> \
  forge script script/LockPosition.s.sol --tc LockPosition \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

Principal becomes permanent; `collectFees()` stays permissionless and routes to immutable
recipients. This is **not** a burn ([`docs/09`](docs/09-locker-and-lp-finality.md)).

## 18. Verify the contracts

```bash
TOKEN=0x... HOOK=0x... RENDERER=0x... NFT=0x... \
  forge script script/VerifyDeployment.s.sol --tc VerifyDeployment --rpc-url $SEPOLIA_RPC_URL
```

Reverts on the first inconsistency, so it doubles as an operational gate. Also verify source on a
block explorer for your chain.

## 19. Configure the website

Set `NEXT_PUBLIC_*` values in `apps/web/.env.local` (see `apps/web/.env.example`): chain id, RPC,
and your token/NFT/hook/renderer addresses. Unset surfaces stay "not configured." Public env is
read **statically** — never dynamically ([`docs/17`](docs/17-frontend-integration.md)).

## 20. Mainnet safety checklist

- [ ] Full rehearsal on a fork / Sepolia, including a real swap and a fee collection.
- [ ] Token sort order chosen deliberately (art token as currency0 for single-sided routing).
- [ ] Hook address bits verified `== 0x1440`; mined against the real constructor args.
- [ ] Canonical pool bound **before** initialize; opening price asserted.
- [ ] Position id read from the confirmed receipt (never a simulation).
- [ ] LP locked in the immutable custodian; `feePolicyHash()` recorded.
- [ ] Owner powers (token/hook) renounced only after proofs exist; never claim a renounce before
      the tx and post-state reads exist.
- [ ] No project-funded bootstrap buy. Launch on real, independent trades.
- [ ] Honest launch language (see [`docs/15`](docs/15-launch-economics.md)); never "LP burned."
- [ ] No signing secret in any hosting environment.
- [ ] Independent security + legal review completed.

## 21. Security warnings

Read [`SECURITY.md`](SECURITY.md). Highlights: hook callbacks must stay bounded; only the
canonical pool may drive art state; market signals and randomness must never gate financial
outcomes; the renderer must stay under EIP-170; treat marketplace metadata as a cache of the
canonical `tokenURI`.

## 22. Project structure

```
src/            example contracts + interfaces/ + libraries/
script/         Foundry deployment/verification/art scripts
test/           unit/ fuzz/ invariant/ fork/ deployment/ + mocks/ + utils/
apps/web/       neutral Next.js starter (wagmi/viem, EIP-6963)
docs/           18 numbered guides (01-system-overview … 18-faq)
scripts/        secret scan, manifest generator, link checker (Node)
.github/        CI workflows + issue/PR templates
lib/            git submodules (forge-std, uniswap-hooks → v4-core/v4-periphery/OZ)
```

## 23. Docs index

| # | Guide |
| --- | --- |
| 01 | [System overview](docs/01-system-overview.md) |
| 02 | [Contracts and the token](docs/02-contracts-and-token.md) |
| 03 | [Uniswap v4 hooks, from zero](docs/03-uniswap-v4-hooks.md) |
| 04 | [The hook in detail](docs/04-the-hook.md) |
| 05 | [NFT and awakening](docs/05-nft-and-awakening.md) |
| 06 | [On-chain renderer](docs/06-onchain-renderer.md) |
| 07 | [Market state as art](docs/07-market-state-as-art.md) |
| 08 | [Genesis liquidity](docs/08-genesis-liquidity.md) |
| 09 | [Locker and LP finality](docs/09-locker-and-lp-finality.md) |
| 10 | [Twenty hard-won lessons](docs/10-twenty-lessons.md) |
| 11 | [PositionManager token id](docs/11-position-manager-token-id.md) |
| 12 | [Token sort order](docs/12-token-sort-order.md) |
| 13 | [Mining the hook address](docs/13-mining-hook-address.md) |
| 14 | [Deploy and pool](docs/14-deploy-and-pool.md) |
| 15 | [Launch economics](docs/15-launch-economics.md) |
| 16 | [Renderer size budget](docs/16-renderer-size-budget.md) |
| 17 | [Frontend integration](docs/17-frontend-integration.md) |
| 18 | [FAQ](docs/18-faq.md) |
| + | [Exporting on-chain SVG as PNG](docs/exporting-onchain-svg-as-png.md) |

## 24. Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
Contributions are judged by how well they teach a real pattern. Never add secrets or private data.

## 25. License

MIT — see [`LICENSE`](LICENSE). Third-party dependencies keep their own licenses; note that
**Uniswap v4-core is BUSL-1.1** (a dependency, not vendored here) — see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## 26. Disclaimer

This is **educational** software provided "as is," without warranty of any kind. It is **not
audited** and **not production-ready**. It is **not affiliated with or endorsed by** Uniswap,
OpenZeppelin, OpenSea, Foundry, any auditor, or any production collection. It contains **no
private or production material** — no real addresses, keys, or proofs. Nothing here is financial,
legal, or investment advice. Deploying tokens, launching liquidity, and distributing NFTs can
carry serious security, legal, tax, and regulatory consequences; obtain your own qualified review
before doing anything real. You are solely responsible for your use of this code.

---

## Glossary

- **hook** — a contract the Uniswap v4 PoolManager calls at specific pool events (initialize,
  add/remove liquidity, swap, donate). Its address bits declare which callbacks it implements.
- **PoolKey** — the struct identifying a pool: `currency0`, `currency1`, `fee`, `tickSpacing`,
  `hooks`.
- **PoolId** — `keccak256(abi.encode(poolKey))`, a `bytes32` handle for a pool.
- **tick** — an integer price index; each tick is a 0.01% step. Tick 0 is price 1.0.
- **sqrtPriceX96** — the pool price stored as `sqrt(price) * 2**96` (Q64.96 fixed point).
- **PositionManager NFT** — the ERC-721 the v4 periphery mints to represent a liquidity position;
  its token id comes from a shared counter (read it, don't predict it).
- **tokenURI** — the ERC-721 metadata function; here it returns an on-chain `data:` URI.
- **CREATE2** — deploys a contract to a pre-computable address derived from
  `keccak256(0xff, deployer, salt, keccak256(initCode))`; used to mine hook addresses.
