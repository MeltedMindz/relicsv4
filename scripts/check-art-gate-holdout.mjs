#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE HOLDOUT CLAUSE IS ON THE LAUNCH PATH — DERIVED FROM SOURCE, PROVED BY EXECUTION
// ================================================================================================
//
// THE FINDING THIS GATE EXISTS FOR. `creator-cli`'s `requireArtGate` — the first statement of every
// launch-proving command — called `@relics/art-review`'s `verifyAcceptance`, which contains ZERO
// holdout logic. The holdout clause lives in `@relics/art-direction`'s `verifyArtAcceptance`, and
// NO launch path called it: its only non-test caller was an offline benchmark harness. The
// containment against a final verdict taken on seeds the author had already seen was built,
// tested, documented — and not on the path that gates a launch.
//
// WHY `scripts/check-art-review.mjs` DID NOT CATCH IT, and why this is a separate gate rather than
// a section of that one. Its §6 derives the guarded command set from the pipeline and asserts, by
// regex on the source, that each command's first statement calls `requireArtGate` and returns on
// it. That is a check that A gate is called. It has no opinion on WHAT the gate checks, and it was
// green the entire time. A rule about presence cannot see an absence inside the thing present.
//
// SO THIS GATE ASKS THE OTHER HALF, TWO WAYS:
//
//   DERIVED   the launch gate's module reaches art-direction's `verifyArtAcceptance`, and that
//             function still contains the clause that reads `seedGroups.authorSawHoldout`. Source
//             facts, so a re-point is visible even if nobody runs a test.
//   EXECUTED  the creator-cli holdout suite is RUN, and the named test that plants a COMPROMISED
//             receipt and drives the real CLI must pass. A source rule can show a call exists;
//             only a run shows it decides anything.
//
// `--controls` re-points the launch path back at the holdout-free check, and at three other
// shapes, IN THE REAL FILES. Each mutation asserts it actually changed the bytes — a pattern that
// stops matching scores a free pass otherwise, which has happened in this programme — and each
// must make a SPECIFICALLY NAMED test go red in TAP output. Scoring on a bare test name, or on the
// exit code alone, cannot tell "this control caught it" from "something else broke".
//
//   node scripts/check-art-gate-holdout.mjs
//   node scripts/check-art-gate-holdout.mjs --controls
// ================================================================================================
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTROLS = process.argv.includes("--controls");

const GATE_SRC = join(ROOT, "packages", "creator-cli", "src", "commands", "agent-art.js");
const CLAUSE_SRC = join(ROOT, "packages", "art-direction", "src", "acceptance.js");
const REVIEW_SRC = join(ROOT, "packages", "art-review", "src", "receipt.js");
const SUITE = join(ROOT, "packages", "creator-cli", "test", "art-gate-holdout.test.mjs");

const problems = [];
const fail = (m) => problems.push(m);

/** Absence of input is not success: this gate reads four files and refuses a hollow one. */
function readFloored(path, minBytes) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    fail(`INPUT_FLOOR_TRIPPED ${path.replace(ROOT, ".")}: unreadable (${err.message})`);
    return "";
  }
  if (text.length < minBytes) fail(`INPUT_FLOOR_TRIPPED ${path.replace(ROOT, ".")}: ${text.length} bytes, floor ${minBytes}`);
  return text;
}

/**
 * THE NAMED TEST EVERY MUTATION MUST BREAK.
 *
 * Named here rather than inferred, because "some test went red" is what a collateral break looks
 * like too. TAP prints `not ok <n> - <name>` for a failure, and that exact line is the marker.
 */
const NAMED = {
  compromised: "A COMPROMISED HOLDOUT IS REFUSED BY THE LAUNCH GATE, not merely by the standalone verifier",
  unmeasured: "an UNMEASURED holdout is refused too — an unread fact is never an agreeing fact",
  cli: "THE REAL CLI REFUSES: `agent prepare` exits BLOCKED on a compromised holdout",
  clean: "and it is not simply stuck red: a HELD holdout still passes the launch gate",
};

