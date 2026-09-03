# Round two of the frozen twelve-brief benchmark

**`BLIND_PASS = 0/12`.** Twelve final blind reviewers, twelve refusals. The target was eight, and
this is a shortfall, not a result to be read around.

Round one was also 0/12, and the two zeros are not the same zero — the refusals moved from the
harness's failures to the work's — but the number is the number, and the target is the target.

## What is measurably better, and how it is known

| | round 1 | round 2 |
|---|---|---|
| `BLIND_PASS` | 0/12 | 0/12 |
| blank or vanishing tokens reaching a reviewer | 2 collections at ink 0.000 in all three states | 0 |
| objective battery run before a reviewer saw a frame | never | every phase, every case |
| distinct market mechanisms across the twelve | 1 | 5 |
| collections whose market response a reviewer called inverted | 6 of 12 (development round) | 3 of 12 |
| `HUMAN_ART_INTERVENTIONS` | not measured | 0, derived by re-running the author |
| `CRITIQUE_WITHOUT_AUTHOR_RESPONSE` | 0 of 61 findings | 0 of 96 findings |
| dispositions | — | 15 ACCEPT · 57 PARTIALLY_ACCEPT · 24 REJECT_WITH_REASON |
| briefs refused at admission as unsatisfiable | 0 | 1 (found by this round, see below) |

Four reviewers said in their own words that the numeric battery could not see what they were
refusing, which is the battery working exactly as its own header says it must:

> "the objective battery passes every floor, which is worth noting: none of these failures is
> visible to it" — B03's development critic

> "the metrics are measuring the scatter faithfully — a scatter of 25 squares diversifies and
> separates very well. Nothing in the battery asks whether the result is one mass, which is the
> brief's entire subject" — B09's

## The refusal taxonomy, round two

Twelve refusals. A case can appear in more than one row; the row that decided the verdict is
marked `GATE`.

| finding | briefs | count |
|---|---|---|
| **A centred figure in a dead black frame** where a field, a section or a frame-filling mass was asked | B01 GATE, B03 GATE, B04 GATE, B06 GATE, B09 GATE | 5 |
| **The member is the wrong kind of mark** — mass where line was asked, rectangles where rounded was asked, filled slabs where fine line was asked | B02 GATE, B07 GATE, B08 GATE, B10 GATE | 4 |
| **The market response is the wrong kind, the wrong sign, or the wrong size** | B01, B04, B07, B11 GATE, B12 GATE | 5 |
| **No repetition, no interval, no generational structure** where a run, a colonnade or an accretion was asked | B01, B02, B07, B08 | 4 |
| **A second form or decoration the brief closed off** | B05 GATE | 1 |
| **Translucent stacking makes tonal plates** where two flat values were asked | B04, B09, B10 | 3 |
| **Clipping reads as a crop bug rather than as bleed** | B05, B06, B07, B10 | 4 |

Round one's taxonomy, for comparison: 10/12 blank-or-vanishing, 9/12 market mechanism wrong, 9/12
seeds collapse into families, 7/12 centred island, 6/12 reads as rosette. Blank is gone, the
mechanism failure is halved, the seed-family failure is gone from the gate rows entirely, and the
rosette reading appears in none of the twelve. The centred-island failure is not gone. It is the
largest single row.

## THE NEXT MISSING CAPABILITY, IN ORDER

### 1. The corners are unreachable, and nothing in the pipeline could say so

Five of twelve refusals are a version of one sentence. Their reviewers wrote it blind, before
reading a brief:

> "every token sits in a clear black margin" · "a small centred patch of slats in wide empty
> margins" · "a centred heap floating in empty black with dead corners" · "a loose heap that floats
> near the middle of a square frame with generous dark margin on all sides"

The pipeline's answer to this was `extentOf`, added this round, and it says these works reach 0.52
to 0.99 of the frame. Both readings are correct: a bounding box says how far the drawing reaches
in x and y and says NOTHING about the region between. Measured on the twelve accepted
configurations, six seeds each, with the corner measure this round added last:

