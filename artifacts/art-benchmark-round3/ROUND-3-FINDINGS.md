# Round three of the frozen twelve-brief benchmark

*Verdict table and refusal taxonomy are appended at the end of this document, after the twelve
blind reviews closed. Everything above it was written before any verdict was read.*

## The holdout is real this time, and the overlap with the previous rounds is zero

Rounds one and two shared one holdout byte for byte, and it was an arithmetic sequence written out
in the module the author imports. Round three's is derived per round from a salt that is not in this
repository, committed to in advance by publishing `sha256(domain, salt)` **before the first author
run** — commit `bd2cb60`, three commits before any round-three configuration existed.

| | |
|---|---|
| round id | `wave1-benchmark-round-3` |
| commitment, published before authoring | `b396cdf9bcc1497f6f6d086fd1283c0fbb1d28720987dfd88a318fe752ef9fab` |
| seeds digest, pinned at the freeze | `e853e3b42776348c628d06378005087297e40d14a96df0210b2ea4b6edee4c8d` |
| overlap with the rounds 1+2 holdout | **0** |
| derivation | `COUNTER_SHA256_V1` |
| integrity | `HELD` |

**The zero overlap is structural rather than lucky.** `COUNTER_SHA256_V1` draws inside
1,000,000..1,999,999 and the legacy arithmetic set was 9011..10980; the two ranges cannot intersect.
It was also computed directly and came back 0. `HOLDOUT_LEAKS_IN_AUTHOR_VISIBLE_SOURCE` reads 0 over
44 scanned files, and the round-three artifacts live in their own directory —
`RELICS_ART_BENCHMARK_DIR` is an input now, so this round sits beside round two instead of over it.

---

## THE ROUND-TWO STRUCTURAL CONCLUSION IS RETRACTED, BY MEASUREMENT

Round two concluded from the Solidity that both Wave-1 runtimes place their marks inside "a DISC
inscribed in a square frame", that the corners are therefore unreachable, and that
`EDGE_TO_EDGE_COVERAGE` should be added as a refused capability for both. **It is false, and the
refusal was never implemented.**

Reproduced by `eth_call` against the deployed runtimes, twelve authoring seeds,
`validateConfigV1` returning **0** on both configurations
(`node scripts/probe-art-composition.mjs --reproduce`):

| | extentX min | extentY min | ink mean | corner ink min | corner ink mean | corner ink max |
|---|---|---|---|---|---|---|
| `VECTOR_COMPOSITION_V1` — ROT6, sizeMax 64, spreadMax 128, three cell-grid fields | 0.900 | 0.900 | 0.934 | 0.022 | **0.801** | 1.000 |
| `GEOMETRIC_RECURSION_V1` — {SQUARE, HEX}, {BRANCH}, {QUAD}, branch 3, depth 3, contraction 90, three rules | 1.000 | 0.867 | 0.929 | 0.206 | **0.927** | 1.000 |

Against the **0.130** that document cites as the ceiling: **6.2x and 7.1x**. The verifier's own
figures (0.7245 and 0.3047) sit inside this family and the direction of the finding is the same:
the corners are reachable on both runtimes, by ordinary configurations, with no exotic parameter.

The full retraction — including why the reasoning failed three separate ways, and what it would have
cost — is appended to `../art-benchmark/ROUND-2-FINDINGS.md`.

---

## WHAT WAS BUILT, AND WHY IT IS NOT "THE REFUSAL, MORE CAREFULLY"

### 1. A composition vocabulary, derived from frames rather than from source

`packages/art-direction/src/composition.js`: six named compositions, 27 candidate recipes, every
value tuned by rendering against the deployed runtimes and every verdict **derived at read time**
from the committed measurement. No claim in it is read out of a capability statement.

**The answer is three-valued, and the middle value is the honest refinement round two was reaching
for.** Every scalar in both runtimes is a CEILING the token's seed draws beneath, so a composition
can be true of a token and false of the collection it belongs to. Measured on the vector runtime at
symmetry NONE, spreadMax 128, three fields: extent runs 0.80 at the worst seed and 1.00 at the best,
corner ink 0.009 to 0.36 — one configuration, two compositions. So every criterion is written over
the WORST seed, and the vocabulary answers `HOLDS` · `REACHES_NOT_HELD` · `UNREACHABLE`.

The matrix, derived — nothing here is a stored flag:

| | EDGE_TO_EDGE | CENTRED_FIGURE | STRATIFIED | ALL_OVER_FIELD | RADIAL_EMBLEM | OFF_CENTRE_WEIGHT |
|---|---|---|---|---|---|---|
| `VECTOR_COMPOSITION_V1` | HOLDS | HOLDS | REACHES_NOT_HELD | REACHES_NOT_HELD | HOLDS | HOLDS |
| `GEOMETRIC_RECURSION_V1` | HOLDS | REACHES_NOT_HELD | REACHES_NOT_HELD | **UNREACHABLE** | HOLDS | REACHES_NOT_HELD |

`GEOMETRIC_RECURSION_V1`'s `ALL_OVER_FIELD` is the one `UNREACHABLE`, and it is now measured rather
than quoted: `largestShare` 0.98 to 0.999 on every arrangement tried, at four contractions from 20 to
90 — one connected mass on every seed, which is that runtime's own `can` statement ("one
self-similar figure, centred") read off the raster.

### 2. The composition pin — the only creator-owned floor either runtime offers

Neither runtime gives a creator a floor on a seed-drawn scalar: `sizeMax` floors at 2 of 64,
`spreadMax` at 16 of 128, `contraction` at 20 of 90. Binding the dimension's DRIVE to `QUOTE_VOLUME`,
which reads **687 per mille in all three market states**, takes it away from the seed and makes it a
project constant. Measured: the same three-field frame-filling configuration goes from
`extentX.min 0.900 / cornerInk.min 0.022` unpinned to `1.000 / 0.598` with two registers pinned.

**A pin is NOT a market binding; it is the deliberate absence of one.** `checkBindings` reports
`DEAD_SENSOR` for every pinned register, that report is correct, and the receipt carries it rather
than suppressing it. Three invariants are asserted rather than remembered: register 0 is never
pinned (it carries the mechanism), the last register is never pinned (it carries the
counter-register), and a recipe needs at least two registers for the same reason. **The second of
those was found by the author's own test suite on the first recipe it was asked to build** — a
recipe that pinned everything after register 0 left one live sensor and nothing to separate recovery
from neutral.

### 3. A member vocabulary — round two's second finding, closed

Ten named marks, each a measured primitive x stroke x variant (x shape on the recursion runtime),
replacing `strokeMode`: a two-valued switch that reached nine primitives, six shapes and eight
variant sub-modes through one binary, and produced four of twelve round-two refusals.

The ordering number is `boundaryShare` — the share of ink pixels sitting on a boundary, which
`inkCoverage` cannot produce because a hairline lattice and a solid slab can carry identical
coverage:

| | mass members | line members |
|---|---|---|
| `VECTOR_COMPOSITION_V1` | plate 0.264 · disc 0.282 · facet 0.330 · shard 0.353 | frame 0.383 · ring 0.405 · blade 0.506 · hook 0.549 · thread 0.575 · filament 0.667 |
| `GEOMETRIC_RECURSION_V1` | plate 0.074 · disc 0.067 · facet 0.071 · shard 0.091 | frame 0.323 · ring 0.349 |

**AN ABSOLUTE BAND WAS THE WRONG CHECK AND ALL EIGHT ENTRIES FAILED IT WHILE EVERY FAMILY CLAIM WAS
TRUE.** Boundary share is a perimeter-to-area ratio and therefore scales with element size: a
recursion node at depth 3 is not a vector site at sizeMax 30, and the same mark reads three times
apart on the two runtimes. What survives scaling is the ORDERING, so the assertion is *mass below
line, per runtime*, checked at write time in the probe and at read time in the package.

Four marks are REFUSED on the recursion runtime by name rather than substituted — blade, thread,
filament and hook — and that refusal moved a case. **B10 asks for hairline radial threadwork and was
routed to the runtime with no hairline in both completed rounds**; its round-two reviewer wrote that
roughly half the collection read as filigree and half did not. A mark the candidate cannot draw now
blocks the candidate exactly as a subject it cannot depict does, and B10 goes to the other runtime.

### 4. Two false positives found while wiring it, both the recorded B09 defect repeating

The word **frame** means THE CANVAS in every one of B01, B05 and B09 — "commands the frame", "clear
of the frame" — and matching it as a MARK sent three briefs whose subject is mass to a hollow
outline. Bare **outline** is the round-two B09 defect verbatim: the word appears once, in a
subordinate clause of `thumbnailIntent`, and it outvoted four deliberate nouns about weight. Neither
is a pattern in the member catalog.

---

## THE OBJECTIVE BATTERY BLOCKED NINE OF TWELVE ON THE FIRST RUN, AND EVERY BLOCK WAS A REAL DEFECT

No floor was lowered. Five defects, all named by the battery before any reviewer saw a frame:

1. **The counter-register answered the wrong pairing on half the corpus.** `VOLUME_TIER` is flat on
   neutral-to-stress, which is right for a `DRAWDOWN` primary and useless for a `RECOVERY` one — that
   primary reads 20/0/820 and leaves neutral-to-STRESS ambiguous instead. Which pairing is weak is a
   property of the polarity. `COUNTER_REGISTER_BY_PRIMARY` now says so per primary, and the
   `DRAWDOWN`-primary counter drives SPREAD rather than COUNT so the damaged state SCATTERS instead
   of multiplying — the inversion six of twelve round-two development critics named was never about
   the sensor, it was about a register growing where the story says the work comes apart.
2. **The second counter is asymmetric because the two primaries are not.** A `DRAWDOWN` primary
   saturates two pairings at 16.9 and 15.9 dE and leaves the third at 1.1, so both its counters
   answer the quiet one on different dimensions; a `RECOVERY` primary saturates nothing, so its
   second counter takes the other pairing. All three arrangements were measured and two of them left
   cases under the floor.
3. **The counter-register was the faintest thing in the frame.** Recipes put their lightest register
   last and the loop hands the market signal to the last register: ablations of 0.855 to 1.424
   against a structural-role floor of 1.5, on four cases. Its size and count floors are scaled to the
   composition now, and both only add coverage, so neither can cost a reach composition its hold.
4. **The primary register could take the ground index.** `nonGroundIndex` guarded every secondary
   and the primary took `accentIx` raw; B12 came out with rule 0 at `paletteIx` 0 on a palette whose
   `groundIx` is 0. That is the fourth time this project has recorded a register painted in the
   background colour and the first time it was the LOUDEST one.
5. **A hundred seeds drawn from too few moulds contain a colliding pair by arithmetic.** The
   recursion shape set went from two members to four: at three the closest pair of a hundred measured
   0.764 dE against the duplicate floor of 1.2, on a collection whose per-seed MEAN was 6.735 — a
   healthy average hiding a collision, which is the shape of failure the sweep exists to catch and a
   mean cannot.

**Final state: all eleven admitted cases clear all twelve checks.** The twelfth, B11, was refused at
admission for a state-driven colour — the gate round two added, working.

---

## A CRITERION THIS ROUND WROTE BADLY, CORRECTED RATHER THAN RELAXED

`CENTRED_FIGURE` originally asked for a 5 per cent margin AND under 3 per cent ink in a corner box of
21 per cent of the frame. Any figure that fills its own bounding box satisfies the first and fails the
second, and seven distinct arrangements came back at exactly 27 of 36 on that clause. Two clauses
measured at two different scales is not a strict criterion. The replacement says what the corner
clause was reaching for, at the margin's own scale — the figure does not fill the frame even at its
largest draw — and `inscribe-tight`, which passed the old criterion, passes this one.

---

## WHAT THE RESTRUCTURE COST, REPORTED RATHER THAN HIDDEN

Freeing a register for the second counter means one pin instead of two, and **four of twelve
composition pairs dropped from `HOLDS` to `REACHES_NOT_HELD`**. The composition guarantee and the
market response compete for the same registers: with 120 sites, six fields and three rules there is
not room for both at full strength. The author still builds a `REACHES_NOT_HELD` composition and the
receipt says it is one — that is what the middle value is for.

The other standing residual is `inkGap`, carried in every receipt. **Reaching the corners on every
seed costs coverage in these runtimes**, and the lightest arrangement that holds `EDGE_TO_EDGE` still
measures ink 0.62 with a mass member against a SPARSE target of 0.20. A brief that asks for the frame
AND for restraint is asking for two things these runtimes trade against each other, and the residual
is reported rather than chased.

---

# THE RESULT

**`BLIND_PASS = 0/12`.** Eleven blind final reviewers, eleven refusals; the twelfth brief was refused
at admission and never authored. The target was eight. This is a shortfall and it is not to be read
around.

| | round 1 | round 2 | round 3 |
|---|---|---|---|
| `BLIND_PASS` | 0/12 | 0/12 | **0/12** |
| `RECURSION_BLIND_PASSES` | 0 | 0 | **0** |
| `VECTOR_BLIND_PASSES` | 0 | 0 | **0** |
| holdout the author could compute | yes | yes | **no** |
| holdout shared with another round | yes | yes | **no — overlap 0** |
| `authorSawHoldout` on every receipt | true | true | **false** |
| blocked by the objective battery at the final config | — | 1 | **0** |
| `HUMAN_ART_INTERVENTIONS` | not measured | 0 | **0** |
| `FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND` | — | 0 | **0** |
| briefs refused at admission | 0 | 1 | 1 |

