// SPDX-License-Identifier: MIT
// ================================================================================================
// BRIEF ADMISSION — the gate that stands between a commission and the author.
//
// ONE OUTPUT MATTERS MORE THAN THE REST: `IMPOSSIBLE_COMMISSION_SENT_TO_AUTHOR`. The author is a
// machine that will do what it is told for as many rounds as it is given. Handed a brief asking for
// a horizon, it will spend five rounds and its whole render budget producing five different
// centred mandalas and a REFUSE, and every one of those rounds will look like progress from the
// inside. Nothing further down the pipeline can recover from a commission that was never
// satisfiable, so this decision is made first and it is made without rendering anything.
//
// THE WAVE-1 CATALOG IS TWO TEMPLATES AND THAT IS THE WHOLE UNIVERSE. `compass` on
// GEOMETRIC_RECURSION_V1 and `alluvium` on VECTOR_COMPOSITION_V1. Both are SHIP; nothing else is
// selectable by an autonomous agent. So "can this be made" means "can one of these two make it",
// and when the answer is no the honest return is a refusal naming what was asked for — never a
// substitute brief, never a quiet reinterpretation into something the catalog CAN draw. Silently
// making a different artwork than the one commissioned is the failure mode this whole lane exists
// to remove; it must not reappear here wearing a helpful face.
//
// ------------------------------------------------------------------------------------------------
// AN EMPTY BRIEF IS NOT AN ADMISSIBLE BRIEF
// ------------------------------------------------------------------------------------------------
// Admission works by finding impossible demands. A brief with no content makes no demands and
// would therefore sail through as ADMITTED with a perfect score — the exact vacuous pass this
// project has written down five times. So there is an input floor, and it is checked before any
// pattern runs: a brief must carry enough prose to be a brief. `BRIEF_TOO_THIN` is a refusal, and
// it is a different refusal from `BRIEF_NOT_REPRESENTABLE` because the remedies are opposite —
// one needs more brief, the other needs a different catalog.
// ================================================================================================

import { createHash } from "node:crypto";

import { atlasRuntimeIds, capabilityStatement } from "./atlas.js";
import {
  CAPABILITY_CLASSES,
  assertCapabilityMappingCurrent,
  detectDemandSignals,
  detectImpossibleDemands,
  runtimeCanExpress,
} from "./capabilities.js";

/** The Wave-1 catalog. Two templates; nothing else is selectable. */
export const WAVE1_CATALOG = Object.freeze([
  Object.freeze({ templateId: "GEOMETRIC_RECURSION_V1/compass", runtimeId: "GEOMETRIC_RECURSION_V1", registryId: 3 }),
  Object.freeze({ templateId: "VECTOR_COMPOSITION_V1/alluvium", runtimeId: "VECTOR_COMPOSITION_V1", registryId: 4 }),
]);

export const ADMISSION_OUTCOMES = Object.freeze([
  "ADMITTED",
  "BRIEF_NOT_REPRESENTABLE_BY_CURRENT_WAVE1_CATALOG",
  "BRIEF_TOO_THIN",
]);

/**
 * The input floor.
 *
 * Deliberately about SUBSTANCE rather than length alone: 200 characters of one repeated word is
 * not a brief either. `distinctWords` is what stops that, and both numbers are floors on a real
 * measurement rather than a length check dressed up as one.
 */
