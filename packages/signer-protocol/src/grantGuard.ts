// SPDX-License-Identifier: MIT
// ================================================================================================
// THE GRANT GUARD — the checks a 4.1.0 policy could not express.
//
// `checkStaticPolicy` answers "is this transaction the SHAPE the policy allows?". This answers
// "is this creator still allowing it AT ALL, and have they already spent the permission?" — which
// no amount of inspecting the calldata can tell you, because it is a fact about a human's grant
// rather than about a transaction.
//
// IT RUNS BESIDE THE SHAPE CHECKS, NOT INSTEAD OF THEM. Both must pass. The order in
// `guardSigningRequest` puts this one FIRST, so an expired or revoked grant is refused before the
// signer does any work decoding bytes it is never going to sign.
//
// EVERY VALUE COMPARED HERE IS DECODED FROM THE CALLDATA. The runtime, the anti-snipe election and
// the royalty all sit inside `LaunchParams`; reading them from an object handed in alongside would
// make this guard a check on the orchestrator's honesty rather than on the transaction.
// ================================================================================================
import { formatEther, getAddress, type Hex } from "viem";
import { decodeLaunchParamsFromCalldata, LAUNCH_PARAMS_FIELD_COUNT } from "./launchAbi.ts";
import { checkAuthorization, type Authorization } from "./authorization.ts";
import { runtimeTagAllowed } from "./artSelectorGuard.ts";
import type { SigningRequest } from "./contracts.ts";

export type GrantRefusalCode =
  | "NO_AUTHORIZATION"
  | "AUTHORIZATION_EXPIRED"
  | "AUTHORIZATION_CONSUMED"
  | "AUTHORIZATION_REVOKED"
  | "AUTHORIZATION_UNREADABLE"
  | "AUTHORIZATION_NOT_FOR_THIS_SIGNER"
  | "TOTAL_GAS_COST_EXCEEDS_AUTHORIZATION"
  | "LAUNCH_PARAMS_FIELD_COUNT_WRONG"
  | "RUNTIME_NOT_AUTHORIZED"
  | "ANTISNIPE_NOT_AUTHORIZED"
  | "ROYALTY_EXCEEDS_AUTHORIZATION"
  | "RECIPIENT_NOT_AUTHORIZED"
  | "CHAIN_NOT_AUTHORIZED"
  | "NO_SIMULATION_RECEIPT"
  | "SIMULATION_CALLDATA_MISMATCH"
  | "BROADCAST_NOT_AUTHORIZED";

export type GrantVerdict =
  | { readonly kind: "ALLOWED"; readonly authorization: Authorization }
  | { readonly kind: "REFUSED"; readonly code: GrantRefusalCode; readonly detail: string };

/** Proof that the EXACT bytes about to be signed were simulated. */
export interface SimulationReceipt {
  readonly ok: boolean;
  readonly dataHash: Hex;
  readonly chainId: number;
  readonly blockNumber: string;
}

const ANTI_SNIPE_NAMES = ["UNSPECIFIED", "NONE", "PROTECTED_98_MINUTES"] as const;

/** The royalty bps packed into `creatorEarnings`: `mode | royaltyBps << 8 | policyVersion << 24`. */
function royaltyBpsOf(creatorEarnings: bigint): number {
  return Number((creatorEarnings >> 8n) & 0xffffn);
}

/**
 * THE GRANT SPLITS INTO TWO PHASES AND THE ORDER OF ALL THREE GUARDS MATTERS.
 *
 *   1. `checkGrantPermission` — is the creator still permitting a launch at all? Needs NO calldata:
 *      expiry, revocation, spend, chain, broadcast, the gas budget. Cheapest, so it runs first.
 *   2. the SHAPE guard (`checkStaticPolicy`) — is this even a launch? Target, selector, hashes.
 *   3. `checkGrantCalldata` — do the decoded FIELDS match what was authorized?
 *
 * Phase 3 must not run before phase 2, and that is not a preference. Decoding arbitrary bytes as
 * `LaunchParams` fails with "Encoded function signature 0xa9059cbb not found on ABI" — which is a
 * true statement about an ERC-20 transfer and a useless thing to tell a creator. The selector check
 * belongs to the shape guard and answers it in one word. Running phase 3 first made every
 * non-launch transaction refuse for a confusing reason, which is how a good refusal becomes a bad
 * bug report.
 */
