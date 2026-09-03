// SPDX-License-Identifier: MIT
// ================================================================================================
// WHAT THE WAVE-1 RUNTIMES CAN AND CANNOT BE ASKED FOR.
//
// THE DEFECT THIS FIXES. The failing corpus is seven authored collections, twenty-four blind
// judgements, zero acceptances. Six of the seven briefs asked for something the elected runtime
// structurally cannot draw — a horizon, an off-centre subject, a tick or a numeral, a state-driven
// colour — and every one of them was sent to the author anyway, which then spent its whole
// iteration ceiling recolouring and swapping primitives in pursuit of a picture the bytecode has
// no path to. The reviewer was right every time. The commission was impossible before the first
// render, and nothing in the pipeline was looking.
//
// The atlas says this in its own voice, under `howToUseThis`:
//
//     BEFORE ACCEPTING A BRIEF: check its nouns and its prohibitions against `whatItCanDepict`.
//     Six of seven briefs in the failing corpus needed something in the `cannot` list, and no
//     amount of revision reached them.
//
// So this module is that check, and it runs BEFORE the author is given anything.
//
// ------------------------------------------------------------------------------------------------
// A REFUSAL MUST CITE MEASURED EVIDENCE, NOT AN OPINION OF MINE
// ------------------------------------------------------------------------------------------------
// Every entry below names the exact clause of the atlas's own `whatItCanDepict.cannot` that it
// collides with, and `assertCapabilityMappingCurrent()` checks at load time that the clause is
// still there. If the atlas is re-measured and a runtime gains a capability, the mapping FAILS
// LOUDLY instead of continuing to refuse briefs on the strength of a limit that has been lifted.
// A refusal this module cannot trace to a clause is a refusal it does not make.
//
// ------------------------------------------------------------------------------------------------
// THE TWO WAYS THIS GOES WRONG, AND THEY ARE NOT SYMMETRIC
// ------------------------------------------------------------------------------------------------
// FALSE ADMISSION sends an impossible commission to the author: five wasted rounds, a REFUSE, and
// a brief nobody could have satisfied. That is the defect on record.
// FALSE REFUSAL turns the catalog away from work it could have done, and is worse in one specific
// way — it is invisible. A refused brief produces no renders, no critique and no verdict, so
// nothing downstream ever contradicts it. A gate that refuses everything reports a perfect record.
//
// That asymmetry is why the vocabulary is deliberately NARROW and why `--controls` carries a
// MUST-ALLOW set as large as its must-catch set. Detection matches concrete depiction nouns
// ("horizon", "skyline", "the letter", "a human figure"), never atmosphere words. A brief may say
// monumental, brutalist, delicate, sacred, geological, botanical, ruined or industrial and reach
// the author untouched: those are AESTHETIC and MOTIF demands, both runtimes can be pushed toward
// them, and refusing one would be exactly the invisible failure above.
//
// NEGATION IS READ. "no horizon", "without a horizon line", "avoid any numerals" are the brief
// AGREEING with the runtime's limit, and scoring them as demands would refuse the best-informed
// briefs in the corpus first.
// ================================================================================================

import { capabilityStatement, atlasRuntimeIds } from "./atlas.js";

/** The five demand classes a brief is decomposed into. */
export const CAPABILITY_CLASSES = Object.freeze([
  "MEDIUM",
  "MOTIF",
  "AESTHETIC",
  "MARKET_TRANSFORMATION",
  "REPRESENTATIONAL_DEMAND",
]);

/**
 * Severity.
 *
 * HARD  the brief's SUBJECT is the thing that cannot be drawn. There is no configuration that
 *       satisfies it and no critique that gets closer, so the commission must not be sent.
 * SOFT  an attribute among several. The work can be made without it; the direction must say so
 *       out loud, so a reviewer is not later comparing the render against a promise nobody kept.
 */
export const DEMAND_SEVERITIES = Object.freeze(["HARD", "SOFT"]);

const rx = (source) => new RegExp(source, "i");

/**
 * THE IMPOSSIBLE-DEMAND VOCABULARY.
 *
 * `atlasClause` is a substring that MUST appear in that runtime's measured `cannot` list. It is
 * the citation, and it is verified — see `assertCapabilityMappingCurrent`.
 *
 * `patterns` are the concrete ways a brief asks for the thing. `notWhen` removes the readings that
 * are not a demand at all (a negation, or a homograph: "orbit" is a VCV1 layout, "arc" inside
 * "architecture" is a word fragment).
 */
