// SPDX-License-Identifier: MIT
// ================================================================================================
// THE METADATA BIRTH PIPELINE.
//
//   assemble canonical bytes -> CONTENT sha256 -> pin -> FETCH BACK BY THE RETURNED CID ->
//   byte-compare -> re-hash -> re-parse as JSON -> build `ipfs://<cid>` -> RESOLVER keccak256
//
// A PIN RECEIPT IS NOT EVIDENCE. A provider returning a CID has told us it accepted bytes. It has
// not told us anyone else can read them back, and those are different claims: a provider that
// returns a CID it cannot serve, or serves different bytes for, fails HERE — where the cost is a
// refused launch instead of a permanently blank collection. The read-back is the entire value of
// this module; every other step is arithmetic we could have done without leaving the process.
//
// AND IT IS READ BACK BY THE CID THE PROVIDER RETURNED, never by one we computed. Asking a gateway
// for our own arithmetic tests our arithmetic. Asking it for the address the provider told us to
// publish tests whether the thing they told the world about is actually there.
//
// ------------------------------------------------------------------------------------------------
// TWO DIGESTS. REQUIRING THEM EQUAL IS UNSATISFIABLE.
// ------------------------------------------------------------------------------------------------
//
//   CONTENT digest   sha256 of the metadata JSON BYTES. Lives in the `.relics` bundle. Proves the
//                    document the creator reviewed is the document that got pinned. NEVER on chain.
//   RESOLVER digest  keccak256 of the URI STRING `ipfs://<cid>`. This is what `MetadataResolverRc6`
//                    keys by, and therefore what `LaunchParams.metadataUriHash` must carry for
//                    `contractURI()` to resolve at all.
//
// They are different algorithms over different bytes. A check requiring them equal fails on every
// real launch, and the repair somebody reaches for under deadline is to loosen it until it passes —
// which is how a parity check becomes decorative. `metadataUriHash` holds the RESOLVER digest
// DESPITE ITS NAME; if you are holding a value called a content hash and about to put it in
// calldata, it is the wrong one.
//
// ------------------------------------------------------------------------------------------------
// ONE KECCAK.
// ------------------------------------------------------------------------------------------------
//
// `keccak256` is imported from viem and used in exactly one function in this package. It is never
// reimplemented, and it agrees byte for byte with `keccak256Utf8` in `@relics/project-schema` —
// which is the function the vendored `metadataDigestForUri` builds `LaunchParams.metadataUriHash`
// with. That agreement is asserted in the test suite on a real URI rather than assumed, because the
// two values end up in the same transaction and a divergence would be discovered on chain.
// ================================================================================================

import { keccak256, stringToBytes, type Hex } from "viem";
import { canonicalMetadataBytes, contentSha256, inspectRetrievedDocument, isContentHash, REQUIRED_CONTRACT_URI_KEYS } from "./canonicalDocument.js";
import { isCommittableMetadataUri } from "./commitment.js";
import { MetadataRefusal, isMetadataRefusal, refusal, type MetadataRefusalResult } from "./errors.js";
import type { MetadataProvider } from "./provider.js";

/**
 * THE RESOLVER DIGEST: `keccak256(bytes(uri))`.
 *
 * The one implementation in this package, and it REFUSES anything but a canonical `ipfs://` URI. A
 * gateway URL is a different string, so it hashes to a different key, so the resolver lookup misses
 * and `contractURI()` returns nothing — a failure that surfaces only after the launch, which is
 * exactly when nothing can be changed.
 *
 * Throws rather than returning a union: a caller that reached this with a gateway URL has made a
 * programming mistake, not met an uncooperative chain, and the stack is the useful artifact.
 */
export function resolverDigestForUri(uri: string): Hex {
  if (!isCommittableMetadataUri(uri)) {
    throw new MetadataRefusal(
      "URI_NOT_CANONICAL",
      "URI",
      `resolverDigestForUri: expected a canonical ipfs:// URI, got ${JSON.stringify(uri)}. ` +
        `A gateway URL hashes to a resolver key nothing is published under, so the collection would answer contractURI() with nothing.`,
    );
  }
  return keccak256(stringToBytes(uri));
}

