#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// AUTHOR -> CHAIN -> NUMBERS, for every brief at once.
//
//   node scripts/measure-authored-briefs.mjs [--seeds 8] [--only B01,B05]
//
// WHAT IT IS FOR. The benchmark's `author` phase renders the DEVELOPMENT seeds and writes critic
// packets; this renders the same configurations on the PROBE's own seed population and prints the
// objective numbers side by side, so a change to the author can be measured in one pass without
// touching a single benchmark artefact or seeing a holdout seed.
//
// IT JUDGES NOTHING AND WRITES NOTHING INTO artifacts/art-benchmark. Every verdict in the
// benchmark is written by a reviewer looking at images; this is the harness checking its own work
// against floors, which is a different question and must stay in a different file.
// ================================================================================================
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { admitBrief } from "../packages/art-direction/src/admission.js";
import { authorConfig } from "../packages/art-direction/src/author.js";
import { encodeConfig } from "../packages/art-review/src/runtimes.js";
import { resolveRuntime, createRenderer } from "../packages/art-review/src/render.js";
import { describeValidatorCode } from "../packages/art-review/src/codec/errors.js";
import { planeOf, inkCoverage, labOfHex, meanDeltaE, STATE_SEPARATION_FLOOR } from "../packages/art-review/src/perceptual.js";
import { extentOf, componentCount } from "../packages/art-review/src/morphology.js";
import { FLOORS } from "../packages/art-review/src/objective.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL is not set");
  return process.env.BASE_RPC_URL;
}

