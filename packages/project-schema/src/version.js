// SPDX-License-Identifier: MIT
// Version surface for the bundle format. Every `.relics` bundle records all four values, so an
// importer can tell exactly which schema wrote it and which launchpad protocol release it was
// built against.

/**
 * Bundle schema version. Bump the MAJOR when a field changes meaning or a required field is
 * added; bump the MINOR when a purely additive optional field appears. An importer accepts a
 * bundle whose MAJOR it knows and whose MINOR is <= its own.
 */
export const SCHEMA_VERSION = "1.0.0";

/** Version of the creator kit (this repo's CLI + templates) that produced the bundle. */
export const CREATOR_KIT_VERSION = "1.0.0";

/**
 * Version of the deterministic art runtime contract the generator was written against — the
 * shape of `render(context)` and what `context` is allowed to contain.
 */
export const RUNTIME_VERSION = "relics-art-runtime/1";

/**
 * The launchpad protocol release this schema mirrors. The launchpad is PREPARED_NOT_DEPLOYED on
 * every supported chain and its review to date is internal only — this string identifies the
 * parameter surface the bundle was built for, never a deployment.
 */
export const PROTOCOL_RELEASE_COMPATIBILITY = "v4-art-launchpad/g-1.1";

/** Magic string embedded in the container so a stray ZIP cannot be mistaken for a bundle. */
export const BUNDLE_MAGIC = "relics-project-bundle/1";

/** Canonical file extension. */
export const BUNDLE_EXTENSION = ".relics";

/**
 * True when an importer at `importerSchemaVersion` should accept a bundle written at
 * `bundleSchemaVersion`.
 * @param {string} bundleSchemaVersion
 * @param {string} importerSchemaVersion
 */
export function isSchemaCompatible(bundleSchemaVersion, importerSchemaVersion = SCHEMA_VERSION) {
  const b = parseSemver(bundleSchemaVersion);
  const i = parseSemver(importerSchemaVersion);
  if (!b || !i) return false;
  if (b.major !== i.major) return false;
  return b.minor <= i.minor;
}

/** @param {string} value */
export function parseSemver(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}
