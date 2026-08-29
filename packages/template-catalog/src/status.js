// SPDX-License-Identifier: MIT
// ================================================================================================
// THE WAVE-1 TEMPLATE STATUS MODEL — ONE DECLARATION. EVERYTHING ELSE IN THIS REPOSITORY DERIVES.
// ================================================================================================
//
// WHAT A "STATUS" IS HERE, AND WHAT IT IS NOT
// ------------------------------------------
// A status answers ONE question: **how far did this template get through visual review?** It is a
// property of the ARTWORK and of the judgement passed on it. It is emphatically NOT:
//
//   * a launchability claim. Whether the runtime a template belongs to can be bound by a launch is
//     a PER-CHAIN fact that only a live read of `ArtRuntimeRegistryV1` can answer, on the day you
//     ask. Nothing in this file may be consulted to permit a launch, and `assertNoLaunchabilityClaim`
//     below refuses any entry that tries. See `../../launch-sdk/src/capabilities.js`.
//   * a quality SCORE. There is no number here and there will not be one. The review that produced
//     these verdicts deliberately kept its two axes apart (seed diversity, market response) and
//     refused to merge them into a single figure, because the two failure modes look nothing alike
//     and a mediocre pass costs more than a harsh fail. A rank invites exactly the averaging the
//     review refused.
//
// THE FOUR STATES
// ---------------
//   SHIP          the only tier a default catalog shows and the only tier an autonomous agent may
//                 select. Strong on BOTH axes.
//   EXPERIMENTAL  reviewed "ship with caveat": a real, named weakness that a creator must see
//                 before choosing it. Kept, never deleted. Hidden unless explicitly asked for.
//   HELD          reviewed "hold": one axis is good and the other is not, or one of the three
//                 market states does no work. Kept, never deleted. Hidden unless explicitly asked for.
//   REJECTED      reviewed "reject". Recorded so the classification is COMPLETE and auditable, and
//                 never offered — not in the default catalog, not behind the advanced flag, and
//                 never to an agent.
//
// WHY REJECTED IS RECORDED RATHER THAN DELETED. A tier list that omits its failures cannot be
// checked: "the remainder is rejected" is only a verifiable statement if the remainder is written
// down. It also stops a rejected template being silently re-proposed under the same name later.
//
// ------------------------------------------------------------------------------------------------
// THE THING THIS FILE EXISTS TO MAKE IMPOSSIBLE: PROMOTION BY MAINTAINER JUDGEMENT
// ------------------------------------------------------------------------------------------------
// `status` IS NOT A FIELD. It is DERIVED from the review ledger, which is append-only evidence.
// There is no `status:` property to edit, no setter, and no argument anywhere in this package that
// takes a status from a caller and stores it.
//
// So the only way a template becomes SHIP is for a review record to say SHIP about it, and
// `appendReview` refuses a record that is not a genuinely new review: same document digest, same
// review id, a verdict upgraded without the four artifacts, or an attestation of the form "the
// maintainer looked at it again and it is fine". The four artifacts are the owner's rule and they
// are checked as DATA, not asserted in prose:
//
//   1. CONTAINED_FIX                      — the change is scoped to the template's own config.
//   2. CONFIG_WITHIN_FINAL_RUNTIME_BOUNDS — it still validates against the runtime's final bounds.
//   3. REGENERATED_SHEET                  — the contact sheet was rendered again from that config.
//   4. NEW_BLIND_REVIEW_VERDICT_SHIP      — a NEW blind review, on that new sheet, returned SHIP.
//
// A promotion missing any one of them is refused by name. A promotion whose "new" review is the old
// one under a new id is refused by digest. This is the whole mechanism, and it is why the ledger
// carries document digests rather than dates: a date is a claim, a digest is the document.
// ================================================================================================

/** The four internal states. Ordered strongest-first; the order is load-bearing for display. */
export const TEMPLATE_STATUSES = Object.freeze(["SHIP", "EXPERIMENTAL", "HELD", "REJECTED"]);

