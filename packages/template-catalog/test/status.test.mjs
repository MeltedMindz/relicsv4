// SPDX-License-Identifier: MIT
// The status model: derived from the review ledger, and unpromotable by judgement.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVANCED_FLAG_STATUSES,
  AUTONOMOUS_SELECTABLE_STATUSES,
  DEFAULT_CATALOG_STATUSES,
  NEVER_OFFERED_STATUSES,
  PROMOTION_REQUIREMENTS,
  REVIEW_LEDGER,
  REVIEW_VERDICTS,
  TEMPLATE_STATUSES,
  VERDICT_TO_STATUS,
  allTemplateIds,
  classification,
  isAdvancedVisible,
  isDefaultVisible,
  isVisibleToHuman,
  latestVerdict,
  proposePromotion,
  templateStatus,
  templatesWithStatus,
  validateLedger,
} from "../src/status.js";

test("the ledger is well-formed", () => {
  assert.deepEqual(validateLedger(), []);
});

test("the Wave-1 classification is 3 / 5 / 8 / 19, and the tiers partition the whole wave", () => {
  const c = classification();
  assert.equal(c.SHIP.length, 3);
  assert.equal(c.EXPERIMENTAL.length, 5);
  assert.equal(c.HELD.length, 8);
  assert.equal(c.REJECTED.length, 19);
  assert.equal(allTemplateIds().length, 35);
  assert.equal(TEMPLATE_STATUSES.reduce((n, s) => n + c[s].length, 0), 35);
  // No template appears in two tiers.
  const seen = new Set();
  for (const s of TEMPLATE_STATUSES) for (const id of c[s]) { assert.ok(!seen.has(id), `${id} is in two tiers`); seen.add(id); }
});

test("the final SHIP set is exactly the three the blind reviews left standing", () => {
  assert.deepEqual([...templatesWithStatus("SHIP")].sort(), [
    "GEOMETRIC_RECURSION_V1/compass",
    "PIXEL_GRID_V1/idol",
    "VECTOR_COMPOSITION_V1/alluvium",
  ]);
});

test("CELLULAR_SYSTEM_V1 has ZERO SHIP templates, and its templates are still classified", () => {
  const mine = allTemplateIds().filter((id) => id.startsWith("CELLULAR_SYSTEM_V1/"));
  assert.ok(mine.length >= 4, `only ${mine.length} cellular templates in the ledger`);
  assert.deepEqual(mine.filter((id) => templateStatus(id) === "SHIP"), []);
  // Departure is not deletion. Every one of them still carries a verdict.
  for (const id of mine) assert.notEqual(templateStatus(id), "UNREVIEWED", id);
});

test("the final review DOWNGRADED four and promoted none, and needed no promotion evidence to do it", () => {
  const final = REVIEW_LEDGER.at(-1);
  assert.equal(final.reviewId, "WAVE1-FINAL-BLIND-2026-08-29");
  assert.equal(final.method, "BLIND_VISUAL");
  assert.equal(final.promotionEvidence, null, "a record that promotes nothing must not carry promotion evidence");

  const before = REVIEW_LEDGER.slice(0, -1);
  let downgrades = 0;
  for (const [id, entry] of Object.entries(final.verdicts)) {
    const prior = latestVerdict(id, before);
    assert.ok(prior, `${id} appears in the final review with no earlier verdict to move from`);
    const moved = REVIEW_VERDICTS.indexOf(entry.verdict) - REVIEW_VERDICTS.indexOf(prior.verdict);
    assert.ok(moved >= 0, `${id} was UPGRADED by a record carrying no promotion evidence`);
    if (moved > 0) downgrades++;
  }
  assert.equal(downgrades, 4);
  // And the ledger accepts it: a downgrade owes nothing, which is the whole asymmetry.
  assert.deepEqual(validateLedger(), []);
});

test("the two templates the repairs did not touch were NOT re-reviewed, and say so", () => {
  const final = REVIEW_LEDGER.at(-1);
  for (const id of ["VECTOR_COMPOSITION_V1/alluvium", "PIXEL_GRID_V1/idol"]) {
    assert.equal(final.verdicts[id], undefined, `${id} carries a verdict from a review that did not look at it`);
    assert.equal(templateStatus(id), "SHIP");
    // Their standing verdict comes from the FIRST review, and latestVerdict walks back to it.
    assert.equal(latestVerdict(id).reviewId, REVIEW_LEDGER[0].reviewId);
  }
  // compass was re-reviewed, and its standing verdict is the SECOND one.
  assert.equal(latestVerdict("GEOMETRIC_RECURSION_V1/compass").reviewId, final.reviewId);
});

