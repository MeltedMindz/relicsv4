#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE VISUAL REVIEW GATE.
//
//   npm run kit:artreview            # the gate
//   npm run kit:artreview:controls   # its own negative controls, run FIRST in CI
//
// WHY IT EXISTS. The autonomous agent used to produce a configuration that was legal,
// deterministic, inside its render budget and byte-distinct across every market state — and
// proceed. Every one of those is also true of a configuration that draws the wrong thing, and one
// did: a variant that read as industrial crates and scaffolding full of confetti against a brief
// asking for botanical work, through every gate this repository had, because nothing looked.
//
// The pattern is older than that one variant. Four separate times in this program a number was
// computed correctly and the conclusion drawn from it was wrong — an occupancy bitmap that ranked
// seed diversity backwards, a template mean of 4.85 that hid two structurally dead fields,
// byte-distinct renders that were visually identical, and a pixelwise delta-E that ranked a
// rejected template above three shipped ones. Each time a person looking at a contact sheet was
// right in seconds. So this gate is not about adding a check; it is about proving that something
// LOOKS, that what it looks at are IMAGES, and that whoever looks is not whoever drew.
//
// WHAT IT ASSERTS, and every one of these is DERIVED rather than transcribed:
//
//   1. the review renders and rasterises IMAGES, and no path substitutes markup or numbers
//   2. brief fidelity is a GATE that technical legality cannot overrule
//   3. the author cannot approve its own work: whitelist, leak scan, disclosure ordering
//   4. an acceptance is void the instant the configuration moves — PROVED BY MUTATION
//   5. no launch-proving command can run without an acceptance, and the command list comes from
//      the run pipeline itself so a step added later is caught rather than omitted
//   6. there is no skip flag, under any spelling
//   7. the loop produces distinct collections rather than polishing one preset
//
// EVERY SECTION CARRIES AN INPUT FLOOR asserted before it evaluates anything. Five gates in this
// program have passed while measuring nothing, and each was caught only because a number looked
// implausible, which is not a detection mechanism.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_CLAIM_PATTERNS, PACKET_ALLOWED_KEYS, PACKET_SCAN_CLASSES, PACKET_SCAN_POLICY,
  objectiveDisclosureAllowed, objectiveLeakPatterns, scanForLeaks, validateVerdict, verdictTemplate,
} from "../packages/art-review/src/packet.js";
import { GATE_AXIS, RUBRIC_AXIS_IDS, VERDICTS } from "../packages/art-review/src/rubric.js";
import { ITERATION_CEILING, MAX_ITERATION_CEILING, MIN_ITERATION_CEILING } from "../packages/art-review/src/loop.js";
import { OBJECTIVE_CHECK_IDS } from "../packages/art-review/src/objective.js";
import { RUNTIMES, decodeConfig, encodeConfig, presetConfig } from "../packages/art-review/src/runtimes.js";
import { verifyAcceptance } from "../packages/art-review/src/receipt.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTROLS = process.argv.includes("--controls");
const JSON_OUT = process.argv.includes("--json");

const problems = [];
const fail = (m) => problems.push(m);

/**
 * Failures that belong to a NAMED claim, so the summary reports the claim rather than inferring it.
 *
 * The summary used to derive `ART_AUTHOR_REVIEWER_SEPARATED` by matching substrings against the
 * failure text, which makes a headline result depend on the wording of a message — reword the
 * message and the headline silently flips. Each claim now has its own bucket and a failure is
 * recorded against it explicitly.
 */
const claims = { separation: [], images: [], gate: [], guard: [], derivative: [] };
const failClaim = (claim, m) => { claims[claim].push(m); fail(m); };
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * An input floor, asserted before any judgement.
 *
 * A FLOOR OF ZERO IS NOT A FLOOR, and rejecting it is not pedantry: "add an input floor" is
 * otherwise satisfiable by a floor of nothing, which is how a gate acquires the appearance of one.
 */
function floor(label, actual, minimum) {
  if (minimum <= 0) {
    console.error(`  INPUT FLOOR MISCONFIGURED  ${label}: a floor of ${minimum} is not a floor`);
    process.exit(1);
  }
  if (actual < minimum) {
    console.error("");
    console.error(`  INPUT_FLOOR_TRIPPED  art-review/${label}: observed ${actual}, floor ${minimum}`);
    console.error("    A gate that examines nothing is not a passing gate.");
    console.error("ART_REVIEW_GATE=FAIL");
    process.exit(1);
  }
  if (!JSON_OUT) console.log(`  INPUT_FLOOR_OK  ${label}: ${actual} >= ${minimum}`);
  return actual;
}

