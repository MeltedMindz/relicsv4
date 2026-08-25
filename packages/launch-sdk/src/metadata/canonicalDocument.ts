// SPDX-License-Identifier: MIT
// ================================================================================================
// THE BYTES. One serialization, one sha256 over it, and one shape check on what comes back.
//
// THE CONTENT DIGEST IS DEFINED EXACTLY ONCE AND IT IS NOT DEFINED HERE. `canonicalJson` and
// `sha256Hex` come from `@relics/project-schema`, which is the package that already hashes every
// `.relics` bundle — `metadataHash = jsonHash(metadata/collection.json)` is one of its named
// recipes. Writing a second serializer "for the pinned document" would produce two key orderings,
// two escapings and two sets of bytes over the same fields, maintained by different code, agreeing
// until the day they do not. On a value that is written into a collection at birth, that day is
// permanent.
//
// THE IMPORT IS THE PACKAGE NAME, NOT A RELATIVE PATH. A relative reach into
// `../../../project-schema/index.js` resolves at runtime but bypasses the generated ambient
// declarations, so `tsc` sees `any` and every hash below silently loses its type. The workspace
// link makes the bare specifier resolve to the same file with its types attached.

import { canonicalJson, sha256Hex, isSha256Hex } from "@relics/project-schema";
import { MetadataRefusal, refusal, type MetadataRefusalResult } from "./errors.js";

/**
 * The ERC-7572 fields a marketplace actually reads off `contractURI()`.
 *
 * Checked on the document READ BACK from the pin, not only on the one we assembled, because the
 * failure this whole module exists to catch is a read path that serves something else. A document
 * that parses as JSON and has none of these keys is as blank a tile as no document at all.
 *
 * The default rather than the law: `pinAndVerifyMetadataDocument` takes `requiredKeys`, so a caller
 * pinning a different kind of document says so instead of this module guessing.
 */
export const REQUIRED_CONTRACT_URI_KEYS = Object.freeze([
  "name",
  "symbol",
  "description",
  "image",
  "banner_image",
  "featured_image",
  "external_link",
  "collaborators",
] as const);

/** Canonical JSON text for the document. Throws {@link MetadataRefusal} on an uncanonical value. */
export function canonicalMetadataJson(document: unknown): string {
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new MetadataRefusal("DOCUMENT_NOT_CANONICALISABLE", "ASSEMBLE", "the metadata document must be a JSON object");
  }
  try {
    return canonicalJson(document);
  } catch (err) {
    // A bigint, a NaN, an `undefined` — values with no single canonical form. Refusing beats
    // coercing: a coerced field is a field the creator reviewed as one thing and pinned as another.
    throw new MetadataRefusal(
      "DOCUMENT_NOT_CANONICALISABLE",
      "ASSEMBLE",
      `the metadata document has no canonical JSON form: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** The exact UTF-8 bytes that get pinned. Nothing pins anything else. */
export function canonicalMetadataBytes(document: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalMetadataJson(document));
}

/**
 * THE CONTENT DIGEST — sha256 of the document bytes, lowercase hex, no `0x`.
 *
 * It lives in the `.relics` bundle and it NEVER reaches a chain. If you are holding this value and
 * about to put it in calldata, you are holding the wrong one: see `resolverDigestForUri`.
 */
export function contentSha256(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

/** True for a 64-character lowercase sha256. Re-exported so callers need one hex predicate. */
export function isContentHash(value: unknown): value is string {
  return typeof value === "string" && isSha256Hex(value);
}

/**
 * THE READ-BACK SHAPE CHECK, exported so it can be exercised on its own.
 *
 * A gateway that serves an HTML error page with HTTP 200 is the failure this catches, and in the
 * full pipeline it is normally caught one step earlier by the hash comparison — which means this
 * guard would be UNTESTED if it were only ever reachable through the pipeline's happy alignment.
 * Exporting it lets the suite hand it an error page directly and watch it refuse, so the guard is
 * evidence rather than decoration.
 */
export function inspectRetrievedDocument(bytes: Uint8Array, requiredKeys: readonly string[] = REQUIRED_CONTRACT_URI_KEYS): MetadataRefusalResult | null {
  let text: string;
  let parsed: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return refusal("FETCH_BACK_NOT_JSON", "PARSE", "the bytes read back are not valid UTF-8, so they cannot be the JSON document that was pinned");
  }
  try {
    parsed = JSON.parse(text);
  } catch {
    // Name the shape rather than the parser's complaint: "Unexpected token <" has sent people
    // looking for a JSON bug when what they had was a gateway serving an error page at HTTP 200.
    const looksLikeMarkup = /^\s*</.test(text);
    return refusal(
      "FETCH_BACK_NOT_JSON",
      "PARSE",
      looksLikeMarkup
        ? "the read path served markup, not JSON — a gateway error page returned with a success status is still a failure, and would reach the chain as a contractURI every marketplace renders as nothing"
        : "the bytes read back do not parse as JSON",
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return refusal("FETCH_BACK_NOT_AN_OBJECT", "PARSE", `the document read back parses as ${Array.isArray(parsed) ? "an array" : String(parsed === null ? "null" : typeof parsed)}, not a JSON object`);
  }
  const missing = requiredKeys.filter((key) => !Object.prototype.hasOwnProperty.call(parsed, key));
  if (missing.length > 0) {
    return refusal("FETCH_BACK_MISSING_KEYS", "PARSE", `the document read back is missing required field(s): ${missing.join(", ")}`);
  }
  return null;
}
