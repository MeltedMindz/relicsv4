// SPDX-License-Identifier: MIT
//
// THE ONE PLACE THE LAUNCHPAD'S FEE ALLOCATION IS STATED.
//
// Every off-chain surface — this package, the creator CLI, the launchpad SDK, the indexer, the
// studio, the public documentation — derives its numbers from here. Nothing downstream may write
// `2500`, `5000`, `1250`, `"12.50%"` or a prose percentage of its own: a value asserted in one
// place and restated in five is how a retired number survives a change to it. If you find yourself
// typing a bps literal outside this file, that is the defect.
//
// These are the OFF-CHAIN MIRROR of compile-time constants in the launchpad contracts
// (`Constants.PLATFORM_SHARE_BPS`, `ImmutableEconomicKernel.RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE`,
// `MultiQuoteEconomicKernel`'s copy of the same). The contracts are the authority; this file
// exists so that the many things which merely DESCRIBE them cannot disagree with each other.
//
// TERMINOLOGY IS PART OF THE CONTRACT HERE — see BUY_AND_ENTOMB below. RELICS acquired by the
// buyback are sent to the canonical entombment address. Spendable and circulating supply fall;
// `totalSupply` does NOT fall and no ERC-20 burn event occurs, because the deployed RELICS token
// has no supply-decreasing burn path. Do not write "burn"/"burned" for this mechanism.

/** Basis-point denominator. 10_000 bps = 100%. */
export const BPS_DENOMINATOR = 10_000;

// ---------------------------------------------------------------------------------------------
// THE FOUR DECLARED CONSTANTS. Everything else on this page is derived from these.
// ---------------------------------------------------------------------------------------------

/** Creator's share of COLLECTED LP fees. Untouched by the RC3 amendment. */
export const CREATOR_SHARE_BPS = 7_500;

/** Platform's share of COLLECTED LP fees. Untouched by the RC3 amendment. */
export const PLATFORM_SHARE_BPS = BPS_DENOMINATOR - CREATOR_SHARE_BPS;

/**
 * Share of the PLATFORM's own slice allocated to RELICS buy-and-entomb.
 *
 * RC3 amendment (2026-08-10): 2_500 -> 5_000. The creator's 7_500 and the platform's 2_500 did not
 * move; this is entirely a re-division of the platform's own share.
 */
export const RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE = 5_000;

/** Remainder of the platform slice, retained by the protocol treasury. Derived, never declared. */
export const PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE = BPS_DENOMINATOR - RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE;

// ---------------------------------------------------------------------------------------------
// DERIVED VIEWS
// ---------------------------------------------------------------------------------------------

/** @param {number} outerBps @param {number} innerBps */
function nest(outerBps, innerBps) {
  return (outerBps * innerBps) / BPS_DENOMINATOR;
}

/**
 * NOMINAL allocation of collected LP fees, in bps of the collected total.
 *
 * NOMINAL is the operative word. These are the ratios the kernels apply; the settled figures differ
 * by floor-division rounding, and on the platform side by conversion cost — see
 * PLATFORM_SETTLEMENT_INVARIANT.
 */
export const NOMINAL_ALLOCATION_BPS = Object.freeze({
  creator: CREATOR_SHARE_BPS,
  relicsBuybackReserve: nest(PLATFORM_SHARE_BPS, RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE),
  platformTreasury: nest(PLATFORM_SHARE_BPS, PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE),
});

/**
 * Historical export name for the same three numbers, kept so existing importers keep resolving.
 * DERIVED — it can never disagree with NOMINAL_ALLOCATION_BPS.
 */
export const FEE_SPLIT_BPS = NOMINAL_ALLOCATION_BPS;

/**
 * Renders bps as a percent string with exactly two decimals ("7500" -> "75.00%"). Every percentage
 * a UI or a document shows should come from this function rather than from a typed literal.
 * @param {number} bps
 */
