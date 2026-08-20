// SPDX-License-Identifier: MIT
// WHAT TO DO ABOUT IT.
//
// The validator already says WHAT failed, WHERE, and WHY — it is a schema, and those three are its
// job. What it cannot say is WHICH FILE A CREATOR EDITS and WHICH COMMAND THEY RUN AGAIN, because
// the schema does not know it is being run from a project directory by a person with a terminal.
// That is this file's job, and it is the difference between a validator and a tool.
//
// THREE RULES, LEARNED FROM MESSAGES THAT DID NOT WORK.
//
//   1. NAME THE FILE THE CREATOR CAN ACTUALLY EDIT. Half the schema's issues point at
//      `relics.project.json`, because that is the document being validated — and that file is
//      GENERATED, overwritten on every export. A creator who opens it has been sent to a dead end.
//      Every remedy here names a file in the project directory instead.
//
//   2. NO INTERNAL JARGON WHERE A CREATOR-FACING FIX EXISTS. "the output commitment could not be
//      verified" is true and useless. "Run `relics validate` without --structural-only" is the same
//      fact, addressed to the person who has to act on it.
//
//   3. NEVER INVENT A DESTINATION. If a remedy would need a URL, a support address or an upload
//      endpoint that has not been confirmed, it says what the creator has instead of guessing.

import { LIMITS } from "./schema.js";

const bytes = (n) => Number(n).toLocaleString();

/**
 * @typedef {{ edit: string, run?: string }} Remedy
 * `edit` names the file and the change. `run` is the exact command to re-run afterwards.
 */

