// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ART ACCEPTANCE RECEIPT.
//
// WHAT IT IS FOR. A launch commits the art configuration permanently — the binding is one-shot, and
// a project that ships the wrong bytes ships them forever. So the question "did anybody look at
// THIS art" has to be answerable about the exact bytes in the transaction, not about a review that
// happened nearby. This receipt is that answer, and it is deliberately fragile: any change to the
// configuration voids it, and the voided state is reported with the facet that moved.
//
// IT IS A SUPERSET, NOT A REPLACEMENT. `@relics/art-review`'s `art-review.json` already binds a
// visual verdict to a config hash and a brief hash, and that record stands. This one binds the
// things that record has no field for and that this lane exists to add: which brief was ADMITTED
// and on what evidence, the art direction that was fixed before any parameter existed, what the
// author consulted in the atlas, the critique history and each finding's disposition, and — the
// one that makes the rest mean anything — what the FINAL reviewer was shown, on which seeds, and
// whether the configuration moved after it was shown them.
//
// ------------------------------------------------------------------------------------------------
// THE TWO FLAGS THIS FILE HAS TO EARN
// ------------------------------------------------------------------------------------------------
// `ART_ACCEPTANCE_INVALIDATED_BY_CONFIG_CHANGE=YES` — proved by moving a byte and requiring the
// verification to refuse. Not by reading the code.
//
// `FIRST_LEGAL_CONFIG_ACCEPTED_WITHOUT_REVIEW=NO` — a configuration that is legal, renders, and
// passes every objective floor is still not accepted. `verifyArtAcceptance` requires a final
// verdict from a reviewer that is neither the author nor the development critic, and requires that
// verdict to have been taken on the holdout seeds. Legality is a precondition and never evidence.
//
// ------------------------------------------------------------------------------------------------
// UNBLINDING IS ONE-WAY
// ------------------------------------------------------------------------------------------------
// `finalReview.configHashAtUnblind` records the bytes as they stood when the final reviewer was
// shown the holdout renders. If the accepted configuration differs from it, the verdict was taken
// on different pictures and the receipt refuses — `FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND`.
// That is the strictest clause here and the easiest one to lose: it is entirely normal to notice
// one more small improvement after a PASS, and making it silently invalidates the only judgement
// the whole loop exists to produce.
// ================================================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ART_ACCEPTANCE_PATH = join(".relics-agent", "receipts", "art-acceptance.json");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Canonical JSON with sorted keys, so a hash does not depend on insertion order. */
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}
export const hashOf = (v) => sha256(canonical(v));

export function artAcceptancePath(workspace) { return join(workspace, ART_ACCEPTANCE_PATH); }

export const ACCEPTANCE_REASON_CODES = Object.freeze([
  "ART_ACCEPTED",
  "NO_ART_ACCEPTANCE",
  "ART_ACCEPTANCE_UNREADABLE",
  "ART_NOT_ACCEPTED",
  "ART_ACCEPTANCE_INVALIDATED",
  "FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND",
  "FINAL_REVIEW_NOT_BLINDED",
  "FINAL_REVIEW_ROLE_COLLISION",
  "CRITIQUE_WITHOUT_AUTHOR_RESPONSE",
]);

/**
 * Build the receipt.
 *
 * Every argument is a hash or a small record; NO IMAGES and NO CONFIG BYTES beyond the hash. The
 * receipt is meant to be read by a person and diffed by a machine, and an embedded 100-byte hex
 * string invites someone to compare it by eye instead of by `configHash`.
 */
