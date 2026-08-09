# Solidity-SVG parameters

The SOLIDITY_SVG runtime draws with a **registered on-chain Solidity template**. Your project
supplies parameter values; the template supplies the code. That is the whole split, and it is why
this template exists: a bundle configures art, it never carries contract code.

`generator/params.json` holds the declarative parameter values. It travels with the bundle and
is encoded into the template's config bytes at prepare time, by the template's own published
parameter layout — the kit deliberately does not invent that encoding, so it does not guess.

`generator/generate.js` is a **local preview** of the same shapes, so you can iterate on
parameters and see what you are choosing without a chain. It is not the renderer, it is not
submitted, and it does not have to match the on-chain output pixel for pixel. Treat it as a
sketch of the template's behaviour.

`art.templateId` must name a template that is actually registered on the chain you launch on.
No template is registered on any chain yet, so selecting one here records your choice; the launch
step is what confirms a template exists before anything can be prepared.

If you need behaviour the registered templates do not offer, the answer is the JAVASCRIPT runtime,
not custom Solidity. A one-click bundle has no field for contract code, no field for an address to
call, and no file type that could carry either. Custom hooks go through a separate reviewed
process.

## Files

| File | What it is |
| --- | --- |
| `relics.config.json` | your project configuration. The exporter turns it into the bundle manifest. |
| `generator/generate.js` | the art. One `render(context)` export, deterministic, no imports. |
| `traits/schema.json` | the trait dimensions and how values are weighted. |
| `market/mappings.json` | sensor → transform → art-parameter wiring. |
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
relics export . --output my-project.relics
```

`export` runs validation first and refuses to write a bundle that fails. Import the `.relics`
file in the launchpad creator app; it derives the same hashes the CLI printed.
