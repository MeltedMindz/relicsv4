#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Proves every shipped starter template scaffolds, validates and exports.
//
// Templates carry a placeholder `earnings.creatorRecipient` that validation refuses on purpose, so
// this harness substitutes a real-shaped address before validating — which also proves the
// placeholder gate is the ONLY thing standing between a fresh template and a clean run.

import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { APPROVED_ART_RUNTIMES, LAUNCHABLE_ART_RUNTIMES, ART_RUNTIME_IDS } from "../packages/project-schema/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "packages/creator-cli/bin/relics.js");
const TEMPLATES = join(ROOT, "packages/creator-cli/templates");
const RECIPIENT = "0x7A6f3B4c2D1e0F9a8B7c6D5e4F3a2B1c0D9e8F7a";
const COLLABORATOR = "0x4d5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d3E";

const ids = readdirSync(TEMPLATES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let failed = 0;

// A template on an UNAPPROVED runtime is a hard failure: the format would refuse the bundle, so
// shipping one means shipping a starter that cannot be exported. A template on an approved but
// not-yet-launchable runtime is fine and is reported as such — never silently presented as
// launchable, and never deleted for a release-schedule reason.
for (const id of ids) {
  const meta = JSON.parse(readFileSync(join(TEMPLATES, id, "template.json"), "utf8"));
  if (!APPROVED_ART_RUNTIMES.includes(meta.runtime)) {
    failed++;
    console.log(`  FAIL  ${id.padEnd(22)} targets "${meta.runtime}", which is not an approved art runtime`);
  }
}

for (const id of ids) {
  const dir = mkdtempSync(join(tmpdir(), `relics-${id}-`));
  try {
    cpSync(join(TEMPLATES, id), dir, { recursive: true });
    rmSync(join(dir, "template.json"), { force: true });

    const configPath = join(dir, "relics.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.earnings.creatorRecipient = RECIPIENT;
    // A template scaffolds as a DRAFT: `market.antiSnipeMode` ships UNSPECIFIED so no project
    // launches on a fee schedule its author never chose. Elect it here exactly as a creator
    // would, for the same reason creatorRecipient is filled in — a template ships neither.
    config.market.antiSnipeMode = "NONE";
    if (config.earnings.collaborators?.length) config.earnings.collaborators[0].recipient = COLLABORATOR;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const bundle = join(dir, "out.relics");
    const output = execFileSync(process.execPath, [CLI, "export", dir, "--output", bundle], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    if (!existsSync(bundle)) throw new Error("export reported success but wrote no bundle");

    const inspected = execFileSync(process.execPath, [CLI, "inspect", bundle, "--json"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
    const report = JSON.parse(inspected);
    if (!report.ok) throw new Error(`the exported bundle does not inspect cleanly: ${report.issues.map((i) => i.code).join(", ")}`);

    const binding = report.manifest?.artBinding ?? null;
    if (!binding) throw new Error("the exported bundle carries no art binding");
    if (binding.runtimeCodeHash !== null || binding.scriptPointer !== null) throw new Error("a template exported a bundle asserting a chain fact");

    const hash = output.match(/bundle hash\s+([0-9a-f]{64})/)?.[1] ?? "?";
    const launchable = LAUNCHABLE_ART_RUNTIMES.includes(binding.runtime);
    const note = launchable ? "" : "  · PREVIEW ONLY (runtime not launchable)";
    console.log(`  PASS  ${id.padEnd(22)} ${report.entries.length} entries · ${binding.runtimeId} · ${hash.slice(0, 16)}…${note}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${id}`);
    const detail = (err.stdout || err.message || "").toString();
    console.log(
      detail
        .split("\n")
        .filter((line) => /error|FAIL/i.test(line))
        .slice(0, 8)
        .map((line) => `        ${line.trim()}`)
        .join("\n"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("");
const gated = ids.filter((id) => !LAUNCHABLE_ART_RUNTIMES.includes(JSON.parse(readFileSync(join(TEMPLATES, id, "template.json"), "utf8")).runtime));
console.log(failed === 0 ? `  ${ids.length} templates export cleanly` : `  ${failed} of ${ids.length} templates failed`);
if (gated.length > 0) {
  console.log(`  ${gated.length} on a runtime the launchpad does not bind yet: ${gated.join(", ")} — marked, not launchable`);
}
console.log(`  runtime ids: ${Object.entries(ART_RUNTIME_IDS).map(([k, v]) => `${k}=${v}`).join(", ")}`);
process.exitCode = failed === 0 ? 0 : 1;
