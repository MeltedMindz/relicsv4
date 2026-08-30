// SPDX-License-Identifier: MIT
// ================================================================================================
// TEMPLATE SELECTION — FILTER FIRST, MATCH SECOND. THE ORDER IS THE WHOLE MECHANISM.
// ================================================================================================
//
// THE PIPELINE, DECLARED ONCE
// ---------------------------
//     USER BRIEF -> LIVE RUNTIME AVAILABILITY -> SHIP TEMPLATE CATALOG -> CAPABILITY FILTER
//         -> SEMANTIC ART MATCH -> SELECT -> MUTATE CONFIG -> PREVIEW + TEST -> LAUNCH
//
// This module owns the stages up to and including SELECT. The three after it belong elsewhere and
// are named here only so the contract is one list rather than three.
//
// WHY THE ORDER MATTERS, CONCRETELY
// ---------------------------------
// The templates this wave rejected are not bad at DESCRIBING themselves. Several of them describe
// themselves better than the ones that shipped, because their weaknesses are exactly the kind a
// description cannot carry: "recovery duplicates stress", "every token is a centred disc", "at
// least one seed barely moves between neutral and stress", "twelve stamps from one die". A matcher
// scoring `brief -> prose` will happily rank those first — an archaeological brief matches an
// excavation register whose third market state does no work, and nothing in the words says so.
//
// So the pool is built BEFORE any matching happens, and the matcher never sees a template it may
// not choose. Filtering afterwards would still be correct, and would still be wrong: it makes the
// refusal a property of a check somewhere downstream that someone can forget, rather than a
// property of what was ever available.
//
// WHAT IS SCORED, AND ON WHICH AXIS
// ---------------------------------
// A brief says four different kinds of thing and they must not be summed. The MEDIUM ("recursive",
// "layered vector primitives") is what the engine draws and lives in the RUNTIME's own summary. The
// MOTIF ("rings", "sediment", "a monument") is what the picture depicts. The AESTHETIC ("sparse",
// "monumental") is how it feels. And the MARKET behaviour ("fractures under drawdown") is how it
// moves — which is true of every template in this wave and therefore distinguishes none of them.
//
// Until 2026-08-30 all four landed in ONE bag-of-words score, and a market word beat the medium a
// creator named: "recursive architectural botanical forms changing during recovery" selected a
// SEDIMENT template on the strength of "recovery" appearing in its summary sentence. The runtime's
// own description was never read at all. Adding it to the same bag would have fixed that brief and
// left the mechanism intact for the next one.
//
// So the axes are separate, the runtime is scored as the medium and the template as the starting
// composition, ranking is on medium+motif+aesthetic, and market only breaks artistic ties — by
// LEXICOGRAPHIC comparison rather than by a small weight, because a weight can be edited to
// dominate. `MATCH_AXES` and `semanticMatch` carry the full reasoning.
//
// THE OTHER HALF, AND IT IS EQUALLY LOAD-BEARING
// ----------------------------------------------
// **The template is a STARTING POINT, not a cage.** Nothing in this module constrains the config an
// agent then writes. It picks WHICH preset to start from; the preset may then be changed as far as
// the runtime's own validator allows — different palette, different sensors, different curves,
// different geometry, a different picture entirely. There is no similarity check, no drift budget
// and no comparison against the preset anywhere in this package, and adding one would turn a
// starting point into a cage.
// ================================================================================================

import {
  AUTONOMOUS_SELECTABLE_STATUSES,
  allTemplateIds,
  isAdvancedVisible,
  isAutonomouslySelectable,
  isVisibleToHuman,
  templateStatus,
  templatesWithStatus,
} from "./status.js";
import { RUNTIMES, TEMPLATE_DESCRIPTORS, describeTemplate, describeUnshippedTemplate } from "./descriptors.js";
import { keccak256Utf8 } from "./keccak.js";

/** The declared pipeline. `ownedHere` marks the stages this module implements. */
export const SELECTION_PIPELINE = Object.freeze([
  Object.freeze({ stage: "USER_BRIEF", ownedHere: false, detail: "what the creator asked for, in their words" }),
  Object.freeze({ stage: "LIVE_RUNTIME_AVAILABILITY", ownedHere: true, detail: "read ArtRuntimeRegistryV1 on the target chain; an unread registry is a denial" }),
  Object.freeze({ stage: "SHIP_TEMPLATE_CATALOG", ownedHere: true, detail: "the pool: SHIP templates and nothing else" }),
  Object.freeze({ stage: "CAPABILITY_FILTER", ownedHere: true, detail: "drop every template whose runtime is not ACTIVE on this chain" }),
  Object.freeze({ stage: "SEMANTIC_ART_MATCH", ownedHere: true, detail: "score the surviving pool on four axes — medium, motif, aesthetic, market — and rank on the first three" }),
  Object.freeze({ stage: "SELECT", ownedHere: true, detail: "take the best-scoring candidate, or refuse" }),
  Object.freeze({ stage: "MUTATE_CONFIG", ownedHere: false, detail: "the agent's own work; unbounded within the runtime's validator" }),
  Object.freeze({ stage: "PREVIEW_AND_TEST", ownedHere: false, detail: "render, seed-sweep, validate" }),
  Object.freeze({ stage: "LAUNCH", ownedHere: false, detail: "prepare, predict, simulate, build, sign" }),
]);

/** Per-runtime, per-chain availability. `ACTIVE` is the only value that permits a selection. */
export const RUNTIME_AVAILABILITY_STATES = Object.freeze(["ACTIVE", "INACTIVE", "NOT_REGISTERED", "UNKNOWN"]);

