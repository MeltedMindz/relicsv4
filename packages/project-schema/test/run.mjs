// SPDX-License-Identifier: MIT
// The kit's test suite. Dependency-free: `node --test` is not used so the suite runs identically
// on any Node 20+, and the whole thing is one process with one summary.
//
//   node packages/project-schema/test/run.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  writeContainer,
  readContainer,
  ContainerError,
  canonicalJson,
  safeJsonParse,
  sha256Utf8,
  sha256Hex,
  utf8,
  fromUtf8,
  normalizeEntryPath,
  checkEntryPolicy,
  validateBundleBytes,
  validateBundle,
  validateManifest,
  validateTraitSchema,
  validateMarketMappings,
  validateCollectionMetadata,
  analyzeGeneratorSource,
  scanTextForSecrets,
  inspectRenderOutput,
  applyTransform,
  deriveTraits,
  toStudioDraft,
  computeBundleHash,
  isSchemaCompatible,
  stripComments,
  buildRenderContext,
  LIMITS,
  keccak256Utf8,
  keccak256Hex,
  computeArtBinding,
  computeBundleCommitment,
  representativeOutputsCommitment,
  diffArtBinding,
  isRuntimeLaunchable,
  explainIncompatibility,
  deriveArtConfig,
  encodeArtConfigV1,
  encodeArtConfigV1Checked,
  withArtConfigV1Appendix,
  decodeArtConfigV1,
  validateArtConfigV1,
  isArtConfigV1,
  hashArtConfigV1,
  emptyArtConfigV1,
  visualHashArtConfigV1,
  traitSchemaHashArtConfigV1,
  ACV1_LIMITS,
  ACV1_LAYER_SENSORS,
  ACV1_TRAIT_SOURCES,
  assembleBundle,
  BINDING_SEEDS,
  ART_BINDING_KEYS,
  ART_RUNTIME_IDS,
  APPROVED_ART_RUNTIMES,
  LAUNCHABLE_ART_RUNTIMES,
  CHAIN_RESOLVED_BINDING_FIELDS,
  SCHEMA_VERSION,
  CREATOR_KIT_VERSION,
  BPS_DENOMINATOR,
  CREATOR_SHARE_BPS,
  PLATFORM_SHARE_BPS,
  RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE,
  PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE,
  NOMINAL_ALLOCATION_BPS,
  NOMINAL_ALLOCATION_PERCENT,
  PLATFORM_SUBDIVISION_PERCENT,
  FEE_SPLIT_BPS,
  BUYBACK_MECHANISM,
  ENTOMBMENT_ADDRESS,
  BUYBACK_DISCLOSURE,
  BUYBACK_DISCLOSURE_SHORT,
  BUYBACK_TECHNICAL_NOTE,
  PLATFORM_SETTLEMENT_INVARIANT,
  CREATOR_FEE_ASSET_MODES,
  PLATFORM_SETTLEMENT_STATUSES,
  isPlatformSettlementStatus,
  hasSettledPlatformWeth,
  allocateSettledPlatformWeth,
  bpsToPercentString,
  PLATFORM_ENTITLEMENT_MODEL,
  QUOTE_ADMISSION_REQUIRES_PROVEN_WETH_ROUTE,
  ALLOCATED_PLATFORM_STATUSES,
  BUYBACK_WETH_SETTLED_STATUSES,
  hasAllocatedPlatformEntitlement,
  hasSettledBuybackWeth,
  allocatePlatformEntitlement,
  RETIRED_ALLOCATION_CLAIMS,
  normalizeForClaimScan,
  scanTextForRetiredClaims,
  hasSupersessionBanner,
  isSuppressedMention,
  DETECTOR_SELF_REFERENCE_MARKER,
  CONDITIONALLY_TRUE_MARKER,
  ONCHAIN_REPORTABLE_SETTLEMENT_STATUSES,
  isOffchainDerivedStatus,
  DRAFT_MAGIC,
  DRAFT_EXTENSION,
  BUNDLE_STATUSES,
  magicForStatus,
  BUNDLE_MAGIC,
  SYMBOL_RE,
  CHAIN_PROFILES,
  CHAIN_LABELS,
  SUPPORTED_CHAIN_IDS,
  chainProfile,
  wrappedNativeSymbolFor,
  nativeSymbolFor,
  creatorEarningsModesFor,
  enforcedEarningsAvailableOn,
  BURN_POLICIES,
  BURN_POLICY_TO_INDEX,
  DEFAULT_BURN_POLICY,
  BURN_POLICY_CARDS,
  BURN_POLICY_IMMUTABILITY_ACK,
  RELICS_BURN_CONTRAST_COPY,
  burnPolicyAllowsBurning,
  ANTI_SNIPE_WIRE_VALUES,
  ANTI_SNIPE_ELECTIONS,
  ANTI_SNIPE_MODE_TO_INDEX,
  ANTI_SNIPE_MODE_COPY,
  ANTI_SNIPE_NOT_SYBIL_PROOF_COPY,
  LAUNCH_MODES,
  CURVE_PRESETS,
  LAUNCHABLE_MODES,
  LAUNCH_MODE_UNAVAILABLE_REASON,
  isLaunchModeAvailable,
  REFUSED_MANIFEST_KEYS,
  QUOTE_ASSET_KINDS,
  DEPRECATED_QUOTE_ASSET_KIND_ALIASES,
  canonicalQuoteAssetKind,
  bindCanonicalEconomics,
  validateReviewedProtocolTemplate,
  registerReviewedProtocolTemplate,
  clearReviewedProtocolTemplates,
  reviewedProtocolTemplateIds,
  reviewedProtocolTemplate,
  reviewedTemplateSupplyPin,
  REVIEWED_PROTOCOL_TEMPLATE_IDS,
  PROTOCOL_TEMPLATE_KEYS,
  PLATFORM_GENERATION_IDS,
  PLATFORM_GENERATIONS,
  DEPLOYMENTS_BY_GENERATION,
  CURRENT_DEPLOYED_GENERATION,
  KNOWN_DEPLOYMENT_CHAIN_IDS,
  deploymentsFor,
  deployedChainIds,
  platformGeneration,
  platformDeployment,
  launchAvailability,
  launchAccessFor,
  liveChainIds,
  acceptsPublicLaunches,
} from "../index.js";
import { createVmModule, renderSeedsIsolated, makeReplayEvaluator, toRunnableScript } from "../../creator-cli/src/sandbox.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "../fixtures");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, contains, message) {
  let threw = null;
  try {
    fn();
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  assert(threw !== null, `${message}: nothing was thrown`);
  if (contains) assert(threw.toLowerCase().includes(contains.toLowerCase()), `${message}: expected "${contains}", got "${threw}"`);
}

// ---------------------------------------------------- reviewed protocol templates (MECHANISM)
//
// The schema ships the mechanism and NO instance. A concrete reviewed template is one launchpad
// operator's reviewed commercial configuration — publishing it here would publish their launch
// strategy and would make one product's numbers look like part of the format. So everything below
// registers a NEUTRAL, invented template, exercises the mechanism against it, and clears the
// registry again. Nothing in these tests is any real project's economics.

const EXAMPLE_TEMPLATE_ID = "EXAMPLE_REVIEWED_TEMPLATE_V1";

/** An invented canonical economics document. Illustrative only. */
function exampleEconomics() {
  return {
    schemaVersion: 1,
    launchpadTemplateId: EXAMPLE_TEMPLATE_ID,
    erc20GenesisSupplyWhole: 1000000,
    erc20Decimals: 18,
    erc721MaxSupply: 1000,
    genesisTokensPerPossibleNftWhole: 1000,
    rewardDistributionMode: "IMMEDIATE_CLAIMABLE",
  };
}

const EXAMPLE_ECONOMICS_SHA256 = sha256Utf8(canonicalJson(exampleEconomics()));

const EXAMPLE_SPEC = Object.freeze({
  id: EXAMPLE_TEMPLATE_ID,
  economicsSha256: EXAMPLE_ECONOMICS_SHA256,
  supply: Object.freeze({ totalSupplyWhole: "1000000", artworkSupply: "1000", genesisTokensPerPossibleNftWhole: "1000" }),
});

/** Run `fn` with exactly `EXAMPLE_SPEC` registered, and leave the registry empty afterwards. */
function withExampleTemplate(fn, spec = EXAMPLE_SPEC) {
  clearReviewedProtocolTemplates();
  registerReviewedProtocolTemplate({ ...spec });
  try {
    return fn();
  } finally {
    clearReviewedProtocolTemplates();
  }
}

test("the published schema registers NO reviewed protocol template", () => {
  clearReviewedProtocolTemplates();
  assert(REVIEWED_PROTOCOL_TEMPLATE_IDS.length === 0, "the format ships a concrete product template");
  assert(reviewedProtocolTemplateIds().length === 0, "the snapshot accessor disagrees with the live binding");
  assert(reviewedProtocolTemplate(EXAMPLE_TEMPLATE_ID) === null, "an unregistered id resolved to a spec");
  assert(reviewedTemplateSupplyPin(EXAMPLE_TEMPLATE_ID) === null, "an unregistered id pinned a supply");
});

test("with nothing registered, ANY protocolTemplate block is refused by name", () => {
  clearReviewedProtocolTemplates();
  const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics());
  const issues = validateReviewedProtocolTemplate(binding);
  assert(issues.length === 1, `expected one refusal, got ${issues.map((i) => i.code).join(", ")}`);
  assert(issues[0].code === "PROTOCOL_TEMPLATE_ID", "the refusal must be about the id, not the economics");
  assert(/implements no reviewed protocol template/.test(issues[0].message), "the refusal must say WHY");
  assert(/without the protocolTemplate block/.test(issues[0].message), "the refusal must name the fix");
});

test("registering is the ONLY way a template becomes honourable, and the registry is data", () => {
  clearReviewedProtocolTemplates();
  registerReviewedProtocolTemplate({ id: EXAMPLE_TEMPLATE_ID, economicsSha256: EXAMPLE_ECONOMICS_SHA256 });
  assert(REVIEWED_PROTOCOL_TEMPLATE_IDS.includes(EXAMPLE_TEMPLATE_ID), "the live binding did not update after registration");
  assert(reviewedProtocolTemplate(EXAMPLE_TEMPLATE_ID)?.economicsSha256 === EXAMPLE_ECONOMICS_SHA256, "the spec was not stored");

  // Idempotent for an identical spec; a CONFLICTING re-registration throws rather than silently
  // replacing a reviewed artifact.
  registerReviewedProtocolTemplate({ id: EXAMPLE_TEMPLATE_ID, economicsSha256: EXAMPLE_ECONOMICS_SHA256 });
  assertThrows(() => registerReviewedProtocolTemplate({ id: EXAMPLE_TEMPLATE_ID, economicsSha256: "b".repeat(64) }), "already registered", "a conflicting re-registration was accepted");

  clearReviewedProtocolTemplates();
  assert(REVIEWED_PROTOCOL_TEMPLATE_IDS.length === 0, "clearing left the registry populated");
});

test("registration refuses a malformed spec rather than storing it", () => {
  clearReviewedProtocolTemplates();
  assertThrows(() => registerReviewedProtocolTemplate(null), "must be an object", "null was registered");
  assertThrows(() => registerReviewedProtocolTemplate({ id: "lower_case_v1" }), "id must match", "a non-id was registered");
  assertThrows(() => registerReviewedProtocolTemplate({ id: EXAMPLE_TEMPLATE_ID, economicsSha256: "0x" + "a".repeat(64) }), "64 lowercase hex", "a prefixed digest was registered");
  assertThrows(() => registerReviewedProtocolTemplate({ id: EXAMPLE_TEMPLATE_ID, supply: { totalSupplyWhole: "1e6", artworkSupply: "1", genesisTokensPerPossibleNftWhole: "1" } }), "whole-number decimal", "scientific notation was registered");
  assertThrows(() => registerReviewedProtocolTemplate({ id: EXAMPLE_TEMPLATE_ID, nonsense: 1 }), "unknown spec key", "an unknown spec key was registered");
  assert(REVIEWED_PROTOCOL_TEMPLATE_IDS.length === 0, "a refused registration still mutated the registry");
});

test("a registered template binds its artifact and its hash", () => {
  withExampleTemplate(() => {
    const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics());
    assert(binding.id === EXAMPLE_TEMPLATE_ID, "wrong template id");
    assert(/^[0-9a-f]{64}$/.test(binding.economicsSha256), "canonical economics hash is not sha256");
    assert(validateReviewedProtocolTemplate(binding).length === 0, "a correctly bound reviewed template was rejected");
  });
});

test("the block is a CLOSED key space", () => {
  withExampleTemplate(() => {
    assert(PROTOCOL_TEMPLATE_KEYS.join(",") === "id,canonicalEconomics,economicsSha256", "the key space drifted");
    const binding = { ...bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics()), extra: 1 };
    const codes = validateReviewedProtocolTemplate(binding).map((i) => i.code);
    assert(codes.includes("PROTOCOL_TEMPLATE_UNKNOWN_KEY"), "an unknown key was ignored instead of refused");
  });
});

test("a lying economicsSha256 is refused", () => {
  withExampleTemplate(() => {
    const binding = { id: EXAMPLE_TEMPLATE_ID, canonicalEconomics: exampleEconomics(), economicsSha256: "0".repeat(64) };
    const codes = validateReviewedProtocolTemplate(binding).map((i) => i.code);
    assert(codes.includes("PROTOCOL_TEMPLATE_ECONOMICS_HASH"), "a false economics hash was accepted");
  });
});

test("SELF-CONSISTENT IS NOT REVIEWED: an edited artifact is refused against the pin", () => {
  withExampleTemplate(() => {
    // `bindCanonicalEconomics` makes any document internally consistent, which is exactly why
    // consistency cannot be the test for "did anyone review these numbers".
    const edited = { ...exampleEconomics(), erc721MaxSupply: 2000 };
    const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, edited);
    const codes = validateReviewedProtocolTemplate(binding).map((i) => i.code);
    assert(!codes.includes("PROTOCOL_TEMPLATE_ECONOMICS_HASH"), "the binding was not self-consistent, so this proves nothing");
    assert(codes.includes("PROTOCOL_TEMPLATE_ECONOMICS_PIN"), "an unreviewed artifact passed the pin");
  });
});

test("the artifact must name its own template", () => {
  withExampleTemplate(() => {
    const economics = { ...exampleEconomics(), launchpadTemplateId: "SOMETHING_ELSE_V1" };
    const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, economics);
    const codes = validateReviewedProtocolTemplate(binding).map((i) => i.code);
    assert(codes.includes("PROTOCOL_TEMPLATE_ID_MISMATCH"), "an artifact belonging to another template was accepted");
  });
});

test("an operator's own instance rules run, and their failures are reported", () => {
  const spec = {
    id: EXAMPLE_TEMPLATE_ID,
    verify: (economics) => (economics.rewardDistributionMode === "IMMEDIATE_CLAIMABLE" ? [] : [{ severity: "error", code: "OPERATOR_REWARD_TIMING", where: "x", message: "timed rewards are not reviewed" }]),
  };
  withExampleTemplate(() => {
    const ok = validateReviewedProtocolTemplate(bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics()));
    assert(ok.length === 0, `the operator rule rejected its own artifact: ${ok.map((i) => i.code).join(", ")}`);
    const timed = { ...exampleEconomics(), rewardDistributionMode: "VESTED" };
    const codes = validateReviewedProtocolTemplate(bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, timed)).map((i) => i.code);
    assert(codes.includes("OPERATOR_REWARD_TIMING"), "the operator's own rule did not run");
  }, spec);
});

