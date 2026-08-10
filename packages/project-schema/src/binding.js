// SPDX-License-Identifier: MIT
// THE ART BINDING — the part of a bundle a collection actually renders from.
//
// Until schema 2.0.0 a bundle described its art to a human and to a validator, and nothing else.
// The launch stored the script bytes on chain, but `ProjectCollection.tokenURI` never referenced
// them: every project rendered the same built-in shapes regardless of what its creator drew. The
// binding closes that gap. A project now carries an IMMUTABLE record of which runtime renders it
// and which exact bytes that runtime was given, and `tokenURI` reads it.
//
// WHAT A BUNDLE MAY STATE, AND WHAT IT MAY NOT
// --------------------------------------------
// A bundle states facts about ITS OWN BYTES. Every field below is a pure function of the container
// the creator exported, so anyone holding the file can recompute all of it and get the same answer.
//
// A bundle may NEVER state a fact about a chain:
//
//   runtimeCodeHash  the deployed renderer's `EXTCODEHASH`. The importer reads it from the chain
//                    the creator is launching on, at import time. A bundle that asserted one would
//                    be claiming which contract is deployed where — and a bundle that could pin a
//                    renderer could pin a renderer of its choosing.
//   scriptPointer    the SSTORE2 address the launch writes. It does not exist until the launch
//                    transaction executes and cannot be known before it.
//
// Both are present in the binding as explicit `null` rather than absent, so the shape of a bundle
// and the shape of the on-chain record line up field for field, and so a forger that fills them in
// is refused by name (`ART_BINDING_CHAIN_CLAIM`) instead of slipping through an unknown-key check.
// This is the same REQUEST-never-APPROVAL rule the quote asset follows.
//
// TWO HASH FAMILIES, ON PURPOSE
// -----------------------------
// `hashes.*` are sha256 and address the FILES: reproducible with `shasum`, meaningful in a diff,
// and what the container's checksum sidecar uses. `artBinding.*` are keccak256 over the very same
// documents, because keccak is what the EVM computes and what the on-chain record holds. Same
// bytes, two algorithms, stated separately so neither is ever mistaken for the other.

import { canonicalJson } from "./canonical-json.js";
import { keccak256Hex, keccak256Utf8, isKeccak256Hex } from "./keccak256.js";
import { utf8 } from "./sha256.js";
import { ART_RUNTIME_IDS, ART_RUNTIME_TO_MODE, LAUNCHABLE_ART_RUNTIMES } from "./vocabulary.js";
import { BUNDLE_MAGIC, SCHEMA_VERSION } from "./version.js";

/**
 * The fixed seeds a bundle commits its representative output digests for. Eight seeds, small
 * enough to keep the manifest readable and spread widely enough that a generator which collapses
 * to one image, ignores its seed, or drifts between engines fails the comparison. The importer
 * re-renders exactly these in its own sandbox; a mismatch means the art the creator validated is
 * not the art the launchpad would run, which is a refusal, not a warning.
 */
export const BINDING_SEEDS = Object.freeze(["1", "2", "3", "5", "8", "13", "21", "34"]);

/** Where the bytes hashed into `artConfigHash` come from. */
export const ART_CONFIG_SOURCES = Object.freeze(["GENERATOR_SCRIPT", "TEMPLATE_PARAMS"]);

/**
 * Binding fields that are resolved or produced ON CHAIN. A bundle carries them as `null`, always.
 * Listed once here so the builder, the validator and the importer agree on the set.
 */
export const CHAIN_RESOLVED_BINDING_FIELDS = Object.freeze(["runtimeCodeHash", "scriptPointer"]);

/** Every key the binding block may contain. Closed, like the rest of the manifest. */
export const ART_BINDING_KEYS = Object.freeze([
  "schemaVersion",
  "runtime",
  "runtimeId",
  "runtimeIdHash",
  "runtimeLaunchable",
  "artMode",
  "templateId",
  "artConfigSource",
  "artConfigBytes",
  "artConfigHash",
  "templateParamsHash",
  "generatorHash",
  "traitSchemaHash",
  "marketMappingHash",
  "metadataHash",
  "representativeOutputsHash",
  ...CHAIN_RESOLVED_BINDING_FIELDS,
]);

/** keccak256 of a JSON document's canonical serialization. @param {unknown} document */
export function keccakJson(document) {
  return keccak256Utf8(canonicalJson(document));
}

