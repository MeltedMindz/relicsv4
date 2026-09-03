// SPDX-License-Identifier: MIT
// ================================================================================================
// The chain-free properties of the art-direction lane.
//
// Two of these are MUTATION tests rather than assertions, and they are the only two that matter
// when someone asks whether the receipt means anything: `ART_ACCEPTANCE_INVALIDATED_BY_CONFIG_CHANGE`
// and `FIRST_LEGAL_CONFIG_ACCEPTED_WITHOUT_REVIEW`. Both are proved by building a receipt that
// passes, breaking exactly one thing, and requiring the verification to refuse — a guard that has
// never been shown to fail is not evidence.
// ================================================================================================

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ATLAS_CONSULTATION_FACETS, assertAtlasFresh, atlasProvenance, atlasRuntimeIds, consult, parameterNames,
} from "../src/atlas.js";
import { assertCapabilityMappingCurrent, detectImpossibleDemands, runtimeCanExpress } from "../src/capabilities.js";
import { admitBrief, impossibleCommissionsSentToAuthor, WAVE1_CATALOG } from "../src/admission.js";
import { shipCatalog } from "../../template-catalog/src/select.js";
import { DIRECTION_FIELDS, validateDirection } from "../src/direction.js";
import { AUTHORING_SEEDS, DEVELOPMENT_REVIEW_SEEDS, assertSeedGroupsDisjoint, deriveHoldoutSeeds, holdoutLeak, seedsVisibleTo } from "../src/seeds.js";

/** A holdout for the fixtures. The real one is derived from a salt that is not in this repository. */
const FIXTURE_HOLDOUT = deriveHoldoutSeeds({ roundId: "art-direction-unit-fixture", salt: "fixture-salt-not-a-real-round" });
import { checkBindings } from "../src/binding.js";
import { authorConfig, deriveIntent } from "../src/author.js";
import { assertBoundedChange, validateCritique, validateResponse } from "../src/critique.js";
import { buildArtAcceptance, verifyArtAcceptance, writeArtAcceptance, acceptanceFlags } from "../src/acceptance.js";

// ---------------------------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------------------------

const GOOD_BRIEF = [
  "# Brief — CAIRN",
  "A monumental stacked form, brutalist and heavy, built from nested geometry that repeats at",
  "diminishing scale. Sparse and centred, with generous negative space around a single dominant",
  "mass. Under stress the structure fractures and its members prune away; in recovery the nesting",
  "deepens again. Palette restrained: iron, ash, and a single warm ochre accent.",
].join("\n");

const GOOD_DIRECTION = Object.fromEntries(DIRECTION_FIELDS.map((f) => [
  f,
  `A deliberately substantive statement about ${f} that is long enough to clear the placeholder floor and says something a reviewer could disagree with.`,
]));

function acceptanceFixture(overrides = {}) {
  return buildArtAcceptance({
    runtimeId: "GEOMETRIC_RECURSION_V1",
    templateId: "GEOMETRIC_RECURSION_V1/compass",
    chainId: 8453,
    runtimeAddress: "0xbb9Eb45ee117397aC4beF47d0732c2a41AF56F69",
    runtimeCodeHash: "0xb68b7469b7d0fde3a7e4a474f367b7fecdc1bb051e78868b3a889048dd2bb56d",
    briefText: GOOD_BRIEF,
    admission: { outcome: "ADMITTED", admitted: true, recommended: "GEOMETRIC_RECURSION_V1/compass", requiredCapabilities: {}, concessions: [] },
    direction: { directionHash: "d".repeat(64), createdAt: new Date().toISOString(), containsRuntimeConfig: false },
    atlasRecord: { consultationCount: 10, consultedParameters: ["rules[n].shapeSet"] },
    acceptedConfigBytes: "0x4752563102",
    objective: { pass: true, checks: [{ id: "CONFIG_LEGAL", ok: true }] },
    rounds: [{ round: 1, criticId: "critic-a", configHash: "x", critique: { findings: [{ id: "f1" }] }, response: { responses: [{ findingId: "f1", disposition: "ACCEPT" }] } }],
    finalReview: {
      reviewerId: "reviewer-z",
      verdict: "PASS",
      blinded: true,
      describedBeforeBrief: true,
      seedGroup: "FINAL_HOLDOUT_SEEDS",
      seeds: [...FIXTURE_HOLDOUT],
      states: ["neutral", "stress", "recovery"],
      configHashAtUnblind: null,
      visualDescription: "a compact nested mass",
    },
    seedGroups: { authorSawHoldout: false, holdoutIntegrity: "HELD" },
    ...overrides,
  });
}

