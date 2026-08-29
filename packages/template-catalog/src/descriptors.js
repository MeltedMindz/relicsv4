// SPDX-License-Identifier: MIT
// ================================================================================================
// THE PUBLIC CREATOR DESCRIPTORS — machine-readable, for a human choosing and for an agent matching.
// ================================================================================================
//
// WHAT IS DECLARED HERE AND WHAT IS DERIVED
// -----------------------------------------
// DECLARED (frozen facts, read out of the runtime and template source, transcribed once and checked
// by `npm run kit:templatestatus`):
//
//     runtime id · runtime version · config schema version · the exact config bytes the frozen
//     encoder produces and their keccak256 · every sensor the template binds, with its curve and
//     the visual field it drives · the contact sheets · brief and use-case tags
//
// EVERY DIGEST HERE IS BARE HEX, WITH NO `0x`. That is not a style choice: `0x` followed by 64 hex
// characters is the literal shape of a raw private key, and the repository's secret scanner refuses
// it on sight. A config hash written the other way is a gate failure on every push, forever.
//
// DERIVED (never written here — computed, so it cannot go stale independently):
//
//     review status          <- `status.js`, out of the review ledger
//     effective signals      <- `signals.js`, out of the committed measurement census
//     market-responsive      <- `signals.js`, per state pair, twice, by two different methods
//
// ------------------------------------------------------------------------------------------------
// TWO THINGS THIS FILE MAY NEVER CARRY, AND WHY
// ------------------------------------------------------------------------------------------------
// 1. **NO LAUNCHABILITY.** None of these four runtimes is registered on any chain today, and
//    whether one is registered TOMORROW is a per-chain fact that changes without this file
//    changing. `assertNoLaunchabilityClaim` refuses any key that would answer it. The live answer
//    comes from `getChainCapability` reading `ArtRuntimeRegistryV1`, on the day you ask.
//
// 2. **NO QUALITY SCORE.** No number, no rank, no stars, no grade — here or on chain.
//    `assertNoQualityScore` refuses them by key name. The review that produced these verdicts kept
//    two axes apart deliberately and refused to average them; a score would silently re-merge them,
//    and a score published beside a template would then have to be defended as a fact about art.
//    Creator guidance belongs in prose a creator can disagree with. What IS published as a number
//    is the MEASUREMENT — per-mille sensor movement, CIE76 delta-E — which is a fact about pixels.
//
// ------------------------------------------------------------------------------------------------
// THE TEMPLATE IS A STARTING POINT, NOT A CAGE
// ------------------------------------------------------------------------------------------------
// Every `config` block below is a PRESET. A creator, or an agent acting for one, may change any
// value the runtime's own validator accepts — palettes, counts, depths, symmetries, shapes,
// sensors, curves, traits, the title. The catalog constrains WHICH template you start from; it
// places no bound whatever on how far the configuration then legally moves, and nothing in this
// package compares a creator's final config against the preset it began as. `mutation` says so on
// every descriptor so an agent reading only the data reaches the same conclusion.
// ================================================================================================

import {
  PROMOTION_REQUIREMENTS,
  assertNoLaunchabilityClaim,
  latestVerdict,
  templateStatus,
} from "./status.js";
import {
  TRAIT_ONLY_SENSORS,
  VISUAL_SENSORS,
  classifyBindings,
  marketResponse,
  perceptualResponse,
} from "./signals.js";

/** The descriptor format's own version. Bump when a FIELD changes, not when a value does. */
export const DESCRIPTOR_SCHEMA_VERSION = "1.0.0";

/**
 * The four runtimes this wave's templates belong to.
 *
 * `configSchemaVersion` is the version byte the runtime's own config parser REQUIRES, read from the
 * frozen Solidity. It is NOT the runtime version and the two disagree: GEOMETRIC_RECURSION and
 * CELLULAR are both at config version 2 while every runtime is at runtime version 1, because both
 * had a byte change meaning under them (a recursion rule went 14 -> 15 bytes and three of its
 * fields became sets; cellular's byte 14 stopped being `paletteCount` and became `rampCeiling`).
 * Assuming 1 because the runtime says 1 produces a config the parser rejects with ERR_VERSION.
 */
