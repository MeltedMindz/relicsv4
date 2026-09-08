#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE COMPOSITION AND MEMBER PROBE — measure WHERE a runtime can put its marks, and WHAT KIND of
// mark it can make, against the deployed bytecode.
//
//   node scripts/probe-art-composition.mjs            # render and write the atlas
//   node scripts/probe-art-composition.mjs --check    # re-render and refuse a drifted atlas
//   node scripts/probe-art-composition.mjs --reproduce  # only the two refutation configurations
//
// ------------------------------------------------------------------------------------------------
// WHY IT EXISTS
// ------------------------------------------------------------------------------------------------
// `artifacts/art-benchmark/ROUND-2-FINDINGS.md` concluded from the Solidity that both Wave-1
// runtimes place their marks inside "a DISC inscribed in a square frame" and that a frame-filling
// composition is therefore unreachable on either. It proposed adding `EDGE_TO_EDGE_COVERAGE` as a
// refused capability. An adversarial verifier then found legal configurations — `validateConfigV1`
// returning 0 — that fill the frame corner to corner on both, and this probe reproduces them in
// its `--reproduce` section as the first thing it does.
//
// The lesson is not "that document was careless". It is that a capability claim about a deployed
// contract has exactly one honest source, and it is not the source code. So every verdict the
// composition vocabulary reaches is a predicate over frames this script rendered.
//
// ------------------------------------------------------------------------------------------------
// WHAT IT MEASURES AND OVER WHICH POPULATION
// ------------------------------------------------------------------------------------------------
// `AUTHORING_SEEDS` — the twelve the author is ALLOWED to see — at all three market states. Never
// the development ring and never the holdout: this is an authoring instrument, and a capability
// measured on the seeds a final reviewer will be shown is a capability measured on the exam paper.
// `assertNoHoldoutLeak` is called on the population before a single frame is rendered.
//
// THE DISTRIBUTION IS THE PRODUCT, NOT THE MEAN. Every scalar in both runtimes is a CEILING the
// token's seed draws beneath, so a composition can be true of a token and false of the collection
// it belongs to. `min` over the population is what the criteria in `composition.js` read, and
// `anySeedSatisfies` is recorded beside it so `REACHES_NOT_HELD` can be told from `UNREACHABLE`.
// ================================================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeFunctionResult, encodeFunctionData } from "viem";

import { encodeConfig } from "../packages/art-review/src/runtimes.js";
import { resolveRuntime, createRenderer, REGISTRY_ABI } from "../packages/art-review/src/render.js";
import { describeValidatorCode } from "../packages/art-review/src/codec/errors.js";
import { planeOf, inkCoverage, labOfHex } from "../packages/art-review/src/perceptual.js";
import {
  extentOf, cornerOccupancy, componentCount, centroidOf, bandProfile, quadrantBalance, strokeSignature,
} from "../packages/art-review/src/morphology.js";
import { MARKET_STATES } from "../packages/art-review/src/market.js";
import { COMPOSITIONS, COMPOSITION_RECIPES, COMPOSITION_PIN } from "../packages/art-direction/src/composition.js";
import { MEMBERS, memberParameters, membersFor } from "../packages/art-direction/src/member.js";
import { AUTHORING_SEEDS, assertNoHoldoutLeak } from "../packages/art-direction/src/seeds.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "packages", "art-direction", "measurements");
const ATLAS = join(OUT_DIR, "composition-atlas.json");
const MEMBER_ATLAS = join(OUT_DIR, "member-atlas.json");
const REGISTRY = "0xCB19507D713DfC4cD212BDc545480e1549A9F231";
const CHAIN_ID = 8453;

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const REPRODUCE_ONLY = argv.includes("--reproduce");

