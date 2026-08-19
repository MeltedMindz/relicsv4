#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// GENERATION SYNC — regenerates the platform deployment records in
// `packages/project-schema/src/deployments.js` FROM the launchpad's own deployment packages.
//
//   node scripts/sync-deployments.mjs --check     verify the kit matches the packages (CI)
//   node scripts/sync-deployments.mjs --sync      rewrite the kit's records from the packages
//
// WHY THIS IS A COMMAND AND NOT A HAND EDIT
// -----------------------------------------
// A creator kit that publishes a factory address is telling a creator "this is the contract your
// bundle will be launched through". Typing that address by hand is how it ends up correct for the
// wrong generation, or correct for a package that was never broadcast. Both are addresses a reader
// has no way to detect as wrong.
//
// THE ONE RULE THIS SCRIPT ENFORCES ABOVE ALL OTHERS
// --------------------------------------------------
// AN ADDRESS IS PUBLISHED ONLY FROM A PACKAGE THAT WAS ACTUALLY BROADCAST. A deployment package
// carries deterministic addresses long before anything exists at them, and those addresses are
// re-derived from the source tree — a change to the factory moves every one of them, including
// mined hook addresses. So `signed: true` and `broadcast: true` are required, and a package that
// lacks them produces a `null` record with a stated reason rather than a copyable address.
//
// WHAT IS NEVER COPIED
// --------------------
// The launchpad's packages carry operational material this repository must never contain: the
// broadcaster/agent wallet, Safe owner addresses, RPC endpoints, funding requirements, simulation
// traces. Extraction is an ALLOWLIST of field paths, and there is an explicit denylist on top of it
// that fails the run if a forbidden key ever appears in the extracted output — so a future change to
// the package shape cannot smuggle one through by being merely unanticipated.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DEPLOYMENTS_JS = join(ROOT, "packages", "project-schema", "src", "deployments.js");

/** Where the launchpad monorepo is checked out. There is no default and no network fetch. */
const LAUNCHPAD_DIR = process.env.RELICS_LAUNCHPAD_DIR ?? null;

/** Generations this script manages, and where each one's packages live inside the monorepo. */
const GENERATION_PACKAGE_DIRS = { RC6: join("deployments", "rc6") };

/**
 * The ONLY fields read out of a package. Anything not listed is not extracted, so a new key in the
 * launchpad's package format arrives here as "not carried" rather than as "carried by accident".
 */
const EXTRACTED_FIELDS = ["generation", "sourceCommit", "chainId", "chain", "status", "signed", "broadcast"];

/**
 * Keys that must never appear in extracted output, at any depth. This is the belt to the allowlist's
 * braces: the allowlist decides what is taken, this decides what is unacceptable even if taken.
 */
const FORBIDDEN_KEYS = [
  "broadcaster",
  "safe",
  "owners",
  "endpoint",
  "rpc",
  "rpcUrl",
  "privateKey",
  "mnemonic",
  "keystore",
  "funding",
  "simulation",
  "signature",
  "signatures",
  "AGENT_WALLET_BROADCASTER",
  "AGENT_WALLET_TEMPORARY_OWNER",
];

function log(msg) {
  console.log(`[deployments] ${msg}`);
}

function fail(msg) {
  console.error(`[deployments] ${msg}`);
  process.exitCode = 1;
}

/** Recursively assert nothing forbidden is present. @param {unknown} value @param {string} path */
function assertNothingPrivate(value, path = "") {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNothingPrivate(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        throw new Error(`REFUSING TO PUBLISH: extracted record contains "${key}" at ${path || "<root>"} — that is operational material, not a public deployment fact`);
      }
      assertNothingPrivate(v, path ? `${path}.${key}` : key);
    }
  }
}

/**
 * Reads one generation's packages and returns a per-chain record.
 * @param {string} generation
 * @returns {{ generation: string, sourceCommit: string|null, chains: Record<number, any> }}
 */
function readGeneration(generation) {
  if (!LAUNCHPAD_DIR) throw new Error("set RELICS_LAUNCHPAD_DIR to the launchpad monorepo checkout — this script reads its deployment packages and never fetches anything");
  const dir = join(LAUNCHPAD_DIR, GENERATION_PACKAGE_DIRS[generation]);
  if (!existsSync(dir)) throw new Error(`no ${generation} deployment packages at ${dir}`);

  /** @type {Record<number, any>} */
  const chains = {};
  let sourceCommit = null;
  let tag = null;

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const pkg = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const extracted = {};
    for (const field of EXTRACTED_FIELDS) if (field in pkg) extracted[field] = pkg[field];
    assertNothingPrivate(extracted, file);

    const chainId = Number(extracted.chainId);
    if (!Number.isInteger(chainId)) throw new Error(`${file}: no usable chainId`);
    tag ??= extracted.generation ?? null;
    sourceCommit ??= extracted.sourceCommit ?? null;

    // THE RULE. Deterministic is not deployed.
    const live = extracted.signed === true && extracted.broadcast === true;
    chains[chainId] = live
      ? { deployed: true, file, status: extracted.status ?? null }
      : { deployed: false, file, status: extracted.status ?? null, why: `package is ${extracted.status ?? "not broadcast"} (signed: ${extracted.signed === true}, broadcast: ${extracted.broadcast === true})` };
  }

  if (Object.keys(chains).length === 0) throw new Error(`${generation}: no packages found in ${dir}`);
  return { generation, tag, sourceCommit, chains };
}

