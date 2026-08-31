# `alluvium` — a starting point on `VECTOR_COMPOSITION_V1`

Sediment: the market writes the strata. Drawdown sets how many beds are laid down, recovery rules them through, and stress studs them with nodules.

## What this template is, and what it is not

The art is drawn **on chain**, by the deployed `VECTOR_COMPOSITION_V1` runtime, from the `VCV1`
configuration in `generator/params.json`. That file is the art. The bundle carries the
configuration; the runtime carries the code — a `.relics` bundle never carries contract code, and
there is no manifest field that could hold any.

`generator/generate.js` is a **local preview sketch**. It approximates what the configuration
means so you can choose values with your eyes. It is not the renderer, it is not submitted as art,
and it does not match the on-chain output pixel for pixel.

`relics validate` and `relics export` compare the sketch's mirrored `CONFIG` object against
`generator/params.json` over the keys they share and refuse on any disagreement. `params.json`
wins every comparison.

## The preset is a starting point, not a cage

Every value in `generator/params.json` may be changed as far as the runtime's own validator
accepts — palette, ground, fields, sensors, curves, traits, the title. Nothing in this kit compares
your finished configuration against the preset it began as, and nothing should.

## What you must edit before this launches

| file | why |
|---|---|
| `relics.config.json` | `project.name`, `project.symbol`, `supply`, and `earnings.creatorRecipient` — the placeholder is refused, not warned about. `market.antiSnipeMode` ships `UNSPECIFIED`, which is a draft value; elect `NONE` or `PROTECTED_98_MINUTES` yourself. |
| `generator/params.json` | the art. |
| `metadata/collection.json` | the collection's own name, symbol, description and images. |
| `traits/schema.json` | the trait dimensions and how values are weighted. |

## Traits are metadata, not a description of the picture

The trait values a token is minted with are **drawn from their own seeded stream**, one per
dimension, independently of anything the generator draws and independently of what the on-chain
runtime draws. A creator who believes the labels describe the image will ship a collection whose
attributes are wrong about its own pictures.

## Which runtime this elects, and where the number comes from

This project names its runtime by its stable string id, `VECTOR_COMPOSITION_V1`. The **numeric** id that
runtime holds is a per-chain fact — registry keys are chosen by the registering authority and may be
sparse — so it is read off `ArtRuntimeRegistryV1` on the chain you are launching on, at prepare
time, and never written into the bundle.