/** The verdicts a visual review may return. One-to-one with the statuses, and not the same words. */
export const REVIEW_VERDICTS = Object.freeze(["SHIP", "SHIP_WITH_CAVEAT", "HOLD", "REJECT"]);

/**
 * The ONLY mapping from a review verdict to a catalog status.
 *
 * Kept as a separate vocabulary from the verdicts on purpose: "SHIP WITH CAVEAT" is what a reviewer
 * wrote about a picture, "EXPERIMENTAL" is what a creator is shown. Collapsing them would let a
 * catalog word drift away from the verdict it is supposed to be reporting.
 */
export const VERDICT_TO_STATUS = Object.freeze({
  SHIP: "SHIP",
  SHIP_WITH_CAVEAT: "EXPERIMENTAL",
  HOLD: "HELD",
  REJECT: "REJECTED",
});

/** Shown by `relics templates` with no flags, and by every default catalog surface. */
export const DEFAULT_CATALOG_STATUSES = Object.freeze(["SHIP"]);

/**
 * Revealed ONLY by an explicit advanced flag (`relics templates --experimental`).
 *
 * REJECTED is deliberately not in this list. The flag is for a creator who wants to see work that
 * did not clear the bar, WITH its named weakness attached; it is not a way to reach material a
 * review refused outright. A flag that reveals everything is a flag that reveals nothing.
 */
export const ADVANCED_FLAG_STATUSES = Object.freeze(["EXPERIMENTAL", "HELD"]);

/** Never offered as a choice on any surface, with or without a flag. */
export const NEVER_OFFERED_STATUSES = Object.freeze(["REJECTED"]);

/**
 * What an AUTONOMOUS agent may select. SHIP, and nothing else, ever.
 *
 * This is not the same question as what a human may be SHOWN. A human choosing an EXPERIMENTAL
 * template has read its caveat and accepted it; an agent matching on a semantic description has
 * read nothing, and the caveats in this wave are precisely the things a description cannot carry —
 * "recovery duplicates stress", "every token is a centred disc", "one seed barely moves". An agent
 * would pick those templates BECAUSE the prose fits, which is the failure.
 */
export const AUTONOMOUS_SELECTABLE_STATUSES = Object.freeze(["SHIP"]);

/** The four artifacts a promotion to SHIP requires. Order is the order they must happen in. */
export const PROMOTION_REQUIREMENTS = Object.freeze([
  "CONTAINED_FIX",
  "CONFIG_WITHIN_FINAL_RUNTIME_BOUNDS",
  "REGENERATED_SHEET",
  "NEW_BLIND_REVIEW_VERDICT_SHIP",
]);

const SHA256_RE = /^[0-9a-f]{64}$/;
const TEMPLATE_ID_RE = /^[A-Z][A-Z0-9_]{2,63}\/[a-z][a-z0-9-]{1,31}$/;

// ------------------------------------------------------------------------------------------------
// THE REVIEW LEDGER — append-only evidence. The status of every template is read out of this.
// ------------------------------------------------------------------------------------------------
//
// `blindCodeSource` is not decoration. The review named its subjects by opaque code because the
// reviewer never saw a template name, so recovering the mapping afterwards is its own act with its
// own reliability, and the three values say which one produced each row:
//
//   CONTENT_HASH — every PNG under the review's material was hashed against every rendered contact
//                  sheet and matched exactly one. Not a guess.
//   ELIMINATION  — the code was not hash-recovered, but it is the only code of its verdict left
//                  once the hash-recovered ones are removed, and the template is the only template
//                  of that verdict left. Sound, and weaker than a hash.
//   null         — not recovered. Published as null rather than inferred; an unrecovered code is a
//                  thing nobody measured, and writing a plausible one would make it unfalsifiable.
//
// The verdicts themselves are the frozen owner decision and do not depend on the code mapping.

