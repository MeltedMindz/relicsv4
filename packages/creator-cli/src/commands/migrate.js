// SPDX-License-Identifier: MIT
// `relics migrate` — open a bundle exported by an older creator kit into a project directory you
// can finish and re-export.
//
// WHAT THIS COMMAND WILL NOT DO, AND WHY THAT IS THE FEATURE.
//
// Schema 3 requires an ACV1 art configuration: per layer a market SENSOR and a response CURVE, plus
// a literal RGB palette and a background index. A schema 2 Solidity bundle contains none of those.
// Its `generator/params.json` carries things like `paletteIndex: 0` — an index into a colour table
// that exists only inside that template's local PREVIEW sketch, a sketch which then overrides the
// index at render time from market state. There is no rule that turns those values into an artwork
// without inventing the artist's choices.
//
// So this command carries over everything that IS recoverable — the project identity, the supply,
// the earnings split, the trait schema, the market mappings, the metadata, the assets, the
// generator — and writes an art configuration in which every artist-supplied field is explicitly
// `null`. `relics export` refuses those nulls by name. Nothing is defaulted, nothing is borrowed
// from a template, and the creator is told exactly which decisions are theirs to make.
//
// The original bundle's hash is preserved as migration provenance. The re-export mints a new one:
// a different artwork is a different bundle, and pretending otherwise would be the lie this whole
// format exists to prevent.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  readContainer,
  fromUtf8,
  stableJsonText,
  parseSemver,
  SCHEMA_VERSION,
  CREATOR_KIT_VERSION,
  explainIncompatibility,
  emptyArtConfigV1,
  ACV1_LAYER_KINDS,
  ACV1_LAYER_SENSORS,
  ACV1_CURVES,
  ACV1_TRAIT_SOURCES,
  ACV1_TRAIT_STYLES,
  ACV1_LIMITS,
} from "../schema.js";
import { bold, cyan, dim, green, red, yellow, heading } from "../report.js";

/** Entries a migration copies across untouched. Everything here is runtime-independent. */
const CARRIED = ["generator/generate.js", "traits/schema.json", "market/mappings.json", "metadata/collection.json", "README.md", "LICENSE"];

/**
 * @param {string} path a `.relics` file exported by any schema version
 * @param {{ out?: string }} [options]
 */
