// SPDX-License-Identifier: MIT
// ================================================================================================
// ART DIRECTION — the step between a brief and a configuration.
//
// WHAT WENT WRONG WITHOUT IT. The author read prose and emitted bytes. Nothing in between was
// written down, so there was no artefact anyone could disagree with before ~150 chain calls had
// been spent: no statement of what the work was meant to look like, no statement of what carries
// identity across seeds, no statement of what the market was supposed to do to it. A critique
// arriving at round 2 had nothing to be measured against except the brief's own adjectives, and
// "monumental" is not a thing a configuration can be checked against. So every round argued about
// the picture instead of about the intent, and the intent silently drifted to wherever the
// parameters happened to land.
//
// The direction is the missing artefact. It is emitted BEFORE any runtime config exists, it is
// hashed, and the hash goes into the acceptance receipt — so "the work matches its direction" is a
// question with a fixed referent rather than a moving one.
//
// ------------------------------------------------------------------------------------------------
// IT IS A TRANSLATION, NOT A RESTATEMENT
// ------------------------------------------------------------------------------------------------
// The twelve fields are deliberately in the vocabulary of the MEDIUM rather than of the brief.
// A brief says "sediment"; the direction says the motif is carried by horizontal banding at
// varying pitch, that identity lives in band count and relative thickness, and that the market
// acts on density rather than colour. That translation is the work this step does, and it is what
// makes the next step possible: a parameter cannot be chosen from "sediment", and it can be chosen
// from "horizontal banding whose count moves with drawdown".
//
// `motifTranslation` is therefore the load-bearing field, and it is the one that must name what
// the runtime will actually DO. The atlas's own instruction — classify every prescribed action
// EXECUTABLE / NEAREST-SUBSTITUTE / REFUSED-BY-MEDIUM — applies here first, before a critique ever
// arrives: a direction that promises something the medium refuses has simply moved the impossible
// commission one step later.
//
// ------------------------------------------------------------------------------------------------
// WHAT THIS FILE REFUSES TO DO
// ------------------------------------------------------------------------------------------------
// It does not generate a config, hold a parameter name, or import a codec. A direction that
// mentioned `sizeMax` would be a config with extra steps, and the ordering that makes this
// valuable — intent fixed before parameters — would be gone. `author.js` reads the direction and
// the atlas together; neither of them alone decides a byte.
// ================================================================================================

import { createHash } from "node:crypto";

import { detectImpossibleDemands } from "./capabilities.js";

/**
 * The twelve fields. Every one is REQUIRED, and the requirement is enforced.
 *
 * An optional field on a document like this is a field that is always absent: the first author to
 * find it inconvenient omits it, and the reviewer downstream is left comparing against a blank.
 */
export const DIRECTION_FIELDS = Object.freeze([
  "medium",
  "motifTranslation",
  "composition",
  "focalHierarchy",
  "density",
  "negativeSpace",
  "paletteIntent",
  "rhythm",
  "variationStrategy",
  "marketTransformation",
  "identityAnchors",
  "thumbnailIntent",
]);

/** What each field must answer. Shipped with the document so a reader never has to guess. */
export const DIRECTION_FIELD_QUESTIONS = Object.freeze({
  medium: "Which of the two Wave-1 media is this, and what does that mechanically commit the work to?",
  motifTranslation: "The brief's subject, restated as something the medium can construct. Name the construction, not the noun.",
  composition: "How the frame is used: what occupies the centre, how far the work extends, what the edges do.",
  focalHierarchy: "What dominates, what is secondary, what is texture. If nothing dominates, say so and say why that is deliberate.",
  density: "How much of the frame carries ink, as an intention, at browse size.",
  negativeSpace: "Where the emptiness is and what it is doing. Emptiness that is merely left over is not negative space.",
  paletteIntent: "What the colour is for. How many colours actually do work, and what the ground is doing under them.",
  rhythm: "Repetition and interval: what repeats, how regularly, and where the regularity breaks.",
  variationStrategy: "What differs between two tokens of this collection, in the order a viewer would notice it.",
  marketTransformation: "What the market changes, in what direction, and how a viewer would SEE it at 120px.",
  identityAnchors: "What stays constant across every seed and every market state, so the collection reads as one project.",
  thumbnailIntent: "What survives at 120px when the detail does not. This is the size the work is actually seen at.",
});

/**
 * The direction's own honesty check.
 *
 * A direction is a promise, and the two ways it can be a bad promise are being EMPTY and being
 * IMPOSSIBLE. Emptiness is checked here; impossibility was checked at admission and is checked
 * again against the concessions the admission recorded, because a direction is free to quietly
 * re-promise the very thing the catalog refused.
 */
