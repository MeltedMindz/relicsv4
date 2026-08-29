// SPDX-License-Identifier: MIT
// ================================================================================================
// EFFECTIVE MARKET SIGNALS — MEASURED, NEVER REASONED.
// ================================================================================================
//
// THE DEFECT THIS CLOSES. Three runtimes independently shipped a binding whose declared intent was
// "respond to volume" sitting on a sensor reading 687 / 687 / 687 across all three market states.
// The config was legal, the schema accepted it, the field really was wired to the market, and the
// picture never changed. **A signal is not effective because the schema accepts it.** It is
// effective when the number it produces actually MOVES between the states a viewer will compare.
//
// So `effective` here is computed from a committed measurement table and nothing else. There is no
// hand-maintained list of "good sensors" in this package, and adding one would recreate the bug.
//
// ------------------------------------------------------------------------------------------------
// WHAT IS MEASURED, AND ON WHICH MARKET
// ------------------------------------------------------------------------------------------------
// `measurements/SENSOR-MOVEMENT.tsv` is the committed census. It carries two tables:
//
//   1. per FIXTURE FAMILY — the same three state names (`neutral` / `stress` / `recovery`) mean
//      three DIFFERENT markets in three different harnesses, and a runtime measured against one
//      and reviewed against another is measured against a different world. `REVIEW` is the family
//      every visual verdict in this wave was rendered against, so it is the family this module
//      uses, and `FIXTURE_FAMILY` says so out loud rather than leaving it implied.
//   2. per CURVE — a creator binds a CURVE, not a raw sensor, and the curve changes the answer.
//      `LOG2` compresses the top of the scale almost to nothing: it turns `VOLATILITY` 650/850/850
//      into 937/937/937, a live sensor rendered stone. It also IMPROVES `RECOVERY`'s neutral
//      reading from 10 to 562, which is what lets a single-sensor template separate all three
//      states. Both directions are real, and neither is guessable from the sensor name.
//
// ------------------------------------------------------------------------------------------------
// THE FLOOR
// ------------------------------------------------------------------------------------------------
// 200 per mille, and it is not invented here: it is the number the runtime design brief already
// states — "for every pair of columns the template claims to distinguish, at least one binding must
// sit on a sensor whose movement across that pair is >= 200 per mille". This module is that rule
// executed against the table instead of applied by hand.
//
// NEVER LOWER IT TO MAKE A TEMPLATE LOOK RESPONSIVE. A binding under the floor is a binding a
// viewer will not see, and saying so is the entire value of publishing this field.
// ================================================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEASUREMENTS = join(HERE, "..", "measurements");

/** The nine sensors a VISUAL field may consume. A tenth name is a defect, not a new sensor. */
export const VISUAL_SENSORS = Object.freeze([
  "VOLUME_TIER", "EPOCH", "DRAWDOWN", "RECOVERY", "VOLATILITY", "STRESS", "LIQUIDITY", "FLOW_BIAS", "QUOTE_VOLUME",
]);

/**
 * `FRAGMENTATION` is the organic swap COUNT and is structurally refused as a visual driver by every
 * config parser. It stays legal as a TRAIT source, labelled for what it is.
 */
export const TRAIT_ONLY_SENSORS = Object.freeze(["FRAGMENTATION"]);

/** Curve ids as the config encodes them. The index IS the on-chain value. */
export const CURVES = Object.freeze(["LINEAR", "LOG2", "EASE", "STEP"]);

/** The fixture family every Wave-1 visual verdict was rendered against. */
export const FIXTURE_FAMILY = "REVIEW";

/** The three market states a viewer compares, and the three pairings between them. */
export const MARKET_STATES = Object.freeze(["neutral", "stress", "recovery"]);
export const STATE_PAIRS = Object.freeze({
  ns: Object.freeze(["neutral", "stress"]),
  nr: Object.freeze(["neutral", "recovery"]),
  sr: Object.freeze(["stress", "recovery"]),
});

/** Per mille. See the header: this is the design brief's own number, executed rather than applied. */
export const EFFECTIVE_SIGNAL_FLOOR_PER_MILLE = 200;

