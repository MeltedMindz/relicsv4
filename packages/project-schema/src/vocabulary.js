// SPDX-License-Identifier: MIT
// The CLOSED vocabularies a bundle may draw from. Everything here is an enumeration, never a
// free-text formula and never code. A creator picks ids from these lists; the validator refuses
// anything else. This is the mechanism that keeps a bundle declarative: there is no field in
// which a sensor, a transform or a destination can be expressed as something the launchpad would
// have to execute or compile.

/**
 * Chains the bundle format understands. RC5 platform contracts are deployed on 1 / 8453 / 4663
 * but remain PREPARED, so public creator launches are still closed. Chain 56 stays in the schema
 * vocabulary for compatibility with existing drafts and future deployment work, but this release
 * marks BNB Smart Chain as deferred in `deployments.js`.
 */
export const SUPPORTED_CHAIN_IDS = Object.freeze([1, 8453, 4663, 56]);

export const CHAIN_LABELS = Object.freeze({
  1: "Ethereum",
  8453: "Base",
  4663: "Robinhood Chain",
  56: "BNB Smart Chain",
});

/**
 * THE SETTLEMENT TOKEN IS NOT ALWAYS CALLED WETH, and nothing here may guess that it is.
 *
 * Three of the four chains wrap Ether, so `?? "WETH"` was a default that happened to be right
 * everywhere it was ever evaluated. On BNB Smart Chain it is wrong: the native asset is BNB and
 * the wrapped form is WBNB. A default that is right until it is silently wrong is worse than no
 * default, so there is none — `wrappedNativeSymbolFor` REFUSES an unknown chain rather than
 * returning a plausible string, and every public surface takes the symbol from here.
 *
 * `buybackRouteState` is stated per chain rather than inferred from the symbol:
 *
 *   IDENTITY_WETH   the chain's settlement asset already IS the buyback's terminal asset, so
 *                   there is nothing to convert.
 *   ROUTE_UNPROVEN  no route from this chain's settlement asset to the terminal asset has been
 *                   proven BY THIS REPO. Weaker than "none exists", and the only claim we own.
 *
 * BNB is ROUTE_UNPROVEN, NOT IDENTITY_WETH. WBNB is not WETH, so the buy-and-entomb half stays
 * WBNB-denominated until an approved route exists — the ordinary
 * `BUYBACK_ALLOCATED_AWAITING_ROUTE` state. Claiming IDENTITY_WETH for BNB would assert a
 * conversion that does not exist. It does not touch creator fees, and it must never gate
 * admission (see QUOTE_ADMISSION_REQUIRES_PROVEN_WETH_ROUTE in economics.js).
 *
 * `creatorEarningsModes` is the NFT SECONDARY-EARNINGS models a collection may actually be
 * launched with on that chain — a different number entirely from the project market's LP fee
 * split, and never to be shown beside it. It is stated per chain because ENFORCED is the one mode
 * whose availability is not ours to decide:
 *
 *   NONE / OPTIONAL  always available, on every chain, unconditionally. OPTIONAL is ERC-2981, a
 *                    declaration a marketplace MAY honour. It depends on no marketplace
 *                    integration, so no chain fact can take it away.
 *   ENFORCED         requires BOTH a vetted, codehash-pinned transfer validator on that chain AND
 *                    a marketplace that will honour a restricted order there. Listed only where
 *                    both are true.
 *
 * BNB Smart Chain (56) omits ENFORCED because OpenSea carries no NFT listings or offers on that
 * chain at all — it removed them in 2023, BNB is absent from OpenSea's current compatible-chains
 * article, and the OpenSea API `chain` enum has no BSC value. Robinhood Chain (4663) omits it for
 * a different reason: OpenSea DOES carry NFT orders there, but no per-chain validator codehash has
 * been vetted and pinned, and adding one is a deliberate owner decision, not an inference.
 *
 * Live validator BYTECODE exists at the canonical addresses on both 56 and 4663 and means nothing
 * here: Limit Break's v5 deployment model is permissionless CREATE2 to identical addresses on any
 * EVM chain, so its presence is a property of CREATE2 rather than a statement about support.
 */
