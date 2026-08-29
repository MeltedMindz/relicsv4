// SPDX-License-Identifier: MIT
// The selection filter. Three of these tests carry the names the release gate reports, and the
// mutation harness (`node test/mutate.mjs`) breaks the source under each of them to prove they
// would actually go red — a guard never shown to fail is not evidence.
import assert from "node:assert/strict";
import test from "node:test";

import {
  SELECTION_PIPELINE,
  capabilityFilter,
  humanCatalog,
  runtimeAvailability,
  selectForAutonomousAgent,
  semanticMatch,
  shipCatalog,
} from "../src/select.js";
import {
  AUTONOMOUS_SELECTABLE_STATUSES,
  isAutonomouslySelectable,
  templateStatus,
  templatesWithStatus,
} from "../src/status.js";
import { RUNTIMES, describeTemplate } from "../src/descriptors.js";
import { keccak256Utf8 } from "../src/keccak.js";

/** A registry snapshot in which every Wave-1 runtime is registered and active. */
function allActiveSnapshot() {
  const entries = new Map();
  let id = 1;
  for (const r of Object.values(RUNTIMES)) {
    entries.set(id, {
      id,
      runtime: `0x${String(id).padStart(40, "1")}`,
      codeHash: `0x${"aa".repeat(32)}`,
      tag: keccak256Utf8(r.runtimeTagPreimage),
      version: r.runtimeVersion,
      mode: r.artRuntimeMode,
      active: true,
      exists: true,
      label: r.id,
    });
    id++;
  }
  return { entries, complete: true, declaredCount: entries.size, failedReads: [], errors: [] };
}

const CAVEAT = () => templatesWithStatus("EXPERIMENTAL")[0];
const HELD = () => templatesWithStatus("HELD")[0];
const REJECTED = () => templatesWithStatus("REJECTED")[0];

// ------------------------------------------------------------------------------------------------
// THE THREE NAMED RESULTS
// ------------------------------------------------------------------------------------------------

test("AUTONOMOUS_AGENT_CAN_SELECT_CAVEAT_TEMPLATE=NO", () => {
  const id = CAVEAT();
  assert.equal(templateStatus(id), "EXPERIMENTAL");

  // 1. it is not in the pool the matcher is ever handed
  assert.ok(!shipCatalog().includes(id), `${id} reached the SHIP pool`);
  // 2. the predicate refuses it
  assert.equal(isAutonomouslySelectable(id), false);
  assert.ok(!AUTONOMOUS_SELECTABLE_STATUSES.includes("EXPERIMENTAL"));
  // 3. injecting it into the matcher directly is refused, not scored
  assert.throws(() => semanticMatch([id], "a pixel sigil, mirrored, symmetric"), /refused a EXPERIMENTAL template/);
  // 4. and a brief written to describe it exactly still cannot select it
  const out = selectForAutonomousAgent({ brief: "a mirrored low-resolution pixel sigil with a corroded bronze figure", registrySnapshot: allActiveSnapshot() });
  assert.ok(out.selected === null || isAutonomouslySelectable(out.selected), `selected ${out.selected}`);
  assert.notEqual(out.selected, id);
});

test("AUTONOMOUS_AGENT_CAN_SELECT_HELD_TEMPLATE=NO", () => {
  const id = HELD();
  assert.equal(templateStatus(id), "HELD");

  assert.ok(!shipCatalog().includes(id), `${id} reached the SHIP pool`);
  assert.equal(isAutonomouslySelectable(id), false);
  assert.ok(!AUTONOMOUS_SELECTABLE_STATUSES.includes("HELD"));
  assert.throws(() => semanticMatch([id], "a centred disc with a responsive crust"), /refused a HELD template/);

  const out = selectForAutonomousAgent({ brief: "a centred disc whose crust is stripped bare under stress and regrown in recovery", registrySnapshot: allActiveSnapshot() });
  assert.notEqual(out.selected, id);
  assert.ok(out.selected === null || isAutonomouslySelectable(out.selected));
});

test("AUTONOMOUS_AGENT_CAN_SELECT_REJECTED_TEMPLATE=NO", () => {
  const id = REJECTED();
  assert.equal(templateStatus(id), "REJECTED");

  assert.ok(!shipCatalog().includes(id), `${id} reached the SHIP pool`);
  assert.equal(isAutonomouslySelectable(id), false);
  assert.ok(!AUTONOMOUS_SELECTABLE_STATUSES.includes("REJECTED"));
  assert.throws(() => semanticMatch([id], "anything at all"), /refused a REJECTED template/);

  // A rejected template is also invisible to a HUMAN, flag or no flag. This is the one tier the
  // advanced flag does not reveal.
  const advanced = humanCatalog({ advanced: true }).map((e) => e.id);
  assert.ok(!advanced.includes(id), `${id} was revealed by the advanced flag`);

  const out = selectForAutonomousAgent({ brief: "a camouflage swatch of fine dither", registrySnapshot: allActiveSnapshot() });
  assert.notEqual(out.selected, id);
});

