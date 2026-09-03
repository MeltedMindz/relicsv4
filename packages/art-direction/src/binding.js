// SPDX-License-Identifier: MIT
// ================================================================================================
// SYMBOLIC MARKET-BINDING REACHABILITY — the check that needs no chain call and catches the
// failure that costs the most rounds.
//
// The atlas gives this instruction directly:
//
//     BEFORE RENDERING: evaluate every market binding's reachable range symbolically -- floor,
//     ceiling, the three fixture readings through the curve -- and refuse a binding whose resolved
//     values are equal. This needs no chain call and would have caught two of the seven shipped
//     collections outright.
//
// WHY IT MATTERS SO MUCH. "This work fractures under drawdown" is a claim about a DIFFERENCE. If
// the binding resolves to the same integer at neutral and at stress, there is no difference, and
// no amount of rendering, critiquing or recolouring will produce one — the bytes are identical, so
// the pictures are identical. The reviewer will correctly fail `marketResponse`, the author will
// correctly not understand why, and the round is spent. This is arithmetic, it is available before
// the first `eth_call`, and it was never being done.
//
// ------------------------------------------------------------------------------------------------
// THE THREE LAWS THIS IMPLEMENTS
// ------------------------------------------------------------------------------------------------
// L1  EVERY NUMERIC IS A CEILING AND THE FLOOR IS A CONSTANT IN THE BYTECODE. A dimension resolves
//     as `floor + (ceiling - floor) * v / 1000`, integer, where `v` is the market reading through
//     the curve when this dimension is the unit's drive. So `contraction: 55` does not mean 55; it
//     means somewhere in 20..55. The floors are bytecode constants and are transcribed here.
//
// L2  A DRIVE IS DISABLED BY THE PARAMETER IT DRIVES, SILENTLY, AT LEGAL VALUES. If ceiling ==
//     floor the drive has nowhere to go. `rotation: 0` makes DRIVE_ROTATE a multiplication by
//     zero; `depthMin == depthMax` makes DRIVE_DEPTH a constant. Both are the natural "I am not
//     using this" default, which is why they are reached by accident.
//
// L3  A DECLARED SET IS AS RESPONSIVE AS ITS WORST MEMBER, AND THE SEED PICKS. The token's seed
//     draws one shape and one production from the creator's sets, so a configuration has one
//     behaviour per drawable combination rather than one behaviour. Measured: compass-cairn's
//     shipped bytes with ruleSet forced to {QUAD} are 0-of-12 byte-identical neutral-to-stress;
//     forced to {BSP}, 12 of 12; shipped as {QUAD, BSP}, 7 of 12. So a binding must be priced at
//     its WORST member, exactly as the render budget already prices gas at its dearest.
//
// ------------------------------------------------------------------------------------------------
// WHAT THIS IS NOT
// ------------------------------------------------------------------------------------------------
// It is not a substitute for rendering, and a binding that passes here can still be invisible: two
// integers can differ by one and change nothing a viewer can see. This answers "is a difference
// REACHABLE", which is necessary and not sufficient. The perceptual gate in `@relics/art-review`
// answers "is it VISIBLE", and both are required — that is the same two-gate arrangement the
// project already uses for exact-vs-perceptual state identity.
// ================================================================================================

import { marketState } from "../../art-review/src/market.js";

/**
 * The bytecode floors, per driveable dimension, transcribed from the atlas's law L1.
 *
 * TRANSCRIBED AND NOT DERIVED, so it is worth saying what makes them trustworthy: each is quoted
 * in `crossRuntimeLaws[0].detail`, and `assertFloorsMatchAtlas()` re-reads that sentence and
 * refuses to run if a number here is not in it. A constant that drifts from its own source is
 * exactly how a "symbolic" check starts producing confident wrong answers.
 */
/**
 * ONLY THE SIX MAPPINGS THE ATLAS ACTUALLY EVIDENCES ARE HERE.
 *
 * A first cut of this table filled in all fourteen drives by guessing which parameter each one
 * bounds — VECTOR's DEPTH to `countMax`, TWIST and WEIGHT to `sizeMax`, and so on. Run against the
 * shipped `alluvium` preset it then reported `field[2] DRIVE_DISABLED` with a floor, a ceiling and
 * a law citation, which is a confident, specific, evidence-shaped accusation about a published
 * SHIP template derived entirely from a mapping nobody measured. That is worse than saying
 * nothing: the whole point of this file is that it substitutes for a render, so a wrong answer
 * here is trusted precisely where it cannot be checked.
 *
 * The atlas evidences exactly six. Law L1 names five floors as bytecode constants — contraction 20,
 * root 40, size 2, spread 16, rotation 0 — and states that the only creator-owned floors are
 * `depthMin == depthMax` and `countMin == countMax`. Those, and nothing else.
 *
 * Everything absent from this table resolves to UNKNOWN, which is a different thing from dead and
 * is reported as a different thing. `UNPROVEN_DRIVES` says why each one is missing so a later
 * session extends the table from a measurement rather than re-deriving the same guess.
 */
