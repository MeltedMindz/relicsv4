#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// MAINTAINER-SIDE SYNC + PARITY GATE for the PUBLIC launch SDK.
//
// WHY THIS EXISTS. `LaunchParams` is a NINETEEN-FIELD POSITIONAL TUPLE. ABI tuple encoding resolves
// components by position, so a public copy that is one field short does not raise a decode error —
// it shifts every dynamic offset after the missing field and produces a well-formed, WRONG
// transaction. That has already happened once in production: a fifteen-field ABI silently dropped
// two fields and encoded a launch whose burnPolicy read whatever landed in its slot.
//
// Therefore the public SDK does not RE-IMPLEMENT launch semantics; it VENDORS the canonical
// deterministic source verbatim and pins every byte. This script is the only way those files
// change, and `--check` fails if the public tree and the canonical tree have drifted.
//
// PUBLIC CONSUMERS NEVER NEED THE PRIVATE REPO. Everything required to launch is committed here.
// The private path below is consulted ONLY by a maintainer running `--sync` or `--check`.
//
// CLASSIFICATION IS EXPLICIT, PER FILE. Only PUBLIC_SAFE material crosses. A file is public-safe
// when it is deterministic protocol math, a public ABI, a public chain constant, or a type — never
// operator procedure, server credentials, admin selectors, or anything naming private
// infrastructure. The list is written out rather than globbed so that adding a file to the public
// surface is a deliberate, reviewable act.
// ================================================================================================
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = join(HERE, "..");
const SDK = join(PUBLIC_ROOT, "packages", "launch-sdk");
const VENDOR_DIR = join(SDK, "src", "vendor");
const ABI_DIR = join(SDK, "contracts-abi", "rc6");
const VENDOR_JSON = join(SDK, "VENDOR.json");

/** The canonical private tree. Maintainer-side only; absent on a public clone, and that is fine. */
const CANONICAL_ROOT = process.env.RELICS_CANONICAL_ROOT ?? "/Users/melted/Documents/RELICS";
const CANONICAL_SDK = join(CANONICAL_ROOT, "launchpad", "sdk");

/**
 * PUBLIC_SAFE deterministic launch semantics, vendored verbatim.
 *
 * Every entry is one of: the on-chain struct's generated field order, the CREATE2/clone address
 * math, the calldata encoder and its positional ABI refusal, the salt miners, the pool-key lane
 * math, protocol constants, or the typed surface tying them together. None of it embeds a
 * credential, an operator procedure or an admin-only selector — a creator launching their own
 * project runs exactly this code.
 */
const VENDORED_SOURCES = [
  "generated/rc6LaunchParams.ts",
  "types.ts",
  "constants.ts",
  "poolLane.ts",
  "hookMiner.ts",
  "tokenMiner.ts",
  "predict.ts",
  "launchCalldata.ts",
  "creatorEarnings.ts",
  "byteBudget.ts",
  // ADDED after a second look. This was withheld on the belief that it imported the private
  // launch-protection package and a server-shaped creator input; it imports neither. Its only
  // dependencies are `constants.ts`, `types.ts` and `creatorEarnings.ts`, all vendored above. It is
  // the canonical `CreatorInput -> LaunchParams` builder, including the three deliberate
  // asymmetries a reimplementation would have got wrong: `burnPolicy` and `backingUnitsPerArtwork`
  // default because NONE and full parity are real things a creator means by silence, and
  // `antiSnipeMode` does NOT default because the on-chain zero is UNSPECIFIED and the factory
  // refuses it. Reimplementing that from the comments would have been a second `prepare`.
  "params.ts",
];

/** Public ABI artifacts. These are published and source-verified on three block explorers. */
const VENDORED_ABIS = ["LaunchpadFactoryV1.json", "MetadataResolverRc6.json", "ProjectRegistryV1.json", "ProjectCollectionV1.json", "ProjectTokenV1.json", "ArtHookRc6.json", "launch-params.schema.json"];

/**
 * DELIBERATELY NOT VENDORED, with the reason recorded so a later maintainer does not "complete" the
 * set by adding one. Absence here is a decision, not an oversight.
 */
