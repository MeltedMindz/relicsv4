#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// NO GATE PASSES ON ZERO INPUT.
//
// Every gate in this repository claims to check something. A gate can be green for two very
// different reasons — it looked and found nothing wrong, or it never looked — and from the outside
// those are indistinguishable. The second is the more common failure and the more dangerous one,
// because it grows quietly: a glob that stops matching, a corpus that empties, a check whose
// subject moved. `export:manifest:check` in this very repository had a --check mode nobody ran and
// drifted 173 files behind while every run said nothing.
//
// So each gate is given a DELIBERATELY BROKEN input, in a scratch copy of the repository, and is
// required to go red. A gate that stays green on its own breakage is not testing what it says.
//
// Each mutation is something a person could plausibly do or a refactor could plausibly cause. This
// is slow (it copies the tree per mutation and runs a real gate), so it is an on-demand command
// rather than a per-commit one — but the evidence it produces is the only thing that makes any of
// the other green ticks mean anything.
//
//   node scripts/verify-gates-fail.mjs [--only <gate>]

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * EVERY TRACKED FILE, copied into the scratch tree. `node_modules` is not, because no gate here
 * needs it.
 *
 * A hand-written subset was tried first and it was wrong in the way that matters: three gates went
 * red BEFORE any mutation, because their real inputs — the whole repository for the economics scan,
 * every tracked digest for the export manifest, every link target for the doc checker — were not
 * there. A gate that is red for a reason the harness caused proves nothing about the gate, which is
 * exactly the confusion this script exists to remove. So the scratch tree is the repository.
 */
function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
}

function edit(path, from, to) {
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`mutation anchor not found in ${path}: ${from.slice(0, 60)}`);
  writeFileSync(path, text.replace(from, to));
}

function append(path, text) {
  writeFileSync(path, readFileSync(path, "utf8") + text);
}

/**
 * Each entry: the npm script (or argv) to run, and a mutation that must turn it red.
 *
 * `sees` names WHAT INPUT the gate is claimed to read, so a mutation is chosen to be invisible to
 * everything except that input. A mutation the gate catches for an unrelated reason proves nothing.
 */
