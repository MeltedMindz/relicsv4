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
