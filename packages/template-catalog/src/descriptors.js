// SPDX-License-Identifier: MIT
// ================================================================================================
// THE PUBLIC CREATOR DESCRIPTORS — machine-readable, for a human choosing and for an agent matching.
// ================================================================================================
//
// WHAT IS DECLARED HERE AND WHAT IS DERIVED
// -----------------------------------------
// DECLARED (frozen facts, read out of the runtime and template source, transcribed once and checked
// by `npm run kit:templatestatus`):
//
//     runtime id · runtime version · config schema version · the exact config bytes the frozen
//     encoder produces and their keccak256 · every sensor the template binds, with its curve and
//     the visual field it drives · the contact sheets · brief and use-case tags
//
// EVERY DIGEST HERE IS BARE HEX, WITH NO `0x`. That is not a style choice: `0x` followed by 64 hex
// characters is the literal shape of a raw private key, and the repository's secret scanner refuses
// it on sight. A config hash written the other way is a gate failure on every push, forever.
//
// DERIVED (never written here — computed, so it cannot go stale independently):
//
//     review status          <- `status.js`, out of the review ledger
//     effective signals      <- `signals.js`, out of the committed measurement census
//     market-responsive      <- `signals.js`, per state pair, twice, by two different methods
//
// ------------------------------------------------------------------------------------------------
// TWO THINGS THIS FILE MAY NEVER CARRY, AND WHY
// ------------------------------------------------------------------------------------------------
// 1. **NO LAUNCHABILITY.** Which runtimes a chain carries is a per-chain fact that changes
//    without this file changing, and on 2026-08-29 it did: both Wave-1 runtimes were registered and
//    went active on three chains while every byte here stayed put. That is the rule working, not an
//    omission to repair — `assertNoLaunchabilityClaim` still refuses any key that would answer the
//    question, precisely so this file cannot go stale against the chain. The live answer comes from
//    `getChainCapability` reading `ArtRuntimeRegistryV1`, on the day you ask.
//
// 2. **NO QUALITY SCORE.** No number, no rank, no stars, no grade — here or on chain.
//    `assertNoQualityScore` refuses them by key name. The review that produced these verdicts kept
//    two axes apart deliberately and refused to average them; a score would silently re-merge them,
//    and a score published beside a template would then have to be defended as a fact about art.
//    Creator guidance belongs in prose a creator can disagree with. What IS published as a number
//    is the MEASUREMENT — per-mille sensor movement, CIE76 delta-E — which is a fact about pixels.
//
// ------------------------------------------------------------------------------------------------
// THE TEMPLATE IS A STARTING POINT, NOT A CAGE
// ------------------------------------------------------------------------------------------------
// Every `config` block below is a PRESET. A creator, or an agent acting for one, may change any
// value the runtime's own validator accepts — palettes, counts, depths, symmetries, shapes,
// sensors, curves, traits, the title. The catalog constrains WHICH template you start from; it
// places no bound whatever on how far the configuration then legally moves, and nothing in this
// package compares a creator's final config against the preset it began as. `mutation` says so on
// every descriptor so an agent reading only the data reaches the same conclusion.
// ================================================================================================

import {
  PROMOTION_REQUIREMENTS,
  assertNoLaunchabilityClaim,
  latestVerdict,
  templateStatus,
} from "./status.js";
import {
  TRAIT_ONLY_SENSORS,
  VISUAL_SENSORS,
  classifyBindings,
  marketResponse,
  perceptualResponse,
} from "./signals.js";

/** The descriptor format's own version. Bump when a FIELD changes, not when a value does. */
export const DESCRIPTOR_SCHEMA_VERSION = "1.0.0";