// ------------------------------------------------------------------------------------------------
// THE SCAN SURFACE, DECLARED AS DATA
// ------------------------------------------------------------------------------------------------
const SKIP_DIRS = new Set([".git", "node_modules", "lib", "out", "cache", "dist", ".next", "previews", "broadcast", "submissions", "coverage"]);
const SCAN_EXT = new Set([".md", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yml", ".yaml"]);
/** This scanner names every spelling it forbids, so it must not scan itself. Exactly one file. */
const SCAN_EXCLUDE = new Set(["scripts/check-art-review.mjs"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/**
 * A skip flag, under any spelling.
 *
 * MATCHED AS A SHAPE, NOT AS A LIST. The one thing that would turn this whole loop back into
 * `CREATE -> VALIDATE -> LAUNCH` is a documented bypass, and a blocklist of the exact string
 * `--skip-art-review` is defeated by `--no-art-review`, by `skipArtReview`, and by an env var. The
 * rule below matches the SHAPE: a negation prefix attached to art review, in a flag, a key or an
 * environment variable.
 */
const SKIP_SHAPES = [
  { id: "SKIP_FLAG", re: /--(?:skip|no|bypass|disable|force)[-_]?(?:the[-_]?)?art[-_]?review\b/i },
  { id: "SKIP_KEY", re: /\b(?:skip|bypass|disable|force)ArtReview\b/ },
  { id: "SKIP_ENV", re: /\b(?:RELICS_)?(?:SKIP|NO|BYPASS|DISABLE|FORCE)_ART_REVIEW\b/ },
  { id: "SKIP_POLICY_FIELD", re: /["']?(?:skipArtReview|artReviewOptional|requireArtReview)["']?\s*:\s*(?:false|true)/ },
];
/**
 * A line that only FORBIDS a skip is legal. Negation-aware, or the prohibition is unwritable —
 * this file could not describe the flag it refuses without tripping over itself.
 *
 * THE STEMS CARRY NO TRAILING WORD BOUNDARY, and that is not a detail. Written as `\brefus\b` the
 * rule matched "refus" and nothing else, so "a policy field named skipArtReview is refused by
 * name" scored as an assertion of the very thing it forbids. Its own control caught that.
 */
const SKIP_NEGATORS = /\b(?:no|never|not|nor|there is no|refus\w*|forbid\w*|reject\w*|absent|deliberately|does not|will not|cannot|can't|scans?\s+for|would be|prohibit\w*|disallow\w*|remov\w*|instead of)/i;

function skipFinding(line) {
  for (const s of SKIP_SHAPES) {
    if (!s.re.test(line)) continue;
    if (SKIP_NEGATORS.test(line)) return null;
    return s.id;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// CONTROLS — run BEFORE the real work, so a controls failure cannot be hidden by a passing scan
// ------------------------------------------------------------------------------------------------
const MUST_CATCH_LEAK = [
  ["an author quality assertion", "The composition here looks really strong at browse size."],
  ["a ship recommendation", "In my view this is ready to ship."],
  ["a brief-satisfaction claim", "The output matches the brief on every axis."],
  ["a critique-resolved claim", "Round 2 addressed the critique about peripheral density."],
  ["a self recommendation", "I believe the palette now carries the work."],
  ["an improvement claim", "This round is much improved over the last one."],
  ["a gate assertion", "The configuration passes every check and floor."],
  ["a battery check id", "STRUCTURAL_ROLE measured 3.24 on the weakest rule."],
  ["a battery delta-E key", '    "meanDeltaE": 22.808, "minDeltaE": 7.828'],
  ["a battery ink key", '    "minInk": 0.208, "meanInk": 0.513'],
  ["a superlative ranking", "The recovery row is the cleanest of the three states."],
  ["the battery's floor table", '  "floors": { "ink": 0.04, "seedDiversityMean": 3 },'],
];
const MUST_ALLOW_LEAK = [
  ["a neutral packet instruction", "Open every image in this packet and look at it."],
  ["a factual render note", "Twelve seeds, three market states, rendered on chain 1."],
  ["a rubric question", "Is there a focal hierarchy, or does the frame read as an even field?"],
  ["a seed caption", "seed 175 stress"],
  ["a brief sentence about strength", "The composition should have a strong vertical axis."],
  ["a neutral round header", "This is round 2. 3 judgements remain."],
  // A REVIEWER SAYING "FLOOR" IS WRITING A WORK ORDER. The rule that could not tell that from the
  // battery's own table refused two real packets; this control is why it cannot go back.
  ["a reviewer asking for a coverage floor", "Enforce a floor of 35% lit rows and a ceiling of 80% so every seed is a member."],
  ["a reviewer describing a luminance floor", "Set a hard floor on the stone value: never let a fill land within 30% luminance of the ground."],
  // A REVIEWER MEASURING WITH ITS OWN EYES IS DOING THE JOB. These two sentences are the reviewer's
  // own findings, and rules that keyed on the English words "floor" and "ink coverage" refused two
  // real packets carrying them. The rules now key on the battery's identifiers instead.
  ["a reviewer quoting its own ink measurement", "Drawdown is unmistakable: seed 175 goes from 40.3% to 59.3% ink across the stress row."],
  ["a reviewer quoting its own colour distance", "Stress and recovery differ by less than a tenth of a percent of pixels on every seed."],
];
const MUST_CATCH_SKIP = [
  ["a skip flag in a doc", "Pass --skip-art-review to launch without the visual loop."],
  ["a policy field", '  "skipArtReview": true,'],
  ["an env var", "Set RELICS_SKIP_ART_REVIEW=1 in CI to save time."],
  ["a camelCase key", "if (flags.bypassArtReview) return EXIT.OK;"],
];
const MUST_ALLOW_SKIP = [
  ["the prohibition itself", "There is deliberately no --skip-art-review and there never will be."],
  ["a refusal sentence", "A policy field named skipArtReview is refused by name."],
  ["an unrelated skip", "Pass --skip-lint to save time in a local loop."],
  ["a scanner description", "This gate scans for --skip-art-review under any spelling."],
];

if (CONTROLS) {
  let caught = 0;
  let falsePositives = 0;
  console.log("art-review gate — negative controls\n");

  console.log("  leak scanner: must catch");
  for (const [label, text] of MUST_CATCH_LEAK) {
    const hit = scanForLeaks(text).length > 0;
    console.log(`    ${hit ? "PASS" : "FAIL"}  ${label}`);
    if (hit) caught++;
    else fail(`leak control missed: ${label}`);
  }
  console.log("  leak scanner: the reviewer's own words are not author claims, and a score in them still is");
  for (const [label, text, cls, expect] of [
    ["a reviewer calling a state the cleanest", "The stress row is the cleanest, most resolved state in the packet.", "OBJECTIVE_ONLY", false],
    ["a reviewer naming an axis that reads strong", "The palette is the one clearly on-brief element and reads strong at 512px.", "OBJECTIVE_ONLY", false],
    ["a forged score hidden in a critique", "PERCEPTUAL_SEPARATION came back well over its floor on every pairing.", "OBJECTIVE_ONLY", true],
    ["a battery key planted in a critique", '"weakestPairing": "ns", "meanDeltaE": 11.566', "OBJECTIVE_ONLY", true],
    ["an author claim in the disclosure file", "This round is much improved over the last one.", "AUTHOR_ONLY", true],
    ["a metric in the disclosure file, which is its purpose", "SEED_DIVERSITY measured 22.808 across the sample.", "AUTHOR_ONLY", false],
    ["a reviewer's own ink figure, which is not the battery's", "Seed 175 goes from 40.3% to 59.3% ink across the stress row.", "OBJECTIVE_ONLY", false],
  ]) {
    const hit = scanForLeaks(text, { scanClass: cls }).length > 0;
    const ok = hit === expect;
    console.log(`    ${ok ? "PASS" : "FAIL"}  ${cls}: ${label}`);
    if (ok) { if (expect) caught++; } else if (expect) fail(`scan-class control missed: ${label}`); else { falsePositives++; fail(`scan-class control false positive: ${label}`); }
  }

  console.log("  leak scanner: must allow");
  for (const [label, text] of MUST_ALLOW_LEAK) {
    const hit = scanForLeaks(text).length > 0;
    console.log(`    ${hit ? "FAIL" : "PASS"}  ${label}`);
    if (hit) { falsePositives++; fail(`leak control false positive: ${label} -> ${JSON.stringify(scanForLeaks(text))}`); }
  }
  console.log("  skip-flag scanner: must catch");
  for (const [label, text] of MUST_CATCH_SKIP) {
    const hit = skipFinding(text) !== null;
    console.log(`    ${hit ? "PASS" : "FAIL"}  ${label}`);
    if (hit) caught++;
    else fail(`skip control missed: ${label}`);
  }
  console.log("  skip-flag scanner: must allow");
  for (const [label, text] of MUST_ALLOW_SKIP) {
    const hit = skipFinding(text) !== null;
    console.log(`    ${hit ? "FAIL" : "PASS"}  ${label}`);
    if (hit) { falsePositives++; fail(`skip control false positive: ${label}`); }
  }

  console.log("  brief-fidelity gate");
  const shipWithFailedFidelity = validateVerdict({
    schemaVersion: 1, round: 1, verdict: "SHIP", reviewerId: "control",
    axes: Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, id === GATE_AXIS ? "FAIL" : "PASS"])),
    critique: [],
  }, { round: 1 });
  const gateHeld = shipWithFailedFidelity.some((p) => p.includes(GATE_AXIS) && p.includes("gate"));
  console.log(`    ${gateHeld ? "PASS" : "FAIL"}  a SHIP verdict on FAILED brief fidelity is refused`);
  if (gateHeld) caught++; else fail("the brief-fidelity gate did not refuse SHIP over a FAIL");

  console.log("  critique actionability");
  // THE REAL CRITIQUES THAT THIS RULE ONCE REFUSED. Six independent reviews were run through the
  // validator and it rejected these seven as unactionable; each is plainly executable, and each is
  // now a must-allow so the widening cannot be quietly narrowed back.
  const REAL_ACTIONS_MUST_ALLOW = [
    "Hold the base course's outline and position invariant across states, and vary only course count, joint gaps and lean magnitude",
    "Enforce a floor and a ceiling on the drawn ink so every frame covers at least 35% and at most 80% of the canvas with lit rows",
    "Snap every fragment edge to the parent slab's own edges and forbid any fragment from extending outside the parent bounding box",
    "Retire the free-floating small-square population entirely, or demote it to at most 5-8 marks per frame sitting on a scan row",
    "Fix ONE pale stone value for the whole collection and cap the value axis at two steps rather than a continuous ramp",
    "Move the variation from hue into structure: vary row pitch 3-8px, dropout band count 0-4, and horizontal shear magnitude",
    "Preserve the neutral silhouette's bounding box and centroid exactly through all three states and express stress only as subtractive fracture",
    "Re-test this axis after the arc-removal mechanic is restored, and protect three named carriers through every stress frame: 138's dashed brass ring, 212's nested hexagon chain, 175's ring of 12 pale nodes",
    "Draw the innermost generation as a scaled copy of generation 1 at 0.12-0.18 of the outer radius, centred on the frame centroid, in the six seeds whose centres are currently void",
  ];
  for (const action of REAL_ACTIONS_MUST_ALLOW) {
    const r = validateVerdict({
      schemaVersion: 1, round: 1, verdict: "REVISE", reviewerId: "control",
      axes: Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "PASS"])),
      critique: [{ axis: "composition", observation: "An observation long enough to be a real one about what was on the sheet.", action }],
    }, { round: 1 });
    const ok = r.length === 0;
    console.log(`    ${ok ? "PASS" : "FAIL"}  real reviewer action accepted: ${action.slice(0, 56)}...`);
    if (!ok) { falsePositives++; fail(`a real reviewer action was refused: ${r.join("; ")}`); }
  }
  for (const [label, action] of [
    ["a bare destination", "Make the composition better and more striking overall"],
    ["a polish instruction", "Improve the palette and polish the whole thing until it reads nicely"],
    // A MAGNITUDE DOES NOT RESCUE A DESTINATION. This is what the previous rule got wrong in the
    // other direction: it let any digit through, so "improve it by 100%" scored as a work order.
    ["a destination wearing a number", "Improve the palette by about 30% and make the whole thing stronger"],
  ]) {
    const r = validateVerdict({
      schemaVersion: 1, round: 1, verdict: "REVISE", reviewerId: "control",
      axes: Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "PASS"])),
      critique: [{ axis: "composition", observation: "An observation long enough to be a real one about what was on the sheet.", action }],
    }, { round: 1 });
    const hit = r.some((x) => x.includes("action"));
    console.log(`    ${hit ? "PASS" : "FAIL"}  refused: ${label}`);
    if (hit) caught++; else fail(`an unactionable critique was accepted: ${label}`);
  }
  const vague = validateVerdict({
    schemaVersion: 1, round: 1, verdict: "REVISE", reviewerId: "control",
    axes: Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "PASS"])),
    critique: [{ axis: "composition", observation: "The composition does not work for me at all, it feels wrong.", action: "make it better" }],
  }, { round: 1 });
  const vagueCaught = vague.some((p) => p.includes("action"));
  console.log(`    ${vagueCaught ? "PASS" : "FAIL"}  "make it better" is refused as a critique`);
  if (vagueCaught) caught++; else fail("an unactionable critique was accepted");

  const actionable = validateVerdict({
    schemaVersion: 1, round: 1, verdict: "REVISE", reviewerId: "control",
    axes: Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "PASS"])),
    critique: [{ axis: "composition", observation: "Peripheral blocks overwhelm the central form; there is no focal hierarchy at browse size.", action: "Cut peripheral density by about 40% and raise the central recursion scale" }],
  }, { round: 1 });
  console.log(`    ${actionable.length === 0 ? "PASS" : "FAIL"}  a directed critique with a magnitude is accepted`);
  if (actionable.length !== 0) { falsePositives++; fail(`an actionable critique was refused: ${actionable.join("; ")}`); }

  console.log("  empty-verdict refusal");
  const empty = validateVerdict(verdictTemplate(1), { round: 1 });
  console.log(`    ${empty.length > 0 ? "PASS" : "FAIL"}  the blank template is not a verdict`);
  if (empty.length > 0) caught++; else fail("the empty verdict template validated");

  console.log("  zero-input floors");
  for (const [label, actual, minimum] of [["leak patterns", AUTHOR_CLAIM_PATTERNS.length, 5], ["rubric axes", RUBRIC_AXIS_IDS.length, 6], ["objective checks", OBJECTIVE_CHECK_IDS.length, 8]]) {
    const zeroWouldTrip = 0 < minimum;
    console.log(`    ${zeroWouldTrip ? "PASS" : "FAIL"}  ${label}: a floor of ${minimum} refuses zero input (actual ${actual})`);
    if (!zeroWouldTrip) fail(`${label}: the floor does not refuse zero input`);
  }

  const total = MUST_CATCH_LEAK.length + MUST_CATCH_SKIP.length + 6 + 3;
  // MUST_CATCH_LEAK and MUST_CATCH_SKIP are counted from their own arrays, so adding a control
  // moves this number on its own rather than requiring someone to remember to.
  console.log("");
  console.log(`ART_REVIEW_CONTROLS_CAUGHT=${caught}/${total}`);
  console.log(`ART_REVIEW_CONTROL_FALSE_POSITIVES=${falsePositives}`);
  console.log(`ART_REVIEW_CONTROLS=${problems.length === 0 && caught === total ? "PASS" : "FAIL"}`);
  for (const p of problems) console.log(`  FAIL  ${p}`);
  process.exit(problems.length === 0 && caught === total ? 0 : 1);
}

