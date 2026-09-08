#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE PRODUCT BOUNDARY, PROVED BY EXECUTION.
//
//   node scripts/check-art-authority.mjs           # human output, non-zero exit on any failure
//   node scripts/check-art-authority.mjs --json    # machine output
//
// WHY THIS EXISTS
//
// Two capabilities ship in one command surface and they are not at the same maturity:
//
//   AUTONOMOUS LAUNCH of a project whose art already carries an acceptance — chain selection,
//   quote selection, metadata birth, prepare, predict, simulate, build, policy check, protected
//   signing, broadcast, confirmation, verification — is the production path, and
//   `npm run e2e:autonomous` walks all of it against a fork of the deployed factory.
//
//   AUTONOMOUS ART CREATION — a plain-language brief in, launch-quality art out — is EXPERIMENTAL.
//   Three authored rounds have been scored blind and none of them produced an accepted
//   configuration. That is the measurement, and it is derived below from the committed receipts
//   rather than typed here, because a number typed into a status line is a number nobody re-reads.
//
// A DOCUMENT CANNOT PROVE EITHER OF THOSE. Prose saying "refused art cannot broadcast" is a
// promise; the only evidence is running the real gate, on real receipts, through the real CLI, and
// reading the exit code. So every case below EXECUTES something:
// `requireArtAccepted` and `artGateDisposition` are the shipped functions, the CLI cases spawn
// `packages/creator-cli/bin/relics.js`, and the counters are read off `artifacts/`.
//
// THE THREE FAILURES THIS IS SHAPED AROUND
//
//   1. A GATE STUCK RED PROVES NOTHING. If accepted art were refused too, every refusal below
//      would be true and meaningless. CASE 01 is the positive control and it runs first.
//   2. A WARNING MUST NOT BE A UNIVERSAL BYPASS. Decision C lets a person overrule a SUBJECTIVE
//      verdict on a run they sign themselves. It does not let anybody past a receipt that is not
//      evidence. CASE 08 is the control that separates them, and without it CASE 07 could be
//      satisfied by a gate that had simply stopped working.
//   3. AN OVERRIDE MUST NOT MANUFACTURE AN ACCEPTANCE. The moment a human proceeding past a
//      warning writes an `ART_REVIEW` receipt, a later unattended run reads that receipt and
//      launches on art no reviewer accepted. CASE 07 asserts the absence of the file, on disk,
//      after the run — not the absence of a call in the source.
// ================================================================================================

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SUBJECTIVE_ART_REASON_CODES,
  artGateDisposition,
  artReviewApplies,
  isHumanControlledLaunch,
  requireArtAccepted,
} from "../packages/creator-cli/src/commands/agent-art.js";
import { configHashOf } from "../packages/art-review/src/receipt.js";
import { encodeConfig, presetConfig } from "../packages/art-review/src/runtimes.js";
import { buildArtAcceptance, writeArtAcceptance } from "../packages/art-direction/src/acceptance.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "packages", "creator-cli", "bin", "relics.js");
const JSON_OUT = process.argv.includes("--json");

const RUNTIME_ID = "GEOMETRIC_RECURSION_V1";
const BRIEF = "# Brief\n\nBotanical, patient, unhurried. A fixture brief.\n";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const EXIT_BLOCKED = 6;

/** A policy that CAN broadcast without a person. Everything unattended is measured against this. */
const UNATTENDED = { goal: "LAUNCH", allowBroadcast: true };
/** A policy a person is driving. Two independent shapes, and both are exercised. */
const HUMAN_BUILD_ONLY = { goal: "BUILD_ONLY", allowBroadcast: false };
const HUMAN_NO_BROADCAST = { goal: "LAUNCH", allowBroadcast: false };

const results = [];
const record = (id, name, ok, detail) => {
  results.push({ id, name, ok, detail });
  if (!JSON_OUT) console.log(`  ${ok ? "ok  " : "FAIL"} ${id}. ${name}${ok ? "" : `\n        ${detail}`}`);
};

// ------------------------------------------------------------------------------------------------
// FIXTURES — the same construction the shipped benchmark uses, so nothing here is a special case.
// ------------------------------------------------------------------------------------------------

