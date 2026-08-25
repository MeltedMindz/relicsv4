// SPDX-License-Identifier: MIT
// ================================================================================================
// `relics.agent.json` — THE AUTHORIZATION BOUNDARY.
//
// This is not a project manifest and it must never be packed into a `.relics` bundle. A bundle
// describes ART; this file describes what an agent may do with a creator's signer and money. They
// are separate files so that sharing, forking or importing a project never carries spending
// authority with it.
//
// UNKNOWN FIELDS FAIL CLOSED. A policy with a misspelled `maxNativeSpendWei` is REFUSED rather than
// run without that ceiling — the failure mode of a silently-ignored typo is an unbounded one, and
// "the field I thought I set" is exactly the mistake a creator cannot audit after the fact.
// ================================================================================================
import { getAddress, isAddress, keccak256, toHex } from "viem";
import type { AgentPolicy, AntiSnipeElectionName, ChainSelectionStrategy, LaunchGoal } from "./contracts.js";

export interface PolicyIssue {
  readonly field: string;
  readonly code: string;
  readonly detail: string;
}

export type PolicyParseResult =
  | { readonly ok: true; readonly policy: AgentPolicy; readonly policyHash: `0x${string}`; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly issues: readonly PolicyIssue[] };

const GOALS: readonly LaunchGoal[] = ["BUILD_ONLY", "LAUNCH"];
const STRATEGIES: readonly ChainSelectionStrategy[] = ["PREFERRED_ORDER", "LOWEST_ESTIMATED_GAS", "PREFERRED_THEN_GAS"];
const ELECTIONS: readonly AntiSnipeElectionName[] = ["NONE", "PROTECTED_98_MINUTES"];

/**
 * Every field the schema admits. Anything outside this set is a hard refusal — see the header.
 * Keeping the list here, beside the parser, means a new field cannot be accepted by the parser
 * without also being admitted here.
 */
const KNOWN_FIELDS = new Set([
  "version", "goal", "allowedChains", "chainSelection", "allowedRuntimes", "allowedQuoteAssets",
  "creatorRecipient", "allowedAntiSnipeModes", "antiSnipePreference", "maxRoyaltyBps",
  "maxNativeSpendWei", "maxGasPriceWei", "maxTransactionGas", "requireSimulation",
  "requireMetadataReadback", "requireDeterministicPrediction", "requiredConfirmations",
  "allowBroadcast", "signer", "$schema", "$comment",
]);

function bigintField(raw: unknown, field: string, issues: PolicyIssue[]): bigint {
  // Accepted as a STRING, deliberately. A JSON number cannot hold 1e18 wei exactly — above 2^53 it
  // silently rounds, and a rounded spending ceiling is a ceiling nobody chose.
  if (typeof raw === "string" && /^\d+$/.test(raw)) return BigInt(raw);
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw)) {
      issues.push({ field, code: "UNSAFE_NUMBER", detail: `${field} is a JSON number larger than 2^53 and has already lost precision. Quote it as a decimal string.` });
      return 0n;
    }
    return BigInt(raw);
  }
  issues.push({ field, code: "NOT_A_WEI_VALUE", detail: `${field} must be a decimal string (preferred) or a safe integer` });
  return 0n;
}