export function checkGrantPermission(input: {
  request: SigningRequest;
  simulation?: SimulationReceipt | null;
  now?: Date;
}): GrantVerdict {
  const { request } = input;

  // ---- 1. IS THERE STILL A GRANT? ---------------------------------------------------------------
  // `exactOptionalPropertyTypes` is on in this package, so an explicit `undefined` is not the same
  // as an absent key — the property is omitted rather than passed as undefined.
  const state = checkAuthorization(input.now ? { signerAddress: request.from, now: input.now } : { signerAddress: request.from });
  if (!state.ok) return { kind: "REFUSED", code: state.reason as GrantRefusalCode, detail: state.detail };
  const auth = state.authorization;

  if (!auth.allowBroadcast) {
    return { kind: "REFUSED", code: "BROADCAST_NOT_AUTHORIZED", detail: "This authorization is BUILD_ONLY: it permits building and simulating a launch, not signing one. The creator must run `npm run kit -- agent setup` and choose SAFE_AUTONOMOUS to authorize a broadcast." };
  }
  if (!auth.allowedChains.includes(request.chainId)) {
    return { kind: "REFUSED", code: "CHAIN_NOT_AUTHORIZED", detail: `The creator authorized chains ${auth.allowedChains.join(", ")}; this request is for chain ${request.chainId}.` };
  }

  // ---- 2. THE TOTAL GAS BUDGET ------------------------------------------------------------------
  // A separate gas ceiling and a separate price ceiling bound a PRODUCT that neither of them names.
  // 16,000,000 gas at 50 gwei is 0.8 ETH; both halves look reasonable and the total does not. This
  // is the bound a creator actually agreed to, expressed the way they were asked for it.
  const ceiling = BigInt(auth.maxTotalGasCostWei);
  if (request.maxFeePerGas !== undefined) {
    const worstCase = request.estimatedGas * request.maxFeePerGas;
    if (worstCase > ceiling) {
      return {
        kind: "REFUSED", code: "TOTAL_GAS_COST_EXCEEDS_AUTHORIZATION",
        detail: `This launch could cost up to ${formatEther(worstCase)} in network fees (${request.estimatedGas} gas x ${request.maxFeePerGas} wei). The creator authorized at most ${formatEther(ceiling)}.`,
      };
    }
  }
  if (request.value > BigInt(auth.maxNativeSpendWei)) {
    return { kind: "REFUSED", code: "TOTAL_GAS_COST_EXCEEDS_AUTHORIZATION", detail: `This transaction sends ${formatEther(request.value)} of native currency; the creator authorized at most ${formatEther(BigInt(auth.maxNativeSpendWei))}.` };
  }

  // ---- 3. THE SIMULATION MUST BE OF THESE BYTES --------------------------------------------------
  // Not "a simulation happened" — a simulation OF THIS CALLDATA. Simulating one transaction and
  // signing another is the failure the dataHash exists to make impossible to do quietly.
  const sim = input.simulation;
  if (!sim) {
    return { kind: "REFUSED", code: "NO_SIMULATION_RECEIPT", detail: "No simulation receipt accompanied this signing request. Nothing establishes that this transaction succeeds, and a launch that reverts still costs the gas to try." };
  }
  if (!sim.ok) {
    return { kind: "REFUSED", code: "NO_SIMULATION_RECEIPT", detail: "The accompanying simulation reverted. There is no override in autonomous mode." };
  }
  if (sim.dataHash.toLowerCase() !== request.dataHash.toLowerCase()) {
    return { kind: "REFUSED", code: "SIMULATION_CALLDATA_MISMATCH", detail: `The simulation was of calldata ${sim.dataHash} and this request carries ${request.dataHash}. Something changed between simulating and signing.` };
  }
  if (sim.chainId !== request.chainId) {
    return { kind: "REFUSED", code: "SIMULATION_CALLDATA_MISMATCH", detail: `The simulation ran on chain ${sim.chainId} and this request is for chain ${request.chainId}.` };
  }

  return { kind: "ALLOWED", authorization: auth };
}

/**
 * Phase 3: the decoded fields against the grant. Runs only AFTER the shape guard has established
 * that these bytes are a `launch()` call at the canonical factory.
 */