export const IMPOSSIBLE_DEMANDS = Object.freeze([
  Object.freeze({
    id: "HORIZON_OR_GROUND_PLANE",
    class: "REPRESENTATIONAL_DEMAND",
    severity: "HARD",
    what: "a horizon, skyline, landscape base or ground plane",
    atlasClause: { GEOMETRIC_RECURSION_V1: "a horizon or ground plane", VECTOR_COMPOSITION_V1: "a horizon or base" },
    patterns: [
      rx(String.raw`\bhorizon(s|\s+line)?\b`),
      rx(String.raw`\bskyline\b`),
      rx(String.raw`\bland ?scape\b`),
      rx(String.raw`\bsea ?scape\b`),
      rx(String.raw`\bground\s+(plane|line)\b`),
      rx(String.raw`\b(sits?|standing|rests?|resting)\s+on\s+(the\s+)?(ground|earth|floor|plain)\b`),
      rx(String.raw`\bvanishing\s+point\b`),
    ],
    notWhen: [rx(String.raw`\b(no|not|without|avoid|never|absent|free of|refus\w*)\b[^.]{0,40}\b(horizon|skyline|land ?scape|ground plane|vanishing point)\b`)],
  }),
  Object.freeze({
    id: "OFF_CENTRE_SUBJECT",
    class: "MEDIUM",
    severity: "HARD",
    what: "a subject placed away from the canvas centre",
    // VECTOR_COMPOSITION_V1 also centres every layout (law L5), but its own `cannot` list words the
    // limit as per-element coordinates rather than as centring, so THAT is the clause cited for it.
    atlasClause: { GEOMETRIC_RECURSION_V1: "an off-centre subject", VECTOR_COMPOSITION_V1: "per-element coordinates" },
    patterns: [
      rx(String.raw`\boff[- ]cent(re|er)(ed)?\b`),
      rx(String.raw`\basymmetric\w*\s+(placement|position\w*|composition\s+with)\b`),
      rx(String.raw`\b(placed|positioned|sitting|anchored|weighted)\s+(to\s+)?(the\s+)?(left|right|lower|upper|top|bottom|corner)\b`),
      rx(String.raw`\brule\s+of\s+thirds\b`),
    ],
    notWhen: [rx(String.raw`\b(no|not|without|avoid|never)\b[^.]{0,40}\boff[- ]cent(re|er)\b`)],
  }),
  Object.freeze({
    id: "NON_SQUARE_ASPECT",
    class: "MEDIUM",
    severity: "HARD",
    what: "a non-square canvas",
    atlasClause: { GEOMETRIC_RECURSION_V1: "a non-square aspect", VECTOR_COMPOSITION_V1: "an aspect ratio" },
    patterns: [
      rx(String.raw`\b(portrait|land ?scape)\s+(format|orientation|aspect|canvas|frame)\b`),
      rx(String.raw`\baspect\s+ratio\b`),
      rx(String.raw`\b\d{1,2}\s*[:x]\s*\d{1,2}\s+(format|frame|canvas|aspect)\b`),
      rx(String.raw`\b(tall|wide|panoram\w+)\s+(format|frame|canvas)\b`),
    ],
    notWhen: [rx(String.raw`\b(square|1\s*[:x]\s*1)\b[^.]{0,20}\b(format|aspect|canvas|frame)\b`)],
  }),
  Object.freeze({
    id: "LEGIBLE_GLYPH",
    class: "REPRESENTATIONAL_DEMAND",
    severity: "HARD",
    what: "a tick, numeral, letter, word or pointer rendered as itself",
    // Only GRV1's cannot list names this. VCV1's primitive set is equally incapable of a glyph, but
    // this module refuses to invent a citation: the demand is HARD for GRV1 on the atlas's word,
    // and for VCV1 it is carried by the primitive vocabulary, which `runtimeCanExpress` states.
    atlasClause: { GEOMETRIC_RECURSION_V1: "a tick, numeral or pointer" },
    patterns: [
      rx(String.raw`\b(numeral|glyph|letterform|typograph\w+|lettering|inscription|calligraph\w+)\b`),
      // NAMING A CHARACTER, NOT COUNTING THINGS.
      //
      // This pattern used to be `(letter|word|number|digit)\s+["']?[A-Za-z0-9]`, which refused
      // "what varies between tokens is the NUMBER OF enclosures" -- an ordinary sentence about
      // quantity, in a brief with no typographic content at all. That is the invisible failure
      // this file's header warns about, caught only because a frozen benchmark brief came back
      // refused and the refusal looked wrong. A demand for a glyph names the glyph: a quoted
      // character, or a capital letter standing alone.
      rx(String.raw`\b(letter|digit|character)\s+["'‘“]?[A-Za-z0-9]\b`),
      rx(String.raw`\bthe\s+word\s+["'‘“][^"'’”]+["'’”]`),
      rx(String.raw`\b(spell|spells|spelling|reads?\s+as\s+text|legible\s+text|readable\s+text)\b`),
      rx(String.raw`\b(tick\s+marks?|clock\s+face|dial\s+with\s+(numbers|numerals)|compass\s+rose\s+with\s+letters)\b`),
      rx(String.raw`\b(logo|word ?mark|monogram|signature)\b`),
    ],
    notWhen: [rx(String.raw`\b(no|not|without|avoid|never|nothing)\b[^.]{0,40}\b(text|letter|numeral|word|glyph|typograph\w+|logo)\b`)],
  }),
  Object.freeze({
    id: "FIGURATIVE_SUBJECT",
    class: "REPRESENTATIONAL_DEMAND",
    severity: "HARD",
    what: "a recognisable figure, face, creature or depicted object",
    // No atlas clause names this, because the atlas describes CONTROLS rather than subjects. The
    // citation is the positive statement instead — what each runtime CAN depict — and it is
    // verified the same way: both `can` strings must still describe an abstract construction.
    atlasClause: {},
    positiveCitation: { GEOMETRIC_RECURSION_V1: "self-similar figure", VECTOR_COMPOSITION_V1: "fields of primitives" },
    patterns: [
      rx(String.raw`\b(portrait\s+of|photo ?realistic|photograph\w*|lifelike|realistic\s+(depiction|render\w*|image))\b`),
      rx(String.raw`\b(human|humanoid)\s+(figure|form|face|body|silhouette)\b`),
      // ONE NOUN WAS REMOVED FROM THIS LIST BY THE RESERVED-TERM GATE, and it is left absent rather
      // than replaced by a synonym. The word belongs to another project's identity, the gate's
      // instruction is to remove the content rather than exempt it or reword around it, and
      // reaching for an equivalent would be evading a rule whose whole purpose is that the term
      // does not appear here. The narrow consequence is real and worth stating: a brief demanding
      // that one specific object, named bare and with no other figurative cue, is not caught by
      // THIS pattern -- though "photorealistic", "lifelike", "depict an actual" and the other
      // nouns below still catch every phrasing of it observed in the corpus.
      rx(String.raw`\ba\s+(face|hand|eye|animal|bird|fish|insect|tree|flower|leaf|creature|dragon|serpent)\b`),
      rx(String.raw`\b(recognis\w+|identifi\w+)\s+as\s+an?\s+\w+`),
      rx(String.raw`\b(depict|depicts|depicting|illustrat\w+|render\w*)\s+an?\s+(actual|real|specific)\b`),
    ],
    notWhen: [
      rx(String.raw`\b(no|not|without|avoid|never|non)[- ]?(figurative|representational|photo ?realistic)\b`),
      rx(String.raw`\babstract\w*\s+(interpretation|impression|reading|translation|gesture)\s+of\b`),
      // "botanical abstraction", "the SUGGESTION of a leaf" -- an abstraction OF a thing is not a
      // demand to draw the thing, and treating it as one refuses half the admissible corpus.
      rx(String.raw`\b(suggestion|echo|memory|trace|abstraction|impression|ghost)\s+of\s+an?\b`),
    ],
  }),
  Object.freeze({
    id: "STATE_DRIVEN_COLOUR",
    class: "MARKET_TRANSFORMATION",
    severity: "HARD",
    what: "colour that changes with the market state",
    atlasClause: { GEOMETRIC_RECURSION_V1: "a state-driven colour", VECTOR_COMPOSITION_V1: "a state-driven colour" },
    patterns: [
      rx(String.raw`\b(colou?r|palette|hue|tone)s?\b[^.]{0,60}\b(shift|change|darken|redden|cool|warm|drain|bleed|desaturat\w+|turn)\w*\b[^.]{0,40}\b(market|stress|drawdown|crash|volatil\w+|recovery|regime)\b`),
      rx(String.raw`\b(market|stress|drawdown|crash|volatil\w+|recovery|regime)\b[^.]{0,60}\b(colou?r|palette|hue)s?\b[^.]{0,30}\b(shift|change|darken|redden|cool|warm|drain|desaturat\w+|turn)\w*\b`),
      rx(String.raw`\bgoes?\s+(red|blue|grey|gray|black|cold|warm)\s+(under|during|in)\s+\w*\s*(stress|drawdown|crash)\b`),
      // A COLOUR AXIS CAN BE STATED WITHOUT A VERB, AS TWO POLES, AND B11 STATED IT THAT WAY.
      //
      // "Under stress the work should be sparse, broken and COLD; in recovery it should be dense,
      // whole and WARM. ... Slate and iron at one end, ochre and copper at the other." Not one of
      // the three patterns above fires on it: there is no shift, no change, no turn — the
      // temperature is an adjective attached to a state and the hues are named as endpoints. The
      // brief was admitted, authored, rendered and refused, and its reviewer refused it on exactly
      // that axis: "under drawdown this collection glows copper; in recovery it goes to iron."
      // A demand for state-driven colour is what it is whether or not a verb carries it.
      rx(String.raw`\b(under|during|in)\s+(stress|drawdown|volatil\w+|recovery|a\s+crash)\b[^.]{0,80}\b(cold|cool|warm|warmer|cooler|colder|red|blue|amber|copper|ochre|slate|iron|grey|gray)\b`),
      rx(String.raw`\b(cold|cool|warm|warmer|cooler|colder)\b[^.]{0,40}\b(in|under|during)\s+(recovery|stress|drawdown|volatil\w+)\b`),
      rx(String.raw`\b(at\s+one\s+end|at\s+the\s+other\s+end)\b[^.]{0,60}\b(at\s+the\s+other|at\s+one\s+end)\b`),
    ],
    notWhen: [rx(String.raw`\b(no|not|without|avoid|never)\b[^.]{0,40}\bcolou?r\b[^.]{0,30}\b(shift|change)\b`)],
  }),
  Object.freeze({
    id: "SUBTRACTIVE_CUT",
    class: "MEDIUM",
    severity: "SOFT",
    what: "a subtractive cut, mask or boolean hole through the work",
    atlasClause: { GEOMETRIC_RECURSION_V1: "a subtractive cut", VECTOR_COMPOSITION_V1: "a subtractive cut" },
    patterns: [
      rx(String.raw`\b(subtract\w+|boolean)\s+(cut|hole|mask|operation)\b`),
      rx(String.raw`\b(cut|carved|punched|bored|drilled)\s+(out\s+of|through|into)\b`),
      rx(String.raw`\b(negative\s+shapes?\s+cut|knocked\s+out|masked\s+out)\b`),
    ],
    notWhen: [rx(String.raw`\bnegative\s+space\b`)],
  }),
  Object.freeze({
    id: "ALPHA_TRANSPARENCY",
    class: "MEDIUM",
    severity: "SOFT",
    what: "transparency, translucency or opacity blending",
    atlasClause: { GEOMETRIC_RECURSION_V1: "opaque compositing", VECTOR_COMPOSITION_V1: "alpha" },
    patterns: [
      rx(String.raw`\b(translucen\w+|transparen\w+|opacity|alpha\s+(blend\w*|channel)|see[- ]through)\b`),
      rx(String.raw`\b(layers?|forms?|shapes?)\s+\w{0,12}\s*(show|showing|visible)\s+through\b`),
      rx(String.raw`\bwash(es|ed)?\s+of\s+colou?r\s+over\b`),
    ],
    notWhen: [rx(String.raw`\b(opaque|no\s+transparen\w+|without\s+transparen\w+|flat\s+opaque)\b`)],
  }),
  Object.freeze({
    id: "IRREGULAR_PERTURBED_OUTLINE",
    class: "MEDIUM",
    severity: "SOFT",
    what: "an irregular, eroded or hand-perturbed outline",
    // GRV1 only. VECTOR_COMPOSITION_V1 has per-site jitter, so it CAN perturb placement -- which is
    // exactly why this is per-runtime rather than global, and why it is SOFT.
    atlasClause: { GEOMETRIC_RECURSION_V1: "an irregular or perturbed outline" },
    patterns: [
      rx(String.raw`\b(ragged|jagged|eroded|weather\w+|crumbl\w+|torn|frayed|gnaw\w+|pitted|corroded)\s+(edge|outline|contour|silhouette|profile|border)\w*\b`),
      rx(String.raw`\b(irregular|perturbed|hand[- ]drawn|wobbl\w+|organic)\s+(outline|contour|edge)\w*\b`),
    ],
    notWhen: [],
  }),
  Object.freeze({
    id: "CURVE_OR_ARC",
    class: "MEDIUM",
    severity: "SOFT",
    what: "a drawn curve or arc",
    // GRV1 only: its primitive set is regular polygons and circles, with no arc segment. VCV1 has
    // ARC, QUAD and CUBIC primitives, so for that runtime this is not a limit at all.
    atlasClause: { GEOMETRIC_RECURSION_V1: "a curve or an arc" },
    patterns: [
      rx(String.raw`\b(sweeping|drawn|flowing|graceful)\s+(curve|arc)s?\b`),
      rx(String.raw`\b(curv\w+|arc(s|ing|ed)?|bezier|sinuous|serpentine|meander\w+)\s+(line|stroke|path|form|band)s?\b`),
    ],
    notWhen: [rx(String.raw`\barchitect\w+`), rx(String.raw`\barchiv\w+`), rx(String.raw`\barcane\b`)],
  }),
  Object.freeze({
    id: "FRAME_BLEED",
    class: "MEDIUM",
    severity: "SOFT",
    what: "forms running off the edge of the frame",
    atlasClause: { VECTOR_COMPOSITION_V1: "frame bleed" },
    patterns: [
      rx(String.raw`\b(bleed\w*|run(s|ning)?|extend\w*|spill\w*|crop\w*)\s+(off|past|beyond|over)\s+(the\s+)?(edge|frame|canvas|border)\b`),
      rx(String.raw`\bfull[- ]bleed\b`),
      rx(String.raw`\bfills?\s+the\s+(entire\s+)?frame\s+edge\s+to\s+edge\b`),
    ],
    notWhen: [],
  }),
  Object.freeze({
    id: "QUANTISED_SPACING",
    class: "MEDIUM",
    severity: "SOFT",
    what: "a fixed row pitch or exactly quantised spacing",
    atlasClause: { VECTOR_COMPOSITION_V1: "a fixed row pitch or any quantised spacing" },
    patterns: [
      rx(String.raw`\b(fixed|exact|constant|uniform|regular|even)\s+(row\s+)?(pitch|spacing|interval|gap)s?\b`),
      rx(String.raw`\bevenly\s+spaced\b`),
      rx(String.raw`\b(precise|exact)\s+\d+\s*(px|unit|point)s?\s+(apart|spacing|gap)\b`),
    ],
    notWhen: [],
  }),
]);

