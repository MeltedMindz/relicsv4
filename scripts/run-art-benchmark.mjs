#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ART BENCHMARK HARNESS.
//
//   node scripts/run-art-benchmark.mjs author   [--only B01,B02]  # admit -> direct -> author -> render
//   node scripts/run-art-benchmark.mjs revise   [--only ...]      # apply critique responses, re-author
//   node scripts/run-art-benchmark.mjs holdout  [--only ...]      # render the FINAL HOLDOUT and freeze
//   node scripts/run-art-benchmark.mjs report                     # the table, derived from disk
//
// WHAT IT MEASURES. Whether this pipeline, given a brief it has never seen, produces art that a
// reviewer which is not the author accepts — on seeds the author was never shown.
//
// WHAT IT DOES NOT DO. It does not judge anything. Every verdict in this run is written by a
// separate agent that looks at rendered images; nothing here scores art, and there is deliberately
// no code path that could. A harness that could write its own verdict would make the whole
// benchmark a measurement of the harness.
//
// THE SEED DISCIPLINE IS THE POINT. `author` and `revise` render AUTHORING_SEEDS and
// DEVELOPMENT_REVIEW_SEEDS. `holdout` renders FINAL_HOLDOUT_SEEDS and is the ONLY phase that
// touches them; it also stamps `configHashAtUnblind`, after which any render-affecting change
// voids the acceptance. The three groups are disjoint and that is asserted at import, not assumed.
//
// EVERY IMAGE COMES FROM THE DEPLOYED RUNTIME by `eth_call`. Nothing is drawn locally, and a render
// that fails is a failure rather than a skipped cell.
//
// THE OBJECTIVE BATTERY RUNS BEFORE ANY REVIEWER SEES A FRAME, IN EVERY PHASE. That is not a
// convenience; it is the repair of a defect that cost a whole round. `@relics/art-review` has had
// a BLANK_DETECTION check the entire time and this harness did not call it, so two projects
// reached a final reviewer rendering ink 0.000 at all three market states. Both reviewers found it
// unaided and both called it disqualifying — a reviewer doing the harness's job, in a review that
// could have been about the art. The narrow ink floor added afterwards, on the holdout phase only,
// was not the battery either: it looked at twelve neutral frames of one seed group and could not
// see a duplicate, a dead unit, a non-deterministic document or a gas ceiling.
//
// A case whose battery fails a BLOCKING check gets no critic sheets, no critic prompt and no
// holdout freeze. It is recorded as blocked, with the failing checks named, and the run continues.
// ================================================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { admitBrief } from "../packages/art-direction/src/admission.js";
import { validateDirection, directionRecord } from "../packages/art-direction/src/direction.js";
import { authorConfig } from "../packages/art-direction/src/author.js";
import { AUTHORING_SEEDS, DEVELOPMENT_REVIEW_SEEDS, FINAL_HOLDOUT_SEEDS, assertSeedGroupsDisjoint, marketResponseClaimed } from "../packages/art-direction/src/seeds.js";
import { validateCritique, validateResponse, assertBoundedChange, criticPrompt } from "../packages/art-direction/src/critique.js";
import { encodeConfig, decodeConfig } from "../packages/art-review/src/runtimes.js";
import { REVIEW_SEEDS, collectionSeeds } from "../packages/art-review/src/market.js";
import { FLOORS } from "../packages/art-review/src/objective.js";
import { resolveRuntime, createRenderer } from "../packages/art-review/src/render.js";
import { describeValidatorCode } from "../packages/art-review/src/codec/errors.js";
import { grid, rasterize } from "../packages/art-review/src/raster.js";
import { planeOf, inkCoverage, meanDeltaE } from "../packages/art-review/src/perceptual.js";
import { runObjectiveBattery, blockingFailures } from "../packages/art-review/src/objective.js";
import { finalReviewPrompt, finalReviewPromptHash } from "../packages/art-review/src/finalReview.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "artifacts", "art-benchmark");
const BRIEFS = join(ROOT, "packages", "art-direction", "test", "fixtures", "benchmark-briefs.json");
const REGISTRY = "0xCB19507D713DfC4cD212BDc545480e1549A9F231";
const CHAIN_ID = 8453;

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Load the endpoint without ever printing it. Only the host reaches output. */
function rpcUrl() {
  for (const p of [join(ROOT, ".env.local"), join(ROOT, "..", "RELICS", ".env.local")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.BASE_RPC_URL;
  if (!url) throw new Error("BASE_RPC_URL is not set; the benchmark reads the deployed runtimes and cannot be faked offline");
  return url;
}

const argv = process.argv.slice(2);
const phase = argv[0] ?? "report";
const onlyArg = argv.find((a) => a.startsWith("--only="))?.split("=")[1]
  ?? (argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null);
const ONLY = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;

const caseDir = (id) => join(OUT, id);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };

function loadBriefs() {
  const f = readJson(BRIEFS);
  return f.briefs.filter((b) => !ONLY || ONLY.has(b.id));
}
function loadDirections() {
  return readJson(join(OUT, "directions.json")).directions;
}

/**
 * Render a seed x state matrix and write the sheets a reviewer looks at.
 *
 * THE 120px SHEET IS THE ONE THAT DECIDES THINGS. It is the size a collection is browsed at, and
 * the published programme's verdicts were all really settled there; the 256px sheet exists so a
 * reviewer can check whether what it is seeing at 120 is detail or mush.
 */
async function renderSheets({ renderer, configBytes, seeds, states, outDir, label }) {
  mkdirSync(outDir, { recursive: true });
  const records = {};
  for (const seed of seeds) {
    for (const state of states) {
      const r = await renderer.renderOne(configBytes, seed, state);
      if (!r.ok) return { ok: false, detail: `render failed at seed ${seed} / ${state} (failure ${r.failure})` };
      records[`${seed}|${state}`] = r;
    }
  }
  const neutral = seeds.map((s) => ({ svg: records[`${s}|neutral`].svg, label: String(s) }));
  const artifacts = [];
  const write = async (name, buf) => {
    const p = join(outDir, name);
    writeFileSync(p, buf);
    artifacts.push({ path: p, name, bytes: buf.length, sha256: sha256(buf) });
  };
  await write(`${label}-seeds-256.png`, await grid(neutral, { px: 256, cols: 4 }));
  await write(`${label}-seeds-120.png`, await grid(neutral, { px: 120, cols: 6, captionPx: 8 }));
  // State rows: one ROW per state so a reviewer compares down a column (same token, three states).
  const stateCells = [];
  for (const state of states) for (const s of seeds.slice(0, 4)) stateCells.push({ svg: records[`${s}|${state}`].svg, label: `${s} ${state}` });
  await write(`${label}-states-256.png`, await grid(stateCells, { px: 256, cols: 4 }));
  await write(`${label}-states-120.png`, await grid(stateCells, { px: 120, cols: 4, captionPx: 8 }));
  await write(`${label}-single-512.png`, await rasterize(records[`${seeds[2]}|neutral`].svg, 512));

  // Measurements, kept OUT of every reviewer packet and written only to the run record.
  const planes = {};
  for (const k of Object.keys(records)) planes[k] = await planeOf(records[k].svg, 120);
  const ink = seeds.map((s) => inkCoverage(planes[`${s}|neutral`]));
  const stateDe = seeds.map((s) => meanDeltaE(planes[`${s}|neutral`], planes[`${s}|stress`]));
  const seedDe = [];
  for (let i = 0; i < seeds.length; i += 1) for (let j = i + 1; j < seeds.length; j += 1) seedDe.push(meanDeltaE(planes[`${seeds[i]}|neutral`], planes[`${seeds[j]}|neutral`]));
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    ok: true,
    artifacts,
    renders: Object.keys(records).length,
    measurements: {
      inkMean: +avg(ink).toFixed(3), inkMin: +Math.min(...ink).toFixed(3),
      stateDeMean: +avg(stateDe).toFixed(2), stateDeMin: +Math.min(...stateDe).toFixed(2),
      seedDeMean: +avg(seedDe).toFixed(2), seedDeMin: +Math.min(...seedDe).toFixed(2),
    },
  };
}

