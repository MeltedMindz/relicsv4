// SPDX-License-Identifier: MIT
// ================================================================================================
// THE LOOP.
//
//   BRIEF -> SELECT RUNTIME/TEMPLATE -> CREATE CONFIG -> RENDER -> VISUAL REVIEW
//         -> CRITIQUE -> MODIFY -> RENDER AGAIN -> OBJECTIVE TESTS
//         -> VISUAL ACCEPTANCE -> VALIDATE -> LAUNCH FLOW
//
// NOT `CREATE -> VALIDATE -> LAUNCH`. The defect this replaces is precise: the autonomous agent
// produced a configuration that was legal, deterministic, inside its gas budget and byte-distinct
// across market states, and proceeded — because every one of those is true of a configuration that
// draws the wrong thing. A variant called `espalier` cleared all of them and read as industrial
// crates and scaffolding full of confetti against a brief asking for botanical work. Nothing
// caught it because nothing looked.
//
// ------------------------------------------------------------------------------------------------
// THE ITERATION CEILING IS FOUR, AND HERE IS THE ARGUMENT.
// ------------------------------------------------------------------------------------------------
// Four JUDGEMENTS: one first look and three deliberate corrections. Not four mutations, not four
// renders — four times a reviewer that is not the author has looked at pictures and said what it
// saw.
//
//   * ONE is the number the defect had. The first legal configuration was accepted with zero
//     judgements, so any ceiling above zero is the substantive change; the rest is calibration.
//   * THREE CORRECTIONS is where this program's own evidence sits. Wave 1 repaired four templates
//     that had been reviewed and refused — `dendron`, `cairn`, `crux` and `idol` — and re-reviewed
//     them blind. Three came back HOLD or REJECT and one came back SHIP_WITH_CAVEAT. A single
//     targeted repair converged once in four attempts, which is the evidence that repairs do
//     converge but not reliably, and that a run given three of them has been given a real chance.
//   * BEYOND THAT THE FAILURE CHANGES SHAPE. A critique still unresolved after three deliberate
//     corrections is almost never a tuning problem; it is a brief the chosen template cannot
//     depict. More rounds do not fix that, they launder it — and the loop's job at that point is
//     to REFUSE, which is why `ART_QUALITY_NOT_ACCEPTABLE` is a normal outcome rather than an error.
//   * AND ROUNDS ARE NOT FREE. One round is ~150 `eth_call`s against a live chain. A ceiling that
//     is generous in the abstract is a ceiling nobody runs.
//
// A ROUND IS CONSUMED BY A JUDGEMENT, NOT BY A RENDER. An author that edits the configuration
// before any verdict has been recorded re-renders the same round: there was nothing to iterate
// against, so nothing was spent. What is bounded is how many times a reviewer is asked.
//
// THE CEILING MAY BE LOWERED AND NEVER RAISED. `MAX_ITERATION_CEILING` is 5 because the brief this
// was built to allows 3 to 5 and a number chosen at run time is not a ceiling.
// ================================================================================================
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildPacket, objectiveDisclosureAllowed, readVerdict, validateVerdict } from "./packet.js";
import { buildAcceptanceRecord, configHashOf, writeAcceptance } from "./receipt.js";
import { runObjectiveBattery } from "./objective.js";
import { buildSheets } from "./sheets.js";
import { describeValidatorCode } from "./codec/errors.js";
import { encodeConfig, runtimeFor } from "./runtimes.js";

export const ITERATION_CEILING = 4;
export const MIN_ITERATION_CEILING = 3;
export const MAX_ITERATION_CEILING = 5;

export const ART_REVIEW_DIR = join(".relics-agent", "art-review");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** The outcomes `step` can report. Closed, so an agent branches on the code and never on prose. */
export const LOOP_OUTCOMES = Object.freeze([
  "AWAITING_VISUAL_REVIEW",
  "REVISE_REQUESTED",
  "ART_ACCEPTED",
  "ART_QUALITY_NOT_ACCEPTABLE",
  "OBJECTIVE_FAILED",
  "BLOCKED",
]);