export const RUNTIMES = Object.freeze({
  GEOMETRIC_RECURSION_V1: Object.freeze({
    id: "GEOMETRIC_RECURSION_V1",
    runtimeVersion: 1,
    artRuntimeMode: 1,
    artRuntimeModeName: "SOLIDITY_SVG_V1",
    runtimeTagPreimage: "V4ART.RUNTIME.GEOMETRIC_RECURSION_V1",
    configMagic: "GRV1",
    configSchemaVersion: 2,
    summary: "Recursive geometry: a small set of rules applied to themselves, level on level.",
  }),
  VECTOR_COMPOSITION_V1: Object.freeze({
    id: "VECTOR_COMPOSITION_V1",
    runtimeVersion: 1,
    artRuntimeMode: 1,
    artRuntimeModeName: "SOLIDITY_SVG_V1",
    runtimeTagPreimage: "V4ART.RUNTIME.VECTOR_COMPOSITION_V1",
    configMagic: "VCV1",
    configSchemaVersion: 1,
    summary: "Layered vector fields: layouts of primitives composed into one plate.",
  }),
  PIXEL_GRID_V1: Object.freeze({
    id: "PIXEL_GRID_V1",
    runtimeVersion: 1,
    artRuntimeMode: 1,
    artRuntimeModeName: "SOLIDITY_SVG_V1",
    runtimeTagPreimage: "V4ART.RUNTIME.PIXEL_GRID_V1",
    configMagic: "PGV1",
    configSchemaVersion: 1,
    summary: "A symmetric pixel grid built from stacked layers, painted at low resolution.",
  }),
  CELLULAR_SYSTEM_V1: Object.freeze({
    id: "CELLULAR_SYSTEM_V1",
    runtimeVersion: 1,
    artRuntimeMode: 1,
    artRuntimeModeName: "SOLIDITY_SVG_V1",
    runtimeTagPreimage: "V4ART.RUNTIME.CELLULAR_SYSTEM_V1",
    configMagic: "CSV1",
    configSchemaVersion: 2,
    summary: "A cellular automaton grown from a seed figure for a bounded number of generations.",
  }),
});

/** Every visual sensor a config may bind, plus the one that is trait-only. Same for all four. */
const SUPPORTED_SIGNALS = Object.freeze({
  visual: VISUAL_SENSORS,
  traitOnly: TRAIT_ONLY_SENSORS,
  note: "Every runtime in this wave accepts all nine visual sensors. Acceptance is not effectiveness — see `signals.effective`.",
});

/** The same sentence on every descriptor, so an agent reading only data reaches the same rule. */
const MUTATION = Object.freeze({
  presetIsAStartingPoint: true,
  mayChange: Object.freeze(["palette", "layout", "counts", "depths", "symmetry", "shapes", "sensors", "curves", "traits", "title", "seedBehaviour"]),
  bound: "the runtime's own config validator, and nothing else",
  note: "The catalog constrains WHICH template you start from. It places no bound on how far the configuration then legally moves, and nothing here compares a finished config against the preset it began as.",
});

/**
 * The seven Wave-1 SHIP templates.
 *
 * Note the descriptors exist ONLY for SHIP. That is not an omission: a descriptor is the artifact
 * an agent matches against, and publishing one for a template an agent may never select would be
 * publishing a temptation. The non-SHIP tiers are fully enumerated in the review ledger, with their
 * verdicts, which is what makes the classification checkable without making it selectable.
 */
