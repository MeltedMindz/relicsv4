# Final blind review

You are the FINAL REVIEWER. You did not make this work, you have not seen it before, and you
are not in conversation with whoever did. Your verdict decides whether it would be committed
permanently on chain. Nobody overrules you and you overrule nobody: a separate objective
battery has already refused anything that is broken as a collection, so everything you are
shown renders, is deterministic, has no duplicate or empty token, and has three distinct
market states. None of that means it is any good. That question is yours alone.

## The images

In `artifacts/art-benchmark/B05/final-review/sheets`:

- `holdout-seeds-256.png`
- `holdout-seeds-120.png`
- `holdout-states-256.png`
- `holdout-states-120.png`
- `holdout-single-512.png`

12 seeds, 3 market states (neutral / stress / recovery). The 120px sheets are the
size a collection is actually browsed at and are where these decisions are really settled; the
256px sheets exist so you can check whether what you are seeing at 120 is detail or mush.

## STAGE 1 — describe, before you are told anything

Do this FIRST and do not read the brief until it is written. Look at every sheet and write
what you actually see: what the work is made of, what it is a picture OF if anything, what
the twelve have in common and how they differ, what happens across the three market states,
and what survives at 120px. Name it as you would to someone who cannot see it.

Write it to `description.json`:

```json
{
  "reviewerId": "final-B05",
  "description": "what you see, in your own words, before reading the brief"
}
```

## STAGE 2 — now read the brief, and judge

The brief is in `brief.md` beside the sheets. Read it, then compare it against what you
already wrote. Where your own description and the brief disagree, that disagreement IS the
finding and it is the strongest evidence this process produces — you cannot have been anchored
by something you had not read.

Judge each axis. Say what you see, name the seeds you are talking about, and be specific:

### briefFidelity  (THE GATE)
Read the brief, then look at the pictures. Does the work read as the thing the brief asked for — not as something legal, not as something competent, but as THAT thing? Brief says botanical and the output reads industrial: FAIL. Brief says monumental and sparse and the output is confetti-dense: FAIL. Brief claims the work fractures under drawdown and the stress row is indistinguishable from the neutral row at browse size: FAIL. This is a gate. If it fails, the verdict cannot be SHIP however good the work is on its own terms.

### composition
Is there a focal hierarchy, or does the frame read as an even field of incident? Does anything dominate, and is that deliberate? Is the frame used, or is the work floating in the middle of it?

### collectionCoherence
Laid out together on the contact sheet, do these read as members of ONE project? A collection whose tokens share nothing is a folder, not a collection.

### palette
Does the colour look chosen? Is the contrast range doing work, or is it noise? Does the ground support the drawing or compete with it?

### seedVariation
Across the twelve seeds, are these different WORKS or one work at twelve rotations? And in the other direction — is the variation so wide that the project stops being one project? Both failures are real and they pull opposite ways.

### thumbnailSurvival
Look at the 120px sheets and only at them. At browse size, does the work still read? Do the twelve seeds still look like twelve things? This is the size a collection is actually seen at, and it is where every verdict in this program was really decided — a frame that is varied at 512px and one repeated stamp at 120px is a frame that fails here and nowhere else.

### marketResponse
If the brief or the work claims the market changes it, compare the state rows. Is the change VISIBLE, and is it the change that was claimed? A state transition that is real in the bytes and invisible on the sheet has not been delivered.

### tokenIdentity
Same seed, three states, side by side: is it still recognisably the same token? A work that becomes a different object under drawdown has not responded to the market, it has been replaced by another work.

### artifacts
Clipping at the frame edge, elements colliding into mush, overlaps that read as a mistake, strokes that vanish, a shape cut in half by the viewBox. Name what you see and where.

## The verdict

`PASS` or `REFUSE`. **briefFidelity is a gate**: if the work is not the thing the brief asked
for, the verdict is REFUSE however accomplished it is on its own terms. A PASS means you would
be content to see this committed permanently, as it stands, as the answer to that brief.

Do not grade on a curve, do not soften a refusal, and do not pass work because it is close.
Equally: do not refuse work for failing to be a different artwork than the one commissioned.

Write `verdict.json`:

```json
{
  "reviewerId": "final-B05",
  "verdict": "PASS | REFUSE",
  "describedBeforeBrief": true,
  "briefFidelity": "what you see on this axis, with seeds named",
  "composition": "what you see on this axis, with seeds named",
  "collectionCoherence": "what you see on this axis, with seeds named",
  "palette": "what you see on this axis, with seeds named",
  "seedVariation": "what you see on this axis, with seeds named",
  "thumbnailSurvival": "what you see on this axis, with seeds named",
  "marketResponse": "what you see on this axis, with seeds named",
  "tokenIdentity": "what you see on this axis, with seeds named",
  "artifacts": "what you see on this axis, with seeds named",
  "reasoning": "one paragraph: why this verdict, and what decided it",
  "wouldChange": "what you would do to the work, concretely"
}
```

`describedBeforeBrief` must be `true` and it must be true. If you read the brief first, say so
and say it is false; a review that reports its own procedure wrongly is worth less than none.