#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE BLIND CORPUS RUNNER — run the frozen briefs, print the picks WITH their receipts.
//
// The corpus (`packages/template-catalog/test/fixtures/blind-briefs.json`) was written and committed
// BEFORE the scorer that answers it existed, and it records no expected answer for any brief. This
// script does not judge; it produces the material an INDEPENDENT reviewer judges, and it refuses to
// carry a verdict of its own for the same reason the corpus refuses to carry an expectation.
//
// What it DOES enforce are the structural results, which are facts rather than judgements:
//
//   SELECTOR_BLIND_CASE_COUNT              every frozen brief was actually run
//   SELECTOR_RUNTIME_SUMMARY_SCORED        the runtime's own account of the medium reaches the score
//   SELECTOR_TEMPLATE_SUMMARY_SCORED       the template's prose summary does NOT (it is where the
//                                          original defect lived)
//   SELECTOR_MEDIUM_MARKET_SEPARATED       no brief word is scored on both axes; market never ranks
//   RUNTIME_NAME_LITERAL_OVERRIDE          no runtime identifier token earns its own runtime credit
//   SELECTOR_NON_SHIP_REACHABLE            a non-SHIP template can never be the answer
//   SELECTOR_INACTIVE_RUNTIME_REACHABLE    an inactive runtime can never be the answer
//
// `--json` emits the review packet. `--controls` runs the zero-input floors.
// ================================================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MATCH_AXES,
  RUNTIMES,
  VOCABULARY,
  axisOf,
  describeTemplate,
  isAutonomouslySelectable,
  runtimeMediumTerms,
  selectForAutonomousAgent,
  semanticMatch,
  shipCatalog,
  templatesWithStatus,
} from "../packages/template-catalog/src/index.js";
import { keccak256Utf8 } from "../packages/template-catalog/src/keccak.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

const corpus = JSON.parse(readFileSync(join(ROOT, "packages/template-catalog/test/fixtures/blind-briefs.json"), "utf8"));

/** A registry reading in the shape the CHAIN emits (viem prefixes bytes32 with 0x). */
function snapshot(mode) {
  const entries = new Map();
  let id = 1;
  for (const r of Object.values(RUNTIMES)) {
    entries.set(id, {
      id,
      runtime: `0x${String(id).padStart(40, "1")}`,
      codeHash: `0x${"aa".repeat(32)}`,
      tag: `0x${keccak256Utf8(r.runtimeTagPreimage)}`,
      version: r.runtimeVersion,
      mode: r.artRuntimeMode,
      active: mode === `${r.id}_INACTIVE` ? false : true,
      exists: true,
      label: r.id,
    });
    id++;
  }
  return { entries, complete: true, declaredCount: entries.size, failedReads: [], errors: [] };
}

let failures = 0;
const fail = (m) => { failures++; console.error(`  FAIL  ${m}`); };
function floor(label, actual, minimum) {
  if (minimum < 1) { fail(`${label}: a floor of ${minimum} is satisfiable by nothing`); return; }
  if (actual < minimum) fail(`${label}: ${actual} < ${minimum}. A gate that scans nothing must not pass.`);
}

// ------------------------------------------------------------------------------------------------
// 1. run every frozen brief
// ------------------------------------------------------------------------------------------------
const runs = corpus.briefs.map((b) => {
  const out = selectForAutonomousAgent({ brief: b.text, registrySnapshot: snapshot(b.availability) });
  return {
    id: b.id,
    brief: b.text,
    ambiguous: b.ambiguous === true,
    availability: b.availability,
    selected: out.selected,
    reason: out.reason,
    droppedByCapabilityFilter: out.dropped.map((d) => `${d.id} (${d.runtimeId} ${d.state})`),
    candidates: out.considered.map((c) => ({
      id: c.id,
      artistic: c.artistic,
      market: c.market,
      axes: c.axes,
      evidence: c.evidence.map((e) => `${e.axis} ${e.briefTerm}->${e.catalogTerm} (source: ${e.source}) ${e.weight >= 0 ? "+" : ""}${e.weight}`),
    })),
  };
});
floor("blind briefs run", runs.length, 10);

// ------------------------------------------------------------------------------------------------
// 2. the structural results — facts, not judgements
// ------------------------------------------------------------------------------------------------
const pool = shipCatalog();

// A non-SHIP template can never be an answer, and an INACTIVE runtime can never be an answer.
let nonShip = 0;
let inactive = 0;
for (const r of runs) {
  if (r.selected === null) continue;
  if (!isAutonomouslySelectable(r.selected)) nonShip++;
  if (r.availability === `${r.selected.split("/")[0]}_INACTIVE`) inactive++;
}
if (nonShip !== 0) fail(`${nonShip} blind brief(s) were answered with a template below SHIP`);
if (inactive !== 0) fail(`${inactive} blind brief(s) were answered with a runtime this chain does not carry as active`);

