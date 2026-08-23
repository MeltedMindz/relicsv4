# 01 — System overview

This starter teaches one architecture: **fully on-chain generative art whose appearance is
driven by a Uniswap v4 pool.** Three contracts compose into a living collection.

```
                      ┌─────────────────────┐
                      │   ExampleToken       │  fixed-supply ERC-20
                      │   (the traded asset) │  no tax / no mint / no blacklist
                      └──────────┬──────────┘
                                 │ one canonical v4 pool
                                 ▼
   ┌──────────────┐      ┌──────────────────┐      ┌────────────────────────┐
   │ Uniswap v4   │◀────▶│  ExampleV4Hook   │      │ ImmutablePositionLocker │
   │ PoolManager  │ swaps│ observes swaps + │      │ holds LP principal;     │
   │              │ adds │ liquidity, keeps │      │ no withdraw selector    │
   └──────────────┘      │ compact "market  │      └────────────────────────┘
                         │  state"          │
                         └────────┬─────────┘
                                  │ read (view) at query time
                                  ▼
   ┌──────────────────┐   ┌────────────────────────┐
   │  ExampleArtNFT   │──▶│ ExampleOnchainRenderer │  base64 JSON + base64 SVG
   │  ERC-721 + 4906  │   │ (pure/view, no storage)│  computed from DNA + market
   └──────────────────┘   └────────────────────────┘
```

The canonical formula:

```
immutable per-token DNA  +  global market state  =  live phenotype
```

There is **no stored image, no IPFS, no API**. `ExampleArtNFT.tokenURI(id)` reads the token's
immutable DNA, reads the hook's market state, and asks the renderer to compute a full data URI
from Ethereum state at the moment of the call. Trade activity literally reshapes the art.

## The five contracts

| Contract | Role |
| --- | --- |
| `ExampleToken` | Fixed-supply ERC-20. The asset that trades on the pool. |
| `ExampleV4Hook` | Observes one canonical pool and maintains bounded market state (art entropy). |
| `ExampleArtNFT` | ERC-721 with fully on-chain metadata; pieces are explicitly awakened. |
| Renderer | One of three sample systems (`ExampleOnchainRenderer`/Sigil, `StrataRenderer`, `OrbitalRenderer`) on `RendererBase`, or your own. Neutral placeholder art. |
| `ImmutablePositionLocker` | Ownerless custodian: principal locked, fees forwarded immutably. |

## What to read next

- [00 — Make it your own (start here to fork + launch)](00-make-it-your-own.md)
- [02 — Contracts and the token](02-contracts-and-token.md)
- [03 — Uniswap v4 hooks, from zero](03-uniswap-v4-hooks.md)
- [10 — Twenty hard-won lessons](10-twenty-lessons.md)

> Reminder: this is an **educational** starter. It is not affiliated with any
> project, and everything here needs your own security, legal, and economic review.
