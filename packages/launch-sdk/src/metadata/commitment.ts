// SPDX-License-Identifier: MIT
// ================================================================================================
// THE METADATA COMMITMENT — one URI, two digests, carried unchanged from review to chain.
//
// Under RC6 a project's collection metadata is BIRTH DATA: it is written inside the same
// transaction that creates the collection, and no selector on the deployed collection can move it
// afterwards. There is no "launched, metadata pending" state and no second transaction in which a
// mistake gets corrected. So the only thing that makes the flow safe is that the artifact the
// creator reviewed and the artifact the chain receives are provably the same one. This module owns
// that proof.
//
// ------------------------------------------------------------------------------------------------
// IT COMPARES. IT NEVER COMPUTES A HASH.
// ------------------------------------------------------------------------------------------------
//
// Every value it judges was produced somewhere else: by the schema package, by the pin pipeline, or
// read off a chain. `keccak` is INJECTED into relation 3 rather than imported, and that is not
// ceremony — a second canonical hash maintained by different code agrees until the day it does not,
// and on this value that day is on chain forever. Injecting it means this module cannot become a
// second source of the digest even by accident, and the caller has to name which implementation is
// authoritative.
//
// ------------------------------------------------------------------------------------------------
// THREE RELATIONS, EACH OVER LIKE QUANTITIES. A SINGLE FOUR-WAY EQUALITY IS UNSATISFIABLE.
// ------------------------------------------------------------------------------------------------
//
//   CONTENT digest   sha256 of the metadata JSON bytes. In the `.relics` bundle. NEVER on chain.
//   RESOLVER digest  keccak256 of the URI STRING. What `MetadataResolverRc6` keys by, and therefore
//                    what `LaunchParams.metadataUriHash` carries.
//
// An earlier spec required `PINNED_CONTENT_HASH == BUNDLE_HASH == LAUNCH_HASH == DEPLOYED_HASH`.
// Against the shipped architecture that cannot hold: the last two are a different quantity from the
// first two. It would have failed on every real launch, and the likeliest repair under deadline is
// to loosen it until it passes — which is how a parity check becomes decorative. So:
//
//   1. the URI is ONE STRING from review to chain          (verifyMetadataUriParity)
//   2. the content digest is ONE sha256 from pin to bundle (verifyMetadataContentHashParity)
//   3. the on-chain digest IS keccak256 of that same URI   (verifyMetadataDigestBinding)
//
// Relation 3 is THE JOIN. Without it the other two are independently consistent chains that can
// describe two different documents.
//
// A NOTE ON THE STAGE NAMES. The launch field is `metadataUriHash`, and the name is doing work: it
// holds the RESOLVER digest, a hash of the URI string, not of the document. The internal record in
// the private tree still labels these two stages `..._METADATA_CONTENT_HASH`, which is the older
// spelling of the same quantity; the names here follow the field. When a "hash mismatch" turns out
// not to be a mismatch at all, the repair somebody reaches for is to loosen the check, so the names
// are worth getting right.
//
// AN UNREAD STAGE IS UNKNOWN, NEVER "EQUAL". A stage nobody has read cannot corroborate anything,
// and treating absence as agreement is how a parity check passes over a missing link.
// ================================================================================================

/** The links in the URI chain, in the order the value travels. */
export const METADATA_URI_STAGES = Object.freeze(["CREATOR_REVIEWED_URI", "LAUNCH_COMMITTED_URI", "PROJECTCOLLECTION_CONTRACT_URI"] as const);
export type MetadataUriStage = (typeof METADATA_URI_STAGES)[number];

/** The CONTENT digest chain — sha256 over the document bytes. Never reaches a chain. */
export const METADATA_CONTENT_HASH_STAGES = Object.freeze(["PINNED_CONTENT_HASH", "RELICS_BUNDLE_METADATA_HASH"] as const);
export type MetadataContentHashStage = (typeof METADATA_CONTENT_HASH_STAGES)[number];

