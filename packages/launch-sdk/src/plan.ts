// SPDX-License-Identifier: MIT
// ================================================================================================
// DETERMINISTIC CHAIN SELECTION.
//
// Two stages, and the order is the point:
//
//   1. ADMISSION — a chain is a CANDIDATE only if live evidence proves every requirement. This
//      stage has no scores and no preferences; it is a filter, and a chain that fails any part of
//      it is recorded with a machine-readable reason rather than silently dropped.
//   2. SCORING — the surviving candidates are ordered by an explicit, documented rule.
//
// THE OUTPUT IS REPRODUCIBLE FROM THE INPUTS. No randomness, no clock, no "the agent felt this one
// was better". Given the same policy and the same chain readings, this returns the same chain, and
// the receipt records every candidate, every rejection reason and every score so the choice can be
// re-derived by someone who was not there.
// ================================================================================================
import type { Address, PublicClient } from "viem";
import type { AgentPolicy, Evidence } from "./contracts.js";
import { getChainCapability, type ChainCapability } from "./capabilities.js";
import { getChainProfile, makeClient } from "./chains.js";

export interface ChainCandidate {
  readonly chainId: number;
  readonly label: string;
  readonly admitted: boolean;
  /** Machine-readable, one per failed requirement. Empty when admitted. */
  readonly rejections: readonly { code: string; detail: string }[];
  readonly evidence: Evidence;
  readonly score: number | null;
  readonly gasPriceWei: bigint | null;
  readonly signerBalanceWei: bigint | null;
  readonly capability: ChainCapability | null;
}

export interface ChainSelection {
  readonly selected: ChainCandidate | null;
  readonly candidates: readonly ChainCandidate[];
  readonly strategy: AgentPolicy["chainSelection"];
  /** The exact rule applied, in words, so a receipt explains itself without this source. */
  readonly rule: string;
  readonly blockedReason: string | null;
}

const RULES: Record<AgentPolicy["chainSelection"], string> = {
  PREFERRED_ORDER: "Among admitted chains, the one appearing earliest in policy.allowedChains wins. Gas is not consulted.",
  LOWEST_ESTIMATED_GAS: "Among admitted chains, the lowest live gas price wins. Ties break on the earlier position in policy.allowedChains.",
  PREFERRED_THEN_GAS: "Among admitted chains, the earliest in policy.allowedChains wins unless another admitted chain's gas price is strictly less than half of it, in which case the cheapest wins.",
};

/**
 * Admit and score every allowed chain.
 *
 * `signerAddress` is optional ONLY so that a BUILD_ONLY plan can be produced without a signer. When
 * the goal is LAUNCH it is required, because "can this signer pay for this?" is one of the
 * admission requirements and a plan that skipped it would be admitting a chain it cannot use.
 */
