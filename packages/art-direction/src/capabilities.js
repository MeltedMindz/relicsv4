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
      rx(String.raw`\ba\s+(face|skull|hand|eye|animal|bird|fish|insect|tree|flower|leaf|creature|dragon|serpent)\b`),
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
  if (problems.length) {
    throw new Error(`CAPABILITY_MAPPING_STALE — the brief-admission vocabulary disagrees with the atlas:\n  ${problems.join("\n  ")}`);
  }
  return { ok: true, demands: IMPOSSIBLE_DEMANDS.length, runtimes: Object.keys(statements) };
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
