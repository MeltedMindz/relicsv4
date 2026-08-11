// SPDX-License-Identifier: MIT
// Version surface for the bundle format. Every `.relics` bundle records all four values, so an
// importer can tell exactly which schema wrote it and which launchpad protocol release it was
// built against.

/**
 * Bundle schema version. Bump the MAJOR when a field changes meaning or a required field is
 * added; bump the MINOR when a purely additive optional field appears. An importer accepts a
 * bundle whose MAJOR it knows and whose MINOR is <= its own.
 */
export const SCHEMA_VERSION = "3.0.0";

/**
 * Version of the creator kit (this repo's CLI + templates) that produced the bundle.
 *
 * 3.2.0, and still NOT a schema bump. Two kit releases have now changed what the kit SAYS about
 * the launchpad's economics (`src/economics.js`) without changing what a `.relics` bundle
 * CONTAINS: 3.1.0 moved the RELICS buyback to half the platform share, and 3.2.0 moved the
 * platform entitlement itself into the market's selected quote asset. Neither adds, removes or
 * redefines a bundle field, so `SCHEMA_VERSION` stays 3.0.0 and every 3.0.0 bundle remains
 * readable. Bumping the schema because a policy moved would strand a corpus for nothing.
 */
export const CREATOR_KIT_VERSION = "3.5.0";

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
 * Why 3.0.0 is a MAJOR and not a MINOR — recorded here because the temptation to add "just one
 * more optional field" and call it additive is exactly how a format drifts away from the thing it
 * describes.
 *
 * Both of this schema's MAJOR triggers fire, again:
 *
 *   A REQUIRED FIELD APPEARED. A bundle must now carry the EXACT ART CONFIGURATION its launch
 *   would use — `artConfigFormat`, the configuration bytes, and their keccak256. 2.0.0 recorded
 *   which runtime renders a project but, for the Solidity runtime, deliberately left
 *   `artConfigHash` null: no published parameter layout existed, so the kit refused to state a
 *   value it could not derive. ACV1 is that layout. The reason for the null is gone, and a bundle
 *   that cannot state its own art configuration cannot state what its launch would carry.
 *
 *   A FIELD CHANGED MEANING. `artBinding.artConfigHash` was "null, because unknowable" for
 *   SOLIDITY_SVG. It is now the value `LaunchpadFactory._storeArt` checks `keccak256(artConfig)`
 *   against and `ProjectCollection.bindArt` re-checks against the bytes it reads back out of
 *   storage. Same field, different force.
 *
 * WHY 2.0.0 CANNOT SIMPLY BE MIGRATED — the question this version was chosen to answer.
 *
 * A 2.0.0 Solidity-SVG bundle carries `generator/params.json`, and it is tempting to read that as
 * "the values are already there, just re-shape them." They are not. ACV1 requires, per layer, a
 * market SENSOR and a response CURVE, plus a literal RGB palette and a background index. A 2.0.0
 * params document carries none of them: its palette is an INDEX into a table that exists only
 * inside the template's local preview sketch — a sketch that overrides the index at render time
 * from market state — and it has no sensor, no curve and no background field at all. Deriving a
 * palette from that table would be picking a generic template's colours and calling them the
 * artist's. That is the exact failure this release exists to eliminate, so the migration refuses
 * instead: a 2.x bundle imports as a DRAFT with every recoverable field carried over, the creator
 * supplies the art configuration, and a new export is required.
 *
 * No 2.x bundle has ever been launched — the launchpad is PREPARED_NOT_DEPLOYED on every supported
 * chain — so there is no deployed corpus this break strands.
 */
export const SCHEMA_MAJOR_RATIONALE =
  "3.0.0 requires a bundle to carry the exact art configuration its launch would use (artConfigFormat, the configuration bytes and their keccak256); a 2.x bundle states no configuration a Solidity runtime could render and must be re-exported after the creator supplies one.";

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
    if (b.major === 2) {
      return `This bundle was exported by creator kit schema ${bundleSchemaVersion}. It records which runtime renders the project, but not the art configuration that runtime is given — for a Solidity-SVG project schema 2 left \`artConfigHash\` null because no published parameter layout existed yet. ACV1 is that layout, and it needs values a schema 2 bundle does not contain: a market sensor and a response curve for every layer, a literal palette, and a background. They cannot be guessed from \`generator/params.json\` without inventing an artist's choices. Import it to recover everything that IS recoverable, supply the art configuration, then \`relics export\` with creator kit ${CREATOR_KIT_VERSION} and import the new file.`;
    }
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
