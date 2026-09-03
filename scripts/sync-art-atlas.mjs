#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// VENDOR THE RUNTIME AUTHORING GUIDANCE INTO THE PUBLIC KIT.
//
//   node scripts/sync-art-atlas.mjs --sync    # copy from upstream, re-pin every digest
//   node scripts/sync-art-atlas.mjs --check    # the vendored copy is still byte-identical (default)
//   node scripts/sync-art-atlas.mjs --live     # ALSO ask three chains whether the pin still holds
//
// WHAT IS VENDORED AND WHAT IS NOT
//
// Upstream holds three files. Two of them are the EVIDENCE — 4.1 MB of per-frame measurements
// across 66 parameter sweeps and 2,597 renders — and they stay upstream, because nothing in the
// authoring path reads a frame. The third, `AUTHORING_GUIDANCE.json`, is the READING of that
// evidence: per parameter, what it visibly does, how it behaves at each end of its range, what it
// interacts with, how it fails, and whether it is fit to carry a market binding. That is the file
// an author consults, so that is the file the public kit carries.
//
// The evidence is still PINNED here even though it is not copied. `VENDOR.json` records the
// sha256 of both atlases, so a guidance file re-read from re-measured evidence is detectable from
// inside this repository even though the evidence itself lives elsewhere. A pin you cannot verify
// offline is still a pin you can verify when the source is present, and `--check` says which of
// the two it managed.
//
// WHY THIS IS PUBLISHABLE. Every number in the guidance was produced by `eth_call` against two
// contracts that are deployed, verified and readable by anyone, on three public chains. It carries
// no address book beyond those two runtime addresses and the registry, no credential, no private
// deployment material, and no launch secret. It is a measurement of public bytecode.
//
// ------------------------------------------------------------------------------------------------
// THE PIN THE UPSTREAM ATLAS DOES NOT CARRY, AND WHY THIS ADDS IT
// ------------------------------------------------------------------------------------------------
// Upstream binds its measurements to `address + registryId + codeBytes + version`. `codeBytes` is a
// LENGTH, and two different contracts of the same length are not distinguishable by it — so an
// atlas could in principle outlive the runtime it describes without anything noticing. This script
// adds `runtimeCodeHash`, read from chain at sync time, and `--live` re-reads it. That is a
// strictly stronger binding than upstream's and it is the difference between "the guidance is
// probably still true" and "the bytecode that produced these numbers is the bytecode deployed now".
//
// A STALE ATLAS IS A REFUSAL, NEVER A WARNING. `assertAtlasFresh` in the package throws, because
// the whole point of the guidance is that an author does not have to re-derive it — and an author
// consulting measurements of a runtime that has been replaced is worse off than one consulting
// nothing, since it does not know to be careful.
// ================================================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(ROOT, "packages", "art-direction", "vendor");
const GUIDANCE_OUT = join(VENDOR_DIR, "AUTHORING_GUIDANCE.json");
const VENDOR_OUT = join(VENDOR_DIR, "VENDOR.json");

/**
 * Where upstream lives.
 *
 * NOT a constant this repository can be built against. The public kit must clone and test with no
 * access to it at all, so every read of this path is guarded and `--sync` is the only mode that
 * requires it. `--check` degrades to "the vendored copy hashes to what VENDOR.json says" when the
 * source is absent, and REPORTS that it did.
 */
const UPSTREAM = process.env.RELICS_ATLAS_UPSTREAM
  ?? "/Users/melted/Documents/RELICS/launchpad/docs/runtimes/atlas";

const UPSTREAM_FILES = {
  guidance: "AUTHORING_GUIDANCE.json",
  recursionAtlas: "RECURSION_PARAMETER_ATLAS.json",
  vectorAtlas: "VECTOR_PARAMETER_ATLAS.json",
};

/** The two Wave-1 runtimes, and the chains a `--live` pin check reads. */
const RUNTIMES = {
  GEOMETRIC_RECURSION_V1: "0xbb9Eb45ee117397aC4beF47d0732c2a41AF56F69",
  VECTOR_COMPOSITION_V1: "0x24d7800d56B4534BF7f100d053aF4e49845cB722",
};
const CHAINS = [
  { id: 1, label: "Ethereum", env: "MAINNET_RPC_URL" },
  { id: 8453, label: "Base", env: "BASE_RPC_URL" },
  { id: 4663, label: "Robinhood", env: "ROBINHOOD_RPC_URL" },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** keccak256 over bytes, via viem. Loaded lazily: `--check` offline must not need it. */
async function keccakOf(hexBody) {
  const { keccak256 } = await import("viem");
  return keccak256(hexBody);
}

async function readCode(rpcUrl, address) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? "rpc error");
  const code = body.result;
  if (typeof code !== "string" || code.length < 4) throw new Error("empty code");
  return code;
}