export const CHAIN_PROFILES = Object.freeze({
  1: Object.freeze({ label: "Ethereum", nativeSymbol: "ETH", wrappedNativeSymbol: "WETH", canonicalQuoteSymbols: Object.freeze(["WETH"]), buybackRouteState: "IDENTITY_WETH", creatorEarningsModes: Object.freeze(["NONE", "OPTIONAL", "ENFORCED"]) }),
  8453: Object.freeze({ label: "Base", nativeSymbol: "ETH", wrappedNativeSymbol: "WETH", canonicalQuoteSymbols: Object.freeze(["WETH"]), buybackRouteState: "IDENTITY_WETH", creatorEarningsModes: Object.freeze(["NONE", "OPTIONAL", "ENFORCED"]) }),
  4663: Object.freeze({ label: "Robinhood Chain", nativeSymbol: "ETH", wrappedNativeSymbol: "WETH", canonicalQuoteSymbols: Object.freeze(["WETH"]), buybackRouteState: "IDENTITY_WETH", creatorEarningsModes: Object.freeze(["NONE", "OPTIONAL"]) }),
  // BNB is schema-compatible but deferred in RC5. If it is deployed later, WBNB remains the native
  // wrapped quote in the chain profile; widening beyond that should be a deliberate registry edit.
  56: Object.freeze({ label: "BNB Smart Chain", nativeSymbol: "BNB", wrappedNativeSymbol: "WBNB", canonicalQuoteSymbols: Object.freeze(["WBNB"]), buybackRouteState: "ROUTE_UNPROVEN", creatorEarningsModes: Object.freeze(["NONE", "OPTIONAL"]) }),
});

/**
 * Every NFT secondary creator-earnings model that exists, in the order a creator meets them.
 * A chain profile lists a SUBSET of these; it never introduces one.
 */
export const CREATOR_EARNINGS_MODES = Object.freeze(["NONE", "OPTIONAL", "ENFORCED"]);

/**
 * The earnings models launchable on `chainId`. THROWS on an unknown chain, for the same reason
 * `wrappedNativeSymbolFor` does: a caller that cannot name the chain cannot be told what is
 * available on it, and the plausible-looking answer here is the full list — the one answer that
 * could put a creator into a mode their chain will refuse at launch.
 * @param {number} chainId
 */
export function creatorEarningsModesFor(chainId) {
  const profile = CHAIN_PROFILES[chainId];
  if (!profile) throw new Error(`creatorEarningsModesFor(${chainId}): unknown chain — there is no default earnings capability to fall back to`);
  return profile.creatorEarningsModes;
}

/**
 * Whether ENFORCED earnings may be OFFERED on `chainId`. Note the verb: this answers "may a
 * creator select it", never "are earnings being enforced". The second question is a marketplace
 * fact no chain profile can answer, and only a live marketplace observation ever licenses it.
 * @param {number} chainId
 */
export function enforcedEarningsAvailableOn(chainId) {
  return creatorEarningsModesFor(chainId).includes("ENFORCED");
}

/** @param {number} chainId */
export function chainProfile(chainId) {
  return CHAIN_PROFILES[chainId] ?? null;
}

/**
 * The chain's wrapped-native symbol. THROWS on an unknown chain rather than returning a default:
 * a caller that cannot name the chain cannot name its settlement asset either, and printing
 * "WETH" at that point is how a BNB market ends up labelled in the wrong token.
 * @param {number} chainId
 */
export function wrappedNativeSymbolFor(chainId) {
  const profile = CHAIN_PROFILES[chainId];
  if (!profile) throw new Error(`wrappedNativeSymbolFor(${chainId}): unknown chain — there is no default settlement symbol to fall back to`);
  return profile.wrappedNativeSymbol;
}

