// SPDX-License-Identifier: MIT
// ---------------------------------------------------------------------------------------------
// THE PUBLIC DECLARATION of launch protection, hook generations, and which launch modes a creator
// may select.
//
// WHY THIS FILE EXISTS AT ALL. This kit is documentation, and documentation about a moving protocol
// goes stale silently. It went stale before: launchpad pages kept printing the retired RC5 mask
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
// WHAT THIS FILE DELIBERATELY DOES NOT HOLD. The wording a public page may not carry is NOT
// declared here. It lives in `scripts/check-launch-protection.mjs`, beside the fixtures that prove
// the scan can catch it. A blocklist has to spell out every phrasing it rejects, and this file is
// builder documentation that a reader takes claims FROM — so the two cannot share an artifact. A
// reader skimming this package must never meet a sentence that reads as an assertion when it was
// only ever an entry in a list of things nobody may write.
//
// TWO HOOK GENERATIONS EXIST AND BOTH HOLD CODE. Which one a launch made TODAY binds is a separate
// question from whether a generation exists at all, so the generation record below carries both
// fields and every derived sentence is generation-scoped.
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
 * The buy-side decay window, in seconds, for a project whose creator elects protection.
 *
 * 5,880 s = 98 minutes. NINETY-EIGHT, because the fee falls from 99% to 1% — that is 98 percentage
 * points — at one point per minute. Never name the schedule with the adjacent round number: that
 * duration belongs to a third-party router, and `scripts/check-launch-protection.mjs` rejects the
 * phrasing wherever it appears.
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
 * FALSE since the owner amendment of 2026-08-16, reaffirmed 2026-08-21. It WAS mandatory and is
 * not now: `NONE` is a selectable anti-snipe election, and a project on it pays the flat
 * sell-side-equal fee in both directions from the first block. Anything that describes protection
 * as always-on, or as something a creator cannot switch off, is describing the retired rule.
 * Mirrors `docs/launchpad/protocol-facts.json -> launchProtection.protectionIsMandatory`, whose
 * own source is `launchpad/packages/launch-protection/src/schedule.js`.
 */
export const PROTECTION_IS_MANDATORY = false;

/**
 * No address is exempt from the buy-side schedule of a project that elects it — not the creator,
 * the platform, the deployer, the protocol Safe, nor any router. The fee is a function of elapsed
 * time alone and the hook holds no allowlist.
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
// and exactly one generation may answer yes. Reading the second off the first is what left this kit
// naming the retired RC5 mask as the live one for as long as any RC5 hook still existed.
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
// The unrestricted version everyone wants is not a sentence this protocol can make: RC6 deploys
// upgradeable components behind a 2-of-3 Safe with no timelock, which is disclosed and which would
// make a blanket claim false. What IS true is a property of deployed bytecode a reader can check.
// Quote the claim below verbatim; never paraphrase it wider, and never let it travel without the
// scope sentence beside it.
// ---------------------------------------------------------------------------------------------

export const IMMUTABLE_LIQUIDITY_CLAIM =
  "Genesis liquidity is held by the immutable locker and cannot be withdrawn through the deployed locker.";

/** The limits that must travel in the same block as the claim, never a page away. */
export const IMMUTABLE_LIQUIDITY_SCOPE =
  "That is a statement about the locker's bytecode, not about every risk. Surrounding protocol components are " +
  "upgradeable by a 2-of-3 Safe with no timelock, token prices can fall to nothing, and a creator can behave badly in " +
  "ways no contract prevents.";