/** @type {readonly Readonly<ReviewRecord>[]} */
export const REVIEW_LEDGER = Object.freeze([
  Object.freeze({
    reviewId: "WAVE1-BLIND-FINAL-2026-08-28",
    method: "BLIND_VISUAL",
    date: "2026-08-28",
    subjects: 37,
    /** sha256 of the review document. The document itself is an internal record and is not published here. */
    documentSha256: "e3437d33e5a22cf88171637d00c787ec7600a68779166ad4126fd708991972a8",
    /** The commit the classification was frozen at by owner decision. */
    frozenAt: "29ee2e8a63402943ff91ab9e4da4d958dd01ef9e",
    /** Present on every record after the first. The first review is not a promotion. */
    promotionEvidence: null,
    verdicts: Object.freeze({
      // ---- SHIP (7) ----------------------------------------------------------------------------
      "GEOMETRIC_RECURSION_V1/dendron": { verdict: "SHIP", blindCode: "T-13", blindCodeSource: "CONTENT_HASH" },
      "GEOMETRIC_RECURSION_V1/compass": { verdict: "SHIP", blindCode: "T-19", blindCodeSource: "CONTENT_HASH" },
      "GEOMETRIC_RECURSION_V1/cairn": { verdict: "SHIP", blindCode: "T-25", blindCodeSource: "CONTENT_HASH" },
      "VECTOR_COMPOSITION_V1/reliquary": { verdict: "SHIP", blindCode: "T-18", blindCodeSource: "CONTENT_HASH" },
      "VECTOR_COMPOSITION_V1/alluvium": { verdict: "SHIP", blindCode: "T-29", blindCodeSource: "CONTENT_HASH" },
      "PIXEL_GRID_V1/idol": { verdict: "SHIP", blindCode: "T-20", blindCodeSource: "CONTENT_HASH" },
      "CELLULAR_SYSTEM_V1/crux": { verdict: "SHIP", blindCode: "T-33", blindCodeSource: "ELIMINATION" },

      // ---- SHIP WITH CAVEAT -> EXPERIMENTAL (4) ------------------------------------------------
      "CELLULAR_SYSTEM_V1/aureole": { verdict: "SHIP_WITH_CAVEAT", blindCode: "T-28", blindCodeSource: "CONTENT_HASH" },
      "VECTOR_COMPOSITION_V1/armillary": { verdict: "SHIP_WITH_CAVEAT", blindCode: null, blindCodeSource: null },
      "VECTOR_COMPOSITION_V1/tessera": { verdict: "SHIP_WITH_CAVEAT", blindCode: null, blindCodeSource: null },
      "PIXEL_GRID_V1/sigil": { verdict: "SHIP_WITH_CAVEAT", blindCode: null, blindCodeSource: null },

      // ---- HOLD -> HELD (6) --------------------------------------------------------------------
      "CELLULAR_SYSTEM_V1/accretion": { verdict: "HOLD", blindCode: "T-06", blindCodeSource: "CONTENT_HASH" },
      "PARTICLE_FLOW_V1/anvil": { verdict: "HOLD", blindCode: "T-10", blindCodeSource: "CONTENT_HASH" },
      "PIXEL_GRID_V1/ossuary": { verdict: "HOLD", blindCode: "T-36", blindCodeSource: "CONTENT_HASH" },
      "PIXEL_GRID_V1/beacon": { verdict: "HOLD", blindCode: "T-37", blindCodeSource: "CONTENT_HASH" },
      "TOPOGRAPHY_FIELD_V1/faultline": { verdict: "HOLD", blindCode: null, blindCodeSource: null },
      "GEOMETRIC_RECURSION_V1/lacuna": { verdict: "HOLD", blindCode: null, blindCodeSource: null },

      // ---- REJECT -> REJECTED (18) — the remainder, written down so "the remainder" is checkable -
      "CELLULAR_SYSTEM_V1/varve": { verdict: "REJECT", blindCode: "T-16", blindCodeSource: "CONTENT_HASH" },
      "PIXEL_GRID_V1/patina": { verdict: "REJECT", blindCode: "T-09", blindCodeSource: "CONTENT_HASH" },
      "TYPOGRAPHIC_GLYPH_V1/ledger": { verdict: "REJECT", blindCode: "T-23", blindCodeSource: "CONTENT_HASH" },
      "TYPOGRAPHIC_GLYPH_V1/stele": { verdict: "REJECT", blindCode: "T-08", blindCodeSource: "CONTENT_HASH" },
      "GRAPH_NETWORK_V1/starchart": { verdict: "REJECT", blindCode: "T-34", blindCodeSource: "CONTENT_HASH" },
      "GRAPH_NETWORK_V1/thread": { verdict: "REJECT", blindCode: "T-35", blindCodeSource: "CONTENT_HASH" },
      "PARTICLE_FLOW_V1/thurible": { verdict: "REJECT", blindCode: "T-14", blindCodeSource: "CONTENT_HASH" },
      "PARTICLE_FLOW_V1/strata": { verdict: "REJECT", blindCode: "T-22", blindCodeSource: "CONTENT_HASH" },
      "PARTICLE_FLOW_V1/siltbloom": { verdict: "REJECT", blindCode: "T-02", blindCodeSource: "CONTENT_HASH" },
      "GRAPH_NETWORK_V1/orrery": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
      "GRAPH_NETWORK_V1/phyllotaxis": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
      "GRAPH_NETWORK_V1/reliquiae": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
      "TOPOGRAPHY_FIELD_V1/archipelago": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
      "TOPOGRAPHY_FIELD_V1/cordillera": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
      "TOPOGRAPHY_FIELD_V1/soundings": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
      "TYPOGRAPHIC_GLYPH_V1/cartouche": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
      "TYPOGRAPHIC_GLYPH_V1/sigil": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
      "TYPOGRAPHIC_GLYPH_V1/specimen": { verdict: "REJECT", blindCode: null, blindCodeSource: null },
    }),
  }),

  // ----------------------------------------------------------------------------------------------
  // THE FINAL WAVE-1 REVIEW. Five templates were REPAIRED after the review above, and a second
  // blind reviewer — who saw none of the first review and none of the source — looked at the
  // repaired renders. Four of the five moved DOWN.
  //
  // A DOWNGRADE NEEDS NO PROMOTION EVIDENCE, and that asymmetry is the point of the four artifacts
  // rather than an omission in them: the artifacts exist to stop a template being talked UP without
  // a new blind verdict. Being talked DOWN by one is the mechanism working. `promotionEvidence` is
  // therefore null here and `validateLedger` never asks for it, because no verdict in this record
  // improves on the one before it.
  //
  // `GEOMETRIC_RECURSION_V1/compass` appears with SHIP -> SHIP. That is not a promotion and not a
  // no-op: it is the second blind verdict on a DIFFERENT configuration, and recording it is what
  // makes the standing verdict traceable to the review that actually saw today's compass.
  //
  // The two templates the repairs did not touch — `VECTOR_COMPOSITION_V1/alluvium` and
  // `PIXEL_GRID_V1/idol` — are deliberately ABSENT from THIS record. Their render inputs were shown
  // to be unmoved, so no new review was run on them here and none is claimed; `latestVerdict` walks
  // back to the record above for both. An absent row is "not re-reviewed"; a row restating the old
  // verdict under a new review id would be a review nobody ran. (`idol` did move later, and the
  // record BELOW is the review that saw it. `alluvium`'s standing verdict is still the first one.)
  //
  // BLIND CODES ARE RECOVERED BY CONTENT HASH, not from the set's own manifest. Each B-code's
  // `SEEDS-thumb120.png` and `STATES.png` were hashed and matched against the sheets rendered from
  // each candidate's post-repair configuration; every code matched exactly one template.
  Object.freeze({
    reviewId: "WAVE1-FINAL-BLIND-2026-08-29",
    method: "BLIND_VISUAL",
    date: "2026-08-29",
    subjects: 5,
    /** sha256 of `WAVE1_FINAL_BLIND_REVIEW.md`. The document is an internal record and is not published here. */
    documentSha256: "2017f70d10676b93aad6ed69e383c4b128ee1fa8ccfbaed06596b5724c44c4b3",
    frozenAt: "91f7061af1f94435d41ababdf0cd4ca9632aa76a",
    /** Nothing here is a promotion. Every verdict is a hold, a downgrade, or a restatement. */
    promotionEvidence: null,
    verdicts: Object.freeze({
      "GEOMETRIC_RECURSION_V1/compass": { verdict: "SHIP", blindCode: "B-04", blindCodeSource: "CONTENT_HASH" },
      "VECTOR_COMPOSITION_V1/reliquary": { verdict: "SHIP_WITH_CAVEAT", blindCode: "B-02", blindCodeSource: "CONTENT_HASH" },
      "GEOMETRIC_RECURSION_V1/cairn": { verdict: "HOLD", blindCode: "B-01", blindCodeSource: "CONTENT_HASH" },
      "GEOMETRIC_RECURSION_V1/dendron": { verdict: "HOLD", blindCode: "B-03", blindCodeSource: "CONTENT_HASH" },
      "CELLULAR_SYSTEM_V1/crux": { verdict: "REJECT", blindCode: "B-05", blindCodeSource: "CONTENT_HASH" },
    }),
  }),

  // ----------------------------------------------------------------------------------------------
  // THE IDOL FRAME REPAIR. One template, one candidate, one verdict — and it takes the last SHIP
  // template of a whole runtime with it.
  //
  // `PIXEL_GRID_V1/idol` was the one template the record above deliberately did NOT re-review: its
  // render inputs were unmoved at the time, so no verdict was claimed for it. It moved afterwards.
  // The frame layer was repaired, the sheets were rendered again from the repaired configuration,
  // and a third blind reviewer — who saw neither of the two reviews above, no source, no manifest
  // and no name — returned HOLD on the repaired art.
  //
  // AGAIN, A DOWNGRADE OWES NOTHING. SHIP -> HOLD is the mechanism working, so `promotionEvidence`
  // is null and `validateLedger` does not ask for it. Nothing here is talked up.
  //
  // WHY THE TEMPLATE IS STUCK RATHER THAN UNLUCKY, recorded because both halves are needed to see
  // it: PRE-repair, idol failed the structural role gate — a layer that drew nothing at any market
  // state. POST-repair, it fails blind review — a frame topologically identical on every seed, so
  // the seed diversity that passes in a quiet market is spent by stress and erased by recovery.
  // Both honest paths end at HOLD. That is a template-curation problem for a later wave, and it is
  // NOT a finding about `PIXEL_GRID_V1` itself: the runtime's source was never in question, it
  // renders, it validates, and it stays inside its cost budget.
  //
  // AND ONE FACT FOR THE ARCHIVE, because a reviewer asked it and it has an answer. The reviewer
  // could not tell from the sheets whether the coarse block mosaic was the art or an artifact of
  // how the contact sheets were produced, and said the deciding finding would weaken if the shipped
  // art were finer. It is not finer: idol's art is natively a 16x16 grid (`viewBox="0 0 16 16"`),
  // so the mosaic IS the medium. That confirms the deciding finding rather than weakening it —
  // surround texture has no finer register to survive into at 120px.
  //
  // `B-01` HERE IS NOT `B-01` ABOVE. Blind codes are per SET, assigned fresh each time, so this
  // one is a different set's first item and resolves to `PIXEL_GRID_V1/idol` while the record above
  // resolves its own `B-01` to `GEOMETRIC_RECURSION_V1/cairn`. A code is only meaningful beside its
  // `reviewId`, which is why every recovery record is keyed by set.
  Object.freeze({
    reviewId: "IDOL-FRAME-REPAIR-BLIND-2026-08-29",
    method: "BLIND_VISUAL",
    date: "2026-08-29",
    subjects: 1,
    /** sha256 of `IDOL_FRAME_REPAIR_REVIEW.md`. The document is an internal record and is not published here. */
    documentSha256: "ba0e3ccbf321ac2a7d21eb5297a311e3a0af437ad5641f113d6045e27f9f54da",
    frozenAt: "e3b07afe022f3746223dc6028c3dcb8691d9ea75",
    /** A hold is not a promotion. */
    promotionEvidence: null,
    verdicts: Object.freeze({
      "PIXEL_GRID_V1/idol": { verdict: "HOLD", blindCode: "B-01", blindCodeSource: "CONTENT_HASH" },
    }),
  }),
]);