/** The chain's native (unwrapped) symbol. Same refusal for the same reason. @param {number} chainId */
export function nativeSymbolFor(chainId) {
  const profile = CHAIN_PROFILES[chainId];
  if (!profile) throw new Error(`nativeSymbolFor(${chainId}): unknown chain — there is no default native symbol to fall back to`);
  return profile.nativeSymbol;
}

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

// ---------------------------------------------------------------------------------------------
// BURN POLICY — chosen at launch, IMMUTABLE afterwards, default NONE.
//
// THE THING TO NOT GET WRONG HERE IS THE SUBJECT. A project token launched with HOLDER_BURN
// genuinely burns: `totalSupply` decreases and `Transfer(account, address(0))` is emitted. The
// RELICS token does NOT, has never had a burn path, and its `totalSupply` is fixed at 10,000 —
// the flagship's mechanism is buy-and-entomb, which moves tokens out of circulation without
// destroying them. Both statements are true at once, and a creator reading about their own
// burnable token must not conclude that RELICS burns.
//
// The default is NONE because a supply that cannot decrease is the weaker claim and the one a
// creator can always fall back on. Burning is opt-in, per project, forever.
// ---------------------------------------------------------------------------------------------

/** Mirrors the launchpad `ProjectToken.BurnPolicy` enum, index for index. */
export const BURN_POLICIES = Object.freeze(["NONE", "HOLDER_BURN", "HOLDER_AND_ALLOWANCE_BURN"]);
export const BURN_POLICY_TO_INDEX = Object.freeze({ NONE: 0, HOLDER_BURN: 1, HOLDER_AND_ALLOWANCE_BURN: 2 });

/** The policy a bundle gets when it says nothing. Never inferred from anything else. */
export const DEFAULT_BURN_POLICY = "NONE";

/**
 * Creator-facing copy, one source so the kit, the studio and any test read the same sentence.
 * `immutabilityWarning` is not decoration: the policy cannot be changed after launch, and a
 * creator must confirm they understand that before a burning policy can be selected.
 */
export const BURN_POLICY_CARDS = Object.freeze([
  Object.freeze({
    policy: "NONE",
    title: "NONE",
    summary: "Supply can never decrease.",
    detail: "No burn entry point exists on the token. totalSupply is fixed at launch for the life of the project.",
  }),
  Object.freeze({
    policy: "HOLDER_BURN",
    title: "HOLDER BURN",
    summary: "Any holder may permanently destroy their own tokens.",
    detail:
      "A holder can burn from their own balance and nobody else's. Burning is irreversible, it lowers totalSupply, and it emits Transfer(account, address(0)).",
  }),
  Object.freeze({
    policy: "HOLDER_AND_ALLOWANCE_BURN",
    title: "HOLDER + ALLOWANCE",
    summary:
      "Holders may burn directly or authorize another contract to burn within an allowance. Supports burn-to-activate, burn-to-mint, and buyback-and-burn integrations.",
    detail:
      "Everything HOLDER BURN allows, plus burning against an ERC-20 allowance so a contract a holder has approved can burn on their behalf, up to that allowance and no further.",
  }),
]);

/** The confirmation a creator must give before a burning policy can be selected. */
export const BURN_POLICY_IMMUTABILITY_ACK =
  "I understand the burn policy is written into the token at launch and can never be changed.";

/**
 * The flagship contrast, stated once so no page has to improvise it. Required reading next to any
 * burn-policy UI: the sentence a creator is most likely to get wrong is not about their own token.
 */
export const RELICS_BURN_CONTRAST_COPY =
  "This setting describes your project token. It does not describe the original RELICS token, which is non-burnable: RELICS uses buy-and-entomb, its supply is removed from circulation rather than destroyed, and its totalSupply stays fixed at 10,000.";

/** True when the policy actually permits supply to decrease. */
export function burnPolicyAllowsBurning(policy) {
  return policy === "HOLDER_BURN" || policy === "HOLDER_AND_ALLOWANCE_BURN";
}

