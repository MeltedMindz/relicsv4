// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MECHANISM VOCABULARY — what a market binding DOES to a picture, named.
//
// THE DEFECT THIS CLOSES. Round one of the benchmark authored twelve collections and every one of
// them performed the same transformation: everything got bigger or there was more of it. Nine of
// twelve blind reviews refused on `marketResponse`, and they refused with the same complaint in
// twelve different vocabularies —
//
//   "the brief specified a change in member COUNT and INTERVAL and what ships is a change in
//    SCALE and OPACITY"                                                                    (B01)
//   "the mechanism here is adding and removing elements, which is precisely the 'composition
//    rearranging itself' the brief names as the thing to avoid"                            (B05)
//   "the mass does not fracture under stress, it consolidates and brightens ... there are no
//    members in them to separate"                                                          (B09)
//   "a single uniform dilation of every element about a common centre"                     (B06)
//   "make stress actually subtract rather than shrink"                                     (B11)
//
// The author had ONE visible mechanism and four names for it. `marketAxis` offered DENSITY,
// STRUCTURE, SCALE and EROSION, and all four resolved to the same drive — SPREAD on the recursion
// runtime, COUNT on the vector one — so a brief asking for fracture, a brief asking for erosion
// and a brief asking for growth were handed identical bytes with different titles. That is not a
// mis-set parameter. It is a missing capability, and a vocabulary of four words that mean one
// thing is worse than a vocabulary of one word, because it makes the gap invisible.
//
// ------------------------------------------------------------------------------------------------
// SEVEN MECHANISMS, AND NOT EVERY RUNTIME HAS THEM
// ------------------------------------------------------------------------------------------------
// Each is a MAGNITUDE that the market moves, so "which way" is always answerable: the sensor
// decides which state the magnitude peaks in, and there are exactly two answers on this ring —
// DRAWDOWN peaks under stress, RECOVERY peaks in recovery. A brief that says "the interval widens
// under drawdown" is naming SEPARATION with its magnitude peaking at STRESS, and that is a
// complete instruction to the author.
//
// A mechanism a runtime cannot perform is NOT_EXPRESSIBLE and that is an ADMISSION fact. The whole
// point of the admission gate is that an impossible commission must never reach the author, and
// round one proved that a mechanism the runtime cannot draw is exactly as unsatisfiable as a
// horizon: B09 asked the recursion runtime to fracture a mass, five rounds were available, and the
// reviewer's closing sentence was "do not try to retrofit fracture onto the present radial
// rosettes; there are no members in them to separate."
//
// ------------------------------------------------------------------------------------------------
// EVERY EXPRESSIBLE / NOT_EXPRESSIBLE CLAIM CITES A MEASURED ROW
// ------------------------------------------------------------------------------------------------
// `evidence.row` names a candidate in `probe-candidates.js` and `evidence.weakestPairing` is the
// number that row measured on chain, at 120px, over eight seeds and three states. The floor those
// numbers are read against is `STATE_SEPARATION_FLOOR` (3.8), the same one the objective battery
// uses, which is the published Wave-1 calibration rather than one invented here.
//
// The atlas is CONSULTED and is not sufficient on its own, and the reason is worth stating: it
// measures one parameter at a time and reports ink coverage. Ink cannot distinguish a mass that
// breaks into four members from a mass that merely brightens — both can move coverage the same
// distance — and that distinction is precisely what nine of the twelve refusals were about. So
// four of the claims below rest on `componentCount` and `largestShare`, which the atlas never
// measured because it had no reason to.
//
// NOTHING HERE JUDGES A PICTURE. This module answers "can this runtime perform this named
// transformation, and with which drive". Whether the transformation it performed is the one the
// brief wanted is a question for a reviewer looking at the frames, and stays there.
// ================================================================================================

import { STATE_SEPARATION_FLOOR } from "../../art-review/src/perceptual.js";

/**
 * The seven named mechanisms, each with the MAGNITUDE the market moves.
 *
 * `magnitude` is not decoration: it is what makes polarity answerable. "Fracture under drawdown"
 * and "consolidate in recovery" are the same instruction, and they are only obviously the same
 * once the sentence is reduced to "brokenness peaks at STRESS".
 */
export const MECHANISMS = Object.freeze({
  FRACTURE: {
    id: "FRACTURE",
    magnitude: "how many separate pieces the work is in",
    what: "a connected mass breaks into separated members and its silhouette stops being one shape",
    measuredBy: "componentCount rises and largestShare falls",
  },
  SEPARATION: {
    id: "SEPARATION",
    magnitude: "the interval between members",
    what: "the members stay and the gaps between them open or close; nothing is added or removed",
    measuredBy: "extent rises while ink is roughly held",
  },
  SUBTRACTION: {
    id: "SUBTRACTION",
    magnitude: "how many members are present",
    what: "members are lost and returned; the work thins and refills",
    measuredBy: "ink and element count fall together",
  },
  OCCLUSION: {
    id: "OCCLUSION",
    magnitude: "how much of one register another covers",
    what: "a later register grows over an earlier one and hides it, then retreats",
    measuredBy: "largestShare rises as one register swallows the composition",
  },
  DISPLACEMENT: {
    id: "DISPLACEMENT",
    magnitude: "how far members sit from their aligned positions",
    what: "the members stay and stay the same size, and move or rotate out of alignment",
    measuredBy: "dE moves while ink, extent and component count are held",
  },
  THICKENING: {
    id: "THICKENING",
    magnitude: "the weight of the line",
    what: "the drawing gains or loses weight without changing what is drawn",
    measuredBy: "ink moves while element count and extent are held",
  },
  DILATION: {
    id: "DILATION",
    magnitude: "the overall size or reach of the work",
    what: "the whole figure grows and shrinks as one object",
    measuredBy: "extent moves while component count is held",
  },
});

