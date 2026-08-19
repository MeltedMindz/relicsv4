# Minimal

The smallest complete project the kit can export: one generator, two trait dimensions, no
market mappings.

## Files

| File | What it is |
| --- | --- |
| `relics.config.json` | your project configuration. The exporter turns it into the bundle manifest. |
| `generator/generate.js` | the art. One `render(context)` export, deterministic, no imports. |
| `traits/schema.json` | the trait dimensions and how values are weighted. |
| `market/mappings.json` | sensor → transform → art-parameter wiring. Empty here. |
| `metadata/collection.json` | collection-level metadata (name, symbol, description, images). |

## Traits are metadata, not a description of the picture

The trait values a token is minted with are **drawn from their own seeded stream**, one per
dimension, independently of anything the generator does. The render context a generator receives
carries `seed`, `random`, `market`, `sensors`, `size` and `project` — there is no `traits` field,
and there deliberately is not one yet: adding it here without the same change in the launchpad's
importer would make a generator that used it render differently at import time and fail its own
output commitment.

So a label says what the token is *called*, not what it *looks like*. That is a normal thing for a
collection whose image is a function of the market rather than of an attribute table — but decide
it on purpose. If you want a label to describe the image, the generator has to derive the value it
draws with, not pick independently and hope.

**This template collides on names, so read that paragraph twice.** Its generator picks from a
palette carrying the same names this trait schema declares, off a different stream — so the label
and the colour **agree only by coincidence**. Measured on the pristine `market-responsive` template
across seeds 1-8, they agreed 0 times out of 8. They are not weakly correlated; they are unrelated.

## Before you export

Set `earnings.creatorRecipient` in `relics.config.json` to your own address. The template ships
with a placeholder, and validation refuses to package a placeholder recipient.

## Loop

```bash
relics dev .                      # local studio: any seed, market sliders, live traits
relics preview . --count 12       # deterministic SVGs into previews/
relics test-seeds . --count 100   # sample the collection at scale
relics validate .                 # every check; writes nothing
relics export . --output min.relics
```

`export` runs validation first and refuses to write a bundle that fails. Import the `.relics`
file in the launchpad creator app; it derives the same hashes the CLI printed.
