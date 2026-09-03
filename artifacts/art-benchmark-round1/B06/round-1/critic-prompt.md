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

# Brief — THICKET

Dense to the point of near-saturation. A crowded, teeming, intricate field that fills the frame with incident and rewards a long look. There should be no rest anywhere in the composition — the eye finds structure at every scale, and the overall impression is of profusion rather than of arrangement.

Warm and dark: rust, copper and umber piled over a near-black ground, with values close enough that the density reads as mass rather than as pattern.

Under stress the thicket should thin dramatically and open up, and in recovery it should close again — the difference between the two states must be obvious at browse size, not a subtle shift. Tokens differ in density and structure.

## The art direction this work is being held to

- **medium**: Vector composition: several dense fields of filled primitives distributed about the canvas centre.
- **motifTranslation**: The thicket becomes overlapping fields of small members at several scales, so profusion is expressed as accumulated incident rather than as depicted growth.
- **composition**: The fields spread wide and reach toward the edges, filling the frame so there is no rest and no isolated object anywhere.
- **focalHierarchy**: Layered rather than singular: a dense primary field with two secondary fields threading through it at different scales.
- **density**: Dense to near saturation. Crowded, teeming and intricate, with structure at every scale and no empty quarter.
- **negativeSpace**: There is almost no negative space by intent; what little exists is the incidental gap between members, never a margin.
- **paletteIntent**: Warm and dark: rust, copper and umber piled over a near black ground, values close so density reads as mass.
- **rhythm**: Irregular repetition, the interval broken and varied so the field reads as profusion rather than as pattern.
- **variationStrategy**: Tokens differ first in density, then in the distribution of the secondary fields, then in palette rotation.
- **marketTransformation**: Under stress the thicket thins dramatically and opens; in recovery it closes again, and the difference is obvious at browse size.
- **identityAnchors**: The warm dark palette, the near black ground and the multi scale overlapping construction hold across every seed and state.
- **thumbnailIntent**: At 120px the overall mass and its dense grain survive; individual members do not resolve and are not meant to.

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