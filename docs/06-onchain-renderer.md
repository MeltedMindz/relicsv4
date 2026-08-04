# 06 — The on-chain renderer (three systems + your own)

A renderer is a **pure/view** contract with no storage and no owner. Given `(tokenId, dna,
marketState)` it returns a complete `data:application/json;base64,...` URI containing a base64
SVG. Determinism + immutable DNA is what makes the collection verifiable: anyone can recompute the
exact bytes.

## Three sample systems + a single seam

This starter ships **three distinct art systems** so the range is obvious, all built on
[`RendererBase`](../src/RendererBase.sol):

| Contract | Style | Leans on |
| --- | --- | --- |
| `ExampleOnchainRenderer` | **Sigil** — rings + rotating polygon core | volatility, drawdown, recovery, swaps |
| `StrataRenderer` | **Strata** — market history as sediment bands | epoch, buy/sell, drawdown, recovery |
| `OrbitalRenderer` | **Orbital** — nucleus + orbiting bodies | holders, swaps, volatility, drawdown |

`RendererBase` does the JSON + base64 + 500×500 canvas wrapping and provides shared palette/number
helpers. Each concrete renderer implements ONE seam:

```solidity
function _renderArt(uint256 tokenId, bytes32 dna, MarketState memory market)
    internal pure override returns (string memory);
```

**Bring your own art:** extend `RendererBase`, implement `_renderArt` (and optionally
`_styleName` / `_description` / `_attributes`), deploy it, and point the NFT at it. Pick a shipped
style with `RENDERER_STYLE` / `config.rendererStyle`. These are **neutral placeholder identities**,
not the art of any production collection — replace them.

## The discipline: bounded, no floats

**Market activity can add detail, but the render cost must not grow without bound.** Every
market-driven loop is hard-capped (orbiters/bodies ≤ 12–16, bands ≤ 16), and ring/vertex counts
come from DNA ranges (2–6 rings, 3–8 sides). No loop iterates over unbounded input.

## No floats on the EVM

`libraries/Trig.sol` snaps every angle to one of 24 directions (15° resolution) and reads
cosine from a 7-entry first-quadrant table, scaled by 1000, reflected into the other quadrants.
It is low precision on purpose — plenty for a stylized sigil, and cheap in bytecode.

## Bytecode budget

The renderer is the contract most likely to bump into the **EIP-170 24,576-byte runtime limit**
as you add art. This starter's renderer is small (well under the limit) and a test pins it:

```solidity
assertLt(address(renderer).code.length, 24_576);
```

See [16 — Renderer size budget](16-renderer-size-budget.md) for how to measure and free bytes.

## Preview offline

```bash
forge script script/GenerateExamples.s.sol --tc GenerateExamples
# writes deterministic SVGs to output/examples/
```

Regeneration at the same commit is byte-identical — that reproducibility **is** your
art-integrity check.
