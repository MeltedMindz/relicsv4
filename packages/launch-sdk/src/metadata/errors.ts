// SPDX-License-Identifier: MIT
// ================================================================================================
// THE CLOSED SET OF WAYS THE METADATA BIRTH PIPELINE CAN REFUSE.
//
// Every failure in `src/metadata/**` is one of these codes carried on one Error class. Nothing here
// throws a bare string and nothing returns a boolean, because the caller is an agent or a CLI that
// has to BRANCH: "pinned, but the read-back failed" and "never pinned" are different states with
// different remedies, and a message string collapses them into one thing a human has to read.
//
// WHY THAT MATTERS MORE HERE THAN ELSEWHERE. Collection metadata is BIRTH DATA under RC6: it goes
// into `ProjectCollectionV1`'s initializer inside the same transaction that creates the collection,
// and no selector on the deployed collection can move it afterwards. There is no
// "launched, metadata pending" state and no second transaction in which a mistake gets corrected.
// So the last moment anyone can discover the document is unretrievable is BEFORE the creator signs,
// and a refusal at that moment costs a retry rather than a permanently blank collection.
//
// NO CREDENTIAL EVER REACHES A MESSAGE. A provider adapter reports an HTTP status, never a response
// body and never a header. That is defensive rather than paranoid: a pin provider that echoes the
// Authorization header back in an error body would otherwise put the JWT into a receipt, a log line
// and a bug report in one step.
// ================================================================================================

/**
 * The refusal vocabulary. A code is a permanent part of the contract with callers — add one rather
 * than widening an existing one's meaning, because an agent's branch is written against the code.
 */
export type MetadataRefusalCode =
  // ---- provider wiring -------------------------------------------------------------------------
  /** The adapter has no credential / no transport. It said so instead of pretending to work. */
  | "PROVIDER_UNAVAILABLE"
  /** A read-only adapter (a public gateway) was asked to pin. It cannot, and will not pretend to. */
  | "PROVIDER_IS_READ_ONLY"
  // ---- assembly --------------------------------------------------------------------------------
  /** Zero bytes. Refusing to pin nothing: a CID over nothing resolves, and renders as nothing. */
  | "EMPTY_DOCUMENT"
  /** The document contains a value with no single canonical JSON form (NaN, bigint, undefined…). */
  | "DOCUMENT_NOT_CANONICALISABLE"
  /** A supplied `expectedContentHash` is not a 64-character lowercase sha256. */
  | "DECLARED_CONTENT_HASH_MALFORMED"
  /** The bytes we are about to pin are not the bytes the bundle committed to. */
  | "DOCUMENT_CHANGED_AFTER_COMMITMENT"
  /** Larger than one IPFS block, which this adapter cannot content-address correctly. */
  | "DOCUMENT_TOO_LARGE"
  // ---- pinning ---------------------------------------------------------------------------------
  /** The pin call itself failed or timed out. Nothing was published; a retry is the remedy. */
  | "PIN_FAILED"
  /** The provider answered without a CID. A receipt with no address is not a pin. */
  | "PROVIDER_RETURNED_EMPTY_CID"
  // ---- the read-back, which is the whole point -------------------------------------------------
  /** The read path did not serve the CID the write path returned. */
  | "FETCH_BACK_FAILED"
  /** Read back a different number of bytes than were pinned. */
  | "FETCH_BACK_LENGTH_MISMATCH"
  /** Read back bytes whose sha256 is not the document's. THE gateway-served-something-else case. */
  | "FETCH_BACK_HASH_MISMATCH"
  /** What came back does not parse as JSON — the HTML-error-page-with-HTTP-200 case. */
  | "FETCH_BACK_NOT_JSON"
  /** Parsed, but is not a JSON object (an array, a number, `null`). */
  | "FETCH_BACK_NOT_AN_OBJECT"
  /** An object, but missing keys a marketplace needs. A tile with no `image` is a blank tile. */
  | "FETCH_BACK_MISSING_KEYS"
  // ---- the URI ---------------------------------------------------------------------------------
  /** Not a canonical `ipfs://` URI. A gateway URL hashes to a resolver key nothing is stored under. */
  | "URI_NOT_CANONICAL";

/**
 * A typed refusal. Carries the machine code, a human sentence, and the pipeline stage it happened
 * at — the stage is what distinguishes "we never pinned" from "we pinned and could not read it
 * back", which are the same sentence to a reader and completely different states to an operator.
 */
export type MetadataStage = "PROVIDER" | "ASSEMBLE" | "COMMIT" | "PIN" | "FETCH_BACK" | "COMPARE" | "PARSE" | "URI";

export class MetadataRefusal extends Error {
  readonly code: MetadataRefusalCode;
  readonly stage: MetadataStage;

  constructor(code: MetadataRefusalCode, stage: MetadataStage, message: string) {
    super(message);
    this.name = "MetadataRefusal";
    this.code = code;
    this.stage = stage;
  }

  /** Serialisable form for a receipt or a `--json` envelope. Never a stack, never a credential. */
  toJson(): { readonly kind: "REFUSED"; readonly code: MetadataRefusalCode; readonly stage: MetadataStage; readonly detail: string } {
    return { kind: "REFUSED", code: this.code, stage: this.stage, detail: this.message };
  }
}

export function isMetadataRefusal(value: unknown): value is MetadataRefusal {
  return value instanceof MetadataRefusal;
}

/**
 * The refusal as a VALUE rather than a throw.
 *
 * The pipeline returns this shape because a launch flow branches on failure far more often than it
 * aborts on one, and a returned union cannot be swallowed by a `catch` somebody added upstream for
 * a different reason. Pure precondition guards (`resolverDigestForUri`) still throw, because a
 * caller that reached one has already made a programming error rather than met a bad chain.
 */
export interface MetadataRefusalResult {
  readonly kind: "REFUSED";
  readonly code: MetadataRefusalCode;
  readonly stage: MetadataStage;
  readonly detail: string;
}

export function refusal(code: MetadataRefusalCode, stage: MetadataStage, detail: string): MetadataRefusalResult {
  return { kind: "REFUSED", code, stage, detail };
}