/** A proven metadata commitment: pinned, read back through a read path, re-hashed and re-parsed. */
export interface VerifiedMetadataDocument {
  readonly kind: "VERIFIED";
  /** `ipfs://<cid>` — the canonical URI, and the ONLY form that may be committed on-chain. */
  readonly uri: string;
  readonly cid: string;
  /** sha256 of the pinned bytes, lowercase hex, no `0x`. Belongs in the bundle, never in calldata. */
  readonly contentSha256: string;
  /** `keccak256(bytes(uri))` — this is `LaunchParams.metadataUriHash`. */
  readonly resolverDigest: Hex;
  readonly byteLength: number;
  /** For humans. NEVER canonical, never hashed, never written on-chain. */
  readonly gatewayUrl: string | null;
  /**
   * Whether the content hash was corroborated by a SECOND artifact or only computed here.
   *
   * `SELF_COMPUTED` means we hashed our own bytes and compared them to a hash of our own bytes,
   * which always passes and binds nothing. It is honest for a kit that assembled the document
   * itself; it is NOT the launch commitment. Relation 2 of the commitment still requires the
   * `.relics` bundle's own hash, produced by a different code path.
   */
  readonly contentHashBinding: "BUNDLE_COMMITTED" | "SELF_COMPUTED";
  readonly pinnedBy: string;
  readonly verifiedBy: string;
  readonly pinnedAt: string;
  readonly verifiedAt: string;
  /** True only after an independent read-back matched byte for byte. There is no other way to set it. */
  readonly fetchBackVerified: true;
}

export type PinAndVerifyResult = VerifiedMetadataDocument | MetadataRefusalResult;

export interface PinAndVerifyOptions {
  /** The write path. */
  readonly provider: MetadataProvider;
  /**
   * The READ path, when it should be a different party than the write path. Defaults to `provider`.
   *
   * A provider verifying its own pin is grading its own homework — enough to catch a provider that
   * dropped the bytes, not enough to catch one that serves them only to us. Passing a public
   * gateway here makes the read-back independent evidence.
   */
  readonly verifier?: MetadataProvider;
  /** The document to assemble canonically. Mutually exclusive with `bytes`. */
  readonly document?: unknown;
  /** Pre-built bytes, for a caller that already produced the canonical form. */
  readonly bytes?: Uint8Array;
  readonly filename?: string;
  /**
   * The `.relics` bundle's OWN content hash, lowercase hex, no `0x`.
   *
   * Optional, and the check is only meaningful when it comes from somewhere else: a freshly
   * computed hash passed here compares our bytes to a hash of our bytes and always agrees. Supply
   * the bundle's, and the comparison becomes a binding between two artifacts.
   */
  readonly expectedContentHash?: string;
  readonly requiredKeys?: readonly string[];
  readonly now?: () => Date;
}

/**
 * Pin a collection-metadata document and prove it is retrievable and unmodified.
 *
 * Returns a typed refusal rather than throwing on any expected failure, so a caller branches on
 * `result.kind` and an agent branches on `result.code`. The `stage` on a refusal is what separates
 * "never pinned" from "pinned, read-back failed": the first is a clean retry, the second has left
 * an object on a network and needs a human to decide whether to re-pin or chase the gateway.
 */
