// SPDX-License-Identifier: MIT
// ================================================================================================
// THE METADATA BIRTH PIPELINE, under adversarial providers.
//
//   node --import tsx --test packages/launch-sdk/test/metadata.test.mjs
//
// (`--import tsx` is needed because the SDK sources are TypeScript with `.js` specifiers, the same
// arrangement `apps/web`'s unit suite runs under.)
//
// EVERY TEST HERE IS A NEGATIVE CONTROL EXCEPT THE HAPPY PATH. That ordering is deliberate: the
// value of this pipeline is entirely in what it REFUSES, and a suite that only proves a good
// document survives has tested nothing a `return true` would fail. So each hostile provider below
// is a real implementation of `MetadataProvider` — the interface is the boundary, and the tests
// exercise it the way a broken gateway would rather than by reaching inside the pipeline.
//
// The one that matters most is the HTML error page served with HTTP 200. It is not hypothetical:
// it is what a rate-limited or misconfigured gateway actually returns, it satisfies every check a
// pin receipt can perform, and it reaches a chain as a `contractURI` every marketplace renders as
// nothing — permanently, because collection metadata is birth data and no selector can move it.
//
// NO CREDENTIAL APPEARS IN THIS FILE. The Pinata tests use an obviously-fake label and assert that
// even that label never escapes into a result, a receipt or an error message.
// ================================================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, stringToBytes } from "viem";
import { keccak256Utf8 } from "../../project-schema/index.js";
import {
  METADATA_DIGEST_EQUALITY_SATISFIABLE,
  canonicalMetadataBytes,
  computeRawCidV1,
  conflatesMetadataDigests,
  contentSha256,
  createHttpGatewayProvider,
  createMemoryProvider,
  createPinataProvider,
  inspectRetrievedDocument,
  isCommittableMetadataUri,
  pinAndVerifyMetadataDocument,
  resolveMetadataCommitment,
  resolverDigestForUri,
  verifyMetadataCommitment,
  verifyMetadataUriParity,
} from "../dist/metadata/index.js";

// ------------------------------------------------------------------------------------------------
// FIXTURES
// ------------------------------------------------------------------------------------------------

/** An ERC-7572 collection document with every field a marketplace reads. */
const DOCUMENT = Object.freeze({
  name: "Kit Test Collection",
  symbol: "KITTEST",
  description: "A collection document assembled by the public kit's metadata birth pipeline.",
  image: "ipfs://bafkreicecnx2gvntm6fbcrvnc336qze6st5u7qq7457igegamd3bzkx7ri",
  banner_image: "ipfs://bafkreiablk6x6xgfpiw5ss3vsdyevwaiijzzaxxdh3c45pvomitwvf7ymi",
  featured_image: "ipfs://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e",
  external_link: "https://relics.invalid/kit-test",
  collaborators: [],
});

/** What a rate-limited or misconfigured gateway actually serves, with a success status. */
const HTML_ERROR_PAGE = new TextEncoder().encode("<!doctype html><html><head><title>429 Too Many Requests</title></head><body>rate limited</body></html>");

const utf8 = (s) => new TextEncoder().encode(s);

/**
 * A provider that pins honestly and lies on the read path. Constructed from a real memory provider
 * so everything except the one hostile behaviour is genuine.
 */
function servingDifferentBytes(replacement) {
  const inner = createMemoryProvider();
  return {
    id: "hostile-read-path",
    available: true,
    pin: (bytes, filename) => inner.pin(bytes, filename),
    fetchByCid: async () => Uint8Array.from(replacement),
  };
}

/** A provider whose pin is never reached, so a test can prove a refusal happened before publishing. */
function countingProvider() {
  const inner = createMemoryProvider();
  const calls = { pin: 0, fetchByCid: 0 };
  return {
    calls,
    provider: {
      id: "counting",
      available: true,
      async pin(bytes, filename) {
        calls.pin++;
        return inner.pin(bytes, filename);
      },
      async fetchByCid(cid) {
        calls.fetchByCid++;
        return inner.fetchByCid(cid);
      },
    },
  };
}

// ------------------------------------------------------------------------------------------------
// HAPPY PATH — and it must carry all three relations, not merely "no error"
// ------------------------------------------------------------------------------------------------