// ================================================================================================
// 1. INPUT FLOORS
// ================================================================================================
if (!JSON_OUT) console.log("art-review gate\n");

const files = [...walk(ROOT)].filter((f) => SCAN_EXT.has(f.slice(f.lastIndexOf("."))));
const rels = files.map((f) => relative(ROOT, f));
const scanned = rels.filter((r) => !SCAN_EXCLUDE.has(r));
const excluded = rels.length - scanned.length;
floor("files scanned", scanned.length, 100);
if (excluded !== SCAN_EXCLUDE.size) {
  fail(`${excluded} files were excluded from the scan but exactly ${SCAN_EXCLUDE.size} are declared. An exclusion list that does not match what it excluded is a hiding place.`);
}

const ENGINE_DIR = join(ROOT, "packages", "art-review", "src");
const engineFiles = [...walk(ENGINE_DIR)].map((f) => relative(ROOT, f));
floor("review engine modules", engineFiles.length, 10);
floor("rubric axes", RUBRIC_AXIS_IDS.length, 6);
floor("objective checks", OBJECTIVE_CHECK_IDS.length, 8);
floor("author-claim patterns", AUTHOR_CLAIM_PATTERNS.length, 5);
floor("objective leak patterns", objectiveLeakPatterns().length, OBJECTIVE_CHECK_IDS.length);

