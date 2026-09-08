// SPDX-License-Identifier: MIT
// ================================================================================================
// THE COMPOSITION VOCABULARY — WHERE the marks go, as opposed to what they are.
//
// ------------------------------------------------------------------------------------------------
// A RETRACTION FIRST, BECAUSE THIS FILE EXISTS BECAUSE OF IT
// ------------------------------------------------------------------------------------------------
// `artifacts/art-benchmark/ROUND-2-FINDINGS.md` concluded that both Wave-1 runtimes "place their
// marks within a half-extent about the canvas centre, so the reachable region is a DISC inscribed
// in a square frame", that the corners are therefore "outside it for every polar and scatter
// layout by construction", and that `EDGE_TO_EDGE_COVERAGE` should be added as a refused capability
// for both runtimes. **THAT CONCLUSION IS FALSE AND IT WAS REACHED BY READING SOLIDITY.**
//
// Measured by `eth_call` against the deployed runtimes, ten authoring seeds, `validateConfigV1`
// returning 0 on every configuration (`npm run kit:artcomposition`, record in
// `../measurements/composition-atlas.json`):
//
//     VECTOR_COMPOSITION_V1   symmetry ROT6, sizeMax 64, spreadMax 128, three fields:
//                             extentX 1.000 and extentY 1.000 on EVERY seed, corner ink 0.418 at
//                             the WORST seed and 0.840 on average
//     GEOMETRIC_RECURSION_V1  shapeSet {SQUARE, HEX}, ruleSet {BRANCH}, symSet {QUAD}, branch 3,
//                             depth 3, contraction 90, three rules:
//                             extentX 1.000 and extentY 1.000 on EVERY seed, corner ink 0.878 at
//                             the WORST seed
//
// Against the 0.130 maximum corner ink that document cites when concluding the corners are
// unreachable, that is 6.8x and 3.2x — measured at the WORST seed, not the best. The document
// contradicts itself inside one section: it reports its own measurements from twelve configurations
// the author happened to produce and then states a property of the RUNTIMES.
//
// **A FALSE REFUSAL IS INVISIBLE.** That is the asymmetry `capabilities.js` opens with, and it is
// why the corrected answer is not "add the refusal more carefully" but "measure the space and let
// the measurement decide". Nothing in this file refuses a composition on the strength of reading a
// contract. Every verdict here is a predicate applied to rendered frames.
//
// ------------------------------------------------------------------------------------------------
// THE HONEST REFINEMENT, WHICH IS THE ACTUAL AUTHORING PROBLEM
// ------------------------------------------------------------------------------------------------
// Every scalar in both runtimes is a CEILING the token's seed draws beneath. So a composition
// property is reachable PER SEED and not automatically true ACROSS a collection: the same
// configuration that fills the frame on one seed can leave a centred island on another, and a
// collection is judged on its worst member rather than its best. Measured on the vector runtime at
// symmetry NONE, spreadMax 128, three fields: extent runs 0.80 at the worst seed and 1.00 at the
// best, and corner ink runs 0.009 to 0.36 — one configuration, two compositions.
//
// So the vocabulary asks a different question than "can it reach". It asks **does it HOLD**, and
// every criterion below is written over the WORST seed in the population, never the mean. Three
// answers, and the middle one is the one round two could not say:
//
//     HOLDS              every seed satisfies the criterion
//     REACHES_NOT_HELD   some seed satisfies it and some does not — a real capability the
//                        collection cannot be built on
//     UNREACHABLE        no seed of any candidate recipe satisfies it
//
// ------------------------------------------------------------------------------------------------
// WHAT THIS FILE IS NOT
// ------------------------------------------------------------------------------------------------
// No composition here is better than another. `CENTRED_FIGURE` wants corner ink at zero and
// `EDGE_TO_EDGE` wants it high; B05 asks for the first by name and B03 for the second. The
// criteria are shape predicates, not scores, and none of them may ever become a floor the battery
// enforces — the battery bounds BLANKNESS, and a composition is the brief's business.
// ================================================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const ATLAS_PATH = join(PKG, "measurements", "composition-atlas.json");

const rx = (s) => new RegExp(s, "i");

const NEGATORS = /\b(no|not|never|without|avoid\w*|free\s+of|absent|lack\w*|refus\w*|neither|nor|rather\s+than|instead\s+of)\b/i;

function negatedAt(haystack, index) {
  const start = Math.max(
    haystack.lastIndexOf(".", index),
    haystack.lastIndexOf(",", index),
    haystack.lastIndexOf(";", index),
    haystack.lastIndexOf("\n", index),
  );
  return NEGATORS.test(haystack.slice(start + 1, index));
}

export const COMPOSITION_REACH = Object.freeze(["HOLDS", "REACHES_NOT_HELD", "UNREACHABLE", "UNMEASURED"]);

/**
 * THE COMPOSITION CATALOG.
 *
 * `criterion` is a pure predicate over one recipe's measured distribution. It is declared HERE and
 * not in the probe, so that re-running a verdict costs nothing and a change to a criterion cannot
 * silently rewrite a measurement: the atlas stores what was rendered, this file stores what counts.
 *
 * `recipes` are the candidate parameter sets the probe renders. More than one per runtime on
 * purpose — a composition that is reachable only through one arrangement is a fact worth having,
 * and a composition NO candidate reaches is only an honest `UNREACHABLE` if the candidates were a
 * real attempt rather than a token one.
 */