/**
 * Compare a bytes32 by VALUE, not by spelling. `0x`-prefixed and bare hex are the same 32 bytes.
 *
 * THE DEFECT THIS CLOSES, MEASURED ON A LIVE CHAIN (2026-08-29). The two halves of the tag
 * comparison were produced by different code and spelled the same value differently:
 *
 *   * `keccak256Utf8(...)` returns 64 BARE hex characters — no `0x`.
 *   * a registry entry's `tag` arrives from `readRegistrySnapshot`, which passes viem's decoded
 *     `bytes32` straight through, and viem returns it `0x`-PREFIXED.
 *
 * So the comparison was `"0x8a7b…" !== "8a7b…"` and could never be true — `runtimeAvailability`
 * answered `NOT_REGISTERED` for EVERY runtime, on EVERY chain, no matter what the registry held.
 * That is the exact "fabricated fact" `keccak.js` warns about in its own header, and it was
 * invisible until a runtime was first registered: before Wave 1, `NOT_REGISTERED` was also the
 * correct answer, so a wrong mechanism and a right answer agreed. GEOMETRIC_RECURSION_V1 (id 3) and
 * VECTOR_COMPOSITION_V1 (id 4) were registered and active on chains 1, 8453 and 4663 that day, and
 * the selector still reported both absent and declined every brief with `NO_ACTIVE_RUNTIME`.
 *
 * The unit suite did not catch it because its fixture built entries with `keccak256Utf8` too, so it
 * compared bare against bare and proved the function consistent with itself rather than with the
 * chain. `runtimeAvailabilityAcceptsBothTagSpellings` in the test suite is what now holds this.
 *
 * NOT A WEAKENING. All 64 hex digits must still match exactly; only the prefix and case are
 * normalised. A value that is not 32 bytes of hex normalises to something no tag can equal.
 */
function normalizeBytes32(value) {
  const hex = String(value ?? "").trim().toLowerCase().replace(/^0x/, "");
  return /^[0-9a-f]{64}$/.test(hex) ? hex : `INVALID_BYTES32:${hex}`;
}

/**
 * Turn a live registry snapshot into a per-runtime availability answer.
 *
 * THREE RULES, EACH OF WHICH HAS BEEN GOT WRONG BEFORE IN THIS PROJECT:
 *
 * 1. **AN INCOMPLETE READ IS `UNKNOWN`, NEVER `NOT_REGISTERED`.** A registry that could not be read
 *    completely does not prove a runtime is absent; it proves nobody successfully asked. Reporting
 *    absence would be a fabricated fact about a chain nobody reached, and it is the one error here
 *    that looks like a correct answer.
 * 2. **IDENTITY IS MATCHED ON LABEL *AND* TAG *AND* MODE.** A label is a string an operator typed.
 *    The tag is `keccak256("V4ART.RUNTIME.<ID>")`, which the runtime itself returns, and the mode
 *    says what interface it implements. Matching on the label alone would let a registry entry
 *    named `PIXEL_GRID_V1` pointing at anything at all pass for the real one.
 * 3. **AN ENTRY WITH THE ZERO ADDRESS IS NOT AN ENTRY.** `runtimeInfo(id)` does not revert for an
 *    unregistered id — it returns a fully-formed record with the zero address and `exists: false`,
 *    so a caller asking "did the call resolve?" reads that as success. The snapshot reader already
 *    drops those; this function does not re-admit them.
 *
 * @param {{complete: boolean, entries: Map|Array}} snapshot as returned by `readRegistrySnapshot`
 */
export function runtimeAvailability(snapshot) {
  const ids = Object.keys(RUNTIMES);
  const unknownAll = (detail) => Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ state: "UNKNOWN", detail })])));

  if (!snapshot) return unknownAll("no live registry reading was supplied; nobody asked this chain");
  if (snapshot.complete !== true) {
    return unknownAll("the runtime registry could not be read completely on this chain, so whether it carries these runtimes is UNKNOWN — not absent");
  }

  const entries = snapshot.entries instanceof Map ? [...snapshot.entries.values()] : Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const out = {};
  for (const id of ids) {
    const expectedTag = normalizeBytes32(keccak256Utf8(RUNTIMES[id].runtimeTagPreimage));
    const match = entries.find((e) => {
      if (!e || e.exists !== true) return false;
      if (!e.runtime || /^0x0{40}$/i.test(e.runtime)) return false;
      if (String(e.label) !== id) return false;
      if (normalizeBytes32(e.tag) !== expectedTag) return false;
      return Number(e.mode) === RUNTIMES[id].artRuntimeMode;
    });
    if (!match) {
      out[id] = Object.freeze({ state: "NOT_REGISTERED", detail: `the registry was read completely on this chain and carries no entry whose label, tag and mode all identify ${id}` });
      continue;
    }
    out[id] = Object.freeze({
      state: match.active === true ? "ACTIVE" : "INACTIVE",
      registryId: match.id,
      detail: match.active === true ? `registered at id ${match.id} and active` : `registered at id ${match.id} but NOT active; a launch against it is refused`,
    });
  }
  return Object.freeze(out);
}

/**
 * THE POOL. SHIP templates, and nothing else, ever.
 *
 * This is stage 3 and it takes no tier argument. There is no parameter here that a caller can pass
 * to widen it, no environment variable that widens it, and no flag. Widening it means editing this
 * function, which turns the three `AUTONOMOUS_AGENT_CAN_SELECT_*` tests red by name.
 */
export function shipCatalog() {
  const ship = new Set(templatesWithStatus("SHIP"));
  return Object.freeze(
    TEMPLATE_DESCRIPTORS.filter((d) => ship.has(d.id) && isAutonomouslySelectable(d.id)).map((d) => d.id),
  );
}

/**
 * Stage 4. Keep only the templates whose runtime is ACTIVE on the chain that was actually read.
 *
 * FAILS CLOSED IN EVERY DIRECTION. `UNKNOWN` removes a template exactly as `NOT_REGISTERED` does —
 * both refuse a selection — while the REASON travels with the refusal, because only one of them is
 * a reason to retry.
 */