test("happy path: memory provider pins, serves back, and all three commitment relations hold", async () => {
  const provider = createMemoryProvider();
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });

  assert.equal(result.kind, "VERIFIED", `expected VERIFIED, got ${JSON.stringify(result)}`);
  assert.equal(result.fetchBackVerified, true);
  assert.equal(result.uri, `ipfs://${result.cid}`);
  assert.ok(result.cid.startsWith("bafkrei"), `expected a CIDv1 raw address, got ${result.cid}`);
  assert.match(result.contentSha256, /^[0-9a-f]{64}$/);
  assert.match(result.resolverDigest, /^0x[0-9a-f]{64}$/);

  // The CID is the real arithmetic over the real bytes, not a label the provider invented.
  assert.equal(result.cid, computeRawCidV1(canonicalMetadataBytes(DOCUMENT)));
  assert.equal(result.contentSha256, contentSha256(canonicalMetadataBytes(DOCUMENT)));

  // Nothing corroborated the content hash, so the pipeline says so rather than implying a binding.
  assert.equal(result.contentHashBinding, "SELF_COMPUTED");

  // THE THREE RELATIONS. `keccak` is injected — the commitment never computes one.
  const commitment = verifyMetadataCommitment(
    {
      reviewedUri: result.uri,
      committedUri: result.uri,
      collectionContractUri: result.uri,
      pinnedContentHash: result.contentSha256,
      bundleMetadataHash: result.contentSha256,
      launchMetadataUriHash: result.resolverDigest,
      deployedMetadataUriHash: result.resolverDigest,
    },
    keccak256Utf8,
  );
  assert.deepEqual(commitment.problems, []);
  assert.equal(commitment.ok, true);
  assert.equal(commitment.uriParity.verdict, "MATCH");
  assert.equal(commitment.contentHashParity.verdict, "MATCH");
  assert.equal(commitment.digestParity.verdict, "MATCH");
  assert.equal(commitment.digestBinding.verdict, "BOUND");
  assert.equal(commitment.digestsConflated, false);
});

test("supplying the bundle's own content hash upgrades the binding from SELF_COMPUTED", async () => {
  const provider = createMemoryProvider();
  const expectedContentHash = contentSha256(canonicalMetadataBytes(DOCUMENT));
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider, expectedContentHash });
  assert.equal(result.kind, "VERIFIED");
  assert.equal(result.contentHashBinding, "BUNDLE_COMMITTED");
});

// ------------------------------------------------------------------------------------------------
// NEGATIVE CONTROL 1 — a CID that is served, with different bytes behind it
// ------------------------------------------------------------------------------------------------

test("a provider that returns a CID but serves DIFFERENT bytes is refused", async () => {
  const pinned = canonicalMetadataBytes(DOCUMENT);
  // Same length, one byte changed: this can only be caught by comparing content, never by a receipt.
  const tampered = Uint8Array.from(pinned);
  tampered[tampered.length - 2] = tampered[tampered.length - 2] ^ 0x01;
  assert.equal(tampered.length, pinned.length);

  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider: servingDifferentBytes(tampered) });
  assert.equal(result.kind, "REFUSED");
  assert.equal(result.code, "FETCH_BACK_HASH_MISMATCH");
  // The stage says an object HAS been published — a different operational state from "never pinned".
  assert.equal(result.stage, "COMPARE");
});

test("a read path that serves a different NUMBER of bytes is refused too", async () => {
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider: servingDifferentBytes(utf8("{}")) });
  assert.equal(result.kind, "REFUSED");
  assert.equal(result.code, "FETCH_BACK_LENGTH_MISMATCH");
});

test("a CID the read path has never heard of is refused, and the stage records that a pin happened", async () => {
  const inner = createMemoryProvider();
  const provider = {
    id: "write-only",
    available: true,
    pin: (bytes, filename) => inner.pin(bytes, filename),
    // A provider whose gateway simply does not have the object it just accepted.
    fetchByCid: async () => {
      throw Object.assign(new Error("not found"), { name: "Error" });
    },
  };
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });
  assert.equal(result.kind, "REFUSED");
  assert.equal(result.code, "FETCH_BACK_FAILED");
  assert.equal(result.stage, "FETCH_BACK");
});

// ------------------------------------------------------------------------------------------------
// NEGATIVE CONTROL 2 — THE REAL-WORLD FAILURE: an HTML error page with HTTP 200
// ------------------------------------------------------------------------------------------------

test("an HTML error page served with HTTP 200 is refused by the pipeline", async () => {
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider: servingDifferentBytes(HTML_ERROR_PAGE) });
  assert.equal(result.kind, "REFUSED");
  // It happens to be caught by length first — which is fine, and is why the JSON guard below is
  // proven separately rather than being assumed reachable through this path.
  assert.ok(result.code.startsWith("FETCH_BACK_"), `expected a fetch-back refusal, got ${result.code}`);
});

