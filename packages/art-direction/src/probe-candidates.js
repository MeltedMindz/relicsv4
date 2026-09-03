// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MECHANISM PROBE'S CANDIDATE SET — one configuration per claim the mechanism table makes.
//
// EVERY ROW HERE EXISTS TO SETTLE ONE QUESTION, and the question is written on the row. They are
// not example art and must never be used as one: each is deliberately minimal, holding everything
// constant except the thing being asked about, which makes them poor artworks and good
// measurements. `mechanism.js` cites the row by name; if a row is deleted the citation fails
// loudly rather than the claim quietly becoming unevidenced.
//
// THE TWO REFERENCE ROWS ARE THE SHIPPED TEMPLATES. `GR-ref-compass` and `VC-ref-alluvium` are
// `presetConfig()` verbatim, so every other row is read against work that passed a blind review
// rather than against an absolute number nobody has calibrated.
//
// SEEDS ARE THE PROBE'S OWN AND ARE DISJOINT FROM EVERY BENCHMARK GROUP. Measuring a mechanism on
// the seeds a final reviewer will judge would leak the holdout into the parameter choice, which is
// the whole failure the holdout discipline exists to prevent.
// ================================================================================================

import { presetConfig } from "../../art-review/src/runtimes.js";

/** One dark ground and three working colours, shared by every authored row so colour is not a variable. */
const PALETTE = Object.freeze(["#0f1113", "#59636b", "#b07d3a", "#d9d2c2"]);

const grv1 = (rules, over = {}) => ({
  version: 2,
  flags: ["DEPTH_PALETTE"],
  groundMode: "FLAT",
  groundIx: 0,
  groundIx2: 0,
  palette: [...PALETTE],
  traits: [],
  title: "Probe",
  ...over,
  rules,
});

const grRule = (over = {}) => ({
  shapeSet: ["SQUARE", "DIAMOND", "HEX"],
  ruleSet: ["QUAD", "TRI"],
  paletteIx: 2,
  sensor: "RECOVERY",
  curve: "LOG2",
  drive: "SPREAD",
  depthMin: 4,
  depthMax: 4,
  branch: 2,
  contraction: 60,
  rotation: 12,
  prune: 3,
  symSet: ["NONE", "ROT3"],
  stroke: false,
  variant: 0,
  ...over,
});

const vcv1 = (fields, over = {}) => ({
  version: 1,
  flags: [],
  groundMode: "FLAT",
  groundIx: 0,
  groundIx2: 0,
  palette: [...PALETTE],
  traits: [],
  title: "Probe",
  ...over,
  fields,
});

const vcField = (over = {}) => ({
  layout: "GRID",
  primitive: "RECT",
  paletteIx: 2,
  sensor: "RECOVERY",
  curve: "LOG2",
  drive: "COUNT",
  countMin: 18,
  countMax: 18,
  sizeMax: 24,
  spreadMax: 128,
  symmetry: "NONE",
  variant: 0,
  stroke: false,
  ...over,
});

