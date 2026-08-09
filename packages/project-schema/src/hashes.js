// SPDX-License-Identifier: MIT
// Every hash the format defines, and the exact recipe for each. Both the CLI and the web importer
// call these functions on the same bytes, which is why a round trip preserves the hashes.
//
// Recipes (all SHA-256, lowercase hex, no `0x` prefix):
//
//   fileHash(path)        = sha256(raw file bytes)
//   jsonHash(document)    = sha256(utf8(canonicalJson(parsed document)))
//   generatorHash         = jsonHash({ "generator/a.js": fileHash, … })   sorted by path
//   traitSchemaHash       = jsonHash(traits/schema.json)
//   marketMappingHash     = jsonHash(market/mappings.json)
//   metadataHash          = jsonHash(metadata/collection.json)
//   scriptHash            = fileHash(the generator entry file)
//   mediaHashes           = { "assets/x.png": fileHash, … }
//   contentHash           = jsonHash({ every entry except relics.project.json and
//                                      checksums.json: fileHash })
//   projectConfigHash     = jsonHash(manifest with `integrity` removed)
//   bundleHash            = sha256(utf8("relics-project-bundle/1\n" + projectConfigHash + "\n"
//                                       + contentHash))
//
// `integrity` is excluded from `projectConfigHash` so nothing is circular: the manifest fully
// determines its own config hash, the entries determine the content hash, and the bundle hash is
// a pure function of the two.

import { canonicalJson, safeJsonParse } from "./canonical-json.js";
import { sha256Hex, sha256Utf8, fromUtf8 } from "./sha256.js";
import { BUNDLE_MAGIC } from "./version.js";
import { LIMITS } from "./limits.js";

export const HASH_ALGORITHM = "sha256";

/** @param {Uint8Array} bytes */
export function fileHash(bytes) {
  return sha256Hex(bytes);
}

/** @param {unknown} document */
export function jsonHash(document) {
  return sha256Utf8(canonicalJson(document));
}

/**
 * Parses a JSON entry with the hardened parser and returns both the value and its canonical hash.
 * @param {Uint8Array} bytes
 */
export function parseAndHashJson(bytes) {
  const value = safeJsonParse(fromUtf8(bytes), { maxDepth: LIMITS.maxJsonDepth, maxNodes: LIMITS.maxJsonNodes });
  return { value, hash: jsonHash(value) };
}

/**
 * @param {Map<string, Uint8Array>} byPath
 * @param {string} prefix
 * @returns {Record<string, string>} sorted path -> file hash
 */
export function hashesUnder(byPath, prefix) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const path of [...byPath.keys()].sort()) {
    if (path.startsWith(prefix)) out[path] = fileHash(byPath.get(path));
  }
  return out;
}

/**
 * Content hash over every entry except the manifest itself and the checksum sidecar.
 * @param {Map<string, Uint8Array>} byPath
 */
export function computeContentHash(byPath) {
  /** @type {Record<string, string>} */
  const files = {};
  for (const path of [...byPath.keys()].sort()) {
    if (path === "relics.project.json" || path === "checksums.json") continue;
    files[path] = fileHash(byPath.get(path));
  }
  return { contentHash: jsonHash(files), files };
}

/**
 * @param {Record<string, unknown>} manifest
 * @returns {string}
 */
export function computeProjectConfigHash(manifest) {
  const copy = {};
  for (const key of Object.keys(manifest)) {
    if (key === "integrity") continue;
    copy[key] = manifest[key];
  }
  return jsonHash(copy);
}

/**
 * @param {string} projectConfigHash
 * @param {string} contentHash
 */
export function computeBundleHash(projectConfigHash, contentHash) {
  return sha256Utf8(`${BUNDLE_MAGIC}\n${projectConfigHash}\n${contentHash}`);
}

/** Every hash a bundle publishes, recomputed from its own bytes. */
export function computeIntegrity(manifest, byPath) {
  const { contentHash, files } = computeContentHash(byPath);
  const projectConfigHash = computeProjectConfigHash(manifest);
  return {
    contentHash,
    projectConfigHash,
    bundleHash: computeBundleHash(projectConfigHash, contentHash),
    files,
  };
}

/** @param {string} value */
export function isSha256Hex(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
