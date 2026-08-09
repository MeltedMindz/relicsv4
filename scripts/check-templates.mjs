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

for (const id of ids) {
  const dir = mkdtempSync(join(tmpdir(), `relics-${id}-`));
  try {
    cpSync(join(TEMPLATES, id), dir, { recursive: true });
    rmSync(join(dir, "template.json"), { force: true });

    const configPath = join(dir, "relics.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.earnings.creatorRecipient = RECIPIENT;
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

    const hash = output.match(/bundle hash\s+([0-9a-f]{64})/)?.[1] ?? "?";
    console.log(`  PASS  ${id.padEnd(22)} ${report.entries.length} entries · ${hash.slice(0, 16)}…`);
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
console.log(failed === 0 ? `  ${ids.length} templates export cleanly` : `  ${failed} of ${ids.length} templates failed`);
process.exitCode = failed === 0 ? 0 : 1;