/**
 * Read the environment the way the rest of the kit does, WITHOUT printing an endpoint.
 *
 * The value is a credential. Only ever the env var NAME and the URL's HOST reach output, and the
 * host only so a reader can tell one provider from another when a read fails.
 */
function loadEnvFile() {
  for (const candidate of [join(ROOT, ".env.local"), join(ROOT, "..", "RELICS", ".env.local")]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return "unparseable"; }
}

async function livePins() {
  loadEnvFile();
  const out = [];
  for (const chain of CHAINS) {
    const url = process.env[chain.env];
    if (!url) { out.push({ chainId: chain.id, label: chain.label, read: "NO_ENDPOINT", envKey: chain.env }); continue; }
    const row = { chainId: chain.id, label: chain.label, read: "OK", endpointHost: hostOf(url), runtimes: {} };
    for (const [id, address] of Object.entries(RUNTIMES)) {
      try {
        const code = await readCode(url, address);
        row.runtimes[id] = { address, codeBytes: (code.length - 2) / 2, codeHash: await keccakOf(code) };
      } catch (err) {
        row.read = "PARTIAL";
        row.runtimes[id] = { address, error: err.message };
      }
    }
    out.push(row);
  }
  return out;
}

function upstreamPath(key) { return join(UPSTREAM, UPSTREAM_FILES[key]); }

async function sync() {
  if (!existsSync(upstreamPath("guidance"))) {
    console.error(`FAIL: upstream guidance not found at ${upstreamPath("guidance")}`);
    console.error("      --sync requires the private atlas tree; set RELICS_ATLAS_UPSTREAM.");
    process.exit(1);
  }
  const guidance = readFileSync(upstreamPath("guidance"));
  const parsed = JSON.parse(guidance.toString("utf8"));

  // INPUT FLOOR. A guidance file that documents nothing would satisfy every downstream check that
  // asks "did you consult the atlas" — the author would consult it, find no entry, and proceed.
  const runtimeIds = Object.keys(parsed.runtimes ?? {});
  const paramCount = runtimeIds.reduce((n, id) => n + (parsed.runtimes[id].parameters?.length ?? 0), 0);
  if (runtimeIds.length < 2) { console.error(`FAIL: guidance covers ${runtimeIds.length} runtimes, need >= 2`); process.exit(1); }
  if (paramCount < 20) { console.error(`FAIL: guidance documents ${paramCount} parameters, need >= 20`); process.exit(1); }
  if ((parsed.crossRuntimeLaws?.length ?? 0) < 5) { console.error("FAIL: fewer than 5 cross-runtime laws"); process.exit(1); }
  for (const id of runtimeIds) {
    const w = parsed.runtimes[id].whatItCanDepict;
    if (!w?.can || !w?.cannot) { console.error(`FAIL: ${id} has no whatItCanDepict.can/cannot — brief admission has nothing to read`); process.exit(1); }
  }

  mkdirSync(VENDOR_DIR, { recursive: true });
  writeFileSync(GUIDANCE_OUT, guidance);

  const pins = await livePins();
  const codeHashes = {};
  for (const row of pins) {
    if (row.read !== "OK") continue;
    for (const [id, r] of Object.entries(row.runtimes)) {
      if (!r.codeHash) continue;
      codeHashes[id] ??= { codeHash: r.codeHash, codeBytes: r.codeBytes, address: r.address, agreedChains: [] };
      if (codeHashes[id].codeHash !== r.codeHash) {
        console.error(`FAIL: ${id} codehash differs between chains — a per-chain runtime cannot be pinned once`);
        process.exit(1);
      }
      codeHashes[id].agreedChains.push(row.chainId);
    }
  }
  if (Object.keys(codeHashes).length < 2) {
    console.error("FAIL: could not read both runtimes from any chain; the codehash pin would be missing");
    process.exit(1);
  }

  const record = {
    $comment: [
      "The vendored authoring guidance's provenance. Generated by scripts/sync-art-atlas.mjs --sync.",
      "guidanceSha256 is checked on every --check. atlasSha256 pins the evidence that is NOT copied,",
      "so re-measured evidence behind an unchanged reading is still detectable when upstream is present.",
      "runtimeCodeHash is this repository's addition: upstream pins codeBytes, which is a length.",
    ],
    syncedAt: new Date().toISOString(),
    upstreamRoot: "launchpad/docs/runtimes/atlas",
    guidanceSha256: sha256(guidance),
    guidanceBytes: guidance.length,
    guidanceGeneratedAt: parsed.generatedAt ?? null,
    atlasSha256: Object.fromEntries(["recursionAtlas", "vectorAtlas"].map((k) => [
      UPSTREAM_FILES[k],
      existsSync(upstreamPath(k)) ? sha256(readFileSync(upstreamPath(k))) : null,
    ])),
    coverage: { runtimes: runtimeIds, parameters: paramCount, crossRuntimeLaws: parsed.crossRuntimeLaws.length },
    runtimeCodeHash: codeHashes,
    chainsRead: pins.map((p) => ({ chainId: p.chainId, label: p.label, read: p.read, endpointHost: p.endpointHost ?? null })),
  };
  writeFileSync(VENDOR_OUT, `${JSON.stringify(record, null, 2)}\n`);

  console.log("ART_ATLAS_VENDOR_SYNC=OK");
  console.log(`  guidance      ${guidance.length} bytes  sha256 ${record.guidanceSha256.slice(0, 16)}…`);
  console.log(`  runtimes      ${runtimeIds.join(", ")}`);
  console.log(`  parameters    ${paramCount}`);
  for (const [id, r] of Object.entries(codeHashes)) {
    console.log(`  ${id.padEnd(23)} codehash ${r.codeHash.slice(0, 18)}… agreed on chains ${r.agreedChains.join(", ")}`);
  }
}

