// SPDX-License-Identifier: MIT
// ================================================================================================
// THE OBJECTIVE BATTERY — everything a machine can decide about a configuration.
//
// IT SUPPLEMENTS THE VISUAL REVIEW AND NEVER REPLACES IT. Read that as a statement about what this
// file is FOR rather than as a disclaimer. Four times in this program a numeric result was
// computed correctly and the conclusion drawn from it was wrong, and each time a person looking at
// a contact sheet was right. So these checks are scoped to the class of defect a person is BAD at:
// a field that draws nothing on any seed, one duplicate inside a hundred, a gas ceiling, a state
// transition that is literally zero pixels. None of them can tell you the work is any good.
//
// THE ORDER OF AUTHORITY IS FIXED AND IT IS NOT THE ORDER THINGS ARE RUN IN. Every check here can
// pass on work that is refused by the reviewer, and that refusal stands. The reverse is also true
// and also stands: a reviewer who loves it does not get to overrule a dead field. Passing both is
// the only way through.
//
// SCORES PRODUCED HERE ARE WITHHELD FROM THE REVIEWER UNTIL AFTER ITS FIRST JUDGEMENT. That is
// enforced in `packet.js`, not here, but it is why this module writes to its own file and never
// into the packet directory: a number on the sheet is an anchor, and this program has already
// watched a labelled review rate two runtimes highly whose templates a blind pass then rejected
// five for five.
// ================================================================================================
import { MARKET_STATES, REVIEW_SEEDS, collectionSeeds } from "./market.js";
import { STATE_SEPARATION_FLOOR, inkCoverage, meanDeltaE, planeOf } from "./perceptual.js";
import { runtimeFor } from "./runtimes.js";

// ------------------------------------------------------------------------------------------------
// FLOORS — every one of them derived by MEASURING the two published Wave-1 SHIP templates on THIS
// pipeline and then set below both, so a floor refuses work that is worse than anything that has
// shipped and never refuses work merely for being different from it. The measured values are
// recorded beside each floor so a later reader can re-derive rather than trust, and so a floor
// that was lowered to make a run green is visible as a floor below its own evidence.
//
// LOWERING A FLOOR TO PASS A RUN IS FORBIDDEN. If a configuration cannot clear one, the answer is
// a different configuration.
// ------------------------------------------------------------------------------------------------
export const FLOORS = Object.freeze({
  /** Emptiest sampled frame, as a fraction that is drawing rather than ground.
   *  MEASURED 2026-08-30 on chain 1: compass 0.208 · alluvium 0.282. */
  ink: 0.04,
  /** Mean pairwise dE between two SEEDS at browse size — the diversity `idol` failed on.
   *  MEASURED: compass 22.808 · alluvium 17.984. */
  seedDiversityMean: 3.0,
  /** The WORST pair of seeds, not the average. An average hides a colliding pair inside a good set.
   *  MEASURED: compass 7.828 · alluvium 9.915. */
  seedDiversityMin: 1.2,
  /** Mean dE between two MARKET STATES of one seed. The published Wave-1 calibration, not ours.
   *  MEASURED weakest pairing: compass ns 11.566 · alluvium nr 9.937. */
  stateSeparation: STATE_SEPARATION_FLOOR,
  /** How much removing one declared rule/field must change the picture for that unit to have a role.
   *  MEASURED weakest unit: compass 3.236 · alluvium 1.711. THE TIGHTEST FLOOR HERE, deliberately:
   *  alluvium clears it by 0.2, so this is the one floor a shipped template nearly trips, and that
   *  is the floor doing its job rather than an argument for lowering it. A genuinely dead unit
   *  measures near zero, not near 1.5. */
  structuralRole: 1.5,
  /** The portable `eth_call` render budget the runtimes' own validators are calibrated against.
   *  MEASURED worst sampled render: compass 1,728,187 · alluvium 1,535,137. */
  renderGas: 10_000_000,
  /** How many seeds the collection sweep must actually render before it may report anything. */
  collectionSeeds: 100,
});

