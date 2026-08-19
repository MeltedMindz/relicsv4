# 04 — The hook in detail (`ExampleV4Hook`)

`ExampleV4Hook` extends OpenZeppelin's `uniswap-hooks` `BaseHook`. It observes one canonical pool
and maintains a compact `MarketState` struct used purely as **art entropy**.

## Declared permissions

```solidity
function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
    return Hooks.Permissions({
        afterInitialize: true,
        afterAddLiquidity: true,
        afterSwap: true,
        // everything else false
        ...
    });
}
```

`BaseHook`'s constructor calls `Hooks.validateHookPermissions(this, getHookPermissions())`,
which reverts unless the deployed address carries exactly these bits (`0x1440`). That is why a
plain `new ExampleV4Hook(...)` almost always reverts and you must deploy via a mined CREATE2 salt.

> **`0x1440` is this template's mask, and not a universal one.** The example hook here declares
> three "after" callbacks, so its address must carry those bits. A Uniswap v4 hook's mask is whatever
> its own `getHookPermissions()` declares — a hook that also sets a dynamic fee needs `beforeSwap`
> and lands on a different mask. The RELICS Launchpad's per-project ArtHook is one such hook; see
> [`docs/launchpad/02`](launchpad/02-what-a-launch-produces.md#the-hook) for its mask. Mine against
> the mask your own hook declares, never against a number copied from another project.


## One-shot binding, before initialize

```solidity
function bindCanonicalPool(bytes32 poolId, address c0, address c1, uint24 fee,
    int24 tickSpacing, uint160 expectedSqrtPriceX96, int24 expectedInitialTick) external onlyOwner
```

- Callable **once** (`CanonicalPoolAlreadyBound` otherwise).
- Records the full PoolKey identity **and** the exact opening price you intend.
- Requires the art token to be one of the currencies.

Binding *before* the pool is initialized is what lets the hook reject a wrong opening price:

```solidity
function _afterInitialize(address, PoolKey calldata key, uint160 sqrtPriceX96, int24 tick)
    internal override returns (bytes4)
{
    _validatePoolKey(key);
    if (sqrtPriceX96 != expectedSqrtPriceX96 || tick != expectedInitialTick) {
        revert UnexpectedInitialPrice(...);
    }
    ...
}
```

## Full PoolKey validation on every callback

```solidity
function _validatePoolKey(PoolKey calldata key) private view {
    if (address(key.hooks) != address(this)) revert HookAddressMismatch();
    bytes32 poolId = PoolId.unwrap(key.toId());
    if (!isPoolBound || poolId != canonicalPoolId
        || Currency.unwrap(key.currency0) != currency0
        || Currency.unwrap(key.currency1) != currency1
        || key.fee != poolFee || key.tickSpacing != poolTickSpacing) {
        revert UnauthorizedPool(poolId);
    }
}
```

A spoofed pool — same hook, different fee/currencies — produces a different PoolId and is
rejected. Crucially it also checks `key.hooks == address(this)`: a pool that *names* your hook but
is otherwise different cannot drive your state.

## Plumbing vs mapping — the one function you customize

The callbacks split cleanly into **plumbing** (validate the pool, read the tick, build a normalized
`MarketEvent`) and **mapping** (turn that event into the next `MarketState`). The mapping is one
pure function:

```solidity
function _evolveState(MarketState memory s, MarketEvent memory e) internal view returns (MarketState memory)
```

`_afterSwap` and `_afterAddLiquidity` each build a `MarketEvent` and call `_evolveState`. To change
how the market drives the art, you edit `_evolveState` and the `CUSTOMIZE` weight constants above
it — you never touch the PoolKey validation or the callback wiring. See
[00 — Make it your own](00-make-it-your-own.md).

`_evolveState` only updates a **fixed-size** struct (counts, saturating volumes, high/low tick, a
drawdown band, a recovery band, an EMA volatility, and a rolling entropy hash) and reads block
data. There are **no arrays**, **no loops over user input**, **no external calls into untrusted
code**, **no NFT reads/writes**, and **no renderer calls**. Every swap's hook cost stays O(1) and
predictable — see lessons in [10](10-twenty-lessons.md).

The holder-growth signal is NOT computed here: it is a token fact, so `ExampleArtNFT` reads
`token.activeHolderCount()` and injects it into `MarketState.holderCount` at render time.

## Buy/sell sign convention

v4 deltas are from the swapper's perspective. A **positive art-token amount** means the swapper
*received* the art token → a **buy**. The hook classifies volume accordingly and works for both
currency orderings (verified in `test/unit/ExampleV4Hook.t.sol`).

## Market state is not an oracle

`drawdownBand`, `volatility`, ticks, and volumes are **texture for the art**, nothing more. They
are manipulable, especially in shallow liquidity. Never gate a payout, mint, or lottery on them.
See [07 — Market state as art](07-market-state-as-art.md).
