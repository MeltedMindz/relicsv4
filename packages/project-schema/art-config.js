// SPDX-License-Identifier: MIT
// `@relics/project-schema/art-config` — the ACV1 codec on its own.
//
// ACV1 is a PROTOCOL byte format, defined by `launchpad/src/art/ArtConfigV1.sol`, and it has its
// own version axis: `ACV1_VERSION` is 1 and moves when the runtime's config format moves, which is
// not when the `.relics` bundle format moves. Consumers that only need the codec — the studio, the
// SDK, a server preflight — import this subpath and take on no bundle-format surface.
//
// It ships inside this package rather than as a separate one for a reason worth recording, because
// the alternative looks tidier than it is. `hashArtConfigV1` must be keccak256 — the hash the EVM
// computes and the factory checks `keccak256(artConfig)` against — and keccak256 already lives in
// this package. A separate `@relics/art-config` would either carry a SECOND keccak implementation,
// which is two chain-facing hashes that can disagree, or depend on this package while this package
// depends on it, since `validateBundle` is the gate that has to refuse a malformed ACV1. Neither is
// worth a directory. One package, one keccak, one mirror, one crossing point; the subpath gives the
// codec its own import identity without a second thing that can drift.

export {
  ACV1_FORMAT,
  ACV1_VERSION,
  ACV1_MAGIC,
  ACV1_TERMINATOR,
  ACV1_FLAGS,
  ACV1_LIMITS,
  ACV1_LAYER_KINDS,
  ACV1_SENSORS,
  ACV1_LAYER_SENSORS,
  ACV1_DNA_SLOTS,
  ACV1_TRAIT_SOURCES,
  ACV1_CURVES,
  ACV1_TRAIT_STYLES,
  ACV1_ERROR_CODES,
  acv1Reason,
  encodeArtConfigV1,
  encodeArtConfigV1Checked,
  withArtConfigV1Appendix,
  decodeArtConfigV1,
  validateArtConfigV1,
  isArtConfigV1,
  hashArtConfigV1,
  describeArtConfigV1,
  emptyArtConfigV1,
  worstCaseElementsV1,
  ArtConfigV1Error,
} from "./src/art-config-v1.js";

export { visualHashArtConfigV1, traitSchemaHashArtConfigV1, runtimeCommitmentArtConfigV1 } from "./src/art-config-v1-hashes.js";