test("EXPERIMENTAL and HELD are KEPT, never deleted", () => {
  for (const id of [...templatesWithStatus("EXPERIMENTAL"), ...templatesWithStatus("HELD")]) {
    assert.ok(allTemplateIds().includes(id));
    assert.notEqual(templateStatus(id), "UNREVIEWED");
  }
  assert.deepEqual([...templatesWithStatus("EXPERIMENTAL")].sort(), [
    "CELLULAR_SYSTEM_V1/aureole",
    "PIXEL_GRID_V1/sigil",
    "VECTOR_COMPOSITION_V1/armillary",
    "VECTOR_COMPOSITION_V1/reliquary",
    "VECTOR_COMPOSITION_V1/tessera",
  ]);
  assert.deepEqual([...templatesWithStatus("HELD")].sort(), [
    "CELLULAR_SYSTEM_V1/accretion",
    "GEOMETRIC_RECURSION_V1/cairn",
    "GEOMETRIC_RECURSION_V1/dendron",
    "GEOMETRIC_RECURSION_V1/lacuna",
    "PARTICLE_FLOW_V1/anvil",
    "PIXEL_GRID_V1/beacon",
    "PIXEL_GRID_V1/ossuary",
    "TOPOGRAPHY_FIELD_V1/faultline",
  ]);
});

test("status is DERIVED — there is no status field to edit", () => {
  for (const record of REVIEW_LEDGER) {
    for (const entry of Object.values(record.verdicts)) {
      assert.equal(entry.status, undefined, "a ledger entry carries a status; status must be derived from the verdict");
      assert.ok(REVIEW_VERDICTS.includes(entry.verdict));
    }
  }
  assert.deepEqual(Object.keys(VERDICT_TO_STATUS).sort(), [...REVIEW_VERDICTS].sort());
});

test("an unjudged template is UNREVIEWED, which is not REJECTED", () => {
  assert.equal(templateStatus("GEOMETRIC_RECURSION_V1/nosuchtemplate"), "UNREVIEWED");
  assert.ok(!TEMPLATE_STATUSES.includes("UNREVIEWED"));
  assert.equal(isDefaultVisible("GEOMETRIC_RECURSION_V1/nosuchtemplate"), false);
  assert.equal(isAdvancedVisible("GEOMETRIC_RECURSION_V1/nosuchtemplate"), false);
});

test("visibility: SHIP by default, EXPERIMENTAL and HELD only with the flag, REJECTED never", () => {
  assert.deepEqual([...DEFAULT_CATALOG_STATUSES], ["SHIP"]);
  assert.deepEqual([...ADVANCED_FLAG_STATUSES].sort(), ["EXPERIMENTAL", "HELD"]);
  assert.deepEqual([...NEVER_OFFERED_STATUSES], ["REJECTED"]);
  assert.deepEqual([...AUTONOMOUS_SELECTABLE_STATUSES], ["SHIP"]);

  const ship = templatesWithStatus("SHIP")[0];
  const caveat = templatesWithStatus("EXPERIMENTAL")[0];
  const rejected = templatesWithStatus("REJECTED")[0];

  assert.equal(isVisibleToHuman(ship), true);
  assert.equal(isVisibleToHuman(caveat), false, "the advanced tier is visible with no flag");
  assert.equal(isVisibleToHuman(caveat, { advanced: true }), true);
  assert.equal(isVisibleToHuman(rejected, { advanced: true }), false, "the flag revealed a REJECTED template");

  // Only a literal `true` opens it. A truthy string from an environment variable must not.
  for (const truthy of ["1", "true", 1, {}]) {
    assert.equal(isVisibleToHuman(caveat, { advanced: truthy }), false, `advanced: ${JSON.stringify(truthy)} opened the tier`);
  }
});

// ------------------------------------------------------------------------------------------------
// PROMOTION — the rule that may not be shortcut
// ------------------------------------------------------------------------------------------------

const caveatId = () => templatesWithStatus("EXPERIMENTAL")[0];

const goodEvidence = () =>
  Object.fromEntries(PROMOTION_REQUIREMENTS.map((r) => [r, `${r}: recorded against the regenerated sheet`]));

function proposal(overrides = {}) {
  return {
    reviewId: "WAVE1-BLIND-PROMOTION-2026-09-15",
    method: "BLIND_VISUAL",
    date: "2026-09-15",
    documentSha256: "b".repeat(64),
    promotions: { [caveatId()]: { verdict: "SHIP", evidence: goodEvidence() } },
    ...overrides,
  };
}

