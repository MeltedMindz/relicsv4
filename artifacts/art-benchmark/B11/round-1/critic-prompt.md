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

- **medium**: Vector composition — independent fields of primitives placed about the canvas centre, which commits this to several registers of a few large members that can be carried from one merged mass into scattered standing pieces.
- **motifTranslation**: The market itself restated as one figure of a few large members about the middle of the frame, merged into a single mass in the settled condition and standing as scattered pieces in the hard one, with a cool register and a warm register that trade which of them is carrying the frame.
- **composition**: The work reaches the edges of the frame in every state, spread across the whole frame rather than held at the middle, so that a change in how many pieces it stands in registers at the border as well as at the centre.
- **focalHierarchy**: One large member dominates in every state and is what a viewer identifies the token by; the members around it are secondary and carry the transformation; the finest marks are texture and are the first thing to go at browse size.
- **density**: Ranges deliberately and widely — thin and open in the hard condition, closed and heavy in the settled one; at browse size the difference in coverage between the two must be unmistakable rather than a subtle shift.
- **negativeSpace**: The dark enters between the members as the work comes apart and is squeezed back out as it closes, so the emptiness here is the visible measure of the transformation rather than a fixed margin held around a figure.
- **paletteIntent**: Slate and iron carry one register and ochre and copper carry another, both present in every state over one common dark ground; the temperature shift is delivered by which of the two registers is carrying the frame, since a colour here is fixed when the work is authored and only its extent can move.
- **rhythm**: Loose and unmetrical — a few large members at uneven intervals with no fixed beat, so the eye reads a condition rather than a pattern; the arrangement runs across the frame and is never a ring or a rosette.
- **variationStrategy**: Two tokens differ first in the silhouette the merged members make in the settled condition, then in how many members build it, and last in the balance of cool against warm; whatever those differences are, they persist through all three conditions.
- **marketTransformation**: Under stress the work breaks apart and its members stand as scattered pieces, so the silhouette is at its most broken there. In recovery those same members knit back into one whole figure and the composition reads as a single continuous mass. The magnitude the market moves is how many pieces the work stands in, and under stress it is at its most broken.
- **identityAnchors**: Every condition keeps the same members, the same member shapes and the same arrangement about the middle, so one token is recognisable as itself in all three; only the distance between members and the balance of the two registers is permitted to move.
- **thumbnailIntent**: At 120px the hard frame and the settled frame must look like two weathers over one terrain, sharing a silhouette family while plainly parting on coverage and temperature, and that reading has to arrive instantly rather than on inspection.

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