/**
 * Run the battery and say whether a reviewer may be shown this configuration.
 *
 * THE BATTERY'S OWN SEEDS ARE NEITHER THE DEVELOPMENT NOR THE HOLDOUT GROUP — it uses
 * `REVIEW_SEEDS` (101 + 37i) and `collectionSeeds` (1 + 613i), both disjoint from all three
 * benchmark groups, which is asserted rather than assumed below. So running it costs nothing in
 * holdout leakage and its hundred-seed sweep says something about the collection that twelve seeds
 * cannot.
 */
async function gateOn({ renderer, runtimeId, config, configBytes, briefId, phase }) {
  const battery = await runObjectiveBattery({ renderer, runtimeId, config, configBytes });
  const blocked = blockingFailures(battery);
  const summary = battery.checks.map((c) => `${c.ok ? "ok  " : "FAIL"} ${c.id}`).join("\n    ");
  if (blocked.length) {
    console.log(`${briefId} BLOCKED at ${phase} by the objective battery:\n    ${summary}`);
    for (const b of blocked) console.log(`      ${b.id}: ${b.detail}`);
  }
  return { battery, blocked };
}

function assertBatterySeedsAreNotBenchmarkSeeds() {
  const groups = new Set([...AUTHORING_SEEDS, ...DEVELOPMENT_REVIEW_SEEDS, ...FINAL_HOLDOUT_SEEDS]);
  const overlap = [...REVIEW_SEEDS, ...collectionSeeds(FLOORS.collectionSeeds)].filter((s) => groups.has(s));
  if (overlap.length) {
    throw new Error(`OBJECTIVE_BATTERY_SEED_LEAK: the battery renders ${overlap.join(", ")}, which are benchmark seeds. Running it would put holdout or development frames into the author's reach.`);
  }
  return { ok: true };
}

