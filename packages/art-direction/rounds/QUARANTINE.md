# Quarantined holdout material

This directory holds material that names **final holdout seeds** and therefore may not appear in
author-visible source. It is not deleted, and it must not be: the reasoning it records is real,
it decided a real parameter change, and a repository that hides the evidence for its own fixes is
worse off than one that quarantines it.

The author-visible surface is defined in `packages/art-direction/src/holdout.js`
(`AUTHOR_VISIBLE_ROOTS`). This directory is deliberately outside it, alongside `artifacts/**`,
because both are **reviewer records** rather than the author's working source.

---

## Q-1 — the round-one holdout critique that reached `author.js`

**What happened.** On 2026-09-03, commit `e67f7369` ("The mechanism now reaches the bytes, and
PALETTE_SHIFT was painting fields in the ground colour") landed a fix to
`packages/art-direction/src/author.js` and, beside it, a comment quoting a **round-one final
holdout reviewer verbatim**, naming a holdout seed and describing what that token rendered as.

Round two's final verdicts were taken at `2026-09-03T12:59:28-07:00`, after that commit. So round
two's author ran with part of round one's holdout unblinded in its own source, and round one and
round two used the same holdout set byte for byte.

**Where the quotation came from.** `artifacts/art-benchmark-round1/B07/final-review/verdict.json`,
reviewer `final-B07`, verdict `REFUSE`, axis `seedVariation`. The full axis, preserved:

> MIXED, with degenerate members at both ends. Judged on the 120px sheet: the twelve are not one
> work twelve times — 9011, 10622, 10980, 10264, 10443 and 9906 are genuinely different objects
> (layered wreath, cream disc with dark core, tile-ring, broken ring). But the spread runs off the
> end of the scale in the wrong way. 9190 renders NOTHING — a blank panel at 256, at 120, and in
> all three market conditions. 9369 and 10801 are flat unmodulated green blobs that are close to
> interchangeable at browse size, and 9369 was the seed chosen for the 512px hero, where it is a
> plain sage polygon with a ragged edge and zero interior. An empty token and a featureless blob
> are not 'a colony that has not spread far'; they are members with no work in them, and this
> commitment is permanent.

**The sentence that was in `author.js`**, quoted here so the redaction in that file can be checked
against what it replaced:

> "9190 renders NOTHING — a blank panel at 256, at 120, and in all three market conditions"

**What it motivated, which stands on its own evidence.** `PALETTE_SHIFT` rotates which palette stop
a field takes, per token and per field, and the rotation **includes the ground index** — so on a
four-stop palette roughly one token per field comes back with a figure painted in the ground
colour, ink 0.000 in all three market states. That finding is reproducible from an on-chain render
(seed 508194 in the note in `author.js`, which is not a holdout seed), from the objective battery's
own blank-token check, and from the round-one contact sheets. It never needed the holdout
quotation, and `author.js` now cites the reproducible half only.

**What it does NOT do.** Removing the sentence from `author.js` does not un-leak it. Round two was
already authored against it. `packages/art-direction/rounds/registry.json` records the round as
`COMPROMISED` permanently, and `verifyArtAcceptance` refuses a receipt judged under it.
