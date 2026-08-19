# Agent projects — three briefs, built with the public creator workflow only

These are not shipped templates and they are not fixtures. They are the evidence that a
natural-language brief can become a valid, exportable `.relics` project using nothing but
`relics init` plus ordinary file edits — no reaching into the schema, no special case anywhere in
the validator, no copying a fixture.

`node scripts/check-agent-projects.mjs` scaffolds each one with the CLI, overlays the authored
files below, and runs the full lifecycle: `preview` -> `test-seeds` -> `validate` -> `export` ->
`inspect`. Anything that only works because a harness helped it is not a creator workflow.

## A — monochrome-pixel-field

> "A 512-piece monochrome pixel collection where drawdowns introduce damage and volatility
> increases visual noise."

The mechanics are the point: two market sensors reaching two visual destinations, on a strictly
one-bit palette. `drawdown -> fracture` is the damage; `volatility -> distortion` is the noise.

## B — geometric-abstract

> "A geometric abstract collection where liquidity changes density and holder growth changes
> symmetry."

Both mappings are structural rather than cosmetic: `liquidity -> density` decides how many forms
are drawn, `holder_growth -> symmetry` decides how many times the composition is mirrored. A
collection whose market response is only a colour shift has not really used the market.

## C — static-generative

> "A static generative collection with no market mappings."

The one that must also work. `market/mappings.json` declares an empty list, the generator reads no
market at all, and every piece is a pure function of its seed forever. If a market-aware format
cannot express "this art does not respond to the market", it is not a format, it is a theme.
