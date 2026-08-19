// SPDX-License-Identifier: MIT
// Type surface for @relics/project-schema. The runtime lives in plain ESM JavaScript so the same
// files run unbuilt in Node, in a browser worker and inside a bundler; these declarations give a
// TypeScript consumer (the launchpad web importer) full typing without a compile step.

// The ACV1 creator art configuration. Declared in its own file because ACV1 is a PROTOCOL byte
// format with its own version axis (ArtConfigV1.sol), not a bundle-format concern — re-exported
// here so a consumer importing the package root sees one complete type surface.
export * from "./art-config.js";

export type Severity = "error" | "warning";
export interface Issue {
  severity: Severity;
  code: string;
  where: string;
  message: string;
}

export type SupportedChainId = 1 | 8453 | 4663 | 56;
export type DeployedChainId = 1 | 8453 | 4663;
export type LaunchAccess = "PREPARED" | "PUBLIC";
export type ArtRuntime = "SOLIDITY_SVG" | "JAVASCRIPT";
export type StartingPreset = "LOW" | "MID" | "HIGH";
export type BackingModel = "FULL_PARITY" | "PARTIAL";
/**
 * A reviewed protocol template id. The FORMAT does not enumerate them: an instance is one
 * launchpad operator's reviewed product integration, registered into the schema's registry at
 * start-up by that operator. This package registers none, so a build that has not registered one
 * refuses every `protocolTemplate` block by name.
 */
export type ReviewedProtocolTemplateId = string;

/**
 * The canonical economics artifact a reviewed template binds. Its INTERNAL shape belongs to the
 * operator who authored and reviewed it — the format's only requirements are that it is a JSON
 * object, that it names its own template, and that `economicsSha256` commits to its canonical
 * serialization.
 */
export interface ReviewedCanonicalEconomics {
  launchpadTemplateId: ReviewedProtocolTemplateId;
  [key: string]: unknown;
}

export interface ReviewedProtocolTemplateBinding {
  id: ReviewedProtocolTemplateId;
  canonicalEconomics: ReviewedCanonicalEconomics;
  /** sha256 of `canonicalJson(canonicalEconomics)`, lowercase hex, no prefix. */
  economicsSha256: string;
}

/** What an operator registers. `supply` and `verify` are the optional INSTANCE rules. */
export interface ReviewedProtocolTemplateSpec {
  id: ReviewedProtocolTemplateId;
  /** Pins the reviewed artifact. A binding carrying a different digest is refused. */
  economicsSha256?: string;
  /** Pins the supply the template launches with, as whole-number decimal strings. */
  supply?: Readonly<{ totalSupplyWhole: string; artworkSupply: string; genesisTokensPerPossibleNftWhole: string }>;
  /** Extra instance checks over the economics document. */
  verify?: (canonicalEconomics: ReviewedCanonicalEconomics) => Issue[];
}

export type LaunchMode = "INSTANT_V4" | "FIXED_PRICE_SALE_TO_V4" | "BONDING_CURVE_SALE_TO_V4";
export type EarningsMode = "SOLO" | "SPLIT";
export type MarketSensor =
  | "buying_pressure"
  | "selling_pressure"
  | "volume"
  | "tick"
  | "volatility"
  | "drawdown"
  | "recovery"
  | "liquidity"
  | "holder_growth"
  | "epoch"
  | "market_seed";
export type TransformKind = "threshold" | "range" | "clamp" | "smoothing" | "tier" | "accumulation" | "decay" | "inverse" | "weighted_mix";
export type ArtDestination = "palette" | "brightness" | "density" | "scale" | "symmetry" | "fracture" | "line_weight" | "distortion" | "geometry" | "scar" | "animation";

export interface MarketMapping {
  id: string;
  sensor: MarketSensor;
  transform: TransformKind;
  transformParams: Record<string, number>;
  destination: ArtDestination;
}
export interface MarketMappingDocument {
  version: 1;
  mappings: MarketMapping[];
}

export interface TraitValue {
  name: string;
  weight?: number;
}
export interface TraitDimension {
  name: string;
  distribution: "weighted" | "uniform";
  values: TraitValue[];
}
export interface TraitSchema {
  version: 1;
  dimensions: TraitDimension[];
}

export interface CollectionMetadata {
  version: 1;
  name: string;
  symbol: string;
  description: string;
  image?: string;
  bannerImage?: string;
  featuredImage?: string;
  externalLink?: string;
  tokenNamePattern?: string;
  collaborators?: { address: string; role: string }[];
  socials?: Partial<Record<"x" | "telegram" | "discord" | "github" | "farcaster", string>>;
}

