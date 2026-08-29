// SPDX-License-Identifier: MIT
// The single import site for keccak256 in this package.
//
// There is exactly ONE keccak implementation in this repository and this package uses it rather
// than carrying its own. A second canonical hash maintained by different code agrees until the day
// it does not, and on that day the disagreement is a runtime tag that failed to match a registry
// entry — which this package reports as "not registered on this chain", a fabricated fact.
//
// When `@relics/project-schema` is consumed by package name rather than by path, this one line
// becomes `export { keccak256Utf8 } from "@relics/project-schema";` and nothing else changes.
export { keccak256Utf8 } from "../../project-schema/src/keccak256.js";