export const MECHANISM_IDS = Object.freeze(Object.keys(MECHANISMS));

/** Where a magnitude peaks. There are exactly two answers on this fixture ring. */
export const POLARITIES = Object.freeze(["PEAKS_AT_STRESS", "PEAKS_AT_RECOVERY"]);

/**
 * The sensor that makes a magnitude peak in each state.
 *
 * MEASURED, in per mille through the LOG2 curve, on the review fixtures:
 *
 *     DRAWDOWN   326 / 981 / 552      peaks under stress
 *     RECOVERY   326 /   0 / 964      peaks in recovery, and reads EXACTLY ZERO under stress
 *
 * That zero is the single most consequential number in this file. It is harmless on a dimension
 * whose floor is a visible thing (SPREAD's floor is 16, a tight cluster; COUNT's floor is whatever
 * countMin the author chose) and it is a blank frame on a dimension whose floor is a bytecode
 * constant of 2. `VC-dilate-SIZE-REC` blanked eight seeds of eight at stress; the identical
 * construction on DRAWDOWN blanked none.
 */
export const SENSOR_FOR_POLARITY = Object.freeze({
  PEAKS_AT_STRESS: "DRAWDOWN",
  PEAKS_AT_RECOVERY: "RECOVERY",
});

/**
 * The curved per-mille reading of each usable sensor, per state.
 *
 * Reproduced here rather than recomputed so a reader can see WHY a realisation forbids a sensor.
 * The arithmetic itself lives in `binding.js`, and `assertSensorReadingsAgreeWithBinding()` checks
 * these against it rather than letting two tables drift.
 */
export const CURVED_READINGS = Object.freeze({
  "DRAWDOWN/LOG2": Object.freeze({ neutral: 326, stress: 981, recovery: 552 }),
  "RECOVERY/LOG2": Object.freeze({ neutral: 326, stress: 0, recovery: 964 }),
  "DRAWDOWN/LINEAR": Object.freeze({ neutral: 20, stress: 900, recovery: 80 }),
  "RECOVERY/LINEAR": Object.freeze({ neutral: 20, stress: 0, recovery: 820 }),
});

/**
 * THE TABLE. Per runtime, per mechanism: can it, with what, and what did the probe measure.
 *
 * `realisations` is ordered by preference and a realisation is only usable when its `requires` are
 * satisfiable by the composition the direction asks for — a THICKENING binding on a filled field
 * measured 0.000 on all three pairings and 6 of 6 byte-identical state pairs, so `stroke: true` is
 * not advice.
 */