const argv = process.argv.slice(2);
const arg = (n, d) => { const e = argv.find((a) => a.startsWith(`--${n}=`)); if (e) return e.split("=").slice(1).join("="); const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = Array.from({ length: Number(arg("seeds", "8")) }, (_, i) => 500_003 + i * 8_191);
const ONLY = arg("only", null)?.split(",");

const briefs = JSON.parse(readFileSync(join(ROOT, "packages/art-direction/test/fixtures/benchmark-briefs.json"), "utf8")).briefs;
const directions = JSON.parse(readFileSync(join(ROOT, "artifacts/art-benchmark/directions.json"), "utf8")).directions;
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const r3 = (n) => Number(n.toFixed(3));

const url = rpcUrl();
const renderers = {};
const rows = [];
for (const b of briefs) {
  if (ONLY && !ONLY.includes(b.id)) continue;
  const admission = admitBrief(b.text);
  if (!admission.admitted) { console.log(`${b.id} ${admission.outcome}`); continue; }
  const runtimeId = admission.recommended.split("/")[0];
  const authored = authorConfig({ runtimeId, direction: directions[b.id] });
  const bytes = encodeConfig(runtimeId, authored.config);
  if (!renderers[runtimeId]) {
    const resolved = await resolveRuntime({ rpcUrl: url, registry: REGISTRY, runtimeId });
    if (!resolved.ok) throw new Error(`${runtimeId}: ${resolved.detail}`);
    renderers[runtimeId] = createRenderer({ rpcUrl: url, chainId: CHAIN_ID, resolved, concurrency: 8 });
  }
  const renderer = renderers[runtimeId];
  const legal = await renderer.validateConfig(bytes);
  if (!legal.legal) { console.log(`${b.id} ILLEGAL ${JSON.stringify(describeValidatorCode(runtimeId, legal.code))}`); continue; }
  const states = ["neutral", "stress", "recovery"];
  const rendered = await renderer.renderMany(bytes, SEEDS.flatMap((s) => states.map((st) => ({ seed: s, state: st }))));
  if (rendered.some((r) => !r.ok)) { console.log(`${b.id} RENDER FAILED`); continue; }
  const planes = new Map();
  for (const r of rendered) planes.set(`${r.seed}|${r.state}`, await planeOf(r.svg));
  const de = {};
  for (const [k, [a, c]] of Object.entries({ ns: ["neutral", "stress"], nr: ["neutral", "recovery"], sr: ["stress", "recovery"] })) {
    de[k] = r3(avg(SEEDS.map((s) => meanDeltaE(planes.get(`${s}|${a}`), planes.get(`${s}|${c}`)))));
  }
  const seedDs = [];
  for (let i = 0; i < SEEDS.length; i += 1) for (let j = i + 1; j < SEEDS.length; j += 1) seedDs.push(meanDeltaE(planes.get(`${SEEDS[i]}|neutral`), planes.get(`${SEEDS[j]}|neutral`)));
  // The DECLARED ground, so a saturated frame does not read as an empty one. See `inkCoverage`.
  const gl = labOfHex(authored.config.palette[authored.config.groundIx ?? 0]);
  const all = [...planes.values()];
  const inks = all.map((p) => inkCoverage(p, 8, gl));
  const exts = SEEDS.map((s) => extentOf(planes.get(`${s}|neutral`), 8, gl));
  const comps = { n: avg(SEEDS.map((s) => componentCount(planes.get(`${s}|neutral`), { groundLab: gl }).components)), s: avg(SEEDS.map((s) => componentCount(planes.get(`${s}|stress`), { groundLab: gl }).components)) };
  const shares = { n: avg(SEEDS.map((s) => componentCount(planes.get(`${s}|neutral`), { groundLab: gl }).largestShare)), s: avg(SEEDS.map((s) => componentCount(planes.get(`${s}|stress`), { groundLab: gl }).largestShare)) };
  const weakest = Math.min(...Object.values(de));
  const row = {
    id: b.id, runtimeId, mechanism: authored.mechanism.mechanism, polarity: authored.mechanism.polarity,
    drive: authored.mechanism.drive, sensor: authored.mechanism.sensor, curve: authored.mechanism.curve,
    de, weakest, seedDe: { mean: r3(avg(seedDs)), min: r3(Math.min(...seedDs)) },
    ink: { mean: r3(avg(inks)), min: r3(Math.min(...inks)) },
    extent: { mean: r3(avg(exts.map((e) => e.extent))), min: r3(Math.min(...exts.map((e) => e.extent))) },
    components: { neutral: r3(comps.n), stress: r3(comps.s) },
    largestShare: { neutral: r3(shares.n), stress: r3(shares.s) },
    blankFrames: inks.filter((i) => i < FLOORS.ink).length,
    floors: { state: weakest >= STATE_SEPARATION_FLOOR, seedMean: avg(seedDs) >= FLOORS.seedDiversityMean, seedMin: Math.min(...seedDs) >= FLOORS.seedDiversityMin, ink: Math.min(...inks) >= FLOORS.ink },
  };
  rows.push(row);
  const fl = Object.entries(row.floors).filter(([, v]) => !v).map(([k]) => k);
  console.log(`${b.id} ${runtimeId.replace("_V1", "").slice(0, 4)} ${row.mechanism.padEnd(11)} ${row.drive.padEnd(6)}<-${row.sensor.slice(0, 4)} | ns ${String(de.ns).padStart(6)} nr ${String(de.nr).padStart(6)} sr ${String(de.sr).padStart(6)} | seed ${String(row.seedDe.mean).padStart(6)}/${String(row.seedDe.min).padStart(5)} | ink ${row.ink.mean}/${row.ink.min} | ext ${row.extent.mean}/${row.extent.min} | cmp ${row.components.neutral}->${row.components.stress} | blank ${row.blankFrames} ${fl.length ? `FLOOR FAIL: ${fl.join(",")}` : "ok"}`);
}
mkdirSync(join(ROOT, "artifacts", "art-mechanisms"), { recursive: true });
writeFileSync(join(ROOT, "artifacts", "art-mechanisms", "authored-briefs.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), seeds: SEEDS, rows }, null, 2)}\n`);
console.log(`\n${rows.filter((r) => Object.values(r.floors).every(Boolean)).length}/${rows.length} clear every objective floor`);