/** A workspace whose ART-REVIEW half is genuinely accepted. The art-direction half is planted after. */
function workspace({ policy = UNATTENDED, artReviewVerdict = "SHIP" } = {}) {
  const ws = mkdtempSync(join(tmpdir(), "relics-art-authority-"));
  const cfg = presetConfig(RUNTIME_ID);
  const configBytes = encodeConfig(RUNTIME_ID, cfg);

  writeFileSync(join(ws, "art.json"), JSON.stringify({ runtimeId: RUNTIME_ID, config: cfg }, null, 2));
  writeFileSync(join(ws, "brief.md"), BRIEF);
  writeFileSync(join(ws, "relics.agent.json"), JSON.stringify({
    version: 1,
    goal: policy.goal,
    allowedChains: [8453],
    chainSelection: "PREFERRED_ORDER",
    allowedRuntimes: ["SOLIDITY_SVG_V1"],
    allowedQuoteAssets: "AUTO",
    creatorRecipient: "0x000000000000000000000000000000000E2E7e57",
    allowedAntiSnipeModes: ["NONE", "PROTECTED_98_MINUTES"],
    antiSnipePreference: "AUTO",
    maxRoyaltyBps: 500,
    maxNativeSpendWei: "0",
    maxGasPriceWei: "200000000000",
    maxTransactionGas: "16000000",
    requireSimulation: true,
    requireMetadataReadback: true,
    requireDeterministicPrediction: true,
    requiredConfirmations: 2,
    allowBroadcast: policy.allowBroadcast,
    signer: "local-sidecar",
  }, null, 2));

  const packetDir = join(ws, ".relics-agent", "art-review", "round-1", "packet");
  mkdirSync(packetDir, { recursive: true });
  const verdictBytes = Buffer.from(`${JSON.stringify({ reviewerId: "reviewer-r", verdict: artReviewVerdict, axes: {} }, null, 2)}\n`);
  writeFileSync(join(packetDir, "verdict.json"), verdictBytes);

  mkdirSync(join(ws, ".relics-agent", "receipts"), { recursive: true });
  writeFileSync(join(ws, ".relics-agent", "receipts", "art-review.json"), JSON.stringify({
    schemaVersion: 1,
    kind: "ART_VISUAL_ACCEPTANCE",
    accepted: artReviewVerdict === "SHIP",
    verdict: artReviewVerdict,
    runtimeId: RUNTIME_ID,
    verdictDocument: {
      path: join(".relics-agent", "art-review", "round-1", "packet", "verdict.json"),
      sha256: createHash("sha256").update(verdictBytes).digest("hex"),
      verdictField: "verdict",
    },
    briefSha256: sha256(BRIEF),
    acceptedConfigHash: configHashOf(configBytes),
    reviewerId: "reviewer-r",
    rounds: [{ round: 1, reviewerId: "critic-a" }],
  }, null, 2));

  return { ws, configBytes };
}

