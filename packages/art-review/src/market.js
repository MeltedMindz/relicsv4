// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MARKET FIXTURES A REVIEW IS CONDUCTED AGAINST.
//
// A launched project's art is a function of (identity, creator config, market state). Reviewing it
// at ONE market state reviews a third of the work — and the third that is easiest to get right.
// Every claim of the form "this fractures under drawdown" is a claim about a DIFFERENCE between
// two of these, so the review renders the same seeds at all three and looks at them side by side.
//
// THESE VECTORS ARE COPIED FIELD FOR FIELD FROM THE HARNESS THAT DREW THE PUBLISHED WAVE-1 SHEETS
// (`ContactSheetBase.neutral/stress/recovery`). That is deliberate and it is the only reason a
// render produced here is comparable with the committed contact sheets and with
// `docs/assets/onchain/provenance.json`. `schemaVersion` and `complete` are left at their ZERO
// values because the harness never set them: "improving" them would render a different request
// than the goldens this package is checked against, and the resulting mismatch would look like a
// runtime change rather than like a fixture edit.
//
// SATURATED IS NOT IN THE REVIEW RING, AND THAT IS NOT AN OVERSIGHT. The three states here are the
// ones the published perceptual census measures pairwise, so a delta computed here is comparable
// with `packages/template-catalog/measurements/STATE-DISTINCTION.json`. A fourth state would be a
// fourth number nobody has a floor for.
// ================================================================================================

/** The base state: a project that has traded, drawn down a little, and partly recovered. */
export function neutralState() {
  return {
    normalizedTick: 1000,
    athNormalizedTick: 1200,
    drawdownTicks: 200,
    maxDrawdownTicks: 400,
    recoveryTicks: 200,
    volatilityTickMovement: 8000n,
    volumeTier: 4,
    epoch: 1,
    stressTier: 1,
    organicBuyVolume: 0n,
    organicSellVolume: 0n,
    organicQuoteVolume: 40000000000000000000n,
    organicProjectVolume: 0n,
    netQuoteFlow: 0n,
    trackedLiquidityUnits: 0n,
    observedActiveLiquidity: 1000000000000000000n,
    observationSequence: 120n,
    fragmentation: 60,
    quoteDecimals: 18,
    historyCommitment: "0x0000000000000000000000000000000000000000000000000000000000000000",
    schemaVersion: 0,
    complete: false,
  };
}

/** Deep drawdown, no recovery, liquidity thinned, volatility high. */
export function stressState() {
  return {
    ...neutralState(),
    drawdownTicks: 9000,
    maxDrawdownTicks: 9000,
    recoveryTicks: 0,
    volatilityTickMovement: 120000n,
    stressTier: 7,
    normalizedTick: -3000,
    observedActiveLiquidity: 200000000000000000n,
  };
}

/** The climb back out of that drawdown: high recovery, deeper volume history, thicker liquidity. */
export function recoveryState() {
  return {
    ...stressState(),
    drawdownTicks: 800,
    recoveryTicks: 8200,
    normalizedTick: 1100,
    volumeTier: 7,
    epoch: 2,
    observedActiveLiquidity: 3000000000000000000n,
  };
}

/** The review ring, in the order a panel is read. */
export const MARKET_STATES = Object.freeze(["neutral", "stress", "recovery"]);

export function marketState(name) {
  if (name === "neutral") return neutralState();
  if (name === "stress") return stressState();
  if (name === "recovery") return recoveryState();
  throw new Error(`marketState: ${JSON.stringify(name)} is not one of ${MARKET_STATES.join(", ")}`);
}

/**
 * The twelve seeds the published sheets were drawn on: `101 + 37i`.
 *
 * THE REVIEW RING AND THE COLLECTION SWEEP ARE DIFFERENT POPULATIONS AND MUST STAY SO. Twelve
 * seeds is what a person can actually look at on one sheet; it is nowhere near enough to say
 * anything about a collection of thousands. `collectionSeeds` below is the sweep, and the
 * objective battery uses IT — never this — for duplicate and blank detection.
 */
export const REVIEW_SEEDS = Object.freeze(Array.from({ length: 12 }, (_, i) => 101 + i * 37));

/** The population the objective collection tests run over. Deterministic, and not the review ring. */
export function collectionSeeds(count = 100) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`collectionSeeds: ${count} is not a positive integer`);
  return Array.from({ length: count }, (_, i) => 1 + i * 613);
}
