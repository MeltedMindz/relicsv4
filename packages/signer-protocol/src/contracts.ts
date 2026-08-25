// SPDX-License-Identifier: MIT
// The single import site for the shared type contracts.
//
// `SigningRequest`, `SignerResult`, `SignerRefusal`, `SignerRefusalCode` and `AgentPolicy` are
// declared once, in `packages/launch-sdk/src/contracts.ts`, and this package restates none of
// them. Inside this repository the two packages live side by side under `packages/`, so the
// import is a path; when the launch SDK is published the line below becomes a package specifier
// and nothing else in this package changes.
//
// WHY THE INDIRECTION IS ITS OWN FILE. A signer that re-declares `SignerRefusalCode` locally
// stays compilable while drifting from the agent that branches on it: the agent handles eleven
// codes, the signer emits a twelfth, and the agent's `switch` falls through to whatever its
// default arm does. One declaration, imported here, is what makes a refusal something an agent
// can exhaustively handle rather than something it has to parse.
export * from "../../launch-sdk/src/contracts.ts";

// `SigningRequest` and `AgentPolicy` are written in viem's `Address` and `Hex`, so a consumer of
// these contracts needs both names. Re-exported here rather than imported from viem at every use
// site, so this file stays the one place the shared vocabulary is assembled.
export type { Address, Hex } from "viem";
