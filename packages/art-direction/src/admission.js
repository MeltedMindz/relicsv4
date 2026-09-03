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

import { shipCatalog } from "../../template-catalog/src/select.js";

import { atlasRuntimeIds, capabilityStatement } from "./atlas.js";
import {
  CAPABILITY_CLASSES,
  IMPOSSIBLE_DEMANDS,
  assertCapabilityMappingCurrent,
  detectCompositionDemands,
  detectDemandSignals,
  detectImpossibleDemands,
  runtimeCanExpress,
} from "./capabilities.js";
import { mechanismAdmission } from "./mechanism.js";

/**
 * The catalog admission ranks against: SHIP-tier templates, DERIVED, never listed here.
 *
 * `shipCatalog()` intersects the append-only review ledger with the autonomous-selection filter, so
 * what an agent may start from follows the REVIEW TIER and moves when a verdict moves. A hardcoded
 * pair — which this was — is a second, silent selection policy that agrees with the protocol's
 * until the day a template is promoted or withdrawn, and then disagrees without saying so.
 *
 * IT IS ALSO NOT THE CLI'S STARTER LIST, and that distinction is the point. `relics templates`
 * prints scaffolds for a person to type; this asks which templates the review programme permits an
 * agent to select. They happen to name the same two today. If a starter were ever hidden, renamed
 * or gated behind a flag, an agent keyed to the printed list would silently lose a runtime and the
 * benchmark would fail its vector floor for a reason that has nothing to do with art.
 */
export const WAVE1_CATALOG = Object.freeze(
  shipCatalog().map((templateId) => Object.freeze({ templateId, runtimeId: templateId.split("/")[0] })),
);

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

/** The demand ids `runtimeCanExpress` knows how to answer for. Composition demands carry their own. */
const IMPOSSIBLE_DEMAND_IDS = new Set(IMPOSSIBLE_DEMANDS.map((d) => d.id));

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * WHICH RUNTIME SUITS WHICH KIND OF ASK.
 *
 * Every weight below is traceable to the runtime's own `whatItCanDepict.can`, quoted here so the
 * table can be argued with rather than merely obeyed:
 *
 *   GEOMETRIC_RECURSION_V1  "one self-similar figure, centred, built by repeating a production on
 *                            itself over up to 6 levels, drawn in regular primitives, optionally
 *                            replicated by a symmetry order"
 *      -> recursion and radial systems are what it IS. Monuments and machines are single centred
 *         figures with internal repetition, which is the same shape of thing. It has no way to
 *         stack independent registers, so layering scores nothing.
 *
 *   VECTOR_COMPOSITION_V1   "1 to 6 fields of primitives placed about the canvas centre by one of
 *                            twelve layouts, each field with its own colour, market sensor and drive"
 *      -> independent fields ARE registers, so layering and sediment are its natural subjects
 *         (STACK is one of its twelve layouts and `alluvium` is a sediment template). Its
 *         stroke-only primitives make linework native. It cannot nest a figure inside itself, so
 *         recursion scores nothing.
 *
 * A zero means "this runtime has no special claim on that ask", never "refused" -- refusal is the
 * `cannot` list's job and happens before any of this.
 */
export const MEDIUM_AFFINITY = Object.freeze({
  GEOMETRIC_RECURSION_V1: Object.freeze({
    RECURSIVE_GEOMETRY: 3, RADIAL_SYSTEM: 3, LAYERING: 0, VECTOR_COMPOSITION: 0, LINEWORK: 1,
    MONUMENT: 2, MACHINE: 2, ARCHITECTURE: 1, BOTANICAL: 1, ORGANISM: 1, SEDIMENT: 0,
  }),
  VECTOR_COMPOSITION_V1: Object.freeze({
    RECURSIVE_GEOMETRY: 0, RADIAL_SYSTEM: 1, LAYERING: 3, VECTOR_COMPOSITION: 3, LINEWORK: 2,
    MONUMENT: 0, MACHINE: 1, ARCHITECTURE: 2, BOTANICAL: 1, ORGANISM: 2, SEDIMENT: 3,
  }),
});