export const MECHANISM_TABLE = Object.freeze({
  GEOMETRIC_RECURSION_V1: Object.freeze({
    DILATION: Object.freeze({
      expressible: true,
      realisations: Object.freeze([
        Object.freeze({
          drive: "SPREAD", curve: "LOG2", polarities: ["PEAKS_AT_STRESS", "PEAKS_AT_RECOVERY"],
          requires: Object.freeze({}),
          detail: "DRIVE_SPREAD sets the ROOT SIZE from the sensor, so the whole self-similar figure scales as one object. Its floor is the bytecode constant 40 of 256, which is a small figure and never a blank.",
          evidence: Object.freeze({ row: "GR-dilate-SPREAD-REC", weakestPairing: 10.932, extentByState: "0.648 neutral / 0.365 stress / 0.842 recovery", components: "1.625 -> 1.375, largestShare 0.997 -> 0.997", blankSeeds: 0 }),
        }),
        Object.freeze({
          drive: "CONTRACT", curve: "LOG2", polarities: ["PEAKS_AT_STRESS", "PEAKS_AT_RECOVERY"],
          requires: Object.freeze({ ruleSetIncludes: ["RING", "BRANCH"] }),
          detail: "Under RING and BRANCH the children sit at a radius equal to the parent's own size, so contraction moves the EXTENT of the whole work (the atlas measures 0.88 -> 0.99). Under QUAD, TRI, INSCRIBE and BSP the same parameter moves internal density instead and the extent is flat.",
          evidence: Object.freeze({ row: "GR-dilate-CONTRACT-RING", weakestPairing: 8.669, extentByState: "0.844 neutral / 0.672 stress / 0.964 recovery", components: "4.5 -> 1.5", blankSeeds: 0 }),
        }),
      ]),
    }),
    SUBTRACTION: Object.freeze({
      expressible: false,
      why: "the only drive that changes how many things are drawn is DEPTH, and it changes the DOCUMENT rather than the picture: the atlas measures thirty times the elements for +0.004 ink120, and the probe measures the browse-size difference between neutral and recovery at 0.348 dE against a floor of 3.8.",
      evidence: Object.freeze({ row: "GR-subtract-DEPTH", weakestPairing: 0.348, floor: STATE_SEPARATION_FLOOR }),
      alternative: "VECTOR_COMPOSITION_V1 subtracts with DRIVE_COUNT over a creator-owned floor",
    }),
    SEPARATION: Object.freeze({
      expressible: false,
      why: "there is no interval to open. Every production places children at a fixed relation to their parent, and the only parameter that changes that relation is contraction, which under QUAD/TRI shrinks the children rather than moving them apart — the probe measures the component count FALLING under stress (2.125 -> 1.25) where separation would raise it.",
      evidence: Object.freeze({ row: "GR-separate-CONTRACT-QUAD", weakestPairing: 6.933, components: "2.125 -> 1.25, largestShare 0.982 -> 0.987" }),
      alternative: "VECTOR_COMPOSITION_V1 separates with DRIVE_SPREAD at a pinned count",
    }),
    FRACTURE: Object.freeze({
      expressible: false,
      why: "the figure is one connected mass by construction and stays one under every drive: no recursion row the probe measured moved largestShare below 0.95, and law L5 fixes the root at the canvas centre with the children hung off it. A blind reviewer put it exactly: there are no members in them to separate.",
      evidence: Object.freeze({ row: "GR-dilate-CONTRACT-RING", largestShareRange: "0.952 -> 0.999 across every recursion row measured" }),
      alternative: "VECTOR_COMPOSITION_V1 fractures with DRIVE_SPREAD over a few large members",
    }),
    OCCLUSION: Object.freeze({
      expressible: false,
      why: "the atlas measures rules as layers over one shared centre that COMPOSE rather than bury — a second rule buys 26% more extent and the same two distinct fills — so there is no register that can be made to cover another.",
      evidence: Object.freeze({ atlasRow: "ruleCount", quote: "Rules are layers over one shared centre, and they compose rather than bury." }),
      alternative: "VECTOR_COMPOSITION_V1 occludes with DRIVE_SIZE on a later field",
    }),
    DISPLACEMENT: Object.freeze({
      expressible: false,
      why: "both candidate drives are dead at browse size. ROTATE measured 0.455 dE between neutral and recovery at a rotation ceiling of 90 — the atlas's own 6-of-6 identical figure was taken at rotation 0, where law L2 disables the drive, so this is a fresh measurement of the drive actually enabled. PRUNE measured EXACTLY 0.000: it rotates a keep-mask at a constant element count, which is a rearrangement the raster cannot see.",
      evidence: Object.freeze({ rows: ["GR-displace-ROTATE", "GR-displace-PRUNE", "GR-asymmetry"], weakestPairings: [0.455, 0.0, 0.0] }),
      alternative: "none: VECTOR_COMPOSITION_V1's JITTER measured 0.448 and is dead too",
    }),
    THICKENING: Object.freeze({
      expressible: false,
      why: "the runtime has six drives and none of them writes a stroke width. `stroke` is a creator constant the seed never touches and the market never reaches.",
      evidence: Object.freeze({ vocabulary: "RECURSION_DRIVES = DEPTH, PRUNE, CONTRACT, ROTATE, SPREAD, ASYMMETRY" }),
      alternative: "VECTOR_COMPOSITION_V1 thickens with DRIVE_WEIGHT on a stroked field",
    }),
  }),

  VECTOR_COMPOSITION_V1: Object.freeze({
    SUBTRACTION: Object.freeze({
      expressible: true,
      realisations: Object.freeze([
        Object.freeze({
          drive: "COUNT", curve: "LOG2", polarities: ["PEAKS_AT_STRESS", "PEAKS_AT_RECOVERY"],
          requires: Object.freeze({ minFields: 2, countRangeAtLeast: 18 }),
          detail: "countMin is one of only two creator-owned floors in either runtime, so the sparse state is as sparse as the author chose and never emptier. It needs at least two fields: run on ONE field the identical binding blanked seven seeds of eight, because a single register losing members leaves nothing behind.",
          evidence: Object.freeze({ row: "VC-subtract-3field", weakestPairing: 8.317, ink: "0.351 mean / 0.055 min", extent: 0.956, blankSeeds: 0, singleFieldControl: Object.freeze({ row: "VC-subtract-COUNT-REC", blankSeeds: 7, inkMin: 0.013 }) }),
        }),
      ]),
    }),
    SEPARATION: Object.freeze({
      expressible: true,
      realisations: Object.freeze([
        Object.freeze({
          drive: "SPREAD", curve: "LOG2", polarities: ["PEAKS_AT_STRESS", "PEAKS_AT_RECOVERY"],
          requires: Object.freeze({ pinnedCount: true, minFields: 2 }),
          detail: "spread is the half-extent a site may sit at from the canvas centre, and its floor of 16 is a visible tight cluster rather than a blank — which is what makes it safe on RECOVERY where SIZE is not. The count must be PINNED (countMin == countMax) or the work is subtracting at the same time and the reviewer cannot tell which mechanism it is watching.",
          evidence: Object.freeze({ row: "SEP-3field-fix", weakestPairing: 14.416, extentByState: "0.957 neutral / 0.968 stress / 0.995 recovery", components: "5.625 -> 2.625", blankSeeds: 0 }),
        }),
      ]),
    }),
    FRACTURE: Object.freeze({
      expressible: true,
      realisations: Object.freeze([
        Object.freeze({
          drive: "SPREAD", curve: "LINEAR", polarities: ["PEAKS_AT_STRESS"],
          requires: Object.freeze({ pinnedCount: true, fewLargeMembers: true, minFields: 2, secondSensorRegister: true }),
          detail: "A FEW LARGE members and a LINEAR curve. Linear is what makes this fracture rather than dilation: it leaves the neutral reading at 20 per mille, so the members resolve near the spread floor and OVERLAP INTO ONE MASS, and the stress reading of 900 pulls them to the frame. LOG2 lifts neutral to 326 and the mass is already broken before the market does anything.",
          evidence: Object.freeze({ row: "FRAC-a-3field", componentsByState: "1.0 neutral -> 2.875 stress", largestShareByState: "1.000 -> 0.895", weakestPairing: 3.64, blankSeeds: 0, mixedSensorRow: Object.freeze({ row: "FRAC-e-mixed", weakestPairing: 6.149 }) }),
        }),
      ]),
      note: "The neutral-to-recovery pairing is the one that fails here, and it fails for a reason the brief usually agrees with: a fracture brief asks recovery to consolidate BACK to neutral. `secondSensorRegister` is the requirement that answers it — one register bound to RECOVERY so recovery differs from neutral in some other way, which lifted the pairing from 3.64 to 6.149.",
    }),
    DILATION: Object.freeze({
      expressible: true,
      realisations: Object.freeze([
        Object.freeze({
          drive: "SIZE", curve: "LOG2", polarities: ["PEAKS_AT_STRESS"],
          requires: Object.freeze({ minFields: 2, sensorMustBe: "DRAWDOWN" }),
          detail: "SIZE is the loudest drive the runtime has and the most dangerous, because its floor is the bytecode constant 2 — an invisible element. It is usable ONLY on DRAWDOWN, whose curved reading never falls below 326 per mille. On RECOVERY, which reads exactly zero under stress, the identical construction blanked eight seeds of eight.",
          evidence: Object.freeze({ row: "VC-dilate-3field", weakestPairing: 5.849, blankSeeds: 0, blankControl: Object.freeze({ row: "VC-dilate-SIZE-REC", blankSeeds: 8 }) }),
        }),
        Object.freeze({
          drive: "SPREAD", curve: "LOG2", polarities: ["PEAKS_AT_STRESS", "PEAKS_AT_RECOVERY"],
          requires: Object.freeze({ pinnedCount: true, minFields: 2 }),
          detail: "When the magnitude must peak in RECOVERY, SIZE is unusable and the reach of the composition carries the dilation instead. This is the same drive SEPARATION uses and the difference is the composition it sits in: many small members read as an interval opening, few members that overlap read as one thing growing.",
          evidence: Object.freeze({ row: "VC-separate-SPREAD-REC", weakestPairing: 10.088, extentByState: "0.834 neutral / 0.357 stress / 1.000 recovery" }),
        }),
      ]),
    }),
    OCCLUSION: Object.freeze({
      expressible: true,
      realisations: Object.freeze([
        Object.freeze({
          drive: "SIZE", curve: "LOG2", polarities: ["PEAKS_AT_STRESS"],
          requires: Object.freeze({ minFields: 2, onLaterField: true, sensorMustBe: "DRAWDOWN" }),
          detail: "Fields are drawn in order, so a later field with a growing SIZE covers the earlier ones. The same DRAWDOWN-only rule applies: on RECOVERY the covering register vanishes at stress instead of retreating.",
          evidence: Object.freeze({ row: "VC-occlude-SIZE-over", weakestPairing: 5.296, largestShare: "0.642 -> 0.761", blankSeeds: 0 }),
        }),
      ]),
    }),
    THICKENING: Object.freeze({
      expressible: true,
      realisations: Object.freeze([
        Object.freeze({
          drive: "WEIGHT", curve: "LOG2", polarities: ["PEAKS_AT_STRESS", "PEAKS_AT_RECOVERY"],
          requires: Object.freeze({ strokedField: true, minFields: 2, secondSensorRegister: true }),
          detail: "WEIGHT writes stroke-width and nothing else, so on a FILLED field it is a binding that draws no difference — measured 0.000 on all three pairings. The curve must be LOG2: on LINEAR the neutral and recovery readings (20 and 80 per mille) resolved to the same stroke width and that pairing measured exactly 0.",
          evidence: Object.freeze({ row: "THICK-mixed", weakestPairing: 9.277, seedDiversity: "19.53 mean / 11.526 min", blankSeeds: 0, filledControl: Object.freeze({ row: "VC-thicken-WEIGHT-filled", allPairings: 0.0 }), linearControl: Object.freeze({ row: "VC-thicken-WEIGHT-line", neutralToRecovery: 0.0 }) }),
        }),
      ]),
    }),
    DISPLACEMENT: Object.freeze({
      expressible: false,
      why: "JITTER is the only drive that perturbs placement and it measured 0.448 dE between neutral and recovery. TWIST and DEPTH the atlas already records at 0.001. Neither runtime can move a member without also changing its size, its count or its distance from the centre.",
      evidence: Object.freeze({ row: "VC-displace-JITTER", weakestPairing: 0.448 }),
      alternative: "none in the Wave-1 catalog",
    }),
  }),
});