/** The perceptual floor the state-distinction census uses. Mean CIE76 dE per pixel at 120px. */
export const PERCEPTUAL_STATE_DELTA_FLOOR = 3.8;

let _cache = null;

/**
 * Parse the committed census.
 *
 * REFUSES AN EMPTY OR TRUNCATED TABLE. A measurement file that parsed to nothing would make every
 * sensor read as ineffective and every template read as unresponsive, which is a fabricated fact
 * about art nobody looked at — so the parser floors both tables before returning.
 */
export function readSensorMovement() {
  if (_cache) return _cache;
  const text = readFileSync(join(MEASUREMENTS, "SENSOR-MOVEMENT.tsv"), "utf8");
  const byFamily = new Map();
  const byCurve = new Map();
  let section = null;
  for (const line of text.split("\n")) {
    const cells = line.trim().split("\t");
    if (cells[0] === "family") { section = "family"; continue; }
    if (cells[0] === "curve") { section = "curve"; continue; }
    if (!section || cells.length < 5 || cells[0] === "") continue;
    const reading = Object.freeze({ neutral: Number(cells[2]), stress: Number(cells[3]), recovery: Number(cells[4]) });
    if (Object.values(reading).some((v) => !Number.isFinite(v))) continue;
    const target = section === "family" ? byFamily : byCurve;
    const key = section === "family" ? cells[0] : CURVES[Number(cells[0])];
    if (!key) continue;
    if (!target.has(key)) target.set(key, new Map());
    target.get(key).set(cells[1], reading);
  }

  const familyRows = [...byFamily.values()].reduce((n, m) => n + m.size, 0);
  const curveRows = [...byCurve.values()].reduce((n, m) => n + m.size, 0);
  if (byFamily.size < 3 || familyRows < 27) {
    throw new Error(`SENSOR-MOVEMENT.tsv parsed ${byFamily.size} fixture families / ${familyRows} rows; expected at least 3 / 27. A census that parsed nothing would mark every signal ineffective, which is a fabricated fact.`);
  }
  if (byCurve.size !== CURVES.length || curveRows < CURVES.length * VISUAL_SENSORS.length) {
    throw new Error(`SENSOR-MOVEMENT.tsv parsed ${byCurve.size} curves / ${curveRows} rows; expected ${CURVES.length} / ${CURVES.length * VISUAL_SENSORS.length}. The curve table is what makes this measured rather than reasoned.`);
  }

  _cache = Object.freeze({ byFamily, byCurve, familyRows, curveRows });
  return _cache;
}

/** The perceptual state-distinction census, keyed by template id. */
export function readStateDistinction() {
  const parsed = JSON.parse(readFileSync(join(MEASUREMENTS, "STATE-DISTINCTION.json"), "utf8"));
  const count = Object.keys(parsed.census ?? {}).length;
  if (count < 30) throw new Error(`STATE-DISTINCTION.json carries ${count} templates; expected the whole wave. A partial census cannot say a template is responsive.`);
  return parsed;
}

/**
 * The reading a binding actually produces: sensor, through curve, on the review fixtures.
 * Throws rather than returning zeros for an unknown sensor or curve — a zero here reads as "dead",
 * which is a verdict, and a typo must not be able to issue one.
 */
export function reading(sensor, curve) {
  const { byCurve } = readSensorMovement();
  if (!VISUAL_SENSORS.includes(sensor)) throw new Error(`${sensor} is not one of the nine visual sensors: ${VISUAL_SENSORS.join(", ")}`);
  if (!CURVES.includes(curve)) throw new Error(`${curve} is not one of ${CURVES.join(", ")}`);
  const row = byCurve.get(curve)?.get(sensor);
  if (!row) throw new Error(`no measured row for ${sensor} under ${curve}`);
  return row;
}

/** Movement per state pair, and the largest of the three. Per mille, absolute. */
export function movement(sensor, curve) {
  const r = reading(sensor, curve);
  const per = {};
  for (const [pair, [a, b]] of Object.entries(STATE_PAIRS)) per[pair] = Math.abs(r[a] - r[b]);
  return Object.freeze({ ...per, max: Math.max(...Object.values(per)), reading: r });
}