/** The RESOLVER digest chain — `LaunchParams.metadataUriHash` and the collection's stored copy. */
export const METADATA_DIGEST_STAGES = Object.freeze(["LAUNCH_METADATA_URI_HASH", "DEPLOYED_PROJECT_METADATA_URI_HASH"] as const);
export type MetadataDigestStage = (typeof METADATA_DIGEST_STAGES)[number];

/**
 * Whether "the content digest equals the resolver digest" is a satisfiable requirement.
 *
 * It is not, and the constant exists so the answer is a value somebody has to delete rather than an
 * assumption somebody has to remember. sha256-of-document-bytes and keccak256-of-a-URI-string are
 * different algorithms over different inputs; the only way to make them agree is to stop checking.
 */
export const METADATA_DIGEST_EQUALITY_SATISFIABLE = false as const;

/** A URI that may be committed on-chain. `ipfs://` only — a gateway URL names a host, not content. */
const CANONICAL_URI = /^ipfs:\/\/[A-Za-z0-9]+(\/[^\s]*)?$/;
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Placeholder shapes that must never reach a launch.
 *
 * Deliberately its own list rather than an import from a template checker: this one runs at a
 * different moment, on a different value, and sharing it would make one refusal depend silently on
 * another module's scan order.
 *
 * KNOWN FALSE POSITIVE, KEPT ON PURPOSE. The scan runs over the WHOLE URI, so a base32 CID that
 * happens to contain the letters `tbd` or `todo` is refused as a placeholder — roughly one pin in
 * six hundred for `tbd`. It stays because this predicate is a byte-for-byte port of the launchpad's
 * own gate: narrowing it here would make the kit accept a URI the launch route then refuses, and a
 * refusal a creator meets at signing time is far worse than one they meet at pinning time. Re-pin
 * (any change to the document changes the CID) rather than loosening the pattern on one side only.
 */
const PLACEHOLDER = /<[^>]*>|OWNER_INPUT|PLACEHOLDER|TODO|TBD|example\.|changeme/i;

/** True when the URI is a committable canonical form and carries no placeholder. */
export function isCommittableMetadataUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length === 0) return false;
  if (PLACEHOLDER.test(uri)) return false;
  return CANONICAL_URI.test(uri);
}

/** True when the value is a real 64-character lowercase digest rather than empty or a template. */
export function isCommittableMetadataHash(hash: unknown): hash is string {
  return typeof hash === "string" && HEX64.test(hash);
}

export type ParityVerdict = "MATCH" | "MISMATCH" | "INCOMPLETE";

export interface ParityResult<S extends string> {
  readonly ok: boolean;
  readonly verdict: ParityVerdict;
  readonly stages: Readonly<Record<S, string | null>>;
  readonly problems: readonly string[];
}

type StageInput<S extends string> = Partial<Record<S, string | null | undefined>>;

/**
 * RELATION 1 — compare every stage of the URI chain.
 *
 * NO TOLERANCE AND NO ALIAS. Exact string equality, on the canonical `ipfs://` form only. A gateway
 * URL that "points at the same content" is a different string naming a host we do not control, and
 * accepting it here would let the chain and the review disagree about what was committed while both
 * looked correct.
 */
export function verifyMetadataUriParity(stages: StageInput<MetadataUriStage>): ParityResult<MetadataUriStage> {
  const problems: string[] = [];
  const present: Array<[MetadataUriStage, string]> = [];
  const recorded = {} as Record<MetadataUriStage, string | null>;

  for (const stage of METADATA_URI_STAGES) {
    const value = stages[stage] ?? null;
    recorded[stage] = value;
    if (value === null) {
      problems.push(`${stage} is unknown — an unread stage cannot corroborate the others`);
      continue;
    }
    if (!isCommittableMetadataUri(value)) {
      problems.push(`${stage} is not a committable canonical ipfs:// URI: ${JSON.stringify(value)}`);
      continue;
    }
    present.push([stage, value]);
  }

  if (present.length > 1) {
    const [firstStage, firstValue] = present[0]!;
    for (const [stage, value] of present.slice(1)) {
      if (value !== firstValue) problems.push(`${stage} (${value}) != ${firstStage} (${firstValue})`);
    }
  }

  const complete = present.length === METADATA_URI_STAGES.length;
  const verdict: ParityVerdict = problems.length > 0 ? (complete ? "MISMATCH" : "INCOMPLETE") : "MATCH";
  return { ok: problems.length === 0 && complete, verdict, stages: recorded, problems };
}

