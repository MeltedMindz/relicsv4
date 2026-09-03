// SPDX-License-Identifier: MIT
// ================================================================================================
// THE PARAMETER ATLAS, AS THE AUTHOR READS IT.
//
// WHAT THIS IS NOT. It is not a schema. The schema says `contraction` is a byte and therefore that
// 20 and 200 are both legal, which is true and useless: it does not say that the floor is a
// constant in the bytecode so the value is a CEILING and the seed picks somewhere beneath it, that
// the parameter moves ink120 by 0.042 across its whole range while `stroke` moves it by 0.278, or
// that a project which binds it to a market sensor has bound the quietest control it owns. All of
// that was MEASURED — 66 sweeps, 2,597 renders against the deployed runtimes — and it is the
// difference between choosing a parameter and picking a number out of a legal interval.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: NEVER ASSIGN A PARAMETER FROM SCHEMA MIN/MAX ALONE.
// `consult()` is the only way to reach a parameter's guidance and it REFUSES to answer for a
// parameter the atlas does not document, rather than returning an empty record the caller can
// shrug at. An author that cannot consult a parameter must not set it.
//
// SIX FACETS. The atlas stores what it measured; this file normalises it into the six things an
// author actually needs to decide a value —
//
//     visibleEffect            what changes on the raster when this moves
//     lowHighBehaviour         what each end of the range looks like, with the curve if measured
//     interactions             what it multiplies, cancels, or is ignored by
//     failureMode              how it produces a legal configuration that draws nothing
//     safeExpressiveRange      the sub-interval that is neither invisible nor saturated
//     marketBindingSuitability whether it is fit to carry a sensor at all
//
// A MISSING FACET IS RECORDED, NOT FAKED, AND USUALLY NOT FATAL. Two of them are decisive and do
// throw: `visibleEffect` always, and `marketBindingSuitability` when the caller says it is about to
// bind a sensor to this parameter. The rest come back as `{ measured: false, reason }` and travel
// into the acceptance receipt, so a choice made without evidence is visible as such afterwards
// rather than indistinguishable from an evidenced one. Refusing outright on any gap was tried
// first and was wrong — see ATLAS_FACET_SOURCES for what it broke and why.
//
// `safeExpressiveRange` is the one facet the atlas does not store under any name; it is DERIVED
// here from the measured coverage curve, and the derivation is recorded on the returned record so
// a reader can see it was computed rather than asserted.
//
// STALENESS IS A REFUSAL, NOT A WARNING. The guidance describes bytecode. If that bytecode is
// replaced, every number here becomes a confident description of something that is no longer
// deployed — which is strictly worse for an author than having no atlas, because it does not know
// to be careful. `assertAtlasFresh` throws.
// ================================================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(PKG, "vendor");

let _guidance = null;
let _provenance = null;

/** The vendored guidance document, parsed once. */
export function loadGuidance() {
  if (!_guidance) _guidance = JSON.parse(readFileSync(join(VENDOR, "AUTHORING_GUIDANCE.json"), "utf8"));
  return _guidance;
}

/** The vendor record: digests, coverage, and the runtime codehashes the guidance was measured against. */
export function atlasProvenance() {
  if (!_provenance) _provenance = JSON.parse(readFileSync(join(VENDOR, "VENDOR.json"), "utf8"));
  return _provenance;
}

/** The runtime ids the atlas documents. Derived, never listed. */
export function atlasRuntimeIds() {
  return Object.keys(loadGuidance().runtimes ?? {});
}

/**
 * Refuse to author against an atlas that no longer describes the deployed runtimes.
 *
 * `observed` is `{ RUNTIME_ID: "0x<keccak of deployed runtime code>" }` — read from chain by the
 * caller, because this package holds no endpoint and no address book.
 *
 * AN UNOBSERVED RUNTIME IS NOT FRESH. Passing `{}` proves nothing and is refused, which is the
 * no-vacuous-pass rule applied to a freshness check: "I could not read the chain" must never be
 * indistinguishable from "the chain agrees".
 */
