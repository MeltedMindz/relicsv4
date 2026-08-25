import { type Address, type PublicClient } from "viem";
export interface ChainProfile {
    readonly chainId: number;
    readonly label: string;
    readonly explorer: string;
    readonly nativeSymbol: string;
    readonly contracts: Readonly<Record<string, Address>>;
    /**
     * WHAT THE CHECKED-IN RECORD CLAIMED WHEN IT WAS WRITTEN. Never consulted to permit anything.
     * Compared against the live read so a drifted record is reported rather than silently obeyed.
     */
    readonly expectedLaunchAccess: string | null;
    /** Env var holding this chain's RPC endpoint. The VALUE is a credential and never leaves here. */
    readonly rpcEnvKey: string;
    /** Public fallback used only when the env var is unset. Rate-limited by nature; never a default
     *  a production run should rely on, and the preflight says so when it is in use. */
    readonly publicFallbackRpc: string | null;
}
/** Every chain the public record knows about, deployed or not. Deployment is checked separately. */
export declare function knownChainIds(): number[];
export declare function getChainProfile(chainId: number): ChainProfile | null;
export interface RpcSelection {
    readonly url: string;
    readonly source: "ENV" | "PUBLIC_FALLBACK" | "EXPLICIT";
    readonly envKey: string;
}
/**
 * Which endpoint this chain will be read through, and WHERE that came from — but never the value
 * in any returned diagnostic. A credentialed URL leaking into a receipt or a log line is the exact
 * shape of secret disclosure this whole system is built to avoid, so `source` is what callers print.
 */
export declare function resolveRpc(profile: ChainProfile, explicitUrl?: string): RpcSelection | null;
export declare function makeClient(profile: ChainProfile, explicitUrl?: string): {
    client: PublicClient;
    rpc: RpcSelection;
} | null;
