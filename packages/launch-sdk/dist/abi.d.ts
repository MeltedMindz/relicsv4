import type { Abi } from "viem";
export declare function rc6Abi(name: string): Abi;
export declare const FACTORY_ABI: () => Abi;
export declare const METADATA_RESOLVER_ABI: () => Abi;
export declare const PROJECT_REGISTRY_ABI: () => Abi;
export declare const PROJECT_COLLECTION_ABI: () => Abi;
export declare const PROJECT_TOKEN_ABI: () => Abi;
export declare const ART_HOOK_ABI: () => Abi;
/**
 * `ArtRuntimeRegistryV1`'s read surface. Declared inline because the registry's own artifact is not
 * among the published launch artifacts, and this is the whole surface the SDK needs.
 *
 * `runtimeInfo` returns the FULL record including `exists` and `active`. Both booleans are
 * load-bearing: the call DOES NOT REVERT for an unregistered id — it returns a well-formed record
 * with the zero address and `exists: false`. A "did it resolve?" check reads that as success, which
 * is why every consumer here must require a non-zero address WITH CODE, active, and identity-matched.
 */
export declare const ART_RUNTIME_REGISTRY_ABI: readonly [{
    readonly type: "function";
    readonly name: "runtimeInfo";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "runtimeId";
        readonly type: "uint32";
    }];
    readonly outputs: readonly [{
        readonly type: "tuple";
        readonly components: readonly [{
            readonly name: "runtime";
            readonly type: "address";
        }, {
            readonly name: "codeHash";
            readonly type: "bytes32";
        }, {
            readonly name: "tag";
            readonly type: "bytes32";
        }, {
            readonly name: "version";
            readonly type: "uint16";
        }, {
            readonly name: "mode";
            readonly type: "uint8";
        }, {
            readonly name: "active";
            readonly type: "bool";
        }, {
            readonly name: "exists";
            readonly type: "bool";
        }, {
            readonly name: "label";
            readonly type: "string";
        }];
    }];
}, {
    readonly type: "function";
    readonly name: "runtimeCount";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint32";
    }];
}];