async function check({ live }) {
  const problems = [];
  if (!existsSync(GUIDANCE_OUT) || !existsSync(VENDOR_OUT)) {
    console.error("FAIL: no vendored guidance. Run: node scripts/sync-art-atlas.mjs --sync");
    process.exit(1);
  }
  const guidance = readFileSync(GUIDANCE_OUT);
  const record = JSON.parse(readFileSync(VENDOR_OUT, "utf8"));

  const digest = sha256(guidance);
  if (digest !== record.guidanceSha256) problems.push(`vendored guidance sha256 ${digest} != pinned ${record.guidanceSha256}`);

  const parsed = JSON.parse(guidance.toString("utf8"));
  const paramCount = Object.values(parsed.runtimes ?? {}).reduce((n, r) => n + (r.parameters?.length ?? 0), 0);
  if (paramCount !== record.coverage.parameters) problems.push(`parameter count ${paramCount} != pinned ${record.coverage.parameters}`);

  // UPSTREAM COMPARISON, WHEN AVAILABLE. Absent upstream is reported, never scored as agreement.
  let upstreamState = "UPSTREAM_ABSENT";
  if (existsSync(upstreamPath("guidance"))) {
    upstreamState = sha256(readFileSync(upstreamPath("guidance"))) === digest ? "UPSTREAM_IDENTICAL" : "UPSTREAM_DRIFTED";
    if (upstreamState === "UPSTREAM_DRIFTED") problems.push("upstream AUTHORING_GUIDANCE.json has changed; re-run --sync");
    for (const [name, pinned] of Object.entries(record.atlasSha256 ?? {})) {
      const p = join(UPSTREAM, name);
      if (!pinned || !existsSync(p)) continue;
      if (sha256(readFileSync(p)) !== pinned) problems.push(`upstream ${name} has been re-measured since this guidance was vendored`);
    }
  }

  let liveState = "NOT_CHECKED";
  if (live) {
    const pins = await livePins();
    liveState = "CHECKED";
    let read = 0;
    for (const row of pins) {
      if (row.read === "NO_ENDPOINT") continue;
      for (const [id, r] of Object.entries(row.runtimes)) {
        if (!r.codeHash) continue;
        read += 1;
        const pinned = record.runtimeCodeHash?.[id]?.codeHash;
        if (pinned && pinned !== r.codeHash) {
          problems.push(`${id} on chain ${row.chainId}: deployed codehash ${r.codeHash} != pinned ${pinned} — THE ATLAS IS STALE`);
        }
      }
    }
    // AN UNREAD CHAIN IS NOT A PASS. Zero reads means the live check measured nothing.
    if (read === 0) { problems.push("--live read no runtime on any chain; that is not a pin check"); liveState = "UNREADABLE"; }
    else liveState = `CHECKED_${read}_READS`;
  }

  console.log(`ART_ATLAS_VENDOR_CHECK=${problems.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`  guidanceSha256   ${digest.slice(0, 24)}…`);
  console.log(`  parameters       ${paramCount}`);
  console.log(`  upstream         ${upstreamState}`);
  console.log(`  livePin          ${liveState}`);
  for (const p of problems) console.error(`  PROBLEM: ${p}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

const argv = process.argv.slice(2);
if (argv.includes("--sync")) await sync();
else await check({ live: argv.includes("--live") });
