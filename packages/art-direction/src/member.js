// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MEMBER VOCABULARY — what KIND of mark the work is made of.
//
// THE DEFECT THIS FIXES, IN THE REVIEWERS' OWN WORDS. Four of twelve round-two final refusals were
// one sentence: the mark is the wrong kind of mark.
//
//     "the dominant mark is a 10:1 rectangular slab, not a rounded cell"
//     "there is no stroke anywhere in the work; everything is filled translucent shape"
//     "the body is a fan of filled overlapping gold slabs -- a solid pad, not line work"
//     "roughly half the collection reads as filigree; the other half does not"
//
// The author's whole member decision was `strokeMode`, a TWO-VALUED switch — `LINEWORK` or
// `SOLID` — crossed with a density word, reaching nine primitives, six shapes, eight variant
// sub-modes and a stroke flag through one binary. A brief asking for a rounded cell and a brief
// asking for a hairline both arrived at the same two answers.
//
// So this is a vocabulary of NAMED MARKS, of the same shape the mechanism vocabulary got for the
// market axis: each entry is a measured primitive x stroke x variant combination (x shape, on the
// recursion runtime), and a brief naming a mark this catalog cannot make is REFUSED rather than
// approximated.
//
// ------------------------------------------------------------------------------------------------
// THE ORDERING NUMBER IS `boundaryShare`, AND IT IS MEASURED, NOT ASSERTED
// ------------------------------------------------------------------------------------------------
// `strokeSignature` (`@relics/art-review`'s morphology) reads the share of ink pixels that sit on a
// boundary. A thread is nearly all boundary; a plate is nearly none. That one number orders the
// whole vocabulary and it is the number `inkCoverage` cannot produce: a hairline lattice and a
// solid slab can carry identical coverage and are not the same mark.
//
// Measured 2026-09-07 at 120px against the declared ground, on the DEPLOYED runtimes, twelve
// authoring seeds (`packages/art-direction/measurements/member-atlas.json`):
//
//     VECTOR_COMPOSITION_V1     plate 0.264 · disc 0.282 · facet 0.330 · shard 0.353
//                             | frame 0.383 · ring 0.405 · blade 0.506 · hook 0.549
//                             | thread 0.575 · filament 0.667
//     GEOMETRIC_RECURSION_V1    plate 0.073 · disc 0.067 · facet 0.071 · shard 0.091
//                             | frame 0.321 · ring 0.350
//
// **THE NUMBER IS NOT COMPARABLE ACROSS RUNTIMES AND AN ABSOLUTE BAND WAS THE WRONG CHECK.** The
// first cut of this file asserted one band per member — `PLATE` in 0.10..0.23 — and the measurement
// put the recursion runtime's plate at 0.073 and the vector runtime's at 0.264, both outside it,
// while every family claim in the file was correct. Boundary share is a ratio of perimeter to area
// and it therefore scales with the SIZE of the element: a recursion node at depth 3 is a large
// shape and a vector site at sizeMax 30 is a small one, so the same mark reads three times apart on
// the two runtimes. An absolute band measures the element size and calls it the mark.
//
// So the claim this file makes is RELATIVE and scale-free: **on each runtime, every MASS member
// measures below every LINE member.** Measured, the gap is 0.353 -> 0.383 on the vector runtime and
// 0.091 -> 0.321 on the recursion one. `assertMemberVocabularyCurrent` checks exactly that, per
// runtime, and fails loudly if an entry crosses.
//
// ------------------------------------------------------------------------------------------------
// WHAT THIS FILE DOES NOT DO
// ------------------------------------------------------------------------------------------------
// It does not judge a mark. `boundaryShare` is not a quality score and may never become one — a
// monumental brief wants it low and a filigree brief wants it high, and which is right is the
// brief's business. And it does not decide the composition: WHERE the marks go is
// `composition.js`, and the two are deliberately separate because round two proved they are
// separate failures. Five refusals were composition and four were member, and only one case failed
// both.
// ================================================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rx = (s) => new RegExp(s, "i");

/**
 * Words that INVERT the phrase they precede — the same list `author.js` and `mechanism.js` carry,
 * for the same measured reason: careful prose says what a thing is NOT at least as often as what
 * it is, and a direction that says "not a filled mass" must not be read as asking for one.
 */