test("the JSON guard refuses an error page on its own, so it is not a dead branch", () => {
  const verdict = inspectRetrievedDocument(HTML_ERROR_PAGE);
  assert.notEqual(verdict, null);
  assert.equal(verdict.code, "FETCH_BACK_NOT_JSON");
  assert.match(verdict.detail, /markup/);
});

test("the shape guard refuses valid JSON that is not a document a marketplace can read", () => {
  assert.equal(inspectRetrievedDocument(utf8("[1,2,3]")).code, "FETCH_BACK_NOT_AN_OBJECT");
  assert.equal(inspectRetrievedDocument(utf8("null")).code, "FETCH_BACK_NOT_AN_OBJECT");
  assert.equal(inspectRetrievedDocument(utf8('{"name":"x"}')).code, "FETCH_BACK_MISSING_KEYS");
  // …and it accepts the real one, so the guard is not simply refusing everything.
  assert.equal(inspectRetrievedDocument(canonicalMetadataBytes(DOCUMENT)), null);
});

test("a gateway that serves an error page but keeps the byte count is still refused, by the JSON guard", async () => {
  // The one arrangement where the hash check cannot fire first: bytes supplied directly, so the
  // pinned object IS the error page and the read-back agrees with it perfectly.
  const provider = createMemoryProvider();
  const result = await pinAndVerifyMetadataDocument({ bytes: HTML_ERROR_PAGE, provider });
  assert.equal(result.kind, "REFUSED");
  assert.equal(result.code, "FETCH_BACK_NOT_JSON");
  assert.equal(result.stage, "PARSE");
});

// ------------------------------------------------------------------------------------------------
// NEGATIVE CONTROL 3 — a gateway URL offered as the canonical URI
// ------------------------------------------------------------------------------------------------

test("a gateway URL is not a committable canonical URI", () => {
  const cid = computeRawCidV1(canonicalMetadataBytes(DOCUMENT));
  assert.equal(isCommittableMetadataUri(`ipfs://${cid}`), true);
  assert.equal(isCommittableMetadataUri(`https://gateway.pinata.cloud/ipfs/${cid}`), false);
  assert.equal(isCommittableMetadataUri(`https://ipfs.io/ipfs/${cid}`), false);
  assert.equal(isCommittableMetadataUri(`data:application/json;utf8,{"name":"x"}`), false);
  assert.equal(isCommittableMetadataUri(""), false);
  assert.equal(isCommittableMetadataUri(null), false);
});

test("resolverDigestForUri refuses a gateway URL", () => {
  const cid = computeRawCidV1(canonicalMetadataBytes(DOCUMENT));
  assert.throws(
    () => resolverDigestForUri(`https://ipfs.io/ipfs/${cid}`),
    (err) => err.name === "MetadataRefusal" && err.code === "URI_NOT_CANONICAL",
  );
});

test("the URI chain refuses a gateway URL even when every stage agrees with it", () => {
  const cid = computeRawCidV1(canonicalMetadataBytes(DOCUMENT));
  const gateway = `https://ipfs.io/ipfs/${cid}`;
  const parity = verifyMetadataUriParity({
    CREATOR_REVIEWED_URI: gateway,
    LAUNCH_COMMITTED_URI: gateway,
    PROJECTCOLLECTION_CONTRACT_URI: gateway,
  });
  // Unanimity is not the question. "Is this a string a resolver can be keyed by?" is.
  assert.equal(parity.ok, false);
  assert.equal(parity.problems.length, 3);
});

test("the resolver digest of a gateway URL differs from the ipfs URI's — the lookup would simply miss", () => {
  const cid = computeRawCidV1(canonicalMetadataBytes(DOCUMENT));
  const canonical = `ipfs://${cid}`;
  const gateway = `https://ipfs.io/ipfs/${cid}`;

  const canonicalDigest = resolverDigestForUri(canonical);
  const gatewayDigest = keccak256(stringToBytes(gateway)); // computed here BECAUSE the SDK refuses to
  assert.notEqual(canonicalDigest, gatewayDigest);

  // Both name the same content; only one is a key anything is published under.
  assert.throws(() => resolverDigestForUri(gateway), (err) => err.code === "URI_NOT_CANONICAL");
});

// ------------------------------------------------------------------------------------------------
// NEGATIVE CONTROL 4 — the document changed after the bundle committed to it
// ------------------------------------------------------------------------------------------------

