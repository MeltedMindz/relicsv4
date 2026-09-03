// SPDX-License-Identifier: MIT
// ================================================================================================
// THE REVIEW LOOP'S OWN TESTS — offline. Nothing here touches a chain.
//
// Every test is written against a property that has failed somewhere in this program, or against
// one the gate asserts statically and cannot prove BEHAVES. A static rule can show that a
// comparison exists in the source; only a run can show that it decides anything.
// ================================================================================================
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RUNTIMES, decodeConfig, encodeConfig, presetConfig, runtimeFor } from "../src/runtimes.js";
import { decodeGrv1, encodeGrv1 } from "../src/codec/grv1.js";
import { decodeVcv1, encodeVcv1 } from "../src/codec/vcv1.js";
import { describeValidatorCode } from "../src/codec/errors.js";
import { MARKET_STATES, REVIEW_SEEDS, collectionSeeds, marketState } from "../src/market.js";
import { GATE_AXIS, RUBRIC_AXIS_IDS, VERDICTS, rubricMarkdown } from "../src/rubric.js";
import { PACKET_ALLOWED_KEYS, PACKET_SCAN_POLICY, scanForLeaks, validateVerdict, verdictTemplate, reviewerPrompt } from "../src/packet.js";
import { configHashOf, verifyAcceptance } from "../src/receipt.js";
import { ITERATION_CEILING, MAX_ITERATION_CEILING, MIN_ITERATION_CEILING, readArtDocument } from "../src/loop.js";
import { OBJECTIVE_CHECK_IDS, FLOORS } from "../src/objective.js";
import { decodeImageDataUri } from "../src/render.js";

const scratch = () => mkdtempSync(join(tmpdir(), "relics-art-review-test-"));

// ---- the codecs ---------------------------------------------------------------------------------

test("both runtime presets round-trip byte-identically through the codec", () => {
  for (const id of Object.keys(RUNTIMES)) {
    const decoded = decodeConfig(id, RUNTIMES[id].presetBytes);
    assert.equal(encodeConfig(id, decoded), RUNTIMES[id].presetBytes,
      `${id}: the codec does not reproduce the deployed template's own bytes. Everything downstream is about a configuration the chain has never seen.`);
  }
});

test("a misspelled sensor is refused by name and never coerced to index zero", () => {
  const cfg = presetConfig("GEOMETRIC_RECURSION_V1");
  cfg.rules[0].sensor = "RECOVERY_";
  assert.throws(() => encodeGrv1(cfg), /RECOVERY_/,
    "a misspelled sensor silently becoming VOLUME_TIER is how a legal configuration nobody meant gets authored");
});

test("a declared set may not be empty — the seed has to draw from something", () => {
  const cfg = presetConfig("GEOMETRIC_RECURSION_V1");
  cfg.rules[0].shapeSet = [];
  assert.throws(() => encodeGrv1(cfg), /may not be empty/);
});

test("the opaque appendix survives a round trip and changes the bytes", () => {
  const cfg = presetConfig("VECTOR_COMPOSITION_V1");
  const plain = encodeVcv1(cfg);
  const withAppendix = encodeVcv1({ ...cfg, appendix: "cafe" });
  assert.notEqual(plain.toString("hex"), withAppendix.toString("hex"));
  assert.equal(decodeVcv1(withAppendix).appendix, "cafe");
});

test("a validator code is named, and an unknown one says so rather than guessing", () => {
  assert.equal(describeValidatorCode("GEOMETRIC_RECURSION_V1", 48).name, "ERR_SEED_BLIND");
  assert.match(describeValidatorCode("GEOMETRIC_RECURSION_V1", 48).detail, /second member/);
  assert.equal(describeValidatorCode("VECTOR_COMPOSITION_V1", 43).name, "ERR_TOTAL_SITES");
  assert.equal(describeValidatorCode("GEOMETRIC_RECURSION_V1", 251).name, "UNKNOWN");
});

// ---- the market fixtures ------------------------------------------------------------------------