export function capabilityFilter(candidateIds, availability) {
  const kept = [];
  const dropped = [];
  for (const id of candidateIds) {
    const runtimeId = id.split("/")[0];
    const answer = availability?.[runtimeId] ?? { state: "UNKNOWN", detail: "no availability answer for this runtime" };
    if (answer.state === "ACTIVE") kept.push(id);
    else dropped.push({ id, runtimeId, state: answer.state, detail: answer.detail });
  }
  return Object.freeze({ kept: Object.freeze(kept), dropped: Object.freeze(dropped) });
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "i", "in", "is", "it", "its", "me", "my",
  "of", "on", "or", "that", "the", "their", "them", "they", "this", "to", "want", "wants", "with", "would", "you",
  "collection", "project", "token", "tokens", "nft", "nfts", "art", "make", "create", "build", "like", "looking",
  // Function words that only became scorable when the runtime summaries and the use-case sentences
  // entered the corpora. "composed into one plate" must not make "into" and "one" evidence about an
  // engine, and "a brief asking for..." must not make "brief" and "asking" evidence about a motif.
  "into", "one", "themselves", "brief", "asking", "needs", "every", "rather", "range", "about", "who", "what",
  // Prepositions and adverbs. They are not evidence, and a refusal that quotes the creator's own
  // words back to them must not quote "during" as something the catalog cannot draw.
  "during", "under", "over", "inside", "outside", "across", "through", "between", "within", "without",
  "back", "per", "then", "when", "where", "while", "also", "still", "very", "more", "most", "less",
  "become", "becomes", "made", "using", "than",
  // PLACEHOLDER NOUNS FOR "THE ARTWORK ITSELF". A brief that says "forms", "shapes" or "a piece" has
  // named the category, not the subject: every template in every wave makes forms. Treating them as
  // motif evidence would let the emptiest word in a brief decide, and quoting them in a refusal
  // ("this brief names \"forms\", and no template draws that") is true and useless at once.
  "form", "forms", "shape", "shapes", "thing", "things", "style", "piece", "image", "picture", "look",
]);