/**
 * EVERY CHECK THIS BATTERY CAN EMIT, DECLARED ONCE.
 *
 * Declared rather than left implicit because `packet.js` derives the reviewer's leak scanner from
 * it: a check added to the battery and not to this list would be a metric name the redactor does
 * not know to keep out of a packet, which is exactly the anchoring the separation exists to stop.
 * `runObjectiveBattery` asserts that what it emitted is a subset of this list, so the two cannot
 * drift in the direction that matters.
 */
export const OBJECTIVE_CHECK_IDS = Object.freeze([
  "CONFIG_LEGAL", "REVIEW_RING_RENDERS", "DETERMINISM", "COLLECTION_SWEEP",
  "DUPLICATE_BYTES", "DUPLICATE_PERCEPTUAL", "SEED_DIVERSITY", "BLANK_DETECTION",
  "STATE_IDENTITY_EXACT", "PERCEPTUAL_SEPARATION", "STRUCTURAL_ROLE", "RENDER_GAS",
]);

const nowIso = () => new Date().toISOString();

function check(id, ok, detail, measured = null) {
  if (!OBJECTIVE_CHECK_IDS.includes(id)) {
    throw new Error(`objective battery emitted ${id}, which is not in OBJECTIVE_CHECK_IDS. Add it there: the packet redactor derives what it must keep away from a reviewer from that list, so an undeclared check is a metric name that can leak into a review packet.`);
  }
  return { id, ok, detail, measured };
}

/**
 * Run the whole battery.
 *
 * `renderer` is a live chain renderer; nothing here draws. Returns a record whose `pass` is the
 * conjunction — there is no weighting, no score and no "mostly passed", because a battery that can
 * be mostly passed is a battery whose failures are negotiable.
 */
