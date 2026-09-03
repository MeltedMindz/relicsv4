// SPDX-License-Identifier: MIT
// ================================================================================================
// THE AUTHOR — composition first, atlas second, bytes last.
//
// TWO RULES SHAPE THIS WHOLE FILE.
//
// 1. CONFIG IS NEVER GENERATED FROM RAW PROSE. The direction is prose because a reviewer has to
//    read it; a parameter cannot be chosen from prose without an intermediate that can be argued
//    with. `deriveIntent` is that intermediate: eight declared, closed-vocabulary decisions, each
//    recording the phrase that drove it and each falling back to a STATED default when the
//    direction does not say. A reader can look at the intent and disagree with it before a single
//    byte exists.
//
// 2. NO SHOTGUN RANDOMISATION. Authoring runs in a fixed order — silhouette, focal hierarchy,
//    negative space, rhythm, secondary structure, palette, detail, market behaviour — and each
//    stage may only touch the parameters assigned to it. That is enforced (`STAGE_PARAMETERS`,
//    checked by `authorConfig`), not merely intended, because the failure it prevents is the one
//    that produced the corpus: a critique about density arrives, twenty unrelated fields move, the
//    next render is different in ways nobody asked for, and the round teaches nothing.
//
// ------------------------------------------------------------------------------------------------
// WHY THE ORDER IS THAT ORDER
// ------------------------------------------------------------------------------------------------
// It runs from what survives at 120px down to what does not. Law L4 measured this: recursion depth
// multiplies the document thirtyfold for +0.004 ink and is invisible at browse size, while
// `stroke` moves coverage 0.399 -> 0.121 and the seed shape moves it 0.399 -> 0.060. So the
// decisions that decide whether the work reads AT ALL are made first, against the measured
// loudness ranking, and the ones that decide how it rewards a closer look are made last, inside
// whatever the earlier stages left. Authoring in the other direction is how a project ends up
// beautiful at 512px and one repeated stamp on a contact sheet.
//
// ------------------------------------------------------------------------------------------------
// WHAT THE AUTHOR IS NOT ALLOWED TO DO
// ------------------------------------------------------------------------------------------------
// It cannot see the final holdout seeds — it is never handed them, and `seeds.js` is the only
// thing that knows them. It cannot judge its own work: nothing here produces a verdict, a score or
// a quality claim. And it cannot set a parameter it has not consulted the atlas about; the
// consultation is recorded per parameter and travels into the acceptance receipt, so the claim
// `AUTHOR_USES_RUNTIME_PARAMETER_ATLAS=YES` is derived from what it actually looked up rather than
// asserted by the thing being asked.
// ================================================================================================

import { createAtlasSession, loudnessRanking, quickReference } from "./atlas.js";
import { checkBindings } from "./binding.js";
import { COUNTER_REGISTER, SENSOR_FOR_POLARITY, mechanismsRequestedBy, realisationFor } from "./mechanism.js";

/**
 * The direction fields a market mechanism is read out of, and why only these two.
 *
 * `marketTransformation`'s own question is "what the market changes, in what direction, and how a
 * viewer would SEE it at 120px" — it is the field this reading exists for. `thumbnailIntent` is
 * included because a direction routinely puts the visible half of the transformation there ("the
 * fracture is visible as broken outline"), and the whole point of the mechanism is what survives
 * at browse size.
 *
 * THE OTHER TEN ARE DELIBERATELY NOT READ. `motifTranslation` says "the barrow becomes a single
 * massive nested form", `medium` says "geometric recursion", and both are full of the growth,
 * separation and enclosure words this vocabulary matches on. Reading them turns a description of
 * the artwork into an instruction about the market, which is the same motif-noun failure that made
 * DILATION the primary mechanism of two briefs whose ask is to multiply members.
 */
export const MECHANISM_SOURCE_FIELDS = Object.freeze(["marketTransformation", "thumbnailIntent"]);

/**
 * What the author does when a direction names no mechanism at all.
 *
 * A STATED DEFAULT, not a silent one, for the same reason every entry in INTENT_VOCABULARY has
 * one: a reader of the receipt must be able to tell a choice from an absence. The default peaks in
 * RECOVERY because that is the polarity every brief in the corpus that DOES state one asks for —
 * the work is diminished by damage — and because RECOVERY through LOG2 reads 326 / 0 / 964 per
 * mille, which is the widest separation available on this fixture ring.
 */
export const DEFAULT_MECHANISM = Object.freeze({
  GEOMETRIC_RECURSION_V1: "DILATION",
  VECTOR_COMPOSITION_V1: "SEPARATION",
});
export const DEFAULT_POLARITY = "PEAKS_AT_RECOVERY";

/**
 * Read the direction for the mechanism the author will build, and resolve it against what the
 * elected runtime can actually perform.
 *
 * REFUSES rather than substitutes. If the direction asks for a mechanism this runtime cannot do,
 * that is an admission failure that reached the author, and quietly building a different
 * transformation under the brief's title is the exact defect this whole lane exists to remove.
 */
export function resolveMechanism({ runtimeId, direction }) {
  const text = MECHANISM_SOURCE_FIELDS.map((f) => direction[f] ?? "").join("\n");
  const read = mechanismsRequestedBy(text);
  const stated = read.mechanisms.filter((m) => !m.unstated);
  const chosen = stated[0] ?? null;
  const mechanismId = chosen?.mechanism ?? DEFAULT_MECHANISM[runtimeId];
  const polarity = chosen?.polarity ?? DEFAULT_POLARITY;
  const realisation = realisationFor(runtimeId, mechanismId, polarity);
  if (!realisation.ok) {
    throw new Error(
      `MECHANISM_NOT_AVAILABLE: the direction asks for ${mechanismId} ${polarity} and ${runtimeId} cannot perform it — ${realisation.detail}. ` +
      "This is an admission failure that reached the author. The author does not substitute a different transformation.",
    );
  }
  return {
    ...realisation,
    source: chosen ? "DIRECTION" : "DEFAULT",
    evidenceInDirection: chosen?.evidence ?? null,
    detailOfSource: chosen
      ? `read from ${MECHANISM_SOURCE_FIELDS.join(" / ")}: ${chosen.evidence.map((e) => `"${e.phrase}"`).join(", ")}`
      : `the direction's ${MECHANISM_SOURCE_FIELDS.join("/")} names no mechanism beside a market state; defaulting to ${mechanismId} ${DEFAULT_POLARITY}`,
    otherSensor: mechanismId && SENSOR_FOR_POLARITY[polarity] === "RECOVERY" ? "DRAWDOWN" : "RECOVERY",
    // A SECOND MECHANISM THE DIRECTION ACTUALLY ASKS FOR, RESOLVED THE SAME WAY AS THE FIRST.
    //
    // B01 says both halves out loud — "bays are removed from the run and fewer members survive,
    // and the interval between the supports that remain widens" — and building only the first of
    // them leaves the second as a promise the direction made and the work does not keep. It also
    // leaves the work quieter than it should be: a subtraction on a composition carrying half the
    // frame in ink moved the weakest pairing 2.901 dE, where the separation the same brief asks
    // for measures 14-15 on its own.
    //
    // Only mechanisms this runtime can EXPRESS are carried, and only onto a secondary register.
    // The primary keeps field 0, so a reviewer comparing the state rows is watching the
    // transformation the brief is chiefly about.
    secondary: (() => {
      for (const m of stated.slice(1)) {
        if (m.overlapsPrimary || m.mechanism === mechanismId) continue;
        const r = realisationFor(runtimeId, m.mechanism, m.polarity ?? DEFAULT_POLARITY);
        if (r.ok) return { ...r, mechanism: m.mechanism, polarity: m.polarity ?? DEFAULT_POLARITY, evidence: m.evidence };
      }
      return null;
    })(),
    alsoRequested: stated.slice(1).map((m) => ({ mechanism: m.mechanism, polarity: m.polarity })),
  };
}

/** The eight stages, in order. A stage may only write the parameters listed against it. */
export const AUTHORING_STAGES = Object.freeze([
  "SILHOUETTE",
  "FOCAL_HIERARCHY",
  "NEGATIVE_SPACE",
  "RHYTHM",
  "SECONDARY_STRUCTURE",
  "PALETTE",
  "DETAIL",
  "MARKET_BEHAVIOUR",
]);

/**
 * Which config keys each stage owns, per runtime.
 *
 * The unit-scoped keys are written `rules[].x` / `fields[].x` and are matched against the path a
 * write actually took, so a stage cannot reach into a unit it does not own either.
 */
export const STAGE_PARAMETERS = Object.freeze({
  GEOMETRIC_RECURSION_V1: Object.freeze({
    SILHOUETTE: ["rules[0].shapeSet", "rules[0].ruleSet"],
    FOCAL_HIERARCHY: ["ruleCount", "rules[0].contraction"],
    NEGATIVE_SPACE: ["rules[0].branch", "rules[0].prune"],
    RHYTHM: ["rules[0].symSet", "rules[0].rotation"],
    SECONDARY_STRUCTURE: ["rules[1].shapeSet", "rules[1].ruleSet", "rules[1].contraction", "rules[1].branch", "rules[1].prune", "rules[1].symSet", "rules[1].rotation", "rules[1].paletteIx", "rules[1].variant", "rules[1].stroke", "rules[1].depthMin", "rules[1].depthMax"],
    PALETTE: ["palette", "groundMode", "groundIx", "groundIx2", "flags", "rules[0].paletteIx"],
    DETAIL: ["rules[0].depthMin", "rules[0].depthMax", "rules[0].stroke", "rules[0].variant", "title", "traits"],
    MARKET_BEHAVIOUR: ["rules[0].sensor", "rules[0].curve", "rules[0].drive", "rules[1].sensor", "rules[1].curve", "rules[1].drive"],
  }),
  VECTOR_COMPOSITION_V1: Object.freeze({
    SILHOUETTE: ["fields[0].layout", "fields[0].primitive"],
    FOCAL_HIERARCHY: ["fieldCount", "fields[0].sizeMax"],
    NEGATIVE_SPACE: ["fields[0].spreadMax"],
    RHYTHM: ["fields[0].symmetry", "fields[0].countMin", "fields[0].countMax"],
    SECONDARY_STRUCTURE: ["fields[1].layout", "fields[1].primitive", "fields[1].sizeMax", "fields[1].spreadMax", "fields[1].symmetry", "fields[1].countMin", "fields[1].countMax", "fields[1].paletteIx", "fields[1].variant", "fields[1].stroke", "fields[2].layout", "fields[2].primitive", "fields[2].sizeMax", "fields[2].spreadMax", "fields[2].symmetry", "fields[2].countMin", "fields[2].countMax", "fields[2].paletteIx", "fields[2].variant", "fields[2].stroke"],
    PALETTE: ["palette", "groundMode", "groundIx", "groundIx2", "flags", "fields[0].paletteIx"],
    DETAIL: ["fields[0].variant", "fields[0].stroke", "title", "traits"],
    MARKET_BEHAVIOUR: ["fields[0].sensor", "fields[0].curve", "fields[0].drive", "fields[1].sensor", "fields[1].curve", "fields[1].drive", "fields[2].sensor", "fields[2].curve", "fields[2].drive"],
  }),
});

