// SPDX-License-Identifier: MIT
// The importer-facing projection: turns a validated bundle into the studio draft the launchpad
// creator app already edits, so importing a bundle lands a creator on the normal review screen
// with every field filled in and nothing to re-enter.
//
// This function is the reason the CLI and the web importer cannot drift: there is one mapping,
// it lives next to the schema that defines both sides, and the provenance block it returns lets
// the importer display the same hashes the CLI printed at export time.

import { ART_RUNTIME_TO_MODE, STARTING_PRESET_TO_INDEX } from "./vocabulary.js";
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

  const chainId = options.chainId ?? (Array.isArray(manifest.chains?.requested) ? manifest.chains.requested[0] : null) ?? null;

  const draft = {
    version: 3,
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
      // JAVASCRIPT carries the script itself. SOLIDITY_SVG carries template CONFIG bytes, which
      // only the template's published parameter layout can encode — the kit deliberately does not
      // invent that encoding, so the draft arrives with an empty config and the declarative
      // parameters travel in `provenance.templateParams` for the prepare step to encode.
      scriptHex: isJavaScript && scriptBytes ? `0x${toHex(scriptBytes)}` : "0x",
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
      backingModel: manifest.supply.backingModel,
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
      bundleHash: validated.hashes?.bundleHash ?? null,
      projectConfigHash: validated.hashes?.projectConfigHash ?? null,
      contentHash: validated.hashes?.contentHash ?? null,
      generatorHash: manifest.hashes.generator,
      scriptHash: manifest.hashes.script,
      traitSchemaHash: manifest.hashes.traitSchema,
      marketMappingHash: manifest.hashes.marketMapping,
      metadataHash: manifest.hashes.metadata,
      mediaHashes: manifest.hashes.media ?? {},
      requestedChains: [...(manifest.chains?.requested ?? [])],
      earningsMode: manifest.earnings.mode,
      earningsBps: {
        creatorShareOfCollectedFeesBps: 7500,
        collaborators: (manifest.earnings.collaborators ?? []).map((c) => ({ recipient: c.recipient, bps: c.bps })),
        totalCollaboratorBps: (manifest.earnings.collaborators ?? []).reduce((sum, c) => sum + c.bps, 0),
      },
      templateParams: templateParamsBytes ? JSON.parse(new TextDecoder().decode(templateParamsBytes)) : null,
    },
  };
}
