#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// THE DRIFT GATE for `@relics/project-schema`.
//
// The RELICS Launchpad's web importer does not restate a single rule of the `.relics` format. It
// imports THIS package — mirrored into the launchpad monorepo byte for byte — so a bundle written
// by `relics export` and a bundle read by the studio derive identical hashes by construction rather
// than by agreement.
//
// A mirror is only worth anything if drift is impossible to ship, and "impossible" has to mean
// something on BOTH sides of the boundary. The launchpad's own gate
// (scripts/launchpad/verify-schema-vendor.mjs) hashes its mirror against a VENDOR.json that pins an
// upstream COMMIT of this repository. That protects the launchpad from a mirror that stopped being
// a copy. It cannot protect anyone from THIS repository editing the schema and shipping it, because
// from the launchpad's point of view a new upstream commit is simply a commit it has not synced yet.
//
// So this is the other half, and it lives here because this is where the drift would originate:
//
//   1. SURFACE PIN. Every file the launchpad mirrors is hashed and compared against
//      packages/project-schema/SCHEMA_SURFACE.json, which also carries a single SURFACE_SHA over
//      the whole set. Edit a mirrored file without re-running `--update` and this repository goes
//      red, in the same commit that caused it, naming the file. The pin exists to force the edit to
//      be DECLARED; the checks below are what stop a declaration from being enough.
//
//   2. IMPORTER CONTRACT. The launchpad maps every schema CHECK id onto an import stage and throws
//      at module load if one is unmapped. That is a good gate in the wrong repository: it fires in
//      the launchpad, days later, for a change made here. The pinned check list reproduces the
//      failure at the source.
//
//   3. SECURITY INVARIANTS, asserted independently of any digest. Steps 1 and 2 are checksums of
//      checksums: edit, re-pin, green. These require properties the format must have no matter what
//      any manifest says, so tampering has to defeat a stated invariant rather than re-sign a file.
//
//   4. BEHAVIOURAL COMPATIBILITY. The kit builds a bundle and the hashes are compared against
//      fixtures/production-compat/, a fixture authored HERE and consumed by the launchpad's CI. A
//      change that alters bundle bytes turns both repositories red — this one because the fixture
//      no longer matches what the CLI produces, the launchpad because the fixture it consumes moved.
//
//   5. THE BYTE DIFF, when the launchpad checkout is present (RELICS_LAUNCHPAD_DIR). This is the
//      strongest check and the one that cannot run in public CI, so it is reported as ran/not-ran
//      rather than silently skipped — a check that only passes on one workstation is worse than a
//      weaker check honestly labelled.
//
// Usage:
//   node scripts/check-schema-parity.mjs            # --check (CI)
//   node scripts/check-schema-parity.mjs --update    # re-pin after a deliberate schema change
//   node scripts/check-schema-parity.mjs --self-test # prove the gate fails on drift

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PKG = join(ROOT, "packages", "project-schema");
const SURFACE_FILE = join(PKG, "SCHEMA_SURFACE.json");

/**
 * THE MIRRORED SURFACE — exactly the files the launchpad copies. Kept in this order and in this
 * shape deliberately: if the launchpad's MIRRORED list and this one ever disagree, a file is being
 * copied that nothing here guards, or guarded here and not copied.
 */
const SURFACE_FILES = ["package.json", "index.js", "types.d.ts", "art-config.js", "art-config.d.ts", "fixtures/acv1/vectors.json"];
const SURFACE_DIRS = ["src"];

/**
 * The check ids the importer places in a stage. The launchpad's `assertStageCoverage()` throws on
 * any id it does not map, so ADDING a check here without adding it there breaks the studio at module
 * load. Pinning the list makes that a failure in the repository that caused it.
 */