export const TEMPLATE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    id: "GEOMETRIC_RECURSION_V1/dendron",
    name: "dendron",
    runtimeId: "GEOMETRIC_RECURSION_V1",
    title: "Dendron",
    summary: "A growth whose extent reads the healing: the canopy fills the frame as the market recovers and pulls back to a dense knot while the wound is open.",
    brief: Object.freeze({
      tags: Object.freeze(["growth", "organic", "branching", "tree", "botanical", "dendritic", "canopy", "recursive", "sparse-to-dense", "green", "bone", "rust"]),
      useCases: Object.freeze([
        "a collection about growth, healing or accumulation over time",
        "a brief asking for organic or botanical forms rather than hard geometry",
        "a project that wants recovery to be the visually loudest market state",
      ]),
      notFor: Object.freeze(["a brief asking for a rigid instrument, grid or diagram", "a brief that wants the stressed state to be the dramatic one"]),
    }),
    config: Object.freeze({ bytes: 92, keccak256: "9163732a2d8560fa97741c5db2ef185c6fcf440e7e1600c398d399671933198f" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "SPREAD — the root figure's half-extent, scaling every level at once" }),
      Object.freeze({ sensor: "STRESS", curve: "LINEAR", drives: "DEPTH — an added generation of triangular understorey, kept after the wound closes" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Canopy", source: "RECOVERY", style: "WORD" }),
      Object.freeze({ name: "Understorey", source: "STRESS", style: "WORD" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "GEOMETRIC_RECURSION_V1--dendron--SEEDS-thumb120.png", bytes: 160531, sha256: "ef3d4d3f603fb30945eb7b62afc14f0cfbd674b30112638e41ec93161774d5b2" }),
      states: Object.freeze({ name: "GEOMETRIC_RECURSION_V1--dendron--STATES.png", bytes: 331785, sha256: "96fa87ef46d29db16a737a4f3e87df3fd17121f68f285565811d1578f38532e0" }),
    }),
    renderCommitment: Object.freeze({ algorithm: "sha256-of-name-and-content-pairs", renders: 36, digest: "3380f6465fec0bd6e2390e13133312f0a2b04598435f11f751d7c990fecc36ec" }),
    mutation: MUTATION,
  }),

  Object.freeze({
    id: "GEOMETRIC_RECURSION_V1/compass",
    name: "compass",
    runtimeId: "GEOMETRIC_RECURSION_V1",
    title: "Compass",
    summary: "Rings of rings, coloured by level: an instrument whose self-similarity ratio opens as the market heals and whose generations are cut by drawdown.",
    brief: Object.freeze({
      tags: Object.freeze(["rings", "concentric", "radial", "instrument", "navigational", "orrery", "nested", "precision", "cartographic", "circular"]),
      useCases: Object.freeze([
        "a collection with an instrument, dial or navigational register",
        "a brief asking for concentric or radial composition",
        "a project that wants drawdown to remove structure rather than add it",
      ]),
      notFor: Object.freeze(["a brief asking for organic or irregular silhouettes", "a brief that needs every token to have a different overall shape"]),
    }),
    config: Object.freeze({ bytes: 100, keccak256: "fb6876c47ce6dc3688d433c5ad1dbdb949404168656c3b4d691f287591a9dd14" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "CONTRACT — the self-similarity ratio of every level" }),
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "DEPTH — how many generations are drawn, 1..4" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Generations", source: "RECOVERY", style: "NUMBER" }),
      Object.freeze({ name: "Compression", source: "DRAWDOWN", style: "WORD" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "GEOMETRIC_RECURSION_V1--compass--SEEDS-thumb120.png", bytes: 209592, sha256: "d4e77ad1bd69fae7fe38d57adf03ca7f7ca16a559b7d5645f18f5b642be31375" }),
      states: Object.freeze({ name: "GEOMETRIC_RECURSION_V1--compass--STATES.png", bytes: 584904, sha256: "9fb7a310179b6114dff33e5aaa04f11b1565cce413576a9e0d1908b88688004e" }),
    }),
    renderCommitment: Object.freeze({ algorithm: "sha256-of-name-and-content-pairs", renders: 36, digest: "2ed027b93d25418b52b232123628a5aa31a89b22f78cc29824984707bc453e55" }),
    mutation: MUTATION,
  }),

  Object.freeze({
    id: "GEOMETRIC_RECURSION_V1/cairn",
    name: "cairn",
    runtimeId: "GEOMETRIC_RECURSION_V1",
    title: "Cairn",
    summary: "A partitioned plane: drawdown adds courses of subdivision and recovery settles how tightly each course sits inside the last.",
    brief: Object.freeze({
      tags: Object.freeze(["partition", "subdivision", "stacked", "stone", "mineral", "architectural", "lattice", "monolithic", "geometric", "constructed"]),
      useCases: Object.freeze([
        "a collection with a built, stacked or architectural register",
        "a brief asking for a wide range from minimal emblem to dense all-over lattice",
        "a project that wants stress to strip the work to a single clean figure",
      ]),
      notFor: Object.freeze(["a brief asking for figurative or creature-like subjects", "a brief that wants soft or organic edges"]),
    }),
    config: Object.freeze({ bytes: 97, keccak256: "5ad921c96339051ac380a44352161fb85e11a706a3b8de1ee2e1728a1037df92" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "DEPTH — courses of subdivision, 1..4" }),
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "CONTRACT — how tightly each course sits inside its parent" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Courses", source: "DRAWDOWN", style: "NUMBER" }),
      Object.freeze({ name: "Settling", source: "RECOVERY", style: "WORD" }),
      Object.freeze({ name: "Quarry", source: "DNA", style: "HEX" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "GEOMETRIC_RECURSION_V1--cairn--SEEDS-thumb120.png", bytes: 158705, sha256: "6693c02dec428d91a793253877f0c2651abb011385e4311b62539125a9ebad55" }),
      states: Object.freeze({ name: "GEOMETRIC_RECURSION_V1--cairn--STATES.png", bytes: 594144, sha256: "481e0802a0459e9d41db59b07d6dd2aa4a92932f829a0f2956d095fe2421842f" }),
    }),
    renderCommitment: Object.freeze({ algorithm: "sha256-of-name-and-content-pairs", renders: 36, digest: "d3f0e187f9a3d9a92a18df0c9dc66cfac88a22865c453f451233a93bce28ce89" }),
    mutation: MUTATION,
  }),

  Object.freeze({
    id: "VECTOR_COMPOSITION_V1/reliquary",
    name: "reliquary",
    runtimeId: "VECTOR_COMPOSITION_V1",
    title: "Reliquary",
    summary: "A burial object on a ground that fractures: five composed fields, where drawdown breaks the plane and recovery repopulates it with orbits and marks.",
    brief: Object.freeze({
      tags: Object.freeze(["reliquary", "artifact", "burial", "sacred", "vessel", "ritual", "archaeological", "ornament", "fracture", "gold", "teal", "terracotta"]),
      useCases: Object.freeze([
        "a collection in a sacred, archaeological or votive register",
        "a brief asking for a central object held in a composed frame",
        "a project that wants stress to strip each work to its bare armature",
      ]),
      notFor: Object.freeze(["a brief asking for a flat pattern or wallpaper", "a brief that wants a purely mechanical or industrial register"]),
    }),
    config: Object.freeze({ bytes: 128, keccak256: "0c759fcd9bc647ace31b9f06fb0b91fcf153a4d0ef0edb4e88ba38876a5d3027" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "DEPTH — subdivision level of the ground plane" }),
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "DEPTH — the orbit ring count" }),
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "COUNT — scattered marks, 14..32" }),
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "COUNT — burst rays, 7..22" }),
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "SYMMETRY — replication order, none / quad / six-fold" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Fracture", source: "DRAWDOWN", style: "WORD" }),
      Object.freeze({ name: "Orbits", source: "RECOVERY", style: "NUMBER" }),
      Object.freeze({ name: "Vein", source: "DNA", style: "HEX" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "VECTOR_COMPOSITION_V1--reliquary--SEEDS-thumb120.png", bytes: 115315, sha256: "8e2483fde1d3f440084596158c2508cfdbe0750994a34b4a6c0b3ed90ed2cc69" }),
      states: Object.freeze({ name: "VECTOR_COMPOSITION_V1--reliquary--STATES.png", bytes: 250448, sha256: "b492108ab71445f63b416057471c2c09883a7be1778d34010d769fa72523994c" }),
    }),
    renderCommitment: Object.freeze({ algorithm: "sha256-of-name-and-content-pairs", renders: 36, digest: "ab01c66533e06c46dbe9126625f1c6c48e69b89685105eb7b6db168f3ae073a6" }),
    mutation: MUTATION,
  }),

  Object.freeze({
    id: "VECTOR_COMPOSITION_V1/alluvium",
    name: "alluvium",
    runtimeId: "VECTOR_COMPOSITION_V1",
    title: "Alluvium",
    summary: "Sediment: the market writes the strata. Drawdown sets how many beds are laid down, recovery rules them through, and stress studs them with nodules.",
    brief: Object.freeze({
      tags: Object.freeze(["sediment", "strata", "geological", "layered", "horizontal", "deposition", "banding", "earth", "core-sample", "ochre"]),
      useCases: Object.freeze([
        "a collection about accumulation, record or deposition",
        "a brief asking for horizontal composition and a wide silhouette range",
        "a project that wants the market's whole history legible as layers",
      ]),
      notFor: Object.freeze(["a brief asking for a centred emblem or badge", "a brief that needs radial symmetry"]),
    }),
    config: Object.freeze({ bytes: 92, keccak256: "3ef8c0e97af9d9db4ec2c4441a4e2cfef572dfad9230910fc900124155c0c322" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "COUNT — stacked beds, 8..34" }),
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "COUNT — ruled lines through the field, 9..28" }),
      Object.freeze({ sensor: "STRESS", curve: "LINEAR", drives: "DEPTH — the nodule ring count" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Beds", source: "DRAWDOWN", style: "NUMBER" }),
      Object.freeze({ name: "Nodule", source: "STRESS", style: "WORD" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "VECTOR_COMPOSITION_V1--alluvium--SEEDS-thumb120.png", bytes: 118451, sha256: "3370542986ac6e979af7dc5aa4dce70013be6c245e5ced03e94516e629d3407d" }),
      states: Object.freeze({ name: "VECTOR_COMPOSITION_V1--alluvium--STATES.png", bytes: 228448, sha256: "507d5367520c0c93604eccbb49ea8bcc7c5b2e056593f76cb1d71391df7f33b8" }),
    }),
    renderCommitment: Object.freeze({ algorithm: "sha256-of-name-and-content-pairs", renders: 36, digest: "d754d0fb19de6731660b5db2f23d919f21354d36c300849664679015262c32cf" }),
    mutation: MUTATION,
  }),

  Object.freeze({
    id: "PIXEL_GRID_V1/idol",
    name: "idol",
    runtimeId: "PIXEL_GRID_V1",
    title: "Idol",
    summary: "A mirrored bronze artifact that swells and corrodes: a 16x16 figure whose body, radiance and frame each answer a different market condition, and whose erosion layer eats it under drawdown.",
    brief: Object.freeze({
      tags: Object.freeze(["pixel", "figure", "idol", "totem", "creature", "bronze", "corrosion", "mirrored", "low-resolution", "symmetric", "artifact"]),
      useCases: Object.freeze([
        "a collection of distinct figures rather than variations on one composition",
        "a brief asking for a pixel or low-resolution register",
        "a project that wants the market state to be readable without being explained",
      ]),
      notFor: Object.freeze(["a brief asking for smooth vector geometry", "a brief that needs a large, detailed, high-resolution plate"]),
    }),
    config: Object.freeze({ bytes: 142, keccak256: "8f69813d9aeccee91b206adae31d6f7e143949a6c792f502257bf50170451e87" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "FIELD density — the ground the figure stands on" }),
      Object.freeze({ sensor: "EPOCH", curve: "LINEAR", drives: "SLAB density — the body mass" }),
      Object.freeze({ sensor: "DRAWDOWN", curve: "LINEAR", drives: "MOTIF density — the DNA-chosen interior marking" }),
      Object.freeze({ sensor: "RECOVERY", curve: "LINEAR", drives: "RAY density — the radiance" }),
      Object.freeze({ sensor: "STRESS", curve: "LINEAR", drives: "FRAME density — the enclosing border" }),
      Object.freeze({ sensor: "DRAWDOWN", curve: "EASE", drives: "EROSION — dilation that eats the figure, empty at rest" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Corrosion", source: "DRAWDOWN", style: "WORD" }),
      Object.freeze({ name: "Radiance", source: "RECOVERY", style: "WORD" }),
      Object.freeze({ name: "Family", source: "DNA", style: "HEX" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "PIXEL_GRID_V1--idol--SEEDS-thumb120.png", bytes: 3076, sha256: "a2080f1051be2d4ac8e0b8f2bbcb98c2b91c5665d19e23a4048ee7909aef0f03" }),
      states: Object.freeze({ name: "PIXEL_GRID_V1--idol--STATES.png", bytes: 4599, sha256: "bb05dda7c818184bb823aca24f21988ddd5d360f970ae1afccee008c486fa85a" }),
    }),
    renderCommitment: Object.freeze({ algorithm: "sha256-of-name-and-content-pairs", renders: 36, digest: "ebbd63f4758be89afe24fa652a83dc15301701f9d220858b35b79a23d15b7fcf" }),
    mutation: MUTATION,
  }),

  Object.freeze({
    id: "CELLULAR_SYSTEM_V1/crux",
    name: "crux",
    runtimeId: "CELLULAR_SYSTEM_V1",
    title: "Crux",
    summary: "A cross that fills: a cruciform seed grown under a birth rule the market shifts, so the figure sits open in a void under stress and closes into a solid emblem as the market heals.",
    brief: Object.freeze({
      tags: Object.freeze(["cross", "cruciform", "emblem", "cellular", "automaton", "growth", "symmetric", "sacral", "figure-in-void", "high-contrast"]),
      useCases: Object.freeze([
        "a collection built on one strong central emblem",
        "a brief asking for the most dramatic and most legible state change in the wave",
        "a project that wants the work to read at any size, including a marketplace grid",
      ]),
      notFor: Object.freeze([
        "a brief that needs twelve unrelated silhouettes — every token here shares the cruciform grammar",
        "a brief where the neutral-to-recovery difference must carry the collection: measured, it is this template's weakest pairing",
      ]),
    }),
    config: Object.freeze({ bytes: 73, keccak256: "e7c3ecaaa8f33c832abd136c646fe751e83fda90318671e975332be68dade01b" }),
    bindings: Object.freeze([
      Object.freeze({ sensor: "RECOVERY", curve: "LOG2", drives: "BIRTH_SHIFT — the automaton's birth threshold, and through it how far the cross fills" }),
    ]),
    traits: Object.freeze([
      Object.freeze({ name: "Arms", source: "DNA", style: "HEX" }),
      Object.freeze({ name: "Fill", source: "RECOVERY", style: "NUMBER" }),
    ]),
    sheets: Object.freeze({
      seedGrid120: Object.freeze({ name: "CELLULAR_SYSTEM_V1--crux--SEEDS-thumb120.png", bytes: 1557, sha256: "a40631b4021d98bca02d37bd494017c88be0a57068032e8e8da08f25a942a9f0" }),
      states: Object.freeze({ name: "CELLULAR_SYSTEM_V1--crux--STATES.png", bytes: 3334, sha256: "c3caed63a21242b8ad6770e07eba9ef12b74f0f93acddb70adbeb3e4c2ebb4e8" }),
    }),
    renderCommitment: Object.freeze({ algorithm: "sha256-of-name-and-content-pairs", renders: 36, digest: "b01b021832f05c1b0fad04e6e805907563b65fb351324c83f9a6d2714d49b246" }),
    mutation: MUTATION,
  }),
]);

