// SPDX-License-Identifier: MIT
// ================================================================================================
// THE HOLDOUT CLAUSE, ON THE PATH THAT ACTUALLY GATES A LAUNCH.
//
// THE DEFECT THESE TESTS EXIST FOR. `requireArtGate` — the first statement of every launch-proving
// command — called `requireArtAccepted`, which called `@relics/art-review`'s `verifyAcceptance`,
// which contains ZERO holdout logic. The holdout clause lived in `@relics/art-direction`'s
// `verifyArtAcceptance`, whose only non-test caller was an offline benchmark harness. So the
// containment that refuses a final verdict taken on seeds the author had already seen was not on
// the path that refuses anything, and a receipt recording a COMPROMISED holdout launched.
//
// EVERY TEST HERE DRIVES THE LAUNCH PATH, not the standalone verifier. `packages/art-direction`'s
// own suite already proves the clause bites when called directly; that was true the whole time the
// hole was open, which is exactly why it is not the proof this finding needs. The last test spawns
// the REAL CLI and asserts the real exit code, because "the function returns ok:false" and "the
// command refuses" are different claims and only the second one is what a creator meets.
// ================================================================================================
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { requireArtAccepted } from "../src/commands/agent-art.js";
import { configHashOf } from "../../art-review/src/receipt.js";
import { encodeConfig, presetConfig } from "../../art-review/src/runtimes.js";
import { buildArtAcceptance, writeArtAcceptance } from "../../art-direction/src/acceptance.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const CLI = join(REPO, "packages", "creator-cli", "bin", "relics.js");

const RUNTIME_ID = "GEOMETRIC_RECURSION_V1";
const BRIEF = "# Brief\n\nBotanical, patient, unhurried. A fixture brief.\n";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * A workspace whose ART-REVIEW acceptance is genuinely valid.
 *
 * This is the load-bearing half of the fixture: if art-review refused for a reason of its own, a
 * later refusal would prove nothing about the holdout clause. Every test below asserts the baseline
 * passes before it bends anything.
 */