const WITHHELD = {
  "client.ts": "PRIVATE_OPERATOR — binds anvil's well-known dev private keys; the public SDK builds its own clients from a chain profile and never embeds a key.",
  "deploySingletons.ts": "ADMIN_ONLY — deploys protocol singletons. A creator launches a project; they do not deploy the platform.",
  "anvilProcess.ts": "UNRELATED — private test-harness process management.",
  "upgradeability.ts": "ADMIN_ONLY — reads and describes upgrade authority surfaces that only the protocol Safe can exercise.",
  "localfork/": "UNRELATED — private fork fixtures.",
  "multichain/": "PRIVATE_OPERATOR — carries operator deployment wiring beyond what a creator needs.",
  "abi.ts": "REPLACED (THIN) — reads artifacts by filesystem path from the private tree and defaults to RC5. The public SDK loads its own committed contracts-abi/rc6 instead; same artifacts, public path.",
  "simulate.ts": "REPLACED (THIN) — its logic is one eth_call plus a revert decode, but it resolves its ABI through the private abi.ts, which is pinned to the RC5 artifact and reads the private filesystem. The public wrapper passes the committed RC6 ABI to the SAME vendored tuple encoder, so no launch semantics are reimplemented — only the ABI source differs. The public SDK simulates against RC6 and proves the calldata is identical.",
  "readiness.ts": "REPLACED — server-shaped readiness report; the public preflight reads the same chain facts through the public capability layer.",
};

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function readCanonical(rel) {
  const p = join(CANONICAL_SDK, "src", rel);
  if (!existsSync(p)) throw new Error(`canonical source missing: ${p}`);
  return readFileSync(p);
}

/**
 * The ONE mechanical rewrite applied to vendored source, recorded in VENDOR.json so it is auditable
 * rather than invisible. The private tree reaches its sibling packages by relative path; the public
 * tree has the same packages at a different depth. Nothing else about a vendored file changes — no
 * reformatting, no comment edits, no logic changes. A second kind of rewrite must never be added
 * here silently; if one is ever needed, it belongs in this list with its own reason.
 */
const IMPORT_REWRITES = [
  { from: '"../../packages/project-schema/index.js"', to: '"@relics/project-schema"', why: "same package, different depth in the public tree" },
  // NOT a shim, and deliberately not one. `@relics/project-schema` already DECLARES the whole
  // launch-protection vocabulary the vendored files reach for (`DYNAMIC_FEE_FLAG = 0x800000`, the
  // schedule constants, the mode vocabulary) and it is the same declaration the private package
  // mirrors. Pointing the rewrite at a local `protection.js` would have created a SECOND
  // declaration of a protocol constant in the public tree — exactly the drift this repo's
  // one-declaration rule exists to prevent. Verified equal at sync time by `assertOneDeclaration`.
  { from: '"../../packages/launch-protection/index.js"', to: '"@relics/project-schema"', why: "the public schema package is the one declaration of the launch-protection vocabulary" },
];

/**
 * A rewrite that redirects an import to a DIFFERENT package is only safe if that package declares
 * the same values. Checked here, at sync time, against the canonical source — so a public constant
 * that drifts from the private one fails the sync rather than shipping a launch built on it.
 */
async function assertOneDeclaration() {
  const publicSchema = await import(join(PUBLIC_ROOT, "packages", "project-schema", "index.js"));
  const canonicalProtection = await import(join(CANONICAL_ROOT, "launchpad", "packages", "launch-protection", "index.js"));
  const shared = ["DYNAMIC_FEE_FLAG", "ANTI_SNIPE_WINDOW_SECONDS", "ANTI_SNIPE_START_FEE_PIPS", "ANTI_SNIPE_END_FEE_PIPS", "SELL_FEE_PIPS", "PROTECTION_IS_MANDATORY"];
  const mismatches = [];
  for (const name of shared) {
    const pub = publicSchema[name];
    const priv = canonicalProtection[name];
    if (priv === undefined) continue;
    if (pub !== priv) mismatches.push(`${name}: public ${String(pub)} != canonical ${String(priv)}`);
  }
  if (mismatches.length) {
    console.error("[launch-sdk-sync] ONE-DECLARATION VIOLATION — the public schema and the canonical launch-protection disagree:");
    for (const m of mismatches) console.error(`    ${m}`);
    process.exit(1);
  }
  console.log(`[launch-sdk-sync] one-declaration check: ${shared.length} shared protection constants agree`);
}

