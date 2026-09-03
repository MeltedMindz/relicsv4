// SPDX-License-Identifier: MIT
// ================================================================================================
// THE AUTHOR'S OWN TESTS — every one of them pins a defect that reached a rendered frame.
//
// Nothing here is a style preference. Each assertion is a thing that was true of the bytes this
// author emitted, was measured on chain, and produced a picture nobody meant: a field painted in
// the background colour, a gradient ground on a direction that forbids one, a stroked collection
// chosen by a coin toss, a market binding on a sensor that reads zero in the state the brief cares
// about. The twelve frozen briefs and the twelve art directions written for them are the fixture,
// because a property that holds on a hand-made config and fails on a real one is not a property.
// ================================================================================================

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { admitBrief } from "../src/admission.js";
import { authorConfig, deriveIntent, resolveMechanism } from "../src/author.js";
import { COUNTER_REGISTER, SENSOR_FOR_POLARITY } from "../src/mechanism.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const BRIEFS = JSON.parse(readFileSync(join(HERE, "fixtures", "benchmark-briefs.json"), "utf8")).briefs;
const DIRECTIONS_PATH = join(ROOT, "artifacts", "art-benchmark", "directions.json");

/** Every frozen brief, authored. Skipped rather than faked if the directions are not on disk. */
function authoredCases() {
  if (!existsSync(DIRECTIONS_PATH)) return null;
  const directions = JSON.parse(readFileSync(DIRECTIONS_PATH, "utf8")).directions;
  // A BRIEF THE CATALOG REFUSES HAS NO AUTHORED CONFIGURATION, AND THAT IS THE POINT OF THE GATE.
  // B11 is one: its brief asks for slate and iron under stress against ochre and copper in
  // recovery, which is a state-driven colour and is on both runtimes' refusal lists. It is skipped
  // here rather than authored, and `an unadmitted brief reaches no author` asserts it.
  return BRIEFS.map((b) => {
    const admission = admitBrief(b.text);
    if (!admission.admitted) return { id: b.id, admitted: false, outcome: admission.outcome };
    const runtimeId = admission.recommended.split("/")[0];
    return { id: b.id, admitted: true, runtimeId, direction: directions[b.id], authored: authorConfig({ runtimeId, direction: directions[b.id] }) };
  }).filter((c) => c.admitted);
}

const CASES = authoredCases();

test("an unadmitted brief reaches no author", () => {
  const refused = BRIEFS.map((b) => ({ id: b.id, a: admitBrief(b.text) })).filter((x) => !x.a.admitted);
  assert.ok(refused.length >= 1, "no frozen brief is refused at admission, which would make the gate unexercised by this fixture");
  for (const r of refused) {
    assert.equal(r.a.recommended, undefined, `${r.id}: a refused brief must recommend nothing`);
    assert.ok((r.a.blockers ?? []).length > 0, `${r.id}: a refusal must name what was asked for that nothing here can draw`);
  }
  assert.ok(CASES.every((c) => c.admitted), "authoredCases must not author a refused brief");
});
const unitsOf = (config) => config.rules ?? config.fields;

test("no register is ever painted in the ground colour", { skip: CASES ? false : "no directions on disk" }, () => {
  // Three separate mechanisms have done this: PALETTE_SHIFT rotated a field onto the ground index,
  // DEPTH_PALETTE walked onto it, and the recursion runtime's second rule was handed it outright.
  // Every one produced a token rendering ink 0.000 that the runtime and the validator accepted.
  for (const c of CASES) {
    for (const [i, u] of unitsOf(c.authored.config).entries()) {
      assert.notEqual(u.paletteIx, c.authored.config.groundIx, `${c.id}: unit ${i} is painted in the ground colour, which draws an empty tile`);
    }
  }
});

test("PALETTE_SHIFT is never elected, because its rotation includes the ground index", { skip: CASES ? false : "no directions on disk" }, () => {
  for (const c of CASES) {
    assert.ok(!c.authored.config.flags.includes("PALETTE_SHIFT"), `${c.id}: PALETTE_SHIFT elected`);
  }
});

test("DEPTH_PALETTE is elected only when the palette outlasts the deepest generation drawn", { skip: CASES ? false : "no directions on disk" }, () => {
  for (const c of CASES) {
    if (c.runtimeId !== "GEOMETRIC_RECURSION_V1") continue;
    if (!c.authored.config.flags.includes("DEPTH_PALETTE")) continue;
    const deepest = Math.max(...c.authored.config.rules.map((r) => r.depthMax));
    assert.ok(c.authored.config.palette.length - 1 > deepest, `${c.id}: the colour walk reaches the ground within ${deepest} generations of a ${c.authored.config.palette.length}-stop palette`);
  }
});

