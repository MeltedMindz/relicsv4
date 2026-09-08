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

# Brief — BARROW

Monumental and heavy. A single massive form that commands the frame and reads as immovable — brutalist, solemn, and considerably larger than the frame comfortably holds. The weight is the subject.

The mass should be built from a few large members rather than many small ones, so that at browse size it reads as one silhouette. Charcoal and iron with a single ochre seam, over near-black.

Under drawdown the mass should fracture — members separating, the silhouette breaking — and consolidate again in recovery. It must remain recognisably the same object in all three states; this is one monument under different conditions, not three different monuments.

## The art direction this work is being held to

- **medium**: Vector composition — independent fields of primitives placed about the canvas centre, which commits this to a small number of large members that can read either as one merged silhouette or as several standing pieces.
- **motifTranslation**: A barrow restated as a few large blunt masses set about the middle of the frame, overlapping until they merge into a single heavy silhouette, with one narrow ochre member laid across them as a seam; the weight is carried by the size of the masses rather than by any accumulation of detail.
- **composition**: The mass reaches the edges of the frame on every side and reads as larger than the frame comfortably holds, cropped by the border rather than contained by it, with barely any clear ground around it in the consolidated state.
- **focalHierarchy**: The single merged silhouette dominates absolutely; the ochre seam is the one secondary event and gives the mass a reading; there is no fine texture beneath them, because texture would make the monument look built rather than quarried.
- **density**: Heavy — most of the frame carries ink in the consolidated state, built from a few large members rather than many small ones, so that at browse size the coverage reads as one solid object.
- **negativeSpace**: In the consolidated state the ground is a thin dark surround; as the mass comes apart the dark enters between the members and becomes the fault lines through the monument, so the emptiness is structural rather than decorative.
- **paletteIntent**: Charcoal and iron build the mass over a near-black ground with a single ochre seam laid across it; three colours in all, the ground flat and only barely distinguishable from the charcoal so the silhouette stays dominant.
- **rhythm**: Very little repetition — a few large members at uneven intervals, deliberately unmetrical so the monument reads as one quarried thing rather than as an assembly; it is a mass seen head on, with no ring, no rosette and no turning about a hub.
- **variationStrategy**: Two tokens differ first in the silhouette the merged masses make, then in where the ochre seam crosses that silhouette, and last in the relative sizes of the members underneath it.
- **marketTransformation**: Under drawdown the mass fractures and its silhouette breaks, so the monument stands in several pieces there. In recovery those pieces consolidate again and the mass reads once more as one continuous silhouette. The magnitude the market moves is how many pieces the monument stands in, and under drawdown it is at its most broken.
- **identityAnchors**: Every seed and every state keeps the same few large members, the same charcoal-and-iron-over-near-black with one ochre seam, the same frame-filling weight and the same blunt coarse mass; it must read as one monument under three conditions.
- **thumbnailIntent**: At 120px the work reads as one heavy dark shape crossed by a single ochre seam, filling most of the frame, and what a viewer can judge at that size is whether that shape is one thing or several.

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