export async function runObjectiveBattery({ renderer, runtimeId, config, configBytes, sweepSize = FLOORS.collectionSeeds }) {
  const rt = runtimeFor(runtimeId);
  const checks = [];
  const started = nowIso();

  // ---- 1. the runtime's own verdict on the bytes ------------------------------------------------
  const legality = await renderer.validateConfig(configBytes);
  if (!legality.read) {
    // AN UNREAD VALIDATOR IS UNKNOWN. Reporting it as legal would be inventing a chain fact.
    return {
      schemaVersion: 1, startedAt: started, finishedAt: nowIso(), runtimeId,
      pass: false, unknown: true,
      checks: [check("CONFIG_LEGAL", false, legality.detail)],
    };
  }
  checks.push(check("CONFIG_LEGAL", legality.legal,
    legality.legal ? "validateConfigV1 returned code 0" : `validateConfigV1 returned code ${legality.code}; the runtime refuses these bytes`,
    { code: legality.code }));
  if (!legality.legal) {
    return { schemaVersion: 1, startedAt: started, finishedAt: nowIso(), runtimeId, pass: false, unknown: false, checks };
  }

  // ---- 2. the review ring, all three states -----------------------------------------------------
  const ringCells = REVIEW_SEEDS.flatMap((seed) => MARKET_STATES.map((state) => ({ seed, state })));
  const ring = await renderer.renderMany(configBytes, ringCells);
  const ringBy = new Map(ring.map((r) => [`${r.seed}|${r.state}`, r]));
  const ringOk = ring.every((r) => r.ok);
  checks.push(check("REVIEW_RING_RENDERS", ringOk,
    ringOk ? `all ${ring.length} review renders returned ok` : `${ring.filter((r) => !r.ok).length} of ${ring.length} review renders failed`,
    { rendered: ring.length }));
  if (!ringOk) return { schemaVersion: 1, startedAt: started, finishedAt: nowIso(), runtimeId, pass: false, unknown: false, checks };

  // ---- 3. determinism ---------------------------------------------------------------------------
  // The SAME request, asked again, must come back byte for byte. `renderOne` caches, so this asks
  // through a fresh renderer view by rendering cells the ring did not touch and then repeating them.
  const detCells = [{ seed: 7, state: "neutral" }, { seed: 7, state: "stress" }, { seed: 11, state: "recovery" }];
  const detA = await renderer.renderMany(configBytes, detCells);
  const detB = [];
  for (const c of detCells) detB.push(await renderer.renderOne(configBytes, c.seed, c.state));
  const deterministic = detA.every((r, i) => r.imageSha256 === detB[i].imageSha256) && detA.every((r) => r.ok);
  checks.push(check("DETERMINISM", deterministic,
    deterministic ? "the same request returned the same bytes on a second call" : "the same request returned different bytes on a second call",
    { cells: detCells.length }));

  // ---- 4. the collection sweep ------------------------------------------------------------------
  // A HUNDRED SEEDS, NOT TWELVE. Twelve is what a person can look at; it says nothing about a
  // collection. Every duplicate and blank finding below is measured on THIS population.
  const sweepSeeds = collectionSeeds(sweepSize);
  const sweep = await renderer.renderMany(configBytes, sweepSeeds.map((seed) => ({ seed, state: "neutral" })));
  const sweepFailures = sweep.filter((r) => !r.ok);
  checks.push(check("COLLECTION_SWEEP", sweepFailures.length === 0 && sweep.length >= FLOORS.collectionSeeds,
    sweepFailures.length === 0
      ? `${sweep.length} seeds rendered, none refused`
      : `${sweepFailures.length} of ${sweep.length} seeds failed to render (failure codes ${[...new Set(sweepFailures.map((r) => r.failure))].join(", ")})`,
    { seeds: sweep.length, failures: sweepFailures.length }));

  // ---- 5. duplicates, in bytes ------------------------------------------------------------------
  const digests = new Map();
  for (const r of sweep) digests.set(r.svgSha256, (digests.get(r.svgSha256) ?? 0) + 1);
  const byteDupes = [...digests.values()].filter((n) => n > 1).length;
  checks.push(check("DUPLICATE_BYTES", byteDupes === 0,
    byteDupes === 0 ? `${digests.size} distinct documents across ${sweep.length} seeds` : `${byteDupes} document(s) appear on more than one seed`,
    { distinct: digests.size, of: sweep.length }));

  // ---- 6. duplicates, perceptually --------------------------------------------------------------
  // BYTE-DISTINCT IS NOT VISUALLY DISTINCT, and this project has already shipped a set that was the
  // first and not the second. The bytes differ on a token id printed in a corner; the picture does
  // not. Measured at browse size on a subsample, because the pairwise cost is quadratic.
  const sub = sweep.filter((_, i) => i % Math.max(1, Math.floor(sweep.length / 16)) === 0).slice(0, 16);
  const subPlanes = [];
  for (const r of sub) subPlanes.push(await planeOf(r.svg));
  let minPair = Infinity;
  let sumPair = 0;
  let pairs = 0;
  for (let i = 0; i < subPlanes.length; i++) {
    for (let j = i + 1; j < subPlanes.length; j++) {
      const d = meanDeltaE(subPlanes[i], subPlanes[j]);
      minPair = Math.min(minPair, d);
      sumPair += d;
      pairs++;
    }
  }
  const meanPair = pairs > 0 ? sumPair / pairs : 0;
  checks.push(check("DUPLICATE_PERCEPTUAL", minPair >= FLOORS.seedDiversityMin,
    `the closest pair of seeds differs by ${minPair.toFixed(3)} dE (floor ${FLOORS.seedDiversityMin})`,
    { minPairDeltaE: Number(minPair.toFixed(3)), pairs }));

  // ---- 7. seed diversity at browse size ---------------------------------------------------------
  // THE FAILURE THAT REMOVED A RUNTIME FROM WAVE 1. `PIXEL_GRID_V1/idol` cleared every state-pair
  // floor comfortably and was still held, because its frame was topologically identical on every
  // seed. That is invisible at 512px and obvious at 120. The MEAN and the MINIMUM are both
  // reported because an average hides a colliding pair inside an otherwise varied set.
  checks.push(check("SEED_DIVERSITY", meanPair >= FLOORS.seedDiversityMean && minPair >= FLOORS.seedDiversityMin,
    `seeds differ by ${meanPair.toFixed(3)} dE on average and ${minPair.toFixed(3)} at the closest pair ` +
    `(floors ${FLOORS.seedDiversityMean} / ${FLOORS.seedDiversityMin})`,
    { meanDeltaE: Number(meanPair.toFixed(3)), minDeltaE: Number(minPair.toFixed(3)) }));

  // ---- 8. blank detection -----------------------------------------------------------------------
  const inks = subPlanes.map((p) => inkCoverage(p));
  const minInk = Math.min(...inks);
  const meanInk = inks.reduce((a, b) => a + b, 0) / inks.length;
  checks.push(check("BLANK_DETECTION", minInk >= FLOORS.ink,
    `the emptiest sampled seed covers ${(minInk * 100).toFixed(1)}% of the frame with drawing (floor ${(FLOORS.ink * 100).toFixed(0)}%)`,
    { minInk: Number(minInk.toFixed(4)), meanInk: Number(meanInk.toFixed(4)) }));

  // ---- 9. the exact state-identity gate ---------------------------------------------------------
  // For EVERY review seed, the three market states must be byte-distinct documents. This is the
  // exact gate: not "different enough", but "not the same bytes". A project claiming the market
  // writes its condition and returning one document for every state is making a false claim, and
  // the claim is false at the byte level before it is false perceptually.
  const identicalPairs = [];
  for (const seed of REVIEW_SEEDS) {
    for (let i = 0; i < MARKET_STATES.length; i++) {
      for (let j = i + 1; j < MARKET_STATES.length; j++) {
        const a = ringBy.get(`${seed}|${MARKET_STATES[i]}`);
        const b = ringBy.get(`${seed}|${MARKET_STATES[j]}`);
        if (a.svgSha256 === b.svgSha256) identicalPairs.push(`${seed}:${MARKET_STATES[i]}=${MARKET_STATES[j]}`);
      }
    }
  }
  checks.push(check("STATE_IDENTITY_EXACT", identicalPairs.length === 0,
    identicalPairs.length === 0
      ? `all ${REVIEW_SEEDS.length * 3} state pairings are byte-distinct`
      : `${identicalPairs.length} state pairing(s) returned an identical document: ${identicalPairs.slice(0, 6).join(", ")}`,
    { pairings: REVIEW_SEEDS.length * 3, identical: identicalPairs.length }));

  // ---- 10. perceptual separation between states -------------------------------------------------
  const ringPlanes = new Map();
  for (const r of ring) ringPlanes.set(`${r.seed}|${r.state}`, await planeOf(r.svg));
  const pairing = {};
  const NAMES = { ns: ["neutral", "stress"], nr: ["neutral", "recovery"], sr: ["stress", "recovery"] };
  for (const [key, [a, b]] of Object.entries(NAMES)) {
    const ds = REVIEW_SEEDS.map((s) => meanDeltaE(ringPlanes.get(`${s}|${a}`), ringPlanes.get(`${s}|${b}`)));
    pairing[key] = Number((ds.reduce((x, y) => x + y, 0) / ds.length).toFixed(3));
  }
  const weakest = Object.entries(pairing).sort((a, b) => a[1] - b[1])[0];
  checks.push(check("PERCEPTUAL_SEPARATION", weakest[1] >= FLOORS.stateSeparation,
    `the weakest state pairing is ${weakest[0]} at ${weakest[1]} dE (floor ${FLOORS.stateSeparation})`,
    { ...pairing, weakestPairing: weakest[0] }));

  // ---- 11. structural roles ---------------------------------------------------------------------
  // ABLATE EACH DECLARED UNIT AND REQUIRE THE PICTURE TO CHANGE. A configuration whose third field
  // draws nothing on any seed at any state is a configuration with two fields and a lie in it, and
  // it is invisible in every aggregate: a template mean of 4.85 in this program hid exactly two
  // dead fields. The ablation is a CONFIG edit rendered through the same runtime, so the comparison
  // is between two things the chain drew.
  const units = config[rt.unit] ?? [];
  const roleFindings = [];
  if (units.length > 1) {
    const ablationSeeds = REVIEW_SEEDS.slice(0, 4);
    const base = await renderer.renderMany(configBytes, ablationSeeds.map((seed) => ({ seed, state: "neutral" })));
    const basePlanes = [];
    for (const r of base) basePlanes.push(await planeOf(r.svg));
    for (let u = 0; u < units.length; u++) {
      const without = { ...config, [rt.unit]: units.filter((_, i) => i !== u) };
      let ablatedBytes;
      try {
        ablatedBytes = `0x${rt.encode(without).toString("hex")}`;
      } catch (err) {
        roleFindings.push({ unit: u, measured: null, detail: `could not be ablated: ${err.message}` });
        continue;
      }
      const legal = await renderer.validateConfig(ablatedBytes);
      if (!legal.read || !legal.legal) {
        // AN ILLEGAL ABLATION IS NOT EVIDENCE EITHER WAY and must not score as a pass. The unit's
        // role stays UNPROVEN and the check fails, because "we could not ask" is not "we asked".
        roleFindings.push({ unit: u, measured: null, detail: `the ablated configuration is not legal (code ${legal.code ?? "unread"}), so this unit's role is UNPROVEN` });
        continue;
      }
      const abl = await renderer.renderMany(ablatedBytes, ablationSeeds.map((seed) => ({ seed, state: "neutral" })));
      const ds = [];
      for (const [i, r] of abl.entries()) ds.push(meanDeltaE(basePlanes[i], await planeOf(r.svg)));
      const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
      roleFindings.push({ unit: u, measured: Number(mean.toFixed(3)), detail: mean >= FLOORS.structuralRole ? "draws" : "removing it changes almost nothing" });
    }
  }
  const deadUnits = roleFindings.filter((r) => r.measured === null || r.measured < FLOORS.structuralRole);
  checks.push(check("STRUCTURAL_ROLE", units.length <= 1 ? minInk >= FLOORS.ink : deadUnits.length === 0,
    units.length <= 1
      ? `the configuration declares one ${rt.unit.replace(/s$/, "")}, so there is nothing to ablate against; its ink coverage of ${(minInk * 100).toFixed(1)}% is the proof that it draws`
      : deadUnits.length === 0
        ? `all ${units.length} declared ${rt.unit} change the picture when removed (weakest ${Math.min(...roleFindings.map((r) => r.measured ?? 0)).toFixed(3)} dE, floor ${FLOORS.structuralRole})`
        : `${deadUnits.length} of ${units.length} declared ${rt.unit} have no proven structural role: ${deadUnits.map((d) => `#${d.unit} (${d.detail})`).join("; ")}`,
    { units: units.length, findings: roleFindings }));

  // ---- 12. render cost --------------------------------------------------------------------------
  const gas = await renderer.estimateWorstRenderGas?.(configBytes);
  if (gas && gas.read) {
    checks.push(check("RENDER_GAS", gas.worst <= FLOORS.renderGas,
      `the most expensive sampled render costs ${gas.worst.toLocaleString()} gas (portable budget ${FLOORS.renderGas.toLocaleString()})`,
      { worstGas: gas.worst, cell: gas.cell }));
  } else {
    // NOT A SKIP. An unmeasured budget is a failed check, because the reason a launched project
    // renders on a developer's node and shows nothing in a marketplace is precisely a cost nobody
    // measured, and the art binding is one-shot.
    checks.push(check("RENDER_GAS", false, `the render cost could not be measured: ${gas?.detail ?? "no estimator was supplied"}. An unmeasured budget is not a passed one.`));
  }

  const pass = checks.every((c) => c.ok);
  return {
    schemaVersion: 1,
    startedAt: started,
    finishedAt: nowIso(),
    runtimeId,
    floors: FLOORS,
    pass,
    unknown: false,
    checks,
  };
}
