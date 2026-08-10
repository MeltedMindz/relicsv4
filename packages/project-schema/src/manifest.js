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
import { isSchemaCompatible, SCHEMA_VERSION, RUNTIME_VERSION, PROTOCOL_RELEASE_COMPATIBILITY, parseSemver } from "./version.js";
import { isSha256Hex } from "./hashes.js";

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
    issues.push(error("SCHEMA_INCOMPATIBLE", `${at}#schemaVersion`, `bundle schemaVersion ${manifest.schemaVersion} is not readable by schema ${SCHEMA_VERSION}`));
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
      issues.push(
        error(
          "EARNINGS_RECIPIENT_PLACEHOLDER",
          `${at}#earnings.creatorRecipient`,
          `${earnings.creatorRecipient} is a placeholder or burn address, not a wallet anyone controls. Set earnings.creatorRecipient to the address that should receive the creator share.`,
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

  const integrity = manifest.integrity;
  if (!isObject(integrity)) {
    issues.push(error("INTEGRITY_SHAPE", `${at}#integrity`, "integrity must be an object"));
  } else {
    onlyKeys(issues, integrity, `${at}#integrity`, ["contentHash", "projectConfigHash", "bundleHash"]);
    for (const key of ["contentHash", "projectConfigHash", "bundleHash"]) {
      if (!isSha256Hex(integrity[key])) issues.push(error("INTEGRITY_VALUE", `${at}#integrity.${key}`, `integrity.${key} must be a 64-character lowercase hex digest`));
    }
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