| brief | corner ink | edge ink | extent | brief | corner ink | edge ink | extent |
|---|---|---|---|---|---|---|---|
| B01 | 0.061 | 0.135 | 0.996 | B07 | 0.129 | 0.206 | 0.964 |
| B02 | 0.118 | 0.126 | 0.939 | B08 | **0.000** | **0.000** | 0.706 |
| B03 | 0.124 | 0.078 | 0.814 | B09 | **0.000** | **0.000** | 0.521 |
| B04 | 0.130 | 0.207 | 0.964 | B10 | 0.047 | 0.036 | 0.851 |
| B05 | **0.000** | **0.000** | 0.647 | B11 | **0.000** | **0.000** | 0.521 |
| B06 | 0.049 | **0.000** | 0.782 | B12 | 0.057 | 0.058 | 0.815 |

Four collections put literally nothing in any corner and nothing on any edge while reporting an
extent of 0.52 to 0.71. Overall coverage on the same frames runs 0.18 to 0.66.

**THE CAUSE IS STRUCTURAL AND IT BELONGS AT ADMISSION.** Both runtimes place their marks within a
half-extent about the canvas centre, so the reachable region is a DISC inscribed in a square frame.
The corners are outside it for every polar and scatter layout by construction; a cell grid reaches
them and measures highest here (0.130), a radial one cannot and measures zero. `VectorConfigV1`
refuses "frame bleed" and "an element that fills the frame" by name, and law L5 says there is no
placement parameter and no inset.

So a brief whose subject is a frame-filling field is in the same class as a brief asking for a
horizon: it is not a parameter that is set wrong, it is a picture neither Wave-1 runtime can make.
`EDGE_TO_EDGE_COVERAGE` should be a composition demand alongside `ALL_OVER_FIELD`, refused for
both runtimes, cited to those two clauses — and `cornerOccupancy` is the measure that would have
told the author before a reviewer did. It is committed as a measure and deliberately not as a
floor: B05's brief wants it at zero and B03's wants it high, and which is right is the brief's
business.

### 2. The author cannot choose the member. It chooses a primitive from a two-valued switch.

Four of twelve refusals are "the mark is the wrong kind of mark". The author's whole member
decision is `strokeMode`, which is `LINEWORK` or `SOLID`, crossed with a density word — nine
primitives, twelve layouts, eight variant sub-modes and a stroke flag, reached through one binary.
The reviewers were specific about the cost:

> "the dominant mark is a 10:1 rectangular slab, not a rounded cell" — B07
> "there is no stroke anywhere in the work; everything is filled translucent shape" — B02
> "the body is a fan of filled overlapping gold slabs — a solid pad, not line work" — B08
> "roughly half the collection reads as filigree; the other half does not" — B10

This is the same shape of gap the mechanism vocabulary closed for the market axis, and it wants the
same treatment: a MEMBER VOCABULARY of named marks — bar, disc, blade, thread, plate, ring — each
grounded in a measured primitive × stroke × variant × layout combination, derived from
`motifTranslation` rather than from a two-valued stroke switch, and refused at admission where no
combination produces the mark a brief names. The atlas already carries the measurements
(`vc-primitive`, `vc-variant-ngon`, `vc-variant-ellipse`, `vc-x-primitive-stroke`); nothing reads
them but a `SPARSE / MODERATE / DENSE` lookup.

### 3. Neither runtime can repeat a member at a metrical interval

Four refusals want a run, a colonnade, a sequence of generations or a ring count, and get an
irregular scatter. `VectorConfigV1` refuses "a fixed row pitch or any quantised spacing" by name;
`GEOMETRIC_RECURSION_V1` recurses at descending scale inside one figure and never lays a row. A
brief whose subject is interval is unsatisfiable by the Wave-1 catalog, and that is an admission
fact rather than an authoring one — the same finding as (1), on a different axis.

## One brief should never have been sent to the author, and this round found it

B11's brief asks for the work to be "sparse, broken and **cold**" under stress and "dense, whole and
**warm**" in recovery, with "slate and iron at one end, ochre and copper at the other". That is a
state-driven colour, which both runtimes' capability statements refuse by name. `admitBrief`
admitted it: the detector required a verb — shift, change, turn, darken — and B11 states the axis as
an adjective attached to a state and two named endpoints.

It was admitted, authored, rendered twice, and refused by its blind reviewer on exactly that axis:

> "under drawdown this collection glows copper; in recovery it goes to iron"

The detector now catches it, with five must-allow controls drawn from the other briefs' palette
sentences so the widening cannot start refusing an ordinary palette. **B11 is now
`BRIEF_NOT_REPRESENTABLE_BY_CURRENT_WAVE1_CATALOG`.** The benchmark result above stands as it was
measured, with B11 counted as a refusal; the gate was fixed after the fact and the run was not
re-scored.

