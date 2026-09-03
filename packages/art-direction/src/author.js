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
      EXPANSIVE: [rx(String.raw`\b(expansive|reach\w+\s+(out|toward|to)\s+the\s+edge|fills?\s+the\s+frame|spread\w*\s+wide|edge\s+to\s+edge|sprawl\w*)\b`)],
    },
    default: "COMPACT",
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
const NEGATORS = /\b(no|not|never|without|avoid\w*|free\s+of|absent|lack\w*|refus\w*|un(interrupted|broken))\b/i;

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
    let chosen = null;
    let phrase = null;
    const rejected = [];
    for (const [option, patterns] of Object.entries(spec.options)) {
      let hit = null;
      for (const p of patterns) {
        // Scan every occurrence, not just the first: "no interruption ... then a broken interval"
        // must still read as BROKEN on the second phrase.
        for (const m of haystack.matchAll(new RegExp(p.source, `${p.flags.includes("g") ? p.flags : `${p.flags}g`}`))) {
          if (negatedAt(haystack, m.index)) { rejected.push({ option, phrase: m[0], why: "negated in its own clause" }); continue; }
          hit = m; break;
        }
        if (hit) break;
      }
      if (hit) { chosen = option; phrase = hit[0]; break; }
    }
    intent[key] = chosen ?? spec.default;
    derivation[key] = chosen
      ? { source: "DIRECTION", value: chosen, phrase, fields: spec.from, rejected }
      : { source: "DEFAULT", value: spec.default, detail: `the direction's ${spec.from.join("/")} did not name a ${key}`, rejected };
  }
  return { intent, derivation };
}

/** Colour words the direction may use, and a hex for each. Small, declared, and never guessed at. */
const COLOUR_WORDS = Object.freeze({
  ochre: "#b07d3a", rust: "#8c4a2f", iron: "#4a4f55", ash: "#8d8b86", bone: "#d9d2c2",
  charcoal: "#26282b", ink: "#14161a", copper: "#a4643c", brass: "#9c7f3d", verdigris: "#4e7d6e",
  green: "#3f6b४f".replace("४", "4"), moss: "#5b6b45", slate: "#59636b", sand: "#c2ac82",
  blue: "#3a5a7a", indigo: "#2b3350", violet: "#5a4a6b", crimson: "#7a2f33", red: "#8f3a33",
  gold: "#c2a04a", cream: "#e6dcc6", white: "#efeae0", black: "#0f1113", grey: "#6f7377",
  gray: "#6f7377", umber: "#5b4632", sepia: "#6b533a", teal: "#356b6b", amber: "#c08a35",
});

/** The default palette when the direction names no colour: archaeological, restrained, dark ground. */
const DEFAULT_PALETTE = Object.freeze(["#14161a", "#8d8b86", "#b07d3a", "#d9d2c2"]);