test("the market binding on unit 0 is the mechanism's, not a default", { skip: CASES ? false : "no directions on disk" }, () => {
  for (const c of CASES) {
    const u = unitsOf(c.authored.config)[0];
    assert.equal(u.drive, c.authored.mechanism.drive, `${c.id}: drive`);
    assert.equal(u.sensor, c.authored.mechanism.sensor, `${c.id}: sensor`);
    assert.equal(u.curve, c.authored.mechanism.curve, `${c.id}: curve`);
    assert.equal(u.sensor, c.authored.mechanism.requires.sensorMustBe ?? SENSOR_FOR_POLARITY[c.authored.mechanism.polarity], `${c.id}: the sensor does not match the polarity the direction asks for`);
  }
});

test("a second sensor answers the pairing the primary leaves ambiguous, and it is the declared counter-register", { skip: CASES ? false : "no directions on disk" }, () => {
  // THE ATLAS'S RULE OF THUMB WAS "ONE ON DRAWDOWN AND ONE ON RECOVERY" AND IT IS NOT THE RULE
  // ANY MORE. Six of twelve development critics found that arrangement growing exactly where the
  // mechanism's story says the work should thin. The requirement it was a proxy for survives —
  // three states must separate — and it is met by a counter-register on a sensor that reads the
  // same at neutral and stress and rises in recovery.
  for (const c of CASES) {
    const sensors = unitsOf(c.authored.config).map((u) => u.sensor);
    assert.ok(new Set(sensors).size >= 2, `${c.id}: every binding is on ${sensors[0]}, so one market pairing has nothing answering it`);
    assert.equal(sensors[sensors.length - 1], COUNTER_REGISTER.sensor, `${c.id}: the last register is on ${sensors[sensors.length - 1]}, not the declared counter-register`);
    assert.equal(sensors[0], c.authored.mechanism.sensor, `${c.id}: the primary register is not on the mechanism's sensor`);
  }
});

test("SIZE is never driven by RECOVERY, which reads exactly zero under stress", { skip: CASES ? false : "no directions on disk" }, () => {
  // Size's floor is the bytecode constant 2, so this binding is a blank frame in the stress state.
  // Measured: eight seeds of eight empty.
  for (const c of CASES) {
    for (const [i, u] of unitsOf(c.authored.config).entries()) {
      assert.ok(!(u.drive === "SIZE" && u.sensor === "RECOVERY"), `${c.id}: unit ${i} drives SIZE from RECOVERY`);
    }
  }
});

test("no configuration declares only one member in every set", { skip: CASES ? false : "no directions on disk" }, () => {
  // The runtime has an error code for it — ERR_SEED_BLIND — and the reason is the `idol` failure:
  // a seed that cannot choose anything categorical draws the same figure every time.
  for (const c of CASES) {
    if (c.runtimeId !== "GEOMETRIC_RECURSION_V1") continue;
    const widest = Math.max(...c.authored.config.rules.flatMap((r) => [r.shapeSet.length, r.ruleSet.length, r.symSet.length]));
    assert.ok(widest > 1, `${c.id}: every set has one member`);
  }
});

test("a tie in the intent derivation resolves to the stated default, not to declaration order", () => {
  // Two directions scored LINEWORK 1 against SOLID 1, each on one occurrence of the word
  // "outline" in a clause about the edge of an enclosure, and LINEWORK won both because it is
  // declared first. Stroke is the loudest coverage control in either runtime.
  const direction = {
    medium: "Vector composition, independent registers of primitives placed about the canvas centre.",
    motifTranslation: "The enclosure becomes nested boundaries whose outline is what a viewer reads at browse size.",
    paletteIntent: "Two working values over a dark ground, each register filled rather than left open.",
    thumbnailIntent: "At 120px the nested boundaries survive as one legible object and no interior detail resolves.",
  };
  const { intent, derivation } = deriveIntent(direction);
  assert.equal(derivation.strokeMode.score, 1, "the fixture is meant to be a one-all tie");
  assert.deepEqual(derivation.strokeMode.tiedWith, ["LINEWORK:1"]);
  assert.equal(intent.strokeMode, "SOLID", "a one-all tie must fall to the stated default");
  assert.equal(derivation.strokeMode.source, "DEFAULT_ON_TIE");
});