/**
 * Compare a chain of digests. Same rules as the URI chain: exact equality, unknown is not equal.
 *
 * Case is normalised to lowercase and a leading `0x` is stripped before comparison, because a chain
 * read may return either form and a case difference over identical bytes would be a FALSE mismatch —
 * which trains people to loosen the check. Nothing else is normalised.
 */
function compareDigestStages<S extends string>(stageNames: readonly S[], stages: StageInput<S>, what: string): ParityResult<S> {
  const problems: string[] = [];
  const present: Array<[S, string]> = [];
  const recorded = {} as Record<S, string | null>;

  for (const stage of stageNames) {
    const raw = stages[stage] ?? null;
    recorded[stage] = raw;
    if (raw === null) {
      problems.push(`${stage} is unknown — an unread stage cannot corroborate the others`);
      continue;
    }
    const value = String(raw).replace(/^0x/i, "").toLowerCase();
    if (!isCommittableMetadataHash(value)) {
      problems.push(`${stage} is not a 64-character ${what}: ${JSON.stringify(raw)}`);
      continue;
    }
    present.push([stage, value]);
  }

  if (present.length > 1) {
    const [firstStage, firstValue] = present[0]!;
    for (const [stage, value] of present.slice(1)) {
      if (value !== firstValue) problems.push(`${stage} (${value.slice(0, 12)}…) != ${firstStage} (${firstValue.slice(0, 12)}…)`);
    }
  }

  const complete = present.length === stageNames.length;
  const verdict: ParityVerdict = problems.length > 0 ? (complete ? "MISMATCH" : "INCOMPLETE") : "MATCH";
  return { ok: problems.length === 0 && complete, verdict, stages: recorded, problems };
}

/** RELATION 2 — the CONTENT digest is one sha256 from the pin to the bundle. */
export function verifyMetadataContentHashParity(stages: StageInput<MetadataContentHashStage>): ParityResult<MetadataContentHashStage> {
  return compareDigestStages(METADATA_CONTENT_HASH_STAGES, stages, "sha256");
}

/** The RESOLVER digest agrees between the launch calldata and the deployed collection. */
export function verifyMetadataDigestParity(stages: StageInput<MetadataDigestStage>): ParityResult<MetadataDigestStage> {
  return compareDigestStages(METADATA_DIGEST_STAGES, stages, "keccak digest");
}

/** A keccak256-over-UTF-8 implementation, supplied by the caller. Hex, with or without `0x`. */
export type KeccakUtf8 = (input: string) => string;

export interface DigestBindingResult {
  readonly ok: boolean;
  readonly verdict: "BOUND" | "UNBOUND";
  readonly problems: readonly string[];
}

/**
 * RELATION 3 — THE JOIN. The on-chain digest must BE `keccak256(bytes(uri))` of the very URI the
 * creator reviewed.
 *
 * Without this, relations 1 and 2 can both hold while describing different documents: a consistent
 * URI chain, a consistent content chain, and no link between them.
 *
 * `keccak` is a parameter on purpose. Callers pass the SAME function the launch calldata is built
 * with (`resolverDigestForUri`, or `keccak256Utf8` from `@relics/project-schema`) so this compares
 * against the authoritative implementation rather than becoming a second one.
 */
