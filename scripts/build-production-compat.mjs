#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Builds the PRODUCTION-COMPATIBILITY FIXTURE: bundles produced by this kit, with every value the
// RELICS Launchpad importer derives from them recorded beside the bytes.
//
// WHY THE FIXTURE IS AUTHORED HERE AND CONSUMED THERE. The launchpad's importer imports this
// package, so both sides run identical code and a hash comparison between them is a tautology —
// right up until one side changes. The fixture breaks the tautology by freezing the ANSWERS at a
// point in time: this repository re-derives them on every run (so a change here goes red here), and
// the launchpad checks its own pipeline against the same file (so a change here goes red there too,
// on the next sync). Neither repository can make the other green by editing itself.
//
// EVERY BUNDLE HERE IS BUILT BY THE PUBLIC CREATOR PATH — `relics init`, fill the creator
// recipient, validate, export — never by reaching into the assembler or copying a fixture. A
// compatibility record built by a private path proves the private path works.
//
// NOTHING PRIVATE TRAVELS. The projects are the shipped templates, the creator recipient is a
// documented burn-style test address, and no server, key, credential or deployment state is read.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, readContainer, toStudioDraft, validateBundleBytes } from "../packages/project-schema/index.js";
import { initProject } from "../packages/creator-cli/src/commands/init.js";
import { validateProject } from "../packages/creator-cli/src/commands/validate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT_DIR = join(ROOT, "packages", "project-schema", "fixtures", "production-compat");

/**
 * The creator recipient every compatibility project is exported with.
 *
 * A DETERMINISTIC TEST ADDRESS, and the SAME pair the `.relics` fixture corpus already uses, so the
 * repository has one convention rather than two. It cannot be a recognisable placeholder — the
 * validator refuses `0x…dEaD`, all-repeated nibbles and dead/beef patterns by name, which is the
 * whole point of `EARNINGS_RECIPIENT_PLACEHOLDER`: a bundle that names a placeholder payee is worse
 * than one that fails to build, because it launches and pays nobody.
 *
 * It also cannot be a well-known development address (a Hardhat or Anvil default), because those
 * have PUBLISHED private keys and this fixture is public: naming one would put a spendable-by-anyone
 * address into a document that reads like a worked example.
 */
export const COMPAT_CREATOR_RECIPIENT = "0x7A6f3B4c2D1e0F9a8B7c6D5e4F3a2B1c0D9e8F7a";
const COMPAT_COLLABORATOR = "0x4d5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d3E";

/**
 * The templates the fixture covers, each with an EXPLICIT project name and symbol.
 *
 * Explicit is load-bearing. `relics init` derives both from the directory name when they are not
 * given, and these projects are built in `mkdtemp` directories, so an implicit name would put a
 * random suffix into the manifest and every recorded digest would change on every run. The kit is
 * right to derive a default; a fixture is wrong to rely on one.
 */
const PROJECTS = [
  { name: "minimal", template: "minimal", projectName: "Compat Minimal", symbol: "CMPMIN" },
  { name: "market-responsive", template: "market-responsive", projectName: "Compat Market Responsive", symbol: "CMPMKT" },
  { name: "solidity-svg-params", template: "solidity-svg-params", projectName: "Compat Solidity SVG", symbol: "CMPSVG" },
];

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Json(value) {
  return sha256Hex(Buffer.from(canonicalJson(value), "utf8"));
}

/** Silence `relics init`'s console output; the fixture builder reports its own lines. */
function quietly(fn) {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
}

/**
 * Runs one project all the way through the public creator path and returns its compatibility record
 * plus the exported bytes.
 * @param {{ name: string, template: string }} project
 */