const IMPORTER_CHECK_CONTRACT = [
  "ALLOWED_DEPENDENCIES",
  "ALLOWED_RUNTIME",
  "ART_BINDING",
  "BLANK_OUTPUTS",
  "CHAIN_FEATURES",
  "COLLECTION_METADATA",
  "CONTAINER_STRUCTURE",
  "DETERMINISTIC_OUTPUT",
  "DUPLICATE_RATE",
  "EARNINGS_CONFIG",
  "HASH_INTEGRITY",
  "LAYOUT_AND_PATHS",
  "MANIFEST_SCHEMA",
  "MARKET_MAPPING_BOUNDS",
  "NO_ARBITRARY_HOOK",
  "NO_EXTERNAL_NETWORK",
  "PREVIEWS_FRESH",
  "PROTOCOL_TEMPLATE",
  "RUNTIME_ERRORS",
  "SCRIPT_BYTE_LIMIT",
  "SECRET_SCAN",
  "SUPPLY_AND_BACKING",
  "TRAIT_SCHEMA",
];

/** Extensions a bundle may never carry, whatever any digest says. */
const MUST_REFUSE_EXTENSIONS = [".sol", ".vy", ".yul", ".wasm", ".exe", ".dll", ".so", ".dylib", ".sh", ".bash", ".bat"];

/** Manifest keys that must stay refused BY NAME — protocol wiring a bundle can never override. */
const MUST_REFUSE_MANIFEST_KEYS = [
  "hook",
  "hookAddress",
  "hookBytecode",
  "bytecode",
  "initCode",
  "contracts",
  "solidity",
  "kernel",
  "economicKernel",
  "liquidityKernel",
  "projectToken",
  "projectCollection",
  "saleEscrow",
  "router",
  "buyback",
  "calls",
  "multicall",
  "delegatecall",
  "scripts",
  "postinstall",
  "quoteAssetRegistry",
  "approvedQuoteAssets",
  "quoteAssetOverride",
  "runtimeCodeHash",
  "scriptPointer",
  "currentSupply",
  "cumulativeBurned",
];