export function verifyMetadataDigestBinding(input: { uri: unknown; onChainDigest: unknown }, keccak: KeccakUtf8): DigestBindingResult {
  if (typeof keccak !== "function") {
    throw new TypeError("verifyMetadataDigestBinding requires a keccak256-over-utf8 implementation — it must not compute one itself");
  }
  const problems: string[] = [];

  if (!isCommittableMetadataUri(input.uri)) {
    problems.push(`the reviewed URI is not committable: ${JSON.stringify(input.uri)}`);
  }
  const digest = String(input.onChainDigest ?? "")
    .replace(/^0x/i, "")
    .toLowerCase();
  if (!isCommittableMetadataHash(digest)) {
    problems.push(`the on-chain digest is not a 64-character value: ${JSON.stringify(input.onChainDigest)}`);
  }

  if (problems.length === 0) {
    const expected = String(keccak(input.uri as string))
      .replace(/^0x/i, "")
      .toLowerCase();
    if (expected !== digest) {
      problems.push(`keccak256(uri) is ${expected.slice(0, 12)}… but the chain carries ${digest.slice(0, 12)}… — the digest names a different URI`);
    }
  }

  return { ok: problems.length === 0, verdict: problems.length === 0 ? "BOUND" : "UNBOUND", problems };
}

/**
 * THE CONFLATION CHECK.
 *
 * The one failure the three relations cannot name on their own: a caller who put the CONTENT hash
 * into the on-chain field. Relation 3 would refuse it, but with "the digest names a different URI",
 * which sends a reader hunting for a URI bug. This says what actually happened.
 *
 * It is a real shape, not a hypothetical — the on-chain field was called `metadataContentHash` in
 * an earlier draft of the interface, which put a name meaning one quantity on a field holding the
 * other.
 */
export function conflatesMetadataDigests(contentHash: unknown, onChainDigest: unknown): boolean {
  const a = String(contentHash ?? "")
    .replace(/^0x/i, "")
    .toLowerCase();
  const b = String(onChainDigest ?? "")
    .replace(/^0x/i, "")
    .toLowerCase();
  return isCommittableMetadataHash(a) && a === b;
}

export interface MetadataCommitmentInput {
  readonly reviewedUri?: string | null;
  readonly committedUri?: string | null;
  readonly collectionContractUri?: string | null;
  readonly pinnedContentHash?: string | null;
  readonly bundleMetadataHash?: string | null;
  readonly launchMetadataUriHash?: string | null;
  readonly deployedMetadataUriHash?: string | null;
}

export interface MetadataCommitmentResult {
  readonly ok: boolean;
  readonly uriParity: ParityResult<MetadataUriStage>;
  readonly contentHashParity: ParityResult<MetadataContentHashStage>;
  readonly digestParity: ParityResult<MetadataDigestStage>;
  readonly digestBinding: DigestBindingResult;
  readonly digestsConflated: boolean;
  readonly problems: readonly string[];
}

/**
 * All three relations judged at once, plus the conflation check.
 *
 * `ok` is the conjunction and nothing sets it directly, so there is no branch here that can report
 * a satisfied commitment without a complete URI chain, a complete content chain, a complete digest
 * chain and the join between them.
 */