function terms(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Distinct terms, in first-seen order. A word repeated in a brief is not two pieces of evidence. */
function distinctTerms(text) {
  return [...new Set(terms(text))];
}

/** `layers` -> `layer`. Only where a real word survives, so `less` does not become `les`. */
function singular(w) {
  if (w.length > 5 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * DO TWO WORDS MEAN THE SAME THING HERE? Four rules, and the last one is the one that earns its keep.
 *
 * 1. equality
 * 2. plural/singular — "layers" finds "layered", "drawdowns" finds "drawdown"
 * 3. one is a PREFIX of the other, both at least 4 characters — "branching" finds "branch"
 * 4. a SHARED PREFIX of at least 7 — "geometric" finds "geometry", which no other rule does, and
 *    which is exactly the miss that let a brief say the medium in one inflection and reach nothing.
 *
 * RULE 3 IS A PREFIX TEST, NOT A SUBSTRING TEST, AND THE FIRST BLIND RUN IS WHY. Plain containment
 * matched "during" to "rings" — "during" has "ring" inside it — and that one accident handed two
 * briefs to the wrong template with a straight face, including a brief that should have been
 * refused. English inflection is suffixal: a shorter related word is a PREFIX of the longer one, and
 * anything else found inside it is a coincidence of spelling. That is the whole difference between
 * "branching"/"branch" and "during"/"rings".
 *
 * SEVEN, NOT SIX, IN RULE 4, AND THE THRESHOLD IS LOAD-BEARING. At six, "composition" finds
 * "composed" — and "composition" is half of a runtime's own NAME, so the matcher would start routing
 * briefs to an engine by its label through a morphological side door. The threshold is not a tuning
 * knob: it is the width of the gap between a shared root and a shared name, measured on the two
 * words that actually collide in this catalog. Changing it is a change to the anti-name rule.
 */
function sharedPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function relatedBase(a, b) {
  if (a === b) return true;
  const sa = singular(a);
  const sb = singular(b);
  if (sa === sb) return true;
  if (sa.length >= 4 && sb.length >= 4 && (sa.startsWith(sb) || sb.startsWith(sa))) return true;
  return sharedPrefix(sa, sb) >= 7;
}

/**
 * The scoring predicate: `relatedBase`, plus one clause that only fires INSIDE a closed vocabulary.
 *
 * WHY THE EXTRA CLAUSE EXISTS. Rule 4's threshold of seven is set by the anti-name rule, and it
 * costs real matches: "precise" does not reach "precision", so a template published an aesthetic tag
 * no brief could ever say out loud — the AESTHETIC axis scored zero across a whole blind corpus and
 * an independent reviewer could not tell whether it was unreachable or dead.
 *
 * WHY IT IS SAFE AT FIVE WHERE THE GENERAL RULE IS NOT SAFE AT SIX. It fires only when BOTH words
 * are members of the same CLOSED vocabulary — MEDIUM, AESTHETIC or MARKET, never the open MOTIF
 * class. A runtime's label is not a vocabulary entry, so this clause cannot reintroduce name
 * matching: it is a statement about two words we have already classified as the same kind of
 * language, which is a much stronger prior than two words that merely start alike.
 */
function related(a, b) {
  if (relatedBase(a, b)) return true;
  const axis = axisOf(a);
  return axis !== "MOTIF" && axis === axisOf(b) && sharedPrefix(singular(a), singular(b)) >= 5;
}

// ================================================================================================
// THE ONTOLOGY. FOUR AXES, AND THEY ARE NOT INTERCHANGEABLE.
// ================================================================================================
//
// THE DEFECT THIS REPLACES WAS NOT A MISSING FIELD, IT WAS ONE BAG OF WORDS. Every corpus — tags,
// use-cases, prose — was summed into a single number, so a MARKET word and a MEDIUM word competed on
// the same axis and whichever appeared more often won. Measured end to end on 2026-08-30: the brief
//
//     "recursive architectural botanical forms changing during recovery"
//
// selected a SEDIMENT template, because "recovery" happened to sit in that template's summary
// sentence. A market word beat the medium the creator actually named. Adding the runtime summary to
// the same bag would have made that particular brief come out right and left the mechanism wrong:
// the next market word would have won the next brief.
//
//   A. MEDIUM      what KIND of picture the engine makes — recursive, radial, layered, gridded.
//                  Lives in the RUNTIME's own account of itself, plus a template's structural tags.
//   B. MOTIF       what the picture DEPICTS — rings, sediment, an instrument, a monument.
//   C. AESTHETIC   how it FEELS — sparse, monumental, precise, corroded.
//   D. MARKET      how it BEHAVES as the market moves — fractures on drawdown, blooms on recovery.
//   E. CAPABILITY  runtime ACTIVE on this chain, template SHIP. Not a score. A gate.
//
// THE ORDER IS THE MECHANISM, AGAIN. E filters first and is not scored at all (`shipCatalog` +
// `capabilityFilter`, both upstream of this file's matcher and both mutation-proven). A, B and C
// rank. D REFINES: it breaks ties between artistically equal candidates and it is reported in full,
// and it can never overturn an artistic difference — not because its weight is small, but because
// the comparison is lexicographic. A weight can be edited to dominate; an ordering cannot.
//
// EVERY TEMPLATE IN THIS WAVE RESPONDS TO THE MARKET. That is what makes D the wrong axis to decide
// on: "changes during recovery" is true of all of them, so it distinguishes nothing, and a brief
// that says only that is refused rather than answered.

/** The axes, in the order a receipt prints them. */
export const MATCH_AXES = Object.freeze(["MEDIUM", "MOTIF", "AESTHETIC", "MARKET"]);

/** The three that RANK. `MARKET` is deliberately absent: it refines, and refining is not ranking. */
export const ARTISTIC_AXES = Object.freeze(["MEDIUM", "MOTIF", "AESTHETIC"]);

/**
 * Per-hit weights. These order evidence WITHIN the artistic score; they do not and cannot promote
 * MARKET, which is compared separately. `NOT_FOR` is a template's own published refusal.
 */
export const AXIS_WEIGHTS = Object.freeze({ MEDIUM: 3, MOTIF: 3, AESTHETIC: 2, MARKET: 1, NOT_FOR: -2 });

/**
 * THE VOCABULARIES. Three closed classes; MOTIF is the OPEN one and takes everything else.
 *
 * WHY MOTIF IS THE RESIDUE AND NOT A LIST. A subject can be anything a creator imagines — nobody can
 * enumerate "flowers, monuments, glyphs, constellations, reliquaries, …" and a half-written list
 * would silently demote every subject its author forgot. The three closed classes are closed because
 * they are the ones that must NOT be confused with each other, and MARKET is closed above all: it is
 * the class whose members must never reach the artistic score. A word missing from MARKET does not
 * fail safe — it lands in MOTIF and starts deciding picks, which is the original defect exactly.
 */
export const VOCABULARY = Object.freeze({
  MEDIUM: Object.freeze([
    "recursive", "recursion", "fractal", "self-similar", "similarity", "nested", "concentric", "radial",
    "circular", "geometric", "geometry", "vector", "linework", "stroke", "outline", "architectural",
    "architecture", "topological", "topology", "grid", "gridded", "lattice", "cellular", "pixel",
    "pixelated", "particle", "layered", "layer", "stratified", "banded", "banding", "tiled", "tiling",
    "modular", "symmetry", "symmetrical", "mirrored", "orthogonal", "curvilinear", "polygonal",
    "tessellated", "composition", "primitive", "silhouette", "plate", "field",
    "horizontal", "vertical", "diagonal", "spiral", "branching",
    "mesh", "wireframe", "isometric", "perspective", "resolution", "halftone", "dither", "line",
    // "level on level" is GEOMETRIC_RECURSION_V1's own phrase for what it draws, and until this was
    // added the word reached nothing: the runtime summary feeds the MEDIUM corpus, so a summary word
    // that classifies as MOTIF is consulted on an axis it is not in. Found by probing each runtime's
    // own vocabulary against itself rather than by a brief, which is the only way a dead word shows.
    "level", "levels", "nesting", "iteration", "iterative", "generation", "generations",
    "generative", "procedural", "depth", "scale", "proportion", "figure-ground",
  ]),
  AESTHETIC: Object.freeze([
    "sparse", "dense", "denser", "density", "minimal", "minimalist", "monumental", "monolithic", "brutalist",
    "delicate", "fine", "heavy", "light", "organic", "irregular", "mechanical", "ornate", "austere",
    "quiet", "loud", "bold", "subtle", "rough", "smooth", "precise", "precision", "clean", "raw",
    "muted", "vivid", "dark", "bright", "flat", "giant", "large", "small", "tiny", "wide", "narrow",
    "abstract", "figurative", "elegant", "crude", "weathered", "corroded", "polished", "chaotic",
    "ordered", "calm", "violent", "flowing", "rigid", "soft", "hard", "ancient", "clinical", "warm",
    "cold", "ochre", "bronze", "colour", "color", "palette", "tone",
  ]),
  MARKET: Object.freeze([
    "market", "markets", "drawdown", "recovery", "recover", "stress", "volatility", "volatile",
    "volume", "liquidity", "price", "trading", "trade", "momentum", "accumulation", "accumulate",
    "drain", "pump", "dump", "rally", "crash", "dip", "bull", "bear", "fee", "swap", "holder",
    "buy", "sell", "supply", "chart", "candle", "floor", "deposition", "deposit", "record",
    // The RESPONSE half of a market sentence. "fractures under drawdown" is one claim, not two, and
    // if the verb lands in MOTIF while the noun lands here then half of every market sentence is
    // still scored artistically — which is the bag-of-words defect surviving inside its own fix.
    "fracture", "fractured", "break", "breaking", "broken", "shatter", "shattered", "cut", "cuts",
    "densify", "densifies", "erode", "erodes", "erosion", "bloom", "blooms", "heal", "heals",
    "open", "opens", "opening", "close", "closes", "grow", "grows", "growth", "shrink", "expand",
    "contract", "rise", "rises", "rising", "fall", "falls", "falling", "deepen", "deepens",
    "change", "changes", "changing", "strip", "stripped", "regrow", "regrown", "remove", "removes",
    "response", "responsive", "react", "reacts",
  ]),
});

const VOCAB_LOOKUP = Object.freeze(
  Object.fromEntries(Object.entries(VOCABULARY).map(([axis, words]) => [axis, Object.freeze(words.map((w) => w.toLowerCase()))])),
);

/**
 * WHICH AXIS DOES THIS WORD BELONG TO? Closed classes first, MOTIF as the residue.
 *
 * MARKET IS TESTED FIRST AND THAT IS DELIBERATE. A word that is both — "floor", "record",
 * "deposition" — is treated as market language, because the failure this ontology exists to prevent
 * is a market word scoring artistically. The opposite mistake costs a hit on the refining axis.
 */
export function axisOf(term) {
  for (const axis of ["MARKET", "MEDIUM", "AESTHETIC"]) {
    if (VOCAB_LOOKUP[axis].some((w) => relatedBase(w, term))) return axis;
  }
  return "MOTIF";
}

/**
 * THE MEDIUM CORPUS: what the RUNTIME says it draws, minus what the runtime is CALLED.
 *
 * The runtime summary is the only published place that names the medium — "recursive", "layered",
 * "primitives", "level on level". Nothing read it until 2026-08-30, so a brief could name the medium
 * exactly and reach nothing.
 *
 * THE IDENTIFIER TOKENS ARE REMOVED, AND THAT IS THE ANTI-NAME RULE. `RUNTIME_NAME_LITERAL_OVERRIDE`
 * is NO: there is no rule anywhere that maps a word to a runtime, and there must not be one. A name
 * is a label a maintainer typed; scoring it means a brief reaches an engine because of what it is
 * CALLED, and that mistake is worse than the miss it would fix because the wrong answer looks like a
 * good one. The same end-to-end run that found the miss also found the selector correctly answering
 * "large abstract vector composition fractured by drawdown" with the RECURSION engine, and a corpus
 * that scored the literal word "vector" reverses it.
 *
 * REMOVAL IS BY EXACT TOKEN, NOT BY `related`. This is the one place in the module that compares
 * words strictly, and it has to: `related` treats "recursion" and "recursive" as one word, so a
 * tolerant removal would empty GEOMETRIC_RECURSION_V1's corpus of the only two words that describe
 * it and reinstate the original defect while looking like a stricter rule.
 *
 * THE COST, STATED RATHER THAN HIDDEN. A word that is half of a runtime's name — "vector",
 * "composition" — scores for every OTHER candidate and not for that one. That asymmetry is real, it
 * is the price of refusing name-matching, and it means a creator who wants layered vector work has
 * to say something beyond the label: "layered", "fields", "layouts", "primitives", "plate" all reach
 * it. If that trade is ever judged wrong, change it here, deliberately, and re-run the blind corpus.
 */
const MEDIUM_TERMS = new Map();
export function runtimeMediumTerms(runtime) {
  const id = String(runtime?.id ?? "");
  const cached = MEDIUM_TERMS.get(id);
  if (cached) return cached;
  const nameTokens = new Set(terms(id));
  const corpus = Object.freeze([...new Set(distinctTerms(runtime?.summary).filter((t) => !nameTokens.has(t)))]);
  MEDIUM_TERMS.set(id, corpus);
  return corpus;
}

/**
 * THE PER-CANDIDATE CORPORA — the runtime scored as the MEDIUM, the template as the COMPOSITION.
 *
 * THE TEMPLATE `summary` IS NOT SCORED, AND ITS ABSENCE IS THE FIX. It is prose written for a human
 * reader, and it is where the original defect lived: "recovery" reached the score because it happened
 * to appear in a sentence about sediment. Tags, use-cases and refusals are the CURATED matching
 * surface — someone chose each of those words to be matched on. A summary sentence is an explanation,
 * and explanations are full of words nobody intended as evidence.
 *
 * The market corpus is built from the BOUND SENSORS rather than from prose, so "does this template
 * answer drawdown?" is settled by what it actually reads on chain.
 */
function corporaFor(d) {
  const nameTokens = new Set(terms(d.runtime.id));
  const byAxis = { MEDIUM: new Map(), MOTIF: new Map(), AESTHETIC: new Map(), MARKET: new Map() };
  const put = (axis, term, source) => { if (!byAxis[axis].has(term)) byAxis[axis].set(term, source); };
  for (const t of runtimeMediumTerms(d.runtime)) put("MEDIUM", t, "runtime");
  // A CURATED TAG AND A WORD INSIDE A SENTENCE ARE NOT THE SAME EVIDENCE, AND THE RECEIPT MUST SAY
  // WHICH. Somebody chose each tag to be matched on. A use-case is prose, and prose carries words
  // nobody meant as evidence — an independent reviewer caught exactly that: the pick for "a minimal
  // monumental structure" rested entirely on the word "structure", which appears in this catalog only
  // inside the sentence "a project that wants drawdown to remove structure rather than add it",
  // where it is a generic noun describing what a SENSOR does. It is a real word in a real curated
  // field, so silently deleting it would be its own kind of lie; scoring it as if someone had chosen
  // it as a tag is the other. It scores, one point lower, and the receipt names its source.
  for (const [source, texts] of [["tag", d.brief.tags], ["title", [d.title]], ["useCase", d.brief.useCases]]) {
    for (const t of texts.flatMap((x) => distinctTerms(x))) {
      const axis = axisOf(t);
      if (axis === "MEDIUM" && nameTokens.has(t)) continue; // the anti-name rule, on the template side too
      put(axis, t, source);
    }
  }
  // THE SENSORS, READ FROM `signals.bound` — WHICH IS WHERE THEY ARE, and the first blind run is how
  // that was found out. This said `d.bindings`, a field `describeTemplate` does not return, so the
  // whole market axis was silently built from prose alone: the sensors a template actually reads on
  // chain contributed NOTHING. `?? []` turned a wrong field name into a quiet empty list rather than
  // a crash, which is how it survived. An optional-chain over a misspelling is a defect that reports
  // itself as an absence.
  for (const b of d.signals?.bound ?? []) {
    put("MARKET", String(b.sensor).toLowerCase(), "sensor");
    for (const t of distinctTerms(b.drives)) put("MARKET", t, "sensor");
  }
  const freeze = (m) => Object.freeze([...m.entries()].map(([term, source]) => Object.freeze({ term, source })));
  return Object.freeze({
    MEDIUM: freeze(byAxis.MEDIUM),
    MOTIF: freeze(byAxis.MOTIF),
    AESTHETIC: freeze(byAxis.AESTHETIC),
    MARKET: freeze(byAxis.MARKET),
    NOT_FOR: Object.freeze([...new Set(d.brief.notFor.flatMap((t) => distinctTerms(t)))]),
    boundSensors: Object.freeze((d.signals?.bound ?? []).map((b) => String(b.sensor).toLowerCase())),
  });
}

/** A word inside a prose sentence is worth one less than a word somebody chose as a tag. Never 0. */
function weightFor(axis, source) {
  const base = AXIS_WEIGHTS[axis];
  return source === "useCase" ? Math.max(1, base - 1) : base;
}

/**
 * The brief, classified. Exported because the REFUSAL has to be written from what the creator SAID,
 * not from what the score came out as — see `selectForAutonomousAgent`.
 */
export function classifyBriefTerms(brief) {
  const text = typeof brief === "string" ? brief : [brief?.summary, brief?.text, ...(brief?.keywords ?? [])].join(" ");
  return Object.freeze(distinctTerms(text).map((term) => Object.freeze({ term, axis: axisOf(term) })));
}

/**
 * Stage 5. Score a pool against a brief, on four axes, and say why.
 *
 * REFUSES A POOL IT WAS NOT ALLOWED TO SEE. The pool is supposed to arrive already filtered, and
 * this check is the second, independent guard on that: if a caller assembles its own candidate list
 * containing an EXPERIMENTAL, HELD or REJECTED id, the matcher throws rather than quietly scoring
 * it. Two guards on one rule is deliberate — the first can be removed by an edit that looks like a
 * refactor, and this one turns that edit into a named test failure.
 *
 * EVERY CANDIDATE COMES BACK WITH A RECEIPT: the axis totals, and the evidence behind each one, with
 * the brief word and the catalog word that answered it. A pick nobody can read is a pick nobody can
 * overrule, and the reason this defect survived a green test suite is that the old score was one
 * number with no account of itself.
 *
 * The score is a MATCH score, not a quality score. It says how well a template answers THIS brief;
 * it says nothing about how good the template is, it is never persisted, never published in a
 * descriptor and never comparable between briefs.
 */
export function semanticMatch(candidateIds, brief) {
  for (const id of candidateIds) {
    if (!isAutonomouslySelectable(id)) {
      throw new Error(
        `semanticMatch refused a ${templateStatus(id)} template (${id}). Only ${AUTONOMOUS_SELECTABLE_STATUSES.join(", ")} may reach the matcher; the tier filter runs BEFORE the match, not after it.`,
      );
    }
  }

  const wanted = classifyBriefTerms(brief);

  const scored = candidateIds.map((id) => {
    const d = describeTemplate(id);
    const corpora = corporaFor(d);
    const supportedSensors = [...d.signals.supported.visual, ...d.signals.supported.traitOnly].map((x) => x.toLowerCase());
    const axes = { MEDIUM: 0, MOTIF: 0, AESTHETIC: 0, MARKET: 0 };
    const evidence = [];
    const hits = [];
    let refusals = 0;

    const unanswered = { MEDIUM: [], MOTIF: [], AESTHETIC: [], MARKET: [] };
    for (const { term, axis } of wanted) {
      const answer = corpora[axis].find((e) => related(e.term, term));
      if (answer !== undefined) {
        const weight = weightFor(axis, answer.source);
        axes[axis] += weight;
        evidence.push(Object.freeze({ axis, briefTerm: term, catalogTerm: answer.term, source: answer.source, weight }));
        hits.push(`${axis.toLowerCase()}:${term}`);
      } else {
        unanswered[axis].push(term);
      }
      // A template's own published refusal, and it only applies to artistic language. A market word
      // cannot trip a "not for radial symmetry", because that sentence is not about the market.
      if (axis !== "MARKET") {
        const no = corpora.NOT_FOR.find((t) => related(t, term));
        if (no !== undefined) {
          refusals += AXIS_WEIGHTS.NOT_FOR;
          evidence.push(Object.freeze({ axis: "NOT_FOR", briefTerm: term, catalogTerm: no, source: "notFor", weight: AXIS_WEIGHTS.NOT_FOR }));
          hits.push(`notFor:${term}`);
        }
      }
    }

    const artistic = ARTISTIC_AXES.reduce((sum, axis) => sum + axes[axis], 0) + refusals;
    return Object.freeze({
      id,
      runtimeId: d.runtime.id,
      // `score` IS the artistic score. The market total is carried beside it and never folded in,
      // because a single number is exactly what let market language decide an artistic question.
      score: artistic,
      artistic,
      market: axes.MARKET,
      axes: Object.freeze({ ...axes, NOT_FOR: refusals }),
      evidence: Object.freeze(evidence),
      // THE MARKET DYNAMICS THIS TEMPLATE DOES NOT BIND. The highest-value thing a receipt knew and
      // did not say: a creator asking for "densifies under stress" against a template that binds no
      // stress sensor should be told so, because sensors are theirs to change and nobody can change
      // what nobody mentioned. It is disclosure, never a penalty — a starting point is not a cage.
      // Only the terms that name a SENSOR THIS PLATFORM SUPPORTS. "trading" and "rises" are market
      // language but they are not dynamics anything could be bound to, and listing them as things
      // the template "does not answer" is noise dressed as disclosure. The sensor vocabulary is read
      // from the catalog, never typed here, so a sensor added later is covered on the day it lands.
      unboundMarketTerms: Object.freeze(
        unanswered.MARKET.filter((t) => supportedSensors.some((sensor) => related(sensor, t))),
      ),
      boundSensors: corpora.boundSensors,
      matched: Object.freeze([...new Set(hits)]),
    });
  });

  // THE COMPARISON IS LEXICOGRAPHIC, AND THAT IS HOW "MARKET MUST NOT DOMINATE" IS GUARANTEED.
  // Artistic first; market only where artistic is level; id last so a run is reproducible, because
  // a random tiebreak makes an agent's choice unrepeatable and an unrepeatable choice cannot be
  // reviewed. Folding market into one total would make the guarantee a matter of weights, and a
  // weight can be edited to dominate by someone who never reads this comment.
  return Object.freeze([...scored].sort((a, b) => b.artistic - a.artistic || b.market - a.market || (a.id < b.id ? -1 : 1)));
}

/**
 * The last thing every autonomous selection passes through.
 *
 * A backstop: it fires only if the pool filter and the matcher's own refusal have both been
 * weakened. It is exported so it can be broken on its own and shown to turn a named test red, which
 * an unreachable inline `if` cannot be.
 */
export function assertAutonomousSelection(templateId) {
  if (!isAutonomouslySelectable(templateId)) {
    throw new Error(`selectForAutonomousAgent produced a ${templateStatus(templateId)} template (${templateId}). This is a bug in the filter, not a permitted outcome.`);
  }
  return templateId;
}

/**
 * THE AUTONOMOUS PATH, end to end. Stages 2 through 6.
 *
 * TAKES NO TIER ARGUMENT AND HAS NO OVERRIDE. An autonomous agent cannot ask for an EXPERIMENTAL,
 * HELD or REJECTED template because there is no way to express the request: the pool comes from
 * `shipCatalog()`, the matcher refuses anything else it is handed, and the final answer is checked
 * a third time before it is returned.
 *
 * @returns {{selected: string|null, reason: string, considered: readonly object[], dropped: readonly object[], pipeline: readonly object[]}}
 */
export function selectForAutonomousAgent({ brief, registrySnapshot = null, availability = null } = {}) {
  const live = availability ?? runtimeAvailability(registrySnapshot);
  const pool = shipCatalog();
  const { kept, dropped } = capabilityFilter(pool, live);

  const base = { pipeline: SELECTION_PIPELINE, dropped, availability: live, poolSize: pool.length };

  if (kept.length === 0) {
    return Object.freeze({
      ...base,
      selected: null,
      considered: Object.freeze([]),
      reason:
        "NO_ACTIVE_RUNTIME — every SHIP template belongs to a runtime this chain does not currently carry as ACTIVE. This is a live reading, not a checked-in status: re-read the registry rather than editing a file.",
    });
  }

  const ranked = semanticMatch(kept, brief);
  const best = ranked[0];
  // THE THRESHOLD IS ARTISTIC, AND A BRIEF THAT ONLY DESCRIBES MARKET BEHAVIOUR IS REFUSED.
  // Every template in the wave responds to the market, so "changes during recovery" distinguishes
  // none of them: answering it would be picking on a coin toss and calling it a match. Market
  // evidence refines a choice between artistically comparable candidates; it never makes one.
  if (!best || best.artistic <= 0) {
    // ================================================================================================
    // THE REFUSAL IS WRITTEN FROM WHAT THE CREATOR SAID, NOT FROM WHAT THE SCORE CAME OUT AS.
    //
    // It used to be chosen by score shape — "did anything score on the market axis?" — and an
    // independent reviewer showed that this makes a CORRECT refusal ship a FALSE accusation. The
    // brief "a mirrored low-resolution pixel idol: a corroded bronze totem figure, sixteen by
    // sixteen" was told it "names market behaviour but no medium, motif or aesthetic" and invited to
    // "say what the picture should BE and ask again". It had said, in detail. The refusal was right;
    // the sentence explaining it was false, and it blamed the creator for the catalog's limits.
    //
    // So the message is derived from the brief's OWN classified terms. A brief that named a medium
    // or a motif this wave does not draw is told that. A brief that named only market behaviour is
    // told the different, true thing: every template here responds to the market, so those words
    // choose between none of them.
    // ================================================================================================
    const said = classifyBriefTerms(brief);
    const artisticSaid = said.filter((t) => ARTISTIC_AXES.includes(t.axis));
    const marketSaid = said.filter((t) => t.axis === "MARKET");
    const quote = (list) => list.slice(0, 6).map((t) => `"${t.term}"`).join(", ");

    // THE CAPABILITY CASE COMES FIRST AND IT SUPPRESSES THE CATALOG SENTENCE ENTIRELY.
    //
    // It used to be appended, and an independent reviewer found the result asserting both halves of
    // a contradiction in one string: "no SHIP template in this wave draws that … 1 SHIP template was
    // removed because its runtime is not ACTIVE on this chain." For the brief "recursive
    // self-similar geometry, rings inside rings, cut back by drawdown" the wave contains a near
    // paraphrase of the catalog entry — it was simply not available on that chain. A creator who
    // reads the headline abandons an idea that is one chain away from a close match.
    //
    // So a run whose pool was narrowed may not say anything about the catalog at all. It knows what
    // happened on THIS chain and nothing more, and that is exactly what it says.
    if (dropped.length > 0) {
      const why = `NO_SEMANTIC_MATCH — ${dropped.length} SHIP template(s) were removed BEFORE matching because their runtime is not ACTIVE on this chain (${[...new Set(dropped.map((x) => `${x.runtimeId} ${x.state}`))].join("; ")}), and nothing in the pool that remained answers this brief. This is a finding about THIS CHAIN, not about the catalog: the same brief may be answerable where those runtimes are carried, so re-read the registry on another chain rather than rewriting the brief.`;
      return Object.freeze({ ...base, selected: null, reason: why, considered: ranked });
    }

    // AND NO REFUSAL TAKES CREDIT FOR RESTRAINT IT DID NOT EXERCISE. The old wording — "reaching for
    // a template that did not clear review because a couple of its words fit would be worse than
    // declining" — described a choice that does not exist: the tier filter runs before the match, so
    // an unapproved template was never a candidate here. Claiming a decision the architecture made
    // for you is a small lie in a place a creator has no way to check.
    let why;
    if (artisticSaid.length > 0) {
      why = `NO_SEMANTIC_MATCH — this brief names ${quote(artisticSaid)}, and no SHIP template in this wave draws that. The refusal is about the catalog, not about the brief.`;
    } else if (marketSaid.length > 0) {
      why = `NO_SEMANTIC_MATCH — this brief names market behaviour (${quote(marketSaid)}) but no medium, motif or aesthetic, and every SHIP template in the wave responds to the market. Those words choose between none of them, so declining is the answer; say what the picture should BE and ask again.`;
    } else {
      why = "NO_SEMANTIC_MATCH — nothing in this brief describes a picture. Declining is the correct outcome.";
    }
    return Object.freeze({ ...base, selected: null, reason: why, considered: ranked });
  }

  // THIRD GUARD, and it is a NAMED, EXPORTED function rather than an inline `if` on purpose.
  // An inline check here would be unreachable while the two in front of it hold, and an unreachable
  // guard cannot be broken by a mutation and shown to turn a test red — which makes it decorative,
  // whatever it says. As its own function it is exercised directly.
  const receipt = MATCH_AXES.filter((a) => best.axes[a] !== 0).map((a) => `${a.toLowerCase()} ${best.axes[a]}`).join(", ");
  const runnerUp = ranked[1];
  const decidedBy = runnerUp && runnerUp.artistic === best.artistic ? (runnerUp.market === best.market ? "id (an exact tie)" : "market behaviour (artistically level)") : "artistic match";
  // WHAT THE STARTING POINT DOES NOT ANSWER, SAID OUT LOUD. A creator who asks for "densifies under
  // stress" and is handed a template binding no stress sensor should hear it here rather than
  // discover it in a render — and hearing it is useful precisely BECAUSE the preset is a starting
  // point: sensors are among the things they may change, and nobody changes what nobody mentioned.
  const unbound = best.unboundMarketTerms.length > 0
    ? ` This starting point binds ${best.boundSensors.join(", ") || "no sensors"}, so it does not currently answer ${best.unboundMarketTerms.map((t) => `"${t}"`).join(", ")} — the sensor bindings are yours to change.`
    : "";
  // EVERY HIT NAMES WHERE IT CAME FROM. A reviewer reading "motif 2; motif:structure" was told this
  // template has a STRUCTURE motif; it does not — the word occurs once, inside the use-case sentence
  // "a project that wants drawdown to remove structure rather than add it", in a different sense. A
  // tally without provenance makes a curated tag and a homonym in a prose sentence look identical,
  // and the receipt already knew the difference. Now it says it.
  const evidence = best.evidence.filter((e) => e.axis !== "NOT_FOR").map((e) => `${e.axis.toLowerCase()}:${e.briefTerm}->${e.catalogTerm}(${e.source})`);
  // AND THE WORDS THAT SCORED FOR NOBODY. A brief saying "recursive vector lattice" names two
  // engines, and the receipt showed 3-0 with an empty evidence list for the loser — which understates
  // the contest it exists to document. A runtime's label is not scored for anyone (see
  // `runtimeMediumTerms`), so a creator who used one deserves to be told that is why it is missing,
  // rather than left to conclude their word was simply ignored.
  const labelWords = new Set(Object.keys(RUNTIMES).flatMap((id) => terms(id)));
  const saidLabels = [...new Set(classifyBriefTerms(brief).map((t) => t.term).filter((t) => labelWords.has(t)))];
  const labelNote = saidLabels.length > 0
    ? ` Note that ${saidLabels.map((t) => `"${t}"`).join(", ")} names a runtime and is scored for no candidate, here or anywhere — a label is not evidence about art.`
    : "";
  return Object.freeze({
    ...base,
    selected: assertAutonomousSelection(best.id),
    considered: ranked,
    reason: `MATCHED on ${decidedBy} — ${receipt || "no axis"}; ${evidence.join(", ") || "brief terms"}.${unbound}${labelNote}`,
  });
}

/**
 * What a HUMAN surface lists. Separate function, separate rules, on purpose.
 *
 * A human passing `--experimental` has asked to see work that did not clear the bar and is shown
 * its measured weakness beside it. An agent has asked nothing and read nothing. The two questions
 * are answered by two functions so that widening one cannot widen the other by accident — which is
 * what a single function with an options bag would allow.
 *
 * The advanced tiers come back as REDUCED records with `offeredAsAStartingPoint: false` and no
 * descriptor. Seeing what was judged is not the same as being handed a starting point, and the
 * difference has to survive into the data or tooling will erase it.
 */
export function humanCatalog({ advanced = false } = {}) {
  const shipped = TEMPLATE_DESCRIPTORS.map((d) => d.id)
    .filter((id) => isVisibleToHuman(id, { advanced: false }))
    .map((id) => describeTemplate(id));
  if (advanced !== true) return Object.freeze(shipped);

  const others = allTemplateIds()
    .filter((id) => isAdvancedVisible(id))
    .map((id) => describeUnshippedTemplate(id))
    .filter(Boolean);
  return Object.freeze([...shipped, ...others]);
}
