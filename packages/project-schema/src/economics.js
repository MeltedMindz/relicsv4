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
 *
 * WHAT THE RATIO APPLIES TO — read PLATFORM_ENTITLEMENT_MODEL below before using this. The 50/50
 * divides the platform entitlement **in its own settlement asset**, which is the market's SELECTED
 * QUOTE. It is NOT a division of WETH. WETH is the special case where the selected quote happens
 * to be WETH, not the definition of the model.
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
 * THE PLATFORM ENTITLEMENT MODEL — read this before naming any platform figure.
 *
 * The platform's 25% is denominated in the market's SELECTED QUOTE, and the 50/50 divides it THERE:
 *
 *     platform 25% entitlement, in the SELECTED QUOTE
 *     |- 50% retained treasury -> claimable IN THE QUOTE ASSET, immediately
 *     `- 50% RELICS buyback    -> QUOTE-denominated pending; becomes WETH only when an approved
 *                                 route exists. Retryable. NEVER reported as settled until WETH is
 *                                 actually received.
 *
 * WETH IS THE SPECIAL CASE, NOT THE DEFINITION. On a WETH-quoted market the selected quote already
 * is WETH, so both halves are WETH the moment the split happens and there is nothing to convert.
 * On a USDG-quoted market the treasury half is claimable in USDG and the buyback half is USDG
 * waiting for a route; on a GME-quoted market, GME.
 *
 * THE DISTINCTION THIS EXISTS TO CARRY. A buyback half sitting in GME is ALLOCATED, not SETTLED.
 * The public claim — "50% of net platform revenue is allocated to RELICS buy-and-entomb" — stays
 * true only while pending is visibly pending. So no surface may populate a WETH figure from a
 * quote-denominated balance, and `BUYBACK_ALLOCATED_AWAITING_ROUTE` is a normal, healthy state
 * rather than a failure: no approved route existing yet is an ordinary condition of this model.
 *
 * WHAT DID NOT CHANGE. The platform still takes NO direct claim in the PROJECT TOKEN — that share
 * still converts into the selected quote first. And the buyback still ends in WETH; it just gets
 * there later, or not yet.
 *
 * WHAT IS AND IS NOT PROMISED. The nominal percentages above are ratios applied to COLLECTED LP
 * FEES. Nobody may promise that exactly NOMINAL_ALLOCATION_PERCENT.relicsBuybackReserve of gross
 * trading volume reaches either destination; volume is not fee revenue, and settlement is not free.
 * Conversion costs fall ONLY on the platform's own share — a creator's entitlement is never charged
 * for the platform's route, in either direction.
 */
export const PLATFORM_ENTITLEMENT_MODEL = Object.freeze({
  entitlementAsset: "SELECTED_QUOTE",
  treasuryHalf: "CLAIMABLE_IN_SELECTED_QUOTE_IMMEDIATELY",
  buybackHalf: "QUOTE_DENOMINATED_UNTIL_AN_APPROVED_ROUTE_CONVERTS_IT_TO_WETH",
  wethQuoteIs: "THE_SPECIAL_CASE_WHERE_SELECTED_QUOTE_IS_ALREADY_WETH",
  projectTokenDirectPlatformClaim: false,
  buybackTerminalAsset: "WETH",
});

export const PLATFORM_SETTLEMENT_INVARIANT =
  `The platform's ${bpsToProsePercentString(PLATFORM_SHARE_BPS)} entitlement is denominated in the market's SELECTED QUOTE, and ` +
  `divides there: ${PLATFORM_SUBDIVISION_PROSE.platformTreasury} is retained treasury, claimable in the quote asset ` +
  `immediately, and ${PLATFORM_SUBDIVISION_PROSE.relicsBuybackReserve} is allocated to the RELICS buy-and-entomb reserve, ` +
  `which stays quote-denominated until an approved route converts it to WETH. A WETH-quoted market is the special case ` +
  `where that conversion is already done. An allocated buyback half is not a settled one, and is never reported as WETH ` +
  `before WETH is received. Conversion costs fall only on the platform share, never on the creator's.`;