export interface ProjectManifest {
  schemaVersion: string;
  creatorKitVersion: string;
  runtimeVersion: string;
  protocolReleaseCompatibility: string;
  generatedBy?: string;
  project: {
    name: string;
    symbol: string;
    description: string;
    license: string;
    website?: string;
    twitterHandle?: string;
  };
  supply: {
    totalSupplyWhole: string;
    artworkSupply: string;
    /**
     * Chosen at launch, IMMUTABLE afterwards. Omit for NONE — which is what every bundle written
     * before schema 3.2.0 meant, because no project token could burn at all.
     *
     * This describes the PROJECT token. The RELICS token is non-burnable and uses buy-and-entomb;
     * its totalSupply stays fixed at 10,000.
     */
    burnPolicy?: BurnPolicy;
  } & (
    | { backingModel: BackingModel; tokensPerArtwork?: string; genesisTokensPerPossibleNftWhole?: never }
    | { genesisTokensPerPossibleNftWhole: string; backingModel?: never; tokensPerArtwork?: never }
  );
  protocolTemplate?: ReviewedProtocolTemplateBinding;
  art: {
    runtime: ArtRuntime;
    templateId: string | null;
    entry: "generator/generate.js";
    seed: string;
    scriptBytes: number;
    traitDimensions?: string[];
  };
  market: {
    startingPreset: StartingPreset;
    launchMode: LaunchMode;
    mappingCount: number;
    sale?: {
      allocationBps: number;
      durationDays: number;
      minRaiseEth: string;
      curvePresetId?: string;
    };
    /** Which of `chains.requested` this market block describes. Optional. */
    chainId?: SupportedChainId;
    /**
     * A REQUEST for the asset the project should be priced and traded in. NEVER an approval: the
     * importer re-resolves it against the launchpad's own current registry, and a bundle can never
     * widen the set of assets the platform accepts. Omit it entirely to mean DEFAULT.
     */
    quoteAsset?: {
      mode: QuoteAssetRequestMode;
      /** Required when `mode` is "ADDRESS"; refused otherwise. */
      address?: string;
      /** Cross-check only. The registry's answer wins; a mismatch REFUSES, never approves. */
      expectedKind?: QuoteAssetKind;
      /** The registry release the bundle was authored against, for drift reporting. */
      registryVersion?: string;
    };
    /** A REQUEST. QUOTE_ONLY needs a conversion route the platform has proven at import time. */
    creatorLpFeeAssetMode?: CreatorLpFeeAssetMode;
  };
  earnings: {
    mode: EarningsMode;
    creatorRecipient: string;
    collaborators: { recipient: string; bps: number }[];
    creatorAllocationBps?: number;
  };
  chains: { requested: SupportedChainId[] };
  media?: {
    cover?: { path: string; sha256: string; cid?: string };
    files?: Record<string, string>;
  };
  hashes: {
    algorithm: "sha256";
    script: string;
    dependencies?: Record<string, string>;
    generator: string;
    traitSchema: string;
    marketMapping: string;
    metadata: string;
    media?: Record<string, string>;
  };
  /**
   * The art binding — what a collection actually renders from. Derived by the builder from the
   * bundle's own bytes and recomputed by the validator, so nothing here can be authored by hand.
   * Every digest is keccak256 as a BARE 64-character lowercase hex string (no `0x`; see
   * `keccak256Hex`), because keccak is what the EVM computes and the on-chain record holds.
   */
  artBinding: ArtBinding;
  integrity: {
    contentHash: string;
    projectConfigHash: string;
    bundleHash: string;
    /** keccak256 over the same preimage as `bundleHash` — one `bytes32` naming this bundle. */
    bundleCommitment: string;
  };
}

export type ArtConfigSource = "GENERATOR_SCRIPT" | "TEMPLATE_PARAMS";

export interface ArtBinding {
  schemaVersion: string;
  runtime: ArtRuntime;
  /** Stable, versioned runtime identifier, e.g. `ONCHAIN_JAVASCRIPT_V1`. */
  runtimeId: string;
  runtimeIdHash: string;
  artMode: 0 | 1;
  templateId: string;
  artConfigSource: ArtConfigSource;
  artConfigBytes: number;
  /**
   * keccak256 of the exact bytes the launch stores — the value `LaunchParams.artScriptHash`
   * carries. Null for a TEMPLATE_PARAMS binding, whose config only the registered template's
   * published parameter layout can encode.
   */
  artConfigHash: string | null;
  templateParamsHash: string | null;
  generatorHash: string;
  traitSchemaHash: string;
  marketMappingHash: string;
  metadataHash: string;
  /** Commitment to what the generator draws for `BINDING_SEEDS`. Null for a Solidity renderer. */
  representativeOutputsHash: string | null;
  /** CHAIN FACTS. Always null in a bundle; the importer and the launch supply them. */
  runtimeCodeHash: null;
  scriptPointer: null;
}

export interface RenderContext {
  seed: string;
  random: {
    next(): number;
    float(min: number, max: number): number;
    int(min: number, max: number): number;
    chance(p: number): boolean;
    pick<T>(items: T[]): T;
    weighted<T>(items: T[], weights: number[]): T;
  };
  market: Readonly<Partial<Record<ArtDestination, number>>>;
  sensors: Readonly<Record<MarketSensor, number>>;
  size: number;
  project: Readonly<{ name: string; symbol: string; artworkSupply: string }>;
}

