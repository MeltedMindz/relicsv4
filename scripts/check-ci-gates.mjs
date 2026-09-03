#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE CI-COVERAGE GATE — does the gate a document promises actually run, and can it be skipped?
//
//   node scripts/check-ci-gates.mjs             # human output, non-zero exit on any failure
//   node scripts/check-ci-gates.mjs --json      # machine output
//   node scripts/check-ci-gates.mjs --controls  # prove this checker can fail
//
// WHY THIS EXISTS
//
// Two failures, both real, both found in review rather than by a machine:
//
//   1. `forge fmt --check` was the FIRST step of the `foundry` job. It exited 1. A failed step
//      aborts the rest of its job, so `forge build --sizes` and `forge test` never ran — which
//      means the EIP-170 renderer-size assertion was not executing in CI at all. Contracts were
//      green by never being tested. Nothing reported this, because a step that never runs
//      produces no output, and no output reads exactly like no problem.
//
//   2. Documents listed gates that no workflow invoked. A README paragraph saying "all of these
//      run in CI" is not a fact about CI; it is a hope about CI. `kit:gates:selftest` — the
//      meta-gate that proves every other gate can fail — was invoked by no workflow at all.
//
// So this file asserts two things a human reviewer would otherwise have to notice:
//
//   COVERAGE   — every gate named in REQUIRED_GATES is invoked by the workflow and job named.
//   REACHABILITY — a gate that must not be skippable is either the first step of its job or
//                  carries `if: always()`, so an earlier step's failure cannot silently skip it.
//
// WHY A HAND-ROLLED PARSER. The kit has zero dependencies, deliberately and testably, and adding
// a YAML library to check YAML would be the first one. The parser below therefore reads the exact
// indentation convention these four workflows use, and REFUSES rather than reporting a pass if a
// file does not match it — a parser that silently reads nothing is the same absence-as-success bug
// this gate exists to catch.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

/**
 * The gates that must run, where they must run, and whether an earlier failure may skip them.
 *
 * `needle` is matched against the step's whole text (its `name`, `run` and `if`), so a step is
 * found by what it DOES rather than by what it is called.
 *
 * `notSkippable: true` means this gate is the reason the job exists. If a formatting nit can stop
 * it running, it is not a gate.
 */
