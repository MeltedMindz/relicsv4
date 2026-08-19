// SPDX-License-Identifier: MIT
// The importer-facing projection: turns a validated bundle into the studio draft the launchpad
// creator app already edits, so importing a bundle lands a creator on the normal review screen
// with every field filled in and nothing to re-enter.
//
// This function is the reason the CLI and the web importer cannot drift: there is one mapping,
// it lives next to the schema that defines both sides, and the provenance block it returns lets
// the importer display the same hashes the CLI printed at export time.

import { ART_RUNTIME_TO_MODE, STARTING_PRESET_TO_INDEX, DEFAULT_BURN_POLICY } from "./vocabulary.js";
import { toHex } from "./sha256.js";

/**
 * @param {{ manifest: any, traitSchema: any, marketMappings: any, collectionMetadata: any, hashes: any }} validated
 *   the result of `validateBundle` (which must have passed)
 * @param {Map<string, Uint8Array>} byPath the bundle's entries
 * @param {{ draftId?: string, chainId?: number, updatedAt?: number }} [options]
 */
export function toStudioDraft(validated, byPath, options = {}) {
  const manifest = validated.manifest;
  if (!manifest) throw new Error("toStudioDraft needs a validated bundle with a manifest");

  const runtime = manifest.art.runtime;
  const isJavaScript = runtime === "JAVASCRIPT";
  const scriptBytes = byPath.get("generator/generate.js");

  const chainId = options.chainId ?? manifest.market?.chainId ?? (Array.isArray(manifest.chains?.requested) ? manifest.chains.requested[0] : null) ?? null;

  const draft = {
    version: 5,
    id: options.draftId ?? "imported",
    name: manifest.project.name,
    chainId,
    locked: false,
    uiMode: (manifest.market?.mappingCount ?? 0) > 0 ? "advanced" : "simple",
    updatedAt: options.updatedAt ?? 0,
    art: {
      seed: manifest.art.seed,
      seedHistory: [],
      mode: ART_RUNTIME_TO_MODE[runtime],
      artTemplateId: isJavaScript ? "" : String(manifest.art.templateId),
      // THE BYTES THE RUNTIME IS HANDED, for both runtimes.
      //
      // This used to be `"0x"` for SOLIDITY_SVG, with the declarative parameters travelling in
      // `provenance.templateParams` for some later step to encode. Nothing ever encoded them, so a
      // studio importing a Solidity bundle arrived holding an EMPTY art configuration — which is
      // how a project could be launched with no art at all and render the runtime's built-in
      // shapes. The bundle now carries its own ACV1 configuration and the draft carries it through.
      scriptHex: isJavaScript ? (scriptBytes ? `0x${toHex(scriptBytes)}` : "0x") : `0x${manifest.artBinding?.artConfig ?? ""}`,
      traitDimensions: (validated.traitSchema?.dimensions ?? []).map((d) => d.name),
      marketMappings: (validated.marketMappings?.mappings ?? []).map((m) => ({
        id: m.id,
        sensor: m.sensor,
        transform: m.transform,
        transformParams: { ...m.transformParams },
        destination: m.destination,
      })),
    },
    collection: {
      name: manifest.project.name,
      symbol: manifest.project.symbol,
      description: manifest.project.description,
      imageDataUrl: null,
      imageFileName: manifest.media?.cover?.path ? manifest.media.cover.path.slice("assets/".length) : null,
      website: manifest.project.website ?? "",
      twitterHandle: manifest.project.twitterHandle ?? "",
      totalSupplyWhole: manifest.supply.totalSupplyWhole,
      artworkBackingUnits: manifest.supply.artworkSupply,
      ...(manifest.protocolTemplate
        ? { genesisTokensPerPossibleNftWhole: manifest.supply.genesisTokensPerPossibleNftWhole }
        : { backingModel: manifest.supply.backingModel }),
      // BURN POLICY. An absent field is NONE, not "unspecified" -- the same meaning every bundle
      // written before the field existed already had. Defaulting here rather than in the studio
      // keeps one answer to "what does silence mean", and it is the non-burning one.
      burnPolicy: manifest.supply.burnPolicy ?? DEFAULT_BURN_POLICY,
      creatorRecipient: manifest.earnings.creatorRecipient,
      license: manifest.project.license,
      collaborators: (manifest.earnings.collaborators ?? []).map((c) => ({ recipient: c.recipient, bps: c.bps })),
      metaCollaborators: (validated.collectionMetadata?.collaborators ?? []).map((c) => ({ account: c.address, role: c.role })),
    },
    market: {
      startingPreset: STARTING_PRESET_TO_INDEX[manifest.market.startingPreset],
      launchMode: manifest.market.launchMode,
      saleAllocationBps: manifest.market.sale?.allocationBps ?? 2500,
      creatorAllocationBps: manifest.earnings.creatorAllocationBps ?? 0,
      curvePresetId: manifest.market.sale?.curvePresetId ?? "linear",
      saleDurationDays: String(manifest.market.sale?.durationDays ?? 7),
      minRaiseEth: manifest.market.sale?.minRaiseEth ?? "0",
      salePriceEthOverride: "",
      raiseTargetEthOverride: "",
      // QUOTE ASSET: the draft carries NULL, always.
      //
      // This is deliberate and load-bearing. The bundle's quoteAsset block is a REQUEST, and this
      // projection is a pure function with no access to a registry — it cannot know whether the
      // requested asset is currently approved on the importing chain, and writing the requested
      // address straight into the draft would make an unresolved request look like a settled
      // choice. The request travels in `provenance.quoteAssetRequest` instead; the importer
      // resolves it against the live registry and only then writes `market.quoteAsset`.
      quoteAsset: null,
      creatorLpFeeAssetMode: manifest.market?.creatorLpFeeAssetMode ?? "DUAL_ASSET",
      quoteAssetAtLastCompute: null,
    },
  };

  const templateParamsBytes = byPath.get("generator/params.json");

  return {
    draft,
    provenance: {
      source: "relics-bundle",
      schemaVersion: manifest.schemaVersion,
      creatorKitVersion: manifest.creatorKitVersion,
      runtimeVersion: manifest.runtimeVersion,
      protocolReleaseCompatibility: manifest.protocolReleaseCompatibility,
      ...(manifest.protocolTemplate ? { protocolTemplate: { ...manifest.protocolTemplate } } : {}),
      bundleHash: validated.hashes?.bundleHash ?? null,
      projectConfigHash: validated.hashes?.projectConfigHash ?? null,
      contentHash: validated.hashes?.contentHash ?? null,
      /**
       * THE ART BINDING, carried verbatim into the importer.
       *
       * This is what the importer turns into launch parameters, and it is why creator art now
       * reaches `tokenURI`: `runtimeId` selects the renderer, `artConfigHash` is the value the
       * factory checks against `keccak256(artConfig)`, and the trait/mapping/generator hashes are
       * bound into the collection so the project's own art is the art it renders forever.
       *
       * `runtimeCodeHash` and `scriptPointer` are null here and MUST stay null: the importer fills
       * the first from the chain it is launching on, and the launch itself produces the second.
       */
      artBinding: manifest.artBinding ? { ...manifest.artBinding } : null,
      bundleCommitment: manifest.integrity?.bundleCommitment ?? null,
      generatorHash: manifest.hashes.generator,
      scriptHash: manifest.hashes.script,
      traitSchemaHash: manifest.hashes.traitSchema,
      marketMappingHash: manifest.hashes.marketMapping,
      metadataHash: manifest.hashes.metadata,
      mediaHashes: manifest.hashes.media ?? {},
      requestedChains: [...(manifest.chains?.requested ?? [])],
      /**
       * The bundle's quote-asset REQUEST, carried verbatim for the importer to resolve. Never a
       * decision: `mode`, the optional `address`, the optional `expectedKind` cross-check and the
       * registry version the bundle was built against. An importer MUST re-resolve `address`
       * against its own current registry; a bundle can never approve a quote token.
       */
      quoteAssetRequest: manifest.market?.quoteAsset
        ? {
            mode: manifest.market.quoteAsset.mode,
            address: manifest.market.quoteAsset.address ?? null,
            expectedKind: manifest.market.quoteAsset.expectedKind ?? null,
            registryVersion: manifest.market.quoteAsset.registryVersion ?? null,
          }
        : { mode: "DEFAULT", address: null, expectedKind: null, registryVersion: null },
      creatorLpFeeAssetMode: manifest.market?.creatorLpFeeAssetMode ?? "DUAL_ASSET",
      marketChainId: manifest.market?.chainId ?? null,
      earningsMode: manifest.earnings.mode,
      earningsBps: {
        creatorShareOfCollectedFeesBps: 7500,
        collaborators: (manifest.earnings.collaborators ?? []).map((c) => ({ recipient: c.recipient, bps: c.bps })),
        totalCollaboratorBps: (manifest.earnings.collaborators ?? []).reduce((sum, c) => sum + c.bps, 0),
      },
      // The creator's AUTHORING document, carried for display and diffing. It is no longer the
      // thing an importer must encode — `draft.art.scriptHex` already holds the encoded bytes —
      // so nothing downstream has to own the ACV1 layout a second time.
      templateParams: templateParamsBytes ? JSON.parse(new TextDecoder().decode(templateParamsBytes)) : null,
      artConfigFormat: manifest.artBinding?.artConfigFormat ?? null,
      artConfigHash: manifest.artBinding?.artConfigHash ?? null,
    },
  };
}
