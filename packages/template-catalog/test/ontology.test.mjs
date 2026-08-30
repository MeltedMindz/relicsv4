// SPDX-License-Identifier: MIT
// ================================================================================================
// THE AXES — that they are SEPARATE, that the separation is what ranks, and that a pick says why.
//
// `selection.test.mjs` judges this design by OUTCOME, which is what a creator experiences and what
// can be run against the old scorer to show it failing. This file judges it by MECHANISM: an
// outcome test cannot tell "the market word lost" from "the market word won and the artistic word
// happened to win by more", and those are different systems.
//
// Every test here is broken by a named mutation in `mutate.mjs`. A guard never shown to fail is not
// evidence, and this project has already shipped a control suite that scored itself by counting the
// word CONTROL in its own comments.
// ================================================================================================
import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTISTIC_AXES,
  AXIS_WEIGHTS,
  MATCH_AXES,
  VOCABULARY,
  axisOf,
  runtimeMediumTerms,
  selectForAutonomousAgent,
  semanticMatch,
  shipCatalog,
} from "../src/select.js";
import { RUNTIMES, describeTemplate } from "../src/descriptors.js";
import { keccak256Utf8 } from "../src/keccak.js";

function allActiveSnapshot() {
  const entries = new Map();
  let id = 1;
  for (const r of Object.values(RUNTIMES)) {
    entries.set(id, {
      id, runtime: `0x${String(id).padStart(40, "1")}`, codeHash: `0x${"aa".repeat(32)}`,
      tag: `0x${keccak256Utf8(r.runtimeTagPreimage)}`, version: r.runtimeVersion,
      mode: r.artRuntimeMode, active: true, exists: true, label: r.id,
    });
    id++;
  }
  return { entries, complete: true, declaredCount: entries.size, failedReads: [], errors: [] };
}

const rank = (brief) => semanticMatch(shipCatalog(), brief);
const of = (ranked, id) => ranked.find((r) => r.id === id);

test("MARKET_IS_A_SEPARATE_AXIS_AND_NEVER_RANKS", () => {
  // MARKET is not one of the axes that rank, and its absence from ARTISTIC_AXES is the guarantee —
  // not the size of its weight. A weight can be edited to dominate by someone who never reads the
  // comment beside it; an ordering cannot.
  assert.ok(MATCH_AXES.includes("MARKET"));
  assert.ok(!ARTISTIC_AXES.includes("MARKET"), "MARKET reached the axes that rank");
  assert.deepEqual([...ARTISTIC_AXES], ["MEDIUM", "MOTIF", "AESTHETIC"]);

  // THE DEFECT, AT THE MECHANISM. "recovery" is the word that decided the production brief. It must
  // now be scored on the market axis, for the template that genuinely binds RECOVERY, and it must
  // contribute nothing whatever to that template's artistic standing.
  assert.equal(axisOf("recovery"), "MARKET");
  const ranked = rank("recursive architectural botanical forms changing during recovery");
  const alluvium = of(ranked, "VECTOR_COMPOSITION_V1/alluvium");
  const compass = of(ranked, "GEOMETRIC_RECURSION_V1/compass");
  assert.equal(alluvium.artistic, 0, `alluvium scored ${alluvium.artistic} artistically on a market word`);
  assert.ok(alluvium.market > 0, "alluvium binds RECOVERY, so the market axis should record it");
  assert.ok(compass.artistic > alluvium.artistic);
  for (const e of alluvium.evidence) assert.equal(e.axis, "MARKET", `alluvium scored ${e.axis} on ${e.briefTerm}`);

  // AND THE ORDERING IS LEXICOGRAPHIC, asserted on the returned order itself: no candidate is ever
  // ranked ahead of one with a strictly higher artistic score, whatever the market totals are.
  for (const brief of [
    "a nested concentric radial instrument that densifies under stress",
    "geological strata and horizontal banding, cut back by drawdown",
    "recursive architectural botanical forms changing during recovery",
  ]) {
    const order = rank(brief);
    for (let i = 1; i < order.length; i++) {
      assert.ok(order[i - 1].artistic >= order[i].artistic, `${brief}: market overturned an artistic difference`);
    }
  }
});

