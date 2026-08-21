// SPDX-License-Identifier: MIT
// ---------------------------------------------------------------------------------------------
// THE PUBLIC DECLARATION of launch protection, hook generations, and which launch modes a creator
// may select.
//
// WHY THIS FILE EXISTS AT ALL. This kit is documentation, and documentation about a moving protocol
// goes stale silently. It went stale before: launchpad pages described the hook mask as the retired
// RC5 value `0x1440`
// long after a second hook generation existed, and nothing failed — a reader had to notice. So the
// numbers are declared ONCE, here, and `scripts/check-launch-protection.mjs` derives the sentences
// the documentation must contain FROM these constants. Change a number and the derived sentence
// changes; the docs stop containing it; CI fails. Add a constant and the coverage rule fails until
// a documentation rule claims it.
//
// This is the public mirror of the protocol's own declaration. It carries the figures a builder
// needs and none of the reasoning that produced them: no threat model, no measured attack, no
// exploit mechanics. Those are why decisions were made; they are not builder documentation, and
// they are deliberately not exported to a public repository.
//
// TWO HOOK GENERATIONS EXIST AND ONLY ONE IS DEPLOYED. Getting this wrong in either direction is a
// truthfulness failure, so the generation record below carries `deployed` explicitly and every
// derived sentence is generation-scoped.
// ---------------------------------------------------------------------------------------------

import { LAUNCH_MODES } from "./vocabulary.js";

/** Uniswap v4 expresses LP fees in pips. 1_000_000 pips = 100%. */
export const FEE_PIPS_DENOMINATOR = 1_000_000;

/**
 * Uniswap v4's dynamic-fee sentinel, as it appears in `PoolKey.fee`.
 *
 * THIS IS NOT A FEE. It is a flag meaning "this pool's LP fee is set at runtime by its hook". A
 * PoolKey carrying it hashes to a different PoolId than the same pool described with a concrete
 * fee, which is the single likeliest integration mistake against a dynamic-fee generation.
 */
export const DYNAMIC_FEE_FLAG = 0x800000;

// ---------------------------------------------------------------------------------------------
// THE SCHEDULE.
// ---------------------------------------------------------------------------------------------

/**
 * The buy-side decay window, in seconds.
 *
 * 5,880 s = 98 minutes. NINETY-EIGHT, because the fee falls from 99% to 1% — 98 percentage points
 * — at one point per minute. It is never a "99-minute" decay; that phrasing describes a different
 * schedule belonging to a different protocol, and `PROHIBITED_DOC_PHRASES` rejects it.
 */
export const ANTI_SNIPE_WINDOW_SECONDS = 5880;

/** Buy-side LP fee at the instant the pool opens: 990_000 pips = 99%. */
export const ANTI_SNIPE_START_FEE_PIPS = 990_000;

/** Buy-side LP fee once the window has fully elapsed: 10_000 pips = 1%. */
export const ANTI_SNIPE_END_FEE_PIPS = 10_000;

/** The sell-side LP fee, flat for the whole life of the market: 10_000 pips = 1%. */
export const SELL_FEE_PIPS = 10_000;

/**
 * The quantity that actually decays, in pips: 980_000 = 98%.
 *
 * THE HOOK DOES NOT INTERPOLATE BETWEEN THE ENDPOINTS. It computes
 *
 *     fee = BASE + floor(ADDON * max(DURATION - elapsed, 0) / DURATION)
 *
 * clamped to [BASE, START]. `START - floor(span * elapsed / DURATION)` agrees at both ends and
 * differs by one pip almost everywhere between them, because the floor falls on the other side, so
 * a curve derived from the wrong form disagrees with the chain in the middle of the window — which
 * is the whole of the window a reader cares about. Declared rather than derived so the generated
 * fee curve reads it from here.
 */
export const ANTI_SNIPE_INITIAL_ADDON_PIPS = ANTI_SNIPE_START_FEE_PIPS - ANTI_SNIPE_END_FEE_PIPS;