/**
 * The runtimes Wave 1 ships. TWO. It was four, then three, and it is two.
 *
 * TWO RUNTIMES HAVE LEFT, both recorded in `RUNTIMES_LEFT_WAVE1` below rather than deleted, and
 * both removed by the same rule: a runtime enters a wave only with at least one blind-reviewed SHIP
 * template. `CELLULAR_SYSTEM_V1` left on 2026-08-29 when its last candidate was rejected;
 * `PIXEL_GRID_V1` left the same day when its last candidate — `idol`, its only SHIP template — was
 * held by the blind review of its repaired frame. The rule is what removed them. No judgement about
 * either engine was made or is implied, and neither runtime's source was ever in question.
 *
 * `configSchemaVersion` is the version byte the runtime's own config parser REQUIRES, read from the
 * frozen Solidity. It is NOT the runtime version and the two disagree: GEOMETRIC_RECURSION and
 * CELLULAR are both at config version 2 while every runtime is at runtime version 1, because both
 * had a byte change meaning under them (a recursion rule went 14 -> 15 bytes and three of its
 * fields became sets; cellular's byte 14 stopped being `paletteCount` and became `rampCeiling`).
 * Assuming 1 because the runtime says 1 produces a config the parser rejects with ERR_VERSION.
 */
export const RUNTIMES = Object.freeze({
  GEOMETRIC_RECURSION_V1: Object.freeze({
    id: "GEOMETRIC_RECURSION_V1",
    runtimeVersion: 1,
    artRuntimeMode: 1,
    artRuntimeModeName: "SOLIDITY_SVG_V1",
    runtimeTagPreimage: "V4ART.RUNTIME.GEOMETRIC_RECURSION_V1",
    configMagic: "GRV1",
    configSchemaVersion: 2,
    summary: "Recursive geometry: a small set of rules applied to themselves, level on level.",
  }),
  VECTOR_COMPOSITION_V1: Object.freeze({
    id: "VECTOR_COMPOSITION_V1",
    runtimeVersion: 1,
    artRuntimeMode: 1,
    artRuntimeModeName: "SOLIDITY_SVG_V1",
    runtimeTagPreimage: "V4ART.RUNTIME.VECTOR_COMPOSITION_V1",
    configMagic: "VCV1",
    configSchemaVersion: 1,
    summary: "Layered vector fields: layouts of primitives composed into one plate.",
  }),
});

/**
 * Runtimes that were in Wave 1 and are not any more, with the reason. RECORDED, NEVER DELETED.
 *
 * Same law as `REJECTED` in the status model: "the remainder left" is only a checkable statement if
 * the remainder is written down. It also stops a departed runtime being quietly re-listed later as
 * though it had never gone, and it keeps its name in the launchability scan — a runtime nobody may
 * launch is exactly the name a stale sentence would claim is live.
 *
 * A DEPARTURE IS NOT A VERDICT ON THE ENGINE. Both of these render, validate, stay inside their cost
 * budgets and still carry reviewed templates in the ledger. What neither carries is a SHIP one, and
 * the wave rule is about that and only that.
 */
export const RUNTIMES_LEFT_WAVE1 = Object.freeze({
  CELLULAR_SYSTEM_V1: Object.freeze({
    id: "CELLULAR_SYSTEM_V1",
    runtimeTagPreimage: "V4ART.RUNTIME.CELLULAR_SYSTEM_V1",
    leftAt: "2026-08-29",
    reason:
      "ZERO_SHIP_TEMPLATES — its last SHIP candidate was returned REJECT by the final blind review " +
      "(WAVE1-FINAL-BLIND-2026-08-29), on total seed-diversity failure. A runtime enters a wave only " +
      "with at least one blind-reviewed SHIP template.",
    reviewedTemplatesStillInTheLedger: true,
  }),
  PIXEL_GRID_V1: Object.freeze({
    id: "PIXEL_GRID_V1",
    runtimeTagPreimage: "V4ART.RUNTIME.PIXEL_GRID_V1",
    leftAt: "2026-08-29",
    reason:
      "ZERO_SHIP_TEMPLATES — its only SHIP template, `idol`, was returned HOLD by the blind review " +
      "of its repaired frame (IDOL-FRAME-REPAIR-BLIND-2026-08-29). A runtime enters a wave only " +
      "with at least one blind-reviewed SHIP template. The template is stuck rather than unlucky: " +
      "pre-repair it failed the structural role gate with a layer that drew nothing at any market " +
      "state, and post-repair it fails blind review with a frame topologically identical on every " +
      "seed, so both honest paths end at HOLD. That is a template-curation problem for a later " +
      "wave. The RUNTIME's source was never in question.",
    reviewedTemplatesStillInTheLedger: true,
  }),
});