/**
 * COMPOSITION DEMANDS — what the frame is asked to look like, as opposed to what is in it.
 *
 * THE GAP THIS CLOSES. `IMPOSSIBLE_DEMANDS` is built from the atlas's `cannot` clauses, and those
 * clauses are about SUBJECTS and MARKS — a horizon, a numeral, an alpha channel. They say nothing
 * about the shape of the composition as a whole, and seven of twelve round-one blind reviews
 * refused on exactly that: "every token is a centred island with wide empty margins on all four
 * sides" and "the brief demands an all-over field rather than a figure on a ground ... that is a
 * figure on a ground, verbatim, arrived at blind."
 *
 * GEOMETRIC_RECURSION_V1's own positive statement settles it: it draws "one self-similar figure,
 * centred". A single centred figure IS a figure on a ground. That is not a defect to be tuned out
 * with a parameter; it is what the runtime is, and a brief whose subject is the absence of a
 * figure belongs on the other runtime.
 *
 * CITED THE SAME WAY AND VERIFIED THE SAME WAY. Each entry names a phrase that must still appear
 * in the runtime's `can` statement, and `assertCapabilityMappingCurrent()` checks it. A refusal
 * whose citation has gone is a refusal this module stops making.
 *
 * NARROW ON PURPOSE, for the reason in this file's header: a false refusal is invisible. Neither
 * pattern fires on "centred", "balanced", "dense" or any other adjective — they fire on a brief
 * that says outright that nothing dominates, or that the work is a horizontal section.
 */