export const DIRECTION_FIELD_FLOOR = Object.freeze({ minChars: 40, minWords: 8 });

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Canonical JSON: sorted keys, so a hash is stable across authors and orderings. */
export function canonicalDirection(direction) {
  const ordered = {};
  for (const f of DIRECTION_FIELDS) ordered[f] = direction[f];
  return JSON.stringify(ordered);
}

export function directionHash(direction) {
  return sha256(canonicalDirection(direction));
}

/**
 * Validate an art direction.
 *
 * `admission` is the record from `admitBrief`. Passing it is optional only because a direction may
 * legitimately be validated in isolation (a test, a re-read); when it IS passed, the concession
 * check runs, and that check is the one that catches a direction re-promising a refused capability.
 */
export function validateDirection(direction, { admission = null } = {}) {
  const problems = [];
  if (!direction || typeof direction !== "object") {
    return { ok: false, problems: ["the direction is not an object"], hash: null };
  }

  for (const field of DIRECTION_FIELDS) {
    const value = direction[field];
    if (typeof value !== "string") { problems.push(`${field}: missing`); continue; }
    const words = value.trim().split(/\s+/).filter(Boolean).length;
    if (value.trim().length < DIRECTION_FIELD_FLOOR.minChars || words < DIRECTION_FIELD_FLOOR.minWords) {
      problems.push(`${field}: ${value.trim().length} chars / ${words} words, below the floor of ${DIRECTION_FIELD_FLOOR.minChars}/${DIRECTION_FIELD_FLOOR.minWords} — a field this short is a placeholder`);
    }
  }

  const unknown = Object.keys(direction).filter((k) => !DIRECTION_FIELDS.includes(k) && !k.startsWith("$"));
  if (unknown.length) problems.push(`unknown field(s): ${unknown.join(", ")}. The twelve are closed; a thirteenth is invisible to every reader downstream.`);

  // NO PARAMETER NAMES. The whole value of this step is that intent is fixed before parameters,
  // and a direction naming `sizeMax` has skipped the step it exists to be.
  const parameterish = /\b(sizeMax|spreadMax|countM(in|ax)|depthM(in|ax)|contraction|paletteIx|groundIx|ruleSet|shapeSet|symSet|fieldCount|ruleCount|primitive\s*=|layout\s*=)\b/;
  for (const field of DIRECTION_FIELDS) {
    if (typeof direction[field] === "string" && parameterish.test(direction[field])) {
      problems.push(`${field}: names a runtime parameter. The direction says what the work is; the atlas and the author decide which parameter delivers it.`);
    }
  }

  if (admission) {
    if (admission.admitted !== true) {
      problems.push(`the admission for this brief was ${admission.outcome}; a direction must not exist for a brief that was not admitted`);
    }
    // A CONCESSION MAY NOT BE QUIETLY RE-PROMISED. Admission recorded that (say) curves are not
    // available on the elected runtime; a direction whose composition promises sweeping curves has
    // reintroduced the impossible commission at the next layer down.
    const conceded = (admission.concessions ?? []).map((c) => c.id);
    if (conceded.length) {
      const text = DIRECTION_FIELDS.map((f) => direction[f]).filter((v) => typeof v === "string").join(" \n ");
      // Reuse the admission vocabulary rather than a second set of patterns: one detector, so the
      // direction is held to exactly the standard the brief was.
      for (const d of detectImpossibleDemands(text)) {
        if (conceded.includes(d.id)) {
          problems.push(`the direction re-promises "${d.what}", which admission recorded as a concession this runtime cannot make`);
        }
      }
    }
  }

  return { ok: problems.length === 0, problems, hash: problems.length === 0 ? directionHash(direction) : null };
}

/**
 * The record that goes into the receipt.
 *
 * `createdBefore` is not decoration. `ART_DIRECTION_CREATED_BEFORE_CONFIG=YES` has to be DERIVED
 * from something, and the thing it is derived from is this: the direction records the brief hash
 * it was written from and carries no config hash, and the acceptance receipt records the config
 * hash alongside it. A direction written after the fact would have to forge an ordering that two
 * independent hashes and a timestamp already fix.
 */
export function directionRecord({ direction, briefSha256, admission, runtimeId, templateId }) {
  const validation = validateDirection(direction, { admission });
  if (!validation.ok) {
    throw new Error(`ART_DIRECTION_INVALID:\n  ${validation.problems.join("\n  ")}`);
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: "ART_DIRECTION",
    createdAt: new Date().toISOString(),
    briefSha256,
    admissionOutcome: admission?.outcome ?? null,
    runtimeId,
    templateId,
    directionHash: validation.hash,
    direction: Object.freeze({ ...direction }),
    fields: DIRECTION_FIELDS,
    // Stated so a reader of the receipt does not have to infer it: this document holds no
    // parameter, no byte and no config hash, which is what makes it a BEFORE artefact.
    containsRuntimeConfig: false,
  });
}