// ================================================================================================
// 2. THE REVIEW LOOKS AT RENDERED IMAGES
// ================================================================================================
const raster = readFileSync(join(ENGINE_DIR, "raster.js"), "utf8");
const sheets = readFileSync(join(ENGINE_DIR, "sheets.js"), "utf8");
const packetSrc = readFileSync(join(ENGINE_DIR, "packet.js"), "utf8");

if (!/export async function rasterize\(/.test(raster)) fail("raster.js exports no rasterize()");
if (!/THUMB_PX = 120/.test(raster)) fail("the browse-size raster is not 120px. Every verdict in this project was actually decided at that size.");
if (!/RASTER_UNAVAILABLE/.test(raster)) fail("the rasteriser does not fail closed. A review that cannot produce images must refuse, never fall back to markup.");
for (const want of ["contact.png", "contact-thumb.png", "states.png", "states-thumb.png"]) {
  if (!sheets.includes(want)) fail(`sheets.js does not write ${want}. A review without it is missing a question nothing else asks.`);
}
const thumbSheets = (sheets.match(/-thumb\.png/g) ?? []).length;
floor("thumbnail-scale sheets", thumbSheets, 2);
if (!/images\.length === 0/.test(packetSrc)) fail("packet.js does not refuse a packet with no images");

// ================================================================================================
// 3. BRIEF FIDELITY IS A GATE
// ================================================================================================
const rubricSrc = readFileSync(join(ENGINE_DIR, "rubric.js"), "utf8");
if (!new RegExp(`id: "${GATE_AXIS}"[\\s\\S]{0,80}gate: true`).test(rubricSrc)) fail(`${GATE_AXIS} is not declared as a gate axis`);
const gateHeld = validateVerdict({
  schemaVersion: 1, round: 1, verdict: "SHIP", reviewerId: "gate-check",
  axes: Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, id === GATE_AXIS ? "FAIL" : "PASS"])), critique: [],
}, { round: 1 }).some((p) => p.includes(GATE_AXIS));
if (!gateHeld) fail("a SHIP verdict over a FAILED brief fidelity was not refused");