export interface GeneratorModule {
  render(context: RenderContext): string;
  manifest?: unknown;
}

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";
export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  schemaVersion: string;
  issues: Issue[];
  summary: { ok: boolean; errorCount: number; warningCount: number; errors: Issue[]; warnings: Issue[] };
  checks: CheckResult[];
  manifest: ProjectManifest | null;
  traitSchema: TraitSchema | null;
  marketMappings: MarketMappingDocument | null;
  collectionMetadata: CollectionMetadata | null;
  hashes: { bundleHash: string; projectConfigHash: string; contentHash: string; bundleCommitment: string; files: Record<string, string> } | null;
  /** The binding as RECOMPUTED from the container, not as declared. Null when it cannot be derived. */
  artBinding: ArtBinding | null;
  execution: {
    ran: boolean;
    reason: string;
    seeds: number;
    deterministic: boolean | null;
    duplicateRate: number | null;
    distinctOutputs?: number;
    outputs: { seed: string; length: number }[];
    /** sha256 of the render for each of `BINDING_SEEDS`; null when any of them failed to render. */
    bindingOutputs?: Record<string, string> | null;
  };
}

export interface ValidateOptions {
  /** Host-supplied sandbox. Given the generator sources and the entry path, return its exports. */
  evaluate?: (files: Map<string, string>, entry: string) => GeneratorModule;
  seeds?: number;
  skipExecution?: boolean;
}

export interface StudioDraftProjection {
  draft: Record<string, unknown>;
  provenance: {
    source: "relics-bundle";
    schemaVersion: string;
    creatorKitVersion: string;
    runtimeVersion: string;
    protocolReleaseCompatibility: string;
    protocolTemplate?: ReviewedProtocolTemplateBinding;
    bundleHash: string | null;
    projectConfigHash: string | null;
    contentHash: string | null;
    generatorHash: string;
    scriptHash: string;
    traitSchemaHash: string;
    marketMappingHash: string;
    metadataHash: string;
    mediaHashes: Record<string, string>;
    /** The art binding, carried verbatim so the importer builds launch parameters from it. */
    artBinding: ArtBinding | null;
    bundleCommitment: string | null;
    requestedChains: SupportedChainId[];
    /** The bundle's quote-asset REQUEST, carried verbatim for the importer to resolve. */
    quoteAssetRequest: {
      mode: QuoteAssetRequestMode;
      address: string | null;
      expectedKind: QuoteAssetKind | null;
      registryVersion: string | null;
    };
    creatorLpFeeAssetMode: CreatorLpFeeAssetMode;
    marketChainId: SupportedChainId | null;
    earningsMode: EarningsMode;
    earningsBps: {
      creatorShareOfCollectedFeesBps: number;
      collaborators: { recipient: string; bps: number }[];
      totalCollaboratorBps: number;
    };
    templateParams: unknown;
  };
}

export type QuoteAssetRequestMode = "DEFAULT" | "ADDRESS";
/** `NATIVE_WRAPPED` is canonical; `NATIVE_WETH` is its deprecated alias and maps to the same kind. */
export type QuoteAssetKind = "NATIVE_WRAPPED" | "NATIVE_WETH" | "STABLE" | "STOCK_TOKEN" | "ECOSYSTEM_TOKEN";
export type BuybackRouteState = "IDENTITY_WETH" | "ROUTE_UNPROVEN";
/** NFT SECONDARY earnings on a resale — unrelated to the project market's LP fee split. */
export type CreatorEarningsMode = "NONE" | "OPTIONAL" | "ENFORCED";
export interface ChainProfile {
  label: string;
  nativeSymbol: string;
  wrappedNativeSymbol: string;
  canonicalQuoteSymbols: readonly string[];
  buybackRouteState: BuybackRouteState;
  /** The earnings models launchable on this chain. NONE and OPTIONAL are always present. */
  creatorEarningsModes: readonly CreatorEarningsMode[];
}
export type CreatorLpFeeAssetMode = "DUAL_ASSET" | "QUOTE_ONLY";
export interface PlatformContracts {
  launchpadFactory: string;
  artStreamableFeesLocker: string;
  projectRegistry: string;
  projectMetadataRegistry: string;
  projectRights: string;
  scriptStorage: string;
  templateRegistry: string;
  artRuntimeRegistry: string;
  solidityGenerativeRuntimeV1: string;
  protocolTimelock: string;
  quoteAssetRegistry?: string;
  multiQuoteEconomicKernel?: string;
  immutableLiquidityKernel?: string;
  robinhoodV4SwapRouter?: string;
}
export interface PlatformDeployment {
  chainId: DeployedChainId;
  label: string;
  /** Which platform generation these addresses belong to. Never inferred. */
  generation: PlatformGenerationId;
  launchAccess: LaunchAccess;
  explorer: string;
  contracts: Readonly<PlatformContracts>;
}
export interface RobinhoodStockToken {
  symbol: string;
  name: string;
  address: string;
  decimals: 18;
  isin: string | null;
}
export interface Rc5CanaryMetadataProjectProof {
  chainId: DeployedChainId;
  label: string;
  symbol: "TEST";
  canary: "TEST-INSTANT";
  projectId: 1;
  projectToken: string;
  projectCollection: string;
  artHook: string;
  poolId: string;
  verifiedTokenId: 1;
}
export interface Rc5CanaryMetadataProof {
  repairedAt: string;
  media: Readonly<{ imageUri: string; gatewayUrl: string }>;
  expectation: Readonly<{ contractURI: string; tokenURI: string }>;
  projects: Readonly<Record<DeployedChainId, Readonly<Rc5CanaryMetadataProjectProof>>>;
}