function inWorkspace(fn) {
  const ws = mkdtempSync(join(tmpdir(), "art-direction-"));
  try { return fn(ws); } finally { rmSync(ws, { recursive: true, force: true }); }
}

/**
 * Write a receipt AND the reviewer document its verdict is bound to.
 *
 * The verdict may not attest to itself, so a fixture that writes only the receipt now produces an
 * unbound one — correctly refused, and useless for testing anything else. `plant` writes the
 * reviewer's `final-review/verdict.json` first, then pins its bytes into the receipt, which is
 * exactly what the harness does.
 */
function plant(ws, overrides = {}) {
  const record = acceptanceFixture(overrides);
  const doc = {
    reviewerId: record.finalReview.reviewerId,
    verdict: record.finalReview.verdict,
    describedBeforeBrief: record.finalReview.describedBeforeBrief,
    reasoning: "a fixture reviewer's reasoning, long enough to be a document rather than a flag",
  };
  const bytes = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`);
  mkdirSync(join(ws, "final-review"), { recursive: true });
  writeFileSync(join(ws, "final-review", "verdict.json"), bytes);
  record.finalReview.verdictDocument = {
    path: join("final-review", "verdict.json"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    verdictField: "verdict",
  };
  writeArtAcceptance(ws, record);
  return record;
}

// ---------------------------------------------------------------------------------------------
// atlas
// ---------------------------------------------------------------------------------------------

test("every documented parameter is consultable, and the unmeasured facets are counted honestly", () => {
  let params = 0;
  let gaps = 0;
  for (const rt of atlasRuntimeIds()) {
    for (const p of parameterNames(rt)) {
      const rec = consult(rt, p);
      params += 1;
      gaps += rec.unmeasuredFacets.length;
      assert.ok(rec.visibleEffect.measured, `${rt}.${p} must have a measured visual role`);
    }
  }
  assert.equal(params, 23, "the atlas documents 23 parameters");
  // The figure quoted in `ATLAS_FACET_SOURCES`. If a source list is widened to make a gap vanish,
  // this moves and the comment beside it becomes false -- so the number is watched.
  assert.equal(gaps, 20, `expected 20 unmeasured facet-slots of ${params * ATLAS_CONSULTATION_FACETS.length}, got ${gaps}`);
});

test("consult refuses a parameter the atlas has not measured", () => {
  assert.throws(() => consult("GEOMETRIC_RECURSION_V1", "rules[n].nonesuch"), /ATLAS_HAS_NO_ENTRY/);
});

test("consult refuses a market binding whose suitability was never measured", () => {
  assert.throws(
    () => consult("VECTOR_COMPOSITION_V1", "fieldCount, and the site budget", { intendsMarketBinding: true }),
    /ATLAS_CANNOT_ADVISE/,
  );
});

test("an unread chain is not a fresh atlas", () => {
  assert.throws(() => assertAtlasFresh({}), /not a fresh atlas/);
  assert.throws(() => assertAtlasFresh({ GEOMETRIC_RECURSION_V1: "0xdead" }), /ATLAS_STALE/);
  const pinned = atlasProvenance().runtimeCodeHash.GEOMETRIC_RECURSION_V1.codeHash;
  assert.equal(assertAtlasFresh({ GEOMETRIC_RECURSION_V1: pinned }).fresh, true);
});

// ---------------------------------------------------------------------------------------------
// capability admission
// ---------------------------------------------------------------------------------------------

test("every refusal still cites a clause the atlas currently contains", () => {
  const r = assertCapabilityMappingCurrent();
  assert.ok(r.demands >= 10, "the vocabulary should not silently shrink");
});

test("MUST CATCH: briefs demanding what neither runtime can draw are refused", () => {
  const impossible = {
    horizon: "A wide landscape with a low horizon line dividing the frame, layered strata receding toward a vanishing point under a pale sky, rendered with great care and restraint throughout.",
    glyphs: "An instrument face carrying tick marks and numerals around its rim, spelling the project name in precise engraved lettering, delicate and archival in tone across the whole piece.",
    figurative: "A photorealistic portrait of a human figure, lifelike and carefully modelled, occupying the centre of the frame against a plain quiet ground of restrained ochre. The modelling should read as skin, cloth and bone rather than as pattern, and the sitter must remain recognisable at every size.",
    stateColour: "A dense field of concentric marks, layered and organic. Under drawdown the palette shifts to a colder blue and the whole work reddens as volatility rises across the frame.",
  };
  for (const [name, text] of Object.entries(impossible)) {
    const r = admitBrief(text);
    assert.equal(r.outcome, "BRIEF_NOT_REPRESENTABLE_BY_CURRENT_WAVE1_CATALOG", `${name} should be refused`);
    assert.ok(r.blockers.length > 0, `${name} must name what blocked it`);
  }
});

test("MUST ALLOW: atmosphere, motif and abstraction reach the author untouched", () => {
  const allowed = {
    monumental: GOOD_BRIEF,
    botanical: "A botanical abstraction: the suggestion of a frond unfurling, never a literal leaf. Fine linework radiating from a central stem, delicate and sparse. Under recovery the branching extends and multiplies.",
    geological: "Sediment and strata as pure pattern: horizontal banding at varying pitch, layered and dense, the deposition of one bed over another. Under drawdown the beds thin and fewer survive across the frame.",
    brutalist: "A brutalist mass, raw and uncompromising, stark against an empty ground. Heavy, monumental, industrial in feeling. Under stress it fractures; under recovery the structure consolidates and deepens again.",
    negatedHorizon: "A centred figure with no horizon and no ground plane, held clear of every edge. Quiet, sparse and deliberately weightless, with the emptiness around it doing as much work as the mass itself.",
    machineDelicate: "A delicate mechanism of nested rings, precise and instrument-like, but abstract throughout. Fine and filigree at close range. Under volatility the rings spread apart and the whole loosens.",
  };
  for (const [name, text] of Object.entries(allowed)) {
    const r = admitBrief(text);
    assert.equal(r.outcome, "ADMITTED", `${name} should be admitted, got ${r.outcome} (${r.blockers?.map((b) => b.id).join(",")})`);
  }
});

test("an empty brief is refused for BEING EMPTY, not admitted for making no demands", () => {
  assert.equal(admitBrief("").outcome, "BRIEF_TOO_THIN");
  assert.equal(admitBrief("make it nice").outcome, "BRIEF_TOO_THIN");
  assert.equal(admitBrief("art ".repeat(80)).outcome, "BRIEF_TOO_THIN", "repetition is not substance");
});

test("negation is read per sentence, not per document", () => {
  const late = "A quiet centred work with no horizon. A second passage introduces a low horizon line across the lower third of the frame.";
  assert.ok(detectImpossibleDemands(late).some((d) => d.id === "HORIZON_OR_GROUND_PLANE"),
    "a negation in one sentence must not excuse a demand in another");
});

test("REGRESSION: counting things is not a demand for a numeral", () => {
  // "the number of enclosures" was refused as LEGIBLE_GLYPH by a pattern that matched
  // `number` followed by any character. Caught only because a frozen benchmark brief came back
  // refused and the refusal looked wrong -- which is the invisible-failure case, so it gets a test.
  const counting = "What varies between tokens is the number of enclosures and the character of the centre they hold. A quiet contemplative object, gold and umber over deep ink, sparing throughout.";
  assert.equal(detectImpossibleDemands(counting).length, 0, "counting nouns must not read as typography");
  assert.equal(admitBrief(counting).outcome, "ADMITTED");
  // and the real demand is still caught
  assert.ok(detectImpossibleDemands('the letter R at the centre').some((d) => d.id === "LEGIBLE_GLYPH"));
  assert.ok(detectImpossibleDemands('tick marks and numerals around its rim').some((d) => d.id === "LEGIBLE_GLYPH"));
});

test("the catalog admission ranks against is DERIVED from the SHIP tier", () => {
  // Not a hardcoded pair. A second selection policy agrees with the protocol's until a verdict
  // moves, and then disagrees without saying so. This is also NOT the CLI's starter list: an agent
  // keyed to a printed scaffold list would silently lose a runtime if a starter were ever gated.
  assert.deepEqual(WAVE1_CATALOG.map((c) => c.templateId), [...shipCatalog()]);
  assert.equal(new Set(WAVE1_CATALOG.map((c) => c.runtimeId)).size, 2, "both Wave-1 runtimes must be reachable");
});

test("the recommendation follows medium fit, not catalog order", () => {
  const sediment = "Sediment and strata as pure pattern: horizontal banding at varying pitch, dense and layered, one bed deposited over another across the whole section. Under drawdown the beds thin and fewer survive.";
  const recursive = "Nested self-similar geometry repeating inward at diminishing scale, a radial system of concentric rings, precise and instrument-like, with the market loosening and tightening the whole figure.";
  assert.equal(admitBrief(sediment).recommended, "VECTOR_COMPOSITION_V1/alluvium");
  assert.equal(admitBrief(recursive).recommended, "GEOMETRIC_RECURSION_V1/compass");
});

test("a runtime asymmetry is a real escape route", () => {
  assert.equal(runtimeCanExpress("GEOMETRIC_RECURSION_V1", "CURVE_OR_ARC"), false);
  assert.equal(runtimeCanExpress("VECTOR_COMPOSITION_V1", "CURVE_OR_ARC"), true);
});

test("impossible commissions sent to the author is UNKNOWN with no evidence, never zero", () => {
  assert.equal(impossibleCommissionsSentToAuthor([]).value, "UNKNOWN");
  assert.equal(impossibleCommissionsSentToAuthor([{ admitted: true, sentToAuthor: true }]).value, 0);
  assert.equal(impossibleCommissionsSentToAuthor([{ admitted: false, sentToAuthor: true, briefSha256: "ab" }]).value, 1);
});

// ---------------------------------------------------------------------------------------------
// direction
// ---------------------------------------------------------------------------------------------

test("a direction must be complete, substantive, and free of parameter names", () => {
  assert.ok(validateDirection(GOOD_DIRECTION).ok);
  const short = { ...GOOD_DIRECTION, density: "sparse" };
  assert.ok(!validateDirection(short).ok);
  const withParam = { ...GOOD_DIRECTION, density: "The field should carry sizeMax around 40 so the frame reads as busy at browse size and beyond." };
  const r = validateDirection(withParam);
  assert.ok(!r.ok && r.problems.some((p) => /runtime parameter/.test(p)));
});

test("a direction may not re-promise a capability admission recorded as a concession", () => {
  const admission = { admitted: true, outcome: "ADMITTED", concessions: [{ id: "CURVE_OR_ARC" }] };
  const d = { ...GOOD_DIRECTION, composition: "Sweeping curves and serpentine lines cross the field, dominating the frame and carrying the whole composition." };
  const r = validateDirection(d, { admission });
  assert.ok(!r.ok && r.problems.some((p) => /re-promises/.test(p)));
});

// ---------------------------------------------------------------------------------------------
// seeds
// ---------------------------------------------------------------------------------------------

test("the seed populations are disjoint, including against art-review's own", () => {
  const open = assertSeedGroupsDisjoint();
  assert.equal(open.totalDistinct, 136);
  assert.equal(open.holdoutChecked, false, "a run with no salt has not checked the holdout, and must not say it has");
  const withHoldout = assertSeedGroupsDisjoint(undefined, { finalHoldout: FIXTURE_HOLDOUT });
  assert.equal(withHoldout.totalDistinct, 148);
  assert.equal(withHoldout.holdoutChecked, true);
});

test("the author cannot be shown a holdout seed", () => {
  assert.deepEqual(seedsVisibleTo("AUTHOR"), [...AUTHORING_SEEDS]);
  const leak = holdoutLeak("AUTHOR", FIXTURE_HOLDOUT, { finalHoldout: FIXTURE_HOLDOUT });
  assert.ok(leak.leaks && leak.includesFinalHoldout.length === FIXTURE_HOLDOUT.length);
  assert.equal(holdoutLeak("AUTHOR", DEVELOPMENT_REVIEW_SEEDS).leaks, true, "even the critic's seeds are not the author's");
  assert.equal(holdoutLeak("AUTHOR", AUTHORING_SEEDS).leaks, false);
});

test("an unsupplied holdout is UNKNOWN, never an empty leak list", () => {
  // `includesFinalHoldout: []` would read as "no holdout seeds leaked" on the strength of never
  // having looked. That is the shape of every vacuous pass this repository has caught.
  const blind = holdoutLeak("AUTHOR", FIXTURE_HOLDOUT);
  assert.equal(blind.leaks, true);
  assert.equal(blind.includesFinalHoldout, "UNKNOWN");
});

// ---------------------------------------------------------------------------------------------
// binding
// ---------------------------------------------------------------------------------------------

test("a configuration whose every binding is provably dead is refused", () => {
  const dead = { rules: [{ drive: "CONTRACT", sensor: "DRAWDOWN", curve: "LINEAR", contraction: 20 }] };
  const r = checkBindings({ runtimeId: "GEOMETRIC_RECURSION_V1", config: dead });
  assert.equal(r.refuse, true);
  assert.equal(r.respondsToMarket, false);
});

test("an unprovable binding is UNKNOWN and is NOT a refusal", () => {
  const unproven = { rules: [{ drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR", branch: 3 }] };
  const r = checkBindings({ runtimeId: "GEOMETRIC_RECURSION_V1", config: unproven });
  assert.equal(r.refuse, false, "we cannot tell must never be scored as proven dead");
  assert.equal(r.respondsToMarket, "UNPROVEN");
});

test("a dead sensor is caught even when the arithmetic would otherwise work", () => {
  const r = checkBindings({ runtimeId: "VECTOR_COMPOSITION_V1", config: { fields: [{ drive: "COUNT", sensor: "FLOW_BIAS", curve: "LINEAR", countMin: 4, countMax: 30 }] } });
  assert.equal(r.bindings[0].verdict, "DEAD_SENSOR");
});

// ---------------------------------------------------------------------------------------------
// author
// ---------------------------------------------------------------------------------------------

test("intent reads negation rather than inverting the direction", () => {
  const d = { ...GOOD_DIRECTION, rhythm: "Regular repetition at diminishing scale, a steady contraction with no interruption anywhere in the work." };
  assert.equal(deriveIntent(d).intent.rhythmMode, "REGULAR");
});

test("the author records a stated default rather than implying a choice", () => {
  const silent = { ...GOOD_DIRECTION, rhythm: "This says nothing whatsoever about repetition or interval and exists only to clear the length floor." };
  const { derivation } = deriveIntent(silent);
  assert.equal(derivation.rhythmMode.source, "DEFAULT");
});

test("authoring is deterministic and consults the atlas", () => {
  for (const rt of atlasRuntimeIds()) {
    const a = authorConfig({ runtimeId: rt, direction: GOOD_DIRECTION });
    const b = authorConfig({ runtimeId: rt, direction: GOOD_DIRECTION });
    assert.deepEqual(a.config, b.config, `${rt} must author deterministically`);
    assert.ok(a.atlas.consultationCount >= 8, `${rt} consulted only ${a.atlas.consultationCount} parameters`);
    assert.notEqual(a.bindings.refuse, true, `${rt} authored a config with no live market binding`);
  }
});

test("a stage cannot write a parameter it does not own", async () => {
  const { STAGE_PARAMETERS } = await import("../src/author.js");
  const owned = STAGE_PARAMETERS.GEOMETRIC_RECURSION_V1;
  assert.ok(!owned.SILHOUETTE.includes("palette"), "silhouette must not own the palette");
  assert.ok(owned.PALETTE.includes("palette"));
  // Every declared stage parameter is unique to at most one stage per runtime, except the two
  // deliberate revisits documented in author.js.
  for (const rt of Object.keys(STAGE_PARAMETERS)) {
    const seen = new Map();
    for (const [stage, params] of Object.entries(STAGE_PARAMETERS[rt])) {
      for (const p of params) seen.set(p, [...(seen.get(p) ?? []), stage]);
    }
    for (const [p, stages] of seen) {
      assert.ok(stages.length === 1, `${rt}: ${p} is claimed by ${stages.join(" and ")}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// critique
// ---------------------------------------------------------------------------------------------

const FINDING = {
  id: "f1",
  whatFails: "The twelve seeds read as one work: the silhouette is identical on every tile at 120px.",
  why: "The direction promises that tokens differ first in silhouette, and they do not differ at all.",
  specificChange: "Declare at least three members in the shape set and widen the symmetry set to span NONE through ROT6.",
  keep: "The compact centred mass and the dark ground, which are the identity anchors and currently read well.",
};
const CRITIQUE = { whatWorks: ["The ground is doing real work and the mass sits confidently in the frame at both sizes."], findings: [FINDING], overall: "Close, but the population is one work." };

test("a critique without whatWorks, or with a vague change, is refused", () => {
  assert.ok(validateCritique(CRITIQUE).ok);
  assert.ok(!validateCritique({ ...CRITIQUE, whatWorks: [] }).ok);
  const vague = { ...CRITIQUE, findings: [{ ...FINDING, specificChange: "Improve the composition" }] };
  assert.ok(!validateCritique(vague).ok);
  const noKeep = { ...CRITIQUE, findings: [{ ...FINDING, keep: "" }] };
  assert.ok(!validateCritique(noKeep).ok);
});

test("CRITIQUE_WITHOUT_AUTHOR_RESPONSE counts an ignored finding", () => {
  const r = validateResponse(CRITIQUE, { responses: [] });
  assert.equal(r.critiqueWithoutAuthorResponse, 1);
  assert.ok(!r.ok);
  const answered = validateResponse(CRITIQUE, {
    responses: [{ findingId: "f1", disposition: "ACCEPT", parameters: ["rules[0].shapeSet"], expectedVisualEffect: "The twelve tiles will differ in silhouette because the seed draws one of three shapes.", preserve: ["the compact centred mass"] }],
  });
  assert.equal(answered.critiqueWithoutAuthorResponse, 0);
  assert.ok(answered.ok);
});

test("a refusal is a first-class answer and needs a reason", () => {
  const bare = validateResponse(CRITIQUE, { responses: [{ findingId: "f1", disposition: "REJECT_WITH_REASON" }] });
  assert.ok(!bare.ok);
  const reasoned = validateResponse(CRITIQUE, {
    responses: [{ findingId: "f1", disposition: "REJECT_WITH_REASON", reason: "The runtime cannot vary silhouette per seed beyond the declared sets; this is a fact about the medium." }],
  });
  assert.ok(reasoned.ok);
});

test("one criticism may not move twenty fields", () => {
  const before = { rules: [{ shapeSet: "a", contraction: 70, rotation: 12 }], palette: ["#000"] };
  const after = { rules: [{ shapeSet: "b", contraction: 40, rotation: 12 }], palette: ["#fff"] };
  const response = { responses: [{ findingId: "f1", disposition: "ACCEPT", parameters: ["rules[0].shapeSet"] }] };
  const r = assertBoundedChange({ before, after, response });
  assert.ok(!r.ok);
  assert.deepEqual(r.unnamed.map((u) => u.parameter).sort(), ["palette", "rules[0].contraction"]);
});

// ---------------------------------------------------------------------------------------------
// acceptance -- the two flags, proved by mutation
// ---------------------------------------------------------------------------------------------

test("a well-formed receipt verifies", () => {
  inWorkspace((ws) => {
    plant(ws);
    const v = verifyArtAcceptance(ws, { configBytes: "0x4752563102", briefText: GOOD_BRIEF, runtimeId: "GEOMETRIC_RECURSION_V1" });
    assert.equal(v.accepted, true, v.detail);
  });
});

test("MUTATION: ART_ACCEPTANCE_INVALIDATED_BY_CONFIG_CHANGE — one byte voids it", () => {
  inWorkspace((ws) => {
    plant(ws);
    const v = verifyArtAcceptance(ws, { configBytes: "0x4752563103", briefText: GOOD_BRIEF });
    assert.equal(v.accepted, false);
    assert.equal(v.reasonCode, "ART_ACCEPTANCE_INVALIDATED");
    assert.ok(v.invalidatedBy.some((i) => i.facet === "ART_CONFIG"));
  });
});

test("MUTATION: the brief moving voids it too", () => {
  inWorkspace((ws) => {
    plant(ws);
    const v = verifyArtAcceptance(ws, { configBytes: "0x4752563102", briefText: `${GOOD_BRIEF} And one more sentence.` });
    assert.equal(v.reasonCode, "ART_ACCEPTANCE_INVALIDATED");
    assert.ok(v.invalidatedBy.some((i) => i.facet === "BRIEF"));
  });
});

test("MUTATION: the runtime bytecode moving voids it", () => {
  inWorkspace((ws) => {
    plant(ws);
    const v = verifyArtAcceptance(ws, { configBytes: "0x4752563102", runtimeCodeHash: "0xfeed" });
    assert.ok(v.invalidatedBy.some((i) => i.facet === "RUNTIME_CODE"));
  });
});

test("MUTATION: FIRST_LEGAL_CONFIG_ACCEPTED_WITHOUT_REVIEW — a passing battery is not acceptance", () => {
  inWorkspace((ws) => {
    // Legal, renders, every objective check green, and NO final verdict.
    plant(ws, {
      objective: { pass: true, checks: [{ id: "CONFIG_LEGAL", ok: true }, { id: "SEED_DIVERSITY", ok: true }, { id: "PERCEPTUAL_SEPARATION", ok: true }] },
      finalReview: { reviewerId: null, verdict: null, blinded: null, describedBeforeBrief: null, seedGroup: null },
    });
    const v = verifyArtAcceptance(ws, { configBytes: "0x4752563102" });
    assert.equal(v.accepted, false);
    assert.equal(v.reasonCode, "ART_NOT_ACCEPTED");
  });
});

test("MUTATION: a verdict taken on non-holdout seeds is refused", () => {
  inWorkspace((ws) => {
    plant(ws, {
      finalReview: { reviewerId: "r", verdict: "PASS", blinded: true, describedBeforeBrief: true, seedGroup: "AUTHORING_SEEDS" },
    });
    assert.equal(verifyArtAcceptance(ws, { configBytes: "0x4752563102" }).reasonCode, "FINAL_REVIEW_NOT_BLINDED");
  });
});

test("MUTATION: a config change after unblinding is refused with its own reason code", () => {
  inWorkspace((ws) => {
    plant(ws, {
      finalReview: {
        reviewerId: "r", verdict: "PASS", blinded: true, describedBeforeBrief: true,
        seedGroup: "FINAL_HOLDOUT_SEEDS", configHashAtUnblind: "0".repeat(64),
      },
    });
    const v = verifyArtAcceptance(ws, { configBytes: "0x4752563102" });
    assert.equal(v.reasonCode, "FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND");
  });
});

test("MUTATION: a reviewer who also critiqued is refused", () => {
  inWorkspace((ws) => {
    plant(ws, {
      rounds: [{ round: 1, criticId: "same-agent", critique: { findings: [{ id: "f1" }] }, response: { responses: [{ findingId: "f1", disposition: "ACCEPT" }] } }],
      finalReview: { reviewerId: "same-agent", verdict: "PASS", blinded: true, describedBeforeBrief: true, seedGroup: "FINAL_HOLDOUT_SEEDS" },
    });
    assert.equal(verifyArtAcceptance(ws, { configBytes: "0x4752563102" }).reasonCode, "FINAL_REVIEW_ROLE_COLLISION");
  });
});

test("MUTATION: an unanswered finding blocks acceptance", () => {
  inWorkspace((ws) => {
    plant(ws, {
      rounds: [{ round: 1, criticId: "critic-a", critique: { findings: [{ id: "f1" }, { id: "f2" }] }, response: { responses: [{ findingId: "f1", disposition: "ACCEPT" }] } }],
    });
    assert.equal(verifyArtAcceptance(ws, { configBytes: "0x4752563102" }).reasonCode, "CRITIQUE_WITHOUT_AUTHOR_RESPONSE");
  });
});

test("with no receipt, every flag is UNKNOWN and none of them is zero", () => {
  inWorkspace((ws) => {
    const f = acceptanceFlags(ws);
    for (const [k, v] of Object.entries(f)) {
      if (k === "detail") continue;
      assert.equal(v, "UNKNOWN", `${k} must be UNKNOWN without evidence, got ${v}`);
    }
  });
});
