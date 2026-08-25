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
export class MetadataRefusal extends Error {
    code;
    stage;
    constructor(code, stage, message) {
        super(message);
        this.name = "MetadataRefusal";
        this.code = code;
        this.stage = stage;
    }
    /** Serialisable form for a receipt or a `--json` envelope. Never a stack, never a credential. */
    toJson() {
        return { kind: "REFUSED", code: this.code, stage: this.stage, detail: this.message };
    }
}
export function isMetadataRefusal(value) {
    return value instanceof MetadataRefusal;
}
export function refusal(code, stage, detail) {
    return { kind: "REFUSED", code, stage, detail };
}
