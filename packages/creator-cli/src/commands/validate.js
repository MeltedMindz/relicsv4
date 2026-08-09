// SPDX-License-Identifier: MIT
// `relics validate` — run every check against a project directory (or an already-exported bundle)
// without writing anything.

import { readFileSync } from "node:fs";
import { assembleBundle, validateBundle, validateBundleBytes, readContainer } from "../schema.js";
import { readConfig, readProjectFiles, generatorSources } from "../project.js";
import { renderSeedsIsolated, makeReplayEvaluator, makeVmEvaluator } from "../sandbox.js";
import { printChecks, printIssues, printHashes, heading, green, red, yellow, dim, plural } from "../report.js";

/**
 * Validates a project directory: assembles the bundle in memory, then validates the result. This
 * is the same code path `export` uses, so "validate passed" means "export would produce this".
 *
 * @param {string} root
 * @param {{ seeds?: number, inProcess?: boolean }} [options]
 */
export function validateProject(root, options = {}) {
  const config = readConfig(root);
  const files = readProjectFiles(root);
  const assembled = assembleBundle({ files, config });
  const result = runValidation(assembled.entries, options);
  return { ...result, assembled };
}

/**
 * @param {Map<string, Uint8Array>} entries
 * @param {{ seeds?: number, inProcess?: boolean }} [options]
 */
export function runValidation(entries, options = {}) {
  const seedCount = options.seeds ?? 24;
  const sources = generatorSources(entries);

  if (options.inProcess) {
    return validateBundle(entries, { evaluate: makeVmEvaluator(), seeds: seedCount });
  }

  // The isolated sandbox needs the parsed documents to build render contexts, and those come from
  // a first, execution-free pass. A bundle whose manifest cannot even be read never gets run.
  const structural = validateBundle(entries, { skipExecution: true });
  const seeds = [];
  for (let i = 1; i <= seedCount; i++) seeds.push(String(i));

  const recorded = renderSeedsIsolated({
    sources,
    seeds,
    manifest: structural.manifest,
    marketDocument: structural.marketMappings,
  });

  if (!recorded.ok) {
    const result = validateBundle(entries, { skipExecution: true, seeds: seedCount });
    result.issues.push({ severity: "error", code: "SANDBOX_FAILED", where: "generator/generate.js", message: recorded.error ?? "the sandbox failed" });
    result.summary.errors.push(result.issues[result.issues.length - 1]);
    result.summary.errorCount += 1;
    result.summary.ok = false;
    result.ok = false;
    for (const check of result.checks) {
      if (["RUNTIME_ERRORS", "BLANK_OUTPUTS", "DETERMINISTIC_OUTPUT", "DUPLICATE_RATE"].includes(check.id)) {
        check.status = "fail";
        check.detail = recorded.error ?? "the sandbox failed";
      }
    }
    return result;
  }

  return validateBundle(entries, { evaluate: makeReplayEvaluator(recorded), seeds: seedCount });
}

/** Validates an exported `.relics` file. */
export function validateBundleFile(path, options = {}) {
  const bytes = new Uint8Array(readFileSync(path));
  const container = readContainer(bytes);
  if (options.structuralOnly) return validateBundleBytes(bytes, { skipExecution: true });
  return runValidation(container.byPath, options);
}

/** @param {import("../schema.js").ValidationResult} result */
export function printValidation(result, label) {
  heading(`checks — ${label}`);
  printChecks(result);
  printIssues(result);
  printHashes(result);

  console.log("");
  if (result.execution?.ran) {
    const parts = [`${plural(result.execution.seeds, "seed")} rendered`, result.execution.deterministic ? "deterministic" : "NOT deterministic", `${result.execution.distinctOutputs ?? 0} distinct outputs`];
    if (result.execution.duplicateRate !== null) parts.push(`${(result.execution.duplicateRate * 100).toFixed(1)}% duplicate trait sets`);
    console.log(dim(`  ${parts.join(" · ")}`));
  } else if (result.execution) {
    console.log(yellow(`  generator was not executed: ${result.execution.reason}`));
  }

  if (result.ok) {
    console.log(green(`  OK — ${plural(result.summary.warningCount, "warning")}`));
  } else {
    console.log(red(`  FAILED — ${plural(result.summary.errorCount, "error")}, ${plural(result.summary.warningCount, "warning")}`));
  }
  return result.ok ? 0 : 1;
}
