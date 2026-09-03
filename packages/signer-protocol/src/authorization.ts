// SPDX-License-Identifier: MIT
// ================================================================================================
// THE AUTHORIZATION GRANT — what a human actually agreed to, held by the SIGNER.
//
// 4.1.0's policy said what a launch may look like. It could not say "and only ONCE", "and only for
// the next day", or "and I have changed my mind". Those are properties of a GRANT, not of a
// transaction shape, and they have to live where the key lives: an agent that holds its own
// expiry can let it lapse and keep signing. The signer owns this file; nothing else writes it.
//
// THE DEFAULT IS ONE LAUNCH. A creator who says yes once has said yes to one project, not to an
// unbounded stream of them — and the difference only matters on the day something goes wrong,
// which is exactly when an unbounded grant is worst.
//
// THE GRANT HAS A LIFECYCLE AND ALL THREE PARTS OF IT HAVE TO EXIST FOR ANY OF IT TO MEAN ANYTHING.
// It is CHECKED (`checkAuthorization`), it is SPENT (`consumeAuthorization`), and a spend is
// idempotent on the launch that caused it. Shipping the first without the second is not a partial
// implementation of a single-use grant — it is an unlimited grant with a single-use description,
// and it is worse than no grant at all because a reader is told a bound exists.
//
// A COUNTER SET BY HAND IN A FIXTURE IS NOT THIS LIFECYCLE. The control that covered
// `AUTHORIZATION_CONSUMED` wrote `launchesUsed: 1` into the grant file directly, so it proved the
// CHECK reads the field and said nothing about whether anything ever writes it. It scored green
// against a state production could not reach. Exercise the lifecycle: sign, then sign again.
// ================================================================================================
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Address, Hex } from "viem";

/** Everything the signer keeps lives here — never in the repo, never in a project. */
export function relicsHome(): string {
  return process.env.RELICS_HOME ?? join(homedir(), ".relics");
}
export function authorizationPath(): string {
  return join(relicsHome(), "authorization.json");
}

export type AuthorizationMode = "SINGLE_LAUNCH" | "MULTI_LAUNCH";
export type AuthorizationPreset = "BUILD_ONLY" | "SAFE_AUTONOMOUS" | "CUSTOM";

export interface Authorization {
  readonly version: 1;
  readonly preset: AuthorizationPreset;
  readonly mode: AuthorizationMode;
  /** Granted at, ISO-8601 UTC. */
  readonly grantedAt: string;
  /** ISO-8601 UTC, or null for a grant the creator explicitly chose not to expire. */
  readonly expiresAt: string | null;
  /** How many launches this grant permits, and how many it has already spent. */
  readonly launchesAllowed: number;
  readonly launchesUsed: number;
  /** Set when the creator revokes. A revoked grant is kept, not deleted — see `revoke`. */
  readonly revokedAt: string | null;
  readonly signerAddress: Address;
  readonly creatorRecipient: Address;
  readonly allowedChains: readonly number[];
  readonly allowedRuntimes: readonly string[];
  readonly allowedQuoteAssets: "AUTO" | readonly string[];
  readonly allowedAntiSnipeModes: readonly string[];
  readonly maxRoyaltyBps: number;
  /** THE bound that matters: gasLimit * maxFeePerGas must not exceed this. */
  readonly maxTotalGasCostWei: string;
  readonly maxNativeSpendWei: string;
  readonly allowBroadcast: boolean;
  /** keccak of the policy this grant was issued against; a changed policy invalidates the grant. */
  readonly policyHash: Hex;
  /** Launches already performed under this grant, for the audit trail and duplicate refusal. */
  readonly consumedLaunchPlanHashes: readonly Hex[];
}

export type AuthorizationState =
  | { readonly ok: true; readonly authorization: Authorization }
  | { readonly ok: false; readonly reason: AuthorizationProblem; readonly detail: string; readonly authorization: Authorization | null };

export type AuthorizationProblem =
  | "NO_AUTHORIZATION"
  | "AUTHORIZATION_EXPIRED"
  | "AUTHORIZATION_CONSUMED"
  | "AUTHORIZATION_REVOKED"
  | "AUTHORIZATION_UNREADABLE"
  | "AUTHORIZATION_NOT_FOR_THIS_SIGNER";

