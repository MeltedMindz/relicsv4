// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MECHANISM VOCABULARY'S OWN TESTS.
//
// THE TWELVE BRIEFS ARE INPUTS AND ARE NEVER EDITED. They were frozen before the harness existed
// and this file reads them from the frozen fixture. What IS asserted here is the DERIVATION: the
// mechanism and the polarity a person reading each brief would name, written down once so a
// regression in the parser is a failing test rather than twelve collections rendering their market
// response backwards again.
//
// WHY THE POLARITY ASSERTIONS MATTER MOST. Seven of twelve round-one blind reviews reported the
// state response inverted — stress was the densest, largest, warmest state on work whose brief
// asked for the opposite. Two separate defects produced that, and both are pinned below: a sensor
// whose polarity was wrong, and a clause parser that gave a verb the state word nearest it by raw
// character distance rather than the one in its own segment.
// ================================================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MECHANISMS,
  MECHANISM_IDS,
  MECHANISM_TABLE,
  assertMechanismEvidenceExists,
  assertSensorReadingsAgreeWithBinding,
  expressibleMechanisms,
  mechanismAdmission,
  mechanismsRequestedBy,
  realisationFor,
} from "../src/mechanism.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIEFS = JSON.parse(readFileSync(join(HERE, "fixtures", "benchmark-briefs.json"), "utf8")).briefs;
const briefText = (id) => BRIEFS.find((b) => b.id === id).text;

/**
 * What a person reading each frozen brief would name, primary mechanism first.
 *
 * Only the mechanisms the brief states OUTRIGHT are listed. B09's secondary SEPARATION and
 * DILATION readings are real and unpolarised and are deliberately not asserted — a test that
 * pinned every incidental match would fail on any widening of the vocabulary rather than on a
 * regression in it.
 */
const EXPECTED = Object.freeze({
  B01: [["SUBTRACTION", "PEAKS_AT_RECOVERY"], ["SEPARATION", "PEAKS_AT_STRESS"]],
  B02: [["DILATION", "PEAKS_AT_RECOVERY"], ["SUBTRACTION", "PEAKS_AT_RECOVERY"]],
  B03: [["SUBTRACTION", "PEAKS_AT_RECOVERY"]],
  B04: [["SUBTRACTION", "PEAKS_AT_STRESS"]],
  B05: [["DILATION", "PEAKS_AT_RECOVERY"]],
  B06: [["SEPARATION", "PEAKS_AT_STRESS"], ["SUBTRACTION", "PEAKS_AT_RECOVERY"]],
  B07: [["DILATION", "PEAKS_AT_RECOVERY"], ["SUBTRACTION", "PEAKS_AT_RECOVERY"]],
  B08: [["SEPARATION", "PEAKS_AT_STRESS"]],
  B09: [["FRACTURE", "PEAKS_AT_STRESS"]],
  B10: [["DILATION", "PEAKS_AT_RECOVERY"], ["SEPARATION", "PEAKS_AT_RECOVERY"]],
  B11: [["FRACTURE", "PEAKS_AT_STRESS"]],
  B12: [["SEPARATION", null]],
});

test("every frozen brief resolves to the mechanism and polarity a reader would name", () => {
  for (const [id, expected] of Object.entries(EXPECTED)) {
    const got = mechanismsRequestedBy(briefText(id)).mechanisms;
    for (const [mechanism, polarity] of expected) {
      const row = got.find((g) => g.mechanism === mechanism);
      assert.ok(row, `${id}: ${mechanism} was not detected at all; got ${got.map((g) => g.mechanism).join(", ") || "nothing"}`);
      assert.equal(row.polarity, polarity, `${id}: ${mechanism} resolved ${row.polarity}, expected ${polarity}. Evidence: ${JSON.stringify(row.evidence)}`);
    }
    assert.equal(got[0].mechanism, expected[0][0], `${id}: the PRIMARY mechanism is ${got[0].mechanism}, expected ${expected[0][0]}`);
  }
});

test("a verb takes the state word in its own segment, not the nearest by character distance", () => {
  // B05's exact sentence. Both verbs sit in one clause and name opposite states; a nearest-by-
  // distance rule gives "expands" the drawdown fifteen characters behind it.
  const r = mechanismsRequestedBy("it contracts under drawdown and expands again in recovery");
  const d = r.mechanisms.find((m) => m.mechanism === "DILATION");
  assert.equal(d.polarity, "PEAKS_AT_RECOVERY");
});

test("a state word carries forward into a following segment that has none", () => {
  // B07's exact sentence. "multiplies its members" has no state of its own and belongs to the
  // recovery that opens the clause, not to the stress that follows it.
  const r = mechanismsRequestedBy("recovery pushes the colony outward and multiplies its members, stress pulls it back toward the centre and reduces it.");
  assert.equal(r.mechanisms.find((m) => m.mechanism === "SUBTRACTION").polarity, "PEAKS_AT_RECOVERY");
  assert.equal(r.mechanisms.find((m) => m.mechanism === "DILATION").polarity, "PEAKS_AT_RECOVERY");
});