export function parseAgentPolicy(input: unknown): PolicyParseResult {
  const issues: PolicyIssue[] = [];
  const warnings: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ field: "$", code: "NOT_AN_OBJECT", detail: "relics.agent.json must contain a JSON object" }] };
  }
  const o = input as Record<string, unknown>;

  for (const key of Object.keys(o)) {
    if (!KNOWN_FIELDS.has(key)) {
      issues.push({ field: key, code: "UNKNOWN_FIELD", detail: `"${key}" is not a policy field. Unknown fields are refused rather than ignored: a misspelled ceiling that is silently dropped is an absent ceiling.` });
    }
  }

  if (o.version !== 1) issues.push({ field: "version", code: "BAD_VERSION", detail: "version must be the number 1" });

  const goal = o.goal as LaunchGoal;
  if (!GOALS.includes(goal)) issues.push({ field: "goal", code: "BAD_GOAL", detail: `goal must be one of ${GOALS.join(" | ")}` });

  const allowedChains = Array.isArray(o.allowedChains) ? o.allowedChains.map(Number) : [];
  if (allowedChains.length === 0 || allowedChains.some((n) => !Number.isInteger(n) || n <= 0)) {
    issues.push({ field: "allowedChains", code: "BAD_CHAINS", detail: "allowedChains must be a non-empty array of positive integer chain ids" });
  }

  const chainSelection = o.chainSelection as ChainSelectionStrategy;
  if (!STRATEGIES.includes(chainSelection)) issues.push({ field: "chainSelection", code: "BAD_STRATEGY", detail: `chainSelection must be one of ${STRATEGIES.join(" | ")}` });

  const allowedRuntimes = Array.isArray(o.allowedRuntimes) ? (o.allowedRuntimes as string[]) : [];
  if (allowedRuntimes.length === 0) issues.push({ field: "allowedRuntimes", code: "BAD_RUNTIMES", detail: "allowedRuntimes must name at least one runtime" });

  const aq = o.allowedQuoteAssets;
  const allowedQuoteAssets = aq === "AUTO" ? "AUTO" : Array.isArray(aq) ? (aq as string[]) : null;
  if (allowedQuoteAssets === null) issues.push({ field: "allowedQuoteAssets", code: "BAD_QUOTES", detail: 'allowedQuoteAssets must be "AUTO" or an array of symbols' });

  let creatorRecipient = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  if (typeof o.creatorRecipient !== "string" || !isAddress(o.creatorRecipient)) {
    issues.push({ field: "creatorRecipient", code: "BAD_RECIPIENT", detail: "creatorRecipient must be a checksummed address. It is never derived from the signer: the wallet that PAYS for a launch and the wallet that RECEIVES a creator's fee stream are routinely different, and guessing one from the other would hand a hot wallet a permanent revenue right." });
  } else {
    creatorRecipient = getAddress(o.creatorRecipient);
  }

  const allowedAntiSnipeModes = Array.isArray(o.allowedAntiSnipeModes) ? (o.allowedAntiSnipeModes as AntiSnipeElectionName[]) : [];
  if (allowedAntiSnipeModes.length === 0 || allowedAntiSnipeModes.some((m) => !ELECTIONS.includes(m))) {
    issues.push({ field: "allowedAntiSnipeModes", code: "BAD_ANTISNIPE", detail: `allowedAntiSnipeModes must be a non-empty subset of ${ELECTIONS.join(" | ")}. UNSPECIFIED is not a third choice — the factory refuses it, so a launch that "forgot" cannot be mistaken for one that deliberately chose no protection.` });
  }
  const antiSnipePreference = (o.antiSnipePreference ?? "AUTO") as "AUTO" | AntiSnipeElectionName;
  if (antiSnipePreference !== "AUTO" && !ELECTIONS.includes(antiSnipePreference)) {
    issues.push({ field: "antiSnipePreference", code: "BAD_ANTISNIPE_PREF", detail: 'antiSnipePreference must be "AUTO" or one of the allowed elections' });
  }
  if (antiSnipePreference !== "AUTO" && allowedAntiSnipeModes.length > 0 && !allowedAntiSnipeModes.includes(antiSnipePreference)) {
    issues.push({ field: "antiSnipePreference", code: "PREF_NOT_ALLOWED", detail: `antiSnipePreference "${antiSnipePreference}" is not in allowedAntiSnipeModes` });
  }

  const maxRoyaltyBps = Number(o.maxRoyaltyBps ?? -1);
  if (!Number.isInteger(maxRoyaltyBps) || maxRoyaltyBps < 0 || maxRoyaltyBps > 10_000) {
    issues.push({ field: "maxRoyaltyBps", code: "BAD_ROYALTY", detail: "maxRoyaltyBps must be an integer 0..10000" });
  }

  const maxNativeSpendWei = bigintField(o.maxNativeSpendWei, "maxNativeSpendWei", issues);
  const maxGasPriceWei = bigintField(o.maxGasPriceWei, "maxGasPriceWei", issues);
  const maxTransactionGas = bigintField(o.maxTransactionGas, "maxTransactionGas", issues);

  // EIP-7825 caps a transaction at 2^24 gas on these chains. A policy ceiling above it is not a
  // looser policy, it is an unreachable one, and saying so now beats a revert after metadata is pinned.
  const EIP7825_TX_GAS_CAP = 16_777_216n;
  if (maxTransactionGas > EIP7825_TX_GAS_CAP) {
    issues.push({ field: "maxTransactionGas", code: "ABOVE_PROTOCOL_CAP", detail: `maxTransactionGas ${maxTransactionGas} exceeds the EIP-7825 per-transaction cap of ${EIP7825_TX_GAS_CAP}; no transaction can ever use it` });
  }

  for (const [field, v] of [["requireSimulation", o.requireSimulation], ["requireMetadataReadback", o.requireMetadataReadback], ["requireDeterministicPrediction", o.requireDeterministicPrediction], ["allowBroadcast", o.allowBroadcast]] as const) {
    if (typeof v !== "boolean") issues.push({ field, code: "NOT_A_BOOLEAN", detail: `${field} must be true or false` });
  }

  // SIMULATION IS NOT OPTIONAL IN AN AUTONOMOUS RUN. A policy that authorizes broadcast while
  // switching off the only step that proves the transaction would succeed is self-contradictory,
  // and refusing it here is cheaper than a reverted launch that already pinned its metadata.
  if (o.allowBroadcast === true && o.requireSimulation === false) {
    issues.push({ field: "requireSimulation", code: "BROADCAST_WITHOUT_SIMULATION", detail: "allowBroadcast=true with requireSimulation=false is refused: nothing would establish that the transaction succeeds before it is signed" });
  }
  if (o.allowBroadcast === true && goal !== "LAUNCH") {
    warnings.push('allowBroadcast is true but goal is not "LAUNCH"; the run will still stop at BUILT');
  }

  const requiredConfirmations = Number(o.requiredConfirmations ?? -1);
  if (!Number.isInteger(requiredConfirmations) || requiredConfirmations < 1) {
    issues.push({ field: "requiredConfirmations", code: "BAD_CONFIRMATIONS", detail: "requiredConfirmations must be an integer >= 1. Zero would mean accepting a transaction hash as a launch, and a hash is not a receipt." });
  }

  if (typeof o.signer !== "string" || o.signer.length === 0) {
    issues.push({ field: "signer", code: "BAD_SIGNER", detail: "signer must name a configured signer adapter id" });
  }

  if (issues.length > 0) return { ok: false, issues };

  const policy: AgentPolicy = {
    version: 1, goal, allowedChains, chainSelection, allowedRuntimes,
    allowedQuoteAssets: allowedQuoteAssets as "AUTO" | readonly string[],
    creatorRecipient, allowedAntiSnipeModes, antiSnipePreference, maxRoyaltyBps,
    maxNativeSpendWei, maxGasPriceWei, maxTransactionGas,
    requireSimulation: o.requireSimulation as boolean,
    requireMetadataReadback: o.requireMetadataReadback as boolean,
    requireDeterministicPrediction: o.requireDeterministicPrediction as boolean,
    requiredConfirmations, allowBroadcast: o.allowBroadcast as boolean, signer: o.signer as string,
  };
  return { ok: true, policy, policyHash: hashPolicy(policy), warnings };
}

/**
 * The policy's identity, bound into every downstream receipt and re-checked by the signer.
 *
 * CANONICALISED BEFORE HASHING — sorted keys, bigints as decimal strings — so that reformatting
 * `relics.agent.json` (a trailing comma, a reordered key, a re-indent) does NOT invalidate an
 * approved build, while changing any VALUE does. A hash over raw file bytes would have made every
 * cosmetic edit look like a policy change, which trains a reader to ignore the one that matters.
 */
export function hashPolicy(policy: AgentPolicy): `0x${string}` {
  const canonical = JSON.stringify(policy, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 0);
  const sorted = JSON.stringify(JSON.parse(canonical), Object.keys(JSON.parse(canonical)).sort());
  return keccak256(toHex(sorted));
}