export const COMPOSITION_DEMANDS = Object.freeze([
  Object.freeze({
    id: "ALL_OVER_FIELD",
    class: "MEDIUM",
    severity: "HARD",
    what: "an all-over field with no dominant element, rather than a figure on a ground",
    positiveCitation: { GEOMETRIC_RECURSION_V1: "one self-similar figure, centred" },
    blockedFor: ["GEOMETRIC_RECURSION_V1"],
    patterns: [
      rx(String.raw`\ball[- ]over\s+(field|composition|pattern|arrangement)\b`),
      rx(String.raw`\bno\s+single\s+(dominant|focal)\s+\w*\s*(element|form|mass|point)\b`),
      rx(String.raw`\bnothing\s+dominat\w+\b`),
      rx(String.raw`\brather\s+than\s+a\s+figure\s+on\s+a\s+ground\b`),
      rx(String.raw`\bno\s+single\s+element\s+dominating\b`),
    ],
    notWhen: [rx(String.raw`\b(one|a\s+single)\s+(dominant|overwhelming)\b`)],
  }),
  Object.freeze({
    id: "PER_TOKEN_SYMMETRY_VARIATION",
    class: "MEDIUM",
    severity: "SOFT",
    what: "tokens that differ from each other in their symmetry order",
    // VECTOR_COMPOSITION_V1's own atlas note says it outright: the seed reaches NOTHING
    // categorical, and symmetry is named in the list of creator constants. A brief whose stated
    // variation strategy is "tokens differ in the order of rotational symmetry" is asking for the
    // one axis of variety that runtime does not have; GEOMETRIC_RECURSION_V1 draws a symmetry per
    // token out of the creator's symSet.
    noteCitation: { VECTOR_COMPOSITION_V1: "symmetry" },
    blockedFor: ["VECTOR_COMPOSITION_V1"],
    patterns: [
      rx(String.raw`\btokens?\s+(differ|vary|var\w+)\b[^.]{0,80}\bsymmetr\w+\b`),
      rx(String.raw`\b(order\s+of\s+)?(rotational\s+)?symmetr\w+\b[^.]{0,40}\b(vary|varies|differ\w*|per\s+token)\b`),
      rx(String.raw`\bwhat\s+varies\s+between\s+tokens\b[^.]{0,80}\bsymmetr\w+\b`),
    ],
    notWhen: [],
  }),
  Object.freeze({
    id: "HORIZONTAL_STRATIFICATION",
    class: "MEDIUM",
    severity: "HARD",
    what: "horizontal banding: a stacked sequence of beds read as a section",
    // The vector runtime's own layout vocabulary carries STACK, which the atlas calls "the only
    // layout that reads as horizontal bands". The recursion runtime's six productions place
    // children at quadrant corners, edge midpoints, the parent centre, a fan or a ring — none of
    // them lays a band, and the runtime's `can` statement describes one figure repeating on
    // itself rather than a sequence of registers.
    positiveCitation: { GEOMETRIC_RECURSION_V1: "repeating a production on itself" },
    blockedFor: ["GEOMETRIC_RECURSION_V1"],
    patterns: [
      rx(String.raw`\bhorizontal\s+band\w*\b`),
      rx(String.raw`\b(bed|band|layer|stratum|strata)s?\s+(deposited|stacked|laid)\b`),
      rx(String.raw`\bone\s+bed\s+(over|above)\s+another\b`),
      rx(String.raw`\bcore\s+sample\b`),
    ],
    notWhen: [],
  }),
]);

