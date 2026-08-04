# 16 — The renderer size budget (EIP-170)

Every contract's **runtime bytecode** must be ≤ **24,576 bytes** (EIP-170). For on-chain art, the
renderer is the contract that pushes against this wall as you add detail. Treat the limit as a
hard budget.

## Measure after every edit

```bash
forge build --sizes | grep ExampleOnchainRenderer
```

A test also pins it so a regression fails CI:

```solidity
assertLt(address(renderer).code.length, 24_576, "renderer exceeds EIP-170");
```

This starter's renderer is deliberately small, so you have lots of headroom to add your own art.
A production renderer often lives within tens of bytes of the limit — at which point every change
must be measured, not guessed.

## Byte-count intuition fails — measure everything

Solidity + via-IR optimization makes bytecode size non-obvious:

- **Inlining a function can grow the contract.** With `via_ir`, string `concat` arity and how the
  optimizer shares code mean a "simplification" can add hundreds of bytes. Never assume; build and
  diff.
- **String literals and repeated `concat` calls cost real bytes.** Factor shared fragments.
- **Custom minimal helpers can beat library imports.** A tiny purpose-built uint→string writer can
  be smaller than a general-purpose one, if you actually measure the difference.

## Free bytes before you spend them

When you are near the limit, the workflow is: **free first, then spend.** Remove a dead code path
or shrink a helper to bank bytes, confirm the saving with `--sizes`, *then* add the new art mass.
Keep a short ledger of what you freed and where you spent it.

## Techniques

- Move pure geometry into small libraries (`libraries/Trig.sol`, `libraries/ArtDNA.sol`) — they
  are inlined but keep the renderer readable and the shared math in one place.
- Prefer integer math and precomputed tables over general-purpose math imports.
- Snap angles/coordinates to coarse grids (this starter uses 15° trig snapping) to shrink tables.
- Cap every market-driven loop (orbiters, rings, vertices) so both **gas** and **bytecode** stay
  bounded.
