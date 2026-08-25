import type { Address, Hex } from "viem";
/**
 * THE THREE-VALUED ANSWER, USED EVERYWHERE A CHAIN IS ASKED A QUESTION.
 *
 * `UNKNOWN` is not a soft `false` and must never be rendered as one. A registry that could not be
 * read completely does not say a runtime is absent — it says nobody knows, and a launch refuses on
 * that just as firmly as on a proven refusal, while SAYING something different to the creator.
 * Collapsing this to a boolean is how a transport failure became "this chain has no runtime
 * registered", which is a fabricated fact about a chain nobody successfully asked.
 */
export type Evidence = "PROVEN" | "REFUTED" | "UNKNOWN";
/** One live claim about a chain, carrying HOW it was established rather than only its verdict. */
export interface Finding {
    readonly id: string;
    readonly evidence: Evidence;
    /** Human sentence. Never the machine contract — `id` and `evidence` are. */
    readonly detail: string;
    /** Present when `evidence` is UNKNOWN: what prevented an answer. */
    readonly unreadReason?: string;
}
export type LaunchGoal = "BUILD_ONLY" | "LAUNCH";
export type ChainSelectionStrategy = "PREFERRED_ORDER" | "LOWEST_ESTIMATED_GAS" | "PREFERRED_THEN_GAS";
export type AntiSnipeElectionName = "NONE" | "PROTECTED_98_MINUTES";
/**
 * `relics.agent.json`, parsed and validated. This is an AUTHORIZATION BOUNDARY, not a project
 * manifest: it says what an agent may do with a creator's signer and money, and it is deliberately
 * a separate file from `.relics` so that copying a project around never copies spending authority.
 *
 * UNKNOWN FIELDS FAIL CLOSED. A policy with a misspelled ceiling is refused rather than silently
 * running without that ceiling, because the failure mode of a typo'd `maxNativeSpendWei` is an
 * unbounded one.
 */
export interface AgentPolicy {
    readonly version: 1;
    readonly goal: LaunchGoal;
    readonly allowedChains: readonly number[];
    readonly chainSelection: ChainSelectionStrategy;
    readonly allowedRuntimes: readonly string[];
    /** `"AUTO"` lets the agent pick any live-admitted quote; a list restricts it to those symbols. */
    readonly allowedQuoteAssets: "AUTO" | readonly string[];
    readonly creatorRecipient: Address;
    readonly allowedAntiSnipeModes: readonly AntiSnipeElectionName[];
    readonly antiSnipePreference: "AUTO" | AntiSnipeElectionName;
    readonly maxRoyaltyBps: number;
    readonly maxNativeSpendWei: bigint;
    readonly maxGasPriceWei: bigint;
    readonly maxTransactionGas: bigint;
    readonly requireSimulation: boolean;
    readonly requireMetadataReadback: boolean;
    readonly requireDeterministicPrediction: boolean;
    readonly requiredConfirmations: number;
    readonly allowBroadcast: boolean;
    readonly signer: string;
}
/**
 * WHAT THE SIGNER SEES, AND THE ONLY THING IT WILL SIGN.
 *
 * The three hashes are not decoration. A signer that only checked `to` and `data` would happily
 * sign a correct-looking launch built from a policy the creator never approved, or from a bundle
 * edited after simulation. Binding all three means the signer can refuse on facts it verified
 * ITSELF rather than trusting the orchestrator that handed it the request — which is the whole
 * point of putting the signer behind a protocol boundary instead of in the agent's process.
 */