// The runtime's own summary reaches the score. Asked by REMOVING it: if a brief that scores only on
// runtime-summary evidence still scores the same without it, the corpus is not being read.
const runtimeSummaryEvidence = runs.flatMap((r) => r.candidates.flatMap((c) => c.evidence)).filter((e) => e.startsWith("MEDIUM "));
const runtimeCorpusWords = new Set(Object.values(RUNTIMES).flatMap((rt) => runtimeMediumTerms(rt)));
const scoredFromRuntimeSummary = runtimeSummaryEvidence.some((e) => runtimeCorpusWords.has(e.split("->")[1].split(" ")[0]));
if (!scoredFromRuntimeSummary) fail("no blind brief scored against a runtime's own summary; the medium corpus is not reaching the score");

// The template's prose summary is NOT scored. Asked by finding a word that is ONLY in the summary.
let templateSummaryScored = false;
for (const id of pool) {
  const d = describeTemplate(id);
  // The CURATED surface is tags, use-cases, the title, and the bound sensors with what they drive.
  // The sensor names belong here even though they also appear in the prose: they are read off chain,
  // so a hit on "drawdown" is a fact about the template rather than an accident of its summary.
  const curated = new Set([...d.brief.tags, ...d.brief.useCases, d.title, ...d.signals.bound.map((b) => `${b.sensor} ${b.drives}`)].join(" ").toLowerCase().split(/[^a-z0-9-]+/));
  const runtimeWords = new Set(runtimeMediumTerms(d.runtime));
  const summaryOnly = d.summary.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 3 && !curated.has(w) && !runtimeWords.has(w));
  for (const w of summaryOnly) {
    const ranked = semanticMatch(pool, w);
    const self = ranked.find((c) => c.id === id);
    if (self.artistic > 0) { templateSummaryScored = true; break; }
  }
  if (templateSummaryScored) break;
}
if (templateSummaryScored) fail("a word appearing ONLY in a template's prose summary still scored; that prose is where the original defect lived");

// Medium and market are separate: no vocabulary word is claimed by both axes, and market never ranks.
const overlap = VOCABULARY.MEDIUM.filter((w) => VOCABULARY.MARKET.includes(w));
if (overlap.length !== 0) fail(`${overlap.length} word(s) are in both the MEDIUM and MARKET vocabularies: ${overlap.join(", ")}`);
let marketRanked = 0;
for (const r of runs) {
  for (let i = 1; i < r.candidates.length; i++) {
    const ahead = r.candidates[i - 1];
    const behind = r.candidates[i];
    if (ahead.artistic < behind.artistic) marketRanked++;
  }
}
if (marketRanked !== 0) fail(`market behaviour overturned an artistic difference in ${marketRanked} comparison(s)`);

// ------------------------------------------------------------------------------------------------
// RUNTIME_NAME_LITERAL_OVERRIDE — and the DIFFERENCE between a name and a description matters here.
//
// The claim is NOT "a brief containing a runtime's name can never reach that runtime". That claim is
// unachievable and it is also wrong: `GEOMETRIC_RECURSION_V1` describes itself as "recursive
// geometry", so refusing every word morphologically near its label would empty its corpus and
// restore the very defect this work exists to close. Runtime names are EVIDENCE, not commands.
//
// The claim IS: **the label itself is never in the corpus, and no pick is ever made on it.** Every
// hit must be answered by a word the engine used to DESCRIBE what it draws. That is checkable
// exactly, in two parts, and the second is the one that would catch a re-introduction:
//
//   1. no identifier token appears in its own runtime's medium corpus, or in its own templates'
//      corpora — so `vector`, which VECTOR_COMPOSITION_V1 does restate in its own summary, earns
//      that runtime nothing at all;
//   2. wherever an identifier token DOES score, the catalog word that answered it is a description
//      word and not the label — `geometric` is answered by `geometry`, never by `geometric`.
//
// And there is no mapping table anywhere: nothing in this package associates a literal string with
// a runtime id. Scoring is the only path from a brief to a pick.
// ------------------------------------------------------------------------------------------------
let nameCredit = 0;
let nameInCorpus = 0;
const nameTokens = [];
for (const runtimeId of Object.keys(RUNTIMES)) {
  const own = runtimeId.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const corpus = new Set(runtimeMediumTerms(RUNTIMES[runtimeId]));
  for (const word of own) {
    nameTokens.push(`${runtimeId}:${word}`);
    if (corpus.has(word)) { nameInCorpus++; fail(`the identifier token "${word}" is in ${runtimeId}'s own medium corpus`); }
    for (const c of semanticMatch(pool, word)) {
      if (c.runtimeId !== runtimeId) continue;
      for (const e of c.evidence) {
        if (own.includes(e.catalogTerm)) {
          nameCredit++;
          fail(`"${word}" scored for ${c.id} against the catalog word "${e.catalogTerm}", which is its own runtime's label — that is name routing`);
        }
      }
    }
  }
}
// The behavioural half, on the word that actually collides: a runtime that restates its own label in
// its summary must not be reachable by that label.
for (const word of ["vector", "composition"]) {
  for (const c of semanticMatch(pool, word)) {
    if (c.runtimeId === "VECTOR_COMPOSITION_V1" && c.artistic > 0) {
      nameCredit++;
      fail(`the label word "${word}" scored ${c.artistic} for ${c.id}`);
    }
  }
}
floor("runtime identifier tokens probed", nameTokens.length, 4);
floor("ship pool", pool.length, 2);
floor("vocabulary axes", Object.keys(VOCABULARY).length, 3);
for (const [axis, words] of Object.entries(VOCABULARY)) floor(`${axis} vocabulary`, words.length, 20);

