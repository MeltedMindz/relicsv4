// SPDX-License-Identifier: MIT
// The published descriptors: complete, measured, and carrying neither a chain fact nor a score.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readdirSync } from "node:fs";

import {
  DESCRIPTOR_SCHEMA_VERSION,
  RUNTIMES,
  RUNTIMES_LEFT_WAVE1,
  TEMPLATE_DESCRIPTORS,
  assertNoQualityScore,
  describeAll,
  describeTemplate,
  describeUnshippedTemplate,
  validateDescriptor,
} from "../src/descriptors.js";
import { assertNoLaunchabilityClaim, templatesWithStatus } from "../src/status.js";
import {
  EFFECTIVE_SIGNAL_FLOOR_PER_MILLE,
  FIXTURE_FAMILY,
  VISUAL_SENSORS,
  isEffective,
  movement,
  readSensorMovement,
  readStateDistinction,
} from "../src/signals.js";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");

test("there is one descriptor per SHIP template and no others", () => {
  assert.equal(TEMPLATE_DESCRIPTORS.length, 3);
  assert.deepEqual(TEMPLATE_DESCRIPTORS.map((d) => d.id).sort(), [...templatesWithStatus("SHIP")].sort());
});

test("no descriptor belongs to a runtime that LEFT Wave 1, and the departure is recorded", () => {
  assert.deepEqual(Object.keys(RUNTIMES_LEFT_WAVE1), ["CELLULAR_SYSTEM_V1"]);
  for (const [id, record] of Object.entries(RUNTIMES_LEFT_WAVE1)) {
    assert.equal(RUNTIMES[id], undefined, `${id} is both a Wave-1 runtime and a departed one`);
    assert.match(record.reason, /ZERO_SHIP_TEMPLATES/);
    assert.ok(record.leftAt);
    // A departure record is not a launchability claim either.
    assert.deepEqual(assertNoLaunchabilityClaim(record), []);
  }
  for (const d of TEMPLATE_DESCRIPTORS) assert.ok(RUNTIMES[d.runtimeId], `${d.id} names ${d.runtimeId}, which is not a Wave-1 runtime`);
});

test("the package publishes a sheet FILE for SHIP templates and for nobody else", () => {
  const published = new Set(readdirSync(join(PKG, "sheets")).filter((f) => f.endsWith(".png")));
  const expected = new Set(TEMPLATE_DESCRIPTORS.flatMap((d) => Object.values(d.sheets).map((s) => s.name)));
  assert.ok(expected.size >= 6, `only ${expected.size} sheets expected; that floor would pass on nothing`);
  assert.deepEqual([...published].sort(), [...expected].sort(),
    "a picture of a template an agent may not select is still a picture of it; removing the descriptor and leaving the sheet publishes the temptation the descriptor rule exists to remove");
});

test("every descriptor is well-formed", () => {
  for (const d of TEMPLATE_DESCRIPTORS) assert.deepEqual(validateDescriptor(d), [], `${d.id}`);
});

test("every descriptor carries the fields a creator and an agent were promised", () => {
  for (const full of describeAll()) {
    assert.equal(full.descriptorSchemaVersion, DESCRIPTOR_SCHEMA_VERSION);
    assert.ok(full.id && full.name && full.title && full.summary);
    assert.ok(RUNTIMES[full.runtime.id]);
    assert.equal(typeof full.runtime.runtimeVersion, "number");
    assert.equal(typeof full.runtime.configSchemaVersion, "number");
    assert.ok(full.brief.tags.length >= 5);
    assert.ok(full.brief.useCases.length >= 2);
    assert.equal(typeof full.marketResponsive, "boolean");
    assert.ok(full.signals.supported.visual.length === 9);
    assert.ok(full.signals.bound.length >= 1);
    assert.ok(full.sheets.seedGrid120.sha256 && full.sheets.states.sha256);
    assert.match(full.config.keccak256, /^[0-9a-f]{64}$/, "digests are BARE hex: 0x + 64 hex is the raw private-key shape the secret scanner refuses");
    assert.ok(["SHIP", "EXPERIMENTAL", "HELD", "REJECTED"].includes(full.review.status));
  }
});