const NEGATORS = /\b(no|not|never|without|avoid\w*|free\s+of|absent|lack\w*|refus\w*|neither|nor|rather\s+than|instead\s+of)\b/i;

function negatedAt(haystack, index) {
  const start = Math.max(
    haystack.lastIndexOf(".", index),
    haystack.lastIndexOf(",", index),
    haystack.lastIndexOf(";", index),
    haystack.lastIndexOf("\n", index),
  );
  return NEGATORS.test(haystack.slice(start + 1, index));
}

/**
 * The two families, and the boundary between them is MEASURED rather than chosen.
 *
 * `MASS` members read as area with an edge; `LINE` members read as an edge with no area. There is
 * deliberately NO absolute dividing value — see the header: boundary share scales with element size
 * and the two runtimes draw at different scales, so the only scale-free claim is the ORDERING
 * within one runtime. A member whose measured share crosses its family on its own runtime is a
 * FAILURE of this file, not a re-classification: the catalog asserts a family and the atlas checks
 * it.
 */
export const MEMBER_FAMILIES = Object.freeze(["MASS", "LINE"]);

/**
 * THE MEMBER CATALOG.
 *
 * `vector` and `recursion` carry the parameter assignment for each runtime, or `null` where that
 * runtime has no way to draw the mark. A `null` is a REFUSAL and it is the point of the file: a
 * brief asking for a hairline thread on GEOMETRIC_RECURSION_V1 is asking for something whose only
 * stroke-forced primitive the atlas measures at ink120 0.060 and calls a manufacturer of near-blank
 * tokens, so the honest answer is the other runtime.
 *
 * `family` is the entry's claim about the mark, and it is checked RELATIVELY rather than against a
 * band: `assertMemberVocabularyCurrent` requires every MASS member of a runtime to measure below
 * every LINE member of the SAME runtime. See the header for why an absolute band was wrong.
 */
