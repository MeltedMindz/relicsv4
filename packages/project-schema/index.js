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
  ART_RUNTIME_VERSIONS,
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
  TRAIT_DISTRIBUTIONS,
  transformSpec,
} from "./src/vocabulary.js";

// THE ONE PLACE the launchpad's fee allocation is stated. Everything downstream — CLI, SDK,
// indexer, studio, docs — derives from here rather than typing a bps or a percentage of its own.
export {
  BPS_DENOMINATOR,
  CREATOR_SHARE_BPS,
  PLATFORM_SHARE_BPS,
  RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE,
  PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE,
  NOMINAL_ALLOCATION_BPS,
  NOMINAL_ALLOCATION_PERCENT,
  PLATFORM_SUBDIVISION_PERCENT,
  PLATFORM_SUBDIVISION_PROSE,
  FEE_SPLIT_BPS,
  bpsToPercentString,
  bpsToProsePercentString,
  BUYBACK_MECHANISM,
  ENTOMBMENT_ADDRESS,
  BUYBACK_DISCLOSURE,
  BUYBACK_DISCLOSURE_SHORT,
  BUYBACK_TECHNICAL_NOTE,
  PLATFORM_SETTLEMENT_INVARIANT,
  PLATFORM_ENTITLEMENT_MODEL,
  QUOTE_ADMISSION_REQUIRES_PROVEN_WETH_ROUTE,
  FORBIDDEN_ALLOCATION_PHRASINGS,
  RETIRED_ALLOCATION_CLAIMS,
  SUPERSESSION_MARKERS,
  SUPERSESSION_BANNER_LINES,
  hasSupersessionBanner,
  normalizeForClaimScan,
  segmentsForClaimScan,
  SEGMENT_BOUNDARY,
  CLAIM_SUPPRESSION_CUES,
  isSuppressedMention,
  DETECTOR_SELF_REFERENCE_MARKER,
  CONDITIONALLY_TRUE_MARKER,
  scanTextForRetiredClaims,
  CREATOR_FEE_ASSET_MODES,
  PLATFORM_SETTLEMENT_STATUSES,
  ONCHAIN_REPORTABLE_SETTLEMENT_STATUSES,
  isOffchainDerivedStatus,
  ALLOCATED_PLATFORM_STATUSES,
  BUYBACK_WETH_SETTLED_STATUSES,
  SETTLED_PLATFORM_STATUSES,
  isPlatformSettlementStatus,
  hasAllocatedPlatformEntitlement,
  hasSettledBuybackWeth,
  hasSettledPlatformWeth,
  allocatePlatformEntitlement,
  allocateSettledPlatformWeth,
} from "./src/economics.js";

export { canonicalJson, safeJsonParse, toPlain, CanonicalJsonError, JsonParseError } from "./src/canonical-json.js";
export { sha256Bytes, sha256Hex, sha256Utf8, toHex, utf8, fromUtf8 } from "./src/sha256.js";
export { HASH_ALGORITHM, fileHash, jsonHash, parseAndHashJson, hashesUnder, computeContentHash, computeProjectConfigHash, computeBundleHash, computeIntegrity, isSha256Hex } from "./src/hashes.js";
export { keccak256Bytes, keccak256Hex, keccak256Utf8, prefixed, isKeccak256Hex, ZERO_DIGEST } from "./src/keccak256.js";
export {
  BINDING_SEEDS,
  ART_BINDING_KEYS,
  ART_CONFIG_SOURCES,
  ART_CONFIG_FORMATS,
  ART_RUNTIME_TO_CONFIG_FORMAT,
  CHAIN_RESOLVED_BINDING_FIELDS,
  computeArtBinding,
  deriveArtConfig,
  ArtConfigDerivationError,
  isRuntimeLaunchable,
  computeBundleCommitment,
  representativeOutputsCommitment,
  diffArtBinding,
  keccakJson,
} from "./src/binding.js";

export {
  ACV1_FORMAT,
  ACV1_VERSION,
  ACV1_MAGIC,
  ACV1_TERMINATOR,
  ACV1_FLAGS,
  ACV1_LIMITS,
  ACV1_LAYER_KINDS,
  ACV1_SENSORS,
  ACV1_LAYER_SENSORS,
  ACV1_DNA_SLOTS,
  ACV1_TRAIT_SOURCES,
  ACV1_CURVES,
  ACV1_TRAIT_STYLES,
  ACV1_ERROR_CODES,
  acv1Reason,
  encodeArtConfigV1,
  encodeArtConfigV1Checked,
  withArtConfigV1Appendix,
  decodeArtConfigV1,
  validateArtConfigV1,
  isArtConfigV1,
  hashArtConfigV1,
  describeArtConfigV1,
  emptyArtConfigV1,
  worstCaseElementsV1,
  ArtConfigV1Error,
} from "./src/art-config-v1.js";
export { visualHashArtConfigV1, traitSchemaHashArtConfigV1, runtimeCommitmentArtConfigV1 } from "./src/art-config-v1-hashes.js";

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
