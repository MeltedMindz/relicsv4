// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ACCEPTANCE RECEIPT — what was reviewed, by whom, on which pictures, and against which bytes.
//
// IT LIVES OUTSIDE THE `.relics` BUNDLE, at `.relics-agent/receipts/art-review.json`. A bundle is
// the artwork and is hashed into the launch itself; a review is history about the artwork and must
// never change the bundle's digest by existing.
//
// IT CARRIES HASHES AND PATHS AND NOT IMAGES. A receipt with pictures inside it is a receipt
// nobody opens and a diff nobody can read. What it carries is enough to go and look: the digest of
// every sheet, the digest of the brief, the digest of the accepted configuration bytes, and the
// verdict and critique history in the reviewer's own words.
//
// ------------------------------------------------------------------------------------------------
// THE PROPERTY THIS FILE EXISTS FOR: AN ACCEPTANCE IS ABOUT ONE CONFIGURATION AND NOTHING ELSE.
// ------------------------------------------------------------------------------------------------
// A reviewer looked at pictures. Those pictures came from bytes. Change the bytes and the pictures
// the reviewer looked at are no longer the pictures the launch will produce, so the acceptance is
// void — not stale, not advisory, VOID. That is not bookkeeping: a stale green receipt is worse
// than a missing one, because a resume trusts it.
//
// THE BINDING IS THE FULL CONFIG BYTES, INCLUDING THE OPAQUE APPENDIX, and that is deliberately
// stricter than "render-affecting". Bytes after the terminator are not interpreted and do not
// change the picture — but they ARE inside `artConfigHash`, which is what the launch commits to
// and what is immutable afterwards. A receipt that says "these pictures were reviewed and this is
// the configuration" has to be false when either half moves.
//
// IT ALSO BINDS THE RUNTIME ADDRESS. Registry rows are re-pointable by the protocol Safe; a review
// conducted against one renderer is not evidence about a different one sitting at the same
// registry id.
// ================================================================================================
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { keccak256 } from "viem";

export const ACCEPTANCE_PATH = join(".relics-agent", "receipts", "art-review.json");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** `keccak256` of the exact transmitted bytes — the same value the launch commits to. */
export function configHashOf(configBytes) {
  return keccak256(configBytes);
}

export function acceptancePath(workspace) {
  return join(workspace, ACCEPTANCE_PATH);
}

export function readAcceptance(workspace) {
  const p = acceptancePath(workspace);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    return { __parseError: err.message };
  }
}

export function writeAcceptance(workspace, record) {
  const p = acceptancePath(workspace);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(record, null, 2)}\n`);
  return p;
}

/**
 * Is there a live acceptance for THIS configuration, on THIS brief, against THIS runtime?
 *
 * Returns a list of reasons rather than a boolean, because "the receipt is void" and "the receipt
 * is void BECAUSE the configuration moved after it was written" are different messages and only
 * the second one tells an agent what to do.
 */
export function verifyAcceptance(workspace, { configBytes, briefText, runtimeId, templateId, runtimeAddress }) {
  const record = readAcceptance(workspace);
  if (!record) {
    return { accepted: false, reasonCode: "NO_ART_ACCEPTANCE", invalidatedBy: [], detail: `there is no ${ACCEPTANCE_PATH}. No reviewer has looked at this work.` };
  }
  if (record.__parseError) {
    return { accepted: false, reasonCode: "ART_ACCEPTANCE_UNREADABLE", invalidatedBy: ["parse"], detail: `${ACCEPTANCE_PATH} did not parse: ${record.__parseError}` };
  }
  if (record.verdict !== "SHIP" || record.accepted !== true) {
    return { accepted: false, reasonCode: "ART_NOT_ACCEPTED", invalidatedBy: [], detail: `the recorded verdict is ${JSON.stringify(record.verdict)}; only a SHIP verdict with a passing objective battery is an acceptance.` };
  }

  const invalidatedBy = [];
  if (configBytes !== undefined) {
    const now = configHashOf(configBytes);
    if (now !== record.acceptedConfigHash) invalidatedBy.push({ facet: "ART_CONFIG", was: record.acceptedConfigHash, now });
  }
  if (briefText !== undefined) {
    const now = sha256(briefText);
    if (now !== record.briefSha256) invalidatedBy.push({ facet: "BRIEF", was: record.briefSha256, now });
  }
  if (runtimeId !== undefined && runtimeId !== record.runtimeId) invalidatedBy.push({ facet: "RUNTIME", was: record.runtimeId, now: runtimeId });
  if (templateId !== undefined && record.templateId && templateId !== record.templateId) invalidatedBy.push({ facet: "TEMPLATE", was: record.templateId, now: templateId });
  if (runtimeAddress !== undefined && record.runtimeAddress && runtimeAddress.toLowerCase() !== String(record.runtimeAddress).toLowerCase()) {
    invalidatedBy.push({ facet: "RUNTIME_ADDRESS", was: record.runtimeAddress, now: runtimeAddress });
  }

  if (invalidatedBy.length > 0) {
    return {
      accepted: false,
      reasonCode: "ART_ACCEPTANCE_INVALIDATED",
      invalidatedBy,
      detail:
        `the acceptance recorded in ${ACCEPTANCE_PATH} is void: ` +
        invalidatedBy.map((i) => `${i.facet} changed after it was written`).join("; ") +
        ". A reviewer looked at pictures produced by other bytes; those pictures are not what this " +
        "configuration draws. Run the review again.",
      record,
    };
  }
  return { accepted: true, reasonCode: "ART_ACCEPTED", invalidatedBy: [], detail: `accepted at round ${record.rounds?.length ?? "?"} by ${record.reviewerId}`, record };
}

/** Build the record. Every field is derived from something on disk; nothing is asserted here. */
export function buildAcceptanceRecord({
  runtimeId, templateId, chainId, runtimeAddress, briefText, configBytes,
  rounds, objective, sheetManifest, ceiling,
}) {
  return {
    schemaVersion: 1,
    kind: "ART_VISUAL_ACCEPTANCE",
    acceptedAt: new Date().toISOString(),
    accepted: true,
    verdict: "SHIP",
    runtimeId,
    templateId,
    chainId,
    runtimeAddress,
    briefSha256: sha256(briefText),
    acceptedConfigHash: configHashOf(configBytes),
    acceptedConfigBytes: configBytes.length,
    iterationCeiling: ceiling,
    iterations: rounds.length,
    reviewerId: rounds[rounds.length - 1]?.reviewerId ?? null,
    rounds: rounds.map((r) => ({
      round: r.round,
      reviewerId: r.reviewerId,
      verdict: r.verdict,
      configHash: r.configHash,
      axes: r.axes,
      critique: r.critique,
      judgedAt: r.judgedAt,
      packet: r.packet,
      renderCommitment: r.renderCommitment,
    })),
    renderArtifacts: sheetManifest.artifacts,
    renderCommitment: sheetManifest.renderCommitment,
    objective: {
      pass: objective.pass,
      floors: objective.floors,
      checks: objective.checks.map((c) => ({ id: c.id, ok: c.ok, detail: c.detail, measured: c.measured })),
    },
    note:
      "This receipt is void the moment the accepted configuration, the brief, the runtime or the " +
      "runtime's address changes. It records that a reviewer who was not the author looked at " +
      "rendered images and said so.",
  };
}