export const DRIVE_FLOORS = Object.freeze({
  GEOMETRIC_RECURSION_V1: Object.freeze({
    CONTRACT: { param: "contraction", floor: 20, source: "L1: contraction's floor is 20" },
    ROTATE: { param: "rotation", floor: 0, source: "L1: rotation's floor is 0" },
    DEPTH: { param: "depthMax", floorFrom: "depthMin", source: "L1: depthMin == depthMax is a creator-owned floor" },
  }),
  VECTOR_COMPOSITION_V1: Object.freeze({
    SIZE: { param: "sizeMax", floor: 2, source: "L1: size's floor is 2" },
    SPREAD: { param: "spreadMax", floor: 16, source: "L1: spread's floor is 16" },
    COUNT: { param: "countMax", floorFrom: "countMin", source: "L1: countMin == countMax is a creator-owned floor" },
  }),
});

/**
 * The drives this file will not claim to evaluate, and what it would take to add one.
 *
 * `PRUNE` is the interesting case and is deliberately still UNKNOWN. Law L2 says a prune drive
 * whose `branch` has every low bit set is "a rotation of an all-ones mask, which is the identity" —
 * a real, checkable condition — but the atlas never states prune's FLOOR, so the reachability
 * arithmetic this module performs cannot be run on it. Detecting the one degenerate case while
 * silently passing every other prune binding would be the most misleading option available: it
 * would look like coverage.
 */
export const UNPROVEN_DRIVES = Object.freeze({
  GEOMETRIC_RECURSION_V1: Object.freeze({
    PRUNE: "law L2 gives a degenerate case (all low branch bits set) but no floor for `prune`, so reachability cannot be computed",
    SPREAD: "no floor recorded for the dimension DRIVE_SPREAD moves",
    ASYMMETRY: "no floor recorded for the dimension DRIVE_ASYMMETRY moves",
  }),
  VECTOR_COMPOSITION_V1: Object.freeze({
    DEPTH: "the atlas measures DEPTH as visually inert at 120px but never names the parameter that bounds it",
    TWIST: "no floor recorded; measured invisible at 120px on any field",
    JITTER: "no floor recorded",
    SYMMETRY: "symmetry is a project constant rather than a bounded scalar; the drive's reachable range is not defined by a floor/ceiling pair",
    WEIGHT: "no floor recorded; measured invisible on a filled field",
  }),
});

/**
 * Sensors that are MEASURED DEAD on the review fixtures.
 *
 * From `docs/runtimes/SENSOR_MOVEMENT.md`, quoted in the project record: `FLOW_BIAS` reads
 * 500/500/500 and `QUOTE_VOLUME` reads 687/687/687 across neutral / stress / recovery. A binding
 * to either is bound-but-dead, and three shipped configs did it. `EPOCH` under `LINEAR` moves 125
 * per mille, which is movement but not enough to see — it is flagged rather than refused, because
 * "small" is a judgement the render should settle.
 */
export const DEAD_SENSORS_ON_REVIEW_RING = Object.freeze(["FLOW_BIAS", "QUOTE_VOLUME"]);

/** The three fixtures a review is conducted against. */
export const REVIEW_RING = Object.freeze(["neutral", "stress", "recovery"]);

/**
 * Read a sensor out of a market fixture, in the runtime's own per-mille terms.
 *
 * THE MAPPING IS THE RUNTIME'S, NOT AN INVENTION. `ArtConfigV1` normalises each sensor to 0..1000
 * before the curve is applied; these expressions reproduce that normalisation from the fixture
 * fields. Where a sensor's normalisation is not reproducible from the fixture alone, the function
 * returns `null` and every downstream verdict for it becomes UNKNOWN rather than a guess.
 */
export function sensorPerMille(sensorName, stateName) {
  const s = marketState(stateName);
  const clamp = (v) => Math.max(0, Math.min(1000, Math.round(v)));
  switch (sensorName) {
    case "VOLUME_TIER": return clamp((Number(s.volumeTier) / 15) * 1000);
    case "EPOCH": return clamp((Number(s.epoch) / 8) * 1000);
    case "DRAWDOWN": return clamp((Number(s.drawdownTicks) / 10000) * 1000);
    case "RECOVERY": return clamp((Number(s.recoveryTicks) / 10000) * 1000);
    case "VOLATILITY": return clamp((Number(s.volatilityTickMovement) / 200000) * 1000);
    case "STRESS": return clamp((Number(s.stressTier) / 10) * 1000);
    case "LIQUIDITY": return clamp((Number(s.observedActiveLiquidity) / 1e19) * 1000);
    case "FRAGMENTATION": return clamp((Number(s.fragmentation) / 255) * 1000);
    // MEASURED DEAD on this ring: the fixtures carry no field that separates them.
    case "FLOW_BIAS": return 500;
    case "QUOTE_VOLUME": return 687;
    default: return null;
  }
}