/** The MEDIUM and MOTIF rows of a requiredCapabilities record, defensively. */
function signals_(requiredCapabilities) {
  return {
    MEDIUM: requiredCapabilities?.MEDIUM ?? [],
    MOTIF: requiredCapabilities?.MOTIF ?? [],
  };
}

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

  const impossible = [...detectImpossibleDemands(briefText), ...detectCompositionDemands(briefText)];
  const signals = detectDemandSignals(briefText);

  // WHAT THE MARKET IS ASKED TO DO, AND WHICH RUNTIME CAN DO IT.
  //
  // This is the third admission axis and it was missing entirely. The first two ask what is in the
  // picture; this asks what the market does TO the picture, and it turns out to be the sharpest
  // divider between the two Wave-1 runtimes — the recursion runtime can perform exactly one of the
  // seven named mechanisms. B09 asked it to fracture a mass, was admitted, spent its rounds, and
  // its reviewer closed with "there are no members in them to separate."
  const mechanisms = mechanismAdmission(briefText, catalog.map((c) => c.runtimeId));

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

  /** A demand blocks a runtime when the atlas cites that runtime, or when it names it outright. */
  const blocksRuntime = (demand, runtimeId) =>
    (Array.isArray(demand.blockedFor) && demand.blockedFor.includes(runtimeId)) ||
    (demand.citations !== undefined && Object.keys(demand.citations).length === 0 && Array.isArray(demand.blockedFor)
      ? demand.blockedFor.includes(runtimeId)
      : !runtimeCanExpress(runtimeId, demand.id));

  const candidates = catalog.map((entry) => {
    const known = new Set(IMPOSSIBLE_DEMAND_IDS);
    const blocking = impossible.filter((d) => d.severity === "HARD" && (known.has(d.id) ? !runtimeCanExpress(entry.runtimeId, d.id) : blocksRuntime(d, entry.runtimeId)));
    const concessions = impossible.filter((d) => d.severity === "SOFT" && (known.has(d.id) ? !runtimeCanExpress(entry.runtimeId, d.id) : blocksRuntime(d, entry.runtimeId)));
    const mech = mechanisms.perRuntime.find((r) => r.runtimeId === entry.runtimeId);
    // A runtime that cannot perform the PRIMARY mechanism is not viable. Secondary mechanisms are
    // recorded as concessions instead: the work can be made without them and the direction has to
    // say so out loud, which is the same rule a SOFT demand already follows.
    const mechanismBlocked = mech && mech.carriesPrimary === false
      ? [{ id: `MECHANISM_${mechanisms.requested[0].mechanism}`, what: `the market transformation the brief asks for: ${mechanisms.requested[0].mechanism}`, class: "MARKET_TRANSFORMATION", evidence: mechanisms.requested[0].evidence?.[0]?.clause ?? null, citation: mech.cannotExpress[0]?.detail ?? null }]
      : [];
    return {
      ...entry,
      viable: blocking.length === 0 && mechanismBlocked.length === 0,
      mechanisms: mech ? { canExpress: mech.canExpress, cannotExpress: mech.cannotExpress, carriesPrimary: mech.carriesPrimary } : null,
      mechanismBlockedBy: mechanismBlocked,
      blockedBy: [
        ...blocking.map((d) => ({ id: d.id, what: d.what, class: d.class, evidence: d.evidence[0]?.sentence ?? null, citation: d.citations?.[entry.runtimeId] ?? d.positiveCitation?.[entry.runtimeId] ?? "the runtime's positive capability statement" })),
        ...mechanismBlocked,
      ],
      concessions: [
        ...concessions.map((d) => ({ id: d.id, what: d.what, citation: d.citations?.[entry.runtimeId] ?? d.positiveCitation?.[entry.runtimeId] ?? d.noteCitation?.[entry.runtimeId] ?? null })),
        ...(mech?.cannotExpress ?? []).filter((c) => mechanisms.requested[0]?.mechanism !== c.mechanism).map((c) => ({ id: `MECHANISM_${c.mechanism}`, what: `a secondary market transformation the brief mentions: ${c.mechanism}`, citation: c.detail })),
      ],
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

  // FIT, NOT CATALOG ORDER.
  //
  // Ranking on concessions alone made every brief recommend the first entry, because a brief with
  // no impossible demands ties at zero and the tiebreak was the array. Twelve frozen benchmark
  // briefs -- including one explicitly about sediment, strata and banding, which is the other
  // template's entire subject -- all came back recommending the recursion runtime.
  //
  // So concessions decide first (a candidate that cannot carry part of the ask is worse), and fit
  // decides the tie. Fit is the brief's own MEDIUM and MOTIF signals scored against MEDIUM_AFFINITY.
  const scored = viable.map((c) => {
    const affinity = MEDIUM_AFFINITY[c.runtimeId] ?? {};
    const signals = [...(signals_(requiredCapabilities).MEDIUM), ...(signals_(requiredCapabilities).MOTIF)];
    const fit = signals.reduce((n, s) => n + (affinity[s] ?? 0), 0);
    return { ...c, fit, matchedSignals: signals.filter((s) => (affinity[s] ?? 0) > 0) };
  });
  // FIT DECIDES FIRST AND CONCESSIONS BREAK THE TIE. That is the reverse of the earlier ordering
  // and the reversal is a round-one finding rather than a preference.
  //
  // Adding the mechanism axis multiplied the number of concessions available, and because the
  // vector runtime can perform six of the seven named mechanisms and the recursion runtime one, a
  // concessions-first sort sends essentially every brief to the vector runtime — including the two
  // whose SUBJECT is self-similar recursion. Round one did exactly that and its reviewers refused
  // on subject: B02's said "not one botanical word occurred to me ... several unrelated organising
  // schemes", B07's said "these read as heraldic devices, struck and finished, not as things that
  // grew". Both were recursion subjects made on the vector runtime.
  //
  // A blocked PRIMARY mechanism is already a hard refusal above, so everything reaching this sort
  // can perform the transformation the brief is chiefly about. What remains is a choice between
  // withdrawing a secondary promise in the direction and making the wrong KIND of object, and the
  // reviews say the second is the more expensive error.
  const ranked = [...scored].sort((a, b) => (b.fit - a.fit) || (a.concessions.length - b.concessions.length));

  return Object.freeze({
    ...base,
    outcome: "ADMITTED",
    admitted: true,
    requiredCapabilities,
    impossibleDemands: impossible,
    mechanismAdmission: mechanisms,
    candidates: scored,
    ranking: ranked.map((c) => ({ templateId: c.templateId, fit: c.fit, concessions: c.concessions.length, matchedSignals: c.matchedSignals })),
    recommended: ranked[0].templateId,
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