test("a direction that forbids a graded ground does not get one", () => {
  // Both of these are verbatim from art directions this author was run against, and both turned
  // the loudest control in the runtime on.
  for (const paletteIntent of [
    "Iron and ash carry the drawing over a near-black ground; the ground is a single flat dark, unmodulated, so that weight is read against it and never against a graded wash.",
    "Umber and ochre carry the sequence over a dark base, the base visible only at the partings and held flat rather than graded.",
  ]) {
    const direction = {
      medium: "Vector composition, independent fields of primitives about the canvas centre.",
      motifTranslation: "A stacked sequence of horizontal bands read as a section rather than as a landscape.",
      paletteIntent,
      thumbnailIntent: "At 120px the banding survives as a striped sequence and the individual edges do not resolve.",
      composition: "The banding reaches the edges of the frame on all four sides and is never an island in dead space.",
      negativeSpace: "The dark shows between one bed and the next and is the interval of the sequence rather than a margin.",
      density: "Dense, with the beds crowding the frame and little rest between them at browse size.",
      focalHierarchy: "No single band dominates; the order is read from the relative thickness of the sequence.",
      rhythm: "Regular horizontal repetition at varying pitch so the eye reads a sequence and not a texture.",
      variationStrategy: "Tokens differ first in how many beds they carry and then in the spacing between them.",
      marketTransformation: "Under drawdown the beds thin and fewer of them survive; in recovery more beds return to the sequence.",
      identityAnchors: "The horizontal banding, the dark base and the earth palette hold across every seed and state.",
    };
    const authored = authorConfig({ runtimeId: "VECTOR_COMPOSITION_V1", direction });
    assert.equal(authored.config.groundMode, "FLAT", `a graded ground was elected on: ${paletteIntent.slice(0, 60)}...`);
  }
});

test("the author refuses a mechanism the elected runtime cannot perform rather than substituting one", () => {
  const direction = {
    medium: "Geometric recursion, one centred self-similar figure repeating a production on itself.",
    motifTranslation: "The monument becomes one nested mass built from a few large members at descending scale.",
    composition: "One mass reaching well toward the edges of the frame with little clear space around it.",
    focalHierarchy: "One overwhelming dominant mass with its inner generations reading as part of the same silhouette.",
    density: "Dense in the mass and empty outside it, the form solid where it exists at browse size.",
    negativeSpace: "The little space that remains reads as pressure around the mass rather than as a comfortable margin.",
    paletteIntent: "Charcoal and iron with a single ochre seam over near black, low contrast so the mass reads as weight.",
    rhythm: "Regular but coarse repetition, a few large steps rather than many small ones, so the rhythm is slow.",
    variationStrategy: "Tokens differ first in the silhouette of the mass and then in where the ochre seam falls.",
    marketTransformation: "Under drawdown the mass fractures and its members separate and the silhouette breaks apart.",
    identityAnchors: "It stays the same object in all three states: the centred heavy mass and the charcoal pairing.",
    thumbnailIntent: "At 120px one heavy silhouette survives and reads as a single immovable object at browse size.",
  };
  assert.throws(
    () => resolveMechanism({ runtimeId: "GEOMETRIC_RECURSION_V1", direction }),
    /MECHANISM_NOT_AVAILABLE.*FRACTURE/s,
    "the recursion runtime cannot fracture, and the author must say so rather than build something else",
  );
});

test("authoring is deterministic", { skip: CASES ? false : "no directions on disk" }, () => {
  for (const c of CASES) {
    const again = authorConfig({ runtimeId: c.runtimeId, direction: c.direction });
    assert.deepEqual(again.config, c.authored.config, `${c.id}: two runs produced different bytes, so a critique cannot be compared across rounds`);
  }
});

test("every parameter the author sets was written by the stage that owns it", { skip: CASES ? false : "no directions on disk" }, () => {
  // `makeWriter` throws on a violation, so reaching here at all is most of the proof. This asserts
  // the writes were RECORDED, which is what the acceptance receipt reads.
  for (const c of CASES) {
    assert.ok(c.authored.writes.length > 15, `${c.id}: only ${c.authored.writes.length} recorded writes`);
    for (const w of c.authored.writes) assert.ok(typeof w.stage === "string" && typeof w.path === "string");
  }
});