export const QUOTE_ASSET_REQUEST_MODES: readonly QuoteAssetRequestMode[];
export const QUOTE_ASSET_KINDS: readonly QuoteAssetKind[];
export const CREATOR_LP_FEE_ASSET_MODES: readonly CreatorLpFeeAssetMode[];

// ---- live deployment and quote-token reference ------------------------------------------------
export type PlatformGenerationId = "RC5" | "RC6";
export type GenerationStatus = "DEPLOYED" | "NOT_DEPLOYED";

export interface PlatformGeneration {
  id: PlatformGenerationId;
  tag: string;
  status: GenerationStatus;
  freezeCommit: string | null;
  solidityTree: string | null;
  deployedAt: string | null;
  externalAudit: string;
  /** False when the generation's addresses are derived but nothing exists at them. */
  publishesAddresses: boolean;
  summary: string;
}

export const PLATFORM_GENERATION_IDS: readonly PlatformGenerationId[];
export const PLATFORM_GENERATIONS: Readonly<Record<PlatformGenerationId, Readonly<PlatformGeneration>>>;
/** The RC5 generation record. Same object as `PLATFORM_GENERATIONS.RC5`. */
export const PLATFORM_RELEASE: Readonly<PlatformGeneration>;
export const RC5_DEPLOYMENTS: Readonly<Record<SupportedChainId, Readonly<PlatformDeployment> | null>>;
/** GENERATED by scripts/sync-deployments.mjs. Null everywhere until a package is broadcast. */
export const RC6_DEPLOYMENTS: Readonly<Record<SupportedChainId, Readonly<PlatformDeployment> | null>>;
export const DEPLOYMENTS_BY_GENERATION: Readonly<Record<PlatformGenerationId, Readonly<Record<SupportedChainId, Readonly<PlatformDeployment> | null>>>>;
/** The newest generation that is actually DEPLOYED — never merely the newest that exists. */
export const CURRENT_DEPLOYED_GENERATION: PlatformGenerationId | null;
/** @deprecated Prefer `deploymentsFor(generation)`. The current DEPLOYED generation's table. */
export const PLATFORM_DEPLOYMENTS: Readonly<Record<SupportedChainId, Readonly<PlatformDeployment> | null>>;
/** Every chain id any generation names, including ones nothing is deployed on. */
export const KNOWN_DEPLOYMENT_CHAIN_IDS: readonly number[];
export const RC5_CANARY_METADATA_PROOF: Readonly<Rc5CanaryMetadataProof>;
/** Chain ids with live platform contracts in the current DEPLOYED generation. */
export const DEPLOYED_CHAIN_IDS: readonly DeployedChainId[];
export function deploymentsFor(generation: string): Readonly<Record<SupportedChainId, Readonly<PlatformDeployment> | null>>;
export function platformGeneration(generation: string): Readonly<PlatformGeneration>;
export function deployedChainIds(generation?: string): number[];
export function platformDeployment(chainId: number, generation?: string): Readonly<PlatformDeployment> | null;
export function isPlatformDeployed(chainId: number, generation?: string): boolean;
export function acceptsPublicLaunches(chainId: number, generation?: string): boolean;
export function launchAvailability(chainId: number, generation?: string): string;
export function explorerAddressUrl(chainId: number, address: string, generation?: string): string;
export const ROBINHOOD_STOCK_TOKENS_VERSION: string;
export const ROBINHOOD_STOCK_TOKENS_SOURCE: string;
export const ROBINHOOD_STOCK_TOKENS_CHAIN_ID: 4663;
export const ROBINHOOD_STOCK_TOKENS: readonly Readonly<RobinhoodStockToken>[];
export const ROBINHOOD_STOCK_TOKEN_COUNT: number;
export function robinhoodStockTokenBySymbol(symbol: string): Readonly<RobinhoodStockToken> | null;
export function robinhoodStockTokenByAddress(address: string): Readonly<RobinhoodStockToken> | null;

// ---- versions --------------------------------------------------------------------------------
export const SCHEMA_VERSION: string;
export const CREATOR_KIT_VERSION: string;
export const RUNTIME_VERSION: string;
export const PROTOCOL_RELEASE_COMPATIBILITY: string;
export const BUNDLE_MAGIC: string;
export const BUNDLE_EXTENSION: string;
/** Draft identity is intrinsic: distinct archive marker, committed `status`, distinct commitment. */
export const DRAFT_MAGIC: string;
export const DRAFT_EXTENSION: string;
export const BUNDLE_STATUSES: readonly ("FINAL" | "DRAFT")[];
export function magicForStatus(status: string): string;
export const SCHEMA_MAJOR_RATIONALE: string;
export function isSchemaCompatible(bundleSchemaVersion: string, importerSchemaVersion?: string): boolean;
/** A refusal message that names the reason and the fix, for a bundle this importer cannot read. */
export function explainIncompatibility(bundleSchemaVersion: string): string;
export function parseSemver(value: string): { major: number; minor: number; patch: number } | null;

