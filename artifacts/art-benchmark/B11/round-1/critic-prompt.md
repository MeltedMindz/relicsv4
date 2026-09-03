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

# Brief — REGIME

The market is the subject. This work should be almost unrecognisable between conditions: what a viewer sees under drawdown and what they see in recovery should read as two different weathers over the same terrain. The transformation is the point, and it must be unmistakable at 120 pixels.

Under stress the work should be sparse, broken and cold; in recovery it should be dense, whole and warm. Neutral sits visibly between them. Slate and iron at one end, ochre and copper at the other.

What must NOT change is identity: the same token must remain the same token across all three states. A work that becomes a different object under drawdown has been replaced, not transformed.

## The art direction this work is being held to

- **medium**: Geometric recursion: one centred self-similar figure whose structure is driven hard by the market reading.
- **motifTranslation**: There is no motif beyond condition itself. The work is a centred structure whose extent and completeness are the entire subject.
- **composition**: A centred structure whose reach changes markedly between states, held within the frame at its widest so nothing is lost at the edge.
- **focalHierarchy**: One dominant central structure throughout, so that identity survives even when its extent and density change sharply.
- **density**: Moderate at neutral, deliberately so, leaving room to read as both sparse under stress and dense in recovery.
- **negativeSpace**: The empty frame around the structure is what makes its expansion and contraction legible between the three states.
- **paletteIntent**: Slate and iron with copper held in reserve, over a dark ground, so warmth reads as recovery without the palette itself moving.
- **rhythm**: Regular repetition whose interval widens and narrows with condition, the measure staying recognisable throughout.
- **variationStrategy**: Tokens differ first in silhouette, then in symmetry order, then in how far the structure reaches at neutral.
- **marketTransformation**: This is the subject: sparse and broken under stress, dense and whole in recovery, with neutral visibly between them.
- **identityAnchors**: The same token must stay the same token in all three states: centred construction, ground and palette never change.
- **thumbnailIntent**: At 120px the difference between the three states must be unmistakable as silhouette and density, not as fine detail.

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