/** Raised when the grant cannot be spent. Never caught into a signature; see `index.ts`. */
export class AuthorizationSpendError extends Error {
  readonly reason: "NO_AUTHORIZATION" | "AUTHORIZATION_CONSUMED";
  constructor(reason: "NO_AUTHORIZATION" | "AUTHORIZATION_CONSUMED", detail: string) {
    super(detail);
    this.name = "AuthorizationSpendError";
    this.reason = reason;
  }
}

/** Has this exact launch plan already spent a slot on this grant? Hex compared as VALUE, not text. */
function alreadySpentOnThisLaunch(auth: Authorization, launchPlanHash?: Hex): boolean {
  if (!launchPlanHash) return false;
  const wanted = launchPlanHash.toLowerCase();
  return auth.consumedLaunchPlanHashes.some((h) => String(h).toLowerCase() === wanted);
}

export function readAuthorization(): Authorization | null {
  const p = authorizationPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Authorization;
  } catch {
    return null;
  }
}

/** Write atomically and 0600 — a grant is not a secret, but it is authority and must not be racy. */
export function writeAuthorization(auth: Authorization): void {
  const p = authorizationPath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, p);
  chmodSync(p, 0o600);
}

/**
 * Is this grant usable RIGHT NOW, for THIS signer?
 *
 * `now` is injected so the expiry check is testable without waiting a day, and so nothing here
 * depends on a clock the caller could not control in a test.
 */
export function checkAuthorization(opts: { signerAddress?: Address; launchPlanHash?: Hex; now?: Date }): AuthorizationState {
  const auth = readAuthorization();
  if (!auth) {
    return { ok: false, reason: "NO_AUTHORIZATION", authorization: null, detail: "No autonomous authorization exists. The creator must run `npm run kit -- agent setup` and choose an authorization preset. An AI agent cannot grant this to itself." };
  }
  if (auth.version !== 1) {
    return { ok: false, reason: "AUTHORIZATION_UNREADABLE", authorization: null, detail: `authorization.json is version ${(auth as { version?: unknown }).version}, which this signer does not understand. Re-run \`agent setup\`.` };
  }
  if (auth.revokedAt) {
    return { ok: false, reason: "AUTHORIZATION_REVOKED", authorization: auth, detail: `This authorization was revoked at ${auth.revokedAt}. The signer will refuse every launch under it. The creator must run \`npm run kit -- agent setup\` to grant a new one.` };
  }
  const now = opts.now ?? new Date();
  if (auth.expiresAt && new Date(auth.expiresAt) <= now) {
    return { ok: false, reason: "AUTHORIZATION_EXPIRED", authorization: auth, detail: `This authorization expired at ${auth.expiresAt}. Autonomous authority is deliberately time-bounded; the creator must run \`npm run kit -- agent setup\` to grant a new one.` };
  }
  // A SPENT GRANT STILL COVERS THE LAUNCH IT WAS SPENT ON, AND NOTHING ELSE.
  //
  // Without this the single-use rule and the no-double-launch rule contradict each other: a crash
  // between broadcast and receipt would burn the creator's only authorization and strand a launch
  // that actually succeeded, so a resumed run could neither finish nor start over. Re-signing the
  // SAME `launchPlanHash` is the same launch; anything else is a second one.
  if (!alreadySpentOnThisLaunch(auth, opts.launchPlanHash) && auth.launchesUsed >= auth.launchesAllowed) {
    return { ok: false, reason: "AUTHORIZATION_CONSUMED", authorization: auth, detail: `This authorization permitted ${auth.launchesAllowed} launch${auth.launchesAllowed === 1 ? "" : "es"} and ${auth.launchesUsed} ${auth.launchesUsed === 1 ? "has" : "have"} been used. It is spent. A creator who agreed to one launch has not agreed to a second one.` };
  }
  if (opts.signerAddress && auth.signerAddress.toLowerCase() !== opts.signerAddress.toLowerCase()) {
    return { ok: false, reason: "AUTHORIZATION_NOT_FOR_THIS_SIGNER", authorization: auth, detail: `This authorization was granted to ${auth.signerAddress} and the signer presenting it is ${opts.signerAddress}. A grant is bound to the key it was given for.` };
  }
  return { ok: true, authorization: auth };
}