export function assertAtlasFresh(observed) {
  const pinned = atlasProvenance().runtimeCodeHash ?? {};
  const ids = Object.keys(pinned);
  if (ids.length === 0) throw new Error("atlas provenance carries no runtime codehash; it cannot be checked for staleness");
  const seen = Object.keys(observed ?? {});
  if (seen.length === 0) {
    throw new Error("assertAtlasFresh was given no observed codehashes. An unread chain is not a fresh atlas.");
  }
  const drift = [];
  for (const [id, hash] of Object.entries(observed)) {
    const want = pinned[id]?.codeHash;
    if (!want) { drift.push(`${id}: not pinned by the atlas`); continue; }
    if (String(hash).toLowerCase() !== String(want).toLowerCase()) {
      drift.push(`${id}: deployed ${hash} != atlas ${want}`);
    }
  }
  if (drift.length) {
    throw new Error(
      `ATLAS_STALE — the runtimes on chain are not the ones these measurements describe:\n  ${drift.join("\n  ")}\n` +
      "Re-measure upstream and re-run scripts/sync-art-atlas.mjs --sync. Do not author against this.",
    );
  }
  return { fresh: true, checked: seen, pinnedRuntimes: ids };
}

/**
 * What a runtime can and cannot depict. The basis for brief admission; see `capabilities.js`.
 *
 * `cannot` IS STORED AS ONE SEMICOLON-DELIMITED SENTENCE and is split into clauses here. That is
 * a presentation detail of the upstream file and not something callers should each re-derive —
 * two consumers splitting the same sentence slightly differently is how a citation check starts
 * passing against a clause nobody else can find. The raw sentence is kept beside the split so a
 * reader can always see what was actually written.
 */
export function capabilityStatement(runtimeId) {
  const r = loadGuidance().runtimes?.[runtimeId];
  if (!r) throw new Error(`the atlas documents no runtime "${runtimeId}"`);
  const w = r.whatItCanDepict;
  if (!w?.can || !w?.cannot) throw new Error(`${runtimeId}: whatItCanDepict is missing or malformed`);
  const cannot = Array.isArray(w.cannot)
    ? w.cannot.map((c) => String(c).trim())
    : String(w.cannot).split(";").map((c) => c.trim()).filter(Boolean);
  if (cannot.length < 2) {
    throw new Error(`${runtimeId}: whatItCanDepict.cannot yielded ${cannot.length} clauses; brief admission would have almost nothing to cite`);
  }
  return Object.freeze({
    runtimeId,
    can: w.can,
    cannot: Object.freeze(cannot),
    cannotRaw: Array.isArray(w.cannot) ? w.cannot.join("; ") : String(w.cannot),
    note: w.note ?? null,
  });
}

/** The five cross-runtime laws. These bind BOTH runtimes and are what a naive author violates first. */
export function crossRuntimeLaws() {
  return loadGuidance().crossRuntimeLaws ?? [];
}

/** The measured 120px loudness ranking — which controls actually move a browse-size raster. */
export function loudnessRanking(runtimeId) {
  const l4 = crossRuntimeLaws().find((l) => l.id === "L4");
  return l4?.ranking120px?.[runtimeId] ?? [];
}

/** The shortest true summary for a runtime. Every line measured. */
export function quickReference(runtimeId) {
  return loadGuidance().quickReference?.[runtimeId] ?? [];
}

/** Parameter names the atlas documents for a runtime. */
export function parameterNames(runtimeId) {
  const r = loadGuidance().runtimes?.[runtimeId];
  if (!r) throw new Error(`the atlas documents no runtime "${runtimeId}"`);
  return r.parameters.map((p) => p.name);
}

