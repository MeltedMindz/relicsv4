// SPDX-License-Identifier: MIT
// ================================================================================================
// THE SHARED CONFIG VOCABULARIES — transcribed from the deployed runtimes' own Solidity, index by
// index, because the INDEX is what goes on chain and the name is only for people.
//
// THIS FILE IS NOT THE AUTHORITY AND MUST NEVER BE TREATED AS ONE. The authority is
// `validateConfigV1` on the deployed runtime, which every encode in this package is checked
// against before a single pixel is drawn (see `render.js#validateOnChain`). A JS validator that
// agrees with the chain until the day it does not is worse than no JS validator at all, because
// the disagreement surfaces as a launch that reverts after the creator has already reviewed the
// art. So: symbolic names in, bytes out, chain says yes or no.
//
// WHY SYMBOLIC AT ALL, then. Because the loop this package exists to build has a MODIFY step, and
// an agent handed 100 bytes of hex cannot act on a critique that says "narrow the palette contrast
// and raise the central recursion scale". It can act on `contraction: 90 -> 62`. The bytes are the
// contract; the names are what makes the critique executable.
// ================================================================================================

/** ArtConfigV1.sol — market sensors. Index is the on-chain value. */
export const SENSORS = Object.freeze([
  "VOLUME_TIER", "EPOCH", "DRAWDOWN", "RECOVERY", "VOLATILITY",
  "STRESS", "LIQUIDITY", "FLOW_BIAS", "QUOTE_VOLUME", "FRAGMENTATION",
]);

/**
 * The last sensor a VISUAL binding may name. `FRAGMENTATION` (9) is trait-only and both runtimes
 * REFUSE it on a rule/field — it is admitted only on a trait row.
 */
export const SENSOR_VISUAL_MAX = 8;

/** ArtConfigV1.sol — response curves. */
export const CURVES = Object.freeze(["LINEAR", "LOG2", "EASE", "STEP"]);

/** ArtConfigV1.sol — how a trait value is rendered into the metadata document. */
export const TRAIT_STYLES = Object.freeze(["NUMBER", "WORD", "HEX"]);

/** Both runtimes share this ground vocabulary and both cap it at BANDED. */
export const GROUND_MODES = Object.freeze(["FLAT", "LINEAR", "RADIAL", "BANDED"]);

/** Both runtimes share this symmetry vocabulary. GRV1 declares a SET of these; VCV1 one value. */
export const SYMMETRIES = Object.freeze(["NONE", "MIRROR_X", "MIRROR_Y", "QUAD", "ROT3", "ROT6"]);

// ---- GEOMETRIC_RECURSION_V1 ("GRV1") -----------------------------------------------------------

/** RecursionConfigV1.sol — seed shapes. Declared as a SET; the token's seed draws one member. */
export const RECURSION_SHAPES = Object.freeze(["SQUARE", "TRIANGLE", "HEX", "CIRCLE", "DIAMOND", "CROSS"]);

/** RecursionConfigV1.sol — productions. Declared as a SET; the token's seed draws one member. */
export const RECURSION_RULES = Object.freeze(["QUAD", "TRI", "INSCRIBE", "BRANCH", "RING", "BSP"]);

/** RecursionConfigV1.sol — the ONE structural dimension a rule's sensor may move. */
export const RECURSION_DRIVES = Object.freeze(["DEPTH", "PRUNE", "CONTRACT", "ROTATE", "SPREAD", "ASYMMETRY"]);

export const RECURSION_FLAGS = Object.freeze({ ANIMATE: 0x01, DEPTH_PALETTE: 0x02, OUTLINE: 0x04 });

// ---- VECTOR_COMPOSITION_V1 ("VCV1") ------------------------------------------------------------

/**
 * VectorConfigV1.sol — layouts. THE ORDER IS BY FAMILY AND IT IS LOAD-BEARING: GRID..TILING share
 * one cell-grid core and RADIAL..BURST share one polar core, and the runtime dispatches on RANGES.
 * Reordering these to "tidy" them moves a layout into arithmetic it was never written for, and
 * every launched project stores the number rather than the name.
 */