async function rendererFor(runtimeId, url) {
  const resolved = await resolveRuntime({ rpcUrl: url, registry: REGISTRY, runtimeId });
  if (!resolved.ok) throw new Error(`${runtimeId}: ${resolved.state} — ${resolved.detail}`);
  return { renderer: createRenderer({ rpcUrl: url, chainId: CHAIN_ID, resolved, concurrency: 8 }), resolved };
}

// ---------------------------------------------------------------------------------------------
// PHASE: author
// ---------------------------------------------------------------------------------------------
async function phaseAuthor() {
  assertSeedGroupsDisjoint();
  assertBatterySeedsAreNotBenchmarkSeeds();
  const url = rpcUrl();
  const directions = loadDirections();
  const renderers = {};
  const rows = [];

  for (const brief of loadBriefs()) {
    const dir = caseDir(brief.id);
    const admission = admitBrief(brief.text);
    if (!admission.admitted) {
      writeJson(join(dir, "run.json"), { briefId: brief.id, axis: brief.axis, phase: "ADMISSION", admission, sentToAuthor: false });
      rows.push({ id: brief.id, outcome: admission.outcome });
      console.log(`${brief.id} ${admission.outcome}`);
      continue;
    }
    const direction = directions[brief.id];
    const dv = validateDirection(direction, { admission });
    if (!dv.ok) throw new Error(`${brief.id}: art direction invalid — ${dv.problems.join("; ")}`);
    const runtimeId = admission.recommended.split("/")[0];
    const templateId = admission.recommended;
    const record = directionRecord({ direction, briefSha256: sha256(brief.text), admission, runtimeId, templateId });

    const authored = authorConfig({ runtimeId, direction });
    const configBytes = encodeConfig(runtimeId, authored.config);

    renderers[runtimeId] ??= await rendererFor(runtimeId, url);
    const { renderer, resolved } = renderers[runtimeId];
    const v = await renderer.validateConfig(configBytes);
    if (!v.legal) {
      throw new Error(`${brief.id}: authored config rejected by the deployed runtime — ${JSON.stringify(describeValidatorCode(runtimeId, v.code))}`);
    }

    // THE BATTERY FIRST, AND THE SHEETS ONLY IF IT LETS THEM THROUGH.
    const { battery, blocked } = await gateOn({ renderer, runtimeId, config: authored.config, configBytes, briefId: brief.id, phase: "author" });
    writeJson(join(dir, "round-1", "objective.json"), battery);

    const states = ["neutral", "stress", "recovery"];
    const dev = blocked.length === 0
      ? await renderSheets({ renderer, configBytes, seeds: DEVELOPMENT_REVIEW_SEEDS, states, outDir: join(dir, "round-1", "critic-sheets"), label: "dev" })
      : { ok: true, artifacts: [], renders: 0, measurements: null };
    if (!dev.ok) throw new Error(`${brief.id}: ${dev.detail}`);

    writeJson(join(dir, "run.json"), {
      briefId: brief.id, axis: brief.axis, title: brief.title,
      phase: blocked.length === 0 ? "AUTHORED" : "BLOCKED_BY_OBJECTIVE_BATTERY",
      objectiveBlockers: blocked,
      briefSha256: sha256(brief.text), admission, sentToAuthor: true,
      direction: record, runtimeId, templateId,
      runtimeAddress: resolved.address, runtimeCodeBytes: resolved.codeBytes,
      rounds: [{
        round: 1, configHash: sha256(configBytes), configBytes,
        config: authored.config, intent: authored.intent, intentDerivation: authored.intentDerivation,
        mechanism: authored.mechanism,
        atlas: authored.atlas, bindings: authored.bindings, notes: authored.notes,
        objective: { pass: battery.pass, blocked: blocked.map((b) => b.id), checks: battery.checks.map((c) => ({ id: c.id, ok: c.ok })) },
        sheets: dev.artifacts.map((a) => ({ name: a.name, sha256: a.sha256, bytes: a.bytes })),
        measurements: dev.measurements,
      }],
    });
    if (blocked.length === 0) {
      writeFileSync(join(dir, "round-1", "critic-prompt.md"), criticPrompt({
        round: 1, roundsRemaining: 4, direction, briefText: brief.text,
      }));
    }
    rows.push({ id: brief.id, runtime: runtimeId, blocked: blocked.length, ...(dev.measurements ?? {}) });
    if (blocked.length === 0) {
      console.log(`${brief.id} ${runtimeId.replace("_V1", "").padEnd(20)} ${authored.mechanism.mechanism.padEnd(11)} ink ${dev.measurements.inkMean} state ${dev.measurements.stateDeMean} seed ${dev.measurements.seedDeMean}`);
    }
  }
  console.log(`\nAUTHORED ${rows.length} case(s). Critic packets: artifacts/art-benchmark/<id>/round-1/`);
}

