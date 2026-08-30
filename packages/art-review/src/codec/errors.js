// SPDX-License-Identifier: MIT
// ================================================================================================
// WHAT `validateConfigV1` MEANT WHEN IT SAID NO.
//
// The runtime answers a `uint8`. A number is not a remedy, and an autonomous author handed
// `code 48` has been told that something is wrong and nothing about what. These names are
// transcribed from `ArtRuntimeCommonV1.sol` (the shared 0..14 range) and from each runtime's own
// error block (the 32+ range), and each carries the sentence an author can act on.
//
// THE NAMES ARE A CONVENIENCE AND THE CODE IS THE FACT. If a name here is wrong the code is still
// right, and every refusal prints both — so a stale transcription is a misleading sentence beside
// a correct number, never a wrong verdict.
// ================================================================================================

const SHARED = {
  0: ["ERR_NONE", "the runtime accepts these bytes"],
  1: ["ERR_TOO_SHORT", "the document ends before its header does"],
  2: ["ERR_MAGIC", "bytes 0..3 are not this runtime's magic"],
  3: ["ERR_VERSION", "the version byte is not the one this runtime parses; a different version is a different meaning for the same bytes, not a compatible one"],
  4: ["ERR_FLAGS", "a flag bit this version does not define is set. Reserved bits are refused rather than ignored, so a configuration cannot be authored against a meaning that does not exist yet"],
  5: ["ERR_PALETTE_COUNT", "paletteCount is outside 2..10"],
  6: ["ERR_GROUND", "a ground index is not below paletteCount"],
  7: ["ERR_TRAIT_COUNT", "more than eight traits"],
  8: ["ERR_TRAIT_NAME", "a trait name is empty or longer than 24 bytes"],
  9: ["ERR_TRAIT_SOURCE", "a trait names a sensor that does not exist"],
  10: ["ERR_TRAIT_STYLE", "a trait style is not NUMBER, WORD or HEX"],
  11: ["ERR_TITLE", "the title is longer than 32 bytes"],
  12: ["ERR_TERMINATOR", "the 0xFF terminator is not where the document says it is"],
  13: ["ERR_OVERSIZE", "the document is over 2,048 bytes"],
  14: ["ERR_RESERVED", "a reserved byte or bit is non-zero"],
};

const GRV1 = {
  32: ["ERR_RULE_COUNT", "ruleCount is outside 1..3"],
  33: ["ERR_SHAPE", "a shapeSet mask is empty or sets a bit above the six shapes"],
  34: ["ERR_RULE_KIND", "a ruleSet mask is empty or sets a bit above the six productions"],
  35: ["ERR_RULE_SENSOR", "a rule binds a sensor that is not visually legal — FRAGMENTATION is trait-only"],
  36: ["ERR_RULE_CURVE", "a rule's curve is not LINEAR, LOG2, EASE or STEP"],
  37: ["ERR_RULE_DRIVE", "a rule's drive is not one of the six structural drives"],
  38: ["ERR_RULE_PALETTE", "a rule's paletteIx is not below paletteCount"],
  39: ["ERR_DEPTH_RANGE", "depthMin/depthMax are inverted or above the depth ceiling"],
  40: ["ERR_BRANCH", "branch is outside 1..4"],
  41: ["ERR_CONTRACTION", "contraction is outside 20..90 per cent"],
  42: ["ERR_ROTATION", "rotation is above 90 degrees"],
  43: ["ERR_PRUNE", "the prune mask keeps no child that `branch` actually produces"],
  44: ["ERR_RULE_SYMMETRY", "a symSet mask is empty or sets a bit above the six symmetry orders"],
  45: ["ERR_NODE_BUDGET", "at depthMax the recursion produces more nodes than the runtime will draw. The budget is checked against the WORST case the sensors can reach, not against today's market"],
  46: ["ERR_GROUND_MODE", "groundMode is not FLAT, LINEAR, RADIAL or BANDED"],
  47: ["ERR_RENDER_BUDGET", "the worst legal render of this configuration is over the portable eth_call budget. Shape is priced: a set is charged at its dearest member"],
  48: [
    "ERR_SEED_BLIND",
    "NO SET IN THE WHOLE CONFIGURATION HAS MORE THAN ONE MEMBER, so the token's seed cannot choose " +
      "anything categorical and every token is the same figure with different dials on it. Give one " +
      "shapeSet, ruleSet or symSet a second member. This is the runtime refusing the exact defect an " +
      "independent visual review found in it — twelve seeds indistinguishable at thumbnail size — " +
      "before the binding is spent rather than after.",
  ],
};

const VCV1 = {
  32: ["ERR_FIELD_COUNT", "fieldCount is outside 1..6"],
  33: ["ERR_FIELD_LAYOUT", "a field's layout is not one of the twelve"],
  34: ["ERR_FIELD_PRIMITIVE", "a field's primitive is not one of the nine"],
  35: ["ERR_FIELD_SENSOR", "a field binds a sensor that is not visually legal — FRAGMENTATION is trait-only"],
  36: ["ERR_FIELD_CURVE", "a field's curve is not LINEAR, LOG2, EASE or STEP"],
  37: ["ERR_FIELD_DRIVE", "a field's drive is not one of the eight structural drives"],
  38: ["ERR_FIELD_PALETTE", "a field's paletteIx is not below paletteCount"],
  39: ["ERR_FIELD_COUNT_RANGE", "countMin/countMax are inverted, or countMax is above the per-field site ceiling"],
  40: ["ERR_FIELD_SIZE", "sizeMax is outside 2..64"],
  41: ["ERR_FIELD_SPREAD", "spreadMax is outside 16..128"],
  42: ["ERR_FIELD_SYMMETRY", "a field's symmetry is not one of the six orders"],
  43: ["ERR_TOTAL_SITES", "at their ceilings the fields together place more sites than the composition may hold"],
  44: ["ERR_RENDER_BUDGET", "the worst legal render of this configuration is over the portable eth_call budget"],
  45: ["ERR_GROUND_MODE", "groundMode is not FLAT, LINEAR, RADIAL or BANDED"],
};

const PER_RUNTIME = { GEOMETRIC_RECURSION_V1: GRV1, VECTOR_COMPOSITION_V1: VCV1 };

/**
 * `{ name, detail }` for a validator code, or a truthful shrug.
 *
 * AN UNKNOWN CODE IS NAMED AS UNKNOWN, never guessed at. The runtimes' error blocks can grow, and
 * a plausible wrong sentence beside a correct number is worse than no sentence.
 */
export function describeValidatorCode(runtimeId, code) {
  const table = { ...SHARED, ...(PER_RUNTIME[runtimeId] ?? {}) };
  const hit = table[code];
  if (!hit) return { code, name: "UNKNOWN", detail: `the runtime refused with code ${code}, which this table does not name. The code is the fact; read ${runtimeId}'s own error block for it.` };
  return { code, name: hit[0], detail: hit[1] };
}
