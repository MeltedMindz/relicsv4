// SPDX-License-Identifier: MIT
// `relics.project.json` — the bundle manifest. This file defines the whole key space and refuses
// anything outside it.
//
// STRUCTURAL REFUSAL OF ARBITRARY CONTRACT CODE
// ---------------------------------------------
// The manifest is a CLOSED schema: every accepted key is listed here, and an unknown key is an
// error, not a passthrough. There is deliberately no field for hook code, contract bytecode, an
// init-code hash, an address to call, a library to link, or a template to compile. Combined with
// the container's forbidden-extension list (`.sol`, `.vy`, `.yul`, `.wasm`, …), that means a
// one-click bundle cannot express "run this contract" at all — not as code, not as a reference,
// not as a hint. Replacing ArtHook, the economic kernel, the liquidity kernel, ProjectToken,
// ProjectCollection, the sale escrow, the router or the buyback is not a thing the format can
// say. A custom hook needs the separate reviewed process; there is no bundle path to it.

import { LIMITS } from "./limits.js";
import { error, warn } from "./issues.js";
import {
  SUPPORTED_CHAIN_IDS,
  APPROVED_ART_RUNTIMES,
  UNAPPROVED_ART_RUNTIMES,
  ART_RUNTIMES,
  STARTING_PRESETS,
  BACKING_MODELS,
  LAUNCH_MODES,
  CURVE_PRESETS,
  EARNINGS_MODES,
  QUOTE_ASSET_REQUEST_MODES,
  QUOTE_ASSET_KINDS,
  CREATOR_LP_FEE_ASSET_MODES,
} from "./vocabulary.js";
import { isSchemaCompatible, SCHEMA_VERSION, RUNTIME_VERSION, PROTOCOL_RELEASE_COMPATIBILITY, parseSemver, explainIncompatibility } from "./version.js";
import { isSha256Hex } from "./hashes.js";
import { ART_BINDING_KEYS, ART_CONFIG_SOURCES, ART_CONFIG_FORMATS, ART_RUNTIME_TO_CONFIG_FORMAT, CHAIN_RESOLVED_BINDING_FIELDS } from "./binding.js";
import { isArtConfigV1, validateArtConfigV1, hashArtConfigV1 } from "./art-config-v1.js";
import { isKeccak256Hex } from "./keccak256.js";

/** Top-level manifest keys. Anything else is refused. */
export const MANIFEST_KEYS = Object.freeze([
  "schemaVersion",
  "creatorKitVersion",
  "runtimeVersion",
  "protocolReleaseCompatibility",
  "generatedBy",
  "project",
  "supply",
  "art",
  "market",
  "earnings",
  "chains",
  "media",
  "hashes",
  "artBinding",
  "integrity",
]);

/**
 * Keys that are refused with a specific explanation rather than a generic "unknown key", because
 * they are the shapes an attacker (or an over-eager tool) would reach for when trying to smuggle
 * executable or protocol-replacing configuration through a bundle.
 */
export const REFUSED_MANIFEST_KEYS = Object.freeze({
  hook: "a bundle cannot configure or supply a hook",
  hooks: "a bundle cannot configure or supply a hook",
  hookAddress: "a bundle cannot name a hook address",
  hookSource: "a bundle cannot carry hook source",
  hookBytecode: "a bundle cannot carry bytecode",
  bytecode: "a bundle cannot carry bytecode",
  initCode: "a bundle cannot carry init code",
  initCodeHash: "a bundle cannot pin an init-code hash",
  contracts: "a bundle configures art, never contracts",
  solidity: "a bundle configures art, never contracts",
  kernel: "the economic and liquidity kernels are protocol code, not bundle configuration",
  economicKernel: "the economic kernel is protocol code, not bundle configuration",
  liquidityKernel: "the liquidity kernel is protocol code, not bundle configuration",
  projectToken: "ProjectToken is protocol code, not bundle configuration",
  projectCollection: "ProjectCollection is protocol code, not bundle configuration",
  saleEscrow: "the sale escrow is protocol code, not bundle configuration",
  router: "the router is protocol code, not bundle configuration",
  buyback: "the buyback is protocol policy, not bundle configuration",
  calls: "a bundle cannot describe calls to make",
  multicall: "a bundle cannot describe calls to make",
  delegatecall: "a bundle cannot describe calls to make",
  scripts: "a bundle carries no lifecycle scripts; nothing in it is executed on import",
  postinstall: "a bundle carries no lifecycle scripts; nothing in it is executed on import",
  quoteAssetRegistry: "a bundle cannot supply a quote-asset registry — the importer resolves quote assets against the launchpad's own current registry, and a bundle can never widen the set of approved assets",
  approvedQuoteAssets: "a bundle cannot approve a quote asset; market.quoteAsset REQUESTS one and the importer resolves it",
  quoteAssetOverride: "a bundle cannot override quote-asset approval",
  runtimeCodeHash:
    "a bundle cannot pin a renderer's code hash — the importer reads it from the chain being launched on, and a bundle that could pin a renderer could pin one of its choosing",
  scriptPointer: "a bundle cannot name a script pointer; the storage address does not exist until the launch transaction writes it",
  artRuntimeAddress: "a bundle cannot name a runtime address",
  renderer: "the renderer is protocol code selected by runtime id, not an address a bundle supplies",
  rpcUrl: "a bundle never carries an endpoint",
  rpc: "a bundle never carries an endpoint",
  apiKey: "a bundle never carries credentials",
  privateKey: "a bundle never carries key material",
  mnemonic: "a bundle never carries key material",
});

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SYMBOL_RE = /^[A-Z][A-Z0-9]*$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)$/;

/**
 * Validates the parsed manifest object. Pure: no I/O, no hashing of files — cross-checks against
 * the actual entries happen in `validateBundle`.
 *
 * @param {any} manifest
 * @returns {import("./issues.js").Issue[]}
 */