export async function pinAndVerifyMetadataDocument(opts: PinAndVerifyOptions): Promise<PinAndVerifyResult> {
  const clock = opts.now ?? (() => new Date());
  const requiredKeys = opts.requiredKeys ?? REQUIRED_CONTRACT_URI_KEYS;
  const filename = opts.filename ?? "collection-metadata.json";
  const verifier = opts.verifier ?? opts.provider;

  // ---------------------------------------------------------------------------------------------
  // 0. ASSEMBLE. One canonical serialization; a document with no canonical form is refused rather
  //    than coerced, because a coerced field is a field reviewed as one thing and pinned as another.
  // ---------------------------------------------------------------------------------------------
  if ((opts.document === undefined) === (opts.bytes === undefined)) {
    return refusal("DOCUMENT_NOT_CANONICALISABLE", "ASSEMBLE", "supply exactly one of `document` (assembled canonically here) or `bytes` (already canonical)");
  }
  let bytes: Uint8Array;
  try {
    bytes = opts.bytes ?? canonicalMetadataBytes(opts.document);
  } catch (err) {
    return asRefusal(err, "DOCUMENT_NOT_CANONICALISABLE", "ASSEMBLE");
  }
  if (bytes.length === 0) {
    return refusal("EMPTY_DOCUMENT", "ASSEMBLE", "refusing to pin an empty metadata document — an empty document has a CID, resolves, and renders as nothing");
  }

  // ---------------------------------------------------------------------------------------------
  // 1. THE CONTENT DIGEST, and the binding to the bundle's own if one was supplied.
  // ---------------------------------------------------------------------------------------------
  const localHash = contentSha256(bytes);
  let contentHashBinding: VerifiedMetadataDocument["contentHashBinding"] = "SELF_COMPUTED";
  if (opts.expectedContentHash !== undefined) {
    const expected = String(opts.expectedContentHash).replace(/^0x/i, "").toLowerCase();
    if (!isContentHash(expected)) {
      return refusal("DECLARED_CONTENT_HASH_MALFORMED", "COMMIT", "expectedContentHash must be the bundle's 64-character lowercase sha256, with no `0x` prefix");
    }
    if (localHash !== expected) {
      // The document was rebuilt somewhere between commitment and pinning, so the creator reviewed
      // something other than what would ship. Nothing has been pinned yet, and nothing will be.
      return refusal(
        "DOCUMENT_CHANGED_AFTER_COMMITMENT",
        "COMMIT",
        `the document hashes ${localHash.slice(0, 12)}… but the bundle committed ${expected.slice(0, 12)}… — it changed after commitment`,
      );
    }
    contentHashBinding = "BUNDLE_COMMITTED";
  }

  // ---------------------------------------------------------------------------------------------
  // 2. PIN.
  // ---------------------------------------------------------------------------------------------
  let cid: string;
  const pinnedAt = clock().toISOString();
  try {
    const receipt = await opts.provider.pin(bytes, filename);
    cid = receipt?.cid ?? "";
  } catch (err) {
    return asRefusal(err, "PIN_FAILED", "PIN");
  }
  if (typeof cid !== "string" || cid.trim().length === 0) {
    return refusal("PROVIDER_RETURNED_EMPTY_CID", "PIN", `provider "${opts.provider.id}" returned no CID — a receipt with no address is not a pin`);
  }

  // ---------------------------------------------------------------------------------------------
  // 3. FETCH BACK, BY THE CID THE PROVIDER RETURNED. Everything after this point has already left
  //    an object on a network, which is why the stage on these refusals is not `PIN`.
  // ---------------------------------------------------------------------------------------------
  let retrieved: Uint8Array;
  try {
    retrieved = await verifier.fetchByCid(cid);
  } catch (err) {
    return asRefusal(err, "FETCH_BACK_FAILED", "FETCH_BACK");
  }

  // ---------------------------------------------------------------------------------------------
  // 4. BYTE-COMPARE, then re-hash. The hash alone would be sufficient; the explicit comparison is
  //    what the sentence "the bytes came back unchanged" actually means, and it costs nothing on a
  //    document this size.
  // ---------------------------------------------------------------------------------------------
  if (retrieved.length !== bytes.length) {
    return refusal("FETCH_BACK_LENGTH_MISMATCH", "COMPARE", `read back ${retrieved.length} bytes from ${cid}, pinned ${bytes.length}`);
  }
  for (let i = 0; i < bytes.length; i++) {
    if (retrieved[i] !== bytes[i]) {
      return refusal("FETCH_BACK_HASH_MISMATCH", "COMPARE", `the bytes read back from ${cid} differ from the bytes pinned, first at offset ${i}`);
    }
  }
  const retrievedHash = contentSha256(retrieved);
  if (retrievedHash !== localHash) {
    return refusal("FETCH_BACK_HASH_MISMATCH", "COMPARE", `the document read back from ${cid} hashes ${retrievedHash.slice(0, 12)}… but ${localHash.slice(0, 12)}… was pinned`);
  }

  // ---------------------------------------------------------------------------------------------
  // 5. RE-PARSE. A gateway serving an HTML error page with HTTP 200 would otherwise reach the chain
  //    as a contractURI that every marketplace renders as nothing.
  // ---------------------------------------------------------------------------------------------
  const shape = inspectRetrievedDocument(retrieved, requiredKeys);
  if (shape !== null) return shape;

  // ---------------------------------------------------------------------------------------------
  // 6. THE CANONICAL URI, and the RESOLVER digest over it. `ipfs://` only.
  // ---------------------------------------------------------------------------------------------
  const uri = `ipfs://${cid.trim()}`;
  let resolverDigest: Hex;
  try {
    resolverDigest = resolverDigestForUri(uri);
  } catch (err) {
    return asRefusal(err, "URI_NOT_CANONICAL", "URI");
  }

  return {
    kind: "VERIFIED",
    uri,
    cid: cid.trim(),
    contentSha256: localHash,
    resolverDigest,
    byteLength: bytes.length,
    gatewayUrl: typeof verifier.gatewayUrl === "function" ? verifier.gatewayUrl(cid.trim()) : null,
    contentHashBinding,
    pinnedBy: opts.provider.id,
    verifiedBy: verifier.id,
    pinnedAt,
    verifiedAt: clock().toISOString(),
    fetchBackVerified: true,
  };
}

/**
 * Convert a thrown value into a typed refusal.
 *
 * An adapter's own {@link MetadataRefusal} is preserved verbatim — it knows more than the caller —
 * and anything else is reported by the stage's code with the message only. A raw error is never
 * re-thrown out of the pipeline, because a `catch` somewhere upstream would then decide what a
 * launch does about an unresolvable collection.
 */
function asRefusal(err: unknown, fallbackCode: Parameters<typeof refusal>[0], stage: Parameters<typeof refusal>[1]): MetadataRefusalResult {
  if (isMetadataRefusal(err)) return err.toJson();
  return refusal(fallbackCode, stage, err instanceof Error ? err.message : String(err));
}
