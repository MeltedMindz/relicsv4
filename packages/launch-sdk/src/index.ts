// SPDX-License-Identifier: MIT
// The public launch SDK's whole surface. CLI, agent-flow and any MCP tool call THESE functions —
// there is no second implementation of launch semantics anywhere in this repository, and the
// parity gate (`npm run launch:parity`) is what keeps that true against the canonical private tree.
export * from "./contracts.js";
export * from "./chains.js";
export * from "./capabilities.js";
export * from "./policy.js";
export * from "./plan.js";
export * from "./pipeline.js";
export * from "./economics.js";
export * from "./settle.js";
export * from "./quotes.js";
// THE METADATA PIPELINE WAS REACHABLE ONLY BY FILE PATH. It was not re-exported here and had no
// subpath in `exports`, so the CLI reached for `@relics/launch-sdk/dist/metadata/index.js`, got
// ERR_PACKAGE_PATH_NOT_EXPORTED, silently fell back to the package root, and then failed with
// "memoryProvider is not a function" — a wrong-name error standing in for a wrong-module error.
// A pipeline nobody can import is a pipeline nobody uses.
export * from "./metadata/index.js";
export * from "./hookSalt.js";
export * from "./artRuntime.js";
export { rc6Abi, FACTORY_ABI, METADATA_RESOLVER_ABI, PROJECT_REGISTRY_ABI, PROJECT_COLLECTION_ABI, PROJECT_TOKEN_ABI, ART_HOOK_ABI, ART_RUNTIME_REGISTRY_ABI } from "./abi.js";

// The vendored canonical semantics, re-exported so a consumer never has to reach into `vendor/`
// (and so that reaching into it is a visible smell rather than a normal import).
export { AntiSnipeMode, ArtMode, BurnPolicy, StartingPreset, metadataDigestForUri, launchParamsAsTuple } from "./vendor/types.js";
export type { LaunchParams, LaunchResult, PoolKey, Collaborator } from "./vendor/types.js";
export { buildLaunchParams, validateCreatorInput, DEFAULT_BACKING_UNITS_PER_ARTWORK } from "./vendor/params.js";
export type { CreatorInput } from "./vendor/params.js";
export { packCreatorEarnings, unpackCreatorEarnings, NO_CREATOR_EARNINGS, CreatorEarningsMode } from "./vendor/creatorEarnings.js";
export { assertAbiMatchesLaunchParams, LaunchAbiGenerationMismatchError } from "./vendor/launchCalldata.js";
export { RC6_LAUNCH_PARAMS_FIELDS } from "./vendor/generated/rc6LaunchParams.js";

import provenance from "./generated/provenance.json" with { type: "json" };
/** Which protocol generation this SDK's types were generated from. Carries NO chain status. */
export const PROVENANCE = provenance;
