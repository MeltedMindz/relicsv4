// SPDX-License-Identifier: MIT
// ================================================================================================
// THE LAUNCH STATE MACHINE.
//
// Two rules, and the second is the one that matters:
//
//   1. Every transition declares its prerequisites. There is no edge from VALIDATED to BROADCAST,
//      so the proof chain cannot be skipped by calling a command out of order.
//
//   2. AN UPSTREAM MUTATION INVALIDATES EVERYTHING DOWNSTREAM OF IT. Change the art and VALIDATED
//      and everything after it is void. Change the quote and PREPARED onward is void. This is not
//      bookkeeping: a stale green receipt is worse than a missing one, because a resume trusts it.
//      The dependency below is expressed as WHAT EACH STATE DEPENDS ON, so a new state cannot be
//      added without declaring what invalidates it.
// ================================================================================================
import type { LaunchState } from "@relics/launch-sdk";

export const STATE_ORDER: readonly LaunchState[] = [
  "BRIEF_RECEIVED", "PROJECT_SCAFFOLDED", "ART_AUTHORED", "ART_PROVEN", "ART_ACCEPTED", "PROJECT_CONFIGURED",
  "VALIDATED", "EXPORTED", "CHAIN_SELECTED", "CHAIN_PREFLIGHT_PASSED", "METADATA_PUBLISHED",
  "PREPARED", "PREDICTED", "SIMULATED", "BUILT", "POLICY_APPROVED", "SIGNED", "BROADCAST",
  "CONFIRMED", "VERIFIED", "COMPLETE",
];

/** The inputs whose change can invalidate a state. */
export type Facet = "ART" | "BRIEF" | "PROJECT_CONFIG" | "BUNDLE" | "POLICY" | "CHAIN" | "QUOTE" | "METADATA" | "GAS" | "SIGNER";

/**
 * WHICH FACETS EACH STATE RESTS ON. If a facet changes, every state listing it — and everything
 * after that state — is invalidated.
 *
 * `GAS` deserves a note because the brief asked for it explicitly. Gas parameters are NOT part of
 * `LaunchParams`, so changing them does not change the calldata and does not invalidate PREPARED,
 * PREDICTED or SIMULATED. They ARE part of the `SigningRequest`, and the signer enforces a gas
 * ceiling over them, so they invalidate BUILT and everything after it. Getting this boundary wrong
 * in either direction is expensive: too wide and every gas nudge re-pins metadata; too narrow and a
 * transaction is signed with a gas limit nobody checked.
 */
const DEPENDS_ON: Record<LaunchState, readonly Facet[]> = {
  BRIEF_RECEIVED: [],
  PROJECT_SCAFFOLDED: [],
  ART_AUTHORED: ["ART"],
  ART_PROVEN: ["ART"],
  // ART_ACCEPTED RESTS ON THE ART AND ON THE BRIEF, and the brief is why it needs its own facet.
  // Brief fidelity is a GATE in the visual review — the work has to read as the thing that was
  // asked for — so a changed brief invalidates the acceptance exactly as a changed configuration
  // does. Without `BRIEF` here, retargeting the brief after acceptance would leave a green receipt
  // asserting fidelity to a document nobody reviewed against.
  ART_ACCEPTED: ["ART", "BRIEF"],
  PROJECT_CONFIGURED: ["ART", "PROJECT_CONFIG"],
  VALIDATED: ["ART", "PROJECT_CONFIG"],
  EXPORTED: ["ART", "PROJECT_CONFIG", "BUNDLE"],
  CHAIN_SELECTED: ["POLICY", "CHAIN"],
  CHAIN_PREFLIGHT_PASSED: ["POLICY", "CHAIN", "SIGNER"],
  METADATA_PUBLISHED: ["ART", "PROJECT_CONFIG", "BUNDLE", "METADATA"],
  PREPARED: ["ART", "PROJECT_CONFIG", "BUNDLE", "METADATA", "CHAIN", "QUOTE", "POLICY"],
  PREDICTED: ["ART", "PROJECT_CONFIG", "BUNDLE", "METADATA", "CHAIN", "QUOTE", "POLICY"],
  SIMULATED: ["ART", "PROJECT_CONFIG", "BUNDLE", "METADATA", "CHAIN", "QUOTE", "POLICY", "SIGNER"],
  BUILT: ["ART", "PROJECT_CONFIG", "BUNDLE", "METADATA", "CHAIN", "QUOTE", "POLICY", "SIGNER", "GAS"],
  POLICY_APPROVED: ["ART", "PROJECT_CONFIG", "BUNDLE", "METADATA", "CHAIN", "QUOTE", "POLICY", "SIGNER", "GAS"],
  SIGNED: ["ART", "PROJECT_CONFIG", "BUNDLE", "METADATA", "CHAIN", "QUOTE", "POLICY", "SIGNER", "GAS"],
  // BROADCAST ONWARD DEPEND ON NOTHING LOCAL, AND THAT IS DELIBERATE. Once bytes are on a public
  // network, no local edit can un-send them. Invalidating BROADCAST because a file changed would
  // invite a resume to send a SECOND launch — the exact duplicate this system must never produce.
  // What is on chain is settled by reading the chain, never by re-deriving it from local inputs.
  BROADCAST: [],
  CONFIRMED: [],
  VERIFIED: [],
  COMPLETE: [],
};

export function stateIndex(s: LaunchState): number {
  return STATE_ORDER.indexOf(s);
}

/** States invalidated by a change to `facet`, in order. */
export function invalidatedBy(facet: Facet): LaunchState[] {
  const first = STATE_ORDER.findIndex((s) => DEPENDS_ON[s].includes(facet));
  if (first === -1) return [];
  return STATE_ORDER.slice(first).filter((s) => DEPENDS_ON[s].length > 0 || stateIndex(s) < stateIndex("BROADCAST"));
}

/**
 * The highest state still valid after `facet` changed.
 *
 * Never rolls back past BROADCAST: see the comment on BROADCAST above. If a run had already sent a
 * transaction, a local edit rewinds the LOCAL work and leaves the on-chain fact where it is, for
 * `resume` to reconcile against the chain.
 */
export function rewindFor(current: LaunchState, facet: Facet): LaunchState {
  if (stateIndex(current) >= stateIndex("BROADCAST")) return current;
  const invalid = invalidatedBy(facet);
  if (invalid.length === 0) return current;
  const firstInvalid = stateIndex(invalid[0]!);
  if (stateIndex(current) < firstInvalid) return current;
  return STATE_ORDER[Math.max(0, firstInvalid - 1)]!;
}

export interface TransitionCheck {
  readonly allowed: boolean;
  readonly reason: string;
}

/** Transitions are strictly one step forward along STATE_ORDER. No skipping, ever. */
export function canTransition(from: LaunchState, to: LaunchState): TransitionCheck {
  const a = stateIndex(from);
  const b = stateIndex(to);
  if (b === a + 1) return { allowed: true, reason: `${from} -> ${to}` };
  if (b <= a) return { allowed: false, reason: `${to} is not after ${from}; a state machine does not move backwards except by invalidation` };
  const skipped = STATE_ORDER.slice(a + 1, b);
  return {
    allowed: false,
    reason: `${from} -> ${to} would skip ${skipped.join(", ")}. Each of those is a proof the next step depends on; jumping VALIDATED -> BROADCAST is exactly the shortcut this refuses.`,
  };
}
