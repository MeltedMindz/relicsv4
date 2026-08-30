// SPDX-License-Identifier: MIT
// The selection filter. Three of these tests carry the names the release gate reports, and the
// mutation harness (`node test/mutate.mjs`) breaks the source under each of them to prove they
// would actually go red — a guard never shown to fail is not evidence.
import assert from "node:assert/strict";
import test from "node:test";

import {
  SELECTION_PIPELINE,
  assertAutonomousSelection,
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
import { RUNTIMES, RUNTIMES_LEFT_WAVE1, describeTemplate } from "../src/descriptors.js";
import { keccak256Utf8 } from "../src/keccak.js";

/**
 * A registry snapshot in which every Wave-1 runtime is registered and active.
 *
 * `tag` IS `0x`-PREFIXED BECAUSE THAT IS WHAT THE CHAIN GIVES US. `readRegistrySnapshot` passes
 * viem's decoded `bytes32` straight through and viem prefixes it. This fixture used to call
 * `keccak256Utf8` directly, which returns BARE hex, so it compared the selector's own output
 * against itself and every ACTIVE assertion in this file passed on a spelling production never
 * sends. Meanwhile the real selector answered NOT_REGISTERED for runtimes that were registered and
 * active on all three chains. Build fixtures in the shape the PRODUCER emits, not the shape the
 * consumer happens to compute.
 */
function allActiveSnapshot({ tagPrefix = "0x" } = {}) {
  const entries = new Map();
  let id = 1;
  for (const r of Object.values(RUNTIMES)) {
    entries.set(id, {
      id,
      runtime: `0x${String(id).padStart(40, "1")}`,
      codeHash: `0x${"aa".repeat(32)}`,
      tag: `${tagPrefix}${keccak256Utf8(r.runtimeTagPreimage)}`,
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

/**
 * The four ways an agent could reach a template, asked of EVERY member of a tier.
 *
 * Asking about one member proves the tier is refused only if that member is representative, and the
 * tiers moved twice on 2026-08-29 — `reliquary` joined EXPERIMENTAL, `cairn` and `dendron` joined
 * HELD, `crux` joined REJECTED, and then `idol` joined HELD too — so the member `[0]` returns today
 * is not the member it returned before. A guard evaluated against a moving sample is a guard
 * evaluated against luck.
 */
function refuseEveryMemberOf(status) {
  const members = templatesWithStatus(status);
  assert.ok(members.length > 0, `no ${status} templates to refuse; this assertion would be vacuous`);
  const pool = shipCatalog();
  for (const id of members) {
    assert.equal(templateStatus(id), status);
    assert.ok(!pool.includes(id), `${id} reached the SHIP pool`);
    assert.equal(isAutonomouslySelectable(id), false, id);
    assert.throws(() => semanticMatch([id], "anything at all"), new RegExp(`refused a ${status} template`), id);
    assert.throws(() => assertAutonomousSelection(id), /bug in the filter/, id);
  }
  return members.length;
}

// ------------------------------------------------------------------------------------------------
// THE THREE NAMED RESULTS
// ------------------------------------------------------------------------------------------------

test("AUTONOMOUS_AGENT_CAN_SELECT_CAVEAT_TEMPLATE=NO", () => {
  const id = CAVEAT();
  // 1-4, asked of every EXPERIMENTAL template: the pool, the predicate, the matcher, the backstop.
  assert.equal(refuseEveryMemberOf("EXPERIMENTAL"), 5);
  assert.ok(!AUTONOMOUS_SELECTABLE_STATUSES.includes("EXPERIMENTAL"));
  // and a brief written to describe one of them exactly still cannot select it
  const out = selectForAutonomousAgent({ brief: "a mirrored low-resolution pixel sigil with a corroded bronze figure", registrySnapshot: allActiveSnapshot() });
  assert.ok(out.selected === null || isAutonomouslySelectable(out.selected), `selected ${out.selected}`);
  assert.notEqual(out.selected, id);
});

test("AUTONOMOUS_AGENT_CAN_SELECT_HELD_TEMPLATE=NO", () => {
  const id = HELD();
  assert.equal(refuseEveryMemberOf("HELD"), 9);
  assert.ok(!AUTONOMOUS_SELECTABLE_STATUSES.includes("HELD"));

  const out = selectForAutonomousAgent({ brief: "a centred disc whose crust is stripped bare under stress and regrown in recovery", registrySnapshot: allActiveSnapshot() });
  assert.notEqual(out.selected, id);
  assert.ok(out.selected === null || isAutonomouslySelectable(out.selected));

  // THE BRIEF idol WOULD HAVE WON. It was SHIP until the blind review of its repaired frame held it
  // on 2026-08-29, and its brief tags are still the best words in the wave for this sentence. A
  // matcher that could still see it would rank it first, which is exactly the failure the filter
  // exists to prevent — so this is asserted on the words that used to select it, not on new ones.
  const pixelBrief = selectForAutonomousAgent({
    brief: "a mirrored low-resolution pixel idol, a bronze corroded totem figure at 16x16",
    registrySnapshot: allActiveSnapshot(),
  });
  assert.notEqual(pixelBrief.selected, "PIXEL_GRID_V1/idol");
  assert.ok(pixelBrief.selected === null || isAutonomouslySelectable(pixelBrief.selected));
});

test("AUTONOMOUS_AGENT_CAN_SELECT_REJECTED_TEMPLATE=NO", () => {
  const id = REJECTED();
  assert.equal(refuseEveryMemberOf("REJECTED"), 19);
  assert.ok(!AUTONOMOUS_SELECTABLE_STATUSES.includes("REJECTED"));

  // A rejected template is also invisible to a HUMAN, flag or no flag. This is the one tier the
  // advanced flag does not reveal — asked of every one of them.
  const advanced = new Set(humanCatalog({ advanced: true }).map((e) => e.id));
  for (const rejected of templatesWithStatus("REJECTED")) {
    assert.ok(!advanced.has(rejected), `${rejected} was revealed by the advanced flag`);
  }

  const out = selectForAutonomousAgent({ brief: "a camouflage swatch of fine dither", registrySnapshot: allActiveSnapshot() });
  assert.notEqual(out.selected, id);
});

// ------------------------------------------------------------------------------------------------
// The pool, the order, and the two questions kept apart
// ------------------------------------------------------------------------------------------------

test("the final selection assertion refuses every tier below SHIP", () => {
  // The backstop, exercised directly. It only fires when the pool filter and the matcher's own
  // refusal have both been weakened, so the only way to show it works is to call it.
  for (const id of [CAVEAT(), HELD(), REJECTED()]) {
    assert.throws(() => assertAutonomousSelection(id), /is a bug in the filter, not a permitted outcome/, id);
  }
  assert.throws(() => assertAutonomousSelection("GEOMETRIC_RECURSION_V1/nosuchtemplate"), /bug in the filter/);
  for (const id of shipCatalog()) assert.equal(assertAutonomousSelection(id), id);
});

test("the pool is SHIP and only SHIP, and every member has a descriptor", () => {
  const pool = shipCatalog();
  assert.equal(pool.length, 2);
  for (const id of pool) {
    assert.equal(templateStatus(id), "SHIP");
    assert.ok(describeTemplate(id), `${id} has no descriptor`);
  }
  assert.deepEqual([...pool].sort(), [...templatesWithStatus("SHIP")].sort());
});

test("a runtime that LEFT Wave 1 is not in the availability question, and owns no SHIP template", () => {
  const live = runtimeAvailability(allActiveSnapshot());
  assert.ok(Object.keys(RUNTIMES_LEFT_WAVE1).length >= 2, "this loop would be near-vacuous with fewer");
  for (const departed of Object.keys(RUNTIMES_LEFT_WAVE1)) {
    assert.equal(RUNTIMES[departed], undefined, `${departed} is still listed as a Wave-1 runtime`);
    assert.equal(live[departed], undefined, `${departed} was given a live availability answer`);
    // Even with every runtime reported ACTIVE, nothing of its is reachable.
    for (const id of shipCatalog()) assert.notEqual(id.split("/")[0], departed);
    for (const id of templatesWithStatus("SHIP")) assert.notEqual(id.split("/")[0], departed);
  }
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
  assert.equal(plain.length, 2);
  for (const e of plain) assert.equal(e.review.status, "SHIP");

  const advanced = humanCatalog({ advanced: true });
  assert.ok(advanced.length > plain.length);
  const extra = advanced.filter((e) => e.review.status !== "SHIP");
  assert.equal(extra.length, 14); // 5 EXPERIMENTAL + 9 HELD
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
    const out = selectForAutonomousAgent({ brief: "an instrument", registrySnapshot: snapshot });
    assert.equal(out.selected, null);
    assert.match(out.reason, /NO_ACTIVE_RUNTIME/);
  }
});

test("today's real answer: neither Wave-1 runtime is registered on a chain that reads empty", () => {
  const empty = { entries: new Map(), complete: true, declaredCount: 0, failedReads: [], errors: [] };
  const live = runtimeAvailability(empty);
  for (const id of Object.keys(RUNTIMES)) assert.equal(live[id].state, "NOT_REGISTERED");
  const out = selectForAutonomousAgent({ brief: "rings of rings, coloured by level", registrySnapshot: empty });
  assert.equal(out.selected, null);
});

test("runtimeAvailabilityAcceptsBothTagSpellings — 0x-prefixed and bare are the same 32 bytes", () => {
  // THE REGRESSION THIS PINS. A bytes32 has one value and two spellings. `keccak256Utf8` emits bare
  // hex; viem — and therefore `readRegistrySnapshot`, and therefore production — emits `0x`-prefixed.
  // Comparing the two as strings made every runtime read NOT_REGISTERED on every chain, and the old
  // fixture hid it by generating the bare spelling the comparison happened to expect.
  for (const tagPrefix of ["0x", "", "0X"]) {
    const live = runtimeAvailability(allActiveSnapshot({ tagPrefix }));
    for (const id of Object.keys(RUNTIMES)) {
      assert.equal(live[id].state, "ACTIVE", `tag spelled with prefix ${JSON.stringify(tagPrefix)} must resolve ${id} to ACTIVE`);
    }
  }
  // ...and normalisation must not become a way for a WRONG value to pass in either spelling.
  for (const badTag of [`0x${"11".repeat(32)}`, "11".repeat(32), "0xdeadbeef", "", "not-hex"]) {
    const snap = allActiveSnapshot();
    const first = [...snap.entries.keys()][0];
    const label = snap.entries.get(first).label;
    snap.entries.set(first, { ...snap.entries.get(first), tag: badTag });
    assert.equal(runtimeAvailability(snap)[label].state, "NOT_REGISTERED", `tag ${JSON.stringify(badTag)} must not identify ${label}`);
  }
});

test("identity is label AND tag AND mode; a lookalike entry is not the runtime", () => {
  const good = allActiveSnapshot();
  const first = [...good.entries.keys()][0];

  // Baseline: the unmutated entry really does resolve, so each mutation below is shown to be what
  // flips it. Without this the whole test passes even if NOTHING can ever be ACTIVE.
  assert.equal(runtimeAvailability(good)[good.entries.get(first).label].state, "ACTIVE");

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
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 1);
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
    ["concentric rings, a navigational instrument, radial and nested", "GEOMETRIC_RECURSION_V1/compass"],
    ["layered sediment and geological strata, horizontal banding", "VECTOR_COMPOSITION_V1/alluvium"],
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
  const out = selectForAutonomousAgent({ brief: "concentric radial rings", registrySnapshot: allActiveSnapshot() });
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
  const ranked = semanticMatch(shipCatalog(), "concentric radial rings");
  assert.ok(ranked.every((r) => typeof r.score === "number"));
  for (const d of humanCatalog()) {
    assert.equal(d.score, undefined);
    assert.equal(d.rank, undefined);
    assert.equal(d.rating, undefined);
  }
});

// ------------------------------------------------------------------------------------------------
// THE ONTOLOGY, JUDGED BY OUTCOME
// ------------------------------------------------------------------------------------------------
//
// THE DEFECT THESE PIN, MEASURED END TO END (2026-08-30). Every corpus the matcher read — tags,
// use-cases, refusals, prose — was summed into ONE bag-of-words score, and the RUNTIME's own account
// of what it draws was not read at all. Two failures came out of that single design, and only the
// first is a missing field:
//
//   1. A brief could name the MEDIUM exactly and reach nothing. "recursive" appears nowhere but in
//      GEOMETRIC_RECURSION_V1's own summary, so the brief below scored `compass` at ZERO.
//   2. A MARKET word and a MEDIUM word competed on the same axis. The brief was answered with a
//      SEDIMENT template, which won on the single word "recovery" — a market term that happens to
//      sit in that template's summary sentence. With two runtimes in the wave that decided roughly
//      half of every autonomous selection.
//
// Fixing only (1) would have made this brief come out right and left the mechanism wrong: the next
// market word would have won the next brief. These tests are written from OUTCOMES so they can be
// run against the old scorer directly; the axis receipts are proved in `ontology.test.mjs`.
//
// The suite of the day stayed green throughout, because every fixture brief in it echoed a
// template's own tags.

test("A_BRIEF_THAT_NAMES_THE_MEDIUM_REACHES_ITS_RUNTIME", () => {
  const snap = allActiveSnapshot();

  // THE PRODUCTION BRIEF, VERBATIM.
  const brief = "recursive architectural botanical forms changing during recovery";
  const out = selectForAutonomousAgent({ brief, registrySnapshot: snap });
  assert.equal(out.selected, "GEOMETRIC_RECURSION_V1/compass", `"${brief}" selected ${out.selected}`);

  // AND IT MUST WIN, NOT TIE. Ranking first on the alphabetical tiebreak would be luck: rename
  // either runtime and the answer flips. The margin has to come from the score.
  const compass = out.considered.find((r) => r.id === "GEOMETRIC_RECURSION_V1/compass");
  const alluvium = out.considered.find((r) => r.id === "VECTOR_COMPOSITION_V1/alluvium");
  assert.ok(compass.score > alluvium.score, `compass ${compass.score} did not beat alluvium ${alluvium.score}`);

  // A SECOND MEDIUM BRIEF, IN THE OTHER DIRECTION, so this is not one sentence's luck. And a THIRD
  // that names the medium in a different inflection from the one the runtime published — the engine
  // says "geometry" and the creator says "geometric", which is the ordinary way people write.
  assert.equal(
    selectForAutonomousAgent({ brief: "primitives composed onto a flat plate in layered fields", registrySnapshot: snap }).selected,
    "VECTOR_COMPOSITION_V1/alluvium",
  );
  assert.equal(
    selectForAutonomousAgent({ brief: "geometric systems that become denser as trading volume rises", registrySnapshot: snap }).selected,
    "GEOMETRIC_RECURSION_V1/compass",
  );
});

test("MARKET_LANGUAGE_NEVER_DECIDES_AN_ARTISTIC_QUESTION", () => {
  const snap = allActiveSnapshot();

  // Every template in this wave responds to the market, so market words distinguish none of them.
  // Here the ONLY template binding STRESS is alluvium, and the brief asks for stress — while every
  // artistic word in it belongs to compass. The market must lose that argument.
  const out = selectForAutonomousAgent({
    brief: "a nested concentric radial instrument, precise and cartographic, that densifies under stress",
    registrySnapshot: snap,
  });
  assert.equal(out.selected, "GEOMETRIC_RECURSION_V1/compass", `selected ${out.selected}`);

  // And the mirror: the artistic words belong to alluvium while the market word "drawdown" is the
  // one compass's own use-case is written about.
  const mirror = selectForAutonomousAgent({
    brief: "geological strata and horizontal banding, deposited in beds, cut back by drawdown",
    registrySnapshot: snap,
  });
  assert.equal(mirror.selected, "VECTOR_COMPOSITION_V1/alluvium", `selected ${mirror.selected}`);
});

test("THE_RUNTIME_NAME_IS_NOT_A_MATCHABLE_KEYWORD", () => {
  const snap = allActiveSnapshot();

  // THE OTHER HALF OF THE SAME E2E, AND THE MORE IMPORTANT HALF. The selector went AGAINST a
  // keyword here and was right to: the brief says "vector composition", and the answer is the
  // engine whose name contains neither word.
  //
  // Bringing the runtime into the corpus is exactly the change that could break this, and breaking
  // it would trade one defect for a worse one: routing a brief to an engine because of what the
  // engine is CALLED is name-matching wearing a semantic coat, and the wrong answer looks right.
  const brief = "large abstract vector composition fractured by drawdown";
  const out = selectForAutonomousAgent({ brief, registrySnapshot: snap });
  assert.equal(out.selected, "GEOMETRIC_RECURSION_V1/compass", `"${brief}" selected ${out.selected}`);

  const compass = out.considered.find((r) => r.id === "GEOMETRIC_RECURSION_V1/compass");
  const alluvium = out.considered.find((r) => r.id === "VECTOR_COMPOSITION_V1/alluvium");
  assert.ok(compass.score > alluvium.score, `compass ${compass.score} did not beat alluvium ${alluvium.score}`);

  // DERIVED, NEVER HAND-LISTED, AND NARROWER THAN IT FIRST LOOKS.
  //
  // WHAT THIS DOES **NOT** CLAIM: that a brief containing a runtime's name can never reach that
  // runtime. That claim is unachievable and it is also wrong — GEOMETRIC_RECURSION_V1 describes
  // itself as "recursive geometry", so refusing every word morphologically near its label would
  // empty its corpus and restore the defect the test above pins. Runtime names are EVIDENCE, not
  // commands, and "geometric" is answered by the description word "geometry" on the merits.
  //
  // WHAT IT DOES CLAIM: the LABEL ITSELF is not evidence. The words to test are therefore derived —
  // the tokens where a runtime's label and its own self-description COLLIDE, which is where a
  // matcher would otherwise start routing by name without anyone noticing. In this wave that is
  // "vector", which VECTOR_COMPOSITION_V1 restates verbatim in its own summary. On its own it must
  // move nothing.
  const collisions = [];
  for (const [runtimeId, runtime] of Object.entries(RUNTIMES)) {
    const summaryWords = new Set(runtime.summary.toLowerCase().split(/[^a-z0-9-]+/));
    for (const nameWord of runtimeId.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)) {
      if (!summaryWords.has(nameWord)) continue;
      collisions.push(`${runtimeId}:${nameWord}`);
      const ranked = semanticMatch(shipCatalog(), nameWord);
      const own = ranked.find((r) => r.id.split("/")[0] === runtimeId);
      const other = ranked.find((r) => r.id.split("/")[0] !== runtimeId);
      assert.ok(
        own.score <= other.score,
        `the label word "${nameWord}" put its own runtime ahead on its own: ${own.id} ${own.score} vs ${other.id} ${other.score}`,
      );
    }
  }
  assert.ok(collisions.length > 0, "no runtime restates its own label in its summary, so this loop proved nothing");
});

test("A_BRIEF_THAT_NAMES_NEITHER_MEDIUM_STILL_DECLINES", () => {
  const snap = allActiveSnapshot();
  // A WIDER CORPUS IS A WIDER CHANCE OF A WEAK ACCIDENTAL HIT, and a weak pick is worse than a
  // refusal: the agent can ask again, and cannot un-launch. Each of these is a different way to
  // arrive at nothing — a medium nobody in the wave draws, pure noise, a brief that describes only
  // market behaviour (true of every template here, so it chooses between none of them), and a brief
  // whose perfect match is a template the blind review HELD.
  for (const brief of [
    "a typographic wordmark collection in a monospaced grotesque",
    "zzzz qqqq wwww",
    "a cellular automaton spreading across a pixel lattice, one generation per block",
    "forms that change during recovery",
    "a mirrored low-resolution pixel idol: a corroded bronze totem figure, sixteen by sixteen, stripped bare under stress and regrown in recovery",
    // AND THE SPELLING-COINCIDENCE WITNESS. "flowering" and "spring" both contain the letters of
    // "rings", and one of the SHIP templates publishes "rings" as a tag. A matcher that treats a
    // word found anywhere inside another as a relation hands this meadow to an orrery — which is
    // not a hypothetical: matching "during" to "rings" is exactly how an earlier build answered two
    // briefs it should have refused. English inflection is suffixal, so a related word is a PREFIX;
    // anything else inside a word is a coincidence of spelling.
    "a flowering spring meadow in soft light",
  ]) {
    const out = selectForAutonomousAgent({ brief, registrySnapshot: snap });
    assert.equal(out.selected, null, `"${brief}" selected ${out.selected}`);
    assert.match(out.reason, /NO_SEMANTIC_MATCH/);
  }
});