/**
 * QUOTE ADMISSION IS NOT GATED ON A PROVEN WETH ROUTE — and no surface may re-encode a rule saying
 * it is. A quote can be enabled for new launches while the platform's route from that quote to WETH
 * is unproven, because the treasury half is claimable in the quote regardless and the buyback half
 * is allowed to wait. This constant exists so the absence of that rule is a STATED decision rather
 * than an omission somebody helpfully "fixes" later.
 *
 * Separate and still true: the CREATOR's `QUOTE_ONLY` mode does need a proven route from the
 * project token into the quote, because that conversion is what the mode promises the creator. The
 * two are different routes with different requirements; do not collapse them.
 */
export const QUOTE_ADMISSION_REQUIRES_PROVEN_WETH_ROUTE = false;

/**
 * NORMALISATION FOR CLAIM SCANNING — the matcher's answer to "the same claim, written as code".
 *
 * A retired claim does not only appear as prose. It appears as a gate identifier
 * (`TREASURY_WETH_ONLY`), a camelCase test name (`test_treasuryWethOnly`), a JSON verdict value,
 * a log label, and — the form that slipped past two independent scanners — a trailing code
 * comment (`// weth-only`). Regexes written for sentences miss every one of those, and then the
 * gate reports zero because it is looking for the wrong shape rather than because there is
 * nothing.
 *
 * So the register carries TWO kinds of pattern. `pattern` runs against the raw text, where casing
 * and punctuation are load-bearing (an ABI entry, a call site). `normalizedPattern` runs against
 * the output of this function, where they are not: identifier separators, camelCase boundaries and
 * surrounding punctuation all collapse to single spaces and everything lowercases, so
 * `TREASURY_WETH_ONLY`, `treasuryWethOnly`, `treasury-weth-only`, `"TREASURY_WETH_ONLY"` and
 * `// weth-only` all become the one string `treasury weth only`.
 *
 * `%` survives, and so does a dot BETWEEN DIGITS, because the retired PERCENTAGES need both —
 * "6.25%" has to stay one token. Every other dot is a separator like any other, so `t.bigint` and
 * `treasury.weth.only` both split.
 * @param {string} text
 */