function roundsDir(workspace) {
  return join(workspace, ART_REVIEW_DIR);
}

export function listRounds(workspace) {
  const dir = roundsDir(workspace);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^round-\d+$/.test(n))
    .map((n) => Number(n.slice("round-".length)))
    .sort((a, b) => a - b);
}

function roundStateFile(workspace, n) {
  return join(roundsDir(workspace), `round-${n}`, "round.json");
}

export function readRound(workspace, n) {
  const p = roundStateFile(workspace, n);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

/** Load `art.json`, or say exactly what is wrong with it. Never invents a configuration. */
export function readArtDocument(workspace) {
  const p = join(workspace, "art.json");
  if (!existsSync(p)) {
    return { ok: false, detail: `no art.json in ${workspace}. It is the creator configuration this loop reviews: a runtime id and the symbolic configuration the runtime's encoder turns into bytes.` };
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    return { ok: false, detail: `art.json did not parse: ${err.message}` };
  }
  if (!doc?.runtimeId) return { ok: false, detail: "art.json carries no runtimeId" };
  let runtime;
  try {
    runtime = runtimeFor(doc.runtimeId);
  } catch (err) {
    return { ok: false, detail: err.message };
  }
  if (!doc.config || typeof doc.config !== "object") return { ok: false, detail: "art.json carries no config object" };
  let configBytes;
  try {
    configBytes = encodeConfig(doc.runtimeId, doc.config);
  } catch (err) {
    // THE ENCODER REFUSED, WHICH IS NOT A RENDER FAILURE. Say which field, so the author can act.
    return { ok: false, detail: `art.json does not encode: ${err.message}` };
  }
  return { ok: true, doc, runtime, configBytes, configHash: configHashOf(configBytes) };
}

/**
 * Advance the loop by exactly one step and stop.
 *
 * IT NEVER BLOCKS WAITING FOR A REVIEWER, because the reviewer is a separate agent and a CLI that
 * waits for one is a CLI that hangs. It renders, writes the packet, and returns
 * `AWAITING_VISUAL_REVIEW`; the caller runs the reviewer, the reviewer writes `verdict.json`, and
 * the next call picks it up. That is what makes the separation real rather than an intention: the
 * process that authors and the process that judges are not the same process.
 */
export async function step({ workspace, renderer, runtimeAddress, chainId, ceiling = ITERATION_CEILING, templateId = null }) {
  if (!Number.isInteger(ceiling) || ceiling < MIN_ITERATION_CEILING || ceiling > MAX_ITERATION_CEILING) {
    return { outcome: "BLOCKED", detail: `the iteration ceiling must be an integer in ${MIN_ITERATION_CEILING}..${MAX_ITERATION_CEILING}; ${ceiling} is not. A ceiling chosen at run time is not a ceiling.` };
  }

  const briefPath = join(workspace, "brief.md");
  if (!existsSync(briefPath)) {
    return { outcome: "BLOCKED", detail: "there is no brief.md. Brief fidelity is a gate in this review and it cannot be judged against a brief that does not exist." };
  }
  const briefText = readFileSync(briefPath, "utf8");
  const briefSha256 = sha256(briefText);

  const art = readArtDocument(workspace);
  if (!art.ok) return { outcome: "BLOCKED", detail: art.detail };

  const done = listRounds(workspace).map((n) => readRound(workspace, n)).filter(Boolean);
  const judged = done.filter((r) => r.verdict);

  // A BRIEF THAT MOVED MID-REVIEW INVALIDATES THE REVIEW, and silently continuing would let an
  // author retarget the gate it is being measured against.
  const briefDrift = done.find((r) => r.briefSha256 && r.briefSha256 !== briefSha256);
  if (briefDrift) {
    return {
      outcome: "BLOCKED",
      detail: `brief.md changed after round ${briefDrift.round} was reviewed. Brief fidelity is judged against the brief, so a review conducted on the old one is not evidence about the new one. Start a fresh review directory or restore the brief.`,
    };
  }

  // ---- is there an open round awaiting a verdict? ------------------------------------------------
  const open = done.length > 0 ? done[done.length - 1] : null;
  if (open && !open.verdict) {
    const v = readVerdict(join(workspace, ART_REVIEW_DIR, `round-${open.round}`, "packet", "verdict.json"));
    if (!v.present) {
      if (open.configHash === art.configHash) {
        return {
          outcome: "AWAITING_VISUAL_REVIEW",
          round: open.round,
          roundsRemaining: ceiling - judged.length,
          packet: join(ART_REVIEW_DIR, `round-${open.round}`, "packet"),
          detail: `round ${open.round} is rendered and packaged. A reviewer that is NOT the author must look at the images and write verdict.json into the packet directory.`,
        };
      }
      // The author changed the configuration before anything was judged. Nothing was spent, so the
      // round is re-rendered rather than consumed — see the ceiling argument at the top of the file.
      return renderRound({ workspace, renderer, runtimeAddress, chainId, ceiling, templateId, art, briefText, briefSha256, round: open.round, judged, replacing: true });
    }
    if (v.parseError) return { outcome: "BLOCKED", detail: `round ${open.round}'s verdict.json did not parse: ${v.parseError}` };
    const problems = validateVerdict(v.verdict, { round: open.round });
    if (problems.length > 0) {
      return { outcome: "BLOCKED", detail: `round ${open.round}'s verdict is not well-formed`, problems };
    }
    // Record the judgement against the round it judged.
    const judgedRound = {
      ...open,
      verdict: v.verdict.verdict,
      reviewerId: v.verdict.reviewerId,
      axes: v.verdict.axes,
      critique: v.verdict.critique ?? [],
      judgedAt: v.verdict.judgedAt ?? new Date().toISOString(),
    };
    writeFileSync(roundStateFile(workspace, open.round), `${JSON.stringify(judgedRound, null, 2)}\n`);
    return await settle({ workspace, renderer, runtimeAddress, chainId, ceiling, templateId, art, briefText, briefSha256, rounds: [...done.slice(0, -1), judgedRound] });
  }

  // ---- every round so far is judged: either we are done, or we open the next one -----------------
  if (done.length > 0) {
    const last = done[done.length - 1];
    if (last.configHash === art.configHash) {
      // Nothing changed since the last judgement. Re-settling would re-run the battery on the same
      // bytes; answer from what is recorded instead.
      return await settle({ workspace, renderer, runtimeAddress, chainId, ceiling, templateId, art, briefText, briefSha256, rounds: done });
    }
  }

  if (judged.length >= ceiling) {
    return refuse({ workspace, rounds: done, ceiling });
  }

  return renderRound({ workspace, renderer, runtimeAddress, chainId, ceiling, templateId, art, briefText, briefSha256, round: done.length + 1, judged, replacing: false });
}

/** Render, sheet and package one round. Writes nothing a reviewer may not see. */
async function renderRound({ workspace, renderer, runtimeAddress, chainId, ceiling, templateId, art, briefText, briefSha256, round, judged, replacing }) {
  const dir = join(workspace, ART_REVIEW_DIR, `round-${round}`);
  mkdirSync(join(dir, "sheets"), { recursive: true });

  // ASK THE RUNTIME FIRST. Rendering an illegal configuration produces thirty-six identical
  // refusals and a failure code, which is a true report and a useless one: the author is told the
  // pictures did not come out rather than which field the runtime objected to. One call up front
  // turns that into a sentence naming the field.
  const legality = await renderer.validateConfig(art.configBytes);
  if (!legality.read) return { outcome: "BLOCKED", round, detail: legality.detail };
  if (!legality.legal) {
    const why = describeValidatorCode(art.doc.runtimeId, legality.code);
    return {
      outcome: "BLOCKED",
      round,
      validatorCode: why.code,
      validatorName: why.name,
      detail: `the deployed runtime refuses this configuration: ${why.name} (code ${why.code}). ${why.detail}`,
    };
  }

  const sheets = await buildSheets({ renderer, configBytes: art.configBytes, outDir: join(dir, "sheets") });
  if (!sheets.ok) return { outcome: "BLOCKED", round, detail: sheets.detail };

  // THE REVIEWER'S OWN PRIOR WORDS, and nothing the author wrote. See `packet.js`.
  const priorCritique = judged.map((r) => ({ round: r.round, verdict: r.verdict, critique: r.critique ?? [] }));

  const disclosure = objectiveDisclosureAllowed(join(workspace, ART_REVIEW_DIR));
  let objectiveDisclosure = null;
  if (disclosure.allowed && round > 1) {
    const prevObjective = join(workspace, ART_REVIEW_DIR, `round-${round - 1}`, "objective.json");
    if (existsSync(prevObjective)) {
      objectiveDisclosure = { $note: "Subordinate evidence, released only after the first unanchored judgement. It cannot overrule what you see.", ...JSON.parse(readFileSync(prevObjective, "utf8")) };
    }
  }

  const packet = buildPacket({
    packetDir: join(dir, "packet"),
    round,
    roundsRemaining: ceiling - judged.length,
    runtimeId: art.doc.runtimeId,
    templateId: templateId ?? art.doc.templateId ?? null,
    chainId,
    briefText,
    sheetsDir: join(dir, "sheets"),
    sheetArtifacts: sheets.artifacts,
    priorCritique,
    objectiveDisclosure,
  });
  if (!packet.ok) {
    return { outcome: "BLOCKED", round, detail: "the review packet carries material a reviewer must not see, so this round is refused rather than reviewed.", leaks: packet.leaks };
  }

  const state = {
    round,
    openedAt: new Date().toISOString(),
    replacing: Boolean(replacing),
    runtimeId: art.doc.runtimeId,
    templateId: templateId ?? art.doc.templateId ?? null,
    chainId,
    runtimeAddress,
    briefSha256,
    configHash: art.configHash,
    configBytes: art.configBytes.length,
    renderCommitment: sheets.renderCommitment,
    packet: join(ART_REVIEW_DIR, `round-${round}`, "packet"),
    verdict: null,
  };
  writeFileSync(roundStateFile(workspace, round), `${JSON.stringify(state, null, 2)}\n`);
  writeFileSync(join(dir, "sheets", "manifest.json"), `${JSON.stringify(sheets, null, 2)}\n`);

  return {
    outcome: "AWAITING_VISUAL_REVIEW",
    round,
    roundsRemaining: ceiling - judged.length,
    packet: state.packet,
    images: packet.images,
    renderCommitment: sheets.renderCommitment,
    detail:
      `round ${round}: ${sheets.renders} renders on chain ${chainId}, ${packet.images} sheets written. ` +
      "A reviewer that is NOT the author must open the images and write verdict.json into the packet directory. " +
      "The packet deliberately carries no configuration, no measurements and nothing the author said about its own work.",
  };
}

/** Act on the latest judgement. */
async function settle({ workspace, renderer, runtimeAddress, chainId, ceiling, templateId, art, briefText, rounds }) {
  const last = rounds[rounds.length - 1];
  const judged = rounds.filter((r) => r.verdict);

  // THE BATTERY RUNS ONCE THE ROUND IS JUDGED, WHATEVER THE VERDICT WAS.
  //
  // Its position is after the judgement and never before, so its numbers cannot have reached the
  // reviewer for the round they judged. Running it on a REVISE as well as on a SHIP costs one round
  // of chain calls and buys the author the half of the picture a reviewer structurally cannot see:
  // a field that draws nothing on any seed, one duplicate inside a hundred, a state pairing that is
  // zero pixels. It is also what makes the disclosure path real — from the next round on, the
  // reviewer may see the PREVIOUS round's numbers, having already judged unanchored once.
  const objective = await objectiveFor({ workspace, renderer, art, round: last.round });

  if (last.verdict !== "SHIP") {
    if (judged.length >= ceiling) return refuse({ workspace, rounds, ceiling, objective });
    return {
      outcome: "REVISE_REQUESTED",
      round: last.round,
      roundsRemaining: ceiling - judged.length,
      verdict: last.verdict,
      axes: last.axes,
      critique: last.critique,
      // FOR THE AUTHOR, NOT FOR THE REVIEWER. The reviewer judged these pictures without them.
      objectiveFailures: objective.checks.filter((c) => !c.ok).map((c) => ({ id: c.id, detail: c.detail })),
      detail:
        `round ${last.round} came back ${last.verdict}. ${ceiling - judged.length} judgement(s) remain. ` +
        "Apply the critique to art.json and run this command again; the next call renders the changed configuration and asks for a fresh judgement.",
    };
  }

  if (!objective.pass) {
    const failed = objective.checks.filter((c) => !c.ok);
    if (judged.length >= ceiling) return refuse({ workspace, rounds, ceiling, objective });
    return {
      outcome: "OBJECTIVE_FAILED",
      round: last.round,
      roundsRemaining: ceiling - judged.length,
      failed: failed.map((c) => ({ id: c.id, detail: c.detail })),
      detail:
        `the reviewer accepted the pictures and the objective battery did not: ${failed.map((c) => c.id).join(", ")}. ` +
        "Both have to pass. A reviewer cannot see a field that draws nothing on any seed, and a battery cannot see that the work is wrong for the brief.",
    };
  }

  const sheetManifest = JSON.parse(readFileSync(join(workspace, ART_REVIEW_DIR, `round-${last.round}`, "sheets", "manifest.json"), "utf8"));
  const record = buildAcceptanceRecord({
    runtimeId: art.doc.runtimeId,
    templateId: templateId ?? art.doc.templateId ?? null,
    chainId,
    runtimeAddress,
    briefText,
    configBytes: art.configBytes,
    rounds,
    objective,
    sheetManifest,
    ceiling,
  });
  const path = writeAcceptance(workspace, record);
  return {
    outcome: "ART_ACCEPTED",
    round: last.round,
    iterations: rounds.length,
    reviewerId: last.reviewerId,
    acceptedConfigHash: record.acceptedConfigHash,
    receipt: path,
    detail: `accepted after ${rounds.length} round(s) by ${last.reviewerId}, with all ${objective.checks.length} objective checks passing. The receipt is void the moment the configuration, the brief or the runtime changes.`,
  };
}

/** The battery for one round's bytes, computed once and cached against the configuration hash. */
async function objectiveFor({ workspace, renderer, art, round }) {
  const path = join(workspace, ART_REVIEW_DIR, `round-${round}`, "objective.json");
  if (existsSync(path)) {
    const cached = JSON.parse(readFileSync(path, "utf8"));
    if (cached.configHash === art.configHash) return cached;
  }
  const objective = await runObjectiveBattery({ renderer, runtimeId: art.doc.runtimeId, config: art.doc.config, configBytes: art.configBytes });
  writeFileSync(path, `${JSON.stringify({ configHash: art.configHash, ...objective }, null, 2)}\n`);
  return objective;
}

function refuse({ workspace, rounds, ceiling, objective = null }) {
  const last = rounds[rounds.length - 1];
  return {
    outcome: "ART_QUALITY_NOT_ACCEPTABLE",
    rounds: rounds.length,
    ceiling,
    lastVerdict: last?.verdict ?? null,
    critique: last?.critique ?? [],
    objectiveFailures: objective ? objective.checks.filter((c) => !c.ok).map((c) => c.id) : [],
    detail:
      `${ceiling} judgements were spent and the work was not accepted. This is a REFUSAL and it is a ` +
      "normal outcome: a critique still unresolved after three deliberate corrections is usually a brief " +
      "the chosen template cannot depict, and more rounds would launder that rather than fix it. Nothing " +
      "will be launched. Choose a different template, or change the brief, and start a fresh review.",
  };
}