/** Every visual sensor a config may bind, plus the one that is trait-only. Same for all three. */
const SUPPORTED_SIGNALS = Object.freeze({
  visual: VISUAL_SENSORS,
  traitOnly: TRAIT_ONLY_SENSORS,
  note: "Every runtime in this wave accepts all nine visual sensors. Acceptance is not effectiveness — see `signals.effective`.",
});

/** The same sentence on every descriptor, so an agent reading only data reaches the same rule. */
const MUTATION = Object.freeze({
  presetIsAStartingPoint: true,
  mayChange: Object.freeze(["palette", "layout", "counts", "depths", "symmetry", "shapes", "sensors", "curves", "traits", "title", "seedBehaviour"]),
  bound: "the runtime's own config validator, and nothing else",
  note: "The catalog constrains WHICH template you start from. It places no bound on how far the configuration then legally moves, and nothing here compares a finished config against the preset it began as.",
});

/**
 * THE RENDER COMMITMENT ALGORITHM, STATED SO IT CAN BE RE-DERIVED.
 *
 * Over the thirty-six documents a template's contact sheets were built from — twelve seeds x three
 * market states, as the runtime wrote them, base64 data URIs and all — sorted by filename:
 *
 *     sha256( join("\n", [ `${filename} ${sha256(bytes)}` ]) )
 *
 * It was previously published as the bare word "sha256-of-name-and-content-pairs", which named a
 * family of formulas rather than one, and no consumer could reproduce it. A commitment nobody can
 * recompute is a number, not a commitment.
 */
export const RENDER_COMMITMENT_ALGORITHM = "sha256-of-sorted-name-space-sha256-lines-joined-by-newline";

/**
 * The two Wave-1 SHIP templates.
 *
 * Note the descriptors exist ONLY for SHIP. That is not an omission: a descriptor is the artifact
 * an agent matches against, and publishing one for a template an agent may never select would be
 * publishing a temptation. The non-SHIP tiers are fully enumerated in the review ledger, with their
 * verdicts, which is what makes the classification checkable without making it selectable.
 *
 * FIVE DESCRIPTORS WERE REMOVED HERE ON 2026-08-29 and none of them was deleted from the record.
 * `dendron`, `cairn`, `reliquary` and `crux` were repaired, re-reviewed blind, and came back HOLD,
 * HOLD, SHIP_WITH_CAVEAT and REJECT; `idol` was repaired later the same day and came back HOLD.
 * Their verdicts are in the ledger and `describeUnshippedTemplate` still answers for them; what they
 * lost is the descriptor, because the descriptor IS the starting point and a template an agent may
 * not select must not have one.
 */