// ------------------------------------------------------- launch modes: known is not selectable
//
// A creator could complete the entire documented path with `FIXED_PRICE_SALE_TO_V4` -- validate
// exit 0, export exit 0, "READY TO UPLOAD" -- and hold a bundle electing a launch method the
// deployed sale contract refuses by name for every caller. Nothing warned them. The refusal lives
// in the format now, so it arrives at the first command instead of the last.

test("a withdrawn launch mode is refused BY NAME, with the reason and the alternatives", () => {
  const market = {
    startingPreset: "MID",
    launchMode: "FIXED_PRICE_SALE_TO_V4",
    mappingCount: 0,
    sale: { allocationBps: 2500, durationDays: 7, minRaiseEth: "0" },
  };
  const issues = validateManifest({ market }).filter((i) => i.code === "MARKET_LAUNCH_MODE");
  assert(issues.length === 1, `a withdrawn launch mode was accepted (issues: ${issues.length})`);
  const message = issues[0].message;
  assert(message.includes("FIXED_PRICE_SALE_TO_V4"), "the refusal does not name the mode it refused");
  assert(message.includes("per-buyer cap"), "the refusal does not say WHY, so it reads as a bug in the tool");
  for (const mode of LAUNCHABLE_MODES) {
    assert(message.includes(mode), `the refusal does not offer ${mode} as an alternative`);
  }
});

test("the two offered launch modes are still accepted, so the refusal is not a blanket one", () => {
  for (const mode of LAUNCHABLE_MODES) {
    const market = { startingPreset: "MID", launchMode: mode, mappingCount: 0 };
    if (mode === "BONDING_CURVE_SALE_TO_V4") {
      market.sale = { allocationBps: 2500, durationDays: 7, minRaiseEth: "0", curvePresetId: CURVE_PRESETS[0] };
    }
    const codes = validateManifest({ market })
      .filter((i) => i.code === "MARKET_LAUNCH_MODE")
      .map((i) => i.message);
    assert(codes.length === 0, `${mode} is offered and was refused: ${codes.join(" | ")}`);
  }
});

test("availability is DERIVED from one declaration, so a surface cannot offer a withdrawn mode", () => {
  // The wire vocabulary keeps every member -- removing one renumbers the on-chain enum and changes
  // what existing bundles mean. So membership and availability must be separate questions, and
  // LAUNCHABLE_MODES must be derived rather than typed a second time.
  assert(LAUNCH_MODES.includes("FIXED_PRICE_SALE_TO_V4"), "the wire vocabulary dropped a member; existing bundles would be renumbered");
  assert(!LAUNCHABLE_MODES.includes("FIXED_PRICE_SALE_TO_V4"), "a withdrawn mode is in the derived selectable list");
  assert(!isLaunchModeAvailable("FIXED_PRICE_SALE_TO_V4"), "the availability predicate disagrees with the derived list");
  for (const mode of LAUNCHABLE_MODES) assert(isLaunchModeAvailable(mode), `${mode} is derived launchable but the predicate says otherwise`);
  assert(typeof LAUNCH_MODE_UNAVAILABLE_REASON.FIXED_PRICE_SALE_TO_V4 === "string", "a mode is unavailable with no stated reason");
});

test("manifest: the supply KEY SPACE follows the block's presence, not any particular id", () => {
  withExampleTemplate(() => {
    const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics());
    const issues = validateManifest({
      protocolTemplate: binding,
      supply: { totalSupplyWhole: "1000000", artworkSupply: "1000", genesisTokensPerPossibleNftWhole: "1000", burnPolicy: "HOLDER_AND_ALLOWANCE_BURN" },
    });
    const relevant = issues.filter((i) => i.code.startsWith("PROTOCOL_TEMPLATE") || i.code.startsWith("SUPPLY"));
    assert(relevant.length === 0, `reviewed supply shape failed: ${relevant.map((i) => i.code).join(", ")}`);

    // `backingModel` belongs to the ordinary shape and is refused inside the template shape.
    const wrongShape = validateManifest({
      protocolTemplate: binding,
      supply: { totalSupplyWhole: "1000000", artworkSupply: "1000", backingModel: "PARTIAL", tokensPerArtwork: "1000" },
    }).map((i) => i.code);
    assert(wrongShape.includes("MANIFEST_UNKNOWN_KEY") || wrongShape.some((c) => c.startsWith("SUPPLY")), `the ordinary supply shape was accepted under a reviewed template: ${wrongShape.join(", ")}`);
  });
});

test("manifest: the genesis ratio must be ARITHMETIC, not merely declared", () => {
  withExampleTemplate(() => {
    const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics());
    const codes = validateManifest({
      protocolTemplate: binding,
      supply: { totalSupplyWhole: "1000000", artworkSupply: "1000", genesisTokensPerPossibleNftWhole: "999" },
    }).map((i) => i.code);
    assert(codes.includes("SUPPLY_GENESIS_RATIO"), "a ratio that does not follow from the supplies was accepted");
  });
});

test("manifest: a pinned supply is enforced; an unpinned template keeps only the structural rule", () => {
  // Pinned: the numbers are the operator's, so a different supply is refused.
  withExampleTemplate(() => {
    const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics());
    const codes = validateManifest({
      protocolTemplate: binding,
      supply: { totalSupplyWhole: "2000000", artworkSupply: "1000", genesisTokensPerPossibleNftWhole: "2000" },
    }).map((i) => i.code);
    assert(codes.includes("SUPPLY_REVIEWED_TEMPLATE_MISMATCH"), "a supply the operator did not review was accepted");
  });

  // Unpinned: arithmetic still holds, but the format invents no numbers of its own.
  withExampleTemplate(
    () => {
      const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics());
      const codes = validateManifest({
        protocolTemplate: binding,
        supply: { totalSupplyWhole: "2000000", artworkSupply: "1000", genesisTokensPerPossibleNftWhole: "2000" },
      }).map((i) => i.code);
      assert(!codes.includes("SUPPLY_REVIEWED_TEMPLATE_MISMATCH"), "the format enforced a supply nobody pinned");
    },
    { id: EXAMPLE_TEMPLATE_ID, economicsSha256: EXAMPLE_ECONOMICS_SHA256 },
  );
});

test("a reviewed template projects without inventing artwork backing", () => {
  withExampleTemplate(() => {
    const binding = bindCanonicalEconomics(EXAMPLE_TEMPLATE_ID, exampleEconomics());
    const projection = toStudioDraft(
      {
        manifest: {
          schemaVersion: "3.3.0",
          creatorKitVersion: "3.12.0",
          runtimeVersion: "relics-art-runtime/1",
          protocolReleaseCompatibility: "v4-art-launchpad/g-1.2",
          protocolTemplate: binding,
          project: { name: "Example", symbol: "EXAMPLE", description: "reviewed", license: "Proprietary" },
          supply: {
            totalSupplyWhole: "1000000",
            artworkSupply: "1000",
            genesisTokensPerPossibleNftWhole: "1000",
            burnPolicy: "HOLDER_AND_ALLOWANCE_BURN",
          },
          art: { runtime: "JAVASCRIPT", seed: "1", templateId: null },
          market: { startingPreset: "MID", launchMode: "INSTANT_V4", mappingCount: 0 },
          earnings: { mode: "SOLO", creatorRecipient: "0x000000000000000000000000000000000000dEaD", collaborators: [] },
          chains: { requested: [4663] },
          hashes: { generator: "a", script: "b", traitSchema: "c", marketMapping: "d", metadata: "e", media: {} },
        },
        hashes: {},
        traitSchema: { dimensions: [] },
        marketMappings: { mappings: [] },
        collectionMetadata: {},
      },
      new Map([["generator/generate.js", utf8("export function render() {}")]]),
    );

    assert(!("backingModel" in projection.draft.collection), "a reviewed template gained a backing model");
    assert(projection.draft.collection.genesisTokensPerPossibleNftWhole === "1000", "the genesis ratio was not projected");
    assert(projection.provenance.protocolTemplate?.id === EXAMPLE_TEMPLATE_ID, "the reviewed template binding was dropped");
  });
});

// --------------------------------------------------- platform generations (deployment honesty)
//
// The failure these guard against is not a wrong address. It is a RIGHT address published under the
// wrong generation, or a generation that is silently absent — both of which a reader has no way to
// detect, because nothing about them looks wrong.

const ADDRESS_SHAPED = /^0x[0-9a-fA-F]{40}$/;

test("every published contract address names the generation it belongs to", () => {
  for (const generation of PLATFORM_GENERATION_IDS) {
    for (const [chainId, entry] of Object.entries(deploymentsFor(generation))) {
      if (entry === null) continue;
      assert(entry.generation === generation, `chain ${chainId} publishes ${entry.generation ?? "an unlabelled"} addresses inside the ${generation} table`);
      assert(entry.chainId === Number(chainId), `chain ${chainId}'s record says chainId ${entry.chainId}`);
      for (const [name, address] of Object.entries(entry.contracts)) {
        assert(ADDRESS_SHAPED.test(address), `${generation}/${chainId}/${name} is not an address: ${address}`);
      }
    }
  }
});

test("AN UNDEPLOYED GENERATION PUBLISHES NO ADDRESS", () => {
  // The whole point of the generational split. An undeployed generation's addresses are derivable
  // today and move with every source change, so a copyable one in a creator kit is worse than none:
  // it is the contract a creator would target and never reach.
  for (const generation of PLATFORM_GENERATION_IDS) {
    const record = PLATFORM_GENERATIONS[generation];
    if (record.status !== "NOT_DEPLOYED") continue;
    assert(record.publishesAddresses === false, `${generation} is NOT_DEPLOYED but claims to publish addresses`);
    for (const [chainId, entry] of Object.entries(deploymentsFor(generation))) {
      assert(entry === null, `${generation} is not deployed, yet chain ${chainId} carries an address`);
    }
    assert(deployedChainIds(generation).length === 0, `${generation} is not deployed, yet reports deployed chains`);
    assert(liveChainIds(generation).length === 0, `${generation} is not deployed, yet reports live chains`);
  }
});

test("publishesAddresses:false MEANS no address, deployed or not", () => {
  // The guard above only bites on NOT_DEPLOYED. RC6 is deployed and still publishes nothing, so
  // without this the moment a generation flips to DEPLOYED nothing checks its address table again.
  for (const generation of PLATFORM_GENERATION_IDS) {
    if (PLATFORM_GENERATIONS[generation].publishesAddresses) continue;
    for (const [chainId, entry] of Object.entries(deploymentsFor(generation))) {
      assert(entry === null, `${generation} publishes no addresses, yet chain ${chainId} carries one`);
    }
    assert(
      typeof PLATFORM_GENERATIONS[generation].addressPublication === "string",
      `${generation} publishes no address and does not say why; an unexplained blank reads as "nothing is deployed"`,
    );
  }
});

test("LAUNCH ACCESS IS A CHAIN FACT, NOT AN ADDRESS-TABLE SIDE EFFECT", () => {
  // The bug this exists for: RC6 went live and PUBLIC on chain 4663 while its address table stayed
  // null, and every surface that derived access from the table reported the chain as closed.
  for (const generation of PLATFORM_GENERATION_IDS) {
    const g = PLATFORM_GENERATIONS[generation];
    for (const chainId of KNOWN_DEPLOYMENT_CHAIN_IDS) {
      const access = launchAccessFor(chainId, generation);
      assert(access === null || access === "PREPARED" || access === "PUBLIC", `${generation}/${chainId}: unusable launch access ${access}`);

      const entry = platformDeployment(chainId, generation);
      if (entry !== null) {
        assert(access === entry.launchAccess, `${generation}/${chainId}: a published record's own launchAccess was overridden`);
      }
      // A live chain must never be describable as undeployed, and vice versa.
      const line = launchAvailability(chainId, generation);
      if (access === null) assert(/is not deployed/.test(line), `${generation}/${chainId}: "${line}" does not say it is undeployed`);
      else assert(!/is not deployed/.test(line), `${generation}/${chainId}: "${line}" calls a live chain undeployed`);
      assert(acceptsPublicLaunches(chainId, generation) === (access === "PUBLIC"), `${generation}/${chainId}: acceptsPublicLaunches disagrees with launchAccessFor`);
    }
    // Every live chain is named, whether or not an address is printed for it.
    for (const chainId of liveChainIds(generation)) {
      assert(launchAccessFor(chainId, generation) !== null, `${generation}/${chainId} is listed live with no launch access`);
    }
    if (g.status === "NOT_DEPLOYED") assert(liveChainIds(generation).length === 0, `${generation} is NOT_DEPLOYED yet is live somewhere`);
    else assert(liveChainIds(generation).length > 0, `${generation} is DEPLOYED yet is live nowhere`);
  }
});

test("an unknown chain REFUSES a launch-access answer rather than defaulting to closed", () => {
  // "closed" is the plausible default and the dangerous one: it is indistinguishable from a real
  // answer, so a typo'd chain id would read as a considered no.
  assertThrows(() => launchAccessFor(999999, "RC6"), "unknown chain", "an unknown chain resolved to a launch access");
  assertThrows(() => acceptsPublicLaunches(999999, "RC6"), "unknown chain", "an unknown chain resolved to a launchability");
});

test("NO CHAIN IS OMITTED: every generation states every known chain, deployed or not", () => {
  // Absence is what gets misread. A chain a generation is not on must be a stated null, so the CLI
  // can print a row that says so rather than leaving the reader to infer it from a missing line.
  for (const generation of PLATFORM_GENERATION_IDS) {
    const table = deploymentsFor(generation);
    for (const chainId of KNOWN_DEPLOYMENT_CHAIN_IDS) {
      assert(Object.hasOwn(table, chainId), `${generation} says nothing about chain ${chainId}; silence reads as "fine"`);
    }
  }
});

test("the current generation is the newest DEPLOYED one, not the newest that exists", () => {
  assert(CURRENT_DEPLOYED_GENERATION !== null, "no generation is deployed at all");
  assert(PLATFORM_GENERATIONS[CURRENT_DEPLOYED_GENERATION].status === "DEPLOYED", "the current generation is not deployed");
  const newest = PLATFORM_GENERATION_IDS.at(-1);
  if (PLATFORM_GENERATIONS[newest].status !== "DEPLOYED") {
    assert(CURRENT_DEPLOYED_GENERATION !== newest, `the newest generation ${newest} is undeployed but is being used as current`);
  }
});

test("availability strings always name a generation", () => {
  for (const generation of PLATFORM_GENERATION_IDS) {
    for (const chainId of KNOWN_DEPLOYMENT_CHAIN_IDS) {
      const line = launchAvailability(chainId, generation);
      assert(line.includes(generation), `"${line}" does not say which generation it is about`);
    }
  }
});

test("an unknown generation REFUSES rather than falling back to the current one", () => {
  assertThrows(() => deploymentsFor("RC7"), "unknown generation", "an unknown generation resolved to a table");
  assertThrows(() => platformGeneration("RC7"), "unknown generation", "an unknown generation resolved to a record");
  assertThrows(() => platformDeployment(1, "RC7"), "unknown generation", "an unknown generation resolved to a deployment");
  assertThrows(() => platformDeployment(999999, "RC5"), "unknown chain", "an unknown chain resolved to a deployment");
});