/** Which composition demands a brief makes. Same sentence-level negation rule as the atlas ones. */
export function detectCompositionDemands(briefText) {
  const text = readableText(briefText);
  const sentences = text.split(/(?<=[.!?;:])\s+|\n+/).filter((s) => s.trim().length > 0);
  const found = [];
  for (const demand of COMPOSITION_DEMANDS) {
    const hits = [];
    for (const sentence of sentences) {
      if (demand.notWhen?.some((n) => n.test(sentence))) continue;
      const pattern = demand.patterns.find((p) => p.test(sentence));
      if (pattern) hits.push({ sentence: sentence.trim().slice(0, 220), pattern: String(pattern) });
    }
    if (hits.length) {
      found.push({
        id: demand.id,
        class: demand.class,
        severity: demand.severity,
        what: demand.what,
        citations: {},
        positiveCitation: demand.positiveCitation ?? {},
        noteCitation: demand.noteCitation ?? {},
        occurrences: hits.length,
        evidence: hits.slice(0, 3),
        blockedFor: [...demand.blockedFor],
      });
    }
  }
  return found;
}

/**
 * Verify every citation against the atlas as it stands NOW.
 *
 * WHY THIS IS NOT A TEST BUT A LOAD-TIME ASSERTION. The failure it guards is not a broken build,
 * it is a refusal that has quietly stopped being true — the atlas is re-measured, a limit is
 * lifted, and this file goes on turning briefs away citing a sentence that is no longer in it.
 * That failure is invisible by construction (§ the asymmetry in the header), so it must be loud.
 */