/**
 * Every template the wave classified, in a stable order. DERIVED from the ledger — there is no
 * second list to fall out of step with it.
 */
export function allTemplateIds(ledger = REVIEW_LEDGER) {
  const seen = new Set();
  for (const record of ledger) for (const id of Object.keys(record.verdicts)) seen.add(id);
  return Object.freeze([...seen].sort());
}

/**
 * The verdict standing for `templateId`, from the LATEST record that mentions it, with the record
 * it came from. Returns null for an id no review has ever judged — which is not the same as
 * REJECTED and must never be rendered as one.
 */
export function latestVerdict(templateId, ledger = REVIEW_LEDGER) {
  for (let i = ledger.length - 1; i >= 0; i--) {
    const entry = ledger[i].verdicts[templateId];
    if (entry) return { ...entry, reviewId: ledger[i].reviewId, documentSha256: ledger[i].documentSha256, date: ledger[i].date };
  }
  return null;
}

/**
 * THE STATUS. Derived, never stored.
 *
 * An unjudged template is `UNREVIEWED`, which is deliberately NOT one of the four states: it is the
 * absence of a judgement, and the four states are all judgements. It is refused everywhere a status
 * is required, by the same code path that refuses REJECTED.
 */
export function templateStatus(templateId, ledger = REVIEW_LEDGER) {
  const v = latestVerdict(templateId, ledger);
  if (!v) return "UNREVIEWED";
  return VERDICT_TO_STATUS[v.verdict] ?? "UNREVIEWED";
}

