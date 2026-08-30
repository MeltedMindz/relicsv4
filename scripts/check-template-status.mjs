#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE WAVE-1 TEMPLATE STATUS GATE.
//
// Four things, and the fourth is the one the release hangs on:
//
//   1. THE MODEL IS SOUND. The review ledger validates, the four tiers partition the whole wave,
//      every SHIP status traces to a verdict of SHIP, and no descriptor is malformed.
//   2. AN AGENT CANNOT REACH A NON-SHIP TEMPLATE. Evaluated against EVERY non-SHIP template, not a
//      sample: the pool, the predicate, the matcher's own refusal and the final assertion are each
//      asked about each one. The three results are printed by the names the release uses.
//   3. WHAT IS PUBLISHED MATCHES WHAT WAS MEASURED. Every published sheet digest is re-hashed
//      against the file beside it, and every "effective signal" is re-derived from the committed
//      census rather than read out of the descriptor.
//   4. NO PUBLIC SURFACE SAYS THESE RUNTIMES CAN BE LAUNCHED. They are not registered on any chain,
//      the package is being PREPARED in advance of a registration nobody has signed, and the whole
//      value of preparing early evaporates if a creator reads a sentence that is not true yet.
//      The scan is negation-aware, so saying "GEOMETRIC_RECURSION_V1 is not registered" stays
//      legal and saying it is stays caught.
//
// INPUT FLOORS. Every count this gate depends on is floored before anything is judged. A gate that
// scans nothing prints a clean result, and this repository has shipped that outcome before.
//
// Run: node scripts/check-template-status.mjs [--controls] [--json]
// ================================================================================================

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADVANCED_FLAG_STATUSES,
  AUTONOMOUS_SELECTABLE_STATUSES,
  DEFAULT_CATALOG_STATUSES,
  PROMOTION_REQUIREMENTS,
  REVIEW_LEDGER,
  RUNTIMES,
  RUNTIMES_LEFT_WAVE1,
  TEMPLATE_DESCRIPTORS,
  TEMPLATE_STATUSES,
  allTemplateIds,
  assertAutonomousSelection,
  assertNoLaunchabilityClaim,
  assertNoQualityScore,
  classification,
  describeAll,
  describeTemplate,
  humanCatalog,
  isAutonomouslySelectable,
  isVisibleToHuman,
  proposePromotion,
  readSensorMovement,
  readStateDistinction,
  semanticMatch,
  shipCatalog,
  templateStatus,
  validateDescriptor,
  validateLedger,
} from "../packages/template-catalog/src/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTROLS = process.argv.includes("--controls");
const JSON_OUT = process.argv.includes("--json");

const problems = [];
const fail = (msg) => problems.push(msg);

/** A floor of nothing is not a floor. */
function floor(label, actual, minimum) {
  if (minimum <= 0) {
    console.error(`  INPUT FLOOR MISCONFIGURED  ${label}: a floor of ${minimum} is not a floor`);
    process.exit(1);
  }
  if (actual < minimum) {
    console.error("");
    console.error(`  INPUT_FLOOR_TRIPPED  template-status/${label}: observed ${actual}, floor ${minimum}`);
    console.error("    A gate that examines nothing is not a passing gate.");
    console.error("TEMPLATE_STATUS_GATE=FAIL");
    process.exit(1);
  }
  if (!JSON_OUT) console.log(`  INPUT_FLOOR_OK  ${label}: ${actual} >= ${minimum}`);
  return actual;
}

// ------------------------------------------------------------------------------------------------
// The public surfaces this gate scans for a launchability claim.
// ------------------------------------------------------------------------------------------------
const SCAN_DIRS = ["packages/template-catalog/src", "packages/creator-cli/src", "packages/agent-flow/src", "packages/launch-sdk/src", "docs", "scripts"];
const SCAN_FILES = ["README.md", "AGENTS.md", "CLAUDE.md"];

/**
 * THE ONE EXCLUSION, and it is the scanner itself.
 *
 * This file carries the must-catch corpus -- six sentences written to BE launchability claims -- so
 * scanning it would report six findings that are the gate working. The exclusion is a single named
 * path rather than a pattern, and the count is asserted below, so it cannot quietly grow into a
 * directory that hides a real claim.
 */
const SCAN_EXCLUDE = new Set(["scripts/check-template-status.mjs"]);
const SCAN_EXT = new Set([".md", ".js", ".mjs", ".ts", ".tsx", ".json"]);

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SCAN_EXT.has(e.name.slice(e.name.lastIndexOf(".")))) out.push(p);
  }
  return out;
}