export function buildOne(project) {
  const dir = mkdtempSync(join(tmpdir(), `relics-compat-${project.name}-`));
  try {
    const code = quietly(() => initProject(dir, { template: project.template, name: project.projectName, symbol: project.symbol, force: true }));
    if (code !== 0) throw new Error(`relics init failed for template ${project.template}`);

    // THE ONE EDIT A CREATOR MUST MAKE. The scaffold ships a placeholder recipient and the exporter
    // refuses it, so substituting a real address is part of the path, not a shortcut around it.
    const configPath = join(dir, "relics.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.earnings.creatorRecipient = COMPAT_CREATOR_RECIPIENT;
    // A template scaffolds as a DRAFT: market.antiSnipeMode ships UNSPECIFIED so no project
    // launches on a fee schedule its author never chose. A compatibility fixture is FINAL, so it
    // elects here exactly as a creator would — NONE keeps the opening fees flat across fixtures.
    config.market.antiSnipeMode = "NONE";
    if (config.earnings.collaborators?.length) config.earnings.collaborators[0].recipient = COMPAT_COLLABORATOR;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const { assembled, ...validation } = validateProject(dir, { seeds: 8 });
    if (!validation.ok) {
      const codes = validation.summary.errors.map((e) => `${e.code} ${e.where}`).join("; ");
      throw new Error(`${project.name} does not validate, so it cannot be a compatibility fixture: ${codes}`);
    }

    const bytes = Buffer.from(assembled.bytes);

    // RE-READ THE EXPORTED BYTES and derive everything from them, exactly as an importer does.
    // Recording values from the assembler's in-memory result would prove the assembler agrees with
    // itself; the importer only ever sees the file.
    const report = validateBundleBytes(new Uint8Array(bytes), { skipExecution: true });
    if (!report.manifest) throw new Error(`${project.name}: the exported bundle could not be re-read`);
    const container = readContainer(new Uint8Array(bytes));

    // The projection the launchpad computes at site/app/(launchpad)/lib/bundle/inspect.ts, with the
    // same options: a fixed draft id and updatedAt 0, so it stays a pure function of the bundle.
    const projection = toStudioDraft(report, container.byPath, { draftId: "imported", updatedAt: 0 });

    const manifest = report.manifest;
    return {
      bytes,
      record: {
        name: project.name,
        template: project.template,
        schemaVersion: manifest.schemaVersion,
        creatorKitVersion: manifest.creatorKitVersion,
        runtimeVersion: manifest.runtimeVersion,
        protocolReleaseCompatibility: manifest.protocolReleaseCompatibility,
        status: manifest.status ?? "FINAL",
        artRuntime: manifest.art.runtime,
        runtimeId: manifest.artBinding.runtimeId,
        bundleFile: `${project.name}.relics`,
        bundleBytes: bytes.length,
        /** sha256 of the container FILE. Compare this before trusting any other value here. */
        bundleSha256: sha256Hex(bytes),
        /** The schema's own hashes, re-derived from the file. */
        bundleHash: report.hashes.bundleHash,
        contentHash: report.hashes.contentHash,
        projectConfigHash: report.hashes.projectConfigHash,
        bundleCommitment: manifest.integrity.bundleCommitment,
        artConfigHash: manifest.artBinding.artConfigHash,
        /** One digest over the whole art binding, so a single field moving is visible. */
        artBindingHash: sha256Json(manifest.artBinding),
        /** The studio draft the importer lands the creator on. */
        studioDraftHash: sha256Json(projection.draft),
        /** The whole projection: draft plus the provenance block the importer displays. */
        productionImportProjectionHash: sha256Json(projection),
        /** Entry inventory, so a bundle that gained or lost a file is legible without unzipping. */
        entries: container.entries.map((e) => e.path).sort(),
      },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every project's record, with no files written. Used by the parity gate's --check path. */
export function buildCompatibilityFixture() {
  return {
    note: "Compatibility contract between the public creator kit and the RELICS Launchpad importer. Authored by scripts/build-production-compat.mjs in the creator-kit repo; consumed by the launchpad's CI. Never hand-edit: a mismatch is a drift bug, not a reason to move the contract.",
    creatorRecipient: COMPAT_CREATOR_RECIPIENT,
    projects: PROJECTS.map((p) => buildOne(p).record),
  };
}

/** Writes the fixture directory: one `.relics` per project plus compat.json. */
export function writeCompatibilityFixture() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const projects = [];
  for (const project of PROJECTS) {
    const { bytes, record } = buildOne(project);
    writeFileSync(join(OUT_DIR, record.bundleFile), bytes);
    projects.push(record);
  }
  const fixture = {
    note: "Compatibility contract between the public creator kit and the RELICS Launchpad importer. Authored by scripts/build-production-compat.mjs in the creator-kit repo; consumed by the launchpad's CI. Never hand-edit: a mismatch is a drift bug, not a reason to move the contract.",
    creatorRecipient: COMPAT_CREATOR_RECIPIENT,
    projects,
  };
  writeFileSync(join(OUT_DIR, "compat.json"), `${JSON.stringify(fixture, null, 2)}\n`);
  writeFileSync(
    join(OUT_DIR, "README.md"),
    [
      "# production-compat",
      "",
      "Bundles produced by the public creator path (`relics init` -> fill the creator recipient ->",
      "`relics validate` -> `relics export`), with every value the RELICS Launchpad importer derives",
      "from them recorded in `compat.json`.",
      "",
      "GENERATED. Re-create with:",
      "",
      "    npm run kit:parity:update",
      "",
      "Never hand-edit a bundle or a digest here. If a value moved, either the kit changed what it",
      "exports or the importer changed what it derives — both are drift, and the fix is upstream of",
      "this directory.",
      "",
      "`creatorRecipient` is a deterministic test address with no known key — the same one the",
      "`.relics` fixture corpus uses. It is not a real payee, and it is deliberately not a Hardhat or",
      "Anvil default, whose private keys are published.",
      "",
    ].join("\n"),
  );
  return fixture;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fixture = writeCompatibilityFixture();
  for (const p of fixture.projects) console.log(`  ${p.name.padEnd(22)} ${p.bundleBytes.toLocaleString().padStart(8)} bytes  sha256 ${p.bundleSha256.slice(0, 16)}…`);
  console.log(`\n  wrote ${fixture.projects.length} compatibility bundle(s) to packages/project-schema/fixtures/production-compat/`);
}