const REQUIRED_GATES = [
  // --- contracts ---
  { id: "FORGE_FMT", workflow: "contracts.yml", job: "format", needle: "forge fmt --check" },
  { id: "FORGE_BUILD_SIZES", workflow: "contracts.yml", job: "foundry", needle: "forge build --sizes", notSkippable: true },
  { id: "FORGE_TEST", workflow: "contracts.yml", job: "foundry", needle: "forge test -vvv", notSkippable: true },
  // The EIP-170 assertion is the one contract gate whose absence is invisible: `forge test
  // --match-test <name-that-does-not-exist>` exits 0 and prints "No tests found in project!", so a
  // renamed or deleted size test would leave CI green. It gets its own step, and that step asserts
  // the test RAN rather than trusting the exit code.
  { id: "EIP170_SIZE_GATE", workflow: "contracts.yml", job: "foundry", needle: "test_runtimeSizeUnderEip170", notSkippable: true },
  { id: "SECRET_SCAN_GITLEAKS", workflow: "contracts.yml", job: "secret-scan", needle: "gitleaks" },
  { id: "SECRET_SCAN_SCRIPT", workflow: "contracts.yml", job: "secret-scan", needle: "npm run secrets:scan" },

  // --- another project's identity never reaches this tree ---
  { id: "RESERVED_TERMS_CONTROLS", workflow: "reserved-terms.yml", job: "reserved-terms", needle: "check-reserved-terms.mjs --controls" },
  { id: "RESERVED_TERMS_SCAN", workflow: "reserved-terms.yml", job: "reserved-terms", needle: "node scripts/check-reserved-terms.mjs", notSkippable: true },

  // --- the documentation cannot drift from the declaration ---
  { id: "LAUNCH_PROTECTION_CONTROLS", workflow: "launch-protection.yml", job: "launch-protection", needle: "check-launch-protection.mjs --controls" },
  { id: "LAUNCH_PROTECTION_GATE", workflow: "launch-protection.yml", job: "launch-protection", needle: "node scripts/check-launch-protection.mjs", notSkippable: true },

  // --- the creator kit ---
  { id: "KIT_TEST", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:test" },
  { id: "KIT_TEMPLATES", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:templates" },
  { id: "KIT_LIFECYCLE", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:lifecycle" },
  { id: "KIT_README", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:readme" },
  { id: "KIT_ECONOMICS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:economics" },
  { id: "KIT_PARITY", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:parity" },
  { id: "EXPORT_MANIFEST", workflow: "creator-kit.yml", job: "kit", needle: "npm run export:manifest:check" },
  // README.md tells a reader to run `kit:status` for the live launch state. If CI never runs it,
  // the command a document points at is unproven.
  { id: "KIT_STATUS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:status" },
  // The meta-gate: it proves every other gate can fail. It ran nowhere.
  { id: "TEMPLATE_CATALOG_TESTS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:templatecatalog" },
  // THE MUTATION RUN, not merely the test run. The three AUTONOMOUS_AGENT_CAN_SELECT_* results are
  // claims about guards, and a guard that has never been watched failing is a claim about nothing.
  { id: "TEMPLATE_CATALOG_MUTATE", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:templatecatalog:mutate" },
  { id: "SELECTOR_BLIND_CORPUS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:selectorblind" },
  { id: "SELECTOR_BLIND_CONTROLS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:selectorblind:controls" },
  { id: "ART_REVIEW", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:artreview" },
  { id: "ART_REVIEW_CONTROLS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:artreview:controls" },
  { id: "ART_REVIEW_TESTS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:artreview:test" },
  // The art-direction layer ran in no workflow at all until this was added — the brief-admission
  // gate, the mechanism vocabulary and the direction schema were all enforced by nothing.
  { id: "ART_DIRECTION_TESTS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:artdirection" },
  // The holdout containment and the receipt gate. Both findings were "the mechanism exists and
  // nothing runs it": the containment API had zero production callers, and twenty-four committed
  // receipts were read by no gate, no workflow and no CLI. Wiring them here is half the repair.
  { id: "HOLDOUT_CONTAINMENT_TESTS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:holdout" },
  { id: "ART_RECEIPTS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:artreceipts" },
  { id: "ART_RECEIPTS_CONTROLS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:artreceipts:controls" },
  { id: "TEMPLATE_STATUS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:templatestatus" },
  { id: "TEMPLATE_STATUS_CONTROLS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:templatestatus:controls" },
  { id: "KIT_GATES_SELFTEST", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:gates:selftest" },
  { id: "LAUNCH_CLAIMS", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:launch-claims" },
  { id: "TRAIT_DISCLOSURE", workflow: "creator-kit.yml", job: "kit", needle: "npm run kit:traits" },
  { id: "CI_COVERAGE_SELF", workflow: "creator-kit.yml", job: "kit", needle: "npm run ci:gates" },
  // The Wave-1 election, decoded out of the final calldata, plus the mutations that must turn it
  // red. Registered so the step cannot quietly leave the workflow; a SKIPPED run of it is still not
  // a pass, and the harness reports that itself rather than relying on this list to say so.
  { id: "WAVE1_RUNTIME_E2E_CONTROLS", workflow: "autonomous-launch.yml", job: "launch-semantics", needle: "npm run e2e:wave1:controls" },
  // The full MODE B rehearsal and the crash-resume proof. Registered for the same reason and after
  // a sharper lesson: neither ran anywhere, and `e2e:autonomous` was failing at SIGNED on a fresh
  // clone — it wrote no authorization while the signer server requires one — with nothing to say so.
  { id: "AUTONOMOUS_FULL_LAUNCH_E2E", workflow: "autonomous-launch.yml", job: "launch-semantics", needle: "npm run e2e:autonomous" },
  { id: "BROADCAST_CRASH_RESUME_E2E", workflow: "autonomous-launch.yml", job: "launch-semantics", needle: "npm run e2e:resume" },

  // --- docs ---
  { id: "DOC_LINKS", workflow: "docs.yml", job: "links", needle: "npm run docs:links" },
  { id: "DOC_ASSETS", workflow: "docs.yml", job: "links", needle: "npm run docs:assets:check" },
];

/** `if:` values that survive an earlier step's failure. */
const ALWAYS_RE = /always\(\)|!\s*cancelled\(\)/;

/**
 * Parse one workflow into `{ job: [{ text, isFirst, alwaysRuns }] }`.
 *
 * Convention, enforced: `jobs:` at column 0, a job name at 2, `steps:` at 4, each step's `- ` at 6.
 * A file that does not match throws, so this cannot report a pass on a file it failed to read.
 */
function parseWorkflow(name, text) {
  const lines = text.split(/\r?\n/);
  if (!lines.some((l) => l === "jobs:")) throw new Error(`${name}: no top-level "jobs:" key`);

  const jobs = {};
  let job = null;
  let inSteps = false;
  let step = null;
  // `on:` also carries two-space keys (`push:`, `pull_request:`). Nothing counts as a job until
  // the `jobs:` mapping has actually opened.
  let seenJobsKey = false;

  const closeStep = () => {
    if (job && step) jobs[job].push(step);
    step = null;
  };

  for (const line of lines) {
    if (line === "jobs:") {
      seenJobsKey = true;
      continue;
    }
    if (!seenJobsKey) continue;
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch && !inSteps) {
      closeStep();
      job = jobMatch[1];
      jobs[job] = [];
      continue;
    }
    if (job === null) continue;
    // A new job header can also follow a steps block.
    if (jobMatch && /^ {2}\S/.test(line)) {
      closeStep();
      inSteps = false;
      job = jobMatch[1];
      jobs[job] = [];
      continue;
    }
    if (/^ {4}steps:\s*$/.test(line)) {
      closeStep();
      inSteps = true;
      continue;
    }
    if (!inSteps) continue;
    if (/^ {6}- /.test(line)) {
      closeStep();
      step = { text: line };
      continue;
    }
    if (step && (/^ {8}/.test(line) || line.trim() === "")) {
      step.text += "\n" + line;
      continue;
    }
    if (/^ {4}\S/.test(line)) {
      closeStep();
      inSteps = false;
    }
  }
  closeStep();

  for (const [name_, steps] of Object.entries(jobs)) {
    steps.forEach((s, i) => {
      s.isFirst = i === 0;
      const ifLine = /^\s*if:\s*(.*)$/m.exec(s.text);
      s.alwaysRuns = Boolean(ifLine && ALWAYS_RE.test(ifLine[1]));
      s.job = name_;
    });
  }
  return jobs;
}

/** @returns {{rule:string, gate:string, message:string}[]} */
function evaluate(workflows) {
  const failures = [];
  for (const gate of REQUIRED_GATES) {
    const jobs = workflows[gate.workflow];
    if (!jobs) {
      failures.push({ rule: "WORKFLOW_MISSING", gate: gate.id, message: `.github/workflows/${gate.workflow} does not exist` });
      continue;
    }
    const steps = jobs[gate.job];
    if (!steps) {
      failures.push({ rule: "JOB_MISSING", gate: gate.id, message: `${gate.workflow} has no job "${gate.job}" (jobs: ${Object.keys(jobs).join(", ")})` });
      continue;
    }
    const found = steps.filter((s) => s.text.includes(gate.needle));
    if (found.length === 0) {
      failures.push({
        rule: "GATE_NOT_INVOKED",
        gate: gate.id,
        message: `no step of ${gate.workflow}:${gate.job} runs \`${gate.needle}\`. A gate a document promises and CI does not run is a claim, not a control.`,
      });
      continue;
    }
    if (!gate.notSkippable) continue;
    const reachable = found.some((s) => s.isFirst || s.alwaysRuns);
    if (!reachable) {
      failures.push({
        rule: "GATE_SKIPPABLE",
        gate: gate.id,
        message:
          `\`${gate.needle}\` runs in ${gate.workflow}:${gate.job} but an earlier step's failure would skip it. ` +
          `Add \`if: always()\` to that step, or move the gate to a job of its own. This is exactly how the ` +
          `EIP-170 size gate stopped running: a formatting nit aborted the job before it.`,
      });
    }
  }
  return failures;
}

function loadWorkflows() {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  // INPUT FLOOR. Absence of input is not success.
  if (files.length < 4) throw new Error(`only ${files.length} workflow files found — refusing rather than reporting a pass this did not earn.`);
  const out = {};
  for (const f of files) out[f] = parseWorkflow(f, readFileSync(join(WORKFLOWS, f), "utf8"));
  return out;
}

if (CONTROLS) {
  // A checker nobody has watched fail is decorative. Each mutation is applied to an in-memory copy
  // of the real workflows and must be caught.
  const base = loadWorkflows();
  const baseFailures = evaluate(base);
  const clone = () => JSON.parse(JSON.stringify(base));

  const mutations = [
    {
      name: "gate deleted from the job",
      apply: (w) => {
        w["contracts.yml"].foundry = w["contracts.yml"].foundry.filter((s) => !s.text.includes("test_runtimeSizeUnderEip170"));
      },
      expect: "GATE_NOT_INVOKED",
    },
    {
      name: "size gate loses its always() and sits behind another step",
      apply: (w) => {
        for (const s of w["contracts.yml"].foundry) {
          if (s.text.includes("forge build --sizes")) {
            s.alwaysRuns = false;
            s.isFirst = false;
          }
        }
      },
      expect: "GATE_SKIPPABLE",
    },
    {
      name: "the whole job disappears",
      apply: (w) => {
        delete w["reserved-terms.yml"]["reserved-terms"];
      },
      expect: "JOB_MISSING",
    },
    {
      name: "the whole workflow disappears",
      apply: (w) => {
        delete w["launch-protection.yml"];
      },
      expect: "WORKFLOW_MISSING",
    },
    {
      name: "the meta-gate stops being invoked",
      apply: (w) => {
        w["creator-kit.yml"].kit = w["creator-kit.yml"].kit.filter((s) => !s.text.includes("npm run kit:gates:selftest"));
      },
      expect: "GATE_NOT_INVOKED",
    },
  ];

  let caught = 0;
  for (const m of mutations) {
    const w = clone();
    m.apply(w);
    const got = evaluate(w);
    const newRules = got.filter((f) => !baseFailures.some((b) => b.gate === f.gate && b.rule === f.rule)).map((f) => f.rule);
    if (newRules.includes(m.expect)) caught += 1;
    else console.error(`  control NOT caught: ${m.name} (expected ${m.expect}, got ${newRules.join(",") || "nothing"})`);
  }

  // Must not pass on zero input: an empty workflow set has to refuse, not agree.
  let refusedEmpty = false;
  try {
    evaluate({});
    refusedEmpty = evaluate({}).length === REQUIRED_GATES.length;
  } catch {
    refusedEmpty = true;
  }

  console.log(`CI_GATE_CONTROLS_CAUGHT=${caught}/${mutations.length}`);
  console.log(`CI_GATE_CONTROL_EMPTY_INPUT_FAILS=${refusedEmpty ? "yes" : "NO"}`);
  const ok = caught === mutations.length && refusedEmpty;
  console.log(`CI_GATE_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

const workflows = loadWorkflows();
const failures = evaluate(workflows);
const pass = failures.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ CI_GATE_COVERAGE: pass ? "PASS" : "FAIL", required: REQUIRED_GATES.length, failures }, null, 2));
} else {
  console.log(`ci-gate coverage: ${REQUIRED_GATES.length} required gates across ${Object.keys(workflows).length} workflows`);
  for (const f of failures) console.error(`  ${f.rule}  ${f.gate}\n      ${f.message}`);
  console.log(`REQUIRED_CI_GATES=${REQUIRED_GATES.length}`);
  console.log(`CI_GATES_NOT_RUNNING=${failures.length}`);
  console.log(`CI_GATE_COVERAGE=${pass ? "PASS" : "FAIL"}`);
}

process.exit(pass ? 0 : 1);