// ---------------------------------------------------------------------------------------------
// ANTI-SNIPE STRATEGY — what a launch actually does about being sniped at open.
//
// NOT SYBIL-PROOF, AND THE COPY MUST NOT SAY IT IS. A wallet cap and progressive liquidity both
// raise the cost and the clumsiness of taking an outsized share at open. Neither identifies a
// person: an attacker splits across addresses for the price of gas, and any claim that these
// "prevent bots", "guarantee fair distribution" or "stop snipers" is false. Say what they do —
// they shape the first minutes of the curve — and let a creator decide with that.
// ---------------------------------------------------------------------------------------------

export const ANTI_SNIPE_STRATEGIES = Object.freeze([
  "INSTANT_V4",
  "FIXED_PRICE_FAIR_LAUNCH",
  "BONDING_CURVE_TO_V4",
  "PROGRESSIVE_LIQUIDITY",
]);

/**
 * How each strategy relates to the `launchMode` a bundle already declares.
 *
 * NOTHING IS RENAMED. `LAUNCH_MODES` keeps its published values, because renaming an enum member
 * invalidates every bundle in the corpus and there is no migration that can recover a value the
 * old name no longer describes. `PROGRESSIVE_LIQUIDITY` is the one strategy with no existing
 * launch mode, so it maps to null until the launch mode that carries it ships.
 */
export const ANTI_SNIPE_STRATEGY_TO_LAUNCH_MODE = Object.freeze({
  INSTANT_V4: "INSTANT_V4",
  FIXED_PRICE_FAIR_LAUNCH: "FIXED_PRICE_SALE_TO_V4",
  BONDING_CURVE_TO_V4: "BONDING_CURVE_SALE_TO_V4",
  PROGRESSIVE_LIQUIDITY: null,
});

/** Honest, per-strategy copy. Each says what the mechanism DOES; none claims it identifies anyone. */
export const ANTI_SNIPE_STRATEGY_COPY = Object.freeze({
  INSTANT_V4:
    "The pool opens and trading begins immediately. Nothing constrains the first buy: whoever transacts first, at whatever size the pool allows, gets that fill.",
  FIXED_PRICE_FAIR_LAUNCH:
    "Everyone buys at one published price until the sale closes, so being early does not get a better price. It does not limit how much one buyer can take.",
  BONDING_CURVE_TO_V4:
    "Price rises along a published curve as the sale fills, so buying more costs more. Being first is still an advantage — it is a cheaper price, not an excluded one.",
  PROGRESSIVE_LIQUIDITY:
    "Liquidity is released in steps rather than all at once, so a single large buy at open moves price further and fills worse. It shapes the first minutes of the curve; it does not decide who is buying.",
});

/**
 * The disclaimer that must accompany any wallet cap or progressive-liquidity control.
 * Stated as a constant so it cannot quietly soften into a marketing claim.
 */
export const ANTI_SNIPE_NOT_SYBIL_PROOF_COPY =
  "These controls are not Sybil-resistant. They limit what one ADDRESS can do, and an attacker can split across as many addresses as they like for the cost of gas. Treat them as shaping the opening curve, never as proof that buyers are distinct people.";

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
export const QUOTE_ASSET_KINDS = Object.freeze(["NATIVE_WRAPPED", "NATIVE_WETH", "STABLE", "STOCK_TOKEN", "ECOSYSTEM_TOKEN"]);

/**
 * `NATIVE_WRAPPED` is the canonical name for "this chain's wrapped native asset" — WETH on
 * Ethereum, Base and Robinhood; WBNB on BNB. `NATIVE_WETH` is the DEPRECATED ALIAS it replaces,
 * still accepted so no existing bundle is invalidated, and mapping to the same kind rather than a
 * second one. The old name asserted a token symbol in a field that means a ROLE.
 */
export const DEPRECATED_QUOTE_ASSET_KIND_ALIASES = Object.freeze({ NATIVE_WETH: "NATIVE_WRAPPED" });

/** Canonicalises a bundle's declared kind. @param {string} kind */
export function canonicalQuoteAssetKind(kind) {
  return DEPRECATED_QUOTE_ASSET_KIND_ALIASES[kind] ?? kind;
}

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