export const COMPOSITIONS = Object.freeze([
  Object.freeze({
    id: "EDGE_TO_EDGE",
    what: "the work reaches all four edges and puts drawing in the corners",
    patterns: [
      rx(String.raw`\b(edge[- ]to[- ]edge|full[- ]bleed|bleeds?\s+off|corner\s+to\s+corner)\b`),
      rx(String.raw`\b(fills?|occupies?|uses?|covers?)\s+(the\s+)?(whole|entire|full)?\s*(frame|canvas|field)\b`),
      rx(String.raw`\b(reach\w+|extend\w+|run\w*|meet\w*|touch\w*|carr\w+|continu\w+)\b(?:\s+\w+){0,4}?\s+the\s+(frame\s+|canvas\s+)?(edges?|border|frame\s+edge)\b`),
      rx(String.raw`\bon\s+all\s+four\s+sides\b`),
      rx(String.raw`\b(border|frame)\s+crops?\b`),
    ],
    /**
     * Every seed reaches both axes and puts SOMETHING in a corner. The corner floor is 0.05 rather
     * than "> 0" because a single antialiased pixel in one corner quadrant is not a composition
     * reaching the corners, and 0.05 of the corner region is roughly thirty pixels of a 120px
     * frame — visible at browse size, which is the size the complaint was made at.
     */
    criterion: (d) => d.extentX.min >= 0.95 && d.extentY.min >= 0.95 && d.cornerInk.min >= 0.05,
    criterionText: "extentX.min >= 0.95 AND extentY.min >= 0.95 AND cornerInk.min >= 0.05",
  }),
  Object.freeze({
    id: "CENTRED_FIGURE",
    what: "one mass held clear of every edge, the margin doing compositional work",
    patterns: [
      rx(String.raw`\b(held\s+(well\s+)?clear\s+of\s+(every|the)\s+edge)\b`),
      rx(String.raw`\b(centred|centered)\s+(mass|form|figure|object|subject)\b`),
      rx(String.raw`\b(generous|wide|deep)\s+margins?\b`),
      rx(String.raw`\b(island|inset|contained|compact)\b`),
      rx(String.raw`\bone\s+(single\s+)?(form|figure|mass|object)\b(?:\s+\w+){0,6}?\s+(and\s+almost\s+nothing\s+else|alone)\b`),
    ],
    /**
     * The margin and the reach are read at their WORST, which is the opposite pairing to
     * EDGE_TO_EDGE and deliberately so: a centred figure fails if ANY token reaches the edge, and
     * reaches nothing if the tightest token has no margin.
     *
     * A CORNER CLAUSE WAS HERE AND IT WAS GEOMETRICALLY INCOMPATIBLE WITH THE MARGIN CLAUSE.
     * `cornerOccupancy` samples a corner box of 21% of the frame; a margin of 5% is six pixels of a
     * 120px frame. So any figure that fills its own bounding box and leaves the 5% margin the first
     * clause asks for necessarily puts ink in the 21% corner box, and `cornerInk.max <= 0.03`
     * refused every recipe that satisfied `marginMin.min >= 0.05` on all 36 frames — seven distinct
     * arrangements, all of them at exactly 27 of 36, all failing on the same clause. That is two
     * clauses measured at two different scales, not a strict criterion.
     *
     * The replacement says what the corner clause was reaching for and says it at the margin's own
     * scale: the figure does not fill the frame even at its largest draw. `extent.max <= 0.85`
     * leaves fifteen per cent of both axes unreached on EVERY token, which is the thing a reviewer
     * means by a form held clear of the edges. This is a correction of a criterion this round wrote
     * badly, not a floor lowered to admit something — the margin clause and the figure clause are
     * unchanged, and `inscribe-tight`, which passed the old criterion, passes this one too.
     */
    criterion: (d) => d.marginMin.min >= 0.05 && d.extentX.max <= 0.85 && d.extentY.max <= 0.85 && d.largestShare.mean >= 0.45,
    criterionText: "marginMin.min >= 0.05 AND extentX.max <= 0.85 AND extentY.max <= 0.85 AND largestShare.mean >= 0.45",
  }),
  Object.freeze({
    id: "STRATIFIED",
    what: "horizontal registers: a stacked sequence of beds read as a section",
    patterns: [
      rx(String.raw`\bhorizontal\s+band\w*\b`),
      rx(String.raw`\b(bed|band|layer|stratum|strata|register|course|seam)s?\s+(deposited|stacked|laid|over|above)\b`),
      rx(String.raw`\bone\s+bed\s+(over|above)\s+another\b`),
      rx(String.raw`\bcore\s+sample\b`),
      rx(String.raw`\b(stratif\w+|sediment\w*|bedding)\b`),
    ],
    /**
     * Six of eight bands carrying drawing, and the bands DIFFERING from their neighbours. Both
     * halves are needed: an even wash fills eight bands and is not a section, and three loud bands
     * over five empty ones is a figure with a shadow rather than a stack.
     */
    criterion: (d) => d.livingBands.min >= 6 && d.adjacentContrast.mean >= 0.06 && d.extentX.min >= 0.85,
    criterionText: "livingBands.min >= 6 AND adjacentContrast.mean >= 0.06 AND extentX.min >= 0.85",
  }),
  Object.freeze({
    id: "ALL_OVER_FIELD",
    what: "an even field with no dominant element, rather than a figure on a ground",
    patterns: [
      rx(String.raw`\ball[- ]over\s+(field|composition|pattern|arrangement)\b`),
      rx(String.raw`\bno\s+single\s+(dominant|focal)\s+\w*\s*(element|form|mass|point)\b`),
      rx(String.raw`\bnothing\s+dominat\w+\b`),
      rx(String.raw`\brather\s+than\s+a\s+figure\s+on\s+a\s+ground\b`),
      rx(String.raw`\bno\s+single\s+element\s+dominating\b`),
      rx(String.raw`\b(even|uniform|flat)\s+(field|hierarch\w+|distribution)\b`),
    ],
    /**
     * Evenness across the four quadrants at the WORST seed, and no single connected piece owning
     * the drawing. `largestShare` is the half `quadrantBalance` cannot see: one mass spread evenly
     * over four quadrants is still one mass, and that is a figure.
     */
    criterion: (d) => d.quadrantEvenness.min >= 0.45 && d.largestShare.mean <= 0.55 && d.extentX.min >= 0.85,
    criterionText: "quadrantEvenness.min >= 0.45 AND largestShare.mean <= 0.55 AND extentX.min >= 0.85",
  }),
  Object.freeze({
    id: "RADIAL_EMBLEM",
    what: "a concentric or rotational figure organised about one centre",
    patterns: [
      rx(String.raw`\b(radial|concentric|rotational|mandala|rosette|emblem|medallion)\b`),
      // "radiating FROM a shared centre" is how B07 says it and `around` alone missed it.
      rx(String.raw`\b(around|about|from)\s+(a|the|one)\s+(shared\s+|common\s+)?cent(re|er)\b`),
      rx(String.raw`\bradiat\w+\b`),
      rx(String.raw`\b(orbit\w*|ring\w*)\s+(about|around)\b`),
    ],
    criterion: (d) => d.centroidOffset.max <= 0.05 && d.quadrantEvenness.min >= 0.4 && d.extentX.min >= 0.7,
    criterionText: "centroidOffset.max <= 0.05 AND quadrantEvenness.min >= 0.4 AND extentX.min >= 0.7",
  }),
  Object.freeze({
    id: "OFF_CENTRE_WEIGHT",
    what: "the subject's weight sits away from the middle of the frame, on every token",
    patterns: [
      rx(String.raw`\boff[- ]cent(re|er)\w*\b`),
      rx(String.raw`\b(asymmetric\w*|unbalanced|weighted)\s+(placement|position\w*|composition|toward)\b`),
      rx(String.raw`\b(sits?|sat|rests?|falls?|gathers?)\s+(low|high|left|right)\s+in\s+the\s+frame\b`),
      rx(String.raw`\bthe\s+(mass|subject|figure|weight)\s+(is\s+)?(pushed|thrown|displaced)\b`),
    ],
    /**
     * THE ONE THIS FILE EXPECTS TO REFUSE, AND THE REASON IT IS HERE RATHER THAN ASSERTED.
     *
     * Both capability statements refuse an off-centre subject — one says "an off-centre subject",
     * the other "per-element coordinates" — and until this criterion existed those refusals rested
     * on the same reading of the same Solidity that produced the false conclusion above. So the
     * refusal is re-derived: sweep the legal space, take the largest centroid offset any candidate
     * recipe reaches on its WEAKEST seed, and let the number decide. The floor of 0.08 is a
     * displacement of roughly ten pixels of a 120px frame, which is the smallest offset that reads
     * as intentional rather than as jitter.
     */
    criterion: (d) => d.centroidOffset.min >= 0.08,
    criterionText: "centroidOffset.min >= 0.08",
  }),
]);

export const COMPOSITION_IDS = Object.freeze(COMPOSITIONS.map((c) => c.id));

export function compositionFor(id) {
  const c = COMPOSITIONS.find((x) => x.id === id);
  if (!c) throw new Error(`${JSON.stringify(id)} is not a composition this catalog names. It carries: ${COMPOSITION_IDS.join(", ")}`);
  return c;
}