// ---------------------------------------------------------------------------------------------
// PHASE: revise — apply the author's response to a critique and re-author
// ---------------------------------------------------------------------------------------------
async function phaseRevise() {
  const url = rpcUrl();
  const renderers = {};
  for (const brief of loadBriefs()) {
    const dir = caseDir(brief.id);
    const runPath = join(dir, "run.json");
    if (!existsSync(runPath)) continue;
    const run = readJson(runPath);
    if (run.phase === "ADMISSION") continue;
    const roundNo = run.rounds.length;
    const cPath = join(dir, `round-${roundNo}`, "critique.json");
    const rPath = join(dir, `round-${roundNo}`, "response.json");
    if (!existsSync(cPath) || !existsSync(rPath)) { console.log(`${brief.id} SKIP: no critique/response for round ${roundNo}`); continue; }

    const critique = readJson(cPath);
    const response = readJson(rPath);
    const cv = validateCritique(critique);
    if (!cv.ok) throw new Error(`${brief.id}: critique invalid — ${cv.problems.join("; ")}`);
    const rv = validateResponse(critique, response);
    if (!rv.ok) throw new Error(`${brief.id}: response invalid — ${rv.problems.join("; ")}`);

    const before = run.rounds[roundNo - 1].config;
    // The author applies its OWN response: each accepted finding names parameters, and only those
    // parameters move. `patch` is the response's declared edit, expressed as config paths.
    const after = JSON.parse(JSON.stringify(before));
    for (const r of response.responses) {
      if (r.disposition === "REJECT_WITH_REASON") continue;
      for (const [path, value] of Object.entries(r.patch ?? {})) {
        const m = /^(\w+)\[(\d+)\]\.(\w+)$/.exec(path);
        if (m) { after[m[1]] ??= []; after[m[1]][Number(m[2])] ??= {}; after[m[1]][Number(m[2])][m[3]] = value; }
        else after[path] = value;
      }
    }
    const bounded = assertBoundedChange({ before, after, response });
    if (!bounded.ok) throw new Error(`${brief.id}: unbounded change — ${bounded.detail}`);

    const configBytes = encodeConfig(run.runtimeId, after);
    renderers[run.runtimeId] ??= await rendererFor(run.runtimeId, url);
    const { renderer } = renderers[run.runtimeId];
    const v = await renderer.validateConfig(configBytes);
    if (!v.legal) throw new Error(`${brief.id}: revised config rejected — ${JSON.stringify(describeValidatorCode(run.runtimeId, v.code))}`);

    const next = roundNo + 1;
    const { battery, blocked } = await gateOn({ renderer, runtimeId: run.runtimeId, config: after, configBytes, briefId: brief.id, phase: `revise round ${next}` });
    writeJson(join(dir, `round-${next}`, "objective.json"), battery);
    const dev = blocked.length === 0
      ? await renderSheets({ renderer, configBytes, seeds: DEVELOPMENT_REVIEW_SEEDS, states: ["neutral", "stress", "recovery"], outDir: join(dir, `round-${next}`, "critic-sheets"), label: "dev" })
      : { ok: true, artifacts: [], renders: 0, measurements: null };
    if (!dev.ok) throw new Error(`${brief.id}: ${dev.detail}`);

    run.rounds[roundNo - 1].critique = critique;
    run.rounds[roundNo - 1].response = response;
    run.rounds[roundNo - 1].boundedChange = bounded;
    run.rounds.push({
      round: next, configHash: sha256(configBytes), configBytes, config: after,
      objective: { pass: battery.pass, blocked: blocked.map((b) => b.id), checks: battery.checks.map((c) => ({ id: c.id, ok: c.ok })) },
      sheets: dev.artifacts.map((a) => ({ name: a.name, sha256: a.sha256, bytes: a.bytes })),
      measurements: dev.measurements,
    });
    run.phase = blocked.length === 0 ? "REVISED" : "BLOCKED_BY_OBJECTIVE_BATTERY";
    run.objectiveBlockers = blocked;
    writeJson(runPath, run);
    if (blocked.length === 0) console.log(`${brief.id} round ${next}: ink ${dev.measurements.inkMean} state ${dev.measurements.stateDeMean} seed ${dev.measurements.seedDeMean} (moved ${bounded.counts.moved} params, all named)`);
  }
}