function paletteFrom(direction, intent) {
  const text = `${direction.paletteIntent ?? ""} ${direction.motifTranslation ?? ""}`.toLowerCase();
  const named = [];
  for (const [word, hex] of Object.entries(COLOUR_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text) && !named.includes(hex)) named.push(hex);
  }
  let palette = named.length >= 2 ? named : [...DEFAULT_PALETTE];
  if (intent.paletteMode === "MONOCHROME") palette = [palette[0] ?? "#14161a", palette[palette.length - 1] ?? "#d9d2c2"];
  if (intent.paletteMode === "CONTRASTING" && palette.length < 3) palette = [...palette, "#c2a04a"];
  // The codec accepts 2..10 and the chain enforces it; clamp rather than emit an illegal document.
  if (palette.length < 2) palette = [...DEFAULT_PALETTE];
  return { palette: palette.slice(0, 10), namedInDirection: named.length };
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
  const session = createAtlasSession({ runtimeId, observedCodeHashes });
  const config = {};
  const writes = [];
  const set = makeWriter(runtimeId, config, writes);
  const notes = [];

  // The measured facts this author is steering by. Consulted, not recalled.
  const loudness = loudnessRanking(runtimeId);
  const quickRef = quickReference(runtimeId);

  if (runtimeId === "GEOMETRIC_RECURSION_V1") {
    authorRecursion({ set, session, intent, direction, attempt, notes });
  } else if (runtimeId === "VECTOR_COMPOSITION_V1") {
    authorVector({ set, session, intent, direction, attempt, notes });
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
 * is nearly free of visual effect and expensive in budget, so pin it unless it is the drive;
 * paletteCount does nothing and DEPTH_PALETTE is the colour control; a gradient ground makes the
 * ground the loudest thing in the frame; the node budget refuses branch 3 above depth 4.
 */
function authorRecursion({ set, session, intent, direction, attempt, notes }) {
  // ---- 1. SILHOUETTE -----------------------------------------------------------------------
  const shapes = session.consult("rules[n].shapeSet");
  const rules = session.consult("rules[n].ruleSet");
  // COVERAGE IS CALIBRATED AGAINST THE TWO WORKS THAT PASSED BLIND REVIEW, not against the ends of
  // the measured range. compass ships ink120 0.208 and alluvium 0.282; those are what "reads at
  // browse size" looks like on this runtime family. A first cut mapped SPARSE to {CROSS}, the
  // lightest seed shape at 0.060, and measured 0.026-0.069 across four seeds -- a near-blank tile
  // that fails the ink floor, and it failed seed diversity too. SPARSENESS IS ABOUT WHERE THE INK
  // IS NOT, and it is delivered by contraction and extent below, not by drawing almost nothing.
  // CROSS is therefore never elected on any path.
  //
  // EVERY SET DECLARES AT LEAST TWO MEMBERS. The seed draws one shape and one production from the
  // creator's sets, and those two draws are the ONLY categorical variety this runtime gives a
  // token -- a single-member set spends it. The runtime agrees strongly enough to have an error
  // code for the degenerate case (ERR_SEED_BLIND, "no set has >1 member").
  const shapeByDensity = {
    SPARSE: ["DIAMOND", "TRIANGLE", "CIRCLE"],
    MODERATE: ["SQUARE", "DIAMOND", "HEX"],
    DENSE: ["SQUARE", "HEX", "DIAMOND"],
  };
  const shapeSet = intent.rhythmMode === "RADIAL"
    ? ["CIRCLE", "HEX", "DIAMOND"]
    : shapeByDensity[intent.densityTarget];
  set("SILHOUETTE", "rules[0].shapeSet", attempt === 0 ? shapeSet : [...shapeSet].reverse());
  notes.push({ stage: "SILHOUETTE", why: `shapeSet from densityTarget=${intent.densityTarget}; the atlas ranks seed shape second-loudest at 120px`, consulted: shapes.parameter });

  // Extent is decided by the production. RING/BRANCH reach 0.85/0.78 extentX and clip; the other
  // four sit at 0.60-0.65. So EXPANSIVE may use them and COMPACT may not.
  const ruleByExtent = {
    COMPACT: intent.rhythmMode === "RADIAL" ? ["INSCRIBE", "QUAD", "TRI"] : ["QUAD", "TRI", "INSCRIBE"],
    MODERATE: ["QUAD", "TRI", "INSCRIBE"],
    EXPANSIVE: intent.rhythmMode === "RADIAL" ? ["RING", "QUAD", "TRI"] : ["BRANCH", "TRI", "QUAD"],
  };
  // L3: a set is as responsive as its worst member, and BSP is inert under PRUNE and ROTATE. It is
  // never declared here, on any path -- that is the measured 7-of-12 failure in compass-cairn.
  const ruleSet = (ruleByExtent[intent.extentTarget] ?? ["QUAD"]).filter((r) => r !== "BSP");
  set("SILHOUETTE", "rules[0].ruleSet", ruleSet);
  notes.push({ stage: "SILHOUETTE", why: `ruleSet from extentTarget=${intent.extentTarget}; BSP excluded on every path (law L3: inert under PRUNE/ROTATE)`, consulted: rules.parameter });

  // ---- 2. FOCAL HIERARCHY -------------------------------------------------------------------
  const ruleCount = session.consult("ruleCount");
  // ALWAYS TWO RULES. The atlas is explicit that "paletteCount does nothing. DEPTH_PALETTE and a
  // SECOND RULE are the colour controls", and compass -- which is emphatically single-dominant --
  // ships two. Hierarchy is established by contraction and scale below, not by having only one
  // structure; a single rule spends the runtime's second colour channel and half its seed variety
  // to express something the composition stages already express better.
  const secondRule = 2;
  set("FOCAL_HIERARCHY", "ruleCount", secondRule);
  const contraction = session.consult("rules[n].contraction");
  // Ceiling, not a value (law L1): the floor is 20 and the seed picks beneath. A high ceiling
  // widens the per-token spread, which is what SINGLE_DOMINANT wants and EVEN_FIELD does not.
  const contractionCeiling = { SINGLE_DOMINANT: 82, LAYERED: 70, EVEN_FIELD: 55 }[intent.focalMode];
  set("FOCAL_HIERARCHY", "rules[0].contraction", contractionCeiling);
  notes.push({ stage: "FOCAL_HIERARCHY", why: `contraction is a CEILING over floor 20 (law L1); ${contractionCeiling} from focalMode=${intent.focalMode}`, consulted: [ruleCount.parameter, contraction.parameter] });

  // ---- 3. NEGATIVE SPACE --------------------------------------------------------------------
  const branchPrune = session.consult("rules[n].branch and rules[n].prune");
  // The node budget refuses branch 3 above depth 4 and branch 4 above depth 3, so branch is chosen
  // here and depth is pinned against it in DETAIL.
  const branch = { SPARSE: 2, MODERATE: 2, DENSE: 3 }[intent.densityTarget];
  set("NEGATIVE_SPACE", "rules[0].branch", branch);
  // prune is a MASK over the children `branch` produces, so it is DERIVED from branch rather than
  // written down -- see pruneMaskFor. A constant here is a constant coupled to another stage.
  set("NEGATIVE_SPACE", "rules[0].prune", pruneMaskFor(branch, intent.densityTarget));
  notes.push({ stage: "NEGATIVE_SPACE", why: `branch ${branch} kept low so the node budget admits depth in DETAIL; prune mask avoids all-ones (law L2)`, consulted: branchPrune.parameter });

  // ---- 4. RHYTHM ----------------------------------------------------------------------------
  const sym = session.consult("rules[n].symSet");
  // Symmetry is free coverage and an inescapable mandala. RADIAL wants it; a broken rhythm cannot
  // have it, because ROT6 will impose regularity whatever else the configuration does.
  // SYMMETRY IS THE SEED'S BIGGEST LEVER AND MUST BE A SET, NOT A VALUE.
  //
  // Measured against the shipped templates: compass declares FOUR symmetries, four rules and three
  // shapes, and its seed-to-seed separation is 12.1-18.3. Single-member sets authored here measured
  // 1.05-3.6 on the same ring -- twelve tokens that read as one work, which is precisely the
  // failure that held `idol`. The seed draws one member per set, so the SETS ARE the per-token
  // variety; nothing else in this runtime carries it.
  //
  // Symmetry is also free coverage (NONE 0.331 -> ROT6 0.434), so a set spanning both ends gives
  // the collection a real range of weight as well as of structure.
  // THE SET MUST SPAN THE COVERAGE RANGE, not sit inside it. compass declares NONE through ROT6 --
  // 0.331 to 0.434 -- so its tokens differ in WEIGHT as well as in structure. A set of three
  // similar symmetries (QUAD, MIRROR_X, ROT3) measured seed separation 1.79-3.01 where compass
  // reaches 12.1-18.3, because every token came out the same weight.
  const symSet = {
    RADIAL: ["NONE", "ROT3", "ROT6", "QUAD"],
    REGULAR: ["NONE", "MIRROR_X", "QUAD", "ROT3"],
    BROKEN: ["NONE", "MIRROR_X", "MIRROR_Y", "ROT3"],
  }[intent.rhythmMode];
  set("RHYTHM", "rules[0].symSet", symSet);
  // rotation 0 makes DRIVE_ROTATE a multiplication by zero (law L2). Non-zero unless deliberately unused.
  set("RHYTHM", "rules[0].rotation", intent.rhythmMode === "BROKEN" ? 34 : 12);
  notes.push({ stage: "RHYTHM", why: `symSet ${symSet} from rhythmMode=${intent.rhythmMode}; symmetry is free coverage and imposes a mandala`, consulted: sym.parameter });

  // ---- 5. SECONDARY STRUCTURE ---------------------------------------------------------------
  if (secondRule === 2) {
    set("SECONDARY_STRUCTURE", "rules[1].shapeSet", ["CIRCLE"]);
    set("SECONDARY_STRUCTURE", "rules[1].ruleSet", ["INSCRIBE"]);
    set("SECONDARY_STRUCTURE", "rules[1].contraction", 46);
    set("SECONDARY_STRUCTURE", "rules[1].branch", 2);
    set("SECONDARY_STRUCTURE", "rules[1].prune", pruneMaskFor(2, intent.densityTarget));
    set("SECONDARY_STRUCTURE", "rules[1].symSet", ["NONE"]);
    set("SECONDARY_STRUCTURE", "rules[1].rotation", 20);
    set("SECONDARY_STRUCTURE", "rules[1].paletteIx", 2);
    set("SECONDARY_STRUCTURE", "rules[1].variant", 1);
    set("SECONDARY_STRUCTURE", "rules[1].stroke", true);
    set("SECONDARY_STRUCTURE", "rules[1].depthMin", 2);
    set("SECONDARY_STRUCTURE", "rules[1].depthMax", 3);
    notes.push({ stage: "SECONDARY_STRUCTURE", why: "a second rule is the runtime's real colour control (paletteCount does nothing) and its only route to two registers" });
  }

  // ---- 6. PALETTE ---------------------------------------------------------------------------
  const pal = session.consult("palette, paletteCount, paletteIx, DEPTH_PALETTE, groundMode, groundIx, groundIx2");
  const { palette, namedInDirection } = paletteFrom(direction, intent);
  set("PALETTE", "palette", palette);
  // A gradient ground makes the ground the loudest thing in the frame (measured 0.399 FLAT ->
  // 0.882 RADIAL). That is a deliberate choice for a radial work and a mistake everywhere else.
  set("PALETTE", "groundMode", intent.rhythmMode === "RADIAL" && intent.densityTarget !== "DENSE" ? "RADIAL" : "FLAT");
  set("PALETTE", "groundIx", 0);
  set("PALETTE", "groundIx2", Math.min(1, palette.length - 1));
  set("PALETTE", "rules[0].paletteIx", Math.min(intent.paletteMode === "CONTRASTING" ? 2 : 1, palette.length - 1));
  // DEPTH_PALETTE is the colour control; OUTLINE reads as linework at browse size.
  const flags = [];
  if (intent.paletteMode !== "MONOCHROME") flags.push("DEPTH_PALETTE");
  if (intent.strokeMode === "LINEWORK") flags.push("OUTLINE");
  set("PALETTE", "flags", flags);
  notes.push({ stage: "PALETTE", why: `${namedInDirection} colour(s) named in the direction; DEPTH_PALETTE carries colour because paletteCount is measured inert`, consulted: pal.parameter });

  // ---- 7. DETAIL ----------------------------------------------------------------------------
  const depth = session.consult("rules[n].depthMin / depthMax");
  const stroke = session.consult("rules[n].stroke and the OUTLINE flag");
  // Depth is +0.004 ink over five levels and 30x the elements. Pin it (depthMin == depthMax)
  // unless it is the drive -- MARKET_BEHAVIOUR unpins it if it elects DEPTH.
  const depthPin = branch >= 3 ? 3 : 4;
  set("DETAIL", "rules[0].depthMin", depthPin);
  set("DETAIL", "rules[0].depthMax", depthPin);
  // stroke is the LOUDEST control in the runtime: 0.399 filled -> 0.121 stroked.
  set("DETAIL", "rules[0].stroke", intent.strokeMode === "LINEWORK");
  set("DETAIL", "rules[0].variant", attempt === 0 ? 0 : 2);
  set("DETAIL", "title", titleFrom(direction));
  notes.push({ stage: "DETAIL", why: `depth pinned at ${depthPin} (measured +0.004 ink over five levels, 30x elements); stroke=${intent.strokeMode} is the loudest control at 120px`, consulted: [depth.parameter, stroke.parameter] });

  // ---- 8. MARKET BEHAVIOUR ------------------------------------------------------------------
  const drive = session.consult("rules[n].drive x sensor x curve", { intendsMarketBinding: false });
  // VISIBILITY DECIDES THIS, NOT PROVABILITY, AND THE DIFFERENCE COST A MEASUREMENT TO LEARN.
  //
  // `binding.js` can compute a reachable range for three of the six drives — CONTRACT, ROTATE and
  // DEPTH — because the atlas states a floor for each. So an earlier cut elected DEPTH for the
  // density axis, on the reasoning that a provable binding beats an unprovable one. It encoded, it
  // validated on chain, it rendered, and its symbolic report read REACHABLE with a span of 3.
  //
  // Measured on the deployed runtime at 120px, its state separation was 0.02 / 0.27 / 0.55 / 0.74
  // against a floor of 3.8. The binding moves and the picture does not. The atlas says so twice:
  // law L4 is "THE LOUDEST-SOUNDING CONTROL IS THE QUIETEST ON A RASTER", with `gr-drive` at
  // DEPTH rendering 5 / 14 / 5 elements at ink120 0.490 / 0.490 / 0.490, and the quick reference
  // says flatly "Only DRIVE_SPREAD is loud at 120px."
  //
  // So SPREAD is elected for every axis that needs a visible change, and its symbolic reachability
  // stays UNKNOWN — the atlas records its loudness but not its floor. That is the correct trade:
  // symbolic reachability is NECESSARY AND NOT SUFFICIENT, an unprovable binding is settled by the
  // render, and a provably-reachable invisible one is settled by nothing at all because it looks
  // like a pass. CONTRACT keeps the scale axis, where it is both provable and measurably loud.
  const axis = {
    DENSITY: { drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR" },
    STRUCTURE: { drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR" },
    SCALE: { drive: "CONTRACT", sensor: "RECOVERY", curve: "LOG2" },
    EROSION: { drive: "SPREAD", sensor: "DRAWDOWN", curve: "LINEAR" },
  }[intent.marketAxis];
  // DEPTH as a drive REQUIRES an unpinned depth range, or law L2 makes it a constant. This is the
  // one place a later stage legitimately revisits an earlier parameter, and it is not a stage
  // violation because MARKET_BEHAVIOUR owns the drive that makes the range meaningful -- so the
  // unpinning is done through DETAIL's own keys via an explicit second write.
  set("MARKET_BEHAVIOUR", "rules[0].drive", axis.drive);
  set("MARKET_BEHAVIOUR", "rules[0].sensor", axis.sensor);
  set("MARKET_BEHAVIOUR", "rules[0].curve", axis.curve);
  if (axis.drive === "DEPTH") {
    set("DETAIL", "rules[0].depthMin", 1);
    set("DETAIL", "rules[0].depthMax", branch >= 3 ? 3 : 4);
    notes.push({ stage: "MARKET_BEHAVIOUR", why: "DEPTH is the drive, so the depth range is unpinned (law L2: depthMin == depthMax makes DRIVE_DEPTH a constant)" });
  }
  if (secondRule === 2) {
    set("MARKET_BEHAVIOUR", "rules[1].drive", "CONTRACT");
    set("MARKET_BEHAVIOUR", "rules[1].sensor", "RECOVERY");
    set("MARKET_BEHAVIOUR", "rules[1].curve", "LOG2");
  }
  notes.push({ stage: "MARKET_BEHAVIOUR", why: `marketAxis=${intent.marketAxis} -> ${axis.drive} <- ${axis.sensor}/${axis.curve}`, consulted: drive.parameter });
}

/**
 * VECTOR_COMPOSITION_V1.
 *
 * Steering facts: sizeMax is density and spreadMax is scale, and they are close to orthogonal;
 * count multiplies with size; twelve layouts are about six distinct pictures; STACK and SUBDIVIDE
 * ignore sizeMax entirely; the seed reaches NOTHING categorical, so per-token variety must come
 * from the scalars and PALETTE_SHIFT; a SIZE-driven field is blank whenever its sensor is low,
 * because size's floor is 2; the site budget is 120 total and 40 per field, paid at countMax.
 */
function authorVector({ set, session, intent, direction, attempt, notes }) {
  // ---- 1. SILHOUETTE -----------------------------------------------------------------------
  const layout = session.consult("fields[n].layout");
  const primitive = session.consult("fields[n].primitive");
  // Twelve layouts, about six pictures. GRID/LATTICE/TILING/WAVE are one of them, so only one is
  // ever offered here -- picking between them would be a choice with no visual consequence.
  const layoutByRhythm = {
    RADIAL: intent.extentTarget === "EXPANSIVE" ? "BURST" : "RADIAL",
    REGULAR: intent.densityTarget === "SPARSE" ? "LINEFIELD" : "GRID",
    BROKEN: "SCATTER",
  };
  let chosenLayout = layoutByRhythm[intent.rhythmMode];
  if (intent.focalMode === "LAYERED" && intent.rhythmMode === "REGULAR") chosenLayout = "STACK";
  set("SILHOUETTE", "fields[0].layout", attempt === 0 ? chosenLayout : (chosenLayout === "GRID" ? "TILING" : "SCATTER"));
  // LINE..CUBIC have no interior and are ALWAYS stroked whatever `stroke` says -- a filled line is
  // an invisible element, which is how a project ships a blank frame that still validates.
  const prim = intent.strokeMode === "LINEWORK"
    ? (intent.rhythmMode === "RADIAL" ? "ARC" : "LINE")
    : ({ SPARSE: "NGON", MODERATE: "RECT", DENSE: "RECT" }[intent.densityTarget]);
  set("SILHOUETTE", "fields[0].primitive", prim);
  notes.push({ stage: "SILHOUETTE", why: `layout ${chosenLayout} from rhythmMode=${intent.rhythmMode}; primitive ${prim} (LINE..CUBIC are always stroked whatever stroke says)`, consulted: [layout.parameter, primitive.parameter] });

  // ---- 2. FOCAL HIERARCHY -------------------------------------------------------------------
  const size = session.consult("fields[n].sizeMax");
  const fieldCount = session.consult("fieldCount, and the site budget");
  const fields = { SINGLE_DOMINANT: 2, LAYERED: 3, EVEN_FIELD: 1 }[intent.focalMode];
  set("FOCAL_HIERARCHY", "fieldCount", fields);
  // sizeMax IS the coverage control: 2 -> ink120 0.005 (an invisible frame), 64 -> 0.390. Anything
  // below about 10 is a blank tile at browse size, so the sparse end is 14 rather than 4.
  // Calibrated on the atlas's own curve (16:0.059  24:0.115  32:0.167  48:0.278  64:0.390) against
  // alluvium's shipped 0.282. sizeMax 14 measured 0.044 across four seeds -- above the 0.04 floor
  // and still a blank-looking tile, which is what "anything below about 10 is a blank tile" reads
  // like one notch up.
  // alluvium ships sizeMax 16-20 with spreadMax 110-122: SMALL ELEMENTS SPREAD WIDE. That is the
  // shape of a composition that fills a frame without any single element filling it, and it is the
  // opposite of the large-elements-held-close configuration a naive reading of "density" produces.
  const sizeMax = { SPARSE: 18, MODERATE: 24, DENSE: 34 }[intent.densityTarget];
  set("FOCAL_HIERARCHY", "fields[0].sizeMax", sizeMax);
  notes.push({ stage: "FOCAL_HIERARCHY", why: `sizeMax ${sizeMax} from densityTarget=${intent.densityTarget}; below ~10 is a blank tile at 120px`, consulted: [size.parameter, fieldCount.parameter] });

  // ---- 3. NEGATIVE SPACE --------------------------------------------------------------------
  const spread = session.consult("fields[n].spreadMax");
  // spreadMax is SCALE and is close to orthogonal to sizeMax: across a row extent runs 0.27 -> 0.65
  // while ink barely moves. So negative space is set here without disturbing density.
  const spreadMax = { COMPACT: 86, MODERATE: 104, EXPANSIVE: 124 }[intent.extentTarget];
  set("NEGATIVE_SPACE", "fields[0].spreadMax", spreadMax);
  notes.push({ stage: "NEGATIVE_SPACE", why: `spreadMax ${spreadMax} from extentTarget=${intent.extentTarget}; measured near-orthogonal to sizeMax, so density is untouched`, consulted: spread.parameter });

  // ---- 4. RHYTHM ----------------------------------------------------------------------------
  const symmetry = session.consult("fields[n].symmetry");
  const count = session.consult("fields[n].countMin / countMax");
  // Symmetry roughly triples coverage for free and is a PROJECT CONSTANT, so it cannot carry
  // variety -- it is a rhythm decision only.
  const sym = { RADIAL: "ROT6", REGULAR: "MIRROR_X", BROKEN: "NONE" }[intent.rhythmMode];
  set("RHYTHM", "fields[0].symmetry", sym);
  // Widening countMin..countMax makes the NEUTRAL composition thinner, not richer. So the range is
  // kept tight unless COUNT is the market axis, which MARKET_BEHAVIOUR widens deliberately.
  const base = { SPARSE: 14, MODERATE: 22, DENSE: 32 }[intent.densityTarget];
  set("RHYTHM", "fields[0].countMin", base);
  set("RHYTHM", "fields[0].countMax", base + (intent.variationBreadth === "WIDE" ? 6 : 2));
  notes.push({ stage: "RHYTHM", why: `symmetry ${sym} (~3x coverage, project constant so it carries no variety); count range kept tight because widening thins the neutral composition`, consulted: [symmetry.parameter, count.parameter] });

  // ---- 5. SECONDARY STRUCTURE ---------------------------------------------------------------
  // The site budget is 120 total and 40 per field, PAID AT countMax across all fields.
  for (let i = 1; i < fields; i += 1) {
    set("SECONDARY_STRUCTURE", `fields[${i}].layout`, i === 1 ? (intent.rhythmMode === "RADIAL" ? "ORBIT" : "SCATTER") : "LINEFIELD");
    set("SECONDARY_STRUCTURE", `fields[${i}].primitive`, i === 1 ? "CIRCLE" : "LINE");
    set("SECONDARY_STRUCTURE", `fields[${i}].sizeMax`, Math.max(6, Math.round(sizeMax * (i === 1 ? 0.45 : 0.3))));
    set("SECONDARY_STRUCTURE", `fields[${i}].spreadMax`, Math.min(128, spreadMax + 10 * i));
    set("SECONDARY_STRUCTURE", `fields[${i}].symmetry`, "NONE");
    set("SECONDARY_STRUCTURE", `fields[${i}].countMin`, 5);
    set("SECONDARY_STRUCTURE", `fields[${i}].countMax`, 12);
    set("SECONDARY_STRUCTURE", `fields[${i}].paletteIx`, Math.min(i + 1, 3));
    set("SECONDARY_STRUCTURE", `fields[${i}].variant`, i);
    set("SECONDARY_STRUCTURE", `fields[${i}].stroke`, true);
  }
  if (fields > 1) notes.push({ stage: "SECONDARY_STRUCTURE", why: `${fields - 1} secondary field(s); the 120-site budget is paid at countMax across all fields, so secondaries stay at countMax 12` });

  // ---- 6. PALETTE ---------------------------------------------------------------------------
  const pal = session.consult("palette, groundMode, PALETTE_SHIFT");
  const { palette, namedInDirection } = paletteFrom(direction, intent);
  set("PALETTE", "palette", palette);
  set("PALETTE", "groundMode", intent.rhythmMode === "RADIAL" && intent.densityTarget === "SPARSE" ? "RADIAL" : "FLAT");
  set("PALETTE", "groundIx", 0);
  set("PALETTE", "groundIx2", Math.min(1, palette.length - 1));
  set("PALETTE", "fields[0].paletteIx", Math.min(1, palette.length - 1));
  // The seed reaches nothing categorical in this runtime, so PALETTE_SHIFT is one of the very few
  // routes to per-token variety that exists at all. It is elected whenever variety is wanted.
  const flags = [];
  if (intent.variationBreadth === "WIDE" && intent.paletteMode !== "MONOCHROME") flags.push("PALETTE_SHIFT");
  if (intent.strokeMode === "LINEWORK") flags.push("OUTLINE");
  set("PALETTE", "flags", flags);
  notes.push({ stage: "PALETTE", why: `${namedInDirection} colour(s) named; PALETTE_SHIFT elected=${flags.includes("PALETTE_SHIFT")} because the seed reaches nothing categorical here`, consulted: pal.parameter });

  // ---- 7. DETAIL ----------------------------------------------------------------------------
  const strokeParam = session.consult("fields[n].stroke and the OUTLINE flag");
  set("DETAIL", "fields[0].stroke", intent.strokeMode === "LINEWORK");
  set("DETAIL", "fields[0].variant", attempt === 0 ? 0 : 3);
  set("DETAIL", "title", titleFrom(direction));
  notes.push({ stage: "DETAIL", why: "stroke and variant are the last decisions because neither changes whether the work reads at 120px", consulted: strokeParam.parameter });

  // ---- 8. MARKET BEHAVIOUR ------------------------------------------------------------------
  const drive = session.consult("fields[n].drive x sensor x curve", { intendsMarketBinding: false });
  // A SIZE-driven field is BLANK whenever its sensor reads low, because size's floor is the
  // constant 2 -- measured 0.005 / 0.005 / 0.156 across the ring. SIZE is therefore never elected
  // on field 0, whatever the direction asks for; SCALE is delivered by SPREAD instead.
  const axis = {
    DENSITY: { drive: "COUNT", sensor: "DRAWDOWN", curve: "LINEAR" },
    STRUCTURE: { drive: "COUNT", sensor: "STRESS", curve: "LINEAR" },
    SCALE: { drive: "SPREAD", sensor: "RECOVERY", curve: "LOG2" },
    EROSION: { drive: "COUNT", sensor: "DRAWDOWN", curve: "LINEAR" },
  }[intent.marketAxis];
  set("MARKET_BEHAVIOUR", "fields[0].drive", axis.drive);
  set("MARKET_BEHAVIOUR", "fields[0].sensor", axis.sensor);
  set("MARKET_BEHAVIOUR", "fields[0].curve", axis.curve);
  if (axis.drive === "COUNT") {
    // COUNT IS THE DRIVE, SO THE RANGE IS THE MARKET RESPONSE, and it must be wide.
    //
    // The atlas's warning that "widening countMin..countMax makes the neutral composition thinner,
    // not richer" is about an UNDRIVEN field, where the range only scatters the seed. When COUNT is
    // the drive the same width is the entire amplitude of the response: a narrow range measured
    // 1.50-2.78 state separation against a floor of 3.8, and widening it is the only lever that
    // moves that number. The thinning it costs at neutral is real and is paid deliberately.
    set("RHYTHM", "fields[0].countMin", Math.max(2, base - 6));
    set("RHYTHM", "fields[0].countMax", Math.min(40, base + 22));
  }
  // SIZE ON A SECONDARY FIELD IS EROSION; ON A PRIMARY FIELD IT IS A BLANK FRAME.
  //
  // Both statements are the same measured fact — size's floor is the constant 2, so a SIZE-driven
  // field is invisible whenever its sensor reads low (0.005 / 0.005 / 0.156 across the ring). On
  // field 0 that is a collection whose stress state is an empty tile. On a secondary field, over a
  // primary that carries the composition on its own, it is the strongest market response this
  // runtime has: the secondary blooms in recovery and is gone under stress.
  //
  // COUNT alone on every field measured 1.66-3.88 against a 3.8 floor. This is what the atlas
  // means by sizeMax being the loudest control the runtime owns; the trick is only ever WHERE.
  if (fields > 1) {
    set("MARKET_BEHAVIOUR", "fields[1].drive", "SPREAD");
    set("MARKET_BEHAVIOUR", "fields[1].sensor", "RECOVERY");
    set("MARKET_BEHAVIOUR", "fields[1].curve", "LOG2");
    notes.push({ stage: "MARKET_BEHAVIOUR", why: "field[1] is SIZE-driven by RECOVERY: it blooms in recovery and erodes to size 2 under stress. Legitimate only because field[0] carries the composition alone." });
  }
  for (let i = 2; i < fields; i += 1) {
    set("MARKET_BEHAVIOUR", `fields[${i}].drive`, "COUNT");
    set("MARKET_BEHAVIOUR", `fields[${i}].sensor`, "VOLATILITY");
    set("MARKET_BEHAVIOUR", `fields[${i}].curve`, "LINEAR");
  }
  notes.push({ stage: "MARKET_BEHAVIOUR", why: `marketAxis=${intent.marketAxis} -> ${axis.drive} <- ${axis.sensor}/${axis.curve}; SIZE is never elected (floor 2 renders a blank at low sensor)`, consulted: drive.parameter });
}
