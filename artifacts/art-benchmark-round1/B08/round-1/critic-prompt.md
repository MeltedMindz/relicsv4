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

# Brief — ESCAPEMENT

A mechanism, abstracted. Nested rings and radial members, precise and instrument-like, with the regularity of something machined rather than grown. Think of the geometry of an escapement without any of its literal parts — no gear teeth, no hands, no numerals, no dial markings. Only the rotational logic.

Brass and slate over a dark ground, with the drawing carried in fine line so the whole reads as engineering rather than as mass.

Under volatility the mechanism should loosen — its members spreading apart and the rings separating — and tighten again as conditions settle. Tokens differ in the order of rotational symmetry and in how many rings they carry.

## The art direction this work is being held to

- **medium**: Geometric recursion: one centred self-similar figure replicated by a symmetry order over a flat ground.
- **motifTranslation**: The escapement becomes nested concentric rings of radial members, each ring a turned repetition of the last, so rotational logic is expressed without any literal mechanism part.
- **composition**: A centred concentric figure held clear of the frame edge, the rings reading as one assembly rather than as separate circles.
- **focalHierarchy**: The outer ring dominates and the inner rings descend in scale as secondary structure, with the centre reading as a stop.
- **density**: Moderate. Enough members that the assembly reads as engineered, few enough that individual radial members stay legible.
- **negativeSpace**: The margin outside the outer ring isolates the mechanism so its rotational order is legible against nothing.
- **paletteIntent**: Brass and slate over a dark ground, drawing carried in fine line so the whole reads as engineering rather than as mass.
- **rhythm**: Regular rotational repetition at a fixed angular interval, each ring turned from the one inside it by a steady step.
- **variationStrategy**: Tokens differ first in rotational symmetry order, then in how many rings they carry, then in the member silhouette.
- **marketTransformation**: Under volatility the rings separate and the members spread apart; as conditions settle the assembly tightens again.
- **identityAnchors**: The centred concentric construction, the dark ground and the brass and slate pairing hold across every seed and state.
- **thumbnailIntent**: At 120px the concentric ring silhouette and its rotational order survive; individual members do not resolve.

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