const problems = [];
const notes = [];
function fail(msg) {
  problems.push(msg);
}
function log(msg) {
  console.log(`[schema-parity] ${msg}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function walk(dir, base, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

/** Every mirrored path, relative to the package root, sorted. */
function surfacePaths(root = PKG) {
  const files = [];
  for (const f of SURFACE_FILES) if (existsSync(join(root, f))) files.push(f);
  for (const d of SURFACE_DIRS) {
    if (!existsSync(join(root, d))) continue;
    for (const f of walk(join(root, d), join(root, d))) files.push(`${d}/${f}`);
  }
  return files.sort();
}

/**
 * Per-file digests plus one digest over the whole set. The set digest is what a consumer pins.
 *
 * The digests are recorded as a LIST of `{ path, sha256 }`, not as a `path -> digest` map, and that
 * is not a style choice. A map puts a filename and 64 hex characters on the same line, so
 * `"src/secrets.js": "<64 hex>"` reads to every generic-credential detector — including this
 * repository's own `npm run secrets:scan` — as a secret assigned to a key-like field. The first
 * version of this file did exactly that and turned the secret scan red.
 *
 * The fix is the shape, not an allowlist entry. Teaching the scanner to skip a path is how a
 * scanner stops looking exactly where something could hide; changing the serialization so the file
 * is not credential-shaped costs nothing and leaves the scanner at full strength.
 */
function surfaceDigests(root = PKG) {
  const files = surfacePaths(root).map((path) => ({ path, sha256: sha256(readFileSync(join(root, path))) }));
  const tree = files.map((f) => `${f.path} ${f.sha256}`).join("\n");
  return { files, surfaceSha256: sha256(Buffer.from(`${tree}\n`, "utf8")) };
}

/** The pinned list as a lookup, for comparison. */
function byPath(list) {
  return new Map(list.map((f) => [f.path, f.sha256]));
}

async function loadSchema(root = PKG) {
  return import(`${new URL(`file://${join(root, "index.js")}`).href}?t=${Date.now()}`);
}

// ------------------------------------------------------------------------------ 1. SURFACE PIN

function checkSurfacePin() {
  if (!existsSync(SURFACE_FILE)) {
    fail(`missing ${relative(ROOT, SURFACE_FILE)} — run: node scripts/check-schema-parity.mjs --update`);
    return null;
  }
  const pinned = JSON.parse(readFileSync(SURFACE_FILE, "utf8"));
  const actual = surfaceDigests();
  const pinnedByPath = byPath(pinned.files ?? []);
  const actualByPath = byPath(actual.files);

  for (const [path, digest] of actualByPath) {
    if (!pinnedByPath.has(path)) {
      fail(`NEW mirrored file not in the pin: ${path}. The launchpad mirror would not carry it. Re-run --update and re-sync the mirror.`);
      continue;
    }
    if (pinnedByPath.get(path) !== digest) {
      fail(`CHANGED: packages/project-schema/${path} (pinned ${pinnedByPath.get(path).slice(0, 12)}…, found ${digest.slice(0, 12)}…). ` + `If the change is deliberate: node scripts/check-schema-parity.mjs --update, then re-sync the launchpad mirror.`);
    }
  }
  for (const path of pinnedByPath.keys()) {
    if (!actualByPath.has(path)) fail(`REMOVED: packages/project-schema/${path} is pinned but no longer exists. Re-run --update and re-sync the launchpad mirror.`);
  }
  if (pinned.surfaceSha256 !== actual.surfaceSha256) {
    fail(`SURFACE_SHA drifted (pinned ${String(pinned.surfaceSha256).slice(0, 12)}…, found ${actual.surfaceSha256.slice(0, 12)}…)`);
  }
  return { pinned, actual };
}

// --------------------------------------------------------------------- 2. IMPORTER CONTRACT

function checkImporterContract(schema) {
  const ids = schema.CHECKS.map((c) => c.id).sort();
  const pinned = [...IMPORTER_CHECK_CONTRACT].sort();
  const added = ids.filter((id) => !pinned.includes(id));
  const removed = pinned.filter((id) => !ids.includes(id));
  for (const id of added) {
    fail(
      `the schema declares check "${id}", which the launchpad importer does not place in an import stage. ` +
        `Its assertStageCoverage() throws at module load on an unmapped check, so the studio would fail to build. ` +
        `Add it to CHECK_STAGE in site/app/(launchpad)/lib/bundle/format.ts AND to IMPORTER_CHECK_CONTRACT here, in the same release.`,
    );
  }
  for (const id of removed) {
    fail(`the schema no longer declares check "${id}", but the launchpad importer still maps it. Its assertStageCoverage() throws on an unknown mapping. Remove it there and here, in the same release.`);
  }
  if (added.length === 0 && removed.length === 0) notes.push(`${ids.length} checks, all placed by the importer`);
}

// ------------------------------------------------------------------- 3. SECURITY INVARIANTS

function checkSecurityInvariants(schema) {
  for (const ext of MUST_REFUSE_EXTENSIONS) {
    if (!Object.hasOwn(schema.FORBIDDEN_EXTENSIONS, ext)) {
      fail(`SECURITY: "${ext}" is no longer refused by extension — a bundle could carry it`);
    }
  }
  for (const key of MUST_REFUSE_MANIFEST_KEYS) {
    if (typeof schema.REFUSED_MANIFEST_KEYS[key] !== "string") {
      fail(`SECURITY: manifest key "${key}" is no longer refused by name — a bundle could override protocol wiring`);
    }
    if (schema.MANIFEST_KEYS.includes(key)) {
      fail(`SECURITY: manifest key "${key}" is BOTH refused and accepted — the accepted list wins on a lenient reader`);
    }
  }
  // A reviewed protocol template is an operator's product integration. The published format must
  // never ship one: that is what publishes a launch strategy, and it is the reason the registry is
  // a registry rather than a constant.
  if (schema.REVIEWED_PROTOCOL_TEMPLATE_IDS.length !== 0) {
    fail(
      `SECURITY: the published schema registers reviewed protocol template(s) ${schema.REVIEWED_PROTOCOL_TEMPLATE_IDS.join(", ")}. ` +
        `A concrete template is one operator's commercial configuration — register it from the operator's build, never from this package.`,
    );
  }
  // The container magic is what stops a stray ZIP being read as a bundle, and the draft marker is
  // what stops a rename turning a draft into a launchable file. Neither may quietly change.
  if (schema.BUNDLE_MAGIC !== "relics-project-bundle/1") fail(`SECURITY: the bundle magic changed to ${JSON.stringify(schema.BUNDLE_MAGIC)}; every published bundle would stop reading`);
  if (schema.DRAFT_MAGIC !== "relics-project-draft/1") fail(`SECURITY: the draft marker changed to ${JSON.stringify(schema.DRAFT_MAGIC)}; a renamed draft could import as a bundle`);
  if (schema.BUNDLE_EXTENSION !== ".relics") fail(`SECURITY: the canonical extension changed to ${JSON.stringify(schema.BUNDLE_EXTENSION)}`);
}

// ------------------------------------------------------------- 4. BEHAVIOURAL COMPATIBILITY

const COMPAT_DIR = join(PKG, "fixtures", "production-compat");
const COMPAT_FILE = join(COMPAT_DIR, "compat.json");

async function buildCompatRecord() {
  const { buildCompatibilityFixture } = await import(`${new URL(`file://${join(HERE, "build-production-compat.mjs")}`).href}?t=${Date.now()}`);
  return buildCompatibilityFixture();
}

async function checkBehaviouralCompat() {
  if (!existsSync(COMPAT_FILE)) {
    fail(`missing ${relative(ROOT, COMPAT_FILE)} — run: node scripts/check-schema-parity.mjs --update`);
    return;
  }
  const pinned = JSON.parse(readFileSync(COMPAT_FILE, "utf8"));
  const built = await buildCompatRecord();
  const fields = ["schemaVersion", "creatorKitVersion", "runtimeVersion", "protocolReleaseCompatibility", "bundleSha256", "bundleBytes", "bundleHash", "contentHash", "projectConfigHash", "bundleCommitment", "artConfigHash", "artBindingHash", "studioDraftHash", "productionImportProjectionHash"];
  for (const project of built.projects) {
    const before = pinned.projects.find((p) => p.name === project.name);
    if (!before) {
      fail(`compatibility fixture has no record for "${project.name}" — run --update`);
      continue;
    }
    for (const field of fields) {
      if (before[field] !== project[field]) {
        fail(`COMPAT DRIFT in "${project.name}": ${field} pinned ${JSON.stringify(before[field])}, produced ${JSON.stringify(project[field])}. ` + `The launchpad consumes this fixture; a mismatch means an exported bundle no longer imports to the same values.`);
      }
    }
  }
  for (const before of pinned.projects) {
    if (!built.projects.some((p) => p.name === before.name)) fail(`compatibility fixture pins "${before.name}", which the kit no longer produces — run --update`);
  }
  if (problems.length === 0) notes.push(`${built.projects.length} compatibility bundle(s) reproduce byte for byte`);
}

// ------------------------------------------------------------------------ 5. THE BYTE DIFF

function checkAgainstLaunchpadMirror(actualSurface) {
  const candidates = [process.env.RELICS_LAUNCHPAD_DIR && join(process.env.RELICS_LAUNCHPAD_DIR, "launchpad", "packages", "project-schema"), process.env.RELICS_LAUNCHPAD_SCHEMA_DIR].filter(Boolean);
  const mirror = candidates.find((c) => existsSync(c));
  if (!mirror) {
    return {
      ran: false,
      why: "no launchpad checkout — set RELICS_LAUNCHPAD_DIR to the monorepo root (or RELICS_LAUNCHPAD_SCHEMA_DIR to the mirror) to run it",
    };
  }
  let differing = 0;
  for (const { path, sha256: digest } of actualSurface.files) {
    const there = join(mirror, path);
    if (!existsSync(there)) {
      fail(`the launchpad mirror at ${mirror} does not carry ${path}`);
      differing += 1;
      continue;
    }
    if (sha256(readFileSync(there)) !== digest) {
      fail(`the launchpad mirror at ${mirror} differs at ${path} — re-run its \`--sync\` against this commit`);
      differing += 1;
    }
  }
  return { ran: true, mirror, differing };
}