export interface SigningRequest {
    readonly chainId: number;
    readonly from: Address;
    readonly to: Address;
    readonly value: bigint;
    readonly data: Hex;
    /** keccak256 of `data`. The signer recomputes it; a mismatch is a refusal, never a warning. */
    readonly dataHash: Hex;
    /** First four bytes of `data`. Kept separately so a policy can allowlist by selector. */
    readonly selector: Hex;
    readonly estimatedGas: bigint;
    readonly maxFeePerGas?: bigint;
    readonly maxPriorityFeePerGas?: bigint;
    readonly nonce?: number;
    readonly launchPlanHash: Hex;
    readonly bundleHash: Hex;
    readonly policyHash: Hex;
}
/** What a signer adapter returns. Exactly one of the two shapes, never both. */
export type SignerResult = {
    readonly kind: "SIGNED";
    readonly rawTransaction: Hex;
    readonly signerAddress: Address;
} | {
    readonly kind: "BROADCAST";
    readonly txHash: Hex;
    readonly signerAddress: Address;
};
/** A signer's refusal. Always a typed reason — an agent must be able to branch on it. */
export interface SignerRefusal {
    readonly kind: "REFUSED";
    readonly code: SignerRefusalCode;
    readonly detail: string;
}
export type SignerRefusalCode = "CHAIN_NOT_ALLOWED" | "TARGET_NOT_CANONICAL_FACTORY" | "SELECTOR_NOT_ALLOWED" | "VALUE_EXCEEDS_POLICY" | "GAS_EXCEEDS_POLICY" | "GAS_PRICE_EXCEEDS_POLICY" | "CALLDATA_HASH_MISMATCH" | "POLICY_HASH_MISMATCH" | "LAUNCH_PLAN_HASH_MISMATCH" | "BUNDLE_HASH_MISMATCH" | "RECIPIENT_NOT_POLICY_RECIPIENT" | "SIGNER_DOES_NOT_SUPPORT_CHAIN" | "NO_APPROVED_BUILD";
export declare const LAUNCH_STATES: readonly ["BRIEF_RECEIVED", "PROJECT_SCAFFOLDED", "ART_AUTHORED", "ART_PROVEN", "PROJECT_CONFIGURED", "VALIDATED", "EXPORTED", "CHAIN_SELECTED", "CHAIN_PREFLIGHT_PASSED", "METADATA_PUBLISHED", "PREPARED", "PREDICTED", "SIMULATED", "BUILT", "POLICY_APPROVED", "SIGNED", "BROADCAST", "CONFIRMED", "VERIFIED", "COMPLETE"];
export type LaunchState = (typeof LAUNCH_STATES)[number];
/** The CLOSED set of things an external coding agent can be told to do next. */
export declare const NEXT_ACTIONS: readonly ["WRITE_ART", "FIX_ART", "FIX_VALIDATION", "CONFIGURE_PROJECT", "CONFIGURE_PROVIDER", "CONFIGURE_SIGNER", "FUND_SIGNER", "READY_FOR_PREFLIGHT", "READY_FOR_METADATA", "READY_FOR_PREPARE", "READY_FOR_SIMULATION", "READY_FOR_BUILD", "READY_FOR_BROADCAST", "WAIT_CONFIRMATION", "VERIFY", "COMPLETE", "BLOCKED"];
export type NextAction = (typeof NEXT_ACTIONS)[number];
export interface NextActionResult {
    readonly schemaVersion: 1;
    readonly state: LaunchState;
    readonly action: NextAction;
    readonly reasonCode: string;
    readonly reason: string;
    readonly requiredInputs: readonly string[];
    readonly allowedMutations: readonly string[];
    readonly commands: readonly string[];
    readonly receipts: readonly string[];
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
}
/**
 * One hash-linked step of a launch's history. `previousReceiptHash` makes the chain tamper-evident:
 * a receipt edited after the fact breaks every link after it, so "the run says it simulated" can be
 * checked rather than believed.
 *
 * NEVER carries a private key, mnemonic, RPC credential or pinning token. The secret gate asserts
 * that on the written files, not on intent.
 */
export interface Receipt {
    readonly version: 1;
    readonly phase: string;
    readonly timestamp: string;
    readonly projectBundleHash: string | null;
    readonly policyHash: string | null;
    readonly launchPlanHash: string | null;
    readonly inputHash: string;
    readonly outputHash: string;
    readonly previousReceiptHash: string | null;
    readonly chainId: number | null;
    readonly addresses: Readonly<Record<string, string>>;
    readonly body: unknown;
}
/** Every `--json` command prints exactly this on stdout. Human prose goes to stderr, always. */
export interface JsonEnvelope<T> {
    readonly schemaVersion: 1;
    readonly command: string;
    readonly success: boolean;
    readonly timestamp: string;
    readonly inputHash: string | null;
    readonly result: T | null;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
    readonly nextActions: readonly string[];
}
/** Documented, stable exit codes. An agent branches on these without reading any text. */
export declare const EXIT: {
    readonly OK: 0;
    /** A gate refused: the input is wrong and editing files is the remedy. */
    readonly REFUSED: 1;
    /** Usage error — unknown command, bad flag. */
    readonly USAGE: 2;
    /** A live chain fact could not be established. NOT a refusal: nobody was successfully asked. */
    readonly UNKNOWN_CHAIN_STATE: 3;
    /** Policy forbids what was requested. Editing the project will not help; the policy must change. */
    readonly POLICY: 4;
    /** The signer refused. */
    readonly SIGNER_REFUSED: 5;
    /** Work is genuinely blocked on something outside this process (funding, provider, network). */
    readonly BLOCKED: 6;
};
