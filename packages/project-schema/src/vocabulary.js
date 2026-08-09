// SPDX-License-Identifier: MIT
// The CLOSED vocabularies a bundle may draw from. Everything here is an enumeration, never a
// free-text formula and never code. A creator picks ids from these lists; the validator refuses
// anything else. This is the mechanism that keeps a bundle declarative: there is no field in
// which a sensor, a transform or a destination can be expressed as something the launchpad would
// have to execute or compile.

/** Chains the launchpad targets. PREPARED_NOT_DEPLOYED on all three; no factory exists anywhere. */
export const SUPPORTED_CHAIN_IDS = Object.freeze([1, 8453, 4663]);

export const CHAIN_LABELS = Object.freeze({
  1: "Ethereum",
  8453: "Base",
  4663: "Robinhood Chain",
});

/** Art runtimes. Mirrors the launchpad `ArtMode` enum: 0 = SOLIDITY_SVG, 1 = JAVASCRIPT. */
export const ART_RUNTIMES = Object.freeze(["SOLIDITY_SVG", "JAVASCRIPT"]);

export const ART_RUNTIME_TO_MODE = Object.freeze({ SOLIDITY_SVG: 0, JAVASCRIPT: 1 });

/**
 * Runtimes a bundle may declare TODAY. A p5-style runtime is deliberately absent: it is not an
 * approved launchpad runtime, so no template ships on it and the validator refuses a bundle that
 * names it. Adding one is a protocol decision, not a kit decision.
 */
export const APPROVED_ART_RUNTIMES = Object.freeze(["SOLIDITY_SVG", "JAVASCRIPT"]);

/** Known-but-unapproved runtime names, refused with a specific message rather than "unknown". */
export const UNAPPROVED_ART_RUNTIMES = Object.freeze(["P5", "P5JS", "PROCESSING", "THREEJS", "WEBGL", "WASM", "SHADER"]);

/** Starting market tier. Mirrors the launchpad `StartingPreset` enum. */
export const STARTING_PRESETS = Object.freeze(["LOW", "MID", "HIGH"]);
export const STARTING_PRESET_TO_INDEX = Object.freeze({ LOW: 0, MID: 1, HIGH: 2 });

/** How many whole project tokens back one active artwork. */
export const BACKING_MODELS = Object.freeze(["FULL_PARITY", "PARTIAL"]);

/** Launch method. All three end in one canonical Uniswap v4 project-token/WETH pool. */
export const LAUNCH_MODES = Object.freeze(["INSTANT_V4", "FIXED_PRICE_SALE_TO_V4", "BONDING_CURVE_SALE_TO_V4"]);

/** Bonding-curve presets that actually ship. There is no runtime curve-registration path and a
 *  bundle can never carry curve Solidity. */
export const CURVE_PRESETS = Object.freeze(["linear", "constant-product"]);

// ---------------------------------------------------------------------------------------------
// Market-to-art: SENSOR -> TRANSFORM -> DESTINATION. Field-for-field the same closed vocabulary
// the launchpad studio's market-to-art builder enforces, so a mapping authored in this kit and a
// mapping authored in the web UI are the same object with the same bounds.
// ---------------------------------------------------------------------------------------------

export const MARKET_SENSORS = Object.freeze([
  { id: "buying_pressure", label: "Buy Pressure", description: "Net buy-side flow over the sensor window." },
  { id: "selling_pressure", label: "Sell Pressure", description: "Net sell-side flow over the sensor window." },
  { id: "volume", label: "Volume", description: "Total traded volume, unsigned." },
  { id: "tick", label: "Price", description: "Where the market price sits (the pool's log-price tick)." },
  { id: "volatility", label: "Volatility", description: "Realized price variance over the window." },
  { id: "drawdown", label: "Drawdown", description: "Distance below the recent high-water mark." },
  { id: "recovery", label: "Recovery", description: "Retracement back toward the high-water mark after a drawdown." },
  { id: "liquidity", label: "Liquidity", description: "In-range liquidity depth." },
  { id: "holder_growth", label: "Holder Growth", description: "Rate of change of distinct holder count." },
  { id: "epoch", label: "Epoch", description: "Discrete time/era bucket since genesis." },
  { id: "market_seed", label: "Market Seed", description: "A fixed, genesis-derived seed — does not change with trading." },
]);

