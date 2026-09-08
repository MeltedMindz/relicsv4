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

# Brief — BEDDING

Sediment as pure pattern. Horizontal banding at varying pitch, one bed deposited over another, dense and stacked, filling the frame edge to edge with no single element dominating. This is a core sample, not a landscape: there is no sky, no horizon and no ground plane, only the section itself.

Earth palette — umber, ochre, sand and a cold slate band — over a dark base. Bands should differ in thickness and in weight so the eye reads a sequence rather than a texture.

Under drawdown the beds should thin and fewer of them survive; in recovery the sequence thickens and more beds return. Tokens differ in how many beds they carry and how evenly they are spaced.

## The art direction this work is being held to

- **medium**: Vector composition — independent fields of primitives placed about the canvas centre, which commits this to stacked registers of repeated marks read as a sequence rather than to any single continuously drawn stratum.
- **motifTranslation**: Sediment restated as horizontal banding at varying pitch — several registers of wide flat marks laid one over another across the full width of the frame, differing in thickness and in weight so the eye reads a deposited sequence rather than an even texture.
- **composition**: The section fills the frame edge to edge, the bands running the full width and stacking from the top border to the bottom, with no sky, no horizon and no ground plane; the frame is a window cut through the section itself.
- **focalHierarchy**: Nothing dominates, and that is deliberate — this is a section rather than a scene, so the reading is of the whole sequence; the thickest cold slate band is the only local emphasis, and the finer bands are texture beneath it.
- **density**: Dense and stacked — the great majority of the frame carries ink, with the dark base showing only as the thin partings between beds, so the impression is of material rather than of drawing set on emptiness.
- **negativeSpace**: The dark base survives only as the partings between one bed and the next, and those partings are exactly what make the sequence legible as distinct beds rather than as one continuous field of colour.
- **paletteIntent**: Umber, ochre and sand carry the sequence with one cold slate band set among them, over a dark base; four working colours in all, the base visible only at the partings and held flat rather than graded.
- **rhythm**: Stacked and metrical without being even — beds recur down the frame at varying pitch, the interval between them changing from one part of the sequence to another, and the regularity breaks wherever a thick bed interrupts a run of thin ones; this is a stack read top to bottom and never a ring.
- **variationStrategy**: Two tokens differ first in how many beds the section carries, then in how evenly those beds are spaced down the frame, and last in which of the earth colours lands on the thickest bed.
- **marketTransformation**: Under drawdown the beds thin and fewer of them remain; in recovery the sequence thickens and more beds return, so the fullest section is the recovered one. The magnitude the market moves is how many beds the section carries, and recovery is where more beds return.
- **identityAnchors**: Every seed and every state keeps the horizontal stacking, the earth-over-dark relationship with one cold band among the warm ones, the full-width bedding, and the flat refusal of any horizon or sky.
- **thumbnailIntent**: At 120px the work reads as a stack of horizontal bands of differing thickness filling the whole frame, warm earths interrupted by one cold band, and the sequence is legible as a sequence before any single bed can be told apart.

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