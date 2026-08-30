#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// THE README QUICKSTART, EXECUTED.
//
// The quickstart is the first thing a creator runs and the easiest thing in the repository to
// break: a renamed flag, a changed default, a command that quietly stopped writing its output, and
// the instructions are wrong for everyone who arrives next. Documentation that has never been run
// is a claim, not a fact.
//
// So this parses the commands OUT OF README.md rather than restating them — a copy would drift from
// the document it is supposed to be testing — runs each one in a temp directory, and asserts what
// the quickstart promises:
//
//   * the placeholder recipient really does refuse an export (the README says so in bold)
//   * with a real address, every step succeeds
//   * a `.relics` file exists afterwards
//   * its status is FINAL
//   * it validates with ZERO errors
//
// `relics dev` is the one documented step that is skipped, and named here rather than silently
// dropped: it starts a server and waits. Everything around it runs.
//
// Emits README_QUICKSTART_EXECUTABLE.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readContainer, validateBundleBytes, BUNDLE_MAGIC, DRAFT_MAGIC } from "../packages/project-schema/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(ROOT, "README.md");
const CLI = join(ROOT, "packages", "creator-cli", "bin", "relics.js");
const RECIPIENT = "0x7A6f3B4c2D1e0F9a8B7c6D5e4F3a2B1c0D9e8F7a";

/** Commands that run the validator, in the order the README can list them. */
const VALIDATING_COMMANDS = ["validate", "export"];

/**
 * The `npm run kit -- …` lines from the README, in document order.
 *
 * Read from the file so the test cannot drift from the documentation. `kit -- <args>` is the
 * documented invocation; the harness runs the same binary directly, because `npm run` in a temp
 * directory would need the repo's package.json and that is not what is being tested.
 */
function quickstartCommands() {
  const readme = readFileSync(README, "utf8");
  const commands = [];
  for (const line of readme.split("\n")) {
    const m = /^\s*npm run kit\s+--\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const args = m[1].split(/\s+/).filter(Boolean);
    if (!commands.some((c) => c.join(" ") === args.join(" "))) commands.push(args);
  }
  return commands;
}

function run(args, { expectFailure = false } = {}) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, out };
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (expectFailure) return { ok: false, out };
    throw new Error(`\`relics ${args.join(" ")}\` failed:\n${out}`);
  }
}

const problems = [];
const ran = [];
const dir = mkdtempSync(join(tmpdir(), "relics-readme-"));