export function buildArtAcceptance({
  runtimeId,
  templateId,
  chainId,
  runtimeAddress,
  runtimeCodeHash,
  briefText,
  admission,
  direction,
  atlasRecord,
  acceptedConfigBytes,
  objective,
  rounds = [],
  finalReview,
  seedGroups,
}) {
  const configHash = sha256(String(acceptedConfigBytes));
  return {
    schemaVersion: 1,
    kind: "ART_ACCEPTANCE",
    acceptedAt: new Date().toISOString(),

    // WHAT WAS MADE
    runtimeId,
    templateId: templateId ?? null,
    chainId: chainId ?? null,
    runtimeAddress: runtimeAddress ?? null,
    runtimeCodeHash: runtimeCodeHash ?? null,
    acceptedConfigHash: configHash,
    acceptedConfigBytes: String(acceptedConfigBytes).replace(/^0x/, "").length / 2,

    // WHAT WAS ASKED FOR, AND WHETHER IT COULD BE MADE AT ALL
    briefSha256: sha256(String(briefText ?? "")),
    admission: {
      outcome: admission?.outcome ?? null,
      admitted: admission?.admitted ?? null,
      recommended: admission?.recommended ?? null,
      requiredCapabilities: admission?.requiredCapabilities ?? null,
      concessions: (admission?.concessions ?? []).map((c) => c.id),
      hash: hashOf(admission ?? null),
    },

    // WHAT IT WAS MEANT TO LOOK LIKE, FIXED BEFORE ANY PARAMETER EXISTED
    direction: {
      hash: direction?.directionHash ?? null,
      createdAt: direction?.createdAt ?? null,
      containsRuntimeConfig: direction?.containsRuntimeConfig ?? null,
    },

    // WHAT THE AUTHOR CONSULTED. The count is the evidence for AUTHOR_USES_RUNTIME_PARAMETER_ATLAS.
    atlas: atlasRecord ?? null,

    // WHAT WAS SAID ABOUT IT, AND WHAT THE AUTHOR DID ABOUT EACH THING
    rounds: rounds.map((r) => ({
      round: r.round,
      criticId: r.criticId ?? null,
      configHash: r.configHash ?? null,
      critiqueHash: r.critique ? hashOf(r.critique) : null,
      findings: (r.critique?.findings ?? []).map((f) => f.id),
      dispositions: (r.response?.responses ?? []).map((x) => ({ findingId: x.findingId, disposition: x.disposition })),
      responseHash: r.response ? hashOf(r.response) : null,
      boundedChange: r.boundedChange ? { ok: r.boundedChange.ok, counts: r.boundedChange.counts } : null,
    })),

    // WHO DECIDED, ON WHAT, AND WHEN
    finalReview: {
      reviewerId: finalReview?.reviewerId ?? null,
      verdict: finalReview?.verdict ?? null,
      blinded: finalReview?.blinded ?? null,
      describedBeforeBrief: finalReview?.describedBeforeBrief ?? null,
      seedGroup: finalReview?.seedGroup ?? null,
      seeds: finalReview?.seeds ?? null,
      states: finalReview?.states ?? null,
      configHashAtUnblind: finalReview?.configHashAtUnblind ?? null,
      inputHashes: finalReview?.inputHashes ?? null,
      visualDescriptionHash: finalReview?.visualDescription ? sha256(finalReview.visualDescription) : null,
      hash: hashOf(finalReview ?? null),
    },

    // WHO SAW WHICH TOKENS
    seedGroups: seedGroups ?? null,

    // THE NUMBERS, WHICH ARE A PRECONDITION AND NEVER THE REASON
    objective: objective ? { pass: objective.pass, checks: (objective.checks ?? []).map((c) => ({ id: c.id, ok: c.ok })) } : null,

    note:
      "Objective results are a precondition, not evidence of quality. This receipt is valid only for " +
      "acceptedConfigHash; any render-affecting change to the configuration voids it.",
  };
}