/**
 * Spend one launch from the grant, recording WHICH launch spent it.
 *
 * CALLED BEFORE THE KEY IS ASKED TO SIGN, not after. Until 2026-09-03 this function had ZERO call
 * sites: it was defined, exported, documented and unreachable, `launchesUsed` was only ever written
 * as 0, and `AUTHORIZATION_CONSUMED` therefore could not occur in shipped code. A grant declaring
 * `launchesAllowed: 1` signed five repeat requests and then a second, different project. The
 * sentence "someone who agreed to one launch has not agreed to a second one" was false for as long
 * as that was true.
 *
 * THE ORDER IS DELIBERATE AND IT IS THE FAIL-CLOSED ONE. Spending after the signature returns means
 * a process killed in between hands back a signed transaction against a grant that still reads
 * unspent. Spending first means a signature that then fails to be produced has still cost a slot —
 * and that costs the creator a re-authorization, which is the cheap direction. Re-signing the SAME
 * `launchPlanHash` costs nothing either way, because this is idempotent on it.
 *
 * Recording the plan hash is what lets the duplicate-launch guard and the single-use grant agree: a
 * crash between broadcast and receipt must not burn the creator's only authorization and strand a
 * launch that actually succeeded.
 */
export function consumeAuthorization(launchPlanHash: Hex): Authorization {
  const auth = readAuthorization();
  if (!auth) throw new AuthorizationSpendError("NO_AUTHORIZATION", "consumeAuthorization: no authorization on disk");
  // Same launch, not a second one. Compared as a VALUE — `includes` on the raw strings made the
  // idempotence depend on hex casing, so a resumed run whose plan hash came back checksummed
  // differently would have spent a second slot.
  if (alreadySpentOnThisLaunch(auth, launchPlanHash)) return auth;
  // THIS IS NOT REACHABLE THROUGH THE GUARD, WHICH IS WHY IT THROWS RATHER THAN CLAMPING.
  // `checkAuthorization` refuses a spent grant before anything reaches here, so arriving with one
  // means the spend and the check disagree — and a spend that quietly writes `launchesUsed` past
  // `launchesAllowed` would turn that disagreement into an unbounded grant.
  if (auth.launchesUsed >= auth.launchesAllowed) {
    throw new AuthorizationSpendError(
      "AUTHORIZATION_CONSUMED",
      `consumeAuthorization: this grant permitted ${auth.launchesAllowed} launch(es) and ${auth.launchesUsed} have been used; ${launchPlanHash} is not one of them.`,
    );
  }
  const next: Authorization = { ...auth, launchesUsed: auth.launchesUsed + 1, consumedLaunchPlanHashes: [...auth.consumedLaunchPlanHashes, launchPlanHash] };
  writeAuthorization(next);
  return next;
}

/** Revoke. The record is KEPT rather than deleted so `agent ready` can say WHY it is refusing. */
export function revokeAuthorization(now = new Date()): Authorization | null {
  const auth = readAuthorization();
  if (!auth) return null;
  const next: Authorization = { ...auth, revokedAt: now.toISOString() };
  writeAuthorization(next);
  return next;
}

/** A stable fingerprint of the grant's AUTHORITY fields, so widening is detectable. */
export function authorizationFingerprint(auth: Authorization): string {
  const authority = {
    mode: auth.mode, expiresAt: auth.expiresAt, launchesAllowed: auth.launchesAllowed,
    signerAddress: auth.signerAddress.toLowerCase(), creatorRecipient: auth.creatorRecipient.toLowerCase(),
    allowedChains: [...auth.allowedChains].sort(), allowedRuntimes: [...auth.allowedRuntimes].sort(),
    allowedQuoteAssets: auth.allowedQuoteAssets === "AUTO" ? "AUTO" : [...auth.allowedQuoteAssets].sort(),
    allowedAntiSnipeModes: [...auth.allowedAntiSnipeModes].sort(), maxRoyaltyBps: auth.maxRoyaltyBps,
    maxTotalGasCostWei: auth.maxTotalGasCostWei, maxNativeSpendWei: auth.maxNativeSpendWei,
    allowBroadcast: auth.allowBroadcast, policyHash: auth.policyHash,
  };
  return createHash("sha256").update(JSON.stringify(authority)).digest("hex");
}
