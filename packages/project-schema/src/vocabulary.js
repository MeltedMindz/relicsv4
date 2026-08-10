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
 * The stable identifier each runtime is bound under in a project's on-chain art binding. The name
 * carries a version because a runtime's RENDERING CONTRACT can change without the enum changing:
 * a second on-chain JavaScript runtime would be `ONCHAIN_JAVASCRIPT_V2` with its own id, and an
 * existing collection would stay bound to V1 forever. That is the property the binding exists to
 * guarantee — a project's art cannot be re-pointed at a different renderer after the fact.
 */
export const ART_RUNTIME_IDS = Object.freeze({
  SOLIDITY_SVG: "SOLIDITY_SVG_V1",
  JAVASCRIPT: "ONCHAIN_JAVASCRIPT_V1",
});

/**
 * The `uint16` version each runtime reports about ITSELF, mirroring `IArtRuntimeV1.runtimeVersion()`
 * and the `runtimeVersion` field of the on-chain `ArtBindingInputV1`. Distinct from
 * `RUNTIME_VERSION` at the top of the schema, which names the JavaScript render CONTRACT a
 * generator was written against: this one identifies the deployed renderer's own revision, and it
 * is what a project's binding pins.
 */
export const ART_RUNTIME_VERSIONS = Object.freeze({ SOLIDITY_SVG: 1, JAVASCRIPT: 1 });

/**
 * Runtimes a bundle may declare TODAY. A p5-style runtime is deliberately absent: it is not an
 * approved launchpad runtime, so no template ships on it and the validator refuses a bundle that
 * names it. Adding one is a protocol decision, not a kit decision.
 */
export const APPROVED_ART_RUNTIMES = Object.freeze(["SOLIDITY_SVG", "JAVASCRIPT"]);

/**
 * Runtimes the protocol will actually BIND AND RENDER — the set a template may be presented as
 * launchable on.
 *
 * "Approved" and "launchable" are not the same question and must not be collapsed. Approved means
 * the format accepts the name. Launchable means a deployed collection will read a project's own
 * art through that runtime. A runtime can be approved and not yet launchable, and during a release
 * where one is gated off, a template on it is still valid, still previewable, still worth shipping
 * — it simply cannot be launched yet, and the kit says so rather than quietly implying otherwise.
 *
 * THIS LIST IS THE ONE PLACE THAT DECIDES. `relics templates` marks it, `validate` warns on it,
 * and the monorepo's runtime-parity check reads the protocol's own enum and gate and fails if this
 * list claims more than the protocol accepts. Gating a runtime off is a one-line edit here.
 *
 * JAVASCRIPT IS GATED OFF IN THIS RELEASE, and the kit says so rather than implying otherwise.
 * The protocol refuses it in three independent places — `ProjectCollection.bindArt` reverts
 * `ArtModeNotAvailable` for any mode that is not `SOLIDITY_SVG_V1`, `LaunchpadFactory.wireArt`
 * reverts unless the mode is `SOLIDITY_SVG_V1`, and `ArtRuntimeRegistry.modeAvailable` is `pure`
 * and answers true for `SOLIDITY_SVG_V1` alone, so a JavaScript runtime cannot even be REGISTERED.
 * The reason is stated in that registry: an on-chain JavaScript runtime needs a content-addressed
 * generator plus its dependencies, an `animation_url` that reconstructs the real project, the SAME
 * runtime executing in the studio sandbox, and an `image` that is a deterministic representative
 * render from that same code, config, seed and state. This release proves none of that leg, so the
 * mode is refused rather than shipped half-built.
 *
 * The JavaScript templates STAY. They are valid bundles, they validate, they preview, and they
 * export — they simply cannot be launched yet, and every surface that shows them marks that. A
 * template on a gated runtime is MARKED, never deleted and never presented as launchable.
 */
export const LAUNCHABLE_ART_RUNTIMES = Object.freeze(["SOLIDITY_SVG"]);

/** Approved but not currently launchable — preview and authoring work, launching does not. */
export const PREVIEW_ONLY_ART_RUNTIMES = Object.freeze(APPROVED_ART_RUNTIMES.filter((r) => !LAUNCHABLE_ART_RUNTIMES.includes(r)));