// ---- limits and vocabulary -------------------------------------------------------------------
export const LIMITS: Readonly<Record<string, number | bigint>>;
export const ALLOWED_EXTENSIONS: Readonly<Record<string, readonly string[]>>;
export const FORBIDDEN_EXTENSIONS: Readonly<Record<string, string>>;
export const BUNDLE_LAYOUT: readonly { path: string; kind: "file" | "dir"; role: string; required: boolean }[];
export const REQUIRED_ENTRIES: readonly string[];
export const SUPPORTED_CHAIN_IDS: readonly SupportedChainId[];
export const CHAIN_LABELS: Readonly<Record<number, string>>;
export const CHAIN_PROFILES: Readonly<Record<number, Readonly<ChainProfile>>>;
export function chainProfile(chainId: number): Readonly<ChainProfile> | null;
/** THROWS on an unknown chain — there is deliberately no "WETH" fallback. */
export function wrappedNativeSymbolFor(chainId: number): string;
/** THROWS on an unknown chain — there is deliberately no "ETH" fallback. */
export function nativeSymbolFor(chainId: number): string;
export const CREATOR_EARNINGS_MODES: readonly CreatorEarningsMode[];
/** THROWS on an unknown chain — the plausible answer is the full list, and it is the wrong one. */
export function creatorEarningsModesFor(chainId: number): readonly CreatorEarningsMode[];
/** May ENFORCED be OFFERED here? Never "are earnings being enforced" — only an observation says that. */
export function enforcedEarningsAvailableOn(chainId: number): boolean;
export const DEPRECATED_QUOTE_ASSET_KIND_ALIASES: Readonly<Record<string, string>>;
export function canonicalQuoteAssetKind(kind: string): string;
export const ART_RUNTIMES: readonly ArtRuntime[];
export const APPROVED_ART_RUNTIMES: readonly ArtRuntime[];
export const UNAPPROVED_ART_RUNTIMES: readonly string[];
/** Runtimes the launchpad currently binds and renders — the set a template may be sold as launchable on. */
export const LAUNCHABLE_ART_RUNTIMES: readonly ArtRuntime[];
export const PREVIEW_ONLY_ART_RUNTIMES: readonly ArtRuntime[];
export const ART_RUNTIME_IDS: Readonly<Record<ArtRuntime, string>>;
export const ART_RUNTIME_TO_MODE: Readonly<Record<ArtRuntime, 0 | 1>>;
export const STARTING_PRESETS: readonly StartingPreset[];
export const STARTING_PRESET_TO_INDEX: Readonly<Record<StartingPreset, 0 | 1 | 2>>;
export const BACKING_MODELS: readonly BackingModel[];
export const PROTOCOL_TEMPLATE_KEYS: readonly ["id", "canonicalEconomics", "economicsSha256"];
/** LIVE binding: reassigned by `registerReviewedProtocolTemplate`. Empty in this package. */
export const REVIEWED_PROTOCOL_TEMPLATE_IDS: readonly ReviewedProtocolTemplateId[];
export function reviewedProtocolTemplateIds(): readonly ReviewedProtocolTemplateId[];
export function reviewedProtocolTemplate(id: string): Readonly<ReviewedProtocolTemplateSpec> | null;
export function reviewedTemplateSupplyPin(
  id: string,
): Readonly<{ totalSupplyWhole: string; artworkSupply: string; genesisTokensPerPossibleNftWhole: string }> | null;
export function registerReviewedProtocolTemplate(spec: ReviewedProtocolTemplateSpec): Readonly<ReviewedProtocolTemplateSpec>;
export function clearReviewedProtocolTemplates(): void;
export function bindCanonicalEconomics(id: ReviewedProtocolTemplateId, canonicalEconomics: ReviewedCanonicalEconomics): ReviewedProtocolTemplateBinding;
export function validateReviewedProtocolTemplate(binding: unknown): Issue[];
/** Mirrors the launchpad `ProjectToken.BurnPolicy` enum, index for index. */
export type BurnPolicy = "NONE" | "HOLDER_BURN" | "HOLDER_AND_ALLOWANCE_BURN";
export const BURN_POLICIES: readonly BurnPolicy[];
export const BURN_POLICY_TO_INDEX: Readonly<Record<BurnPolicy, number>>;
/** What an absent `supply.burnPolicy` means. Always NONE; never inferred from anything else. */
export const DEFAULT_BURN_POLICY: BurnPolicy;
export interface BurnPolicyCard {
  policy: BurnPolicy;
  title: string;
  summary: string;
  detail: string;
}
export const BURN_POLICY_CARDS: readonly BurnPolicyCard[];
/** A creator must confirm this before a burning policy can be selected. */
export const BURN_POLICY_IMMUTABILITY_ACK: string;
/** The flagship contrast: a creator's burnable token does not make RELICS burnable. */
export const RELICS_BURN_CONTRAST_COPY: string;
export function burnPolicyAllowsBurning(policy: string): boolean;
/** Anti-snipe strategies. NOT Sybil-resistant -- see ANTI_SNIPE_NOT_SYBIL_PROOF_COPY. */
export type AntiSnipeStrategy = "INSTANT_V4" | "FIXED_PRICE_FAIR_LAUNCH" | "BONDING_CURVE_TO_V4" | "PROGRESSIVE_LIQUIDITY";
export const ANTI_SNIPE_STRATEGIES: readonly AntiSnipeStrategy[];
export const ANTI_SNIPE_STRATEGY_TO_LAUNCH_MODE: Readonly<Record<AntiSnipeStrategy, string | null>>;
export const ANTI_SNIPE_STRATEGY_COPY: Readonly<Record<AntiSnipeStrategy, string>>;
export const ANTI_SNIPE_NOT_SYBIL_PROOF_COPY: string;
export const LAUNCH_MODES: readonly LaunchMode[];
export const CURVE_PRESETS: readonly string[];
export const MARKET_SENSORS: readonly { id: MarketSensor; label: string; description: string }[];
export const MARKET_TRANSFORMS: readonly { id: TransformKind; label: string; description: string; params: { key: string; label: string; min: number; max: number; step?: number }[] }[];
export const ART_DESTINATIONS: readonly { id: ArtDestination; label: string; description: string }[];
export const MARKET_SENSOR_IDS: readonly MarketSensor[];
export const MARKET_TRANSFORM_IDS: readonly TransformKind[];
export const ART_DESTINATION_IDS: readonly ArtDestination[];
export const EARNINGS_MODES: readonly EarningsMode[];
export const TRAIT_DISTRIBUTIONS: readonly ("weighted" | "uniform")[];
export function transformSpec(id: string): { id: TransformKind; params: { key: string; min: number; max: number }[] } | null;