/** The four response curves, as the runtimes apply them to a 0..1000 reading. */
export function applyCurve(curveName, perMille) {
  if (perMille === null) return null;
  const v = Math.max(0, Math.min(1000, perMille));
  switch (curveName) {
    case "LINEAR": return v;
    case "LOG2": return Math.round((Math.log2(1 + (v / 1000) * 255) / 8) * 1000);
    case "EASE": return Math.round((v / 1000) ** 2 * (3 - 2 * (v / 1000)) * 1000);
    case "STEP": return v < 500 ? 0 : 1000;
    default: return null;
  }
}

/** L1: floor + (ceiling - floor) * v / 1000, integer. */
export function resolveDimension(floor, ceiling, curvedPerMille) {
  if (curvedPerMille === null) return null;
  return Math.floor(floor + ((ceiling - floor) * curvedPerMille) / 1000);
}

/**
 * Evaluate ONE binding across the review ring.
 *
 * `unit` is a rule (GRV1) or a field (VCV1) as the codec object shape, so the ceiling and any
 * creator-owned floor are read from the configuration the author actually wrote.
 */
export function evaluateBinding({ runtimeId, unit }) {
  const table = DRIVE_FLOORS[runtimeId];
  if (!table) throw new Error(`no drive-floor table for runtime ${runtimeId}`);
  const spec = table[unit.drive];
  if (!spec) {
    const why = UNPROVEN_DRIVES[runtimeId]?.[unit.drive] ?? `drive ${unit.drive} is not in this runtime's vocabulary`;
    return {
      drive: unit.drive,
      sensor: unit.sensor,
      curve: unit.curve,
      parameter: null,
      floor: null,
      ceiling: null,
      readings: null,
      resolved: null,
      span: null,
      verdict: "UNKNOWN",
      // UNKNOWN IS NOT A PASS AND NOT A FAILURE. It is this module declining to answer, and the
      // caller must treat it as unproven rather than as either.
      detail: `reachability not computable: ${why}. Render is the only evidence available for this binding.`,
    };
  }

  const ceiling = Number(unit[spec.param]);
  const floor = spec.floorFrom !== undefined ? Number(unit[spec.floorFrom]) : spec.floor;
  const readings = {};
  for (const state of REVIEW_RING) {
    const curved = applyCurve(unit.curve, sensorPerMille(unit.sensor, state));
    readings[state] = { perMille: sensorPerMille(unit.sensor, state), curved, resolved: resolveDimension(floor, ceiling, curved) };
  }

  const resolved = REVIEW_RING.map((s) => readings[s].resolved);
  const unknown = resolved.some((r) => r === null);
  const distinct = new Set(resolved.filter((r) => r !== null));

  let verdict;
  let detail;
  if (unknown) {
    verdict = "UNKNOWN";
    detail = `sensor ${unit.sensor} has no reproducible normalisation on this fixture ring; nothing is claimed`;
  } else if (ceiling === floor) {
    // L2, and the reason it is its own verdict: the configuration is legal, the validator accepts
    // it, and the drive is a no-op. Naming this DRIVE_DISABLED rather than DEAD tells the author
    // that the fix is the DRIVEN parameter, not the sensor.
    verdict = "DRIVE_DISABLED";
    detail = `${spec.param} ceiling (${ceiling}) equals its floor (${floor}), so drive ${unit.drive} has nowhere to move. This is legal and silent (law L2).`;
  } else if (DEAD_SENSORS_ON_REVIEW_RING.includes(unit.sensor)) {
    verdict = "DEAD_SENSOR";
    detail = `${unit.sensor} is measured constant across neutral/stress/recovery on the review fixtures, so this binding cannot move whatever it is attached to`;
  } else if (distinct.size <= 1) {
    verdict = "UNREACHABLE";
    detail = `resolves to ${[...distinct][0]} at all three states: floor ${floor}, ceiling ${ceiling}, curved readings ${REVIEW_RING.map((s) => readings[s].curved).join("/")}`;
  } else {
    verdict = "REACHABLE";
    detail = `resolves to ${resolved.join(" / ")} across neutral / stress / recovery (span ${Math.max(...resolved) - Math.min(...resolved)} of ${ceiling - floor})`;
  }

  return {
    drive: unit.drive,
    sensor: unit.sensor,
    curve: unit.curve,
    parameter: spec.param,
    floor,
    ceiling,
    readings,
    resolved,
    span: unknown ? null : Math.max(...resolved) - Math.min(...resolved),
    verdict,
    detail,
  };
}