// ------------------------------------------------------------------------------------------------
// The pool, the order, and the two questions kept apart
// ------------------------------------------------------------------------------------------------

test("the pool is SHIP and only SHIP, and every member has a descriptor", () => {
  const pool = shipCatalog();
  assert.equal(pool.length, 7);
  for (const id of pool) {
    assert.equal(templateStatus(id), "SHIP");
    assert.ok(describeTemplate(id), `${id} has no descriptor`);
  }
  assert.deepEqual([...pool].sort(), [...templatesWithStatus("SHIP")].sort());
});

test("the filter runs BEFORE the match, and the declared pipeline says so", () => {
  const order = SELECTION_PIPELINE.map((s) => s.stage);
  assert.ok(order.indexOf("SHIP_TEMPLATE_CATALOG") < order.indexOf("SEMANTIC_ART_MATCH"));
  assert.ok(order.indexOf("CAPABILITY_FILTER") < order.indexOf("SEMANTIC_ART_MATCH"));
  assert.ok(order.indexOf("LIVE_RUNTIME_AVAILABILITY") < order.indexOf("SHIP_TEMPLATE_CATALOG"));
  assert.ok(order.indexOf("SEMANTIC_ART_MATCH") < order.indexOf("SELECT"));
  assert.ok(order.indexOf("SELECT") < order.indexOf("MUTATE_CONFIG"));
});

test("the advanced flag reveals EXPERIMENTAL and HELD, and never as a starting point", () => {
  const plain = humanCatalog();
  assert.equal(plain.length, 7);
  for (const e of plain) assert.equal(e.review.status, "SHIP");

  const advanced = humanCatalog({ advanced: true });
  assert.ok(advanced.length > plain.length);
  const extra = advanced.filter((e) => e.review.status !== "SHIP");
  assert.equal(extra.length, 10); // 4 EXPERIMENTAL + 6 HELD
  for (const e of extra) {
    assert.equal(e.offeredAsAStartingPoint, false);
    assert.equal(e.config, undefined, `${e.id} was revealed with a config; that is a starting point`);
    assert.equal(e.brief, undefined, `${e.id} was revealed with matchable brief tags`);
    assert.ok(e.weakestMeasuredStatePairing, `${e.id} was revealed with no measured weakness`);
  }
});

test("an agent has no flag: selectForAutonomousAgent takes no tier or advanced argument", () => {
  // Passing the shapes a caller might try must not widen anything.
  const snap = allActiveSnapshot();
  for (const attempt of [{ advanced: true }, { experimental: true }, { statuses: ["HELD"] }, { includeExperimental: true }]) {
    const out = selectForAutonomousAgent({ brief: "a centred disc", registrySnapshot: snap, ...attempt });
    assert.ok(out.selected === null || isAutonomouslySelectable(out.selected), `${JSON.stringify(attempt)} widened the pool to ${out.selected}`);
  }
});

// ------------------------------------------------------------------------------------------------
// Live availability — fail closed, in every direction
// ------------------------------------------------------------------------------------------------

test("an unread registry is UNKNOWN and refuses a selection; it is never NOT_REGISTERED", () => {
  for (const snapshot of [null, { entries: new Map(), complete: false, declaredCount: null, failedReads: [3], errors: ["boom"] }]) {
    const live = runtimeAvailability(snapshot);
    for (const id of Object.keys(RUNTIMES)) {
      assert.equal(live[id].state, "UNKNOWN", `${id} reported ${live[id].state} for an unread registry`);
    }
    const out = selectForAutonomousAgent({ brief: "a growth", registrySnapshot: snapshot });
    assert.equal(out.selected, null);
    assert.match(out.reason, /NO_ACTIVE_RUNTIME/);
  }
});

test("today's real answer: none of the four runtimes is registered on a chain that reads empty", () => {
  const empty = { entries: new Map(), complete: true, declaredCount: 0, failedReads: [], errors: [] };
  const live = runtimeAvailability(empty);
  for (const id of Object.keys(RUNTIMES)) assert.equal(live[id].state, "NOT_REGISTERED");
  const out = selectForAutonomousAgent({ brief: "a growth whose extent reads the healing", registrySnapshot: empty });
  assert.equal(out.selected, null);
});