export function validateManifest(manifest) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];
  const at = "relics.project.json";

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return [error("MANIFEST_SHAPE", at, "the manifest must be a JSON object")];
  }

  for (const key of Object.keys(manifest)) {
    if (Object.hasOwn(REFUSED_MANIFEST_KEYS, key)) {
      issues.push(error("MANIFEST_REFUSED_KEY", `${at}#${key}`, `"${key}" is refused: ${REFUSED_MANIFEST_KEYS[key]}.`));
    } else if (!MANIFEST_KEYS.includes(key)) {
      issues.push(error("MANIFEST_UNKNOWN_KEY", `${at}#${key}`, `unknown manifest key "${key}" (the manifest schema is closed)`));
    }
  }

  // ---- versions ---------------------------------------------------------------------------
  if (!parseSemver(manifest.schemaVersion)) {
    issues.push(error("SCHEMA_VERSION", `${at}#schemaVersion`, "schemaVersion must be a MAJOR.MINOR.PATCH string"));
  } else if (!isSchemaCompatible(manifest.schemaVersion)) {
    issues.push(error("SCHEMA_INCOMPATIBLE", `${at}#schemaVersion`, explainIncompatibility(manifest.schemaVersion)));
  }
  requireString(issues, manifest.creatorKitVersion, `${at}#creatorKitVersion`, "CREATOR_KIT_VERSION", 64);
  if (manifest.runtimeVersion !== RUNTIME_VERSION) {
    issues.push(error("RUNTIME_VERSION", `${at}#runtimeVersion`, `runtimeVersion must be "${RUNTIME_VERSION}" (got ${JSON.stringify(manifest.runtimeVersion)})`));
  }
  if (manifest.protocolReleaseCompatibility !== PROTOCOL_RELEASE_COMPATIBILITY) {
    issues.push(
      error(
        "PROTOCOL_RELEASE",
        `${at}#protocolReleaseCompatibility`,
        `protocolReleaseCompatibility must be "${PROTOCOL_RELEASE_COMPATIBILITY}" (got ${JSON.stringify(manifest.protocolReleaseCompatibility)})`,
      ),
    );
  }
  if (manifest.generatedBy !== undefined) requireString(issues, manifest.generatedBy, `${at}#generatedBy`, "GENERATED_BY", 64);

  // ---- project identity -------------------------------------------------------------------
  const project = manifest.project;
  if (!isObject(project)) {
    issues.push(error("PROJECT_SHAPE", `${at}#project`, "project must be an object"));
  } else {
    onlyKeys(issues, project, `${at}#project`, ["name", "symbol", "description", "license", "website", "twitterHandle"]);
    requireString(issues, project.name, `${at}#project.name`, "PROJECT_NAME", LIMITS.maxNameLength, 1);
    if (typeof project.symbol !== "string" || !SYMBOL_RE.test(project.symbol) || project.symbol.length > LIMITS.maxSymbolLength) {
      issues.push(error("PROJECT_SYMBOL", `${at}#project.symbol`, `symbol must be 1-${LIMITS.maxSymbolLength} uppercase letters/digits starting with a letter`));
    }
    requireString(issues, project.description, `${at}#project.description`, "PROJECT_DESCRIPTION", LIMITS.maxDescriptionLength, 1);
    requireString(issues, project.license, `${at}#project.license`, "PROJECT_LICENSE", LIMITS.maxLicenseLength, 1);
    if (project.website !== undefined && project.website !== "") checkUrl(issues, project.website, `${at}#project.website`);
    if (project.twitterHandle !== undefined && project.twitterHandle !== "" && !/^[A-Za-z0-9_]{1,15}$/.test(project.twitterHandle)) {
      issues.push(error("PROJECT_TWITTER", `${at}#project.twitterHandle`, "twitterHandle must be a bare handle (no @, no URL)"));
    }
  }

  // ---- supply / artwork backing -----------------------------------------------------------
  const supply = manifest.supply;
  let totalSupply = null;
  let artworkSupply = null;
  if (!isObject(supply)) {
    issues.push(error("SUPPLY_SHAPE", `${at}#supply`, "supply must be an object"));
  } else {
    onlyKeys(issues, supply, `${at}#supply`, ["totalSupplyWhole", "artworkSupply", "backingModel", "tokensPerArtwork"]);
    totalSupply = decimal(issues, supply.totalSupplyWhole, `${at}#supply.totalSupplyWhole`, "SUPPLY_TOTAL");
    artworkSupply = decimal(issues, supply.artworkSupply, `${at}#supply.artworkSupply`, "SUPPLY_ARTWORK");
    if (totalSupply !== null && (totalSupply < LIMITS.minTotalSupplyWhole || totalSupply > LIMITS.maxTotalSupplyWhole)) {
      issues.push(error("SUPPLY_TOTAL_RANGE", `${at}#supply.totalSupplyWhole`, `totalSupplyWhole must be between ${LIMITS.minTotalSupplyWhole} and ${LIMITS.maxTotalSupplyWhole}`));
    }
    if (artworkSupply !== null && artworkSupply < 1n) {
      issues.push(error("SUPPLY_ARTWORK_RANGE", `${at}#supply.artworkSupply`, "artworkSupply must be at least 1"));
    }
    if (!BACKING_MODELS.includes(supply.backingModel)) {
      issues.push(error("SUPPLY_BACKING_MODEL", `${at}#supply.backingModel`, `backingModel must be one of ${BACKING_MODELS.join(", ")}`));
    }
    if (totalSupply !== null && artworkSupply !== null) {
      if (artworkSupply > totalSupply) {
        issues.push(
          error(
            "SUPPLY_BACKING_EXCEEDS_TOTAL",
            `${at}#supply.artworkSupply`,
            `artworkSupply (${artworkSupply}) exceeds totalSupplyWhole (${totalSupply}) — every active artwork must be backed by whole tokens that exist`,
          ),
        );
      }
      if (supply.backingModel === "FULL_PARITY" && supply.tokensPerArtwork !== undefined && supply.tokensPerArtwork !== "1") {
        issues.push(error("SUPPLY_PARITY_MISMATCH", `${at}#supply.tokensPerArtwork`, "FULL_PARITY means exactly one whole token backs one artwork"));
      }
      if (supply.backingModel === "PARTIAL") {
        const declared = supply.tokensPerArtwork === undefined ? null : decimal(issues, supply.tokensPerArtwork, `${at}#supply.tokensPerArtwork`, "SUPPLY_TOKENS_PER_ARTWORK");
        const derived = totalSupply / artworkSupply;
        if (declared !== null && declared !== derived) {
          issues.push(error("SUPPLY_TOKENS_PER_ARTWORK", `${at}#supply.tokensPerArtwork`, `tokensPerArtwork must equal floor(totalSupplyWhole / artworkSupply) = ${derived}`));
        }
        if (derived < 1n) {
          issues.push(error("SUPPLY_UNDERBACKED", `${at}#supply`, "PARTIAL backing needs at least one whole token per artwork"));
        }
      }
    }
  }

  // ---- art --------------------------------------------------------------------------------
  const art = manifest.art;
  if (!isObject(art)) {
    issues.push(error("ART_SHAPE", `${at}#art`, "art must be an object"));
  } else {
    onlyKeys(issues, art, `${at}#art`, ["runtime", "templateId", "entry", "seed", "scriptBytes", "traitDimensions"]);
    const runtime = art.runtime;
    if (typeof runtime !== "string") {
      issues.push(error("ART_RUNTIME", `${at}#art.runtime`, `art.runtime must be one of ${APPROVED_ART_RUNTIMES.join(", ")}`));
    } else if (UNAPPROVED_ART_RUNTIMES.includes(runtime.toUpperCase())) {
      issues.push(
        error(
          "ART_RUNTIME_UNAPPROVED",
          `${at}#art.runtime`,
          `"${runtime}" is not an approved art runtime. Approved runtimes today: ${APPROVED_ART_RUNTIMES.join(", ")}. Adding a runtime is a protocol decision, not a bundle setting.`,
        ),
      );
    } else if (!ART_RUNTIMES.includes(runtime)) {
      issues.push(error("ART_RUNTIME", `${at}#art.runtime`, `unknown art runtime "${runtime}" (approved: ${APPROVED_ART_RUNTIMES.join(", ")})`));
    }
    if (art.entry !== "generator/generate.js") {
      issues.push(error("ART_ENTRY", `${at}#art.entry`, 'art.entry must be "generator/generate.js"'));
    }
    if (typeof art.seed !== "string" || art.seed.length === 0 || art.seed.length > 64) {
      issues.push(error("ART_SEED", `${at}#art.seed`, "art.seed must be a 1-64 character string"));
    }
    if (!Number.isInteger(art.scriptBytes) || art.scriptBytes < 0) {
      issues.push(error("ART_SCRIPT_BYTES", `${at}#art.scriptBytes`, "art.scriptBytes must be a non-negative integer"));
    } else if (art.scriptBytes > LIMITS.maxScriptBytes) {
      issues.push(
        error(
          "ART_SCRIPT_BYTES_LIMIT",
          `${at}#art.scriptBytes`,
          `the generator is ${art.scriptBytes} bytes; the public per-project script budget is ${LIMITS.maxScriptBytes} bytes`,
        ),
      );
    }
    if (runtime === "SOLIDITY_SVG") {
      if (typeof art.templateId !== "string" || !DECIMAL_RE.test(art.templateId) || art.templateId === "0") {
        issues.push(error("ART_TEMPLATE_ID", `${at}#art.templateId`, "SOLIDITY_SVG needs a non-zero decimal templateId (0 is the no-template sentinel)"));
      }
    } else if (art.templateId !== null && art.templateId !== undefined) {
      issues.push(error("ART_TEMPLATE_ID", `${at}#art.templateId`, "templateId must be null for the JAVASCRIPT runtime"));
    }
    if (art.traitDimensions !== undefined) {
      if (!Array.isArray(art.traitDimensions) || art.traitDimensions.some((d) => typeof d !== "string")) {
        issues.push(error("ART_TRAIT_DIMENSIONS", `${at}#art.traitDimensions`, "art.traitDimensions must be an array of strings"));
      } else if (art.traitDimensions.length > LIMITS.maxTraitDimensions) {
        issues.push(error("ART_TRAIT_DIMENSIONS", `${at}#art.traitDimensions`, `at most ${LIMITS.maxTraitDimensions} trait dimensions`));
      }
    }
  }

  // ---- market -----------------------------------------------------------------------------
  const market = manifest.market;
  if (!isObject(market)) {
    issues.push(error("MARKET_SHAPE", `${at}#market`, "market must be an object"));
  } else {
    onlyKeys(issues, market, `${at}#market`, ["startingPreset", "launchMode", "mappingCount", "sale", "chainId", "quoteAsset", "creatorLpFeeAssetMode"]);
    if (!STARTING_PRESETS.includes(market.startingPreset)) {
      issues.push(error("MARKET_PRESET", `${at}#market.startingPreset`, `startingPreset must be one of ${STARTING_PRESETS.join(", ")}`));
    }
    if (!LAUNCH_MODES.includes(market.launchMode)) {
      issues.push(error("MARKET_LAUNCH_MODE", `${at}#market.launchMode`, `launchMode must be one of ${LAUNCH_MODES.join(", ")}`));
    }
    if (!Number.isInteger(market.mappingCount) || market.mappingCount < 0 || market.mappingCount > LIMITS.maxMarketMappings) {
      issues.push(error("MARKET_MAPPING_COUNT", `${at}#market.mappingCount`, `mappingCount must be an integer between 0 and ${LIMITS.maxMarketMappings}`));
    }
    // ---- quote asset: a REQUEST, never an approval -----------------------------------------
    // Every field below is OPTIONAL. A bundle written before this schema existed, or one that
    // simply does not care, omits them and imports exactly as it always did — DEFAULT is the
    // absence, and the importer supplies the chain's own default.
    if (market.chainId !== undefined && !SUPPORTED_CHAIN_IDS.includes(market.chainId)) {
      issues.push(
        error("MARKET_CHAIN_ID", `${at}#market.chainId`, `market.chainId ${JSON.stringify(market.chainId)} is not supported (supported: ${SUPPORTED_CHAIN_IDS.join(", ")})`),
      );
    }
    if (market.chainId !== undefined && Array.isArray(manifest.chains?.requested) && !manifest.chains.requested.includes(market.chainId)) {
      issues.push(
        error(
          "MARKET_CHAIN_NOT_REQUESTED",
          `${at}#market.chainId`,
          `market.chainId ${market.chainId} is not in chains.requested (${manifest.chains.requested.join(", ")}) — a market cannot be described for a chain the bundle does not target`,
        ),
      );
    }
    if (market.creatorLpFeeAssetMode !== undefined && !CREATOR_LP_FEE_ASSET_MODES.includes(market.creatorLpFeeAssetMode)) {
      issues.push(
        error(
          "MARKET_FEE_ASSET_MODE",
          `${at}#market.creatorLpFeeAssetMode`,
          `creatorLpFeeAssetMode must be one of ${CREATOR_LP_FEE_ASSET_MODES.join(", ")} — and it is a REQUEST: QUOTE_ONLY needs a conversion route the launchpad has proven at import time`,
        ),
      );
    }
    if (market.quoteAsset !== undefined) {
      if (!isObject(market.quoteAsset)) {
        issues.push(error("MARKET_QUOTE_SHAPE", `${at}#market.quoteAsset`, "market.quoteAsset must be an object"));
      } else {
        onlyKeys(issues, market.quoteAsset, `${at}#market.quoteAsset`, ["mode", "address", "expectedKind", "registryVersion"]);
        const mode = market.quoteAsset.mode;
        if (!QUOTE_ASSET_REQUEST_MODES.includes(mode)) {
          issues.push(error("MARKET_QUOTE_MODE", `${at}#market.quoteAsset.mode`, `quoteAsset.mode must be one of ${QUOTE_ASSET_REQUEST_MODES.join(", ")}`));
        }
        if (mode === "ADDRESS") {
          if (typeof market.quoteAsset.address !== "string" || !ADDRESS_RE.test(market.quoteAsset.address)) {
            issues.push(error("MARKET_QUOTE_ADDRESS", `${at}#market.quoteAsset.address`, "quoteAsset.address must be a 0x-prefixed 20-byte address when mode is ADDRESS"));
          } else if (market.quoteAsset.address.toLowerCase() === ZERO_ADDRESS) {
            issues.push(error("MARKET_QUOTE_ADDRESS_ZERO", `${at}#market.quoteAsset.address`, "quoteAsset.address cannot be the zero address"));
          }
        } else if (market.quoteAsset.address !== undefined) {
          issues.push(
            error("MARKET_QUOTE_ADDRESS_UNEXPECTED", `${at}#market.quoteAsset.address`, 'quoteAsset.address is only meaningful when mode is "ADDRESS" — DEFAULT means "the importing chain\'s own default"'),
          );
        }
        if (market.quoteAsset.expectedKind !== undefined && !QUOTE_ASSET_KINDS.includes(market.quoteAsset.expectedKind)) {
          issues.push(
            error("MARKET_QUOTE_KIND", `${at}#market.quoteAsset.expectedKind`, `quoteAsset.expectedKind must be one of ${QUOTE_ASSET_KINDS.join(", ")} — it is a cross-check the registry can only ever REFUSE, never a claim the importer trusts`),
          );
        }
        if (market.quoteAsset.registryVersion !== undefined) {
          requireString(issues, market.quoteAsset.registryVersion, `${at}#market.quoteAsset.registryVersion`, "MARKET_QUOTE_REGISTRY_VERSION", 64);
        }
      }
    }

    const isSale = market.launchMode === "FIXED_PRICE_SALE_TO_V4" || market.launchMode === "BONDING_CURVE_SALE_TO_V4";
    if (!isSale && market.sale !== undefined) {
      issues.push(error("MARKET_SALE_UNEXPECTED", `${at}#market.sale`, "market.sale is only allowed for a sale launch mode"));
    }
    if (isSale) {
      if (!isObject(market.sale)) {
        issues.push(error("MARKET_SALE_SHAPE", `${at}#market.sale`, "a sale launch mode needs a market.sale object"));
      } else {
        onlyKeys(issues, market.sale, `${at}#market.sale`, ["allocationBps", "durationDays", "minRaiseEth", "curvePresetId"]);
        checkBps(issues, market.sale.allocationBps, `${at}#market.sale.allocationBps`, "MARKET_SALE_ALLOCATION", LIMITS.maxSaleAllocationBps);
        if (!Number.isInteger(market.sale.durationDays) || market.sale.durationDays < 1 || market.sale.durationDays > 90) {
          issues.push(error("MARKET_SALE_DURATION", `${at}#market.sale.durationDays`, "sale durationDays must be an integer between 1 and 90"));
        }
        if (typeof market.sale.minRaiseEth !== "string" || !/^\d+(\.\d{1,18})?$/.test(market.sale.minRaiseEth)) {
          issues.push(error("MARKET_SALE_MIN_RAISE", `${at}#market.sale.minRaiseEth`, "minRaiseEth must be a decimal string with at most 18 decimal places"));
        }
        if (market.launchMode === "BONDING_CURVE_SALE_TO_V4" && !CURVE_PRESETS.includes(market.sale.curvePresetId)) {
          issues.push(error("MARKET_CURVE_PRESET", `${at}#market.sale.curvePresetId`, `curvePresetId must be one of ${CURVE_PRESETS.join(", ")} (there is no runtime curve-registration path)`));
        }
      }
    }
  }

  // ---- earnings ---------------------------------------------------------------------------
  const earnings = manifest.earnings;
  if (!isObject(earnings)) {
    issues.push(error("EARNINGS_SHAPE", `${at}#earnings`, "earnings must be an object"));
  } else {
    onlyKeys(issues, earnings, `${at}#earnings`, ["mode", "creatorRecipient", "collaborators", "creatorAllocationBps"]);
    if (!EARNINGS_MODES.includes(earnings.mode)) {
      issues.push(error("EARNINGS_MODE", `${at}#earnings.mode`, `earnings.mode must be one of ${EARNINGS_MODES.join(", ")}`));
    }
    if (typeof earnings.creatorRecipient !== "string" || !ADDRESS_RE.test(earnings.creatorRecipient)) {
      issues.push(error("EARNINGS_RECIPIENT", `${at}#earnings.creatorRecipient`, "creatorRecipient must be a 0x-prefixed 20-byte address"));
    } else if (earnings.creatorRecipient.toLowerCase() === ZERO_ADDRESS) {
      issues.push(error("EARNINGS_RECIPIENT_ZERO", `${at}#earnings.creatorRecipient`, "creatorRecipient cannot be the zero address"));
    } else if (isPlaceholderAddress(earnings.creatorRecipient)) {
      // The message names `relics.config.json`, NOT the `at` path. Every other issue in this file
      // points at the manifest because that is the document being validated, but the manifest is
      // GENERATED — a creator who opens `relics.project.json` to fix this finds a file the builder
      // overwrites on every export. The one file they can actually edit is the project config, so
      // that is the file the message sends them to.
      issues.push(
        error(
          "EARNINGS_RECIPIENT_PLACEHOLDER",
          `${at}#earnings.creatorRecipient`,
          `${earnings.creatorRecipient} is a placeholder or burn address, not a wallet anyone controls. Open relics.config.json in your project directory and set earnings.creatorRecipient to the address that should receive the creator share. (relics.project.json is the generated bundle manifest — editing it there does nothing.)`,
        ),
      );
    }
    const collaborators = earnings.collaborators;
    if (!Array.isArray(collaborators)) {
      issues.push(error("EARNINGS_COLLABORATORS", `${at}#earnings.collaborators`, "earnings.collaborators must be an array (use [] for a solo project)"));
    } else {
      if (collaborators.length > LIMITS.maxCollaborators) {
        issues.push(error("EARNINGS_COLLABORATORS_MAX", `${at}#earnings.collaborators`, `at most ${LIMITS.maxCollaborators} collaborators`));
      }
      if (earnings.mode === "SOLO" && collaborators.length > 0) {
        issues.push(error("EARNINGS_MODE_MISMATCH", `${at}#earnings.collaborators`, "SOLO earnings cannot list collaborators; use SPLIT"));
      }
      if (earnings.mode === "SPLIT" && collaborators.length === 0) {
        issues.push(error("EARNINGS_MODE_MISMATCH", `${at}#earnings.collaborators`, "SPLIT earnings needs at least one collaborator"));
      }
      let sum = 0;
      const seen = new Set();
      collaborators.forEach((c, i) => {
        const where = `${at}#earnings.collaborators[${i}]`;
        if (!isObject(c)) {
          issues.push(error("EARNINGS_COLLABORATOR", where, "each collaborator must be an object"));
          return;
        }
        onlyKeys(issues, c, where, ["recipient", "bps"]);
        if (typeof c.recipient !== "string" || !ADDRESS_RE.test(c.recipient) || c.recipient.toLowerCase() === ZERO_ADDRESS) {
          issues.push(error("EARNINGS_COLLABORATOR", `${where}.recipient`, "collaborator recipient must be a non-zero 0x address"));
        } else {
          const key = c.recipient.toLowerCase();
          if (seen.has(key)) issues.push(error("EARNINGS_COLLABORATOR_DUP", `${where}.recipient`, "the same recipient appears twice"));
          seen.add(key);
        }
        if (!Number.isInteger(c.bps) || c.bps < 1 || c.bps > LIMITS.bpsDenominator) {
          issues.push(error("EARNINGS_COLLABORATOR_BPS", `${where}.bps`, `bps must be an integer between 1 and ${LIMITS.bpsDenominator}`));
        } else {
          sum += c.bps;
        }
      });
      if (sum > LIMITS.bpsDenominator) {
        issues.push(
          error(
            "EARNINGS_BPS_SUM",
            `${at}#earnings.collaborators`,
            `collaborator bps sum ${sum} exceeds ${LIMITS.bpsDenominator} — these are shares of the creator's own portion of collected LP fees, not of trading volume`,
          ),
        );
      }
    }
    if (earnings.creatorAllocationBps !== undefined) {
      checkBps(issues, earnings.creatorAllocationBps, `${at}#earnings.creatorAllocationBps`, "EARNINGS_ALLOCATION", LIMITS.maxCreatorAllocationBps);
    }
  }

  // ---- chains -----------------------------------------------------------------------------
  const chains = manifest.chains;
  if (!isObject(chains)) {
    issues.push(error("CHAINS_SHAPE", `${at}#chains`, "chains must be an object"));
  } else {
    onlyKeys(issues, chains, `${at}#chains`, ["requested"]);
    if (!Array.isArray(chains.requested) || chains.requested.length === 0) {
      issues.push(error("CHAINS_REQUESTED", `${at}#chains.requested`, "chains.requested must be a non-empty array of chain ids"));
    } else {
      const seen = new Set();
      for (const id of chains.requested) {
        if (!SUPPORTED_CHAIN_IDS.includes(id)) {
          issues.push(error("CHAIN_UNSUPPORTED", `${at}#chains.requested`, `chain ${JSON.stringify(id)} is not supported (supported: ${SUPPORTED_CHAIN_IDS.join(", ")})`));
        }
        if (seen.has(id)) issues.push(error("CHAIN_DUPLICATE", `${at}#chains.requested`, `chain ${id} appears twice`));
        seen.add(id);
      }
    }
  }

  // ---- media ------------------------------------------------------------------------------
  if (manifest.media !== undefined) {
    if (!isObject(manifest.media)) {
      issues.push(error("MEDIA_SHAPE", `${at}#media`, "media must be an object"));
    } else {
      onlyKeys(issues, manifest.media, `${at}#media`, ["cover", "files"]);
      if (manifest.media.cover !== undefined) {
        const cover = manifest.media.cover;
        if (!isObject(cover)) {
          issues.push(error("MEDIA_COVER", `${at}#media.cover`, "media.cover must be an object"));
        } else {
          onlyKeys(issues, cover, `${at}#media.cover`, ["path", "sha256", "cid"]);
          if (typeof cover.path !== "string" || !cover.path.startsWith("assets/")) {
            issues.push(error("MEDIA_COVER_PATH", `${at}#media.cover.path`, "media.cover.path must point inside assets/"));
          }
          if (!isSha256Hex(cover.sha256)) issues.push(error("MEDIA_COVER_HASH", `${at}#media.cover.sha256`, "media.cover.sha256 must be a 64-character lowercase hex digest"));
          if (cover.cid !== undefined && (typeof cover.cid !== "string" || cover.cid.length > 128)) {
            issues.push(error("MEDIA_COVER_CID", `${at}#media.cover.cid`, "media.cover.cid must be a short string"));
          }
        }
      }
      if (manifest.media.files !== undefined && !isObject(manifest.media.files)) {
        issues.push(error("MEDIA_FILES", `${at}#media.files`, "media.files must be an object of path -> sha256"));
      }
    }
  }

  // ---- hashes / integrity -----------------------------------------------------------------
  const hashes = manifest.hashes;
  if (!isObject(hashes)) {
    issues.push(error("HASHES_SHAPE", `${at}#hashes`, "hashes must be an object"));
  } else {
    onlyKeys(issues, hashes, `${at}#hashes`, ["algorithm", "script", "dependencies", "generator", "traitSchema", "marketMapping", "metadata", "media"]);
    if (hashes.algorithm !== "sha256") issues.push(error("HASHES_ALGORITHM", `${at}#hashes.algorithm`, 'hashes.algorithm must be "sha256"'));
    for (const key of ["script", "generator", "traitSchema", "marketMapping", "metadata"]) {
      if (!isSha256Hex(hashes[key])) issues.push(error("HASHES_VALUE", `${at}#hashes.${key}`, `hashes.${key} must be a 64-character lowercase hex digest`));
    }
    for (const key of ["dependencies", "media"]) {
      if (hashes[key] !== undefined && !isObject(hashes[key])) issues.push(error("HASHES_MAP", `${at}#hashes.${key}`, `hashes.${key} must be an object of path -> digest`));
    }
  }

  // ---- art binding ------------------------------------------------------------------------
  issues.push(...validateArtBindingBlock(manifest, at));

  const integrity = manifest.integrity;
  if (!isObject(integrity)) {
    issues.push(error("INTEGRITY_SHAPE", `${at}#integrity`, "integrity must be an object"));
  } else {
    onlyKeys(issues, integrity, `${at}#integrity`, ["contentHash", "projectConfigHash", "bundleHash", "bundleCommitment"]);
    for (const key of ["contentHash", "projectConfigHash", "bundleHash"]) {
      if (!isSha256Hex(integrity[key])) issues.push(error("INTEGRITY_VALUE", `${at}#integrity.${key}`, `integrity.${key} must be a 64-character lowercase hex digest`));
    }
    // The chain-shaped restatement of the same bundle identity — keccak over the identical
    // preimage, so one `bytes32` names the bundle in a launch without defining a second notion of
    // what "this bundle" is.
    if (!isKeccak256Hex(integrity.bundleCommitment)) {
      issues.push(error("INTEGRITY_VALUE", `${at}#integrity.bundleCommitment`, "integrity.bundleCommitment must be a 64-character lowercase keccak256 digest"));
    }
  }

  return issues;
}

