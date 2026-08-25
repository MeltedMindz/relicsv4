import type { LaunchState, NextActionResult } from "@relics/launch-sdk";
export interface FlowFacts {
    readonly state: LaunchState;
    readonly hasPolicy: boolean;
    readonly policyProblems: readonly string[];
    readonly hasBrief: boolean;
    readonly hasArt: boolean;
    readonly artProblems: readonly string[];
    readonly validationErrors: readonly string[];
    readonly hasBundle: boolean;
    readonly chainSelected: number | null;
    readonly chainBlockers: readonly string[];
    readonly signerConfigured: boolean;
    readonly signerAddress: string | null;
    readonly signerFunded: boolean | null;
    readonly metadataProviderConfigured: boolean;
    readonly metadataPublished: boolean;
    readonly simulated: boolean;
    readonly simulationRevert: string | null;
    readonly built: boolean;
    readonly policyApproved: boolean;
    readonly broadcastTxHash: string | null;
    readonly confirmed: boolean;
    readonly verified: boolean;
    readonly verificationFailures: readonly string[];
    readonly allowBroadcast: boolean;
    readonly goal: "BUILD_ONLY" | "LAUNCH";
    readonly receiptPaths: readonly string[];
}
/**
 * Decide the next action.
 *
 * ORDER IS SIGNIFICANT AND IS NOT THE STATE ORDER. Blockers that no amount of local work can fix —
 * a missing signer, an unfunded one, an unconfigured provider — are reported BEFORE creative work,
 * so an agent is never sent off to iterate on artwork for an hour and only then told it could never
 * have launched. That ordering is the difference between an autonomous run and a wasted one.
 */
export declare function decideNextAction(f: FlowFacts): NextActionResult;