**This is the first round whose zero is a blind holdout score.** Rounds one and two ran on a holdout
the author could compute from the module it imports, and shared one set between them; this round's
was committed to before the first author run, derived from a salt outside the repository, and every
one of the eleven receipts reads `authorSawHoldout: false`, measured by scanning the author-visible
surface for the round's own seeds rather than asserted.

## Per brief

| brief | axis | runtime | composition (reach) | member | mechanism | verdict |
|---|---|---|---|---|---|---|
| B01 | architectural | VECTOR | EDGE_TO_EDGE / rot6-light (HOLDS) | PLATE | SUBTRACTION | REFUSE |
| B02 | botanical | VECTOR | RADIAL_EMBLEM / orbit-rot6 (HOLDS) | BLADE | SUBTRACTION | REFUSE |
| B03 | geological | VECTOR | STRATIFIED / stack-light (REACHES_NOT_HELD) | PLATE | SUBTRACTION | REFUSE |
| B04 | pure-abstract | VECTOR | EDGE_TO_EDGE / rot6-light (HOLDS) | PLATE | SUBTRACTION | REFUSE |
| B05 | minimal | RECURSION | CENTRED_FIGURE / inscribe-dense (REACHES_NOT_HELD) | PLATE | DILATION | REFUSE |
| B06 | dense | VECTOR | EDGE_TO_EDGE / rot6-mid (HOLDS) | FACET | SEPARATION | REFUSE |
| B07 | organic | VECTOR | EDGE_TO_EDGE / rot6-light (HOLDS) | PLATE | SUBTRACTION | REFUSE |
| B08 | mechanical | VECTOR | RADIAL_EMBLEM / orbit-rot6 (HOLDS) | RING | SEPARATION | REFUSE |
| B09 | monumental | VECTOR | EDGE_TO_EDGE / rot6-light (HOLDS) | PLATE | FRACTURE | REFUSE |
| B10 | delicate | VECTOR | EDGE_TO_EDGE / rot6-pinned (HOLDS) | THREAD | DILATION | REFUSE |
| B11 | market-heavy | — | refused at admission: state-driven colour | — | — | (not authored) |
| B12 | market-light | RECURSION | CENTRED_FIGURE / inscribe-tight (REACHES_NOT_HELD) | FRAME | DILATION | REFUSE |

## The refusal taxonomy, round three

A case can appear in more than one row; the row that decided the verdict is marked `GATE`.

| finding | briefs | count |
|---|---|---|
| **The work reads as a rosette, mandala, rose window or medallion** — named blind, before the brief | B01 GATE, B02 GATE, B04 GATE, B06 GATE, B07 GATE, B08 GATE, B09 GATE | **7** |
| **The member is the wrong kind of mark** | B02, B07, B10 GATE | 3 |
| **The market response is the wrong kind, the wrong sign or the wrong size** | B05 GATE, B07, B12 GATE | 3 |
| **A second form the brief closed off** | B03 GATE, B05 | 2 |
| **A centred figure in a dead black frame** — round two's largest row | B06 | **1** |
| **Blank or vanishing tokens** — round one's largest row | none | **0** |

Round two's taxonomy for comparison: 5 centred-island, 4 wrong-member, 5 wrong-mechanism, 4
no-repetition, 3 translucent-plates, 4 clipping. **The centred island is down from five to one, which
is the composition vocabulary working.** What replaced it is worse for the score and clearer as a
finding.

Every reviewer that refused wrote some version of "this is competent, coherent work and it is not
what was commissioned". That is a different failure from round one's, and it is not an improvement in
the number.

---

# WHAT IS MISSING, IN ORDER, AND IT IS ONE SENTENCE FOR SEVEN OF THE ELEVEN

## 1. ROTATIONAL REPLICATION IS THE ONLY THING THAT CARRIES A COMPOSITION TO THE FRAME, AND IT IS UNAVOIDABLY A ROSETTE

Seven of eleven refusals name a rosette, and every one of them was named BLIND, before the reviewer
had read a word of the brief:

> "a rotational rosette in a field of tumbled debris" · "a literal top-down chrysanthemum" ·
> "mandala, rose window, snowflake, bloom, flower, eclipse and iris" · "a six-fold symmetric
> rose-window medallion" · "hard-edged squares forming mandalas" · "doilies, mandalas and sectioned
> flower heads" · "rosette, rose window, sunflower, coin, medallion and mandala"