/** Which mechanisms a runtime can perform. DERIVED from the table, never listed. */
export function expressibleMechanisms(runtimeId) {
  const t = MECHANISM_TABLE[runtimeId];
  if (!t) throw new Error(`no mechanism table for runtime ${runtimeId}`);
  return Object.entries(t).filter(([, v]) => v.expressible).map(([k]) => k);
}

/** Can this runtime perform this mechanism at this polarity, and with what? */
export function realisationFor(runtimeId, mechanismId, polarity) {
  const t = MECHANISM_TABLE[runtimeId];
  if (!t) throw new Error(`no mechanism table for runtime ${runtimeId}`);
  const entry = t[mechanismId];
  if (!entry) {
    return { ok: false, reason: "UNDOCUMENTED", detail: `${runtimeId} has no recorded finding for ${mechanismId}; an undocumented mechanism is unproven, not available` };
  }
  if (!entry.expressible) {
    return { ok: false, reason: "NOT_EXPRESSIBLE", detail: entry.why, evidence: entry.evidence, alternative: entry.alternative };
  }
  const usable = entry.realisations.filter((r) => r.polarities.includes(polarity));
  if (usable.length === 0) {
    return {
      ok: false,
      reason: "POLARITY_UNREACHABLE",
      detail: `${runtimeId} can perform ${mechanismId}, but not with its magnitude ${polarity.replace("PEAKS_AT_", "peaking at ").toLowerCase()}: ` +
        entry.realisations.map((r) => `${r.drive} reaches ${r.polarities.join("/")}`).join("; "),
      evidence: entry.realisations[0].evidence,
    };
  }
  const chosen = usable[0];
  return {
    ok: true,
    mechanism: mechanismId,
    polarity,
    drive: chosen.drive,
    curve: chosen.curve,
    sensor: chosen.requires.sensorMustBe ?? SENSOR_FOR_POLARITY[polarity],
    requires: chosen.requires,
    detail: chosen.detail,
    evidence: chosen.evidence,
    alternatives: usable.slice(1).map((r) => ({ drive: r.drive, curve: r.curve })),
  };
}