/** @type {Record<string, Remedy>} */
const BY_CODE = {
  // ---- the one every creator hits first ----------------------------------------------------
  EARNINGS_RECIPIENT_PLACEHOLDER: {
    edit: "relics.config.json -> earnings.creatorRecipient: replace the scaffold's placeholder with the address that should receive this project's creator earnings. It is the address the launch writes on chain, so a placeholder here means a launched project paying nobody — which is why this is refused rather than warned about.",
    run: "relics validate .",
  },
  EARNINGS_RECIPIENT: {
    edit: "relics.config.json -> earnings.creatorRecipient must be a 0x-prefixed 20-byte address, exactly 42 characters. An ENS name is not an address; resolve it first.",
    run: "relics validate .",
  },
  EARNINGS_RECIPIENT_ZERO: {
    edit: "relics.config.json -> earnings.creatorRecipient: the zero address burns every creator payment. Set the address that should actually be paid.",
    run: "relics validate .",
  },
  EARNINGS_COLLABORATOR_BPS: {
    edit: "relics.config.json -> earnings.collaborators[].bps: whole basis points only (1% = 100), and the collaborators must sum inside the allowed total.",
    run: "relics validate .",
  },
  EARNINGS_COLLABORATOR_DUP: {
    edit: "relics.config.json -> earnings.collaborators: the same address appears twice. Merge the two entries into one with the combined bps.",
    run: "relics validate .",
  },
  EARNINGS_MODE_MISMATCH: {
    edit: 'relics.config.json -> earnings.mode: "SOLO" means no collaborators, "SPLIT" means at least one. Pick the one that matches your collaborators list.',
    run: "relics validate .",
  },

  // ---- metadata ------------------------------------------------------------------------------
  METADATA_DISAGREES: {
    edit: "metadata/collection.json and relics.config.json disagree. The name, symbol and description must be identical in both — an importer cannot choose between two answers, so it refuses instead of picking one. Copy the value you meant into whichever file is wrong.",
    run: "relics validate .",
  },
  METADATA_IMAGE_MISSING: {
    edit: "metadata/collection.json -> image points at a file that is not in the project. Add the file under assets/, or remove the image field.",
    run: "relics validate .",
  },
  METADATA_NO_IMAGE: {
    edit: 'metadata/collection.json -> image: add a cover under assets/ and reference it (for example "assets/cover.svg"). Without one, marketplaces show a blank tile for the whole collection. This is a warning, not a refusal — the bundle is valid without it.',
    run: "relics validate .",
  },
  METADATA_SHAPE: {
    edit: "metadata/collection.json must be a JSON object with version, name, symbol and description. `relics init` writes a correct one to copy the shape from.",
    run: "relics validate .",
  },
  METADATA_TOKEN_NAME: {
    edit: 'metadata/collection.json -> tokenNamePattern must contain {id} once, e.g. "Piece #{id}". That is where each token number is substituted.',
    run: "relics validate .",
  },
  METADATA_SYMBOL: {
    edit: "metadata/collection.json -> symbol must match relics.config.json -> project.symbol: 1-11 uppercase letters and digits.",
    run: "relics validate .",
  },

  // ---- the generator, when it is really run --------------------------------------------------
  RENDER_BLANK: {
    edit: "generator/generate.js drew nothing for at least one seed. Open that seed in the studio and find the branch that produces an empty frame — usually a market value at 0 or 1 that removes every element. Give the drawing a floor so an extreme reading degrades the piece instead of erasing it.",
    run: "relics dev .   (then: relics test-seeds . --count 100)",
  },
  RENDER_SPARSE: {
    edit: "generator/generate.js produced a nearly empty frame for at least one seed. Not a refusal — but check that seed in the studio before launching 10,000 of them.",
    run: "relics dev .",
  },
  RENDER_TOO_LARGE: {
    edit: `generator/generate.js returned more than ${bytes(LIMITS.maxRenderBytes ?? 0)} bytes of SVG for one seed. Reduce the element count (usually a loop bound driven by a market value) or shorten coordinates by rounding them.`,
    run: "relics test-seeds . --count 100",
  },
  RENDER_NOT_SVG: {
    edit: "generator/generate.js must return an SVG string starting with <svg. Returning an object, a data URL or an HTML fragment is not an SVG document.",
    run: "relics preview .",
  },
  GEN_NONDETERMINISTIC: {
    edit: "generator/generate.js rendered the SAME seed two different ways, so the art is not a function of its inputs. The cause is always the same shape: something outside `context` got in. Remove every use of Date/Math.random/performance/globalThis and derive everything from `context.random`, which is seeded.",
    run: "relics test-seeds . --count 100",
  },
  GEN_RENDER_THREW: {
    edit: "generator/generate.js threw while rendering. The message names the seed; reproduce it in the studio, fix the throw, and re-run. A generator that throws on one seed in ten thousand throws for that token forever.",
    run: "relics dev .",
  },
  GEN_NO_RENDER_EXPORT: {
    edit: "generator/generate.js must `export function render(context)`. A default export, a named `draw`, or a top-level statement is not the contract.",
    run: "relics validate .",
  },
  GEN_SCRIPT_TOO_LARGE: {
    edit: `generator/generate.js is over the ${bytes(LIMITS.maxScriptBytes)}-byte budget. The whole source is stored on chain, so this is a real limit, not a lint: inline fewer literal tables, shorten repeated strings, and drop dead branches. Comments count.`,
    run: "relics validate .",
  },
  GEN_DEPENDENCY_REFUSED: {
    edit: "generator/generate.js imports a package. Inline what you need: a generator is one self-contained file, because nothing installs a dependency on the way to the chain.",
    run: "relics validate .",
  },
  GEN_FORBIDDEN_IDENTIFIER: {
    edit: "generator/generate.js reaches for something outside its inputs (network, filesystem, clock or host object). Art must be a pure function of its seed and the bounded market sensors — a chain has none of those to reach.",
    run: "relics validate .",
  },
  GEN_IDENTICAL_OUTPUT: {
    edit: "generator/generate.js drew the same picture for different seeds. Widen the seed's influence — usually a value read once outside the loop that should be read per element — or accept the repetition deliberately.",
    run: "relics test-seeds . --count 200",
  },
  TRAITS_DUPLICATE_RATE: {
    edit: "traits/schema.json produces too many identical trait sets across the collection. Add a dimension, or add values to the narrowest one: the combination space has to be larger than the artwork supply for tokens to differ.",
    run: "relics test-seeds . --count 200",
  },
  TRAITS_VALUE_DUP: {
    edit: "traits/schema.json lists the same value twice inside one dimension. Rename or remove the duplicate — two identical values are one value with a doubled weight.",
    run: "relics validate .",
  },
  TRAITS_DIMENSION_DUP: {
    edit: "traits/schema.json declares the same dimension name twice. Merge them.",
    run: "relics validate .",
  },
  TRAITS_WEIGHT: {
    edit: 'traits/schema.json: a "weighted" dimension needs a positive integer weight on every value; a "uniform" dimension must have none.',
    run: "relics validate .",
  },
  TRAITS_EMPTY: {
    edit: "traits/schema.json declares no dimensions, so every token carries identical metadata. Add at least one dimension unless that is genuinely intended.",
    run: "relics validate .",
  },

  TRAITS_SPACE_TOO_SMALL: {
    edit: "traits/schema.json can express fewer combinations than the collection has artworks, so trait LABELS will repeat. The art can still be unique — this only matters if you meant the labels to be unique. To fix it, add a dimension or add values to the narrowest one.",
    run: "relics test-seeds . --count 200",
  },
  GEN_SEED_IGNORED: {
    edit: "generator/generate.js is not using its seed to differentiate tokens. Every per-token decision must come from `context.random`; a value computed once outside the drawing loop is the same for the whole collection.",
    run: "relics test-seeds . --count 200",
  },
  SVG_SCRIPT: {
    edit: "The generator's SVG contains a <script> element. An SVG that executes is not artwork, and no marketplace or renderer will run it — remove the script and draw the effect instead.",
    run: "relics validate .",
  },
  GEN_EXTERNAL_URL: {
    edit: "generator/generate.js names a URL. There is no network on the way to the chain, so a fetched asset is an image that will never load. Inline it as a data URI or draw it.",
    run: "relics validate .",
  },
  SANDBOX_FAILED: {
    edit: "The generator could not be run safely at all — usually an unbounded loop or exhausted memory. Bound every loop by a value you control, then re-run until every seed renders inside the budget.",
    run: "relics dev .",
  },
  BUNDLE_CONTRACT_CODE: {
    edit: "The project carries contract source (.sol/.vy/.yul/.wasm). Delete it: a bundle configures art and can never carry contract code. If your tooling put it there, stop and report that.",
    run: "relics validate .",
  },
  BUNDLE_PATH_POLICY: {
    edit: "A file sits outside the bundle layout. Allowed: relics.project.json, checksums.json, generator/, traits/, market/, metadata/, assets/, previews/. Move or delete it in the project directory.",
    run: "relics validate .",
  },
  BUNDLE_MISSING_ENTRY: {
    edit: "A required file is missing from the project. `relics init` writes all of them; compare against a fresh scaffold to see which one is gone.",
    run: "relics validate .",
  },

  // ---- previews ------------------------------------------------------------------------------
  PREVIEW_STALE: {
    edit: "previews/ shows older art than generator/generate.js now draws. The EXPORT is correct either way — it writes previews from the live render — but the images in your project directory are behind, so anything you share from them is wrong.",
    run: "relics preview .",
  },
  PREVIEW_MISSING: {
    edit: "previews/ is missing a seed the bundle carries. The export writes it from the render, so the bundle is fine; run preview to have it on disk too.",
    run: "relics preview .",
  },

  // ---- runtime and chain ---------------------------------------------------------------------
  ART_RUNTIME: {
    edit: 'relics.config.json -> art.runtime must be "JAVASCRIPT" or "SOLIDITY_SVG". Nothing else is an art runtime.',
    run: "relics validate .",
  },
  ART_RUNTIME_UNAPPROVED: {
    edit: "relics.config.json -> art.runtime names a runtime the format does not approve, so no bundle carrying it can ever be launched. Re-scaffold on an approved runtime: `relics templates` lists which template uses which.",
    run: "relics templates",
  },
  ART_RUNTIME_PREVIEW_ONLY: {
    edit: "Nothing is wrong with this project. Its runtime is approved but the launchpad does not bind and render it yet, so it can be authored, previewed, validated and exported — not launched. Nothing about the bundle needs to change when that is enabled. `relics status` shows the current state.",
    run: "relics status",
  },
  CHAIN_UNSUPPORTED: {
    edit: "relics.config.json -> chains.requested names a chain this format does not know. The bundle only records a PREFERENCE — the chain is chosen in the studio at launch — so requesting a supported one costs nothing. `relics status` lists them with their deployment state.",
    run: "relics status",
  },
  CHAIN_DUPLICATE: {
    edit: "relics.config.json -> chains.requested lists the same chain twice. Remove the duplicate.",
    run: "relics validate .",
  },

  // ---- market --------------------------------------------------------------------------------
  MARKET_SENSOR: {
    edit: "market/mappings.json -> sensor is not one the format knows. The sensor vocabulary is CLOSED — a sensor is something the launchpad measures on chain, not a name a bundle can invent. `relics dev` lists every legal sensor beside its destination.",
    run: "relics dev .",
  },
  MARKET_DESTINATION: {
    edit: "market/mappings.json -> destination is not one the format knows. Destinations are the fixed set of visual channels a generator can read from `context.market`.",
    run: "relics dev .",
  },
  MARKET_TRANSFORM: {
    edit: "market/mappings.json -> transform is not one the format knows. Each transform takes its own named parameters; `relics dev` shows the parameters and bounds for the one you pick.",
    run: "relics dev .",
  },
  MARKET_PARAM_BOUNDS: {
    edit: "market/mappings.json -> transformParams is outside the published bounds for that transform. The bounds exist so a mapping cannot produce a value the art was never designed to receive.",
    run: "relics dev .",
  },
  MARKET_PARAM_MISSING: {
    edit: "market/mappings.json -> transformParams is missing a parameter the transform requires. Every transform's parameters are required, because a default would silently change how the art reads its market.",
    run: "relics dev .",
  },
  MARKET_PARAM_UNKNOWN: {
    edit: "market/mappings.json -> transformParams carries a parameter that transform does not take. It would be ignored at launch, so it is refused here instead.",
    run: "relics dev .",
  },
  MARKET_MAPPING_ID_DUP: {
    edit: "market/mappings.json -> two mappings share an id. Ids identify a mapping in the studio, so they must be unique.",
    run: "relics validate .",
  },
  MARKET_DESTINATION_CONTESTED: {
    edit: "market/mappings.json routes two sensors to the same destination. Legal, and rarely what you meant: the second reading overwrites the first, so one of the two sensors has no visible effect.",
    run: "relics dev .",
  },
  MARKET_ANTI_SNIPE_MODE: {
    edit: "relics.config.json -> market.antiSnipeMode must be UNSPECIFIED, NONE or PROTECTED_98_MINUTES. It is independent of launchMode: any launch mode can carry any of the three.",
  },
  MARKET_ANTI_SNIPE_UNSPECIFIED: {
    edit: "relics.config.json -> market.antiSnipeMode is still UNSPECIFIED, which is a draft value. Choose NONE (the pool opens at a flat 1% buy / 1% sell LP fee) or PROTECTED_98_MINUTES (the buy LP fee falls linearly from 99% to 1% over 5,880 seconds while the sell fee stays at 1%). The kit will not choose for you, because either one is a permanent economic decision about your own launch.",
  },
  MARKET_LAUNCH_MODE: {
    edit: 'relics.config.json -> market.launchMode must be one the format knows AND one that is still offered. Two are offered: INSTANT_V4, which has no sale phase at all, and BONDING_CURVE_SALE_TO_V4, which has one and carries the sale block. FIXED_PRICE_SALE_TO_V4 is a value the format still reads and no longer launches -- the deployed sale contract refuses it for every caller, so this kit refuses it here rather than letting you find out with a finished bundle. Anti-snipe is NOT decided here: since RC6 it is its own field, `market.antiSnipeMode`, and every launch mode can carry either value.',
    run: "relics dev .",
  },
  ART_PREVIEW_DRIFT: {
    edit: "generator/generate.js -> the CONFIG constant no longer matches generator/params.json. params.json IS the art; the sketch is only what you have been looking at. Copy the differing value across (usually into the sketch), so the preview describes what you would launch.",
    run: "relics preview . --seeds 1,2,3,5,8,13,21,34",
  },
  ART_PREVIEW_UNCHECKED: {
    edit: "generator/generate.js -> this project carries generator/params.json, which is the art, and a local sketch that draws it — but the sketch's mirrored values could not be read, so nothing can tell you whether the two still agree. Keep them in one `const CONFIG = { … }` object literal to restore the comparison.",
    run: "relics validate .",
  },
  MARKET_SALE_UNEXPECTED: {
    edit: "relics.config.json -> market.sale is set, but the chosen launchMode has no sale phase. Either pick a launch mode with a sale, or remove the sale block — a sale configuration that nothing reads is a plan that will not happen.",
    run: "relics validate .",
  },
  MARKET_SALE_SHAPE: {
    edit: "relics.config.json -> market.sale needs allocationBps, curvePresetId, durationDays and minRaiseEth. A sale phase with a missing field cannot be priced.",
    run: "relics validate .",
  },
  MARKET_QUOTE_MODE: {
    edit: 'relics.config.json -> market.quoteAsset.mode must be a known request mode. A bundle REQUESTS a quote asset; it can never approve one, so the importer resolves the request against the launchpad\'s own registry at import time.',
    run: "relics validate .",
  },
  MARKET_QUOTE_ADDRESS: {
    edit: "relics.config.json -> market.quoteAsset.address must be a 0x-prefixed 20-byte address. It is a REQUEST that the importer re-resolves against the current registry — a bundle can never widen the set of approved assets.",
    run: "relics validate .",
  },
  MARKET_QUOTE_ADDRESS_UNEXPECTED: {
    edit: "relics.config.json -> market.quoteAsset carries an address in a mode that does not take one. Either switch to the mode that names an asset, or remove the address.",
    run: "relics validate .",
  },
  MARKET_QUOTE_ADDRESS_ZERO: {
    edit: "relics.config.json -> market.quoteAsset.address is the zero address, which is not a token. Name the asset you meant, or use the default mode.",
    run: "relics validate .",
  },
  MARKET_QUOTE_KIND: {
    edit: "relics.config.json -> market.quoteAsset.expectedKind does not match the asset kind. The cross-check exists so a bundle that expected a wrapped-native quote is refused rather than launched against a stablecoin.",
    run: "relics validate .",
  },

  // ---- supply --------------------------------------------------------------------------------
  SUPPLY_BACKING_MODEL: {
    edit: 'relics.config.json -> supply.backingModel must be "FULL_PARITY" (one whole token backs one artwork) or "PARTIAL" (tokensPerArtwork whole tokens back one).',
    run: "relics validate .",
  },
  SUPPLY_UNDERBACKED: {
    edit: "relics.config.json -> supply: the artwork supply is larger than the token supply can back. Either raise totalSupplyWhole or lower artworkSupply — every artwork must be backed by whole tokens that exist.",
    run: "relics validate .",
  },
  SUPPLY_TOKENS_PER_ARTWORK: {
    edit: "relics.config.json -> supply.tokensPerArtwork must equal floor(totalSupplyWhole / artworkSupply). It is stated as well as derived so a typo in either number is caught here rather than at launch.",
    run: "relics validate .",
  },
  SUPPLY_TOTAL_RANGE: {
    edit: `relics.config.json -> supply.totalSupplyWhole must be between ${LIMITS.minTotalSupplyWhole} and ${LIMITS.maxTotalSupplyWhole}, as a whole-number STRING (JSON numbers cannot hold it exactly).`,
    run: "relics validate .",
  },

  // ---- integrity and container ---------------------------------------------------------------
  CHECKSUMS_MISMATCH: {
    edit: "The bundle's contents no longer match the digests it carries, which means the file was edited after export. Never hand-patch a .relics file; re-export from the project directory.",
    run: "relics export . --output <name>.relics",
  },
  BUNDLE_COMMITMENT_MISMATCH: {
    edit: "The bundle's commitment does not follow from its own bytes. Re-export rather than repairing the file — a commitment is never hand-written.",
    run: "relics export . --output <name>.relics",
  },
  SECRET_DETECTED: {
    edit: "A credential-shaped string is inside a file this bundle carries. Remove it AND rotate it: assume anything that reached a bundle is public. Then re-export.",
    run: "relics validate .",
  },
  MANIFEST_REFUSED_KEY: {
    edit: "The project configuration names a field the format refuses by name — protocol wiring a bundle can never set. Remove it. If your tooling produced it, stop and report that: a bundle configures art, never contracts.",
    run: "relics validate .",
  },
  JSON_MALFORMED: {
    edit: "A JSON file in the project is not valid JSON. The message names the file and the position; a trailing comma and an unquoted key are the two usual causes.",
    run: "relics validate .",
  },
  SCHEMA_INCOMPATIBLE: {
    edit: "This bundle was written by a different schema generation. `relics migrate <file>.relics` opens what is recoverable into a project directory you can finish and re-export.",
    run: "relics migrate <file>.relics",
  },
};