/**
 * Whether a creator may launch with no protection at all.
 *
 * FALSE since the owner amendment of 2026-08-16. It WAS mandatory and is not now: `NONE` is a
 * selectable anti-snipe mode, and a project on it pays a flat sell-side-equal fee from the first
 * block. Anything that describes protection as un-disable-able is describing the retired rule.
 * Mirrors `docs/launchpad/protocol-facts.json -> launchProtection.protectionIsMandatory`, whose
 * own source is `launchpad/packages/launch-protection/src/schedule.js`.
 */
export const PROTECTION_IS_MANDATORY = false;

/**
 * No address is exempt from the buy-side schedule — not the creator, the platform, the deployer,
 * the protocol Safe, nor any router. The fee is a function of elapsed time alone and the hook
 * holds no allowlist.
 */
export const NO_PRIVILEGED_FEE_EXEMPTIONS = true;

/** The window is anchored to the pool's own initialization, not to a sale or a first swap. */
export const ANTI_SNIPE_WINDOW_ANCHOR = "POOL_INITIALIZATION";

/** There is no fee decay during a sale phase. The decay governs the pool a sale graduates into. */
export const ANTI_SNIPE_SALE_PHASE_DECAY = false;

/** Public duration, in whole minutes. Derived, never typed. */
export const ANTI_SNIPE_PUBLIC_DURATION_MINUTES = ANTI_SNIPE_WINDOW_SECONDS / 60;