export const MEMBERS = Object.freeze([
  Object.freeze({
    id: "PLATE",
    family: "MASS",
    what: "a filled rectangular slab — the heaviest mark either runtime draws",
    patterns: [
      rx(String.raw`\b(slab|plate|block|brick|plank|panel|tablet|monolith\w*|bar)s?\b`),
      rx(String.raw`\b(rectangular|square)\s+(mass|form|member|element|shape)s?\b`),
    ],
    vector: { primitive: "RECT", stroke: false, variant: 0 },
    recursion: { shape: "SQUARE", stroke: false, variant: 0 },
  }),
  Object.freeze({
    id: "DISC",
    family: "MASS",
    what: "a filled round cell — mass without a corner",
    patterns: [
      rx(String.raw`\b(disc|disk|cell|blob|nodule|bead|pellet|dot|globule|sphere)s?\b`),
      rx(String.raw`\b(round\w*|circular|rounded)\s+(cell|mass|form|member|element|shape)s?\b`),
    ],
    vector: { primitive: "CIRCLE", stroke: false, variant: 0 },
    recursion: { shape: "CIRCLE", stroke: false, variant: 0 },
  }),
  Object.freeze({
    id: "FACET",
    family: "MASS",
    what: "a filled polygon — mass with a countable number of sides",
    patterns: [
      rx(String.raw`\b(facet|polygon\w*|hexagon\w*|crystal\w*|prism\w*|cell\s+wall)s?\b`),
      rx(String.raw`\b(faceted|angular|many[- ]sided)\b`),
    ],
    vector: { primitive: "NGON", stroke: false, variant: 3 },
    recursion: { shape: "HEX", stroke: false, variant: 0 },
  }),
  Object.freeze({
    id: "SHARD",
    family: "MASS",
    what: "a filled triangular splinter — the lightest mass member, and pointed",
    patterns: [
      rx(String.raw`\b(shard|splinter|wedge|triangle|triangular|spike|sliver|fragment)s?\b`),
    ],
    vector: { primitive: "NGON", stroke: false, variant: 0 },
    recursion: { shape: "TRIANGLE", stroke: false, variant: 0 },
  }),
  Object.freeze({
    id: "FRAME",
    family: "LINE",
    what: "an unfilled rectangle — a mark that encloses without weighing",
    // `frame`, `border` and bare `outline` ARE DELIBERATELY NOT PATTERNS HERE, and each omission
    // is a measured false positive rather than caution. Every one of B01, B05 and B09 says "the
    // frame" meaning THE CANVAS EDGE — "commands the frame", "clear of the frame" — and matching
    // it sent three briefs whose subject is mass to a hollow outline. Bare `outline` is the
    // recorded B09 defect verbatim: the word appears once, in a subordinate clause of
    // thumbnailIntent ("the fracture is visible as broken outline"), and it outvoted four
    // deliberate nouns about weight. A mark is named by a noun for the mark.
    patterns: [
      rx(String.raw`\b(enclosure|casing|surround|perimeter\s+line|open\s+box)s?\b`),
      rx(String.raw`\b(hollow|unfilled|empty|open)\s+(rectangle|square|box|form|shape)s?\b`),
      rx(String.raw`\bdrawn\s+as\s+an?\s+outline\b`),
    ],
    vector: { primitive: "RECT", stroke: true, variant: 0 },
    recursion: { shape: "SQUARE", stroke: true, variant: 0 },
  }),
  Object.freeze({
    id: "RING",
    family: "LINE",
    what: "an unfilled circle — enclosure without a corner",
    patterns: [
      rx(String.raw`\b(ring|annul\w+|halo|hoop|circlet|orbit\s+line)s?\b`),
      rx(String.raw`\b(hollow|unfilled|open|empty)\s+(circle|disc|disk|round)s?\b`),
    ],
    vector: { primitive: "CIRCLE", stroke: true, variant: 0 },
    recursion: { shape: "CIRCLE", stroke: true, variant: 0 },
  }),
  Object.freeze({
    id: "BLADE",
    family: "LINE",
    what: "a long thin lens — a mark with a direction and almost no width",
    patterns: [
      rx(String.raw`\b(blade|leaf|lens|lozenge|spindle|petal|frond|lanceolate)s?\b`),
      rx(String.raw`\b(elongat\w+|slender|tapering)\s+(form|mark|member|element)s?\b`),
    ],
    vector: { primitive: "ELLIPSE", stroke: false, variant: 0 },
    // GEOMETRIC_RECURSION_V1 has six shapes and none of them is an ellipse: its primitives are
    // regular by construction and the atlas says so in its own `can` statement. DIAMOND is the
    // nearest thing and it is NOT the same mark, so this is a refusal rather than a substitution.
    recursion: null,
  }),
  Object.freeze({
    id: "THREAD",
    family: "LINE",
    what: "a straight hairline — a mark that is only a stroke",
    patterns: [
      rx(String.raw`\b(thread|hairline|filament|line ?work|wire|strand|fibre|fiber|tendril|stroke)s?\b`),
      rx(String.raw`\b(fine|thin|drawn|etched|engraved|incised)\s+lines?\b`),
    ],
    vector: { primitive: "LINE", stroke: true, variant: 0 },
    // The recursion runtime draws a node as a SHAPE, never as a segment. Its one stroke-forced
    // member is CROSS, which the atlas measures at ink120 0.060 against SQUARE's 0.399 and records
    // as a manufacturer of near-blank tokens with no warning. Stroking a square is a FRAME, not a
    // thread. There is no hairline here and pretending otherwise is how a brief gets authored into
    // a mark it did not ask for.
    recursion: null,
  }),
  Object.freeze({
    id: "FILAMENT",
    family: "LINE",
    what: "a jointed hairline — a thread with a change of direction in it",
    patterns: [
      rx(String.raw`\b(filigree|tracery|jointed|zigzag|kinked|folded\s+line|polyline)s?\b`),
      rx(String.raw`\b(branch\w*|forking|dividing)\s+(thread|line|hair)s?\b`),
    ],
    vector: { primitive: "POLYLINE", stroke: true, variant: 0 },
    recursion: null,
  }),
  Object.freeze({
    id: "HOOK",
    family: "LINE",
    what: "a curved segment — the only member with a real arc in it",
    patterns: [
      rx(String.raw`\b(arc|curve|hook|crescent|bow|sweep|swirl)s?\b`),
      rx(String.raw`\b(curv\w+|arcing|bowed)\s+(mark|member|element|line)s?\b`),
    ],
    vector: { primitive: "ARC", stroke: true, variant: 0 },
    // The recursion runtime's `cannot` list names "a curve or an arc" outright.
    recursion: null,
  }),
]);

