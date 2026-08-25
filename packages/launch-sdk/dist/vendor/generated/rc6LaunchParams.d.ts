/** Every `LaunchParams` field, IN THE SOLIDITY STRUCT'S ORDER. Order is load-bearing. */
export declare const RC6_LAUNCH_PARAMS_FIELDS: readonly ["name", "symbol", "totalSupply", "artworkBackingUnits", "startingPreset", "tokenSalt", "hookSalt", "artMode", "artTemplateId", "artScriptHash", "artConfig", "marketStateConfig", "creatorRecipient", "collaborators", "burnPolicy", "antiSnipeMode", "metadataUriHash", "creatorEarnings", "backingUnitsPerArtwork"];
export type Rc6LaunchParamsField = (typeof RC6_LAUNCH_PARAMS_FIELDS)[number];
/** Each field's fully expanded canonical ABI type. */
export declare const RC6_LAUNCH_PARAMS_TYPES: {
    readonly name: "string";
    readonly symbol: "string";
    readonly totalSupply: "uint256";
    readonly artworkBackingUnits: "uint256";
    readonly startingPreset: "uint8";
    readonly tokenSalt: "bytes32";
    readonly hookSalt: "bytes32";
    readonly artMode: "uint8";
    readonly artTemplateId: "uint256";
    readonly artScriptHash: "bytes32";
    readonly artConfig: "bytes";
    readonly marketStateConfig: "bytes";
    readonly creatorRecipient: "address";
    readonly collaborators: "(address,uint16)[]";
    readonly burnPolicy: "uint8";
    readonly antiSnipeMode: "uint8";
    readonly metadataUriHash: "bytes32";
    readonly creatorEarnings: "uint256";
    readonly backingUnitsPerArtwork: "uint256";
};
/** The fully expanded canonical signature the factory actually exposes. */
export declare const RC6_LAUNCH_SIGNATURE: "launch((string,string,uint256,uint256,uint8,bytes32,bytes32,uint8,uint256,bytes32,bytes,bytes,address,(address,uint16)[],uint8,uint8,bytes32,uint256,uint256))";
/** `LaunchResult`'s fields, in the struct's order. */
export declare const RC6_LAUNCH_RESULT_FIELDS: readonly ["projectToken", "projectCollection", "artHook", "projectId", "poolKey", "poolId", "genesisLiquidity"];
export type Rc6LaunchResultField = (typeof RC6_LAUNCH_RESULT_FIELDS)[number];
