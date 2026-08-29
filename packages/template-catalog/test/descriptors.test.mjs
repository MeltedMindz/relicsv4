// SPDX-License-Identifier: MIT
// The published descriptors: complete, measured, and carrying neither a chain fact nor a score.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DESCRIPTOR_SCHEMA_VERSION,
  RUNTIMES,
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
  assert.equal(TEMPLATE_DESCRIPTORS.length, 7);
  assert.deepEqual(TEMPLATE_DESCRIPTORS.map((d) => d.id).sort(), [...templatesWithStatus("SHIP")].sort());
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
    assert.match(full.config.keccak256, /^0x[0-9a-f]{64}$/);
    assert.ok(["SHIP", "EXPERIMENTAL", "HELD", "REJECTED"].includes(full.review.status));
  }
});

test("the config schema versions are the ones the runtimes actually require — 2, 1, 1, 2", () => {
  assert.equal(RUNTIMES.GEOMETRIC_RECURSION_V1.configSchemaVersion, 2);
  assert.equal(RUNTIMES.CELLULAR_SYSTEM_V1.configSchemaVersion, 2);
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

test("crux binds one sensor and is still responsive — because of the curve, measured", () => {
  const crux = describeTemplate("CELLULAR_SYSTEM_V1/crux");
  assert.equal(crux.signals.bound.length, 1);
  assert.equal(crux.signals.bound[0].sensor, "RECOVERY");
  assert.equal(crux.signals.bound[0].curve, "LOG2");
  assert.equal(crux.marketResponsive, true);
  for (const pair of ["ns", "nr", "sr"]) assert.equal(crux.marketResponse.configMovement.pairs[pair].separated, true);
  // Under LINEAR the same single binding would NOT separate neutral from stress.
  assert.ok(movement("RECOVERY", "LINEAR").ns < EFFECTIVE_SIGNAL_FLOOR_PER_MILLE);
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
  assert.equal(checked, 14, "expected two sheets for each of seven templates");
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