/** Known-but-unapproved runtime names, refused with a specific message rather than "unknown". */
export const UNAPPROVED_ART_RUNTIMES = Object.freeze(["P5", "P5JS", "PROCESSING", "THREEJS", "WEBGL", "WASM", "SHADER"]);

/** Starting market tier. Mirrors the launchpad `StartingPreset` enum. */
export const STARTING_PRESETS = Object.freeze(["LOW", "MID", "HIGH"]);
export const STARTING_PRESET_TO_INDEX = Object.freeze({ LOW: 0, MID: 1, HIGH: 2 });

/** How many whole project tokens back one active artwork. */
export const BACKING_MODELS = Object.freeze(["FULL_PARITY", "PARTIAL"]);

/** Launch method. All three end in one canonical Uniswap v4 pool pairing the project token with
 *  the market's QUOTE ASSET (see QUOTE_ASSET_REQUEST_MODES below). */
export const LAUNCH_MODES = Object.freeze(["INSTANT_V4", "FIXED_PRICE_SALE_TO_V4", "BONDING_CURVE_SALE_TO_V4"]);

// ---------------------------------------------------------------------------------------------
// QUOTE ASSET — the asset a project is priced and traded in.
//
// A BUNDLE REQUESTS A QUOTE ASSET. IT NEVER APPROVES ONE. This is the whole design constraint:
// the manifest carries a REQUEST that an importer must resolve against the launchpad's CURRENT
// registry, at import time, on the importing chain. There is no field here — and there must never
// be one — in which a bundle can assert that a token is approved, vetted, low-risk, or convertible.
// A bundle that names an asset the registry does not currently enable imports as a DRAFT with
// launch readiness BLOCKED, and the creator picks another approved asset. That is the only
// outcome; a bundle cannot widen the set of assets the platform accepts.
//
// Multi-quote is a Robinhood Chain (4663) capability. On Ethereum and Base the registry contains
// one asset — that chain's WETH — so a bundle requesting anything else there resolves to BLOCKED
// for exactly the same reason and by exactly the same code path.
// ---------------------------------------------------------------------------------------------

/**
 * How a bundle NAMES the quote asset it would like.
 *
 *   DEFAULT  "whatever the importing chain's default is." The portable choice: a bundle that says
 *            DEFAULT imports cleanly on every chain, because every chain has a default.
 *   ADDRESS  an exact address the importer MUST re-resolve against the current registry. The
 *            address is a request for a specific asset, not a claim about it.
 */
export const QUOTE_ASSET_REQUEST_MODES = Object.freeze(["DEFAULT", "ADDRESS"]);

/**
 * The KIND a bundle expects its requested address to be. Purely a cross-check: if the importer
 * resolves the address and the registry says it is a different kind than the bundle expected, the
 * bundle was built against a different world and the mismatch is surfaced rather than ignored.
 * The registry's answer always wins — this field can only ever cause a REFUSAL, never an approval.
 */
export const QUOTE_ASSET_KINDS = Object.freeze(["NATIVE_WETH", "STABLE", "STOCK_TOKEN", "ECOSYSTEM_TOKEN"]);

/**
 * Which asset(s) the creator's share of collected LP fees is denominated in.
 *
 *   DUAL_ASSET  both sides of the pool: the project token AND the quote asset.
 *   QUOTE_ONLY  the quote asset only; the project-token side is converted before it is claimable.
 *
 * Also a REQUEST: QUOTE_ONLY requires a conversion route the platform has actually proven, which
 * is a property of the registry at import time, not of the bundle.
 */
export const CREATOR_LP_FEE_ASSET_MODES = Object.freeze(["DUAL_ASSET", "QUOTE_ONLY"]);

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
 *
 * RE-EXPORTED, NOT RESTATED. `src/economics.js` is the one place these numbers are declared; this
 * line exists only so importers that already reach for the vocabulary keep resolving. Adding a
 * literal here would recreate exactly the two-places-one-number defect the economics module closes.
 */
export { FEE_SPLIT_BPS, BUYBACK_DISCLOSURE } from "./economics.js";

/** Trait value distribution kinds a trait dimension may declare. */
export const TRAIT_DISTRIBUTIONS = Object.freeze(["weighted", "uniform"]);