test("the generation assertions FAIL under mutation", () => {
  // Each mutation is a plausible mistake. A survivor means the matching assertion is decorative.
  //
  // THE MUTATIONS ARE WRITTEN AGAINST THE LIVE GENERATION, NOT THE WITHDRAWN ONE. They used to
  // spread `t.RC5[1]`, which was a populated record then and is `null` now — every one of them
  // would still "be rejected", by a TypeError on `null.contracts` rather than by the assertion
  // under test. A mutation that dies before it reaches the property it is probing proves nothing,
  // and it reads exactly like one that works.
  const mutations = [
    ["an RC6 address copied into the superseded RC5 table", (t) => { t.RC5[1] = { ...t.RC6[1] }; }],
    ["an RC5 record smuggled into the RC6 table under an RC5 label", (t) => { t.RC6[1] = { ...t.RC6[1], generation: "RC5" }; }],
    ["a chain quietly dropped from a generation", (t) => { delete t.RC6[56]; }],
    ["a contract address replaced with a placeholder string", (t) => { t.RC6[1] = { ...t.RC6[1], contracts: { ...t.RC6[1].contracts, launchpadFactory: "TBD" } }; }],
    // The withdrawal itself. RC5 is DEPLOYED, so the deployed/undeployed rule does not bite on it;
    // only the publication rule does, and without this the addresses could quietly come back.
    ["a withdrawn generation's address table repopulated", (t) => { t.RC5[4663] = { ...t.RC6[4663], generation: "RC5" }; }],
  ];
  for (const [name, mutate] of mutations) {
    const table = { RC5: { ...DEPLOYMENTS_BY_GENERATION.RC5 }, RC6: { ...DEPLOYMENTS_BY_GENERATION.RC6 } };
    mutate(table);
    let rejected = false;
    try {
      assertGenerationTables(table);
    } catch {
      rejected = true;
    }
    assert(rejected, `MUTATION SURVIVED: "${name}" — the assertions accept it, so they are not testing it`);
  }
  assertGenerationTables({ RC5: DEPLOYMENTS_BY_GENERATION.RC5, RC6: DEPLOYMENTS_BY_GENERATION.RC6 });
});

/** The assertions above, factored out so the mutation test can run them against a lie. */
function assertGenerationTables(tables) {
  const must = (cond, why) => {
    if (!cond) throw new Error(why);
  };
  const chains = [...new Set(Object.values(tables).flatMap((t) => Object.keys(t).map(Number)))];
  for (const [generation, table] of Object.entries(tables)) {
    const deployed = PLATFORM_GENERATIONS[generation]?.status === "DEPLOYED";
    const publishes = PLATFORM_GENERATIONS[generation]?.publishesAddresses === true;
    for (const chainId of chains) must(Object.hasOwn(table, chainId), `${generation} says nothing about chain ${chainId}`);
    for (const [chainId, entry] of Object.entries(table)) {
      if (entry === null) continue;
      must(deployed, `${generation} is not deployed, yet chain ${chainId} carries an address`);
      // Withdrawal is a publication decision and is enforced HERE too, not only in the standalone
      // test above: RC5 is DEPLOYED, so the rule on the line before cannot see a withdrawn
      // generation's addresses coming back.
      must(publishes, `${generation} publishes no addresses, yet chain ${chainId} carries one`);
      must(entry.generation === generation, `chain ${chainId} carries ${entry.generation} addresses inside the ${generation} table`);
      for (const [name, address] of Object.entries(entry.contracts)) must(ADDRESS_SHAPED.test(address), `${generation}/${chainId}/${name} is not an address`);
    }
  }
}

// ---------------------------------------------------------------- canonical json + hashing

test("canonicalJson sorts keys and ignores insertion order", () => {
  assert(canonicalJson({ b: 1, a: 2 }) === '{"a":2,"b":1}', "keys are not sorted");
  assert(canonicalJson({ a: 2, b: 1 }) === canonicalJson({ b: 1, a: 2 }), "insertion order changed the output");
});

test("canonicalJson refuses values with no canonical form", () => {
  assertThrows(() => canonicalJson({ x: NaN }), "non-finite", "NaN was serialized");
  assertThrows(() => canonicalJson({ x: 1n }), "bigint", "bigint was serialized");
  assertThrows(() => canonicalJson({ x: () => {} }), "function", "a function was serialized");
});

test("safeJsonParse drops prototype-polluting keys", () => {
  const parsed = safeJsonParse('{"__proto__":{"polluted":true},"constructor":{"x":1},"ok":1}');
  assert(parsed.ok === 1, "the safe key was lost");
  assert(!("__proto__" in parsed) || parsed.__proto__ === undefined, "__proto__ survived");
  assert({}.polluted === undefined, "Object.prototype was polluted");
  assert(Object.getPrototypeOf(parsed) === null, "the parsed object kept a prototype");
});

test("safeJsonParse bounds depth and node count", () => {
  const deep = "[".repeat(80) + "]".repeat(80);
  assertThrows(() => safeJsonParse(deep), "", "an 80-deep document was accepted");
  assertThrows(() => safeJsonParse("{", {}), "malformed", "malformed JSON was accepted");
});

