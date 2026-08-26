// SPDX-License-Identifier: MIT
// Version surface for the bundle format. Every `.relics` bundle records all four values, so an
// importer can tell exactly which schema wrote it and which launchpad protocol release it was
// built against.

/**
 * Bundle schema version. Bump the MAJOR when a field changes meaning or a required field is
 * added; bump the MINOR when a purely additive optional field appears. An importer accepts a
 * bundle whose MAJOR it knows and whose MINOR is <= its own.
 *
 * 4.0.0 — every bundle carries the independent RC6 `market.antiSnipeMode` wire value. FINAL
 * bundles must explicitly elect NONE or PROTECTED_98_MINUTES; UNSPECIFIED is draft-only. This is
 * a MAJOR because the field is required and a 3.x bundle cannot prove which creator election was
 * intended without inventing one.
 *
 * 3.3.0 — reviewed protocol templates may bind a canonical economics artifact by hash. The
 * optional `protocolTemplate` block is validated as an immutable product integration; ordinary
 * creator projects retain the existing backing-model supply shape.
 *
 * 3.2.0 — `supply.burnPolicy` joined the manifest: NONE (the default), HOLDER_BURN, or
 * HOLDER_AND_ALLOWANCE_BURN, chosen at launch and immutable afterwards.
 *
 * MINOR, not MAJOR, and the defaulting is what makes that true. The field is OPTIONAL and an
 * absent value means NONE — which is precisely what every 3.1.0 bundle already meant, because
 * before this release no project token could burn at all. So no existing bundle changes meaning,
 * no existing field changes meaning, and every 3.1.0 bundle imports here unchanged.
 *
 * The compatibility rule does the half that matters in the other direction: a 3.2.0 bundle
 * declaring HOLDER_BURN is REFUSED by a 3.1.0 importer, because that importer would silently
 * launch a non-burnable token and hand the creator something they did not ask for. An importer
 * that cannot honour a field must not quietly drop it.
 *
 * `currentSupply` and `cumulativeBurned` are deliberately NOT bundle fields. They are live chain
 * state — one changes with every burn, the other is zero at launch by construction — and a bundle
 * that asserted either would be asserting a history that has not happened. Both are refused by
 * name, alongside `runtimeCodeHash` and `scriptPointer`, for the same reason.
 *
 * 3.1.0 — BNB Smart Chain (56) joined the chain vocabulary, and `NATIVE_WRAPPED` joined the quote
 * kinds as the canonical name for `NATIVE_WETH`. Both widen an accepted value set without changing
 * any field's meaning, which is exactly what a MINOR is for — and the compatibility rule then does
 * the work that matters: a 3.1.0 bundle declaring chain 56 is REFUSED by a 3.0.0 importer, because
 * that importer genuinely cannot launch it. A 3.0.0 bundle still imports here unchanged.
 */
export const SCHEMA_VERSION = "4.0.0";

/**
 * Version of the creator kit (this repo's CLI + templates) that produced the bundle.
 *
 * 4.0.0 adds the explicit RC6 anti-snipe election and retires the launch-mode/anti-snipe
 * vocabulary conflation.
 *
 * 3.11.0 adds reviewed protocol-template bindings and canonical economics materialization.
 *
 * 3.10.0 carried a kit-only live platform reference update: deployed platform addresses,
 * launch-access state, the complete Robinhood stock-token quote reference, and `relics status`.
 * Those addresses were RC5's and have since been withdrawn in favour of RC6's; see
 * `deployments.js`. The bundle schema stays 3.2.0 because no manifest field changes meaning.
 *
 * 3.9.0 carried a schema MINOR (3.2.0, `supply.burnPolicy`) AND a kit-only change.
 *
 * The kit-only half is `creatorEarningsModes` on `CHAIN_PROFILES` — which NFT secondary-earnings
 * models (NONE / OPTIONAL / ENFORCED) may be launched on each chain — plus the
 * `creatorEarningsModesFor` and `enforcedEarningsAvailableOn` accessors. A chain PROFILE is not a
 * bundle FIELD, so on its own that would not have moved `SCHEMA_VERSION` at all; the burn policy
 * is what moved it.
 *
 * What it says: ENFORCED is offerable on Ethereum (1), Base (8453) and — as of 3.12.0 — Robinhood
 * Chain (4663). BNB Smart Chain (56) offers NONE and OPTIONAL, which is enough to launch: an
 * unavailable ENFORCED never blocks a chain. BNB stays excluded because OpenSea carries no NFT
 * listings or offers on that chain at all. Live validator bytecode exists at the canonical
 * addresses on 56 and is not evidence either way: Limit Break's v5 deploys permissionlessly to
 * identical addresses on any EVM chain.
 *
 * 3.12.0 is the Robinhood admission, and it is kit-only for the same reason 3.9.0's half was: a
 * chain PROFILE is not a bundle FIELD, so `SCHEMA_VERSION` does not move. What changed is that
 * `CreatorEarningsPolicy` now pins 4663's own measured validator codehash under POLICY VERSION 3
 * ONLY, for OpenSea's `StrictAuthorizedTransferSecurityRegistry`. Versions 1 and 2 remain
 * unresolvable there, and since the default policy version is 1, an ENFORCED launch on Robinhood
 * must name version 3 explicitly or be refused at the contract. A
 * bundle still cannot request enforcement — the manifest has no field for it — so nothing about
 * `.relics` import behaviour changes.
 *
 * 4.1.0 ADDS AUTONOMOUS LAUNCH AND CHANGES NO BUNDLE FIELD. `SCHEMA_VERSION` deliberately does not
 * move: a `.relics` bundle written by 4.0.0 is byte-identical under 4.1.0, imports the same way,
 * and hashes the same. What is new lives entirely OUTSIDE the bundle — `relics.agent.json` (an
 * authorization boundary, never a project manifest), the `.relics-agent/` receipt chain, and a
 * networked command group reached only through a dynamic import so the offline kit's module graph
 * is unchanged. A creator who wants none of it runs exactly what they ran before, with no network.
 *
 * 4.2.0 MAKES THE SAFE PATH THE EASY PATH, and again changes no bundle field. `agent setup` is a
 * one-time human wizard; the signer gained an authorization GRANT it holds itself (single-use by
 * default, expiring, revocable) and a real encrypted keystore; and the ERC-20's own metadata -- the
 * half a launch does not write -- is now assembled, pinned and handed over as two transactions only
 * the ProjectRights owner can send. `SCHEMA_VERSION` still does not move: a 4.0.0 bundle is
 * byte-identical under 4.2.0.
 *
 * MINOR RATHER THAN MAJOR because nothing was removed or redefined. Every 4.0.0 command keeps its
 * name, flags and behaviour, and `npm run kit:offline` proves the offline half by RUNNING it with
 * outbound connections blocked rather than by asserting it in a comment like this one.
 */