export const TEMPLATE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    id: "GEOMETRIC_RECURSION_V1/compass",
    name: "compass",
    runtimeId: "GEOMETRIC_RECURSION_V1",
    title: "Compass",
    summary: "Rings of rings, coloured by level: an instrument whose self-similarity ratio opens as the market heals and whose generations are cut by drawdown.",
    brief: Object.freeze({
      tags: Object.freeze(["rings", "concentric", "radial", "instrument", "navigational", "orrery", "nested", "precision", "cartographic", "circular"]),
      useCases: Object.freeze([
        "a collection with an instrument, dial or navigational register",
        "a brief asking for concentric or radial composition",
        "a project that wants drawdown to remove structure rather than add it",
      ]),
      notFor: Object.freeze(["a brief asking for organic or irregular silhouettes", "a brief that needs every token to have a different overall shape"]),
    }),
    config: Object.freeze({ bytes: 100, keccak256: "a8d87edbd9687ad7db49ddc51a60cd99a80f69bcd8f6fe7e41a6d52ef3c704f6" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "CONTRACT — the self-similarity ratio of every level" }),
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "DEPTH — how many generations are drawn, 1..4" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Generations", source: "RECOVERY", style: "NUMBER" }),
      Object.freeze({ name: "Compression", source: "DRAWDOWN", style: "WORD" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "GEOMETRIC_RECURSION_V1--compass--SEEDS-thumb120.png", bytes: 274696, sha256: "e8c4ab76a83d8b12eb17ef7dea9903ca0a60b9308cd97899d50570f80146d379" }),
      states: Object.freeze({ name: "GEOMETRIC_RECURSION_V1--compass--STATES.png", bytes: 955518, sha256: "7c6023f99efb10c7f630b2cbafc8645ee167dba2710617b47915b92f74c5b300" }),
    }),
    renderCommitment: Object.freeze({ algorithm: RENDER_COMMITMENT_ALGORITHM, renders: 36, digest: "d23de7c0d2e040d4469434276f9ccb408db83417f4c92e7c60a4f9b34db768b9" }),
    mutation: MUTATION,
  }),

  Object.freeze({
    id: "VECTOR_COMPOSITION_V1/alluvium",
    name: "alluvium",
    runtimeId: "VECTOR_COMPOSITION_V1",
    title: "Alluvium",
    summary: "Sediment: the market writes the strata. Drawdown sets how many beds are laid down, recovery rules them through, and stress studs them with nodules.",
    brief: Object.freeze({
      tags: Object.freeze(["sediment", "strata", "geological", "layered", "horizontal", "deposition", "banding", "earth", "core-sample", "ochre"]),
      useCases: Object.freeze([
        "a collection about accumulation, record or deposition",
        "a brief asking for horizontal composition and a wide silhouette range",
        "a project that wants the market's whole history legible as layers",
      ]),
      notFor: Object.freeze(["a brief asking for a centred emblem or badge", "a brief that needs radial symmetry"]),
    }),
    config: Object.freeze({ bytes: 92, keccak256: "3ef8c0e97af9d9db4ec2c4441a4e2cfef572dfad9230910fc900124155c0c322" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "COUNT — stacked beds, 8..34" }),
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "COUNT — ruled lines through the field, 9..28" }),
      Object.freeze({ sensor: "STRESS", curve: "LINEAR", drives: "DEPTH — the nodule ring count" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Beds", source: "DRAWDOWN", style: "NUMBER" }),
      Object.freeze({ name: "Nodule", source: "STRESS", style: "WORD" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "VECTOR_COMPOSITION_V1--alluvium--SEEDS-thumb120.png", bytes: 118451, sha256: "3370542986ac6e979af7dc5aa4dce70013be6c245e5ced03e94516e629d3407d" }),
      states: Object.freeze({ name: "VECTOR_COMPOSITION_V1--alluvium--STATES.png", bytes: 228448, sha256: "507d5367520c0c93604eccbb49ea8bcc7c5b2e056593f76cb1d71391df7f33b8" }),
    }),
    renderCommitment: Object.freeze({ algorithm: RENDER_COMMITMENT_ALGORITHM, renders: 36, digest: "ce4498023fec823aba26a8900ad8191c80ccb08610db24ca4242c5a88ebc8ba3" }),
    mutation: MUTATION,
  }),

]);

/** Descriptor by template id, or null. Never throws. */
export function descriptorFor(templateId) {
  return TEMPLATE_DESCRIPTORS.find((d) => d.id === templateId) ?? null;
}

/**
 * The full published record for one template: declared facts, plus everything derived.
 *
 * THIS is what a creator surface or an agent reads. It carries no chain fact and cannot be made to
 * carry one — `chain` is deliberately absent rather than null, so a consumer that needs it has to
 * go and read the registry instead of finding a field already there and trusting it.
 */
