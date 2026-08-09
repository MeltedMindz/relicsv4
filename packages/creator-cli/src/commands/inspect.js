// SPDX-License-Identifier: MIT
// `relics inspect` — read a `.relics` file and print exactly what it declares, without running
// anything from it. Useful before importing a bundle someone else sent you.

import { readFileSync } from "node:fs";
import { readContainer, validateBundleBytes, toStudioDraft } from "../schema.js";
import { bold, cyan, dim, green, red, yellow, heading, truncate } from "../report.js";
import { printChecks, printIssues } from "../report.js";

/**
 * @param {string} path
 * @param {{ json?: boolean, draft?: boolean }} [options]
 */
export function inspectBundle(path, options = {}) {
  const bytes = new Uint8Array(readFileSync(path));
  let container;
  try {
    container = readContainer(bytes);
  } catch (err) {
    console.log(red(`  refused: ${err instanceof Error ? err.message : String(err)}`));
    return 1;
  }

  // Structural only: inspecting a bundle must never execute a stranger's generator.
  const result = validateBundleBytes(bytes, { skipExecution: true });

  if (options.json) {
    const payload = {
      file: path,
      sizeBytes: bytes.length,
      entries: container.entries.map((e) => ({ path: e.path, bytes: e.bytes.length })),
      ok: result.ok,
      checks: result.checks,
      issues: result.issues,
      manifest: result.manifest,
      hashes: result.hashes,
    };
    console.log(JSON.stringify(payload, null, 2));
    return result.ok ? 0 : 1;
  }

  if (options.draft) {
    if (!result.manifest) {
      console.log(red("  the bundle has no readable manifest"));
      return 1;
    }
    console.log(JSON.stringify(toStudioDraft(result, container.byPath), null, 2));
    return result.ok ? 0 : 1;
  }

  const m = result.manifest;
  heading(`bundle — ${path}`);
  console.log(`  ${dim("size")}     ${bytes.length.toLocaleString()} bytes in ${container.entries.length} entries`);
  console.log(`  ${dim("magic")}    ${container.comment}`);
  if (m) {
    console.log("");
    console.log(`  ${bold(m.project.name)} (${m.project.symbol})`);
    console.log(`  ${dim(truncate(m.project.description, 100))}`);
    console.log("");
    row("schema", `${m.schemaVersion}  ${dim(`kit ${m.creatorKitVersion} · runtime ${m.runtimeVersion} · ${m.protocolReleaseCompatibility}`)}`);
    row("supply", `${Number(m.supply.totalSupplyWhole).toLocaleString()} whole tokens · ${Number(m.supply.artworkSupply).toLocaleString()} artworks · ${m.supply.backingModel}`);
    row("art", `${m.art.runtime}${m.art.templateId ? ` template ${m.art.templateId}` : ""} · seed ${m.art.seed} · ${m.art.scriptBytes.toLocaleString()} script bytes`);
    row("market", `${m.market.launchMode} · ${m.market.startingPreset} tier · ${m.market.mappingCount} mapping(s)`);
    row("earnings", `${m.earnings.mode} → ${m.earnings.creatorRecipient}${m.earnings.collaborators.length ? ` + ${m.earnings.collaborators.length} collaborator(s)` : ""}`);
    row("chains", m.chains.requested.join(", "));
    row("license", m.project.license);
    console.log("");
    console.log(bold("  hashes"));
    row("  bundle", cyan(m.integrity.bundleHash));
    row("  project config", cyan(m.integrity.projectConfigHash));
    row("  content", cyan(m.integrity.contentHash));
    row("  generator", m.hashes.generator);
    row("  script", m.hashes.script);
    row("  trait schema", m.hashes.traitSchema);
    row("  market mapping", m.hashes.marketMapping);
    row("  metadata", m.hashes.metadata);
  }

  console.log("");
  console.log(bold("  entries"));
  for (const entry of container.entries) console.log(`    ${entry.path.padEnd(34)} ${dim(`${entry.bytes.length.toLocaleString()} B`)}`);

  heading("structural checks (the generator was NOT executed)");
  printChecks(result);
  printIssues(result);
  console.log("");
  console.log(result.ok ? green("  the bundle is structurally sound") : red("  the bundle is not importable as-is"));
  if (result.ok) console.log(yellow("  run `relics validate --bundle <file>` to also execute the generator in a sandbox"));
  return result.ok ? 0 : 1;
}

function row(label, value) {
  console.log(`  ${dim(label.padEnd(16))} ${value}`);
}
