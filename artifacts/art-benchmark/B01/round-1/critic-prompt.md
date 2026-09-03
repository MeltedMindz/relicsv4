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

# Brief — ARCADE

An architecture of repeated bays, seen head on and flattened into pure structure. The subject is the rhythm of supports: a colonnade abstracted until only interval and weight remain, with no depth cue and no perspective. Each bay is the same member at a different scale, nested inward toward the centre of the frame.

The work should feel engineered rather than drawn — regular, load-bearing, and slightly severe. Restrained palette: iron and ash over a near-black ground, with one warm accent marking the innermost bay.

Under drawdown the structure should lose members and the interval widen, as though bays were being removed from the run. In recovery the colonnade fills back in and the nesting deepens.

## The art direction this work is being held to

- **medium**: Vector composition — independent fields of primitives placed about the canvas centre, which commits the work to registers of repeated members read as a population rather than to any single continuously drawn object.
- **motifTranslation**: A colonnade restated as concentric rectangular outlines stepping inward from the frame toward the middle, each register the same upright-and-lintel unit at a finer scale than the one outside it, so that interval and weight are the only things carrying the architecture and no depth cue is drawn anywhere.
- **composition**: The structure reaches out to the edges of the frame on every side, the outermost bay meeting the border squarely, with the nesting running inward to a single warm member at the middle; the work occupies the whole frame and never sits as a small island in dead space.
- **focalHierarchy**: The warm innermost bay dominates as the single point of arrival; the iron uprights are secondary and read as the load-bearing run; the ash-toned lintels and the thinnest inner marks are texture and must never compete with the run of supports.
- **density**: About half the frame carries ink at browse size — heavy enough that the structure reads as engineered and load-bearing, and short of the crowding that would turn an ordered run of bays into an undifferentiated mass.
- **negativeSpace**: The near-black ground survives as the interval between one bay and the next, so the emptiness is the span of the arcade and is doing structural work; it is measured space held between members rather than leftover margin around a floating figure.
- **paletteIntent**: Iron and ash carry the drawing over a near-black ground, two working values plus one warm accent reserved for the innermost bay alone; the ground is a single flat dark, unmodulated, so that weight is read against it and never against a graded wash.
- **rhythm**: Regular and metrical — the same upright member repeated at an even interval across each register, the pitch of that repetition changing only as the bays step inward; this is a straight run of supports seen head on and flattened, and it is read across the frame rather than turned about a hub.
- **variationStrategy**: Two tokens differ first in how many bays the run carries and how deep the nesting steps inward, then in the interval between one support and the next, and last in the relative weight of the members, which a viewer notices only after the arcade's overall extent.
- **marketTransformation**: Under drawdown bays are removed from the run and fewer members survive, and the interval between the supports that remain widens. In recovery the colonnade fills back in, more bays return, and the nesting steps deeper toward the middle. The magnitude the market moves is how many bays are standing, and it is in recovery that more of them return.
- **identityAnchors**: Every seed and every state keeps the same head-on nesting of rectangular bays about a common middle, the same iron-and-ash-over-near-black relationship, the same upright-and-lintel unit, and the same single warm mark at the innermost bay.
- **thumbnailIntent**: At 120px the work reads as a nested run of rectangular outlines stepping inward to one warm mark, the uprights heavy enough to hold their spacing, so a viewer sees engineered repetition well before any fine member becomes legible.

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