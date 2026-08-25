/** Mirrors `CreatorEarningsMode` in `src/earnings/CreatorEarnings.sol`. Order is load-bearing. */
export declare const CreatorEarningsMode: {
    readonly NONE: 0;
    readonly OPTIONAL: 1;
    readonly ENFORCED: 2;
};
export type CreatorEarningsModeValue = (typeof CreatorEarningsMode)[keyof typeof CreatorEarningsMode];
/** Mirrors `CreatorEarningsPolicy.MAX_ROYALTY_BPS`. */
export declare const MAX_ROYALTY_BPS = 1000;
/** Mirrors `CreatorEarningsPolicy.LATEST_POLICY_VERSION`. */
export declare const LATEST_POLICY_VERSION = 3;
export interface CreatorEarningsElection {
    mode: CreatorEarningsModeValue;
    /** Basis points of a secondary sale. Must be 0 for NONE, and 1..1000 otherwise. */
    royaltyBps: number;
    /**
     * The validator policy version, ENFORCED only. 0 means "no preference", which the chain resolves
     * to `DEFAULT_POLICY_VERSION` — and which Robinhood Chain (4663) then REFUSES, because version 1's
     * validator holds no code there. On 4663 an ENFORCED election must name version 3 explicitly.
     */
    policyVersion?: number;
}
/** The election a creator who says nothing gets: NONE, no rate, no policy. Encodes to `0n`. */
export declare const NO_CREATOR_EARNINGS: CreatorEarningsElection;
export declare class CreatorEarningsElectionError extends Error {
}
/** Every reason `election` cannot be encoded, in the same order the chain would refuse them. */
export declare function creatorEarningsProblems(election: CreatorEarningsElection): string[];
/** Pack an election into the single word `LaunchParams.creatorEarnings` carries. */
export declare function packCreatorEarnings(election: CreatorEarningsElection): bigint;
/** The inverse, so a built params object can be read back without re-deriving the shifts. */
export declare function unpackCreatorEarnings(packed: bigint): CreatorEarningsElection;