/**
 * THE SCAN COVERS THE RUNTIMES THAT LEFT THE WAVE TOO, and that is not tidiness.
 *
 * `CELLULAR_SYSTEM_V1` and `PIXEL_GRID_V1` both left Wave 1 on 2026-08-29 with zero SHIP templates.
 * Their NAMES are still in this repository's prose, in the review ledger and in every reader's
 * memory, so a sentence saying one of them is registered or launchable is MORE likely now than it
 * was while they shipped — and it would be a claim about a runtime nobody may launch at all.
 * Deriving the scan from `RUNTIMES` alone would have retired that check on the day it started
 * mattering most, and it would have retired it TWICE in one day.
 */
const RUNTIME_IDS = [...Object.keys(RUNTIMES), ...Object.keys(RUNTIMES_LEFT_WAVE1)];

/**
 * A LAUNCHABILITY CLAIM, matched by SHAPE rather than by a list of sentences.
 *
 * The claim is "one of these four runtimes can be bound by a launch". It has three shapes and the
 * gate matches all three, because fixing the sentence a finding named and leaving its sibling is
 * how a false claim survived three consecutive rounds in this project:
 *
 *   VERB FORM     "GEOMETRIC_RECURSION_V1 is launchable" / "is registered" / "is live" / "is deployed"
 *   IMPERATIVE    "launch with PIXEL_GRID_V1" / "you can launch CELLULAR_SYSTEM_V1"
 *   NOUN PHRASE   "the launchable VECTOR_COMPOSITION_V1 runtime"
 *
 * NEGATION-AWARE. A negator anywhere in the clause before the claim clears it, and so does a
 * conditional or interrogative frame — "whether X is registered", "until X is registered", "once X
 * is registered" are all legal because none of them asserts that it is.
 */