const GATES = [
  {
    gate: "kit:test",
    sees: "the schema's own vocabulary, container, validator and sandbox",
    mutate: (root) => edit(join(root, "packages/project-schema/src/vocabulary.js"), 'wrappedNativeSymbol: "WBNB"', 'wrappedNativeSymbol: "WETH"'),
    why: "BNB's settlement symbol silently becomes WETH",
  },
  {
    gate: "kit:templates",
    sees: "every shipped starter template, exported for real",
    mutate: (root) => edit(join(root, "packages/creator-cli/templates/minimal/relics.config.json"), '"backingModel": "FULL_PARITY"', '"backingModel": "PARTIAL_PARITY"'),
    why: "a template ships an invented backing model",
  },
  {
    gate: "kit:lifecycle",
    sees: "init -> preview -> test-seeds -> validate -> export -> inspect, per template",
    mutate: (root) => append(join(root, "packages/creator-cli/templates/minimal/generator/generate.js"), "\nexport const __drift = Date.now();\n"),
    why: "a template's generator reads the clock, so it is no longer deterministic",
  },
  {
    gate: "kit:agent-projects",
    sees: "the three natural-language briefs and the mechanics each one promised",
    mutate: (root) => edit(join(root, "scripts/agent-projects/monochrome-pixel-field/market/mappings.json"), '"sensor": "volatility"', '"sensor": "volume"'),
    why: "a brief's own sensor is quietly swapped for a different one",
  },
  {
    gate: "kit:parity",
    sees: "every file the launchpad mirrors, plus the importer contract and the compat corpus",
    mutate: (root) => append(join(root, "packages/project-schema/src/canonical-json.js"), "\n// drift\n"),
    why: "a mirrored schema file is edited without re-pinning",
  },
  {
    gate: "kit:economics",
    sees: "every file in the repository, for retired allocation figures",
    mutate: (root) => {
      mkdirSync(join(root, "docs"), { recursive: true });
      // ASSEMBLED FROM FRAGMENTS, and the reason is the gate itself: the economics scan reads every
      // file in the repository, so a literal retired figure written here would make this script a
      // real violation and turn the gate red on the unmutated tree. It did, on the first run.
      //
      // The fix is fragments, never an allowlist entry for this file: a scanner taught to skip the
      // one file that contains deliberate violations is a scanner taught to skip the best hiding
      // place in the repository.
      const retired = `The RELICS buyback takes ${"25"}% of the platform share.`;
      writeFileSync(join(root, "docs", "gate-selftest.md"), `${retired}\n`);
    },
    why: "a retired allocation figure comes back in a doc",
  },
  {
    gate: "kit:readme",
    sees: "the commands written in README.md, executed",
    mutate: (root) => edit(join(root, "README.md"), "npm run kit -- init my-project --template minimal", "npm run kit -- init my-project --template no-such-template"),
    why: "the quickstart names a template the kit does not ship",
  },
  {
    gate: "docs:links",
    sees: "internal links, anchors, assets, --template ids and npm run scripts",
    mutate: (root) => append(join(root, "README.md"), "\n[a link to nowhere](docs/creator-kit/README.md#a-heading-that-does-not-exist)\n"),
    why: "a link resolves to the right FILE and the wrong SECTION",
  },
  {
    gate: "kit:deployments:check",
    sees: "the launchpad's own chain profiles, when they are present",
    env: { RELICS_LAUNCHPAD_DIR: process.env.RELICS_LAUNCHPAD_DIR ?? "" },
    skipWhen: () => !process.env.RELICS_LAUNCHPAD_DIR,
    // THE MUTATION MOVED WITH THE FILE. It used to repopulate `1: null` -- a line that no longer
    // exists now that chain 1 carries a real RC6 record, so the edit would have silently matched
    // nothing and the gate would have "survived" a mutation that was never applied. It now
    // REPLACES a published address with one that is not on any chain, which is the same defect in
    // the world the file is actually in.
    mutate: (root) =>
      edit(
        join(root, "packages/project-schema/src/deployments.js"),
        'launchpadFactory: "0x25003C3EBC2036CfE9E4037d4e7E6F840a06522E",',
        'launchpadFactory: "0x1111111111111111111111111111111111111111",',
      ),
    why: "a published factory address is not the one the chain profile carries",
  },
  {
    gate: "secrets:scan",
    sees: "every tracked file, for credential-shaped strings",
    mutate: (root) => {
      // Assembled from fragments so this source file does not itself contain a matchable secret.
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(join(root, "docs", "gate-selftest-secret.md"), `PRIVATE_KEY=0x${"4c0883a69102937d6231471b5dbb6204"}${"fe5129617082792ae468d01a3f362318"}\n`);
    },
    why: "a private key lands in a tracked file",
  },
  {
    gate: "export:manifest:check",
    sees: "every tracked file's digest",
    mutate: (root) => append(join(root, "README.md"), "\nan untracked change\n"),
    why: "a tracked file changes without the manifest being regenerated",
  },
];

/**
 * Runs one gate with EXACTLY the inputs it declares.
 *
 * The ambient environment is stripped of the optional-input variables, and only a gate that names
 * one gets it back. Inheriting them turned out to matter: with `RELICS_LAUNCHPAD_DIR` exported in
 * the shell, `kit:parity` ran its byte-diff half against a launchpad mirror that had not been
 * re-synced yet, went red before any mutation, and reported INCONCLUSIVE — a harness artefact
 * wearing the costume of a finding.
 */
const OPTIONAL_INPUT_VARS = ["RELICS_LAUNCHPAD_DIR", "RELICS_LAUNCHPAD_SCHEMA_DIR", "RELICS_CREATOR_KIT_DIR"];