test("THE_RUNTIME_IS_SCORED_AS_THE_MEDIUM_AND_THE_TEMPLATE_AS_THE_COMPOSITION", () => {
  // The runtime's own summary reaches the score, and it reaches it on the MEDIUM axis. Asked
  // against a word that exists nowhere else in the published catalog.
  const corpus = runtimeMediumTerms(RUNTIMES.GEOMETRIC_RECURSION_V1);
  assert.ok(corpus.includes("recursive"), corpus.join(", "));
  const compass = of(rank("recursive"), "GEOMETRIC_RECURSION_V1/compass");
  assert.equal(compass.axes.MEDIUM, AXIS_WEIGHTS.MEDIUM);
  assert.deepEqual(compass.evidence.map((e) => [e.axis, e.briefTerm, e.catalogTerm]), [["MEDIUM", "recursive", "recursive"]]);

  // THE TEMPLATE'S PROSE SUMMARY IS NOT SCORED, AND ITS ABSENCE IS THE FIX. It is where the original
  // defect lived: "recovery" reached the score because it sat in a sentence about sediment. Derived,
  // not hand-listed — every word that appears ONLY in a template's summary must score nothing.
  let probed = 0;
  for (const id of shipCatalog()) {
    const d = describeTemplate(id);
    const curated = new Set(
      [...d.brief.tags, ...d.brief.useCases, d.title, ...d.signals.bound.map((b) => `${b.sensor} ${b.drives}`)]
        .join(" ").toLowerCase().split(/[^a-z0-9-]+/),
    );
    const runtimeWords = new Set(runtimeMediumTerms(d.runtime));
    for (const w of d.summary.toLowerCase().split(/[^a-z0-9-]+/)) {
      if (w.length < 4 || curated.has(w) || runtimeWords.has(w)) continue;
      probed++;
      const self = of(rank(w), id);
      assert.equal(self.artistic, 0, `"${w}" appears only in ${id}'s prose summary and scored ${self.artistic} artistically`);
    }
  }
  assert.ok(probed >= 5, `only ${probed} summary-only words were probed; this assertion would be near-vacuous`);
});

test("THE_LABEL_IS_NOT_IN_THE_CORPUS", () => {
  // RUNTIME_NAME_LITERAL_OVERRIDE=NO, at the mechanism rather than at the outcome. There is no table
  // anywhere mapping a word to a runtime; the only path from a brief to a pick is scoring. What is
  // checkable here is the input to that scoring: a runtime's own identifier tokens are not in its
  // corpus, so wherever a label word scores, a DESCRIPTION word answered it.
  let collisions = 0;
  for (const [runtimeId, runtime] of Object.entries(RUNTIMES)) {
    const own = runtimeId.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const corpus = runtimeMediumTerms(runtime);
    for (const word of own) {
      assert.ok(!corpus.includes(word), `"${word}" is in ${runtimeId}'s own medium corpus`);
      if (runtime.summary.toLowerCase().split(/[^a-z0-9-]+/).includes(word)) collisions++;
      for (const c of rank(word)) {
        if (c.runtimeId !== runtimeId) continue;
        for (const e of c.evidence) {
          assert.ok(!own.includes(e.catalogTerm), `"${word}" scored for ${c.id} against its own label "${e.catalogTerm}"`);
        }
      }
    }
  }
  // Non-vacuous: at least one runtime really does restate its label in its own summary, which is the
  // case where a tolerant rule would have let the label back in.
  assert.ok(collisions > 0, "no label/description collision exists, so this proved nothing");

  // AND THE PRICE IS STATED RATHER THAN HIDDEN: the label word reaches its own engine not at all,
  // while every OTHER way of saying the same medium does.
  assert.equal(of(rank("vector"), "VECTOR_COMPOSITION_V1/alluvium").artistic, 0);
  for (const word of ["layered", "primitives", "fields", "plate"]) {
    assert.ok(of(rank(word), "VECTOR_COMPOSITION_V1/alluvium").artistic > 0, `"${word}" reaches nothing`);
  }
});