/**
 * The six facets a consultation produces, and WHERE EACH ONE IS MEASURED.
 *
 * ONE FACET HAS SEVERAL LEGITIMATE FORMS AND COLLAPSING THEM WOULD HAVE BLOCKED THE AUTHOR.
 * A first cut of this file required `lowEnd`/`highEnd` on every parameter and refused any entry
 * without them, which sounded strict and was simply wrong: `layout`, `primitive` and `symmetry`
 * are CATEGORICAL, they have no low end, and the atlas measured them as an ORDERING (`fullOrdering`,
 * `families`) instead. Twelve of twenty-three parameters were refused — including every control
 * that decides what the picture IS — and an author that cannot set `layout` cannot compose.
 * Requiring a measurement in a shape the measurement was never taken in is not rigour.
 *
 * So each facet names every form the atlas records it in, and a facet found in ANY of them is
 * measured. The gaps that remain are real and are reported as gaps rather than closed by widening
 * the list further: 20 of the 138 facet-slots across the 23 parameters carry no measurement, and
 * the author is told which, so it proceeds knowing what it does not know. That count is asserted
 * by `test/atlas.test.mjs`, so widening a source list to make a gap disappear moves a number a
 * test is watching rather than quietly improving the coverage figure.
 */
export const ATLAS_FACET_SOURCES = Object.freeze({
  visibleEffect: Object.freeze(["visualRole"]),
  lowHighBehaviour: Object.freeze(["lowEnd", "highEnd", "fullCurve", "fullOrdering", "families", "curve", "measured"]),
  interactions: Object.freeze(["interactions", "usefulRelationships"]),
  failureMode: Object.freeze(["failureModes", "unexpected"]),
  safeExpressiveRange: Object.freeze(["fullCurve", "fullOrdering", "families", "lowEnd", "highEnd"]),
  marketBindingSuitability: Object.freeze(["marketBindingSuitability", "sensorSeparation", "measuredAcrossTheReviewRing"]),
});

export const ATLAS_CONSULTATION_FACETS = Object.freeze(Object.keys(ATLAS_FACET_SOURCES));

/**
 * The facets whose ABSENCE is a refusal rather than a recorded gap.
 *
 * `visibleEffect` always: a parameter whose visual role was never measured is one this atlas
 * cannot advise on at all, and setting it would be the schema-min/max guess by another route.
 * `marketBindingSuitability` only when the caller says it intends to bind a sensor to this
 * parameter — the atlas's own `howToUseThis` puts a symbolic reachability check before every
 * binding, and a binding chosen without the suitability finding is the failure that shipped two
 * of the seven collections in the failing corpus.
 */
export const ATLAS_DECISIVE_FACETS = Object.freeze(["visibleEffect"]);

/**
 * Parse the measured coverage curve into points, when the atlas recorded one.
 *
 * `fullCurve` is stored as `"2:0.005  4:0.009  6:0.014 …"` — value:ink120 pairs at 120px, which is
 * the size a collection is actually browsed at. Where a parameter is categorical the atlas stores
 * `fullOrdering` instead and there is no numeric interval to derive.
 */