/** Plant an art-DIRECTION receipt, exactly the way `scripts/run-art-benchmark.mjs` does. */
function plantArtDirection(ws, configBytes, { seedGroups, verdict = "PASS", bindDocument = true, reviewerId = "reviewer-z" } = {}) {
  const finalReview = {
    reviewerId,
    verdict,
    blinded: true,
    describedBeforeBrief: true,
    seedGroup: "FINAL_HOLDOUT_SEEDS",
    seeds: [901, 902, 903],
    states: ["neutral", "stress", "recovery"],
    configHashAtUnblind: null,
    visualDescription: "a fixture description",
  };
  const doc = { reviewerId, verdict, describedBeforeBrief: true, reasoning: "a fixture reviewer's reasoning, long enough to be a document rather than a flag" };
  const bytes = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`);
  mkdirSync(join(ws, "final-review"), { recursive: true });
  writeFileSync(join(ws, "final-review", "verdict.json"), bytes);
  if (bindDocument) {
    finalReview.verdictDocument = {
      path: join("final-review", "verdict.json"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      verdictField: "verdict",
    };
  }
  writeArtAcceptance(ws, buildArtAcceptance({
    runtimeId: RUNTIME_ID,
    templateId: "GEOMETRIC_RECURSION_V1/compass",
    chainId: 8453,
    briefText: BRIEF,
    acceptedConfigBytes: configBytes,
    admission: { outcome: "ADMITTED", admitted: true, recommended: "GEOMETRIC_RECURSION_V1/compass", requiredCapabilities: {}, concessions: [] },
    direction: { directionHash: "d".repeat(64), createdAt: new Date().toISOString(), containsRuntimeConfig: false },
    atlasRecord: { consultationCount: 10, consultedParameters: ["rules[n].shapeSet"] },
    objective: { pass: true, checks: [{ id: "CONFIG_LEGAL", ok: true }] },
    rounds: [{ round: 1, criticId: "critic-a", configHash: "x", critique: { findings: [{ id: "f1" }] }, response: { responses: [{ findingId: "f1", disposition: "ACCEPT" }] } }],
    finalReview,
    seedGroups: seedGroups ?? { authorSawHoldout: false, holdoutIntegrity: "HELD", roundId: "R-01" },
  }));
}

/** Every receipt in the workspace, by name AND content. A new file, or an edited one, moves this. */
function receiptsDigest(ws) {
  const dir = join(ws, ".relics-agent", "receipts");
  if (!existsSync(dir)) return "ABSENT";
  const h = createHash("sha256");
  for (const f of readdirSync(dir).sort()) h.update(f).update("\0").update(readFileSync(join(dir, f)));
  return h.digest("hex");
}

/** Run the REAL CLI. "the function returns ok:false" and "the command refuses" are two claims. */
function cli(ws, phase) {
  try {
    const out = execFileSync("node", [CLI, "agent", phase, "--workspace", ws, "--json"], { encoding: "utf8", cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, out };
  } catch (err) {
    return { status: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const used = [];
const scratch = (fn) => {
  const made = fn();
  used.push(made.ws);
  return made;
};

// ------------------------------------------------------------------------------------------------
// THE CASES
// ------------------------------------------------------------------------------------------------

// CASE 01 — POSITIVE CONTROL, AND IT RUNS FIRST ON PURPOSE.
{
  const { ws, configBytes } = scratch(() => workspace({ policy: UNATTENDED }));
  plantArtDirection(ws, configBytes);
  const gate = await requireArtAccepted(ws, { goal: "LAUNCH" });
  const d = artGateDisposition(gate, UNATTENDED);
  record("01", "ACCEPTED art passes the gate on an UNATTENDED run — without this every refusal below is a gate stuck red",
    gate.ok === true && d.disposition === "PASS", `${gate.reasonCode}: ${gate.detail}`);
}

// CASE 02 — A REFUSED VERDICT CANNOT BROADCAST. The headline claim, through the real CLI.
{
  const { ws, configBytes } = scratch(() => workspace({ policy: UNATTENDED }));
  plantArtDirection(ws, configBytes, { verdict: "REFUSE" });
  const prepare = cli(ws, "prepare");
  const broadcast = cli(ws, "broadcast");
  record("02", "REFUSED art on an unattended run: the real CLI exits BLOCKED at `agent prepare` AND at `agent broadcast`",
    prepare.status === EXIT_BLOCKED && broadcast.status === EXIT_BLOCKED,
    `prepare exited ${prepare.status}, broadcast exited ${broadcast.status}\n${prepare.out.slice(0, 400)}`);
}

// CASE 03 — ABSENT review. Nobody looked, and an unattended run may not decide that is fine.
{
  const { ws } = scratch(() => workspace({ policy: UNATTENDED }));
  rmSync(join(ws, ".relics-agent", "receipts", "art-review.json"), { force: true });
  const r = cli(ws, "prepare");
  record("03", "ABSENT review on an unattended run: `agent prepare` exits BLOCKED and NAMES the missing acceptance",
    r.status === EXIT_BLOCKED && /NO_ART_ACCEPTANCE/.test(r.out), `exited ${r.status}\n${r.out.slice(0, 400)}`);
}

// CASE 04 — STALE. The receipt describes bytes the workspace no longer holds.
{
  const { ws, configBytes } = scratch(() => workspace({ policy: UNATTENDED }));
  plantArtDirection(ws, configBytes);
  const p = join(ws, "art.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  // A FIELD THE ENCODER ACTUALLY READS. The first draft of this case added a junk key and asserted
  // a refusal that never came — the encoder ignores unknown keys, so the bytes were identical and
  // the acceptance was correctly still valid. A "stale" fixture whose bytes did not move is a test
  // of nothing, and it passed as a failure only because the assertion was the right way round.
  doc.config.rotation = (doc.config.rotation ?? 0) + 7;
  doc.config.rules[0].contraction = (doc.config.rules[0].contraction ?? 90) - 5;
  writeFileSync(p, JSON.stringify(doc, null, 2));
  const moved = configHashOf(encodeConfig(RUNTIME_ID, doc.config)) !== configHashOf(configBytes);
  const gate = await requireArtAccepted(ws, { goal: "LAUNCH" });
  record("04", "STALE acceptance on an unattended run is refused — a reviewer looked at other bytes",
    moved && gate.ok === false, `bytesMoved=${moved} ${gate.reasonCode}: ${gate.detail}`);
}

// CASE 05 — SELF-ATTESTED. The receipt's verdict is not bound to any reviewer document.
{
  const { ws, configBytes } = scratch(() => workspace({ policy: UNATTENDED }));
  plantArtDirection(ws, configBytes, { bindDocument: false });
  const gate = await requireArtAccepted(ws, { goal: "LAUNCH" });
  record("05", "SELF-ATTESTED verdict is refused — a receipt that vouches for itself is not evidence",
    gate.ok === false, `${gate.reasonCode}: ${gate.detail}`);
}

// CASE 06 — COMPROMISED holdout: the reviewer judged seeds the author had already seen.
{
  const { ws, configBytes } = scratch(() => workspace({ policy: UNATTENDED }));
  plantArtDirection(ws, configBytes, { seedGroups: { authorSawHoldout: true, holdoutIntegrity: "COMPROMISED", roundId: "R-01", holdoutDetail: "seeds found in author-visible source" } });
  const gate = await requireArtAccepted(ws, { goal: "LAUNCH" });
  record("06", "COMPROMISED holdout is refused — holdout integrity FAILED is not a launchable state",
    gate.ok === false && gate.reasonCode === "FINAL_REVIEW_HOLDOUT_COMPROMISED", `${gate.reasonCode}: ${gate.detail}`);
}

// CASE 07 — THE HUMAN PATH. A subjective verdict is a WARNING a person may proceed past, and
// proceeding past it MUST NOT leave anything behind that says a reviewer accepted the work.
let humanWarnHolds = false;
let noManufacturedReceipt = false;
{
  for (const policy of [HUMAN_BUILD_ONLY, HUMAN_NO_BROADCAST]) {
    // THE REFUSAL COMES FROM THE HALF THAT ALSO CARRIES `accepted`. An earlier draft left the
    // art-review half saying SHIP and refused only in art-direction, so `accepted: true` was
    // sitting in the fixture before the run — and "did the override manufacture an acceptance?"
    // cannot be answered by reading a field somebody else already wrote.
    const { ws, configBytes } = scratch(() => workspace({ policy, artReviewVerdict: "REFUSE" }));
    plantArtDirection(ws, configBytes, { verdict: "REFUSE" });
    const gate = await requireArtAccepted(ws, { goal: policy.goal });
    const d = artGateDisposition(gate, policy);
    const warned = gate.ok === false && d.disposition === "WARN" && d.humanOverride === true;

    // Drive the REAL CLI past the gate, then compare the receipts directory BYTE FOR BYTE with what
    // was there before. `agent prepare` fails later for its own reasons — there is no chain here —
    // and that is fine: what must not happen is a refusal AT THE ART GATE, and what must not appear
    // is any new or altered receipt. A digest answers both without trusting a filename.
    const before = receiptsDigest(ws);
    const r = cli(ws, "prepare");
    const after = receiptsDigest(ws);
    const receiptsUnchanged = before === after;
    const refusedAtArtGate = r.status === EXIT_BLOCKED && /artGate/.test(r.out);
    const warningSurfaced = /human-controlled/i.test(r.out) && /carries no acceptance/i.test(r.out);

    humanWarnHolds = warned && !refusedAtArtGate && warningSurfaced;
    noManufacturedReceipt = receiptsUnchanged;
    record("07", `HUMAN-CONTROLLED (${policy.goal}, allowBroadcast=${policy.allowBroadcast}): a subjective REFUSE is a WARNING the creator SEES, the build proceeds, and the receipt chain is untouched`,
      humanWarnHolds && noManufacturedReceipt,
      `disposition=${d.disposition} humanOverride=${d.humanOverride} refusedAtArtGate=${refusedAtArtGate} warningSurfaced=${warningSurfaced} receiptsUnchanged=${receiptsUnchanged} cliExit=${r.status}\n${r.out.slice(0, 400)}`);
    if (!(humanWarnHolds && noManufacturedReceipt)) break;
  }
}

// CASE 08 — THE WARNING IS NOT A BYPASS. Same human policy, an INTEGRITY failure: still refused.
{
  let allRefused = true;
  let detail = "";
  const integrity = [
    ["holdout compromised", { seedGroups: { authorSawHoldout: true, holdoutIntegrity: "COMPROMISED", roundId: "R-01", holdoutDetail: "seeds in author-visible source" } }],
    ["self-attested verdict", { bindDocument: false }],
  ];
  for (const [label, opts] of integrity) {
    const { ws, configBytes } = scratch(() => workspace({ policy: HUMAN_BUILD_ONLY }));
    plantArtDirection(ws, configBytes, opts);
    const gate = await requireArtAccepted(ws, { goal: "BUILD_ONLY" });
    const d = artGateDisposition(gate, HUMAN_BUILD_ONLY);
    const r = cli(ws, "prepare");
    const ok = d.disposition === "REFUSE" && d.refusedBecause === "RECEIPT_IS_NOT_EVIDENCE" && r.status === EXIT_BLOCKED;
    if (!ok) { allRefused = false; detail += `${label}: disposition=${d.disposition} because=${d.refusedBecause} cliExit=${r.status}\n`; }
  }
  record("08", "A human override is NOT a universal bypass: a receipt that is not evidence still refuses at BUILD_ONLY, through the real CLI",
    allRefused, detail);
}

// CASE 09 — HUMAN / KIT ART. No `art.json`: the loop has nothing to render, stands aside, says so,
// and writes nothing. This is the permissionless creator path and it must stay permissionless.
{
  const ws = mkdtempSync(join(tmpdir(), "relics-art-authority-kit-"));
  used.push(ws);
  const applies = artReviewApplies(ws);
  const gate = await requireArtAccepted(ws, { goal: "LAUNCH" });
  const wroteNothing = !existsSync(join(ws, ".relics-agent"));
  record("09", "KIT/HUMAN art (no art.json): the gate stands aside as NOT_APPLICABLE, permits the launch, and writes no receipt of its own",
    applies.applies === false && gate.ok === true && gate.reasonCode === "ART_REVIEW_NOT_APPLICABLE" && wroteNothing,
    `applies=${applies.applies} ok=${gate.ok} code=${gate.reasonCode} wroteNothing=${wroteNothing}`);
}

// CASE 10 — FAIL CLOSED ON AN UNREADABLE POLICY. A policy that will not load must never be the
// reason a refusal softened into a warning, so anything unrecognised counts as broadcast-capable.
{
  const shapes = [undefined, null, {}, { goal: "LAUNCH" }, { allowBroadcast: true }, "BUILD_ONLY", { goal: "BUILD_ONLY", allowBroadcast: true }];
  const bad = shapes.filter((p) => isHumanControlledLaunch(p) !== (p !== null && typeof p === "object" && (p.goal === "BUILD_ONLY" || p.allowBroadcast === false)));
  // The string "BUILD_ONLY" is the shape that matters: it LOOKS human-controlled and is not an object.
  record("10", "An absent, non-object or unrecognised policy is treated as broadcast-capable — the permissive answer needs positive evidence",
    bad.length === 0 && isHumanControlledLaunch("BUILD_ONLY") === false && isHumanControlledLaunch(undefined) === false,
    `unexpected: ${JSON.stringify(bad)}`);
}

// CASE 11 — THE SUBJECTIVE LIST IS A LIST OF JUDGEMENTS, and every integrity code is outside it.
{
  const integrityCodes = [
    "FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND", "FINAL_REVIEW_NOT_BLINDED", "FINAL_REVIEW_ROLE_COLLISION",
    "CRITIQUE_WITHOUT_AUTHOR_RESPONSE", "FINAL_REVIEW_HOLDOUT_COMPROMISED", "FINAL_REVIEW_VERDICT_UNBOUND",
    "FINAL_REVIEW_VERDICT_DOCUMENT_MISSING", "FINAL_REVIEW_VERDICT_DOCUMENT_ALTERED", "FINAL_REVIEW_VERDICT_SELF_ATTESTED",
    "ART_ACCEPTANCE_UNREADABLE",
  ];
  const leaked = integrityCodes.filter((c) => SUBJECTIVE_ART_REASON_CODES.includes(c));
  record("11", "No integrity refusal is on the subjective list — what failed there is the record, and no amount of looking fixes it",
    leaked.length === 0, `leaked into the overridable set: ${leaked.join(", ")}`);
}

for (const d of used) rmSync(d, { recursive: true, force: true });

// ------------------------------------------------------------------------------------------------
// THE COUNTERS — DERIVED FROM THE COMMITTED RECEIPTS, never typed.
// ------------------------------------------------------------------------------------------------

const registry = JSON.parse(readFileSync(join(ROOT, "packages", "art-direction", "rounds", "registry.json"), "utf8"));
/** A registry entry may cover more than one benchmark round; rounds are counted, not entries. */
const roundDirs = registry.rounds.flatMap((r) => r.coversBenchmarkRounds);
const AUTHOR_ROUNDS = roundDirs.length;

let passes = 0;
let judged = 0;
let briefs = 0;
for (const rel of roundDirs) {
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) continue;
  for (const c of readdirSync(dir, { withFileTypes: true })) {
    if (!c.isDirectory()) continue;
    briefs += 1;
    const p = join(dir, c.name, ".relics-agent", "receipts", "art-acceptance.json");
    if (!existsSync(p)) continue;
    let rec;
    try { rec = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
    judged += 1;
    if (rec?.finalReview?.verdict === "PASS") passes += 1;
  }
}
/** The denominator is the round's brief count, not the number of receipts. A brief refused at
 *  admission never reached a reviewer and still counts against the target — dropping it would
 *  make a shortfall disappear by shrinking what it is measured against. */
const perRound = briefs / AUTHOR_ROUNDS;
const BLIND_PASSES = `${passes}/${Math.round(perRound)}`;

// INPUT FLOOR. Absence of input is not success: a mis-set root or an emptied artifacts tree would
// otherwise report "no failures" over nothing at all.
const FLOOR_CASES = 11;
const FLOOR_RECEIPTS = 12;
const floorOk = results.length >= FLOOR_CASES && judged >= FLOOR_RECEIPTS && AUTHOR_ROUNDS >= 3;

const passed = results.filter((r) => r.ok).length;
const allOk = passed === results.length && floorOk;

const flags = {
  AUTONOMOUS_LAUNCH_STATUS: "PRODUCTION_READY",
  AUTONOMOUS_ART_CREATION_STATUS: "EXPERIMENTAL",
  AUTONOMOUS_AUTHOR_ROUNDS: String(AUTHOR_ROUNDS),
  AUTONOMOUS_AUTHOR_BLIND_PASSES: BLIND_PASSES,
  REDUNDANT_FOURTH_AUTHOR_ROUND_RUN: "NO",
  AUTONOMOUS_REFUSED_ART_CAN_BROADCAST: results.find((r) => r.id === "02")?.ok && results.find((r) => r.id === "03")?.ok ? "NO" : "UNPROVEN",
  HUMAN_CREATOR_VISUAL_REVIEW_GATE: results.find((r) => r.id === "07")?.ok ? "WARN" : "UNPROVEN",
  HUMAN_OVERRIDE_CREATES_ART_ACCEPTED_RECEIPT: noManufacturedReceipt && results.find((r) => r.id === "07")?.ok ? "NO" : "UNPROVEN",
  ART_AUTHORITY_CASES: `${passed}/${results.length}`,
  ART_AUTHORITY_RECEIPTS_READ: String(judged),
  ART_AUTHORITY_PROOF: allOk ? "PASS" : "FAIL",
};

if (JSON_OUT) console.log(JSON.stringify({ ...flags, floorOk, cases: results }, null, 2));
else {
  if (!floorOk) console.error(`\nINPUT FLOOR: ${results.length} cases (floor ${FLOOR_CASES}), ${judged} receipts (floor ${FLOOR_RECEIPTS}), ${AUTHOR_ROUNDS} rounds (floor 3) — refusing rather than reporting a pass it did not earn.`);
  console.log("");
  for (const [k, v] of Object.entries(flags)) console.log(`${k}=${v}`);
}

process.exit(allOk ? 0 : 1);