/** @param {number} pips */
export function pipsToPercentLabel(pips) {
  const pct = (pips / FEE_PIPS_DENOMINATOR) * 100;
  return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(4))}%`;
}

// ---------------------------------------------------------------------------------------------
// HOOK GENERATIONS.
//
// TWO FIELDS, TWO QUESTIONS, AND CONFLATING THEM IS THE FAILURE THIS BLOCK EXISTS TO PREVENT.
// `deployed` asks whether hooks of that generation hold code anywhere — both generations do, and
// RC5's canary hooks are still on chain. `current` asks which generation a launch made TODAY binds,
// and exactly one generation may answer yes. Reading the second off the first is what left the kit
// answering "the live mask" with RC5's `0x1440` for as long as any RC5 hook still existed.
// ---------------------------------------------------------------------------------------------

/** @typedef {{ mask: number, deployed: boolean, current: boolean, dynamicFee: boolean, callbacks: readonly string[], lpFeeModel: string }} HookGeneration */

/** @type {Readonly<Record<string, HookGeneration>>} */
export const HOOK_GENERATIONS = Object.freeze({
  RC5: Object.freeze({
    mask: 0x1440, // the retired RC5 mask — superseded by RC6's 0x14C0, and never a current launch's
    deployed: true,
    current: false,
    dynamicFee: false,
    callbacks: Object.freeze(["afterInitialize", "afterAddLiquidity", "afterSwap"]),
    lpFeeModel: "STATIC_POOL_FEE",
  }),
  RC6: Object.freeze({
    mask: 0x14c0,
    deployed: true,
    current: true,
    dynamicFee: true,
    callbacks: Object.freeze(["afterInitialize", "afterAddLiquidity", "beforeSwap", "afterSwap"]),
    lpFeeModel: "DYNAMIC_LP_FEE_SET_IN_BEFORESWAP",
  }),
});

/**
 * The generation a creator's launch uses today: RC6, live and open on Ethereum, Base and Robinhood
 * Chain. DERIVED, not typed, so it cannot disagree with the `current` flags above.
 */
export const DEPLOYED_HOOK_GENERATION = Object.entries(HOOK_GENERATIONS).find(([, g]) => g.current)?.[0] ?? null;

/** The generation that carries launch protection. It is also the current one; see `HOOK_GENERATIONS`. */
export const LAUNCH_PROTECTION_HOOK_GENERATION = "RC6";

/** @param {number} mask */
export function maskLabel(mask) {
  return `0x${mask.toString(16).toUpperCase()}`;
}

// ---------------------------------------------------------------------------------------------
// LAUNCH MODES.
//
// The unavailable-mode reason is stated NARROWLY and in present tense. It says what the mode does
// not do. It does not call the mode insecure — its escrow holds, refunds and settles correctly —
// and it does not imply the two available modes ration allocation, because neither of them does.
// ---------------------------------------------------------------------------------------------

// `LAUNCH_MODES` is imported, never redeclared. `vocabulary.js` already publishes it, and a second
// copy is the exact failure this file exists to prevent: two lists that agree until one moves.

/** @typedef {"AVAILABLE" | "DISABLED_FOR_PUBLIC_LAUNCH"} LaunchModeAvailability */

/** @type {Readonly<Record<string, LaunchModeAvailability>>} */
export const LAUNCH_MODE_AVAILABILITY = Object.freeze({
  INSTANT_V4: "AVAILABLE",
  FIXED_PRICE_SALE_TO_V4: "DISABLED_FOR_PUBLIC_LAUNCH",
  BONDING_CURVE_SALE_TO_V4: "AVAILABLE",
});

/** The modes a creator may actually select. Derived, so a page cannot list a disabled one. */
export const LAUNCHABLE_MODES = Object.freeze(LAUNCH_MODES.filter((m) => LAUNCH_MODE_AVAILABILITY[m] === "AVAILABLE"));

/** Why a disabled mode is disabled, in the words a public surface must use. */
export const LAUNCH_MODE_UNAVAILABLE_REASON = Object.freeze({
  FIXED_PRICE_SALE_TO_V4:
    "The fixed-price sale phase does not limit how much of a sale any one buyer can take: there is no per-buyer cap, " +
    "no cooldown and no maximum per transaction. The launch-protection schedule cannot apply there, because it governs " +
    "the Uniswap v4 pool and that pool does not exist until the sale finalizes. This mode is therefore not offered.",
});

/** @param {string} mode */
export function isLaunchModeAvailable(mode) {
  return LAUNCH_MODE_AVAILABILITY[mode] === "AVAILABLE";
}

// ---------------------------------------------------------------------------------------------
// THE LIQUIDITY CLAIM — narrow on purpose.
//
// "Nobody can rug" is the sentence everyone wants and it is not one this protocol can make: RC6
// deploys upgradeable components behind a 2-of-3 Safe with no timelock, which is disclosed and
// would make a blanket claim false. What IS true is a property of deployed bytecode a reader can
// check. Quote it; do not paraphrase it wider.
// ---------------------------------------------------------------------------------------------

export const IMMUTABLE_LIQUIDITY_CLAIM =
  "Genesis liquidity is held by the immutable locker and cannot be withdrawn through the deployed locker.";

/** The limits that must travel in the same block as the claim, never a page away. */
export const IMMUTABLE_LIQUIDITY_SCOPE =
  "That is a statement about the locker's bytecode, not about every risk. Surrounding protocol components are " +
  "upgradeable by a 2-of-3 Safe with no timelock, token prices can fall to nothing, and a creator can behave badly in " +
  "ways no contract prevents.";

// ---------------------------------------------------------------------------------------------
// PHRASES NO PUBLIC PAGE MAY CARRY.
//
// Each entry is the LIE, so a negation-aware scanner can look for it and so denying one stays
// legal. Two families:
//   * overreach    — claims wider than anything the code supports.
//   * audit-status — banned in BOTH directions by owner directive; the list below says why.
// ---------------------------------------------------------------------------------------------

/**
 * OVERREACH claims. Each is a positive assertion wider than the code supports.
 *
 * Negation genuinely inverts every one of these — "these controls are not Sybil-resistant" is the
 * honest sentence, not the banned one — so a scanner may suppress a hit when a negator immediately
 * precedes the phrase. That is safe HERE and would not be safe for a retired numeric claim, which
 * is why this list is separate from the audit-status list below.
 */
export const OVERREACH_CLAIMS = Object.freeze([
  // The liquidity claim.
  "nobody can rug",
  "rug-proof",
  "rugproof",
  "cannot be rugged",
  "risk-free",
  "funds are safe",
  // What a fee schedule accomplishes.
  "guarantees fair distribution",
  "prevents bots",
  "sybil-resistant",
  "sybil resistant",
]);

/**
 * AUDIT-STATUS phrases, banned in BOTH directions and NOT negation-suppressible.
 *
 * The owner directive bans both halves. The disclaiming half invites a reader to weigh a non-fact;
 * the assuring half is worse, because an assurance with no named report behind it is simply false.
 * Public copy points at SOURCE VERIFICATION instead, which is a thing a reader can go and check.
 *
 * "Not audited" is already the negative form, and writing "it is not true that this is unaudited"
 * is not a sentence anyone reaches for honestly. Suppressing on a preceding negator here would
 * reopen the exact hole the directive closes, so these are matched literally wherever they appear.
 */
export const AUDIT_STATUS_PHRASES = Object.freeze([
  "not audited",
  "unaudited",
  "audit waived",
  "audit was waived",
  "owner accepted risk",
  "deployed under a waiver",
  "no external audit",
  "externally audited",
  "certified secure",
  "formally verified",
]);

/**
 * AUDIT CLAIMS WRITTEN AS AN ADJECTIVE, which the literal list above cannot reach.
 *
 * "audited fixed-curve-preset sale", "audited Solidity-SVG template", an "audited {FullMath}" —
 * five of these were found in shipped Solidity while the blocklist matched none of them, because a
 * literal list can only hold the noun phrases somebody already thought of. This is the shape
 * instead: `audited` immediately followed by anything that is not `by`.
 *
 * WHY IT IS NOT EVIDENCE-SUPPRESSIBLE. `audited by Firm, report at https://…` is the evidenced
 * form and is allowed — that is the `by` carve-out, and EVIDENCE_REQUIRED_PHRASES handles the
 * page-level case. But "the audited curve preset" on a page that happens to carry any link is a
 * third-party assurance about a SPECIFIC COMPONENT, borrowing credibility from a link that is
 * about something else. Removing "not audited" from a repository while leaving "audited" in it is
 * the worse of the two directions, so this half is matched as strictly as the negative half.
 */
