// SPDX-License-Identifier: MIT
// `relics validate` — run every check against a project directory (or an already-exported bundle)
// without writing anything.

import { readFileSync } from "node:fs";
import { assembleBundle, validateBundle, validateBundleBytes, readContainer, sha256Utf8, BINDING_SEEDS } from "../schema.js";
import { readConfig, readProjectFiles, generatorSources } from "../project.js";
import { renderSeedsIsolated, makeReplayEvaluator, makeVmEvaluator } from "../sandbox.js";
import { printChecks, printIssues, printHashes, printBinding, heading, green, red, yellow, dim, plural } from "../report.js";

/**
 * The seeds a validation run must render: the sampled range PLUS the fixed binding seeds. The
 * binding's output commitment is over a seed set that never varies, so a `--seeds 4` run and a
 * `--seeds 100` run have to agree about it; that only works if both actually render those seeds.
 * @param {number} seedCount
 */
function seedsToRender(seedCount) {
  const seeds = [];
  for (let i = 1; i <= seedCount; i++) seeds.push(String(i));
  for (const seed of BINDING_SEEDS) if (!seeds.includes(seed)) seeds.push(seed);
  return seeds;
}

/**
 * Validates a project directory: assembles the bundle in memory, then validates the result. This
 * is the same code path `export` uses, so "validate passed" means "export would produce this".
 *
 * TWO PASSES, AND WHY
 * -------------------
 * The manifest commits to what the generator draws, and assembly is pure — it cannot run a
 * sandbox. So the first pass assembles a probe bundle purely to get a render context, renders the
 * fixed binding seeds in the isolated sandbox, and the second pass assembles the REAL bundle with
 * those digests baked in. The probe is never written anywhere and never validated: it exists for
 * exactly as long as it takes to learn the project's name, symbol and artwork supply, none of
 * which the binding influences, so the two passes cannot chase each other.
 *
 * @param {string} root
 * @param {{ seeds?: number, inProcess?: boolean }} [options]
 */
export function validateProject(root, options = {}) {
  const config = readConfig(root);
  const files = readProjectFiles(root);

  const probe = assembleBundle({ files, config });
  const seedCount = options.seeds ?? 24;

  if (options.inProcess) {
    // The in-process path has no separate recording step, so it renders during validation. It
    // still needs the binding digests up front, which it gets from one throwaway evaluation.
    const outputs = recordBindingOutputsInProcess(probe.entries, probe.manifest);
    const assembled = assembleBundle({ files, config, representativeOutputs: outputs });
    return { ...validateBundle(assembled.entries, { evaluate: makeVmEvaluator(), seeds: seedCount }), assembled };
  }

  const structural = validateBundle(probe.entries, { skipExecution: true });
  const recorded = renderSeedsIsolated({
    sources: generatorSources(probe.entries),
    seeds: seedsToRender(seedCount),
    manifest: structural.manifest,
    marketDocument: structural.marketMappings,
  });

  const representativeOutputs = recorded.ok ? bindingOutputsFrom(recorded) : null;
  const assembled = assembleBundle({ files, config, representativeOutputs });
  const result = finishValidation(assembled.entries, recorded, seedCount);
  return { ...result, assembled };
}

/**
 * Pulls the fixed-seed digests out of a completed sandbox recording. Returns null when any binding
 * seed failed to render — a project whose generator throws on one of them has nothing honest to
 * commit to, and the validator says so rather than the builder quietly omitting the field.
 * @param {ReturnType<typeof renderSeedsIsolated>} recorded
 */
function bindingOutputsFrom(recorded) {
  /** @type {Record<string, string>} */
  const outputs = {};
  for (const seed of BINDING_SEEDS) {
    const record = recorded.results?.[seed];
    const value = record?.outputs?.[0];
    if (record?.error || typeof value !== "string") return null;
    outputs[seed] = sha256Utf8(value);
  }
  return outputs;
}

/** @param {Map<string, Uint8Array>} entries @param {any} manifest */
function recordBindingOutputsInProcess(entries, manifest) {
  const probe = validateBundle(entries, { evaluate: makeVmEvaluator(), seeds: 1 });
  return probe.execution?.bindingOutputs ?? null;
}

/**
 * @param {Map<string, Uint8Array>} entries
 * @param {{ seeds?: number, inProcess?: boolean }} [options]
 */
export function runValidation(entries, options = {}) {
  const seedCount = options.seeds ?? 24;

  if (options.inProcess) {
    return validateBundle(entries, { evaluate: makeVmEvaluator(), seeds: seedCount });
  }

  // The isolated sandbox needs the parsed documents to build render contexts, and those come from
  // a first, execution-free pass. A bundle whose manifest cannot even be read never gets run.
  const structural = validateBundle(entries, { skipExecution: true });
  const recorded = renderSeedsIsolated({
    sources: generatorSources(entries),
    seeds: seedsToRender(seedCount),
    manifest: structural.manifest,
    marketDocument: structural.marketMappings,
  });

  return finishValidation(entries, recorded, seedCount);
}

/**
 * Turns a sandbox recording into a validation result, degrading honestly when the sandbox failed.
 * @param {Map<string, Uint8Array>} entries
 * @param {ReturnType<typeof renderSeedsIsolated>} recorded
 * @param {number} seedCount
 */
function finishValidation(entries, recorded, seedCount) {
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
  printBinding(result);

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
