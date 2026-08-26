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
export function checkAuthorization(opts: { signerAddress?: Address; now?: Date }): AuthorizationState {
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
  if (auth.launchesUsed >= auth.launchesAllowed) {
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
 * Called only after a signature is produced. Recording the plan hash means a resumed run that
 * re-signs THE SAME launch is recognised rather than counted twice — the duplicate-launch guard and
 * the single-use grant have to agree, or a crash between broadcast and receipt would burn the
 * creator's only authorization and strand a launch that actually succeeded.
 */
export function consumeAuthorization(launchPlanHash: Hex): Authorization {
  const auth = readAuthorization();
  if (!auth) throw new Error("consumeAuthorization: no authorization on disk");
  if (auth.consumedLaunchPlanHashes.includes(launchPlanHash)) return auth; // same launch, not a second one
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