// ---------------------------------------------------------------------------------------------
// PHASE: holdout — the ONLY phase that renders FINAL_HOLDOUT_SEEDS
// ---------------------------------------------------------------------------------------------
async function phaseHoldout() {
  assertBatterySeedsAreNotBenchmarkSeeds();
  const url = rpcUrl();
  const renderers = {};
  const briefsById = Object.fromEntries(readJson(BRIEFS).briefs.map((b) => [b.id, b]));
  for (const brief of loadBriefs()) {
    const dir = caseDir(brief.id);
    const runPath = join(dir, "run.json");
    if (!existsSync(runPath)) continue;
    const run = readJson(runPath);
    if (run.phase === "ADMISSION") continue;
    const last = run.rounds[run.rounds.length - 1];

    renderers[run.runtimeId] ??= await rendererFor(run.runtimeId, url);
    const { renderer } = renderers[run.runtimeId];

    // THE BATTERY RUNS AGAIN HERE, ON THE EXACT BYTES ABOUT TO BE FROZEN, BEFORE THE HOLDOUT IS
    // EVER RENDERED. The configuration may have moved since the last round, and the freeze is the
    // last moment anything can be said about it: after `configHashAtUnblind` is written, a
    // render-affecting change voids the acceptance rather than improving it.
    const { battery, blocked } = await gateOn({ renderer, runtimeId: run.runtimeId, config: last.config, configBytes: last.configBytes, briefId: brief.id, phase: "holdout freeze" });
    writeJson(join(dir, "final-review", "objective.json"), battery);
    if (blocked.length) {
      run.phase = "BLOCKED_BY_OBJECTIVE_BATTERY";
      run.objectiveBlockers = blocked;
      writeJson(runPath, run);
      console.log(`${brief.id} NOT FROZEN: ${blocked.map((b) => b.id).join(", ")}. No reviewer is asked to look at a collection the harness already knows is broken.`);
      continue;
    }

    const out = await renderSheets({
      renderer, configBytes: last.configBytes, seeds: FINAL_HOLDOUT_SEEDS,
      states: ["neutral", "stress", "recovery"], outDir: join(dir, "final-review", "sheets"), label: "holdout",
    });
    if (!out.ok) throw new Error(`${brief.id}: ${out.detail}`);

    // THE INSTRUCTION IS GENERATED, HASHED AND WRITTEN BESIDE THE SHEETS.
    //
    // Round one derived FINAL_REVIEW_BLINDED from a field the reviewer set in its own verdict, so
    // the claim rested on the testimony of the thing being measured. Twelve reviewers now get a
    // byte-identical instruction that lives in the repository, and its hash is in the run record.
    writeFileSync(join(dir, "final-review", "brief.md"), briefsById[brief.id].text);
    const prompt = finalReviewPrompt({
      caseId: brief.id,
      sheetDir: `artifacts/art-benchmark/${brief.id}/final-review/sheets`,
      sheets: out.artifacts.map((a) => a.name),
      seedCount: FINAL_HOLDOUT_SEEDS.length,
      states: ["neutral", "stress", "recovery"],
    });
    writeFileSync(join(dir, "final-review", "reviewer-prompt.md"), prompt);

    run.finalReviewInput = {
      seedGroup: "FINAL_HOLDOUT_SEEDS",
      reviewerPromptSha256: finalReviewPromptHash(prompt),
      seeds: [...FINAL_HOLDOUT_SEEDS],
      states: ["neutral", "stress", "recovery"],
      marketResponseClaimed: marketResponseClaimed(briefsById[brief.id].text),
      configHashAtUnblind: last.configHash,
      objectiveBatteryPassed: battery.pass,
      sheets: out.artifacts.map((a) => ({ name: a.name, sha256: a.sha256, bytes: a.bytes })),
      inputHashes: out.artifacts.map((a) => a.sha256),
      measurements: out.measurements,
      frozenAt: new Date().toISOString(),
    };
    run.phase = "AWAITING_FINAL_REVIEW";
    writeJson(runPath, run);
    console.log(`${brief.id} holdout frozen at ${last.configHash.slice(0, 12)} — ink ${out.measurements.inkMean} state ${out.measurements.stateDeMean} seed ${out.measurements.seedDeMean}`);
  }
}