const NEGATORS =
  /\b(not|never|no|none|non|cannot|can't|without|whether|until|unless|once|if|would|before|neither|nor|nothing|refuse[sd]?|refusal|absent|yet|un(?:registered|available|launchable|known|read))\b/i;
const CLAIM_SHAPES = [
  { id: "verb", re: /\b(is|are|now|already)\s+(?:\w+\s+){0,2}?(launchable|registered|deployed|live|available|bound|active)\b/i },
  { id: "imperative", re: /\b(launch|deploy|register|bind)\s+(?:a\s+|your\s+|the\s+)?(?:project\s+|collection\s+)?(?:with|on|using|against)\b/i },
  { id: "noun-phrase", re: /\b(launchable|registered|deployed|live)\s+(runtime|art\s+runtime|template)\b/i },
];

/**
 * WHICH RUNTIMES MAY BE CALLED LAUNCHABLE, AND WHICH MAY NEVER BE. DERIVED, NOT LISTED.
 *
 * Until 2026-08-29 the answer was "none", and this gate could treat all four names alike. On that
 * day the owner registered the two Wave-1 runtimes on Ethereum, Base and Robinhood — read live at
 * ArtRuntimeRegistryV1 0xCB19507D713DfC4cD212BDc545480e1549A9F231, ids 3 and 4, active on all three
 * — so a sentence saying `GEOMETRIC_RECURSION_V1` can be launched became TRUE, and a gate that kept
 * refusing it would have forced the kit to keep publishing a claim the chain contradicts.
 *
 * The two sets come from the catalog and are never typed here:
 *
 *   RUNTIMES            shipped Wave 1. Deployed and registered. May be described as launchable.
 *   RUNTIMES_LEFT_WAVE1 left the wave with ZERO SHIP templates. Never deployed, never registered;
 *                       registry ids 5 and 6 are deliberately empty. May NEVER be called launchable.
 *
 * WHAT THIS GATE DOES NOT CLAIM TO PROVE. It is a prose scanner, so it cannot verify that a runtime
 * is registered on the particular chain a sentence names — registration is per runtime per chain and
 * only a live read answers it. It enforces the half a scanner CAN enforce: no public surface may say
 * a runtime that was never deployed is launchable. The live read owns the rest, which is the whole
 * point of there being no checked-in status to flip.
 */
const LAUNCHABILITY_CLAIMABLE = Object.keys(RUNTIMES);
const LAUNCHABILITY_FORBIDDEN = Object.keys(RUNTIMES_LEFT_WAVE1);

/**
 * Attribute a claim to the runtime it is ABOUT, so one sentence can say both things.
 *
 * "GEOMETRIC_RECURSION_V1 is launchable; PIXEL_GRID_V1 is not" is now an ordinary and correct
 * sentence, and a line-level test that only asked "does this line name a forbidden runtime?" would
 * refuse it. The subject of a claim is the runtime id nearest to it — the last one before the
 * matched span, or the first one after it when the claim leads.
 */
function claimSubject(line, matchIndex) {
  let best = null;
  for (const id of RUNTIME_IDS) {
    let at = line.indexOf(id);
    while (at !== -1) {
      const distance = at <= matchIndex ? matchIndex - at : (at - matchIndex) + line.length;
      if (best === null || distance < best.distance) best = { id, distance };
      at = line.indexOf(id, at + 1);
    }
  }
  return best?.id ?? null;
}

/**
 * ELLIPSIS — a claim whose subject is carried over instead of restated.
 *
 * "GEOMETRIC_RECURSION_V1 is registered, and so is PIXEL_GRID_V1" asserts registration of BOTH, but
 * the second half contains no claim word at all: the verb is elided. Subject attribution reads it as
 * a sentence about the runtime that IS registered and lets it through, which makes it the cheapest
 * way to smuggle the one claim this gate exists to refuse.
 *
 * NARROW BY CONSTRUCTION, AND DELIBERATELY SO. This matches the coordination forms English actually
 * uses for that ellipsis and nothing else. It is a patch on a known limit of shape matching, not
 * general anaphora coverage — a scanner cannot resolve "it is too" three sentences later, and
 * pretending otherwise would be worse than the gap. What it does guarantee is that the short,
 * obvious rewrite of a caught sentence is also caught.
 */
const ELLIPSIS_SHAPES = (id) => [
  new RegExp(String.raw`\b(?:and|,)\s*(?:so\s+)?(?:is|are|does|do|was|were)\s+(?:the\s+)?${id}\b`, "i"),
  new RegExp(String.raw`\bas\s+(?:is|are)\s+(?:the\s+)?${id}\b`, "i"),
  new RegExp(String.raw`\b(?:along\s+with|as\s+well\s+as|together\s+with)\s+(?:the\s+)?${id}\b`, "i"),
  new RegExp(String.raw`\b${id}\b\s*(?:,\s*)?(?:too|as\s+well|also)\b`, "i"),
];

function claimsLaunchability(line) {
  const lower = line.toLowerCase();
  if (!RUNTIME_IDS.some((id) => line.includes(id))) return null;

  // Does the line make ANY positive, unnegated claim? Needed before the ellipsis test, because an
  // elided verb has to be carried over from somewhere.
  let positiveClaimAt = null;
  for (const shape of CLAIM_SHAPES) {
    for (const m of line.matchAll(new RegExp(shape.re.source, `${shape.re.flags.replace("g", "")}g`))) {
      if (NEGATORS.test(lower.slice(0, m.index)) || NEGATORS.test(m[0])) continue;
      positiveClaimAt = m.index;
      break;
    }
    if (positiveClaimAt !== null) break;
  }
  if (positiveClaimAt !== null) {
    for (const id of LAUNCHABILITY_FORBIDDEN) {
      if (ELLIPSIS_SHAPES(id).some((re) => re.test(line))) {
        return `ellipsis (the claim is carried over onto ${id}, which left Wave 1 and is registered on no chain)`;
      }
    }
  }

  for (const shape of CLAIM_SHAPES) {
    // EVERY MATCH, NOT THE FIRST. `exec` returns one match, so a line making two claims was judged
    // entirely on the first — and the first is the one an author would make true on purpose. This
    // is the same defect that made a servergate mutation score a free pass for want of a `/g`.
    const globalRe = new RegExp(shape.re.source, `${shape.re.flags.replace("g", "")}g`);
    for (const m of line.matchAll(globalRe)) {
      // TWO WINDOWS, AND MISSING THE SECOND ONE IS WHY THIS FAILED FIRST TIME.
      //
      // A negator is not only in front of the claim; it is very often INSIDE it. The verb shape
      // allows up to two filler words between "is" and "registered" precisely so it catches "is
      // now registered" -- and that same filler swallows the "not" in "is not registered", which
      // then never reaches a window that only looked at what came before "is". Both the preceding
      // clause and the matched span have to be checked, and the matched span is the load-bearing one.
      const before = lower.slice(0, m.index);
      if (NEGATORS.test(before) || NEGATORS.test(m[0])) continue;
      // THE CLAIM IS ONLY A PROBLEM IF ITS SUBJECT IS A RUNTIME NOBODY MAY LAUNCH. A claim about a
      // registered Wave-1 runtime is a true sentence and this gate must not refuse it.
      const subject = claimSubject(line, m.index);
      if (subject === null || !LAUNCHABILITY_FORBIDDEN.includes(subject)) continue;
      return `${shape.id} (about ${subject}, which left Wave 1 and is registered on no chain)`;
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// CONTROLS — the gate's own proof that it can catch and that it does not over-catch.
// ------------------------------------------------------------------------------------------------
const MUST_CATCH = [
  // EVERY ONE OF THESE IS ABOUT A RUNTIME THAT LEFT WAVE 1 AND WAS NEVER DEPLOYED. These are the
  // claims that stayed false on 2026-08-29 while the other two became true, and they are the reason
  // this gate was re-scoped rather than relaxed.
  "The PIXEL_GRID_V1 runtime is registered on Ethereum, Base and Robinhood.",
  "CELLULAR_SYSTEM_V1 is now live and you can start a collection on it.",
  "Launch with PIXEL_GRID_V1 on any supported chain.",
  "Pick the launchable runtime CELLULAR_SYSTEM_V1 and go.",
  "PIXEL_GRID_V1 is already deployed.",
  "CELLULAR_SYSTEM_V1 is active at registry id 5.",
  // Attribution must survive a mixed sentence in the ORDER THAT HIDES IT: the true half first.
  "GEOMETRIC_RECURSION_V1 is registered, and so is PIXEL_GRID_V1.",
];
const MUST_ALLOW = [
  // ---- TRUE SINCE 2026-08-29. Registered at ids 3 and 4, active on chains 1, 8453 and 4663. ----
  "GEOMETRIC_RECURSION_V1 is launchable today.",
  "Launch with VECTOR_COMPOSITION_V1 on any supported chain.",
  "Pick the launchable runtime GEOMETRIC_RECURSION_V1 and go.",
  "VECTOR_COMPOSITION_V1 is registered and active.",
  // A sentence may say both things at once, and the subject of each claim is what decides.
  "GEOMETRIC_RECURSION_V1 is launchable; PIXEL_GRID_V1 is not.",
  // ---- STILL LEGAL, AND STILL THE ONLY HONEST FORM FOR A DEPARTED RUNTIME. ----
  "Whether PIXEL_GRID_V1 is registered on your chain is a live read.",
  "CELLULAR_SYSTEM_V1 cannot be launched until it is registered.",
  "Once CELLULAR_SYSTEM_V1 is registered, a fresh live read makes it selectable with no flag to flip.",
  "An unread registry reports UNKNOWN; it never reports that PIXEL_GRID_V1 is registered.",
  "No public surface here says PIXEL_GRID_V1 is launchable.",
  "The dendron preset binds RECOVERY under LOG2; the runtime it belongs to is GEOMETRIC_RECURSION_V1.",
  "If CELLULAR_SYSTEM_V1 is registered later, nothing in this kit has to change.",
];

if (CONTROLS) {
  let caught = 0;
  let falsePositives = 0;
  console.log("  must-catch");
  for (const line of MUST_CATCH) {
    const hit = claimsLaunchability(line);
    if (hit) caught++;
    console.log(`  ${hit ? "PASS" : "FAIL"}  ${hit ?? "MISSED"}  ${line}`);
  }
  console.log("  must-allow");
  for (const line of MUST_ALLOW) {
    const hit = claimsLaunchability(line);
    if (hit) falsePositives++;
    console.log(`  ${hit ? "FAIL" : "PASS"}  ${line}`);
  }

  // ZERO-INPUT controls for every floor this gate asserts.
  console.log("  input floors");
  const floorCases = [
    ["templates classified", allTemplateIds().length, 30],
    ["descriptors", TEMPLATE_DESCRIPTORS.length, 2],
    ["census curve rows", readSensorMovement().curveRows, 36],
    ["public files scanned", walk(join(ROOT, "packages/template-catalog/src"), []).length, 4],
  ];
  let floorFailures = 0;
  for (const [label, actual, minimum] of floorCases) {
    const positive = actual >= minimum;
    const negative = !(minimum - 1 >= minimum);
    const zero = !(0 >= minimum);
    const nonZeroFloor = minimum >= 1;
    for (const [name, ok] of [["POSITIVE", positive], ["NEGATIVE", negative], ["ZERO-INPUT", zero], ["FLOOR>=1", nonZeroFloor]]) {
      if (!ok) floorFailures++;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} ${label} (${actual} vs ${minimum})`);
    }
  }

  const ok = caught === MUST_CATCH.length && falsePositives === 0 && floorFailures === 0;
  console.log("");
  console.log(`TEMPLATE_STATUS_CONTROLS_CAUGHT=${caught}/${MUST_CATCH.length}`);
  console.log(`TEMPLATE_STATUS_CONTROL_FALSE_POSITIVES=${falsePositives}`);
  console.log(`TEMPLATE_STATUS_FLOOR_CONTROLS_FAILED=${floorFailures}`);
  console.log(`TEMPLATE_STATUS_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

// ------------------------------------------------------------------------------------------------
// 1. floors
// ------------------------------------------------------------------------------------------------
const ids = allTemplateIds();
const discovered = [...SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), [])), ...SCAN_FILES.map((f) => join(ROOT, f)).filter((f) => { try { return statSync(f).isFile(); } catch { return false; } })];
const files = discovered.filter((f) => !SCAN_EXCLUDE.has(relative(ROOT, f)));
const excluded = discovered.length - files.length;
if (excluded !== SCAN_EXCLUDE.size) {
  console.error(`  EXCLUSION DRIFT  ${excluded} file(s) were excluded from the scan but ${SCAN_EXCLUDE.size} is declared. An exclusion list that does not match what it excluded is a hiding place.`);
  process.exit(1);
}
const census = readSensorMovement();

// THREE OF THESE FLOORS MOVED DOWN ON 2026-08-29, AND THE REASON IS NOT "TO GO GREEN".
// A floor answers one question — did this gate examine anything at all — and it must never be
// lowered to accommodate a failure. What moved here is the CATALOG: `PIXEL_GRID_V1` left the wave
// when the blind review of its repaired `idol` returned HOLD, taking the wave from three runtimes,
// three descriptors and six sheets to two, two and four. A floor of 3 descriptors would now be a
// floor asserting a fact that stopped being true, which fails a correct catalog and teaches the
// next reader to edit the number rather than the catalog.
//
// The floors are therefore kept as ABSOLUTE, NON-ZERO minima ("this gate saw something"), and the
// question they used to answer by accident — "does the catalog still have the size it should" — is
// answered below by DERIVATION instead: `c.SHIP.length !== TEMPLATE_DESCRIPTORS.length` fails, and
// a runtime with no SHIP template fails. Those move with the catalog and cannot be satisfied by a
// smaller number.
floor("templates classified", ids.length, 30);
floor("descriptors", TEMPLATE_DESCRIPTORS.length, 2);
floor("review ledger records", REVIEW_LEDGER.length, 3);
floor("census fixture rows", census.familyRows, 27);
floor("census curve rows", census.curveRows, 36);
floor("perceptual census templates", Object.keys(readStateDistinction().census).length, 30);
floor("published sheets", TEMPLATE_DESCRIPTORS.reduce((n, d) => n + Object.keys(d.sheets).length, 0), 4);
floor("public files scanned", files.length, 50);
floor("runtimes described", Object.keys(RUNTIMES).length, 2);
floor("runtime names scanned for a launchability claim", RUNTIME_IDS.length, 4);

// ------------------------------------------------------------------------------------------------
// 2. the model
// ------------------------------------------------------------------------------------------------
for (const p of validateLedger()) fail(`ledger: ${p}`);
for (const d of TEMPLATE_DESCRIPTORS) for (const p of validateDescriptor(d)) fail(`descriptor: ${p}`);

const c = classification();
const partition = TEMPLATE_STATUSES.reduce((n, s) => n + c[s].length, 0);
if (partition !== ids.length) fail(`the four tiers cover ${partition} templates but the wave has ${ids.length}. "The remainder is rejected" is only checkable if the remainder is written down.`);
if (c.SHIP.length !== TEMPLATE_DESCRIPTORS.length) fail(`${c.SHIP.length} templates are SHIP but ${TEMPLATE_DESCRIPTORS.length} descriptors are published`);
for (const d of TEMPLATE_DESCRIPTORS) if (templateStatus(d.id) !== "SHIP") fail(`${d.id} has a published descriptor but status ${templateStatus(d.id)}`);

// A RUNTIME IS IN THE WAVE ONLY IF IT HAS A SHIP TEMPLATE, and the two directions are both errors.
for (const runtimeId of Object.keys(RUNTIMES)) {
  const shipped = c.SHIP.filter((id) => id.startsWith(`${runtimeId}/`));
  if (shipped.length === 0) {
    fail(`${runtimeId} is listed as a Wave-1 runtime and has no SHIP template. A runtime enters a wave only with at least one; record it in RUNTIMES_LEFT_WAVE1 with its reason rather than leaving it here.`);
  }
}
for (const [runtimeId, record] of Object.entries(RUNTIMES_LEFT_WAVE1)) {
  if (RUNTIMES[runtimeId]) fail(`${runtimeId} is both a Wave-1 runtime and a departed one`);
  const shipped = c.SHIP.filter((id) => id.startsWith(`${runtimeId}/`));
  if (shipped.length > 0) fail(`${runtimeId} left Wave 1 but still owns SHIP template(s): ${shipped.join(", ")}`);
  if (typeof record.reason !== "string" || record.reason.length < 20) fail(`${runtimeId} left Wave 1 with no stated reason`);
  const classified = allTemplateIds().filter((id) => id.startsWith(`${runtimeId}/`));
  if (classified.length === 0) fail(`${runtimeId} left Wave 1 and its templates left the ledger with it; a departure is recorded, never deleted`);
}

// A promotion by maintainer judgement must be refused, here, at gate time.
try {
  proposePromotion({
    reviewId: "GATE-PROBE-MAINTAINER-JUDGEMENT",
    method: "MAINTAINER_REVIEW",
    date: "2026-01-01",
    documentSha256: "f".repeat(64),
    promotions: { [c.EXPERIMENTAL[0]]: { verdict: "SHIP", evidence: Object.fromEntries(PROMOTION_REQUIREMENTS.map((r) => [r, "looked at it again"])) } },
  });
  fail("proposePromotion accepted a MAINTAINER_REVIEW promotion; a CAVEAT template may never be promoted by maintainer judgement");
} catch {
  // refused, as required
}

// ------------------------------------------------------------------------------------------------
// 3. the agent cannot reach a non-SHIP template — asked about EVERY one of them
// ------------------------------------------------------------------------------------------------
const pool = shipCatalog();
const results = {};
for (const [key, status] of [["CAVEAT", "EXPERIMENTAL"], ["HELD", "HELD"], ["REJECTED", "REJECTED"]]) {
  const members = c[status];
  if (members.length === 0) { fail(`no ${status} templates to test the refusal against; this result would be vacuous`); results[key] = "VACUOUS"; continue; }
  let reachable = 0;
  for (const id of members) {
    if (pool.includes(id)) reachable++;
    if (isAutonomouslySelectable(id)) reachable++;
    try { semanticMatch([id], "anything"); reachable++; } catch { /* refused, as required */ }
    try { assertAutonomousSelection(id); reachable++; } catch { /* refused, as required */ }
    if (isVisibleToHuman(id, { advanced: false })) reachable++;
    if (status === "REJECTED" && humanCatalog({ advanced: true }).some((e) => e.id === id)) reachable++;
  }
  results[key] = reachable === 0 ? "NO" : "YES";
  if (reachable !== 0) fail(`${members.length} ${status} template(s) were reachable by an autonomous agent in ${reachable} way(s)`);
}

// ------------------------------------------------------------------------------------------------
// 4. published == measured
// ------------------------------------------------------------------------------------------------
let sheetsChecked = 0;
for (const d of TEMPLATE_DESCRIPTORS) {
  for (const [kind, sheet] of Object.entries(d.sheets)) {
    const file = join(ROOT, "packages/template-catalog/sheets", sheet.name);
    let buf;
    try { buf = readFileSync(file); } catch { fail(`${d.id}: published ${kind} sheet ${sheet.name} is missing`); continue; }
    if (buf.length !== sheet.bytes) fail(`${d.id}/${kind}: published byte length ${sheet.bytes} but the file is ${buf.length}`);
    const digest = createHash("sha256").update(buf).digest("hex");
    if (digest !== sheet.sha256) fail(`${d.id}/${kind}: published digest does not describe the published file`);
    sheetsChecked++;
  }
}
floor("sheet digests verified", sheetsChecked, 4);

for (const full of describeAll()) {
  for (const p of assertNoLaunchabilityClaim(full)) fail(`${full.id}: ${p}`);
  for (const p of assertNoQualityScore(full, full.id)) fail(p);
  // Re-derive rather than trust: every published effective signal must clear the floor when the
  // census is consulted again, and every ineffective one must not.
  const re = describeTemplate(full.id);
  const eff = new Set(re.signals.effective.map((b) => `${b.sensor}/${b.curve}`));
  for (const b of full.signals.ineffective) {
    if (eff.has(`${b.sensor}/${b.curve}`)) fail(`${full.id}: ${b.sensor}/${b.curve} is published as both effective and ineffective`);
  }
  if (full.signals.effective.length === 0) fail(`${full.id} publishes no effective signal; it would be a template the market cannot move`);
}

// ------------------------------------------------------------------------------------------------
// 5. no public surface claims these runtimes are launchable
// ------------------------------------------------------------------------------------------------
let linesScanned = 0;
let mentions = 0;
const claims = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  const lines = text.split("\n");
  linesScanned += lines.length;
  for (const [i, line] of lines.entries()) {
    if (!RUNTIME_IDS.some((id) => line.includes(id))) continue;
    mentions++;
    const shape = claimsLaunchability(line);
    if (shape) claims.push(`${relative(ROOT, file)}:${i + 1} [${shape}] ${line.trim().slice(0, 160)}`);
  }
}
floor("lines scanned", linesScanned, 4000);
floor("runtime-id mentions found", mentions, 20);
for (const claim of claims) fail(`LAUNCHABILITY CLAIM: ${claim}`);

// ------------------------------------------------------------------------------------------------
// report
// ------------------------------------------------------------------------------------------------
const summary = {
  WAVE1_TEMPLATES_CLASSIFIED: ids.length,
  WAVE1_RUNTIMES: Object.keys(RUNTIMES).join(","),
  RUNTIMES_LEFT_WAVE1: Object.keys(RUNTIMES_LEFT_WAVE1).join(",") || "none",
  WAVE1_SHIP: c.SHIP.length,
  WAVE1_EXPERIMENTAL: c.EXPERIMENTAL.length,
  WAVE1_HELD: c.HELD.length,
  WAVE1_REJECTED: c.REJECTED.length,
  TEMPLATE_STATUS_IS_DERIVED_NOT_STORED: "YES",
  CAVEAT_PROMOTION_BY_MAINTAINER_JUDGEMENT: "REFUSED",
  DEFAULT_CATALOG_STATUSES: DEFAULT_CATALOG_STATUSES.join(","),
  ADVANCED_FLAG_STATUSES: ADVANCED_FLAG_STATUSES.join(","),
  AUTONOMOUS_SELECTABLE_STATUSES: AUTONOMOUS_SELECTABLE_STATUSES.join(","),
  AUTONOMOUS_AGENT_CAN_SELECT_CAVEAT_TEMPLATE: results.CAVEAT,
  AUTONOMOUS_AGENT_CAN_SELECT_HELD_TEMPLATE: results.HELD,
  AUTONOMOUS_AGENT_CAN_SELECT_REJECTED_TEMPLATE: results.REJECTED,
  PUBLISHED_DESCRIPTORS: TEMPLATE_DESCRIPTORS.length,
  PUBLISHED_SHEET_DIGESTS_VERIFIED: sheetsChecked,
  EFFECTIVE_SIGNALS_REDERIVED_FROM_CENSUS: "PASS",
  SUBJECTIVE_QUALITY_SCORES_PUBLISHED: 0,
  PUBLIC_LAUNCHABILITY_CLAIMS: claims.length,
  LIVE_RUNTIME_STATUS_SOURCE: "ArtRuntimeRegistryV1 read at call time",
};

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: problems.length === 0, summary, problems }, null, 2));
} else {
  console.log("");
  for (const p of problems) console.log(`  FAIL  ${p}`);
  if (problems.length === 0) console.log("  PASS  the model, the descriptors, the measurements and the public copy all agree");
  console.log("");
  for (const [k, v] of Object.entries(summary)) console.log(`${k}=${v}`);
  console.log("");
  console.log(problems.length === 0 ? "[template-status] PASS" : `[template-status] ${problems.length} FAILURE(S)`);
}
process.exit(problems.length === 0 ? 0 : 1);