/** The literal the generated block in deployments.js should contain, for one generation. */
function renderBlock(record) {
  const lines = [];
  for (const chainId of Object.keys(record.chains).map(Number).sort((a, b) => a - b)) {
    const entry = record.chains[chainId];
    if (!entry.deployed) {
      lines.push(`  ${chainId}: null, // not deployed — ${entry.why}`);
      continue;
    }
    lines.push(`  ${chainId}: /* PUBLISHED FROM ${entry.file} */ null, // TODO: --sync must fill contracts once a package is broadcast`);
  }
  return lines.join("\n");
}

/**
 * The current block in deployments.js for `generation`, as text.
 * @param {string} generation
 */
function currentBlock(generation) {
  const source = readFileSync(DEPLOYMENTS_JS, "utf8");
  const marker = `export const ${generation}_DEPLOYMENTS = Object.freeze({`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`deployments.js has no ${generation}_DEPLOYMENTS block`);
  const end = source.indexOf("\n});", start);
  if (end === -1) throw new Error(`deployments.js: ${generation}_DEPLOYMENTS block is not terminated`);
  return { source, start: start + marker.length + 1, end, text: source.slice(start + marker.length + 1, end) };
}

function normalize(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function run(mode) {
  const generations = Object.keys(GENERATION_PACKAGE_DIRS);
  let changed = 0;

  for (const generation of generations) {
    const record = readGeneration(generation);
    const wanted = renderBlock(record);
    const block = currentBlock(generation);

    const deployedChains = Object.entries(record.chains).filter(([, e]) => e.deployed);
    if (deployedChains.length > 0 && mode === "--sync") {
      // A broadcast package means real addresses exist and this script's extraction allowlist has
      // to be widened deliberately, with the contract names named. Refusing loudly is the right
      // behaviour: silently writing a partial record would publish half a platform.
      throw new Error(
        `${generation}: ${deployedChains.length} package(s) report signed+broadcast, so real addresses now exist. ` +
          `Widen EXTRACTED_FIELDS in this script to name the contracts to publish (and only those), then re-run --sync. ` +
          `This refuses rather than writing a record with no addresses in it.`,
      );
    }

    if (normalize(block.text) === normalize(wanted)) {
      log(`${generation}: matches ${Object.keys(record.chains).length} package(s) at ${String(record.sourceCommit).slice(0, 8)} — ${deployedChains.length} deployed`);
      continue;
    }

    if (mode === "--check") {
      fail(`${generation}_DEPLOYMENTS in ${relative(ROOT, DEPLOYMENTS_JS)} does not match the launchpad packages.`);
      console.error("--- kit says ---");
      console.error(block.text.replace(/\n$/, ""));
      console.error("--- packages say ---");
      console.error(wanted);
      console.error(`Fix with: RELICS_LAUNCHPAD_DIR=… node scripts/sync-deployments.mjs --sync`);
      changed += 1;
      continue;
    }

    writeFileSync(DEPLOYMENTS_JS, `${block.source.slice(0, block.start)}${wanted}${block.source.slice(block.end)}`);
    log(`${generation}: rewrote ${Object.keys(record.chains).length} chain record(s) from ${GENERATION_PACKAGE_DIRS[generation]}`);
    changed += 1;
  }

  if (mode === "--check" && changed === 0) log("OK — every generated deployment record matches the launchpad packages");
  if (mode === "--check" && changed > 0) log("FAIL — the kit's deployment records are stale");
}

const mode = process.argv[2] ?? "--check";
if (!["--check", "--sync"].includes(mode)) {
  console.error("usage: sync-deployments.mjs [--check|--sync]");
  process.exitCode = 2;
} else if (!LAUNCHPAD_DIR) {
  // NOT A FAILURE, AND SAID SO. Public CI has no launchpad checkout, and a gate that only passes on
  // one workstation is worse than a weaker one honestly labelled. What DOES run everywhere is the
  // schema test that asserts no undeployed generation publishes an address; see test/run.mjs.
  log("SKIPPED — RELICS_LAUNCHPAD_DIR is not set, so the launchpad's deployment packages cannot be read.");
  log("  This check compares the kit's published addresses against those packages; it needs the monorepo checked out.");
  log("  The invariant that an UNDEPLOYED generation publishes no address is tested without it (npm run kit:test).");
} else {
  run(mode);
}