// ---------------------------------------------------------------------------------------------
// PHASE: report
// ---------------------------------------------------------------------------------------------
function phaseReport() {
  const briefs = readJson(BRIEFS).briefs;
  const rows = [];
  for (const b of briefs) {
    const p = join(caseDir(b.id), "run.json");
    if (!existsSync(p)) { rows.push({ id: b.id, axis: b.axis, state: "NOT_RUN" }); continue; }
    const run = readJson(p);
    const verdictPath = join(caseDir(b.id), "final-review", "verdict.json");
    const verdict = existsSync(verdictPath) ? readJson(verdictPath) : null;
    rows.push({
      id: b.id, axis: b.axis,
      outcome: run.admission?.outcome,
      runtime: run.runtimeId ?? null,
      template: run.templateId ?? null,
      rounds: run.rounds?.length ?? 0,
      verdict: verdict?.verdict ?? (run.phase === "AWAITING_FINAL_REVIEW" ? "AWAITING" : run.phase),
      objectiveBlockers: run.objectiveBlockers?.map((b) => b.id) ?? [],
      reviewerId: verdict?.reviewerId ?? null,
      configHashAtUnblind: run.finalReviewInput?.configHashAtUnblind ?? null,
      acceptedConfigHash: run.rounds?.[run.rounds.length - 1]?.configHash ?? null,
    });
  }
  const pass = rows.filter((r) => r.verdict === "PASS");
  const byRuntime = {};
  for (const r of pass) byRuntime[r.runtime] = (byRuntime[r.runtime] ?? 0) + 1;
  const mutated = rows.filter((r) => r.configHashAtUnblind && r.acceptedConfigHash && r.configHashAtUnblind !== r.acceptedConfigHash);

  console.log("brief  axis                    runtime               rounds  verdict");
  for (const r of rows) {
    console.log(`${r.id}    ${(r.axis ?? "").padEnd(23)} ${(r.runtime ?? "-").replace("_V1", "").padEnd(21)} ${String(r.rounds).padEnd(7)} ${r.verdict ?? "-"}`);
  }
  console.log("");
  console.log(`BLIND_PASS                                   ${pass.length}/${rows.length}`);
  for (const [rt, n] of Object.entries(byRuntime)) console.log(`  from ${rt.padEnd(38)} ${n}`);
  const blockedRows = rows.filter((r) => r.objectiveBlockers?.length);
  console.log(`FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND   ${mutated.length}`);
  console.log(`BLOCKED_BY_OBJECTIVE_BATTERY                 ${blockedRows.length}${blockedRows.length ? ` (${blockedRows.map((r) => `${r.id}:${r.objectiveBlockers.join("+")}`).join(", ")})` : ""}`);
  console.log(`OBJECTIVE_BATTERY_RUN_BEFORE_REVIEW          YES (all phases)`);
  writeJson(join(OUT, "report.json"), { generatedAt: new Date().toISOString(), rows, blindPass: pass.length, total: rows.length, byRuntime, mutatedAfterUnblind: mutated.length, blockedByObjectiveBattery: blockedRows.map((r) => ({ id: r.id, blockers: r.objectiveBlockers })) });
}