function parseCurve(text) {
  if (typeof text !== "string") return null;
  const pts = [];
  for (const m of text.matchAll(/(-?\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/g)) {
    pts.push({ value: Number(m[1]), ink120: Number(m[2]) });
  }
  return pts.length >= 3 ? pts : null;
}

/**
 * DERIVE the safe expressive range from the measured curve.
 *
 * The atlas does not store this facet, and inventing a number for it would be exactly the
 * schema-min/max failure this file exists to prevent. So it is computed from measurement, and the
 * computation is stated on the record.
 *
 * Two bounds, both measured rather than chosen:
 *   INVISIBLE  ink120 below 0.02 is a blank tile at browse size. The atlas says this in prose for
 *              `sizeMax` ("anything below about 10 is a blank tile") and the value here reproduces
 *              that threshold on that curve rather than being fitted to it.
 *   SATURATED  ink120 above 0.60 is a filled frame in which nothing else can read.
 *
 * A curve that never leaves either band is reported as such — that is a real finding about a
 * parameter (it is always invisible, or always saturated) and must not be smoothed into a range.
 */
const INK_INVISIBLE = 0.02;
const INK_SATURATED = 0.6;

function deriveSafeRange(entry) {
  const pts = parseCurve(entry.fullCurve);
  if (!pts) {
    const ordering = entry.fullOrdering ?? entry.families ?? null;
    if (ordering) {
      return {
        measured: true,
        kind: "CATEGORICAL",
        derivedFrom: entry.fullOrdering ? "fullOrdering" : "families",
        ordering,
        note: "no numeric interval: choose by the measured ordering, not by an index range",
      };
    }
    // THE ENDS WERE MEASURED, THEY WERE JUST WRITTEN DOWN AS SENTENCES.
    //
    // Only three of the twenty-three entries carry a machine-readable `fullCurve`. The rest record
    // the same measurement as prose — "contraction 20: ink120 0.393 … 90: 0.435" — and a first cut
    // of this function scored all nineteen of them UNMEASURED, which was a false report about the
    // atlas rather than a fact about the parameter. The numbers are there and a reader uses them;
    // what is absent is a parsed interval, so that is what is said. The prose is NOT regex-mined
    // into numbers: a bound silently misparsed out of a sentence is worse than a bound the author
    // is told to read for itself.
    if (entry.lowEnd || entry.highEnd) {
      return {
        measured: true,
        precision: "PROSE",
        kind: "PROSE_BOUNDED",
        derivedFrom: [entry.lowEnd ? "lowEnd" : null, entry.highEnd ? "highEnd" : null].filter(Boolean),
        lowEnd: entry.lowEnd ?? null,
        highEnd: entry.highEnd ?? null,
        note: "both ends are measured but recorded as prose; there is no parsed interval to bound a value against automatically",
      };
    }
    return {
      measured: false,
      kind: "UNMEASURED_INTERVAL",
      derivedFrom: null,
      note: "the atlas records neither a coverage curve nor an end-to-end description for this parameter; treat any value as provisional until rendered",
    };
  }
  const usable = pts.filter((p) => p.ink120 >= INK_INVISIBLE && p.ink120 <= INK_SATURATED);
  if (usable.length === 0) {
    const allLow = pts.every((p) => p.ink120 < INK_INVISIBLE);
    return {
      measured: true,
      kind: allLow ? "ALWAYS_INVISIBLE" : "ALWAYS_SATURATED",
      derivedFrom: "fullCurve",
      curve: pts,
      note: allLow
        ? "every measured value of this parameter is a blank tile at 120px; it cannot carry the composition alone"
        : "every measured value of this parameter fills the frame at 120px",
    };
  }
  return {
    measured: true,
    kind: "MEASURED_INTERVAL",
    derivedFrom: "fullCurve",
    min: usable[0].value,
    max: usable[usable.length - 1].value,
    inkAtMin: usable[0].ink120,
    inkAtMax: usable[usable.length - 1].ink120,
    curve: pts,
    thresholds: { invisibleBelowInk120: INK_INVISIBLE, saturatedAboveInk120: INK_SATURATED },
    note: `values outside ${usable[0].value}..${usable[usable.length - 1].value} measured below ${INK_INVISIBLE} or above ${INK_SATURATED} ink120`,
  };
}

/**
 * Consult the atlas about ONE parameter.
 *
 * Throws for an undocumented parameter. That is the point: a caller that cannot consult must not
 * assign, and a silent empty record would let it.
 */
export function consult(runtimeId, parameterName, { intendsMarketBinding = false } = {}) {
  const r = loadGuidance().runtimes?.[runtimeId];
  if (!r) throw new Error(`the atlas documents no runtime "${runtimeId}"`);
  const entry = r.parameters.find((p) => p.name === parameterName);
  if (!entry) {
    throw new Error(
      `ATLAS_HAS_NO_ENTRY for ${runtimeId}.${parameterName}. ` +
      `Documented parameters: ${r.parameters.map((p) => p.name).join(", ")}. ` +
      "A parameter the atlas has not measured must not be assigned from its schema bounds.",
    );
  }

  /** Gather a facet from every form the atlas records it in. Absent everywhere is an explicit gap. */
  const facet = (name) => {
    const found = {};
    for (const key of ATLAS_FACET_SOURCES[name]) if (entry[key] !== undefined) found[key] = entry[key];
    const keys = Object.keys(found);
    if (keys.length === 0) {
      return {
        measured: false,
        reason: `the atlas records none of ${ATLAS_FACET_SOURCES[name].join(", ")} for this parameter`,
      };
    }
    return { measured: true, sources: keys, ...found };
  };

  const record = {
    runtimeId,
    parameter: entry.name,
    visibleEffect: facet("visibleEffect"),
    structuralEffect: entry.structuralEffect ?? null,
    lowHighBehaviour: facet("lowHighBehaviour"),
    interactions: facet("interactions"),
    failureMode: facet("failureMode"),
    safeExpressiveRange: deriveSafeRange(entry),
    marketBindingSuitability: facet("marketBindingSuitability"),
    evidence: entry.evidence ?? null,
  };

  const decisive = [...ATLAS_DECISIVE_FACETS, ...(intendsMarketBinding ? ["marketBindingSuitability"] : [])];
  const refused = decisive.filter((f) => record[f]?.measured === false);
  if (refused.length) {
    throw new Error(
      `ATLAS_CANNOT_ADVISE on ${runtimeId}.${parameterName}: no measurement of ${refused.join(", ")}. ` +
      (refused.includes("marketBindingSuitability")
        ? "This parameter was asked about as a market binding and the atlas never measured whether it is fit to carry one."
        : "A parameter whose visual role was never measured must not be assigned."),
    );
  }
  record.unmeasuredFacets = ATLAS_CONSULTATION_FACETS.filter((f) => record[f]?.measured === false);
  return Object.freeze(record);
}

/**
 * A recorded consultation session.
 *
 * WHY RECORDED. `AUTHOR_USES_RUNTIME_PARAMETER_ATLAS=YES` is worthless as an assertion — every
 * author would assert it. The session collects what was actually looked up, and the acceptance
 * receipt carries the list, so the claim is derived from behaviour. An author that sets a
 * parameter it never consulted is visible as a parameter in the config with no row here.
 */
export function createAtlasSession({ runtimeId, observedCodeHashes = null } = {}) {
  const freshness = observedCodeHashes ? assertAtlasFresh(observedCodeHashes) : { fresh: "UNVERIFIED" };
  const consultations = [];
  return {
    runtimeId,
    freshness,
    consult(parameterName, opts = {}) {
      const rec = consult(runtimeId, parameterName, opts);
      consultations.push({
        parameter: rec.parameter,
        intendsMarketBinding: Boolean(opts.intendsMarketBinding),
        unmeasuredFacets: rec.unmeasuredFacets,
      });
      return rec;
    },
    laws: () => crossRuntimeLaws(),
    loudness: () => loudnessRanking(runtimeId),
    quickRef: () => quickReference(runtimeId),
    capability: () => capabilityStatement(runtimeId),
    /** What was consulted, in order, for the receipt. */
    record() {
      return {
        runtimeId,
        atlasGuidanceSha256: atlasProvenance().guidanceSha256,
        atlasRuntimeCodeHash: atlasProvenance().runtimeCodeHash?.[runtimeId]?.codeHash ?? null,
        freshness,
        consultedParameters: consultations.map((c) => c.parameter),
        consultationCount: consultations.length,
        facetsPerConsultation: ATLAS_CONSULTATION_FACETS,
        // HONEST, NOT FLATTERING. Where the atlas measured nothing, the receipt says so rather
        // than letting a full consultation list imply a fully evidenced choice.
        unmeasuredFacets: consultations
          .filter((c) => c.unmeasuredFacets.length)
          .map((c) => ({ parameter: c.parameter, facets: c.unmeasuredFacets })),
        marketBindingConsultations: consultations.filter((c) => c.intendsMarketBinding).map((c) => c.parameter),
      };
    },
  };
}
