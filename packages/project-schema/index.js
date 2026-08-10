// SPDX-License-Identifier: MIT
// @relics/project-schema — the ONE definition of the `.relics` project bundle.
//
// This package is intentionally self-contained: zero dependencies, plain ESM, no build step. The
// creator CLI in this repo imports it directly; the RELICS Launchpad web importer vendors the
// same directory verbatim. There is no second handwritten copy of the schema anywhere, which is
// the only way a bundle exported by the CLI and a bundle read by the web app can be guaranteed to
// produce identical hashes.

export {
  SCHEMA_VERSION,
  CREATOR_KIT_VERSION,
  RUNTIME_VERSION,
  PROTOCOL_RELEASE_COMPATIBILITY,
  SCHEMA_MAJOR_RATIONALE,
  BUNDLE_MAGIC,
  BUNDLE_EXTENSION,
  isSchemaCompatible,
  explainIncompatibility,
  parseSemver,
} from "./src/version.js";

export { LIMITS, ALLOWED_EXTENSIONS, FORBIDDEN_EXTENSIONS, BUNDLE_LAYOUT, REQUIRED_ENTRIES } from "./src/limits.js";

export {
  SUPPORTED_CHAIN_IDS,
  CHAIN_LABELS,
  ART_RUNTIMES,
  APPROVED_ART_RUNTIMES,
  UNAPPROVED_ART_RUNTIMES,
  LAUNCHABLE_ART_RUNTIMES,
  PREVIEW_ONLY_ART_RUNTIMES,
  ART_RUNTIME_IDS,
  ART_RUNTIME_TO_MODE,
  STARTING_PRESETS,
  STARTING_PRESET_TO_INDEX,
  BACKING_MODELS,
  LAUNCH_MODES,
  CURVE_PRESETS,
  MARKET_SENSORS,
  MARKET_TRANSFORMS,
  ART_DESTINATIONS,
  MARKET_SENSOR_IDS,
  MARKET_TRANSFORM_IDS,
  ART_DESTINATION_IDS,
  EARNINGS_MODES,
  QUOTE_ASSET_REQUEST_MODES,
  QUOTE_ASSET_KINDS,
  CREATOR_LP_FEE_ASSET_MODES,
  FEE_SPLIT_BPS,
  BUYBACK_DISCLOSURE,
  TRAIT_DISTRIBUTIONS,
  transformSpec,
} from "./src/vocabulary.js";

export { canonicalJson, safeJsonParse, toPlain, CanonicalJsonError, JsonParseError } from "./src/canonical-json.js";
export { sha256Bytes, sha256Hex, sha256Utf8, toHex, utf8, fromUtf8 } from "./src/sha256.js";
export { HASH_ALGORITHM, fileHash, jsonHash, parseAndHashJson, hashesUnder, computeContentHash, computeProjectConfigHash, computeBundleHash, computeIntegrity, isSha256Hex } from "./src/hashes.js";
export { keccak256Bytes, keccak256Hex, keccak256Utf8, prefixed, isKeccak256Hex, ZERO_DIGEST } from "./src/keccak256.js";
export {
  BINDING_SEEDS,
  ART_BINDING_KEYS,
  ART_CONFIG_SOURCES,
  CHAIN_RESOLVED_BINDING_FIELDS,
  computeArtBinding,
  isRuntimeLaunchable,
  computeBundleCommitment,
  representativeOutputsCommitment,
  diffArtBinding,
  keccakJson,
} from "./src/binding.js";

export { normalizeEntryPath, collisionKey, extensionOf, roleOf, checkEntryPolicy, EntryPathError } from "./src/paths.js";
export { writeContainer, readContainer, crc32, ContainerError } from "./src/container.js";

export { validateManifest, MANIFEST_KEYS, REFUSED_MANIFEST_KEYS } from "./src/manifest.js";
export { validateTraitSchema, deriveTraits, traitFingerprint, combinationSpace } from "./src/traits.js";
export { validateMarketMappings, applyTransform, evaluateMappings } from "./src/market.js";
export { validateCollectionMetadata } from "./src/metadata.js";
export { analyzeGeneratorSource, stripComments, FORBIDDEN_IDENTIFIERS } from "./src/static-analysis.js";
export { scanTextForSecrets, isTextPath, SECRET_PATTERNS } from "./src/secrets.js";
export { inspectRenderOutput, outputFingerprint } from "./src/svg.js";

export { validateBundle, validateBundleBytes, buildRenderContext, neutralSensors, CHECKS } from "./src/validate.js";
export { assembleBundle, stableJsonText, GENERATED_ENTRIES, BuildError } from "./src/build.js";
export { toStudioDraft } from "./src/studio-draft.js";

export { mulberry32, seedStringToNumber, makeRandom } from "./src/prng.js";
export { error, warn, hasErrors, summarize, sortIssues } from "./src/issues.js";
