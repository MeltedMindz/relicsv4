// SPDX-License-Identifier: MIT
// ================================================================================================
// THE PACKED CREATOR-EARNINGS ELECTION — the SDK's half of `LaunchParams.creatorEarnings`.
//
// ONE ENCODER, MIRRORING ONE DECODER. The chain's decoder is
// `CreatorEarningsPolicy.decodeElection` in `src/earnings/CreatorEarnings.sol`; this is the only
// place off chain that is allowed to produce the word it reads. Two implementations of a bit layout
// is exactly how a rate ends up in the mode's byte, and a launch is the one transaction in this
// system with no second chance.
//
// LAYOUT — bit 0 is the least significant bit of the word.
//
//     [  7:  0]  mode           0 NONE, 1 OPTIONAL, 2 ENFORCED
//     [ 23:  8]  royaltyBps     0 .. 1000
//     [ 39: 24]  policyVersion  0 .. LATEST_POLICY_VERSION; 0 means "expressed no preference"
//     [255: 40]  RESERVED — MUST BE ZERO
//
// The reserved bits are REFUSED on chain, not masked: a word with anything above bit 39 reverts
// `MalformedEarningsElection` and takes the whole launch with it. So this module refuses to build
// one rather than producing calldata that is guaranteed to revert.
//
// THE VALIDATOR ADDRESS IS NOT IN HERE, AND CANNOT BE. A creator names a POLICY VERSION; the
// address, the validation selector, the call mode and the security policy all resolve on chain from
// `chainId` + `CreatorEarningsPolicy` + that version. There is no shape of this word that lets a
// caller name a validator.
// ================================================================================================

/** Mirrors `CreatorEarningsMode` in `src/earnings/CreatorEarnings.sol`. Order is load-bearing. */
export const CreatorEarningsMode = {
  NONE: 0,
  OPTIONAL: 1,
  ENFORCED: 2,
} as const;
export type CreatorEarningsModeValue = (typeof CreatorEarningsMode)[keyof typeof CreatorEarningsMode];

/** Mirrors `CreatorEarningsPolicy.MAX_ROYALTY_BPS`. */
export const MAX_ROYALTY_BPS = 1_000;
/** Mirrors `CreatorEarningsPolicy.LATEST_POLICY_VERSION`. */
export const LATEST_POLICY_VERSION = 3;

const BPS_SHIFT = 8n;
const POLICY_VERSION_SHIFT = 24n;
const RESERVED_SHIFT = 40n;

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
export const NO_CREATOR_EARNINGS: CreatorEarningsElection = { mode: CreatorEarningsMode.NONE, royaltyBps: 0 };

export class CreatorEarningsElectionError extends Error {}

/** Every reason `election` cannot be encoded, in the same order the chain would refuse them. */
export function creatorEarningsProblems(election: CreatorEarningsElection): string[] {
  const problems: string[] = [];
  const { mode, royaltyBps } = election;
  const policyVersion = election.policyVersion ?? 0;

  if (mode !== 0 && mode !== 1 && mode !== 2) {
    problems.push(`creatorEarnings.mode ${String(mode)} is not a CreatorEarningsMode (NONE=0, OPTIONAL=1, ENFORCED=2)`);
  }
  if (!Number.isInteger(royaltyBps) || royaltyBps < 0 || royaltyBps > 0xffff) {
    problems.push(`creatorEarnings.royaltyBps ${String(royaltyBps)} is not a uint16`);
  }
  if (!Number.isInteger(policyVersion) || policyVersion < 0 || policyVersion > 0xffff) {
    problems.push(`creatorEarnings.policyVersion ${String(policyVersion)} is not a uint16`);
  }
  if (problems.length > 0) return problems;

  if (mode === CreatorEarningsMode.NONE) {
    if (royaltyBps !== 0) problems.push("creatorEarnings: NONE must carry royaltyBps 0");
    if (policyVersion !== 0) problems.push("creatorEarnings: NONE must carry no policy version");
    return problems;
  }
  if (royaltyBps === 0 || royaltyBps > MAX_ROYALTY_BPS) {
    problems.push(`creatorEarnings.royaltyBps ${royaltyBps} is outside 1..${MAX_ROYALTY_BPS}`);
  }
  if (mode === CreatorEarningsMode.OPTIONAL && policyVersion !== 0) {
    // OPTIONAL never validates transfers, so a policy version is meaningless and the chain refuses
    // it rather than ignoring it — which is what stops it reading as enforcement.
    problems.push("creatorEarnings: OPTIONAL must carry no policy version");
  }
  if (mode === CreatorEarningsMode.ENFORCED && policyVersion > LATEST_POLICY_VERSION) {
    problems.push(`creatorEarnings.policyVersion ${policyVersion} is above LATEST_POLICY_VERSION (${LATEST_POLICY_VERSION})`);
  }
  return problems;
}

/** Pack an election into the single word `LaunchParams.creatorEarnings` carries. */
export function packCreatorEarnings(election: CreatorEarningsElection): bigint {
  const problems = creatorEarningsProblems(election);
  if (problems.length > 0) throw new CreatorEarningsElectionError(problems.join("; "));
  return (
    BigInt(election.mode) |
    (BigInt(election.royaltyBps) << BPS_SHIFT) |
    (BigInt(election.policyVersion ?? 0) << POLICY_VERSION_SHIFT)
  );
}

/** The inverse, so a built params object can be read back without re-deriving the shifts. */
export function unpackCreatorEarnings(packed: bigint): CreatorEarningsElection {
  if (packed >> RESERVED_SHIFT !== 0n) {
    throw new CreatorEarningsElectionError(`creatorEarnings ${packed} sets a RESERVED bit; the chain refuses it`);
  }
  const mode = Number(packed & 0xffn);
  if (mode !== 0 && mode !== 1 && mode !== 2) {
    throw new CreatorEarningsElectionError(`creatorEarnings ${packed} carries an unknown mode ${mode}`);
  }
  return {
    mode: mode as CreatorEarningsModeValue,
    royaltyBps: Number((packed >> BPS_SHIFT) & 0xffffn),
    policyVersion: Number((packed >> POLICY_VERSION_SHIFT) & 0xffffn),
  };
}
