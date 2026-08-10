// SPDX-License-Identifier: MIT
// Version surface for the bundle format. Every `.relics` bundle records all four values, so an
// importer can tell exactly which schema wrote it and which launchpad protocol release it was
// built against.

/**
 * Bundle schema version. Bump the MAJOR when a field changes meaning or a required field is
 * added; bump the MINOR when a purely additive optional field appears. An importer accepts a
 * bundle whose MAJOR it knows and whose MINOR is <= its own.
 */
export const SCHEMA_VERSION = "2.0.0";

/** Version of the creator kit (this repo's CLI + templates) that produced the bundle. */
export const CREATOR_KIT_VERSION = "2.0.0";

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
export const PROTOCOL_RELEASE_COMPATIBILITY = "v4-art-launchpad/g-1.2";

/**
 * Why 2.0.0 is a MAJOR and not a MINOR — recorded here because the temptation to add "just one
 * more optional field" and call it additive is exactly how a format drifts away from the thing it
 * describes.
 *
 * Two of this schema's own MAJOR triggers fire at once:
 *
 *   A FIELD CHANGED MEANING. `art.runtime` used to be descriptive. Nothing on chain read it, and
 *   every launched collection rendered the same built-in shapes no matter what a creator drew. It
 *   is now a binding commitment a collection's `tokenURI` reads. The same string means something
 *   it did not mean before.
 *
 *   A REQUIRED FIELD APPEARED. `artBinding` is not optional. A 1.x bundle carries no binding at
 *   all, so importing one into a world where `tokenURI` renders FROM the binding would produce a
 *   collection whose art nobody ever validated. Accepting such a bundle silently is the precise
 *   failure this release exists to remove, so it is refused with a message that says what to do.
 *
 * No 1.x bundle has ever been launched — the launchpad is PREPARED_NOT_DEPLOYED on every supported
 * chain — so there is no deployed corpus this break strands.
 */
export const SCHEMA_MAJOR_RATIONALE =
  "2.0.0 adds the required art binding and changes art.runtime from a description into an on-chain commitment; a 1.x bundle carries no binding and must be re-exported.";

/**
 * The message an importer should show for a bundle it cannot read. A bare "incompatible" tells a
 * creator nothing; naming the reason and the fix costs one function.
 * @param {string} bundleSchemaVersion
 */
export function explainIncompatibility(bundleSchemaVersion) {
  const b = parseSemver(bundleSchemaVersion);
  const i = parseSemver(SCHEMA_VERSION);
  if (!b) return `"${bundleSchemaVersion}" is not a MAJOR.MINOR.PATCH schema version.`;
  if (b.major < i.major) {
    return `This bundle was exported by creator kit schema ${bundleSchemaVersion}, which predates the art binding: it does not record which runtime renders the project or which bytes that runtime is given, so the collection it launched could not render the creator's own art. Re-export it with creator kit ${CREATOR_KIT_VERSION} (\`relics export\` on the same project directory) and import the new file.`;
  }
  if (b.major > i.major) {
    return `This bundle was exported by a newer creator kit (schema ${bundleSchemaVersion}); this importer reads schema ${SCHEMA_VERSION}. Update the launchpad, or export the project with creator kit ${CREATOR_KIT_VERSION}.`;
  }
  return `This bundle was exported by creator kit schema ${bundleSchemaVersion}; this importer reads ${SCHEMA_VERSION} and cannot be sure it understands every field. Update the launchpad to import it.`;
}

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