/** Descriptor by template id, or null. Never throws. */
export function descriptorFor(templateId) {
  return TEMPLATE_DESCRIPTORS.find((d) => d.id === templateId) ?? null;
}

/**
 * The full published record for one template: declared facts, plus everything derived.
 *
 * THIS is what a creator surface or an agent reads. It carries no chain fact and cannot be made to
 * carry one — `chain` is deliberately absent rather than null, so a consumer that needs it has to
 * go and read the registry instead of finding a field already there and trusting it.
 */
export function describeTemplate(templateId) {
  const d = descriptorFor(templateId);
  if (!d) return null;
  const runtime = RUNTIMES[d.runtimeId];
  const signals = classifyBindings(d.bindings);
  const response = marketResponse(d.bindings);
  const perceptual = perceptualResponse(d.id);
  const verdict = latestVerdict(d.id);
  return Object.freeze({
    descriptorSchemaVersion: DESCRIPTOR_SCHEMA_VERSION,
    id: d.id,
    name: d.name,
    title: d.title,
    summary: d.summary,

    runtime: Object.freeze({
      id: runtime.id,
      runtimeVersion: runtime.runtimeVersion,
      artRuntimeMode: runtime.artRuntimeMode,
      artRuntimeModeName: runtime.artRuntimeModeName,
      runtimeTagPreimage: runtime.runtimeTagPreimage,
      configMagic: runtime.configMagic,
      configSchemaVersion: runtime.configSchemaVersion,
      summary: runtime.summary,
    }),

    brief: d.brief,
    config: d.config,
    traits: d.traits,
    sheets: d.sheets,
    renderCommitment: d.renderCommitment,
    mutation: d.mutation,

    signals: Object.freeze({
      supported: SUPPORTED_SIGNALS,
      bound: d.bindings,
      effective: signals.effective,
      ineffective: signals.ineffective,
    }),

    /** Measured twice, by two methods that can disagree. Both are published; neither is averaged. */
    marketResponsive: response.responsive && perceptual.responsive === true,
    marketResponse: Object.freeze({ configMovement: response, perceptual }),

    review: Object.freeze({
      status: templateStatus(d.id),
      verdict: verdict?.verdict ?? null,
      reviewId: verdict?.reviewId ?? null,
      documentSha256: verdict?.documentSha256 ?? null,
      blindCode: verdict?.blindCode ?? null,
      blindCodeSource: verdict?.blindCodeSource ?? null,
      method: "BLIND_VISUAL",
    }),
  });
}