`IMPOSSIBLE_COMMISSION_SENT_TO_AUTHOR` read 0 for this run and was not wrong: it counts briefs the
gate REFUSED that reached an author anyway, and none did. What it cannot count is a brief the gate
should have refused and did not. That is worth knowing about the flag.

## What was not changed, and why

The reviewer was not softened, the rubric was not lowered, no `REFUSE` was relabelled, and none of
the twelve briefs was edited — they were frozen before either round existed and are byte-identical
between them. `briefFidelity` is still the gate. The two-stage discipline is intact and its value is
visible in the verdicts: each one turns on a sentence the reviewer wrote BEFORE reading the brief
and which the brief then contradicted, which is a refusal nobody can argue was anchored.

## A correction to a commit message in this lane

The commit "Round two: ninety-six findings, ninety-six answers" says the dispositions were
"18 ACCEPT, 53 PARTIALLY_ACCEPT and 25 REJECT_WITH_REASON". They are **15 / 57 / 24**. The figures
were added up from three agents' summaries before the last of them had landed, and counting the
files gives the numbers above. The total, 96, and the count answered, 96, were right.

## THE HOLDOUT WAS COMPROMISED IN BOTH ROUNDS, AND THIS 0/12 CANNOT BE RE-SCORED CLEAN

Recorded 2026-09-03, after the round closed. It does not change a verdict and it does change what
the number is evidence of, so it belongs beside the number rather than in a changelog.

**Three facts, each measurable from the artifacts in this directory.**

1. `FINAL_HOLDOUT_SEEDS` was an arithmetic sequence — a base and a stride — declared in
   `packages/art-direction/src/seeds.js`, which is the module `author.js` imports, four lines below
   the sentence "THE AUTHOR NEVER SEES THEM". Anyone who opened the file computed the twelve. That
   is true of round one and round two alike.

2. **One holdout set served both rounds, byte for byte.** Compare `finalReview.seeds` in any
   receipt here with any receipt in `../art-benchmark-round1/`. Round two's holdout was round one's
   holdout, and round one's had already been reviewed and written about.

3. A round-one final holdout reviewer's sentence was quoted **verbatim in `author.js`**, naming a
   holdout seed and saying what that token rendered as, beside the parameter change it motivated.
   It landed at `2026-09-03T11:47:14-07:00` (commit `e67f7369`); round two's verdicts were taken at
   `12:59:28`. So round two was authored with part of round one's holdout unblinded, in the
   author's own source. The quotation is preserved at
   `packages/art-direction/rounds/QUARANTINE.md` and has been removed from `author.js`.

**`FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING=NO` was therefore false in substance**, and it was
also never measured: the harness wrote the literal `false` into every receipt and the flag read it
back. The twenty-four receipts now carry `authorSawHoldout: true`, derived from
`packages/art-direction/rounds/registry.json`, and the flag reads `YES`.

**What this does NOT do.** It does not overturn a verdict. Every one of the twenty-four final
verdicts across both rounds is `REFUSE`, so no configuration was ever accepted under the
compromised holdout and no false `PASS` was produced. The refusal taxonomy above stands; the
reviewers' reasoning stands; the round-two improvements measured against round one stand, because
they are differences between two rounds run under the same (compromised) conditions.

**What it does do.** It removes this `0/12` from the class of results that can be described as a
blind holdout score. A holdout that the author could compute, and that had already been reviewed
once, is a development set with a different name. **The 0/12 cannot be re-scored clean without a
fresh round on a fresh holdout, and a fresh round is not authorised.** Until one is run, the honest
statement is: *twelve independent reviewers refused twelve collections, on seeds that were not
properly held out.*

**What was changed so the next round is different.** The holdout is derived per round from a salt
that is not in this repository, committed to in advance by publishing `sha256(domain, salt)`;
`packages/art-direction/src/seeds.js` exports no seed list at all and refuses to invent one when
the salt is absent; `authorSawHoldout` is measured by scanning author-visible source for the
round's seeds; and `npm run kit:artreceipts` reads every committed receipt and fails on a leak.
Planting a holdout seed back into `author.js` turns the named test
`NO HOLDOUT SEED OF A COMPLETED ROUND APPEARS IN AUTHOR-VISIBLE SOURCE` red.