test("the config schema versions are the ones the runtimes actually require — 2, 1, 1", () => {
  assert.equal(RUNTIMES.GEOMETRIC_RECURSION_V1.configSchemaVersion, 2);
  assert.equal(RUNTIMES.VECTOR_COMPOSITION_V1.configSchemaVersion, 1);
  assert.equal(RUNTIMES.PIXEL_GRID_V1.configSchemaVersion, 1);
  // The config version is NOT the runtime version, and assuming it is produces ERR_VERSION.
  for (const r of Object.values(RUNTIMES)) assert.equal(r.runtimeVersion, 1);
  assert.notEqual(RUNTIMES.GEOMETRIC_RECURSION_V1.configSchemaVersion, RUNTIMES.GEOMETRIC_RECURSION_V1.runtimeVersion);
});

test("no descriptor claims a runtime is registered, active, deployed or launchable", () => {
  for (const d of TEMPLATE_DESCRIPTORS) assert.deepEqual(assertNoLaunchabilityClaim(d), [], `${d.id}`);
  for (const full of describeAll()) {
    assert.equal(full.chain, undefined, `${full.id} carries a chain field; the answer must be read live`);
    assert.deepEqual(assertNoLaunchabilityClaim(full), []);
    const text = JSON.stringify(full).toLowerCase();
    for (const claim of ["\"launchable\"", "\"registered\"", "\"deployed\"", "\"active\""]) {
      assert.ok(!text.includes(claim), `${full.id} publishes ${claim}`);
    }
  }
  for (const r of Object.values(RUNTIMES)) assert.deepEqual(assertNoLaunchabilityClaim(r), [], r.id);

  // POSITIVE CONTROL. Without this the test proves only that today's descriptors happen to be
  // clean, which a guard that returns nothing at all also satisfies.
  for (const planted of [{ launchable: true }, { registered: true }, { chainIds: [1] }, { address: "0x00" }, { codeHash: "0x00" }]) {
    assert.equal(assertNoLaunchabilityClaim(planted).length, 1, `the guard did not catch ${JSON.stringify(planted)}`);
  }
  assert.deepEqual(assertNoLaunchabilityClaim({ id: "X", summary: "a thing" }), []);
});

test("no subjective numeric quality score is published anywhere", () => {
  for (const full of describeAll()) assert.deepEqual(assertNoQualityScore(full, full.id), []);
  for (const id of templatesWithStatus("HELD")) assert.deepEqual(assertNoQualityScore(describeUnshippedTemplate(id), id), []);
  // The guard really catches one.
  assert.ok(assertNoQualityScore({ nested: { qualityScore: 8 } }).length === 1);
  assert.ok(assertNoQualityScore({ list: [{ rating: 4 }] }).length === 1);
  // and does not catch a measurement
  assert.deepEqual(assertNoQualityScore({ perMille: 440, deltaE: 9.08, bytes: 92 }), []);
});

// ------------------------------------------------------------------------------------------------
// EFFECTIVE SIGNALS — measured, not asserted
// ------------------------------------------------------------------------------------------------

test("the census parsed, and refuses to have parsed nothing", () => {
  const { byFamily, byCurve, familyRows, curveRows } = readSensorMovement();
  assert.ok(byFamily.has(FIXTURE_FAMILY));
  assert.ok(familyRows >= 27, `only ${familyRows} family rows`);
  assert.ok(curveRows >= 36, `only ${curveRows} curve rows`);
  assert.equal(byCurve.size, 4);
  assert.ok(Object.keys(readStateDistinction().census).length >= 30);
});

test("the four measured-dead readings the census names really are refused", () => {
  // These are the exact rows the runtime design brief calls dead on the REVIEW fixtures.
  assert.equal(isEffective("FLOW_BIAS", "LINEAR"), false);
  assert.equal(isEffective("QUOTE_VOLUME", "LINEAR"), false);
  assert.equal(isEffective("LIQUIDITY", "LINEAR"), false);
  assert.equal(movement("FLOW_BIAS", "LINEAR").max, 0);
  assert.equal(movement("QUOTE_VOLUME", "LINEAR").max, 0);

  // LOG2 over VOLATILITY is a live sensor rendered stone — 937/937/937.
  assert.equal(movement("VOLATILITY", "LOG2").max, 0);
  assert.equal(isEffective("VOLATILITY", "LOG2"), false);
  // and LOG2 over RECOVERY is the opposite: it lifts neutral from 10 to 562 and separates all three.
  assert.ok(movement("RECOVERY", "LOG2").ns >= EFFECTIVE_SIGNAL_FLOOR_PER_MILLE);
});