/**
 * L3: price a GRV1 rule's responsiveness at the WORST member of its declared sets.
 *
 * `BSP` is the measured worst case — it places every child k>=1 at the same offset, so rotating the
 * prune mask (all DRIVE_PRUNE does) changes nothing. A ruleSet containing it is 7-of-12 responsive
 * where the set without it is 12-of-12, and the seed decides which token gets which.
 */
export const RECURSION_INERT_MEMBERS = Object.freeze({ PRUNE: ["BSP"], ROTATE: ["BSP"] });

export function worstMemberRisk(unit) {
  const inert = RECURSION_INERT_MEMBERS[unit.drive] ?? [];
  const declared = Array.isArray(unit.ruleSet) ? unit.ruleSet : [];
  const risky = declared.filter((m) => inert.includes(m));
  if (risky.length === 0) return { ok: true, risky: [], detail: null };
  return {
    ok: false,
    risky,
    detail:
      `ruleSet declares ${risky.join(", ")}, which is inert under drive ${unit.drive}. ` +
      `The seed picks one production per token, so ~${Math.round((risky.length / declared.length) * 100)}% of the ` +
      "collection would be unresponsive while the rest moves (law L3). Price the binding at its worst member.",
  };
}

/**
 * Check every binding in a decoded configuration.
 *
 * Returns a record, never throws: an unreachable binding is a finding the author acts on, and the
 * caller decides whether it is fatal. `refuse` says what this module would do.
 */
export function checkBindings({ runtimeId, config }) {
  const units = runtimeId === "GEOMETRIC_RECURSION_V1" ? (config.rules ?? []) : (config.fields ?? []);
  const unitNoun = runtimeId === "GEOMETRIC_RECURSION_V1" ? "rule" : "field";
  const results = units.map((unit, i) => {
    const binding = evaluateBinding({ runtimeId, unit });
    const worst = runtimeId === "GEOMETRIC_RECURSION_V1" ? worstMemberRisk(unit) : { ok: true, risky: [], detail: null };
    return { index: i, unit: `${unitNoun}[${i}]`, ...binding, worstMember: worst };
  });
  const bad = results.filter((r) => ["UNREACHABLE", "DRIVE_DISABLED", "DEAD_SENSOR"].includes(r.verdict));
  const unknown = results.filter((r) => r.verdict === "UNKNOWN");
  const reachable = results.filter((r) => r.verdict === "REACHABLE");
  return {
    runtimeId,
    bindings: results,
    counts: { total: results.length, reachable: reachable.length, unreachable: bad.length, unknown: unknown.length },
    // A CONFIGURATION WITH NO REACHABLE BINDING CANNOT RESPOND TO THE MARKET AT ALL. That is the
    // headline finding and it is stated separately, because a per-binding list of three problems
    // reads as three small problems rather than as one total failure.
    respondsToMarket: reachable.length > 0,
    worstMemberRisks: results.filter((r) => !r.worstMember.ok).map((r) => ({ unit: r.unit, ...r.worstMember })),
    refuse: reachable.length === 0,
    detail: reachable.length === 0
      ? `no binding on this configuration can move across neutral/stress/recovery: ${results.map((r) => `${r.unit} ${r.verdict}`).join(", ")}. The work cannot respond to the market, whatever the brief claims.`
      : `${reachable.length} of ${results.length} bindings are reachable across the review ring`,
  };
}

/** Re-read the atlas's own law text and refuse if a transcribed floor is not in it. */
export async function assertFloorsMatchAtlas() {
  const { crossRuntimeLaws } = await import("./atlas.js");
  const l1 = crossRuntimeLaws().find((l) => l.id === "L1");
  if (!l1) throw new Error("the atlas no longer carries law L1; the transcribed drive floors have lost their source");
  const text = `${l1.detail} ${l1.consequence ?? ""}`;
  const claims = [
    ["contraction", 20],
    ["root", 40],
    ["size", 2],
    ["spread", 16],
    ["rotation", 0],
  ];
  const missing = claims.filter(([name, value]) => !new RegExp(`${name}[^.]{0,24}?\\b${value}\\b`).test(text));
  if (missing.length) {
    throw new Error(`DRIVE_FLOORS_DRIFTED — law L1 no longer states: ${missing.map(([n, v]) => `${n} floor ${v}`).join(", ")}`);
  }
  return { ok: true, checked: claims.length };
}