export const VECTOR_LAYOUTS = Object.freeze([
  "GRID", "LATTICE", "TILING", "SUBDIVIDE", "STACK", "LINEFIELD",
  "WAVE", "SCATTER", "RADIAL", "ORBIT", "SPIRAL", "BURST",
]);

/**
 * VectorConfigV1.sol — primitives. RECT..NGON have an interior and honour the creator's
 * fill/stroke choice; LINE..CUBIC have none and are ALWAYS stroked whatever `stroke` says.
 * A line that was filled instead of stroked is an INVISIBLE element, which is how a project ships
 * a blank frame that still validates — so this boundary is named rather than left implicit.
 */
export const VECTOR_PRIMITIVES = Object.freeze([
  "RECT", "CIRCLE", "ELLIPSE", "NGON", "LINE", "POLYLINE", "ARC", "QUAD", "CUBIC",
]);

/** The first primitive with no interior. At and above this index, `stroke` is not a choice. */
export const VECTOR_PRIM_FIRST_STROKE_ONLY = 4;

/** VectorConfigV1.sol — the ONE structural dimension a field's sensor may move. */
export const VECTOR_DRIVES = Object.freeze([
  "COUNT", "DEPTH", "SPREAD", "SIZE", "TWIST", "JITTER", "SYMMETRY", "WEIGHT",
]);

export const VECTOR_FLAGS = Object.freeze({ ANIMATE: 0x01, PALETTE_SHIFT: 0x02, OUTLINE: 0x04 });

// ---- shared helpers ----------------------------------------------------------------------------

/** Name -> index, refusing an unknown name by NAME rather than coercing it to 0. */
export function indexOf(vocabulary, name, what) {
  if (typeof name === "number") {
    if (!Number.isInteger(name) || name < 0 || name >= vocabulary.length) {
      throw new Error(`${what}: ${name} is outside 0..${vocabulary.length - 1}`);
    }
    return name;
  }
  const i = vocabulary.indexOf(name);
  // NO `?? 0`. A misspelled sensor silently becoming VOLUME_TIER is exactly the class of defect
  // that produces a legal configuration nobody meant, which is what this whole package is about.
  if (i === -1) throw new Error(`${what}: ${JSON.stringify(name)} is not one of ${vocabulary.join(", ")}`);
  return i;
}

/** A declared SET, as a bit mask over a six-member vocabulary. Never empty. */
export function maskOf(vocabulary, names, what) {
  if (typeof names === "number") return names;
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error(`${what}: a declared set may not be empty — the token's seed has to draw from something`);
  }
  let mask = 0;
  for (const n of names) mask |= 1 << indexOf(vocabulary, n, what);
  return mask;
}

/** A bit mask back to the names it admits, in vocabulary order. */
export function namesOf(vocabulary, mask) {
  const out = [];
  for (let i = 0; i < vocabulary.length; i++) if (mask & (1 << i)) out.push(vocabulary[i]);
  return out;
}

/** `#rrggbb` -> [r,g,b]. Refuses anything else; a palette entry is not a place to guess. */
export function rgbOf(colour, what) {
  if (Array.isArray(colour) && colour.length === 3) return colour.map((c) => c & 0xff);
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(colour));
  if (!m) throw new Error(`${what}: ${JSON.stringify(colour)} is not a #rrggbb colour`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function hexOf(rgb) {
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Flag names -> byte, refusing a name this format does not define. */
export function flagsOf(table, names, what) {
  if (typeof names === "number") return names;
  let out = 0;
  for (const n of names ?? []) {
    if (!(n in table)) throw new Error(`${what}: ${JSON.stringify(n)} is not one of ${Object.keys(table).join(", ")}`);
    out |= table[n];
  }
  return out;
}

export function flagNames(table, byte) {
  return Object.entries(table).filter(([, bit]) => (byte & bit) !== 0).map(([n]) => n);
}
