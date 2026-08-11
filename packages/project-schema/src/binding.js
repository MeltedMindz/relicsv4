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
import { encodeArtConfigV1, validateArtConfigV1, decodeArtConfigV1, withArtConfigV1Appendix, ACV1_FORMAT } from "./art-config-v1.js";
import { visualHashArtConfigV1, traitSchemaHashArtConfigV1 } from "./art-config-v1-hashes.js";
import { keccak256Hex, keccak256Utf8, isKeccak256Hex } from "./keccak256.js";
import { utf8, toHex } from "./sha256.js";
import { ART_RUNTIME_IDS, ART_RUNTIME_TO_MODE, ART_RUNTIME_VERSIONS, LAUNCHABLE_ART_RUNTIMES } from "./vocabulary.js";
import { BUNDLE_MAGIC, SCHEMA_VERSION } from "./version.js";

/** Raised when a project cannot state the art configuration its own launch would carry. */
export class ArtConfigDerivationError extends Error {}

/**
 * The fixed seeds a bundle commits its representative output digests for. Eight seeds, small
 * enough to keep the manifest readable and spread widely enough that a generator which collapses
 * to one image, ignores its seed, or drifts between engines fails the comparison. The importer
 * re-renders exactly these in its own sandbox; a mismatch means the art the creator validated is
 * not the art the launchpad would run, which is a refusal, not a warning.
 */
export const BINDING_SEEDS = Object.freeze(["1", "2", "3", "5", "8", "13", "21", "34"]);

/** Where the bytes hashed into `artConfigHash` come from. */
export const ART_CONFIG_SOURCES = Object.freeze(["GENERATOR_SCRIPT", "ART_CONFIG_V1"]);

/**
 * The FORMAT of the bytes a runtime is handed. Not a synonym for the runtime: it names how the
 * configuration is laid out, which is what an importer needs in order to decode and show it.
 *
 *   ACV1          the creator art configuration defined by `ArtConfigV1.sol` — a palette, a layer
 *                 graph binding market sensors to drawing primitives, a trait schema and a title.
 *                 The Solidity runtime's config format.
 *   JS_SOURCE_V1  the generator entry file, byte for byte. The JavaScript runtime's `artConfig`
 *                 IS the script, so there is no separate configuration document.
 */
export const ART_CONFIG_FORMATS = Object.freeze(["ACV1", "JS_SOURCE_V1"]);

/** Which format each runtime's `artConfig` is written in. */
export const ART_RUNTIME_TO_CONFIG_FORMAT = Object.freeze({ SOLIDITY_SVG: "ACV1", JAVASCRIPT: "JS_SOURCE_V1" });

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
  "artRuntimeVersion",
  "artMode",
  "templateId",
  "artConfigSource",
  "artConfigFormat",
  "artConfig",
  "artConfigBytes",
  "artConfigHash",
  "artConfigVisualHash",
  "artConfigTraitSchemaHash",
  "templateParamsHash",
  "generatorSourceHash",
  "traitSchemaDocumentHash",
  "marketMappingHash",
  "metadataHash",
  "representativeOutputsHash",
  ...CHAIN_RESOLVED_BINDING_FIELDS,
]);

/**
 * Whether the launchpad currently binds and renders a runtime.
 *
 * DELIBERATELY NOT A MANIFEST FIELD. Launchability is a property of the protocol on the day you
 * ask, not of the bundle — writing it into the manifest would fold a release decision into the
 * bundle hash, so enabling a runtime would invalidate every bundle exported while it was gated and
 * a creator's valid file would start failing validation for a reason that has nothing to do with
 * their project. It is computed wherever it is displayed instead, and a bundle exported today is
 * byte-identical to the same bundle exported after the gate flips.
 * @param {string} runtime
 */
