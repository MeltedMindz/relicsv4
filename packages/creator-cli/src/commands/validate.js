// SPDX-License-Identifier: MIT
// `relics validate` — run every check against a project directory (or an already-exported bundle)
// without writing anything.

import { readFileSync } from "node:fs";
import { assembleBundle, validateBundle, validateBundleBytes, readContainer, sha256Utf8, fromUtf8, BINDING_SEEDS } from "../schema.js";
// The Wave-1 engines' config codec, handed to the schema rather than reimplemented in it.
import { encodeRuntimeConfig } from "../runtime-config.js";
import { readConfig, readProjectFiles, generatorSources } from "../project.js";
import { renderSeedsIsolated, makeReplayEvaluator, makeVmEvaluator } from "../sandbox.js";
import { checkPreviewDrift } from "../preview-drift.js";
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
 * @param {{ seeds?: number, inProcess?: boolean, status?: string }} [options]
 */
export function validateProject(root, options = {}) {
  const config = readConfig(root);
  const files = readProjectFiles(root);

  const status = options.status ?? "FINAL";
  const probe = assembleBundle({ files, config, status, encodeRuntimeConfig });
  const seedCount = options.seeds ?? 24;

  if (options.inProcess) {
    // The in-process path has no separate recording step, so it renders during validation. It
    // still needs the binding digests up front, which it gets from one throwaway evaluation.
    const outputs = recordBindingOutputsInProcess(probe.entries, probe.manifest);
    const assembled = assembleBundle({ files, config, representativeOutputs: outputs, status, encodeRuntimeConfig });
    const inProcessResult = validateBundle(assembled.entries, { evaluate: makeVmEvaluator(), encodeRuntimeConfig, seeds: seedCount });
    reportPreviewDrift(files, inProcessResult);
    return { ...inProcessResult, assembled };
  }

  const structural = validateBundle(probe.entries, { skipExecution: true, encodeRuntimeConfig });
  const recorded = renderSeedsIsolated({
    sources: generatorSources(probe.entries),
    seeds: seedsToRender(seedCount),
    manifest: structural.manifest,
    marketDocument: structural.marketMappings,
  });

  const representativeOutputs = recorded.ok ? bindingOutputsFrom(recorded) : null;
  // The previews the bundle ships are WRITTEN from this render, never copied from `previews/`.
  // A creator who edits the generator and forgets to re-render cannot ship images of the old art.
  const canonicalPreviews = recorded.ok ? canonicalPreviewsFrom(recorded) : null;
  const assembled = assembleBundle({ files, config, representativeOutputs, canonicalPreviews, status, encodeRuntimeConfig });
  const result = finishValidation(assembled.entries, recorded, seedCount);

  // AND SAY SO. Because assembly now writes previews from the render, the assembled bundle is
  // always fresh — which would make the bundle-level check silently "fix" a stale `previews/`
  // directory and tell the creator nothing. The working tree is compared separately: export
  // produces correct bytes, and validate still reports that the files on disk are behind.
  reportStalePreviewsOnDisk(files, canonicalPreviews, result);
  // AND THE OTHER STALENESS. `previews/` going stale is visible; the SKETCH going stale is not,
  // because both files still hash to themselves. See ../preview-drift.js.
  reportPreviewDrift(files, result);
  return { ...result, assembled };
}

/**
 * Compares the preview sketch against the configuration that is actually launched, and folds the
 * findings into the run's own summary so `validate` and `export` both act on them.
 *
 * This lives in the CLI rather than in the bundle schema on purpose. It is a check on a PROJECT
 * DIRECTORY -- two authored files that must agree -- not a property of the exported bundle, and the
 * schema package is mirrored byte for byte by the production importer, which never sees a project
 * directory at all.
 *
 * @param {Map<string, Uint8Array>} files
 * @param {{issues: any[], summary: {errors: any[], warnings: any[], errorCount: number, warningCount: number}}} result
 */