export function verifyMetadataCommitment(input: MetadataCommitmentInput, keccak: KeccakUtf8): MetadataCommitmentResult {
  const uriParity = verifyMetadataUriParity({
    CREATOR_REVIEWED_URI: input.reviewedUri ?? null,
    LAUNCH_COMMITTED_URI: input.committedUri ?? null,
    PROJECTCOLLECTION_CONTRACT_URI: input.collectionContractUri ?? null,
  });
  const contentHashParity = verifyMetadataContentHashParity({
    PINNED_CONTENT_HASH: input.pinnedContentHash ?? null,
    RELICS_BUNDLE_METADATA_HASH: input.bundleMetadataHash ?? null,
  });
  const digestParity = verifyMetadataDigestParity({
    LAUNCH_METADATA_URI_HASH: input.launchMetadataUriHash ?? null,
    DEPLOYED_PROJECT_METADATA_URI_HASH: input.deployedMetadataUriHash ?? null,
  });
  const digestBinding = verifyMetadataDigestBinding({ uri: input.reviewedUri ?? null, onChainDigest: input.launchMetadataUriHash ?? null }, keccak);
  const digestsConflated = conflatesMetadataDigests(input.pinnedContentHash, input.launchMetadataUriHash);

  const problems = [
    ...uriParity.problems,
    ...contentHashParity.problems,
    ...digestParity.problems,
    ...digestBinding.problems,
    ...(digestsConflated
      ? [
          "the launch carries the CONTENT digest (sha256 of the document) where the RESOLVER digest (keccak256 of the URI string) belongs — " +
            "`metadataUriHash` holds the resolver digest despite its name, and the resolver would find nothing under this key",
        ]
      : []),
  ];

  return {
    ok: uriParity.ok && contentHashParity.ok && digestParity.ok && digestBinding.ok && !digestsConflated,
    uriParity,
    contentHashParity,
    digestParity,
    digestBinding,
    digestsConflated,
    problems,
  };
}

export type MetadataCommitmentStage = "draft" | "final";

export type ResolvedMetadataCommitment =
  | { readonly ok: true; readonly uri: string; readonly contentHash: string; readonly defaulted: false }
  | { readonly ok: true; readonly uri: null; readonly contentHash: null; readonly defaulted: true; readonly problems: readonly string[] }
  | { readonly ok: false; readonly code: "METADATA_COMMITMENT_INCOMPLETE"; readonly problems: readonly string[]; readonly message: string };

/**
 * A DRAFT MAY BE INCOMPLETE; A FINAL BUNDLE MAY NOT.
 *
 * The same discipline the anti-snipe election gets, for the same reason: metadata is written once at
 * birth and no selector can change it afterwards, so a default applied at export would commit a
 * creator to an artifact they never saw.
 */
export function resolveMetadataCommitment(input: {
  uri?: string | null;
  contentHash?: string | null;
  fetchBackVerified?: boolean;
  stage: MetadataCommitmentStage;
}): ResolvedMetadataCommitment {
  if (input.stage !== "draft" && input.stage !== "final") {
    throw new TypeError(`resolveMetadataCommitment: stage must be "draft" or "final", got ${String(input.stage)}`);
  }
  const problems: string[] = [];
  const contentHash = String(input.contentHash ?? "")
    .replace(/^0x/i, "")
    .toLowerCase();

  if (!isCommittableMetadataUri(input.uri)) {
    problems.push(
      input.uri === null || input.uri === undefined || input.uri === ""
        ? "the collection metadata URI is missing"
        : `the collection metadata URI is not a committable canonical ipfs:// URI: ${JSON.stringify(input.uri)}`,
    );
  }
  if (!isCommittableMetadataHash(contentHash)) {
    problems.push(input.contentHash ? "the metadata content hash is not a 64-character sha256" : "the metadata content hash is missing");
  }
  // A URI that was never read back is a URI we have a RECEIPT for, not content anyone has seen. On
  // a value that becomes immutable at signing, a receipt is not enough.
  if (input.fetchBackVerified !== true) {
    problems.push("the pinned metadata was never fetched back and verified — a pin receipt is not evidence of retrievability");
  }

  if (problems.length === 0) {
    return { ok: true, uri: input.uri as string, contentHash, defaulted: false };
  }
  if (input.stage === "draft") {
    return { ok: true, uri: null, contentHash: null, defaulted: true, problems };
  }
  return {
    ok: false,
    code: "METADATA_COMMITMENT_INCOMPLETE",
    problems,
    message:
      "This bundle cannot be launched: its collection metadata is not committed. " +
      problems.join("; ") +
      ". Collection metadata is written into the collection at birth and no selector can change it afterwards, so it cannot be completed later — " +
      "re-export the bundle once the metadata has been pinned and verified.",
  };
}