test("the review ring and the collection sweep are different populations", () => {
  const overlap = collectionSeeds(100).filter((s) => REVIEW_SEEDS.includes(s));
  assert.equal(REVIEW_SEEDS.length, 12);
  assert.ok(collectionSeeds(100).length >= 100);
  assert.ok(overlap.length <= 1,
    "twelve seeds is what a person can look at; it says nothing about a collection, and reusing them for the sweep would make the sweep decorative");
});

test("the three market states differ in the fields a sensor reads", () => {
  const [n, s, r] = MARKET_STATES.map(marketState);
  assert.notEqual(n.drawdownTicks, s.drawdownTicks);
  assert.notEqual(s.recoveryTicks, r.recoveryTicks);
  assert.equal(n.schemaVersion, 0, "the published sheets were drawn with schemaVersion left at zero; changing it renders a different request than the goldens");
});

// ---- the image path -----------------------------------------------------------------------------

test("a base64 data URI is decoded before anything measures it", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  assert.equal(decodeImageDataUri(uri), svg);
});

test("base64 text that is not a document is refused rather than measured", () => {
  const uri = `data:image/svg+xml;base64,${Buffer.from("not a document").toString("base64")}`;
  assert.throws(() => decodeImageDataUri(uri), /base64-text trap/,
    "a prior measurement in this program returned all zeros because it ran over the encoding rather than over the document");
});

// ---- the rubric and the gate --------------------------------------------------------------------

test("brief fidelity is a gate: FAIL forbids SHIP", () => {
  const axes = Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "PASS"]));
  axes[GATE_AXIS] = "FAIL";
  const problems = validateVerdict({ schemaVersion: 1, round: 1, verdict: "SHIP", reviewerId: "t", axes, critique: [] }, { round: 1 });
  assert.ok(problems.some((p) => p.includes(GATE_AXIS) && p.includes("gate")));
});

test("technical legality is not expressible as an override of brief fidelity", () => {
  // The verdict schema has no field a reviewer could use to say "it failed the brief but it is
  // legal so ship it". The absence is the mechanism; assert it rather than trusting it.
  const t = verdictTemplate(1);
  for (const k of ["legal", "technicallyValid", "override", "waiver", "exception", "shipAnyway"]) {
    assert.equal(k in t, false, `the verdict template carries ${k}, which is a way to overrule the gate`);
  }
});

test("a REVISE with no critique is a refusal nobody can act on", () => {
  const axes = Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "PASS"]));
  const problems = validateVerdict({ schemaVersion: 1, round: 1, verdict: "REVISE", reviewerId: "t", axes, critique: [] }, { round: 1 });
  assert.ok(problems.some((p) => p.includes("cannot act on")));
});

test("a verdict from another round is not a verdict on these pictures", () => {
  const axes = Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "PASS"]));
  const problems = validateVerdict({ schemaVersion: 1, round: 1, verdict: "SHIP", reviewerId: "t", axes, critique: [] }, { round: 3 });
  assert.ok(problems.some((p) => p.includes("another round")));
});

test("the rubric a reviewer reads names every axis and marks the gate", () => {
  const md = rubricMarkdown();
  for (const id of RUBRIC_AXIS_IDS) {
    const axis = id.replace(/([A-Z])/g, " $1").trim().toLowerCase();
    assert.ok(md.toLowerCase().includes(axis.split(" ")[0]), `the rubric never mentions ${id}`);
  }
  assert.match(md, /THIS ONE IS A GATE/);
});

// ---- the separation ------------------------------------------------------------------------------

test("the packet whitelist admits no author opinion and no parameter", () => {
  for (const k of ["authorNotes", "intent", "changeLog", "config", "artConfig", "objective", "traits", "measurements"]) {
    assert.equal(PACKET_ALLOWED_KEYS.includes(k), false, `${k} is admitted into the review packet`);
  }
});

test("the reviewer's own prior words are not scanned as author claims, but a score in them is", () => {
  const reviewerSentence = "The stress row is the cleanest, most resolved state in the packet.";
  assert.equal(scanForLeaks(reviewerSentence, { scanClass: "OBJECTIVE_ONLY" }).length, 0);
  assert.ok(scanForLeaks(reviewerSentence, { scanClass: "FULL" }).length > 0,
    "the same sentence written by the AUTHOR into the request is an anchor and must be caught there");
  assert.ok(scanForLeaks("SEED_DIVERSITY measured 22.8", { scanClass: "OBJECTIVE_ONLY" }).length > 0,
    "a forged critique must not be able to smuggle a score past the reviewer's own exemption");
});