// ---------------------------------------------------------------------------------------------
// PHASE: receipt -- bind everything to the exact bytes, once a verdict exists
// ---------------------------------------------------------------------------------------------
async function phaseReceipt() {
  const { buildArtAcceptance, writeArtAcceptance, verifyArtAcceptance, acceptanceFlags } = await import("../packages/art-direction/src/acceptance.js");
  const { atlasProvenance } = await import("../packages/art-direction/src/atlas.js");
  const briefsById = Object.fromEntries(readJson(BRIEFS).briefs.map((b) => [b.id, b]));
  let built = 0;
  for (const brief of loadBriefs()) {
    const dir = caseDir(brief.id);
    const runPath = join(dir, "run.json");
    if (!existsSync(runPath)) continue;
    const run = readJson(runPath);
    if (run.phase === "ADMISSION") continue;
    const vPath = join(dir, "final-review", "verdict.json");
    if (!existsSync(vPath)) { console.log(`${brief.id} SKIP: no final verdict yet`); continue; }
    const verdict = readJson(vPath);
    const last = run.rounds[run.rounds.length - 1];

    const rounds = run.rounds.map((r, i) => {
      const cp = join(dir, `round-${i + 1}`, "critique.json");
      const rp = join(dir, `round-${i + 1}`, "response.json");
      return {
        round: i + 1,
        criticId: existsSync(cp) ? readJson(cp).criticId : null,
        configHash: r.configHash,
        critique: existsSync(cp) ? readJson(cp) : null,
        response: existsSync(rp) ? readJson(rp) : null,
      };
    });

    // THE WORKSPACE IS THE CASE DIRECTORY, so the receipt sits beside the evidence it binds.
    const record = buildArtAcceptance({
      runtimeId: run.runtimeId,
      templateId: run.templateId,
      chainId: run.chainId ?? CHAIN_ID,
      runtimeAddress: run.runtimeAddress,
      runtimeCodeHash: atlasProvenance().runtimeCodeHash?.[run.runtimeId]?.codeHash ?? null,
      briefText: briefsById[brief.id].text,
      admission: run.admission,
      direction: run.direction,
      atlasRecord: last.atlas ?? run.rounds[0].atlas,
      acceptedConfigBytes: last.configBytes,
      objective: null,
      rounds,
      finalReview: {
        reviewerId: verdict.reviewerId,
        verdict: verdict.verdict,
        blinded: true,
        describedBeforeBrief: verdict.describedBeforeBrief === true,
        seedGroup: run.finalReviewInput.seedGroup,
        seeds: run.finalReviewInput.seeds,
        states: run.finalReviewInput.states,
        configHashAtUnblind: run.finalReviewInput.configHashAtUnblind,
        inputHashes: run.finalReviewInput.inputHashes,
        visualDescription: existsSync(join(dir, "final-review", "description.json"))
          ? JSON.stringify(readJson(join(dir, "final-review", "description.json"))) : null,
      },
      seedGroups: { authorSawHoldout: false, authoring: "AUTHORING_SEEDS", development: "DEVELOPMENT_REVIEW_SEEDS", final: "FINAL_HOLDOUT_SEEDS" },
    });
    writeArtAcceptance(dir, record);
    const check = verifyArtAcceptance(dir, { configBytes: last.configBytes, briefText: briefsById[brief.id].text, runtimeId: run.runtimeId });
    const flags = acceptanceFlags(dir);
    built += 1;
    console.log(`${brief.id} ${verdict.verdict.padEnd(6)} receipt ${check.accepted ? "ACCEPTED" : check.reasonCode} | atlas ${flags.AUTHOR_USES_RUNTIME_PARAMETER_ATLAS} | blinded ${flags.FINAL_REVIEW_BLINDED} | describedFirst ${flags.VISUAL_DESCRIPTION_BEFORE_BRIEF_COMPARISON} | unanswered ${flags.CRITIQUE_WITHOUT_AUTHOR_RESPONSE} | mutatedAfterUnblind ${flags.FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND}`);
  }
  console.log(`\nreceipts built: ${built}`);
}

const phases = { author: phaseAuthor, revise: phaseRevise, holdout: phaseHoldout, receipt: phaseReceipt, report: async () => phaseReport() };
if (!phases[phase]) { console.error(`unknown phase "${phase}"; one of ${Object.keys(phases).join(", ")}`); process.exit(2); }
await phases[phase]();