export const BRIEF_FLOOR = Object.freeze({ minChars: 120, minWords: 25, minDistinctWords: 18 });

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function briefSubstance(briefText) {
  const text = String(briefText ?? "");
  const words = text.toLowerCase().match(/[a-z][a-z'-]{1,}/g) ?? [];
  return { chars: text.trim().length, words: words.length, distinctWords: new Set(words).size };
}

/**
 * Decide whether a brief may be sent to the author.
 *
 * Returns a record, never throws for an unsatisfiable brief — an unrepresentable commission is a
 * NORMAL outcome of this system and styling it as an error would push callers toward catching and
 * ignoring it.
 */
export function admitBrief(briefText, { catalog = WAVE1_CATALOG } = {}) {
  // The mapping is checked on every admission, not once at import. A refusal is only as good as
  // its citation, and this is the moment the citation is used.
  const mapping = assertCapabilityMappingCurrent();

  const briefSha256 = sha256(String(briefText ?? ""));
  const substance = briefSubstance(briefText);
  const base = {
    schemaVersion: 1,
    decidedAt: new Date().toISOString(),
    briefSha256,
    briefSubstance: substance,
    catalog: catalog.map((c) => c.templateId),
    capabilityMapping: { demands: mapping.demands, runtimes: mapping.runtimes },
  };

  if (
    substance.chars < BRIEF_FLOOR.minChars ||
    substance.words < BRIEF_FLOOR.minWords ||
    substance.distinctWords < BRIEF_FLOOR.minDistinctWords
  ) {
    return Object.freeze({
      ...base,
      outcome: "BRIEF_TOO_THIN",
      admitted: false,
      floor: BRIEF_FLOOR,
      detail:
        `the brief carries ${substance.chars} characters / ${substance.words} words / ` +
        `${substance.distinctWords} distinct words, below the floor of ${BRIEF_FLOOR.minChars}/` +
        `${BRIEF_FLOOR.minWords}/${BRIEF_FLOOR.minDistinctWords}. Admission decides by finding what a ` +
        "brief demands, so a brief that demands nothing would be admitted for the wrong reason.",
      requiredCapabilities: null,
      candidates: [],
      impossibleDemands: [],
    });
  }

  const impossible = detectImpossibleDemands(briefText);
  const signals = detectDemandSignals(briefText);

  // REQUIRED CAPABILITIES, in the five declared classes. The positive signals populate four of
  // them; REPRESENTATIONAL_DEMAND is populated only by detected impossibilities, because a brief
  // never asks for "representational demand" in the abstract — it asks for a face.
  const requiredCapabilities = {};
  for (const cls of CAPABILITY_CLASSES) {
    requiredCapabilities[cls] = cls === "REPRESENTATIONAL_DEMAND"
      ? impossible.filter((d) => d.class === cls).map((d) => d.id)
      : (signals[cls] ?? []);
  }
  // A demand that is impossible AND belongs to one of the four positive classes is recorded in
  // that class too, so a reader of `requiredCapabilities` sees the whole ask rather than the
  // satisfiable half of it.
  for (const d of impossible) {
    if (d.class === "REPRESENTATIONAL_DEMAND") continue;
    if (!requiredCapabilities[d.class].includes(d.id)) requiredCapabilities[d.class].push(d.id);
  }

  const candidates = catalog.map((entry) => {
    const blocking = impossible.filter((d) => d.severity === "HARD" && !runtimeCanExpress(entry.runtimeId, d.id));
    const concessions = impossible.filter((d) => d.severity === "SOFT" && !runtimeCanExpress(entry.runtimeId, d.id));
    return {
      ...entry,
      viable: blocking.length === 0,
      blockedBy: blocking.map((d) => ({ id: d.id, what: d.what, class: d.class, evidence: d.evidence[0]?.sentence ?? null, citation: d.citations[entry.runtimeId] ?? d.positiveCitation?.[entry.runtimeId] ?? "the runtime's positive capability statement" })),
      concessions: concessions.map((d) => ({ id: d.id, what: d.what, citation: d.citations[entry.runtimeId] ?? null })),
      capability: capabilityStatement(entry.runtimeId).can,
    };
  });

  const viable = candidates.filter((c) => c.viable);
  if (viable.length === 0) {
    // Name every distinct blocker across the whole catalog. A caller reporting this to a human
    // needs "what was asked for that nothing here can draw", not one runtime's half of it.
    const blockers = [...new Map(candidates.flatMap((c) => c.blockedBy).map((b) => [b.id, b])).values()];
    return Object.freeze({
      ...base,
      outcome: "BRIEF_NOT_REPRESENTABLE_BY_CURRENT_WAVE1_CATALOG",
      admitted: false,
      requiredCapabilities,
      impossibleDemands: impossible,
      candidates,
      blockers,
      detail:
        `neither ${catalog.map((c) => c.templateId).join(" nor ")} can express: ` +
        blockers.map((b) => b.what).join("; ") +
        ". This is a fact about the two deployed Wave-1 runtimes, not a judgement about the brief. " +
        "The brief is not weakened, reinterpreted or substituted; it is returned unmade.",
    });
  }

  return Object.freeze({
    ...base,
    outcome: "ADMITTED",
    admitted: true,
    requiredCapabilities,
    impossibleDemands: impossible,
    candidates,
    // Ranked by how much of the ask each candidate can carry: fewest concessions first, then the
    // catalog's own order so the result is deterministic when they tie.
    recommended: [...viable].sort((a, b) => a.concessions.length - b.concessions.length)[0].templateId,
    concessions: viable.flatMap((c) => c.concessions.map((x) => ({ templateId: c.templateId, ...x }))),
    detail:
      `${viable.length} of ${catalog.length} Wave-1 templates can carry this brief` +
      (impossible.length ? `; ${impossible.length} demand(s) were detected and none of them blocks all candidates` : ""),
  });
}

/**
 * The count the lane reports. DERIVED FROM BEHAVIOUR, never asserted.
 *
 * Feed it every admission decision a run made. It counts the ones that were NOT admitted and were
 * nonetheless handed to an author. A caller that never records its admissions gets `UNKNOWN` and
 * not zero — a system with no evidence of having checked has not checked.
 */
export function impossibleCommissionsSentToAuthor(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { value: "UNKNOWN", detail: "no admission decisions were recorded; absence of evidence is not zero" };
  }
  const sent = records.filter((r) => r.admitted === false && r.sentToAuthor === true);
  return {
    value: sent.length,
    decisions: records.length,
    refused: records.filter((r) => r.admitted === false).length,
    detail: sent.length === 0
      ? "every commission the author received had been admitted"
      : `${sent.length} unadmitted commission(s) reached the author: ${sent.map((r) => r.briefSha256?.slice(0, 12)).join(", ")}`,
  };
}

/** Runtime ids the atlas knows, for callers that want to check the catalog has not drifted. */
export function catalogRuntimesAreDocumented(catalog = WAVE1_CATALOG) {
  const known = new Set(atlasRuntimeIds());
  const missing = catalog.filter((c) => !known.has(c.runtimeId));
  return { ok: missing.length === 0, missing: missing.map((m) => m.runtimeId) };
}
