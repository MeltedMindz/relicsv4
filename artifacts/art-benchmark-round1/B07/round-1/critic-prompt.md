# Development critique

Round 1. 4 round(s) remain after this one.

You are the DEVELOPMENT CRITIC. You are not the author, and you are not the final reviewer.
Your job is to close the gap between the work and its stated direction. You will not give a
verdict and you will not score anything: something else decides whether this ships.

## What you are looking at

Rendered images from the deployed art runtime: a contact sheet of twelve seeds at 256px, the
same twelve at 120px, and market-state rows (neutral / stress / recovery) for four of them.
The 120px sheet is the size a collection is actually browsed at, and it is where most of these
decisions are really made.

## The brief

# Brief — COLONY

An organic growth: a colony of cells radiating from a shared centre, each generation budding from the last. The feeling should be biological rather than geometric, even though the construction is regular — accretion, not design.

Rounded forms, clustered and overlapping, in verdigris and bone over deep ink. The palette should feel damp and mineral rather than bright.

Growth and retreat are the whole market story: recovery pushes the colony outward and multiplies its members, stress pulls it back toward the centre and reduces it. The change should be plainly visible at thumbnail size. Tokens differ in how far the colony has spread and how densely it has packed.

## The art direction this work is being held to

- **medium**: Vector composition: fields of rounded primitives placed about the canvas centre in a radiating arrangement.
- **motifTranslation**: The colony becomes clustered rounded members budding outward from a shared centre, so accretion is expressed as radial packing rather than as depicted cells.
- **composition**: A centred cluster that spreads outward toward the frame without reaching the edge, so the colony reads as a growth with room to grow.
- **focalHierarchy**: One dense centre dominates and the members thin outward, so the eye starts at the core and follows the spread.
- **density**: Dense. The colony packs closely at the centre and remains substantial toward its edge at browse size.
- **negativeSpace**: The clear space beyond the colony's reach is where it has not yet grown, and it must remain open on all sides.
- **paletteIntent**: Damp and mineral: verdigris and bone over deep ink, low contrast, so the forms read as biological rather than bright.
- **rhythm**: Radial repetition with local irregularity, members budding at varied interval so the packing reads as grown not placed.
- **variationStrategy**: Tokens differ first in how far the colony has spread, then in how densely it packs, then in its palette rotation.
- **marketTransformation**: Recovery pushes the colony outward and multiplies its members; stress pulls it back toward the centre and reduces it.
- **identityAnchors**: The centred radial cluster, the deep ink ground and the verdigris and bone pairing hold across every seed and state.
- **thumbnailIntent**: At 120px the round clustered silhouette and its density gradient survive; individual members do not resolve.

## What to return

JSON, matching this shape exactly:

```json
{
  "whatWorks": [
    "at least one substantive thing that is working and must not be broken"
  ],
  "findings": [
    {
      "id": "short-stable-id",
      "whatFails": "the specific thing that is wrong, in the picture",
      "why": "why it is wrong -- against the brief, the direction, or the medium",
      "specificChange": "what to actually do, naming a direction or a destination",
      "keep": "what must survive this fix"
    }
  ],
  "overall": "one paragraph"
}
```

Rules that are enforced and will be rejected if broken:
- `whatWorks` may not be empty. An author told only what is wrong will rewrite rather than fix.
- every finding needs all five fields.
- `specificChange` must name a direction or a destination. "Improve the composition" is refused.
- `keep` is not optional. Five of seven runs in the prior corpus fixed one axis and broke another.