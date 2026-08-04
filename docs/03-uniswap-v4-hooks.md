# 03 — Uniswap v4 hooks, from zero

This guide assumes **no prior v4 knowledge**. It defines every term the rest of the docs use.

## Vocabulary

- **Pool** — a market between two tokens. In v4, all pools live inside one singleton contract,
  the **PoolManager**, instead of each pool being its own contract (that was v2/v3).
- **PoolKey** — the struct that *identifies* a pool: `currency0`, `currency1`, `fee`,
  `tickSpacing`, and `hooks`. Two pools with any different field are different pools.
- **currency0 / currency1** — the two tokens, **sorted by address ascending**. `currency0` is
  always the numerically smaller address. This ordering matters (see [12](12-token-sort-order.md)).
- **PoolId** — `keccak256(abi.encode(poolKey))`, a `bytes32` handle for the pool. Derived purely
  from the PoolKey, so anyone can compute it.
- **tick** — an integer index for price. Price moves in discrete ticks; each tick is a
  0.01% (1 basis point) step. Tick `0` is price 1.0 between the two currencies.
- **tickSpacing** — pools only allow ticks that are multiples of this. Larger spacing = coarser
  price granularity, cheaper positions. This starter uses `60`.
- **sqrtPriceX96** — the pool's price stored as `sqrt(price) * 2**96` (a Q64.96 fixed-point
  number). v4 stores the *square root* of price for cheaper math. You convert to/from ticks with
  `TickMath.getSqrtPriceAtTick` / `getTickAtSqrtPrice`.
- **fee** — the swap fee in hundredths of a bip. `3000` = 0.30%.
- **PositionManager** — the periphery contract that mints **liquidity positions as ERC-721
  NFTs**. When you add liquidity, you receive an NFT whose token id represents that position.
- **CREATE2** — a way to deploy a contract to a *pre-computable* address, derived from
  `keccak256(0xff, deployer, salt, keccak256(initCode))`. Changing the salt changes the address.
- **tokenURI** — the ERC-721 metadata function. Here it returns a `data:` URI computed on chain,
  not an `https://` link.

## What a hook is

A **hook** is a contract the PoolManager calls at specific moments of a pool's life — before or
after initialize, add/remove liquidity, swap, or donate. Your hook can observe or (with the
right permissions) modify those operations.

The magic: **the hook's address advertises which of those callbacks it implements.** The low
14 bits of the hook address are permission flags. The PoolManager checks them. If your hook's
code says "I handle afterSwap" but its address bit for afterSwap is 0, the pool ignores your
callback; if the address claims a flag your code does not back with a real function, calls fail.

So you must deploy the hook to an address whose low bits *exactly* match its declared
permissions. You find such an address by **mining a CREATE2 salt** — see
[13 — Mining the hook address](13-mining-hook-address.md).

This starter's hook needs three callbacks:

| Callback | Flag | Bit |
| --- | --- | --- |
| `afterInitialize` | `AFTER_INITIALIZE_FLAG` | `1 << 12` |
| `afterAddLiquidity` | `AFTER_ADD_LIQUIDITY_FLAG` | `1 << 10` |
| `afterSwap` | `AFTER_SWAP_FLAG` | `1 << 6` |

Summed, the low bits must equal `0x1440`.

## The lifecycle we use

1. **Deploy** the token, then the hook (to a mined `0x1440` address), renderer, and NFT.
2. **Bind** the canonical PoolKey to the hook (one-shot), recording the exact expected opening
   price. This happens *before* the pool exists.
3. **Initialize** the pool at that exact price. The hook's `afterInitialize` rejects any other
   price.
4. **Add liquidity** — the whole token supply as a single-sided position; you get a
   PositionManager NFT.
5. **Trade.** Every swap calls `afterSwap`, updating market state that the renderer reads.

Next: [04 — The hook in detail](04-the-hook.md).
