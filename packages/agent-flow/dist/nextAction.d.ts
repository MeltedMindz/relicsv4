import type { LaunchState, NextActionResult } from "@relics/launch-sdk";
/**
 * EVERY COMMAND STRING RETURNED BY THIS MODULE MUST BE ONE THE CLI ANSWERS TO.
 *
 * This file's whole purpose is that an agent can follow `commands` literally without knowing
 * anything about the repository. Two of them named subcommands that did not exist — `agent finalise`
 * and `agent art-check` — so an agent doing exactly what it was told got `unknown subcommand` and
 * exit 2. Prose cannot be checked; this list can, and `npm run agent:commands` derives the real
 * surface from the CLI's own dispatcher and fails if anything here is not in it.
 */
export declare const NEXT_ACTION_SUBCOMMANDS: readonly ["init", "status", "doctor", "next", "capabilities", "chains", "quotes", "preflight", "plan", "metadata", "prepare", "predict", "simulate", "build", "policy-check", "broadcast", "confirm", "verify", "resume", "run", "provenance", "verify-receipts"];
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