/** Every template id at `status`, sorted. */
export function templatesWithStatus(status, ledger = REVIEW_LEDGER) {
  return Object.freeze(allTemplateIds(ledger).filter((id) => templateStatus(id, ledger) === status));
}

/** The whole classification as `{ SHIP: [...], EXPERIMENTAL: [...], HELD: [...], REJECTED: [...] }`. */
export function classification(ledger = REVIEW_LEDGER) {
  const out = {};
  for (const s of TEMPLATE_STATUSES) out[s] = templatesWithStatus(s, ledger);
  return Object.freeze(out);
}

/** Visible in the default catalog. */
export function isDefaultVisible(templateId, ledger = REVIEW_LEDGER) {
  return DEFAULT_CATALOG_STATUSES.includes(templateStatus(templateId, ledger));
}

/** Visible only once the advanced flag is passed. Never true for REJECTED or UNREVIEWED. */
export function isAdvancedVisible(templateId, ledger = REVIEW_LEDGER) {
  return ADVANCED_FLAG_STATUSES.includes(templateStatus(templateId, ledger));
}

/**
 * Whether a HUMAN surface may show this template at all, given whether the advanced flag was passed.
 *
 * `advanced` is a boolean the CALLER got from an explicit flag. It is never defaulted to true and
 * there is no environment variable that turns it on: an advanced tier revealed by configuration is
 * an advanced tier revealed by accident.
 */