/** Every SHIP descriptor, fully described. The catalog a default surface renders. */
export function describeAll() {
  return Object.freeze(TEMPLATE_DESCRIPTORS.map((d) => describeTemplate(d.id)));
}

/**
 * The reduced record for a template that did NOT ship — what an advanced flag reveals.
 *
 * IT CARRIES NO DESCRIPTOR AND NO CONFIG HASH, deliberately. A creator asking to see the tiers
 * below SHIP is asking what was judged and how, not being handed a starting point; publishing a
 * full descriptor for a HELD template would make it selectable in practice however the tiers were
 * labelled, because a descriptor is the thing tooling consumes.
 *
 * The weakness it reports is MEASURED, not transcribed. The review's prose is an internal record
 * and stays there; what a creator gets is the template's own weakest state pairing out of the
 * perceptual census, against the census's own floor — which is the same defect the review named, in
 * a form anyone can re-derive.
 */
export function describeUnshippedTemplate(templateId) {
  const status = templateStatus(templateId);
  if (status === "UNREVIEWED" || status === "SHIP") return null;
  const verdict = latestVerdict(templateId);
  const perceptual = perceptualResponse(templateId);
  let weakest = null;
  if (perceptual.measured) {
    const pairs = Object.entries(perceptual.pairs).sort((a, b) => a[1].deltaE - b[1].deltaE);
    const [pair, row] = pairs[0];
    const NAMES = { ns: "neutral -> stress", nr: "neutral -> recovery", sr: "stress -> recovery" };
    weakest = Object.freeze({
      pair,
      states: NAMES[pair],
      deltaE: row.deltaE,
      floorDeltaE: perceptual.floorDeltaE,
      clearsFloor: row.separated,
    });
  }
  return Object.freeze({
    descriptorSchemaVersion: DESCRIPTOR_SCHEMA_VERSION,
    id: templateId,
    runtimeId: templateId.split("/")[0],
    name: templateId.split("/")[1],
    offeredAsAStartingPoint: false,
    review: Object.freeze({
      status,
      verdict: verdict?.verdict ?? null,
      reviewId: verdict?.reviewId ?? null,
      documentSha256: verdict?.documentSha256 ?? null,
      blindCode: verdict?.blindCode ?? null,
      blindCodeSource: verdict?.blindCodeSource ?? null,
      method: "BLIND_VISUAL",
    }),
    weakestMeasuredStatePairing: weakest,
    promotion: Object.freeze({
      possible: status !== "REJECTED",
      requires: PROMOTION_REQUIREMENTS,
      note: "A template may never be promoted to SHIP by maintainer judgement. It takes a contained fix, a config still inside the runtime's final bounds, a regenerated sheet, and a NEW blind review returning SHIP.",
    }),
  });
}