export function bpsToPercentString(bps) {
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * The same value with insignificant trailing zeros trimmed ("5000" -> "50%", "1250" -> "12.5%").
 * For prose, where "50.00%" reads like a measurement rather than a ratio. Tables keep the
 * two-decimal form so columns align.
 * @param {number} bps
 */
export function bpsToProsePercentString(bps) {
  return `${String(bpsToPercentString(bps)).replace(/\.?0+%$/, "%")}`;
}

/** The same three shares, pre-rendered. Derived; no literal percentage exists in this package. */
export const NOMINAL_ALLOCATION_PERCENT = Object.freeze({
  creator: bpsToPercentString(NOMINAL_ALLOCATION_BPS.creator),
  relicsBuybackReserve: bpsToPercentString(NOMINAL_ALLOCATION_BPS.relicsBuybackReserve),
  platformTreasury: bpsToPercentString(NOMINAL_ALLOCATION_BPS.platformTreasury),
});

/** Buyback and retained shares expressed against the PLATFORM slice, not against the collected
 *  total — the two framings are constantly confused, so both are published explicitly. */
export const PLATFORM_SUBDIVISION_PERCENT = Object.freeze({
  relicsBuybackReserve: bpsToPercentString(RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE),
  platformTreasury: bpsToPercentString(PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE),
});

/** Prose forms of the same two, for sentences rather than tables. */
export const PLATFORM_SUBDIVISION_PROSE = Object.freeze({
  relicsBuybackReserve: bpsToProsePercentString(RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE),
  platformTreasury: bpsToProsePercentString(PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE),
});

// ---------------------------------------------------------------------------------------------
// MECHANISM AND TERMINOLOGY
// ---------------------------------------------------------------------------------------------

/**
 * The mechanism identifier. BUY_AND_ENTOMB, never BURN.
 *
 * Purchased RELICS are transferred to ENTOMBMENT_ADDRESS, which nobody controls. Consequences,
 * all three of which must be stated together wherever the mechanism is described:
 *   - spendable and circulating supply DECREASE;
 *   - `totalSupply` DOES NOT DECREASE — it is fixed at 10,000e18;
 *   - NO ERC-20 burn event occurs; the deployed token has no supply-decreasing burn path.
 */
export const BUYBACK_MECHANISM = "BUY_AND_ENTOMB";

/** The canonical entombment address. Not a protocol-controlled account; not a burn opcode. */
export const ENTOMBMENT_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/**
 * The technical sentence. Note what it does NOT say: not "of all trading fees", not "of creator
 * fees", not "of the pool fee", not a Uniswap protocol fee, and not a burn. It is a share of the
 * launchpad's own NET SETTLED platform-fee revenue.
 */
export const BUYBACK_DISCLOSURE =
  `${PLATFORM_SUBDIVISION_PROSE.relicsBuybackReserve} of the launchpad's net platform-fee revenue is allocated to RELICS ` +
  `buy-and-entomb: the reserve buys RELICS on the canonical pool and sends every acquired token to the ` +
  `entombment address, permanently removing it from circulation. RELICS uses entombment rather than a ` +
  `supply-decreasing burn — circulating supply falls, no burn event occurs, RELICS has no burn function, ` +
  `and totalSupply stays fixed at 10,000.`;

/** Shorthand a public surface may use. Same claim, fewer clauses; still never says "burn". */
export const BUYBACK_DISCLOSURE_SHORT =
  `${PLATFORM_SUBDIVISION_PROSE.relicsBuybackReserve} of launchpad protocol revenue buys RELICS and permanently removes it from circulation.`;

/** The note that must accompany any short form. */
export const BUYBACK_TECHNICAL_NOTE =
  "RELICS uses entombment rather than a supply-decreasing burn: circulating supply falls, totalSupply does not, and no ERC-20 burn event occurs.";

/**
 * WHAT IS AND IS NOT PROMISED.
 *
 * The nominal percentages above are ratios applied to COLLECTED LP FEES, and on the platform side
 * the exact invariant holds on NET SETTLED PLATFORM WETH — after conversion fees, slippage and
 * deterministic floor-division rounding. Nobody may promise that exactly
 * NOMINAL_ALLOCATION_PERCENT.relicsBuybackReserve of gross trading volume reaches the buyback
 * reserve; volume is not fee revenue, and settlement is not free.
 *
 * Conversion costs fall ONLY on the platform's own share. A creator's entitlement is never charged
 * for the platform's route to WETH.
 */
export const PLATFORM_SETTLEMENT_INVARIANT =
  `Of NET SETTLED platform WETH, ${PLATFORM_SUBDIVISION_PROSE.relicsBuybackReserve} is allocated to the RELICS ` +
  `buy-and-entomb reserve and ${PLATFORM_SUBDIVISION_PROSE.platformTreasury} to retained treasury, after conversion ` +
  `fees, slippage and rounding. Conversion costs fall only on the platform share, never on the creator's.`;

/**
 * THE RETIRED-CLAIM REGISTER. Published as data so that every repository's stale-claim gate scans
 * for the same things, and so adding a retired claim is a one-line change in one file rather than
 * an edit to each scanner.
 *
 * `pattern` is a JavaScript regular-expression SOURCE string (case-insensitive, global is applied
 * by the scanner). `counter` is the environment-style name a gate must report a count under — the
 * three RC3 counters are contractual and are checked by name.
 *
 * A historical document may still assert a retired claim, but ONLY behind an explicit supersession
 * header; see SUPERSESSION_MARKERS.
 */
export const RETIRED_ALLOCATION_CLAIMS = Object.freeze([
  Object.freeze({
    id: "BUYBACK_25_PERCENT_OF_PLATFORM",
    counter: "ACTIVE_STALE_BUYBACK_25_PERCENT_OF_PLATFORM_CLAIMS",
    pattern: "(?:RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE\\s*=\\s*2[_,]?500)|(?:\\b25\\s*%[^.\\n]{0,40}\\bplatform(?:'s)?\\s+(?:fee\\s+)?(?:share|revenue))|(?:\\bplatform(?:'s)?\\s+(?:fee\\s+)?(?:share|revenue)[^.\\n]{0,40}\\b25\\s*%)",
    description: "the buyback taking 25% of the platform share (RC3 moved it to 50%)",
  }),
  Object.freeze({
    id: "EFFECTIVE_6_25_PERCENT",
    counter: "ACTIVE_STALE_EFFECTIVE_6_25_PERCENT_CLAIMS",
    pattern: "\\b6[.,]25\\s*%|\\b625\\b\\s*(?:bps|basis points)|relicsBuybackReserve\\s*:\\s*625\\b",
    description: "the retired 6.25%-of-collected-fees buyback figure (now 12.50%)",
  }),
  Object.freeze({
    id: "RETAINED_18_75_PERCENT",
    counter: "ACTIVE_STALE_RETAINED_18_75_PERCENT_CLAIMS",
    pattern: "\\b18[.,]75\\s*%|\\b1875\\b\\s*(?:bps|basis points)|platformTreasury\\s*:\\s*1875\\b",
    description: "the retired 18.75%-of-collected-fees retained figure (now 12.50%)",
  }),
]);

/**
 * A file asserting a retired claim is TOLERATED only if one of these markers appears in it. The
 * marker has to be explicit: "historical" in a filename is not a supersession header.
 */
export const SUPERSESSION_MARKERS = Object.freeze([
  "SUPERSEDED_HISTORICAL_DO_NOT_USE_FOR_LAUNCH",
  "SUPERSEDED_BY_RC3_PLATFORM_ALLOCATION_AMENDMENT",
]);

/** Phrases that are FALSE about this allocation, published so gates and reviewers share one list. */
export const FORBIDDEN_ALLOCATION_PHRASINGS = Object.freeze([
  "50% of all trading fees",
  "50% of creator fees",
  "50% of the pool fee",
  "50% of trading volume",
  "a Uniswap protocol fee",
  "burns RELICS",
  "burned RELICS",
  "total supply decreases",
]);

// ---------------------------------------------------------------------------------------------
// SETTLEMENT VOCABULARY — the closed lists the SDK and the indexer both draw from
// ---------------------------------------------------------------------------------------------

/**
 * How a creator's share of collected LP fees is denominated. IMMUTABLE per project, chosen at
 * launch.
 *
 *  - DUAL_ASSET — the creator accrues in BOTH the project token and the market's selected quote
 *    asset, and claims both. Nothing is converted on their behalf.
 *  - QUOTE_ONLY — the creator's project-token entitlement is converted through the canonical pool
 *    into the market's SELECTED QUOTE asset. "Quote-only" is NOT "WETH-only": a PROJECT/USDG market
 *    settles the creator in USDG, a PROJECT/NVDA market in NVDA. Only a WETH-quoted market settles
 *    in WETH.
 *
 * Creator assets never enter the platform settlement pipeline, and creator conversion costs apply
 * only to the creator's own entitlement.
 */
export const CREATOR_FEE_ASSET_MODES = Object.freeze(["DUAL_ASSET", "QUOTE_ONLY"]);

/**
 * Where a project's PLATFORM-side fee revenue currently stands on its way to the 50/50 allocation.
 * One closed list, shared by the SDK's `platformSettlementStatus` and the indexer's
 * `platform_settlement_status` column, so the two can never drift.
 *
 *  - NOT_ACCRUED                  — no platform fee revenue has accrued for this project yet.
 *  - SOURCE_ASSETS_PENDING        — fees collected, still sitting in their source assets.
 *  - PROJECT_TOKEN_TO_QUOTE_PENDING — a project-token bucket awaits conversion into the quote asset.
 *  - QUOTE_TO_WETH_PENDING        — a quote-asset bucket awaits conversion into WETH.
 *  - WETH_SETTLED                 — net WETH is credited to the platform; allocation not yet split.
 *  - SPLIT_ALLOCATED              — settled WETH is divided into buyback reserve and retained treasury.
 *  - DEGRADED_ROUTE               — a conversion route is unavailable or unproven; figures are stale.
 *  - RETRYABLE_FAILURE            — a settlement step failed and can be retried.
 *  - UNKNOWN                      — the state could not be determined.
 *
 * UNKNOWN IS LOAD-BEARING. It is never to be replaced with zero, and no consumer may render a
 * number without first reading the status: a false zero reads as a measurement, an honest gap does
 * not.
 */
export const PLATFORM_SETTLEMENT_STATUSES = Object.freeze([
  "NOT_ACCRUED",
  "SOURCE_ASSETS_PENDING",
  "PROJECT_TOKEN_TO_QUOTE_PENDING",
  "QUOTE_TO_WETH_PENDING",
  "WETH_SETTLED",
  "SPLIT_ALLOCATED",
  "DEGRADED_ROUTE",
  "RETRYABLE_FAILURE",
  "UNKNOWN",
]);

/** The statuses under which a settled-WETH figure exists at all. Every other status means the
 *  buyback/retained fields are unknown, not zero. */
export const SETTLED_PLATFORM_STATUSES = Object.freeze(["WETH_SETTLED", "SPLIT_ALLOCATED"]);

/** @param {string} status */
export function isPlatformSettlementStatus(status) {
  return PLATFORM_SETTLEMENT_STATUSES.includes(status);
}

/** True when `status` means a settled WETH figure exists. @param {string} status */
export function hasSettledPlatformWeth(status) {
  return SETTLED_PLATFORM_STATUSES.includes(status);
}

/**
 * Splits NET SETTLED platform WETH into the two destinations, using the kernels' own floor-division
 * order: buyback = floor(settled * buybackBps / 10_000), retained = the remainder. The remainder
 * form (rather than a second floor) is what makes the two halves sum to the input exactly, with no
 * dust stranded — the same rule the on-chain kernels apply.
 *
 * Takes and returns `bigint` wei. JS `number` is forbidden for economic math.
 * @param {bigint} netSettledWeth
 */
export function allocateSettledPlatformWeth(netSettledWeth) {
  if (typeof netSettledWeth !== "bigint") throw new TypeError("allocateSettledPlatformWeth requires a bigint (wei)");
  if (netSettledWeth < 0n) throw new RangeError("netSettledWeth cannot be negative");
  const buybackReserve = (netSettledWeth * BigInt(RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE)) / BigInt(BPS_DENOMINATOR);
  return Object.freeze({ buybackReserve, treasuryRetained: netSettledWeth - buybackReserve });
}
