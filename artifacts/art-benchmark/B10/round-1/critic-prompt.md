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

# Brief — FILIGREE

Delicate, fine and fragile. Hairline linework arranged in a radial figure, light enough that the work feels provisional — as though it could be disturbed. Nothing heavy, nothing solid, no filled mass anywhere.

Pale and cool: bone and pale slate over a dark ground, the contrast kept low so the lines read as thread rather than as structure.

The market should act by expanding and contracting the figure's reach: it opens out in recovery and draws in under stress. Because the work is so light, the change must be carried by the geometry rather than by weight. Tokens differ in the symmetry of the figure and in how far its threads extend.

## The art direction this work is being held to

- **medium**: Geometric recursion — one centred self-similar figure built by repeating a production on itself, which commits this to a single connected thread figure rather than to independent scattered marks.
- **motifTranslation**: Filigree restated as one radial self-similar figure whose production hangs finer and finer members off each preceding one, drawn entirely at hairline weight so the figure reads as thread laid about a middle rather than as any filled or solid form.
- **composition**: The figure is centred and its outermost threads reach close to the frame's edges, so the work fills the frame with its span while staying open enough that the dark reads through it everywhere.
- **focalHierarchy**: Nothing dominates by mass, deliberately, since nothing here is solid at all; the innermost orders of the figure are the closest woven and act as a centre of gravity, and every outer order is progressively lighter texture.
- **density**: Very light — a small fraction of the frame carries ink, all of it hairline, so the work looks provisional and as though a breath could disturb it.
- **negativeSpace**: The dark reads through the whole figure as well as around it, so the emptiness is inside the work rather than only outside it, and it is what keeps the threads reading as threads instead of as a woven screen.
- **paletteIntent**: Bone and pale slate carry the threads over a dark ground, two cool working colours with the contrast kept low so the lines read as thread rather than as structure; the ground is flat and holds them.
- **rhythm**: Radial and regular — the same fine member recurs about the middle at an even angular interval and again at each finer order; the brief asks for a radial figure outright, so the rotational reading is the intended one here.
- **variationStrategy**: Two tokens differ first in the rotational symmetry of the figure about its middle, then in how far its threads extend from that middle, and last in how many orders of finer members it carries.
- **marketTransformation**: In recovery the whole figure expands and its threads reach further from the middle, so its span is greatest there. Under stress the same figure shrinks and its threads sit closer to the centre. The magnitude the market moves is the overall span of the one figure, and in recovery it grows to its widest.
- **identityAnchors**: Every seed and every state keeps the hairline weight, the radial construction about one centre, the bone-and-pale-slate-over-dark relationship, and the low contrast that makes the work read as fragile.
- **thumbnailIntent**: At 120px the work reads as a pale radial thread figure on a dark ground, its outline legible while its individual threads are not, and the change a viewer can judge at that size is how far the figure spans.

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