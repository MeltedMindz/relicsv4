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

- **medium**: Vector composition — independent fields of primitives placed about the canvas centre, which commits this to generations of rounded marks accumulating outward from one shared middle.
- **motifTranslation**: A colony restated as several registers of rounded marks gathered about a shared centre, each register set further out and slightly finer than the one inside it, overlapping where they meet so the reading is accretion rather than a designed arrangement.
- **composition**: The colony builds from the middle out until its outermost generation meets the edges of the frame, so the border crops a spreading growth rather than containing a small object floating in dead space.
- **focalHierarchy**: The packed inner group dominates as the origin of the accretion; the middle generations are secondary and carry most of the body; the loosest outer marks are texture and read as the growing edge.
- **density**: Full but short of saturation — a little over half the frame carries ink in the packed state, heaviest at the middle and easing toward the growing edge, so the mass reads as biological rather than as a filled shape.
- **negativeSpace**: The deep ink shows between the rounded members and around the growing edge, and that dark is what keeps the members reading as individual cells; it is interstitial space doing structural work rather than a margin.
- **paletteIntent**: Verdigris and bone carry the members over deep ink, two working colours kept damp and mineral rather than bright, with the ground flat and dark enough to sit behind every generation.
- **rhythm**: Recurrence by generation — the same rounded mark repeats at a finer scale in each successive register, regular in its logic and irregular in its placement, so the repetition reads as budding rather than as a pattern turned about a hub.
- **variationStrategy**: Two tokens differ first in how far the colony has spread from its middle, then in how densely its members are packed, and last in how many generations the accretion has reached.
- **marketTransformation**: In recovery the colony multiplies and more cells are present in every generation, so the number of members is at its highest there. Under stress the colony reduces and fewer of its cells remain. The magnitude the market moves is how many cells the colony carries, and in recovery more of them return.
- **identityAnchors**: Every seed and every state keeps the rounded mark, the verdigris-and-bone-over-deep-ink relationship, the accretion outward from one shared middle, and the damp mineral cast of the whole.
- **thumbnailIntent**: At 120px the work reads as a rounded verdigris colony budding outward from a packed middle over deep ink, and the change a viewer can judge at that size is how populous the colony looks.

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