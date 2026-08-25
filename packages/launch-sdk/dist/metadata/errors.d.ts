/**
 * The refusal vocabulary. A code is a permanent part of the contract with callers — add one rather
 * than widening an existing one's meaning, because an agent's branch is written against the code.
 */
export type MetadataRefusalCode = 
/** The adapter has no credential / no transport. It said so instead of pretending to work. */
"PROVIDER_UNAVAILABLE"
/** A read-only adapter (a public gateway) was asked to pin. It cannot, and will not pretend to. */
 | "PROVIDER_IS_READ_ONLY"
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
/** The pin call itself failed or timed out. Nothing was published; a retry is the remedy. */
 | "PIN_FAILED"
/** The provider answered without a CID. A receipt with no address is not a pin. */
 | "PROVIDER_RETURNED_EMPTY_CID"
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
/** Not a canonical `ipfs://` URI. A gateway URL hashes to a resolver key nothing is stored under. */
 | "URI_NOT_CANONICAL";
/**
 * A typed refusal. Carries the machine code, a human sentence, and the pipeline stage it happened
 * at — the stage is what distinguishes "we never pinned" from "we pinned and could not read it
 * back", which are the same sentence to a reader and completely different states to an operator.
 */
export type MetadataStage = "PROVIDER" | "ASSEMBLE" | "COMMIT" | "PIN" | "FETCH_BACK" | "COMPARE" | "PARSE" | "URI";
export declare class MetadataRefusal extends Error {
    readonly code: MetadataRefusalCode;
    readonly stage: MetadataStage;
    constructor(code: MetadataRefusalCode, stage: MetadataStage, message: string);
    /** Serialisable form for a receipt or a `--json` envelope. Never a stack, never a credential. */
    toJson(): {
        readonly kind: "REFUSED";
        readonly code: MetadataRefusalCode;
        readonly stage: MetadataStage;
        readonly detail: string;
    };
}
export declare function isMetadataRefusal(value: unknown): value is MetadataRefusal;
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
export declare function refusal(code: MetadataRefusalCode, stage: MetadataStage, detail: string): MetadataRefusalResult;