const QUALITY_SCORE_KEYS = ["score", "rating", "rank", "ranking", "stars", "grade", "quality", "qualityScore", "artScore", "aestheticScore", "points"];

/**
 * A descriptor may not carry a subjective numeric quality score, under any name.
 *
 * Refused by KEY, at every depth, because the temptation is real and the shape is always the same:
 * a small number beside a template that a surface then sorts by. Measurements are exempt by name —
 * `perMille`, `deltaE`, `bytes`, `renders` are facts about pixels and bytes, not judgements about art.
 */
export function assertNoQualityScore(value, path = "descriptor") {
  const problems = [];
  const walk = (node, at) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${at}[${i}]`)); return; }
    for (const [k, v] of Object.entries(node)) {
      if (QUALITY_SCORE_KEYS.includes(k) && typeof v === "number") {
        problems.push(`${at}.${k} is a numeric quality score. No subjective score is published here or on chain — the review deliberately kept its axes apart and a number re-merges them.`);
      }
      walk(v, `${at}.${k}`);
    }
  };
  walk(value, path);
  return problems;
}

/** Validate one descriptor. Empty array means well-formed. */
export function validateDescriptor(d) {
  const problems = [];
  for (const k of ["id", "name", "runtimeId", "title", "summary", "brief", "config", "bindings", "sheets", "mutation"]) {
    if (d?.[k] === undefined || d?.[k] === null) problems.push(`${d?.id ?? "?"}: missing required field ${k}`);
  }
  if (!RUNTIMES[d?.runtimeId]) problems.push(`${d?.id}: runtimeId ${JSON.stringify(d?.runtimeId)} is not one of ${Object.keys(RUNTIMES).join(", ")}`);
  if (!/^[0-9a-f]{64}$/.test(d?.config?.keccak256 ?? "")) problems.push(`${d?.id}: config.keccak256 must be 64 lowercase hex characters, BARE — the keccak of the bytes the frozen encoder produces`);
  if (!Number.isInteger(d?.config?.bytes) || d.config.bytes < 1) problems.push(`${d?.id}: config.bytes must be a positive integer`);
  if (!Array.isArray(d?.bindings) || d.bindings.length === 0) problems.push(`${d?.id}: a descriptor with no bindings describes a template the market cannot move`);
  for (const b of d?.bindings ?? []) {
    if (!VISUAL_SENSORS.includes(b.sensor)) problems.push(`${d?.id}: ${b.sensor} is not one of the nine visual sensors`);
    if (typeof b.drives !== "string" || b.drives.trim().length < 8) problems.push(`${d?.id}: a binding on ${b.sensor} does not say what it DRIVES. Name the structural effect, not the colour.`);
  }
  if (!Array.isArray(d?.brief?.tags) || d.brief.tags.length < 5) problems.push(`${d?.id}: brief.tags needs at least five tags, or semantic matching has nothing to match on`);
  if (!Array.isArray(d?.brief?.useCases) || d.brief.useCases.length < 2) problems.push(`${d?.id}: brief.useCases needs at least two entries`);
  if (!Array.isArray(d?.brief?.notFor) || d.brief.notFor.length < 1) problems.push(`${d?.id}: brief.notFor is required — a template that says what it is not for is a template an agent can decline`);
  problems.push(...assertNoLaunchabilityClaim(d));
  problems.push(...assertNoQualityScore(d, d?.id ?? "descriptor"));
  return problems;
}