// ================================================================================================
// 4. THE AUTHOR CANNOT APPROVE ITS OWN WORK
// ================================================================================================
for (const forbidden of ["authorNotes", "authorClaims", "changeLog", "intent", "selfAssessment", "config", "configBytes", "artConfig", "objective", "measurements", "traits"]) {
  if (PACKET_ALLOWED_KEYS.includes(forbidden)) failClaim("separation", `the packet whitelist admits ${forbidden}, which is either the author's opinion or a parameter. A reviewer given parameters reviews parameters.`);
}
floor("packet whitelist keys", PACKET_ALLOWED_KEYS.length, 6);
floor("packet scan-policy entries", Object.keys(PACKET_SCAN_POLICY).length, 3);
for (const [file, cls] of Object.entries(PACKET_SCAN_POLICY)) {
  if (!PACKET_SCAN_CLASSES.includes(cls)) fail(`the packet scan policy gives ${file} the class ${cls}, which is not one of ${PACKET_SCAN_CLASSES.join(", ")}`);
}
// THE ONE FILE THAT MAY NOT BE RELAXED. `REVIEW_REQUEST.json` is what the packet builder composes,
// which makes it the only place an author's opinion could be written by this code; relaxing it
// would retire the scan while leaving it looking present.
if (PACKET_SCAN_POLICY["REVIEW_REQUEST.json"]) fail("REVIEW_REQUEST.json has been given a relaxed scan class. It is the file the builder composes and the only one an author claim could enter through.");

const disclosureBlocked = objectiveDisclosureAllowed(join(ROOT, "packages", "art-review", "src"));
if (disclosureBlocked.allowed) failClaim("separation", "objectiveDisclosureAllowed said yes for a directory with no round-1 verdict in it. Scores are withheld until the first unanchored judgement.");

if (!/priorCritique/.test(packetSrc)) failClaim("separation", "the packet carries no prior critique, so a reviewer cannot check whether its own work order was carried out");
if (!/verdict\.template\.json/.test(packetSrc)) failClaim("separation", "the packet ships no blank verdict template, so the shape is the author's to describe");
if (!/reviewer-prompt\.md/.test(packetSrc)) failClaim("separation", "the packet ships no generated reviewer prompt. If the prompt is the author's to compose, the separation is a rule the author enforces on itself.");

