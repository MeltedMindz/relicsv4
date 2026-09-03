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

# Brief — INTERVAL

No subject at all. This is a study in interval and division: a field of marks whose only content is the relationship between them. Nothing here depicts anything, and nothing should invite a viewer to name it.

The composition should be balanced without being symmetrical, with an even distribution and no single dominant element — an all-over field rather than a figure on a ground. Palette narrow and tonal, close values, so that the differences read as spacing rather than as colour.

The market should act on the density of the field: more marks under drawdown, fewer in recovery, or the reverse — but visibly, at browse size. Tokens differ in the count and placement of their marks.

## The art direction this work is being held to

- **medium**: Vector composition — independent fields of primitives placed about the canvas centre, which commits this to an even population of small repeated marks whose only content is the spacing between them.
- **motifTranslation**: No subject at all, restated as several registers of identical small marks distributed evenly across the frame at differing spacings, so that what a viewer reads is the relationship between one mark and its neighbours and nothing that can be given a name.
- **composition**: The marks reach the edges on all four sides and continue as though the frame were a window onto a larger field, balanced without being mirrored, with no privileged region and no arrival point anywhere in the frame.
- **focalHierarchy**: Nothing dominates, deliberately — this is an all-over field, and a dominant element would hand the eye a subject when the whole point is that there is none; every mark is of equal rank and the reading is of the population as a whole.
- **density**: Moderately dense and even at browse size — enough marks that the field reads as populated everywhere, with coverage held uniform across the frame so that differences read as spacing rather than as pooling.
- **negativeSpace**: The emptiness is distributed rather than pooled — it sits between every pair of marks in varying amounts and gathers into neither a margin nor a void, so the ground reads as the interval itself and carries the whole content of the work.
- **paletteIntent**: A narrow tonal range of close values over a dark ground, two or three near neighbours only, chosen so that colour difference stays quiet and spacing keeps the viewer's whole attention.
- **rhythm**: Even but unmetrical — the marks recur at close to a constant frequency across the frame while the exact spacing varies locally, so a viewer feels a pulse and can find no beat to count; the distribution runs across the frame rather than turning about a centre.
- **variationStrategy**: Two tokens differ first in how many marks populate the field, then in where those marks fall across the frame, and last in the tonal step between one register and another, which is the least noticeable of the three.
- **marketTransformation**: Under drawdown more marks enter the field and it becomes busier; in recovery fewer of them remain and the field thins out. The magnitude the market moves is how many marks the field carries, and under drawdown more of them are present.
- **identityAnchors**: Every seed and every state keeps the all-over even distribution, the narrow close-valued tonal range over a dark ground, the identical mark shape, and the refusal of any nameable subject.
- **thumbnailIntent**: At 120px the work reads as an even population of small marks across the whole frame with no figure and no arrival point, and what a viewer registers is simply how crowded the field is.

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