export const CREATOR_KIT_VERSION = "4.2.0";

/**
 * Version of the deterministic art runtime contract the generator was written against — the
 * shape of `render(context)` and what `context` is allowed to contain.
 */
export const RUNTIME_VERSION = "relics-art-runtime/1";

/**
 * The launchpad protocol release this schema mirrors — the PARAMETER SURFACE a bundle was built
 * for, not a statement about what is deployed.
 *
 * The two are genuinely different questions and this string only answers the first. What is
 * deployed, on which chains, under which generation, and whether any of them accepts a public
 * creator launch, is answered by `deployments.js` (read it, or run `relics status`) and set out in
 * prose in `docs/launchpad/08-status.md`.
 *
 * That section is where the deployment picture belongs. Restating it here would put the same claim
 * in two places, and the copy in a code comment is the one nobody updates.
 */
export const PROTOCOL_RELEASE_COMPATIBILITY = "v4-art-launchpad/rc6";

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
 * No public creator launch accepted a 2.x bundle before this release, so there is no live project
 * corpus this break strands.
 */
export const SCHEMA_MAJOR_RATIONALE =
  "4.0.0 requires a bundle to carry the creator's independent RC6 anti-snipe election. A 3.x bundle contains no antiSnipeMode, so accepting it for final launch would require inventing NONE or PROTECTED_98_MINUTES. Import it for review, make the election explicitly, and re-export.";

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
    if (b.major === 3) {
      return `This bundle was exported by creator kit schema ${bundleSchemaVersion}. It does not carry the independent RC6 anti-snipe election, so a final importer cannot safely infer NONE or PROTECTED_98_MINUTES from launchMode. Import it as a draft, choose antiSnipeMode explicitly, then re-export with creator kit ${CREATOR_KIT_VERSION}.`;
    }
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
 * DRAFT IDENTITY IS INTRINSIC, NOT A FILENAME.
 *
 * A creator needs a reviewable artifact before the final treasury details exist. The obvious way
 * to give them one is a flag that skips a check and writes the same file — and then draft-ness
 * lives only in the name, so `mv draft.relics-draft final.relics` produces a launchable bundle
 * that never passed the checks it skipped.
 *
 * So a draft differs in three committed ways, none of which a rename touches:
 *   1. the ARCHIVE MARKER is `relics-project-draft/1`, so `readContainer` refuses it as a bundle;
 *   2. the MANIFEST carries `status: "DRAFT"`, which is inside both integrity hashes;
 *   3. the COMMITMENT is computed over the draft marker, so it can never equal a final one.
 *
 * The extension is the courtesy, not the mechanism.
 */
export const DRAFT_MAGIC = "relics-project-draft/1";
export const DRAFT_EXTENSION = ".relics-draft";
export const BUNDLE_STATUSES = Object.freeze(["FINAL", "DRAFT"]);
/** @param {string} status */
export function magicForStatus(status) {
  return status === "DRAFT" ? DRAFT_MAGIC : BUNDLE_MAGIC;
}

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