// ================================================================================================
// 5. AN ACCEPTANCE IS VOID WHEN THE CONFIGURATION MOVES — PROVED BY MUTATION
// ================================================================================================
// NOT ASSERTED FROM THE SOURCE TEXT. The property is that the verifier REFUSES, so it is exercised:
// a synthetic acceptance is written, verified green, then one field of the configuration is moved
// by the smallest step the format allows and the verifier must refuse. A gate that read the code
// and found a comparison would prove that a comparison exists, not that it decides anything.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const mutations = [];
{
  const ws = mkdtempSync(join(tmpdir(), "relics-art-acceptance-"));
  try {
    const runtimeId = "GEOMETRIC_RECURSION_V1";
    const cfg = presetConfig(runtimeId);
    const bytes = encodeConfig(runtimeId, cfg);
    const brief = "# Brief\n\nA control brief, for a mutation proof.\n";
    mkdirSync(join(ws, ".relics-agent", "receipts"), { recursive: true });
    // THE REVIEWER'S OWN DOCUMENT, because the verdict is no longer allowed to attest to itself.
    // A record carrying a bare `verdict: "SHIP"` is refused outright now, so a fixture that omits
    // this has no green baseline and every mutation below scores as caught for the wrong reason.
    const packetDir = join(ws, ".relics-agent", "art-review", "round-1", "packet");
    mkdirSync(packetDir, { recursive: true });
    const verdictBytes = Buffer.from(`${JSON.stringify({ reviewerId: "mutation-control", verdict: "SHIP", axes: {} }, null, 2)}\n`);
    writeFileSync(join(packetDir, "verdict.json"), verdictBytes);
    const record = {
      schemaVersion: 1, kind: "ART_VISUAL_ACCEPTANCE", accepted: true, verdict: "SHIP",
      runtimeId, templateId: RUNTIMES[runtimeId].templateId, chainId: 1,
      runtimeAddress: "0x0000000000000000000000000000000000000003",
      briefSha256: sha256(brief),
      acceptedConfigHash: (await import("../packages/art-review/src/receipt.js")).configHashOf(bytes),
      reviewerId: "mutation-control", rounds: [{ round: 1 }],
      verdictDocument: {
        path: join(".relics-agent", "art-review", "round-1", "packet", "verdict.json"),
        sha256: sha256(verdictBytes),
        verdictField: "verdict",
      },
    };
    writeFileSync(join(ws, ".relics-agent", "receipts", "art-review.json"), JSON.stringify(record));

    const baseline = verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId, templateId: record.templateId, runtimeAddress: record.runtimeAddress });
    if (!baseline.accepted) fail(`the acceptance mutation proof has no GREEN baseline: ${baseline.detail}`);

    // ONE BYTE, THE SMALLEST STEP THE FORMAT ALLOWS. `contraction` moves by a single per cent.
    const moved = JSON.parse(JSON.stringify(cfg));
    moved.rules[0].contraction -= 1;
    const movedBytes = encodeConfig(runtimeId, moved);
    if (movedBytes === bytes) fail("the mutation did not change the configuration bytes; it proves nothing");
    const m1 = verifyAcceptance(ws, { configBytes: movedBytes, briefText: brief, runtimeId, templateId: record.templateId, runtimeAddress: record.runtimeAddress });
    mutations.push(["one per cent of contraction", !m1.accepted && m1.invalidatedBy.some((i) => i.facet === "ART_CONFIG")]);

    // A PALETTE ENTRY. Render-affecting and invisible to a byte-length check.
    const repainted = JSON.parse(JSON.stringify(cfg));
    repainted.palette[1] = "#ff0000";
    const m2 = verifyAcceptance(ws, { configBytes: encodeConfig(runtimeId, repainted), briefText: brief, runtimeId, templateId: record.templateId, runtimeAddress: record.runtimeAddress });
    mutations.push(["one palette entry", !m2.accepted && m2.invalidatedBy.some((i) => i.facet === "ART_CONFIG")]);

    // THE APPENDIX. It is NOT interpreted and does NOT change the picture — and it IS inside
    // `artConfigHash`, which is what the launch commits to and what is immutable afterwards.
    const appended = { ...JSON.parse(JSON.stringify(cfg)), appendix: "deadbeef" };
    const m3 = verifyAcceptance(ws, { configBytes: encodeConfig(runtimeId, appended), briefText: brief, runtimeId, templateId: record.templateId, runtimeAddress: record.runtimeAddress });
    mutations.push(["an opaque appendix that changes no pixel", !m3.accepted && m3.invalidatedBy.some((i) => i.facet === "ART_CONFIG")]);

    // THE BRIEF. Brief fidelity is a gate, so retargeting the brief retargets the gate.
    const m4 = verifyAcceptance(ws, { configBytes: bytes, briefText: `${brief}And another paragraph.\n`, runtimeId, templateId: record.templateId, runtimeAddress: record.runtimeAddress });
    mutations.push(["the brief", !m4.accepted && m4.invalidatedBy.some((i) => i.facet === "BRIEF")]);

    // THE RUNTIME ADDRESS. Registry rows are re-pointable; a review of one renderer is not
    // evidence about another sitting at the same id.
    const m5 = verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId, templateId: record.templateId, runtimeAddress: "0x0000000000000000000000000000000000000009" });
    mutations.push(["the runtime address", !m5.accepted && m5.invalidatedBy.some((i) => i.facet === "RUNTIME_ADDRESS")]);

    // THE VERDICT ITSELF. Flipping the word in the receipt used to be the entire forgery: every
    // other field the verifier consults lived in the same file and moved with it.
    const flipped = { ...record, verdict: "REVISE" };
    writeFileSync(join(ws, ".relics-agent", "receipts", "art-review.json"), JSON.stringify(flipped));
    const m6 = verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId, templateId: record.templateId, runtimeAddress: record.runtimeAddress });
    mutations.push(["the verdict, against the reviewer's own document", m6.reasonCode === "ART_ACCEPTANCE_VERDICT_SELF_ATTESTED"]);

    // AND DROPPING THE BINDING, which is how a forger passes a gate that only compares two fields
    // when both are present.
    writeFileSync(join(ws, ".relics-agent", "receipts", "art-review.json"), JSON.stringify({ ...record, verdictDocument: null }));
    const m7 = verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId, templateId: record.templateId, runtimeAddress: record.runtimeAddress });
    mutations.push(["the verdict binding, removed entirely", m7.reasonCode === "ART_ACCEPTANCE_VERDICT_UNBOUND"]);

    writeFileSync(join(ws, ".relics-agent", "receipts", "art-review.json"), JSON.stringify(record));

    // AND THE CONTROL IN THE OTHER DIRECTION: unchanged inputs still verify, so the four refusals
    // above are the mutation working rather than the verifier refusing everything.
    const again = verifyAcceptance(ws, { configBytes: bytes, briefText: brief, runtimeId, templateId: record.templateId, runtimeAddress: record.runtimeAddress });
    mutations.push(["CONTROL: unchanged inputs still verify", again.accepted]);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
}
floor("acceptance mutations", mutations.length, 5);
for (const [label, ok] of mutations) if (!ok) fail(`acceptance mutation survived: ${label}`);

// ================================================================================================
// 6. NO LAUNCH-PROVING COMMAND RUNS WITHOUT AN ACCEPTANCE — LIST DERIVED FROM THE PIPELINE
// ================================================================================================
// DERIVED, NOT LISTED. The guarded set is read out of `cmdRun`'s own step table: every phase
// strictly after ART_REVIEW and up to BROADCAST inclusive. A step added to that pipeline later and
// left unguarded FAILS this gate; a hand-maintained list would simply not mention it.
const agentSrc = readFileSync(join(ROOT, "packages", "creator-cli", "src", "commands", "agent.js"), "utf8");
const launchSrc = readFileSync(join(ROOT, "packages", "creator-cli", "src", "commands", "agent-launch.js"), "utf8");

const stepsBlock = agentSrc.match(/const steps = \[([\s\S]*?)\n {2}\];/);
if (!stepsBlock) fail("could not find cmdRun's step table in agent.js, so the guarded set could not be derived. Refusing rather than falling back to a list.");
const pipeline = stepsBlock ? [...stepsBlock[1].matchAll(/\["([A-Z_]+)",\s*\(n\)\s*=>\s*(?:L\.)?(cmd\w+)/g)].map((m) => ({ phase: m[1], fn: m[2] })) : [];
floor("pipeline steps derived", pipeline.length, 8);

const artAt = pipeline.findIndex((p) => p.phase === "ART_REVIEW");
if (artAt === -1) fail("ART_REVIEW is not a step in cmdRun's pipeline. The review is not part of the run.");
const broadcastAt = pipeline.findIndex((p) => p.phase === "BROADCAST");
if (broadcastAt === -1) fail("BROADCAST is not a step in cmdRun's pipeline");
if (artAt > -1 && broadcastAt > -1 && artAt >= pipeline.findIndex((p) => p.phase === "METADATA")) {
  fail("ART_REVIEW does not run before METADATA. Metadata is written at birth and cannot be changed, so a review after it is a review of something already committed to.");
}

const mustGuard = artAt > -1 && broadcastAt > -1 ? pipeline.slice(artAt + 1, broadcastAt + 1).map((p) => p.fn) : [];
floor("commands that must be guarded", mustGuard.length, 5);
const unguarded = [];
for (const fn of mustGuard) {
  const m = new RegExp(`export async function ${fn}\\(name, workspace, flags, json, ctx\\) \\{\\n(.*)\\n`).exec(launchSrc);
  const first = m?.[1] ?? "";
  // FIRST STATEMENT, AND IT MUST RETURN ON THE ANSWER. A guard whose result is computed and
  // discarded is decoration; this project has shipped exactly that shape before.
  if (!/requireArtGate\(name, workspace, json, ctx\)/.test(first) || !/return EXIT\.BLOCKED/.test(first)) unguarded.push(fn);
}
for (const fn of unguarded) fail(`${fn} is a launch-proving step in cmdRun's pipeline and does not RETURN on the art gate as its first statement`);

if (!/requireArtAccepted/.test(readFileSync(join(ROOT, "packages", "creator-cli", "src", "commands", "agent-art.js"), "utf8"))) {
  fail("agent-art.js exports no requireArtAccepted");
}

// ================================================================================================
// 7. NO SKIP FLAG, UNDER ANY SPELLING
// ================================================================================================
const skips = [];
let linesScanned = 0;
for (const rel of scanned) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const lines = text.split("\n");
  linesScanned += lines.length;
  for (const [i, line] of lines.entries()) {
    const hit = skipFinding(line);
    if (hit) skips.push({ file: rel, line: i + 1, rule: hit, text: line.trim().slice(0, 140) });
  }
}
floor("lines scanned", linesScanned, 5000);
for (const s of skips) fail(`${s.file}:${s.line} ${s.rule}: ${s.text}`);