function applyRewrites(text) {
  let out = text;
  for (const r of IMPORT_REWRITES) out = out.split(r.from).join(r.to);
  return out;
}

const mode = process.argv.includes("--sync") ? "sync" : process.argv.includes("--check") ? "check" : "check";

async function run() {
  await assertOneDeclaration();
  if (!existsSync(CANONICAL_SDK)) {
    console.error(`[launch-sdk-sync] canonical tree not present at ${CANONICAL_SDK}.`);
    console.error("[launch-sdk-sync] This gate is MAINTAINER-SIDE. A public clone does not need it:");
    console.error("[launch-sdk-sync] everything required to launch is committed under packages/launch-sdk.");
    process.exit(mode === "sync" ? 1 : 0);
  }

  mkdirSync(VENDOR_DIR, { recursive: true });
  mkdirSync(join(VENDOR_DIR, "generated"), { recursive: true });
  mkdirSync(ABI_DIR, { recursive: true });

  const record = { $comment: [], generatedBy: "scripts/sync-launch-sdk.mjs", canonicalRoot: "<maintainer-local; not published>", importRewrites: IMPORT_REWRITES, withheld: WITHHELD, sources: {}, abis: {} };
  record.$comment = [
    "PIN FILE for the vendored public launch SDK. Every digest below is of the PUBLIC file as committed.",
    "`upstreamSha256` is the canonical private file it was taken from, BEFORE the recorded import rewrites.",
    "`npm run launch:sync -- --check` fails if either side moved. LaunchParams is a nineteen-field",
    "positional tuple; a public copy one field short encodes silently and wrongly, so this is not",
    "bookkeeping — it is the mechanism that makes a from-memory port impossible.",
  ];

  let drift = 0;
  for (const rel of VENDORED_SOURCES) {
    const upstream = readCanonical(rel);
    const rewritten = Buffer.from(applyRewrites(upstream.toString("utf8")), "utf8");
    const dest = join(VENDOR_DIR, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const entry = { upstreamPath: `launchpad/sdk/src/${rel}`, upstreamSha256: sha256(upstream), publicSha256: sha256(rewritten), bytes: rewritten.length, classification: "PUBLIC_SAFE" };
    if (mode === "sync") {
      writeFileSync(dest, rewritten);
    } else {
      if (!existsSync(dest)) { console.error(`  DRIFT  missing public file: ${rel}`); drift++; continue; }
      const have = sha256(readFileSync(dest));
      if (have !== entry.publicSha256) { console.error(`  DRIFT  ${rel}: public ${have.slice(0, 12)} != canonical-derived ${entry.publicSha256.slice(0, 12)}`); drift++; }
    }
    record.sources[rel] = entry;
  }

  for (const name of VENDORED_ABIS) {
    const src = join(CANONICAL_SDK, "contracts-abi", "rc6", name);
    if (!existsSync(src)) { console.error(`  canonical ABI missing: ${name}`); drift++; continue; }
    const buf = readFileSync(src);
    const dest = join(ABI_DIR, name);
    const entry = { upstreamPath: `launchpad/sdk/contracts-abi/rc6/${name}`, sha256: sha256(buf), bytes: buf.length, classification: "PUBLIC_SAFE" };
    if (mode === "sync") writeFileSync(dest, buf);
    else if (!existsSync(dest) || sha256(readFileSync(dest)) !== entry.sha256) { console.error(`  DRIFT  abi ${name}`); drift++; }
    record.abis[name] = entry;
  }

  if (mode === "sync") {
    writeFileSync(VENDOR_JSON, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`[launch-sdk-sync] vendored ${VENDORED_SOURCES.length} sources + ${VENDORED_ABIS.length} ABIs`);
    console.log(`[launch-sdk-sync] VENDOR.json written`);
  } else {
    if (!existsSync(VENDOR_JSON)) { console.error("  DRIFT  VENDOR.json missing"); drift++; }
    console.log(drift === 0 ? "[launch-sdk-sync] PARITY OK — public vendored SDK matches canonical" : `[launch-sdk-sync] ${drift} DRIFT(S)`);
    if (drift > 0) process.exit(1);
  }
}
await run();