function reportPreviewDrift(files, result) {
  for (const issue of checkPreviewDrift(files)) {
    result.issues.push(issue);
    if (issue.severity === "error") {
      result.summary.errors.push(issue);
      result.summary.errorCount += 1;
      // `ok` is computed once by the schema's own summarize() and is what the command's exit code
      // and export's refusal both read. An error appended afterwards has to move it, or the run
      // prints the failure and returns 0 — which is the shape of every bug in this review.
      result.ok = false;
      result.summary.ok = false;
    } else {
      result.summary.warnings.push(issue);
      result.summary.warningCount += 1;
    }
  }
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

/**
 * The SVG text for each binding seed, as the generator draws it right now. Returns null on any
 * failure for the same reason `bindingOutputsFrom` does: a partial preview set is a misleading one,
 * and the validator refuses it rather than the builder quietly shipping half.
 * @param {ReturnType<typeof renderSeedsIsolated>} recorded
 */
function canonicalPreviewsFrom(recorded) {
  /** @type {Record<string, string>} */
  const previews = {};
  for (const seed of BINDING_SEEDS) {
    const value = recorded.results?.[seed]?.outputs?.[0];
    if (typeof value !== "string") return null;
    previews[seed] = value;
  }
  return previews;
}

/**
 * Compares `previews/` in the PROJECT DIRECTORY against what the generator currently draws, and
 * adds a real issue for each file that is behind. Warnings, not errors: the exported bundle is
 * correct either way, so this must not block an export — it must stop the creator believing the
 * images in their repo are current.
 * @param {Map<string, Uint8Array>} files
 * @param {Record<string, string> | null} canonicalPreviews
 * @param {any} result
 */
function reportStalePreviewsOnDisk(files, canonicalPreviews, result) {
  if (!canonicalPreviews) return;
  const add = (code, where, message) => {
    const issue = { severity: "warning", code, where, message };
    result.issues.push(issue);
    result.summary.warnings.push(issue);
    result.summary.warningCount += 1;
  };

  let behind = 0;
  for (const [seed, svg] of Object.entries(canonicalPreviews)) {
    const path = `previews/seed-${seed}.svg`;
    const onDisk = files.get(path);
    if (!onDisk) {
      add("PREVIEW_MISSING", path, `${path} does not exist in your project. \`relics export\` writes it into the bundle from the render; run \`relics preview\` to have it on disk too.`);
      continue;
    }
    if (fromUtf8(onDisk) !== svg) {
      behind += 1;
      add("PREVIEW_STALE", path, `${path} shows older art than your generator now draws. The bundle export writes the current render, so the exported file is correct — but the copy in your project is behind. Run \`relics preview\` to refresh it.`);
    }
  }
  if (behind > 0) {
    const check = result.checks?.find((c) => c.id === "PREVIEWS_FRESH");
    if (check && check.status === "pass") check.detail = `bundle previews were written from the render; ${behind} file(s) in previews/ are behind — run \`relics preview\``;
  }
}

/** @param {Map<string, Uint8Array>} entries @param {any} manifest */
function recordBindingOutputsInProcess(entries, manifest) {
  const probe = validateBundle(entries, { evaluate: makeVmEvaluator(), encodeRuntimeConfig, seeds: 1 });
  return probe.execution?.bindingOutputs ?? null;
}

/**
 * @param {Map<string, Uint8Array>} entries
 * @param {{ seeds?: number, inProcess?: boolean }} [options]
 */
export function runValidation(entries, options = {}) {
  const seedCount = options.seeds ?? 24;

  if (options.inProcess) {
    return validateBundle(entries, { evaluate: makeVmEvaluator(), encodeRuntimeConfig, seeds: seedCount });
  }

  // The isolated sandbox needs the parsed documents to build render contexts, and those come from
  // a first, execution-free pass. A bundle whose manifest cannot even be read never gets run.
  const structural = validateBundle(entries, { skipExecution: true, encodeRuntimeConfig });
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
    const result = validateBundle(entries, { skipExecution: true, encodeRuntimeConfig, seeds: seedCount });
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

  return validateBundle(entries, { evaluate: makeReplayEvaluator(recorded), encodeRuntimeConfig, seeds: seedCount });
}

/** Validates an exported `.relics` file. */
export function validateBundleFile(path, options = {}) {
  const bytes = new Uint8Array(readFileSync(path));
  const container = readContainer(bytes);
  if (options.structuralOnly) return validateBundleBytes(bytes, { skipExecution: true, encodeRuntimeConfig });
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