test("EVERY_CANDIDATE_COMES_BACK_WITH_A_READABLE_RECEIPT", () => {
  // A pick nobody can read is a pick nobody can overrule, and the reason this defect survived a
  // green suite is that the old score was one number with no account of itself.
  const out = selectForAutonomousAgent({
    brief: "a nested concentric radial instrument, precise and cartographic, that densifies under stress",
    registrySnapshot: allActiveSnapshot(),
  });
  assert.equal(out.considered.length, 2);
  for (const c of out.considered) {
    for (const axis of MATCH_AXES) assert.equal(typeof c.axes[axis], "number", `${c.id} has no ${axis} total`);
    assert.equal(c.artistic, ARTISTIC_AXES.reduce((s, a) => s + c.axes[a], 0) + c.axes.NOT_FOR);
    assert.equal(c.score, c.artistic);
    for (const e of c.evidence) {
      assert.ok(e.briefTerm && e.catalogTerm, `${c.id} has evidence with no words in it`);
      assert.equal(typeof e.weight, "number");
    }
    // The totals are the evidence, added up. A receipt that does not reconcile is decoration.
    for (const axis of MATCH_AXES) {
      const fromEvidence = c.evidence.filter((e) => e.axis === axis).reduce((s, e) => s + e.weight, 0);
      assert.equal(c.axes[axis], fromEvidence, `${c.id}'s ${axis} total does not equal its own evidence`);
    }
  }
  const winner = out.considered[0];
  assert.ok(winner.evidence.length > 0);
  assert.match(out.reason, /MATCHED on artistic match/);

  // EVERY AXIS IS REACHABLE, AND THE AESTHETIC ONE IS ASSERTED HERE BECAUSE IT WAS NOT. Across a
  // whole blind corpus it scored zero in all ten runs, and an independent reviewer could not tell
  // from the receipts whether it was unreachable with this catalog or simply dead code. This brief
  // says "precise" and the template publishes the tag "precision"; if that stops meeting, the axis
  // is decoration and this goes red.
  assert.ok(winner.axes.AESTHETIC > 0, `the AESTHETIC axis scored nothing: ${JSON.stringify(winner.axes)}`);
  assert.ok(winner.axes.MEDIUM > 0 && winner.axes.MOTIF > 0);

  // A template's own published refusal is recorded, and it is artistic — a market word cannot trip
  // "not for radial symmetry", because that sentence is not about the market.
  const alluvium = out.considered.find((c) => c.id === "VECTOR_COMPOSITION_V1/alluvium");
  assert.ok(alluvium.axes.NOT_FOR < 0, "alluvium publishes a refusal of radial symmetry and this brief is radial");
});

test("THE_VOCABULARIES_ARE_DISJOINT_AND_MOTIF_IS_THE_OPEN_CLASS", () => {
  // A word claimed by two closed classes is a word whose axis depends on evaluation order, which is
  // a coin toss with a comment on it.
  const seen = new Map();
  for (const [axis, words] of Object.entries(VOCABULARY)) {
    assert.ok(words.length >= 20, `${axis} has only ${words.length} words`);
    for (const w of words) {
      assert.ok(!seen.has(w), `"${w}" is in both ${seen.get(w)} and ${axis}`);
      seen.set(w, axis);
    }
  }
  assert.deepEqual(Object.keys(VOCABULARY).sort(), ["AESTHETIC", "MARKET", "MEDIUM"]);
  // MOTIF is the residue, so the classifier is TOTAL: an unknown word is a subject, never undefined.
  assert.equal(axisOf("qqqzzzsubject"), "MOTIF");
  assert.equal(axisOf("recursive"), "MEDIUM");
  assert.equal(axisOf("monumental"), "AESTHETIC");
  assert.equal(axisOf("drawdown"), "MARKET");
});