/**
 * The binding block: what runtime renders this project and which exact bytes it renders from.
 *
 * Shape only. The block is DERIVED from the container, so the validator recomputes every field
 * from the bundle's own entries and refuses a mismatch — that check lives in `validateBundle`,
 * where the entries are in hand. Here we prove the block is well-formed and, crucially, that it
 * makes no claim about a chain.
 *
 * @param {any} manifest
 * @param {string} at
 */
function validateArtBindingBlock(manifest, at) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];
  const where = `${at}#artBinding`;
  const binding = manifest.artBinding;

  if (!isObject(binding)) {
    issues.push(
      error(
        "ART_BINDING_SHAPE",
        where,
        "artBinding is required: it records which runtime renders this project and which bytes that runtime is given. Re-export the project with the current creator kit rather than adding the block by hand.",
      ),
    );
    return issues;
  }

  // Plain key check, deliberately NOT `onlyKeys`. The refusal list it consults exists to stop a
  // key like `runtimeCodeHash` appearing where it would be believed — and inside the binding those
  // exact names are legitimate, present, and required to be null. Refusing them here by name would
  // refuse the block's own shape. The chain-claim check immediately below is what enforces the
  // rule that actually matters: the field may exist, it may not carry a value.
  for (const key of Object.keys(binding)) {
    if (!ART_BINDING_KEYS.includes(key)) {
      issues.push(error("MANIFEST_UNKNOWN_KEY", `${where}.${key}`, `unknown key "${key}" (allowed: ${ART_BINDING_KEYS.join(", ")})`));
    }
  }

  // A bundle states facts about its own bytes and never about a chain.
  for (const field of CHAIN_RESOLVED_BINDING_FIELDS) {
    if (binding[field] !== null && binding[field] !== undefined) {
      issues.push(
        error(
          "ART_BINDING_CHAIN_CLAIM",
          `${where}.${field}`,
          `artBinding.${field} must be null in a bundle. ${REFUSED_MANIFEST_KEYS[field] ?? "it is resolved on chain, not declared by a creator"}.`,
        ),
      );
    }
  }

  if (binding.schemaVersion !== SCHEMA_VERSION) {
    issues.push(error("ART_BINDING_SCHEMA_VERSION", `${where}.schemaVersion`, `artBinding.schemaVersion must be "${SCHEMA_VERSION}"`));
  }
  if (binding.runtime !== manifest.art?.runtime) {
    issues.push(error("ART_BINDING_RUNTIME", `${where}.runtime`, "artBinding.runtime must equal art.runtime — one project cannot declare two runtimes"));
  }
  if (typeof binding.runtimeId !== "string" || binding.runtimeId.length === 0 || binding.runtimeId.length > 64) {
    issues.push(error("ART_BINDING_RUNTIME_ID", `${where}.runtimeId`, "artBinding.runtimeId must be the runtime's stable identifier string"));
  }
  if (!isKeccak256Hex(binding.runtimeIdHash)) {
    issues.push(error("ART_BINDING_RUNTIME_ID_HASH", `${where}.runtimeIdHash`, "artBinding.runtimeIdHash must be the 64-character lowercase keccak256 of runtimeId"));
  }
  if (binding.artMode !== 0 && binding.artMode !== 1) {
    issues.push(error("ART_BINDING_ART_MODE", `${where}.artMode`, "artBinding.artMode must be 0 (SOLIDITY_SVG) or 1 (JAVASCRIPT)"));
  }
  if (typeof binding.templateId !== "string" || !DECIMAL_RE.test(binding.templateId)) {
    issues.push(error("ART_BINDING_TEMPLATE_ID", `${where}.templateId`, "artBinding.templateId must be a decimal string (\"0\" when no template is used)"));
  }
  if (!ART_CONFIG_SOURCES.includes(binding.artConfigSource)) {
    issues.push(error("ART_BINDING_CONFIG_SOURCE", `${where}.artConfigSource`, `artBinding.artConfigSource must be one of ${ART_CONFIG_SOURCES.join(", ")}`));
  }
  if (!Number.isInteger(binding.artConfigBytes) || binding.artConfigBytes < 0) {
    issues.push(error("ART_BINDING_CONFIG_BYTES", `${where}.artConfigBytes`, "artBinding.artConfigBytes must be a non-negative integer"));
  }

  // THE ART CONFIGURATION ITSELF. Required for BOTH runtimes: `artConfigHash` is keccak256 over
  // the exact bytes the runtime is handed, and it is the value `LaunchpadFactory._storeArt` checks
  // `keccak256(artConfig)` against. Schema 2 allowed it to be null for a Solidity project because
  // no published parameter layout existed; ACV1 is that layout, so a null here now means a bundle
  // that cannot say what its own launch would render.
  if (!isKeccak256Hex(binding.artConfigHash)) {
    issues.push(
      error(
        "ART_BINDING_CONFIG_HASH",
        `${where}.artConfigHash`,
        "artBinding.artConfigHash must be keccak256 of the exact art configuration bytes — the value the launch checks keccak256(artConfig) against",
      ),
    );
  }
  if (!ART_CONFIG_FORMATS.includes(binding.artConfigFormat)) {
    issues.push(error("ART_BINDING_CONFIG_FORMAT", `${where}.artConfigFormat`, `artBinding.artConfigFormat must be one of ${ART_CONFIG_FORMATS.join(", ")}`));
  }
  if (binding.artConfigFormat !== ART_RUNTIME_TO_CONFIG_FORMAT[binding.runtime]) {
    issues.push(
      error(
        "ART_BINDING_CONFIG_FORMAT",
        `${where}.artConfigFormat`,
        `the ${binding.runtime} runtime is handed ${ART_RUNTIME_TO_CONFIG_FORMAT[binding.runtime]} bytes; a binding cannot pair a runtime with another runtime's config format`,
      ),
    );
  }
  if (!Number.isInteger(binding.artConfigBytes) || binding.artConfigBytes <= 0) {
    issues.push(error("ART_BINDING_CONFIG_BYTES", `${where}.artConfigBytes`, "artBinding.artConfigBytes must be a positive integer — a launch with no configuration bytes is the defect this field exists to make visible"));
  }
  if (typeof binding.artRuntimeVersion !== "number" || !Number.isInteger(binding.artRuntimeVersion) || binding.artRuntimeVersion < 1) {
    issues.push(error("ART_BINDING_RUNTIME_VERSION", `${where}.artRuntimeVersion`, "artBinding.artRuntimeVersion must be the positive integer version the runtime reports about itself"));
  }

  if (binding.artConfigSource === "GENERATOR_SCRIPT") {
    // The generator IS the config: those bytes are what the launch hashes and stores, and they are
    // already an entry, so the manifest does not restate them.
    if (binding.artConfig !== null) {
      issues.push(error("ART_BINDING_CONFIG", `${where}.artConfig`, "artConfig must be null for a GENERATOR_SCRIPT binding: the bytes are generator/generate.js and restating them would let a manifest disagree with its own entry"));
    }
    if (binding.templateParamsHash !== null) {
      issues.push(error("ART_BINDING_TEMPLATE_PARAMS", `${where}.templateParamsHash`, "templateParamsHash must be null when the config source is the generator script"));
    }
    for (const key of ["artConfigVisualHash", "artConfigTraitSchemaHash"]) {
      if (binding[key] !== null) {
        issues.push(error("ART_BINDING_ACV1_COMMITMENT", `${where}.${key}`, `${key} is derived from a decoded ACV1 configuration; a JavaScript generator declares no such program and must leave it null`));
      }
    }
  } else if (binding.artConfigSource === "ART_CONFIG_V1") {
    // The bundle CARRIES the configuration, not merely a digest of it, so an importer can decode
    // and show a creator exactly what will be launched without re-deriving it from anything.
    const config = binding.artConfig;
    if (typeof config !== "string" || !/^[0-9a-f]+$/.test(config) || config.length % 2 !== 0) {
      issues.push(error("ART_BINDING_CONFIG", `${where}.artConfig`, "an ART_CONFIG_V1 binding must carry the configuration as bare lowercase hex"));
    } else {
      const bytes = Uint8Array.from(config.match(/../g).map((b) => parseInt(b, 16)));
      if (bytes.length !== binding.artConfigBytes) {
        issues.push(error("ART_BINDING_CONFIG_BYTES", `${where}.artConfigBytes`, "artConfigBytes must be the length of artConfig"));
      }
      if (!isArtConfigV1(bytes)) {
        issues.push(error("ART_BINDING_CONFIG_FORMAT", `${where}.artConfig`, "artConfig does not carry the ACV1 magic and version"));
      } else {
        const verdict = validateArtConfigV1(bytes);
        if (!verdict.ok) {
          issues.push(
            error(
              "ART_BINDING_CONFIG_INVALID",
              `${where}.artConfig`,
              `the art configuration would be refused on chain: ${verdict.name} (${verdict.code}) — ${verdict.reason}. The launch validates it inside the atomic transaction, so this bundle could not launch.`,
            ),
          );
        }
      }
      // THE HASH MUST COVER THE BYTES AS TRANSMITTED, appendix included. Recomputed here rather
      // than trusted, because this is the single value the chain checks.
      if (isKeccak256Hex(binding.artConfigHash) && hashArtConfigV1(bytes) !== binding.artConfigHash) {
        issues.push(error("ART_BINDING_CONFIG_HASH", `${where}.artConfigHash`, "artConfigHash is not keccak256 of artConfig — the launch would revert BadArtHash"));
      }
    }
    if (!isKeccak256Hex(binding.templateParamsHash)) {
      issues.push(error("ART_BINDING_TEMPLATE_PARAMS", `${where}.templateParamsHash`, "an ART_CONFIG_V1 binding must carry keccak256 of the creator's authoring document"));
    }
    for (const key of ["artConfigVisualHash", "artConfigTraitSchemaHash"]) {
      if (!isKeccak256Hex(binding[key])) {
        issues.push(error("ART_BINDING_ACV1_COMMITMENT", `${where}.${key}`, `artBinding.${key} must be the keccak256 the runtime derives from the decoded configuration`));
      }
    }
  }

  for (const key of ["generatorSourceHash", "traitSchemaDocumentHash", "marketMappingHash", "metadataHash"]) {
    if (!isKeccak256Hex(binding[key])) {
      issues.push(error("ART_BINDING_HASH", `${where}.${key}`, `artBinding.${key} must be a 64-character lowercase keccak256 digest`));
    }
  }

  if (binding.representativeOutputsHash !== null && !isKeccak256Hex(binding.representativeOutputsHash)) {
    issues.push(error("ART_BINDING_OUTPUTS_HASH", `${where}.representativeOutputsHash`, "artBinding.representativeOutputsHash must be a keccak256 digest or null"));
  }
  // A JavaScript project renders in a sandbox, so it can — and must — commit to what it draws.
  // A Solidity-SVG project's renderer is a deployed contract the kit does not execute, so there
  // is nothing honest for it to commit to and the field stays null.
  if (binding.artConfigSource === "GENERATOR_SCRIPT" && binding.representativeOutputsHash === null) {
    issues.push(
      error(
        "ART_BINDING_OUTPUTS_MISSING",
        `${where}.representativeOutputsHash`,
        "a JavaScript project must commit to what its generator draws for the fixed binding seeds; export through `relics export`, which records them",
      ),
    );
  }

  return issues;
}