export function checkGrantCalldata(input: { request: SigningRequest; approvedArtRuntimeTag?: string; now?: Date }): GrantVerdict {
  const { request } = input;
  const state = checkAuthorization(input.now ? { signerAddress: request.from, now: input.now } : { signerAddress: request.from });
  if (!state.ok) return { kind: "REFUSED", code: state.reason as GrantRefusalCode, detail: state.detail };
  const auth = state.authorization;

  let params: Record<string, unknown>;
  try {
    params = decodeLaunchParamsFromCalldata(request.data);
  } catch (err) {
    return { kind: "REFUSED", code: "LAUNCH_PARAMS_FIELD_COUNT_WRONG", detail: `This calldata does not decode as a ${LAUNCH_PARAMS_FIELD_COUNT}-field LaunchParams: ${err instanceof Error ? err.message : String(err)}` };
  }

  const recipient = String(params.creatorRecipient ?? "");
  if (!recipient || getAddress(recipient as `0x${string}`) !== getAddress(auth.creatorRecipient)) {
    return { kind: "REFUSED", code: "RECIPIENT_NOT_AUTHORIZED", detail: `The calldata pays creator rights to ${recipient || "(absent)"}, and the creator authorized ${auth.creatorRecipient}. This is the field a redirected launch changes, so it is read out of the bytes and never taken on trust.` };
  }

  const antiSnipe = ANTI_SNIPE_NAMES[Number(params.antiSnipeMode ?? -1)] ?? `UNKNOWN(${String(params.antiSnipeMode)})`;
  if (!auth.allowedAntiSnipeModes.includes(antiSnipe)) {
    return { kind: "REFUSED", code: "ANTISNIPE_NOT_AUTHORIZED", detail: `The calldata elects ${antiSnipe}; the creator authorized ${auth.allowedAntiSnipeModes.join(", ")}. The election is immutable after launch.` };
  }

  const royalty = royaltyBpsOf(BigInt((params.creatorEarnings as bigint | string | undefined) ?? 0n));
  if (royalty > auth.maxRoyaltyBps) {
    return { kind: "REFUSED", code: "ROYALTY_EXCEEDS_AUTHORIZATION", detail: `The calldata sets a ${royalty} bps royalty; the creator authorized at most ${auth.maxRoyaltyBps} bps.` };
  }

  // The runtime is elected by `artMode` + `artTemplateId`; SOLIDITY_SVG is mode 0. An authorization
  // naming only SOLIDITY_SVG_V1 must refuse a JavaScript-mode launch even though no chain would
  // bind one today — the grant is the creator's statement, not a restatement of what happens to work.
  const artMode = Number(params.artMode ?? -1);
  const modeName = artMode === 0 ? "SOLIDITY_SVG_V1" : artMode === 1 ? "ONCHAIN_JAVASCRIPT_V1" : `UNKNOWN_ART_MODE(${artMode})`;
  if (!auth.allowedRuntimes.some((r) => runtimeTagAllowed(r, modeName))) {
    return { kind: "REFUSED", code: "RUNTIME_NOT_AUTHORIZED", detail: `The calldata launches on ${modeName}; the creator authorized ${auth.allowedRuntimes.join(", ")}.` };
  }

  // THE ELECTED RUNTIME, WHICH `artMode` CANNOT NAME. Mode 0 is the generic `SOLIDITY_SVG_V1` and
  // it is ALSO mode 0 for every Wave-1 engine, so the check above admits all of them equally. The
  // elected runtime lives in the top 32 bits of `artTemplateId` as a per-chain registry key, and the
  // tag it resolves to is established upstream and proven to match these bytes by the shape guard
  // immediately before this runs. A grant naming one engine must not silently authorize another.
  const electedTag = input.approvedArtRuntimeTag;
  if (electedTag && !auth.allowedRuntimes.some((r) => runtimeTagAllowed(r, electedTag))) {
    return {
      kind: "REFUSED",
      code: "RUNTIME_NOT_AUTHORIZED",
      detail: `The calldata elects ${electedTag}; the creator authorized ${auth.allowedRuntimes.join(", ")}. Every one of these renders through artMode 0, so the mode alone cannot tell them apart.`,
    };
  }

  return { kind: "ALLOWED", authorization: auth };
}