// ================================================================================================
// 8. THE CEILING IS A CEILING
// ================================================================================================
if (!(Number.isInteger(ITERATION_CEILING) && ITERATION_CEILING >= MIN_ITERATION_CEILING && ITERATION_CEILING <= MAX_ITERATION_CEILING)) {
  fail(`the iteration ceiling ${ITERATION_CEILING} is outside ${MIN_ITERATION_CEILING}..${MAX_ITERATION_CEILING}`);
}
const loopSrc = readFileSync(join(ENGINE_DIR, "loop.js"), "utf8");
if (!/ART_QUALITY_NOT_ACCEPTABLE/.test(loopSrc)) fail("the loop cannot refuse. A ceiling with no refusal at the end of it is a budget, not a ceiling.");
if (!/THE ITERATION CEILING IS FOUR, AND HERE IS THE ARGUMENT/.test(loopSrc)) fail("the ceiling is not argued anywhere. A number chosen without a reason is a number that gets raised.");

// ================================================================================================
// 9. THE LOOP DOES NOT COLLAPSE ONTO ITS TEMPLATE PRESET
// ================================================================================================
// RE-DERIVED FROM THE COMMITTED EVIDENCE, not asserted. Each recorded run's configuration is
// decoded and compared FIELD BY FIELD against the preset it started from, and against the other
// runs on the same runtime. A loop that polished one preset would show near-zero distance on both
// axes, and this is the only way to tell that apart from a loop that produced distinct work.
const EVIDENCE = join(ROOT, "packages", "art-review", "evidence", "loop-runs.json");
let derivative = { runs: 0, minFromPreset: null, minBetweenRuns: null };
if (!existsSync(EVIDENCE)) {
  fail(`there is no committed evidence at ${relative(ROOT, EVIDENCE)}. A claim that the loop produces distinct collections has to be re-derivable, not asserted.`);
} else {
  const ev = JSON.parse(readFileSync(EVIDENCE, "utf8"));
  const runs = ev.runs ?? [];
  floor("recorded loop runs", runs.length, 4);
  const runtimesCovered = new Set(runs.map((r) => r.runtimeId));
  if (runtimesCovered.size < 2) fail(`the evidence covers ${runtimesCovered.size} runtime(s); the loop has to be shown on both, or it has been shown on one template's neighbourhood`);
  const briefs = new Set(runs.map((r) => r.briefSha256));
  if (briefs.size !== runs.length) fail("two recorded runs share a brief; distinct collections have to come from distinct briefs");

  // THE BRIEFS ARE COMMITTED AND RE-HASHED HERE. A digest in a record nobody can recompute is a
  // number; with the brief beside it, "this configuration was reviewed against THIS brief" is a
  // statement a reader can check without a chain and without trusting the builder that wrote it.
  for (const r of runs) {
    const bp = join(ROOT, "packages", "art-review", "evidence", r.brief ?? "");
    if (!r.brief || !existsSync(bp)) { fail(`${r.id} records a brief digest but the brief itself is not committed at ${r.brief}`); continue; }
    const actual = sha256(readFileSync(bp, "utf8"));
    if (actual !== r.briefSha256) fail(`${r.id}: the committed brief hashes to ${actual}, not the ${r.briefSha256} the record claims. Brief fidelity was judged against one of those two documents and the record no longer says which.`);
  }

  // EVERY RECORDED JUDGEMENT WAS MADE BY SOMEONE, AND NOT BY THE AUTHOR. A round with no reviewer
  // id is a round nobody can attribute, which is indistinguishable from a self-approval.
  for (const r of runs) {
    for (const rd of r.rounds ?? []) {
      if (rd.verdict && (typeof rd.reviewerId !== "string" || rd.reviewerId.length < 3)) {
        fail(`${r.id} round ${rd.round} records a ${rd.verdict} verdict with no reviewer id`);
      }
    }
  }

  const distance = (a, b) => {
    // A structural distance over the decoded documents: how many leaf values differ.
    let n = 0;
    const walkPair = (x, y) => {
      if (Array.isArray(x) || Array.isArray(y)) {
        const ax = Array.isArray(x) ? x : [];
        const ay = Array.isArray(y) ? y : [];
        if (ax.length !== ay.length) n++;
        for (let i = 0; i < Math.max(ax.length, ay.length); i++) walkPair(ax[i], ay[i]);
        return;
      }
      if (x && typeof x === "object" && y && typeof y === "object") {
        for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walkPair(x[k], y[k]);
        return;
      }
      if (JSON.stringify(x) !== JSON.stringify(y)) n++;
    };
    walkPair(a, b);
    return n;
  };

  const perRuntime = new Map();
  let minFromPreset = Infinity;
  for (const r of runs) {
    const decoded = decodeConfig(r.runtimeId, r.configBytes);
    const d = distance(decoded, presetConfig(r.runtimeId));
    minFromPreset = Math.min(minFromPreset, d);
    if (d < 8) failClaim("derivative", `${r.id} differs from its template preset in only ${d} leaf value(s). That is polishing the preset, not authoring against a brief.`);
    if (!perRuntime.has(r.runtimeId)) perRuntime.set(r.runtimeId, []);
    perRuntime.get(r.runtimeId).push({ id: r.id, decoded });
  }
  let minBetween = Infinity;
  for (const [runtimeId, group] of perRuntime) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const d = distance(group[i].decoded, group[j].decoded);
        minBetween = Math.min(minBetween, d);
        if (d < 8) failClaim("derivative", `${group[i].id} and ${group[j].id} on ${runtimeId} differ in only ${d} leaf value(s); they are one collection with two names`);
      }
    }
  }
  derivative = {
    runs: runs.length,
    minFromPreset: Number.isFinite(minFromPreset) ? minFromPreset : null,
    minBetweenRuns: Number.isFinite(minBetween) ? minBetween : null,
  };
  // A REFUSAL IS EVIDENCE THE LOOP WORKS, so the record has to contain at least one.
  if (!runs.some((r) => r.outcome === "ART_QUALITY_NOT_ACCEPTABLE")) {
    fail("no recorded run was refused. A loop that has never refused anything has not been shown to be able to.");
  }

  // THE SAME CLAIM AS `FIRST_LEGAL_CONFIG_ACCEPTED_WITHOUT_REVIEW`, MEASURED AGAINST REAL RUNS
  // RATHER THAN AGAINST THE SOURCE. The guard check above proves no command CAN run without an
  // acceptance; this proves no recorded run DID. Two different questions, and a codebase can pass
  // the first while the second was never exercised.
  derivative.acceptedWithoutJudgement = runs.filter((r) => r.outcome === "ART_ACCEPTED" && (r.judgements ?? 0) < 1).length;
  if (derivative.acceptedWithoutJudgement > 0) {
    fail(`${derivative.acceptedWithoutJudgement} recorded run(s) were accepted with no judgement at all`);
  }
  derivative.refusedAtCeiling = runs.filter((r) => r.outcome === "ART_QUALITY_NOT_ACCEPTABLE").length;
  derivative.accepted = runs.filter((r) => r.outcome === "ART_ACCEPTED").length;
  // WHAT THE FIRST ROUND ACTUALLY RETURNED, counted rather than asserted. This is the measurement
  // the whole loop exists because of: how often the first legal configuration was the finished work.
  derivative.firstRoundShip = runs.filter((r) => (r.rounds ?? []).some((rd) => rd.round === 1 && rd.verdict === "SHIP")).length;
  derivative.judgements = runs.reduce((n, r) => n + (r.judgements ?? 0), 0);
  const reviewers = new Set(runs.flatMap((r) => (r.rounds ?? []).map((rd) => rd.reviewerId).filter(Boolean)));
  derivative.distinctReviewers = reviewers.size;
  floor("recorded judgements", derivative.judgements, 6);
}