// ---- economics: the ONE place the launchpad's fee allocation is stated ------------------------
export type CreatorFeeAssetMode = "DUAL_ASSET" | "QUOTE_ONLY";
export type PlatformSettlementStatus =
  | "NOT_ACCRUED"
  | "SOURCE_ASSETS_PENDING"
  | "PROJECT_TOKEN_TO_QUOTE_PENDING"
  | "SPLIT_ALLOCATED"
  | "BUYBACK_ALLOCATED_AWAITING_ROUTE"
  | "QUOTE_TO_WETH_PENDING"
  | "WETH_SETTLED"
  | "DEGRADED_ROUTE"
  | "RETRYABLE_FAILURE"
  | "UNKNOWN";
export interface AllocationBps {
  creator: number;
  platformTreasury: number;
  relicsBuybackReserve: number;
}
export const BPS_DENOMINATOR: number;
export const CREATOR_SHARE_BPS: number;
export const PLATFORM_SHARE_BPS: number;
export const RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE: number;
export const PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE: number;
export const NOMINAL_ALLOCATION_BPS: Readonly<AllocationBps>;
export const NOMINAL_ALLOCATION_PERCENT: Readonly<{ creator: string; platformTreasury: string; relicsBuybackReserve: string }>;
export const PLATFORM_SUBDIVISION_PERCENT: Readonly<{ platformTreasury: string; relicsBuybackReserve: string }>;
export const PLATFORM_SUBDIVISION_PROSE: Readonly<{ platformTreasury: string; relicsBuybackReserve: string }>;
export const FEE_SPLIT_BPS: Readonly<AllocationBps>;
export function bpsToPercentString(bps: number): string;
export function bpsToProsePercentString(bps: number): string;
export const BUYBACK_MECHANISM: "BUY_AND_ENTOMB";
export const ENTOMBMENT_ADDRESS: string;
export const BUYBACK_DISCLOSURE: string;
export const BUYBACK_DISCLOSURE_SHORT: string;
export const BUYBACK_TECHNICAL_NOTE: string;
export const PLATFORM_SETTLEMENT_INVARIANT: string;
export const PLATFORM_ENTITLEMENT_MODEL: Readonly<{
  entitlementAsset: "SELECTED_QUOTE";
  treasuryHalf: string;
  buybackHalf: string;
  wethQuoteIs: string;
  projectTokenDirectPlatformClaim: false;
  buybackTerminalAsset: "WETH";
}>;
/** Deliberately `false`, and deliberately stated: quote admission is NOT gated on a proven WETH
 *  route, because the treasury half is claimable in the quote and the buyback half may wait. */
export const QUOTE_ADMISSION_REQUIRES_PROVEN_WETH_ROUTE: false;
export const FORBIDDEN_ALLOCATION_PHRASINGS: readonly string[];
export interface RetiredAllocationClaim {
  id: string;
  counter: string;
  /** Run against the RAW text — casing and punctuation are load-bearing. */
  pattern: string;
  /** Run against `normalizeForClaimScan(text)` — catches identifier-, comment- and
   *  JSON-value-shaped occurrences that a prose regex misses. */
  normalizedPattern?: string;
  description: string;
}
/** Collapses identifier separators, camelCase boundaries and punctuation to single spaces and
 *  lowercases, so the same claim written as code normalises to the same string as prose. */
export function normalizeForClaimScan(text: string): string;
export const RETIRED_ALLOCATION_CLAIMS: readonly Readonly<RetiredAllocationClaim>[];
export const SUPERSESSION_MARKERS: readonly string[];
export const SUPERSESSION_BANNER_LINES: number;
/** True only when a marker appears within the first `SUPERSESSION_BANNER_LINES` lines — a banner,
 *  not a passing mention of the convention. */
export function hasSupersessionBanner(text: string): boolean;
export interface RetiredClaimHit {
  id: string;
  counter: string;
  description: string;
  line: number;
  sample: string;
}
/** THE ONE MATCHER both repositories' gates call. Matches per line (so proximity guards survive
 *  normalisation), strips counter names first, and runs raw and normalised patterns. */