test("sha256 matches the published vectors", () => {
  assert(sha256Utf8("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "empty-string digest is wrong");
  assert(sha256Utf8("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "abc digest is wrong");
});

test("bundleHash is a pure function of its two inputs", () => {
  const a = computeBundleHash("a".repeat(64), "b".repeat(64));
  const b = computeBundleHash("a".repeat(64), "b".repeat(64));
  const c = computeBundleHash("a".repeat(64), "c".repeat(64));
  assert(a === b, "the same inputs gave different hashes");
  assert(a !== c, "different content gave the same hash");
});

// ---------------------------------------------------------------- keccak256 + art binding

test("keccak256 matches the EVM, not SHA3", () => {
  // The empty-input vector is the one that separates original Keccak (0x01 padding) from NIST
  // SHA3-256 (0x06). Getting this wrong would mean printing hashes no chain ever agrees with.
  assert(keccak256Utf8("") === "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470", "empty-string keccak is wrong");
  assert(keccak256Utf8("abc") === "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45", "abc keccak is wrong");
  assert(
    keccak256Utf8("The quick brown fox jumps over the lazy dog") === "4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15",
    "keccak of the pangram is wrong",
  );
});

test("keccak256 is correct across the rate-block boundary", () => {
  // 136 bytes is exactly one rate block, so 135/136/137 exercise the three padding paths. Values
  // cross-checked against `cast keccak`.
  const of = (n) => keccak256Hex(new Uint8Array(n).fill(0x61));
  assert(of(135) === "34367dc248bbd832f4e3e69dfaac2f92638bd0bbd18f2912ba4ef454919cf446", "135-byte keccak is wrong");
  assert(of(136) === "a6c4d403279fe3e0af03729caada8374b5ca54d8065329a3ebcaeb4b60aa386e", "136-byte keccak is wrong");
  assert(of(137) === "d869f639c7046b4929fc92a4d988a8b22c55fbadb802c0c66ebcd484f1915f39", "137-byte keccak is wrong");
});

test("no digest the format writes can be mistaken for a private key", () => {
  // `0x` + 64 hex is the raw secp256k1 key shape the secret scanner refuses. Every digest the
  // manifest carries is stored bare, so the scanner never has to be told to look away.
  const digests = [keccak256Utf8("anything"), computeBundleCommitment("a".repeat(64), "b".repeat(64))];
  for (const digest of digests) {
    assert(/^[0-9a-f]{64}$/.test(digest), `a manifest digest is not bare lowercase hex: ${digest}`);
    assert(scanTextForSecrets("relics.project.json", `"hash": "${digest}"`).length === 0, "a digest tripped the secret scanner");
  }
});

test("a bundle can never state a chain fact", () => {
  const binding = computeArtBinding({
    runtime: "JAVASCRIPT",
    scriptBytes: utf8("export function render(){return '<svg></svg>';}"),
    generatorFileHashes: {},
    traitSchema: null,
    marketMappings: null,
    collectionMetadata: null,
  });
  for (const field of CHAIN_RESOLVED_BINDING_FIELDS) {
    assert(field in binding, `${field} must be present so its absence is never mistaken for permission`);
    assert(binding[field] === null, `${field} must be null in a derived binding`);
  }
});

test("the art binding is a pure function of the bundle's bytes", () => {
  const input = {
    runtime: "JAVASCRIPT",
    scriptBytes: utf8("export function render(){return '<svg><rect/></svg>';}"),
    generatorFileHashes: { "generator/generate.js": "a".repeat(64) },
    traitSchema: { version: 1, dimensions: [] },
    marketMappings: { version: 1, mappings: [] },
    collectionMetadata: { version: 1, name: "X" },
  };
  const a = computeArtBinding(input);
  const b = computeArtBinding(input);
  assert(diffArtBinding(a, b).length === 0, "the same bytes produced two different bindings");

  const changed = computeArtBinding({ ...input, scriptBytes: utf8("export function render(){return '<svg><circle/></svg>';}") });
  assert(diffArtBinding(a, changed).includes("artConfigHash"), "changing the generator did not move the art config hash");
});

test("artConfigHash is exactly what the factory checks for a JavaScript launch", () => {
  // LaunchpadFactory._storeArt: `if (keccak256(p.artConfig) != p.artScriptHash) revert BadArtHash()`
  // and for the JAVASCRIPT runtime artConfig IS the generator entry file, byte for byte.
  const script = utf8("export function render(){return '<svg><rect width=\"1\" height=\"1\"/></svg>';}");
  const binding = computeArtBinding({
    runtime: "JAVASCRIPT",
    scriptBytes: script,
    generatorFileHashes: {},
    traitSchema: null,
    marketMappings: null,
    collectionMetadata: null,
  });
  assert(binding.artConfigHash === keccak256Hex(script), "artConfigHash is not keccak256 of the script bytes");
  assert(binding.artConfigBytes === script.length, "artConfigBytes does not match the script length");
});

test("a Solidity-SVG binding states the config hash the launch will check", () => {
  // Schema 2 left this null and said so honestly: no published parameter layout existed, so the
  // kit refused to state a value it could not derive. ACV1 IS that layout, so the refusal expired
  // — and a binding that still carried null would now be a bundle that cannot say what its own
  // launch renders.
  const config = {
    version: 1,
    format: "ACV1",
    title: "Rings",
    animate: false,
    background: 0,
    palette: ["#000000", "#ffffff"],
    layers: [{ kind: "RINGS", sensor: "QUOTE_VOLUME", curve: "LOG2", palette: 1, amountMin: 1, amountMax: 4 }],
    traits: [],
  };
  const bytes = encodeArtConfigV1(config);
  const binding = computeArtBinding({
    runtime: "SOLIDITY_SVG",
    templateId: "7",
    scriptBytes: utf8("preview only"),
    artConfigBytes: bytes,
    artConfigVisualHash: visualHashArtConfigV1(config),
    artConfigTraitSchemaHash: traitSchemaHashArtConfigV1(config),
    generatorFileHashes: {},
    traitSchema: null,
    marketMappings: null,
    collectionMetadata: null,
    templateParams: config,
  });
  assert(binding.artConfigSource === "ART_CONFIG_V1", "a Solidity renderer's config does not come from the generator script");
  assert(binding.artConfigFormat === "ACV1", "the config format must be named");
  assert(binding.artConfigHash === hashArtConfigV1(bytes), "artConfigHash must be keccak256 of the exact configuration bytes");
  assert(binding.artConfig === Buffer.from(bytes).toString("hex"), "the bundle must carry the configuration itself, not only a digest of it");
  assert(binding.artConfigBytes === bytes.length, "the byte count must match the configuration");
  assert(binding.templateParamsHash !== null, "the creator's authoring document must still be committed to");
  assert(binding.templateId === "7", "the registered template id was lost");
  assert(binding.artRuntimeVersion === 1, "the runtime version the binding pins was lost");
});

test("a project that cannot state its art configuration is refused, not defaulted", () => {
  // THE WHOLE POINT OF SCHEMA 3. There is no fallback configuration, no generic template to borrow
  // from, and no way to assemble a Solidity-SVG bundle without the creator having supplied one.
  assertThrows(
    () =>
      computeArtBinding({
        runtime: "SOLIDITY_SVG",
        templateId: "7",
        scriptBytes: utf8("preview only"),
        generatorFileHashes: {},
        traitSchema: null,
        marketMappings: null,
        collectionMetadata: null,
        templateParams: null,
      }),
    "exact art configuration bytes",
    "a binding with no configuration must be refused",
  );
  assertThrows(
    () => deriveArtConfig({ runtime: "SOLIDITY_SVG", templateParams: { rings: 4 }, scriptBytes: utf8("x") }),
    "not an art configuration",
    "a pre-3.0.0 parameter document must be refused rather than reinterpreted",
  );
});

test("the output commitment covers the fixed seeds and nothing else", () => {
  const outputs = Object.fromEntries(BINDING_SEEDS.map((seed) => [seed, sha256Utf8(`art-${seed}`)]));
  const commitment = representativeOutputsCommitment(outputs);
  assert(commitment !== null, "a complete seed set produced no commitment");
  assert(representativeOutputsCommitment({ ...outputs, "99": sha256Utf8("extra") }) === commitment, "an unrelated seed changed the commitment");

  const missing = { ...outputs };
  delete missing[BINDING_SEEDS[0]];
  assert(representativeOutputsCommitment(missing) === null, "a missing binding seed still produced a commitment");

  const different = { ...outputs, [BINDING_SEEDS[0]]: sha256Utf8("different art") };
  assert(representativeOutputsCommitment(different) !== commitment, "changing what the generator draws did not move the commitment");
});

test("launchability is never written into a bundle", () => {
  assert(!ART_BINDING_KEYS.includes("runtimeLaunchable"), "launchability is a property of the protocol today, not of the bundle");
  for (const runtime of LAUNCHABLE_ART_RUNTIMES) assert(isRuntimeLaunchable(runtime), `${runtime} is listed as launchable but does not report as such`);
  for (const runtime of LAUNCHABLE_ART_RUNTIMES) assert(APPROVED_ART_RUNTIMES.includes(runtime), `${runtime} is launchable but not approved, which cannot be true`);
  for (const runtime of APPROVED_ART_RUNTIMES) assert(typeof ART_RUNTIME_IDS[runtime] === "string", `${runtime} has no stable runtime id`);
});

test("a pre-binding bundle is refused with the reason and the fix", () => {
  const message = explainIncompatibility("1.1.0");
  assert(/art binding/i.test(message), "the refusal does not say what is missing");
  assert(message.includes(CREATOR_KIT_VERSION), "the refusal does not say which kit version to re-export with");
  assert(!isSchemaCompatible("1.1.0", SCHEMA_VERSION), "a pre-binding bundle was accepted");
});

test("schema compatibility follows major/minor", () => {
  assert(isSchemaCompatible("1.0.0", "1.0.0"), "identical versions are incompatible");
  assert(isSchemaCompatible("1.0.0", "1.4.0"), "an older minor is not readable by a newer importer");
  assert(!isSchemaCompatible("1.5.0", "1.0.0"), "a newer minor was accepted by an older importer");
  assert(!isSchemaCompatible("2.0.0", "1.0.0"), "a different major was accepted");
});

// ---------------------------------------------------------------- container

test("writeContainer is byte-deterministic regardless of input order", () => {
  const a = writeContainer([
    { path: "b.json", bytes: utf8("{}") },
    { path: "a/c.js", bytes: utf8("x") },
  ]);
  const b = writeContainer([
    { path: "a/c.js", bytes: utf8("x") },
    { path: "b.json", bytes: utf8("{}") },
  ]);
  assert(Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0, "entry order changed the container bytes");
});

test("readContainer round-trips what writeContainer wrote", () => {
  const bytes = writeContainer([{ path: "a.json", bytes: utf8('{"x":1}') }]);
  const read = readContainer(bytes);
  assert(read.entries.length === 1, "entry count changed");
  assert(fromUtf8(read.byPath.get("a.json")) === '{"x":1}', "content changed");
});

test("normalizeEntryPath refuses every path-confusion shape", () => {
  const hostile = ["../x", "/x", "a/../b", "a//b", ".hidden", "a\\b", "con.txt", "a/b/c/d/e/f/g", "x ", "café.png"];
  for (const path of hostile) assertThrows(() => normalizeEntryPath(path), "", `"${path}" was accepted`);
  assert(normalizeEntryPath("generator/generate.js") === "generator/generate.js", "a good path was rejected");
});

test("checkEntryPolicy refuses contract code and executables everywhere", () => {
  for (const path of ["generator/Hook.sol", "assets/x.wasm", "assets/run.sh", "generator/x.py", "assets/id.pem"]) {
    const policy = checkEntryPolicy(path);
    assert(policy.ok === false, `${path} was allowed`);
  }
  assert(checkEntryPolicy("generator/generate.js").ok === true, "a legitimate generator path was refused");
  assert(checkEntryPolicy("LICENSE").ok === true, "LICENSE was refused");
});

// ---------------------------------------------------------------- documents

test("the manifest schema is closed", () => {
  const issues = validateManifest({ schemaVersion: "1.0.0", surprise: true });
  assert(
    issues.some((i) => i.code === "MANIFEST_UNKNOWN_KEY"),
    "an unknown top-level key was accepted",
  );
});

test("every refused manifest key is reported with its own explanation", () => {
  for (const key of Object.keys(REFUSED_MANIFEST_KEYS)) {
    const issues = validateManifest({ [key]: "anything" });
    assert(
      issues.some((i) => i.code === "MANIFEST_REFUSED_KEY" && i.where.includes(key)),
      `"${key}" was not specifically refused`,
    );
  }
});

test("trait schema bounds are enforced", () => {
  const tooMany = { version: 1, dimensions: Array.from({ length: LIMITS.maxTraitDimensions + 1 }, (_, i) => ({ name: `D${i}`, distribution: "uniform", values: [{ name: "A" }] })) };
  assert(
    validateTraitSchema(tooMany).some((i) => i.code === "TRAITS_DIMENSION_COUNT"),
    "the dimension cap was not enforced",
  );
  const duplicate = { version: 1, dimensions: [{ name: "P", distribution: "uniform", values: [{ name: "A" }, { name: "a" }] }] };
  assert(
    validateTraitSchema(duplicate).some((i) => i.code === "TRAITS_VALUE_DUP"),
    "a duplicate value name was accepted",
  );
});

test("market mapping parameters are clamped to published bounds", () => {
  const issues = validateMarketMappings({ version: 1, mappings: [{ id: "x", sensor: "volatility", transform: "clamp", transformParams: { min: -9, max: 900 }, destination: "fracture" }] });
  assert(
    issues.filter((i) => i.code === "MARKET_PARAM_BOUNDS").length === 2,
    "out-of-range transform parameters were accepted",
  );
});

test("every transform output lands inside [0,1]", () => {
  const mappings = [
    { transform: "threshold", transformParams: { cutoff: 0 } },
    { transform: "range", transformParams: { inMin: -1, inMax: 1 } },
    { transform: "clamp", transformParams: { min: 0, max: 1 } },
    { transform: "smoothing", transformParams: { window: 8 } },
    { transform: "tier", transformParams: { steps: 5 } },
    { transform: "accumulation", transformParams: { cap: 1 } },
    { transform: "decay", transformParams: { halfLife: 4 } },
    { transform: "inverse", transformParams: {} },
    { transform: "weighted_mix", transformParams: { weight: 0.5 } },
  ];
  for (const mapping of mappings) {
    for (const reading of [-5, -1, -0.3, 0, 0.7, 1, 5, NaN, Infinity]) {
      const value = applyTransform(mapping, reading, { previous: 0.5, current: 0.5 });
      assert(Number.isFinite(value) && value >= 0 && value <= 1, `${mapping.transform} produced ${value} for ${reading}`);
    }
  }
});

test("collection metadata refuses remote image URLs", () => {
  const issues = validateCollectionMetadata({ version: 1, name: "X", symbol: "X", description: "d", image: "https://cdn.example.com/x.png" });
  assert(
    issues.some((i) => i.code === "METADATA_IMAGE_PATH"),
    "a remote image URL was accepted",
  );
});

// ---------------------------------------------------------------- static analysis

test("stripComments removes comments but keeps string contents", () => {
  const stripped = stripComments('const a = 1; // fetch\n/* fetch */ const b = "fetch";');
  assert(!stripped.includes("// fetch"), "a line comment survived");
  assert(stripped.includes('"fetch"'), "a string literal was stripped");
});

test("generator static analysis catches the whole forbidden set", () => {
  const cases = [
    ["fetch('x')", "GEN_FORBIDDEN_IDENTIFIER"],
    ["Math.random()", "GEN_NONDETERMINISM"],
    ["new Date()", "GEN_FORBIDDEN_IDENTIFIER"],
    ["import('./x.js')", "GEN_DYNAMIC_IMPORT"],
    ["while (true) {}", "GEN_INFINITE_LOOP"],
    ["const x = 'https://evil.example.com'", "GEN_EXTERNAL_URL"],
    ["import x from 'lodash'", "GEN_DEPENDENCY_REFUSED"],
    ["const c = ctx.constructor", "GEN_PROTOTYPE_ACCESS"],
    ["async function render() {}", "GEN_ASYNC"],
  ];
  for (const [source, code] of cases) {
    const issues = analyzeGeneratorSource("generator/generate.js", source);
    assert(
      issues.some((i) => i.code === code),
      `${JSON.stringify(source)} did not raise ${code}`,
    );
  }
});

test("the W3C namespace declaration is not treated as an external URL", () => {
  const source = 'export function render(c) { return `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`; }';
  const issues = analyzeGeneratorSource("generator/generate.js", source, { entry: true });
  assert(!issues.some((i) => i.code === "GEN_EXTERNAL_URL"), "the SVG namespace was flagged as a network reference");
});

test("the secret scan catches key material without tripping on prose", () => {
  // Assembled from fragments on purpose. A literal 64-hex string next to a key-shaped field name
  // would trip this repository's OWN secret scan, and a negative-test corpus that has to be
  // allowlisted teaches the scanner to look away.
  const fakeKey = `0x${"4c0883a69102937d6231471b5dbb6204"}${"fe5129617082792ae468d01a3f362318"}`;
  const fakeRpc = `https://eth-mainnet.alchemy.com/v2/${"aBcDeFgHiJkLmNoPqRsTuVwXyZ123456"}`;
  const hits = [`const privateKey = '${fakeKey}'`, "-----BEGIN PRIVATE KEY-----", fakeRpc, `AKIA${"IOSFODNN7EXAMPLE"}`];
  for (const text of hits) assert(scanTextForSecrets("x.json", text).length > 0, `missed: ${text.slice(0, 40)}`);

  const prose = "A minimal generative collection of concentric rings around a single core with the palette chosen by the seed of the token itself and nothing else at all.";
  assert(scanTextForSecrets("README.md", prose).length === 0, "ordinary prose was reported as a secret");
});

test("SVG inspection refuses documents that execute or fetch", () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/><circle cx="5" cy="5" r="2"/>';
  const cases = [
    [`${base}<script>x()</script></svg>`, "SVG_SCRIPT"],
    [`${base}<foreignObject><p>x</p></foreignObject></svg>`, "SVG_FOREIGN_OBJECT"],
    [`${base}<rect onload="x()"/></svg>`, "SVG_EVENT_HANDLER"],
    [`${base}<image href="https://evil.example.com/x.png"/></svg>`, "SVG_EXTERNAL_REFERENCE"],
    ['<!DOCTYPE svg [<!ENTITY a "b">]><svg xmlns="http://www.w3.org/2000/svg"><rect/><circle/></svg>', "SVG_DOCTYPE"],
  ];
  for (const [svg, code] of cases) {
    const issues = inspectRenderOutput("t", svg);
    assert(
      issues.some((i) => i.code === code),
      `${code} was not raised`,
    );
  }
  assert(inspectRenderOutput("t", `${base}</svg>`).filter((i) => i.severity === "error").length === 0, "a clean SVG was rejected");
});

test("blank and non-string outputs are refused", () => {
  assert(inspectRenderOutput("t", "").some((i) => i.code === "RENDER_BLANK"), "an empty string passed");
  assert(inspectRenderOutput("t", null).some((i) => i.code === "RENDER_OUTPUT_TYPE"), "null passed");
  assert(inspectRenderOutput("t", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><title>nothing at all here</title></svg>').some((i) => i.code === "RENDER_BLANK"), "an SVG with no drawable elements passed");
});

// ---------------------------------------------------------------- sandbox

test("the sandbox realm has no ambient capabilities", () => {
  const probes = [
    ["typeof fetch", "undefined"],
    ["typeof process", "undefined"],
    ["typeof Date", "undefined"],
    ["typeof globalThis", "undefined"],
    ["typeof WebAssembly", "undefined"],
    ["typeof Worker", "undefined"],
  ];
  for (const [expression, expected] of probes) {
    const source = `export function render(c) { return "<svg><!--" + (${expression}) + "-->"; }`;
    const module = createVmModule(new Map([["generator/generate.js", source]]));
    const out = module.render({ seed: "1" });
    assert(String(out).includes(expected), `${expression} was not ${expected} in the sandbox`);
  }
});

test("Math.random throws inside the sandbox", () => {
  const source = 'export function render(c) { return "<svg>" + Math.random() + "</svg>"; }';
  const module = createVmModule(new Map([["generator/generate.js", source]]));
  assertThrows(() => module.render({ seed: "1" }), "not available", "Math.random was callable");
});

test("the render context is realm-native, so its constructor chain cannot escape", () => {
  const source = 'export function render(c) { return "<svg>" + (c.constructor === Object) + "</svg>"; }';
  const module = createVmModule(new Map([["generator/generate.js", source]]));
  const out = module.render({ seed: "1" });
  assert(String(out).includes("true"), "the context object came from the host realm");
});

test("code generation from strings is disabled in the sandbox", () => {
  const source = 'export function render(c) { const F = c.constructor.constructor; return "<svg>" + F("return 1")() + "</svg>"; }';
  const module = createVmModule(new Map([["generator/generate.js", source]]));
  assertThrows(() => module.render({ seed: "1" }), "", "Function('...') executed inside the sandbox");
});

test("a runaway loop is stopped by the render timeout", () => {
  const source = 'export function render(c) { for (let i = 0; i > -1; i++) {} return "<svg/>"; }';
  const module = createVmModule(new Map([["generator/generate.js", source]]), "generator/generate.js", { timeoutMs: 300 });
  assertThrows(() => module.render({ seed: "1" }), "", "an infinite loop ran to completion");
});

test("toRunnableScript strips export without touching the body", () => {
  const runnable = toRunnableScript("export const manifest = { a: 1 };\nexport function render(c) { return 'x'; }\n");
  assert(runnable.includes("const manifest"), "an exported const was lost");
  assert(runnable.includes("function render"), "the render function was lost");
  assert(!/^\s*export\s/m.test(runnable.split("__buildContext")[1] ?? ""), "an export keyword survived");
});

test("the isolated backend survives a memory bomb", () => {
  const source = "export function render(c) { const h = []; for (let i = 0; i < 100000000; i++) { h.push(new Array(1000).fill(i)); } return '<svg/>'; }";
  const recorded = renderSeedsIsolated({ sources: new Map([["generator/generate.js", source]]), seeds: ["1"], heapMb: 64, timeoutMs: 20000 });
  assert(recorded.ok === false, "the memory bomb was reported as a success");
});

// ---------------------------------------------------------------- fixtures

const parityExpected = JSON.parse(readFileSync(join(FIXTURES, "parity/expected.json"), "utf8"));

for (const expected of parityExpected.bundles) {
  test(`parity fixture ${expected.file} reproduces every hash`, () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, "parity", expected.file)));
    const result = validateBundleBytes(bytes, { skipExecution: true });
    assert(result.ok, `the fixture does not validate: ${result.issues.map((i) => i.code).join(", ")}`);
    assert(result.hashes.bundleHash === expected.integrity.bundleHash, "bundleHash drifted");
    assert(result.hashes.projectConfigHash === expected.integrity.projectConfigHash, "projectConfigHash drifted");
    assert(result.hashes.contentHash === expected.integrity.contentHash, "contentHash drifted");
    for (const key of ["script", "generator", "traitSchema", "marketMapping", "metadata"]) {
      assert(result.manifest.hashes[key] === expected.hashes[key], `${key} hash drifted`);
    }
  });

  test(`parity fixture ${expected.file} projects onto the same studio draft`, () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, "parity", expected.file)));
    const container = readContainer(bytes);
    const result = validateBundleBytes(bytes, { skipExecution: true });
    const projection = toStudioDraft(result, container.byPath, { draftId: expected.studioDraft.id, updatedAt: 0 });
    assert(canonicalJson(projection.draft) === canonicalJson(expected.studioDraft), "the studio draft projection drifted");
    assert(canonicalJson(projection.provenance) === canonicalJson(expected.provenance), "the provenance block drifted");
  });

  test(`parity fixture ${expected.file} renders the recorded outputs`, () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, "parity", expected.file)));
    const container = readContainer(bytes);
    const result = validateBundleBytes(bytes, { skipExecution: true });
    const source = fromUtf8(container.byPath.get("generator/generate.js"));
    const module = createVmModule(new Map([["generator/generate.js", source]]));
    for (const [seed, record] of Object.entries(expected.representativeOutputs)) {
      const svg = module.render(buildContextFor(result, seed));
      assert(sha256Utf8(svg) === record.sha256, `seed ${seed} rendered different art`);
    }
  });
}

function buildContextFor(result, seed) {
  return buildRenderContext({ manifest: result.manifest, marketDocument: result.marketMappings, seed });
}

const hostileExpectations = JSON.parse(readFileSync(join(FIXTURES, "hostile/expectations.json"), "utf8"));

for (const fixture of hostileExpectations.fixtures) {
  test(`hostile fixture ${fixture.file} is refused (${fixture.attack})`, () => {
    const path = join(FIXTURES, "hostile", fixture.file);
    assert(existsSync(path), "the fixture file is missing");
    const bytes = new Uint8Array(readFileSync(path));

    if (fixture.refusedBy === "container") {
      assertThrows(() => readContainer(bytes), fixture.expect.errorContains, "the container was accepted");
      if (fixture.expect.errorContainsAny) {
        let message = "";
        try {
          readContainer(bytes);
        } catch (err) {
          message = err.message;
        }
        assert(
          fixture.expect.errorContainsAny.some((needle) => message.includes(needle)),
          `unexpected refusal reason: ${message}`,
        );
      }
      return;
    }

    const result = fixture.requiresExecution ? validateWithSandbox(bytes) : validateBundleBytes(bytes, { skipExecution: true });
    assert(result.ok === false, "the bundle validated cleanly");
    if (fixture.expect.checkFails) {
      const check = result.checks.find((c) => c.id === fixture.expect.checkFails);
      assert(check && check.status === "fail", `${fixture.expect.checkFails} did not fail (status ${check?.status})`);
    }
    if (fixture.expect.codes) {
      const seen = new Set(result.issues.map((i) => i.code));
      assert(
        fixture.expect.codes.some((code) => seen.has(code)),
        `none of ${fixture.expect.codes.join("/")} were reported; got ${[...seen].join(", ")}`,
      );
    }
  });
}

