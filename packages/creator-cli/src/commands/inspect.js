// SPDX-License-Identifier: MIT
// `relics inspect` — read a `.relics` file and print exactly what it declares, without running
// anything from it. Useful before importing a bundle someone else sent you.

import { readFileSync } from "node:fs";
import { readContainer, validateBundleBytes, toStudioDraft, decodeArtConfigV1, describeArtConfigV1, isArtConfigV1, isRuntimeLaunchable, ACV1_LIMITS } from "../schema.js";
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
      artConfig: describeBundleArtConfig(result.manifest),
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
    const supplyRelationship = m.protocolTemplate
      ? `${Number(m.supply.genesisTokensPerPossibleNftWhole).toLocaleString()} genesis tokens per possible NFT`
      : m.supply.backingModel;
    row("supply", `${Number(m.supply.totalSupplyWhole).toLocaleString()} whole tokens · ${Number(m.supply.artworkSupply).toLocaleString()} artworks · ${supplyRelationship}`);
    if (m.protocolTemplate) row("protocol", `${m.protocolTemplate.id} · economics ${m.protocolTemplate.economicsSha256}`);
    row("art", `${m.art.runtime}${m.art.templateId ? ` template ${m.art.templateId}` : ""} · seed ${m.art.seed} · ${m.art.scriptBytes.toLocaleString()} script bytes`);
    row("market", `${m.market.launchMode} · ${m.market.startingPreset} tier · ${m.market.mappingCount} mapping(s)`);
    row("anti-snipe", `${m.market.antiSnipeMode ?? "UNSPECIFIED"}`);
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

  if (m?.artBinding) printArtConfig(m);

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

/**
 * The ART CONFIGURATION, decoded and shown.
 *
 * A digest tells a reviewer nothing about what will be drawn. This decodes the bytes the bundle
 * carries and prints the actual palette, the layer graph with its sensors and curves, and the
 * declared traits — so "is this the art I meant?" is answerable by reading the screen rather than
 * by trusting a 64-character string. Nothing is executed to produce it.
 */
function printArtConfig(m) {
  const b = m.artBinding;
  console.log("");
  console.log(bold("  art configuration"));
  row("  format", `${b.artConfigFormat} · ${b.artConfigBytes.toLocaleString()} bytes · runtime ${b.runtimeId} v${b.artRuntimeVersion}`);
  row("  config hash", cyan(`0x${b.artConfigHash}`));
  // THE THREE FLAGS, PRINTED AS FLAGS. Authoring, preview and launch are separate capabilities and
  // a single "launchable: yes/no" answers only the third while reading like a verdict on the
  // project. Same vocabulary as `relics status`, derived from the same schema lists.
  const launchable = isRuntimeLaunchable(b.runtime);
  row(
    "  capability",
    `RUNTIME_AUTHORING=${green("SUPPORTED")}  RUNTIME_PREVIEW=${green("SUPPORTED")}  RUNTIME_LAUNCH=${launchable ? green("SUPPORTED") : yellow("UNAVAILABLE")}`,
  );
  if (!launchable) {
    console.log(
      yellow(
        `    ${b.runtime} projects can be built, previewed and exported now, but this runtime is not yet available\n` +
          "    for on-chain launch. Your project and artwork remain saved.",
      ),
    );
  }
  // Launch capability is also PER CHAIN, and this bundle names no chain. Saying so is the honest
  // scope of the flag above: it reports what this RELEASE implements, not what a target chain has
  // registered, and the launchpad resolves the second one live.
  console.log(dim("    launch capability is additionally resolved per chain, live, against that chain's ArtRuntimeRegistry"));

  if (b.artConfigFormat !== "ACV1" || typeof b.artConfig !== "string") {
    console.log(dim("    the configuration is the generator entry file itself; see generator/generate.js"));
    return;
  }

  const decoded = decodeArtConfigV1(hexBytes(b.artConfig));
  if (!decoded.ok) {
    console.log(red(`    the configuration does not decode: ${decoded.name} (${decoded.code}) — ${decoded.reason}`));
    return;
  }
  const d = describeArtConfigV1(decoded.config, hexBytes(b.artConfig));
  row("  title", d.title ? `"${d.title}"` : dim("(none)"));
  row("  animate", d.animate ? "yes" : "no");
  row("  palette", `${d.palette.join(" ")}   ${dim(`background ${d.background}`)}`);
  console.log(`  ${dim("  layers".padEnd(16))} ${d.layers.length} of ${ACV1_LIMITS.maxLayers}`);
  for (const layer of d.layers) console.log(`      ${layer}`);
  console.log(`  ${dim("  traits".padEnd(16))} ${d.traits.length} of ${ACV1_LIMITS.maxTraits}`);
  for (const trait of d.traits) console.log(`      ${trait}`);
  row("  elements", `${d.worstCaseElements} of ${d.elementBudget} worst case`);
  if (d.appendixBytes > 0) {
    row("  appendix", `${d.appendixBytes} bytes ${dim("— committed by the config hash, never interpreted")}`);
  }
}

/** The same projection, for `--json`. */
function describeBundleArtConfig(manifest) {
  const b = manifest?.artBinding;
  if (!b) return null;
  const base = {
    format: b.artConfigFormat,
    bytes: b.artConfigBytes,
    hash: b.artConfigHash,
    runtimeId: b.runtimeId,
    runtimeVersion: b.artRuntimeVersion,
    launchable: isRuntimeLaunchable(b.runtime),
    // THE SAME THREE FLAGS THE HUMAN OUTPUT PRINTS. `launchable` is kept for compatibility and is
    // the same value as RUNTIME_LAUNCH; it is a narrower question than the one a caller usually
    // means, which is why the other two are stated rather than left to be inferred from it.
    capability: {
      RUNTIME_AUTHORING: "SUPPORTED",
      RUNTIME_PREVIEW: "SUPPORTED",
      RUNTIME_LAUNCH: isRuntimeLaunchable(b.runtime) ? "SUPPORTED" : "UNAVAILABLE",
      // This bundle names no chain, and registration is per chain. A cached per-chain answer here
      // would be the exact false claim this field exists to avoid.
      RUNTIME_LAUNCH_TARGET_CHAIN: "RESOLVED_LIVE_PER_CHAIN_AT_LAUNCH",
    },
  };
  if (b.artConfigFormat !== "ACV1" || typeof b.artConfig !== "string") return { ...base, decoded: null };
  const bytes = hexBytes(b.artConfig);
  if (!isArtConfigV1(bytes)) return { ...base, decoded: null, error: "the configuration does not carry the ACV1 magic and version" };
  const decoded = decodeArtConfigV1(bytes);
  return decoded.ok
    ? { ...base, decoded: decoded.config, describe: describeArtConfigV1(decoded.config, bytes) }
    : { ...base, decoded: null, error: `${decoded.name} (${decoded.code}): ${decoded.reason}` };
}

function hexBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function row(label, value) {
  console.log(`  ${dim(label.padEnd(16))} ${value}`);
}
