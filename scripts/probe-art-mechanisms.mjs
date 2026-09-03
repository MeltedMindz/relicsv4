#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MECHANISM PROBE — measure what a market binding actually DOES to the picture.
//
//   node scripts/probe-art-mechanisms.mjs                     # the committed candidate set
//   node scripts/probe-art-mechanisms.mjs --file <path.json>  # an ad-hoc set, same shape
//   node scripts/probe-art-mechanisms.mjs --seeds 12 --out <name>
//
// WHY THIS EXISTS. The atlas measures every parameter on ONE axis at a time and reports ink120.
// That is the right measurement for "which control is loud" and it is the wrong one for "which
// named transformation can this runtime perform". Ink cannot tell a mass that fractures into four
// members from a mass that merely brightens; both can move coverage by the same amount, and twelve
// blind reviewers refused the second while the pipeline reported the first.
//
// So this probe renders whole candidate configurations through the DEPLOYED runtimes and measures
// the three things a mechanism claim is actually about:
//
//   dE per state pairing   does the picture change, and between WHICH states
//   extent + margin        does the work reach the frame, or float as a centred island
//   components + share     is it one mass or several, and does that change with the market
//
// NOTHING HERE JUDGES ANYTHING. It produces numbers, and the mechanism table cites them. A
// mechanism whose probe row is weak is recorded as weak; it is not quietly dropped, because the
// absence of a row is indistinguishable from a mechanism nobody tried.
//
// EVERY FRAME COMES FROM CHAIN. There is no local renderer and no fallback — an unreachable RPC is
// a failure, never a skipped row, for the same reason an unread registry is a denial.
// ================================================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeConfig } from "../packages/art-review/src/runtimes.js";
import { resolveRuntime, createRenderer } from "../packages/art-review/src/render.js";
import { describeValidatorCode } from "../packages/art-review/src/codec/errors.js";
import { planeOf, inkCoverage, labOfHex, meanDeltaE } from "../packages/art-review/src/perceptual.js";
import { extentOf, componentCount } from "../packages/art-review/src/morphology.js";
import { MECHANISM_PROBE_CANDIDATES } from "../packages/art-direction/src/probe-candidates.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "artifacts", "art-mechanisms");
const REGISTRY = "0xCB19507D713DfC4cD212BDc545480e1549A9F231";
const CHAIN_ID = 8453;

