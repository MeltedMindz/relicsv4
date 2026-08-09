// SPDX-License-Identifier: MIT
// `relics preview` and `relics test-seeds`.
//
// `preview` writes deterministic SVGs (and a contact sheet) so a creator can look at their work.
// `test-seeds` renders a larger sample in the isolated sandbox and reports what the collection
// would actually look like at scale: how many outputs are distinct, how often trait sets repeat,
// and which seeds fail.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildRenderContext, deriveTraits, traitFingerprint, combinationSpace, inspectRenderOutput, outputFingerprint, sha256Utf8, safeJsonParse, fromUtf8 } from "../schema.js";
import { readConfig, readProjectFiles, generatorSources } from "../project.js";
import { createVmModule, renderSeedsIsolated } from "../sandbox.js";
import { bold, cyan, dim, green, red, yellow, heading, plural } from "../report.js";

function loadProject(root) {
  const config = readConfig(root);
  const files = readProjectFiles(root, { includePreviews: false });
  const sources = generatorSources(files);
  const parse = (path) => (files.has(path) ? safeJsonParse(fromUtf8(files.get(path))) : null);
  return { config, files, sources, traitSchema: parse("traits/schema.json"), marketDocument: parse("market/mappings.json") };
}

function manifestLike(config, files) {
  return {
    project: config.project ?? {},
    supply: config.supply ?? {},
    art: { ...(config.art ?? {}), scriptBytes: files.get("generator/generate.js")?.length ?? 0 },
  };
}

/**
 * @param {string} root
 * @param {{ seeds?: string[], count?: number, out?: string, size?: number }} options
 */