export const MECHANISM_PROBE_CANDIDATES = Object.freeze([
  // ---- references -----------------------------------------------------------------------------
  { name: "GR-ref-compass", runtimeId: "GEOMETRIC_RECURSION_V1", note: "the shipped SHIP template; every GR row is read against this", config: presetConfig("GEOMETRIC_RECURSION_V1") },
  { name: "VC-ref-alluvium", runtimeId: "VECTOR_COMPOSITION_V1", note: "the shipped SHIP template; every VC row is read against this", config: presetConfig("VECTOR_COMPOSITION_V1") },

  // ---- GEOMETRIC_RECURSION_V1: which drive moves the picture, and between which states ---------
  { name: "GR-dilate-SPREAD-REC", runtimeId: "GEOMETRIC_RECURSION_V1", note: "DILATION: root size from RECOVERY. Smallest under stress, largest in recovery.", config: grv1([grRule({ drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2" })]) },
  { name: "GR-dilate-SPREAD-DD", runtimeId: "GEOMETRIC_RECURSION_V1", note: "the same drive on DRAWDOWN — the polarity check. Largest under stress.", config: grv1([grRule({ drive: "SPREAD", sensor: "DRAWDOWN", curve: "LOG2" })]) },
  { name: "GR-dilate-CONTRACT-RING", runtimeId: "GEOMETRIC_RECURSION_V1", note: "CONTRACT under RING/BRANCH, where the atlas measures it as an EXTENT control (0.88 -> 0.99).", config: grv1([grRule({ drive: "CONTRACT", sensor: "RECOVERY", curve: "LOG2", ruleSet: ["RING", "BRANCH"], contraction: 90, branch: 2, depthMin: 3, depthMax: 3 })]) },
  { name: "GR-separate-CONTRACT-QUAD", runtimeId: "GEOMETRIC_RECURSION_V1", note: "CONTRACT under QUAD/TRI, where it is a DENSITY control: children a fifth of the parent (separate levels) up to nearly parent-size (overlapping mass).", config: grv1([grRule({ drive: "CONTRACT", sensor: "RECOVERY", curve: "LOG2", contraction: 90 })]) },
  { name: "GR-displace-ROTATE", runtimeId: "GEOMETRIC_RECURSION_V1", note: "DISPLACEMENT: per-level angle, at a NON-ZERO ceiling. The atlas measured this drive dead only at rotation 0, where law L2 disables it.", config: grv1([grRule({ drive: "ROTATE", sensor: "DRAWDOWN", curve: "LINEAR", rotation: 90 })]) },
  { name: "GR-subtract-DEPTH", runtimeId: "GEOMETRIC_RECURSION_V1", note: "SUBTRACTION by generation count. The atlas says the document changes 30x and the picture does not; this asks whether that holds at a browse-size dE rather than at ink.", config: grv1([grRule({ drive: "DEPTH", sensor: "RECOVERY", curve: "LOG2", depthMin: 1, depthMax: 5 })]) },
  { name: "GR-displace-PRUNE", runtimeId: "GEOMETRIC_RECURSION_V1", note: "PRUNE at branch 3 with a mask that is neither all-ones nor single-bit, and no BSP in the set — the three conditions law L2 and L3 say make it dead.", config: grv1([grRule({ drive: "PRUNE", sensor: "DRAWDOWN", curve: "LINEAR", branch: 3, prune: 5, depthMin: 3, depthMax: 3 })]) },
  { name: "GR-asymmetry", runtimeId: "GEOMETRIC_RECURSION_V1", note: "ASYMMETRY, the sixth drive, which the atlas measures at 2 of 6 identical and never explains.", config: grv1([grRule({ drive: "ASYMMETRY", sensor: "DRAWDOWN", curve: "LINEAR", symSet: ["NONE", "ROT3", "ROT6"] })]) },
  { name: "GR-sym-none", runtimeId: "GEOMETRIC_RECURSION_V1", note: "symSet {NONE}: the non-rosette baseline. Extent and seed diversity without any rotational replication.", config: grv1([grRule({ symSet: ["NONE"] })]) },
  { name: "GR-sym-rot", runtimeId: "GEOMETRIC_RECURSION_V1", note: "symSet {ROT3, ROT6}: the rosette. Twelve blind reviews named this reading in six of twelve cases.", config: grv1([grRule({ symSet: ["ROT3", "ROT6"] })]) },
  { name: "GR-sets-wide", runtimeId: "GEOMETRIC_RECURSION_V1", note: "compass's own set widths — four symmetries, four productions, three shapes — on this probe's skeleton. The seed-diversity question.", config: grv1([grRule({ shapeSet: ["SQUARE", "DIAMOND", "HEX"], ruleSet: ["QUAD", "TRI", "BRANCH", "RING"], symSet: ["NONE", "MIRROR_X", "ROT3", "ROT6"], contraction: 82, depthMin: 3, depthMax: 3 })]) },
  { name: "GR-sets-narrow", runtimeId: "GEOMETRIC_RECURSION_V1", note: "one member per set. The seed reaches nothing categorical, which is the shape of the `idol` failure.", config: grv1([grRule({ shapeSet: ["SQUARE"], ruleSet: ["QUAD"], symSet: ["NONE"] })]) },
  { name: "GR-linework", runtimeId: "GEOMETRIC_RECURSION_V1", note: "stroke true: the loudest coverage control in the runtime, and what a fine-line brief needs.", config: grv1([grRule({ stroke: true })], { flags: ["DEPTH_PALETTE", "OUTLINE"] }) },
  { name: "GR-two-rule", runtimeId: "GEOMETRIC_RECURSION_V1", note: "two rules on opposed sensors — the atlas's stated minimum for three distinguishable states.", config: grv1([grRule({ drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2" }), grRule({ drive: "CONTRACT", sensor: "DRAWDOWN", curve: "LOG2", ruleSet: ["RING", "BRANCH"], contraction: 90, paletteIx: 1, depthMin: 3, depthMax: 3 })]) },

  // ---- VECTOR_COMPOSITION_V1 -------------------------------------------------------------------
  { name: "VC-subtract-COUNT-REC", runtimeId: "VECTOR_COMPOSITION_V1", note: "SUBTRACTION: members are lost. countMin is a CREATOR-OWNED floor, so the low state is sparse rather than blank.", config: vcv1([vcField({ drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 4, countMax: 40 })]) },
  { name: "VC-subtract-COUNT-DD", runtimeId: "VECTOR_COMPOSITION_V1", note: "the same drive on DRAWDOWN — the polarity check. More members under stress.", config: vcv1([vcField({ drive: "COUNT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 4, countMax: 40 })]) },
  { name: "VC-separate-SPREAD-REC", runtimeId: "VECTOR_COMPOSITION_V1", note: "SEPARATION: the count is pinned and only the interval moves. Floor 16 is a visible tight cluster, not a blank.", config: vcv1([vcField({ drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 20, countMax: 20 })]) },
  { name: "VC-fracture-SPREAD-DD", runtimeId: "VECTOR_COMPOSITION_V1", note: "FRACTURE: a few large members that overlap into one mass at the spread floor and separate as it rises. DRAWDOWN, so they come apart under stress.", config: vcv1([vcField({ layout: "SCATTER", drive: "SPREAD", sensor: "DRAWDOWN", curve: "LOG2", countMin: 6, countMax: 6, sizeMax: 56, spreadMax: 128 })]) },
  { name: "VC-fracture-SPREAD-REC", runtimeId: "VECTOR_COMPOSITION_V1", note: "the same construction on RECOVERY: consolidates under stress, comes apart in recovery.", config: vcv1([vcField({ layout: "SCATTER", drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 6, countMax: 6, sizeMax: 56, spreadMax: 128 })]) },
  { name: "VC-thicken-WEIGHT-rect", runtimeId: "VECTOR_COMPOSITION_V1", note: "THICKENING: WEIGHT writes stroke-width and nothing else. Measured 0.000 filled and 0.096 stroked, so the field must be stroked for the binding to exist at all.", config: vcv1([vcField({ drive: "WEIGHT", sensor: "DRAWDOWN", curve: "LINEAR", stroke: true, countMin: 20, countMax: 20 })], { flags: ["OUTLINE"] }) },
  { name: "VC-thicken-WEIGHT-line", runtimeId: "VECTOR_COMPOSITION_V1", note: "the same drive on LINE, which the runtime always strokes whatever the flag says.", config: vcv1([vcField({ primitive: "LINE", layout: "LINEFIELD", drive: "WEIGHT", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 22, countMax: 22 })]) },
  { name: "VC-thicken-WEIGHT-filled", runtimeId: "VECTOR_COMPOSITION_V1", note: "the negative control: the identical binding on a FILLED field, where the atlas measured 6 of 6 byte-identical state pairs.", config: vcv1([vcField({ drive: "WEIGHT", sensor: "DRAWDOWN", curve: "LINEAR", stroke: false, countMin: 20, countMax: 20 })]) },
  { name: "VC-erode-SIZE-secondary", runtimeId: "VECTOR_COMPOSITION_V1", note: "EROSION on a SECONDARY register: field 1 shrinks to the size floor of 2 and vanishes while field 0 carries the composition alone.", config: vcv1([vcField({ drive: "COUNT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 16, countMax: 22 }), vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 3, drive: "SIZE", sensor: "RECOVERY", curve: "LOG2", countMin: 10, countMax: 10, sizeMax: 40, spreadMax: 112 })]) },
  { name: "VC-dilate-SIZE-DD", runtimeId: "VECTOR_COMPOSITION_V1", note: "SIZE on the ONLY field, driven by DRAWDOWN — whose curved floor is 326 per mille rather than 0, so the low state is small rather than empty.", config: vcv1([vcField({ drive: "SIZE", sensor: "DRAWDOWN", curve: "LOG2", countMin: 12, countMax: 12, sizeMax: 56 })]) },
  { name: "VC-dilate-SIZE-REC", runtimeId: "VECTOR_COMPOSITION_V1", note: "the blank-frame control: SIZE driven by RECOVERY, which reads ZERO at stress, so every element resolves to the bytecode floor of 2.", config: vcv1([vcField({ drive: "SIZE", sensor: "RECOVERY", curve: "LOG2", countMin: 12, countMax: 12, sizeMax: 56 })]) },
  { name: "VC-displace-JITTER", runtimeId: "VECTOR_COMPOSITION_V1", note: "DISPLACEMENT: per-site perturbation. The atlas measures 0.017 ink filled, which is movement without coverage.", config: vcv1([vcField({ drive: "JITTER", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 24, countMax: 24 })]) },
  { name: "VC-stack-bands", runtimeId: "VECTOR_COMPOSITION_V1", note: "the only layout that reads as horizontal bands, with COUNT driven: beds lost and returned.", config: vcv1([vcField({ layout: "STACK", drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 6, countMax: 34, sizeMax: 20, spreadMax: 128 })]) },
  { name: "VC-extent-1field", runtimeId: "VECTOR_COMPOSITION_V1", note: "ONE field at the spread ceiling. The 'centred island with dead margin on all four sides' question, asked directly.", config: vcv1([vcField({ countMin: 20, countMax: 20, spreadMax: 128 })]) },
  { name: "VC-extent-3field", runtimeId: "VECTOR_COMPOSITION_V1", note: "THREE fields all at the spread ceiling. Each draws its own seed byte, so the reach of the whole is the maximum of three draws rather than one.", config: vcv1([vcField({ countMin: 18, countMax: 18, spreadMax: 128 }), vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 3, countMin: 14, countMax: 14, spreadMax: 128, sizeMax: 18 }), vcField({ layout: "LINEFIELD", primitive: "LINE", paletteIx: 1, countMin: 16, countMax: 16, spreadMax: 128, sizeMax: 20 })]) },
  { name: "VC-extent-3field-tapered", runtimeId: "VECTOR_COMPOSITION_V1", note: "the same three fields with the secondaries held INSIDE the primary, which is what the round-1 author did.", config: vcv1([vcField({ countMin: 18, countMax: 18, spreadMax: 124 }), vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 3, countMin: 14, countMax: 14, spreadMax: 110, sizeMax: 18 }), vcField({ layout: "LINEFIELD", primitive: "LINE", paletteIx: 1, countMin: 16, countMax: 16, spreadMax: 96, sizeMax: 20 })]) },

  // ---- round 2: the constructions the mechanism table actually names --------------------------
  // Round 1 established which drives move a raster. These rows establish the CONSTRUCTION each
  // named mechanism needs around that drive — the count, the size, the curve and the number of
  // fields — because a drive on its own produced blank frames on a third of the seeds.
  { name: "GR-two-rule-symnone", runtimeId: "GEOMETRIC_RECURSION_V1", note: "two rules, opposed sensors, NO rotational symmetry: the non-rosette default. Six of twelve blind reviews read the round-1 work as a rosette or medallion.", config: grv1([grRule({ drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", symSet: ["NONE", "MIRROR_X"], shapeSet: ["SQUARE", "DIAMOND", "HEX"], ruleSet: ["QUAD", "TRI", "BSP"] }), grRule({ drive: "CONTRACT", sensor: "DRAWDOWN", curve: "LOG2", ruleSet: ["BRANCH", "QUAD"], contraction: 90, paletteIx: 1, symSet: ["NONE", "MIRROR_X"], depthMin: 3, depthMax: 3 })]) },
  { name: "GR-two-rule-linework", runtimeId: "GEOMETRIC_RECURSION_V1", note: "the same pair stroked. Linework is the second loudest coverage control and the first thing a delicate brief needs; it is also where the ink floor is nearest.", config: grv1([grRule({ drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", stroke: true, symSet: ["NONE", "ROT3", "ROT6"], ruleSet: ["QUAD", "TRI", "RING"] }), grRule({ drive: "CONTRACT", sensor: "DRAWDOWN", curve: "LOG2", ruleSet: ["RING", "BRANCH"], contraction: 90, paletteIx: 3, stroke: true, symSet: ["NONE", "ROT3"], depthMin: 3, depthMax: 3 })], { flags: ["DEPTH_PALETTE", "OUTLINE"] }) },
  { name: "GR-nest-inward", runtimeId: "GEOMETRIC_RECURSION_V1", note: "INSCRIBE, the production whose children sit at the parent's own centre — nesting inward, which is what an arcade of bays at descending scale is.", config: grv1([grRule({ drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", ruleSet: ["INSCRIBE", "QUAD"], symSet: ["NONE", "MIRROR_X"], contraction: 82, depthMin: 5, depthMax: 5 }), grRule({ drive: "CONTRACT", sensor: "DRAWDOWN", curve: "LOG2", ruleSet: ["INSCRIBE", "TRI"], contraction: 90, paletteIx: 1, symSet: ["NONE", "ROT3"], depthMin: 4, depthMax: 4 })]) },

  { name: "VC-fracture-LINEAR-DD", runtimeId: "VECTOR_COMPOSITION_V1", note: "FRACTURE, properly constructed: a few LARGE members and a LINEAR curve, so the spread resolves near its floor at neutral (one overlapping mass) and near its ceiling under drawdown (separated members).", config: vcv1([vcField({ layout: "SCATTER", drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 5, countMax: 5, sizeMax: 60, spreadMax: 128 }), vcField({ layout: "SCATTER", primitive: "NGON", paletteIx: 1, drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 4, countMax: 4, sizeMax: 44, spreadMax: 118, variant: 2 })]) },
  { name: "VC-fracture-LINEAR-REC", runtimeId: "VECTOR_COMPOSITION_V1", note: "the polarity control for the same construction: consolidated under stress, separated in recovery.", config: vcv1([vcField({ layout: "SCATTER", drive: "SPREAD", sensor: "RECOVERY", curve: "LINEAR", countMin: 5, countMax: 5, sizeMax: 60, spreadMax: 128 }), vcField({ layout: "SCATTER", primitive: "NGON", paletteIx: 1, drive: "SPREAD", sensor: "RECOVERY", curve: "LINEAR", countMin: 4, countMax: 4, sizeMax: 44, spreadMax: 118, variant: 2 })]) },
  { name: "VC-subtract-3field", runtimeId: "VECTOR_COMPOSITION_V1", note: "SUBTRACTION with the composition carried by three fields, so losing members thins the work instead of emptying the frame. Round 1 ran this on one field and blanked seven seeds of eight.", config: vcv1([vcField({ drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 8, countMax: 38, spreadMax: 128, sizeMax: 26 }), vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 3, drive: "COUNT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 6, countMax: 30, spreadMax: 128, sizeMax: 18 }), vcField({ layout: "LINEFIELD", primitive: "LINE", paletteIx: 1, drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 8, countMax: 28, spreadMax: 128, sizeMax: 22 })]) },
  { name: "VC-separate-3field", runtimeId: "VECTOR_COMPOSITION_V1", note: "SEPARATION with three fields: counts pinned, only the interval moves.", config: vcv1([vcField({ drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 20, countMax: 20, spreadMax: 128, sizeMax: 26 }), vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 3, drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 14, countMax: 14, spreadMax: 128, sizeMax: 18 }), vcField({ layout: "LINEFIELD", primitive: "LINE", paletteIx: 1, drive: "SPREAD", sensor: "DRAWDOWN", curve: "LOG2", countMin: 16, countMax: 16, spreadMax: 128, sizeMax: 22 })]) },
  { name: "VC-thicken-LOG2-2field", runtimeId: "VECTOR_COMPOSITION_V1", note: "THICKENING on LOG2 rather than LINEAR. On LINEAR the neutral and recovery readings (20 and 80 per mille) resolved to the same stroke width and the pairing measured exactly 0.", config: vcv1([vcField({ primitive: "LINE", layout: "LINEFIELD", drive: "WEIGHT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 24, countMax: 24, spreadMax: 128, sizeMax: 24 }), vcField({ layout: "GRID", primitive: "RECT", paletteIx: 3, stroke: true, drive: "WEIGHT", sensor: "RECOVERY", curve: "LOG2", countMin: 18, countMax: 18, spreadMax: 128, sizeMax: 26 })], { flags: ["OUTLINE"] }) },
  { name: "VC-evenfield-2field", runtimeId: "VECTOR_COMPOSITION_V1", note: "an ALL-OVER FIELD with no dominant element: two equal registers at the spread ceiling, uniform size, nothing larger than anything else.", config: vcv1([vcField({ layout: "GRID", drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 14, countMax: 34, spreadMax: 128, sizeMax: 22 }), vcField({ layout: "TILING", primitive: "RECT", paletteIx: 3, drive: "COUNT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 14, countMax: 34, spreadMax: 128, sizeMax: 22 })]) },
  { name: "VC-occlude-SIZE-over", runtimeId: "VECTOR_COMPOSITION_V1", note: "OCCLUSION: a later field grows over an earlier one. SIZE on DRAWDOWN so the covering register swells under stress and retreats otherwise.", config: vcv1([vcField({ layout: "GRID", drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 16, countMax: 30, spreadMax: 128, sizeMax: 24 }), vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 1, drive: "SIZE", sensor: "DRAWDOWN", curve: "LOG2", countMin: 8, countMax: 8, spreadMax: 112, sizeMax: 56 })]) },
  { name: "VC-stack-3field", runtimeId: "VECTOR_COMPOSITION_V1", note: "horizontal bedding at the spread ceiling with three registers — the sediment construction, which round 1 rendered as a floating vignette.", config: vcv1([vcField({ layout: "STACK", drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 8, countMax: 34, spreadMax: 128, sizeMax: 22 }), vcField({ layout: "STACK", primitive: "RECT", paletteIx: 3, drive: "COUNT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 6, countMax: 26, spreadMax: 128, sizeMax: 18 }), vcField({ layout: "LINEFIELD", primitive: "LINE", paletteIx: 1, drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 8, countMax: 24, spreadMax: 128, sizeMax: 20 })]) },
  { name: "VC-dilate-3field", runtimeId: "VECTOR_COMPOSITION_V1", note: "DILATION with the size floor made safe: SIZE on DRAWDOWN, whose curved reading never falls below 326 per mille, with two supporting registers.", config: vcv1([vcField({ layout: "RADIAL", primitive: "NGON", drive: "SIZE", sensor: "DRAWDOWN", curve: "LOG2", countMin: 12, countMax: 12, spreadMax: 124, sizeMax: 52, variant: 2 }), vcField({ layout: "ORBIT", primitive: "ARC", paletteIx: 3, drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 14, countMax: 14, spreadMax: 128, sizeMax: 22 })]) },

  // ---- round 3: the winning constructions, promoted from ad-hoc iteration ----------------------
  // `mechanism.js` cites these rows by name and `assertMechanismEvidenceExists()` refuses a table
  // whose citation has been deleted, so they live here rather than in a scratch file.
  { name: "FRAC-a-3field", runtimeId: "VECTOR_COMPOSITION_V1", note: "FRACTURE at its clearest: components 1.000 -> 2.875 and largestShare 1.000 -> 0.895. One connected mass at neutral, three pieces under drawdown.", config: vcv1([
    vcField({ layout: "SCATTER", drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 7, countMax: 7, sizeMax: 62, spreadMax: 128 }),
    vcField({ layout: "SCATTER", primitive: "NGON", paletteIx: 1, drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 6, countMax: 6, sizeMax: 52, spreadMax: 120, variant: 2 }),
    vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 3, drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 5, countMax: 5, sizeMax: 44, spreadMax: 112 })]) },
  { name: "FRAC-e-mixed", runtimeId: "VECTOR_COMPOSITION_V1", note: "the same fracture with ONE register on RECOVERY, so recovery is not a copy of neutral. The neutral-recovery pairing goes 3.640 -> 6.149.", config: vcv1([
    vcField({ layout: "SCATTER", drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 7, countMax: 7, sizeMax: 62, spreadMax: 128 }),
    vcField({ layout: "SCATTER", primitive: "NGON", paletteIx: 1, drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR", countMin: 6, countMax: 6, sizeMax: 52, spreadMax: 120, variant: 2 }),
    vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 3, drive: "SIZE", sensor: "RECOVERY", curve: "LOG2", countMin: 6, countMax: 6, sizeMax: 46, spreadMax: 96 })]) },
  { name: "SEP-3field-fix", runtimeId: "VECTOR_COMPOSITION_V1", note: "SEPARATION with the counts raised until no seed falls under the ink floor.", config: vcv1([
    vcField({ drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 26, countMax: 26, spreadMax: 128, sizeMax: 28 }),
    vcField({ layout: "SCATTER", primitive: "CIRCLE", paletteIx: 3, drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 20, countMax: 20, spreadMax: 128, sizeMax: 22 }),
    vcField({ layout: "LINEFIELD", primitive: "LINE", paletteIx: 1, drive: "SPREAD", sensor: "DRAWDOWN", curve: "LOG2", countMin: 22, countMax: 22, spreadMax: 128, sizeMax: 24 })]) },
  { name: "THICK-mixed", runtimeId: "VECTOR_COMPOSITION_V1", note: "THICKENING on LOG2 with a COUNT register on RECOVERY carrying the pairing WEIGHT alone cannot.", config: vcv1([
    vcField({ primitive: "LINE", layout: "LINEFIELD", drive: "WEIGHT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 24, countMax: 24, spreadMax: 128, sizeMax: 24 }),
    vcField({ layout: "GRID", primitive: "RECT", paletteIx: 3, stroke: true, drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 6, countMax: 34, spreadMax: 128, sizeMax: 26 }),
    vcField({ layout: "SCATTER", primitive: "ARC", paletteIx: 1, drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 14, countMax: 14, spreadMax: 128, sizeMax: 22 })], { flags: ["OUTLINE"] }) },
  { name: "FAINT-modest", runtimeId: "VECTOR_COMPOSITION_V1", note: "the smallest market response that still clears the floor: 3.892 against 3.8, for a brief that asks the market to register only faintly.", config: vcv1([
    vcField({ layout: "ORBIT", primitive: "ARC", drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 26, countMax: 26, spreadMax: 104, sizeMax: 26 }),
    vcField({ layout: "ORBIT", primitive: "ARC", paletteIx: 3, drive: "COUNT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 12, countMax: 20, spreadMax: 74, sizeMax: 22 }),
    vcField({ layout: "RADIAL", primitive: "NGON", paletteIx: 1, drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2", countMin: 8, countMax: 8, spreadMax: 44, sizeMax: 26, variant: 2 })]) },
  { name: "FAINT-literal", runtimeId: "VECTOR_COMPOSITION_V1", note: "the control for it: a response authored as literally faint measures 1.307 / 1.697 / 1.991 and cannot reach the floor. A brief asking for an imperceptible market response is asking for a claim the objective battery refuses.", config: vcv1([
    vcField({ layout: "ORBIT", primitive: "ARC", drive: "SPREAD", sensor: "RECOVERY", curve: "EASE", countMin: 24, countMax: 24, spreadMax: 96, sizeMax: 26 }),
    vcField({ layout: "ORBIT", primitive: "ARC", paletteIx: 3, drive: "SPREAD", sensor: "RECOVERY", curve: "EASE", countMin: 18, countMax: 18, spreadMax: 70, sizeMax: 22 }),
    vcField({ layout: "RADIAL", primitive: "NGON", paletteIx: 1, drive: "COUNT", sensor: "DRAWDOWN", curve: "LOG2", countMin: 6, countMax: 14, spreadMax: 40, sizeMax: 24, variant: 2 })]) },
  { name: "VC-ground-linear-dark", runtimeId: "VECTOR_COMPOSITION_V1", note: "a graded ground between TWO DARK stops — what alluvium ships. The atlas's 0.696 loudness figure is for a ground pair with contrast in it.", config: vcv1([vcField({ drive: "COUNT", sensor: "RECOVERY", curve: "LOG2", countMin: 6, countMax: 34 })], { groundMode: "LINEAR", groundIx: 0, groundIx2: 1 }) },
]);