export const MEMBER_IDS = Object.freeze(MEMBERS.map((m) => m.id));

/** The catalog entry, refusing an id it does not carry by name rather than returning undefined. */
export function memberFor(memberId) {
  const m = MEMBERS.find((x) => x.id === memberId);
  if (!m) throw new Error(`${JSON.stringify(memberId)} is not a member this catalog names. It carries: ${MEMBER_IDS.join(", ")}`);
  return m;
}

const RUNTIME_KEY = Object.freeze({
  VECTOR_COMPOSITION_V1: "vector",
  GEOMETRIC_RECURSION_V1: "recursion",
});

/**
 * How this runtime draws this mark, or `null` if it cannot.
 *
 * A `null` is the whole value of the function. The alternative — returning the nearest thing — is
 * exactly what `strokeMode: SOLID` did to four briefs in round two.
 */
export function memberParameters(runtimeId, memberId) {
  const key = RUNTIME_KEY[runtimeId];
  if (!key) throw new Error(`memberParameters: ${runtimeId} is not a Wave-1 runtime`);
  const p = memberFor(memberId)[key];
  return p ? { ...p } : null;
}

/** Which members this runtime can draw at all. DERIVED from the catalog, never listed. */
export function membersFor(runtimeId) {
  const key = RUNTIME_KEY[runtimeId];
  if (!key) throw new Error(`membersFor: ${runtimeId} is not a Wave-1 runtime`);
  return MEMBERS.filter((m) => m[key] !== null).map((m) => m.id);
}

/**
 * Which member a brief or direction names, scored by DISTINCT supporting phrases.
 *
 * SCORED, NOT RACED, for the reason `deriveIntent` records: one incidental noun in a subordinate
 * clause outvoted four deliberate ones and sent a brief about mass to a hairline. A tie is
 * reported as a tie and the caller decides; this function does not invent a winner.
 */
