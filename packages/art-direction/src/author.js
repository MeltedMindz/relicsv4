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
import { COMPOSITION_PIN, chooseRecipe, compositionReach, detectCompositions, DEFAULT_COMPOSITION } from "./composition.js";
import { memberFor, resolveMember } from "./member.js";
import { COUNTER_REGISTER, counterRegisterFor, SENSOR_FOR_POLARITY, mechanismsRequestedBy, realisationFor } from "./mechanism.js";

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
export function resolveMechanism({ runtimeId, direction, ruleSet = null }) {
  const text = MECHANISM_SOURCE_FIELDS.map((f) => direction[f] ?? "").join("\n");
  const read = mechanismsRequestedBy(text);
  const stated = read.mechanisms.filter((m) => !m.unstated);
  const chosen = stated[0] ?? null;
  const mechanismId = chosen?.mechanism ?? DEFAULT_MECHANISM[runtimeId];
  const polarity = chosen?.polarity ?? DEFAULT_POLARITY;
  // THE COMPOSITION'S PRODUCTION SET CHOOSES AMONG REALISATIONS. `DILATION` on the recursion
  // runtime can be driven by CONTRACT, which needs RING or BRANCH, or by SPREAD, which needs
  // nothing. Taking the first unconditionally meant a brief asking for a form held clear of every
  // edge got RING added to its rule set to make the drive work, and the margin it asked for went
  // with it. The composition is decided first and named here.
  const realisation = realisationFor(runtimeId, mechanismId, polarity, ruleSet ? { ruleSet } : {});
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
        const r = realisationFor(runtimeId, m.mechanism, m.polarity ?? DEFAULT_POLARITY, ruleSet ? { ruleSet } : {});
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
    // rules[2] IS OWNED BY THE SAME STAGE AS rules[1] and it is here because a composition recipe
    // may declare three registers: `EDGE_TO_EDGE` on this runtime holds at three rules and reaches
    // 31 frames of 36 at two. The stage gate is about which STAGE writes a key, not about how many
    // registers a composition needs, so widening it does not weaken it -- a stage still cannot
    // reach a key it does not own.
    SECONDARY_STRUCTURE: [
      "rules[1].shapeSet", "rules[1].ruleSet", "rules[1].contraction", "rules[1].branch", "rules[1].prune", "rules[1].symSet", "rules[1].rotation", "rules[1].paletteIx", "rules[1].variant", "rules[1].stroke", "rules[1].depthMin", "rules[1].depthMax",
      "rules[2].shapeSet", "rules[2].ruleSet", "rules[2].contraction", "rules[2].branch", "rules[2].prune", "rules[2].symSet", "rules[2].rotation", "rules[2].paletteIx", "rules[2].variant", "rules[2].stroke", "rules[2].depthMin", "rules[2].depthMax",
    ],
    PALETTE: ["palette", "groundMode", "groundIx", "groundIx2", "flags", "rules[0].paletteIx"],
    DETAIL: ["rules[0].depthMin", "rules[0].depthMax", "rules[0].stroke", "rules[0].variant", "title", "traits"],
    MARKET_BEHAVIOUR: ["rules[0].sensor", "rules[0].curve", "rules[0].drive", "rules[1].sensor", "rules[1].curve", "rules[1].drive", "rules[2].sensor", "rules[2].curve", "rules[2].drive"],
  }),
  VECTOR_COMPOSITION_V1: Object.freeze({
    SILHOUETTE: ["fields[0].layout", "fields[0].primitive"],
    FOCAL_HIERARCHY: ["fieldCount", "fields[0].sizeMax"],
    NEGATIVE_SPACE: ["fields[0].spreadMax"],
    RHYTHM: ["fields[0].symmetry", "fields[0].countMin", "fields[0].countMax"],
    // fields[3] IS OWNED BY THE SAME STAGE AS fields[1] AND fields[2], for the same reason rules[2]
    // is on the recursion runtime: a composition recipe may declare four registers. The vector
    // reach recipes need them -- one for the mechanism, TWO pinned (a size floor and a spread
    // floor), and one for the counter-register -- and a three-register version of the same
    // arrangement either loses a pin or loses the counter-register. The stage gate is about which
    // STAGE writes a key, never about how many registers a composition needs.
    SECONDARY_STRUCTURE: [
      "fields[1].layout", "fields[1].primitive", "fields[1].sizeMax", "fields[1].spreadMax", "fields[1].symmetry", "fields[1].countMin", "fields[1].countMax", "fields[1].paletteIx", "fields[1].variant", "fields[1].stroke",
      "fields[2].layout", "fields[2].primitive", "fields[2].sizeMax", "fields[2].spreadMax", "fields[2].symmetry", "fields[2].countMin", "fields[2].countMax", "fields[2].paletteIx", "fields[2].variant", "fields[2].stroke",
      "fields[3].layout", "fields[3].primitive", "fields[3].sizeMax", "fields[3].spreadMax", "fields[3].symmetry", "fields[3].countMin", "fields[3].countMax", "fields[3].paletteIx", "fields[3].variant", "fields[3].stroke",
    ],
    PALETTE: ["palette", "groundMode", "groundIx", "groundIx2", "flags", "fields[0].paletteIx"],
    DETAIL: ["fields[0].variant", "fields[0].stroke", "title", "traits"],
    MARKET_BEHAVIOUR: ["fields[0].sensor", "fields[0].curve", "fields[0].drive", "fields[1].sensor", "fields[1].curve", "fields[1].drive", "fields[2].sensor", "fields[2].curve", "fields[2].drive", "fields[3].sensor", "fields[3].curve", "fields[3].drive"],
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
 * WHICH DIRECTION FIELDS THE COMPOSITION IS READ FROM, and why only these four.
 *
 * `composition` and `negativeSpace` are the fields whose own questions are "how the frame is used"
 * and "where the emptiness is"; `motifTranslation` carries the arrangement whenever the direction
 * states it as part of the subject ("horizontal beds stacked edge to edge"); and `thumbnailIntent`
 * is included because a direction routinely puts the reach in the sentence about browse size.
 *
 * THE OTHER EIGHT ARE DELIBERATELY NOT READ, for the reason `MECHANISM_SOURCE_FIELDS` gives:
 * `marketTransformation` is full of the reach and spread words this vocabulary matches on, and
 * reading it turns a description of the market response into an instruction about the frame.
 */
export const COMPOSITION_SOURCE_FIELDS = Object.freeze(["composition", "negativeSpace", "motifTranslation", "thumbnailIntent"]);

/**
 * WHICH FIELDS THE MEMBER IS READ FROM. The same four `strokeMode` read, because the member
 * vocabulary replaces `strokeMode` and inherits the question it was asking.
 */
export const MEMBER_SOURCE_FIELDS = Object.freeze(["medium", "motifTranslation", "paletteIntent", "thumbnailIntent"]);

/**
 * Read the direction for the composition, resolve it against what the runtime HOLDS, and pick the
 * arrangement whose measured coverage is nearest the density the direction also asked for.
 *
 * REFUSES rather than substitutes, on the same rule as `resolveMechanism`: a composition the
 * elected runtime cannot hold is an admission failure that reached the author, and quietly building
 * a different arrangement under the brief's title is the defect this whole lane exists to remove.
 *
 * `NOT_HELD` IS NOT A REFUSAL AND IS NOT A PASS. It is built, and it is RECORDED as built on an
 * arrangement the collection cannot be guaranteed on — the middle answer that round two had no way
 * to give. A reviewer refusing such a collection for a composition that failed on four seeds of
 * twelve is refusing something the receipt already said.
 */
export function resolveCompositionFor({ runtimeId, direction, intent, mechanismDrive = null }) {
  const text = COMPOSITION_SOURCE_FIELDS.map((f) => direction[f] ?? "").join("\n");
  const read = detectCompositions(text);
  const compositionId = read.best?.id ?? DEFAULT_COMPOSITION;
  const source = read.best ? "DIRECTION" : "DEFAULT";
  const reach = compositionReach(runtimeId, compositionId);
  if (reach.reach === "UNREACHABLE" || reach.reach === "UNMEASURED") {
    throw new Error(
      `COMPOSITION_NOT_AVAILABLE: the direction asks for ${compositionId} and ${runtimeId} is measured ${reach.reach} for it — ${reach.detail}. ` +
      "This is an admission failure that reached the author. The author does not substitute a different composition.",
    );
  }
  const memberFamily = intent.memberFamily ?? "MASS";
  const chosen = chooseRecipe({ runtimeId, compositionId, densityTarget: intent.densityTarget, memberFamily, memberId: intent.memberId ?? null, mechanismDrive });
  return {
    compositionId,
    source,
    evidence: read.best?.phrases ?? [],
    tied: read.tied,
    reach: reach.reach,
    reachDetail: reach.detail,
    recipe: chosen.recipe,
    recipeId: chosen.recipe?.id ?? null,
    measuredInk: chosen.ink ?? null,
    estimatedInk: chosen.estimatedInk ?? null,
    markScale: chosen.markScale ?? null,
    inkTarget: chosen.inkTarget ?? null,
    inkGap: chosen.inkGap ?? null,
    considered: chosen.considered ?? [],
    droppedUnderInkFloor: chosen.droppedUnderInkFloor ?? [],
    detail: chosen.detail,
  };
}

/**
 * The dimensions each composition's criterion actually reads, so a mechanism driving one of them
 * can be NAMED as a tension rather than discovered as a refusal.
 *
 * MEASURED NECESSITY. `CENTRED_FIGURE` rests on the margin at the WORST frame, and `DILATION` on
 * the recursion runtime is realised by `DRIVE_SPREAD`, which sets the root size from the sensor.
 * So a dilating centred figure reaches further at its peak than the arrangement was measured at,
 * and the margin the brief asked for is gone in exactly the state the brief is about: measured, the
 * authored configuration held its composition on 33 frames of 36 where the arrangement alone holds
 * all 36. That is not a bug in either half. It is the brief asking for a form that grows and for a
 * margin that does not, and the honest thing is to say so on the record rather than to pick one.
 */
export const COMPOSITION_SENSITIVE_DRIVES = Object.freeze({
  EDGE_TO_EDGE: ["SIZE", "SPREAD", "COUNT"],
  CENTRED_FIGURE: ["SIZE", "SPREAD"],
  STRATIFIED: ["SPREAD", "COUNT"],
  ALL_OVER_FIELD: ["COUNT", "SPREAD"],
  RADIAL_EMBLEM: ["SPREAD"],
  OFF_CENTRE_WEIGHT: ["SPREAD", "COUNT"],
});

/** Does the market response move a dimension the composition's own criterion is written over? */
export function compositionMechanismTension({ compositionId, drive }) {
  const sensitive = COMPOSITION_SENSITIVE_DRIVES[compositionId] ?? [];
  if (!sensitive.includes(drive)) return null;
  return {
    compositionId,
    drive,
    detail:
      `the ${compositionId} criterion is written over the dimension this mechanism drives (${drive}), so the composition holds at the arrangement's own values and moves with the market. ` +
      "It is recorded rather than resolved: choosing the composition would mute the transformation the brief asks for, and choosing the mechanism would drop the frame it also asks for.",
  };
}

/** Read the direction for the mark, and refuse where this runtime has no way to draw it. */
export function resolveMemberFor({ runtimeId, direction }) {
  const text = MEMBER_SOURCE_FIELDS.map((f) => direction[f] ?? "").join("\n");
  const resolved = resolveMember({ runtimeId, text });
  if (resolved.outcome === "REFUSED") {
    throw new Error(`MEMBER_NOT_AVAILABLE: ${resolved.detail} This is an admission failure that reached the author.`);
  }
  return { ...resolved, family: memberFor(resolved.memberId).family, what: memberFor(resolved.memberId).what };
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
  // THE ORDER OF THE THREE RESOLUTIONS IS LOAD-BEARING AND IT IS MARK, FRAME, MARKET.
  //
  // The MARK first, because the composition's density choice reads its FAMILY: the same arrangement
  // measures 0.62 coverage with a mass member and 0.28 with a line one, so choosing an arrangement
  // for a coverage target without knowing the mark is choosing against a number that does not exist
  // yet. The FRAME second. The MARKET last, because on the recursion runtime the composition's
  // production set decides which realisation of a mechanism is even available — and resolving the
  // market first is how a brief that asks for a margin ends up with RING in its rule set.
  const member = resolveMemberFor({ runtimeId, direction });
  const compositionIntent = { ...intent, memberFamily: member.family, memberId: member.memberId };
  // THE FRAME AND THE MARKET CONSTRAIN EACH OTHER, SO THE FRAME IS RESOLVED TWICE AND THE SECOND
  // PASS IS THE ONE THAT COUNTS.
  //
  // The market's realisation depends on the frame — on the recursion runtime the production set
  // decides which drive is even available. And the frame's CHOICE among holding arrangements
  // depends on the market: the composition atlas holds the market response out, so its coverage
  // floor is the arrangement's own, while a SIZE- or SPREAD-driven project floors at a bytecode
  // constant near nothing. Measured, that gap turned a composition the atlas floored at 0.09 into a
  // rendered frame at 0.029 — under the battery's blank floor.
  //
  // So: a provisional frame gives the market its production set, the market gives the frame its
  // drive, and the frame is chosen again knowing it. The first pass never reaches the bytes.
  const provisional = resolveCompositionFor({ runtimeId, direction, intent: compositionIntent });
  const mechanism = resolveMechanism({ runtimeId, direction, ruleSet: provisional.recipe?.rules?.[0]?.ruleSet ?? null });
  const composition = resolveCompositionFor({ runtimeId, direction, intent: compositionIntent, mechanismDrive: mechanism.drive });
  const session = createAtlasSession({ runtimeId, observedCodeHashes });
  const config = {};
  const writes = [];
  const set = makeWriter(runtimeId, config, writes);
  const notes = [];

  // The measured facts this author is steering by. Consulted, not recalled.
  const loudness = loudnessRanking(runtimeId);
  const quickRef = quickReference(runtimeId);

  if (runtimeId === "GEOMETRIC_RECURSION_V1") {
    authorRecursion({ set, session, intent, direction, mechanism, composition, member, attempt, notes });
  } else if (runtimeId === "VECTOR_COMPOSITION_V1") {
    authorVector({ set, session, intent, direction, mechanism, composition, member, attempt, notes });
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
    composition: { ...composition, mechanismTension: compositionMechanismTension({ compositionId: composition.compositionId, drive: mechanism.drive }) },
    member,
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
 * THE SAME THREE AXES AS THE VECTOR AUTHOR, and the same separation. The composition recipe
 * supplies the production set, the symmetry set, the contraction, the branch, the depth and which
 * rules are pinned; the member supplies the shape and the stroke; the mechanism supplies the
 * market response and runs on rule 0, which no recipe may pin.
 *
 * WHAT CHANGED, AND WHY IT HAD TO. The previous cut chose the production set from `extentTarget` —
 * three words reaching one lookup table — and the symmetry set from a single test for the word
 * "radial". Five of twelve round-two blind reviews refused the result as a centred figure in a
 * dead black frame, and the round-two finding concluded from the SOLIDITY that the corners were
 * unreachable. They are not: `BRANCH` with `QUAD` replication at contraction 90 over three rules
 * puts ink in a corner on every one of thirty-six frames, at 0.878 of the corner region on the
 * worst of them. What was missing was not a capability. It was a measurement.
 *
 * ERR_SEED_BLIND IS WHY THE SHAPE SET HAS TWO MEMBERS AND NOT ONE. The runtime refuses a
 * configuration in which no declared set has a second member, because then the token's seed draws
 * nothing categorical and every token is the same figure with different dials on it. The member
 * owns the first shape; the second is the nearest neighbour of the same weight, never a lighter
 * one — the atlas records that widening a set downward manufactures near-blank tokens with no
 * warning.
 */
function authorRecursion({ set, session, intent, direction, mechanism, composition, member, attempt, notes }) {
  const pal0 = paletteFrom(direction, intent);
  const groundIx = pal0.groundIx;
  const accentIx = pal0.accentIx;

  const recipe = composition.recipe;
  const units = recipe.rules;
  const nr = units.length;
  const mark = member.parameters;

  // The second shape, so the seed has a categorical draw. Same weight, never lighter: CROSS is
  // stroke-forced and carries ink120 0.060 against SQUARE's 0.399, and TRIANGLE is the next
  // lightest at 0.162 — a sparse set carrying either manufactures near-blank tokens.
  // THREE MEMBERS, NOT TWO, AND THE COLLECTION SWEEP IS WHY.
  //
  // The seed's whole categorical draw on this runtime is one shape, one production and one symmetry
  // per rule. A two-shape set over two rules whose productions and symmetry are fixed by the
  // composition offers four figures, and a hundred-seed sweep of four moulds contains colliding
  // pairs by arithmetic: measured on this round's own centred configuration, the closest pair came
  // back at 0.822 dE against the duplicate floor of 1.2, on a collection whose per-seed MEAN was a
  // healthy 9.974. Widening to three shapes is the cheapest categorical space available, because
  // the composition owns the other two draws.
  //
  // THE SHAPES ARE ORDERED BY WEIGHT AND THE LIGHT ONES ARE NEVER ADDED. The atlas records ink120
  // by shape at identical settings -- SQUARE 0.399, CIRCLE 0.316, HEX 0.265, DIAMOND 0.224,
  // TRIANGLE 0.162, CROSS 0.060 -- and that widening a set downward manufactures near-blank tokens
  // with no warning. So the neighbours are the two nearest in weight, above or below, and CROSS is
  // on no path at all.
  // FOUR MEMBERS, and the fourth is the collection sweep's doing rather than a preference. At three
  // the closest pair of a hundred seeds measured 0.764 dE against the duplicate floor of 1.2, on a
  // collection whose per-seed MEAN was 6.735 -- a healthy average hiding a colliding pair, which is
  // the exact shape of failure the sweep exists to catch and a per-seed mean cannot.
  const SHAPE_NEIGHBOURS = Object.freeze({
    SQUARE: ["DIAMOND", "CIRCLE", "HEX"],
    CIRCLE: ["HEX", "SQUARE", "DIAMOND"],
    HEX: ["SQUARE", "DIAMOND", "CIRCLE"],
    DIAMOND: ["SQUARE", "CIRCLE", "HEX"],
    TRIANGLE: ["DIAMOND", "HEX", "SQUARE"],
  });
  const shapeSet = [mark.shape, ...(SHAPE_NEIGHBOURS[mark.shape] ?? ["DIAMOND", "CIRCLE", "HEX"])];

  // ---- 1. SILHOUETTE -----------------------------------------------------------------------
  const shapes = session.consult("rules[n].shapeSet");
  const rules = session.consult("rules[n].ruleSet");
  set("SILHOUETTE", "rules[0].shapeSet", attempt === 0 ? shapeSet : [...shapeSet].reverse());
  set("SILHOUETTE", "rules[0].ruleSet", [...units[0].ruleSet]);
  notes.push({
    stage: "SILHOUETTE",
    why: `shapeSet ${shapeSet.join("/")} from the ${member.memberId} member (${member.what}) plus its nearest neighbour of the same weight, which is what ERR_SEED_BLIND requires and what stops the seed drawing a near-blank token; ruleSet ${units[0].ruleSet.join("/")} from the ${composition.compositionId} recipe ${recipe.id} (${composition.reach})`,
    composition: composition.detail,
    member: member.detail,
    consulted: [shapes.parameter, rules.parameter],
  });

  // ---- 2. FOCAL HIERARCHY -------------------------------------------------------------------
  const ruleCount = session.consult("ruleCount");
  const contraction = session.consult("rules[n].contraction");
  set("FOCAL_HIERARCHY", "ruleCount", nr);
  set("FOCAL_HIERARCHY", "rules[0].contraction", units[0].contraction);
  notes.push({ stage: "FOCAL_HIERARCHY", why: `${nr} rule(s) and contraction ${units[0].contraction}, both from the measured recipe. Contraction is a CEILING over a bytecode floor of 20 (law L1), which is why the later rules pin it: unpinned it is a dimension the seed decides and the composition cannot be guaranteed on.`, consulted: [ruleCount.parameter, contraction.parameter] });

  // ---- 3. NEGATIVE SPACE --------------------------------------------------------------------
  const branchPrune = session.consult("rules[n].branch and rules[n].prune");
  set("NEGATIVE_SPACE", "rules[0].branch", units[0].branch);
  set("NEGATIVE_SPACE", "rules[0].prune", units[0].prune ?? pruneMaskFor(units[0].branch, intent.densityTarget));
  notes.push({ stage: "NEGATIVE_SPACE", why: `branch ${units[0].branch} and prune ${units[0].prune} from the recipe; the node budget refuses branch 3 above depthMax 4 and branch 4 above depthMax 3, so the pair is measured together rather than chosen apart`, consulted: branchPrune.parameter });

  // ---- 4. RHYTHM ----------------------------------------------------------------------------
  const sym = session.consult("rules[n].symSet");
  set("RHYTHM", "rules[0].symSet", [...units[0].symSet]);
  set("RHYTHM", "rules[0].rotation", units[0].rotation ?? 12);
  notes.push({ stage: "RHYTHM", why: `symSet ${units[0].symSet.join("/")} from the recipe. The atlas records ROT3 and ROT6 as unavoidably a rosette and six of twelve round-one reviews read the work as one, so rotational replication is now elected by a MEASURED composition rather than by a word — ${composition.compositionId} needs it and ${composition.compositionId === "CENTRED_FIGURE" ? "does not get it" : "gets it"}`, consulted: sym.parameter });

  // ---- 5. SECONDARY STRUCTURE ---------------------------------------------------------------
  for (let i = 1; i < nr; i += 1) {
    const u = units[i];
    set("SECONDARY_STRUCTURE", `rules[${i}].shapeSet`, shapeSet);
    set("SECONDARY_STRUCTURE", `rules[${i}].ruleSet`, [...u.ruleSet]);
    set("SECONDARY_STRUCTURE", `rules[${i}].contraction`, u.contraction);
    set("SECONDARY_STRUCTURE", `rules[${i}].branch`, u.branch);
    set("SECONDARY_STRUCTURE", `rules[${i}].prune`, u.prune ?? pruneMaskFor(u.branch, intent.densityTarget));
    set("SECONDARY_STRUCTURE", `rules[${i}].symSet`, [...u.symSet]);
    set("SECONDARY_STRUCTURE", `rules[${i}].rotation`, u.rotation ?? 12 + i * 15);
    // EACH SECONDARY TAKES A DIFFERENT NON-GROUND STOP. Two rules on the same stop draw in the same
    // colour over one shared centre, and the battery reads the second one's ablation at 0.02 dE --
    // a register the configuration declares and does not have.
    set("SECONDARY_STRUCTURE", `rules[${i}].paletteIx`, (() => {
      const c = [];
      for (let k = 0; k < pal0.palette.length; k += 1) if (k !== groundIx) c.push(k);
      if (c.length === 0) throw new Error(`PALETTE_HAS_NO_FIGURE_COLOUR: every stop is the ground index ${groundIx}`);
      return c[(i - 1) % c.length];
    })());
    set("SECONDARY_STRUCTURE", `rules[${i}].variant`, mark.variant);
    set("SECONDARY_STRUCTURE", `rules[${i}].stroke`, mark.stroke);
    set("SECONDARY_STRUCTURE", `rules[${i}].depthMin`, u.depth);
    set("SECONDARY_STRUCTURE", `rules[${i}].depthMax`, u.depth);
  }
  if (nr > 1) {
    const pinned = units.map((u, i) => (u.pin ? `${i}:${u.pin}` : null)).filter(Boolean);
    notes.push({ stage: "SECONDARY_STRUCTURE", why: `${nr - 1} secondary register(s) at the recipe's own values -- the atlas is explicit that rules are layers over one shared centre that COMPOSE rather than bury. ${pinned.length ? `Pinned: ${pinned.join(", ")}.` : "No rule is pinned in this recipe."}` });
  }

  // ---- 6. PALETTE ---------------------------------------------------------------------------
  const pal = session.consult("palette, paletteCount, paletteIx, DEPTH_PALETTE, groundMode, groundIx, groundIx2");
  const { palette, namedInDirection } = pal0;
  set("PALETTE", "palette", palette);
  set("PALETTE", "groundMode", wantsGradedGround(direction) ? "RADIAL" : "FLAT");
  set("PALETTE", "groundIx", groundIx);
  set("PALETTE", "groundIx2", wantsGradedGround(direction) ? nonGroundIndex(pal0.palette.length, groundIx) : groundIx);
  // THE PRIMARY REGISTER IS GUARDED AGAINST THE GROUND INDEX TOO, AND IT WAS NOT.
  // `nonGroundIndex` guards every secondary and the primary took `accentIx` raw. On a palette whose
  // accent resolves to the ground stop that paints the loudest register in the background colour --
  // the exact defect this file records three times over for PALETTE_SHIFT, DEPTH_PALETTE and the
  // second recursion rule. Measured on B12: rule 0 came out at paletteIx 0 with groundIx 0.
  set("PALETTE", "rules[0].paletteIx", accentIx === groundIx ? nonGroundIndex(pal0.palette.length, groundIx) : accentIx);
  // DEPTH_PALETTE WALKS THE INDEX BY ONE PER LEVEL AND THE WALK CAN REACH THE GROUND INDEX. It is
  // elected only when the palette is long enough that the walk cannot reach the ground within the
  // deepest generation drawn; otherwise the later rules carry the colour, which the atlas names as
  // the other control (paletteCount is measured inert: 2.0 distinct fills at every count).
  const deepest = Math.max(...units.map((u) => u.depth));
  const walkFits = palette.length - 1 > deepest;
  const flags = [];
  if (intent.paletteMode !== "MONOCHROME" && walkFits) flags.push("DEPTH_PALETTE");
  if (mark.stroke) flags.push("OUTLINE");
  set("PALETTE", "flags", flags);
  notes.push({ stage: "PALETTE", why: `${namedInDirection} colour(s) named in the direction; DEPTH_PALETTE ${walkFits ? "carries colour because paletteCount is measured inert" : `is NOT elected: the walk would reach the ground index within ${deepest} generations and paint a level in the background colour`}`, consulted: pal.parameter });

  // ---- 7. DETAIL ----------------------------------------------------------------------------
  const depth = session.consult("rules[n].depthMin / depthMax");
  const stroke = session.consult("rules[n].stroke and the OUTLINE flag");
  set("DETAIL", "rules[0].depthMin", units[0].depth);
  set("DETAIL", "rules[0].depthMax", units[0].depth);
  set("DETAIL", "rules[0].stroke", mark.stroke);
  set("DETAIL", "rules[0].variant", mark.variant);
  set("DETAIL", "title", titleFrom(direction));
  notes.push({ stage: "DETAIL", why: `depth PINNED at ${units[0].depth} — as a DRIVE it is measured dead (0.348 dE between neutral and recovery) and as a ceiling it is one more dimension the seed would decide; stroke=${mark.stroke} from the ${member.memberId} member, and it is the loudest control at 120px (0.399 filled against 0.121 stroked)`, consulted: [depth.parameter, stroke.parameter] });

  // ---- 8. MARKET BEHAVIOUR ------------------------------------------------------------------
  const drive = session.consult("rules[n].drive x sensor x curve", { intendsMarketBinding: true });
  set("MARKET_BEHAVIOUR", "rules[0].drive", mechanism.drive);
  set("MARKET_BEHAVIOUR", "rules[0].sensor", mechanism.sensor);
  set("MARKET_BEHAVIOUR", "rules[0].curve", mechanism.curve);
  const pins = [];
  const counterRegisters = [];
  for (let i = 1; i < nr; i += 1) {
    if (units[i].pin) {
      set("MARKET_BEHAVIOUR", `rules[${i}].drive`, units[i].pin);
      set("MARKET_BEHAVIOUR", `rules[${i}].sensor`, COMPOSITION_PIN.sensor);
      set("MARKET_BEHAVIOUR", `rules[${i}].curve`, COMPOSITION_PIN.curve);
      pins.push(`rules[${i}].${units[i].pin}`);
      continue;
    }
    counterRegisters.push(i);
  }
  let counterIndex = 0;
  for (const counterRegister of counterRegisters) {
    // THE COUNTER SENSOR IS NOT THE OTHER OF THE PAIR. Bound to DRAWDOWN this register grows
    // precisely where the primary mechanism is meant to be shrinking, and six of twelve critics
    // named that inversion. VOLUME_TIER reads the same at neutral and stress and rises in recovery,
    // so it can only ever answer the pairing the primary leaves ambiguous.
    // THE DRIVE IS SPREAD AND NOT CONTRACT, AND THE BATTERY IS WHAT SETTLED IT. The atlas measures
    // CONTRACT as a real change that is not a COVERAGE change -- "held on CONTRACT, no sensor
    // separated the three states at 120px, at any contraction ceiling from 30 to 90" -- and SPREAD
    // as the only recursion drive with a large raster signature (delta 0.184 against every other
    // drive's 0.000). Measured on this round's own authored configuration: with CONTRACT the
    // counter-register's ablation moved the picture 1.117 dE against the structural-role floor of
    // 1.5, which is the battery correctly saying the configuration declares a register it does not
    // have, and the neutral-to-stress pairing came back at 2.583 against a floor of 3.8.
    //
    // SPREAD's floor is the bytecode constant 40 of 256 and VOLUME_TIER never reads zero, so this
    // carries none of the blank risk that makes SIZE-driven fields dangerous.
    const counter = counterRegisterFor(mechanism.sensor);
    counterIndex += 1;
    set("MARKET_BEHAVIOUR", `rules[${counterRegister}].drive`, "SPREAD");
    set("MARKET_BEHAVIOUR", `rules[${counterRegister}].sensor`, counter.sensor);
    set("MARKET_BEHAVIOUR", `rules[${counterRegister}].curve`, counter.curve);
  }
  notes.push({
    stage: "MARKET_BEHAVIOUR",
    why: `mechanism ${mechanism.mechanism} ${mechanism.polarity} -> drive ${mechanism.drive} <- ${mechanism.sensor}/${mechanism.curve} on rule 0` +
      (mechanism.constraintHonoured === false ? `. THE COMPOSITION AND THE MECHANISM DISAGREE: no realisation of ${mechanism.mechanism} is satisfied by the production set ${units[0].ruleSet.join("/")} this composition needs, so the unconstrained realisation was taken and the drive may be quieter than its evidence row` : "") +
      (pins.length ? `; composition pins on ${pins.join(", ")} (${COMPOSITION_PIN.sensor}/${COMPOSITION_PIN.curve}, constant in all three states — NOT market bindings, and checkBindings will correctly call them dead)` : "") +
      (counterRegisters.length ? `; rule(s) ${counterRegisters.join(", ")} carry ${counterRegisterFor(mechanism.sensor).sensor}: ${counterRegisterFor(mechanism.sensor).why}` : "") +
      `. ${mechanism.detail}`,
    evidence: mechanism.evidence,
    consulted: drive.parameter,
  });
}


/**
 * VECTOR_COMPOSITION_V1.
 *
 * THREE AXES, DECIDED SEPARATELY AND COMBINED HERE.
 *
 *   COMPOSITION   `composition.js` supplies the recipe: layout, size, spread, count, symmetry and
 *                 which registers are pinned. Every value in it was measured against the deployed
 *                 runtime over twelve authoring seeds at three market states, and the recipe was
 *                 chosen because it HOLDS its property on the WORST of them.
 *   MEMBER        `member.js` supplies the mark: primitive, stroke and variant. It replaces
 *                 `strokeMode`, the two-valued switch that reached nine primitives through one
 *                 binary and produced four of twelve round-two refusals.
 *   MECHANISM     `mechanism.js` supplies the market response, and it runs on register 0 — which
 *                 no recipe is allowed to pin, precisely so there is always somewhere to put it.
 *
 * WHAT THE AUTHOR NO LONGER DECIDES, and this is the change: spread, symmetry, layout and field
 * count are not derived from an intent word any more. `extentTarget` reached exactly one parameter
 * (`spreadMax`) through three words, and five of twelve round-two blind reviews refused the result
 * as a centred figure in a dead black frame. A word cannot carry a guarantee; a measured
 * arrangement can.
 *
 * DENSITY STILL DECIDES, BUT BY SELECTING RATHER THAN BY SCALING. `chooseRecipe` picks among the
 * arrangements that already hold, by the coverage each was MEASURED at, and reports the residual it
 * cannot close as `inkGap`. Scaling a holding recipe to hit a density word would spend the
 * guarantee to buy a coverage the author cannot predict anyway — the atlas's own (sizeMax, count)
 * grid runs over a 230x range from two controls.
 */
function authorVector({ set, session, intent, direction, mechanism, composition, member, attempt, notes }) {
  const pal0 = paletteFrom(direction, intent);
  const groundIx = pal0.groundIx;
  const accentIx = pal0.accentIx;

  const req = mechanism.requires ?? {};
  const recipe = composition.recipe;
  const units = recipe.fields;
  const nf = units.length;
  const mark = member.parameters;

  // ---- 1. SILHOUETTE -----------------------------------------------------------------------
  const layout = session.consult("fields[n].layout");
  const primitive = session.consult("fields[n].primitive");
  set("SILHOUETTE", "fields[0].layout", units[0].layout);
  set("SILHOUETTE", "fields[0].primitive", mark.primitive);
  notes.push({
    stage: "SILHOUETTE",
    why: `layout ${units[0].layout} from the ${composition.compositionId} recipe ${recipe.id} (${composition.reach}); primitive ${mark.primitive} from the ${member.memberId} member — ${member.what}. LINE..CUBIC are always stroked whatever stroke says.`,
    composition: composition.detail,
    member: member.detail,
    consulted: [layout.parameter, primitive.parameter],
  });

  // ---- 2. FOCAL HIERARCHY -------------------------------------------------------------------
  const size = session.consult("fields[n].sizeMax");
  const fieldCount = session.consult("fieldCount, and the site budget");
  set("FOCAL_HIERARCHY", "fieldCount", nf);
  set("FOCAL_HIERARCHY", "fields[0].sizeMax", units[0].sizeMax);
  notes.push({ stage: "FOCAL_HIERARCHY", why: `${nf} registers and sizeMax ${units[0].sizeMax}, both from the measured recipe rather than from a density word. Registers 1..${nf - 1} carry the composition and register 0 carries the market.`, consulted: [size.parameter, fieldCount.parameter] });

  // ---- 3. NEGATIVE SPACE --------------------------------------------------------------------
  const spread = session.consult("fields[n].spreadMax");
  set("NEGATIVE_SPACE", "fields[0].spreadMax", units[0].spreadMax);
  notes.push({ stage: "NEGATIVE_SPACE", why: `spreadMax ${units[0].spreadMax} from the recipe. Spread is a CEILING the seed draws beneath from a bytecode floor of 16, which is why the recipe pins it on the later registers: unpinned, one seed in twelve draws low and is a centred island in a collection that bleeds.`, consulted: spread.parameter });

  // ---- 4. RHYTHM ----------------------------------------------------------------------------
  const symmetry = session.consult("fields[n].symmetry");
  const count = session.consult("fields[n].countMin / countMax");
  set("RHYTHM", "fields[0].symmetry", units[0].symmetry);
  // THE COUNT RANGE IS THE MECHANISM'S, NOT THE DENSITY'S. When COUNT is the drive the range IS the
  // amplitude of the market response and it must be wide; when anything else is the drive the count
  // is PINNED at the recipe's own value, or the work is subtracting at the same time as it does
  // whatever the brief asked for and no reviewer can tell which mechanism it is watching.
  const base = req.fewLargeMembers ? Math.min(units[0].count, 7) : units[0].count;
  const wide = mechanism.drive === "COUNT";
  const countLo = Math.max(4, Math.round(base / 3));
  const countHi = Math.min(38, Math.max(base, countLo + (req.countRangeAtLeast ?? 18)));
  set("RHYTHM", "fields[0].countMin", wide ? countLo : base);
  set("RHYTHM", "fields[0].countMax", wide ? countHi : base);
  notes.push({ stage: "RHYTHM", why: `symmetry ${units[0].symmetry} from the recipe — it is a project constant and carries no per-token variety, which is why the recipe rather than a seed decides it; count ${wide ? `widened to ${countLo}..${countHi} because COUNT is the drive and the range IS the response` : `PINNED at ${base} because the drive is not COUNT`}`, consulted: [symmetry.parameter, count.parameter] });

  // ---- 5. SECONDARY STRUCTURE ---------------------------------------------------------------
  for (let i = 1; i < nf; i += 1) {
    const u = units[i];
    set("SECONDARY_STRUCTURE", `fields[${i}].layout`, u.layout);
    set("SECONDARY_STRUCTURE", `fields[${i}].primitive`, mark.primitive);
    set("SECONDARY_STRUCTURE", `fields[${i}].sizeMax`, u.sizeMax);
    set("SECONDARY_STRUCTURE", `fields[${i}].spreadMax`, u.spreadMax);
    set("SECONDARY_STRUCTURE", `fields[${i}].symmetry`, u.symmetry);
    set("SECONDARY_STRUCTURE", `fields[${i}].countMin`, u.count);
    set("SECONDARY_STRUCTURE", `fields[${i}].countMax`, u.count);
    set("SECONDARY_STRUCTURE", `fields[${i}].paletteIx`, (() => {
      const c = [];
      for (let k = 0; k < pal0.palette.length; k += 1) if (k !== groundIx) c.push(k);
      if (c.length === 0) throw new Error(`PALETTE_HAS_NO_FIGURE_COLOUR: every stop is the ground index ${groundIx}`);
      return c[(i - 1) % c.length];
    })());
    set("SECONDARY_STRUCTURE", `fields[${i}].variant`, mark.variant);
    set("SECONDARY_STRUCTURE", `fields[${i}].stroke`, req.strokedField ? true : mark.stroke);
  }
  if (nf > 1) {
    const pinned = units.map((u, i) => (u.pin ? `${i}:${u.pin}` : null)).filter(Boolean);
    notes.push({ stage: "SECONDARY_STRUCTURE", why: `${nf - 1} secondary register(s) at the recipe's own values. ${pinned.length ? `Pinned: ${pinned.join(", ")} — the pin takes the dimension away from the seed and makes it a project constant, which is the only creator-owned floor either runtime offers.` : "No register is pinned in this recipe."}` });
  }

  // ---- 6. PALETTE ---------------------------------------------------------------------------
  const pal = session.consult("palette, groundMode, PALETTE_SHIFT");
  const { palette, namedInDirection } = pal0;
  set("PALETTE", "palette", palette);
  set("PALETTE", "groundMode", wantsGradedGround(direction) ? "RADIAL" : "FLAT");
  set("PALETTE", "groundIx", groundIx);
  set("PALETTE", "groundIx2", wantsGradedGround(direction) ? nonGroundIndex(pal0.palette.length, groundIx) : groundIx);
  set("PALETTE", "fields[0].paletteIx", accentIx === groundIx ? nonGroundIndex(pal0.palette.length, groundIx) : accentIx);
  // PALETTE_SHIFT IS NEVER ELECTED, AND THIS IS THE ROOT CAUSE OF THE BLANK TOKENS. The atlas calls
  // it harmless — ink120 0.059 -> 0.057 — and what it does not say is that the rotation INCLUDES THE
  // GROUND INDEX. Measured on chain: with a four-stop palette and this flag set, one seed came back
  // with an entire field painted `#0f1113` over a `#0f1113` ground, ink 0.000 in all three market
  // states. Roughly one token in `paletteCount` per field, for a per-token variety the atlas
  // measures at two thousandths of coverage. Per-token variety comes from the scalars instead.
  const flags = [];
  if (mark.stroke || req.strokedField) flags.push("OUTLINE");
  set("PALETTE", "flags", flags);
  notes.push({ stage: "PALETTE", why: `${namedInDirection} colour(s) named; PALETTE_SHIFT is never elected because its rotation reaches the ground index and paints a whole field in the background colour`, consulted: pal.parameter });

  // ---- 7. DETAIL ----------------------------------------------------------------------------
  const strokeParam = session.consult("fields[n].stroke and the OUTLINE flag");
  // THICKENING WRITES A STROKE WIDTH AND NOTHING ELSE, so on a filled field its binding measured
  // 0.000 on all three pairings and 6 of 6 byte-identical state pairs. The requirement is not
  // advice and it overrules the member's own fill choice — recorded, because it means the mark the
  // brief asked for is not quite the mark that was drawn.
  const strokeOverridden = Boolean(req.strokedField) && mark.stroke === false;
  set("DETAIL", "fields[0].stroke", req.strokedField ? true : mark.stroke);
  set("DETAIL", "fields[0].variant", mark.variant);
  set("DETAIL", "title", titleFrom(direction));
  notes.push({ stage: "DETAIL", why: `stroke=${req.strokedField ? "forced true by the THICKENING mechanism, whose drive writes a stroke width and measured exactly 0.000 on a filled field" : mark.stroke}; variant ${mark.variant} from the ${member.memberId} member${strokeOverridden ? ". THE MECHANISM OVERRODE THE MARK: the brief asked for a filled member and the market response needs a stroke to write into" : ""}`, consulted: strokeParam.parameter });

  // ---- 8. MARKET BEHAVIOUR ------------------------------------------------------------------
  const drive = session.consult("fields[n].drive x sensor x curve", { intendsMarketBinding: true });
  // REGISTER 0 CARRIES THE MECHANISM AND IS NEVER PINNED. That invariant is asserted in
  // `assertCompositionCatalogCurrent` rather than remembered here, because the failure it prevents
  // — a recipe with nowhere left to put the market response — is silent.
  set("MARKET_BEHAVIOUR", "fields[0].drive", mechanism.drive);
  set("MARKET_BEHAVIOUR", "fields[0].sensor", mechanism.sensor);
  set("MARKET_BEHAVIOUR", "fields[0].curve", mechanism.curve);

  const pins = [];
  const counterRegisters = [];
  for (let i = 1; i < nf; i += 1) {
    if (units[i].pin) {
      // A PIN IS NOT A MARKET BINDING. It is the deliberate absence of one: QUOTE_VOLUME reads 687
      // per mille in ALL THREE states, so the dimension resolves identically on every token and in
      // every state instead of being drawn by the seed. `checkBindings` will report DEAD_SENSOR for
      // this register and that report is CORRECT — it travels into the receipt rather than being
      // suppressed, because a reader has to be able to tell a dimension the author took away from
      // the seed from a dimension nobody thought about.
      set("MARKET_BEHAVIOUR", `fields[${i}].drive`, units[i].pin);
      set("MARKET_BEHAVIOUR", `fields[${i}].sensor`, COMPOSITION_PIN.sensor);
      set("MARKET_BEHAVIOUR", `fields[${i}].curve`, COMPOSITION_PIN.curve);
      pins.push(`fields[${i}].${units[i].pin}`);
      continue;
    }
    counterRegisters.push(i);
  }
  // EVERY UNPINNED REGISTER AFTER THE MECHANISM'S CARRIES THE COUNTER-REGISTER, not only the last.
  // A register the author writes no binding for is a register whose sensor, curve and drive are
  // undefined, and the encoder refuses that -- but the failure it would have been is worse than a
  // refusal: a register left on whatever the recipe happened to carry is a market response nobody
  // chose.
  let counterIndex = 0;
  for (const counterRegister of counterRegisters) {
    // THE COUNTER-REGISTER, WHICH SEPARATES RECOVERY WITHOUT FIGHTING THE MECHANISM. It was bound
    // to the OTHER of DRAWDOWN and RECOVERY, which is how a composition ends up growing exactly
    // where its primary mechanism is meant to be thinning — six of twelve development critics
    // reported that inversion on work whose primary binding is arithmetically correct.
    // `COUNTER_REGISTER` is VOLUME_TIER, which reads IDENTICALLY at neutral and stress on this
    // fixture ring and rises in recovery, so it can only ever answer the pairing the primary
    // leaves ambiguous.
    // BOTH PAIRINGS GET A REGISTER WHERE THERE IS ROOM FOR TWO.
    //
    // The counter-register the primary's polarity calls for answers the pairing the primary leaves
    // ambiguous. A composition with a second unpinned register can also answer the OTHER pairing,
    // and measured it is worth having: giving every counter the polarity-matched binding raised one
    // case's weakest pairing from 5.94 to 9.91 dE and dropped three others below the floor, because
    // the register that used to carry the other pairing had stopped carrying it. Two registers, two
    // pairings, in the order the primary makes urgent.
    // A SECOND COUNTER-REGISTER ADDS AMPLITUDE TO THE SAME PAIRING, NEVER TO THE OTHER ONE.
    //
    // Giving counter 1 the other polarity's counter-register was measured and it is wrong: on a
    // DRAWDOWN primary that puts a second stress-peaking register into a collection whose stress
    // pairing already reads 16.87 dE and whose neutral-to-recovery pairing reads 3.035, and the
    // battery blocked it. The weak pairing is a property of the PRIMARY, so every counter-register
    // answers the same one and they differ only in the dimension they move.
    //
    // COUNT IS NEVER ELECTED ON A STRESS-PEAKING SENSOR. That is the inversion finding: more
    // members in the damaged state is the reading six of twelve development critics refused.
    // SPREAD on the same sensor scatters instead, which is damage.
    // TWO COUNTER-REGISTERS, ONE PER PAIRING, AND ALL THREE ARRANGEMENTS WERE MEASURED.
    //
    // Both on the polarity-matched binding: two registers with the same sensor, the same drive and
    // the same amplitude in two layouts, and the battery calls the second one dead -- ablation
    // 0.855 to 1.424 dE against the structural-role floor of 1.5, on four cases. One counter and a
    // second pin: the weak pairing has one register and five of twelve cases fall under the
    // separation floor. One per pairing: seven of twelve pass, which is the arrangement kept.
    //
    // The second answers the pairing the primary OWNS, which sounds redundant and is not. A
    // register that moves where the primary already moves is a register whose ablation is visible
    // -- it earns its structural role -- while a duplicate of the first is not, and the pairing it
    // reinforces is the one whose reading is a claim about the loudest state.
    // AND THE SECOND COUNTER IS ASYMMETRIC, BECAUSE THE TWO PRIMARIES ARE NOT SYMMETRIC ON THIS
    // FIXTURE RING. A DRAWDOWN primary reads 20 / 900 / 80: it saturates neutral-to-stress and
    // stress-to-recovery -- measured 16.9 and 15.9 dE on this round's own cases -- and leaves
    // neutral-to-recovery at 1.1. A second register on the loud pairing adds nothing to a reading
    // that is already four times the floor, so BOTH counters answer the quiet one, differing in
    // the dimension they move. A RECOVERY primary reads 20 / 0 / 820 and leaves neutral-to-stress
    // quiet without saturating anything, so there its second counter takes the other pairing.
    const primaryCounter = counterRegisterFor(mechanism.sensor);
    const counter = counterIndex === 0
      ? primaryCounter
      : (mechanism.sensor === "DRAWDOWN"
        ? { ...primaryCounter, drive: "SPREAD", why: `${primaryCounter.why}; the second one moves SPREAD rather than COUNT so the two are not the same register in two layouts` }
        : counterRegisterFor("DRAWDOWN"));
    counterIndex += 1;
    set("MARKET_BEHAVIOUR", `fields[${counterRegister}].drive`, counter.drive);
    set("MARKET_BEHAVIOUR", `fields[${counterRegister}].sensor`, counter.sensor);
    set("MARKET_BEHAVIOUR", `fields[${counterRegister}].curve`, counter.curve);
    // ITS AMPLITUDE IS THE WHOLE NEUTRAL-TO-RECOVERY SIGNAL, AND A DOUBLING WAS NOT ENOUGH.
    //
    // VOLUME_TIER reads 267 per mille at neutral and stress and 467 in recovery, so a driven count
    // spends two states of three near its floor and the pairing this register exists to separate is
    // carried entirely by the difference between the floor and what recovery reaches. At
    // `floor + max(8, floor*0.8)` the neutral-to-recovery pairing measured 2.282 and 1.980 dE on
    // two cases against a floor of 3.8, and the battery blocked both. Tripling the floor is the
    // widest range the per-field site ceiling of 40 admits at these counts.
    // ITS FLOOR IS SCALED TO THE COMPOSITION, NOT TAKEN FROM THE RECIPE'S SMALLEST REGISTER.
    //
    // The recipes put their lightest register last, and the last register is the one this loop
    // hands the market signal to. Measured: at the recipe's own count the second counter-register's
    // ablation moved the picture 0.855 to 1.424 dE against the battery's structural-role floor of
    // 1.5 on four cases -- the battery correctly saying the configuration declares a register it
    // does not have. Three quarters of the primary's count is the smallest floor at which every
    // declared register earns its place, and count only ADDS coverage, so it cannot cost a reach
    // composition its hold.
    const floor = Math.max(units[counterRegister].count, Math.round(units[0].count * 0.75));
    set("SECONDARY_STRUCTURE", `fields[${counterRegister}].countMin`, floor);
    set("SECONDARY_STRUCTURE", `fields[${counterRegister}].countMax`, Math.min(40, Math.max(floor + 12, floor * 3)));
    // AND IT HAS TO BE BIG ENOUGH TO BE SEEN. The recipes put their smallest register last, so the
    // register carrying the entire neutral-to-recovery signal was the faintest thing in the frame:
    // measured, a count that triples on a register at a fifth of the primary's size moved the
    // pairing 2.6 dE against a floor of 3.8. Ninety per cent of the primary's size ceiling is the
    // smallest value at which the change reads, and it can only ADD coverage -- the reach and
    // corner criteria are monotone in it, so raising it cannot cost the composition its hold.
    set("SECONDARY_STRUCTURE", `fields[${counterRegister}].sizeMax`, Math.max(units[counterRegister].sizeMax, Math.round(units[0].sizeMax * 0.9)));
  }
  notes.push({
    stage: "MARKET_BEHAVIOUR",
    why: `mechanism ${mechanism.mechanism} ${mechanism.polarity} -> drive ${mechanism.drive} <- ${mechanism.sensor}/${mechanism.curve} on register 0` +
      (pins.length ? `; composition pins on ${pins.join(", ")} (${COMPOSITION_PIN.sensor}/${COMPOSITION_PIN.curve}, which reads the same in all three states — these are NOT market bindings and checkBindings will correctly call them dead)` : "") +
      (counterRegisters.length ? `; register(s) ${counterRegisters.join(", ")} carry ${counterRegisterFor(mechanism.sensor).sensor} on ${counterRegisterFor(mechanism.sensor).drive}, which is flat on the pairing the primary owns: ${counterRegisterFor(mechanism.sensor).why}` : "") +
      `. ${mechanism.detail}`,
    evidence: mechanism.evidence,
    consulted: drive.parameter,
  });
}
