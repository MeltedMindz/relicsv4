# Market Responsive

Art that reads its own market. The seed decides what the piece **is**; the market decides what
condition it is **in**.

`market/mappings.json` wires four sensors to four art parameters:

| Sensor | Transform | Destination |
| --- | --- | --- |
| drawdown | clamp 0 → 0.85 | fracture |
| volume | range −0.2 → 0.9 | density |
| tick (price) | 12-sample smoothing | brightness |
| recovery | accumulate, cap 0.8 | scar |

Every id and every numeric bound comes from a closed vocabulary the validator enforces. A mapping
is configuration — there is no expression to parse, no callback, and nothing that can reach a fee,
a liquidity parameter or an external call.

Read every destination with a fallback (`market.fracture ?? 0`). A destination you have not
mapped is absent rather than zero, and a piece that renders before its first trade is a piece a
collector can actually look at on day one.

This template also shows a **SPLIT** earnings configuration: one collaborator takes 1,500 bps of
the creator's own share of collected LP fees. Those basis points are a share of the creator
portion, never of trading volume.

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