function rpcUrl() {
  for (const p of [join(ROOT, ".env.local"), join(ROOT, "..", "RELICS", ".env.local")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.BASE_RPC_URL;
  if (!url) throw new Error("BASE_RPC_URL is not set; the probe reads the deployed runtimes and cannot be faked offline");
  return url;
}

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const SEED_COUNT = Number(arg("seeds", "8"));
const OUT_NAME = arg("out", "mechanism-probe");
const FILE = arg("file", null);
const ONLY = arg("only", null)?.split(",").map((s) => s.trim());

/** The probe's own seed population. DISJOINT from every benchmark seed group by construction. */
const PROBE_SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 500_003 + i * 8_191);

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r3 = (n) => Number(n.toFixed(3));

async function measureCandidate({ renderer, runtimeId, name, config, note }) {
  let configBytes;
  try {
    configBytes = encodeConfig(runtimeId, config);
  } catch (err) {
    return { name, runtimeId, note, ok: false, stage: "ENCODE", detail: err.message };
  }
  const legal = await renderer.validateConfig(configBytes);
  if (!legal.read) return { name, runtimeId, note, ok: false, stage: "VALIDATE", detail: legal.detail };
  if (!legal.legal) {
    return { name, runtimeId, note, ok: false, stage: "VALIDATE", code: legal.code, detail: JSON.stringify(describeValidatorCode(runtimeId, legal.code)) };
  }

  const states = ["neutral", "stress", "recovery"];
  const cells = PROBE_SEEDS.flatMap((seed) => states.map((state) => ({ seed, state })));
  const rendered = await renderer.renderMany(configBytes, cells);
  const failed = rendered.filter((r) => !r.ok);
  if (failed.length) return { name, runtimeId, note, ok: false, stage: "RENDER", detail: `${failed.length} of ${rendered.length} renders failed (${[...new Set(failed.map((f) => f.failure))].join(", ")})` };

  const planes = new Map();
  for (const r of rendered) planes.set(`${r.seed}|${r.state}`, await planeOf(r.svg));

  // The DECLARED ground, so a saturated frame does not read as an empty one. See `inkCoverage`.
  const gl = Array.isArray(config?.palette) ? labOfHex(config.palette[config.groundIx ?? 0]) : null;
  const per = { neutral: [], stress: [], recovery: [] };
  for (const state of states) {
    for (const seed of PROBE_SEEDS) {
      const p = planes.get(`${seed}|${state}`);
      per[state].push({ seed, ink: inkCoverage(p, 8, gl), ...extentOf(p, 8, gl), ...componentCount(p, { groundLab: gl }) });
    }
  }

  const pairings = { ns: ["neutral", "stress"], nr: ["neutral", "recovery"], sr: ["stress", "recovery"] };
  const stateDe = {};
  for (const [k, [a, b]] of Object.entries(pairings)) {
    const ds = PROBE_SEEDS.map((s) => meanDeltaE(planes.get(`${s}|${a}`), planes.get(`${s}|${b}`)));
    stateDe[k] = { mean: r3(avg(ds)), min: r3(Math.min(...ds)) };
  }
  const seedDs = [];
  for (let i = 0; i < PROBE_SEEDS.length; i += 1) {
    for (let j = i + 1; j < PROBE_SEEDS.length; j += 1) {
      seedDs.push(meanDeltaE(planes.get(`${PROBE_SEEDS[i]}|neutral`), planes.get(`${PROBE_SEEDS[j]}|neutral`)));
    }
  }

  const summarise = (rows) => ({
    inkMean: r3(avg(rows.map((r) => r.ink))),
    inkMin: r3(Math.min(...rows.map((r) => r.ink))),
    extentMean: r3(avg(rows.map((r) => r.extent))),
    extentMin: r3(Math.min(...rows.map((r) => r.extent))),
    marginMinMean: r3(avg(rows.map((r) => r.marginMin))),
    edgeContactSeeds: rows.filter((r) => r.edgeContact > 0).length,
    componentsMean: r3(avg(rows.map((r) => r.components))),
    largestShareMean: r3(avg(rows.map((r) => r.largestShare))),
    blankSeeds: rows.filter((r) => r.ink < 0.04).length,
  });

  return {
    name, runtimeId, note, ok: true,
    configBytesLength: (configBytes.length - 2) / 2,
    seeds: PROBE_SEEDS.length,
    stateDe,
    weakestPairing: Object.entries(stateDe).sort((a, b) => a[1].mean - b[1].mean)[0][0],
    weakestPairingMean: Object.entries(stateDe).sort((a, b) => a[1].mean - b[1].mean)[0][1].mean,
    seedDe: { mean: r3(avg(seedDs)), min: r3(Math.min(...seedDs)) },
    states: Object.fromEntries(states.map((s) => [s, summarise(per[s])])),
    perSeed: per,
  };
}

async function main() {
  const url = rpcUrl();
  console.log(`rpc host ${new URL(url).host} · chain ${CHAIN_ID} · ${PROBE_SEEDS.length} seeds x 3 states`);
  const source = FILE ? JSON.parse(readFileSync(FILE, "utf8")).candidates : MECHANISM_PROBE_CANDIDATES;
  const candidates = ONLY ? source.filter((c) => ONLY.includes(c.name)) : source;
  if (candidates.length === 0) throw new Error("no candidates selected; a probe that measures nothing must not report a result");

  const renderers = {};
  const rows = [];
  for (const c of candidates) {
    if (!renderers[c.runtimeId]) {
      const resolved = await resolveRuntime({ rpcUrl: url, registry: REGISTRY, runtimeId: c.runtimeId });
      if (!resolved.ok) throw new Error(`${c.runtimeId}: ${resolved.state} — ${resolved.detail}`);
      renderers[c.runtimeId] = { renderer: createRenderer({ rpcUrl: url, chainId: CHAIN_ID, resolved, concurrency: 8 }), resolved };
    }
    const { renderer } = renderers[c.runtimeId];
    const row = await measureCandidate({ renderer, ...c });
    rows.push(row);
    if (!row.ok) {
      console.log(`${row.name.padEnd(30)} FAILED at ${row.stage}: ${row.detail}`);
      continue;
    }
    console.log(
      `${row.name.padEnd(30)} ` +
      `ns ${String(row.stateDe.ns.mean).padStart(6)} nr ${String(row.stateDe.nr.mean).padStart(6)} sr ${String(row.stateDe.sr.mean).padStart(6)} | ` +
      `seed ${String(row.seedDe.mean).padStart(6)}/${String(row.seedDe.min).padStart(5)} | ` +
      `ink ${row.states.neutral.inkMean}/${row.states.neutral.inkMin} | ` +
      `ext ${row.states.neutral.extentMean} (s ${row.states.stress.extentMean} r ${row.states.recovery.extentMean}) | ` +
      `cmp ${row.states.neutral.componentsMean}->${row.states.stress.componentsMean} share ${row.states.neutral.largestShareMean}->${row.states.stress.largestShareMean} | ` +
      `blank ${row.states.neutral.blankSeeds + row.states.stress.blankSeeds + row.states.recovery.blankSeeds}`,
    );
  }

  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${OUT_NAME}.json`);
  writeFileSync(path, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    chainId: CHAIN_ID,
    registry: REGISTRY,
    runtimes: Object.fromEntries(Object.entries(renderers).map(([k, v]) => [k, { address: v.resolved.address, codeBytes: v.resolved.codeBytes }])),
    seeds: PROBE_SEEDS,
    measuredAt120px: true,
    rows,
  }, null, 2)}\n`);
  console.log(`\nwrote ${path}`);
}

await main();