export function normalizeForClaimScan(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase -> spaced
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // ACRONYMWord -> spaced
    .replace(/(?<!\d)\.(?!\d)/g, " ") // a dot that is not a decimal point is a separator
    .replace(/[^A-Za-z0-9%.]+/g, " ") // remaining identifier separators + punctuation -> space
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * THE RETIRED-CLAIM REGISTER. Published as data so that every repository's stale-claim gate scans
 * for the same things, and so adding a retired claim is a one-line change in one file rather than
 * an edit to each scanner.
 *
 * `pattern` is a JavaScript regular-expression SOURCE string (case-insensitive, global is applied
 * by the scanner), run against the RAW text. `normalizedPattern`, where present, is run against
 * `normalizeForClaimScan(text)` and is what catches identifier-, comment- and JSON-value-shaped
 * occurrences. A claim may carry either or both; a claim whose meaning depends on punctuation —
 * the removed selectors, matched by call and ABI shape — deliberately carries only `pattern`.
 *
 * `counter` is the environment-style name a gate must report a count under — the three RC3
 * counters are contractual and are checked by name.
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
  // ---- retired by the quote-denominated platform entitlement (2026-08-10) --------------------
  //
  // Both of these were stated as live truth across the SDK, the indexer and the documentation
  // until the entitlement moved into the selected quote. They are the exact shape of assertion
  // this register exists to catch: a policy sentence, repeated, that a model change falsifies.
  //
  // NOTE THE LINE THESE PATTERNS DO NOT CROSS. "The locker AT THIS INTEGRATION HEAD is
  // WETH-denominated" is a FACT ABOUT A SPECIFIC DEPLOYMENT and stays sayable — a contract that
  // does not implement the model yet genuinely cannot report quote-denominated figures, and saying
  // so is honest. What is retired is the POLICY claim that the platform is paid only in WETH.
  Object.freeze({
    id: "PLATFORM_TREASURY_ASSET_WETH_ONLY",
    counter: "ACTIVE_STALE_PLATFORM_TREASURY_WETH_ONLY_CLAIMS",
    pattern:
      // The invariant name, however it is punctuated: `PLATFORM_TREASURY_ASSET = WETH_ONLY`,
      // `| PLATFORM_TREASURY_ASSET | **WETH_ONLY** |` in a table, or the bare gate id.
      "PLATFORM_TREASURY_ASSET[^\\n]{0,24}WETH_ONLY" +
      "|\\bTREASURY_WETH_ONLY\\b" +
      "|platform[- ]treasury[- ]WETH[- ]only" +
      // Prose forms.
      "|platform\\s+(?:NEVER|never)\\s+has\\s+a\\s+token\\s+entitlement" +
      "|platform\\s+(?:is\\s+)?(?:only|always)\\s+(?:paid|settles?|settled)\\s+in\\s+WETH" +
      "|platform\\s+treasury\\s+(?:is|stays|remains)[^.\\n]{0,20}WETH[- ]only" +
      "|treasury\\s+(?:stays|remains|is)\\s+\\*{0,2}WETH[- ]only" +
      "|platform\\s+(?:share|entitlement)\\s+is\\s+always\\s+WETH",
    // Proximity-guarded on purpose. A bare "weth only" also appears in the CURRENT and correct
    // sentence "quote-only is not WETH-only", so the normalized form only fires when a
    // platform/treasury word sits within ~40 characters of it.
    normalizedPattern:
      "(?:platform|treasury|accrued|claimed|entitlement|retained)[^\\n]{0,40}weth only" +
      "|weth only[^\\n]{0,40}(?:platform|treasury)",
    description: "the retired claim that the platform treasury is paid only in WETH (it is now claimable in the selected quote)",
  }),
  Object.freeze({
    id: "PLATFORM_DIRECT_NON_WETH_QUOTE_CLAIM_NO",
    counter: "ACTIVE_STALE_PLATFORM_NO_DIRECT_QUOTE_CLAIM_CLAIMS",
    pattern:
      "PLATFORM_DIRECT_NON_WETH_QUOTE_CLAIM[^\\n]{0,24}\\bNO\\b" +
      "|platform\\s+cannot\\s+claim\\s+(?:directly\\s+)?in\\s+(?:a\\s+)?(?:non-WETH\\s+)?quote" +
      "|no\\s+direct\\s+(?:non-WETH\\s+)?quote\\s+claim\\s+for\\s+the\\s+platform" +
      "|platform\\s+has\\s+no\\s+quote-denominated\\s+(?:claim|entitlement)" +
      "|treasury\\s+never\\s+acquires\\s+a\\s+claim\\s+on\\s+a\\s+non-WETH",
    normalizedPattern:
      "platform direct non weth quote claim no\\b" +
      "|treasury never acquires a claim on a non weth" +
      "|platform (?:cannot|has no) [^\\n]{0,30}quote (?:claim|entitlement)",
    description: "the retired claim that the platform has no direct claim in a non-WETH quote (the treasury half is now claimable in it)",
  }),
  // ---- selectors REMOVED FROM THE BYTECODE, not merely deprecated (2026-08-10) ---------------
  //
  // `subdividePlatformWeth` and `TREASURY_SOURCE_ASSET_CLAIM` are gone from the rebuilt economic
  // kernel. A surviving reference is worse than a stale comment: an ABI entry or a call site
  // implies a step that no longer exists, and a consumer that reaches for it calls into nothing.
  //
  // The pattern deliberately matches CALL AND ABI SHAPES ONLY — `"name": "..."`, `.selector(`,
  // `functionName: "..."` — so a document that says "subdividePlatformWeth was removed" is still
  // free to say it. Describing a removal is the opposite of depending on it.
  Object.freeze({
    id: "REMOVED_KERNEL_SELECTORS",
    counter: "ACTIVE_STALE_REMOVED_KERNEL_SELECTOR_CLAIMS",
    pattern:
      "[\"']name[\"']\\s*:\\s*[\"'](?:subdividePlatformWeth|TREASURY_SOURCE_ASSET_CLAIM)[\"']" +
      "|\\.(?:subdividePlatformWeth|TREASURY_SOURCE_ASSET_CLAIM)\\s*\\(" +
      "|functionName\\s*:\\s*[\"'](?:subdividePlatformWeth|TREASURY_SOURCE_ASSET_CLAIM)[\"']",
    description: "a reference to a kernel selector that no longer exists in the bytecode (subdividePlatformWeth / TREASURY_SOURCE_ASSET_CLAIM)",
  }),
]);