// ------------------------------------------------------------------------------------------------
// READING A DIRECTION FOR THE MECHANISM IT ASKS FOR
// ------------------------------------------------------------------------------------------------
// The prose is split into CLAUSES and each clause is asked three questions: which mechanism, which
// direction (does the magnitude go up or down), and which market state. A clause that answers all
// three is a complete instruction; one that answers two is recorded as partial and the missing
// half is defaulted with the default NAMED, exactly as `deriveIntent` does.
//
// WHY CLAUSES AND NOT THE WHOLE FIELD. "Under drawdown the beds should thin and fewer of them
// survive; in recovery the sequence thickens and more beds return" carries both polarities in one
// sentence, and a document-wide match would take whichever pattern is declared first. That is the
// same failure the negation handling in `deriveIntent` was built for.
// ------------------------------------------------------------------------------------------------

const rx = (s) => new RegExp(s, "i");

/** The market states, in the words a brief uses for them. */
const STATE_PATTERNS = Object.freeze({
  STRESS: [rx(String.raw`\b(drawdown|stress|stressed|volatil\w+|crash\w*|decline|falling|sell[- ]off|downturn|adversity|damage)\b`)],
  RECOVERY: [rx(String.raw`\b(recover\w+|healing|heals|settle\w*|calm\w*|return\w*\s+to|rally|rebound\w*|repair\w*)\b`)],
});

/**
 * Per mechanism: the phrases that RAISE its magnitude and the phrases that LOWER it.
 *
 * The lists are deliberately about what the picture DOES rather than about mood. "Broken",
 * "severed", "comes apart" raise FRACTURE; "brutalist" and "solemn" say nothing about it and are
 * not here. A vocabulary that reads atmosphere would refuse or mis-route on adjectives, which is
 * the invisible failure `capabilities.js` warns about in its own header.
 */