const rx = (s) => new RegExp(s, "i");

/** An explicitly described graded ground. Nothing else turns the gradient on. */
const GRADED_GROUND = /\b(gradient|graded|glow\w*|vignette|radiant|luminous\s+ground|light\s+falls?|halo\s+of\s+light)\b/gi;

/**
 * Does the direction ask for a graded ground — READING THE NEGATION.
 *
 * The atlas measures a gradient ground as the single loudest thing available (ink120 FLAT 0.399 ->
 * RADIAL 0.882) and says plainly that it "makes the ground the loudest thing in the frame", so
 * this is an opt-in. It was matched with a bare pattern, and two directions that say the OPPOSITE
 * in as many words turned it on:
 *
 *   "the ground is a single flat dark, unmodulated, so that weight is read against it and NEVER
 *    against a GRADED wash"
 *   "the base visible only at the partings and held flat RATHER THAN GRADED"
 *
 * Both were then authored with a radial gradient between the ground and a working colour, which
 * is the loudest control in the runtime pointed at the one thing the direction reserved for
 * nothing. `deriveIntent` has read negation since the first round; this line had not.
 */
function wantsGradedGround(direction) {
  const text = String(direction.paletteIntent ?? "");
  for (const m of text.matchAll(GRADED_GROUND)) {
    if (!negatedAt(text, m.index)) return true;
  }
  return false;
}

/**
 * THE INTENT VOCABULARY — eight closed decisions, each with a STATED default.
 *
 * The defaults matter more than the patterns. A direction that says nothing about rhythm still has
 * to produce a configuration, and the honest way to do that is a default the receipt names, so a
 * reviewer reading "rhythmMode: REGULAR (default: the direction did not say)" knows the difference
 * between a choice and an absence. An unstated default is how a system claims intent it never had.
 */
export const INTENT_VOCABULARY = Object.freeze({
  densityTarget: {
    from: ["density", "negativeSpace", "thumbnailIntent"],
    options: {
      SPARSE: [rx(String.raw`\b(sparse|minimal\w*|spare|austere|restrain\w+|empty|few\s+(elements|marks|forms)|quiet|breath\w+|generous\s+(space|emptiness))\b`)],
      DENSE: [rx(String.raw`\b(dense|crowded|packed|teeming|thick|saturated|profus\w+|busy|intricate|swarm\w*|fills?\s+most)\b`)],
      MODERATE: [rx(String.raw`\b(moderate|balanced|measured|even|middling)\b`)],
    },
    default: "MODERATE",
  },
  extentTarget: {
    from: ["composition", "negativeSpace"],
    options: {
      COMPACT: [rx(String.raw`\b(compact|contained|inset|centred?\s+mass|held\s+(in|within)|margin\w*|clear\s+of\s+the\s+edge|island)\b`)],
      // THE PATTERN REQUIRED ONE EXACT PHRASING AND THE DIRECTIONS USED FIVE OTHERS.
      //
      // `reach\w+\s+(out|toward|to)\s+the\s+edge` matches "reaches toward the edge" and nothing
      // else: "reaches OUT TO the edges" fails on the extra word, "reach the edges on all four
      // sides" fails for want of a preposition, "meets the edges of the frame" and "occupies the
      // whole frame" match nothing at all. Three directions that say plainly that the work fills
      // the frame scored zero here and fell to the default.
      EXPANSIVE: [
        rx(String.raw`\b(expansive|edge\s+to\s+edge|sprawl\w*|spread\w*\s+wide|full[- ]bleed)\b`),
        rx(String.raw`\b(reach\w+|extend\w+|run\w*|meet\w*|touch\w*|carr\w+|continu\w+)\b(?:\s+\w+){0,4}?\s+the\s+(frame\s+|canvas\s+)?(edges?|border|frame\s+edge)\b`),
        rx(String.raw`\b(fills?|occupies?|uses?)\s+(the\s+)?(whole|entire|full)?\s*(frame|canvas)\b`),
        rx(String.raw`\bon\s+all\s+four\s+sides\b`),
        rx(String.raw`\b(border|frame)\s+crops?\b`),
      ],
    },
    // THE DEFAULT WAS COMPACT AND IT PRODUCED THE MOST REPEATED COMPLAINT IN THE CORPUS.
    //
    // Seven of twelve round-one blind reviews described a centred island floating in dead margin,
    // one of them writing "every token is a centred island with wide empty margins on all four
    // sides, nothing bleeds, nothing touches an edge" before it had read the brief — on a brief
    // that asks for banding "filling the frame edge to edge". Ten of the twelve directions never
    // say the word "expansive" and fell to this default.
    //
    // A margin is a deliberate compositional choice and a brief that wants one says so — B05 asks
    // for "the single form held well clear of every edge". So COMPACT is now something a direction
    // has to ask for, and the neutral answer reaches the frame.
    default: "MODERATE",
  },
  focalMode: {
    from: ["focalHierarchy", "composition"],
    options: {
      SINGLE_DOMINANT: [rx(String.raw`\b(single|one)\s+(dominant|central|principal|main)\b`), rx(String.raw`\b(dominat\w+|command\w+|anchor\w+)\s+(mass|form|figure|element|centre|center)\b`), rx(String.raw`\bhierarch\w+\s+is\s+(clear|strong|explicit)\b`)],
      EVEN_FIELD: [rx(String.raw`\b(even\s+field|no\s+(single\s+)?(focal|dominant)|uniform\s+field|all[- ]over|deliberately\s+flat\s+hierarch\w+|nothing\s+dominates)\b`)],
      LAYERED: [rx(String.raw`\b(layer\w*|tier\w*|foreground\s+and\s+background|primary\s+and\s+secondary|two\s+registers?)\b`)],
    },
    default: "SINGLE_DOMINANT",
  },
  rhythmMode: {
    from: ["rhythm", "composition"],
    options: {
      RADIAL: [rx(String.raw`\b(radial|concentric|rotational|around\s+(a|the)\s+cent(re|er)|orbit\w*|ring\w*|mandala|rosette)\b`)],
      BROKEN: [rx(String.raw`\b(broken|irregular|interrupt\w+|syncopat\w+|uneven|varied\s+interval|disrupt\w+)\b`)],
      REGULAR: [rx(String.raw`\b(regular|steady|even\s+(interval|spacing)|repeat\w+\s+at|metronom\w+|consistent)\b`)],
    },
    default: "REGULAR",
  },
  paletteMode: {
    from: ["paletteIntent"],
    options: {
      MONOCHROME: [rx(String.raw`\b(monochrom\w+|single\s+(colou?r|hue)|one\s+colou?r|tonal\s+only|grayscale|greyscale)\b`)],
      CONTRASTING: [rx(String.raw`\b(contrast\w+|opposed|clash\w*|complementary|sharp\s+(difference|division)|bright\s+accent\s+against)\b`)],
      RESTRAINED: [rx(String.raw`\b(restrain\w+|narrow|muted|close\s+(tones|values)|limited\s+palette|earth\w*|subdued)\b`)],
    },
    default: "RESTRAINED",
  },
  strokeMode: {
    from: ["medium", "motifTranslation", "paletteIntent", "thumbnailIntent"],
    options: {
      LINEWORK: [rx(String.raw`\b(line ?work|stroked?|outline\w*|wireframe|drawn\s+in\s+line|hairline|engrav\w+|etch\w+|skeletal|armature|contour)\b`)],
      SOLID: [rx(String.raw`\b(solid|filled|mass(es|ive)?|block\w*|opaque\s+form|silhouett\w+|weight\w*)\b`)],
    },
    default: "SOLID",
  },
  marketAxis: {
    from: ["marketTransformation"],
    options: {
      DENSITY: [rx(String.raw`\b(densi\w+|thicken\w*|thin\w+|multipl\w+|proliferat\w+|fewer|more\s+elements|count)\b`)],
      STRUCTURE: [rx(String.raw`\b(fractur\w+|break\w*|splinter\w*|prune\w*|collaps\w+|deepen\w*|nest\w+|branch\w*|structur\w+)\b`)],
      SCALE: [rx(String.raw`\b(scale|size|grow\w*|shrink\w*|contract\w+|expand\w+|swell\w*|compress\w+)\b`)],
      EROSION: [rx(String.raw`\b(erod\w+|erosion|wear\w*|decay\w*|dissolv\w+|strip\w+|attrition|retreat\w*)\b`)],
    },
    default: "DENSITY",
  },
  variationBreadth: {
    from: ["variationStrategy", "identityAnchors"],
    options: {
      WIDE: [rx(String.raw`\b(wide|broad|strongly?\s+(different|varied)|dramatic\w*\s+var\w+|each\s+token\s+is\s+its\s+own)\b`)],
      NARROW: [rx(String.raw`\b(narrow|subtle|tight\w*|family\s+resemblance|close\s+variation|restrained\s+var\w+)\b`)],
    },
    default: "WIDE",
  },
});

/**
 * Derive the intent from the direction.
 *
 * Every decision records `source: "DIRECTION"` with the matching phrase, or `source: "DEFAULT"`.
 * That distinction is the whole value of the function and is carried into the receipt.
 */
/**
 * Words that INVERT the phrase they precede.
 *
 * MEASURED NECESSITY, not caution. The first direction this author was run against said the rhythm
 * was "Regular repetition at diminishing scale, each generation a steady contraction of the one
 * before it with no interruption" — and the intent came back `rhythmMode: BROKEN`, because
 * `interrupt\w+` matched inside "no interruption". The direction said the exact opposite of what
 * was derived from it, and every parameter downstream of rhythm was then chosen for the wrong
 * picture. A direction is written in careful prose by something trying to be precise, and careful
 * prose says what a thing is NOT at least as often as what it is.
 */
/**
 * WIDENED, AND THE WIDENING IS MEASURED. The first cut held the plain negatives. Careful prose
 * denies a thing far more often by CONTRASTING it: three of twelve art directions said the work
 * fills the frame in exactly these shapes —
 *
 *   "it is measured space held between members RATHER THAN leftover margin around a floating figure"
 *   "gathers into NEITHER a margin NOR a void"
 *   "the border crops a spreading growth RATHER THAN containing a small object floating in dead space"
 *
 * — and every one of them scored a vote for COMPACT off the word `margin`, on a sentence saying
 * there is no margin. All three then rendered at a spread ceiling two thirds of the range, which
 * is the centred island seven of twelve blind reviews described. `mechanism.js` already carried
 * `rather than` and `instead of`; this brings the two lists together.
 */