export function assertCapabilityMappingCurrent() {
  const statements = Object.fromEntries(atlasRuntimeIds().map((id) => [id, capabilityStatement(id)]));
  const problems = [];
  for (const demand of IMPOSSIBLE_DEMANDS) {
    const cited = Object.entries(demand.atlasClause ?? {});
    for (const [runtimeId, clause] of cited) {
      const s = statements[runtimeId];
      if (!s) { problems.push(`${demand.id}: cites runtime ${runtimeId}, which the atlas does not document`); continue; }
      if (!s.cannot.some((c) => c.includes(clause))) {
        problems.push(`${demand.id}: the atlas no longer says ${runtimeId} cannot do "${clause}" — this refusal has lost its evidence`);
      }
    }
    for (const [runtimeId, phrase] of Object.entries(demand.positiveCitation ?? {})) {
      const s = statements[runtimeId];
      if (!s) { problems.push(`${demand.id}: positive citation names unknown runtime ${runtimeId}`); continue; }
      if (!s.can.includes(phrase)) {
        problems.push(`${demand.id}: ${runtimeId}'s "can" statement no longer contains "${phrase}"`);
      }
    }
    if (cited.length === 0 && Object.keys(demand.positiveCitation ?? {}).length === 0) {
      problems.push(`${demand.id}: carries no citation of any kind; a refusal must be traceable to the atlas`);
    }
  }
  for (const demand of COMPOSITION_DEMANDS) {
    for (const [runtimeId, phrase] of Object.entries(demand.positiveCitation ?? {})) {
      const s = statements[runtimeId];
      if (!s) { problems.push(`${demand.id}: positive citation names unknown runtime ${runtimeId}`); continue; }
      if (!s.can.includes(phrase)) problems.push(`${demand.id}: ${runtimeId}'s "can" statement no longer contains "${phrase}"`);
    }
    for (const [runtimeId, phrase] of Object.entries(demand.noteCitation ?? {})) {
      const s = statements[runtimeId];
      if (!s) { problems.push(`${demand.id}: note citation names unknown runtime ${runtimeId}`); continue; }
      if (!String(s.note ?? "").includes(phrase)) problems.push(`${demand.id}: ${runtimeId}'s atlas note no longer contains "${phrase}"`);
    }
    if (Object.keys(demand.positiveCitation ?? {}).length === 0 && Object.keys(demand.noteCitation ?? {}).length === 0) problems.push(`${demand.id}: carries no citation of any kind`);
  }
  if (problems.length) {
    throw new Error(`CAPABILITY_MAPPING_STALE — the brief-admission vocabulary disagrees with the atlas:\n  ${problems.join("\n  ")}`);
  }
  return { ok: true, demands: IMPOSSIBLE_DEMANDS.length, compositionDemands: COMPOSITION_DEMANDS.length, runtimes: Object.keys(statements) };
}