/**
 * A file asserting a retired claim is TOLERATED only if one of these markers appears in it AS A
 * HEADER. The marker has to be explicit: "historical" in a filename is not a supersession header.
 */
export const SUPERSESSION_MARKERS = Object.freeze([
  "SUPERSEDED_HISTORICAL_DO_NOT_USE_FOR_LAUNCH",
  "SUPERSEDED_BY_RC3_PLATFORM_ALLOCATION_AMENDMENT",
]);

/**
 * How far into a file a supersession marker still counts as a BANNER.
 *
 * Anywhere-in-the-file was a loophole with teeth: a document that merely NAMES a marker while
 * explaining the convention — a contributor guide, a project-memory file — exempted itself
 * entirely, including any real retired claim further down. A banner goes at the top, so that is
 * where it is looked for.
 */
export const SUPERSESSION_BANNER_LINES = 40;

/** @param {string} text */
export function hasSupersessionBanner(text) {
  const head = String(text).split(/\r?\n/, SUPERSESSION_BANNER_LINES).join("\n");
  return SUPERSESSION_MARKERS.some((m) => head.includes(m));
}

/**
 * THE ONE MATCHER. Both repositories' gates call this rather than each assembling regexes, because
 * a matcher maintained twice is a matcher that disagrees with itself — and because every subtlety
 * below was learned the hard way and should not have to be learned again.
 *
 * Three things it does that a naive scan does not:
 *
 *   1. MATCHES PER LINE, not per file. The normaliser collapses newlines to spaces, which silently
 *      destroys every `[^\n]{0,40}` proximity guard: a claim on one line and a keyword on the next
 *      become neighbours, and a correct sentence gets reported. Lines are normalised individually
 *      so proximity means what it says.
 *
 *   2. STRIPS COUNTER NAMES FIRST. `ACTIVE_STALE_PLATFORM_TREASURY_WETH_ONLY_CLAIMS` normalises to
 *      a phrase its own pattern matches, so any document naming the gate would report itself.
 *      Naming a counter is describing the check, not asserting the claim.
 *
 *   3. RUNS BOTH MATCHERS. Raw text where punctuation carries the meaning (an ABI entry, a call
 *      site); normalised text where it does not (an identifier, a JSON value, a trailing comment).
 *
 * @param {string} text
 * @returns {{ id: string, counter: string, description: string, line: number, sample: string }[]}
 */