function workspaceWithArtReviewAccepted() {
  const ws = mkdtempSync(join(tmpdir(), "relics-art-gate-holdout-"));
  const cfg = presetConfig(RUNTIME_ID);
  const configBytes = encodeConfig(RUNTIME_ID, cfg);

  writeFileSync(join(ws, "art.json"), JSON.stringify({ runtimeId: RUNTIME_ID, config: cfg }, null, 2));
  writeFileSync(join(ws, "brief.md"), BRIEF);

  // THE AUTHORIZATION BOUNDARY. `agent <command>` loads this before it dispatches, so without it
  // the CLI exits POLICY (4) and never reaches the art gate at all — which would make the CLI test
  // below assert the wrong refusal. `allowBroadcast` is false: nothing in this suite may send.
  writeFileSync(join(ws, "relics.agent.json"), JSON.stringify({
    version: 1,
    goal: "LAUNCH",
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
    allowBroadcast: false,
    signer: "local-sidecar",
  }, null, 2));

  // art-review's verdict is bound to the reviewer's own document, so the fixture writes one.
  const packetDir = join(ws, ".relics-agent", "art-review", "round-1", "packet");
  mkdirSync(packetDir, { recursive: true });
  const verdictBytes = Buffer.from(`${JSON.stringify({ reviewerId: "reviewer-r", verdict: "SHIP", axes: {} }, null, 2)}\n`);
  writeFileSync(join(packetDir, "verdict.json"), verdictBytes);

  mkdirSync(join(ws, ".relics-agent", "receipts"), { recursive: true });
  writeFileSync(join(ws, ".relics-agent", "receipts", "art-review.json"), JSON.stringify({
    schemaVersion: 1,
    kind: "ART_VISUAL_ACCEPTANCE",
    accepted: true,
    verdict: "SHIP",
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

/**
 * Plant an art-DIRECTION receipt, with its verdict bound to a reviewer document, exactly the way
 * `scripts/run-art-benchmark.mjs` does. `seedGroups` is the only thing the callers vary.
 */
function plantArtDirection(ws, configBytes, seedGroups) {
  const finalReview = {
    reviewerId: "reviewer-z",
    verdict: "PASS",
    blinded: true,
    describedBeforeBrief: true,
    seedGroup: "FINAL_HOLDOUT_SEEDS",
    seeds: [901, 902, 903],
    states: ["neutral", "stress", "recovery"],
    configHashAtUnblind: null,
    visualDescription: "a fixture description",
  };
  const doc = {
    reviewerId: finalReview.reviewerId,
    verdict: finalReview.verdict,
    describedBeforeBrief: finalReview.describedBeforeBrief,
    reasoning: "a fixture reviewer's reasoning, long enough to be a document rather than a flag",
  };
  const bytes = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`);
  mkdirSync(join(ws, "final-review"), { recursive: true });
  writeFileSync(join(ws, "final-review", "verdict.json"), bytes);
  finalReview.verdictDocument = {
    path: join("final-review", "verdict.json"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    verdictField: "verdict",
  };

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
    seedGroups,
  }));
}

const withWorkspace = async (fn) => {
  const { ws, configBytes } = workspaceWithArtReviewAccepted();
  try {
    return await fn(ws, configBytes);
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
};

// ------------------------------------------------------------------------------------------------

test("BASELINE: the art-review half of the fixture really is accepted, so a later refusal means something", async () => {
  await withWorkspace(async (ws) => {
    const gate = await requireArtAccepted(ws, {});
    assert.equal(gate.ok, true, `the baseline workspace must pass the gate, otherwise nothing below is about the holdout: ${gate.reasonCode} ${gate.detail}`);
    assert.equal(gate.applicable, true);
  });
});

test("the launch gate stands aside when there is no art-direction receipt, and SAYS SO rather than passing silently", async () => {
  await withWorkspace(async (ws) => {
    const gate = await requireArtAccepted(ws, {});
    assert.equal(gate.ok, true);
    assert.equal(gate.artDirection?.present, false);
    assert.equal(gate.artDirection?.reasonCode, "ART_DIRECTION_RECEIPT_ABSENT",
      "an absent art-direction receipt must be a NAMED state on the record. A gate that is silent about what it did not check reads exactly like a gate that checked.");
  });
});

test("A COMPROMISED HOLDOUT IS REFUSED BY THE LAUNCH GATE, not merely by the standalone verifier", async () => {
  await withWorkspace(async (ws, configBytes) => {
    plantArtDirection(ws, configBytes, { authorSawHoldout: true, holdoutIntegrity: "COMPROMISED", roundId: "R-01", holdoutDetail: "seeds found in author-visible source" });
    const gate = await requireArtAccepted(ws, {});
    assert.equal(gate.ok, false, "requireArtGate returns on this value; ok:true here is a launch");
    assert.equal(gate.reasonCode, "FINAL_REVIEW_HOLDOUT_COMPROMISED");
    assert.match(gate.detail, /not taken blind/);
  });
});

test("an UNMEASURED holdout is refused too — an unread fact is never an agreeing fact", async () => {
  await withWorkspace(async (ws, configBytes) => {
    plantArtDirection(ws, configBytes, { holdoutIntegrity: "UNKNOWN" });
    const gate = await requireArtAccepted(ws, {});
    assert.equal(gate.ok, false);
    assert.equal(gate.reasonCode, "FINAL_REVIEW_HOLDOUT_COMPROMISED");
    assert.match(gate.detail, /never measured/);
  });
});

test("and it is not simply stuck red: a HELD holdout still passes the launch gate", async () => {
  await withWorkspace(async (ws, configBytes) => {
    plantArtDirection(ws, configBytes, { authorSawHoldout: false, holdoutIntegrity: "HELD" });
    const gate = await requireArtAccepted(ws, {});
    assert.equal(gate.ok, true, `a clean holdout must still pass, or the fix is a different kind of broken: ${gate.reasonCode} ${gate.detail}`);
    assert.equal(gate.artDirection?.reasonCode, "ART_DIRECTION_ACCEPTED");
  });
});

test("the other art-direction clauses reach the launch gate too — a non-blind final review is refused", async () => {
  await withWorkspace(async (ws, configBytes) => {
    plantArtDirection(ws, configBytes, { authorSawHoldout: false, holdoutIntegrity: "HELD" });
    // Blindness is a separate clause in the same function; if the wiring were narrowed to read one
    // field, this would pass and the gate would be a holdout check rather than an acceptance check.
    const p = join(ws, ".relics-agent", "receipts", "art-acceptance.json");
    const rec = JSON.parse(readFileSync(p, "utf8"));
    rec.finalReview.blinded = false;
    writeFileSync(p, JSON.stringify(rec, null, 2));
    const gate = await requireArtAccepted(ws, {});
    assert.equal(gate.ok, false);
    assert.equal(gate.reasonCode, "FINAL_REVIEW_NOT_BLINDED");
  });
});

test("THE REAL CLI REFUSES: `agent prepare` exits BLOCKED on a compromised holdout", async () => {
  await withWorkspace(async (ws, configBytes) => {
    plantArtDirection(ws, configBytes, { authorSawHoldout: true, holdoutIntegrity: "COMPROMISED", roundId: "R-01" });
    let status = 0;
    let out = "";
    try {
      out = execFileSync("node", [CLI, "agent", "prepare", "--workspace", ws, "--json"], { encoding: "utf8", cwd: REPO });
    } catch (err) {
      status = err.status;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    assert.equal(status, 6, `a launch-proving command must exit BLOCKED (6); it exited ${status}. Output:\n${out.slice(0, 600)}`);
    assert.match(out, /FINAL_REVIEW_HOLDOUT_COMPROMISED/,
      "the refusal must NAME the clause, or an agent reading the output cannot tell which containment stopped it");
  });
});
