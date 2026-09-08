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

# Brief — RELIQUARY

A still, contemplative object that barely acknowledges the market at all. The work should feel settled and permanent — something that has already finished happening. Quiet, centred, and unhurried.

A container form: concentric enclosure, one boundary inside another, with a small dense centre held at the middle. Gold and umber over deep ink, sparing, with most of the frame given to the dark.

The market may register, but only faintly — a slight tightening or loosening of the enclosure, nothing that a casual viewer would notice at thumbnail size. Do not manufacture drama. What varies between tokens is the number of enclosures and the character of the centre they hold.

## The art direction this work is being held to

- **medium**: Geometric recursion — one centred self-similar figure built by repeating a production on itself, which commits this to a single nested figure whose enclosures are the same production repeated inward.
- **motifTranslation**: A reliquary restated as one centred figure of concentric enclosures, each boundary the same regular outline set inside the last at a finer scale, with the innermost orders drawn closely enough to read as a small solid heart held at the middle.
- **composition**: One figure at the centre, held clear of every edge with most of the frame given over to the dark; the enclosures occupy the middle portion of the frame and the deep ink around them is the larger part of the picture.
- **focalHierarchy**: The small close-drawn centre dominates as the thing the enclosures exist to hold; the boundaries around it are secondary and are read as containment; the finest inner marks are texture and are the last thing a viewer resolves.
- **density**: Sparing — a small part of the frame carries ink and the greater part is given to deep ink, and that restraint is what makes the object read as settled and already finished.
- **negativeSpace**: The deep ink around and between the enclosures is the greater part of the work and gives the object its stillness; the dark held between one boundary and the next is what makes each enclosure read as its own containment.
- **paletteIntent**: Gold and umber carry the enclosures over deep ink, two working colours used sparingly, with the ground flat and dark and occupying most of the frame so that the gold reads as precious rather than as bright.
- **rhythm**: Concentric and even — the same outline recurs inward at a steady step, its regularity holding all the way to the middle; the brief asks for a concentric enclosure outright, so the ring reading is intended here rather than accidental.
- **variationStrategy**: Two tokens differ first in how many enclosures they carry, then in the character of the centre those enclosures hold, and last in the step between one boundary and the next.
- **marketTransformation**: The market registers only faintly here. Between one condition and the next the enclosure holds a shade tighter or a shade looser about its middle, a difference of a hair in where each boundary sits, and it is deliberately too small for a casual viewer to notice at thumbnail size. No member is added, taken away, or put in a new place.
- **identityAnchors**: Every seed and every condition keeps the concentric enclosure about one centre, the small close-drawn heart at the middle, the gold-and-umber-over-deep-ink relationship, and the large quiet dark that surrounds all of it.
- **thumbnailIntent**: At 120px the work reads as a small bright centre held inside a few concentric dark boundaries, still and finished, and it should read almost identically whatever the market happens to be doing.

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