export function scanTextForRetiredClaims(text: string): RetiredClaimHit[];
/** Boundaries a fuzzy proximity match must not cross within a line — table cell walls and
 *  sentence terminators. */
export const SEGMENT_BOUNDARY: RegExp;
export function segmentsForClaimScan(line: string): string[];
export const CLAIM_SUPPRESSION_CUES: Readonly<{ negated: readonly string[]; narrated: readonly string[]; cited: readonly string[] }>;
/** True when a line mentions a retired claim while negating, narrating or citing it. */
export function isSuppressedMention(rawLine: string): boolean;
/** A file whose job is detecting these claims declares itself with this marker and is skipped. */
export const DETECTOR_SELF_REFERENCE_MARKER: string;
/** Marks a line (or the line below it) whose retired phrasing is exactly true under a stated
 *  condition — the WETH-quoted form of the mandated settlement sentence. Line-scoped, never
 *  file-scoped. */
export const CONDITIONALLY_TRUE_MARKER: string;
export const CONDITIONALLY_TRUE_LOOKBACK: number;
export const CREATOR_FEE_ASSET_MODES: readonly [CreatorFeeAssetMode, ...CreatorFeeAssetMode[]];
/** Declared as a NON-EMPTY TUPLE so a consumer that needs `readonly [string, ...string[]]` — the
 *  indexer's `onchainEnum`, for one — can pass it straight through without a cast or a second copy
 *  of the list. The union above is the authority on membership; this only says "at least one". */
export const PLATFORM_SETTLEMENT_STATUSES: readonly [PlatformSettlementStatus, ...PlatformSettlementStatus[]];
/** The subset a contract can report. `RETRYABLE_FAILURE` is absent by design: a reverted call
 *  writes no status, so no on-chain read can produce it. */
export const ONCHAIN_REPORTABLE_SETTLEMENT_STATUSES: readonly [PlatformSettlementStatus, ...PlatformSettlementStatus[]];
export function isOffchainDerivedStatus(status: string): boolean;
export const ALLOCATED_PLATFORM_STATUSES: readonly [PlatformSettlementStatus, ...PlatformSettlementStatus[]];
export const BUYBACK_WETH_SETTLED_STATUSES: readonly [PlatformSettlementStatus, ...PlatformSettlementStatus[]];
/** @deprecated Use `BUYBACK_WETH_SETTLED_STATUSES`. */
export const SETTLED_PLATFORM_STATUSES: readonly [PlatformSettlementStatus, ...PlatformSettlementStatus[]];
export function isPlatformSettlementStatus(status: string): boolean;
export function hasAllocatedPlatformEntitlement(status: string): boolean;
export function hasSettledBuybackWeth(status: string): boolean;
/** @deprecated Use `hasSettledBuybackWeth`. */
export function hasSettledPlatformWeth(status: string): boolean;
export function allocatePlatformEntitlement(entitlement: bigint): Readonly<{ buybackReserve: bigint; treasuryRetained: bigint }>;
/** @deprecated Use `allocatePlatformEntitlement`; the name asserts WETH, now only the special case. */
export function allocateSettledPlatformWeth(netSettledWeth: bigint): Readonly<{ buybackReserve: bigint; treasuryRetained: bigint }>;

// ---- hashing and serialization ---------------------------------------------------------------
export function canonicalJson(value: unknown): string;
export function safeJsonParse(text: string, limits?: { maxDepth?: number; maxNodes?: number }): unknown;
export function toPlain<T>(value: T): T;
export class CanonicalJsonError extends Error {}
export class JsonParseError extends Error {}
export function sha256Bytes(bytes: Uint8Array): Uint8Array;
export function sha256Hex(bytes: Uint8Array): string;
export function sha256Utf8(text: string): string;
export function toHex(bytes: Uint8Array): string;
export function utf8(text: string): Uint8Array;
export function fromUtf8(bytes: Uint8Array): string;
export const HASH_ALGORITHM: "sha256";
export function fileHash(bytes: Uint8Array): string;
export function jsonHash(document: unknown): string;
export function parseAndHashJson(bytes: Uint8Array): { value: unknown; hash: string };
export function hashesUnder(byPath: Map<string, Uint8Array>, prefix: string): Record<string, string>;
export function computeContentHash(byPath: Map<string, Uint8Array>): { contentHash: string; files: Record<string, string> };
export function computeProjectConfigHash(manifest: Record<string, unknown>): string;
export function computeBundleHash(projectConfigHash: string, contentHash: string): string;
export function computeIntegrity(manifest: Record<string, unknown>, byPath: Map<string, Uint8Array>): { contentHash: string; projectConfigHash: string; bundleHash: string; files: Record<string, string> };
export function isSha256Hex(value: unknown): boolean;

// ---- container -------------------------------------------------------------------------------
export function normalizeEntryPath(raw: string): string;
export function collisionKey(path: string): string;
export function extensionOf(path: string): string;
export function roleOf(path: string): string | null;
export function checkEntryPolicy(path: string): { ok: true; role: string } | { ok: false; reason: string };
export class EntryPathError extends Error {}
export function writeContainer(entries: { path: string; bytes: Uint8Array }[]): Uint8Array;
export function readContainer(bytes: Uint8Array, options?: { requireMagic?: boolean }): { entries: { path: string; bytes: Uint8Array }[]; byPath: Map<string, Uint8Array>; comment: string };
export function crc32(bytes: Uint8Array): number;
export class ContainerError extends Error {}