export const AUDIT_ADJECTIVAL_CLAIM_RE = /\baudited\s+(?!by\b)\S/i;

/**
 * The wrong name for the schedule. 99 − 1 = 98 points at one point per minute, so the window is 98
 * minutes. Not negation-suppressible: there is no honest sentence containing it.
 */
export const WRONG_DURATION_PHRASES = Object.freeze(["99-minute", "99 minute"]);

/** Every phrase no public page may carry, in one list for scanners that want it flat. */
export const PROHIBITED_DOC_PHRASES = Object.freeze([
  ...OVERREACH_CLAIMS,
  ...AUDIT_STATUS_PHRASES,
  ...WRONG_DURATION_PHRASES,
]);

/** Negators that invert an {@link OVERREACH_CLAIMS} mention when they immediately precede it. */
export const OVERREACH_NEGATORS = Object.freeze(["not", "never", "no", "isn't", "aren't", "is not", "are not", "cannot be", "nor"]);

/**
 * Phrases permitted ONLY when the same file also carries matching evidence.
 *
 * "audited" is not banned outright — it is banned unbacked. A page may say it if it names a report
 * or a firm on the same page, which is exactly the evidence a reader would need anyway.
 */
export const EVIDENCE_REQUIRED_PHRASES = Object.freeze({
  audited: Object.freeze(["audit report", "audited by", "report:", "https://"]),
});