export function isVisibleToHuman(templateId, { advanced = false } = {}, ledger = REVIEW_LEDGER) {
  if (isDefaultVisible(templateId, ledger)) return true;
  return advanced === true && isAdvancedVisible(templateId, ledger);
}

/**
 * Whether an AUTONOMOUS agent may select this template. No options argument, on purpose: there is
 * no flag, no override and no caller-supplied tier that can widen this, so widening it requires
 * editing this function and failing the tests that name each refused tier.
 */
export function isAutonomouslySelectable(templateId, ledger = REVIEW_LEDGER) {
  return AUTONOMOUS_SELECTABLE_STATUSES.includes(templateStatus(templateId, ledger));
}

// ------------------------------------------------------------------------------------------------
// PROMOTION
// ------------------------------------------------------------------------------------------------

/**
 * Build the review record that promotes templates to SHIP, or throw explaining what is missing.
 *
 * RETURNS A RECORD TO APPEND; it cannot mutate the ledger, because the ledger is frozen. That is
 * intentional: promoting a template is a source change that a reviewer reads, not a call whose
 * effect is invisible in a diff.
 *
 * @param {{reviewId: string, method: string, date: string, documentSha256: string,
 *          promotions: Record<string, {verdict: string, evidence: Record<string, string>}>}} proposal
 */
