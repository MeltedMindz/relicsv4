#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MUTATION HARNESS — a guard never shown to fail is not evidence.
//
// This project has already shipped a control suite that reported `NEGATIVE_CONTROLS=10/10` by
// counting `CONTROL <n>` matches in a test file's TEXT. It counted comments. The only thing that
// distinguishes a working guard from a decorative one is breaking it and watching a NAMED test go
// red, so that is what this does:
//
//   1. BASELINE. Every test must pass before anything is mutated. A suite that is already red
//      cannot prove that a mutation turned it red.
//   2. For each mutation: apply it, and ASSERT THE SOURCE ACTUALLY CHANGED. A replacement whose
//      pattern no longer matches is scored as a FAILURE of this harness, never as a survived
//      mutation — that is exactly how one gate in this project scored a free pass for two weeks
//      after a list it anchored on grew a new last element.
//   3. Run the suite and require the NAMED test(s) that mutation targets to fail.
//   4. Restore, byte for byte, and verify the restore.
//
// Run: node test/mutate.mjs
// ================================================================================================

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = (f) => join(PKG, "src", f);

/**
 * Every mutation. `edits` is a list of exact string replacements; every one of them must match, or
 * the harness fails rather than scoring the mutation.
 */
const MUTATIONS = [
  {
    id: "M01 agent may select EXPERIMENTAL",
    file: SRC("status.js"),
    edits: [['export const AUTONOMOUS_SELECTABLE_STATUSES = Object.freeze(["SHIP"]);', 'export const AUTONOMOUS_SELECTABLE_STATUSES = Object.freeze(["SHIP", "EXPERIMENTAL"]);']],
    mustFail: ["AUTONOMOUS_AGENT_CAN_SELECT_CAVEAT_TEMPLATE=NO"],
  },
  {
    id: "M02 agent may select HELD",
    file: SRC("status.js"),
    edits: [['export const AUTONOMOUS_SELECTABLE_STATUSES = Object.freeze(["SHIP"]);', 'export const AUTONOMOUS_SELECTABLE_STATUSES = Object.freeze(["SHIP", "HELD"]);']],
    mustFail: ["AUTONOMOUS_AGENT_CAN_SELECT_HELD_TEMPLATE=NO"],
  },
  {
    id: "M03 agent may select REJECTED",
    file: SRC("status.js"),
    edits: [['export const AUTONOMOUS_SELECTABLE_STATUSES = Object.freeze(["SHIP"]);', 'export const AUTONOMOUS_SELECTABLE_STATUSES = Object.freeze(["SHIP", "REJECTED"]);']],
    mustFail: ["AUTONOMOUS_AGENT_CAN_SELECT_REJECTED_TEMPLATE=NO"],
  },
  {
    id: "M04 the pool is every template, not the SHIP ones",
    file: SRC("select.js"),
    edits: [[
      'const ship = new Set(templatesWithStatus("SHIP"));\n  return Object.freeze(\n    TEMPLATE_DESCRIPTORS.filter((d) => ship.has(d.id) && isAutonomouslySelectable(d.id)).map((d) => d.id),\n  );',
      "return Object.freeze(allTemplateIds());",
    ]],
    mustFail: [
      "the pool is SHIP and only SHIP, and every member has a descriptor",
      "AUTONOMOUS_AGENT_CAN_SELECT_CAVEAT_TEMPLATE=NO",
      "AUTONOMOUS_AGENT_CAN_SELECT_HELD_TEMPLATE=NO",
      "AUTONOMOUS_AGENT_CAN_SELECT_REJECTED_TEMPLATE=NO",
    ],
  },
  {
    id: "M05 the matcher scores whatever it is handed",
    file: SRC("select.js"),
    edits: [[
      "  for (const id of candidateIds) {\n    if (!isAutonomouslySelectable(id)) {\n      throw new Error(\n        `semanticMatch refused a ${templateStatus(id)} template (${id}). Only ${AUTONOMOUS_SELECTABLE_STATUSES.join(\", \")} may reach the matcher; the tier filter runs BEFORE the match, not after it.`,\n      );\n    }\n  }\n",
      "",
    ]],
    mustFail: [
      "AUTONOMOUS_AGENT_CAN_SELECT_CAVEAT_TEMPLATE=NO",
      "AUTONOMOUS_AGENT_CAN_SELECT_HELD_TEMPLATE=NO",
      "AUTONOMOUS_AGENT_CAN_SELECT_REJECTED_TEMPLATE=NO",
    ],
  },
  {
    id: "M06 the final selection assertion is a pass-through",
    file: SRC("select.js"),
    edits: [[
      "export function assertAutonomousSelection(templateId) {\n  if (!isAutonomouslySelectable(templateId)) {",
      "export function assertAutonomousSelection(templateId) {\n  if (false) {",
    ]],
    mustFail: ["the final selection assertion refuses every tier below SHIP"],
  },
  {
    id: "M07 the capability filter keeps everything",
    file: SRC("select.js"),
    edits: [['if (answer.state === "ACTIVE") kept.push(id);', "if (true) kept.push(id);"]],
    mustFail: [
      "an INACTIVE or UNKNOWN runtime removes its templates from the pool",
      "an unread registry is UNKNOWN and refuses a selection; it is never NOT_REGISTERED",
    ],
  },
  {
    id: "M08 an unread registry is reported as NOT_REGISTERED",
    file: SRC("select.js"),
    edits: [[
      'const unknownAll = (detail) => Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ state: "UNKNOWN", detail })])));',
      'const unknownAll = (detail) => Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ state: "NOT_REGISTERED", detail })])));',
    ]],
    mustFail: ["an unread registry is UNKNOWN and refuses a selection; it is never NOT_REGISTERED"],
  },
  {
    id: "M09 runtime identity is matched on the label alone",
    file: SRC("select.js"),
    edits: [[
      '      if (String(e.tag ?? "").toLowerCase() !== expectedTag) return false;\n      return Number(e.mode) === RUNTIMES[id].artRuntimeMode;',
      "      return true;",
    ]],
    mustFail: ["identity is label AND tag AND mode; a lookalike entry is not the runtime"],
  },
  {
    id: "M10 SHIP WITH CAVEAT maps to SHIP",
    file: SRC("status.js"),
    edits: [['  SHIP_WITH_CAVEAT: "EXPERIMENTAL",', '  SHIP_WITH_CAVEAT: "SHIP",']],
    mustFail: [
      "the Wave-1 classification is 7 / 4 / 6 / 18, and the tiers partition the whole wave",
      "the frozen SHIP set is exactly the seven the owner decided",
    ],
  },
  {
    id: "M11 a promotion need not be blind",
    file: SRC("status.js"),
    edits: [['  if (p.method !== "BLIND_VISUAL") {', "  if (false) {"]],
    mustFail: ["PROMOTION BY MAINTAINER JUDGEMENT IS REFUSED"],
  },
  {
    id: "M12 the four promotion requirements are not checked",
    file: SRC("status.js"),
    edits: [[
      "    for (const requirement of PROMOTION_REQUIREMENTS) {\n      const value = evidence[requirement];\n      if (typeof value !== \"string\" || value.trim().length < 8) {\n        problems.push(`${id}: promotion requirement ${requirement} is missing. All four are required: ${PROMOTION_REQUIREMENTS.join(\", \")}.`);\n      }\n    }\n",
      "",
    ]],
    mustFail: ["each of the four promotion requirements is individually required"],
  },
  {
    id: "M13 a hand-written upgrade needs no evidence",
    file: SRC("status.js"),
    edits: [[
      "      if (!evidence) {\n        problems.push(`${record.reviewId}/${id}: upgraded ${before.verdict} -> ${entry.verdict} with no promotionEvidence. This is promotion by maintainer judgement, which is refused.`);\n        continue;\n      }",
      "      if (!evidence) continue;",
    ]],
    mustFail: ["validateLedger refuses a hand-written upgrade with no promotion evidence"],
  },
  {
    id: "M14 the effective-signal floor is lowered to make a dead binding look alive",
    file: SRC("signals.js"),
    edits: [["export const EFFECTIVE_SIGNAL_FLOOR_PER_MILLE = 200;", "export const EFFECTIVE_SIGNAL_FLOOR_PER_MILLE = 1;"]],
    mustFail: [
      "idol's EPOCH binding is published as INEFFECTIVE, with its measured reason",
      "the four measured-dead readings the census names really are refused",
    ],
  },
  {
    id: "M15 the quality-score guard passes everything",
    file: SRC("descriptors.js"),
    edits: [["  const problems = [];\n  const walk = (node, at) => {", "  const problems = [];\n  if (true) return problems;\n  const walk = (node, at) => {"]],
    mustFail: ["no subjective numeric quality score is published anywhere"],
  },
  {
    id: "M16 the launchability guard passes everything",
    file: SRC("status.js"),
    edits: [[
      'const forbidden = ["launchable", "active", "registered", "deployed", "address", "runtimeAddress", "codeHash", "chains", "chainIds", "chainId"];',
      "const forbidden = [];",
    ]],
    mustFail: ["no descriptor claims a runtime is registered, active, deployed or launchable"],
  },
  {
    id: "M17 the advanced tier is open by default",
    file: SRC("status.js"),
    edits: [[
      "export function isVisibleToHuman(templateId, { advanced = false } = {}, ledger = REVIEW_LEDGER) {",
      "export function isVisibleToHuman(templateId, { advanced = true } = {}, ledger = REVIEW_LEDGER) {",
    ]],
    mustFail: ["visibility: SHIP by default, EXPERIMENTAL and HELD only with the flag, REJECTED never"],
  },
  {
    id: "M18 the advanced flag hands out full starting points",
    file: SRC("select.js"),
    edits: [[
      "    .map((id) => describeUnshippedTemplate(id))\n    .filter(Boolean);",
      "    .map((id) => describeUnshippedTemplate(id) && { ...describeUnshippedTemplate(id), config: { bytes: 1, keccak256: `0x${\"0\".repeat(64)}` }, brief: { tags: [\"x\"] } })\n    .filter(Boolean);",
    ]],
    mustFail: ["the advanced flag reveals EXPERIMENTAL and HELD, and never as a starting point"],
  },
  {
    id: "M19 a config schema version is assumed from the runtime version",
    file: SRC("descriptors.js"),
    edits: [[
      '    runtimeTagPreimage: "V4ART.RUNTIME.GEOMETRIC_RECURSION_V1",\n    configMagic: "GRV1",\n    configSchemaVersion: 2,',
      '    runtimeTagPreimage: "V4ART.RUNTIME.GEOMETRIC_RECURSION_V1",\n    configMagic: "GRV1",\n    configSchemaVersion: 1,',
    ]],
    mustFail: ["the config schema versions are the ones the runtimes actually require — 2, 1, 1, 2"],
  },
  {
    id: "M20 a published sheet digest no longer describes the published file",
    file: SRC("descriptors.js"),
    edits: [[
      'sha256: "ef3d4d3f603fb30945eb7b62afc14f0cfbd674b30112638e41ec93161774d5b2"',
      'sha256: "0000000000000000000000000000000000000000000000000000000000000000"',
    ]],
    mustFail: ["every published contact sheet exists and matches its digest"],
  },
];