export function scanTextForRetiredClaims(text) {
  const counterNoise = RETIRED_ALLOCATION_CLAIMS.map((c) => normalizeForClaimScan(c.counter)).filter(Boolean);
  const lines = String(text).split(/\r?\n/);
  /** @type {{ id: string, counter: string, description: string, line: number, sample: string }[]} */
  const hits = [];

  for (const claim of RETIRED_ALLOCATION_CLAIMS) {
    const raw = claim.pattern ? new RegExp(claim.pattern, "gi") : null;
    const norm = claim.normalizedPattern ? new RegExp(claim.normalizedPattern, "gi") : null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const seen = new Set();

      if (raw) {
        raw.lastIndex = 0;
        for (const m of line.matchAll(raw)) seen.add(m[0].trim().replace(/\s+/g, " "));
      }
      if (norm) {
        let normalized = normalizeForClaimScan(line);
        for (const noise of counterNoise) normalized = normalized.split(noise).join(" ");
        norm.lastIndex = 0;
        for (const m of normalized.matchAll(norm)) seen.add(m[0].trim());
      }
      for (const sample of seen) {
        hits.push({ id: claim.id, counter: claim.counter, description: claim.description, line: i + 1, sample });
      }
    }
  }
  return hits;
}

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
 * Where a project's PLATFORM-side fee revenue currently stands. One closed list, shared by the
 * SDK's `platformSettlementStatus` and the indexer's `platform_settlement_status` column, so the
 * two can never drift. Listed in PIPELINE ORDER.
 *
 *  - NOT_ACCRUED                     — no platform fee revenue has accrued for this project yet.
 *  - SOURCE_ASSETS_PENDING           — fees collected, still sitting in their source assets.
 *  - PROJECT_TOKEN_TO_QUOTE_PENDING  — the project-token share awaits conversion into the selected
 *                                      quote. The platform takes no direct claim in the project
 *                                      token, so this step always precedes the split.
 *  - SPLIT_ALLOCATED                 — the entitlement is divided IN THE SELECTED QUOTE. The
 *                                      treasury half is claimable in the quote from this point on.
 *  - BUYBACK_ALLOCATED_AWAITING_ROUTE — the buyback half is allocated and quote-denominated, and no
 *                                      approved route to WETH exists yet. A NORMAL, HEALTHY STATE,
 *                                      not a failure: under this model waiting is expected, and
 *                                      calling it RETRYABLE_FAILURE would report an ordinary
 *                                      condition as a fault.
 *  - QUOTE_TO_WETH_PENDING           — an approved route exists and the conversion is outstanding.
 *  - WETH_SETTLED                    — WETH has actually been RECEIVED for the buyback half. This
 *                                      is the ONLY status under which a WETH figure exists.
 *  - DEGRADED_ROUTE                  — a route that did exist is unavailable or unproven; figures
 *                                      are a stale prefix rather than current.
 *  - RETRYABLE_FAILURE               — a settlement step FAILED and can be retried. Reserve it for
 *                                      actual failures; "no route yet" is the state above.
 *
 *                                      NEVER RETURNED ON-CHAIN, and that is deliberate rather than
 *                                      a gap. A failed call reverts instead of writing a status, so
 *                                      the kernel cannot know the failure happened — synthesising
 *                                      the value would be inventing knowledge it does not have. An
 *                                      indexer that wants this state must DERIVE it from an
 *                                      observed reverted transaction, and an SDK caller must pass
 *                                      it in from the same evidence. Reading it back from a
 *                                      contract is not possible, and any surface claiming to have
 *                                      done so is wrong.
 *  - UNKNOWN                         — the state could not be determined.
 *
 * UNKNOWN IS LOAD-BEARING. It is never to be replaced with zero, and no consumer may render a
 * number without first reading the status: a false zero reads as a measurement, an honest gap does
 * not.
 */
/**
 * The subset a contract can actually report. `RETRYABLE_FAILURE` is absent: a reverted call writes
 * nothing, so no on-chain read can ever produce it. Published so an indexer can assert that a
 * status it READ is in this list, and that a status it DERIVED from a revert is not mistaken for
 * one the chain asserted.
 */
export const ONCHAIN_REPORTABLE_SETTLEMENT_STATUSES = Object.freeze([
  "NOT_ACCRUED",
  "SOURCE_ASSETS_PENDING",
  "PROJECT_TOKEN_TO_QUOTE_PENDING",
  "SPLIT_ALLOCATED",
  "BUYBACK_ALLOCATED_AWAITING_ROUTE",
  "QUOTE_TO_WETH_PENDING",
  "WETH_SETTLED",
  "DEGRADED_ROUTE",
  "UNKNOWN",
]);

/** Statuses that exist only as an OFF-CHAIN inference from observed evidence. @param {string} s */
export function isOffchainDerivedStatus(s) {
  return PLATFORM_SETTLEMENT_STATUSES.includes(s) && !ONCHAIN_REPORTABLE_SETTLEMENT_STATUSES.includes(s);
}

