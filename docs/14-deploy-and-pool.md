# 14 — Deploy, bind, create the pool, add liquidity, lock

The scripts under `script/` are **templates**. They read all infrastructure addresses from the
environment (never hardcoded) and fail fast if one is missing. Always rehearse on a fork or a
testnet first.

## Prerequisites

Look up, for your target chain, the canonical Uniswap v4 addresses from the official Uniswap
deployments documentation, and your quote token (e.g. WETH):

- `POOL_MANAGER`, `POSITION_MANAGER`, `PERMIT2`, `WETH`

Set your operator secrets locally only (see the root `.env.example`): `DEPLOYER_PRIVATE_KEY`,
`SEPOLIA_RPC_URL`.

## The sequence

```bash
# 0) Preview the hook salt/address (optional but recommended)
POOL_MANAGER=0x... ART_TOKEN=0x... HOOK_OWNER=0x... \
  forge script script/MineHookAddress.s.sol --tc MineHookAddress

# 1) Deploy token -> hook (CREATE2, flag-mined) -> renderer -> NFT
POOL_MANAGER=0x... WETH=0x... INITIAL_HOLDER=0x... HOOK_OWNER=0x... \
  forge script script/DeployExample.s.sol --tc DeployExample \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# 2) Bind the canonical PoolKey (one-shot), then initialize the pool at the exact price
POOL_MANAGER=0x... HOOK=0x... ART_TOKEN=0x... WETH=0x... LAUNCH_TICK=-23040 \
  forge script script/BindAndCreatePool.s.sol --tc BindAndCreatePool \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $HOOK_OWNER_PRIVATE_KEY

# 3) Add the single-sided genesis position
POSITION_MANAGER=0x... PERMIT2=0x... ART_TOKEN=0x... WETH=0x... HOOK=0x... \
LP_RECIPIENT=0x... LAUNCH_TICK=-23040 LIQUIDITY=... \
  forge script script/AddLiquidity.s.sol --tc AddLiquidity \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
#    -> READ the new position id from the tx receipt (see docs/11)

# 4) Lock the position: principal permanent, fees route immutably
POSITION_MANAGER=0x... ART_TOKEN=0x... WETH=0x... TREASURY=0x... \
ENTOMBMENT=0x000000000000000000000000000000000000dEaD POSITION_ID=<from receipt> \
  forge script script/LockPosition.s.sol --tc LockPosition \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# 5) Verify wiring (read-only; reverts on any inconsistency)
TOKEN=0x... HOOK=0x... RENDERER=0x... NFT=0x... \
  forge script script/VerifyDeployment.s.sol --tc VerifyDeployment --rpc-url $SEPOLIA_RPC_URL
```

## Ordering matters

- **Bind before initialize** (step 2 before the pool exists at a price) so a wrong opening price
  is rejected.
- **Read the position id from the receipt** (between steps 3 and 4).
- **Renounce owner powers** (token/hook) only after your proofs exist, and never claim a mainnet
  renounce before the transaction and post-state reads exist.

## Rehearse, then relaunch

Do a full dry run on Sepolia (or an Anvil fork of your target chain) and confirm every step,
including a real swap and a fee collection, before touching mainnet. The local integration test
`test/deployment/DeploymentFlow.t.sol` runs this whole path in-memory.
