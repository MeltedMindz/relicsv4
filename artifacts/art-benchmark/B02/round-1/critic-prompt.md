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

# Brief — FROND

A botanical abstraction: the suggestion of a frond unfurling, never a literal leaf. What is wanted is the logic of growth — a stem that divides, and divides again, each division smaller and turned slightly from the last. Fine linework throughout, delicate rather than heavy, with generous emptiness around the form.

The palette is quiet: moss and bone over a dark ground, with the drawing carried in line rather than in mass.

Growth is the subject, so recovery should extend the branching and multiply its divisions, while stress retracts the form back toward a bare armature. Tokens should differ in how far the growth has gone.

## The art direction this work is being held to

- **medium**: Vector composition — independent fields of primitives placed about the canvas centre, which commits this to registers of small repeated marks standing in for a growth rather than to a single continuously drawn stem.
- **motifTranslation**: The logic of a frond restated as several registers of small elongated marks radiating from a common middle, each register set at a finer scale and a slightly turned angle from the one before it, so the drawing reads as repeated division rather than as a depicted leaf.
- **composition**: The figure is centred and its longest divisions reach close to the frame's edges, while the ground stays open along the shorter axes, so the generous emptiness the brief asks for sits around the form without shrinking it into a small island at the middle.
- **focalHierarchy**: The primary stem register dominates; the first order of divisions is secondary and sets the reading of the growth; the finest marks are texture and are meant to be felt as fineness rather than counted one by one.
- **density**: Sparse and open at browse size — well under a third of the frame carries ink, the drawing kept delicate and line-weight throughout, so the emptiness reads as a deliberate choice rather than as an unfinished picture.
- **negativeSpace**: The dark surrounds the form generously on all sides and holds one order of division apart from the next, so the emptiness measures how far the growth has run and is doing the work of describing the growth's extent.
- **paletteIntent**: Moss and bone carry the drawing over a dark ground, two working colours only, with the ground held as an unmodulated flat dark so that the line rather than any mass stays the loudest thing in the frame.
- **rhythm**: Repetition by division — each order repeats the one before it at a finer scale and a turned angle, regular in its logic and irregular in its result, and it is read outward along a stem rather than around a hub, so it settles into a branching figure and never into a ring.
- **variationStrategy**: Two tokens differ first in how far the branching has run and how many orders of division they carry, then in the reach of the longest members, and last in the turn between one order and the next.
- **marketTransformation**: In recovery the divisions multiply and more members are drawn along every stem, so the form carries its fullest branching there. Under stress the drawing retracts toward a bare armature and fewer of its divisions remain. The magnitude the market moves is how many divisions are present, and in recovery more of them return.
- **identityAnchors**: Every seed and every state keeps the same fine line weight, the same moss-and-bone-over-dark relationship, the same dividing logic issuing from a single stem, and the same generous dark held around the form.
- **thumbnailIntent**: At 120px the work reads as one fine thread-weight figure dividing outward from a single stem, its orders stepping down in scale, with the dark carrying most of the frame so that fineness itself is the impression that lasts.

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