// ----------------------------------------------------------------------------- self test

/**
 * PROOF THAT THE GATE FAILS ON DRIFT.
 *
 * A gate nobody has watched go red is a decorative gate. This copies the repository's schema and
 * scripts into a scratch tree, applies a real mutation to each, and requires the gate to refuse it.
 * Each mutation is something a person could plausibly do.
 */
async function selfTest() {
  const MUTATIONS = [
    { name: "a mirrored source file is edited without re-pinning", apply: (root) => appendTo(join(root, "packages/project-schema/src/canonical-json.js"), "\n// drift\n") },
    { name: "a new file appears in the mirrored surface", apply: (root) => writeFileSync(join(root, "packages/project-schema/src/extra.js"), "export const x = 1;\n") },
    { name: "a mirrored file is deleted", apply: (root) => rmSync(join(root, "packages/project-schema/src/svg.js")) },
    { name: "the surface pin is re-signed to match an edit (invariants must still catch it)", apply: (root) => { replaceIn(join(root, "packages/project-schema/src/limits.js"), '".sol": "Solidity source cannot travel in a bundle — custom contracts need the separate reviewed process.",', ""); repin(root); } },
    { name: "a refused manifest key is quietly accepted", apply: (root) => { replaceIn(join(root, "packages/project-schema/src/manifest.js"), '  delegatecall: "a bundle cannot describe calls to make",', ""); repin(root); } },
    { name: "a concrete reviewed protocol template is registered in the published package", apply: (root) => { appendTo(join(root, "packages/project-schema/index.js"), '\nimport { registerReviewedProtocolTemplate as _r } from "./src/protocol-templates.js";\n_r({ id: "AN_OPERATORS_PRODUCT_V1", economicsSha256: "' + "a".repeat(64) + '" });\n'); repin(root); } },
    { name: "the schema grows a check the importer does not place", apply: (root) => { replaceIn(join(root, "packages/project-schema/src/validate.js"), '  { id: "CONTAINER_STRUCTURE", title: "container structure" },', '  { id: "CONTAINER_STRUCTURE", title: "container structure" },\n  { id: "BRAND_NEW_CHECK", title: "brand new" },'); repin(root); } },
    { name: "the bundle magic changes", apply: (root) => { replaceIn(join(root, "packages/project-schema/src/version.js"), 'export const BUNDLE_MAGIC = "relics-project-bundle/1";', 'export const BUNDLE_MAGIC = "relics-project-bundle/2";'); repin(root); } },
    { name: "the generator template changes, so exported bundle bytes move", apply: (root) => { appendTo(join(root, "packages/creator-cli/templates/minimal/generator/generate.js"), "\n// drift\n"); repin(root); } },
  ];

  let survived = 0;
  for (const mutation of MUTATIONS) {
    const scratch = mkdtempSync(join(tmpdir(), "relics-parity-selftest-"));
    try {
      for (const dir of ["packages", "scripts"]) cpSync(join(ROOT, dir), join(scratch, dir), { recursive: true });
      mutation.apply(scratch);
      const result = runGateIn(scratch);
      if (result.ok) {
        console.log(`  SURVIVED  ${mutation.name}`);
        survived += 1;
      } else {
        console.log(`  caught    ${mutation.name}`);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  if (survived > 0) {
    console.log("");
    console.log(`FAIL — ${survived} mutation(s) shipped past the gate, so the gate is not testing them.`);
    process.exitCode = 1;
    return;
  }
  console.log("");
  console.log(`OK — ${MUTATIONS.length}/${MUTATIONS.length} drift mutations refused. The gate has been watched failing.`);
}

function appendTo(path, text) {
  writeFileSync(path, readFileSync(path, "utf8") + text);
}
function replaceIn(path, from, to) {
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`self-test could not apply a mutation to ${path}: anchor not found`);
  writeFileSync(path, text.replace(from, to));
}
/** Re-sign the pin, so the mutation reaches the checks that do not depend on it. */
function repin(root) {
  execFileSync(process.execPath, [join(root, "scripts", "check-schema-parity.mjs"), "--update", "--pin-only"], { cwd: root, stdio: "pipe" });
}
function runGateIn(root) {
  try {
    execFileSync(process.execPath, [join(root, "scripts", "check-schema-parity.mjs")], { cwd: root, stdio: "pipe" });
    return { ok: true };
  } catch (err) {
    return { ok: false, output: String(err.stdout ?? "") + String(err.stderr ?? "") };
  }
}

// ---------------------------------------------------------------------------------- update

async function update({ pinOnly }) {
  const actual = surfaceDigests();
  const schema = await loadSchema();
  writeFileSync(
    SURFACE_FILE,
    `${JSON.stringify(
      {
        note: "GENERATED by scripts/check-schema-parity.mjs --update. Pins every file the RELICS Launchpad mirrors. `npm run kit:parity` fails if one of them changes without this being re-generated; the launchpad's own VENDOR.json pins the commit this was generated at.",
        package: JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).name,
        version: schema.SCHEMA_VERSION,
        packageVersion: JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).version,
        creatorKitVersion: schema.CREATOR_KIT_VERSION,
        surfaceSha256: actual.surfaceSha256,
        checks: schema.CHECKS.map((c) => c.id).sort(),
        files: actual.files,
      },
      null,
      2,
    )}\n`,
  );
  log(`pinned ${actual.files.length} mirrored file(s); SURFACE_SHA ${actual.surfaceSha256}`);
  if (pinOnly) return;

  const { writeCompatibilityFixture } = await import(`${new URL(`file://${join(HERE, "build-production-compat.mjs")}`).href}?t=${Date.now()}`);
  const record = await writeCompatibilityFixture();
  log(`wrote ${relative(ROOT, COMPAT_FILE)} with ${record.projects.length} bundle(s)`);
}

// ------------------------------------------------------------------------------------ main

async function check() {
  const surface = checkSurfacePin();
  const schema = await loadSchema();
  checkImporterContract(schema);
  checkSecurityInvariants(schema);
  await checkBehaviouralCompat();
  const mirror = surface ? checkAgainstLaunchpadMirror(surface.actual) : { ran: false, why: "the surface pin could not be read" };

  if (problems.length > 0) {
    log("FAIL — the public schema and the production importer can drift:");
    for (const p of problems) log(`  ${p}`);
    console.log("");
    console.log("PUBLIC_SCHEMA_PRODUCTION_IMPORTER_PARITY=FAIL");
    console.log("PUBLIC_AND_PRODUCTION_SCHEMA_DRIFT_POSSIBLE=YES");
    process.exitCode = 1;
    return;
  }

  for (const n of notes) log(n);
  if (mirror.ran) log(`byte-identical to the launchpad mirror at ${mirror.mirror}`);
  else log(`NOT TESTED: byte-equality against a launchpad mirror — ${mirror.why}`);
  console.log("");
  console.log("PUBLIC_SCHEMA_PRODUCTION_IMPORTER_PARITY=PASS");
  console.log("PUBLIC_AND_PRODUCTION_SCHEMA_DRIFT_POSSIBLE=NO");
}

const argv = process.argv.slice(2);
if (argv.includes("--update")) await update({ pinOnly: argv.includes("--pin-only") });
else if (argv.includes("--self-test")) await selfTest();
else await check();