**And it is in the composition atlas, on purpose, as the thing that makes the composition hold.**
Every `EDGE_TO_EDGE` and `RADIAL_EMBLEM` recipe that reaches `HOLDS` uses ROT3, ROT6 or QUAD, because
rotational replication is what carries a cell grid into the corners: measured, at symmetry NONE the
same spread and size reach extent 0.80 at the worst seed and corner ink 0.009, and at ROT6 they reach
1.00 and 0.418. The parameter atlas said this in advance, in its own voice — *"ROT3 and ROT6 are,
unavoidably, a rosette. Every brief in the corpus that forbids a mandala or a centred emblem forbids
them."*

**So round three traded round two's failure for a different one.** Round two put a centred island in
a dead black frame; round three fills the frame and does it with the one control that makes the
result a rose window. Both are compositional failures and the second is the one this round bought.

**THE CAPABILITY THAT IS MISSING IS FRAME REACH AT SYMMETRY NONE, AND IT IS A RESOURCE CONFLICT
RATHER THAN AN ABSENCE.** It was measured and it exists: pinning BOTH `SIZE` and `SPREAD` on two
registers at symmetry NONE reached `extentX.min 1.000 / cornerInk.min 0.598` across twelve authoring
seeds and three market states. That arrangement was in this round and was REMOVED, because it uses
every register: with a 120-site ceiling, at most six vector fields and at most three recursion rules,
a composition cannot simultaneously carry two pins (the reach guarantee), a live mechanism register
and a counter-register. **Something has to give, and this round gave the pins.** The next round's
first question is which of the three to spend, and it is a question with a measurable answer rather
than a design opinion.

## 2. THE COMPOSITION'S DENSITY DESTROYS THE MEMBER, AND NOTHING MEASURES THAT

B10's member resolution is correct — the brief says hairline threadwork, `detectMembers` scores
`THREAD` at four distinct phrases, and the configuration carries the `LINE` primitive. Its reviewer,
blind, called the material **"flat, hard-edged rectangular planks"** that "accumulate into brighter
mass", and reached for "scaffolding" and "milled lumber".

Both are true. The member vocabulary decides what ONE mark is; the composition decides how many there
are and how large, and the arrangement that holds `EDGE_TO_EDGE` for a light mark does it at ink
0.88, where hairlines merge into slabs. `boundaryShare` is measured on a fixed sparse arrangement and
therefore says nothing about whether the mark survives the composition it is put into.

**The missing measure is the member's boundary share IN ITS OWN COMPOSITION**, and the missing
capability is a refusal when the two disagree: a `LINE` member whose composition drives it into the
`MASS` band is a brief that has been answered with the wrong mark, and the pipeline currently reports
it as the right one. This is the same shape as the round-two finding that produced the member
vocabulary, one level up.

## 3. THE MARKET RESPONSE IS NOW LOUD ENOUGH TO BREAK THE BRIEFS THAT ASK FOR QUIET

Three refusals turn on the mechanism and none of them is the round-two failure of a response too
small to see. They are the opposite:

> "the stress state instead swings the whole object to brown, ADDS a bead ring, deletes the backing
> disc, and nearly doubles the core — complexity and rearrangement in the wrong direction" (B05)
> "the stress row reads as broken from across the sheet at 120px" on a brief that explicitly forbids
> manufactured drama (B12)
> "stress floods the frame outward while recovery is a near-copy of neutral" (B07)

The objective battery bounds state separation from BELOW at 3.8 dE and nothing bounds it from above,
so the five defects the battery found in this round were all fixed by making the response LOUDER —
and the fixes overshot into briefs that asked for restraint. **A market response has a maximum as
well as a minimum, the brief is what sets it, and no part of this pipeline reads it.** That is a
`marketTransformation` reading the direction already contains and the author never consults for
amplitude.

## WHAT WAS NOT CHANGED, AND WHY THE ZERO IS TRUSTWORTHY

The reviewer was not softened, the rubric was not lowered, no `REFUSE` was relabelled, and none of
the twelve briefs was edited — they are byte-identical to rounds one and two. The art directions are
byte-identical to round two's, deliberately, so the difference between the rounds is attributable to
the author and to nothing else. `briefFidelity` is still the gate and it decided nine of the eleven.
Every verdict turns on a sentence the reviewer wrote BEFORE reading the brief, on twelve seeds no
part of the authoring path has ever rendered.

Two composition criteria were corrected during the round and both corrections are recorded above with
their measurements; neither was a floor lowered to admit something, and the arrangement that passed
each criterion before also passes it after.
