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
  // B02 and B07 both READ as growth briefs and their primary market instruction is nonetheless
  // SUBTRACTION: "multiply its divisions" / "retracts toward a bare armature", and "multiplies its
  // members" / "reduces it". The word `growth` in both is a motif noun and is deliberately not in
  // the DILATION vocabulary — on the strength of it DILATION was primary for both, and the
  // recursion runtime, which cannot multiply members visibly, was the recommended runtime.
  B02: [["SUBTRACTION", "PEAKS_AT_RECOVERY"]],
  B03: [["SUBTRACTION", "PEAKS_AT_RECOVERY"]],
  B04: [["SUBTRACTION", "PEAKS_AT_STRESS"]],
  B05: [["DILATION", "PEAKS_AT_RECOVERY"]],
  B06: [["SEPARATION", "PEAKS_AT_STRESS"], ["SUBTRACTION", "PEAKS_AT_RECOVERY"]],
  B07: [["SUBTRACTION", "PEAKS_AT_RECOVERY"], ["DILATION", "PEAKS_AT_RECOVERY"], ["SEPARATION", "PEAKS_AT_RECOVERY"]],
  B08: [["SEPARATION", "PEAKS_AT_STRESS"]],
  B09: [["FRACTURE", "PEAKS_AT_STRESS"]],
  B10: [["DILATION", "PEAKS_AT_RECOVERY"], ["SEPARATION", "PEAKS_AT_RECOVERY"]],
  B11: [["FRACTURE", "PEAKS_AT_STRESS"]],
  // B12 names a mechanism and never names a market state beside it — "a slight tightening or
  // loosening of the enclosure" — so it is recorded UNSTATED and carries no polarity. That is the
  // honest reading of a brief that says the market "may register, but only faintly".
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

test("a mechanism named with no market state beside it is recorded UNSTATED, not requested", () => {
  const r = mechanismsRequestedBy("The market may register, but only faintly — a slight tightening or loosening of the enclosure.");
  const sep = r.mechanisms.find((m) => m.mechanism === "SEPARATION");
  assert.ok(sep, "SEPARATION should still be visible");
  assert.equal(sep.unstated, true);
  assert.equal(sep.statedVotes, 0);
  const a = mechanismAdmission("The market may register, but only faintly — a slight tightening or loosening of the enclosure, nothing a casual viewer would notice at thumbnail size.");
  assert.equal(a.outcome, "NO_MECHANISM_NAMED");
  assert.equal(a.viable.length, 2, "an unstated mechanism must not gate viability");
});

test("a motif noun is not a market instruction", () => {
  // "An organic growth", "the logic of growth", "how far the growth has gone" — three motif
  // sentences that made DILATION the primary mechanism of two briefs whose market ask is to
  // multiply members.
  const r = mechanismsRequestedBy("An organic growth: a colony of cells radiating from a shared centre.");
  assert.equal(r.mechanisms.find((m) => m.mechanism === "DILATION"), undefined);
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

test("a colour axis stated as two poles is a state-driven colour, and B11 states it that way", async () => {
  // Round two's twelfth refusal. Both runtimes' capability statements refuse state-driven colour
  // by name, and the detector required a verb — shift, change, turn, darken. B11's brief carries
  // no verb: the temperature is an adjective attached to a state and the hues are named as
  // endpoints. It was admitted, authored, rendered and refused, and its blind reviewer refused it
  // on exactly that axis: "under drawdown this collection glows copper; in recovery it goes to
  // iron." The brief was unsatisfiable by either Wave-1 runtime before the first render.
  const { detectImpossibleDemands } = await import("../src/capabilities.js");
  const { admitBrief } = await import("../src/admission.js");
  const b = BRIEFS.find((x) => x.id === "B11");
  assert.ok(detectImpossibleDemands(b.text).some((d) => d.id === "STATE_DRIVEN_COLOUR"), "B11's colour axis is not detected");
  assert.equal(admitBrief(b.text).outcome, "BRIEF_NOT_REPRESENTABLE_BY_CURRENT_WAVE1_CATALOG");
});

test("a palette named without a market state is not a state-driven colour", async () => {
  // The must-allow half, and it is the half that matters: this file's own header says a false
  // refusal is invisible because a refused brief produces no renders and no verdict. Every one of
  // these is a real sentence from one of the twelve frozen briefs.
  const { detectImpossibleDemands } = await import("../src/capabilities.js");
  for (const text of [
    "Restrained palette: iron and ash over a near-black ground, with one warm accent marking the innermost bay.",
    "Warm and dark: rust, copper and umber piled over a near-black ground, with values close enough that the density reads as mass rather than as pattern.",
    "A quiet, spare palette: two values and a ground, no more. Nothing decorative, nothing incidental.",
    "Brass and slate over a dark ground, with the drawing carried in fine line so the whole reads as engineering rather than as mass.",
    "Pale and cool: bone and pale slate over a dark ground, the contrast kept low so the lines read as thread rather than as structure.",
  ]) {
    assert.ok(!detectImpossibleDemands(text).some((d) => d.id === "STATE_DRIVEN_COLOUR"), `falsely refused: ${text.slice(0, 60)}`);
  }
});