function validateWithSandbox(bytes) {
  const container = readContainer(bytes);
  const structural = validateBundleBytes(bytes, { skipExecution: true });
  const sources = new Map();
  for (const [path, content] of container.byPath) {
    if (path.startsWith("generator/") && path.endsWith(".js")) sources.set(path, fromUtf8(content));
  }
  const seeds = ["1", "2", "3", "4"];
  const recorded = renderSeedsIsolated({ sources, seeds, manifest: structural.manifest, marketDocument: structural.marketMappings, heapMb: 96, timeoutMs: 25000 });
  if (!recorded.ok) {
    const result = validateBundleBytes(bytes, { skipExecution: true });
    result.ok = false;
    result.issues.push({ severity: "error", code: "SANDBOX_FAILED", where: "generator/generate.js", message: recorded.error });
    for (const check of result.checks) {
      if (["RUNTIME_ERRORS", "BLANK_OUTPUTS", "DETERMINISTIC_OUTPUT", "DUPLICATE_RATE"].includes(check.id)) check.status = "fail";
    }
    return result;
  }
  return validateBundle(container.byPath, { evaluate: makeReplayEvaluator(recorded), seeds: seeds.length });
}

// ---------------------------------------------------------------- ACV1 art configuration

// THE CONFORMANCE CORPUS IS SHARED WITH SOLIDITY. `launchpad/test/art/ArtConfigV1Parity.t.sol`
// reads this exact file (mirrored, digest-guarded) and computes every value independently with
// `ArtConfigV1.sol`. Here we prove the JavaScript side reproduces it from the same preimages, so
// neither implementation is ever checked against the other's output.
const ACV1 = JSON.parse(readFileSync(join(HERE, "../fixtures/acv1/vectors.json"), "utf8"));

test("acv1: the corpus is populated and carries both valid and refused vectors", () => {
  assert(ACV1.vectors.length === ACV1.vectorCount, "vectorCount must match the array");
  assert(ACV1.vectors.length > 30, "the corpus is suspiciously small");
  assert(ACV1.vectors.some((v) => v.code === 0), "no valid vector");
  assert(ACV1.vectors.some((v) => v.code !== 0), "no refused vector");
});

test("acv1: every preimage re-encodes to exactly the recorded bytes", () => {
  for (const vector of ACV1.vectors.filter((v) => v.kind === "preimage")) {
    const document = encodeArtConfigV1(vector.preimage);
    const appendix = Buffer.from(vector.appendixHex ?? "", "hex");
    const bytes = appendix.length > 0 ? withArtConfigV1Appendix(document, Uint8Array.from(appendix)) : document;
    assert(Buffer.from(bytes).toString("hex") === vector.encodedHex, `encoded bytes differ for ${vector.name}`);
  }
});

test("acv1: every vector validates to exactly the recorded code", () => {
  for (const vector of ACV1.vectors) {
    const bytes = Uint8Array.from(Buffer.from(vector.encodedHex, "hex"));
    const verdict = validateArtConfigV1(bytes);
    assert(verdict.code === vector.code, `${vector.name}: expected ${vector.codeName}, got ${verdict.name}`);
  }
});

test("acv1: artConfigHash is keccak256 of the exact transmitted bytes", () => {
  for (const vector of ACV1.vectors) {
    const bytes = Uint8Array.from(Buffer.from(vector.encodedHex, "hex"));
    assert(hashArtConfigV1(bytes) === vector.artConfigHash, `artConfigHash differs for ${vector.name}`);
  }
});

test("acv1: the visual and trait-schema commitments match for every decodable vector", () => {
  let compared = 0;
  for (const vector of ACV1.vectors) {
    const bytes = Uint8Array.from(Buffer.from(vector.encodedHex, "hex"));
    const decoded = decodeArtConfigV1(bytes);
    if (!decoded.ok) continue;
    assert(visualHashArtConfigV1(decoded.config) === vector.visualHash, `visualHash differs for ${vector.name}`);
    assert(traitSchemaHashArtConfigV1(decoded.config) === vector.traitSchemaHash, `traitSchemaHash differs for ${vector.name}`);
    compared++;
  }
  assert(compared > 0, "nothing was compared");
});

test("acv1: decode round-trips a document back to its preimage", () => {
  for (const vector of ACV1.vectors.filter((v) => v.kind === "preimage" && v.code === 0)) {
    const decoded = decodeArtConfigV1(Uint8Array.from(Buffer.from(vector.encodedHex, "hex")));
    assert(decoded.ok, `${vector.name} must decode`);
    assert(decoded.config.title === vector.preimage.title, `title differs for ${vector.name}`);
    assert(decoded.config.layers.length === vector.preimage.layers.length, `layer count differs for ${vector.name}`);
    assert(decoded.config.palette.length === vector.preimage.palette.length, `palette size differs for ${vector.name}`);
    // Re-encoding the DECODED document must reproduce the interpreted half exactly.
    const reencoded = Buffer.from(encodeArtConfigV1(decoded.config)).toString("hex");
    assert(vector.encodedHex.startsWith(reencoded), `${vector.name} does not round-trip`);
  }
});

test("acv1: THE APPENDIX IS COMMITTED BUT NEVER INTERPRETED", () => {
  const plain = ACV1.vectors.find((v) => v.name === "strata");
  const carried = ACV1.vectors.find((v) => v.name === "strata-with-appendix");
  assert(plain.artConfigHash !== carried.artConfigHash, "an appendix must change artConfigHash");
  assert(plain.visualHash === carried.visualHash, "an appendix must not change the image");
  assert(plain.traitSchemaHash === carried.traitSchemaHash, "an appendix must not change the traits");
  // The trap this guards: hashing a re-encode drops the appendix and yields a digest the chain
  // rejects. hashArtConfigV1 takes bytes for exactly this reason and refuses a config object.
  const bytes = Uint8Array.from(Buffer.from(carried.encodedHex, "hex"));
  const decoded = decodeArtConfigV1(bytes);
  assert(hashArtConfigV1(encodeArtConfigV1(decoded.config)) !== carried.artConfigHash, "re-encoding must NOT reproduce the hash — that is the whole hazard");
  assert(hashArtConfigV1(bytes) === carried.artConfigHash, "hashing the transmitted bytes must reproduce it");
  assertThrows(() => hashArtConfigV1(decoded.config), "exact transmitted bytes", "hashArtConfigV1 must refuse a config object");
});

test("acv1: 19 bytes is the header early-out, 21 is the minimum", () => {
  assert(ACV1_LIMITS.headerGateBytes === 19, "the early-out is 19");
  assert(ACV1_LIMITS.minBytes === 21, "the minimum valid document is 21 bytes");
  const at = (n) => ACV1.vectors.find((v) => v.name === n);
  assert(at("raw-19-bytes").code === 1 && at("raw-20-bytes").code === 1, "19 and 20 bytes must both be refused");
  assert(at("raw-21-bytes-valid").code === 0 && at("raw-21-bytes-valid").totalBytes === 21, "21 bytes must be accepted");
  assert(at("maximal").totalBytes === 332, "the interpreted maximum is 332 bytes");
});

test("acv1: FRAGMENTATION is refused in a layer and allowed in a trait", () => {
  const at = (n) => ACV1.vectors.find((v) => v.name === n);
  assert(at("err-layer-sensor-fragmentation").codeName === "ERR_LAYER_SENSOR", "a layer may not name FRAGMENTATION");
  assert(at("fragmentation-trait").code === 0, "a trait may name FRAGMENTATION");
  assert(!ACV1_LAYER_SENSORS.includes("FRAGMENTATION"), "the layer vocabulary must not offer it");
  assert(ACV1_TRAIT_SOURCES.includes("FRAGMENTATION"), "the trait vocabulary must offer it");
});

test("acv1: one defect can report two codes depending on an unrelated field", () => {
  const at = (n) => ACV1.vectors.find((v) => v.name === n);
  const small = at("err-too-short-zero-layers-small-palette");
  const large = at("err-layer-count-zero-layers-large-palette");
  assert(small.codeName === "ERR_TOO_SHORT" && large.codeName === "ERR_LAYER_COUNT", "the two-code table must hold");
  assert(small.preimage.layers.length === 0 && large.preimage.layers.length === 0, "both must carry the SAME defect");
});

test("acv1: isArtConfigV1 recognises the format without judging validity", () => {
  const strata = Uint8Array.from(Buffer.from(ACV1.vectors.find((v) => v.name === "strata").encodedHex, "hex"));
  assert(isArtConfigV1(strata), "a valid document is ACV1");
  const refused = Uint8Array.from(Buffer.from(ACV1.vectors.find((v) => v.name === "err-title-quote").encodedHex, "hex"));
  assert(isArtConfigV1(refused), "an INVALID ACV1 document is still ACV1 — format and validity are different questions");
  assert(!isArtConfigV1(Uint8Array.from([1, 2, 3])), "a stray byte string is not ACV1");
  assert(!isArtConfigV1(Uint8Array.from(Buffer.from(ACV1.vectors.find((v) => v.name === "raw-magic").encodedHex, "hex"))), "wrong magic is not ACV1");
});

test("acv1: the checked encoder refuses bytes the chain would reject", () => {
  const good = ACV1.vectors.find((v) => v.name === "strata").preimage;
  assert(encodeArtConfigV1Checked(good).length > 0, "a valid configuration encodes");
  const bad = ACV1.vectors.find((v) => v.name === "err-layer-sensor-fragmentation").preimage;
  assert(encodeArtConfigV1(bad).length > 0, "the plain encoder does NOT validate — negative fixtures depend on that");
  assertThrows(() => encodeArtConfigV1Checked(bad), "ERR_LAYER_SENSOR", "the checked encoder must refuse it");
});

test("acv1: the authoring skeleton defaults nothing", () => {
  const empty = emptyArtConfigV1();
  for (const field of ["animate", "background", "palette", "layers", "traits", "title"]) {
    assert(empty[field] === null, `${field} must be explicitly absent, never a plausible default`);
  }
});

// ---------------------------------------------------------------- upstream-authored checksums

// CHECKSUMS.json is the corpus's authority for every downstream consumer. The monorepo mirrors
// these bundles and verifies them against THIS file rather than against numbers it computes
// itself — a corpus checked against digests derived from the corpus proves nothing, which
// independent verification demonstrated by tampering with a bundle and re-signing it. So this
// file has to be right here, where it is authored, and CI regenerates it and diffs.
const CHECKSUMS = JSON.parse(readFileSync(join(HERE, "../fixtures/CHECKSUMS.json"), "utf8"));

test("the upstream-authored corpus checksums match the corpus", () => {
  let checked = 0;
  for (const [dir, corpus] of Object.entries(CHECKSUMS.corpora)) {
    const names = Object.keys(corpus.bundles);
    assert(names.length === corpus.bundleCount, `${dir}: bundleCount does not match the listing`);
    for (const [file, record] of names.map((n) => [n, corpus.bundles[n]])) {
      const bytes = readFileSync(join(HERE, "../fixtures", dir, file));
      assert(bytes.length === record.bytes, `${dir}/${file} is not its recorded size`);
      assert(sha256Hex(new Uint8Array(bytes)) === record.sha256, `${dir}/${file} does not match its recorded digest`);
      checked++;
    }
  }
  assert(checked === CHECKSUMS.bundleCount, "bundleCount does not match the number of bundles checked");
  assert(checked > 40, "the corpus is suspiciously small");
});

test("every corpus file on disk is listed in the checksums", () => {
  // The direction that catches an ADDED fixture. Without it, a bundle could be dropped into the
  // corpus, mirrored downstream, and never appear in the authority everyone verifies against.
  for (const dir of ["parity", "hostile"]) {
    const onDisk = readdirSync(join(HERE, "../fixtures", dir)).filter((f) => f.endsWith(".relics")).sort();
    const listed = Object.keys(CHECKSUMS.corpora[dir].bundles).sort();
    assert(onDisk.join(",") === listed.join(","), `${dir}: the corpus on disk and the checksums disagree about which bundles exist`);
  }
});

// ---------------------------------------------------------------- economics

test("the allocation is derived from four constants, never restated", () => {
  assert(CREATOR_SHARE_BPS + PLATFORM_SHARE_BPS === BPS_DENOMINATOR, "creator + platform must be the whole");
  assert(
    RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE + PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE === BPS_DENOMINATOR,
    "buyback + retained must be the whole platform share",
  );
  assert(RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE === 5000, "RC3: the buyback takes 50% of the platform share");
  assert(PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE === 5000, "RC3: retained treasury takes the other 50%");
});

test("the nominal allocation of collected LP fees is 75.00 / 12.50 / 12.50", () => {
  assert(NOMINAL_ALLOCATION_BPS.creator === 7500, "creator moved, and this amendment does not move it");
  assert(NOMINAL_ALLOCATION_BPS.relicsBuybackReserve === 1250, "buyback nominal is not 12.50%");
  assert(NOMINAL_ALLOCATION_BPS.platformTreasury === 1250, "retained nominal is not 12.50%");
  const total = NOMINAL_ALLOCATION_BPS.creator + NOMINAL_ALLOCATION_BPS.relicsBuybackReserve + NOMINAL_ALLOCATION_BPS.platformTreasury;
  assert(total === BPS_DENOMINATOR, "the three nominal shares do not sum to the whole");
  assert(NOMINAL_ALLOCATION_PERCENT.relicsBuybackReserve === "12.50%", "the rendered percentage drifted from the bps");
  assert(PLATFORM_SUBDIVISION_PERCENT.relicsBuybackReserve === "50.00%", "the platform-slice framing drifted from the bps");
  assert(FEE_SPLIT_BPS === NOMINAL_ALLOCATION_BPS, "FEE_SPLIT_BPS must BE the derived object, not a copy of it");
});

test("every published percentage is derived from bps, so it cannot survive a constant change", () => {
  assert(bpsToPercentString(CREATOR_SHARE_BPS) === NOMINAL_ALLOCATION_PERCENT.creator, "creator percent is not derived");
  assert(bpsToPercentString(625) === "6.25%", "the renderer itself is wrong");
  for (const text of [BUYBACK_DISCLOSURE, BUYBACK_DISCLOSURE_SHORT, PLATFORM_SETTLEMENT_INVARIANT]) {
    assert(!/6\.25|18\.75|\b25% of the platform/.test(text), `a retired figure survives in: ${text.slice(0, 60)}…`);
  }
});

test("the mechanism is buy-and-entomb, and no published sentence calls it a burn", () => {
  assert(BUYBACK_MECHANISM === "BUY_AND_ENTOMB", "the mechanism identifier is not BUY_AND_ENTOMB");
  assert(ENTOMBMENT_ADDRESS.toLowerCase() === "0x000000000000000000000000000000000000dead", "entombment address moved");
  for (const text of [BUYBACK_DISCLOSURE, BUYBACK_DISCLOSURE_SHORT]) {
    assert(!/\bburns\b|\bburned\b|\bburning\b/i.test(text), "a disclosure sentence describes the mechanism as burning");
    assert(!/total supply (falls|decreases|shrinks)/i.test(text), "a disclosure sentence claims totalSupply falls");
  }
  assert(/totalSupply/.test(BUYBACK_DISCLOSURE), "the long disclosure must say what does NOT change");
  assert(/no ERC-20 burn event/i.test(BUYBACK_TECHNICAL_NOTE), "the technical note must deny the burn event");
});

test("the platform invariant names its settlement asset, and never promises a share of volume", () => {
  assert(/SELECTED QUOTE/.test(PLATFORM_SETTLEMENT_INVARIANT), "the invariant does not name the asset it divides");
  assert(/conversion/i.test(PLATFORM_SETTLEMENT_INVARIANT), "the invariant does not mention conversion cost");
  assert(/only on the platform share/.test(PLATFORM_SETTLEMENT_INVARIANT), "the invariant does not protect the creator's share");
  assert(!/volume/i.test(PLATFORM_SETTLEMENT_INVARIANT), "the invariant must never promise a share of volume");
  assert(/never reported as WETH before WETH is received/i.test(PLATFORM_SETTLEMENT_INVARIANT), "the invariant does not forbid reporting quote as WETH");
});

