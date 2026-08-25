import { type Address, type Hex, type PublicClient } from "viem";
export interface BroadcastIntent {
    readonly version: 1;
    readonly launchPlanHash: string;
    readonly buildHash: string;
    readonly dataHash: string;
    readonly chainId: number;
    readonly factory: Address;
    readonly signer: Address;
    /** The nonce the signer was at when intent was written. A move past it means bytes left. */
    readonly nonceAtIntent: number;
    readonly predicted: {
        projectToken: Address;
        projectCollection: Address;
        artHook: Address;
        poolId: Hex;
    };
    readonly totalLaunchesAtIntent: string | null;
    readonly writtenAt: string;
    /** Filled in AFTER a send returns. Absent means "we do not know whether it landed". */
    txHash?: Hex;
}
export declare function readIntent(workspace: string): BroadcastIntent | null;
/** Write intent. MUST be called and flushed before any transaction leaves the process. */
export declare function writeIntent(workspace: string, intent: Omit<BroadcastIntent, "version" | "writtenAt">): BroadcastIntent;
export declare function recordIntentTxHash(workspace: string, txHash: Hex): void;
export type ResendVerdict = "ALREADY_LAUNCHED" | "SAFE_TO_SEND" | "UNKNOWN_DO_NOT_SEND";
export interface ResendDecision {
    readonly verdict: ResendVerdict;
    readonly evidence: readonly {
        question: string;
        answer: string;
        landed: boolean | null;
    }[];
    readonly txHash: Hex | null;
    readonly detail: string;
}
/**
 * Ask the chain whether the launch this intent describes already happened.
 *
 * Returns ALREADY_LAUNCHED on any positive evidence, UNKNOWN_DO_NOT_SEND if any question could not
 * be answered, and SAFE_TO_SEND only when every question was answered and all say no.
 */
export declare function decideResend(client: PublicClient, intent: BroadcastIntent, opts: {
    factoryAbi: any;
}): Promise<ResendDecision>;