// ---- documents -------------------------------------------------------------------------------
export function validateManifest(manifest: unknown): Issue[];
export const MANIFEST_KEYS: readonly string[];
export const REFUSED_MANIFEST_KEYS: Readonly<Record<string, string>>;
export function validateTraitSchema(schema: unknown): Issue[];
export function deriveTraits(schema: TraitSchema, seed: string): { name: string; value: string }[];
export function traitFingerprint(traits: { name: string; value: string }[]): string;
export function combinationSpace(schema: TraitSchema): bigint;
export function validateMarketMappings(document: unknown): Issue[];
export function applyTransform(mapping: MarketMapping, reading: number, state?: { previous?: number; current?: number }): number;
export function evaluateMappings(document: MarketMappingDocument, sensors: Record<string, number>): Record<string, number>;
export function validateCollectionMetadata(document: unknown): Issue[];

// ---- analysis --------------------------------------------------------------------------------
export function analyzeGeneratorSource(path: string, source: string, options?: { entry?: boolean; knownPaths?: Set<string> }): Issue[];
export function stripComments(source: string): string;
export const FORBIDDEN_IDENTIFIERS: Readonly<Record<string, string>>;
export function scanTextForSecrets(path: string, text: string): Issue[];
export function isTextPath(path: string): boolean;
export const SECRET_PATTERNS: readonly { id: string; label: string; re: RegExp }[];
export function inspectRenderOutput(where: string, output: unknown): Issue[];
export function outputFingerprint(output: unknown): string;

// ---- validation, build, projection -----------------------------------------------------------
export function validateBundle(byPath: Map<string, Uint8Array>, options?: ValidateOptions): ValidationResult;
export function validateBundleBytes(bytes: Uint8Array, options?: ValidateOptions): ValidationResult;
export function buildRenderContext(input: { manifest: ProjectManifest | null; marketDocument: MarketMappingDocument | null; seed: string; sensors?: Record<string, number> }): RenderContext;
export function neutralSensors(seed: string): Record<MarketSensor, number>;
export const CHECKS: readonly { id: string; title: string }[];
export function assembleBundle(input: {
  files: Map<string, Uint8Array>;
  config: Record<string, unknown>;
  /** seed -> sha256 of the render, for each of `BINDING_SEEDS`. Supplied by whoever has a sandbox. */
  representativeOutputs?: Record<string, string> | null;
}): {
  bytes: Uint8Array;
  manifest: ProjectManifest;
  checksums: { algorithm: "sha256"; files: Record<string, string>; contentHash: string; projectConfigHash: string; bundleHash: string };
  entries: Map<string, Uint8Array>;
};
export function stableJsonText(value: unknown): string;
export const GENERATED_ENTRIES: readonly string[];
export class BuildError extends Error {}
export function toStudioDraft(validated: ValidationResult, byPath: Map<string, Uint8Array>, options?: { draftId?: string; chainId?: number; updatedAt?: number }): StudioDraftProjection;

// ---- prng and issues -------------------------------------------------------------------------
export function mulberry32(seed: number): () => number;
export function seedStringToNumber(seed: string): number;
export function makeRandom(seed: string): RenderContext["random"];
export function error(code: string, where: string, message: string): Issue;
export function warn(code: string, where: string, message: string): Issue;
export function hasErrors(issues: Issue[]): boolean;
export function summarize(issues: Issue[]): ValidationResult["summary"];
export function sortIssues(issues: Issue[]): Issue[];

// ---- keccak256 and the art binding -------------------------------------------------------------
export function keccak256Bytes(bytes: Uint8Array): Uint8Array;
/** BARE lowercase 64-character hex — no `0x`, so a digest never matches the raw-private-key shape. */
export function keccak256Hex(bytes: Uint8Array): string;
export function keccak256Utf8(text: string): string;
export function prefixed(digest: string): string;
export function isKeccak256Hex(value: unknown): boolean;
export const ZERO_DIGEST: string;

export const BINDING_SEEDS: readonly string[];
export const ART_BINDING_KEYS: readonly string[];
export const ART_CONFIG_SOURCES: readonly ArtConfigSource[];
export const CHAIN_RESOLVED_BINDING_FIELDS: readonly string[];
export function keccakJson(document: unknown): string;
export function computeBundleCommitment(projectConfigHash: string, contentHash: string): string;
export function representativeOutputsCommitment(outputs: Record<string, string>): string | null;
export function computeArtBinding(input: {
  runtime: ArtRuntime;
  templateId?: string | null;
  scriptBytes: Uint8Array;
  generatorFileHashes: Record<string, string>;
  traitSchema: unknown;
  marketMappings: unknown;
  collectionMetadata: unknown;
  templateParams?: unknown;
  representativeOutputs?: Record<string, string> | null;
}): ArtBinding;
export function diffArtBinding(declared: unknown, derived: unknown): string[];
/**
 * Whether the launchpad currently binds and renders a runtime. Never stored in a manifest: it is a
 * property of the protocol today, and folding it into the bundle hash would invalidate a creator's
 * file the moment a runtime is enabled.
 */
export function isRuntimeLaunchable(runtime: string): boolean;