export function isRuntimeLaunchable(runtime) {
  return LAUNCHABLE_ART_RUNTIMES.includes(runtime);
}

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
export function computeBundleCommitment(projectConfigHash, contentHash, magic = BUNDLE_MAGIC) {
  // The marker is already the first line of the preimage, which is what makes draft-ness part of
  // the commitment rather than a label beside it: a draft and a final bundle with byte-identical
  // content commit to different values, and no FINAL commitment changes because its marker did not.
  return keccak256Utf8(`${magic}\n${projectConfigHash}\n${contentHash}`);
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

  // THE BYTES A RUNTIME IS ACTUALLY HANDED, for both runtimes, with no null left standing.
  //
  // JAVASCRIPT: `artConfig` IS the generator entry file, byte for byte.
  //
  // SOLIDITY_SVG: `artConfig` is the creator's ACV1 configuration. Schema 2 left this null and said
  // so honestly — no published parameter layout existed, and refusing to state a value the kit
  // could not derive was the right call. ACV1 is that layout, so the refusal has expired: the kit
  // encodes the creator's configuration itself and states the hash the launch will check.
  //
  // In BOTH cases `artConfigHash` is keccak256 over the EXACT bytes handed to the factory —
  // appendix included for ACV1 — which is `LaunchParams.artScriptHash`.
  const artConfigSource = isJavaScript ? "GENERATOR_SCRIPT" : "ART_CONFIG_V1";
  const artConfigBytes = isJavaScript ? input.scriptBytes : (input.artConfigBytes ?? null);

  if (!(artConfigBytes instanceof Uint8Array) || artConfigBytes.length === 0) {
    throw new Error(
      "computeArtBinding needs the exact art configuration bytes: a bundle that cannot state the configuration its own launch would carry is the gap schema 3 exists to close",
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    runtime,
    runtimeId: ART_RUNTIME_IDS[runtime] ?? null,
    runtimeIdHash: ART_RUNTIME_IDS[runtime] ? keccak256Utf8(ART_RUNTIME_IDS[runtime]) : null,
    // The `uint16` the runtime reports about itself, mirroring `ArtBindingInputV1.runtimeVersion`.
    artRuntimeVersion: ART_RUNTIME_VERSIONS[runtime] ?? null,
    artMode: ART_RUNTIME_TO_MODE[runtime] ?? null,
    templateId: isJavaScript ? "0" : String(input.templateId ?? "0"),
    artConfigSource,
    artConfigFormat: ART_RUNTIME_TO_CONFIG_FORMAT[runtime] ?? null,
    // The configuration ITSELF, so a bundle carries its art and not merely a digest of it. Null for
    // JavaScript, where the bytes are already an entry (`generator/generate.js`) and restating up
    // to 36 KB of them as hex would bloat every manifest to say nothing new.
    artConfig: isJavaScript ? null : toHex(artConfigBytes),
    artConfigBytes: artConfigBytes.length,
    artConfigHash: keccak256Hex(artConfigBytes),
    // The two commitments the runtime derives from the DECODED configuration. ACV1 only: they are
    // properties of the declared program, and a JavaScript generator declares no such program.
    artConfigVisualHash: isJavaScript ? null : (input.artConfigVisualHash ?? null),
    artConfigTraitSchemaHash: isJavaScript ? null : (input.artConfigTraitSchemaHash ?? null),
    // Retained: the creator's AUTHORING document, which is what they edit and diff. The
    // configuration bytes are derived from it, so the two are checked against each other.
    templateParamsHash: isJavaScript ? null : keccakJson(input.templateParams ?? null),
    // NAMED APART FROM THE CHAIN'S FIELDS ON PURPOSE. `ProjectCollection` derives values it also
    // calls `generatorHash` and `traitSchemaHash`, and they are DIFFERENT QUANTITIES that can never
    // equal these:
    //
    //   the collection's generatorHash    = keccak256(abi.encode(mode, runtimeVersion,
    //                                       runtimeCodeHash, artConfigHash, traitSchemaHash,
    //                                       marketMappingHash))
    //   the collection's traitSchemaHash  = keccak256(abi.encode(uint8(1), ArtTraitV1[])) over the
    //                                       traits decoded from the ACV1 bytes
    //
    // The first necessarily includes `runtimeCodeHash`, a CHAIN FACT this schema forbids a bundle
    // from asserting at all — so no care on either side could ever make them agree. The second is
    // over the ACV1 trait declarations, not over `traits/schema.json`. Both pairs are honest
    // commitments to the same subject matter and neither is computable from the other.
    //
    // Sharing the names was the hazard: it invites someone to assert an equality that can only be
    // satisfied by making one side wrong. The ACV1 half IS carried, as
    // `artConfigTraitSchemaHash`, and it does equal the collection's `traitSchemaHash`.
    /** keccak over the canonical JSON of the generator SOURCE FILE digests in this bundle. */
    generatorSourceHash: keccakJson(input.generatorFileHashes),
    /** keccak over `traits/schema.json`, the marketplace trait-schema DOCUMENT. */
    traitSchemaDocumentHash: keccakJson(input.traitSchema),
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

/**
 * THE ONE DERIVATION of the exact bytes this project's runtime will be handed, and the two commitments the runtime
 * derives from them.
 *
 * JAVASCRIPT: the generator entry file, byte for byte.
 *
 * SOLIDITY_SVG: the creator's ACV1 configuration, encoded from `generator/params.json`. It is
 * ENCODED HERE rather than accepted as bytes from the project directory, which matters: a creator
 * cannot hand over a configuration that disagrees with the parameters they authored, because there
 * is only one document and the bytes are a function of it.
 *
 * The refusal below is the point of schema 3. A Solidity-SVG project with no art configuration is
 * exactly the bundle that used to launch happily and render somebody else's shapes.
 *
 * IT LIVES HERE, NOT IN THE BUILDER, because the builder writes the binding and the validator
 * recomputes it from the finished container to prove it was not hand-edited. Two derivations would
 * make that proof meaningless the moment they disagreed; one derivation makes the recomputation a
 * real check.
 */
export function deriveArtConfig({ runtime, templateParams, scriptBytes }) {
  if (runtime === "JAVASCRIPT") return { bytes: scriptBytes, visualHash: null, traitSchemaHash: null };

  if (!templateParams || typeof templateParams !== "object") {
    throw new ArtConfigDerivationError(
      "generator/params.json is required for the SOLIDITY_SVG runtime: it is the project's ACV1 art configuration, and a bundle that does not state one cannot state what its launch would render",
    );
  }
  // AN UNFINISHED MIGRATION DRAFT, named as such. Falling through to the encoder would report
  // whichever null it happened to reach first ("animate must be a boolean"), which tells a creator
  // to fix one field and try again, seven times. List every decision still outstanding at once.
  const unfilled = ["animate", "background", "palette", "layers", "traits", "title"].filter((field) => templateParams[field] === null);
  if (unfilled.length > 0) {
    throw new ArtConfigDerivationError(
      `generator/params.json is an unfinished art configuration: ${unfilled.join(", ")} ${unfilled.length === 1 ? "is" : "are"} still null. ` +
        "Every one of them is an artistic decision this kit will not make for you — there is no default configuration and no template to borrow from, because art derived from a generic template is the failure this format exists to prevent. " +
        "The vocabularies and bounds for each field are in the `_migration` block of that file.",
    );
  }

  if (templateParams.format !== ACV1_FORMAT) {
    throw new ArtConfigDerivationError(
      `generator/params.json must declare "format": "${ACV1_FORMAT}". A pre-3.0.0 parameter document is not an art configuration — it names no market sensor, no response curve and no literal palette, and those cannot be guessed. Run \`relics migrate\` to carry over what is recoverable and supply the rest.`,
    );
  }

  const verdict = validateArtConfigV1(templateParams);
  if (!verdict.ok) {
    throw new ArtConfigDerivationError(`generator/params.json is not a valid ACV1 configuration: ${verdict.name} (${verdict.code}) — ${verdict.reason}`);
  }

  const document = encodeArtConfigV1(templateParams);
  // An appendix is opaque, uninterpreted and COMMITTED — it changes `artConfigHash` and nothing
  // else. Carried through verbatim so a creator can attach provenance without it touching the art.
  const appendix = typeof templateParams.appendixHex === "string" && templateParams.appendixHex.length > 0 ? hexBytes(templateParams.appendixHex) : null;
  const bytes = appendix ? withArtConfigV1Appendix(document, appendix) : document;

  const decoded = decodeArtConfigV1(bytes);
  return { bytes, visualHash: visualHashArtConfigV1(decoded.config), traitSchemaHash: traitSchemaHashArtConfigV1(decoded.config) };
}

function hexBytes(value) {
  if (!/^[0-9a-f]*$/.test(value) || value.length % 2 !== 0) {
    throw new ArtConfigDerivationError("generator/params.json appendixHex must be bare lowercase hex with an even length");
  }
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}
