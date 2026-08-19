#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// EVERY ADVERTISED TEMPLATE, THROUGH THE WHOLE CREATOR LIFECYCLE.
//
//   relics init -> preview -> test-seeds -> validate -> export -> inspect
//
// `check-templates.mjs` already proves a template EXPORTS. This proves the path a creator actually
// walks, in the order the docs give it, through the CLI binary — including the two steps that only
// fail when art is really rendered (`preview`, `test-seeds`), and including `init` itself, which the
// export check skipped by copying the template directory straight out of the repository.
//
// A TEMPLATE THAT VALIDATES BUT CANNOT BE LAUNCHED IS MARKED, NEVER ADVERTISED AS LAUNCHABLE.
// Launchability is read from the schema's own `LAUNCHABLE_ART_RUNTIMES`, never from `template.json`:
// a template file that could declare itself launchable would outlive the protocol decision it
// depends on, and the creator would find out after a day of authoring.
//
// Emits ALL_ADVERTISED_TEMPLATES_TESTED and ADVERTISED_TEMPLATES_FAILED.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LAUNCHABLE_ART_RUNTIMES, APPROVED_ART_RUNTIMES } from "../packages/project-schema/index.js";
import { ROOT, runLifecycle } from "./lib/lifecycle.mjs";

const TEMPLATES = join(ROOT, "packages", "creator-cli", "templates");

const ids = readdirSync(TEMPLATES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

/** A symbol the schema accepts: 1-11 uppercase letters and digits. */
function symbolFor(id) {
  return id.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8) || "TEMPLATE";
}

const failures = [];
const rows = [];

for (const id of ids) {
  const meta = JSON.parse(readFileSync(join(TEMPLATES, id, "template.json"), "utf8"));
  if (!APPROVED_ART_RUNTIMES.includes(meta.runtime)) {
    failures.push(id);
    rows.push({ id, line: `FAIL  ${id.padEnd(22)} targets "${meta.runtime}", which is not an approved art runtime` });
    continue;
  }

  const run = runLifecycle({
    name: id,
    template: id,
    projectName: `Lifecycle ${id}`,
    symbol: symbolFor(id),
    seeds: 32,
    previews: 4,
  });

  if (!run.ok) {
    failures.push(id);
    const failed = run.steps.find((s) => !s.ok) ?? run.steps.at(-1);
    rows.push({ id, line: `FAIL  ${id.padEnd(22)} ${failed?.step ?? "?"}: ${failed?.detail || `exit ${failed?.code}`}` });
    continue;
  }

  const r = run.result;
  const launchable = LAUNCHABLE_ART_RUNTIMES.includes(r.runtime);
  const seeds = r.seeds;
  const seedProblem =
    seeds.failed !== 0 || seeds.blank !== 0 || seeds.nonDeterministic !== 0
      ? `  · ${seeds.failed} failed / ${seeds.blank} blank / ${seeds.nonDeterministic} non-deterministic`
      : "";
  if (seedProblem) {
    failures.push(id);
    rows.push({ id, line: `FAIL  ${id.padEnd(22)} test-seeds reported problems${seedProblem}` });
    continue;
  }

  // MARKED, not advertised. A preview-only runtime is a real, correct, exportable project that the
  // launchpad does not bind yet — saying so is the whole difference between honest and misleading.
  const mark = launchable ? "" : "  · PREVIEW ONLY — not production-launchable (runtime not bound)";
  rows.push({
    id,
    line: `PASS  ${id.padEnd(22)} ${String(r.entries).padStart(2)} entries · ${r.mappingCount} mapping(s) · ${seeds.distinct}/${seeds.rendered?.[1]} distinct · ${r.runtimeId} · ${String(r.bundleHash).slice(0, 12)}…${mark}`,
  });
}

console.log("");
console.log("  every advertised template, init -> preview -> test-seeds -> validate -> export -> inspect");
console.log("");
for (const row of rows) console.log(`  ${row.line}`);

const gated = ids.filter((id) => !LAUNCHABLE_ART_RUNTIMES.includes(JSON.parse(readFileSync(join(TEMPLATES, id, "template.json"), "utf8")).runtime));
console.log("");
console.log(`  ${ids.length - failures.length}/${ids.length} templates complete the full lifecycle`);
if (gated.length > 0) {
  console.log(`  ${gated.length} on a runtime the launchpad does not bind yet: ${gated.join(", ")} — marked PREVIEW ONLY, never advertised as launchable`);
}
console.log("");
console.log(`ALL_ADVERTISED_TEMPLATES_TESTED=${failures.length === 0 && ids.length > 0 ? "YES" : "NO"} (${ids.length} tested: ${ids.join(", ")})`);
console.log(`ADVERTISED_TEMPLATES_FAILED=${failures.length}${failures.length > 0 ? ` (${failures.join(", ")})` : ""}`);
process.exitCode = failures.length === 0 ? 0 : 1;
