// SPDX-License-Identifier: MIT
// The creator lifecycle, driven through the CLI BINARY the way a creator drives it.
//
// Every step here is a subprocess running `packages/creator-cli/bin/relics.js`. That is the point:
// importing the command functions would test the functions, and a creator does not have those. It
// also means an argument-parsing regression, a bad exit code, or a message that stops naming its
// fix, is a failure here rather than a surprise for the first person to try the documented commands.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI = join(ROOT, "packages", "creator-cli", "bin", "relics.js");

/**
 * A deterministic test recipient. It must not be a placeholder — `EARNINGS_RECIPIENT_PLACEHOLDER`
 * refuses the dead address, repeated nibbles and dead/beef patterns by name — and it must not be a
 * Hardhat or Anvil default, whose private keys are published.
 */
export const TEST_RECIPIENT = "0x7A6f3B4c2D1e0F9a8B7c6D5e4F3a2B1c0D9e8F7a";
export const TEST_COLLABORATOR = "0x4d5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d3E";

/** Runs the CLI and returns { ok, code, out }. Never throws on a non-zero exit. */
export function relics(args, options = {}) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 64 * 1024 * 1024,
      cwd: options.cwd ?? ROOT,
    });
    return { ok: true, code: 0, out };
  } catch (err) {
    return { ok: false, code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

export function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Merge a partial config into the project's relics.config.json. */
export function patchConfig(root, patch) {
  const path = join(root, "relics.config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  const merged = { ...config };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = value && typeof value === "object" && !Array.isArray(value) ? { ...config[key], ...value } : value;
  }
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}

/** THE ONE EDIT the scaffold requires: a real creator recipient. */
export function fillCreatorRecipient(root) {
  const path = join(root, "relics.config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  config.earnings.creatorRecipient = TEST_RECIPIENT;
  // A template scaffolds as a DRAFT: market.antiSnipeMode ships UNSPECIFIED so no project
  // launches on a fee schedule its author never chose. Elect it here exactly as a creator would.
  config.market.antiSnipeMode = "NONE";
  if (config.earnings.collaborators?.length) config.earnings.collaborators[0].recipient = TEST_COLLABORATOR;
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

/** Copies an overlay tree over a scaffolded project, replacing files wholesale. */
export function overlay(source, target) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === "config.patch.json") continue;
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) cpSync(from, to, { recursive: true });
    else cpSync(from, to);
  }
}

/**
 * init -> preview -> test-seeds -> validate -> export -> inspect, through the CLI.
 *
 * @param {{
 *   name: string, template: string, projectName: string, symbol: string,
 *   overlayDir?: string, configPatch?: object, seeds?: number, previews?: number, keep?: boolean,
 * }} spec
 */
export function runLifecycle(spec) {
  const dir = tempDir(`relics-lifecycle-${spec.name}-`);
  const project = join(dir, "project");
  const bundle = join(dir, `${spec.name}.relics`);
  const steps = [];
  const record = (step, result, detail = "") => {
    steps.push({ step, ok: result.ok, code: result.code, detail: detail || firstProblem(result.out) });
    return result;
  };
  const cleanup = () => {
    if (spec.keep !== true) rmSync(dir, { recursive: true, force: true });
  };

  try {
    const init = record("init", relics(["init", project, "--template", spec.template, "--name", spec.projectName, "--symbol", spec.symbol]));
    if (!init.ok) return finish(spec, steps, null, dir);

    if (spec.overlayDir) overlay(spec.overlayDir, project);
    if (spec.configPatch) patchConfig(project, spec.configPatch);
    fillCreatorRecipient(project);

    const preview = record("preview", relics(["preview", project, "--count", String(spec.previews ?? 4)]));
    if (!preview.ok) return finish(spec, steps, null, dir);

    const seeds = record("test-seeds", relics(["test-seeds", project, "--count", String(spec.seeds ?? 32)]));
    if (!seeds.ok) return finish(spec, steps, null, dir);

    const validate = record("validate", relics(["validate", project]));
    if (!validate.ok) return finish(spec, steps, null, dir);

    const exported = record("export", relics(["export", project, "--output", bundle]));
    if (!exported.ok) return finish(spec, steps, null, dir);
    if (!existsSync(bundle)) {
      steps.push({ step: "export", ok: false, code: 0, detail: "export reported success but wrote no bundle" });
      return finish(spec, steps, null, dir);
    }

    const inspected = record("inspect", relics(["inspect", bundle, "--json"]));
    if (!inspected.ok) return finish(spec, steps, null, dir);

    let report;
    try {
      report = JSON.parse(inspected.out);
    } catch {
      steps.push({ step: "inspect", ok: false, code: 0, detail: "inspect --json did not produce JSON" });
      return finish(spec, steps, null, dir);
    }
    if (!report.ok) {
      steps.push({ step: "inspect", ok: false, code: 0, detail: `bundle does not inspect cleanly: ${(report.issues ?? []).map((i) => i.code).join(", ")}` });
      return finish(spec, steps, null, dir);
    }

    const binding = report.manifest?.artBinding ?? null;
    if (!binding) {
      steps.push({ step: "inspect", ok: false, code: 0, detail: "the exported bundle carries no art binding" });
      return finish(spec, steps, null, dir);
    }
    // A bundle must never assert a fact only a chain can supply.
    if (binding.runtimeCodeHash !== null || binding.scriptPointer !== null) {
      steps.push({ step: "inspect", ok: false, code: 0, detail: "the bundle asserts a chain fact (runtimeCodeHash / scriptPointer)" });
      return finish(spec, steps, null, dir);
    }

    return finish(
      spec,
      steps,
      {
        bundleBytes: statSync(bundle).size,
        entries: (report.entries ?? []).length,
        runtime: binding.runtime,
        runtimeId: binding.runtimeId,
        bundleHash: report.manifest?.integrity?.bundleHash ?? null,
        bundleCommitment: report.manifest?.integrity?.bundleCommitment ?? null,
        mappingCount: report.manifest?.market?.mappingCount ?? 0,
        artworkSupply: report.manifest?.supply?.artworkSupply ?? null,
        warnings: (report.issues ?? []).filter((i) => i.severity !== "error").map((i) => i.code),
        seeds: parseSeedStats(seeds.out),
        exportOut: exported.out,
        bundlePath: bundle,
      },
      dir,
      { keep: spec.keep === true },
    );
  } finally {
    cleanup();
  }
}

function finish(spec, steps, result, dir, options = {}) {
  return { name: spec.name, template: spec.template, ok: result !== null && steps.every((s) => s.ok), steps, result, dir: options.keep ? dir : null };
}

/** The first line that reads like a problem, so a failure report names something specific. */
function firstProblem(out) {
  const line = String(out)
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^(error|FAIL|relics:)/i.test(l));
  return line ?? "";
}

function parseSeedStats(out) {
  const number = (label) => {
    const m = new RegExp(`${label}\\s+([0-9]+)`).exec(out);
    return m ? Number(m[1]) : null;
  };
  const rendered = /rendered\s+(\d+)\s*\/\s*(\d+)/.exec(out);
  return {
    rendered: rendered ? [Number(rendered[1]), Number(rendered[2])] : null,
    failed: number("failed"),
    blank: number("blank"),
    nonDeterministic: number("non-deterministic"),
    distinct: number("distinct outputs"),
  };
}