function runSuite() {
  const r = spawnSync("node", ["--test", "--test-reporter=tap", SUITE], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const failed = new Set([...out.matchAll(/^not ok \d+ - (.+?)\s*$/gm)].map((m) => m[1].trim()));
  const passed = new Set([...out.matchAll(/^ok \d+ - (.+?)\s*$/gm)].map((m) => m[1].trim()));
  return { code: r.status, out, failed, passed };
}

// ================================================================================================
// CONTROLS — mutate the real files, require a NAMED test red, restore
// ================================================================================================
const MUTATIONS = [
  {
    id: "repoint-the-launch-gate-at-the-holdout-free-check",
    why: "the exact defect: `requireArtAccepted` answers on art-review alone and never consults the clause",
    file: GATE_SRC,
    find: "  const holdout = await artDirectionAcceptance(workspace, art, briefText);",
    replace: '  const holdout = { ok: true, present: false, reasonCode: "ART_DIRECTION_RECEIPT_ABSENT" };',
    expectFail: [NAMED.compromised, NAMED.cli, NAMED.unmeasured],
  },
  {
    id: "swallow-the-art-direction-refusal",
    why: "the clause is consulted and its answer is discarded — a guard computed and not returned on",
    file: GATE_SRC,
    find: "  if (!holdout.ok) {",
    replace: "  if (false) {",
    expectFail: [NAMED.compromised, NAMED.cli, NAMED.unmeasured],
  },
  {
    id: "delete-the-holdout-clause-itself",
    why: "the clause stops refusing, so the wiring above it is wiring to nothing",
    file: CLAUSE_SRC,
    find: "  if (sawHoldout !== false) {",
    replace: "  if (false) {",
    expectFail: [NAMED.compromised, NAMED.cli, NAMED.unmeasured],
  },
  {
    id: "treat-an-unmeasured-holdout-as-held",
    why: "an unread fact quietly becomes an agreeing fact — the three-valued clause collapsed to two",
    file: CLAUSE_SRC,
    find: "  const sawHoldout = r.seedGroups?.authorSawHoldout;",
    replace: "  const sawHoldout = r.seedGroups?.authorSawHoldout ?? false;",
    expectFail: [NAMED.unmeasured],
  },
];

if (CONTROLS) {
  console.log("art-gate holdout — mutation controls\n");
  const originals = new Map();
  for (const m of MUTATIONS) if (!originals.has(m.file)) originals.set(m.file, readFileSync(m.file, "utf8"));

  // BASELINE FIRST. A battery that never saw green cannot tell a caught mutation from a suite that
  // was already red.
  const baseline = runSuite();
  console.log(`  BASELINE  ${baseline.code === 0 ? "GREEN" : `RED (exit ${baseline.code})`}  ${baseline.passed.size} passed, ${baseline.failed.size} failed`);
  if (baseline.code !== 0) {
    for (const f of baseline.failed) console.log(`            still red: ${f}`);
    console.log("ART_GATE_HOLDOUT_CONTROLS=FAIL");
    process.exit(1);
  }
  for (const name of Object.values(NAMED)) {
    if (!baseline.passed.has(name)) fail(`the named test "${name}" is not in the baseline suite — a mutation scored against a test that does not run proves nothing`);
  }

  let caught = 0;
  let stale = 0;
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    if (!original.includes(m.find)) {
      stale++;
      console.log(`  THREW     ${m.id}: its pattern no longer matches ${m.file.replace(ROOT, ".")} — a mutation that changes nothing scores nothing`);
      continue;
    }
    const mutated = original.replace(m.find, m.replace);
    if (mutated === original) {
      stale++;
      console.log(`  THREW     ${m.id}: replacement is byte-identical to the source`);
      continue;
    }
    writeFileSync(m.file, mutated);
    let r;
    try {
      r = runSuite();
    } finally {
      writeFileSync(m.file, original);
    }
    const named = m.expectFail.filter((n) => r.failed.has(n));
    const ok = named.length > 0;
    if (ok) caught++;
    else fail(`mutation "${m.id}" SURVIVED: no named test went red (observed ${[...r.failed].join(" | ") || "nothing red"})`);
    console.log(`  ${ok ? "CAUGHT  " : "SURVIVED"}  ${m.id}`);
    console.log(`            ${m.why}`);
    console.log(`            ${ok ? `named test(s) red: ${named.join(" | ")}` : `expected one of: ${m.expectFail.join(" | ")}`}`);
  }

  // THE FILES MUST BE EXACTLY AS FOUND.
  let restored = true;
  for (const [file, original] of originals) if (readFileSync(file, "utf8") !== original) { restored = false; fail(`${file} was not restored after mutation`); }

  const pass = problems.length === 0 && caught === MUTATIONS.length && stale === 0 && restored;
  console.log("");
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`ART_GATE_HOLDOUT_MUTATIONS_CAUGHT=${caught}/${MUTATIONS.length}`);
  console.log(`ART_GATE_HOLDOUT_MUTATIONS_STALE=${stale}`);
  console.log(`ART_GATE_HOLDOUT_SOURCE_RESTORED=${restored ? "YES" : "NO"}`);
  console.log(`ART_GATE_HOLDOUT_CONTROLS=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}

// ================================================================================================
// 1. DERIVED — the launch gate reaches the clause, and the clause is still a clause
// ================================================================================================
const gateSrc = readFloored(GATE_SRC, 4000);
const clauseSrc = readFloored(CLAUSE_SRC, 4000);
const reviewSrc = readFloored(REVIEW_SRC, 2000);
readFloored(SUITE, 4000);

if (!/verifyArtAcceptance/.test(gateSrc)) {
  fail("the launch gate module never names verifyArtAcceptance. It is answering on art-review alone, which contains no holdout logic — this is the defect, restored.");
}
if (!/artDirection\(\)/.test(gateSrc) || !/art-direction\/src\/acceptance\.js/.test(gateSrc)) {
  fail("the launch gate module does not load @relics/art-direction's acceptance module");
}
if (!/const holdout = await artDirectionAcceptance\(/.test(gateSrc) || !/if \(!holdout\.ok\) \{/.test(gateSrc)) {
  fail("requireArtAccepted does not call the art-direction check AND RETURN on its answer. A guard whose result is computed and discarded is decoration.");
}
if (!/authorSawHoldout/.test(clauseSrc) || !/FINAL_REVIEW_HOLDOUT_COMPROMISED/.test(clauseSrc)) {
  fail("art-direction's acceptance no longer carries the holdout clause");
}
if (/authorSawHoldout/.test(reviewSrc)) {
  fail("art-review's receipt now mentions authorSawHoldout — two implementations of one clause agree until the day they do not, and on that day one of them is gating a launch");
}
// THE ABSENT CASE MUST BE NAMED, not silent. A gate that says nothing about what it did not check
// reads exactly like a gate that checked.
if (!/ART_DIRECTION_RECEIPT_ABSENT/.test(gateSrc)) {
  fail("the launch gate has no named state for a missing art-direction receipt");
}

// ================================================================================================
// 2. EXECUTED — the suite runs, and the named tests are among the ones that passed
// ================================================================================================
const run = runSuite();
if (run.passed.size + run.failed.size < 5) {
  fail(`INPUT_FLOOR_TRIPPED executed tests: ${run.passed.size + run.failed.size} test(s) ran, floor 5. A suite that executes nothing proves nothing.`);
}
for (const [key, name] of Object.entries(NAMED)) {
  if (!run.passed.has(name)) fail(`the named ${key} test did not pass: "${name}"${run.failed.has(name) ? " (RED)" : " (absent from the run)"}`);
}
if (run.code !== 0) fail(`the holdout suite exited ${run.code}`);

// ================================================================================================
// REPORT
// ================================================================================================
console.log("");
for (const p of problems) console.log(`  FAIL  ${p}`);
console.log("");
console.log(`LAUNCH_GATE_CONSULTS_HOLDOUT_CLAUSE=${/const holdout = await artDirectionAcceptance\(/.test(gateSrc) ? "YES" : "NO"}`);
console.log(`HOLDOUT_CLAUSE_IMPLEMENTATIONS=1`);
console.log(`HOLDOUT_SUITE_TESTS_EXECUTED=${run.passed.size + run.failed.size}`);
console.log(`HOLDOUT_SUITE_TESTS_PASSED=${run.passed.size}`);
console.log(`ART_GATE_HOLDOUT=${problems.length === 0 ? "PASS" : "FAIL"}`);
process.exit(problems.length === 0 ? 0 : 1);
