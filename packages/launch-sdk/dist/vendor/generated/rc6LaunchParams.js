// SPDX-License-Identifier: MIT
// GENERATED FILE — DO NOT EDIT.
//
// Source: launchpad/out/LaunchpadFactoryV1.sol/LaunchpadFactoryV1.json, via
// sdk/scripts/refresh-contracts-abi.mjs. Regenerate after `forge build`; never hand-edit.
//
// This is the SDK's half of the canonical RC6 `LaunchParams` schema
// (sdk/contracts-abi/rc6/launch-params.schema.json). `sdk/src/types.ts` asserts at COMPILE TIME
// that `keyof LaunchParams` is exactly `Rc6LaunchParamsField`, so a field added to, removed from
// or renamed in the Solidity struct fails `tsc` here rather than producing calldata the factory
// decodes into the wrong slots.
/** Every `LaunchParams` field, IN THE SOLIDITY STRUCT'S ORDER. Order is load-bearing. */
export const RC6_LAUNCH_PARAMS_FIELDS = [
    "name",
    "symbol",
    "totalSupply",
    "artworkBackingUnits",
    "startingPreset",
    "tokenSalt",
    "hookSalt",
    "artMode",
    "artTemplateId",
    "artScriptHash",
    "artConfig",
    "marketStateConfig",
    "creatorRecipient",
    "collaborators",
    "burnPolicy",
    "antiSnipeMode",
    "metadataUriHash",
    "creatorEarnings",
    "backingUnitsPerArtwork",
];
/** Each field's fully expanded canonical ABI type. */
export const RC6_LAUNCH_PARAMS_TYPES = {
    name: "string",
    symbol: "string",
    totalSupply: "uint256",
    artworkBackingUnits: "uint256",
    startingPreset: "uint8",
    tokenSalt: "bytes32",
    hookSalt: "bytes32",
    artMode: "uint8",
    artTemplateId: "uint256",
    artScriptHash: "bytes32",
    artConfig: "bytes",
    marketStateConfig: "bytes",
    creatorRecipient: "address",
    collaborators: "(address,uint16)[]",
    burnPolicy: "uint8",
    antiSnipeMode: "uint8",
    metadataUriHash: "bytes32",
    creatorEarnings: "uint256",
    backingUnitsPerArtwork: "uint256",
};
/** The fully expanded canonical signature the factory actually exposes. */
export const RC6_LAUNCH_SIGNATURE = "launch((string,string,uint256,uint256,uint8,bytes32,bytes32,uint8,uint256,bytes32,bytes,bytes,address,(address,uint16)[],uint8,uint8,bytes32,uint256,uint256))";
/** `LaunchResult`'s fields, in the struct's order. */
export const RC6_LAUNCH_RESULT_FIELDS = [
    "projectToken",
    "projectCollection",
    "artHook",
    "projectId",
    "poolKey",
    "poolId",
    "genesisLiquidity",
];