export const MARKET_TRANSFORMS = Object.freeze([
  { id: "threshold", label: "Threshold", description: "Binary on/off once the sensor crosses a value.", params: [{ key: "cutoff", label: "Cutoff", min: -1, max: 1, step: 0.01 }] },
  {
    id: "range",
    label: "Range",
    description: "Linear-map the sensor from [min,max] input to [0,1] output.",
    params: [
      { key: "inMin", label: "Input min", min: -1, max: 1, step: 0.01 },
      { key: "inMax", label: "Input max", min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    id: "clamp",
    label: "Clamp",
    description: "Hard-limit the sensor to [min,max] before use.",
    params: [
      { key: "min", label: "Min", min: 0, max: 1, step: 0.01 },
      { key: "max", label: "Max", min: 0, max: 1, step: 0.01 },
    ],
  },
  { id: "smoothing", label: "Smooth", description: "Exponential moving average over N samples.", params: [{ key: "window", label: "Window (samples)", min: 1, max: 64, step: 1 }] },
  { id: "tier", label: "Tier", description: "Quantize into discrete steps.", params: [{ key: "steps", label: "Steps", min: 2, max: 8, step: 1 }] },
  { id: "accumulation", label: "Accumulate", description: "Monotonic running total (never decreases).", params: [{ key: "cap", label: "Cap", min: 0, max: 1, step: 0.01 }] },
  { id: "decay", label: "Decay", description: "Exponential decay back toward baseline.", params: [{ key: "halfLife", label: "Half-life (epochs)", min: 1, max: 128, step: 1 }] },
  { id: "inverse", label: "Invert", description: "1 - x. Flips the sensor's direction.", params: [] },
  { id: "weighted_mix", label: "Mix", description: "Blend with the destination's current value.", params: [{ key: "weight", label: "Weight", min: 0, max: 1, step: 0.01 }] },
]);

export const ART_DESTINATIONS = Object.freeze([
  { id: "palette", label: "Palette", description: "Selects among the collection's registered palettes." },
  { id: "brightness", label: "Brightness", description: "Overall luminance of the render." },
  { id: "density", label: "Density", description: "How many generative elements are drawn." },
  { id: "scale", label: "Scale", description: "Size of generative elements." },
  { id: "symmetry", label: "Symmetry", description: "Degree of mirrored/rotational symmetry." },
  { id: "fracture", label: "Fracture", description: "Degree of visual breakage/discontinuity." },
  { id: "line_weight", label: "Line Weight", description: "Stroke thickness." },
  { id: "distortion", label: "Distortion", description: "Geometric warp applied to the base form." },
  { id: "geometry", label: "Geometry", description: "Which base geometric family is drawn." },
  { id: "scar", label: "Scar State", description: "Visible, monotonic marks." },
  { id: "animation", label: "Motion", description: "Whether/how a subtle in-SVG animation runs." },
]);

export const MARKET_SENSOR_IDS = Object.freeze(MARKET_SENSORS.map((s) => s.id));
export const MARKET_TRANSFORM_IDS = Object.freeze(MARKET_TRANSFORMS.map((t) => t.id));
export const ART_DESTINATION_IDS = Object.freeze(ART_DESTINATIONS.map((d) => d.id));

/** @param {string} id */
export function transformSpec(id) {
  return MARKET_TRANSFORMS.find((t) => t.id === id) ?? null;
}

/** Earnings: how the creator share of collected LP fees is directed. */
export const EARNINGS_MODES = Object.freeze(["SOLO", "SPLIT"]);

/**
 * Protocol constants, not creator inputs. The split is of LP fees ACTUALLY COLLECTED by the
 * project's genesis position — never of trading volume.
 */
export const FEE_SPLIT_BPS = Object.freeze({
  creator: 7500,
  platformTreasury: 1875,
  relicsBuybackReserve: 625,
});

/**
 * The buyback buys $RELICS and sends it permanently to `0x…dEaD`, so circulating supply falls.
 * $RELICS has no burn function and its `totalSupply` stays fixed at 10,000 — both halves of that
 * sentence are mandatory wherever the buyback is described.
 */
export const BUYBACK_DISCLOSURE =
  "25% of the platform's fee revenue is permanently earmarked for TWAP purchases of RELICS and permanent removal of the acquired tokens from circulation. RELICS uses entombment rather than a supply-decreasing burn: circulating supply falls, RELICS has no burn function, and totalSupply stays fixed at 10,000.";

/** Trait value distribution kinds a trait dimension may declare. */
export const TRAIT_DISTRIBUTIONS = Object.freeze(["weighted", "uniform"]);