export async function selectChain(policy: AgentPolicy, opts: { signerAddress?: Address; requiredRuntimeTag: string; minimumGasBudgetWei?: bigint }): Promise<ChainSelection> {
  const candidates: ChainCandidate[] = [];

  for (const chainId of policy.allowedChains) {
    const rejections: { code: string; detail: string }[] = [];
    const profile = getChainProfile(chainId);
    if (!profile) {
      candidates.push({ chainId, label: String(chainId), admitted: false, rejections: [{ code: "CHAIN_NOT_IN_PUBLIC_RECORD", detail: `chain ${chainId} is not in the public deployment record` }], evidence: "REFUTED", score: null, gasPriceWei: null, signerBalanceWei: null, capability: null });
      continue;
    }

    const cap = await getChainCapability(chainId, { requiredRuntimeTag: opts.requiredRuntimeTag });

    // ---- ADMISSION. Every requirement is a live finding; a doc cannot satisfy one. -------------
    for (const f of cap.findings) {
      if (f.evidence === "REFUTED") rejections.push({ code: `REFUTED:${f.id}`, detail: f.detail });
      else if (f.evidence === "UNKNOWN") rejections.push({ code: `UNKNOWN:${f.id}`, detail: `${f.detail}${f.unreadReason ? ` (${f.unreadReason})` : ""}` });
    }

    // ---- signer support + funding --------------------------------------------------------------
    let signerBalanceWei: bigint | null = null;
    if (opts.signerAddress) {
      const made = makeClient(profile);
      if (!made) {
        rejections.push({ code: "UNKNOWN:rpc.configured", detail: `no RPC endpoint for chain ${chainId}` });
      } else {
        try {
          signerBalanceWei = await made.client.getBalance({ address: opts.signerAddress });
          const needed = opts.minimumGasBudgetWei ?? estimateGasBudget(cap.gasPriceWei, policy.maxTransactionGas);
          if (needed !== null && signerBalanceWei < needed) {
            rejections.push({ code: "SIGNER_UNDERFUNDED", detail: `signer holds ${signerBalanceWei} wei of ${profile.nativeSymbol}; a launch at the live gas price needs about ${needed} wei` });
          }
        } catch (err) {
          // A BALANCE THAT COULD NOT BE READ IS NOT A BALANCE OF ZERO. Reporting it as underfunded
          // would tell a creator to send money they may already have.
          rejections.push({ code: "UNKNOWN:signer.balance", detail: `could not read the signer's ${profile.nativeSymbol} balance: ${err instanceof Error ? err.message : String(err)}` });
        }
      }
    } else if (policy.goal === "LAUNCH") {
      rejections.push({ code: "NO_SIGNER", detail: "goal is LAUNCH but no signer address was supplied, so this chain's funding could not be established" });
    }

    // ---- gas price within policy ---------------------------------------------------------------
    if (cap.gasPriceWei !== null && cap.gasPriceWei > policy.maxGasPriceWei) {
      rejections.push({ code: "GAS_PRICE_ABOVE_POLICY", detail: `live gas price ${cap.gasPriceWei} wei exceeds policy.maxGasPriceWei ${policy.maxGasPriceWei}` });
    }

    candidates.push({ chainId, label: cap.label, admitted: rejections.length === 0, rejections, evidence: cap.launchable, score: null, gasPriceWei: cap.gasPriceWei, signerBalanceWei, capability: cap });
  }

  const admitted = candidates.filter((c) => c.admitted);
  if (admitted.length === 0) {
    return { selected: null, candidates, strategy: policy.chainSelection, rule: RULES[policy.chainSelection], blockedReason: "no allowed chain passed admission; see each candidate's rejections" };
  }

  const order = new Map(policy.allowedChains.map((id, i) => [id, i]));
  const scored = admitted.map((c) => ({ ...c, score: scoreOf(c, policy, order, admitted) }));
  // Highest score wins; ties break on policy order, which is itself total, so the result is a
  // strict ordering with no dependence on array iteration order.
  scored.sort((a, b) => (b.score! - a.score!) || ((order.get(a.chainId) ?? 0) - (order.get(b.chainId) ?? 0)));

  const merged = candidates.map((c) => scored.find((s) => s.chainId === c.chainId) ?? c);
  return { selected: scored[0] ?? null, candidates: merged, strategy: policy.chainSelection, rule: RULES[policy.chainSelection], blockedReason: null };
}

/** A rough native budget for one launch at the live gas price. Used only for the funding check. */
function estimateGasBudget(gasPriceWei: bigint | null, maxTransactionGas: bigint): bigint | null {
  if (gasPriceWei === null) return null;
  return gasPriceWei * maxTransactionGas;
}

function scoreOf(c: ChainCandidate, policy: AgentPolicy, order: Map<number, number>, admitted: readonly ChainCandidate[]): number {
  const position = order.get(c.chainId) ?? 0;
  switch (policy.chainSelection) {
    case "PREFERRED_ORDER":
      return 1_000_000 - position;
    case "LOWEST_ESTIMATED_GAS": {
      if (c.gasPriceWei === null) return -1; // unreadable gas cannot outrank a readable one
      // Inverted so cheaper is higher, and clamped so a near-zero L2 price cannot overflow.
      return Number(1_000_000_000_000n / (c.gasPriceWei + 1n));
    }
    case "PREFERRED_THEN_GAS": {
      const preferred = admitted.reduce((best, x) => ((order.get(x.chainId) ?? 0) < (order.get(best.chainId) ?? 0) ? x : best), admitted[0]!);
      const half = preferred.gasPriceWei !== null ? preferred.gasPriceWei / 2n : null;
      const dramaticallyCheaper = half !== null && c.gasPriceWei !== null && c.gasPriceWei < half;
      return (c.chainId === preferred.chainId ? 500_000 : 0) + (dramaticallyCheaper ? 400_000 : 0) + (1_000 - position);
    }
  }
}