// ------------------------------------------------------------------------------------------------

function runSuite() {
  try {
    const out = execFileSync(process.execPath, ["--test", "--test-reporter=tap", "test/selection.test.mjs", "test/status.test.mjs", "test/descriptors.test.mjs"], {
      cwd: PKG,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { text: out, ok: true };
  } catch (err) {
    return { text: `${err.stdout ?? ""}${err.stderr ?? ""}`, ok: false };
  }
}

/** The set of test names the suite reported as FAILING. Parsed from TAP, never from a count. */
function failingTests(text) {
  const failing = new Set();
  for (const line of text.split("\n")) {
    const m = /^not ok \d+ - (.+?)\s*$/.exec(line.trim());
    if (m) failing.add(m[1]);
  }
  return failing;
}

console.log("[template-catalog:mutate] baseline");
const baseline = runSuite();
if (!baseline.ok) {
  console.error("  FAIL  the suite is already red before any mutation. A red baseline cannot prove a mutation turned it red.");
  console.error(baseline.text.split("\n").filter((l) => l.startsWith("not ok")).join("\n"));
  process.exit(1);
}
const baselineFailures = failingTests(baseline.text);
if (baselineFailures.size !== 0) {
  console.error(`  FAIL  baseline reports ${baselineFailures.size} failing test(s)`);
  process.exit(1);
}
console.log("  ok    baseline is green\n");

let caught = 0;
let harnessErrors = 0;

for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  let mutated = original;
  let applied = true;
  for (const [from, to] of m.edits) {
    if (!mutated.includes(from)) {
      console.error(`  HARNESS FAIL  ${m.id}: its pattern no longer matches ${m.file.split("/").pop()}.`);
      console.error("                A mutation that changes nothing scores a free pass. Fix the pattern; do not delete the mutation.");
      applied = false;
      harnessErrors++;
      break;
    }
    mutated = mutated.replace(from, to);
  }
  if (!applied) continue;
  if (mutated === original) {
    console.error(`  HARNESS FAIL  ${m.id}: the source is byte-identical after the edit`);
    harnessErrors++;
    continue;
  }

  writeFileSync(m.file, mutated);
  let result;
  try {
    result = runSuite();
  } finally {
    writeFileSync(m.file, original);
    if (readFileSync(m.file, "utf8") !== original) {
      console.error(`  HARNESS FAIL  ${m.id}: the source was not restored`);
      process.exit(1);
    }
  }

  const failed = failingTests(result.text);
  const missed = m.mustFail.filter((name) => !failed.has(name));
  const outputOk = !m.expectInOutput || result.text.includes(m.expectInOutput);

  if (missed.length === 0 && outputOk) {
    caught++;
    console.log(`  CAUGHT  ${m.id}`);
    console.log(`          red: ${m.mustFail.join(" | ")}`);
  } else {
    console.error(`  SURVIVED  ${m.id}`);
    if (missed.length > 0) console.error(`            these named tests stayed green: ${missed.join(" | ")}`);
    if (!outputOk) console.error(`            the failure did not mention: ${m.expectInOutput}`);
  }
}

console.log("");
console.log(`TEMPLATE_CATALOG_MUTATIONS_CAUGHT=${caught}/${MUTATIONS.length}`);
console.log(`TEMPLATE_CATALOG_MUTATION_HARNESS_ERRORS=${harnessErrors}`);
const ok = caught === MUTATIONS.length && harnessErrors === 0;
console.log(ok ? "\n[template-catalog:mutate] PASS — every guard was broken and a named test went red" : "\n[template-catalog:mutate] FAIL");
process.exit(ok ? 0 : 1);