export function proposePromotion(proposal, ledger = REVIEW_LEDGER) {
  const problems = [];
  const p = proposal ?? {};

  if (typeof p.reviewId !== "string" || p.reviewId.length < 8) problems.push("reviewId is required and must name the review");
  if (ledger.some((r) => r.reviewId === p.reviewId)) problems.push(`reviewId ${JSON.stringify(p.reviewId)} already exists in the ledger; a promotion needs a NEW review, not a re-labelled one`);

  if (typeof p.documentSha256 !== "string" || !SHA256_RE.test(p.documentSha256)) {
    problems.push("documentSha256 is required and must be 64 lowercase hex characters — the digest of the new review document");
  } else if (ledger.some((r) => r.documentSha256 === p.documentSha256)) {
    problems.push("documentSha256 is already in the ledger: this is the SAME review document under a new id. A promotion requires a review that was actually run again.");
  }

  // THE ONE RULE THE OWNER NAMED. A verdict is not enough; the four artifacts must exist and the
  // fourth of them must itself be a blind review returning SHIP.
  if (p.method !== "BLIND_VISUAL") {
    problems.push(`method must be "BLIND_VISUAL" (got ${JSON.stringify(p.method ?? null)}). A template may never be promoted to SHIP by maintainer judgement — the reviewer must not know which template they are looking at.`);
  }

  const promotions = p.promotions ?? {};
  const ids = Object.keys(promotions);
  if (ids.length === 0) problems.push("promotions is empty; a promotion record that promotes nothing is not a promotion");

  for (const id of ids) {
    const current = templateStatus(id, ledger);
    if (current === "SHIP") problems.push(`${id} is already SHIP; nothing to promote`);
    if (current === "UNREVIEWED") problems.push(`${id} has never been reviewed, so there is no verdict to promote from`);
    const entry = promotions[id] ?? {};
    if (entry.verdict !== "SHIP") {
      problems.push(`${id}: the new blind review returned ${JSON.stringify(entry.verdict ?? null)}. Only a verdict of SHIP promotes; anything else leaves the template where it is.`);
    }
    const evidence = entry.evidence ?? {};
    for (const requirement of PROMOTION_REQUIREMENTS) {
      const value = evidence[requirement];
      if (typeof value !== "string" || value.trim().length < 8) {
        problems.push(`${id}: promotion requirement ${requirement} is missing. All four are required: ${PROMOTION_REQUIREMENTS.join(", ")}.`);
      }
    }
    const extra = Object.keys(evidence).filter((k) => !PROMOTION_REQUIREMENTS.includes(k));
    if (extra.length > 0) problems.push(`${id}: unknown promotion evidence key(s) ${extra.join(", ")}. The four requirements are closed; a fifth reason is not a substitute for one of them.`);
  }

  if (problems.length > 0) {
    const err = new Error(`promotion refused:\n  - ${problems.join("\n  - ")}`);
    err.problems = problems;
    throw err;
  }

  return Object.freeze({
    reviewId: p.reviewId,
    method: p.method,
    date: p.date,
    subjects: ids.length,
    documentSha256: p.documentSha256,
    frozenAt: p.frozenAt ?? null,
    promotionEvidence: Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ ...promotions[id].evidence })]))),
    verdicts: Object.freeze(Object.fromEntries(ids.map((id) => [id, { verdict: "SHIP", blindCode: promotions[id].blindCode ?? null, blindCodeSource: promotions[id].blindCodeSource ?? null }]))),
  });
}

/**
 * Validate the ledger itself. Returns the problems; empty means well-formed.
 *
 * Run by the gate. The rules here are the ones a hand edit would break: a status cannot appear
 * without a verdict behind it, a second record cannot reuse a document, and any record after the
 * first that upgrades a verdict must carry the four artifacts for every template it upgrades.
 */