export function detectMembers(text) {
  const haystack = String(text ?? "");
  const scored = [];
  for (const m of MEMBERS) {
    const hits = [];
    const rejected = [];
    for (const p of m.patterns) {
      for (const hit of haystack.matchAll(new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`))) {
        if (negatedAt(haystack, hit.index)) { rejected.push(hit[0].toLowerCase()); continue; }
        if (!hits.includes(hit[0].toLowerCase())) hits.push(hit[0].toLowerCase());
      }
    }
    if (hits.length) scored.push({ id: m.id, family: m.family, score: hits.length, phrases: hits, rejected });
  }
  scored.sort((a, b) => b.score - a.score || MEMBER_IDS.indexOf(a.id) - MEMBER_IDS.indexOf(b.id));
  const top = scored.length ? scored.filter((s) => s.score === scored[0].score) : [];
  return { members: scored, best: scored[0] ?? null, tied: top.length > 1 ? top.map((t) => t.id) : [] };
}

/**
 * The member a brief asks for, resolved against what this runtime can draw.
 *
 * Three outcomes and they are deliberately different from each other:
 *   `NAMED`     the brief names a mark and this runtime draws it
 *   `REFUSED`   the brief names a mark and this runtime cannot draw it — an admission fact
 *   `DEFAULT`   the brief names no mark, and the stated default is used and RECORDED as a default
 *
 * The default is stated rather than silent, like every entry in `INTENT_VOCABULARY`, so a receipt
 * distinguishes a choice from an absence.
 */
export const DEFAULT_MEMBER = Object.freeze({
  VECTOR_COMPOSITION_V1: "PLATE",
  GEOMETRIC_RECURSION_V1: "PLATE",
});

export function resolveMember({ runtimeId, text }) {
  const read = detectMembers(text);
  if (!read.best) {
    const id = DEFAULT_MEMBER[runtimeId];
    return { outcome: "DEFAULT", memberId: id, parameters: memberParameters(runtimeId, id), detail: `the direction names no mark; defaulting to ${id}`, evidence: [], tied: [] };
  }
  // A TIE FALLS TO THE DEFAULT WHEN THE DEFAULT IS TIED, and to declaration order otherwise —
  // the same rule `deriveIntent` uses, and for the same reason: a tie IS "the direction does not
  // settle this", which is what a stated default is for.
  const tiedIds = read.tied;
  const chosenId = tiedIds.length > 1 && tiedIds.includes(DEFAULT_MEMBER[runtimeId]) ? DEFAULT_MEMBER[runtimeId] : read.best.id;
  const params = memberParameters(runtimeId, chosenId);
  if (!params) {
    const alternatives = membersFor(runtimeId);
    return {
      outcome: "REFUSED",
      memberId: chosenId,
      parameters: null,
      detail: `the direction asks for ${chosenId} (${memberFor(chosenId).what}) and ${runtimeId} has no way to draw it. This is an admission fact, not an authoring one: the members it can draw are ${alternatives.join(", ")}.`,
      evidence: read.best.phrases,
      tied: tiedIds,
    };
  }
  return { outcome: "NAMED", memberId: chosenId, parameters: params, detail: `read from the direction: ${read.best.phrases.map((p) => `"${p}"`).join(", ")}`, evidence: read.best.phrases, tied: tiedIds };
}

const MEMBER_ATLAS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "measurements", "member-atlas.json");

let _memberAtlas = null;

/** The committed member measurement. A caller that cannot read it gets a named refusal. */
export function memberAtlas() {
  if (_memberAtlas) return _memberAtlas;
  try {
    _memberAtlas = JSON.parse(readFileSync(MEMBER_ATLAS_PATH, "utf8"));
  } catch (err) {
    throw new Error(
      `MEMBER_ATLAS_UNREADABLE: ${MEMBER_ATLAS_PATH} could not be read — ${err.message}. ` +
      "Every family claim in this catalog is a statement about rendered frames, so without the " +
      "measurement there is no claim. Regenerate it with `npm run kit:artcomposition:measure`.",
    );
  }
  return _memberAtlas;
}

/**
 * Every family claim in this file, checked against the frames that were rendered.
 *
 * THE CHECK IS AN ORDERING, PER RUNTIME, AND THAT IS THE WHOLE POINT. A first cut checked each
 * member against an absolute band and every one of the eight failed while every family claim was
 * true, because boundary share scales with element size and the two runtimes draw at different
 * scales. What survives scaling is the ordering: on one runtime, mass below line.
 *
 * A LOAD-TIME-STYLE ASSERTION rather than a silent property, for the reason
 * `assertCapabilityMappingCurrent` gives: the failure guarded against is a vocabulary that has
 * quietly stopped describing the marks it names.
 */
export function assertMemberVocabularyCurrent() {
  const atlas = memberAtlas();
  const rows = (atlas.members ?? []).filter((r) => r.legal === true);
  if (rows.length === 0) throw new Error("MEMBER_ATLAS_EMPTY: the member atlas carries no legal measured rows. A vocabulary checked against nothing is not checked.");
  const problems = [];
  const byRuntime = new Map();
  for (const r of rows) {
    if (!byRuntime.has(r.runtimeId)) byRuntime.set(r.runtimeId, []);
    byRuntime.get(r.runtimeId).push(r);
  }
  for (const [runtimeId, group] of byRuntime) {
    const declared = new Set(membersFor(runtimeId));
    for (const id of declared) {
      if (!group.some((r) => r.memberId === id)) problems.push(`${runtimeId}: ${id} is declared drawable and was never measured`);
    }
    const mass = group.filter((r) => r.family === "MASS").map((r) => ({ id: r.memberId, v: r.distribution.boundaryShare.mean }));
    const line = group.filter((r) => r.family === "LINE").map((r) => ({ id: r.memberId, v: r.distribution.boundaryShare.mean }));
    if (mass.length === 0 || line.length === 0) { problems.push(`${runtimeId}: measured ${mass.length} MASS and ${line.length} LINE members — an ordering needs both sides`); continue; }
    const heaviestMass = mass.reduce((a, b) => (b.v > a.v ? b : a));
    const lightestLine = line.reduce((a, b) => (b.v < a.v ? b : a));
    if (heaviestMass.v >= lightestLine.v) {
      problems.push(`${runtimeId}: ${heaviestMass.id} (MASS, ${heaviestMass.v}) does not measure below ${lightestLine.id} (LINE, ${lightestLine.v}). The family claim has stopped being true of the frames.`);
    }
  }
  if (problems.length) throw new Error(`MEMBER_VOCABULARY_STALE — the member catalog disagrees with its own measurement:\n  ${problems.join("\n  ")}`);
  return { ok: true, runtimes: [...byRuntime.keys()], measured: rows.length };
}