test("creator modes stay two, and quote-only is not WETH-only", () => {
  assert(CREATOR_FEE_ASSET_MODES.length === 2, "a third creator mode appeared");
  assert(CREATOR_FEE_ASSET_MODES.includes("DUAL_ASSET") && CREATOR_FEE_ASSET_MODES.includes("QUOTE_ONLY"), "the two modes are not the two modes");
});

test("the settlement status list is closed, in pipeline order, and UNKNOWN is in it", () => {
  const expected = [
    "NOT_ACCRUED",
    "SOURCE_ASSETS_PENDING",
    "PROJECT_TOKEN_TO_QUOTE_PENDING",
    "SPLIT_ALLOCATED",
    "BUYBACK_ALLOCATED_AWAITING_ROUTE",
    "QUOTE_TO_WETH_PENDING",
    "WETH_SETTLED",
    "DEGRADED_ROUTE",
    "RETRYABLE_FAILURE",
    "UNKNOWN",
  ];
  assert(PLATFORM_SETTLEMENT_STATUSES.join(",") === expected.join(","), "the settlement status vocabulary drifted");
  assert(isPlatformSettlementStatus("UNKNOWN"), "UNKNOWN is not a member of its own list");
  assert(!isPlatformSettlementStatus("SETTLED"), "an unknown status was accepted");
});

test("allocated is not settled — the whole point of the quote-denominated model", () => {
  // A buyback half sitting in a non-WETH quote is ALLOCATED. Reporting it as settled is the exact
  // misstatement this vocabulary exists to make impossible.
  assert(hasAllocatedPlatformEntitlement("SPLIT_ALLOCATED"), "the split status does not report an allocation");
  assert(hasAllocatedPlatformEntitlement("BUYBACK_ALLOCATED_AWAITING_ROUTE"), "awaiting a route is still allocated");
  assert(!hasSettledBuybackWeth("BUYBACK_ALLOCATED_AWAITING_ROUTE"), "awaiting a route must never report settled WETH");
  assert(!hasSettledBuybackWeth("SPLIT_ALLOCATED"), "a split in the QUOTE says nothing about WETH");
  assert(!hasSettledBuybackWeth("QUOTE_TO_WETH_PENDING"), "an outstanding conversion is not a receipt");
  assert(hasSettledBuybackWeth("WETH_SETTLED"), "WETH_SETTLED must be the one status that means WETH arrived");
  assert(BUYBACK_WETH_SETTLED_STATUSES.length === 1, "exactly one status may mean WETH was received");
  for (const s of ["NOT_ACCRUED", "SOURCE_ASSETS_PENDING", "PROJECT_TOKEN_TO_QUOTE_PENDING", "DEGRADED_ROUTE", "RETRYABLE_FAILURE", "UNKNOWN"]) {
    assert(!hasAllocatedPlatformEntitlement(s), `${s} must not claim the entitlement is divided`);
    assert(!hasSettledBuybackWeth(s), `${s} must not claim a settled WETH figure exists`);
  }
  // The deprecated predicate must agree with the new one, or two call sites disagree in production.
  for (const s of PLATFORM_SETTLEMENT_STATUSES) {
    assert(hasSettledPlatformWeth(s) === hasSettledBuybackWeth(s), `the deprecated predicate disagrees on ${s}`);
  }
});

test("RETRYABLE_FAILURE is off-chain-derived, because a revert writes no status", () => {
  // A failed call reverts instead of writing a status, so the kernel cannot know it happened.
  // Synthesising the value would be inventing knowledge the contract does not have; it has to be
  // derived from an observed reverted transaction instead.
  assert(!ONCHAIN_REPORTABLE_SETTLEMENT_STATUSES.includes("RETRYABLE_FAILURE"), "a contract cannot report a status a revert prevented it from writing");
  assert(isOffchainDerivedStatus("RETRYABLE_FAILURE"), "RETRYABLE_FAILURE must be marked as derived, not read");
  assert(ONCHAIN_REPORTABLE_SETTLEMENT_STATUSES.length === PLATFORM_SETTLEMENT_STATUSES.length - 1, "exactly one status is off-chain-derived");
  for (const s of ONCHAIN_REPORTABLE_SETTLEMENT_STATUSES) {
    assert(PLATFORM_SETTLEMENT_STATUSES.includes(s), `${s} is reportable but not in the vocabulary`);
    assert(!isOffchainDerivedStatus(s), `${s} is on-chain reportable and must not be marked derived`);
  }
});

test("the claim matcher sees a claim written as code, not only as prose", () => {
  // Two independent scanners missed the same forms. The normaliser is where that is closed, so
  // neither has to rediscover it.
  const wethOnly = RETIRED_ALLOCATION_CLAIMS.find((c) => c.id === "PLATFORM_TREASURY_ASSET_WETH_ONLY");
  assert(wethOnly.normalizedPattern, "the WETH-only claim has no normalized matcher");
  const re = new RegExp(wethOnly.normalizedPattern, "gi");
  const shapes = [
    ['platformAccrued: t.bigint("platform_accrued"), // weth-only, see doc comment above', "a trailing code comment"],
    ["function test_treasuryWethOnly() public {", "a camelCase test name"],
    ['"id": "TREASURY_WETH_ONLY"', "a gate identifier as a JSON value"],
    ['"verdict": "TREASURY_WETH_ONLY"', "a JSON verdict value"],
    ["[TREASURY_WETH_ONLY] pass", "a test log label"],
    ["platform-treasury-WETH-only", "a hyphenated compound"],
  ];
  for (const [text, shape] of shapes) {
    re.lastIndex = 0;
    assert(re.test(normalizeForClaimScan(text)), `the matcher misses ${shape}: ${text}`);
  }
  // And the sentences that are CURRENT and correct must survive it.
  for (const text of [
    "Quote-only is not WETH-only. For a QUOTE_ONLY project, read the market's quote asset",
    '`QUOTE_ONLY` is **not** "WETH-only". The asset it settles in is whatever the market is quoted in',
    "the locker at this integration HEAD is WETH-denominated",
  ]) {
    re.lastIndex = 0;
    assert(!re.test(normalizeForClaimScan(text)), `the matcher false-positives on current copy: ${text}`);
  }
});

test("the matcher works per line, so a proximity guard survives normalisation", () => {
  // Normalisation collapses newlines, which would make a claim on one line and a keyword on the
  // next into neighbours. This exact pair produced a false positive on a CORRECT sentence.
  const twoLines =
    '| `V4_ART_CREATOR_QUOTE_ONLY_FEES` | **PASS** | an NVDA-quoted project is **NVDA-only, not "WETH-only"** |\n' +
    "| 8 | V4 ART PLATFORM | **PASS** | something else entirely |";
  assert(scanTextForRetiredClaims(twoLines).length === 0, "the matcher joined two lines and reported correct copy");

  // And a real single-line claim is still caught.
  const real = "| 7 | FEES | **PASS** | creator WETH+token; treasury WETH-only (token bal 0). |";
  const hits = scanTextForRetiredClaims(real);
  assert(hits.length > 0 && hits[0].id === "PLATFORM_TREASURY_ASSET_WETH_ONLY", "a real claim on one line was missed");
  assert(hits[0].line === 1, "the hit does not carry its line number");
});

test("a mention that negates, narrates or cites is not an assertion", () => {
  // These are the forms the guard tests and the change records are WRITTEN IN. If the gate reported
  // them, the fix would be to delete the tests that keep the retired figures out — which is the
  // opposite of what the gate is for.
  const mustMiss = [
    ['mustNot(/\\b6\\.25\\s*%/, "still asserts the retired 6.25%");', "a negated unit assertion"],
    ['await expect(lp).not.toContainText("18.75%");', "a negated Playwright assertion"],
    ['assert.ok(!copy.includes(X), "the WETH-only half must not appear on a non-WETH quote");', "a bang-negated assertion"],
    ["// platform revenue from 25% to 50% of that share.", "before/after narration"],
    ["* What they retire: the platform treasury is no longer WETH-only.", "a retirement note"],
    ["its `18.75%` is the pre-amendment split", "a pre-amendment reference"],
    ["| Kernel | NatSpec label `TREASURY_WETH_ONLY` | `src/quote/MultiQuoteEconomicKernel.sol:771-778` |", "a cited source line"],
    ["`l2TreasurySafe // WETH-only recipient`, `buybackDepositor // sole source`", "a quoted code span"],
    ["converts to WETH only once a route is approved. The retained treasury half is claimable now.", "the TEMPORAL sense of 'WETH only'"],
    ["| 12 | Who may claim platform WETH? | **Only the recorded beneficiary.** |", "two table cells read as one phrase"],
  ];
  for (const [text, shape] of mustMiss) {
    assert(scanTextForRetiredClaims(text).length === 0, `${shape} was reported as a claim: ${text}`);
  }

  // And the bare assertions must still be caught, or the suppression has eaten the gate.
  const mustHit = [
    ["treasury WETH-only (token bal 0); donation immunity.", "a bare WETH-only assertion"],
    ["| PLATFORM_TREASURY_ASSET | **WETH_ONLY** |", "a key/value table row spanning two cells"],
    ['platformAccrued: t.bigint("platform_accrued"), // weth-only, see doc comment above', "a trailing code comment"],
    ["/** Division 2 — of the platform share only, applied to NET settled platform WETH. */", "the retired split base"],
    ["- **Treasury role** — recipient of the retained **18.75% platform fee** claims", "a retired percentage"],
  ];
  for (const [text, shape] of mustHit) {
    assert(scanTextForRetiredClaims(text).length > 0, `${shape} was missed: ${text}`);
  }
});

test("every registered claim carries a non-empty raw pattern", () => {
  // A downstream gate does `new RegExp(claim.pattern)`. On an empty string that is a regex matching
  // EVERY line, which turns a consumer into a firehose reporting the whole repository.
  for (const c of RETIRED_ALLOCATION_CLAIMS) {
    assert(typeof c.pattern === "string" && c.pattern.length > 0, `${c.id} has no raw pattern`);
    assert(!new RegExp(c.pattern, "i").test(""), `${c.id}'s pattern matches the empty string`);
    assert(typeof c.counter === "string" && c.counter.startsWith("ACTIVE_STALE_"), `${c.id} has no conventional counter`);
  }
});

test("bare negation is NOT a suppression cue", () => {
  // "the treasury never receives a non-WETH asset" IS the retired claim. A rule that treated any
  // negation as narration would have hidden exactly the sentence it exists to catch.
  assert(!isSuppressedMention("the treasury never receives a non-WETH asset"), "bare 'never' suppressed a real claim");
  assert(!isSuppressedMention("the platform is only paid in WETH"), "a plain assertion was suppressed");
  assert(isSuppressedMention("this figure is no longer used"), "a real narration cue was not recognised");
});

test("a phrasing that is conditionally true is exempt on its own line only", () => {
  // The mandated settlement sentence is exactly right for a WETH-quoted market, and the owner's
  // wording is worth keeping verbatim for that case.
  const marked = `  // ${CONDITIONALLY_TRUE_MARKER}\n  "The RELICS and treasury allocations divide the net WETH received after conversion.",`;
  assert(scanTextForRetiredClaims(marked).length === 0, "a conditionally-true phrasing was reported");

  // But it is a LOCAL exemption, not a file one: a claim beyond the marker's stated lookback in
  // the same file is still judged. (Within the lookback it is shielded — that is the cost of
  // letting the marker carry its own explanation, and it is why the window is three lines and not
  // thirty.)
  const alsoElsewhere = [marked, "", "", "", "", 'const bad = "treasury WETH-only";'].join("\n");
  assert(scanTextForRetiredClaims(alsoElsewhere).length > 0, "the marker leaked into a file-level exemption");

  // A marker with two lines of explanation under it must still reach the line it marks — writing
  // that explanation is the whole point of the marker, and a one-line lookback broke on it.
  const withReason = [
    `    // ${CONDITIONALLY_TRUE_MARKER} — true for a market whose quote asset IS WETH,`,
    "    // which is what this test pins. Any other quote gets the corrected sentence.",
    '    "The RELICS and treasury allocations divide the net WETH received after conversion.",',
  ].join("\n");
  assert(scanTextForRetiredClaims(withReason).length === 0, "the marker did not reach across its own explanation");

  // But it does not reach arbitrarily far.
  const tooFar = [`// ${CONDITIONALLY_TRUE_MARKER}`, "//", "//", "//", '"divide the net WETH received after conversion"'].join("\n");
  assert(scanTextForRetiredClaims(tooFar).length > 0, "the marker reached further than its stated lookback");
});

test("a detector may name what it detects", () => {
  const detector = `// ${DETECTOR_SELF_REFERENCE_MARKER}\nconst p = "TREASURY_WETH_ONLY";\nconst q = "6.25%";`;
  assert(scanTextForRetiredClaims(detector).length === 0, "a self-declared detector was reported by the thing it detects");
  const notDetector = 'const p = "TREASURY_WETH_ONLY";';
  assert(scanTextForRetiredClaims(notDetector).length > 0, "the marker is doing nothing, or everything is exempt");
});

test("naming a counter is describing the gate, not asserting the claim", () => {
  // The counter name normalises to a phrase its own pattern matches, so any document explaining
  // the check would report itself.
  const mention = "never write that it has no claim in a non-WETH quote — `ACTIVE_STALE_PLATFORM_TREASURY_WETH_ONLY_CLAIMS` scans for it";
  assert(scanTextForRetiredClaims(mention).length === 0, "naming the counter triggered the counter");
});

test("a supersession marker exempts a file only as a BANNER", () => {
  const banner = "# Title\n\n> SUPERSEDED_HISTORICAL_DO_NOT_USE_FOR_LAUNCH\n\nbody";
  assert(hasSupersessionBanner(banner), "a real banner was not recognised");

  // A guide that merely explains the convention, deep in the file, must NOT exempt itself — that
  // loophole would carry every retired claim below it too.
  const mention = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n") + "\nHistorical reports are bannered SUPERSEDED_HISTORICAL_DO_NOT_USE_FOR_LAUNCH.";
  assert(!hasSupersessionBanner(mention), "a passing mention exempted the whole file");
});

test("normalisation collapses identifier, comment and prose spellings to one string", () => {
  const forms = ["TREASURY_WETH_ONLY", "treasuryWethOnly", "treasury-weth-only", "Treasury Weth Only", "treasury.weth.only"];
  const normalized = forms.map(normalizeForClaimScan);
  for (const n of normalized) assert(n.includes("treasury weth only"), `normalisation left ${n} unmatched`);
  // Percentages must survive, or the retired-figure patterns stop working.
  assert(normalizeForClaimScan("6.25% of collected").includes("6.25%"), "normalisation destroyed a percentage");
});

test("waiting for a route is a normal state, not a failure", () => {
  assert(PLATFORM_SETTLEMENT_STATUSES.includes("BUYBACK_ALLOCATED_AWAITING_ROUTE"), "the awaiting-route state is missing");
  assert(ALLOCATED_PLATFORM_STATUSES.includes("BUYBACK_ALLOCATED_AWAITING_ROUTE"), "awaiting a route must still count as allocated");
  assert(!ALLOCATED_PLATFORM_STATUSES.includes("RETRYABLE_FAILURE"), "a failure is not an allocation");
});