/** A binding is EFFECTIVE when it moves at least one state pair by at least the floor. */
export function isEffective(sensor, curve) {
  return movement(sensor, curve).max >= EFFECTIVE_SIGNAL_FLOOR_PER_MILLE;
}

/**
 * Split a template's bindings into the ones a viewer will see and the ones they will not, with the
 * measured reason attached to every refusal.
 *
 * `bindings` is `[{ sensor, curve, drives }]`, read from the template's own frozen source.
 */
export function classifyBindings(bindings) {
  const effective = [];
  const ineffective = [];
  for (const b of bindings) {
    const m = movement(b.sensor, b.curve);
    const row = Object.freeze({
      sensor: b.sensor,
      curve: b.curve,
      drives: b.drives,
      measured: Object.freeze({ neutral: m.reading.neutral, stress: m.reading.stress, recovery: m.reading.recovery, ns: m.ns, nr: m.nr, sr: m.sr }),
    });
    if (m.max >= EFFECTIVE_SIGNAL_FLOOR_PER_MILLE) effective.push(row);
    else ineffective.push(Object.freeze({ ...row, reason: `moves at most ${m.max} per mille across any state pair on the ${FIXTURE_FAMILY} fixtures, under the floor of ${EFFECTIVE_SIGNAL_FLOOR_PER_MILLE}` }));
  }
  return Object.freeze({ effective: Object.freeze(effective), ineffective: Object.freeze(ineffective) });
}

/**
 * Whether the market can be SEEN in this template — measured, per state pair.
 *
 * A template is market-responsive when EVERY pair of states a viewer might compare is separated by
 * at least one of its own bindings. That is a stricter and more useful question than "does it bind
 * a sensor": several templates in this wave bind three sensors and still show two identical
 * columns, because all three go dead across the same pairing.
 */
export function marketResponse(bindings) {
  const per = {};
  for (const pair of Object.keys(STATE_PAIRS)) {
    let best = 0;
    let by = null;
    for (const b of bindings) {
      const m = movement(b.sensor, b.curve);
      if (m[pair] > best) { best = m[pair]; by = `${b.sensor}/${b.curve}`; }
    }
    per[pair] = Object.freeze({ perMille: best, separatedBy: by, separated: best >= EFFECTIVE_SIGNAL_FLOOR_PER_MILLE });
  }
  return Object.freeze({
    responsive: Object.values(per).every((p) => p.separated),
    fixtureFamily: FIXTURE_FAMILY,
    floorPerMille: EFFECTIVE_SIGNAL_FLOOR_PER_MILLE,
    pairs: Object.freeze(per),
  });
}

/**
 * The independent, PERCEPTUAL second opinion: mean CIE76 dE per pixel at 120px between two market
 * states of the same seed, over twelve seeds.
 *
 * Kept separate from `marketResponse` on purpose. One measures the CONFIG (does the number move),
 * the other measures the PICTURE (does the image move). They can disagree, and when they do the
 * disagreement is the finding — a binding that moves 500 per mille into a field with a two-step
 * domain moves the number and not the picture.
 */
export function perceptualResponse(templateId, census = readStateDistinction()) {
  const row = census.census?.[templateId];
  if (!row) return Object.freeze({ measured: false, detail: `no perceptual census row for ${templateId}` });
  const pairs = {};
  for (const pair of Object.keys(STATE_PAIRS)) pairs[pair] = Object.freeze({ deltaE: row[pair], separated: row[pair] >= (census.floor ?? PERCEPTUAL_STATE_DELTA_FLOOR) });
  return Object.freeze({
    measured: true,
    method: "CIE76_DE_120PX_12_SEEDS",
    floorDeltaE: census.floor ?? PERCEPTUAL_STATE_DELTA_FLOOR,
    inkFraction: row.ink,
    responsive: Object.values(pairs).every((p) => p.separated),
    pairs: Object.freeze(pairs),
  });
}