test("a negated mechanism is rejected rather than counted", () => {
  const r = mechanismsRequestedBy("Under drawdown the mass must not fracture; it consolidates instead.");
  const frac = r.mechanisms.find((m) => m.mechanism === "FRACTURE");
  assert.ok(r.rejected.some((x) => x.mechanism === "FRACTURE"), "the negated fracture was not rejected");
  // The clause's second half genuinely asks for consolidation, so FRACTURE may still be present —
  // with its magnitude peaking AWAY from stress, which is the opposite instruction.
  if (frac) assert.notEqual(frac.polarity, "PEAKS_AT_STRESS");
});

test("an atmosphere word is not a mechanism", () => {
  // "slightly severe" once matched the FRACTURE vocabulary through `sever\\w+`, on B01 — a brief
  // about a colonnade with no fracture content anywhere in it.
  const r = mechanismsRequestedBy("The work should feel engineered rather than drawn — regular, load-bearing, and slightly severe.");
  assert.equal(r.mechanisms.find((m) => m.mechanism === "FRACTURE"), undefined);
});

test("a brief that names no mechanism is not refused", () => {
  const a = mechanismAdmission("A quiet study in tone and interval, made of squares, with nothing else to say about it.");
  assert.equal(a.outcome, "NO_MECHANISM_NAMED");
  assert.equal(a.viable.length, 2);
});

test("the recursion runtime expresses exactly one mechanism and says why for the other six", () => {
  assert.deepEqual(expressibleMechanisms("GEOMETRIC_RECURSION_V1"), ["DILATION"]);
  for (const id of MECHANISM_IDS) {
    const entry = MECHANISM_TABLE.GEOMETRIC_RECURSION_V1[id];
    assert.ok(entry, `GEOMETRIC_RECURSION_V1 has no finding for ${id}; an undocumented mechanism is a silent gap`);
    if (!entry.expressible) {
      assert.ok(entry.why && entry.why.length > 60, `${id}: the refusal has no reasoning`);
      assert.ok(entry.evidence, `${id}: the refusal cites no evidence`);
    }
  }
});

test("the vector runtime carries the mechanisms the recursion runtime refuses", () => {
  for (const id of ["SUBTRACTION", "SEPARATION", "FRACTURE", "OCCLUSION", "THICKENING"]) {
    assert.equal(MECHANISM_TABLE.GEOMETRIC_RECURSION_V1[id].expressible, false, `${id} should be refused by the recursion runtime`);
    assert.equal(MECHANISM_TABLE.VECTOR_COMPOSITION_V1[id].expressible, true, `${id} should be carried by the vector runtime`);
  }
});

test("neither runtime can displace, and that is recorded rather than omitted", () => {
  for (const rt of Object.keys(MECHANISM_TABLE)) {
    assert.equal(MECHANISM_TABLE[rt].DISPLACEMENT.expressible, false);
  }
  const r = realisationFor("VECTOR_COMPOSITION_V1", "DISPLACEMENT", "PEAKS_AT_STRESS");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "NOT_EXPRESSIBLE");
});

test("a fracture brief is routed away from the runtime that cannot fracture", () => {
  const a = mechanismAdmission(briefText("B09"));
  assert.equal(a.outcome, "ADMITTED");
  assert.deepEqual(a.viable, ["VECTOR_COMPOSITION_V1"]);
  const gr = a.perRuntime.find((r) => r.runtimeId === "GEOMETRIC_RECURSION_V1");
  assert.equal(gr.carriesPrimary, false);
  assert.match(gr.cannotExpress[0].detail, /no members in them to separate|one connected mass/);
});

test("SIZE may never be driven by a sensor that reads zero under stress", () => {
  // The measured blank-frame trap: eight seeds of eight empty at stress.
  const peaksAtRecovery = realisationFor("VECTOR_COMPOSITION_V1", "DILATION", "PEAKS_AT_RECOVERY");
  assert.equal(peaksAtRecovery.ok, true);
  assert.notEqual(peaksAtRecovery.drive, "SIZE");
  const peaksAtStress = realisationFor("VECTOR_COMPOSITION_V1", "DILATION", "PEAKS_AT_STRESS");
  assert.equal(peaksAtStress.drive, "SIZE");
  assert.equal(peaksAtStress.sensor, "DRAWDOWN");
});

test("thickening demands a stroked field, because on a filled one it measured exactly zero", () => {
  const r = realisationFor("VECTOR_COMPOSITION_V1", "THICKENING", "PEAKS_AT_STRESS");
  assert.equal(r.requires.strokedField, true);
  assert.equal(r.curve, "LOG2");
  assert.equal(MECHANISM_TABLE.VECTOR_COMPOSITION_V1.THICKENING.realisations[0].evidence.filledControl.allPairings, 0.0);
});

test("the transcribed sensor readings still agree with binding.js", async () => {
  assert.deepEqual(await assertSensorReadingsAgreeWithBinding(), { ok: true, checked: 12 });
});

test("every claim in the table still cites a probe row that exists", async () => {
  await assertMechanismEvidenceExists();
});

test("every mechanism declares the magnitude the market moves", () => {
  for (const id of MECHANISM_IDS) {
    assert.equal(MECHANISMS[id].id, id);
    assert.ok(MECHANISMS[id].magnitude.length > 10, `${id}: no magnitude declared, so polarity is unanswerable`);
    assert.ok(MECHANISMS[id].measuredBy.length > 10, `${id}: nothing says how it would be measured`);
  }
});