const NEGATORS = /\b(no|not|never|without|avoid\w*|free\s+of|absent|lack\w*|refus\w*|neither|nor|rather\s+than|instead\s+of|un(interrupted|broken))\b/i;

/** Look backward from a match for a negator inside the same clause. */
function negatedAt(haystack, index) {
  const clauseStart = Math.max(
    haystack.lastIndexOf(".", index),
    haystack.lastIndexOf(",", index),
    haystack.lastIndexOf(";", index),
    haystack.lastIndexOf("\n", index),
  );
  const window = haystack.slice(clauseStart + 1, index);
  return NEGATORS.test(window);
}

export function deriveIntent(direction) {
  const intent = {};
  const derivation = {};
  for (const [key, spec] of Object.entries(INTENT_VOCABULARY)) {
    const haystack = spec.from.map((f) => direction[f] ?? "").join(" \n ");
    const rejected = [];
    // EVIDENCE IS COUNTED, NOT RACED.
    //
    // This used to take the first option whose pattern matched and stop. B09 -- a brief whose
    // every line is about MASS, weight and consolidation -- came out LINEWORK and rendered as a
    // hairline outline at ink 0.045, because the word "outline" appears once, in a subordinate
    // clause of thumbnailIntent ("the fracture is visible as broken outline"), and LINEWORK is
    // declared before SOLID. One incidental noun outvoted four deliberate ones.
    //
    // So every option is scored by how many DISTINCT phrases support it, and the declared order is
    // only the tie-break. That also makes the derivation legible: the receipt carries the count,
    // so a reading that won 4-to-1 looks different from one that won 1-to-0.
    const scores = [];
    for (const [option, patterns] of Object.entries(spec.options)) {
      const hits = [];
      for (const p of patterns) {
        for (const m of haystack.matchAll(new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`))) {
          if (negatedAt(haystack, m.index)) { rejected.push({ option, phrase: m[0], why: "negated in its own clause" }); continue; }
          if (!hits.includes(m[0].toLowerCase())) hits.push(m[0].toLowerCase());
        }
      }
      scores.push({ option, score: hits.length, phrases: hits });
    }
    // ON A TIE THE DEFAULT WINS, NOT THE FIRST OPTION DECLARED.
    //
    // Scoring by distinct phrases fixed the case where one incidental noun outvoted four
    // deliberate ones. It did not fix the ONE-ALL tie, and that is the same failure one step
    // smaller: two directions here score LINEWORK 1 against SOLID 1 — each on a single occurrence
    // of the word "outline", in a clause about the edge of an enclosure — and LINEWORK won both
    // because it is declared first. Stroke is the loudest coverage control in either runtime
    // (0.399 filled against 0.121 stroked), so a coin toss decided a third of the coverage of two
    // collections, and one of them then failed the blank floor.
    //
    // A tie is precisely "the direction does not settle this", which is what the stated default is
    // for. When the default is not among the tied options the declaration order still decides, and
    // the tie is recorded so a reader of the receipt can see a choice was close.
    const ranked = scores.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    const top = ranked.length ? ranked.filter((x) => x.score === ranked[0].score) : [];
    const tied = top.length > 1;
    const best = tied ? (top.find((x) => x.option === spec.default) ?? top[0]) : (ranked[0] ?? null);
    intent[key] = best?.option ?? spec.default;
    derivation[key] = best
      ? {
        source: tied && best.option === spec.default ? "DEFAULT_ON_TIE" : "DIRECTION",
        value: best.option,
        evidence: best.phrases,
        score: best.score,
        tiedWith: tied ? top.filter((x) => x.option !== best.option).map((x) => `${x.option}:${x.score}`) : [],
        runnerUp: scores.filter((x) => x.option !== best.option && x.score > 0).map((x) => `${x.option}:${x.score}`),
        fields: spec.from,
        rejected,
      }
      : { source: "DEFAULT", value: spec.default, detail: `the direction's ${spec.from.join("/")} did not name a ${key}`, rejected };
  }
  return { intent, derivation };
}

/** Colour words the direction may use, and a hex for each. Small, declared, and never guessed at. */
const COLOUR_WORDS = Object.freeze({
  ochre: "#b07d3a", rust: "#8c4a2f", iron: "#4a4f55", ash: "#8d8b86", bone: "#d9d2c2",
  charcoal: "#26282b", ink: "#14161a", copper: "#a4643c", brass: "#9c7f3d", verdigris: "#4e7d6e",
  green: "#3f6b4f", moss: "#5b6b45", slate: "#59636b", sand: "#c2ac82",
  blue: "#3a5a7a", indigo: "#2b3350", violet: "#5a4a6b", crimson: "#7a2f33", red: "#8f3a33",
  gold: "#c2a04a", cream: "#e6dcc6", white: "#efeae0", black: "#0f1113", grey: "#6f7377",
  gray: "#6f7377", umber: "#5b4632", sepia: "#6b533a", teal: "#356b6b", amber: "#c08a35",
});

/** The dark anchor a ground falls back to when the direction names no dark colour of its own. */
const DARK_ANCHOR = "#0f1113";

/** The default palette when the direction names no colour: archaeological, restrained, dark ground. */
const DEFAULT_PALETTE = Object.freeze([DARK_ANCHOR, "#8d8b86", "#b07d3a", "#d9d2c2"]);

/** Relative luminance, for deciding which declared colour is the ground. */
function luma(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/**
 * Resolve the palette from the direction.
 *
 * TWO THINGS WERE WRONG HERE AND BOTH WERE VISIBLE IN THE FIRST BENCHMARK RENDER.
 *
 * ORDER. Colours were collected by iterating COLOUR_WORDS, so the palette came out in the order
 * this dictionary happens to declare rather than the order the direction says them. `ochre` is
 * declared first, so a direction reading "iron and ash over a near black ground, with one warm
 * ochre accent" produced a palette whose index 0 -- the ground -- was ochre. Twelve architectural
 * studies rendered on a tan field. Colours are now collected in order of appearance in the text.
 *
 * THE GROUND IS THE DARKEST COLOUR, NOT INDEX 0. Every one of these briefs asks for a dark ground
 * ("near black", "deep ink", "over a dark ground"), and reading the ground off a fixed index makes
 * that depend on which colour the author happened to name first. The ground is chosen by luminance,
 * and if the direction names nothing dark a dark anchor is prepended rather than the lightest
 * available colour being pressed into service as a background.
 */
function paletteFrom(direction, intent) {
  const text = `${direction.paletteIntent ?? ""} ${direction.motifTranslation ?? ""} ${direction.composition ?? ""}`.toLowerCase();
  const hits = [];
  for (const [word, hex] of Object.entries(COLOUR_WORDS)) {
    const at = text.search(new RegExp(`\\b${word}\\b`));
    if (at >= 0 && !hits.some((h) => h.hex === hex)) hits.push({ at, hex, word });
  }
  hits.sort((x, y) => x.at - y.at);
  let palette = hits.length >= 2 ? hits.map((h) => h.hex) : [...DEFAULT_PALETTE];

  if (intent.paletteMode === "MONOCHROME") {
    const sorted = [...palette].sort((x, y) => luma(x) - luma(y));
    palette = [sorted[0], sorted[sorted.length - 1]];
  }
  if (intent.paletteMode === "CONTRASTING" && palette.length < 3) palette = [...palette, "#c2a04a"];

  // A ground the eye reads as ground. 0.18 is below every mid tone in the table and above pure ink.
  if (!palette.some((c) => luma(c) < 0.18)) palette = [DARK_ANCHOR, ...palette];
  if (palette.length < 2) palette = [...DEFAULT_PALETTE];
  palette = palette.slice(0, 10);

  const groundIx = palette.indexOf(palette.reduce((a, b) => (luma(a) <= luma(b) ? a : b)));
  // The accent is the FURTHEST from the ground in luminance -- what the direction means by "one
  // warm accent doing all the work" is the thing that reads against the dark, whatever its hue.
  const accentIx = palette.indexOf(palette.reduce((a, b) => (Math.abs(luma(a) - luma(palette[groundIx])) >= Math.abs(luma(b) - luma(palette[groundIx])) ? a : b)));
  return { palette, namedInDirection: hits.length, groundIx, accentIx };
}

/**
 * A prune mask that is legal for the branch it is paired with.
 *
 * `prune` is a BITMASK over the children a production makes, and `branch` decides how many there
 * are. A mask whose set bits all sit above `branch` keeps nothing, and the runtime refuses it with
 * ERR_PRUNE (43) -- "the prune mask keeps no child that `branch` actually produces". Hardcoding a
 * mask therefore couples it to a branch value chosen in a different authoring stage, which is
 * exactly how a legal-looking pair became an illegal document: the secondary rule shipped
 * prune 12 (1100) against branch 2, whose only children are 0 and 1.
 *
 * The low bit is always kept, so the mask can never be empty whatever else changes. Law L2's
 * degenerate case -- every low bit set, which makes DRIVE_PRUNE a rotation of an all-ones mask and
 * therefore the identity -- is avoided whenever there is room to avoid it.
 */
function pruneMaskFor(branch, densityTarget) {
  const width = Math.max(1, Math.min(4, branch));
  const all = (1 << width) - 1;
  if (width === 1) return 1;
  if (densityTarget === "DENSE") return all;
  // Drop the highest child so the mask is neither empty nor all-ones.
  const mask = all & ~(1 << (width - 1));
  return mask === 0 ? 1 : mask | 1;
}

/**
 * The on-chain title.
 *
 * Taken from `motifTranslation` rather than `medium`: `medium` names the RUNTIME, so deriving from
 * it stamped every recursion project with the title "Geometric recursion:" -- the engine's own
 * name, colon included, in the token metadata of every collection it would ever make.
 */
function titleFrom(direction) {
  const source = String(direction.motifTranslation ?? "").replace(/[^A-Za-z0-9 ]+/g, " ");
  const words = source.split(/\s+/).filter((w) => w.length > 3 && !/^(the|and|becomes?|reading|each|with|that|from|into|which|their|then|they)$/i.test(w));
  const title = words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return (title || "Relic").slice(0, 32);
}


/**
 * A palette index that is NOT the ground, and preferably not one already in use.
 *
 * THE THIRD TIME A REGISTER WAS PAINTED IN THE BACKGROUND COLOUR. `PALETTE_SHIFT` rotated a field
 * onto the ground index; `DEPTH_PALETTE` walked onto it; and the recursion runtime's second rule
 * was HANDED it by an expression that said so outright —
 *
 *     ixCap === groundIx ? groundIx : (groundIx === 0 ? Math.min(2, ixCap) : 0)
 *
 * On a three-stop palette whose ground is the last entry, `ixCap === groundIx` is true and the
 * second rule takes the ground. Measured: `<g fill="#14161a">` at opacity 0.92 drawn over the
 * first rule's gold, on a frame whose background is #14161a — ink 0.000, an entirely empty tile
 * that the runtime accepts, the validator accepts, and every seed of the collection carries.
 *
 * There is no configuration in which a register painted in the ground colour is what an author
 * meant, so this refuses rather than falls back to it: a palette with no non-ground entry cannot
 * be authored against at all, and saying so is better than drawing nothing.
 */
function nonGroundIndex(paletteLength, groundIx, avoid = []) {
  const options = [];
  for (let i = 0; i < paletteLength; i += 1) if (i !== groundIx) options.push(i);
  if (options.length === 0) {
    throw new Error(`PALETTE_HAS_NO_FIGURE_COLOUR: every one of the ${paletteLength} stops is the ground index ${groundIx}. A register painted in the ground colour draws an empty tile.`);
  }
  return options.find((i) => !avoid.includes(i)) ?? options[0];
}

/**
 * A recorded write.
 *
 * Every parameter the author sets goes through `set`, which refuses a write from a stage that does
 * not own the parameter. That refusal is the enforcement behind "no shotgun randomisation": the
 * mechanism is not a convention, it is that the wrong stage cannot reach the key.
 */
function makeWriter(runtimeId, config, log) {
  const owns = STAGE_PARAMETERS[runtimeId];
  return function set(stage, path, value) {
    const allowed = owns[stage] ?? [];
    if (!allowed.includes(path)) {
      throw new Error(`STAGE_VIOLATION: ${stage} may not write ${path}. It owns: ${allowed.join(", ") || "(nothing)"}`);
    }
    const m = /^(\w+)\[(\d+)\]\.(\w+)$/.exec(path);
    if (m) {
      const [, arr, ix, key] = m;
      config[arr] ??= [];
      config[arr][Number(ix)] ??= {};
      config[arr][Number(ix)][key] = value;
    } else {
      config[path] = value;
    }
    log.push({ stage, path, value: Array.isArray(value) ? [...value] : value });
  };
}

/**
 * Author a configuration.
 *
 * Deterministic: the same direction and the same attempt number produce the same bytes. There is
 * no randomness anywhere in this function, which is what makes a critique reproducible — a round
 * that could not be re-derived would make every comparison between rounds meaningless.
 *
 * `attempt` shifts a small number of decisions, and only the ones a RESET_DIRECTION is entitled to
 * shift. It is not a reroll of the whole space.
 */
export function authorConfig({ runtimeId, direction, observedCodeHashes = null, attempt = 0 }) {
  const { intent, derivation } = deriveIntent(direction);
  // THE MECHANISM IS RESOLVED BEFORE THE FIRST BYTE AND EVERY STAGE READS IT. It decides the
  // production set (CONTRACT only moves extent under RING/BRANCH), the element size (FRACTURE
  // needs few large members), the count range (pinned unless COUNT is the drive) and the stroke
  // flag (THICKENING is a no-op on a filled field) — not just the binding.
  const mechanism = resolveMechanism({ runtimeId, direction });
  const session = createAtlasSession({ runtimeId, observedCodeHashes });
  const config = {};
  const writes = [];
  const set = makeWriter(runtimeId, config, writes);
  const notes = [];

  // The measured facts this author is steering by. Consulted, not recalled.
  const loudness = loudnessRanking(runtimeId);
  const quickRef = quickReference(runtimeId);

  if (runtimeId === "GEOMETRIC_RECURSION_V1") {
    authorRecursion({ set, session, intent, direction, mechanism, attempt, notes });
  } else if (runtimeId === "VECTOR_COMPOSITION_V1") {
    authorVector({ set, session, intent, direction, mechanism, attempt, notes });
  } else {
    throw new Error(`no authoring procedure for runtime ${runtimeId}`);
  }

  // THE SYMBOLIC CHECK RUNS BEFORE THE BYTES LEAVE. A configuration whose every binding is
  // unreachable is refused here rather than after 36 renders and a reviewer's time.
  const bindings = checkBindings({ runtimeId, config });

  return {
    runtimeId,
    config,
    intent,
    intentDerivation: derivation,
    mechanism,
    stages: AUTHORING_STAGES,
    writes,
    notes,
    bindings,
    atlas: session.record(),
    steeredBy: { loudnessRanking: loudness, quickReference: quickRef },
    refused: bindings.refuse ? bindings.detail : null,
  };
}

/**
 * GEOMETRIC_RECURSION_V1.
 *
 * Steering facts, all measured and all consulted below: coverage is decided by shape and stroke,
 * not by depth or branch; RING and BRANCH throw the work outward and the other four do not; depth
 * is nearly free of visual effect and expensive in budget, so pin it unless the SEED is meant to
 * vary it; paletteCount does nothing and DEPTH_PALETTE is the colour control; a gradient ground
 * makes the ground the loudest thing in the frame; the node budget refuses branch 3 above depth 4.
 *
 * AND ONE MORE, WHICH DECIDES MOST OF WHAT FOLLOWS: this runtime performs exactly ONE of the seven
 * named mechanisms. `mechanism.js` measured the other five drives at 0.000 to 0.455 dE against a
 * floor of 3.8, so there is no market question left to answer here — the drive is DILATION or the
 * brief should never have arrived. Everything below is therefore about the PICTURE.
 */
function authorRecursion({ set, session, intent, direction, mechanism, attempt, notes }) {
  const pal0 = paletteFrom(direction, intent);
  const ixCap = pal0.palette.length - 1;
  const groundIx = pal0.groundIx;
  const accentIx = pal0.accentIx;

  // THE ONE PLACE A RADIAL IDIOM IS ELECTED, AND IT IS ELECTED FROM THE DIRECTION ONLY.
  //
  // Six of twelve round-one blind reviews read the work as a rosette, a medallion, a compass rose
  // or a mandala — including on briefs about a colonnade and a barrow. The cause was one line: the
  // symmetry set was {NONE, ROT3, ROT6} for a REGULAR rhythm as well as a RADIAL one, and the
  // atlas says plainly that "ROT3 and ROT6 are, unavoidably, a rosette. Every brief in the corpus
  // that forbids a mandala or a centred emblem forbids them."
  //
  // MEASURED, on this probe's own skeleton: symSet {NONE} reads seed diversity 8.644 mean / 3.708
  // min at ink 0.295 with no rotational replication at all, against {ROT3, ROT6}'s 11.518 / 3.178.
  // The rosette buys a little diversity and costs the reading of every brief that did not ask for
  // one, and both numbers clear the 3.0 / 1.2 floors comfortably.
  const wantsRadial = intent.rhythmMode === "RADIAL";
  const wantsSymmetryVariety = /\b(symmetr\w+|fold|rotational\s+order)\b/i.test(direction.variationStrategy ?? "");

  // ---- 1. SILHOUETTE -----------------------------------------------------------------------
  const shapes = session.consult("rules[n].shapeSet");
  const rules = session.consult("rules[n].ruleSet");
  // CROSS is never elected on any path: it is stroke-forced, carries ink120 0.060 against SQUARE's
  // 0.399, and the atlas records that widening a set to include it manufactures near-blank tokens.
  const shapeByDensity = {
    // FOUR MEMBERS, BECAUSE THE SHAPE IS THIS RUNTIME'S ONLY CATEGORICAL SEED DRAW WORTH WIDENING.
    //
    // The seed picks one shape, one production and one symmetry per token, and those three draws
    // are the entire per-token topology — the difference between twelve works and one work at
    // twelve settings, which is the axis that held `idol`. Measured on a single-form configuration,
    // widening the shape set from three members to four moved seed separation from 8.420 mean /
    // 3.447 min to 9.896 / 4.778 with the ink floor unchanged at 0.185, and adding a third
    // production and a second symmetry on top reached 12.441 / 4.388.
    //
    // TWO OF THE SIX SHAPES ARE EXCLUDED ON EVERY PATH AND BOTH EXCLUSIONS ARE MEASURED.
    //
    // CROSS is stroke-forced whatever the flag says and carries ink120 0.060 against SQUARE's
    // 0.399; the atlas records that including it manufactures near-blank tokens with no warning.
    // TRIANGLE is the next lightest at 0.162, which is survivable at full scale and is not at the
    // spread floor: a DILATION binding puts the root at the bytecode floor of 40 of 256 in its low
    // state, and a sparse set carrying TRIANGLE measured an ink floor of 0.038 there — under the
    // blank floor of 0.040, on one frame of thirty-six. Removing it and keeping four members costs
    // no diversity: the four-member set measured 9.896 mean / 4.778 min seed separation against
    // the three-member set's 8.420 / 3.447.
    //
    // That leaves four usable shapes and all three densities take them. Density in this runtime is
    // carried by stroke, branch and contraction — which the atlas's own 120px ranking puts first,
    // sixth and fifth, against shape's second — and shape is spent on per-token topology instead.
    SPARSE: ["SQUARE", "DIAMOND", "CIRCLE", "HEX"],
    MODERATE: ["SQUARE", "DIAMOND", "CIRCLE", "HEX"],
    DENSE: ["SQUARE", "DIAMOND", "CIRCLE", "HEX"],
  };
  const shapeSet = wantsRadial ? ["CIRCLE", "HEX", "DIAMOND", "SQUARE"] : shapeByDensity[intent.densityTarget];
  set("SILHOUETTE", "rules[0].shapeSet", attempt === 0 ? shapeSet : [...shapeSet].reverse());
  notes.push({ stage: "SILHOUETTE", why: `shapeSet from densityTarget=${intent.densityTarget}; the atlas ranks seed shape second-loudest at 120px and CROSS is excluded on every path`, consulted: shapes.parameter });

  // THE PRODUCTION DECIDES THE EXTENT AND — WHEN CONTRACT IS THE DRIVE — WHETHER THE DRIVE WORKS.
  //
  // The atlas measures contraction as an EXTENT control under RING and BRANCH (0.88 -> 0.99) and a
  // flat 0.79 under everything else, so a CONTRACT binding on a QUAD/TRI/INSCRIBE rule moves
  // internal density and not the size of the work. `mechanism.js` records that as a requirement
  // (`ruleSetIncludes`) rather than as advice.
  //
  // QUAD AT BRANCH 2 IS A FACE ON EVERY SEED, in the atlas's own words, and it is "the single most
  // repeated subject complaint in the review corpus". Branch is chosen at 3 wherever QUAD is in
  // the set, which the node budget admits up to depthMax 4.
  // A PRODUCTION UNDER WHICH CONTRACTION MOVES EXTENT IS ALSO WHAT MAKES THE SEED'S CONTRACTION
  // DRAW VISIBLE. Contraction is a ceiling the seed picks under, and the atlas measures it as flat
  // in extent under QUAD, TRI, INSCRIBE and BSP and as 0.88 -> 0.99 under RING and BRANCH — so on
  // a set without one of those two, two tokens that drew the same shape and production differ only
  // by an ink delta of 0.02 across the whole contraction range, which is the colliding pair the
  // hundred-seed sweep finds. Measured on a single rule: the same configuration with BRANCH added
  // to a three-member set read 12.789 mean / 2.423 min seed separation against 11.145 / 1.979.
  // COMPACT is the one composition that may not have it: those productions run off the frame by
  // construction, and a brief asking for a form held clear of every edge is asking for neither.
  const ruleByExtent = {
    COMPACT: wantsRadial ? ["INSCRIBE", "TRI", "QUAD"] : ["INSCRIBE", "QUAD", "TRI"],
    MODERATE: wantsRadial ? ["QUAD", "TRI", "INSCRIBE", "RING"] : ["QUAD", "TRI", "INSCRIBE", "BRANCH"],
    EXPANSIVE: wantsRadial ? ["RING", "TRI", "QUAD"] : ["BRANCH", "TRI", "QUAD"],
  };
  let ruleSet = (ruleByExtent[intent.extentTarget] ?? ["QUAD", "TRI"]).filter((r) => r !== "BSP");
  if (mechanism?.requires?.ruleSetIncludes && !ruleSet.some((r) => mechanism.requires.ruleSetIncludes.includes(r))) {
    ruleSet = [mechanism.requires.ruleSetIncludes[0], ...ruleSet].slice(0, 3);
  }
  set("SILHOUETTE", "rules[0].ruleSet", ruleSet);
  notes.push({ stage: "SILHOUETTE", why: `ruleSet from extentTarget=${intent.extentTarget}; BSP excluded on every path (law L3: inert under PRUNE/ROTATE)`, consulted: rules.parameter });

  // ---- 2. FOCAL HIERARCHY -------------------------------------------------------------------
  const ruleCount = session.consult("ruleCount");
  // ONE RULE IS NOW A LEGITIMATE ANSWER, AND IT WAS NOT BEFORE.
  //
  // The previous cut declared "ALWAYS TWO RULES". B05 asked for "one form, centred, and almost
  // nothing else" and got a core plus roughly thirty loose shards; its reviewer wrote "that is a
  // core plus a composition, not one form plus emptiness" and closed with "delete the orbiting
  // debris entirely so each token is one silhouette in an empty frame". A second rule IS the
  // orbiting debris. Measured: a single SPREAD-driven rule reads ns 10.932 / nr 11.209 / sr 19.955
  // with 1.6 components and largestShare 0.997 — one object, three states, no debris.
  // TWO RULES, ALWAYS, AND THE SECOND ONE IS NOT DEBRIS.
  //
  // A SINGLE RULE CANNOT CARRY A COLLECTION. The seed's whole categorical draw is one shape, one
  // production and one symmetry, so a lone rule with four shapes, three productions and no
  // rotational symmetry offers TWELVE distinct figures — and a ten-thousand-token collection drawn
  // from twelve moulds contains identical pairs by arithmetic. Measured on the hundred-seed sweep:
  // the closest pair of a single-rule configuration read 1.075 and 1.091 dE against a floor of
  // 1.2, on two briefs whose per-seed MEAN was a healthy 8.6 and 9.8. A second rule draws its own
  // shape and production independently, which multiplies the space rather than adding to it.
  //
  // WHY THE PREVIOUS ROUND WAS RIGHT TO REMOVE IT AND WRONG ABOUT WHY. B05's reviewer called the
  // second register "roughly thirty loose shards" and "a core plus a composition, not one form
  // plus emptiness", and the answer taken was to delete the rule. But the atlas is explicit that
  // "rules are layers over one shared centre, and they compose rather than bury" — a second rule
  // becomes debris when its PRODUCTION throws children outward, and RING and BRANCH are the only
  // two that do. An inner register restricted to INSCRIBE and TRI, whose children sit at the
  // parent's own centre and at its edge midpoints, composes into the same silhouette.
  const ruleN = 2;
  set("FOCAL_HIERARCHY", "ruleCount", ruleN);
  const contraction = session.consult("rules[n].contraction");
  const contractionCeiling = { SINGLE_DOMINANT: 82, LAYERED: 70, EVEN_FIELD: 55 }[intent.focalMode];
  set("FOCAL_HIERARCHY", "rules[0].contraction", mechanism?.drive === "CONTRACT" ? 90 : contractionCeiling);
  notes.push({ stage: "FOCAL_HIERARCHY", why: `${ruleN} rules; contraction is a CEILING over floor 20 (law L1). The second is an INNER register, not a satellite: a lone rule offers the seed twelve distinct figures and a hundred-seed sweep found colliding pairs at 1.075 dE`, consulted: [ruleCount.parameter, contraction.parameter] });

  // ---- 3. NEGATIVE SPACE --------------------------------------------------------------------
  const branchPrune = session.consult("rules[n].branch and rules[n].prune");
  // The node budget refuses branch 3 above depthMax 4, so a seed-varied depth range takes branch 2
  // and buys the extra two levels the variation needs.
  const seedVariesGenerations = /\b(enclosure|generation|ring|level|nesting|bay|division)s?\b/i.test(direction.variationStrategy ?? "");
  const branch = seedVariesGenerations ? 2 : (ruleSet.includes("QUAD") ? 3 : { SPARSE: 2, MODERATE: 2, DENSE: 3 }[intent.densityTarget]);
  set("NEGATIVE_SPACE", "rules[0].branch", branch);
  set("NEGATIVE_SPACE", "rules[0].prune", pruneMaskFor(branch, intent.densityTarget));
  notes.push({ stage: "NEGATIVE_SPACE", why: `branch ${branch}${ruleSet.includes("QUAD") ? " because QUAD at branch 2 draws a face on every seed (atlas, gr-rule failure modes)" : ""}; prune mask avoids all-ones (law L2)`, consulted: branchPrune.parameter });

  // ---- 4. RHYTHM ----------------------------------------------------------------------------
  const sym = session.consult("rules[n].symSet");
  const symSet = wantsRadial
    ? (wantsSymmetryVariety ? ["NONE", "ROT3", "ROT6"] : ["NONE", "ROT3"])
    : (wantsSymmetryVariety ? ["NONE", "ROT3"] : ["NONE"]);
  set("RHYTHM", "rules[0].symSet", symSet);
  set("RHYTHM", "rules[0].rotation", intent.rhythmMode === "BROKEN" ? 34 : 12);
  notes.push({ stage: "RHYTHM", why: `symSet ${symSet.join("/")} — rotational replication is elected ONLY where the direction asks for a radial figure, because the atlas records ROT3/ROT6 as unavoidably a rosette and six of twelve blind reviews read the round-one work as one`, consulted: sym.parameter });

  // ---- 5. SECONDARY STRUCTURE ---------------------------------------------------------------
  if (ruleN === 2) {
    // ITS OWN THREE SHAPES, so the seed draws this register independently of the primary and the
    // categorical space multiplies instead of adding.
    set("SECONDARY_STRUCTURE", "rules[1].shapeSet", shapeSet.slice(1).length >= 2 ? shapeSet.slice(1) : shapeSet);
    // INSCRIBE AND TRI ONLY: the two productions whose children stay inside the parent's own
    // footprint (extentX 0.60 each, the tightest in the runtime). RING and BRANCH place children
    // at a radius equal to the parent's size and are what turns a second register into satellites.
    set("SECONDARY_STRUCTURE", "rules[1].ruleSet", ["INSCRIBE", "TRI"]);
    set("SECONDARY_STRUCTURE", "rules[1].contraction", 90);
    set("SECONDARY_STRUCTURE", "rules[1].branch", 2);
    set("SECONDARY_STRUCTURE", "rules[1].prune", pruneMaskFor(2, intent.densityTarget));
    set("SECONDARY_STRUCTURE", "rules[1].symSet", symSet.slice(0, 2));
    set("SECONDARY_STRUCTURE", "rules[1].rotation", intent.rhythmMode === "BROKEN" ? 40 : 18);
    set("SECONDARY_STRUCTURE", "rules[1].paletteIx", nonGroundIndex(pal0.palette.length, groundIx, [accentIx]));
    set("SECONDARY_STRUCTURE", "rules[1].variant", 1);
    set("SECONDARY_STRUCTURE", "rules[1].stroke", intent.strokeMode === "LINEWORK");
    // ITS OWN DEPTH RANGE, seed-drawn, which is a third independent categorical draw on this
    // register. The node budget is taken at depthMax across both rules, so it stays under the
    // primary's.
    set("SECONDARY_STRUCTURE", "rules[1].depthMin", 2);
    set("SECONDARY_STRUCTURE", "rules[1].depthMax", 4);
    notes.push({ stage: "SECONDARY_STRUCTURE", why: "a second rule is the runtime's real colour control (paletteCount does nothing) and its only route to two registers" });
  }

  // ---- 6. PALETTE ---------------------------------------------------------------------------
  // The depth the DETAIL stage will write, needed here because the colour walk is bounded by it.
  const depthPin = branch >= 3 ? 3 : 4;
  const seedVariesDepth = seedVariesGenerations;
  const pal = session.consult("palette, paletteCount, paletteIx, DEPTH_PALETTE, groundMode, groundIx, groundIx2");
  const { palette, namedInDirection } = pal0;
  set("PALETTE", "palette", palette);
  set("PALETTE", "groundMode", wantsGradedGround(direction) ? "RADIAL" : "FLAT");
  set("PALETTE", "groundIx", groundIx);
  set("PALETTE", "groundIx2", wantsGradedGround(direction) ? nonGroundIndex(pal0.palette.length, groundIx) : groundIx);
  set("PALETTE", "rules[0].paletteIx", accentIx);
  // DEPTH_PALETTE WALKS THE INDEX BY ONE PER LEVEL AND THE WALK CAN REACH THE GROUND INDEX.
  //
  // Same defect as the vector runtime's PALETTE_SHIFT, one step milder: there it painted a whole
  // field in the ground colour and blanked the token; here it paints one recursion LEVEL in it,
  // and the levels above and below still draw. It is elected only when the palette is long enough
  // that the walk cannot reach the ground within the deepest generation drawn — otherwise the
  // second rule carries the colour, which the atlas names as the other control.
  const walkFits = palette.length - 1 > (seedVariesDepth ? 5 : depthPin);
  const flags = [];
  if (intent.paletteMode !== "MONOCHROME" && walkFits) flags.push("DEPTH_PALETTE");
  if (intent.strokeMode === "LINEWORK") flags.push("OUTLINE");
  set("PALETTE", "flags", flags);
  notes.push({ stage: "PALETTE", why: `${namedInDirection} colour(s) named in the direction; DEPTH_PALETTE carries colour because paletteCount is measured inert`, consulted: pal.parameter });

  // ---- 7. DETAIL ----------------------------------------------------------------------------
  const depth = session.consult("rules[n].depthMin / depthMax");
  const stroke = session.consult("rules[n].stroke and the OUTLINE flag");
  // DEPTH IS SEED-DRAWN WHEN THE DIRECTION ASKS TOKENS TO DIFFER IN HOW MANY GENERATIONS THEY
  // CARRY, AND PINNED OTHERWISE. This is the one honest use left for the depth range: as a DRIVE
  // it is measured dead (0.348 dE between neutral and recovery), and as a SEED dimension it is the
  // only per-token control over how many enclosures a nested figure has. B12's "what varies
  // between tokens is the number of enclosures" is exactly that question.
  // THE SEED-VARIED DEPTH RANGE STARTS AT THE PINNED DEPTH RATHER THAN BELOW IT. Its floor is the
  // lightest token the collection will ever draw, and a range of 3..5 put that floor two
  // generations under the configuration's own centre: measured, the seed that drew the low end
  // came back at 0.031 ink in the stress state, under the blank floor, while every other seed sat
  // between 0.044 and 0.138. Four to six is the same three distinct enclosure counts with the
  // floor raised, and the node budget admits it at branch 2.
  set("DETAIL", "rules[0].depthMin", seedVariesDepth ? depthPin : depthPin);
  set("DETAIL", "rules[0].depthMax", seedVariesDepth ? Math.min(5, depthPin + 1) : depthPin);
  set("DETAIL", "rules[0].stroke", intent.strokeMode === "LINEWORK");
  set("DETAIL", "rules[0].variant", attempt === 0 ? 0 : 2);
  set("DETAIL", "title", titleFrom(direction));
  notes.push({ stage: "DETAIL", why: `depth ${seedVariesDepth ? `range 2..${depthPin}, seed-drawn because the direction asks tokens to differ in how many they carry` : `pinned at ${depthPin}`}; stroke=${intent.strokeMode} is the loudest control at 120px`, consulted: [depth.parameter, stroke.parameter] });

  // ---- 8. MARKET BEHAVIOUR ------------------------------------------------------------------
  const drive = session.consult("rules[n].drive x sensor x curve", { intendsMarketBinding: true });
  // THE MECHANISM DECIDES THIS AND NOTHING ELSE DOES. `mechanism.js` supplies the drive, the curve
  // and the sensor, and every one of the three is measured rather than reasoned about — the sensor
  // in particular, because seven of twelve round-one reviews reported the polarity inverted and
  // the fix is arithmetic: RECOVERY reads 326 / 0 / 964 per mille through LOG2 and DRAWDOWN reads
  // 326 / 981 / 552, so which state a magnitude peaks in is a property of the sensor.
  set("MARKET_BEHAVIOUR", "rules[0].drive", mechanism.drive);
  set("MARKET_BEHAVIOUR", "rules[0].sensor", mechanism.sensor);
  set("MARKET_BEHAVIOUR", "rules[0].curve", mechanism.curve);
  if (ruleN === 2) {
    // THE INNER REGISTER TAKES THE COUNTER SENSOR, WHICH IS NOT THE OTHER OF THE PAIR.
    // See `COUNTER_REGISTER`: bound to DRAWDOWN it grows precisely where the primary mechanism is
    // meant to be shrinking, and six of twelve critics named that inversion. VOLUME_TIER reads the
    // same at neutral and stress and rises in recovery, so it can only ever answer the pairing the
    // primary leaves ambiguous.
    set("MARKET_BEHAVIOUR", "rules[1].drive", "CONTRACT");
    set("MARKET_BEHAVIOUR", "rules[1].sensor", COUNTER_REGISTER.sensor);
    set("MARKET_BEHAVIOUR", "rules[1].curve", COUNTER_REGISTER.curve);
  }
  notes.push({
    stage: "MARKET_BEHAVIOUR",
    why: `mechanism ${mechanism.mechanism} ${mechanism.polarity} -> drive ${mechanism.drive} <- ${mechanism.sensor}/${mechanism.curve}. ${mechanism.detail}`,
    evidence: mechanism.evidence,
    consulted: drive.parameter,
  });
}

/**
 * VECTOR_COMPOSITION_V1.
 *
 * Steering facts: sizeMax is density and spreadMax is scale, and they are close to orthogonal;
 * count multiplies with size; twelve layouts are about six distinct pictures; STACK and SUBDIVIDE
 * ignore sizeMax entirely; the seed reaches NOTHING categorical, so per-token variety must come
 * from the scalars and PALETTE_SHIFT; a SIZE-driven field is blank whenever its sensor is low,
 * because size's floor is 2; the site budget is 120 total and 40 per field, paid at countMax.
 *
 * AND THE TWO THIS ROUND MEASURED. THREE FIELDS AT THE SPREAD CEILING REACH THE FRAME AND ONE DOES
 * NOT: extent 0.962 against 0.752, with zero blank seeds against three. Every scalar is a CEILING
 * the seed draws beneath, so a single field at spreadMax 128 spends half its tokens in the middle
 * of the frame — which is the "centred island with wide empty margins on all four sides" seven of
 * twelve reviews described. And TAPERING THE SECONDARIES INWARD, which the previous cut did on
 * purpose, costs both: extent 0.878 and an ink floor of 0.044 where the untapered set reads 0.962
 * and 0.047 with nothing blank.
 */
function authorVector({ set, session, intent, direction, mechanism, attempt, notes }) {
  const pal0 = paletteFrom(direction, intent);
  const ixCap = pal0.palette.length - 1;
  const groundIx = pal0.groundIx;
  const accentIx = pal0.accentIx;

  const req = mechanism.requires ?? {};
  const wantsRadial = intent.rhythmMode === "RADIAL";
  const other = mechanism.sensor === "RECOVERY" ? "DRAWDOWN" : "RECOVERY";

  // ---- 1. SILHOUETTE -----------------------------------------------------------------------
  const layout = session.consult("fields[n].layout");
  const primitive = session.consult("fields[n].primitive");
  // The polar family (RADIAL, ORBIT, SPIRAL, BURST) is what a brief forbidding "a centred emblem"
  // forbids, in the atlas's own words. It is elected only where the direction asks for one.
  const layoutByRhythm = {
    RADIAL: intent.extentTarget === "EXPANSIVE" ? "BURST" : "RADIAL",
    REGULAR: intent.densityTarget === "SPARSE" ? "LINEFIELD" : "GRID",
    BROKEN: "SCATTER",
  };
  let chosenLayout = layoutByRhythm[intent.rhythmMode];
  if (intent.focalMode === "LAYERED" && intent.rhythmMode === "REGULAR") chosenLayout = "STACK";
  // STACK is the only layout that reads as horizontal bands, and a direction whose motif is a
  // stacked sequence needs it whatever its rhythm says.
  if (/\b(band|bed|strat\w+|sediment\w*|section|horizontal)\w*\b/i.test(direction.motifTranslation ?? "")) chosenLayout = "STACK";
  // FRACTURE needs sites that can pile into one mass at the spread floor and separate as it rises.
  // A cell grid cannot: its sites are laid out on a lattice whatever the spread, so the members
  // never overlap into a single silhouette to begin with.
  if (req.fewLargeMembers) chosenLayout = wantsRadial ? "RADIAL" : "SCATTER";
  set("SILHOUETTE", "fields[0].layout", attempt === 0 ? chosenLayout : (chosenLayout === "GRID" ? "TILING" : "SCATTER"));
  const prim = intent.strokeMode === "LINEWORK"
    ? (wantsRadial ? "ARC" : "LINE")
    : ({ SPARSE: "NGON", MODERATE: "RECT", DENSE: "RECT" }[intent.densityTarget]);
  set("SILHOUETTE", "fields[0].primitive", prim);
  notes.push({ stage: "SILHOUETTE", why: `layout ${chosenLayout} from rhythmMode=${intent.rhythmMode}; primitive ${prim} (LINE..CUBIC are always stroked whatever stroke says)`, consulted: [layout.parameter, primitive.parameter] });

  // ---- 2. FOCAL HIERARCHY -------------------------------------------------------------------
  const size = session.consult("fields[n].sizeMax");
  const fieldCount = session.consult("fieldCount, and the site budget");
  // NEVER FEWER THAN TWO, AND THREE WHEREVER THE BUDGET ALLOWS. A single field carrying a driven
  // count blanked seven seeds of eight; three fields at the same settings blanked none. The atlas
  // adds that extent saturates at three, so three is a ceiling as well as a target.
  // THREE UNLESS THE DIRECTION ASKS FOR A MARGIN. Measured: one field at the spread ceiling reads
  // extent 0.752 with three blank seeds of twenty-four; three fields read 0.962 with none. Each
  // field draws its own seed byte for every scalar, so the reach and the coverage of the whole are
  // the MAXIMUM over the fields, and a second and third register is the only thing standing
  // between a low size draw and an empty tile. Hierarchy comes from size, not from field count.
  // A SPARSE COMPOSITION TAKES TWO REGISTERS, NOT THREE, AND THE BATTERY IS WHAT SETTLED IT.
  //
  // Three fields is the answer to the blank frame: one field at the spread ceiling reads extent
  // 0.752 with three blank seeds of twenty-four, three read 0.962 with none. But a palette has one
  // ground and typically two working colours, so on a sparse composition the third register shares
  // a colour with the first, sits inside its reach, and carries eight small marks over ground the
  // first has already covered — and its ablation moved the picture 1.201 dE against a
  // structural-role floor of 1.5. That is the battery saying the configuration declares a field it
  // does not have, and it is right: the honest fix is to declare two.
  const minimalComposition = intent.densityTarget === "SPARSE";
  const fields = Math.max(req.minFields ?? 2, minimalComposition ? 2 : 3);
  set("FOCAL_HIERARCHY", "fieldCount", fields);
  // FRACTURE wants a FEW LARGE members; everything else wants the calibrated density.
  // CALIBRATED ON THE MEASURED ROWS, not on the ends of the legal range. sizeMax is a CEILING the
  // seed draws beneath from a floor of 2, so the number here is the top of a distribution: at 22
  // half the tokens draw under 12, which at 120px is a three-pixel element. The rows that cleared
  // every floor sit at 26-28 on the primary.
  // THE DENSITY TARGETS ARE CALIBRATED AGAINST MEASURED COVERAGE, AND THEY WERE TOO HIGH.
  //
  // The objective battery bounds coverage from BELOW and nothing bounds it from above, so a brief
  // asking for restraint got the same frame as one asking for saturation and five of twelve
  // development critics said so with a number: "mean ink 66.9% against a direction that asks for
  // well under a third", "52.5% mean ink against a direction asking for well under half", "42%
  // where the direction requires the dark to be the larger part", "35% and the emptiest sampled
  // frame is still 12%, an order of magnitude above the brief's small fraction".
  //
  // Measured against the declared ground on this pipeline, the two shipped templates read 0.570
  // (compass) and 0.430 (alluvium) — both of them emphatic works. A sparse brief has to land well
  // under alluvium, not beside compass. The three targets are now roughly 0.20 / 0.35 / 0.55.
  // SPARSE WAS TAKEN TOO FAR: at a ceiling of 16 the third register's ablation moved the picture
  // less than the structural-role floor of 1.5 dE, which is the battery correctly saying that a
  // field that faint is a field the configuration is lying about having. 18 is the smallest
  // ceiling at which every declared register still earns its place.
  const sizeByDensity = { SPARSE: 18, MODERATE: 22, DENSE: 30 }[intent.densityTarget];
  // WHEN COUNT IS THE DRIVE, COUNT CARRIES THE DENSITY AND SIZE MUST LEAVE ROOM FOR IT.
  //
  // sizeMax and count MULTIPLY — the atlas's own (sizeMax, count) grid runs from 0.002 to 0.461, a
  // 230x range from two controls. A dense brief that takes both ends saturates: measured, a
  // COUNT-driven composition at the dense size ceiling reads ink 0.575 with ONE connected
  // component, and adding or removing a third of its elements moved the weakest pairing only
  // 3.279 because the members it added landed on top of members already there. The mechanism needs
  // coverage headroom, not just count headroom.
  // A STROKE-ONLY PRIMITIVE'S "SIZE" IS ITS LENGTH, AND A LONG LINE CROSSES THE WHOLE FRAME.
  //
  // LINE, POLYLINE, ARC, QUAD and CUBIC have no interior and the runtime always strokes them, so
  // the size ceiling sets how far each mark reaches rather than how much area it fills. Measured
  // on a linework composition at a size ceiling of 26: twelve marks and thirty-six marks read
  // ink120 0.367 and 0.423 — a count that TRIPLES and a coverage that moves nine per cent, because
  // long lines already cross everything the new ones would land on. The subtraction is real in the
  // bytes and 2.243 dE on the raster. Shorter marks are separable marks.
  const strokeOnly = ["LINE", "POLYLINE", "ARC", "QUAD", "CUBIC"].includes(prim);
  const sizeMax = req.fewLargeMembers
    ? 62
    : (mechanism.drive === "COUNT" ? Math.min(sizeByDensity, strokeOnly ? 16 : 26) : sizeByDensity);
  set("FOCAL_HIERARCHY", "fields[0].sizeMax", mechanism.drive === "SIZE" ? Math.max(sizeMax, 52) : sizeMax);
  notes.push({ stage: "FOCAL_HIERARCHY", why: `${fields} fields (never one: a single field losing members blanked 7 of 8 seeds); sizeMax ${sizeMax} from densityTarget=${intent.densityTarget}${req.fewLargeMembers ? ", raised because FRACTURE needs members large enough to overlap into one mass" : ""}`, consulted: [size.parameter, fieldCount.parameter] });

  // ---- 3. NEGATIVE SPACE --------------------------------------------------------------------
  const spread = session.consult("fields[n].spreadMax");
  // spreadMax is a CEILING and the seed draws beneath it from a floor of 16, so this is a
  // DISTRIBUTION rather than a reach. COMPACT is the only setting that should leave a margin, and
  // it is the one B05 asks for by name: "the single form held well clear of every edge".
  // FRACTURE OVERRULES A COMPACT COMPOSITION. The mechanism IS the distance between members, so a
  // spread ceiling of 88 leaves it two thirds of the range it needs and the mass never comes
  // apart: measured, the same construction at 88 reads 1.753 dE neutral-to-stress against 10.176
  // at the ceiling.
  const spreadMax = req.spreadCeiling ? 128 : { COMPACT: 88, MODERATE: 128, EXPANSIVE: 128 }[intent.extentTarget];
  set("NEGATIVE_SPACE", "fields[0].spreadMax", spreadMax);
  notes.push({ stage: "NEGATIVE_SPACE", why: `spreadMax ${spreadMax} from extentTarget=${intent.extentTarget}; measured near-orthogonal to sizeMax, so density is untouched`, consulted: spread.parameter });

  // ---- 4. RHYTHM ----------------------------------------------------------------------------
  const symmetry = session.consult("fields[n].symmetry");
  const count = session.consult("fields[n].countMin / countMax");
  const sym = wantsRadial ? "ROT6" : "NONE";
  set("RHYTHM", "fields[0].symmetry", sym);
  // THE COUNT RANGE IS THE MECHANISM'S, NOT THE DENSITY'S.
  //
  // When COUNT is the drive the range IS the amplitude of the market response and it must be wide;
  // when anything else is the drive the count must be PINNED, or the work is subtracting at the
  // same time as it separates and no reviewer can tell which mechanism it is watching. Both are
  // requirements recorded in the mechanism table rather than preferences.
  const base = req.fewLargeMembers ? 7 : { SPARSE: 12, MODERATE: 20, DENSE: 30 }[intent.densityTarget];
  const wide = mechanism.drive === "COUNT";
  // WHEN COUNT IS THE DRIVE, THE DENSITY TARGET IS THE FULL STATE AND NOT THE MIDDLE ONE.
  //
  // Two measured facts decide this together. Coverage tracks count only until the members start
  // landing on each other, so what a viewer reads as "fewer" is countMax/countMin rather than
  // countMax-countMin; and a driven count spends the CALM market near its floor, so where the base
  // sits decides how much room the response has left. Centring the range on the density target put
  // the neutral frame at half the coverage of the whole frame — measured ink 0.487 and 0.533 on
  // two dense subtraction compositions — and from there a count that rises 77% moved the raster
  // 3.675 and 3.719 dE, under the floor, because the members it added landed on members already
  // there.
  //
  // A dense brief that subtracts is dense in its FULL state and thinner in the other two, which is
  // also what those briefs say: "under stress the thicket thins dramatically", "in recovery the
  // sequence thickens and more beds return". So countMax carries the density target and countMin
  // is a third of it, widened where that would not reach the mechanism table's minimum range.
  const countLo = Math.max(4, Math.round(base / 3));
  const countHi = Math.min(38, Math.max(base, countLo + (req.countRangeAtLeast ?? 18)));
  const span = countHi - countLo;
  set("RHYTHM", "fields[0].countMin", wide ? countLo : base);
  set("RHYTHM", "fields[0].countMax", wide ? countHi : base);
  notes.push({ stage: "RHYTHM", why: `symmetry ${sym} (a project constant, so it carries no per-token variety); count ${wide ? `range widened because COUNT is the drive and the range IS the response` : "PINNED because the drive is not COUNT and a moving count would be a second mechanism nobody asked for"}`, consulted: [symmetry.parameter, count.parameter] });

  // ---- 5. SECONDARY STRUCTURE ---------------------------------------------------------------
  const LAYOUT_FAMILY = {
    GRID: "CELL", LATTICE: "CELL", TILING: "CELL", SUBDIVIDE: "CELL", STACK: "CELL", LINEFIELD: "CELL", WAVE: "CELL",
    SCATTER: "FREE", RADIAL: "POLAR", ORBIT: "POLAR", SPIRAL: "POLAR", BURST: "POLAR",
  };
  const SECONDARY_BY_FAMILY = {
    CELL: ["STACK", "GRID", "LINEFIELD"],
    POLAR: ["ORBIT", "RADIAL", "SPIRAL"],
    FREE: ["SCATTER", "GRID", "LINEFIELD"],
  };
  const family = LAYOUT_FAMILY[chosenLayout] ?? "FREE";
  const secondaries = SECONDARY_BY_FAMILY[family].filter((l) => l !== chosenLayout).concat(SECONDARY_BY_FAMILY[family]);
  for (let i = 1; i < fields; i += 1) {
    set("SECONDARY_STRUCTURE", `fields[${i}].layout`, req.fewLargeMembers ? chosenLayout : secondaries[(i - 1) % secondaries.length]);
    set("SECONDARY_STRUCTURE", `fields[${i}].primitive`, family === "POLAR" ? "ARC" : (intent.strokeMode === "LINEWORK" ? (i === 1 ? "LINE" : "POLYLINE") : (i === 1 ? "CIRCLE" : "RECT")));
    // THE FLOOR IS 18, NOT 14, BECAUSE THE BATTERY FOUND WHAT 14 BUYS. On a sparse composition the
    // third register came out at a size ceiling of 14 and its ablation moved the picture less than
    // the structural-role floor of 1.5 dE — which is the battery saying, correctly, that a field
    // that faint is a field the configuration is claiming to have and does not.
    set("SECONDARY_STRUCTURE", `fields[${i}].sizeMax`, Math.max(18, Math.round((req.fewLargeMembers ? 62 : sizeMax) * (i === 1 ? 0.85 : 0.7))));
    // NOT TAPERED INWARD. The previous cut held each secondary 14 units inside the one before it,
    // reasoning that a secondary reaching further than its primary reads as debris. Measured, that
    // taper costs the whole composition its reach: extent 0.878 against 0.962 untapered, and an
    // ink floor of 0.044 against 0.047. The reach of the work is the MAXIMUM over its fields, and
    // each field draws its own seed byte, so holding the secondaries in throws away two thirds of
    // the draws that would have touched the frame.
    set("SECONDARY_STRUCTURE", `fields[${i}].spreadMax`, Math.max(24, spreadMax - 6 * i));
    set("SECONDARY_STRUCTURE", `fields[${i}].symmetry`, sym);
    const sBase = req.fewLargeMembers ? Math.max(4, base - i) : Math.max(10, Math.round(base * 0.85));
    const sWide = mechanism.drive === "COUNT";
    const sLo = Math.max(4, Math.round(sBase / 3));
    set("SECONDARY_STRUCTURE", `fields[${i}].countMin`, sWide ? sLo : sBase);
    set("SECONDARY_STRUCTURE", `fields[${i}].countMax`, sWide ? Math.min(34, Math.max(sBase, sLo + (req.countRangeAtLeast ?? 18))) : sBase);
    set("SECONDARY_STRUCTURE", `fields[${i}].paletteIx`, (() => {
      const c = [];
      for (let k = 0; k < pal0.palette.length; k += 1) if (k !== groundIx) c.push(k);
      if (c.length === 0) throw new Error(`PALETTE_HAS_NO_FIGURE_COLOUR: every stop is the ground index ${groundIx}`);
      return c[(i - 1) % c.length];
    })());
    set("SECONDARY_STRUCTURE", `fields[${i}].variant`, i + 1);
    set("SECONDARY_STRUCTURE", `fields[${i}].stroke`, req.strokedField ? true : intent.strokeMode === "LINEWORK");
  }
  if (fields > 1) notes.push({ stage: "SECONDARY_STRUCTURE", why: `${fields - 1} secondary field(s) at the same reach as the primary — the composition's extent is the MAXIMUM over its fields and each draws its own seed byte, so holding the secondaries inward measured 0.878 extent against 0.962` });

  // ---- 6. PALETTE ---------------------------------------------------------------------------
  const pal = session.consult("palette, groundMode, PALETTE_SHIFT");
  const { palette, namedInDirection } = pal0;
  set("PALETTE", "palette", palette);
  set("PALETTE", "groundMode", wantsGradedGround(direction) ? "RADIAL" : "FLAT");
  set("PALETTE", "groundIx", groundIx);
  set("PALETTE", "groundIx2", wantsGradedGround(direction) ? nonGroundIndex(pal0.palette.length, groundIx) : groundIx);
  set("PALETTE", "fields[0].paletteIx", accentIx);
  // PALETTE_SHIFT IS NEVER ELECTED, AND THIS IS THE ROOT CAUSE OF THE BLANK TOKENS.
  //
  // The atlas describes it as harmless — "it rotates which stop a field takes, per token and per
  // field, and does not widen the picture's colour count", ink120 0.059 -> 0.057. What it does not
  // say, and what the rendered documents show, is that the rotation INCLUDES THE GROUND INDEX.
  // Measured on chain: with a four-stop palette and this flag set, seed 508194 came back as
  //
  //     <g id="f0" fill="#0f1113">   ... over ... <rect width="256" height="256" fill="#0f1113"/>
  //
  // — an entire field painted in the ground colour, ink 0.000 in all three market states. Roughly
  // one token in `paletteCount` per field, which the objective battery's own blank-token check
  // reproduces without any reviewer's help; and it was being elected on purpose, for a per-token
  // variety the atlas measures at two thousandths of coverage.
  //
  // THIS NOTE ONCE QUOTED A ROUND-ONE FINAL HOLDOUT REVIEWER, NAMING A HOLDOUT SEED. That put a
  // holdout token, and what it drew, into the author's own source — the leak the holdout exists to
  // prevent, in the file that reads it on every run. The quotation is preserved in full at
  // `packages/art-direction/rounds/QUARANTINE.md` (Q-1), outside the author-visible surface. The
  // finding above survives the redaction because it never rested on the quotation: seed 508194 is
  // an ordinary render, not a holdout token, and the battery finds the blanks by itself.
  //
  // Per-token variety comes from the scalars instead, which is where the measured 15-21 dE of seed
  // separation on the three-field rows comes from.
  const flags = [];
  if (intent.strokeMode === "LINEWORK" || req.strokedField) flags.push("OUTLINE");
  set("PALETTE", "flags", flags);
  notes.push({ stage: "PALETTE", why: `${namedInDirection} colour(s) named; PALETTE_SHIFT elected=${flags.includes("PALETTE_SHIFT")} because the seed reaches nothing categorical here`, consulted: pal.parameter });

  // ---- 7. DETAIL ----------------------------------------------------------------------------
  const strokeParam = session.consult("fields[n].stroke and the OUTLINE flag");
  // THICKENING WRITES A STROKE WIDTH AND NOTHING ELSE, so on a filled field its binding measured
  // 0.000 on all three pairings and 6 of 6 byte-identical state pairs. The requirement is not
  // advice and it overrules the direction's own stroke intent.
  set("DETAIL", "fields[0].stroke", req.strokedField ? true : intent.strokeMode === "LINEWORK");
  set("DETAIL", "fields[0].variant", attempt === 0 ? 0 : 3);
  set("DETAIL", "title", titleFrom(direction));
  notes.push({ stage: "DETAIL", why: `stroke=${req.strokedField ? "forced true by the THICKENING mechanism, whose drive writes a stroke width and measured exactly 0.000 on a filled field" : intent.strokeMode}`, consulted: strokeParam.parameter });

  // ---- 8. MARKET BEHAVIOUR ------------------------------------------------------------------
  const drive = session.consult("fields[n].drive x sensor x curve", { intendsMarketBinding: true });
  set("MARKET_BEHAVIOUR", "fields[0].drive", mechanism.drive);
  set("MARKET_BEHAVIOUR", "fields[0].sensor", mechanism.sensor);
  set("MARKET_BEHAVIOUR", "fields[0].curve", mechanism.curve);

  // THE MECHANISM RUNS ON THE REGISTERS IT NEEDS AND THE REST CARRY THE OTHER SENSOR.
  //
  // Two rules, both measured. `secondSensorRegister` says the last field must answer the sensor
  // the mechanism does not use: FRACTURE bound entirely to DRAWDOWN left neutral and recovery at
  // 3.640 dE, and moving one register to RECOVERY lifted it to 6.149 against a floor of 3.8. And
  // OCCLUSION is the one mechanism that must NOT run on field 0 — fields draw in order, so the
  // covering register is by definition a later one.
  const occluding = mechanism.mechanism === "OCCLUSION";
  for (let i = 1; i < fields; i += 1) {
    const last = i === fields - 1;
    if (occluding && last) {
      set("MARKET_BEHAVIOUR", `fields[${i}].drive`, "SIZE");
      set("MARKET_BEHAVIOUR", `fields[${i}].sensor`, "DRAWDOWN");
      set("MARKET_BEHAVIOUR", `fields[${i}].curve`, "LOG2");
      set("SECONDARY_STRUCTURE", `fields[${i}].sizeMax`, 56);
      continue;
    }
    if (last && (req.secondSensorRegister || fields >= 2)) {
      // THE COUNTER-REGISTER, WHICH SEPARATES RECOVERY WITHOUT FIGHTING THE MECHANISM.
      //
      // It was bound to the OTHER of DRAWDOWN and RECOVERY, which is the atlas's rule of thumb for
      // three distinguishable states and is also how a composition ends up growing exactly where
      // its primary mechanism is meant to be thinning. Six of twelve development critics reported
      // that inversion on work whose primary binding is arithmetically correct — "stress is the
      // heaviest, largest state", "under stress the fine beds vanish and survivors get fatter",
      // "stress is the sparsest state and recovery the busiest, exactly backwards".
      //
      // `COUNTER_REGISTER` is VOLUME_TIER, which reads IDENTICALLY at neutral and stress on this
      // fixture ring and rises in recovery. It cannot add to the state the mechanism is about. The
      // drive is always COUNT, whose floor the author owns; SIZE is reserved for the mechanisms
      // whose story growth actually is.
      set("MARKET_BEHAVIOUR", `fields[${i}].drive`, "COUNT");
      set("MARKET_BEHAVIOUR", `fields[${i}].sensor`, COUNTER_REGISTER.sensor);
      set("MARKET_BEHAVIOUR", `fields[${i}].curve`, COUNTER_REGISTER.curve);
      const d = "COUNT";
      if (req.fewLargeMembers) {
        set("SECONDARY_STRUCTURE", `fields[${i}].layout`, wantsRadial ? "ORBIT" : "GRID");
        // Larger than an ordinary counter-register, because on a fracture composition this field
        // is the ONLY thing separating recovery from neutral: the mass itself sits near the spread
        // floor in both. At 26 the pairing measured 3.744 against a floor of 3.8.
        set("SECONDARY_STRUCTURE", `fields[${i}].sizeMax`, 38);
      }
      // THE COUNTER-REGISTER IS HELD INSIDE THE PRIMARY'S REACH, and it is the ONLY field that is.
      // Tapering every secondary inward cost the composition its extent — measured 0.878 against
      // 0.962 — but a register whose whole job is a quiet recovery signal is exactly the one that
      // reads as debris when it lands outside the work: five of twelve critics named loose marks
      // in the margin, "orphan squares", "detached specks", "satellites", "reading as rendering
      // errors at 120px". The two registers that carry the composition still reach the frame.
      set("SECONDARY_STRUCTURE", `fields[${i}].spreadMax`, Math.max(40, Math.round(spreadMax * 0.7)));
      if (d === "COUNT") {
        // ITS AMPLITUDE IS SCALED TO THE COMPOSITION, NOT FIXED. A flat 5..33 range put the
        // counter-register's element count above the primary's on every sparse brief, so the
        // quiet signal was the loudest field in the frame — which is half of why five critics
        // measured coverage far above what their directions asked for.
        // ITS FLOOR IS THE COMPOSITION'S GUARANTEE, and it was four. On a fracture composition the
        // two mass registers draw their element sizes from a bytecode floor of 2, so a seed that
        // draws small on both leaves this register as the only thing in the frame — and at four
        // elements of seed-drawn size it was not enough: one neutral frame of a hundred came back
        // at 2.9% ink against the 4% floor.
        const floor = Math.max(req.fewLargeMembers ? 10 : 4, Math.round(base * 0.4));
        set("SECONDARY_STRUCTURE", `fields[${i}].countMin`, floor);
        // ON A FRACTURE COMPOSITION IT IS THE WHOLE RECOVERY SIGNAL and is scaled to the register
        // rather than to the mass. Fracture's own fields carry five to seven pinned members, so
        // scaling this one to that base leaves the neutral-to-recovery pairing at 3.3 dE.
        // The per-field site ceiling is 40 and the fracture composition's own two registers spend
        // only thirteen of the hundred-and-twenty total, so this one may take the room: raising
        // its floor to ten without raising its ceiling cost the neutral-to-recovery pairing 4.230
        // -> 3.784, under the floor.
        set("SECONDARY_STRUCTURE", `fields[${i}].countMax`, Math.min(req.fewLargeMembers ? 38 : 34, floor + (req.fewLargeMembers ? 28 : Math.max(10, base))));
      }
      continue;
    }
    // A SECOND MECHANISM THE DIRECTION ASKED FOR TAKES THE FIRST SECONDARY REGISTER.
    const sec = i === 1 && mechanism.secondary && !req.fewLargeMembers ? mechanism.secondary : null;
    set("MARKET_BEHAVIOUR", `fields[${i}].drive`, sec ? sec.drive : (mechanism.drive === "SIZE" ? "SPREAD" : mechanism.drive));
    set("MARKET_BEHAVIOUR", `fields[${i}].sensor`, sec ? sec.sensor : mechanism.sensor);
    set("MARKET_BEHAVIOUR", `fields[${i}].curve`, sec ? sec.curve : mechanism.curve);
    if (sec && sec.requires?.pinnedCount) {
      // SEPARATION and DILATION are about the interval and the reach, so their register's count is
      // pinned: a count that moves at the same time is a second mechanism nobody asked for on that
      // field, and the reviewer cannot tell which one it is watching.
      const pin = Math.max(10, Math.round(base * 0.85));
      set("SECONDARY_STRUCTURE", `fields[${i}].countMin`, pin);
      set("SECONDARY_STRUCTURE", `fields[${i}].countMax`, pin);
    }
  }
  notes.push({
    stage: "MARKET_BEHAVIOUR",
    why: `mechanism ${mechanism.mechanism} ${mechanism.polarity} -> drive ${mechanism.drive} <- ${mechanism.sensor}/${mechanism.curve}` +
      (mechanism.secondary ? `; field[1] carries the second mechanism the direction asks for, ${mechanism.secondary.mechanism} ${mechanism.secondary.polarity} -> ${mechanism.secondary.drive} <- ${mechanism.secondary.sensor}` : "") +
      `, with the last field on ${other} so all three states separate. ${mechanism.detail}`,
    evidence: mechanism.evidence,
    consulted: drive.parameter,
  });
}