test("a content-hash mismatch is refused BEFORE anything is pinned", async () => {
  const { provider, calls } = countingProvider();
  const wrong = "0".repeat(64);
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider, expectedContentHash: wrong });

  assert.equal(result.kind, "REFUSED");
  assert.equal(result.code, "DOCUMENT_CHANGED_AFTER_COMMITMENT");
  assert.equal(result.stage, "COMMIT");
  // Pinning is permanent. A document nobody may launch must never be published in the first place.
  assert.equal(calls.pin, 0);
  assert.equal(calls.fetchByCid, 0);
});

test("a malformed expectedContentHash is refused rather than ignored", async () => {
  const { provider, calls } = countingProvider();
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider, expectedContentHash: "not-a-hash" });
  assert.equal(result.code, "DECLARED_CONTENT_HASH_MALFORMED");
  assert.equal(calls.pin, 0);
});

test("an empty document is refused — an empty document has a CID, resolves, and renders as nothing", async () => {
  const provider = createMemoryProvider();
  const result = await pinAndVerifyMetadataDocument({ bytes: new Uint8Array(0), provider });
  assert.equal(result.code, "EMPTY_DOCUMENT");
});

// ------------------------------------------------------------------------------------------------
// NEGATIVE CONTROL 5 — the two digests are different quantities, and equality is unsatisfiable
// ------------------------------------------------------------------------------------------------

test("requiring contentSha256 === resolverDigest is unsatisfiable", async () => {
  const provider = createMemoryProvider();
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });
  assert.equal(result.kind, "VERIFIED");

  // Different algorithms over different inputs. They are not "usually" different; they cannot agree.
  assert.equal(METADATA_DIGEST_EQUALITY_SATISFIABLE, false);
  assert.notEqual(result.contentSha256, result.resolverDigest.slice(2));
  assert.equal(contentSha256(canonicalMetadataBytes(DOCUMENT)), result.contentSha256);
  assert.equal(keccak256Utf8(result.uri), result.resolverDigest.slice(2));
});

test("putting the CONTENT digest where the RESOLVER digest belongs is refused, and named", async () => {
  const provider = createMemoryProvider();
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });

  const commitment = verifyMetadataCommitment(
    {
      reviewedUri: result.uri,
      committedUri: result.uri,
      collectionContractUri: result.uri,
      pinnedContentHash: result.contentSha256,
      bundleMetadataHash: result.contentSha256,
      // The mistake: `metadataUriHash` holds the RESOLVER digest despite its name.
      launchMetadataUriHash: result.contentSha256,
      deployedMetadataUriHash: result.contentSha256,
    },
    keccak256Utf8,
  );

  assert.equal(commitment.ok, false);
  assert.equal(commitment.digestsConflated, true);
  assert.equal(commitment.digestBinding.verdict, "UNBOUND");
  assert.ok(commitment.problems.some((p) => p.includes("CONTENT digest")), commitment.problems.join(" | "));

  assert.equal(conflatesMetadataDigests(result.contentSha256, result.contentSha256), true);
  assert.equal(conflatesMetadataDigests(result.contentSha256, result.resolverDigest), false);
});

// ------------------------------------------------------------------------------------------------
// ONE KECCAK — the SDK's digest and the launch calldata's digest must be the same function
// ------------------------------------------------------------------------------------------------

test("viem's keccak256 and @relics/project-schema's keccak256Utf8 agree on the resolver digest", async () => {
  const provider = createMemoryProvider();
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });

  // `resolverDigestForUri` uses viem; the vendored `metadataDigestForUri` that builds
  // `LaunchParams.metadataUriHash` uses the schema package. Both values reach the same transaction,
  // so an agreement asserted here is the reason it is safe for two call sites to exist at all.
  assert.equal(result.resolverDigest, `0x${keccak256Utf8(result.uri)}`);
  assert.equal(result.resolverDigest, keccak256(stringToBytes(result.uri)));
});

// ------------------------------------------------------------------------------------------------
// AN UNREAD STAGE IS UNKNOWN, NEVER "EQUAL"
// ------------------------------------------------------------------------------------------------