test("the platform entitlement is denominated in the selected quote, with WETH as the special case", () => {
  assert(PLATFORM_ENTITLEMENT_MODEL.entitlementAsset === "SELECTED_QUOTE", "the entitlement asset is not the selected quote");
  assert(PLATFORM_ENTITLEMENT_MODEL.projectTokenDirectPlatformClaim === false, "the platform must take no direct project-token claim");
  assert(PLATFORM_ENTITLEMENT_MODEL.buybackTerminalAsset === "WETH", "the buyback still ends in WETH");
  assert(/SELECTED QUOTE/.test(PLATFORM_SETTLEMENT_INVARIANT), "the invariant does not name the settlement asset");
  assert(/special case/.test(PLATFORM_SETTLEMENT_INVARIANT), "the invariant does not mark WETH as the special case");
  assert(!/^Of NET SETTLED platform WETH/.test(PLATFORM_SETTLEMENT_INVARIANT), "the invariant still defines itself on WETH");
});

test("quote admission is NOT gated on a proven WETH route, and that is stated rather than omitted", () => {
  assert(QUOTE_ADMISSION_REQUIRES_PROVEN_WETH_ROUTE === false, "a proven-WETH-route admission rule came back");
});

test("the retired register catches the WETH-only platform claims", () => {
  const byId = Object.fromEntries(RETIRED_ALLOCATION_CLAIMS.map((c) => [c.id, new RegExp(c.pattern, "gi")]));
  const wethOnly = byId.PLATFORM_TREASURY_ASSET_WETH_ONLY;
  const noQuoteClaim = byId.PLATFORM_DIRECT_NON_WETH_QUOTE_CLAIM_NO;
  assert(wethOnly && noQuoteClaim, "the two quote-model retired claims are not registered");
  for (const s of [
    "PLATFORM_TREASURY_ASSET=WETH_ONLY",
    "| PLATFORM_TREASURY_ASSET | **WETH_ONLY** |",
    "TREASURY_WETH_ONLY",
    "platform-treasury-WETH-only",
    "Platform treasury stays **WETH-only**.",
    "the platform NEVER has a token entitlement",
    "the platform is only paid in WETH",
  ]) {
    wethOnly.lastIndex = 0;
    assert(wethOnly.test(s), `the WETH-only pattern misses: ${s}`);
  }
  for (const s of [
    "PLATFORM_DIRECT_NON_WETH_QUOTE_CLAIM=NO",
    "the platform cannot claim in a non-WETH quote",
    "the treasury never acquires a claim on a non-WETH asset",
  ]) {
    noQuoteClaim.lastIndex = 0;
    assert(noQuoteClaim.test(s), `the no-direct-quote-claim pattern misses: ${s}`);
  }
  // The line the patterns must NOT cross: a fact about a specific deployment stays sayable.
  wethOnly.lastIndex = 0;
  assert(!wethOnly.test("the locker at this integration HEAD is WETH-denominated"), "the pattern forbids an honest deployment fact");
});

test("the register catches references to selectors removed from the bytecode", () => {
  const removed = RETIRED_ALLOCATION_CLAIMS.find((c) => c.id === "REMOVED_KERNEL_SELECTORS");
  assert(removed, "the removed-selector claim is not registered");
  const re = new RegExp(removed.pattern, "gi");
  for (const s of [
    '"name": "subdividePlatformWeth"',
    '"name": "TREASURY_SOURCE_ASSET_CLAIM"',
    "kernel.subdividePlatformWeth(poolId)",
    'functionName: "TREASURY_SOURCE_ASSET_CLAIM"',
  ]) {
    re.lastIndex = 0;
    assert(re.test(s), `the removed-selector pattern misses a real reference: ${s}`);
  }
  // Describing the removal is not depending on it, and must stay sayable.
  for (const s of [
    "subdividePlatformWeth was removed from the bytecode",
    "TREASURY_SOURCE_ASSET_CLAIM no longer exists",
  ]) {
    re.lastIndex = 0;
    assert(!re.test(s), `the pattern forbids describing the removal: ${s}`);
  }
});

test("splitting the entitlement conserves every unit and floors toward the treasury", () => {
  for (const units of [0n, 1n, 2n, 3n, 999n, 1000n, 10n ** 18n, 123456789987654321n]) {
    const { buybackReserve, treasuryRetained } = allocatePlatformEntitlement(units);
    assert(buybackReserve + treasuryRetained === units, `the split of ${units} does not conserve the input`);
    assert(buybackReserve * BigInt(BPS_DENOMINATOR) <= units * BigInt(RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE), `the buyback slice of ${units} exceeds its ceiling`);
    // The deprecated alias must be the same function, not a second implementation.
    const legacy = allocateSettledPlatformWeth(units);
    assert(legacy.buybackReserve === buybackReserve && legacy.treasuryRetained === treasuryRetained, "the deprecated alias diverged");
  }
  assert(allocatePlatformEntitlement(1n).buybackReserve === 0n, "one unit must floor to zero buyback, not round up");
  // 6-decimal assets exist (USDG); the split must be unit-agnostic, not wei-shaped.
  assert(allocatePlatformEntitlement(1_000_000n).buybackReserve === 500_000n, "the split is not unit-agnostic");
  let threw = false;
  try {
    allocatePlatformEntitlement(100);
  } catch {
    threw = true;
  }
  assert(threw, "a JS number was accepted for economic math");
});

// ---------------------------------------------------------------- chain vocabulary

/**
 * THE ASSERTIONS, FACTORED OUT SO THEY CAN BE RUN AGAINST A LIE.
 *
 * A vocabulary test that only ever sees correct data proves nothing: it passes on the day it is
 * written and would pass just as happily if someone replaced WBNB with WETH. Everything below is a
 * function of the profile table, and the mutation test underneath feeds it deliberately wrong
 * tables and requires each one to be REJECTED. A test that has never been shown to fail is not
 * evidence.
 *
 * @param {Record<number, any>} profiles
 * @param {readonly number[]} chainIds
 */
function assertChainVocabulary(profiles, chainIds) {
  const must = (cond, why) => {
    if (!cond) throw new Error(why);
  };

  for (const id of [1, 8453, 4663, 56]) must(chainIds.includes(id), `chain ${id} is not in the supported set`);

  const bnb = profiles[56];
  must(bnb, "chain 56 has no profile");
  must(bnb.nativeSymbol === "BNB", `BNB's native symbol is ${bnb.nativeSymbol}, not BNB`);
  must(bnb.wrappedNativeSymbol === "WBNB", `BNB's wrapped native is ${bnb.wrappedNativeSymbol}, not WBNB`);

  // WBNB is the ONLY admitted quote on BNB this release. A second entry is a BEP-20 the owner did
  // not admit, whatever its liquidity.
  must(bnb.canonicalQuoteSymbols.length === 1, `BNB admits ${bnb.canonicalQuoteSymbols.length} quotes; RC3 admits exactly one`);
  must(bnb.canonicalQuoteSymbols[0] === "WBNB", `BNB's only admitted quote is ${bnb.canonicalQuoteSymbols[0]}, not WBNB`);

  // The fabrication this exists to prevent: WBNB is not WETH, so there is nothing to identity-convert.
  must(bnb.buybackRouteState === "ROUTE_UNPROVEN", `BNB claims buyback route ${bnb.buybackRouteState}; no route is proven`);

  // The three Ether chains keep their own truth — the point is per-chain data, not a new default.
  for (const id of [1, 8453, 4663]) {
    must(profiles[id].nativeSymbol === "ETH", `chain ${id} native symbol drifted`);
    must(profiles[id].wrappedNativeSymbol === "WETH", `chain ${id} wrapped native drifted`);
    must(profiles[id].buybackRouteState === "IDENTITY_WETH", `chain ${id} buyback route drifted`);
  }

  // No chain's settlement symbol may be reachable by guessing.
  const symbols = new Set(Object.values(profiles).map((p) => p.wrappedNativeSymbol));
  must(symbols.size > 1, "every chain reports the same wrapped-native symbol, so a hardcoded default would still pass");

  // ---- NFT secondary creator earnings ---------------------------------------------------------
  // NONE and OPTIONAL are unconditional: they depend on no marketplace integration, so no chain
  // fact may remove them. A chain that "supports" neither would be a chain a creator cannot ask
  // for anything on, which is not a state this product has.
  for (const id of chainIds) {
    const modes = profiles[id]?.creatorEarningsModes;
    must(Array.isArray(modes), `chain ${id} declares no creatorEarningsModes`);
    must(modes.includes("NONE"), `chain ${id} does not offer NONE, which is unconditional`);
    must(modes.includes("OPTIONAL"), `chain ${id} does not offer OPTIONAL, which needs no marketplace integration`);
    for (const m of modes) must(["NONE", "OPTIONAL", "ENFORCED"].includes(m), `chain ${id} declares unknown earnings mode ${m}`);
  }

  // ENFORCED is the one mode whose availability is not ours to decide.
  //
  // Ethereum (1), Base (8453) and — since the 2026-08-18 owner decision recorded in vocabulary.js
  // — Robinhood Chain (4663) list it. Robinhood's admission is the VETTING half being done: its own
  // measured validator codehash is pinned in CreatorEarningsPolicy under policy version 3 only, for
  // OpenSea's StrictAuthorizedTransferSecurityRegistry.
  //
  // BNB Smart Chain is still not one of them, and for a reason no contract work can change: OpenSea
  // carries no NFT listings or offers on that chain at all, so there is no order book for
  // enforcement to act on. Live validator bytecode at the canonical addresses does not change that
  // either — Limit Break's v5 deploys permissionlessly to identical addresses on any EVM chain.
  must(!profiles[56].creatorEarningsModes.includes("ENFORCED"), "BNB Smart Chain claims ENFORCED earnings; OpenSea carries no NFT orders on that chain");
  for (const id of [1, 8453, 4663]) {
    must(profiles[id].creatorEarningsModes.includes("ENFORCED"), `chain ${id} lost ENFORCED, which it does support`);
  }

  // And the capability must actually vary. If every chain listed the same modes, none of the
  // assertions above would be testing a per-chain fact.
  const modeSets = new Set(chainIds.map((id) => profiles[id].creatorEarningsModes.join(",")));
  must(modeSets.size > 1, "every chain offers the same earnings modes, so a hardcoded list would still pass");
}

test("BNB Smart Chain is first-class, and WBNB is its only admitted quote", () => {
  assertChainVocabulary(CHAIN_PROFILES, SUPPORTED_CHAIN_IDS);
  assert(CHAIN_LABELS[56] === "BNB Smart Chain", "chain 56 has no label");
  assert(chainProfile(56).wrappedNativeSymbol === "WBNB", "the accessor disagrees with the table");
  assert(chainProfile(137) === null, "an unsupported chain returned a profile");
});

test("burn policy: NONE is the default, the enum mirrors the contract, and burning is opt-in", () => {
  assert(BURN_POLICIES.join(",") === "NONE,HOLDER_BURN,HOLDER_AND_ALLOWANCE_BURN", "the burn-policy enum drifted from ProjectToken.BurnPolicy");
  // Index for index with the Solidity enum. A reordering here silently relabels every launch.
  assert(BURN_POLICY_TO_INDEX.NONE === 0, "NONE must be enum index 0");
  assert(BURN_POLICY_TO_INDEX.HOLDER_BURN === 1, "HOLDER_BURN must be enum index 1");
  assert(BURN_POLICY_TO_INDEX.HOLDER_AND_ALLOWANCE_BURN === 2, "HOLDER_AND_ALLOWANCE_BURN must be enum index 2");
  assert(DEFAULT_BURN_POLICY === "NONE", "the default must be the policy that cannot decrease supply");

  assert(!burnPolicyAllowsBurning("NONE"), "NONE must not permit burning");
  assert(burnPolicyAllowsBurning("HOLDER_BURN"), "HOLDER_BURN must permit burning");
  assert(burnPolicyAllowsBurning("HOLDER_AND_ALLOWANCE_BURN"), "HOLDER_AND_ALLOWANCE_BURN must permit burning");
  assert(!burnPolicyAllowsBurning("SOMETHING_ELSE"), "an unknown policy must never read as burning");
});

test("burn policy: a bundle that says nothing launches a token that cannot burn", () => {
  // The whole reason 3.2.0 is a MINOR and not a MAJOR. Silence must mean NONE -- which is exactly
  // what every bundle written before the field existed already meant. These assert on the burn
  // ISSUE CODE rather than whole-manifest validity, so an unrelated required field cannot make
  // the test look like it is checking burn policy when it is not.
  const supplyOnly = (burnPolicy) => {
    const supply = { totalSupplyWhole: "1000000", artworkSupply: "1000", backingModel: "PARTIAL", tokensPerArtwork: "1000" };
    if (burnPolicy !== undefined) supply.burnPolicy = burnPolicy;
    return validateManifest({ supply }).filter((i) => i.code === "SUPPLY_BURN_POLICY");
  };

  assert(supplyOnly(undefined).length === 0, "an absent burnPolicy must be accepted and mean NONE");
  for (const policy of BURN_POLICIES) {
    assert(supplyOnly(policy).length === 0, `burnPolicy ${policy} must be accepted`);
  }

  const bad = supplyOnly("BURN_ANYONES");
  assert(bad.length === 1, "an invented burn policy must be refused");
  assert(/can never be changed/.test(bad[0].message), "the refusal must state that the policy is immutable at launch");

  // The dangerous near-miss: a policy that reads like a real one.
  assert(supplyOnly("ALLOWANCE_BURN").length === 1, "a near-miss policy name must be refused, not coerced");
  assert(supplyOnly("none").length === 1, "the enum is case-sensitive; a lowercase value is not the NONE member");
});

test("burn policy: live chain state is refused by name", () => {
  // currentSupply changes with every burn and cumulativeBurned is zero at launch by construction.
  // A bundle asserting either would be asserting a history that has not happened -- the same rule
  // that already refuses runtimeCodeHash and scriptPointer.
  for (const key of ["currentSupply", "cumulativeBurned"]) {
    assert(typeof REFUSED_MANIFEST_KEYS[key] === "string", `${key} must be refused by name with an explanation`);
    const issues = validateManifest({ [key]: "1000" });
    assert(
      issues.some((i) => i.code === "MANIFEST_REFUSED_KEY" && i.where.includes(key)),
      `a bundle asserting ${key} must be specifically refused`,
    );
  }
});

test("burn policy: the creator copy is exactly what was specified, and names the immutability", () => {
  const byPolicy = Object.fromEntries(BURN_POLICY_CARDS.map((c) => [c.policy, c]));
  assert(BURN_POLICY_CARDS.length === BURN_POLICIES.length, "every policy needs a card");
  assert(byPolicy.NONE.summary === "Supply can never decrease.", "NONE copy drifted");
  assert(byPolicy.HOLDER_BURN.summary === "Any holder may permanently destroy their own tokens.", "HOLDER_BURN copy drifted");
  assert(
    byPolicy.HOLDER_AND_ALLOWANCE_BURN.summary.startsWith("Holders may burn directly or authorize another contract to burn within an allowance."),
    "HOLDER_AND_ALLOWANCE_BURN copy drifted",
  );
  assert(
    /burn-to-activate.*burn-to-mint.*buyback-and-burn/.test(byPolicy.HOLDER_AND_ALLOWANCE_BURN.summary),
    "the integration list must stay in the allowance card",
  );
  // The confirmation is required copy, not a nicety: the policy cannot be changed after launch.
  assert(/never be changed/.test(BURN_POLICY_IMMUTABILITY_ACK), "the acknowledgment must state that the policy is permanent");
});