export const MECHANISM_PHRASES = Object.freeze({
  FRACTURE: {
    raise: [rx(String.raw`\b(fractur\w+|shatter\w*|splinter\w*|ruptur\w+|cleav\w+|comes?\s+apart|breaks?\s+(apart|up)|breaking|broken|sever(s|ed|ing|ance)\b|silhouette\s+break\w*|members?\s+separat\w+)\b`)],
    lower: [rx(String.raw`\b(consolidat\w+|reassembl\w+|knits?\s+back|whole\s+again|fuses?|coheres?|becomes?\s+one|heals?\s+(shut|over)|re[- ]?forms?)\b`)],
  },
  SEPARATION: {
    raise: [rx(String.raw`\b(interval\s+\w{0,6}\s*widen\w*|widen\w+|loosen\w+|spread\w*\s+apart|spreading\s+apart|separat\w+|gaps?\s+open\w*|opens?\s+(out|up)|dispers\w+|pull\w*\s+apart|further\s+apart)\b`)],
    lower: [rx(String.raw`\b(tighten\w*|closes?\s+(up|again|in)|draws?\s+(in|together)|contract\w+\s+toward|pulls?\s+\w{0,6}\s*back\s+toward|clusters?|packs?\s+(in|together)|narrow\w+)\b`)],
  },
  SUBTRACTION: {
    raise: [rx(String.raw`\b(multipl\w+|proliferat\w+|more\s+(marks|members|elements|beds|bays|cells|of\s+them)|fills?\s+back\s+in|thickens?|denser|more\s+numerous|returns?|regrow\w*|accretes?|adds?\s+members)\b`)],
    lower: [rx(String.raw`\b(lose\s+members|loses?\s+\w{0,8}\s*members|fewer|thins?\b|thinning|thinner|retracts?|reduc\w+|strip\w+|removed?\b|removing|survives?\b|attrition|sparser|erod\w+|decay\w*|dissolv\w+|wear\w*\s+away)\b`)],
  },
  OCCLUSION: {
    raise: [rx(String.raw`\b(covers?\b|covering|obscur\w+|hides?\b|hiding|buries|buried|swallow\w*|engulf\w+|overgrow\w+|smother\w+)\b`)],
    lower: [rx(String.raw`\b(uncover\w+|reveal\w+|exposes?\b|retreats?|withdraw\w+|clears?\s+(away|off))\b`)],
  },
  DISPLACEMENT: {
    raise: [rx(String.raw`\b(shear\w*|skew\w*|slips?\b|slipping|misalign\w+|out\s+of\s+alignment|jitter\w*|shift\w*\s+out\s+of|rotates?\s+out|twists?\s+out)\b`)],
    lower: [rx(String.raw`\b(realign\w+|settles?\s+back\s+into|straighten\w*|squares?\s+up)\b`)],
  },
  THICKENING: {
    raise: [rx(String.raw`\b(thicken\w*\s+(the\s+)?(line|stroke|weight)|lines?\s+\w{0,6}\s*thicken\w*|heavier\s+(line|stroke)|gains?\s+weight|weight\s+increas\w+|bolder)\b`)],
    lower: [rx(String.raw`\b(thins?\s+(the\s+)?(line|stroke)|lines?\s+\w{0,6}\s*thin\w*|lighter\s+(line|stroke)|loses?\s+weight|hairline\w*\s+further)\b`)],
  },
  DILATION: {
    raise: [rx(String.raw`\b(expand\w+|grow\w+|swell\w+|enlarg\w+|larger|bigger|reach\w+\s+(further|outward|out)|pushe?s?\s+\w{0,6}\s*outward|extends?\s+(further|outward)|scale\w*\s+up)\b`)],
    lower: [rx(String.raw`\b(contract\w+|shrink\w+|smaller|draws?\s+in\b|pulls?\s+\w{0,10}\s*back\s+toward\s+the\s+cent(re|er)|recedes?|diminish\w+|scale\w*\s+down)\b`)],
  },
});

/** Negators, in the same shape `author.js` uses, for the same measured reason. */
const NEGATORS = /\b(no|not|never|without|avoid\w*|free\s+of|absent|lack\w*|refus\w*|rather\s+than|instead\s+of|must\s+not|should\s+not|cannot)\b/i;