test("an unread stage is INCOMPLETE, not a match", async () => {
  const provider = createMemoryProvider();
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });

  const parity = verifyMetadataUriParity({
    CREATOR_REVIEWED_URI: result.uri,
    LAUNCH_COMMITTED_URI: result.uri,
    PROJECTCOLLECTION_CONTRACT_URI: null, // nobody has read the deployed collection yet
  });
  assert.equal(parity.ok, false);
  assert.equal(parity.verdict, "INCOMPLETE");
  assert.match(parity.problems[0], /unknown/);

  const commitment = verifyMetadataCommitment(
    {
      reviewedUri: result.uri,
      committedUri: result.uri,
      collectionContractUri: null,
      pinnedContentHash: result.contentSha256,
      bundleMetadataHash: result.contentSha256,
      launchMetadataUriHash: result.resolverDigest,
      deployedMetadataUriHash: null,
    },
    keccak256Utf8,
  );
  assert.equal(commitment.ok, false);
});

// ------------------------------------------------------------------------------------------------
// A PIN RECEIPT IS NOT EVIDENCE, restated as a commitment rule
// ------------------------------------------------------------------------------------------------

test("a final bundle may not carry an unverified pin; a draft may be incomplete", async () => {
  const provider = createMemoryProvider();
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });

  const unverified = { uri: result.uri, contentHash: result.contentSha256, fetchBackVerified: false };
  const final = resolveMetadataCommitment({ ...unverified, stage: "final" });
  assert.equal(final.ok, false);
  assert.equal(final.code, "METADATA_COMMITMENT_INCOMPLETE");
  assert.ok(final.problems.some((p) => p.includes("pin receipt is not evidence")), final.problems.join(" | "));

  const draft = resolveMetadataCommitment({ ...unverified, stage: "draft" });
  assert.equal(draft.ok, true);
  assert.equal(draft.defaulted, true);
  assert.equal(draft.uri, null);

  const verified = resolveMetadataCommitment({ uri: result.uri, contentHash: result.contentSha256, fetchBackVerified: true, stage: "final" });
  assert.equal(verified.ok, true);
  assert.equal(verified.defaulted, false);
});

// ------------------------------------------------------------------------------------------------
// THE ADAPTERS
// ------------------------------------------------------------------------------------------------

test("the memory provider computes real CIDv1 addresses", () => {
  // Golden vectors from the canonical implementation; the first is the well-known IPFS CID for
  // "hello world", so this is checked against the world and not only against ourselves.
  assert.equal(computeRawCidV1(utf8("hello world")), "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e");
  assert.equal(computeRawCidV1(utf8("{}")), "bafkreicecnx2gvntm6fbcrvnc336qze6st5u7qq7457igegamd3bzkx7ri");
  assert.equal(computeRawCidV1(utf8('{"a":1}')), "bafkreiablk6x6xgfpiw5ss3vsdyevwaiijzzaxxdh3c45pvomitwvf7ymi");
});

test("the memory provider refuses to invent an address it cannot compute correctly", () => {
  assert.throws(
    () => computeRawCidV1(new Uint8Array(262_145)),
    (err) => err.code === "DOCUMENT_TOO_LARGE",
  );
});

test("the memory provider fails like a provider, not like a cooperative stub", async () => {
  const provider = createMemoryProvider();
  await assert.rejects(
    () => provider.fetchByCid("bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e"),
    (err) => err.name === "MetadataRefusal" && err.code === "FETCH_BACK_FAILED",
  );
});

test("pin with one provider, verify through an INDEPENDENT one", async () => {
  const writer = createMemoryProvider();
  // A second adapter over the same store: different id, so the receipt records two parties.
  const reader = { id: "independent-reader", available: false, pin: writer.pin, fetchByCid: (cid) => writer.fetchByCid(cid) };

  const ok = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider: writer, verifier: reader });
  assert.equal(ok.kind, "VERIFIED");
  assert.equal(ok.pinnedBy, "memory");
  assert.equal(ok.verifiedBy, "independent-reader");

  // And a verifier that genuinely cannot see the object refuses, rather than deferring to the pin.
  const blind = createMemoryProvider();
  const refused = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider: createMemoryProvider(), verifier: blind });
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "FETCH_BACK_FAILED");
});

test("the pinata adapter with no PINATA_JWT reports itself unavailable instead of throwing", async () => {
  const previous = process.env.PINATA_JWT;
  delete process.env.PINATA_JWT;
  try {
    const provider = createPinataProvider();
    assert.equal(provider.available, false);
    assert.equal(provider.id, "pinata");
    await assert.rejects(
      () => provider.pin(utf8("{}"), "collection-metadata.json"),
      (err) => err.name === "MetadataRefusal" && err.code === "PROVIDER_UNAVAILABLE",
    );

    // And the pipeline surfaces it as a typed refusal at the PIN stage rather than an exception.
    const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });
    assert.equal(result.kind, "REFUSED");
    assert.equal(result.code, "PROVIDER_UNAVAILABLE");
  } finally {
    if (previous === undefined) delete process.env.PINATA_JWT;
    else process.env.PINATA_JWT = previous;
  }
});