export function previewProject(root, options = {}) {
  const { config, files, sources, traitSchema, marketDocument } = loadProject(root);
  const module = createVmModule(sources);
  const outDir = resolve(root, options.out ?? "previews");
  mkdirSync(outDir, { recursive: true });

  const seeds = options.seeds ?? defaultSeeds(config, options.count ?? 8);
  const manifest = manifestLike(config, files);
  const written = [];
  let failures = 0;

  heading(`preview — ${plural(seeds.length, "seed")}`);
  for (const seed of seeds) {
    let svg;
    try {
      svg = module.render(buildRenderContext({ manifest, marketDocument, seed }));
    } catch (err) {
      failures++;
      console.log(`  ${red("FAIL")}  seed ${seed}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const issues = inspectRenderOutput(`seed=${seed}`, svg);
    const errors = issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      failures++;
      console.log(`  ${red("FAIL")}  seed ${seed}: ${errors[0].message}`);
      continue;
    }
    const file = join(outDir, `seed-${sanitize(seed)}.svg`);
    writeFileSync(file, svg);
    written.push({ seed, file, svg });
    const traits = traitSchema ? deriveTraits(traitSchema, seed) : [];
    const traitText = traits.length ? dim(` · ${traits.map((t) => `${t.name}: ${t.value}`).join(", ")}`) : "";
    console.log(`  ${green("ok")}    seed ${bold(seed).padEnd(8)} ${dim(`${svg.length.toLocaleString()} B`)} ${dim(sha256Utf8(svg).slice(0, 12))}${traitText}`);
  }

  if (written.length > 0) {
    const sheet = contactSheet(written, options.size ?? 240);
    // Deliberately at the project root, not inside previews/: the contact sheet is an HTML
    // document, and HTML is not a file type a bundle may carry.
    const sheetPath = resolve(root, "preview-contact-sheet.html");
    writeFileSync(sheetPath, sheet);
    console.log("");
    console.log(`  ${plural(written.length, "preview")} written to ${cyan(outDir)}`);
    console.log(`  contact sheet: ${cyan(sheetPath)}`);
  }
  return failures === 0 ? 0 : 1;
}

/**
 * @param {string} root
 * @param {{ count?: number, inProcess?: boolean }} options
 */
export function testSeeds(root, options = {}) {
  const { config, files, sources, traitSchema, marketDocument } = loadProject(root);
  const count = Math.max(1, Math.min(options.count ?? 100, 1000));
  const seeds = [];
  for (let i = 1; i <= count; i++) seeds.push(String(i));

  heading(`test-seeds — ${plural(count, "seed")} in the isolated sandbox`);
  const recorded = renderSeedsIsolated({ sources, seeds, manifest: manifestLike(config, files), marketDocument, renders: 2 });
  if (!recorded.ok) {
    console.log(`  ${red("FAIL")}  ${recorded.error}`);
    return 1;
  }

  const fingerprints = new Map();
  const traitSets = new Map();
  let failed = 0;
  let nonDeterministic = 0;
  let blank = 0;
  let totalBytes = 0;
  const failures = [];

  for (const seed of seeds) {
    const record = recorded.results[seed];
    if (!record || record.error) {
      failed++;
      if (failures.length < 5) failures.push(`seed ${seed}: ${record?.error ?? "no output"}`);
      continue;
    }
    const [first, second] = record.outputs;
    const issues = inspectRenderOutput(`seed=${seed}`, first).filter((i) => i.severity === "error");
    if (issues.length > 0) {
      if (issues.some((i) => i.code === "RENDER_BLANK")) blank++;
      failed++;
      if (failures.length < 5) failures.push(`seed ${seed}: ${issues[0].message}`);
      continue;
    }
    if (outputFingerprint(first) !== outputFingerprint(second)) {
      nonDeterministic++;
      if (failures.length < 5) failures.push(`seed ${seed}: two renders of the same seed differ`);
    }
    totalBytes += first.length;
    const fp = sha256Utf8(outputFingerprint(first));
    fingerprints.set(fp, (fingerprints.get(fp) ?? 0) + 1);
    if (traitSchema) {
      const key = traitFingerprint(deriveTraits(traitSchema, seed));
      traitSets.set(key, (traitSets.get(key) ?? 0) + 1);
    }
  }

  const rendered = count - failed;
  const distinctOutputs = fingerprints.size;
  const repeatedOutputs = [...fingerprints.values()].filter((n) => n > 1).reduce((sum, n) => sum + n - 1, 0);
  const distinctTraitSets = traitSets.size;
  const duplicateTraitRate = traitSets.size > 0 ? (rendered - distinctTraitSets) / rendered : null;

  console.log("");
  line("rendered", `${rendered} / ${count}`);
  line("failed", failed === 0 ? green("0") : red(String(failed)));
  line("blank", blank === 0 ? green("0") : red(String(blank)));
  line("non-deterministic", nonDeterministic === 0 ? green("0") : red(String(nonDeterministic)));
  line("distinct outputs", `${distinctOutputs}${repeatedOutputs > 0 ? yellow(` (${repeatedOutputs} repeat)`) : ""}`);
  if (rendered > 0) line("average size", `${Math.round(totalBytes / rendered).toLocaleString()} B`);
  if (traitSchema) {
    line("distinct trait sets", String(distinctTraitSets));
    line("trait duplicate rate", `${((duplicateTraitRate ?? 0) * 100).toFixed(1)}%`);
    line("combination space", combinationSpace(traitSchema).toLocaleString());
  }

  if (failures.length > 0) {
    console.log("");
    for (const failure of failures) console.log(`  ${red("·")} ${failure}`);
  }

  console.log("");
  const ok = failed === 0 && nonDeterministic === 0;
  console.log(ok ? green("  every sampled seed rendered deterministically") : red("  the sample found problems"));
  return ok ? 0 : 1;
}

function line(label, value) {
  console.log(`  ${dim(label.padEnd(22))} ${value}`);
}

function defaultSeeds(config, count) {
  const base = config?.art?.seed ? Number(config.art.seed) : 1;
  const start = Number.isFinite(base) ? base : 1;
  const seeds = [];
  for (let i = 0; i < count; i++) seeds.push(String(start + i));
  return seeds;
}

function sanitize(seed) {
  return seed.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32);
}

function contactSheet(written, size) {
  const cells = written
    .map(({ seed, svg }) => {
      const encoded = Buffer.from(svg, "utf8").toString("base64");
      return `<figure><img width="${size}" height="${size}" alt="seed ${escapeHtml(seed)}" src="data:image/svg+xml;base64,${encoded}"><figcaption>${escapeHtml(seed)}</figcaption></figure>`;
    })
    .join("\n");
  return `<!doctype html>
<meta charset="utf-8">
<title>relics preview contact sheet</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 2rem; background: #0b0b0c; color: #e8e6e3; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 { font-size: 14px; letter-spacing: .16em; text-transform: uppercase; color: #8a8681; font-weight: 600; }
  .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(${size}px, 1fr)); }
  figure { margin: 0; }
  img { display: block; width: 100%; height: auto; background: #000; border: 1px solid #26241f; }
  figcaption { margin-top: .4rem; color: #8a8681; }
</style>
<h1>deterministic previews — ${written.length} seeds</h1>
<div class="grid">
${cells}
</div>
`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
