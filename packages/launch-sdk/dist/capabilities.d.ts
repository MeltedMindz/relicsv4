import { type Address, type Hex, type PublicClient } from "viem";
import { type RpcSelection } from "./chains.js";
import type { Evidence, Finding } from "./contracts.js";
/** `launchAccess()` returns the state alongside the canary bitmap; 1 is PUBLIC. */
export declare const LAUNCH_ACCESS: {
    readonly PREPARED: 0;
    readonly PUBLIC: 1;
};
export interface RuntimeRecord {
    readonly id: number;
    readonly runtime: Address;
    readonly codeHash: Hex;
    readonly tag: Hex;
    readonly version: number;
    readonly mode: number;
    readonly active: boolean;
    readonly exists: boolean;
    readonly label: string;
}
/**
 * A registry read AND whether it was COMPLETE. `entries` alone cannot distinguish "this chain has
 * one runtime" from "this chain has three and two reads timed out" — so the completeness flag
 * travels with the data and every consumer must consult it before concluding an ABSENCE.
 */
export interface RegistrySnapshot {
    readonly entries: ReadonlyMap<number, RuntimeRecord>;
    readonly complete: boolean;
    readonly declaredCount: number | null;
    readonly failedReads: readonly number[];
    readonly errors: readonly string[];
}
export interface ChainCapability {
    readonly chainId: number;
    readonly label: string;
    readonly explorer: string;
    readonly nativeSymbol: string;
    readonly rpcSource: RpcSelection["source"] | null;
    readonly findings: readonly Finding[];
    /** PROVEN only when every required finding is PROVEN. One UNKNOWN makes the whole answer UNKNOWN. */
    readonly launchable: Evidence;
    readonly factory: Address | null;
    readonly metadataResolver: Address | null;
    readonly artRuntimeRegistry: Address | null;
    readonly liveLaunchAccess: number | null;
    readonly expectedLaunchAccess: string | null;
    readonly registry: RegistrySnapshot | null;
    readonly gasPriceWei: bigint | null;
    readonly blockNumber: bigint | null;
}
/**
 * Read the whole runtime registry, tracking every failure.
 *
 * A FAILED `runtimeInfo` IS RECORDED, NEVER SKIPPED. The production defect this mirrors was a
 * `catch { continue }`: entries that failed to read simply vanished from the map, and the caller —
 * which had no way to tell a missing entry from an absent one — reported the runtime as not
 * registered. Same for a failed `getCode`: a caught error became `codeSize = 0`, which reads as
 * "the address holds no code" rather than "we could not find out".
 */
export declare function readRegistrySnapshot(client: PublicClient, registry: Address): Promise<RegistrySnapshot>;
/**
 * Everything a chain must prove before it may be launched on. Reads only; nothing here can send a
 * transaction, and nothing here consults a document.
 */
export declare function getChainCapability(chainId: number, opts?: {
    rpcUrl?: string;
    requiredRuntimeTag?: string;
}): Promise<ChainCapability>;