test("no credential escapes the pinata adapter — not into a result, a receipt, or an error", async () => {
  const TOKEN = "kit-test-token-value-not-a-credential";
  const provider = createPinataProvider({
    jwt: TOKEN,
    fetchImpl: async () => new Response("unauthorized: bearer " + TOKEN, { status: 401 }),
  });
  assert.equal(provider.available, true);

  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider });
  assert.equal(result.kind, "REFUSED");
  assert.equal(result.code, "PIN_FAILED");
  // Status only. The response body echoed the token back and the adapter never read it out.
  assert.match(result.detail, /HTTP 401/);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(provider).includes(TOKEN), false);
  assert.equal(String(provider.gatewayUrl("bafkreib")).includes(TOKEN), false);
});

test("the read-only gateway adapter refuses to pin rather than returning an address for nothing", async () => {
  const gateway = createHttpGatewayProvider({ baseUrl: "https://ipfs.invalid/ipfs" });
  assert.equal(gateway.available, false);
  await assert.rejects(
    () => gateway.pin(utf8("{}"), "collection-metadata.json"),
    (err) => err.name === "MetadataRefusal" && err.code === "PROVIDER_IS_READ_ONLY",
  );
  assert.equal(gateway.gatewayUrl("bafkreib"), "https://ipfs.invalid/ipfs/bafkreib");
});

test("the gateway adapter caps what it will read back", async () => {
  const oversized = new Uint8Array(64);
  const gateway = createHttpGatewayProvider({
    baseUrl: "https://ipfs.invalid/ipfs",
    maxBytes: 16,
    attempts: 1,
    fetchImpl: async () => new Response(oversized, { status: 200 }),
  });
  await assert.rejects(
    () => gateway.fetchByCid("bafkreib"),
    (err) => err.code === "FETCH_BACK_FAILED",
  );
});

test("the gateway adapter serves bytes through the pipeline as a verifier", async () => {
  const writer = createMemoryProvider();
  const bytes = canonicalMetadataBytes(DOCUMENT);
  const gateway = createHttpGatewayProvider({
    baseUrl: "https://ipfs.invalid/ipfs",
    attempts: 1,
    fetchImpl: async () => new Response(bytes, { status: 200 }),
  });
  const result = await pinAndVerifyMetadataDocument({ document: DOCUMENT, provider: writer, verifier: gateway });
  assert.equal(result.kind, "VERIFIED");
  assert.equal(result.verifiedBy, "http-gateway");
  assert.equal(result.gatewayUrl, `https://ipfs.invalid/ipfs/${result.cid}`);
});

// ------------------------------------------------------------------------------------------------
// ASSEMBLY
// ------------------------------------------------------------------------------------------------

test("canonical assembly is stable and has no trailing whitespace", () => {
  const a = canonicalMetadataBytes(DOCUMENT);
  const b = canonicalMetadataBytes({ ...DOCUMENT });
  assert.deepEqual(Array.from(a), Array.from(b));

  const text = new TextDecoder().decode(a);
  assert.equal(text, text.trim());
  assert.equal(/\s{2,}/.test(text), false);
  // Sorted key order, which is this kit's canonical form.
  assert.ok(text.startsWith('{"banner_image":'), text.slice(0, 40));
});

test("a document with no canonical JSON form is refused rather than coerced", async () => {
  const provider = createMemoryProvider();
  for (const bad of [{ ...DOCUMENT, supply: 10_000n }, { ...DOCUMENT, ratio: Number.NaN }, "not an object", 7, null]) {
    const result = await pinAndVerifyMetadataDocument({ document: bad, provider });
    assert.equal(result.kind, "REFUSED", `expected a refusal for ${String(bad && typeof bad === "object" ? Object.keys(bad) : bad)}`);
    assert.equal(result.code, "DOCUMENT_NOT_CANONICALISABLE");
  }
});

test("supplying both a document and bytes, or neither, is refused", async () => {
  const provider = createMemoryProvider();
  const both = await pinAndVerifyMetadataDocument({ document: DOCUMENT, bytes: canonicalMetadataBytes(DOCUMENT), provider });
  assert.equal(both.kind, "REFUSED");
  const neither = await pinAndVerifyMetadataDocument({ provider });
  assert.equal(neither.kind, "REFUSED");
});
