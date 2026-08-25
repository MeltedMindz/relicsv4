import type { LaunchState } from "@relics/launch-sdk";
export declare const STATE_ORDER: readonly LaunchState[];
/** The inputs whose change can invalidate a state. */
export type Facet = "ART" | "PROJECT_CONFIG" | "BUNDLE" | "POLICY" | "CHAIN" | "QUOTE" | "METADATA" | "GAS" | "SIGNER";
export declare function stateIndex(s: LaunchState): number;
/** States invalidated by a change to `facet`, in order. */
export declare function invalidatedBy(facet: Facet): LaunchState[];
/**
 * The highest state still valid after `facet` changed.
 *
 * Never rolls back past BROADCAST: see the comment on BROADCAST above. If a run had already sent a
 * transaction, a local edit rewinds the LOCAL work and leaves the on-chain fact where it is, for
 * `resume` to reconcile against the chain.
 */
export declare function rewindFor(current: LaunchState, facet: Facet): LaunchState;
export interface TransitionCheck {
    readonly allowed: boolean;
    readonly reason: string;
}
/** Transitions are strictly one step forward along STATE_ORDER. No skipping, ever. */
export declare function canTransition(from: LaunchState, to: LaunchState): TransitionCheck;