export function describeTemplate(templateId) {
  const d = descriptorFor(templateId);
  if (!d) return null;
  const runtime = RUNTIMES[d.runtimeId];
  const signals = classifyBindings(d.bindings);
  const response = marketResponse(d.bindings);
  const perceptual = perceptualResponse(d.id);
  const verdict = latestVerdict(d.id);
  return Object.freeze({
    descriptorSchemaVersion: DESCRIPTOR_SCHEMA_VERSION,
    id: d.id,
    name: d.name,
    title: d.title,
    summary: d.summary,

    runtime: Object.freeze({
      id: runtime.id,
      runtimeVersion: runtime.runtimeVersion,
      artRuntimeMode: runtime.artRuntimeMode,
      artRuntimeModeName: runtime.artRuntimeModeName,
      runtimeTagPreimage: runtime.runtimeTagPreimage,
      configMagic: runtime.configMagic,
      configSchemaVersion: runtime.configSchemaVersion,
      summary: runtime.summary,
    }),

    brief: d.brief,
    config: d.config,
    traits: d.traits,
    sheets: d.sheets,
    renderCommitment: d.renderCommitment,
    mutation: d.mutation,

    signals: Object.freeze({
      supported: SUPPORTED_SIGNALS,
      bound: d.bindings,
      effective: signals.effective,
      ineffective: signals.ineffective,
    }),

    /** Measured twice, by two methods that can disagree. Both are published; neither is averaged. */
    marketResponsive: response.responsive && perceptual.responsive === true,
    marketResponse: Object.freeze({ configMovement: response, perceptual }),

    review: Object.freeze({
      status: templateStatus(d.id),
      verdict: verdict?.verdict ?? null,
      reviewId: verdict?.reviewId ?? null,
      documentSha256: verdict?.documentSha256 ?? null,
      blindCode: verdict?.blindCode ?? null,
      blindCodeSource: verdict?.blindCodeSource ?? null,
      method: "BLIND_VISUAL",
    }),
  });
}

/** Every SHIP descriptor, fully described. The catalog a default surface renders. */
export function describeAll() {
  return Object.freeze(TEMPLATE_DESCRIPTORS.map((d) => describeTemplate(d.id)));
}

/**
 * The reduced record for a template that did NOT ship — what an advanced flag reveals.
 *
 * IT CARRIES NO DESCRIPTOR AND NO CONFIG HASH, deliberately. A creator asking to see the tiers
 * below SHIP is asking what was judged and how, not being handed a starting point; publishing a
 * full descriptor for a HELD template would make it selectable in practice however the tiers were
 * labelled, because a descriptor is the thing tooling consumes.
 *
 * The weakness it reports is MEASURED, not transcribed. The review's prose is an internal record
 * and stays there; what a creator gets is the template's own weakest state pairing out of the
 * perceptual census, against the census's own floor — a fact about pixels that anyone can
 * re-derive.
 *
 * IT IS NOT ALWAYS THE DEFECT THE REVIEW NAMED, and pretending otherwise would be the drift this
 * package exists to stop. `PIXEL_GRID_V1/idol` is the case: every one of its state pairings clears
 * the perceptual floor comfortably, and it is HELD anyway, because what the blind reviewer refused
 * was SEED diversity at browse size — a frame topologically identical on every seed — which this
 * census does not measure. So read this field as "the weakest pairing the census measured", never
 * as "why it was held". The two axes were kept apart by the review on purpose and are kept apart
 * here for the same reason.
 */
export function describeUnshippedTemplate(templateId) {
  const status = templateStatus(templateId);
  if (status === "UNREVIEWED" || status === "SHIP") return null;
  const verdict = latestVerdict(templateId);
  const perceptual = perceptualResponse(templateId);
  let weakest = null;
  if (perceptual.measured) {
    const pairs = Object.entries(perceptual.pairs).sort((a, b) => a[1].deltaE - b[1].deltaE);
    const [pair, row] = pairs[0];
    const NAMES = { ns: "neutral -> stress", nr: "neutral -> recovery", sr: "stress -> recovery" };
    weakest = Object.freeze({
      pair,
      states: NAMES[pair],
      deltaE: row.deltaE,
      floorDeltaE: perceptual.floorDeltaE,
      clearsFloor: row.separated,
    });
  }
  return Object.freeze({
    descriptorSchemaVersion: DESCRIPTOR_SCHEMA_VERSION,
    id: templateId,
    runtimeId: templateId.split("/")[0],
    name: templateId.split("/")[1],
    offeredAsAStartingPoint: false,
    review: Object.freeze({
      status,
      verdict: verdict?.verdict ?? null,
      reviewId: verdict?.reviewId ?? null,
      documentSha256: verdict?.documentSha256 ?? null,
      blindCode: verdict?.blindCode ?? null,
      blindCodeSource: verdict?.blindCodeSource ?? null,
      method: "BLIND_VISUAL",
    }),
    weakestMeasuredStatePairing: weakest,
    promotion: Object.freeze({
      possible: status !== "REJECTED",
      requires: PROMOTION_REQUIREMENTS,
      note: "A template may never be promoted to SHIP by maintainer judgement. It takes a contained fix, a config still inside the runtime's final bounds, a regenerated sheet, and a NEW blind review returning SHIP.",
    }),
  });
}