test("burn policy: the flagship contrast says RELICS does not burn", () => {
  // A creator reading about their own burnable token must not conclude that RELICS burns.
  const c = RELICS_BURN_CONTRAST_COPY;
  assert(/non-burnable/.test(c), "the contrast must say the RELICS token is non-burnable");
  assert(/buy-and-entomb/.test(c), "the contrast must name buy-and-entomb as the RELICS mechanism");
  assert(/10,000/.test(c), "the contrast must state the fixed RELICS supply");
  assert(!/buy-and-burn/.test(c), "the RELICS mechanism is never buy-and-burn");
});

test("anti-snipe: the RC6 election is independent of launchMode and is never sold as Sybil-proof", () => {
  assert(
    ANTI_SNIPE_WIRE_VALUES.join(",") === "UNSPECIFIED,NONE,PROTECTED_98_MINUTES",
    "the anti-snipe wire value set drifted",
  );

  // The indices are consensus values. Renumbering them silently re-elects every bundle in the
  // corpus, so they are pinned literally rather than derived from the array.
  assert(ANTI_SNIPE_MODE_TO_INDEX.UNSPECIFIED === 0, "UNSPECIFIED must be wire index 0");
  assert(ANTI_SNIPE_MODE_TO_INDEX.NONE === 1, "NONE must be wire index 1");
  assert(ANTI_SNIPE_MODE_TO_INDEX.PROTECTED_98_MINUTES === 2, "PROTECTED_98_MINUTES must be wire index 2");
  for (const v of ANTI_SNIPE_WIRE_VALUES) {
    assert(ANTI_SNIPE_MODE_TO_INDEX[v] === ANTI_SNIPE_WIRE_VALUES.indexOf(v), `${v} index disagrees with its position`);
  }

  // Zero is never a final election. A draft may carry UNSPECIFIED; an export may not, because
  // defaulting it would invent an economic choice the creator never made.
  assert(!ANTI_SNIPE_ELECTIONS.includes("UNSPECIFIED"), "UNSPECIFIED must not be electable in a final bundle");
  assert(ANTI_SNIPE_ELECTIONS.join(",") === "NONE,PROTECTED_98_MINUTES", "the electable set drifted");

  // INDEPENDENCE IS THE POINT OF RC6. The retired vocabulary mapped each anti-snipe posture onto a
  // launch mode, which meant a creator could not elect protection without also changing how their
  // launch sold. Assert the conflation is gone rather than trusting the comment that says so.
  assert(
    typeof ANTI_SNIPE_MODE_TO_INDEX === "object" && !("INSTANT_V4" in ANTI_SNIPE_MODE_TO_INDEX),
    "an anti-snipe value is still keyed by launch mode",
  );
  for (const m of LAUNCH_MODES) {
    assert(!ANTI_SNIPE_WIRE_VALUES.includes(m), `${m} is a launch mode and must not also be an anti-snipe value`);
  }

  // The claim that must never appear. A fee ramp raises the cost of an early buy; it does not
  // identify a buyer, and an attacker splits across addresses for the price of gas.
  const forbidden = /sybil[- ]?(proof|resistant)|prevents? bots|stops? snipers|guarantees? fair|bot[- ]?proof|one person per/i;
  for (const v of ANTI_SNIPE_WIRE_VALUES) {
    const copy = ANTI_SNIPE_MODE_COPY[v];
    assert(typeof copy === "string" && copy.length > 0, `${v} has no copy`);
    assert(!forbidden.test(copy), `${v} copy makes a Sybil-resistance claim: "${copy}"`);
  }

  // The protected mode's copy must state the arithmetic, not an intention: 98 minutes is 5,880
  // seconds and the sell side is never ramped.
  assert(/5,880 seconds/.test(ANTI_SNIPE_MODE_COPY.PROTECTED_98_MINUTES), "the protected mode must state its exact duration");
  assert(/99% to 1%/.test(ANTI_SNIPE_MODE_COPY.PROTECTED_98_MINUTES), "the protected mode must state the buy-fee range");
  assert(/sell LP fee stays at 1%/.test(ANTI_SNIPE_MODE_COPY.PROTECTED_98_MINUTES), "the protected mode must say the sell fee is unramped");

  assert(/not Sybil-resistant/i.test(ANTI_SNIPE_NOT_SYBIL_PROOF_COPY), "the disclaimer must state that these are not Sybil-resistant");
  assert(/cost of gas/i.test(ANTI_SNIPE_NOT_SYBIL_PROOF_COPY), "the disclaimer must say why: splitting across addresses is cheap");
});

test("BNB can launch with earnings; it just cannot claim enforced ones", () => {
  // The whole point of stating earnings capability per chain: an unavailable ENFORCED must not
  // take a BNB launch down with it. NONE and OPTIONAL are enough to launch, on every chain.
  const modesOf = (id) => [...creatorEarningsModesFor(id)].join(",");
  assert(modesOf(56) === "NONE,OPTIONAL", `BNB's earnings capability drifted to ${modesOf(56)}`);
  assert(modesOf(1) === "NONE,OPTIONAL,ENFORCED", `Ethereum's earnings capability drifted to ${modesOf(1)}`);
  assert(modesOf(8453) === "NONE,OPTIONAL,ENFORCED", `Base's earnings capability drifted to ${modesOf(8453)}`);
  assert(modesOf(4663) === "NONE,OPTIONAL,ENFORCED", `Robinhood's earnings capability drifted to ${modesOf(4663)}`);

  assert(enforcedEarningsAvailableOn(1) && enforcedEarningsAvailableOn(8453) && enforcedEarningsAvailableOn(4663), "an enforced-capable chain lost the capability");
  assert(!enforcedEarningsAvailableOn(56), "ENFORCED must not be offerable on BNB Smart Chain");

  // Every chain keeps the two unconditional modes, so no launch is ever blocked by this.
  for (const id of SUPPORTED_CHAIN_IDS) {
    const modes = creatorEarningsModesFor(id);
    assert(modes.includes("NONE") && modes.includes("OPTIONAL"), `chain ${id} cannot launch with earnings at all`);
  }

  // An unknown chain refuses rather than returning the full list — the plausible answer here is
  // the one that could put a creator into a mode their chain will refuse at launch.
  let threw = false;
  try {
    creatorEarningsModesFor(137);
  } catch {
    threw = true;
  }
  assert(threw, "creatorEarningsModesFor answered for an unknown chain instead of refusing");
});

test("the chain-vocabulary assertions FAIL under mutation", () => {
  // Each mutation is a plausible mistake someone could actually make, and each must turn the
  // assertions red. A mutation that survives means the matching assertion is decorative.
  const base = () => JSON.parse(JSON.stringify(CHAIN_PROFILES));
  const ids = [...SUPPORTED_CHAIN_IDS];

  const mutations = [
    ["settlement symbol -> WETH", () => { const p = base(); p[56].wrappedNativeSymbol = "WETH"; return [p, ids]; }],
    ["native symbol -> ETH", () => { const p = base(); p[56].nativeSymbol = "ETH"; return [p, ids]; }],
    ["buyback route -> IDENTITY_WETH", () => { const p = base(); p[56].buybackRouteState = "IDENTITY_WETH"; return [p, ids]; }],
    ["an unadmitted BEP-20 quote", () => { const p = base(); p[56].canonicalQuoteSymbols = ["WBNB", "USDT"]; return [p, ids]; }],
    ["the only quote swapped for a stablecoin", () => { const p = base(); p[56].canonicalQuoteSymbols = ["USDT"]; return [p, ids]; }],
    ["chain 56 dropped from the supported set", () => [base(), ids.filter((c) => c !== 56)]],
    ["an Ether chain relabelled to WBNB", () => { const p = base(); p[1].wrappedNativeSymbol = "WBNB"; return [p, ids]; }],
    ["every chain given the same symbol", () => { const p = base(); for (const k of Object.keys(p)) p[k].wrappedNativeSymbol = "WETH"; return [p, ids]; }],
    // The mistake this release exists to prevent: reading live validator bytecode on chain 56 as
    // permission to light the ENFORCED toggle.
    ["ENFORCED granted to BNB", () => { const p = base(); p[56].creatorEarningsModes = ["NONE", "OPTIONAL", "ENFORCED"]; return [p, ids]; }],
    // The mirror image of the BNB mistake: withdrawing an admission the owner HAS made. Robinhood
    // was admitted on 2026-08-18 and the assertions must notice if it silently disappears.
    ["ENFORCED withdrawn from Robinhood", () => { const p = base(); p[4663].creatorEarningsModes = ["NONE", "OPTIONAL"]; return [p, ids]; }],
    // The opposite failure: letting an unavailable ENFORCED take OPTIONAL down with it. BNB launches
    // are not blocked by any of this.
    ["OPTIONAL withdrawn from BNB", () => { const p = base(); p[56].creatorEarningsModes = ["NONE"]; return [p, ids]; }],
    ["NONE withdrawn from BNB", () => { const p = base(); p[56].creatorEarningsModes = ["OPTIONAL"]; return [p, ids]; }],
    ["ENFORCED withdrawn from Ethereum", () => { const p = base(); p[1].creatorEarningsModes = ["NONE", "OPTIONAL"]; return [p, ids]; }],
    ["every chain given the same earnings modes", () => { const p = base(); for (const k of Object.keys(p)) p[k].creatorEarningsModes = ["NONE", "OPTIONAL", "ENFORCED"]; return [p, ids]; }],
    ["an invented earnings mode", () => { const p = base(); p[56].creatorEarningsModes = ["NONE", "OPTIONAL", "GUARANTEED"]; return [p, ids]; }],
  ];

  for (const [name, mutate] of mutations) {
    const [profiles, chainIds] = mutate();
    let rejected = false;
    try {
      assertChainVocabulary(profiles, chainIds);
    } catch {
      rejected = true;
    }
    assert(rejected, `MUTATION SURVIVED: "${name}" — the assertions accept it, so they are not testing it`);
  }

  // And the unmutated table must still pass, or the harness is rejecting everything.
  assertChainVocabulary(CHAIN_PROFILES, SUPPORTED_CHAIN_IDS);
});

test("there is no fallback settlement symbol to guess with", () => {
  // The `?? "WETH"` default was right on every chain that existed when it was written. On BNB it is
  // wrong, and a default that is right until it is silently wrong is worse than a refusal.
  for (const id of SUPPORTED_CHAIN_IDS) {
    assert(typeof wrappedNativeSymbolFor(id) === "string", `chain ${id} has no wrapped-native symbol`);
    assert(typeof nativeSymbolFor(id) === "string", `chain ${id} has no native symbol`);
  }
  for (const fn of [wrappedNativeSymbolFor, nativeSymbolFor]) {
    let threw = false;
    try {
      fn(137);
    } catch {
      threw = true;
    }
    assert(threw, `${fn.name} returned something for an unknown chain instead of refusing`);
  }
  assert(wrappedNativeSymbolFor(56) === "WBNB" && wrappedNativeSymbolFor(1) === "WETH", "the accessor returns one symbol for every chain");
});

test("NATIVE_WRAPPED is canonical and NATIVE_WETH still resolves to it", () => {
  assert(QUOTE_ASSET_KINDS.includes("NATIVE_WRAPPED"), "the chain-neutral kind is missing");
  assert(QUOTE_ASSET_KINDS.includes("NATIVE_WETH"), "the deprecated alias was removed, invalidating existing bundles");
  assert(canonicalQuoteAssetKind("NATIVE_WETH") === "NATIVE_WRAPPED", "the alias does not map to the canonical kind");
  assert(canonicalQuoteAssetKind("NATIVE_WRAPPED") === "NATIVE_WRAPPED", "the canonical kind was rewritten");
  assert(canonicalQuoteAssetKind("STABLE") === "STABLE", "an unrelated kind was rewritten");
  assert(DEPRECATED_QUOTE_ASSET_KIND_ALIASES.NATIVE_WETH === "NATIVE_WRAPPED", "the alias table disagrees with the function");
});

test("a chain-56 bundle is refused by a 3.0.0 importer, and accepted here", () => {
  // The whole reason the schema version moved: an importer predating chain 56 cannot launch a
  // chain-56 bundle and must say so, rather than accept it and fail later.
  assert(isSchemaCompatible("3.1.0", "3.1.0"), "the current schema rejects its own bundles");
  assert(!isSchemaCompatible("3.1.0", "3.0.0"), "a 3.0.0 importer accepted a 3.1.0 bundle it cannot launch");
  assert(isSchemaCompatible("3.0.0", "3.1.0"), "a 3.0.0 bundle stopped importing after an additive change");
});

// ---------------------------------------------------------------- creator-kit hardening

test("a symbol may start with a digit, and the rule lives in one place", () => {
  // 1INCH, 0X and 9LIVES are real tokens. A leading-letter requirement is a ROUTING constraint;
  // applying it to an economic identifier silently renames someone's project.
  for (const ok of ["1INCH", "0X", "9LIVES", "RELICS", "A", "ABCDEFGHIJK"]) {
    assert(SYMBOL_RE.test(ok), `${ok} was rejected but is a legal symbol`);
  }
  for (const bad of ["", "lower", "A-B", "A B", "ABCDEFGHIJKL", "ÅB"]) {
    assert(!SYMBOL_RE.test(bad), `${bad} was accepted but is not a legal symbol`);
  }
  // Length is INSIDE the pattern, not a separate check each call site must remember.
  assert(SYMBOL_RE.source.includes("{1,11}"), "the length bound left the canonical pattern");
});

test("draft identity is intrinsic — a rename cannot launder one", () => {
  assert(BUNDLE_STATUSES.join(",") === "FINAL,DRAFT", "the status vocabulary drifted");
  assert(DRAFT_MAGIC !== BUNDLE_MAGIC, "a draft carries the same archive marker as a bundle");
  assert(DRAFT_EXTENSION !== ".relics", "a draft carries the launchable extension");
  assert(magicForStatus("DRAFT") === DRAFT_MAGIC && magicForStatus("FINAL") === BUNDLE_MAGIC, "status does not select the marker");

  // The commitment differs for byte-identical content, because the marker is in the preimage.
  const a = computeBundleCommitment("cfg", "content", BUNDLE_MAGIC);
  const b = computeBundleCommitment("cfg", "content", DRAFT_MAGIC);
  assert(a !== b, "a draft and a final bundle commit to the same value");

  // And FINAL commitments are unchanged by the feature existing.
  assert(computeBundleCommitment("cfg", "content") === a, "the default commitment changed for final bundles");
});

test("a draft archive is refused as a bundle no matter what it is called", () => {
  const bytes = writeContainer([{ path: "relics.project.json", bytes: utf8("{}") }], { magic: DRAFT_MAGIC });
  let refused = false;
  try {
    readContainer(bytes);
  } catch (err) {
    refused = err instanceof ContainerError;
  }
  assert(refused, "a draft archive was accepted as a launchable bundle");
  // It is still readable when a caller deliberately asks for it — review needs to open drafts.
  const opened = readContainer(bytes, { requireMagic: false });
  assert(opened.byPath.has("relics.project.json"), "a draft cannot be opened for review");
});

test("a fresh JavaScript scaffold has templateId null, and that is correct", () => {
  // RETRACTED FINDING, PINNED. This was reported as a bug and is not one: a scaffold that has not
  // been bound to a published template has no template id, and inventing one would be a claim
  // about provenance nobody made. The test exists so it is not "fixed" later.
  const parity = JSON.parse(readFileSync(join(FIXTURES, "parity/expected.json"), "utf8"));
  const js = parity.bundles.find((b) => b.manifest?.art?.runtime === "JAVASCRIPT");
  if (js) assert(js.manifest.art.templateId === null, "a JavaScript scaffold gained a fabricated templateId");
});

// ---------------------------------------------------------------- summary

console.log("");
if (failures.length > 0) {
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  console.log("");
}
console.log(`  ${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