// ================================================================================================
// REPORT
// ================================================================================================
const summary = {
  AUTONOMOUS_VISUAL_REVIEW_RENDERED_IMAGES: thumbSheets >= 2 && /rasterize/.test(raster) ? "YES" : "NO",
  BRIEF_FIDELITY_GATE: gateHeld ? "ENABLED" : "DISABLED",
  ART_AUTHOR_REVIEWER_SEPARATED: claims.separation.length === 0 ? "YES" : "NO",
  ART_ACCEPTANCE_INVALIDATED_BY_CONFIG_CHANGE: mutations.every(([, ok]) => ok) ? "YES" : "NO",
  ART_ACCEPTANCE_MUTATIONS_CAUGHT: `${mutations.filter(([, ok]) => ok).length}/${mutations.length}`,
  FIRST_LEGAL_CONFIG_ACCEPTED_WITHOUT_REVIEW: unguarded.length,
  GUARDED_LAUNCH_COMMANDS: mustGuard.length,
  ART_REVIEW_SKIP_FLAGS: skips.length,
  ART_REVIEW_ITERATION_CEILING: ITERATION_CEILING,
  AUTONOMOUS_TEMPLATE_DERIVATIVE_COLLAPSE: claims.derivative.length === 0 ? "NO" : "YES",
  RECORDED_LOOP_RUNS: derivative.runs,
  RECORDED_JUDGEMENTS: derivative.judgements ?? 0,
  DISTINCT_REVIEWERS: derivative.distinctReviewers ?? 0,
  RUNS_ACCEPTED: derivative.accepted ?? 0,
  RUNS_REFUSED_AT_CEILING: derivative.refusedAtCeiling ?? 0,
  FIRST_ROUND_SHIP_VERDICTS: derivative.firstRoundShip ?? 0,
  RUNS_ACCEPTED_WITHOUT_JUDGEMENT: derivative.acceptedWithoutJudgement ?? 0,
  MIN_LEAF_DISTANCE_FROM_PRESET: derivative.minFromPreset,
  MIN_LEAF_DISTANCE_BETWEEN_RUNS: derivative.minBetweenRuns,
  ART_REVIEW_GATE: problems.length === 0 ? "PASS" : "FAIL",
};

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: problems.length === 0, summary, problems }, null, 2));
} else {
  console.log("");
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log("");
  for (const [k, v] of Object.entries(summary)) console.log(`${k}=${v}`);
  console.log("");
  console.log(problems.length === 0 ? "[art-review] PASS" : `[art-review] ${problems.length} FAILURE(S)`);
}
process.exit(problems.length === 0 ? 0 : 1);