export function validateLedger(ledger = REVIEW_LEDGER) {
  const problems = [];
  if (!Array.isArray(ledger) || ledger.length === 0) return ["the review ledger is empty; every status in this package derives from it, so an empty ledger means the catalog states nothing"];

  const seenIds = new Set();
  const seenDigests = new Set();
  for (const [i, record] of ledger.entries()) {
    if (seenIds.has(record.reviewId)) problems.push(`duplicate reviewId ${record.reviewId}`);
    seenIds.add(record.reviewId);
    if (!SHA256_RE.test(record.documentSha256 ?? "")) problems.push(`${record.reviewId}: documentSha256 must be 64 lowercase hex characters`);
    if (seenDigests.has(record.documentSha256)) problems.push(`${record.reviewId}: reuses the document digest of an earlier record — the same review cannot be counted twice`);
    seenDigests.add(record.documentSha256);

    for (const [id, entry] of Object.entries(record.verdicts)) {
      if (!TEMPLATE_ID_RE.test(id)) problems.push(`${record.reviewId}: ${JSON.stringify(id)} is not a RUNTIME_ID/template-name id`);
      if (!REVIEW_VERDICTS.includes(entry.verdict)) problems.push(`${record.reviewId}/${id}: verdict ${JSON.stringify(entry.verdict)} is not one of ${REVIEW_VERDICTS.join(", ")}`);
      if (entry.blindCode !== null && !["CONTENT_HASH", "ELIMINATION"].includes(entry.blindCodeSource)) {
        problems.push(`${record.reviewId}/${id}: a blindCode must say HOW it was recovered (CONTENT_HASH or ELIMINATION). An unrecovered code is null, never a plausible guess.`);
      }
      if (entry.blindCode === null && entry.blindCodeSource !== null) {
        problems.push(`${record.reviewId}/${id}: blindCodeSource is set but blindCode is null`);
      }
    }

    if (i === 0) continue;
    // Every record after the first is a promotion record and owes the four artifacts for every
    // template whose verdict it improves.
    for (const [id, entry] of Object.entries(record.verdicts)) {
      const before = latestVerdict(id, ledger.slice(0, i));
      if (!before) continue;
      const improved = REVIEW_VERDICTS.indexOf(entry.verdict) < REVIEW_VERDICTS.indexOf(before.verdict);
      if (!improved) continue;
      if (record.method !== "BLIND_VISUAL") problems.push(`${record.reviewId}/${id}: upgraded by a ${record.method} review. Promotion requires a NEW BLIND review.`);
      const evidence = record.promotionEvidence?.[id];
      if (!evidence) {
        problems.push(`${record.reviewId}/${id}: upgraded ${before.verdict} -> ${entry.verdict} with no promotionEvidence. This is promotion by maintainer judgement, which is refused.`);
        continue;
      }
      for (const requirement of PROMOTION_REQUIREMENTS) {
        if (typeof evidence[requirement] !== "string" || evidence[requirement].trim().length < 8) {
          problems.push(`${record.reviewId}/${id}: upgraded without ${requirement}`);
        }
      }
    }
  }
  return problems;
}

/**
 * A status entry may not claim a runtime is registered, active, deployed or launchable ANYWHERE.
 *
 * Same law as `@v4-art-launchpad/runtime-catalog`'s descriptor rule, restated here because this
 * package is the one a creator meets first and would be the most convenient place to put a
 * checked-in `launchable: true`. Those are per-chain facts that change without this file changing.
 */
export function assertNoLaunchabilityClaim(entry) {
  const forbidden = ["launchable", "active", "registered", "deployed", "address", "runtimeAddress", "codeHash", "chains", "chainIds", "chainId"];
  return Object.keys(entry ?? {})
    .filter((k) => forbidden.includes(k))
    .map((k) => `entry declares ${JSON.stringify(k)}, which is a per-chain FACT and not review guidance. Read it live from ArtRuntimeRegistryV1; an entry that answers it is a stale document authorising a launch.`);
}