test("effectiveness is decided by the measurement, and it disagrees with the schema", () => {
  // Every runtime ACCEPTS all nine visual sensors. Acceptance is not effectiveness.
  for (const s of VISUAL_SENSORS) assert.doesNotThrow(() => movement(s, "LINEAR"));
  const deadUnderLinear = VISUAL_SENSORS.filter((s) => !isEffective(s, "LINEAR"));
  assert.ok(deadUnderLinear.length >= 4, `expected several dead sensors, got ${deadUnderLinear.join(", ")}`);
});

test("idol's EPOCH binding is published as INEFFECTIVE, with its measured reason", () => {
  const idol = describeTemplate("PIXEL_GRID_V1/idol");
  const epoch = idol.signals.ineffective.find((b) => b.sensor === "EPOCH");
  assert.ok(epoch, "idol's EPOCH binding was published as effective");
  assert.match(epoch.reason, /moves at most 125 per mille/);
  assert.ok(idol.signals.bound.some((b) => b.sensor === "EPOCH"), "the binding is still published as bound");
});

test("the curve, not the sensor, decides whether a binding separates neutral from stress", () => {
  // This was published as a fact about `crux`, which the final blind review rejected and which
  // therefore has no descriptor any more. The MEASUREMENT it rested on is unchanged and is the
  // part that was ever load-bearing: RECOVERY under LOG2 separates neutral from stress and the
  // same sensor under LINEAR does not, so a template binding one sensor can still be responsive.
  assert.ok(movement("RECOVERY", "LOG2").ns >= EFFECTIVE_SIGNAL_FLOOR_PER_MILLE);
  assert.ok(movement("RECOVERY", "LINEAR").ns < EFFECTIVE_SIGNAL_FLOOR_PER_MILLE);
  assert.equal(describeTemplate("CELLULAR_SYSTEM_V1/crux"), null, "a REJECTED template still has a descriptor");
  // compass carries that same binding, and every one of its state pairings separates.
  const compass = describeTemplate("GEOMETRIC_RECURSION_V1/compass");
  assert.ok(compass.signals.bound.some((b) => b.sensor === "RECOVERY" && b.curve === "LOG2"));
  for (const pair of ["ns", "nr", "sr"]) assert.equal(compass.marketResponse.configMovement.pairs[pair].separated, true);
});

test("market-responsive is measured twice, by two methods, and both must agree", () => {
  for (const full of describeAll()) {
    assert.equal(full.marketResponse.configMovement.fixtureFamily, "REVIEW");
    assert.equal(full.marketResponse.perceptual.measured, true, `${full.id} has no perceptual census row`);
    assert.equal(full.marketResponsive, full.marketResponse.configMovement.responsive && full.marketResponse.perceptual.responsive);
    assert.equal(full.marketResponsive, true, `${full.id} shipped without a measurable market response`);
  }
});

// ------------------------------------------------------------------------------------------------
// The published artifacts really exist and really hash to what is published
// ------------------------------------------------------------------------------------------------

test("every published contact sheet exists and matches its digest", () => {
  let checked = 0;
  for (const d of TEMPLATE_DESCRIPTORS) {
    for (const [kind, sheet] of Object.entries(d.sheets)) {
      const file = join(PKG, "sheets", sheet.name);
      assert.ok(existsSync(file), `${d.id}: ${kind} sheet ${sheet.name} is not published`);
      const buf = readFileSync(file);
      assert.equal(buf.length, sheet.bytes, `${d.id}/${kind}: byte length`);
      assert.equal(createHash("sha256").update(buf).digest("hex"), sheet.sha256, `${d.id}/${kind}: digest`);
      checked++;
    }
  }
  assert.equal(checked, 6, "expected two sheets for each of three templates");
});

test("an unshipped template is revealed without a starting point", () => {
  for (const id of [...templatesWithStatus("EXPERIMENTAL"), ...templatesWithStatus("HELD")]) {
    const e = describeUnshippedTemplate(id);
    assert.ok(e, id);
    assert.equal(e.offeredAsAStartingPoint, false);
    assert.equal(e.config, undefined);
    assert.equal(e.brief, undefined);
    assert.equal(e.sheets, undefined);
    assert.ok(e.weakestMeasuredStatePairing, `${id} revealed with no measured weakness`);
    assert.equal(e.promotion.possible, true);
    assert.equal(e.promotion.requires.length, 4);
  }
  for (const id of templatesWithStatus("REJECTED")) {
    assert.equal(describeUnshippedTemplate(id).promotion.possible, false);
  }
  assert.equal(describeUnshippedTemplate("PIXEL_GRID_V1/idol"), null, "a SHIP template must not come back as an unshipped record");
});