test("every objective check id is something the packet scanner knows to keep out", () => {
  for (const id of OBJECTIVE_CHECK_IDS) {
    assert.ok(scanForLeaks(`${id} came back fine`, { scanClass: "FULL" }).length > 0, `${id} can reach a review packet`);
  }
});

test("the scan policy relaxes only files this package writes itself", () => {
  for (const f of Object.keys(PACKET_SCAN_POLICY)) {
    assert.ok(/^(?:brief\.md|RUBRIC\.md|reviewer-prompt\.md|prior-critique\.json|objective-disclosure\.json)$/.test(f),
      `${f} has a relaxed scan class and is not one of the files this package composes`);
  }
  assert.equal(PACKET_SCAN_POLICY["REVIEW_REQUEST.json"], undefined,
    "the request is the one file the builder composes freely; relaxing it retires the scan while leaving it looking present");
});

test("the generated reviewer prompt carries no author claim and no score", () => {
  const prompt = reviewerPrompt({ round: 2, roundsRemaining: 2, priorCritique: [], objectiveDisclosed: false });
  assert.equal(scanForLeaks(prompt, { scanClass: "OBJECTIVE_ONLY" }).length, 0);
  assert.match(prompt, /You did not make it/);
  assert.match(prompt, /not been told what the author thinks/);
});

// ---- the acceptance receipt ------------------------------------------------------------------------

