// SPDX-License-Identifier: MIT
// `@relics/project-schema/art-selector` — the art selector word on its own.
//
// The selector is a PROTOCOL bit layout, defined by `launchpad/src/rc6/art/ArtSelectorLib.sol`, and
// it has its own version axis: it moves when the launch struct's art field is reinterpreted, which
// is not when the `.relics` bundle format moves. Consumers that only need the codec — the creator
// CLI's launch builder, the launch SDK, the signer protocol, a server preflight — import this
// subpath and take on no bundle-format surface.
//
// It ships inside this package rather than as a separate one for the same reason the ACV1 codec
// does: this is the package every launch-path consumer already depends on, and a second package
// would be a second place the 224/32 split could be stated. One package, one declaration, one
// mirror, one crossing point.

export {
  ART_SELECTOR_RUNTIME_ID_SHIFT,
  ART_SELECTOR_TEMPLATE_ID_MASK,
  ART_SELECTOR_MAX_RUNTIME_ID,
  ART_SELECTOR_MAX_TEMPLATE_ID,
  ART_SELECTOR_MAX,
  ART_SELECTOR_NO_RUNTIME_PREFERENCE,
  ART_SELECTOR_CODES,
  ArtSelectorError,
  encodeArtSelector,
  decodeArtSelector,
  validateArtSelector,
  templateIdOf,
  artRuntimeIdOf,
  isRuntimeElection,
} from "./src/art-selector.js";

// Discovering which runtime ids a chain actually has. Same subject: the selector's runtime half
// IS the registry key, and `runtimeCount()` is a count rather than a high-water mark.
export {
  ART_RUNTIME_REGISTERED_SIGNATURE,
  ART_RUNTIME_REGISTERED_TOPIC0,
  ART_RUNTIME_ACTIVE_SET_SIGNATURE,
  ART_RUNTIME_ACTIVE_SET_TOPIC0,
  ART_RUNTIME_RESERVED_ID,
  ART_RUNTIME_MAX_ID,
  runtimeIdFromRegisteredLog,
  discoverRegisteredRuntimeIds,
  runtimeRecordNamesARuntime,
} from "./src/art-runtime-discovery.js";