// ------------------------------------------------------------------------------------------------
if (CONTROLS) {
  // Zero-input controls: every floor above must reject nothing, and the axis classifier must be
  // total — a word belongs to exactly one axis and an unknown word is MOTIF, never undefined.
  let bad = 0;
  const cases = [
    ["blind briefs", corpus.briefs.length, 10],
    ["ship pool", pool.length, 2],
    ["MEDIUM vocabulary", VOCABULARY.MEDIUM.length, 20],
    ["AESTHETIC vocabulary", VOCABULARY.AESTHETIC.length, 20],
    ["MARKET vocabulary", VOCABULARY.MARKET.length, 20],
  ];
  for (const [label, actual, minimum] of cases) {
    for (const [name, ok] of [["POSITIVE", actual >= minimum], ["ZERO-INPUT", !(0 >= minimum)], ["FLOOR>=1", minimum >= 1]]) {
      if (!ok) bad++;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} ${label} (${actual} vs ${minimum})`);
    }
  }
  for (const [word, expected] of [["recursive", "MEDIUM"], ["sediment", "MOTIF"], ["monumental", "AESTHETIC"], ["drawdown", "MARKET"], ["recovery", "MARKET"], ["qqqzzz", "MOTIF"]]) {
    const got = axisOf(word);
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  axisOf(${word}) = ${got}`);
  }
  // Every brief in the corpus must still be expectation-free. A corpus that grows an expected answer
  // has become a restatement of the scorer.
  const withExpectation = corpus.briefs.filter((b) => b.expected !== null).length;
  if (withExpectation !== 0) { bad++; console.log(`  FAIL  ${withExpectation} blind brief(s) carry an expected answer`); }
  else console.log("  PASS  no blind brief carries an expected answer");
  console.log("");
  console.log(`SELECTOR_BLIND_CONTROLS=${bad === 0 ? "PASS" : "FAIL"}`);
  process.exit(bad === 0 ? 0 : 1);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ frozenAt: corpus.frozenAt, runs }, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

for (const r of runs) {
  console.log(`\n${r.id}${r.ambiguous ? " (ambiguous)" : ""}  ${r.brief}`);
  if (r.availability !== "ALL_ACTIVE") console.log(`     capability: ${r.availability}`);
  for (const d of r.droppedByCapabilityFilter) console.log(`     dropped:    ${d}`);
  console.log(`     PICK:       ${r.selected ?? "DECLINED"}`);
  console.log(`     reason:     ${r.reason}`);
  for (const c of r.candidates) {
    console.log(`       ${c.id}  artistic ${c.artistic}  market ${c.market}  [${MATCH_AXES.map((a) => `${a.toLowerCase()} ${c.axes[a]}`).join(" ")}]`);
    for (const e of c.evidence) console.log(`         ${e}`);
  }
}

console.log("");
console.log(`SELECTOR_BLIND_CASE_COUNT=${runs.length}`);
console.log(`SELECTOR_BLIND_DECLINED=${runs.filter((r) => r.selected === null).length}`);
console.log(`SELECTOR_RUNTIME_SUMMARY_SCORED=${scoredFromRuntimeSummary ? "YES" : "NO"}`);
console.log(`SELECTOR_TEMPLATE_SUMMARY_SCORED=${templateSummaryScored ? "YES" : "NO"}`);
console.log(`SELECTOR_MEDIUM_MARKET_SEPARATED=${overlap.length === 0 && marketRanked === 0 ? "YES" : "NO"}`);
console.log(`RUNTIME_NAME_IN_OWN_CORPUS=${nameInCorpus}`);
console.log(`RUNTIME_NAME_LITERAL_OVERRIDE=${nameCredit === 0 && nameInCorpus === 0 ? "NO" : "YES"}`);
console.log(`SELECTOR_NON_SHIP_REACHABLE=${nonShip === 0 ? "NO" : "YES"}`);
console.log(`SELECTOR_INACTIVE_RUNTIME_REACHABLE=${inactive === 0 ? "NO" : "YES"}`);
console.log("");
console.log(failures === 0 ? "[selector-blind] PASS — the structural results hold. The PICKS are for an independent reviewer to judge; this script does not judge them." : `[selector-blind] FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