test("an acceptance is void when one per cent of one field moves", () => {
  const ws = scratch();
  try {
    const runtimeId = "GEOMETRIC_RECURSION_V1";
    const cfg = presetConfig(runtimeId);
    const bytes = encodeConfig(runtimeId, cfg);
    const brief = "# Brief\n\nA control.\n";
    mkdirSync(join(ws, ".relics-agent", "receipts"), { recursive: true });
    // THE VERDICT IS BOUND TO THE REVIEWER'S OWN DOCUMENT, so a fixture has to write one. A
    // receipt carrying only the word SHIP attested to its own verdict and is now refused outright.
    const packetDir = join(ws, ".relics-agent", "art-review", "round-1", "packet");
    mkdirSync(packetDir, { recursive: true });
    const verdictBytes = Buffer.from(`${JSON.stringify({ reviewerId: "t", verdict: "SHIP", axes: {} }, null, 2)}\n`);
    writeFileSync(join(packetDir, "verdict.json"), verdictBytes);
    const verdictDocument = {
      path: join(".relics-agent", "art-review", "round-1", "packet", "verdict.json"),
      sha256: createHash("sha256").update(verdictBytes).digest("hex"),
      verdictField: "verdict",
    };
    writeFileSync(join(ws, ".relics-agent", "receipts", "art-review.json"), JSON.stringify({
      schemaVersion: 1, accepted: true, verdict: "SHIP", runtimeId, verdictDocument,
      briefSha256: createHash("sha256").update(brief).digest("hex"),
      acceptedConfigHash: configHashOf(bytes), reviewerId: "t", rounds: [{ round: 1 }],
    }));
    assert.equal(verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId }).accepted, true);
    const moved = JSON.parse(JSON.stringify(cfg));
    moved.rules[0].contraction -= 1;
    const after = verifyAcceptance(ws, { configBytes: encodeConfig(runtimeId, moved), briefText: brief, runtimeId });
    assert.equal(after.accepted, false);
    assert.equal(after.reasonCode, "ART_ACCEPTANCE_INVALIDATED");
    assert.ok(after.invalidatedBy.some((i) => i.facet === "ART_CONFIG"));

    // MUTATION: THE VERDICT MAY NOT ATTEST TO ITSELF.
    //
    // `art-review.json` carried a bare `verdict: "SHIP"` and every other field the verification
    // consults lived in the same file, so the word was the whole claim. Three edits, three
    // distinct refusals: flip the receipt, flip the reviewer's document, remove the binding.
    const receiptPath = join(ws, ".relics-agent", "receipts", "art-review.json");
    const asWritten = JSON.parse(readFileSync(receiptPath, "utf8"));

    writeFileSync(receiptPath, JSON.stringify({ ...asWritten, verdict: "REVISE" }));
    assert.equal(
      verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId }).reasonCode,
      "ART_ACCEPTANCE_VERDICT_SELF_ATTESTED",
      "the receipt disagreeing with the reviewer's document must be refused as a forged verdict, not as a REVISE",
    );

    writeFileSync(receiptPath, JSON.stringify(asWritten));
    writeFileSync(join(packetDir, "verdict.json"), Buffer.from(`${JSON.stringify({ reviewerId: "t", verdict: "SHIP", axes: {}, edited: true }, null, 2)}\n`));
    assert.equal(
      verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId }).reasonCode,
      "ART_ACCEPTANCE_VERDICT_DOCUMENT_ALTERED",
    );

    writeFileSync(join(packetDir, "verdict.json"), verdictBytes);
    writeFileSync(receiptPath, JSON.stringify({ ...asWritten, verdictDocument: null }));
    assert.equal(
      verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId }).reasonCode,
      "ART_ACCEPTANCE_VERDICT_UNBOUND",
      "dropping the binding must refuse, or dropping it is how a forger passes",
    );

    writeFileSync(receiptPath, JSON.stringify(asWritten));
    rmSync(join(packetDir, "verdict.json"));
    assert.equal(
      verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId }).reasonCode,
      "ART_ACCEPTANCE_VERDICT_DOCUMENT_MISSING",
    );
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("no acceptance at all is a different answer from an invalidated one", () => {
  const ws = scratch();
  try {
    const r = verifyAcceptance(ws, { configBytes: "0x00", briefText: "x", runtimeId: "GEOMETRIC_RECURSION_V1" });
    assert.equal(r.accepted, false);
    assert.equal(r.reasonCode, "NO_ART_ACCEPTANCE",
      "an agent told ART_ACCEPTANCE_INVALIDATED when nothing was ever reviewed goes looking for a change that never happened");
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

// ---- the loop ---------------------------------------------------------------------------------------

test("the iteration ceiling is inside its own bounds and cannot be raised at run time", () => {
  assert.ok(Number.isInteger(ITERATION_CEILING));
  assert.ok(ITERATION_CEILING >= MIN_ITERATION_CEILING && ITERATION_CEILING <= MAX_ITERATION_CEILING);
  assert.equal(MAX_ITERATION_CEILING, 5);
});

test("an art document that does not encode says which field, not that rendering failed", () => {
  const ws = scratch();
  try {
    const cfg = presetConfig("VECTOR_COMPOSITION_V1");
    cfg.fields[0].sizeMax = 200;
    writeFileSync(join(ws, "art.json"), JSON.stringify({ schemaVersion: 1, runtimeId: "VECTOR_COMPOSITION_V1", config: cfg }));
    const r = readArtDocument(ws);
    assert.equal(r.ok, false);
    assert.match(r.detail, /sizeMax/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("an absent art document is not an empty one", () => {
  const ws = scratch();
  try {
    const r = readArtDocument(ws);
    assert.equal(r.ok, false);
    assert.match(r.detail, /no art\.json/);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test("a floor of zero is not a floor anywhere in the objective battery", () => {
  for (const [k, v] of Object.entries(FLOORS)) {
    assert.ok(typeof v === "number" && v > 0, `FLOORS.${k} is ${v}; a floor of nothing is not a floor`);
  }
});

test("the verdict vocabulary is closed", () => {
  assert.deepEqual([...VERDICTS], ["SHIP", "REVISE", "REJECT"]);
  const axes = Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "PASS"]));
  const problems = validateVerdict({ schemaVersion: 1, round: 1, verdict: "SHIP_WITH_CAVEAT", reviewerId: "t", axes, critique: [] }, { round: 1 });
  assert.ok(problems.some((p) => p.includes("verdict must be one of")));
});