// ---- small helpers -------------------------------------------------------------------------

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Addresses that are obviously not a wallet: the well-known burn address, and any address whose
 * twenty bytes are all the same nibble (`0x1111…`, `0xdead…` style scaffolding). Shipping a
 * template with a placeholder recipient would send a creator's share nowhere, so the format
 * refuses one rather than warning about it.
 * @param {string} address
 */
export function isPlaceholderAddress(address) {
  const body = address.slice(2).toLowerCase();
  if (body === "000000000000000000000000000000000000dead") return true;
  if (/^(.)\1{39}$/.test(body)) return true;
  if (/^dead(dead)+$/.test(body) || /^(beef)+$/.test(body)) return true;
  return false;
}

function onlyKeys(issues, object, where, allowed) {
  for (const key of Object.keys(object)) {
    if (Object.hasOwn(REFUSED_MANIFEST_KEYS, key)) {
      issues.push(error("MANIFEST_REFUSED_KEY", `${where}.${key}`, `"${key}" is refused: ${REFUSED_MANIFEST_KEYS[key]}.`));
    } else if (!allowed.includes(key)) {
      issues.push(error("MANIFEST_UNKNOWN_KEY", `${where}.${key}`, `unknown key "${key}" (allowed: ${allowed.join(", ")})`));
    }
  }
}

function requireString(issues, value, where, code, maxLength, minLength = 1) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength) {
    issues.push(error(code, where, `must be a string of ${minLength}-${maxLength} characters`));
    return false;
  }
  return true;
}

function decimal(issues, value, where, code) {
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) {
    issues.push(error(code, where, "must be a decimal integer string with no sign, exponent or leading zero"));
    return null;
  }
  return BigInt(value);
}

function checkBps(issues, value, where, code, max) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    issues.push(error(code, where, `must be an integer between 0 and ${max} basis points`));
  }
}

function checkUrl(issues, value, where) {
  if (typeof value !== "string" || value.length > LIMITS.maxUrlLength) {
    issues.push(error("URL_LENGTH", where, `must be a string of at most ${LIMITS.maxUrlLength} characters`));
    return;
  }
  if (!/^https:\/\/[A-Za-z0-9.-]+(\.[A-Za-z]{2,})(\/[^\s]*)?$/.test(value)) {
    issues.push(error("URL_SHAPE", where, "must be an https:// URL"));
  }
}

export { isObject as isPlainObject };
export { warn };