export const PLATFORM_SETTLEMENT_STATUSES = Object.freeze([
  "NOT_ACCRUED",
  "SOURCE_ASSETS_PENDING",
  "PROJECT_TOKEN_TO_QUOTE_PENDING",
  "SPLIT_ALLOCATED",
  "BUYBACK_ALLOCATED_AWAITING_ROUTE",
  "QUOTE_TO_WETH_PENDING",
  "WETH_SETTLED",
  "DEGRADED_ROUTE",
  "RETRYABLE_FAILURE",
  "UNKNOWN",
]);

/**
 * Statuses under which the 50/50 division exists AT ALL — in the settlement asset, which is the
 * quote. From here the treasury half is claimable; it says nothing about WETH.
 */
export const ALLOCATED_PLATFORM_STATUSES = Object.freeze([
  "SPLIT_ALLOCATED",
  "BUYBACK_ALLOCATED_AWAITING_ROUTE",
  "QUOTE_TO_WETH_PENDING",
  "WETH_SETTLED",
]);

/**
 * Statuses under which WETH has actually been RECEIVED for the buyback half. Exactly one, and
 * deliberately so: every other status means the WETH fields are unknown or not-yet, never zero.
 */
export const BUYBACK_WETH_SETTLED_STATUSES = Object.freeze(["WETH_SETTLED"]);

/**
 * @deprecated Use `BUYBACK_WETH_SETTLED_STATUSES`. The old list included `SPLIT_ALLOCATED`, which
 * under the quote-denominated model means the split happened in the QUOTE and implies nothing about
 * WETH at all.
 */
export const SETTLED_PLATFORM_STATUSES = BUYBACK_WETH_SETTLED_STATUSES;

/** @param {string} status */
export function isPlatformSettlementStatus(status) {
  return PLATFORM_SETTLEMENT_STATUSES.includes(status);
}

/** True when the entitlement has been divided in the settlement asset. @param {string} status */
export function hasAllocatedPlatformEntitlement(status) {
  return ALLOCATED_PLATFORM_STATUSES.includes(status);
}

/** True when WETH has actually been received for the buyback half. @param {string} status */
export function hasSettledBuybackWeth(status) {
  return BUYBACK_WETH_SETTLED_STATUSES.includes(status);
}

/** @deprecated Use `hasSettledBuybackWeth`; the old name read as "the platform has settled",
 *  which is now true of the treasury half long before any WETH exists. @param {string} status */
export function hasSettledPlatformWeth(status) {
  return hasSettledBuybackWeth(status);
}

/**
 * Splits the platform entitlement into its two destinations, using the kernels' own floor-division
 * order: buyback = floor(entitlement * buybackBps / 10_000), retained = the remainder. The
 * remainder form (rather than a second floor) is what makes the two halves sum to the input
 * exactly, with no dust stranded — the same rule the on-chain kernels apply.
 *
 * ASSET-AGNOSTIC BY DESIGN. The input is denominated in the platform's SETTLEMENT ASSET — the
 * market's selected quote — and both outputs are in that same asset. The buyback half is not WETH
 * yet unless the quote already was; see PLATFORM_ENTITLEMENT_MODEL.
 *
 * Takes and returns `bigint` base units. JS `number` is forbidden for economic math.
 * @param {bigint} entitlement
 */
export function allocatePlatformEntitlement(entitlement) {
  if (typeof entitlement !== "bigint") throw new TypeError("allocatePlatformEntitlement requires a bigint (base units of the settlement asset)");
  if (entitlement < 0n) throw new RangeError("entitlement cannot be negative");
  const buybackReserve = (entitlement * BigInt(RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE)) / BigInt(BPS_DENOMINATOR);
  return Object.freeze({ buybackReserve, treasuryRetained: entitlement - buybackReserve });
}

/**
 * @deprecated The name asserts WETH, which is now only the special case. Use
 * `allocatePlatformEntitlement`. Kept as a delegating alias — one implementation, two names — so
 * existing callers keep resolving; it is still exactly correct for a WETH-quoted market.
 * @param {bigint} netSettledWeth
 */
export function allocateSettledPlatformWeth(netSettledWeth) {
  return allocatePlatformEntitlement(netSettledWeth);
}