/**
 * Can this runtime express this demand?
 *
 * A demand is impossible FOR A RUNTIME when that runtime is cited by it. A demand that cites only
 * one runtime is a real asymmetry between them and the other runtime is a genuine escape route —
 * `CURVE_OR_ARC` is refused by the recursion runtime and drawn happily by the vector one.
 *
 * `FIGURATIVE_SUBJECT` and `LEGIBLE_GLYPH` are the exception and are impossible for BOTH, on the
 * strength of the positive statements: one builds a self-similar figure from regular primitives,
 * the other places primitives from a fixed nine-member vocabulary. Neither has a path to a
 * depicted object, and no clause needs to say so for that to be true.
 */
export function runtimeCanExpress(runtimeId, demandId) {
  const demand = IMPOSSIBLE_DEMANDS.find((d) => d.id === demandId);
  if (!demand) throw new Error(`no such demand: ${demandId}`);
  if (demand.class === "REPRESENTATIONAL_DEMAND") return false;
  return !(runtimeId in (demand.atlasClause ?? {}));
}

/** Strip markdown that would otherwise create phantom matches, and normalise whitespace. */
function readableText(briefText) {
  return String(briefText ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/^\s{0,3}[#>*\-+]\s*/gm, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Detect the impossible demands a brief makes.
 *
 * Matching is per SENTENCE, and negation is checked in the sentence the match was found in. A
 * document-wide negation test would let one "no numerals" anywhere excuse a numeral demand three
 * paragraphs later, which is the shape of hole this whole module exists to close.
 */
export function detectImpossibleDemands(briefText) {
  const text = readableText(briefText);
  const sentences = text.split(/(?<=[.!?;:])\s+|\n+/).filter((s) => s.trim().length > 0);
  const found = [];
  for (const demand of IMPOSSIBLE_DEMANDS) {
    const hits = [];
    for (const sentence of sentences) {
      if (demand.notWhen?.some((n) => n.test(sentence))) continue;
      const pattern = demand.patterns.find((p) => p.test(sentence));
      if (pattern) hits.push({ sentence: sentence.trim().slice(0, 220), pattern: String(pattern) });
    }
    if (hits.length) {
      found.push({
        id: demand.id,
        class: demand.class,
        severity: demand.severity,
        what: demand.what,
        citations: demand.atlasClause ?? {},
        positiveCitation: demand.positiveCitation ?? {},
        occurrences: hits.length,
        evidence: hits.slice(0, 3),
        blockedFor: atlasRuntimeIds().filter((r) => !runtimeCanExpress(r, demand.id)),
      });
    }
  }
  return found;
}

/**
 * The positive side: what a brief is asking for, in the five declared classes.
 *
 * THIS IS DESCRIPTIVE AND NEVER DECIDES ADMISSION. It exists so the art-direction step has a
 * structured reading of the brief to translate rather than raw prose, and so a reviewer comparing
 * a render against "the requested direction" is comparing against something written down. Nothing
 * is refused for failing to match a signal here — an unmatched brief is a brief in words this
 * vocabulary does not have, which is a fact about the vocabulary.
 */
export const DEMAND_SIGNALS = Object.freeze({
  MEDIUM: Object.freeze({
    RECURSIVE_GEOMETRY: [rx(String.raw`\b(recursi\w+|self[- ]similar|fractal|nested|iterat\w+|subdivi\w+|repeat\w+\s+at\s+scale)\b`)],
    VECTOR_COMPOSITION: [rx(String.raw`\b(field|scatter\w*|array|distribut\w+|composition\s+of\s+(elements|forms|marks)|placement)\b`)],
    LINEWORK: [rx(String.raw`\b(line ?work|stroke|outline|contour|wireframe|drawn\s+in\s+line|hairline|engrav\w+|etch\w+)\b`)],
    RADIAL_SYSTEM: [rx(String.raw`\b(radial|concentric|orbit\w*|ring|halo|rosette|mandala|spiral|burst|emanat\w+)\b`)],
    LAYERING: [rx(String.raw`\b(layer\w*|strat\w+|band\w*|stack\w*|sediment\w*|bedding|superimpos\w+|overlaid)\b`)],
  }),
  MOTIF: Object.freeze({
    ARCHITECTURE: [rx(String.raw`\b(architect\w+|structural|column|vault|arcade|scaffold\w*|lattice|truss|masonry|buttress|floor ?plan)\b`)],
    BOTANICAL: [rx(String.raw`\b(botan\w+|plant|frond|branch\w*|root|seed ?head|vein\w*|foliage|growth|tendril|bloom)\b`)],
    SEDIMENT: [rx(String.raw`\b(sediment\w*|strata|geolog\w+|core ?sample|deposition|silt|alluvi\w+|erosion|bedrock)\b`)],
    MONUMENT: [rx(String.raw`\b(monument\w*|monolith\w*|obelisk|stele|cairn|megalith|totem|edifice|tomb|reliquar\w+)\b`)],
    ORGANISM: [rx(String.raw`\b(organi\w+|cell\w*|membrane|colony|swarm|coral|skeletal|vertebra|shell|spore)\b`)],
    MACHINE: [rx(String.raw`\b(machine|mechanis\w+|gear|instrument|apparatus|engine|clockwork|industrial|assembly|rig)\b`)],
  }),
  AESTHETIC: Object.freeze({
    SPARSE: [rx(String.raw`\b(sparse|minimal\w*|restrain\w+|spare|austere|quiet|empty|reduced|few\s+elements)\b`)],
    MONUMENTAL: [rx(String.raw`\b(monumental|massive|heavy|imposing|colossal|weighty|solemn|grave)\b`)],
    DENSE: [rx(String.raw`\b(dense|crowded|packed|teeming|thick|saturated|profus\w+|intricate|busy)\b`)],
    BRUTALIST: [rx(String.raw`\b(brutalis\w+|raw|blunt|stark|harsh|uncompromis\w+|concrete)\b`)],
    DELICATE: [rx(String.raw`\b(delicate|fine|fragile|slender|light|airy|filigree|gossamer|precise)\b`)],
    QUIET: [rx(String.raw`\b(quiet|still|calm|contemplat\w+|meditat\w+|hush\w*|sombre|somber)\b`)],
  }),
  MARKET_TRANSFORMATION: Object.freeze({
    FRACTURE: [rx(String.raw`\b(fractur\w+|crack\w*|shatter\w*|break\w*\s+apart|splinter\w*|rupture)\b`)],
    RECOVERY_EXPANSION: [rx(String.raw`\b(recover\w+|regrow\w*|heal\w*|expand\w*|return\w*|restor\w+|bloom\w*\s+back)\b`)],
    DENSITY_CHANGE: [rx(String.raw`\b(densi\w+|thicken\w*|thin\w+\s+out|proliferat\w+|multipl\w+|sparser|fewer)\b`)],
    EROSION: [rx(String.raw`\b(erod\w+|erosion|wear\w*\s+away|decay\w*|dissolv\w+|strip\w+\s+back|attrition)\b`)],
    DISTORTION: [rx(String.raw`\b(distort\w+|warp\w*|twist\w*|skew\w*|buckl\w+|deform\w+)\b`)],
  }),
});

/** Which declared signals a brief carries. Descriptive; see the note on DEMAND_SIGNALS. */
export function detectDemandSignals(briefText) {
  const text = readableText(briefText);
  const out = {};
  for (const [cls, table] of Object.entries(DEMAND_SIGNALS)) {
    const matched = Object.entries(table).filter(([, pats]) => pats.some((p) => p.test(text))).map(([k]) => k);
    out[cls] = matched;
  }
  return out;
}