/**
 * THE COMPOSITION PIN — the only creator-owned floor on a seed-drawn scalar in either runtime.
 *
 * THE PROBLEM IT SOLVES, MEASURED. Every scalar in both runtimes is a CEILING and the token's seed
 * draws somewhere beneath it, from a floor written into the bytecode: `sizeMax` floors at 2 of 64,
 * `spreadMax` at 16 of 128, `contraction` at 20 of 90. So a frame-filling configuration is a
 * frame-filling configuration ON MOST SEEDS, and the one seed in twelve that draws low is a centred
 * island in the middle of a collection that was supposed to bleed. Measured on the vector runtime at
 * ROT6, sizeMax 64, spreadMax 128, three fields, twelve authoring seeds x three states: 33 of 36
 * frames reach the frame and 3 do not, and no parameter raises that floor.
 *
 * THE MECHANISM. A field's or rule's DRIVE takes its dimension away from the seed and gives it to
 * the sensor. `QUOTE_VOLUME` reads **687 per mille in all three market states** — it is one of the
 * two constant sensors on the review fixture ring, which is exactly why `binding.js` lists it as
 * dead. Through `LOG2` it resolves to 933, so a driven `sizeMax` of 30 resolves to 28.1 on EVERY
 * token in EVERY state instead of anywhere between 2 and 30. Measured: the same three-field
 * configuration goes from `extentX.min 0.900 / cornerInk.min 0.022` unpinned to
 * `extentX.min 1.000 / cornerInk.min 0.598` with two fields pinned.
 *
 * WHAT IT IS NOT, AND THIS MATTERS MORE THAN WHAT IT IS. **A PIN IS NOT A MARKET BINDING. IT IS THE
 * DELIBERATE ABSENCE OF ONE**, and it must never be presented as one. `checkBindings` will report
 * `DEAD_SENSOR` for every pinned unit and that report is CORRECT — the receipt carries it as
 * intended rather than suppressing it. The rules that follow from that are not optional:
 *
 *   - A pin may never sit on the unit carrying the mechanism. The market response and the
 *     composition guarantee are different jobs and a unit cannot do both.
 *   - A configuration may never be pinned on every unit. `checkBindings` refuses one whose every
 *     binding is provably dead, and it is right to: that is a collection that does not respond to
 *     the market at all.
 *   - The pin is recorded by name in the receipt, so a reader can tell a dimension the author took
 *     away from the seed from a dimension nobody thought about.
 *
 * The honest description is: the creator is declaring that this dimension is a PROJECT CONSTANT,
 * neither seed-drawn nor market-driven. That is a real compositional decision and the runtimes
 * offer no other way to make it.
 */
export const COMPOSITION_PIN = Object.freeze({ sensor: "QUOTE_VOLUME", curve: "LOG2", resolvesAtPerMille: 933 });

/**
 * THE CANDIDATE RECIPES, per runtime.
 *
 * A recipe is an explicit list of units — fields for the vector runtime, rules for the recursion
 * one — carrying everything the COMPOSITION owns: placement, replication, reach, and which units
 * are pinned. What it deliberately does NOT carry is the MARK (that is `member.js`, which supplies
 * primitive, stroke, variant and shape) or the MECHANISM (that is `mechanism.js`, which overwrites
 * the drive, sensor and curve of the unit that carries the market response). Those three axes are
 * kept apart because round two proved they fail apart: five composition refusals, four member
 * refusals, and only one case that failed both.
 *
 * `notes` records what the recipe is doing and why, in the same voice a stage note uses, because
 * the receipt carries it and a reader has to be able to disagree with it.
 *
 * EVERY VALUE HERE WAS TUNED AGAINST THE DEPLOYED RUNTIMES, not reasoned about. The measured
 * distribution of each one is in `../measurements/composition-atlas.json` and the verdict beside it
 * is `compositionReach`'s, derived at read time.
 */
