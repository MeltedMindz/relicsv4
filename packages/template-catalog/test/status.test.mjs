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

test("the Wave-1 classification is 2 / 5 / 9 / 19, and the tiers partition the whole wave", () => {
  const c = classification();
  assert.equal(c.SHIP.length, 2);
  assert.equal(c.EXPERIMENTAL.length, 5);
  assert.equal(c.HELD.length, 9);
  assert.equal(c.REJECTED.length, 19);
  assert.equal(allTemplateIds().length, 35);
  assert.equal(TEMPLATE_STATUSES.reduce((n, s) => n + c[s].length, 0), 35);
  // No template appears in two tiers.
  const seen = new Set();
  for (const s of TEMPLATE_STATUSES) for (const id of c[s]) { assert.ok(!seen.has(id), `${id} is in two tiers`); seen.add(id); }
});

test("the final SHIP set is exactly the two the blind reviews left standing", () => {
  assert.deepEqual([...templatesWithStatus("SHIP")].sort(), [
    "GEOMETRIC_RECURSION_V1/compass",
    "VECTOR_COMPOSITION_V1/alluvium",
  ]);
});

test("both departed runtimes have ZERO SHIP templates, and their templates are still classified", () => {
  // Asked of BOTH, not of the one that left first. CELLULAR left on a REJECT and PIXEL on a HOLD,
  // which are different verdicts reaching the same rule, and a test written against one of them
  // would pass while the other quietly kept a SHIP template.
  for (const runtimeId of ["CELLULAR_SYSTEM_V1", "PIXEL_GRID_V1"]) {
    const mine = allTemplateIds().filter((id) => id.startsWith(`${runtimeId}/`));
    assert.ok(mine.length >= 4, `only ${mine.length} ${runtimeId} templates in the ledger`);
    assert.deepEqual(mine.filter((id) => templateStatus(id) === "SHIP"), [], runtimeId);
    // Departure is not deletion. Every one of them still carries a verdict.
    for (const id of mine) assert.notEqual(templateStatus(id), "UNREVIEWED", id);
  }
});

test("NO RECORD AFTER THE FIRST EVER UPGRADED ANYTHING, and the downgrades owed no evidence", () => {
  // Asked of EVERY later record rather than of the last one. The last record is a moving target —
  // it has been three different records in two days — and a check written against `at(-1)` stops
  // looking at the ones underneath it the moment a new one lands.
  let downgrades = 0;
  for (const [i, record] of REVIEW_LEDGER.entries()) {
    if (i === 0) continue;
    assert.equal(record.method, "BLIND_VISUAL", record.reviewId);
    assert.equal(record.promotionEvidence, null, `${record.reviewId} carries promotion evidence but promotes nothing`);
    const before = REVIEW_LEDGER.slice(0, i);
    for (const [id, entry] of Object.entries(record.verdicts)) {
      const prior = latestVerdict(id, before);
      assert.ok(prior, `${record.reviewId}/${id} has no earlier verdict to move from`);
      const moved = REVIEW_VERDICTS.indexOf(entry.verdict) - REVIEW_VERDICTS.indexOf(prior.verdict);
      assert.ok(moved >= 0, `${id} was UPGRADED by a record carrying no promotion evidence`);
      if (moved > 0) downgrades++;
    }
  }
  // Four in the second review, and idol in the third.
  assert.equal(downgrades, 5);
  // And the ledger accepts it: a downgrade owes nothing, which is the whole asymmetry.
  assert.deepEqual(validateLedger(), []);
});

test("idol's HOLD is the LATEST word on it, and it took PIXEL_GRID_V1 out of the wave with it", () => {
  const idol = "PIXEL_GRID_V1/idol";
  const record = REVIEW_LEDGER.find((r) => r.reviewId === "IDOL-FRAME-REPAIR-BLIND-2026-08-29");
  assert.ok(record, "the idol frame-repair review is not in the ledger");
  assert.equal(record.subjects, 1);
  assert.equal(record.verdicts[idol].verdict, "HOLD");
  // Its blind code is B-01 — and so is a DIFFERENT template's, in a different set.
  assert.equal(record.verdicts[idol].blindCode, "B-01");
  assert.equal(record.verdicts[idol].blindCodeSource, "CONTENT_HASH");
  assert.equal(
    REVIEW_LEDGER.find((r) => r.reviewId === "WAVE1-FINAL-BLIND-2026-08-29").verdicts["GEOMETRIC_RECURSION_V1/cairn"].blindCode,
    "B-01",
    "the code collision this test exists to document has gone; a code is only meaningful beside its reviewId",
  );

  // The first review said SHIP about it. The latest one wins, and it is not a promotion.
  assert.equal(REVIEW_LEDGER[0].verdicts[idol].verdict, "SHIP");
  assert.equal(latestVerdict(idol).reviewId, record.reviewId);
  assert.equal(templateStatus(idol), "HELD");
  assert.ok(!templatesWithStatus("SHIP").some((id) => id.startsWith("PIXEL_GRID_V1/")));
});

test("a template no later review looked at keeps the verdict of the one that did", () => {
  // `alluvium` is the only SHIP template no re-review ever saw. Its render inputs were shown to be
  // unmoved, so no new verdict was claimed and none was invented; `latestVerdict` walks back.
  const alluvium = "VECTOR_COMPOSITION_V1/alluvium";
  for (const record of REVIEW_LEDGER.slice(1)) {
    assert.equal(record.verdicts[alluvium], undefined, `${record.reviewId} carries a verdict for a template it did not look at`);
  }
  assert.equal(templateStatus(alluvium), "SHIP");
  assert.equal(latestVerdict(alluvium).reviewId, REVIEW_LEDGER[0].reviewId);

  // compass WAS re-reviewed, and its standing verdict is the second record's.
  assert.equal(latestVerdict("GEOMETRIC_RECURSION_V1/compass").reviewId, "WAVE1-FINAL-BLIND-2026-08-29");
  // idol was re-reviewed later still, and its standing verdict is the third record's.
  assert.equal(latestVerdict("PIXEL_GRID_V1/idol").reviewId, "IDOL-FRAME-REPAIR-BLIND-2026-08-29");
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
    "PIXEL_GRID_V1/idol",
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