function runGate(cwd, spec) {
  const env = { ...process.env, NO_COLOR: "1" };
  for (const key of OPTIONAL_INPUT_VARS) delete env[key];
  Object.assign(env, spec.env ?? {});
  try {
    const out = execFileSync("npm", ["run", "--silent", spec.gate], { cwd, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, tail: tail(out) };
  } catch (err) {
    return { ok: false, tail: tail(`${err.stdout ?? ""}${err.stderr ?? ""}`) };
  }
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const results = [];

for (const spec of GATES) {
  if (only && spec.gate !== only) continue;
  if (spec.skipWhen?.()) {
    results.push({ gate: spec.gate, status: "skipped", detail: "its input is not available here" });
    continue;
  }

  const scratch = mkdtempSync(join(tmpdir(), "relics-gate-selftest-"));
  try {
    for (const entry of trackedFiles()) {
      const from = join(ROOT, entry);
      if (!existsSync(from)) continue;
      mkdirSync(dirname(join(scratch, entry)), { recursive: true });
      cpSync(from, join(scratch, entry));
    }
    // `export:manifest:check` reads git; give the scratch copy a repository so it can.
    const git = (...args) => execFileSync("git", args, { cwd: scratch, stdio: "pipe" });
    git("init", "-q");
    // No background git. `git add -A` over a full tree can trip `gc --auto`, which keeps writing
    // into .git after this block returns and makes the teardown below fail with ENOTEMPTY on a
    // Linux runner while passing on a developer machine. Disable it rather than race it.
    git("config", "gc.auto", "0");
    git("config", "gc.autoDetach", "false");
    git("config", "maintenance.auto", "false");
    git("add", "-A");
    git("-c", "user.email=gate@selftest", "-c", "user.name=gate", "commit", "-q", "-m", "baseline");

    // 1. GREEN FIRST. If the gate is red before the mutation, the run proves nothing about it.
    const before = runGate(scratch, spec);
    if (!before.ok) {
      results.push({ gate: spec.gate, status: "INCONCLUSIVE", detail: `red before the mutation: ${before.tail}` });
      continue;
    }

    // 2. BREAK IT.
    spec.mutate(scratch);
    if (spec.gate === "export:manifest:check") git("add", "-A");

    const after = runGate(scratch, spec);
    results.push(
      after.ok
        ? { gate: spec.gate, status: "VACUOUS", detail: `stayed green when ${spec.why}` }
        : { gate: spec.gate, status: "caught", detail: spec.why },
    );
  } catch (err) {
    results.push({ gate: spec.gate, status: "ERROR", detail: err instanceof Error ? err.message : String(err) });
  } finally {
    // Retries, because a just-exited git can still hold a descriptor for a moment. `force` alone
    // suppresses ENOENT, not ENOTEMPTY.
    rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

function tail(text) {
  return String(text).trim().split("\n").slice(-2).join(" | ").slice(0, 200);
}

console.log("");
console.log("  every gate, given a deliberately broken input");
console.log("");
const width = Math.max(...results.map((r) => r.gate.length));
for (const r of results) {
  const label = r.status === "caught" ? "caught  " : r.status === "skipped" ? "skipped " : `${r.status} `;
  console.log(`  ${label} ${r.gate.padEnd(width)}  ${r.detail}`);
}

const bad = results.filter((r) => r.status === "VACUOUS" || r.status === "INCONCLUSIVE" || r.status === "ERROR");
const caught = results.filter((r) => r.status === "caught").length;
const skipped = results.filter((r) => r.status === "skipped").length;
console.log("");
console.log(`NO_GATE_PASSES_ON_ZERO_INPUT=${bad.length === 0 ? "PROVEN" : "NOT_PROVEN"} (${caught} caught, ${skipped} skipped, ${bad.length} unproven)`);
process.exitCode = bad.length === 0 ? 0 : 1;