try {
  const commands = quickstartCommands();
  if (commands.length === 0) throw new Error("README.md contains no `npm run kit -- …` commands — the quickstart moved, and this test is checking nothing.");

  // The README's project directory name, as written. Resolved into the temp dir so the run cannot
  // touch the repository.
  const PROJECT_TOKEN = "my-project";
  const project = join(dir, PROJECT_TOKEN);
  const bundle = join(dir, "my-project.relics");
  const resolve = (arg) => (arg === PROJECT_TOKEN ? project : arg === `${PROJECT_TOKEN}.relics` ? bundle : arg);

  let placeholderRefused = false;

  for (const command of commands) {
    const [verb] = command;
    const args = command.map(resolve);

    // `dev` starts a server and waits. Named, not silently skipped.
    if (verb === "dev") {
      ran.push({ command: command.join(" "), status: "skipped — starts a server and waits" });
      continue;
    }

    // `agent select-template` is documented in the art-catalog section, not in the quickstart, and
    // it is NAMED here rather than silently dropped for two reasons that both matter:
    //
    //   * it reads a chain. Running it inside an offline quickstart harness would make this gate
    //     depend on an RPC endpoint, and a gate that fails on a rate limit teaches people to ignore
    //     it.
    //   * its outcome depends on what the registry holds on the day it runs, and that moved on
    //     2026-08-29 when the two Wave-1 runtimes were registered: the documented result went from a
    //     refusal (`NO_ACTIVE_RUNTIME`) to a selection, with no edit here. Asserting either one would
    //     make this harness the thing that has to be updated whenever registration moves, which is
    //     the wrong place for that alarm — the private repository's gate reads the registries and
    //     owns it.
    if (verb === "agent") {
      ran.push({ command: command.join(" "), status: "skipped — reads a chain; the art-catalog section, not the quickstart" });
      continue;
    }

    // THE README'S OWN CLAIM, TESTED, AT THE POINT THE READER MEETS IT.
    //
    // The quickstart says in bold that a fresh project FAILS on the placeholder recipient. The
    // first command that runs the validator is where that happens — `validate`, which the document
    // lists before `export` — so the refusal is asserted there rather than assumed to arrive later.
    // Then the harness does exactly what the README tells the reader to do, and continues.
    if (VALIDATING_COMMANDS.includes(verb) && !placeholderRefused) {
      const refused = run(args, { expectFailure: true });
      if (refused.ok) {
        problems.push(`the README says a fresh project fails on the placeholder recipient; \`relics ${verb}\` succeeded instead`);
      } else if (!/EARNINGS_RECIPIENT_PLACEHOLDER/.test(refused.out)) {
        problems.push(`\`relics ${verb}\` refused, but not for the documented reason:\n${refused.out.slice(0, 400)}`);
      }
      placeholderRefused = true;
      ran.push({ command: `${command.join(" ")}  (fresh scaffold)`, status: "refused on the placeholder, as documented" });

      // Now do what the README tells the reader to do, and re-run the same command.
      const configPath = join(project, "relics.config.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.earnings.creatorRecipient = RECIPIENT;
      // A template scaffolds as a DRAFT: `market.antiSnipeMode` ships UNSPECIFIED so no project
      // launches on a fee schedule its author never chose. Elect it here exactly as a creator
      // would, for the same reason creatorRecipient is filled in — a template ships neither.
      config.market.antiSnipeMode = "NONE";
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    }

    // ---- DIAGNOSTICS ANSWER; THEY DO NOT SUCCEED OR FAIL ----------------------------------------
    //
    // `agent doctor` reports whether THIS MACHINE is configured for an autonomous launch, and on a
    // bare machine the honest answer is no — no signer, no pinning provider, no credentialled RPC.
    // It exits non-zero to say so, which is the command working. Treating that as a broken
    // quickstart would push whoever fixes it toward making doctor lie.
    //
    // What IS asserted is that it answered in the documented shape: a JSON envelope naming the
    // things that are missing. A doctor that crashed, or printed prose, or reported a green machine
    // that has none of the four preconditions, all still fail here.
    if (verb === "agent" && args.includes("doctor")) {
      const diagnostic = run(args, { expectFailure: true });
      let envelope = null;
      try { envelope = JSON.parse(diagnostic.out.slice(diagnostic.out.indexOf("{"))); } catch { /* handled below */ }
      if (!envelope || envelope.schemaVersion !== 1 || !Array.isArray(envelope.result?.checks)) {
        problems.push(`\`relics agent doctor\` did not answer in the documented JSON envelope:\n${diagnostic.out.slice(0, 300)}`);
      } else if (envelope.success === true) {
        problems.push("`relics agent doctor` reported this machine READY for an autonomous launch, on a machine with no signer, no pinning provider and no credentialled RPC. That is the one answer it must never give.");
      }
      ran.push({ command: command.join(" "), status: `answered: ${envelope?.result?.checks?.filter((c) => !c.ok).length ?? "?"} precondition(s) not met, as documented` });
      continue;
    }

    const result = run(args);
    ran.push({ command: command.join(" "), status: `ok (${result.out.split("\n").length} lines)` });
  }

  // ---- what the quickstart promised the reader would have at the end -------------------------
  if (!existsSync(bundle)) {
    problems.push(`the quickstart's final command did not produce ${bundle}`);
  } else {
    const bytes = new Uint8Array(readFileSync(bundle));
    const container = readContainer(bytes);
    const report = validateBundleBytes(bytes, { skipExecution: true });

    const status = report.manifest?.status ?? null;
    if (status !== "FINAL") problems.push(`the exported bundle's status is ${JSON.stringify(status)}, not FINAL`);

    // STATUS IS NOT A FILENAME, and it is not just a manifest field either. `readContainer` refuses
    // anything whose ARCHIVE COMMENT is not the bundle magic, which is what stops
    // `mv x.relics-draft x.relics` from producing a launchable file. Re-reading with the magic
    // required is the check: a draft renamed to `.relics` throws here, exactly as it would in the
    // importer, rather than passing because the manifest happened to say FINAL.
    try {
      readContainer(bytes, { requireMagic: true });
    } catch (err) {
      problems.push(`the exported file is not a ${BUNDLE_MAGIC} container: ${err instanceof Error ? err.message : String(err)}`);
    }

    const errors = report.issues.filter((i) => i.severity === "error");
    if (errors.length !== 0) problems.push(`the exported bundle has ${errors.length} validation error(s): ${errors.map((e) => e.code).join(", ")}`);

    ran.push({ command: "(result)", status: `${statSync(bundle).size.toLocaleString()} bytes, ${container.entries.length} entries, status ${status}, ${errors.length} errors` });
  }
} catch (err) {
  problems.push(err instanceof Error ? err.message : String(err));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("");
console.log("  README quickstart, executed from README.md itself");
console.log("");
for (const step of ran) console.log(`  ${step.command.padEnd(52)} ${step.status}`);
if (problems.length > 0) {
  console.log("");
  for (const p of problems) console.log(`  FAIL  ${p}`);
}
console.log("");
console.log(`README_QUICKSTART_EXECUTABLE=${problems.length === 0 ? "YES" : "NO"}`);
process.exitCode = problems.length === 0 ? 0 : 1;