/** Split into clauses at the punctuation a writer actually uses to change subject. */
function clausesOf(text) {
  return String(text ?? "")
    .split(/(?<=[.;:!?])\s+|\s+—\s+|\s+--\s+|\n+/)
    .flatMap((s) => s.split(/,\s+(?=(?:and\s+)?(?:in|under|during|on|as|while|when)\b)/i))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Every state word in a clause, with where it sits.
 *
 * THE STATE IS RESOLVED PER MATCH, BY PROXIMITY, AND THAT IS NOT A REFINEMENT. "It contracts under
 * drawdown and expands again in recovery" is ONE clause naming both states, and a clause-level
 * state resolver hands both verbs the first one — so "expands" was read as expanding under
 * drawdown and B05, B07 and B10 all came out with their market response exactly backwards. Seven
 * of twelve round-one reviews reported an inverted polarity; this is one of the two ways it
 * happened.
 */
function stateHits(clause) {
  const hits = [];
  for (const [state, pats] of Object.entries(STATE_PATTERNS)) {
    for (const p of pats) {
      for (const m of clause.matchAll(new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`))) {
        hits.push({ state, at: m.index, phrase: m[0] });
      }
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}

/**
 * Split a clause into SEGMENTS at the conjunctions that change subject.
 *
 * "It contracts under drawdown and expands again in recovery" is one clause and two instructions,
 * and attributing both verbs to the nearest state word by raw distance gives "expands" the
 * DRAWDOWN that sits fifteen characters behind it rather than the RECOVERY nineteen ahead. That is
 * B05's market response inverted, and B10's, by an arithmetic tie-break nobody would defend if
 * they saw it written down.
 */
function segmentsOf(clause) {
  const out = [];
  const re = /\s+and\s+|\s+while\s+|\s+but\s+|\s+whereas\s+|,\s+/g;
  let last = 0;
  for (const m of clause.matchAll(re)) {
    out.push({ text: clause.slice(last, m.index), at: last });
    last = m.index + m[0].length;
  }
  out.push({ text: clause.slice(last), at: last });
  return out.filter((s) => s.text.trim().length > 0);
}

/**
 * The state a verb is about: the one in its OWN segment if there is one, otherwise the nearest
 * state word BEFORE it in the clause.
 *
 * The preceding-state fallback is how English subordination works — "recovery pushes the colony
 * outward and multiplies its members" carries `recovery` forward into the second verb, and a
 * nearest-by-distance rule hands it the `stress` that opens the next sentence fragment.
 */
function stateForMatch(hits, segments, index) {
  const seg = segments.find((s) => index >= s.at && index < s.at + s.text.length) ?? null;
  if (seg) {
    const inSeg = hits.filter((h) => h.at >= seg.at && h.at < seg.at + seg.text.length);
    if (inSeg.length) {
      let best = inSeg[0];
      for (const h of inSeg) if (Math.abs(h.at - index) < Math.abs(best.at - index)) best = h;
      return best;
    }
  }
  const before = hits.filter((h) => h.at <= index);
  if (before.length) return before[before.length - 1];
  return hits.length ? hits[0] : null;
}

/**
 * Read the mechanisms a direction (or a brief) asks for.
 *
 * Returns EVERY mechanism it found with a resolved polarity, ordered by how much evidence backs
 * each — a direction may legitimately ask for two, and B01 does: members are lost AND the interval
 * widens. The caller decides how many it can carry; this reports what was asked.
 */
export function mechanismsRequestedBy(text) {
  const clauses = clausesOf(text);
  const found = new Map();
  const rejected = [];

  for (const clause of clauses) {
    const hits = stateHits(clause);
    const segments = segmentsOf(clause);
    for (const [id, phrases] of Object.entries(MECHANISM_PHRASES)) {
      for (const [direction, patterns] of [["raise", phrases.raise], ["lower", phrases.lower]]) {
        for (const p of patterns) {
          const m = p.exec(clause);
          if (!m) continue;
          const before = clause.slice(0, m.index);
          if (NEGATORS.test(before.split(/[,;]/).pop() ?? before)) {
            rejected.push({ mechanism: id, phrase: m[0], clause: clause.slice(0, 160), why: "negated in its own clause" });
            continue;
          }
          // The magnitude peaks where it is RAISED, and peaks in the other state where it is LOWERED.
          const st = stateForMatch(hits, segments, m.index);
          const polarity = st === null
            ? null
            : (direction === "raise"
              ? (st.state === "STRESS" ? "PEAKS_AT_STRESS" : "PEAKS_AT_RECOVERY")
              : (st.state === "STRESS" ? "PEAKS_AT_RECOVERY" : "PEAKS_AT_STRESS"));
          const key = id;
          const cur = found.get(key) ?? { mechanism: id, votes: [], polarityVotes: {} };
          cur.votes.push({ phrase: m[0], direction, state: st?.state ?? null, polarity, clause: clause.slice(0, 160) });
          if (polarity) cur.polarityVotes[polarity] = (cur.polarityVotes[polarity] ?? 0) + 1;
          found.set(key, cur);
        }
      }
    }
  }

  const out = [...found.values()].map((v) => {
    const ranked = Object.entries(v.polarityVotes).sort((a, b) => b[1] - a[1]);
    return {
      mechanism: v.mechanism,
      // A mechanism named with no state attached is REAL but UNPOLARISED, and the author is told
      // so rather than handed a silent default. An unpolarised mechanism that reaches a binding
      // has a 50% chance of rendering the brief backwards, which is what seven of twelve round-one
      // reviews reported.
      polarity: ranked.length ? ranked[0][0] : null,
      polarityConfidence: ranked.length ? ranked[0][1] : 0,
      contested: ranked.length > 1 && ranked[0][1] === ranked[1][1],
      evidence: v.votes.slice(0, 4),
      votes: v.votes.length,
    };
  });
  out.sort((a, b) => b.votes - a.votes || MECHANISM_IDS.indexOf(a.mechanism) - MECHANISM_IDS.indexOf(b.mechanism));
  return { mechanisms: out, rejected, clauses: clauses.length };
}

/**
 * Which Wave-1 runtimes can carry the mechanisms a brief asks for.
 *
 * This is the function admission calls. A mechanism no runtime can express is a blocker of exactly
 * the same kind as a horizon, and it is reported in the same shape so the caller does not need two
 * ways of saying "this cannot be made".
 */
export function mechanismAdmission(text, runtimeIds = Object.keys(MECHANISM_TABLE)) {
  const requested = mechanismsRequestedBy(text);
  const perRuntime = runtimeIds.map((runtimeId) => {
    const rows = requested.mechanisms.map((m) => {
      const polarity = m.polarity ?? "PEAKS_AT_RECOVERY";
      const r = realisationFor(runtimeId, m.mechanism, polarity);
      return { mechanism: m.mechanism, polarity, assumedPolarity: m.polarity === null, ...r };
    });
    return {
      runtimeId,
      canExpress: rows.filter((r) => r.ok).map((r) => r.mechanism),
      cannotExpress: rows.filter((r) => !r.ok).map((r) => ({ mechanism: r.mechanism, reason: r.reason, detail: r.detail, alternative: r.alternative })),
      // The PRIMARY mechanism is the one with the most evidence in the prose. A runtime that can
      // carry the primary is viable even if it cannot carry a secondary; a runtime that cannot
      // carry the primary is not, whatever else it can do.
      carriesPrimary: requested.mechanisms.length === 0 ? null : rows[0]?.ok === true,
    };
  });
  const viable = perRuntime.filter((r) => r.carriesPrimary !== false);
  return {
    requested: requested.mechanisms,
    rejected: requested.rejected,
    perRuntime,
    viable: viable.map((r) => r.runtimeId),
    // No mechanism named at all is NOT a refusal. Plenty of briefs describe the market in words
    // this vocabulary does not have, and refusing them would be the invisible failure again.
    outcome: requested.mechanisms.length === 0
      ? "NO_MECHANISM_NAMED"
      : (viable.length === 0 ? "MECHANISM_NOT_EXPRESSIBLE_BY_CURRENT_WAVE1_CATALOG" : "ADMITTED"),
    detail: requested.mechanisms.length === 0
      ? "the direction names no mechanism this vocabulary recognises; the author will choose one from the composition and record that it did"
      : (viable.length === 0
        ? `the primary mechanism asked for is ${requested.mechanisms[0].mechanism}, and neither Wave-1 runtime can perform it: ` +
          perRuntime.map((r) => `${r.runtimeId} — ${r.cannotExpress[0]?.detail ?? "no finding"}`).join(" / ")
        : `${viable.length} of ${runtimeIds.length} runtimes can carry the primary mechanism ${requested.mechanisms[0].mechanism}`),
  };
}

/**
 * Re-derive `CURVED_READINGS` from `binding.js` and refuse if the two disagree.
 *
 * The table above is transcribed so a reader can see why a realisation forbids a sensor without
 * running the arithmetic. A transcription that drifts from its source is how a "measured" claim
 * becomes a confident wrong one, which is the failure this whole package was rebuilt around.
 */
export async function assertSensorReadingsAgreeWithBinding() {
  const { applyCurve, sensorPerMille } = await import("./binding.js");
  const problems = [];
  for (const [key, stated] of Object.entries(CURVED_READINGS)) {
    const [sensor, curve] = key.split("/");
    for (const state of ["neutral", "stress", "recovery"]) {
      const computed = applyCurve(curve, sensorPerMille(sensor, state));
      if (computed !== stated[state]) problems.push(`${key} at ${state}: table says ${stated[state]}, binding.js computes ${computed}`);
    }
  }
  if (problems.length) throw new Error(`CURVED_READINGS_DRIFTED —\n  ${problems.join("\n  ")}`);
  return { ok: true, checked: Object.keys(CURVED_READINGS).length * 3 };
}

/**
 * Refuse a mechanism table whose evidence rows have been deleted from the probe.
 *
 * Every `expressible: true` and every `expressible: false` claim names a probe candidate. If the
 * candidate is gone the claim has lost its measurement, and a claim that cannot be re-measured is
 * exactly the kind of confident assertion this package exists to stop making.
 */
export async function assertMechanismEvidenceExists() {
  const { MECHANISM_PROBE_CANDIDATES } = await import("./probe-candidates.js");
  const known = new Set(MECHANISM_PROBE_CANDIDATES.map((c) => c.name));
  const missing = [];
  for (const [runtimeId, table] of Object.entries(MECHANISM_TABLE)) {
    for (const [mechanismId, entry] of Object.entries(table)) {
      const rows = entry.expressible
        ? entry.realisations.map((r) => r.evidence?.row).filter(Boolean)
        : [entry.evidence?.row, ...(entry.evidence?.rows ?? [])].filter(Boolean);
      for (const row of rows) {
        if (!known.has(row)) missing.push(`${runtimeId}/${mechanismId} cites probe row "${row}", which no longer exists`);
      }
    }
  }
  if (missing.length) throw new Error(`MECHANISM_EVIDENCE_MISSING —\n  ${missing.join("\n  ")}`);
  return { ok: true, runtimes: Object.keys(MECHANISM_TABLE).length };
}