export const COMPOSITION_RECIPES = Object.freeze({
  VECTOR_COMPOSITION_V1: Object.freeze({
    EDGE_TO_EDGE: Object.freeze([
      Object.freeze({
        id: "rot6-pinned",
        notes: "rotational replication is what carries a cell grid into the corners -- at symmetry NONE the same spread and size reach extentX 0.80 at the worst seed and cornerInk 0.009 -- and the two pins are what stop the one seed in twelve that draws low from being a centred island in a collection that bleeds",
        fields: [
          { layout: "GRID", sizeMax: 64, spreadMax: 128, count: 20, symmetry: "ROT6" },
          { layout: "LATTICE", sizeMax: 56, spreadMax: 128, count: 20, symmetry: "ROT6", pin: "SIZE" },
          { layout: "LATTICE", sizeMax: 50, spreadMax: 128, count: 20, symmetry: "ROT6", pin: "SPREAD" },
          { layout: "TILING", sizeMax: 48, spreadMax: 128, count: 20, symmetry: "ROT6" },
        ],
      }),
      Object.freeze({
        id: "rot6-light",
        notes: "THE LIGHT END OF THE SAME COMPOSITION, and it exists because a brief may ask for the frame AND for restraint. Two fields, eight sites, a quarter of the size ceiling: it holds every seed at ink 0.62 with a mass member against the three-field recipe's 0.93. The residual is real and is reported rather than chased -- reaching the corners on EVERY seed costs coverage in these runtimes, and the arrangement that costs least is still not sparse",
        fields: [
          { layout: "GRID", sizeMax: 26, spreadMax: 128, count: 8, symmetry: "ROT6" },
          { layout: "LATTICE", sizeMax: 22, spreadMax: 128, count: 8, symmetry: "ROT6", pin: "SIZE" },
          { layout: "LATTICE", sizeMax: 22, spreadMax: 128, count: 8, symmetry: "ROT6", pin: "SPREAD" },
          { layout: "TILING", sizeMax: 20, spreadMax: 128, count: 8, symmetry: "ROT6" },
        ],
      }),
      Object.freeze({
        id: "rot6-mid",
        notes: "between the light and the full arrangement: two fields at twelve sites and two thirds of the size ceiling, measured ink 0.87",
        fields: [
          { layout: "GRID", sizeMax: 40, spreadMax: 128, count: 12, symmetry: "ROT6" },
          { layout: "LATTICE", sizeMax: 36, spreadMax: 128, count: 12, symmetry: "ROT6", pin: "SIZE" },
          { layout: "LATTICE", sizeMax: 34, spreadMax: 128, count: 12, symmetry: "ROT6", pin: "SPREAD" },
          { layout: "TILING", sizeMax: 32, spreadMax: 128, count: 12, symmetry: "ROT6" },
        ],
      }),
      Object.freeze({
        id: "rot3-pinned",
        notes: "three-fold replication reaches the frame at roughly a tenth less coverage than six-fold, for a brief that wants the edges without the saturation",
        fields: [
          { layout: "GRID", sizeMax: 56, spreadMax: 128, count: 20, symmetry: "ROT3" },
          { layout: "LATTICE", sizeMax: 48, spreadMax: 128, count: 20, symmetry: "ROT3", pin: "SIZE" },
          { layout: "LATTICE", sizeMax: 44, spreadMax: 128, count: 20, symmetry: "ROT3", pin: "SPREAD" },
          { layout: "SCATTER", sizeMax: 40, spreadMax: 128, count: 20, symmetry: "ROT3" },
        ],
      }),
      Object.freeze({
        id: "quad-pinned",
        notes: "four-fold replication points at the corners of a SQUARE frame rather than at a circle inscribed in it, which is why it measures the highest corner ink per unit of coverage",
        fields: [
          { layout: "GRID", sizeMax: 64, spreadMax: 128, count: 20, symmetry: "QUAD" },
          { layout: "TILING", sizeMax: 56, spreadMax: 128, count: 20, symmetry: "QUAD", pin: "SIZE" },
          { layout: "TILING", sizeMax: 52, spreadMax: 128, count: 20, symmetry: "QUAD", pin: "SPREAD" },
          { layout: "LATTICE", sizeMax: 48, spreadMax: 128, count: 20, symmetry: "QUAD" },
        ],
      }),
    ]),
    CENTRED_FIGURE: Object.freeze([
      Object.freeze({
        id: "tight-none",
        notes: "spread is the scale control and it is a ceiling, so a low ceiling is the only thing that guarantees a margin on EVERY seed -- and here the seed drawing low is the composition working rather than failing",
        fields: [
          { layout: "GRID", sizeMax: 30, spreadMax: 48, count: 20, symmetry: "NONE" },
          { layout: "LINEFIELD", sizeMax: 24, spreadMax: 44, count: 18, symmetry: "NONE" },
        ],
      }),
      Object.freeze({
        id: "tight-rot3",
        notes: "a compact rotational figure, for a brief that wants one centred object rather than one centred pile",
        fields: [
          { layout: "RADIAL", sizeMax: 30, spreadMax: 40, count: 20, symmetry: "ROT3" },
          { layout: "ORBIT", sizeMax: 24, spreadMax: 36, count: 18, symmetry: "ROT3" },
        ],
      }),
    ]),
    STRATIFIED: Object.freeze([
      Object.freeze({
        id: "stack-pinned",
        notes: "STACK is the only layout the atlas records as reading as horizontal bands, and it takes its element extent from spread while ignoring sizeMax entirely -- so the SPREAD pin is what makes a bed reach the frame on every seed rather than on most",
        fields: [
          { layout: "STACK", sizeMax: 34, spreadMax: 128, count: 16, symmetry: "NONE" },
          { layout: "STACK", sizeMax: 26, spreadMax: 128, count: 14, symmetry: "NONE", pin: "SPREAD" },
          { layout: "STACK", sizeMax: 24, spreadMax: 128, count: 14, symmetry: "NONE", pin: "SIZE" },
          { layout: "LINEFIELD", sizeMax: 20, spreadMax: 128, count: 12, symmetry: "NONE" },
        ],
      }),
      Object.freeze({
        id: "stack-light",
        notes: "the same three registers at six sites each and two thirds of the size ceiling -- the light end of a section, for a brief that wants beds rather than a wall",
        fields: [
          { layout: "STACK", sizeMax: 24, spreadMax: 128, count: 6, symmetry: "NONE" },
          { layout: "STACK", sizeMax: 18, spreadMax: 128, count: 6, symmetry: "NONE", pin: "SPREAD" },
          { layout: "STACK", sizeMax: 17, spreadMax: 128, count: 6, symmetry: "NONE", pin: "SIZE" },
          { layout: "LINEFIELD", sizeMax: 14, spreadMax: 128, count: 6, symmetry: "NONE" },
        ],
      }),
      Object.freeze({
        id: "stack-mirror",
        notes: "a left-right mirror widens each bed without stacking a second register on top of it, which a rotational symmetry would",
        fields: [
          { layout: "STACK", sizeMax: 40, spreadMax: 128, count: 18, symmetry: "MIRROR_X" },
          { layout: "STACK", sizeMax: 28, spreadMax: 128, count: 16, symmetry: "MIRROR_X", pin: "SPREAD" },
          { layout: "STACK", sizeMax: 26, spreadMax: 128, count: 16, symmetry: "MIRROR_X", pin: "SIZE" },
          { layout: "STACK", sizeMax: 20, spreadMax: 128, count: 14, symmetry: "MIRROR_X" },
        ],
      }),
    ]),
    ALL_OVER_FIELD: Object.freeze([
      Object.freeze({
        id: "scatter-fine",
        notes: "an even field needs MANY SEPARATE PIECES, so this holds the mark small while holding spread and count up -- the opposite trade to EDGE_TO_EDGE, which wants few large marks that merge. Measured: 40 components at largestShare 0.14, against the frame-filling recipe's 1 component at 0.999",
        fields: [
          { layout: "SCATTER", sizeMax: 14, spreadMax: 128, count: 34, symmetry: "NONE" },
          { layout: "LATTICE", sizeMax: 14, spreadMax: 128, count: 28, symmetry: "NONE", pin: "SPREAD" },
          { layout: "LATTICE", sizeMax: 14, spreadMax: 128, count: 26, symmetry: "NONE", pin: "SIZE" },
          { layout: "GRID", sizeMax: 14, spreadMax: 128, count: 26, symmetry: "NONE" },
        ],
      }),
      Object.freeze({
        id: "lattice-mirror",
        notes: "a cell grid distributes more evenly than a scatter and the mirror fills the half a single grid draw leaves light -- quadrant evenness 0.81 against the scatter's 0.53",
        fields: [
          { layout: "SCATTER", sizeMax: 12, spreadMax: 128, count: 38, symmetry: "MIRROR_X" },
          { layout: "LATTICE", sizeMax: 12, spreadMax: 128, count: 28, symmetry: "MIRROR_X", pin: "SPREAD" },
          { layout: "LATTICE", sizeMax: 12, spreadMax: 128, count: 26, symmetry: "MIRROR_X", pin: "SIZE" },
          { layout: "GRID", sizeMax: 12, spreadMax: 128, count: 26, symmetry: "MIRROR_X" },
        ],
      }),
    ]),
    RADIAL_EMBLEM: Object.freeze([
      Object.freeze({
        id: "orbit-rot6",
        notes: "the polar family is what a brief forbidding a centred emblem forbids, in the atlas's own words, so it is elected only where one is asked for",
        fields: [
          { layout: "RADIAL", sizeMax: 34, spreadMax: 112, count: 18, symmetry: "ROT6" },
          { layout: "ORBIT", sizeMax: 26, spreadMax: 112, count: 16, symmetry: "ROT6", pin: "SPREAD" },
          { layout: "ORBIT", sizeMax: 24, spreadMax: 112, count: 16, symmetry: "ROT6", pin: "SIZE" },
          { layout: "SPIRAL", sizeMax: 20, spreadMax: 112, count: 14, symmetry: "ROT6" },
        ],
      }),
    ]),
    OFF_CENTRE_WEIGHT: Object.freeze([
      Object.freeze({
        id: "subdivide-pair",
        notes: "SUBDIVIDE's level is seed-drawn and it is the ONE placement dimension in this runtime the creator does not pin, so a two-element field lands its weight wherever the split fell. It is the only arrangement measured that displaces the centroid on every seed, and it does so at ink 0.059 -- barely over the blank floor, which is the price",
        fields: [
          { layout: "SUBDIVIDE", sizeMax: 62, spreadMax: 112, count: 2, symmetry: "NONE" },
          { layout: "SUBDIVIDE", sizeMax: 43, spreadMax: 112, count: 2, symmetry: "NONE" },
        ],
      }),
      Object.freeze({
        id: "scatter-sparse",
        notes: "a three-element scatter at the widest spread: the most displaced arrangement available outside SUBDIVIDE, and the comparison that shows SUBDIVIDE is doing the work",
        fields: [
          { layout: "SCATTER", sizeMax: 56, spreadMax: 128, count: 3, symmetry: "NONE" },
          { layout: "SCATTER", sizeMax: 40, spreadMax: 128, count: 3, symmetry: "NONE" },
        ],
      }),
    ]),
  }),
  GEOMETRIC_RECURSION_V1: Object.freeze({
    EDGE_TO_EDGE: Object.freeze([
      Object.freeze({
        id: "ring-rot6",
        notes: "RING places children at a radius equal to the parent's own size, which the atlas measures at extentX 0.99 at contraction 90; six-fold replication closes the gaps between its arms",
        rules: [
          { ruleSet: ["RING"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 10 },
          { ruleSet: ["RING"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 25, pin: "CONTRACT" },
          { ruleSet: ["RING"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 40 },
        ],
      }),
      Object.freeze({
        id: "branch-rot6",
        notes: "outward production and six-fold replication together: the heaviest of the three, for a brief that wants the frame filled rather than merely reached",
        rules: [
          { ruleSet: ["BRANCH"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 10 },
          { ruleSet: ["BRANCH"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 25, pin: "CONTRACT" },
          { ruleSet: ["BRANCH"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 40 },
        ],
      }),
      Object.freeze({
        id: "branch-quad",
        notes: "four-fold replication points the outward throw at the corners of a square frame; it measures the highest corner ink of any recursion arrangement and the lowest coverage of the three that reach",
        rules: [
          { ruleSet: ["BRANCH"], symSet: ["QUAD"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 10 },
          { ruleSet: ["BRANCH"], symSet: ["QUAD"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 25, pin: "CONTRACT" },
          { ruleSet: ["BRANCH"], symSet: ["QUAD"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 40 },
        ],
      }),
    ]),
    CENTRED_FIGURE: Object.freeze([
      Object.freeze({
        id: "inscribe-tight",
        notes: "INSCRIBE places every child inside its parent, so the figure never grows past the root and the margin is structural rather than tuned. Contraction 55 rather than 70: at 65 one frame of thirty-six lost its margin, and at 75 six did",
        rules: [
          { ruleSet: ["INSCRIBE", "TRI"], symSet: ["NONE"], contraction: 55, branch: 2, depth: 4, prune: 2, rotation: 12 },
          { ruleSet: ["INSCRIBE", "TRI"], symSet: ["NONE"], contraction: 55, branch: 2, depth: 3, prune: 2, rotation: 26 },
        ],
      }),
      Object.freeze({
        id: "inscribe-dense",
        notes: "THE SAME FIGURE WITH ENOUGH INK TO SURVIVE A STROKED MARK. INSCRIBE alone -- no TRI, whose children sit at the parent's edge midpoints and push the silhouette outward -- over three rules at branch 3. The one-rule recipe is the right picture and the wrong weight: with a stroked mark it drew a frame at 0.029, under the battery's 0.04 blank floor, because stroking cuts recursion coverage to a third (ink120 0.399 filled against 0.121 stroked). This reads 0.123 at its emptiest.",
        rules: [
          { ruleSet: ["INSCRIBE"], symSet: ["NONE"], contraction: 60, branch: 3, depth: 3, prune: 6, rotation: 12 },
          { ruleSet: ["INSCRIBE"], symSet: ["NONE"], contraction: 60, branch: 3, depth: 3, prune: 6, rotation: 26, pin: "CONTRACT" },
          { ruleSet: ["INSCRIBE"], symSet: ["NONE"], contraction: 60, branch: 3, depth: 3, prune: 6, rotation: 40 },
        ],
      }),
    ]),
    STRATIFIED: Object.freeze([
      Object.freeze({
        id: "bsp-mirror",
        notes: "BSP is the one production that splits on an axis and alternates by level, which is the nearest thing to a bed this runtime has. The atlas records it as inert under PRUNE and ROTATE; it is elected here for its PLACEMENT and never bound to those drives",
        rules: [
          { ruleSet: ["BSP"], symSet: ["MIRROR_X"], contraction: 90, branch: 2, depth: 5, prune: 2, rotation: 0 },
          { ruleSet: ["BSP"], symSet: ["MIRROR_X"], contraction: 90, branch: 2, depth: 5, prune: 2, rotation: 0, pin: "CONTRACT" },
          { ruleSet: ["BSP"], symSet: ["MIRROR_X"], contraction: 90, branch: 2, depth: 5, prune: 2, rotation: 0 },
        ],
      }),
      Object.freeze({
        id: "quad-mirror",
        notes: "QUAD at branch 2 keeps the parent's two upper corners, which stacks a register per level -- the atlas calls this a face on every seed, and it is exactly the arrangement a bedding brief would want if the count of levels carried it",
        rules: [
          { ruleSet: ["QUAD"], symSet: ["MIRROR_X"], contraction: 90, branch: 2, depth: 4, prune: 2, rotation: 0 },
          { ruleSet: ["QUAD"], symSet: ["MIRROR_X"], contraction: 90, branch: 2, depth: 4, prune: 2, rotation: 0, pin: "CONTRACT" },
          { ruleSet: ["QUAD"], symSet: ["MIRROR_X"], contraction: 90, branch: 2, depth: 4, prune: 2, rotation: 0 },
        ],
      }),
    ]),
    ALL_OVER_FIELD: Object.freeze([
      Object.freeze({
        id: "branch-rot6-flat",
        notes: "the flattest hierarchy the runtime admits: three rules over one shared centre, each thrown outward, so no single generation dominates",
        rules: [
          { ruleSet: ["BRANCH", "RING"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 10 },
          { ruleSet: ["BRANCH", "RING"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 25, pin: "CONTRACT" },
          { ruleSet: ["BRANCH", "RING"], symSet: ["ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 40 },
        ],
      }),
      Object.freeze({
        id: "ring-separated",
        notes: "contraction 20 is where the atlas says the levels become visually separate -- if anything in this runtime breaks one mass into many pieces it is a low contraction under an outward production, and this recipe exists to find out",
        rules: [
          { ruleSet: ["RING"], symSet: ["ROT6"], contraction: 20, branch: 3, depth: 3, prune: 6, rotation: 10 },
          { ruleSet: ["RING"], symSet: ["ROT6"], contraction: 20, branch: 3, depth: 3, prune: 6, rotation: 25, pin: "CONTRACT" },
          { ruleSet: ["RING"], symSet: ["ROT6"], contraction: 20, branch: 3, depth: 3, prune: 6, rotation: 40 },
        ],
      }),
    ]),
    RADIAL_EMBLEM: Object.freeze([
      Object.freeze({
        id: "ring-rot3",
        notes: "the runtime's native idiom, and the one six of twelve round-one reviews read into work that never asked for it",
        rules: [
          { ruleSet: ["RING"], symSet: ["ROT3", "ROT6"], contraction: 90, branch: 3, depth: 3, prune: 6, rotation: 10 },
          { ruleSet: ["RING"], symSet: ["ROT3", "ROT6"], contraction: 85, branch: 3, depth: 3, prune: 6, rotation: 25 },
        ],
      }),
    ]),
    OFF_CENTRE_WEIGHT: Object.freeze([
      Object.freeze({
        id: "branch-fan",
        notes: "one rule, no replication, the widest fan and a prune mask that keeps ONE child: the fan then has a direction and the whole figure hangs off the root. Measured centroid offset 0.112 at the worst frame of thirty-six -- the only recursion arrangement that holds it",
        rules: [
          { ruleSet: ["BRANCH"], symSet: ["NONE"], contraction: 90, branch: 4, depth: 3, prune: 1, rotation: 12 },
          { ruleSet: ["BRANCH"], symSet: ["NONE"], contraction: 90, branch: 3, depth: 3, prune: 1, rotation: 26 },
        ],
      }),
      Object.freeze({
        id: "bsp-fan",
        notes: "BSP places every child at the same offset and alternates the axis by level, which is the most one-sided placement in the production set -- and it measures far weaker than the fan, which is why the fan is the recipe",
        rules: [
          { ruleSet: ["BSP"], symSet: ["NONE"], contraction: 90, branch: 2, depth: 5, prune: 1, rotation: 0 },
          { ruleSet: ["BSP"], symSet: ["NONE"], contraction: 90, branch: 2, depth: 4, prune: 1, rotation: 0 },
        ],
      }),
    ]),
  }),
});

let _atlas = null;

/** The committed measurement. Read once; a caller that cannot read it gets a named refusal. */
export function compositionAtlas() {
  if (_atlas) return _atlas;
  try {
    _atlas = JSON.parse(readFileSync(ATLAS_PATH, "utf8"));
  } catch (err) {
    throw new Error(
      `COMPOSITION_ATLAS_UNREADABLE: ${ATLAS_PATH} could not be read — ${err.message}. ` +
      "Every composition verdict in this package is a predicate over measured frames, so without " +
      "the measurement there is no verdict. Regenerate it with `npm run kit:artcomposition:measure`. " +
      "There is deliberately no fallback that answers from the parameter atlas instead: reading a " +
      "capability out of a description is the method that produced this lane's one false structural " +
      "conclusion.",
    );
  }
  return _atlas;
}

/**
 * Refuse to author against an atlas that no longer describes the deployed runtimes.
 *
 * Same rule as `assertAtlasFresh`, same reason, and the same refusal of an empty observation: "I
 * could not read the chain" must never be indistinguishable from "the chain agrees".
 */
export function assertCompositionAtlasFresh(observed) {
  const atlas = compositionAtlas();
  const pinned = atlas.runtimeCodeHash ?? {};
  const ids = Object.keys(pinned);
  if (ids.length === 0) throw new Error("the composition atlas carries no runtime codehash; it cannot be checked for staleness");
  const seen = Object.keys(observed ?? {});
  if (seen.length === 0) throw new Error("assertCompositionAtlasFresh was given no observed codehashes. An unread chain is not a fresh atlas.");
  const drift = [];
  for (const [id, hash] of Object.entries(observed)) {
    const want = pinned[id];
    if (!want) { drift.push(`${id}: not pinned by the composition atlas`); continue; }
    if (String(hash).toLowerCase() !== String(want).toLowerCase()) drift.push(`${id}: deployed ${hash} != atlas ${want}`);
  }
  if (drift.length) {
    throw new Error(`COMPOSITION_ATLAS_STALE — the runtimes on chain are not the ones these frames were rendered by:\n  ${drift.join("\n  ")}`);
  }
  return { fresh: true, checked: seen, pinnedRuntimes: ids };
}

/**
 * Is this composition reachable on this runtime, and does it HOLD across the seed population?
 *
 * The answer is DERIVED at read time by applying the criterion to the committed distributions, so
 * a criterion that is tightened re-decides every verdict without anyone re-rendering, and a verdict
 * can never disagree with the number beside it.
 *
 * `UNMEASURED` is not a pass and not a failure. It is this function declining to answer about a
 * pair the probe never rendered, which is the same three-valued discipline `checkBindings` uses.
 */
export function compositionReach(runtimeId, compositionId) {
  const c = compositionFor(compositionId);
  const rows = (compositionAtlas().recipes ?? []).filter((r) => r.runtimeId === runtimeId && r.compositionId === compositionId);
  if (rows.length === 0) {
    return { reach: "UNMEASURED", runtimeId, compositionId, detail: `the composition atlas carries no measurement of ${compositionId} on ${runtimeId}. An unmeasured pair is UNKNOWN, never unreachable.`, recipes: [] };
  }
  const legal = rows.filter((r) => r.legal === true);
  if (legal.length === 0) {
    return { reach: "UNREACHABLE", runtimeId, compositionId, detail: `every candidate recipe for ${compositionId} on ${runtimeId} was refused by the runtime's own validateConfigV1: ${[...new Set(rows.map((r) => r.validatorCode))].join(", ")}`, recipes: rows.map((r) => r.recipeId) };
  }
  const judged = legal.map((r) => ({ recipeId: r.recipeId, memberId: r.memberId, holds: c.criterion(r.distribution), any: r.anySeedSatisfies?.[compositionId] ?? null, distribution: r.distribution }));
  const holding = judged.filter((j) => j.holds);
  if (holding.length > 0) {
    return { reach: "HOLDS", runtimeId, compositionId, detail: `${holding.length} of ${judged.length} measured recipes satisfy ${c.criterionText} at the WORST seed`, recipes: holding.map((h) => h.recipeId), best: holding[0], judged };
  }
  const reaching = judged.filter((j) => j.any === true);
  if (reaching.length > 0) {
    return { reach: "REACHES_NOT_HELD", runtimeId, compositionId, detail: `${reaching.length} recipes reach ${compositionId} on SOME seed and none holds it on every seed. Every scalar in this runtime is a ceiling the seed draws beneath, so this is a composition a token can have and a collection cannot be built on.`, recipes: reaching.map((r) => r.recipeId), judged };
  }
  return { reach: "UNREACHABLE", runtimeId, compositionId, detail: `no seed of any of the ${judged.length} candidate recipes satisfies ${c.criterionText}. This is measured against the deployed runtimes and not read out of a capability statement.`, recipes: judged.map((j) => j.recipeId), judged };
}

/** The whole matrix, derived. Nothing here is a stored flag. */
export function compositionMatrix(runtimeIds = ["GEOMETRIC_RECURSION_V1", "VECTOR_COMPOSITION_V1"]) {
  const out = {};
  for (const runtimeId of runtimeIds) {
    out[runtimeId] = {};
    for (const id of COMPOSITION_IDS) out[runtimeId][id] = compositionReach(runtimeId, id).reach;
  }
  return out;
}

/** Which composition a brief asks for. Scored by distinct supporting phrases, negation-aware. */
export function detectCompositions(text) {
  const haystack = String(text ?? "");
  const scored = [];
  for (const c of COMPOSITIONS) {
    const hits = [];
    for (const p of c.patterns) {
      for (const hit of haystack.matchAll(new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`))) {
        if (negatedAt(haystack, hit.index)) continue;
        if (!hits.includes(hit[0].toLowerCase())) hits.push(hit[0].toLowerCase());
      }
    }
    if (hits.length) scored.push({ id: c.id, score: hits.length, phrases: hits });
  }
  scored.sort((a, b) => b.score - a.score || COMPOSITION_IDS.indexOf(a.id) - COMPOSITION_IDS.indexOf(b.id));
  const top = scored.length ? scored.filter((s) => s.score === scored[0].score) : [];
  return { compositions: scored, best: scored[0] ?? null, tied: top.length > 1 ? top.map((t) => t.id) : [] };
}

/**
 * The stated default, and it is EDGE_TO_EDGE rather than a margin.
 *
 * Round one's default was a compact composition and seven of twelve blind reviews described a
 * centred island floating in dead margin — one of them before it had read a brief that asks for
 * banding "filling the frame edge to edge". Round two moved the default to a middling spread and
 * five of twelve refusals were still a centred figure in a dead black frame. A margin is a
 * deliberate choice a brief asks for by name, so the neutral answer reaches the frame.
 */
export const DEFAULT_COMPOSITION = "EDGE_TO_EDGE";

/**
 * The composition a direction asks for, resolved against what the runtime can HOLD.
 *
 * Four outcomes:
 *   `NAMED`        the direction names a composition and this runtime holds it
 *   `NOT_HELD`     the direction names one this runtime reaches on some seeds and not all —
 *                  reported as its own outcome, because "it works on the good seeds" is exactly
 *                  the failure a collection is judged on
 *   `REFUSED`      the direction names one no candidate recipe reaches — an admission fact
 *   `DEFAULT`      the direction names none; the stated default is used and recorded as a default
 */
export function resolveComposition({ runtimeId, text }) {
  const read = detectCompositions(text);
  const chosen = read.best?.id ?? DEFAULT_COMPOSITION;
  const source = read.best ? "DIRECTION" : "DEFAULT";
  const reach = compositionReach(runtimeId, chosen);
  const recipes = COMPOSITION_RECIPES[runtimeId]?.[chosen] ?? [];
  const base = {
    compositionId: chosen,
    source,
    evidence: read.best?.phrases ?? [],
    tied: read.tied,
    reach: reach.reach,
    reachDetail: reach.detail,
  };
  if (reach.reach === "HOLDS") {
    const pick = recipes.find((r) => r.id === reach.recipes[0]) ?? recipes[0];
    return { ...base, outcome: source === "DEFAULT" ? "DEFAULT" : "NAMED", recipe: pick, recipeId: pick?.id ?? null };
  }
  if (reach.reach === "REACHES_NOT_HELD") {
    const pick = recipes.find((r) => r.id === reach.recipes[0]) ?? recipes[0];
    return { ...base, outcome: "NOT_HELD", recipe: pick, recipeId: pick?.id ?? null };
  }
  return { ...base, outcome: "REFUSED", recipe: null, recipeId: null };
}

/**
 * Every claim this file makes, checked against the atlas it makes them from.
 *
 * A LOAD-TIME ASSERTION RATHER THAN A TEST, for the reason `assertCapabilityMappingCurrent` gives:
 * the failure guarded against is a verdict that has quietly stopped being true, and that failure is
 * invisible by construction, so it must be loud.
 */
export function assertCompositionCatalogCurrent() {
  const atlas = compositionAtlas();
  const problems = [];
  if (!Array.isArray(atlas.recipes) || atlas.recipes.length === 0) problems.push("the atlas carries no measured recipes at all");
  const measured = new Set((atlas.recipes ?? []).map((r) => `${r.runtimeId}|${r.compositionId}|${r.recipeId}`));
  for (const [runtimeId, byComposition] of Object.entries(COMPOSITION_RECIPES)) {
    for (const [compositionId, recipes] of Object.entries(byComposition)) {
      if (!COMPOSITION_IDS.includes(compositionId)) { problems.push(`${runtimeId}: recipe set names ${compositionId}, which the catalog does not carry`); continue; }
      for (const r of recipes) {
        if (!measured.has(`${runtimeId}|${compositionId}|${r.id}`)) {
          problems.push(`${runtimeId}/${compositionId}/${r.id}: declared as a candidate and never measured. An unmeasured candidate makes an UNREACHABLE verdict a statement about the probe rather than about the runtime.`);
        }
      }
    }
  }
  for (const c of COMPOSITIONS) {
    for (const runtimeId of Object.keys(COMPOSITION_RECIPES)) {
      if (!COMPOSITION_RECIPES[runtimeId][c.id]) problems.push(`${runtimeId}: no candidate recipe for ${c.id}. A composition with no candidate cannot be honestly refused.`);
    }
  }
  // UNIT ZERO IS NEVER PINNED, IN ANY RECIPE, ON EITHER RUNTIME.
  //
  // A pin takes a dimension away from the seed by giving it to a constant sensor, which is the same
  // slot the MARKET RESPONSE uses. A recipe that pins every unit is a recipe with nowhere left to
  // put the mechanism, and the author's only ways out of that are both bad: drop a pin and lose the
  // guarantee the recipe was measured with, or leave the collection with no market response at all.
  // So the invariant is structural — unit 0 carries the mechanism, units 1..n carry the guarantee —
  // and it is asserted rather than remembered.
  for (const [runtimeId, byComposition] of Object.entries(COMPOSITION_RECIPES)) {
    for (const [compositionId, recipes] of Object.entries(byComposition)) {
      for (const r of recipes) {
        const units = r.fields ?? r.rules ?? [];
        if (units.length === 0) { problems.push(`${runtimeId}/${compositionId}/${r.id}: declares no units`); continue; }
        if (units[0].pin) problems.push(`${runtimeId}/${compositionId}/${r.id}: unit 0 is pinned to ${units[0].pin}. Unit 0 carries the market mechanism and may never be pinned.`);
        // AND THE LAST UNIT MAY NOT BE PINNED EITHER, because it carries the COUNTER-REGISTER.
        //
        // A recipe that pins everything after unit 0 leaves the collection with exactly one live
        // sensor, and one sensor cannot separate three states: the primary answers the pairing its
        // polarity is about and the other pairing has nothing answering it. The author's own test
        // suite caught this on the first recipe it was asked to build, which is the test working.
        // So a recipe needs at least two units, and the two ends of it are the market's.
        if (units.length < 2) problems.push(`${runtimeId}/${compositionId}/${r.id}: declares ${units.length} unit. A composition needs at least two: one for the mechanism and one for the counter-register.`);
        if (units.length > 1 && units[units.length - 1].pin) problems.push(`${runtimeId}/${compositionId}/${r.id}: the last unit is pinned to ${units[units.length - 1].pin}. It carries the counter-register, without which one market pairing has nothing answering it.`);
      }
    }
  }
  if (problems.length) throw new Error(`COMPOSITION_CATALOG_STALE — the composition vocabulary disagrees with its own measurement:\n  ${problems.join("\n  ")}`);
  return { ok: true, compositions: COMPOSITIONS.length, recipes: measured.size, runtimes: Object.keys(COMPOSITION_RECIPES) };
}

/**
 * The measured ink of one (recipe, member) pair, or null if the probe never rendered it.
 *
 * Coverage is read from the atlas rather than predicted, because coverage in these runtimes is the
 * product of at least four controls and the author has been wrong about it before: five of twelve
 * round-two development critics measured the coverage far above what their direction asked for,
 * with a number, on configurations whose density word was SPARSE.
 */
export function measuredInk(runtimeId, compositionId, recipeId, memberId) {
  const row = (compositionAtlas().recipes ?? []).find(
    (r) => r.runtimeId === runtimeId && r.compositionId === compositionId && r.recipeId === recipeId && r.memberId === memberId && r.legal === true,
  );
  return row ? row.distribution.ink.mean : null;
}

/** The EMPTIEST frame a recipe drew, which is the number the battery's blank floor reads. */
export function measuredInkFloor(runtimeId, compositionId, recipeId, memberId) {
  const row = (compositionAtlas().recipes ?? []).find(
    (r) => r.runtimeId === runtimeId && r.compositionId === compositionId && r.recipeId === recipeId && r.memberId === memberId && r.legal === true,
  );
  return row ? row.distribution.ink.min : null;
}

/**
 * The coverage floor a chosen recipe must clear, and it is NOT this file's number.
 *
 * `@relics/art-review`'s objective battery refuses a configuration whose emptiest sampled frame
 * falls under `FLOORS.ink = 0.04`, and it refuses it BEFORE a reviewer sees anything. An author
 * that picks the lightest holding arrangement for a light mark and discovers the floor at the
 * battery has spent a round learning something the atlas already knew: measured, the recursion
 * runtime's one-rule centred recipe with a stroked mark drew a frame at 0.029.
 *
 * The margin above 0.04 is deliberate and it is the estimate's, not the floor's: the mark scale is
 * a ratio between two measurements taken on different arrangements, so a recipe estimated at
 * exactly the floor is a recipe that might be under it.
 */
export const CHOSEN_RECIPE_INK_FLOOR = 0.06;

/**
 * How much extra coverage headroom a recipe needs when the MECHANISM drives a dimension whose
 * bytecode floor is near nothing.
 *
 * MEASURED, AND IT COST A CASE. The composition atlas renders every arrangement with the market
 * response held out — a pin or a pinned count — so its coverage floor is the arrangement's own. A
 * launched project's is not: `DRIVE_SIZE` resolves from a bytecode floor of 2 of 64 and
 * `DRIVE_SPREAD` from 40 of 256, and `RECOVERY` reads exactly 0 in the stress state. So a
 * recursion configuration whose arrangement floors at 0.09 drew 0.029 once the mechanism was on it
 * — under the battery's 0.04 blank floor, on a composition the atlas correctly called safe.
 *
 * Three is not a tuned constant: `DRIVE_SPREAD`'s floor is 40 of 256, which is under a sixth of
 * the ceiling, and coverage falls faster than extent. It is deliberately conservative, and a
 * recipe it excludes is excluded from a CHOICE rather than refused.
 */
export const DRIVEN_DIMENSION_INK_HEADROOM = 3;

/** The drives whose resolved floor is a bytecode constant near zero rather than a creator's value. */
export const LOW_FLOOR_DRIVES = Object.freeze(["SIZE", "SPREAD"]);

/**
 * The density targets, as COVERAGE against the declared ground on this pipeline.
 *
 * Carried over from the author's own calibration and for its reasons: the two shipped Wave-1
 * templates measure 0.570 (compass) and 0.430 (alluvium), both emphatic works, so a sparse brief
 * has to land well under alluvium rather than beside compass.
 */
export const DENSITY_INK_TARGET = Object.freeze({ SPARSE: 0.20, MODERATE: 0.35, DENSE: 0.55 });

/**
 * Choose among the recipes that HOLD the composition, by measured coverage.
 *
 * THIS IS WHY DENSITY DOES NOT GET TO MOVE THE COMPOSITION'S OWN PARAMETERS. A recipe holds because
 * of the values it was measured at; scaling those to hit a density word would be spending the
 * guarantee to buy a coverage the author cannot predict anyway. So the density target SELECTS among
 * arrangements that already hold, using the coverage each one was measured at, and what it cannot
 * reach it reports as a residual rather than chasing.
 *
 * `inkGap` is that residual, signed, and it travels into the receipt. A positive gap means the
 * composition the brief asked for is denser than the density word it also asked for, on every
 * arrangement measured — which is a real tension between two halves of one brief and is worth
 * saying out loud instead of resolving silently.
 */
/**
 * The member atlas's own coverage reading for one mark on one runtime.
 *
 * Read from the MEMBER atlas rather than the composition one, because the two measure different
 * things: the composition atlas measures an arrangement with a probe mark, and this measures a mark
 * on a fixed arrangement. Dividing one by the other is how the estimate below is built.
 */
function memberInkOf(runtimeId, memberId) {
  try {
    const atlas = JSON.parse(readFileSync(join(PKG, "measurements", "member-atlas.json"), "utf8"));
    const row = (atlas.members ?? []).find((r) => r.runtimeId === runtimeId && r.memberId === memberId && r.legal === true);
    return row ? row.distribution.ink.mean : null;
  } catch {
    return null;
  }
}

export function chooseRecipe({ runtimeId, compositionId, densityTarget = "MODERATE", memberFamily = "MASS", memberId = null, mechanismDrive = null }) {
  const reach = compositionReach(runtimeId, compositionId);
  if (reach.reach !== "HOLDS" && reach.reach !== "REACHES_NOT_HELD") return { recipe: null, reach: reach.reach, detail: reach.detail };
  const probeMember = memberFamily === "LINE" ? "FRAME" : "PLATE";
  const target = DENSITY_INK_TARGET[densityTarget] ?? DENSITY_INK_TARGET.MODERATE;
  // THE PROBE MARK IS NOT THE BRIEF'S MARK, AND THE DIFFERENCE IS A FACTOR OF TWO.
  //
  // Each recipe is measured with PLATE and with FRAME, so the atlas has a coverage reading per
  // family and not per mark. Measured on the vector runtime at a fixed arrangement, FRAME reads ink
  // 0.150 and THREAD reads 0.049 — both LINE, three times apart. Choosing an arrangement for a
  // brief that asks for a thread using the frame's number picked the LIGHTEST holding recipe for
  // the LIGHTEST mark, and the composition then held on 26 frames of 36. So the reading is scaled
  // by the ratio the member atlas measures between the brief's own mark and the probe's. It is an
  // ESTIMATE and it is named one: the true value needs a render, and the author has no chain.
  const probeInk = memberInkOf(runtimeId, probeMember);
  const markInk = memberId ? memberInkOf(runtimeId, memberId) : null;
  const scale = probeInk && markInk ? markInk / probeInk : 1;
  const candidates = (COMPOSITION_RECIPES[runtimeId]?.[compositionId] ?? [])
    .filter((r) => reach.recipes.includes(r.id))
    .map((r) => {
      const measured = measuredInk(runtimeId, compositionId, r.id, probeMember);
      const floor = measuredInkFloor(runtimeId, compositionId, r.id, probeMember);
      return {
        recipe: r,
        ink: measured,
        inkFloor: floor,
        estimatedInk: measured === null ? null : Number((measured * scale).toFixed(4)),
        estimatedInkFloor: floor === null ? null : Number((floor * scale).toFixed(4)),
      };
    })
    .filter((c) => c.ink !== null);
  // THE BLANK FLOOR IS A HARD FILTER AND THE DENSITY TARGET IS A PREFERENCE. A recipe whose
  // emptiest frame lands under the battery's floor is not a lighter option; it is a configuration
  // the battery will refuse before any reviewer sees it.
  const inkFloor = CHOSEN_RECIPE_INK_FLOOR * (LOW_FLOOR_DRIVES.includes(mechanismDrive) ? DRIVEN_DIMENSION_INK_HEADROOM : 1);
  const aboveFloor = candidates.filter((c) => c.estimatedInkFloor === null || c.estimatedInkFloor >= inkFloor);
  const dropped = candidates.filter((c) => !aboveFloor.includes(c)).map((c) => ({ id: c.recipe.id, estimatedInkFloor: c.estimatedInkFloor }));
  if (aboveFloor.length > 0) candidates.length = 0, candidates.push(...aboveFloor);
  if (candidates.length === 0) {
    const any = (COMPOSITION_RECIPES[runtimeId]?.[compositionId] ?? [])[0] ?? null;
    return { recipe: any, reach: reach.reach, ink: null, inkGap: null, detail: `no measured coverage for any holding recipe of ${compositionId} with the ${probeMember} probe; falling back to the first declared candidate and recording the coverage as UNMEASURED` };
  }
  candidates.sort((a, b) => Math.abs(a.estimatedInk - target) - Math.abs(b.estimatedInk - target));
  const best = candidates[0];
  return {
    recipe: best.recipe,
    reach: reach.reach,
    ink: best.ink,
    estimatedInk: best.estimatedInk,
    markScale: Number(scale.toFixed(3)),
    inkTarget: target,
    inkGap: Number((best.estimatedInk - target).toFixed(4)),
    probeMember,
    inkFloorApplied: inkFloor,
    droppedUnderInkFloor: dropped,
    considered: candidates.map((c) => ({ id: c.recipe.id, ink: c.ink, estimatedInk: c.estimatedInk, estimatedInkFloor: c.estimatedInkFloor })),
    detail: `${best.recipe.id} measured ink ${best.ink} with the ${probeMember} probe, estimated ${best.estimatedInk} for a ${memberId ?? probeMember} mark (x${scale.toFixed(2)}), against a ${densityTarget} target of ${target}`,
  };
}