/** Fallbacks by CHECK id, for issues whose specific code has no entry of its own. */
const BY_CHECK = {
  CONTAINER_STRUCTURE: {
    edit: `The container could not be walked. A .relics file is a STORE-only ZIP under ${bytes(LIMITS.maxBundleBytes)} bytes with at most ${LIMITS.maxEntries} entries — if the project has grown past that, the usual cause is large files under assets/. Remove them and re-export; never build a bundle by hand.`,
    run: "relics export . --output <name>.relics",
  },
  LAYOUT_AND_PATHS: {
    edit: "An entry is outside the fixed bundle layout: relics.project.json, checksums.json, generator/, traits/, market/, metadata/, and optionally assets/ and previews/. Move or delete the file in the project directory and re-export.",
    run: "relics validate .",
  },
  NO_ARBITRARY_HOOK: {
    edit: "Something in the project looks like contract code or a protocol override. Remove it — a bundle configures art and can never carry contract source, name an address to call, or replace any part of the protocol.",
    run: "relics validate .",
  },
  HASH_INTEGRITY: {
    edit: "A declared hash does not match the file it describes. Re-export instead of editing the manifest.",
    run: "relics export . --output <name>.relics",
  },
  ART_BINDING: {
    edit: "The art binding does not follow from the bundle's own bytes — the file was edited after export, or the generator no longer draws what it committed to. Re-export; a binding is never hand-written. If this appeared under --structural-only, run validate without it so the generator is actually rendered.",
    run: "relics validate .",
  },
  MANIFEST_SCHEMA: {
    edit: "Fix the field in relics.config.json and re-export. The manifest is a closed schema: an unknown key is refused rather than ignored.",
    run: "relics validate .",
  },
  TRAIT_SCHEMA: { edit: "Fix traits/schema.json and re-run.", run: "relics validate ." },
  COLLECTION_METADATA: { edit: "Fix metadata/collection.json and re-run.", run: "relics validate ." },
  MARKET_MAPPING_BOUNDS: { edit: "Fix market/mappings.json and re-run. `relics dev` shows every legal sensor, transform and destination with its bounds.", run: "relics dev ." },
  EARNINGS_CONFIG: { edit: "Fix earnings in relics.config.json and re-run. Splits are whole basis points and must sum inside the allowed total.", run: "relics validate ." },
  SUPPLY_AND_BACKING: { edit: "Fix supply in relics.config.json and re-run. The artwork supply can never exceed what the token supply backs.", run: "relics validate ." },
  CHAIN_FEATURES: { edit: "Request a chain the format knows in relics.config.json -> chains.requested. The bundle records a preference; the chain is chosen at launch.", run: "relics status" },
  SECRET_SCAN: { edit: "Remove the credential from the file and rotate it, then re-run.", run: "relics validate ." },
  ALLOWED_RUNTIME: { edit: "Re-scaffold on a runtime the format approves. `relics templates` lists which template uses which.", run: "relics templates" },
  ALLOWED_DEPENDENCIES: { edit: "Inline what you need — a generator is one self-contained file.", run: "relics validate ." },
  NO_EXTERNAL_NETWORK: { edit: "Remove the network access. Art must be a pure function of its seed and the bounded market sensors.", run: "relics validate ." },
  SCRIPT_BYTE_LIMIT: { edit: `Shrink generator/generate.js to ${bytes(LIMITS.maxScriptBytes)} bytes or fewer.`, run: "relics validate ." },
  RUNTIME_ERRORS: { edit: "Fix the generator in the studio until it renders every seed, then re-run.", run: "relics dev ." },
  DETERMINISTIC_OUTPUT: { edit: "Remove whatever the art depends on that is not its seed or its market.", run: "relics test-seeds . --count 100" },
  BLANK_OUTPUTS: { edit: "Open the named seed in the studio. A blank or oversized output is almost never intended.", run: "relics dev ." },
  DUPLICATE_RATE: { edit: "Widen the seed's influence in the generator or add trait dimensions.", run: "relics test-seeds . --count 200" },
  PREVIEWS_FRESH: { edit: "Re-render the previews on disk. The exported bundle is written from the live render, so it is already correct.", run: "relics preview ." },
  PROTOCOL_TEMPLATE: {
    edit: "This project declares a reviewed protocol template. That is a launchpad operator's immutable product integration, not a creator setting — remove the protocolTemplate block from relics.config.json unless an operator gave you one.",
    run: "relics validate .",
  },
};

const GENERIC = {
  edit: "Fix it in the project directory and export again. The kit wrote the bundle, so the project directory is where a structural problem gets fixed — never edit a .relics file.",
  run: "relics validate .",
};

/**
 * The remedy for an issue, given its code and (optionally) the check that raised it.
 * @param {string} code
 * @param {string} [checkId]
 * @returns {Remedy}
 */
export function remedyFor(code, checkId) {
  return BY_CODE[code] ?? (checkId ? BY_CHECK[checkId] : undefined) ?? GENERIC;
}

/** Every code with a remedy of its own. Used by the coverage test. */
export function remediedCodes() {
  return Object.keys(BY_CODE).sort();
}

/** Every check id with a fallback remedy. */
export function remediedChecks() {
  return Object.keys(BY_CHECK).sort();
}
