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

# Brief — STELE

One form, centred, and almost nothing else. Minimal and austere, with the emptiness around the mass doing as much work as the mass itself. The frame should feel mostly empty and deliberately so, the single form held well clear of every edge.

A quiet, spare palette: two values and a ground, no more. Nothing decorative, nothing incidental, no texture that is not structural.

The market should change the form's scale rather than its complexity — it contracts under drawdown and expands again in recovery — so that the work reads as one object breathing rather than as a composition rearranging itself. Tokens differ chiefly in the silhouette of the single form.

## The art direction this work is being held to

- **medium**: Geometric recursion — one centred self-similar figure built by repeating a production on itself, which commits this to a single connected mass rather than to an arrangement of independent parts.
- **motifTranslation**: A stele restated as one upright self-similar figure standing at the middle of the frame, its repeated production reading as the internal articulation of a single stone rather than as separate elements, so that mass and outline are the whole of the work.
- **composition**: One form at the centre, held well clear of every edge with a generous margin of empty ground on all four sides; the brief asks for that emptiness outright, and the surround is as much of the composition as the mass it holds.
- **focalHierarchy**: The single mass dominates completely and there is no secondary element at all; the internal articulation of the figure is texture and exists only to keep the mass from reading as a flat cut-out shape.
- **density**: Spare and austere — a small fraction of the frame carries ink, and the restraint is the subject; anything beyond the one form and its ground would be the decoration the brief refuses.
- **negativeSpace**: The empty dark surrounding the form on all sides is doing as much work as the mass, holding it apart from the frame and giving the object the stillness of something set down alone in a very large room.
- **paletteIntent**: Two values and a ground and no more — one for the mass, one for its articulation, over a flat dark; the ground stays unmodulated so that the silhouette is the only event anywhere in the frame.
- **rhythm**: Almost no rhythm at all, deliberately — the figure's self-similar repetition is the only recurrence, felt as internal structure at a steadily finer scale rather than as a pattern, and it is read as a vertical standing thing rather than as anything turned about a hub.
- **variationStrategy**: Two tokens differ first and most visibly in the silhouette of the single form, then in the internal articulation that silhouette encloses, and last in the small step of proportion between one level of the figure and the next.
- **marketTransformation**: Under drawdown the whole figure contracts and its reach shrinks. In recovery it expands again and the single form takes back its full reach. The magnitude the market moves is the overall size of the one form, and in recovery it grows to its largest.
- **identityAnchors**: Every seed and every state keeps one centred form on a large empty dark ground, the same two values, the same self-similar internal logic, and the same austerity of everything surrounding the mass.
- **thumbnailIntent**: At 120px the work reads as one compact centred silhouette on a mostly empty dark field, legible as a single mass rather than as parts, and the only thing that moves between states is how much of the frame that mass takes up.

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