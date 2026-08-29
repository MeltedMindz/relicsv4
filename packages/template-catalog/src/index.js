// SPDX-License-Identifier: MIT
// The Wave-1 art template catalog. Four modules, one rule each:
//
//   status.js       the ONE declaration of the review status model. Everything else derives.
//   signals.js      which market signals are EFFECTIVE, measured against a committed census.
//   descriptors.js  the published creator descriptors, one per SHIP template and no others.
//   select.js       the pipeline: filter to SHIP first, match semantically second.
//
// NOTHING HERE ANSWERS WHETHER A RUNTIME CAN BE LAUNCHED. That is a per-chain fact and only a live
// read of `ArtRuntimeRegistryV1` answers it — see `@relics/launch-sdk`'s `getChainCapability`.
export * from "./status.js";
export * from "./signals.js";
export * from "./descriptors.js";
export * from "./select.js";