/**
 * The bundle's chain-shaped commitment: keccak256 over the SAME preimage as the sha256
 * `integrity.bundleHash`, so one string identifies the bundle in a `bytes32` field without
 * inventing a second definition of what "this bundle" means.
 * @param {string} projectConfigHash
 * @param {string} contentHash
 */
export function computeBundleCommitment(projectConfigHash, contentHash) {
  return keccak256Utf8(`${BUNDLE_MAGIC}\n${projectConfigHash}\n${contentHash}`);
}

/**
 * Commitment to what the generator actually draws.
 * @param {Record<string, string>} outputs seed -> sha256 hex of the rendered output
 */
export function representativeOutputsCommitment(outputs) {
  const sorted = {};
  for (const seed of BINDING_SEEDS) {
    if (typeof outputs?.[seed] !== "string") return null;
    sorted[seed] = outputs[seed];
  }
  return keccakJson(sorted);
}

/**
 * Derives the whole binding from a bundle's own bytes. Pure — no I/O, no chain, no sandbox. The
 * builder calls it while assembling; the validator calls it again on the finished container and
 * refuses any difference, which is what makes the block impossible to hand-edit.
 *
 * @param {{
 *   runtime: string,
 *   templateId?: string | null,
 *   scriptBytes: Uint8Array,
 *   generatorFileHashes: Record<string, string>,
 *   traitSchema: unknown,
 *   marketMappings: unknown,
 *   collectionMetadata: unknown,
 *   templateParams?: unknown,
 *   representativeOutputs?: Record<string, string> | null,
 * }} input
 */
export function computeArtBinding(input) {
  const runtime = input.runtime;
  const isJavaScript = runtime === "JAVASCRIPT";

  // JAVASCRIPT: `artConfig` IS the generator entry file, byte for byte — the factory hashes those
  // exact bytes (`artScriptHash = keccak256(artConfig)`) and stores them with SSTORE2, so the kit
  // can state the value the launch will carry.
  //
  // SOLIDITY_SVG: `artConfig` is per-launch config for a REGISTERED template, and only that
  // template's published parameter layout can encode it. The kit does not invent that encoding and
  // therefore does not pretend to know the hash: `artConfigHash` is null and the creator's
  // declarative parameters travel as `templateParamsHash`, which the importer's encoder must
  // reproduce. Refusing to state a value we cannot derive is the whole point of the block.
  const artConfigSource = isJavaScript ? "GENERATOR_SCRIPT" : "TEMPLATE_PARAMS";

  return {
    schemaVersion: SCHEMA_VERSION,
    runtime,
    runtimeId: ART_RUNTIME_IDS[runtime] ?? null,
    runtimeIdHash: ART_RUNTIME_IDS[runtime] ? keccak256Utf8(ART_RUNTIME_IDS[runtime]) : null,
    runtimeLaunchable: LAUNCHABLE_ART_RUNTIMES.includes(runtime),
    artMode: ART_RUNTIME_TO_MODE[runtime] ?? null,
    templateId: isJavaScript ? "0" : String(input.templateId ?? "0"),
    artConfigSource,
    artConfigBytes: isJavaScript ? input.scriptBytes.length : 0,
    artConfigHash: isJavaScript ? keccak256Hex(input.scriptBytes) : null,
    templateParamsHash: isJavaScript ? null : keccakJson(input.templateParams ?? null),
    generatorHash: keccakJson(input.generatorFileHashes),
    traitSchemaHash: keccakJson(input.traitSchema),
    marketMappingHash: keccakJson(input.marketMappings),
    metadataHash: keccakJson(input.collectionMetadata),
    representativeOutputsHash: input.representativeOutputs ? representativeOutputsCommitment(input.representativeOutputs) : null,
    runtimeCodeHash: null,
    scriptPointer: null,
  };
}

/**
 * Field-by-field comparison used by the validator and by any importer that wants to prove a
 * manifest's binding against the container it arrived in.
 * @param {any} declared
 * @param {any} derived
 * @returns {string[]} field names that differ
 */
export function diffArtBinding(declared, derived) {
  const differences = [];
  for (const key of ART_BINDING_KEYS) {
    const a = declared?.[key] ?? null;
    const b = derived?.[key] ?? null;
    if (a !== b) differences.push(key);
  }
  return differences;
}

/** @param {unknown} value */
export { isKeccak256Hex };
export { keccak256Hex, keccak256Utf8 };
export { utf8 };