export function migrateBundle(path, options = {}) {
  const bytes = new Uint8Array(readFileSync(path));

  let container;
  try {
    container = readContainer(bytes);
  } catch (err) {
    console.log(red(`  refused: ${err instanceof Error ? err.message : String(err)}`));
    return 1;
  }

  const manifestBytes = container.byPath.get("relics.project.json");
  if (!manifestBytes) {
    console.log(red("  the file carries no manifest; it is not a .relics bundle"));
    return 1;
  }
  const manifest = JSON.parse(fromUtf8(manifestBytes));
  const from = manifest.schemaVersion;
  const parsed = parseSemver(from);

  heading(`migrate — ${path}`);
  console.log(`  ${dim("from")}   schema ${from}${manifest.creatorKitVersion ? dim(` (creator kit ${manifest.creatorKitVersion})`) : ""}`);
  console.log(`  ${dim("to")}     schema ${SCHEMA_VERSION} ${dim(`(creator kit ${CREATOR_KIT_VERSION})`)}`);

  if (!parsed) {
    console.log(red(`  "${from}" is not a schema version this kit understands`));
    return 1;
  }
  if (parsed.major === parseSemver(SCHEMA_VERSION).major) {
    console.log(green(`\n  nothing to migrate — this bundle is already schema ${from}.`));
    return 0;
  }
  if (parsed.major > parseSemver(SCHEMA_VERSION).major) {
    console.log(red(`\n  ${explainIncompatibility(from)}`));
    return 1;
  }

  const target = resolve(options.out ?? `${(manifest.project?.symbol ?? "project").toLowerCase()}-migrated`);
  if (existsSync(target)) {
    console.log(red(`\n  ${target} already exists — choose an empty directory with --out`));
    return 1;
  }

  // ---- what carries over ---------------------------------------------------------------------
  const written = [];
  const write = (relative, contents) => {
    const file = join(target, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
    written.push(relative);
  };

  for (const entry of CARRIED) {
    const content = container.byPath.get(entry);
    if (content) write(entry, Buffer.from(content));
  }
  for (const [entryPath, content] of container.byPath) {
    if (entryPath.startsWith("assets/") || entryPath.startsWith("previews/")) write(entryPath, Buffer.from(content));
  }

  write(
    "relics.config.json",
    stableJsonText({
      project: manifest.project,
      supply: manifest.supply,
      art: { runtime: manifest.art?.runtime, templateId: manifest.art?.templateId ?? null, seed: manifest.art?.seed },
      // A pre-4.0.0 bundle carries no election. UNSPECIFIED is written rather than a guess: the
      // migration's whole job is to hand back a draft the creator finishes, and inventing NONE
      // here would silently choose a fee schedule on their behalf.
      market: {
        startingPreset: manifest.market?.startingPreset,
        launchMode: manifest.market?.launchMode,
        antiSnipeMode: manifest.market?.antiSnipeMode ?? "UNSPECIFIED",
      },
      earnings: manifest.earnings,
      chains: manifest.chains,
    }),
  );

  // ---- what does not, and must be supplied ---------------------------------------------------
  const isSolidity = manifest.art?.runtime === "SOLIDITY_SVG";
  const missing = [];

  if (isSolidity) {
    const old = container.byPath.get("generator/params.json");
    const oldParams = old ? JSON.parse(fromUtf8(old)) : null;

    missing.push(
      "palette — literal #RRGGBB colours. A schema 2 bundle names a palette INDEX into a table that lives in its template's preview sketch, not in the bundle. Choosing colours from that table would be publishing a template's palette under your name.",
      "background — which palette entry the artwork sits on. Schema 2 has no such field.",
      "layers[].sensor — which market reading drives each layer. Schema 2 records none.",
      "layers[].curve — how each layer responds to its sensor. Schema 2 records none.",
      "layers[].kind, amountMin, amountMax — the primitive and the band it sweeps.",
      "traits[].source and traits[].style — a schema 2 trait schema lists VALUE NAMES, not the sensor or DNA slot a value comes from.",
      "animate — whether the artwork carries motion.",
    );

    write(
      "generator/params.json",
      stableJsonText({
        ...emptyArtConfigV1(),
        title: manifest.project?.name ? String(manifest.project.name).slice(0, ACV1_LIMITS.maxTitle) : null,
        _migration: {
          note: "EVERY null BELOW IS A DECISION ONLY YOU CAN MAKE. `relics export` refuses this file until they are filled in. Nothing here was guessed from a template, on purpose: art derived from a generic template is exactly what this format exists to prevent.",
          fromSchemaVersion: from,
          sourceBundleHash: manifest.integrity?.bundleHash ?? null,
          previousParameters: oldParams,
          previousParametersNote:
            "Your schema 2 parameters, kept for reference only. They are NOT an art configuration and nothing reads them: they name no market sensor, no response curve and no literal colour.",
          vocabularies: {
            "layers[].kind": ACV1_LAYER_KINDS,
            "layers[].sensor": ACV1_LAYER_SENSORS,
            "layers[].curve": ACV1_CURVES,
            "traits[].source": ACV1_TRAIT_SOURCES,
            "traits[].style": ACV1_TRAIT_STYLES,
          },
          bounds: {
            palette: `1..${ACV1_LIMITS.maxPalette} colours`,
            layers: `1..${ACV1_LIMITS.maxLayers}, each amountMax 1..${ACV1_LIMITS.maxLayerElements}, summing to at most ${ACV1_LIMITS.maxTotalElements}`,
            traits: `0..${ACV1_LIMITS.maxTraits}, names 1..${ACV1_LIMITS.maxTraitName} printable ASCII without quote or backslash`,
            title: `0..${ACV1_LIMITS.maxTitle} characters`,
          },
        },
      }),
    );
  }

  write(
    "MIGRATION.md",
    [
      `# Migrated from schema ${from} to ${SCHEMA_VERSION}`,
      "",
      `Source bundle hash: \`${manifest.integrity?.bundleHash ?? "unknown"}\``,
      "",
      "This directory is a DRAFT. It cannot be launched, and it is not a bundle: re-export it with",
      "`relics export` once the art configuration is complete.",
      "",
      "## Carried over",
      "",
      ...written.filter((f) => f !== "MIGRATION.md").map((f) => `- \`${f}\``),
      "",
      "## You must supply",
      "",
      ...(missing.length ? missing.map((m) => `- ${m}`) : ["- nothing; this runtime's configuration is its generator."]),
      "",
      "## Why these could not be migrated",
      "",
      "Schema 3 requires an ACV1 art configuration: a literal palette, and for every layer a market",
      "sensor and a response curve. A schema 2 bundle records none of them. The nearest thing it has",
      "is a palette INDEX into a colour table that exists only inside its template's local preview",
      "sketch — and that sketch overrides the index at render time from market state. Deriving an",
      "artwork from it would mean choosing a generic template's colours and publishing them as",
      "yours.",
      "",
      "The re-export will produce a NEW bundle hash. That is correct: the configuration is new, so",
      "the bundle is a different bundle, and the original hash above is kept as provenance rather",
      "than reused.",
      "",
    ].join("\n"),
  );

  console.log("");
  console.log(bold("  carried over"));
  for (const file of written) console.log(`    ${file}`);

  if (missing.length > 0) {
    console.log("");
    console.log(bold(yellow("  you must supply")));
    for (const item of missing) console.log(`    ${yellow("·")} ${item}`);
  }

  console.log("");
  console.log(`  ${dim("source bundle hash")}  ${cyan(manifest.integrity?.bundleHash ?? "unknown")}  ${dim("(kept as provenance; the re-export mints a new one)")}`);
  console.log("");
  console.log(green(`  draft written to ${target}`));
  console.log(dim(`  edit generator/params.json, then: relics validate ${target}`));
  console.log("");
  console.log(yellow("  this draft is NOT launchable until it is re-exported — export refuses an incomplete art configuration by name."));
  return 0;
}