test("identity is label AND tag AND mode; a lookalike entry is not the runtime", () => {
  const good = allActiveSnapshot();
  const first = [...good.entries.keys()][0];

  const wrongTag = { ...good, entries: new Map(good.entries) };
  wrongTag.entries.set(first, { ...wrongTag.entries.get(first), tag: `0x${"11".repeat(32)}` });
  assert.equal(runtimeAvailability(wrongTag)[good.entries.get(first).label].state, "NOT_REGISTERED");

  const wrongMode = { ...good, entries: new Map(good.entries) };
  wrongMode.entries.set(first, { ...wrongMode.entries.get(first), mode: 2 });
  assert.equal(runtimeAvailability(wrongMode)[good.entries.get(first).label].state, "NOT_REGISTERED");

  const zeroAddress = { ...good, entries: new Map(good.entries) };
  zeroAddress.entries.set(first, { ...zeroAddress.entries.get(first), runtime: "0x0000000000000000000000000000000000000000" });
  assert.equal(runtimeAvailability(zeroAddress)[good.entries.get(first).label].state, "NOT_REGISTERED");
});

test("an INACTIVE or UNKNOWN runtime removes its templates from the pool", () => {
  const snap = allActiveSnapshot();
  const key = [...snap.entries.keys()].find((k) => snap.entries.get(k).label === "GEOMETRIC_RECURSION_V1");
  snap.entries.set(key, { ...snap.entries.get(key), active: false });
  const live = runtimeAvailability(snap);
  assert.equal(live.GEOMETRIC_RECURSION_V1.state, "INACTIVE");

  const { kept, dropped } = capabilityFilter(shipCatalog(), live);
  assert.equal(kept.length, 4);
  assert.equal(dropped.length, 3);
  for (const d of dropped) assert.equal(d.runtimeId, "GEOMETRIC_RECURSION_V1");

  const unknown = capabilityFilter(shipCatalog(), {});
  assert.equal(unknown.kept.length, 0);
  for (const d of unknown.dropped) assert.equal(d.state, "UNKNOWN");
});

// ------------------------------------------------------------------------------------------------
// The match, and the thing the match must NOT become
// ------------------------------------------------------------------------------------------------

test("a brief selects on meaning, from the SHIP pool", () => {
  const snap = allActiveSnapshot();
  const cases = [
    ["a collection about organic growth, branching and healing", "GEOMETRIC_RECURSION_V1/dendron"],
    ["layered sediment and geological strata, horizontal banding", "VECTOR_COMPOSITION_V1/alluvium"],
    ["low-resolution pixel creatures, bronze and corroded", "PIXEL_GRID_V1/idol"],
  ];
  for (const [brief, expected] of cases) {
    const out = selectForAutonomousAgent({ brief, registrySnapshot: snap });
    assert.equal(out.selected, expected, `"${brief}" selected ${out.selected}`);
  }
});

test("no match is a refusal, not a fallback to whatever ranked least badly", () => {
  const out = selectForAutonomousAgent({ brief: "zzzz qqqq wwww", registrySnapshot: allActiveSnapshot() });
  assert.equal(out.selected, null);
  assert.match(out.reason, /NO_SEMANTIC_MATCH/);
});

test("THE TEMPLATE IS A STARTING POINT: nothing here bounds the config that follows", () => {
  // The selection result carries no config, no similarity budget and no drift bound, and every
  // descriptor says the preset may be changed as far as the runtime's validator allows.
  const out = selectForAutonomousAgent({ brief: "organic branching growth", registrySnapshot: allActiveSnapshot() });
  assert.equal(out.config, undefined);
  assert.equal(out.mustResemble, undefined);
  assert.equal(out.allowedDrift, undefined);
  for (const d of humanCatalog()) {
    assert.equal(d.mutation.presetIsAStartingPoint, true);
    assert.equal(d.mutation.bound, "the runtime's own config validator, and nothing else");
    assert.ok(d.mutation.mayChange.includes("sensors"));
    assert.ok(d.mutation.mayChange.includes("curves"));
    assert.ok(d.mutation.mayChange.includes("palette"));
  }
});

test("the match score is a match score, never persisted as a quality score", () => {
  const ranked = semanticMatch(shipCatalog(), "organic branching growth");
  assert.ok(ranked.every((r) => typeof r.score === "number"));
  for (const d of humanCatalog()) {
    assert.equal(d.score, undefined);
    assert.equal(d.rank, undefined);
    assert.equal(d.rating, undefined);
  }
});
