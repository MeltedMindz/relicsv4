// SPDX-License-Identifier: MIT
// ================================================================================================
// THE METADATA BIRTH PIPELINE — public surface.
//
// The order below is the order a launch runs in:
//
//   1. assemble the canonical document           canonicalDocument.ts
//   2. pin it, and PROVE it can be read back     pinAndVerify.ts   <- the step a receipt cannot fake
//   3. derive the resolver key from the URI      pinAndVerify.ts   <- `LaunchParams.metadataUriHash`
//   4. hold every stage to the same three facts  commitment.ts
//
// The two digests never merge. `contentSha256` is sha256 over the document bytes and lives in the
// `.relics` bundle; `resolverDigest` is keccak256 over the URI STRING and is what reaches a chain.
// `metadataUriHash` holds the second one despite its name.
// ================================================================================================

export {
  MetadataRefusal,
  isMetadataRefusal,
  refusal,
  type MetadataRefusalCode,
  type MetadataRefusalResult,
  type MetadataStage,
} from "./errors.js";

export { canPin, assertCanPin, type MetadataProvider, type PinReceipt } from "./provider.js";

export {
  REQUIRED_CONTRACT_URI_KEYS,
  canonicalMetadataJson,
  canonicalMetadataBytes,
  contentSha256,
  isContentHash,
  inspectRetrievedDocument,
} from "./canonicalDocument.js";

export {
  pinAndVerifyMetadataDocument,
  resolverDigestForUri,
  type PinAndVerifyOptions,
  type PinAndVerifyResult,
  type VerifiedMetadataDocument,
} from "./pinAndVerify.js";

export {
  METADATA_URI_STAGES,
  METADATA_CONTENT_HASH_STAGES,
  METADATA_DIGEST_STAGES,
  METADATA_DIGEST_EQUALITY_SATISFIABLE,
  isCommittableMetadataUri,
  isCommittableMetadataHash,
  conflatesMetadataDigests,
  verifyMetadataUriParity,
  verifyMetadataContentHashParity,
  verifyMetadataDigestParity,
  verifyMetadataDigestBinding,
  verifyMetadataCommitment,
  resolveMetadataCommitment,
  type DigestBindingResult,
  type KeccakUtf8,
  type MetadataCommitmentInput,
  type MetadataCommitmentResult,
  type MetadataCommitmentStage,
  type MetadataContentHashStage,
  type MetadataDigestStage,
  type MetadataUriStage,
  type ParityResult,
  type ParityVerdict,
  type ResolvedMetadataCommitment,
} from "./commitment.js";

export { createMemoryProvider, computeRawCidV1, IPFS_CHUNK_SIZE, type MemoryProvider } from "./adapters/memoryProvider.js";
export { createPinataProvider, type PinataProviderOptions } from "./adapters/pinataProvider.js";
export { createHttpGatewayProvider, type HttpGatewayProviderOptions } from "./adapters/httpGatewayProvider.js";

// The ERC-20 token's own metadata — the half a launch does not write. See tokenMetadata.ts.
export * from "./tokenMetadata.js";
