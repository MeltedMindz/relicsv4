# 06 — The on-chain renderer (`ExampleOnchainRenderer`)

The renderer is a **pure/view** contract with no storage and no owner. Given `(tokenId, dna,
marketState)` it returns a complete `data:application/json;base64,...` URI containing a base64
SVG. Determinism + immutable DNA is what makes the collection verifiable: anyone can recompute
the exact bytes.

## Neutral placeholder identity

The visual language here — concentric rings around a rotating polygon "core", tinted by market
state — is a **generic starter identity**. It is **not** the art of any production collection.
Replace `_svg`, the palettes, and `libraries/ArtDNA.sol` with your own visual language.

## How it composes

```
ArtDNA.decode(dna)  ->  palette, sides, ringCount, rotation, coreScale, jitter
Trig.cosDir/sinDir  ->  polygon vertex geometry (no floats; 15° snapping)
marketState         ->  volatility twists the core; drawdownBand fades the accent;
                        swapCount adds orbiting marks (HARD-CAPPED)
```

The key on-chain-art discipline: **market activity can add detail, but the render cost must not
grow without bound.** Orbiting marks are capped at `MAX_ORBITERS = 12`, and ring/vertex counts
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