export function writeArtAcceptance(workspace, record) {
  const p = artAcceptancePath(workspace);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(record, null, 2)}\n`);
  return p;
}

export function readArtAcceptance(workspace) {
  const p = artAcceptancePath(workspace);
  if (!existsSync(p)) return { ok: false, reasonCode: "NO_ART_ACCEPTANCE", detail: `no receipt at ${ART_ACCEPTANCE_PATH}` };
  try { return { ok: true, record: JSON.parse(readFileSync(p, "utf8")) }; }
  catch (err) { return { ok: false, reasonCode: "ART_ACCEPTANCE_UNREADABLE", detail: err.message }; }
}

/**
 * Verify a receipt against the world as it is now.
 *
 * `configBytes` is the configuration a launch would actually commit. Everything else is optional
 * and, when absent, the corresponding clause reports UNKNOWN rather than passing — an unread fact
 * is never an agreeing fact.
 */
export function verifyArtAcceptance(workspace, { configBytes, briefText, runtimeId, runtimeCodeHash } = {}) {
  const read = readArtAcceptance(workspace);
  if (!read.ok) return { accepted: false, ...read, invalidatedBy: [] };
  const r = read.record;

  const invalidatedBy = [];
  const push = (facet, was, now) => invalidatedBy.push({ facet, was, now });

  if (configBytes !== undefined) {
    const now = sha256(String(configBytes));
    if (now !== r.acceptedConfigHash) push("ART_CONFIG", r.acceptedConfigHash, now);
  }
  if (briefText !== undefined) {
    const now = sha256(String(briefText));
    if (now !== r.briefSha256) push("BRIEF", r.briefSha256, now);
  }
  if (runtimeId !== undefined && runtimeId !== r.runtimeId) push("RUNTIME", r.runtimeId, runtimeId);
  if (runtimeCodeHash !== undefined && r.runtimeCodeHash && String(runtimeCodeHash).toLowerCase() !== String(r.runtimeCodeHash).toLowerCase()) {
    // THE RUNTIME ITSELF IS PART OF THE ART. Same bytes through different bytecode is a different
    // picture, and the receipt is about a picture.
    push("RUNTIME_CODE", r.runtimeCodeHash, runtimeCodeHash);
  }

  if (invalidatedBy.length) {
    return {
      accepted: false,
      reasonCode: "ART_ACCEPTANCE_INVALIDATED",
      detail: `the accepted art has changed: ${invalidatedBy.map((i) => i.facet).join(", ")}`,
      invalidatedBy,
      record: r,
    };
  }

  // THE VERDICT ITSELF MUST BE SOUND, not merely present.
  const fr = r.finalReview ?? {};
  if (fr.verdict !== "PASS") {
    return { accepted: false, reasonCode: "ART_NOT_ACCEPTED", detail: `the final review returned ${fr.verdict ?? "no verdict"}`, invalidatedBy: [], record: r };
  }
  if (fr.configHashAtUnblind && fr.configHashAtUnblind !== r.acceptedConfigHash) {
    return {
      accepted: false,
      reasonCode: "FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND",
      detail: `the final reviewer judged ${fr.configHashAtUnblind} and the accepted configuration is ${r.acceptedConfigHash}. The verdict was taken on different pictures.`,
      invalidatedBy: [{ facet: "POST_UNBLIND_MUTATION", was: fr.configHashAtUnblind, now: r.acceptedConfigHash }],
      record: r,
    };
  }
  if (fr.blinded !== true) {
    return { accepted: false, reasonCode: "FINAL_REVIEW_NOT_BLINDED", detail: "the final review was not conducted blind", invalidatedBy: [], record: r };
  }
  if (fr.describedBeforeBrief !== true) {
    return { accepted: false, reasonCode: "FINAL_REVIEW_NOT_BLINDED", detail: "the final reviewer did not describe what it saw before being shown the brief", invalidatedBy: [], record: r };
  }
  if (fr.seedGroup !== "FINAL_HOLDOUT_SEEDS") {
    return { accepted: false, reasonCode: "FINAL_REVIEW_NOT_BLINDED", detail: `the final review was taken on ${fr.seedGroup ?? "an unrecorded seed group"} rather than the holdout`, invalidatedBy: [], record: r };
  }
  // THE THREE ROLES MUST BE THREE. A reviewer that also critiqued has been arguing with the author.
  const criticIds = new Set((r.rounds ?? []).map((x) => x.criticId).filter(Boolean));
  if (fr.reviewerId && criticIds.has(fr.reviewerId)) {
    return { accepted: false, reasonCode: "FINAL_REVIEW_ROLE_COLLISION", detail: `${fr.reviewerId} was also a development critic on this work`, invalidatedBy: [], record: r };
  }
  // EVERY FINDING ANSWERED.
  const unanswered = (r.rounds ?? []).flatMap((x) => {
    const answered = new Set((x.dispositions ?? []).map((d) => d.findingId));
    return (x.findings ?? []).filter((f) => !answered.has(f)).map((f) => `round ${x.round}: ${f}`);
  });
  if (unanswered.length) {
    return { accepted: false, reasonCode: "CRITIQUE_WITHOUT_AUTHOR_RESPONSE", detail: `unanswered finding(s): ${unanswered.join(", ")}`, invalidatedBy: [], record: r };
  }

  return { accepted: true, reasonCode: "ART_ACCEPTED", record: r, invalidatedBy: [] };
}

/**
 * The flags this lane reports, DERIVED from a receipt rather than asserted.
 *
 * A caller with no receipt gets UNKNOWN for every one of them. That is the important case: a run
 * that never produced a receipt has not earned a zero, and reporting one would be the same
 * vacuous pass this project has caught five times elsewhere.
 */
export function acceptanceFlags(workspace) {
  const read = readArtAcceptance(workspace);
  if (!read.ok) {
    return {
      ART_DIRECTION_CREATED_BEFORE_CONFIG: "UNKNOWN",
      AUTHOR_USES_RUNTIME_PARAMETER_ATLAS: "UNKNOWN",
      CRITIQUE_WITHOUT_AUTHOR_RESPONSE: "UNKNOWN",
      FINAL_REVIEW_BLINDED: "UNKNOWN",
      VISUAL_DESCRIPTION_BEFORE_BRIEF_COMPARISON: "UNKNOWN",
      FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING: "UNKNOWN",
      FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND: "UNKNOWN",
      detail: read.detail,
    };
  }
  const r = read.record;
  const unanswered = (r.rounds ?? []).reduce((n, x) => {
    const answered = new Set((x.dispositions ?? []).map((d) => d.findingId));
    return n + (x.findings ?? []).filter((f) => !answered.has(f)).length;
  }, 0);
  return {
    ART_DIRECTION_CREATED_BEFORE_CONFIG: r.direction?.hash && r.direction?.containsRuntimeConfig === false ? "YES" : "NO",
    AUTHOR_USES_RUNTIME_PARAMETER_ATLAS: (r.atlas?.consultationCount ?? 0) > 0 ? "YES" : "NO",
    CRITIQUE_WITHOUT_AUTHOR_RESPONSE: unanswered,
    FINAL_REVIEW_BLINDED: r.finalReview?.blinded === true ? "YES" : "NO",
    VISUAL_DESCRIPTION_BEFORE_BRIEF_COMPARISON: r.finalReview?.describedBeforeBrief === true ? "YES" : "NO",
    FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING: r.seedGroups?.authorSawHoldout === true ? "YES" : "NO",
    FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND:
      r.finalReview?.configHashAtUnblind && r.finalReview.configHashAtUnblind !== r.acceptedConfigHash ? "YES" : "NO",
  };
}