const QUALITY_SCORE_KEYS = ["score", "rating", "rank", "ranking", "stars", "grade", "quality", "qualityScore", "artScore", "aestheticScore", "points"];

/**
 * A descriptor may not carry a subjective numeric quality score, under any name.
 *
 * Refused by KEY, at every depth, because the temptation is real and the shape is always the same:
 * a small number beside a template that a surface then sorts by. Measurements are exempt by name —
 * `perMille`, `deltaE`, `bytes`, `renders` are facts about pixels and bytes, not judgements about art.
 */
export function assertNoQualityScore(value, path = "descriptor") {
  const problems = [];
  const walk = (node, at) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${at}[${i}]`)); return; }
    for (const [k, v] of Object.entries(node)) {
      if (QUALITY_SCORE_KEYS.includes(k) && typeof v === "number") {
        problems.push(`${at}.${k} is a numeric quality score. No subjective score is published here or on chain — the review deliberately kept its axes apart and a number re-merges them.`);
      }
      walk(v, `${at}.${k}`);
    }
  };
  walk(value, path);
  return problems;
}

/** Validate one descriptor. Empty array means well-formed. */
export function validateDescriptor(d) {
  const problems = [];
  for (const k of ["id", "name", "runtimeId", "title", "summary", "brief", "config", "bindings", "sheets", "mutation"]) {
    if (d?.[k] === undefined || d?.[k] === null) problems.push(`${d?.id ?? "?"}: missing required field ${k}`);
  }
  if (!RUNTIMES[d?.runtimeId]) problems.push(`${d?.id}: runtimeId ${JSON.stringify(d?.runtimeId)} is not one of ${Object.keys(RUNTIMES).join(", ")}`);
  if (!/^[0-9a-f]{64}$/.test(d?.config?.keccak256 ?? "")) problems.push(`${d?.id}: config.keccak256 must be 64 lowercase hex characters, BARE — the keccak of the bytes the frozen encoder produces`);
  if (!Number.isInteger(d?.config?.bytes) || d.config.bytes < 1) problems.push(`${d?.id}: config.bytes must be a positive integer`);
  if (!Array.isArray(d?.bindings) || d.bindings.length === 0) problems.push(`${d?.id}: a descriptor with no bindings describes a template the market cannot move`);
  for (const b of d?.bindings ?? []) {
    if (!VISUAL_SENSORS.includes(b.sensor)) problems.push(`${d?.id}: ${b.sensor} is not one of the nine visual sensors`);
    if (typeof b.drives !== "string" || b.drives.trim().length < 8) problems.push(`${d?.id}: a binding on ${b.sensor} does not say what it DRIVES. Name the structural effect, not the colour.`);
  }
  if (!Array.isArray(d?.brief?.tags) || d.brief.tags.length < 5) problems.push(`${d?.id}: brief.tags needs at least five tags, or semantic matching has nothing to match on`);
  if (!Array.isArray(d?.brief?.useCases) || d.brief.useCases.length < 2) problems.push(`${d?.id}: brief.useCases needs at least two entries`);
  if (!Array.isArray(d?.brief?.notFor) || d.brief.notFor.length < 1) problems.push(`${d?.id}: brief.notFor is required — a template that says what it is not for is a template an agent can decline`);
  problems.push(...assertNoLaunchabilityClaim(d));
  problems.push(...assertNoQualityScore(d, d?.id ?? "descriptor"));
  return problems;
}