test("a well-formed promotion is accepted and produces an appendable record", () => {
  const record = proposePromotion(proposal());
  assert.equal(record.verdicts[caveatId()].verdict, "SHIP");
  assert.ok(record.promotionEvidence[caveatId()]);
  // It cannot have mutated the live ledger.
  assert.equal(templateStatus(caveatId()), "EXPERIMENTAL");
});

test("PROMOTION BY MAINTAINER JUDGEMENT IS REFUSED", () => {
  assert.throws(() => proposePromotion(proposal({ method: "MAINTAINER_REVIEW" })), /may never be promoted to SHIP by maintainer judgement/);
  assert.throws(() => proposePromotion(proposal({ method: "SIGHTED_REVIEW" })), /BLIND_VISUAL/);
  assert.throws(() => proposePromotion(proposal({ method: undefined })), /BLIND_VISUAL/);
});

test("each of the four promotion requirements is individually required", () => {
  for (const missing of PROMOTION_REQUIREMENTS) {
    const evidence = goodEvidence();
    delete evidence[missing];
    assert.throws(
      () => proposePromotion(proposal({ promotions: { [caveatId()]: { verdict: "SHIP", evidence } } })),
      new RegExp(`requirement ${missing} is missing`),
      `a promotion missing ${missing} was accepted`,
    );
  }
});

test("a re-labelled old review is refused by digest, and a reused id by name", () => {
  assert.throws(() => proposePromotion(proposal({ documentSha256: REVIEW_LEDGER[0].documentSha256 })), /SAME review document under a new id/);
  assert.throws(() => proposePromotion(proposal({ reviewId: REVIEW_LEDGER[0].reviewId })), /already exists in the ledger/);
});

test("a new blind review that does not return SHIP does not promote", () => {
  for (const verdict of ["SHIP_WITH_CAVEAT", "HOLD", "REJECT"]) {
    assert.throws(
      () => proposePromotion(proposal({ promotions: { [caveatId()]: { verdict, evidence: goodEvidence() } } })),
      /Only a verdict of SHIP promotes/,
    );
  }
});

test("a fifth reason is not a substitute for one of the four", () => {
  const evidence = goodEvidence();
  delete evidence.NEW_BLIND_REVIEW_VERDICT_SHIP;
  evidence.MAINTAINER_IS_HAPPY_WITH_IT = "it looks fine to me now";
  assert.throws(() => proposePromotion(proposal({ promotions: { [caveatId()]: { verdict: "SHIP", evidence } } })), /unknown promotion evidence key/);
});

test("validateLedger refuses a hand-written upgrade with no promotion evidence", () => {
  const forged = [
    ...REVIEW_LEDGER,
    {
      reviewId: "FORGED-2026-09-01",
      method: "BLIND_VISUAL",
      date: "2026-09-01",
      documentSha256: "c".repeat(64),
      promotionEvidence: null,
      verdicts: { [caveatId()]: { verdict: "SHIP", blindCode: null, blindCodeSource: null } },
    },
  ];
  const problems = validateLedger(forged);
  assert.ok(problems.some((p) => /promotion by maintainer judgement, which is refused/.test(p)), problems.join("\n"));
});

test("validateLedger refuses an upgrade by a review that was not blind", () => {
  const forged = [
    ...REVIEW_LEDGER,
    {
      reviewId: "SIGHTED-2026-09-01",
      method: "SIGHTED_REVIEW",
      date: "2026-09-01",
      documentSha256: "d".repeat(64),
      promotionEvidence: { [caveatId()]: Object.fromEntries(PROMOTION_REQUIREMENTS.map((r) => [r, "recorded somewhere"])) },
      verdicts: { [caveatId()]: { verdict: "SHIP", blindCode: null, blindCodeSource: null } },
    },
  ];
  assert.ok(validateLedger(forged).some((p) => /NEW BLIND review/.test(p)));
});

test("a blind code must say how it was recovered, and an unrecovered one is null", () => {
  const forged = [{ ...REVIEW_LEDGER[0], verdicts: { "PIXEL_GRID_V1/idol": { verdict: "SHIP", blindCode: "T-99", blindCodeSource: "I_REMEMBER_IT" } } }];
  assert.ok(validateLedger(forged).some((p) => /CONTENT_HASH or ELIMINATION/.test(p)));

  const dangling = [{ ...REVIEW_LEDGER[0], verdicts: { "PIXEL_GRID_V1/idol": { verdict: "SHIP", blindCode: null, blindCodeSource: "CONTENT_HASH" } } }];
  assert.ok(validateLedger(dangling).some((p) => /blindCodeSource is set but blindCode is null/.test(p)));
});