function rpcUrl() {
  for (const p of [join(ROOT, ".env.local"), join(ROOT, "..", "RELICS", ".env.local")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.BASE_RPC_URL;
  if (!url) {
    throw new Error(
      "BASE_RPC_URL is not set. This probe reads the DEPLOYED runtimes and there is deliberately " +
      "no offline mode: a composition atlas computed from a local reimplementation would be a " +
      "measurement of the reimplementation, which is the exact mistake this file exists to correct.",
    );
  }
  return url;
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const r4 = (n) => Number(n.toFixed(4));

/** The palette every measurement runs on. Fixed, so a composition number is not a colour number. */
const PALETTE = Object.freeze(["#0f1113", "#b07d3a", "#d9d2c2", "#8d8b86"]);

/** Where a member is measured from, and where a composition is: the two axes are never crossed. */
const MEMBER_PROBE_DENSITY = Object.freeze({ count: 18, sizeMax: 30, spreadMax: 128 });

/**
 * The two members every composition recipe is measured with.
 *
 * ONE FROM EACH FAMILY, because a composition's reach and its coverage are different questions and
 * the mark decides the second. Measured: the same frame-filling recipe reads ink 0.94 with a filled
 * plate and far less with a stroked frame, and a brief can want either.
 */
const COMPOSITION_PROBE_MEMBERS = Object.freeze(["PLATE", "FRAME"]);

const dist = (values) => {
  if (values.length === 0) return { min: 0, mean: 0, max: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { min: r4(Math.min(...values)), mean: r4(mean), max: r4(Math.max(...values)), n: values.length };
};

async function readRuntimeCodeHash(url, registryId) {
  const data = encodeFunctionData({ abi: REGISTRY_ABI, functionName: "runtimeInfo", args: [registryId] });
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: REGISTRY, data }, "latest"] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`runtimeInfo(${registryId}) could not be read: ${json.error.message}`);
  return decodeFunctionResult({ abi: REGISTRY_ABI, functionName: "runtimeInfo", data: json.result }).codeHash;
}

/**
 * A vector configuration from a composition recipe and a member.
 *
 * THE THREE AXES MEET HERE AND NOWHERE ELSE. The recipe supplies layout, size, spread, count,
 * symmetry and which units are pinned; the member supplies primitive, stroke and variant; the
 * sensor/curve/drive are the composition's own (a pinned unit) or the neutral default (an unpinned
 * one). The MECHANISM is not applied in the probe at all: a composition measured under a live
 * market binding would be a measurement of the binding.
 */
function vectorConfig({ recipe, memberId }) {
  const p = memberParameters("VECTOR_COMPOSITION_V1", memberId);
  if (!p) return null;
  const fields = recipe.fields.map((f, i) => ({
    layout: f.layout,
    primitive: p.primitive,
    paletteIx: 1 + (i % 3),
    sensor: f.pin ? COMPOSITION_PIN.sensor : "VOLUME_TIER",
    curve: f.pin ? COMPOSITION_PIN.curve : "LINEAR",
    drive: f.pin ?? "COUNT",
    countMin: f.count,
    countMax: f.count,
    sizeMax: f.sizeMax,
    spreadMax: f.spreadMax,
    symmetry: f.symmetry,
    variant: p.variant,
    stroke: p.stroke,
  }));
  return { flags: [], groundMode: "FLAT", groundIx: 0, groundIx2: 0, palette: [...PALETTE], fields, traits: [], title: "probe" };
}

/** A recursion configuration from a composition recipe and a member. */
function recursionConfig({ recipe, memberId }) {
  const p = memberParameters("GEOMETRIC_RECURSION_V1", memberId);
  if (!p) return null;
  // ERR_SEED_BLIND: the runtime REFUSES a configuration in which no declared set has a second
  // member, because then the token's seed draws nothing categorical. The member owns the primary
  // shape, so the second is the nearest neighbour of the same weight -- never a lighter one, which
  // is how the atlas records near-blank tokens being manufactured.
  const SECOND = { SQUARE: "DIAMOND", CIRCLE: "HEX", HEX: "SQUARE", TRIANGLE: "DIAMOND", DIAMOND: "SQUARE" };
  const shapeSet = [p.shape, SECOND[p.shape] ?? "SQUARE"];
  const rules = recipe.rules.map((r, i) => ({
    shapeSet,
    ruleSet: [...r.ruleSet],
    paletteIx: 1 + (i % 3),
    sensor: r.pin ? COMPOSITION_PIN.sensor : (i === 0 ? "RECOVERY" : "VOLUME_TIER"),
    curve: r.pin ? COMPOSITION_PIN.curve : "LOG2",
    drive: r.pin ?? "CONTRACT",
    depthMin: r.depth,
    depthMax: r.depth,
    branch: r.branch,
    contraction: r.contraction,
    rotation: r.rotation ?? 12,
    prune: r.prune ?? Math.max(1, (1 << Math.min(4, r.branch)) - 2),
    symSet: [...r.symSet],
    stroke: p.stroke,
    variant: p.variant,
  }));
  return { flags: [], groundMode: "FLAT", groundIx: 0, groundIx2: 0, palette: [...PALETTE], rules, traits: [], title: "probe" };
}

/** Every measure this probe takes of one frame, in one place so the two atlases agree. */
async function measureFrame(svg, groundLab) {
  const plane = await planeOf(svg);
  const e = extentOf(plane, 8, groundLab);
  const c = cornerOccupancy(plane, { groundLab });
  const b = bandProfile(plane, { groundLab });
  const q = quadrantBalance(plane, { groundLab });
  const s = strokeSignature(plane, { groundLab });
  const k = componentCount(plane, { groundLab });
  const centre = centroidOf(plane, { groundLab });
  return {
    ink: r4(inkCoverage(plane, 8, groundLab)),
    extentX: e.extentX, extentY: e.extentY, marginMin: e.marginMin, edgeContact: e.edgeContact,
    cornerInk: c.cornerInk, edgeInk: c.edgeInk,
    livingBands: b.livingBands, adjacentContrast: b.adjacentContrast,
    quadrantEvenness: q.evenness,
    boundaryShare: s.boundaryShare,
    components: k.components, largestShare: k.largestShare,
    centroidOffset: centre.offset,
  };
}

const DISTRIBUTED_KEYS = Object.freeze([
  "ink", "extentX", "extentY", "marginMin", "cornerInk", "edgeInk", "livingBands",
  "adjacentContrast", "quadrantEvenness", "boundaryShare", "components", "largestShare", "centroidOffset",
]);

async function measureConfig({ renderer, runtimeId, config, seeds, states }) {
  const bytes = encodeConfig(runtimeId, config);
  const v = await renderer.validateConfig(bytes);
  if (!v.read) return { legal: null, detail: v.detail };
  if (!v.legal) return { legal: false, validatorCode: describeValidatorCode(runtimeId, v.code)?.name ?? `code ${v.code}` };
  const groundLab = labOfHex(config.palette[config.groundIx ?? 0]);
  const cells = [];
  for (const seed of seeds) for (const state of states) cells.push({ seed, state });
  const records = await renderer.renderMany(bytes, cells);
  const frames = [];
  for (const rec of records) {
    if (!rec.ok) {
      // A FAILED RENDER IS A FAILURE, NEVER A SKIPPED ROW. A distribution computed over the frames
      // that happened to come back is a distribution over the easy seeds.
      throw new Error(`${runtimeId}: renderV1 returned ok=false (failure ${rec.failure}) at seed ${rec.seed} ${rec.state}. The atlas is not written from a partial population.`);
    }
    frames.push({ seed: rec.seed, state: rec.state, ...(await measureFrame(rec.svg, groundLab)) });
  }
  const distribution = {};
  for (const key of DISTRIBUTED_KEYS) distribution[key] = dist(frames.map((f) => f[key]));
  return { legal: true, configBytesLength: (bytes.length - 2) / 2, configSha256: sha256(bytes), frames, distribution };
}

/**
 * THE REFUTATION, REPRODUCED.
 *
 * These two configurations are the ones an adversarial verifier used to refute the round-two
 * structural conclusion. They are rendered FIRST and recorded with their per-seed numbers, so the
 * retraction in `ROUND-2-FINDINGS.md` cites a re-runnable measurement rather than a remembered one.
 */
function refutationConfigs() {
  return {
    VECTOR_COMPOSITION_V1: {
      note: "symmetry ROT6, sizeMax 64, spreadMax 128, three cell-grid fields at a pinned count of 24",
      config: {
        flags: [], groundMode: "FLAT", groundIx: 0, groundIx2: 0, palette: [...PALETTE], traits: [], title: "refutation",
        fields: ["GRID", "LATTICE", "TILING"].map((layout, i) => ({
          layout, primitive: "RECT", paletteIx: 1 + i, sensor: "VOLUME_TIER", curve: "LINEAR", drive: "COUNT",
          countMin: 24, countMax: 24, sizeMax: 64, spreadMax: 128, symmetry: "ROT6", variant: 0, stroke: false,
        })),
      },
    },
    GEOMETRIC_RECURSION_V1: {
      note: "shapeSet {SQUARE, HEX}, ruleSet {BRANCH}, symSet {QUAD}, branch 3, depth 3, contraction 90, three rules",
      config: {
        flags: [], groundMode: "FLAT", groundIx: 0, groundIx2: 0, palette: [...PALETTE], traits: [], title: "refutation",
        rules: [0, 1, 2].map((i) => ({
          shapeSet: ["SQUARE", "HEX"], ruleSet: ["BRANCH"], paletteIx: 1 + i,
          sensor: i === 0 ? "RECOVERY" : "VOLUME_TIER", curve: "LOG2", drive: "CONTRACT",
          depthMin: 3, depthMax: 3, branch: 3, contraction: 90, rotation: 10 + i * 15, prune: 6,
          symSet: ["QUAD"], stroke: false, variant: i,
        })),
      },
    },
  };
}

async function main() {
  const url = rpcUrl();
  const host = new URL(url).host;
  console.log(`composition probe: chain ${CHAIN_ID} via ${host}`);

  // THE POPULATION IS CHECKED BEFORE A FRAME IS RENDERED. An authoring instrument measured on the
  // holdout is an authoring instrument that has read the exam paper.
  assertNoHoldoutLeak("AUTHOR", AUTHORING_SEEDS, { finalHoldout: null, context: "composition probe" });
  const seeds = [...AUTHORING_SEEDS];
  console.log(`population: ${seeds.length} authoring seeds x ${MARKET_STATES.length} market states`);

  const renderers = {};
  const codeHashes = {};
  for (const runtimeId of ["GEOMETRIC_RECURSION_V1", "VECTOR_COMPOSITION_V1"]) {
    const resolved = await resolveRuntime({ rpcUrl: url, registry: REGISTRY, runtimeId });
    if (!resolved.ok) throw new Error(`${runtimeId} did not resolve on chain ${CHAIN_ID}: ${resolved.state} — ${resolved.detail}`);
    renderers[runtimeId] = createRenderer({ rpcUrl: url, chainId: CHAIN_ID, resolved, concurrency: 6 });
    codeHashes[runtimeId] = await readRuntimeCodeHash(url, resolved.registryId);
    console.log(`  ${runtimeId} at ${resolved.address} (registry id ${resolved.registryId}, ${resolved.codeBytes} bytes)`);
  }

  // ---- 1. THE REFUTATION ----------------------------------------------------------------------
  const refutation = [];
  for (const [runtimeId, { note, config }] of Object.entries(refutationConfigs())) {
    const m = await measureConfig({ renderer: renderers[runtimeId], runtimeId, config, seeds, states: ["neutral"] });
    if (m.legal !== true) throw new Error(`the refutation configuration for ${runtimeId} is not legal: ${m.validatorCode ?? m.detail}. That would refute the refutation and must not pass silently.`);
    refutation.push({
      runtimeId, note, validateConfigV1: 0, configSha256: m.configSha256,
      distribution: m.distribution,
      perSeed: m.frames.map((f) => ({ seed: f.seed, ink: f.ink, extentX: f.extentX, extentY: f.extentY, cornerInk: f.cornerInk, edgeInk: f.edgeInk })),
    });
    const d = m.distribution;
    console.log(`  REFUTATION ${runtimeId}: extentX min ${d.extentX.min} · extentY min ${d.extentY.min} · ink mean ${d.ink.mean} · cornerInk min ${d.cornerInk.min} mean ${d.cornerInk.mean} max ${d.cornerInk.max}`);
  }
  if (REPRODUCE_ONLY) {
    console.log("\nROUND2_CORNER_CEILING_CITED=0.130");
    for (const r of refutation) console.log(`${r.runtimeId}_CORNER_INK_MEAN=${r.distribution.cornerInk.mean}  (x${(r.distribution.cornerInk.mean / 0.13).toFixed(1)} the cited ceiling)`);
    return;
  }

  // ---- 2. THE COMPOSITION ATLAS ----------------------------------------------------------------
  const recipeRows = [];
  for (const [runtimeId, byComposition] of Object.entries(COMPOSITION_RECIPES)) {
    for (const [compositionId, recipes] of Object.entries(byComposition)) {
      for (const recipe of recipes) {
        for (const memberId of COMPOSITION_PROBE_MEMBERS) {
          const config = runtimeId === "VECTOR_COMPOSITION_V1"
            ? vectorConfig({ recipe, memberId })
            : recursionConfig({ recipe, memberId });
          if (!config) continue;
          const m = await measureConfig({ renderer: renderers[runtimeId], runtimeId, config, seeds, states: MARKET_STATES });
          const row = { runtimeId, compositionId, recipeId: recipe.id, memberId, legal: m.legal === true };
          if (m.legal !== true) {
            row.validatorCode = m.validatorCode ?? "UNREAD";
            recipeRows.push(row);
            console.log(`  ${runtimeId} ${compositionId}/${recipe.id}/${memberId}: REFUSED ${row.validatorCode}`);
            continue;
          }
          row.configSha256 = m.configSha256;
          row.distribution = m.distribution;
          // PER-SEED SATISFACTION, so `REACHES_NOT_HELD` can be told from `UNREACHABLE`. The
          // criterion is the one `composition.js` declares; it is applied to a one-frame
          // distribution rather than restated here, so the two can never disagree.
          row.anySeedSatisfies = {};
          row.seedsSatisfying = {};
          for (const c of COMPOSITIONS) {
            const hits = m.frames.filter((f) => {
              const one = {};
              for (const key of DISTRIBUTED_KEYS) one[key] = { min: f[key], mean: f[key], max: f[key], n: 1 };
              return c.criterion(one);
            });
            row.anySeedSatisfies[c.id] = hits.length > 0;
            row.seedsSatisfying[c.id] = hits.length;
          }
          recipeRows.push(row);
          const d = m.distribution;
          const holds = COMPOSITIONS.find((c) => c.id === compositionId).criterion(d);
          console.log(`  ${runtimeId} ${compositionId}/${recipe.id}/${memberId}: ${holds ? "HOLDS" : `${row.seedsSatisfying[compositionId]}/${m.frames.length} frames`} · ink ${d.ink.mean} · extX ${d.extentX.min} · corner ${d.cornerInk.min}`);
        }
      }
    }
  }

  // ---- 3. THE MEMBER ATLAS ---------------------------------------------------------------------
  const memberRows = [];
  for (const runtimeId of ["GEOMETRIC_RECURSION_V1", "VECTOR_COMPOSITION_V1"]) {
    for (const memberId of membersFor(runtimeId)) {
      const config = runtimeId === "VECTOR_COMPOSITION_V1"
        ? vectorConfig({ recipe: { fields: [{ layout: "GRID", symmetry: "NONE", spreadMax: MEMBER_PROBE_DENSITY.spreadMax, sizeMax: MEMBER_PROBE_DENSITY.sizeMax, count: MEMBER_PROBE_DENSITY.count }] }, memberId })
        : recursionConfig({ recipe: { rules: [{ ruleSet: ["QUAD", "TRI"], symSet: ["NONE"], contraction: 70, branch: 3, depth: 3, prune: 6, rotation: 12 }] }, memberId });
      if (!config) continue;
      const m = await measureConfig({ renderer: renderers[runtimeId], runtimeId, config, seeds, states: ["neutral"] });
      const entry = MEMBERS.find((x) => x.id === memberId);
      const row = { runtimeId, memberId, family: entry.family, legal: m.legal === true };
      if (m.legal !== true) { row.validatorCode = m.validatorCode ?? "UNREAD"; memberRows.push(row); continue; }
      row.configSha256 = m.configSha256;
      row.distribution = m.distribution;
      memberRows.push(row);
      console.log(`  ${runtimeId} member ${memberId} (${entry.family}): boundary ${m.distribution.boundaryShare.mean} · ink ${m.distribution.ink.mean}`);
    }
  }

  const atlas = {
    $comment: [
      "Measured against the DEPLOYED Wave-1 runtimes by eth_call. Every number here is a predicate",
      "over a frame a contract returned; nothing is read out of Solidity, because reading Solidity",
      "is what produced this lane's one false structural conclusion (see ROUND-2-FINDINGS.md).",
      "The distribution is over AUTHORING_SEEDS x the three market states. `min` is what the",
      "composition criteria read: every scalar in both runtimes is a ceiling the seed draws beneath,",
      "so a composition true of the mean can be false of the collection.",
    ],
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    chainId: CHAIN_ID,
    registry: REGISTRY,
    runtimeCodeHash: codeHashes,
    population: { group: "AUTHORING_SEEDS", seeds: seeds.length, states: MARKET_STATES },
    palette: PALETTE,
    probeMembers: COMPOSITION_PROBE_MEMBERS,
    refutation,
    recipes: recipeRows,
  };
  // THE ORDERING IS ASSERTED HERE, ON THE ROWS JUST MEASURED, BEFORE THEY ARE WRITTEN. A member
  // atlas whose own family claims are false is worse than none: the vocabulary would go on naming
  // marks it no longer draws. This is the same shape as `assertCapabilityMappingCurrent` and it
  // runs at write time as well as at read time.
  {
    const byRuntime = new Map();
    for (const r of memberRows.filter((x) => x.legal)) {
      if (!byRuntime.has(r.runtimeId)) byRuntime.set(r.runtimeId, []);
      byRuntime.get(r.runtimeId).push(r);
    }
    const crossed = [];
    for (const [runtimeId, group] of byRuntime) {
      const mass = group.filter((r) => r.family === "MASS");
      const line = group.filter((r) => r.family === "LINE");
      if (!mass.length || !line.length) { crossed.push(`${runtimeId}: ${mass.length} MASS / ${line.length} LINE — an ordering needs both sides`); continue; }
      const hm = mass.reduce((a, b) => (b.distribution.boundaryShare.mean > a.distribution.boundaryShare.mean ? b : a));
      const ll = line.reduce((a, b) => (b.distribution.boundaryShare.mean < a.distribution.boundaryShare.mean ? b : a));
      if (hm.distribution.boundaryShare.mean >= ll.distribution.boundaryShare.mean) {
        crossed.push(`${runtimeId}: ${hm.memberId} (MASS ${hm.distribution.boundaryShare.mean}) does not measure below ${ll.memberId} (LINE ${ll.distribution.boundaryShare.mean})`);
      } else {
        console.log(`  MASS_BELOW_LINE ${runtimeId}: heaviest mass ${hm.memberId} ${hm.distribution.boundaryShare.mean} < lightest line ${ll.memberId} ${ll.distribution.boundaryShare.mean}`);
      }
    }
    if (crossed.length) throw new Error(`MEMBER_FAMILY_ORDERING_VIOLATED:\n  ${crossed.join("\n  ")}`);
  }

  const memberAtlas = {
    $comment: [
      "The member axis, measured on ONE fixed composition so a mark's number is a fact about the",
      "mark. `boundaryShare` is the share of ink pixels sitting on a boundary: a thread is nearly",
      "all boundary and a plate is nearly none, and it is the one number `inkCoverage` cannot",
      "produce -- a hairline lattice and a solid slab can carry identical coverage.",
    ],
    schemaVersion: 1,
    generatedAt: atlas.generatedAt,
    chainId: CHAIN_ID,
    runtimeCodeHash: codeHashes,
    population: { group: "AUTHORING_SEEDS", seeds: seeds.length, states: ["neutral"] },
    probeDensity: MEMBER_PROBE_DENSITY,
    members: memberRows,
  };

  if (CHECK) {
    let drift = 0;
    for (const [path, next] of [[ATLAS, atlas], [MEMBER_ATLAS, memberAtlas]]) {
      const prev = JSON.parse(readFileSync(path, "utf8"));
      const strip = (o) => JSON.stringify({ ...o, generatedAt: null });
      if (strip(prev) !== strip(next)) { drift += 1; console.error(`DRIFT: ${path} no longer reproduces from the deployed runtimes`); }
    }
    console.log(`\nCOMPOSITION_ATLAS_REPRODUCES=${drift === 0 ? "YES" : "NO"}`);
    process.exit(drift === 0 ? 0 : 1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(ATLAS, `${JSON.stringify(atlas, null, 2)}\n`);
  writeFileSync(MEMBER_ATLAS, `${JSON.stringify(memberAtlas, null, 2)}\n`);
  console.log(`\nwrote ${ATLAS}\nwrote ${MEMBER_ATLAS}`);
  console.log(`COMPOSITION_RECIPES_MEASURED=${recipeRows.length}`);
  console.log(`MEMBER_ROWS_MEASURED=${memberRows.length}`);
  console.log(`FRAMES_RENDERED=${(recipeRows.filter((r) => r.legal).length * seeds.length * MARKET_STATES.length) + (memberRows.filter((r) => r.legal).length * seeds.length) + refutation.length * seeds.length}`);
}

await main();
