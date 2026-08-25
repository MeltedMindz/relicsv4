import { BPS_DENOMINATOR as SCHEMA_BPS_DENOMINATOR, CREATOR_SHARE_BPS as SCHEMA_CREATOR_SHARE_BPS, PLATFORM_SHARE_BPS as SCHEMA_PLATFORM_SHARE_BPS, RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE as SCHEMA_RELICS_BUYBACK_BPS, PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE as SCHEMA_PLATFORM_RETAINED_BPS, NOMINAL_ALLOCATION_BPS as SCHEMA_NOMINAL_ALLOCATION_BPS, } from "@relics/project-schema";
export const CHAIN_ID = 1;
export const POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90";
export const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const UNIVERSAL_ROUTER = "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af";
export const V4_QUOTER = "0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203";
/** Deterministic G-1 fork pin. Archive-capable RPCs serve state at this block. */
export const FORK_BLOCK = 25690000n;
/**
 * The RC5 project pool's STATIC v4 LP fee, in pips (`Constants.POOL_FEE_PIPS`).
 *
 * RC6 DOES NOT USE THIS IN ITS POOL KEY, AND ANY PREDICTION THAT DOES IS WRONG.
 * `LaunchPolicyV1.poolKeyFor` sets `PoolKey.fee` to `LPFeeLibrary.DYNAMIC_FEE_FLAG` (`0x800000`)
 * so the ArtHook can return the elected anti-snipe launch fee as a per-swap override — v4-core
 * only parses that override under `key.fee.isDynamicFee()`. Because `fee` is part of the PoolId
 * preimage, an RC6 PoolId derived with `10_000` is a different pool that does not exist.
 *
 * 10,000 pips (1.00%) is still the PERMANENT RATE an RC6 pool settles at: the hook writes it into
 * the pool as the stored LP fee at initialization, returns it verbatim on every disposal, and
 * decays to it on acquisitions after 5,880 seconds. The sentinel names WHO decides the fee, not
 * what it settles at.
 *
 * {@link poolKeyFor} below mirrors RC5's `LaunchpadFactory._keyFor` and is correct for RC5 only.
 * An RC6-aware derivation is owned by the SDK/site lane and is not this constant's job.
 */
export const POOL_FEE_PIPS = 10_000; // 1.00% static v4 LP fee — RC5 lane (Constants.POOL_FEE_PIPS)
/**
 * THE FEE ALLOCATION IS NOT DECLARED HERE. It is declared once, in the creator kit's
 * `@relics/project-schema` (`src/economics.js`), mirrored verbatim at
 * `launchpad/packages/project-schema/`, and re-exported below so SDK consumers keep importing it
 * from the SDK. The RC3 amendment moved `RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE` from 2500 to 5000
 * and had to touch exactly one off-chain file; before the economics module it would have touched
 * this one, the vocabulary, the indexer, the studio and five documents.
 */
export const BPS_DENOMINATOR = SCHEMA_BPS_DENOMINATOR;
export const CREATOR_SHARE_BPS = SCHEMA_CREATOR_SHARE_BPS;
export const PLATFORM_SHARE_BPS = SCHEMA_PLATFORM_SHARE_BPS;
/** Share of the PLATFORM's own slice allocated to RELICS buy-and-entomb. Never of collected fees. */
export const RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE = SCHEMA_RELICS_BUYBACK_BPS;
export const PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE = SCHEMA_PLATFORM_RETAINED_BPS;
/** NOMINAL bps of COLLECTED LP fees. The exact platform invariant is on NET SETTLED WETH — see
 * `PLATFORM_SETTLEMENT_INVARIANT`, re-exported from the same module. */
export const NOMINAL_ALLOCATION_BPS = SCHEMA_NOMINAL_ALLOCATION_BPS;
export { NOMINAL_ALLOCATION_PERCENT, PLATFORM_SUBDIVISION_PERCENT, bpsToPercentString, BUYBACK_MECHANISM, ENTOMBMENT_ADDRESS, BUYBACK_DISCLOSURE, BUYBACK_DISCLOSURE_SHORT, BUYBACK_TECHNICAL_NOTE, PLATFORM_SETTLEMENT_INVARIANT, PLATFORM_SETTLEMENT_STATUSES, SETTLED_PLATFORM_STATUSES, isPlatformSettlementStatus, hasSettledPlatformWeth, allocateSettledPlatformWeth, } from "@relics/project-schema";
/**
 * The mandatory public disclosure sentence for `readProjectFeeState()` (Agent 3's
 * src/fee/fee-disclosure.fixture.json `publicLanguage.poolFeeAndSplit`, verbatim). NEVER
 * substitute "1% total fee forever" / "0.75% of all volume forever" phrasing — see
 * `fee-disclosure.fixture.json.forbiddenPhrasings` for why both are false: a live Uniswap
 * protocol fee compounds with the static 1% LP fee (never simple addition), and the 75/25 split
 * applies only to LP fees ACTUALLY COLLECTED by the locked genesis position, never to raw volume.
 */
export const FEE_DISCLOSURE_TEXT = "The project pool has a fixed 1% LP fee. LP fees collected by the permanent genesis position are split 75% to the creator and 25% to the platform. Any Uniswap protocol fee is separate and displayed from current pool state.";
/** ProtocolFeeLibrary.MAX_PROTOCOL_FEE (v4-core): the ceiling on either directional protocol fee. */
export const MAX_PROTOCOL_FEE_PIPS = 1_000; // 0.10%
/** ArtStreamableFeesLocker.TWAP_WINDOW — the organic-TWAP window every conversion is anchored to. */
export const CONVERSION_TWAP_WINDOW_SECONDS = 1_800; // 30 minutes
/** ArtHook.ORACLE_MIN_OBSERVATIONS — an oracle is immature (oracleReady==false) below this count. */
export const ORACLE_MIN_OBSERVATIONS = 3;
/** ArtHook.ORACLE_MAX_STALENESS — the newest observation must be within this many seconds. */
export const ORACLE_MAX_STALENESS_SECONDS = 3_600;
/** DeployAll.deployDefault's G-1.1 MEASURED, non-vacuous locker conversion policy (Agent 1's
 * adversarial sweep). Supersedes the earlier vacuous 5000/500/(887272*2) G-1 defaults that
 * enabled the F-1 conversion-oracle exploit. */
export const DEFAULT_LOCKER_CONVERSION_POLICY = {
    minConversionBatch: 1000000000n, // 1e9
    maxConversionBatch: 1000000000000000000000000n, // 1e24
    maxConversionSizeBps: 50, // <= 0.50% of pooled token reserves per conversion
    maxDeviationBps: 300, // 3% TWAP-anchored WETH-out slippage floor
    maxConversionTickMove: 800, // coarse spot-vs-TWAP pre-filter
};
/** afterInitialize (0x1000) | afterAddLiquidity (0x400) | afterSwap (0x40). */
export const EXPECTED_HOOK_FLAGS = 0x1440n;
/**
 * RC6's hook permission mask. RC5 mined `afterInitialize | afterAddLiquidity | afterSwap` (0x1440);
 * RC6 adds `beforeSwap`, which is what lets the anti-snipe fee schedule set the dynamic LP fee on
 * the way in, giving 0x14C0. The two are NOT interchangeable: an address mined against 0x1440 does
 * not carry the RC6 mask, so ArtHookRc6's constructor reverts BadHookAddress and takes the launch
 * with it. Confirmed against src/rc6/hook/HookMinerRc6.sol and SaleLaunchpadV1.sol.
 */
export const RC6_EXPECTED_HOOK_FLAGS = 0x14c0n;
export const ALL_HOOK_MASK = 0x3fffn; // (1 << 14) - 1
export const EIP7825_TX_GAS_CAP = 16777216n;
export const ENGINEERING_GAS_CEILING = 14000000n;
export const WHOLE_UNIT = 1000000000000000000n; // 1e18
/** LaunchpadFactory.TICK_SPACING (not in Constants.sol; fixed in the factory itself). */
export const TICK_SPACING = 60;
export const MAX_COLLABORATORS = 16;
/**
 * MEASURED one-transaction script-byte ceilings (src/Constants.sol `SCRIPT_BYTE_CEILING` /
 * `MAX_PROJECT_SCRIPT_BYTES`, ADR-023), measured WITH the organic-TWAP oracle hook AND the
 * ERC-7572/ERC-173 contract-metadata surface (2026-08 wave: the per-launch ProjectCollection
 * deploy grew ~1,051 B, adding ~256K fixed gas per launch and moving the crossover down from
 * 42,000). Do NOT use 42,000, 45,500 or 55,000 — all are retired values from earlier curves.
 *
 * SCRIPT_BYTE_CEILING     = 40,000  hard one-tx cap. RECALIBRATED 41,000 -> 40,000 on
 * 2026-08-07 (supply/launch-modes follow-up): the post-wiring
 * sweep measured 41,000 -> 13,999,520 total-tx — only 480 gas
 * under 14M, too thin for a hard cap. 40,000 -> 13,781,287
 * (218,713 margin); 42,000 -> 14,217,614 is over.
 * MAX_PROJECT_SCRIPT_BYTES =  36,000 conservative PUBLIC product limit, >=1M gas headroom below
 * 14M (36,000 -> 12,909,025 total-tx gas; 1,090,975 headroom)
 *
 * This SDK always gates the public byte budget at MAX_PROJECT_SCRIPT_BYTES (36,000), never the
 * hard ceiling — see `getScriptByteBudget()` in gas.ts. `MEASURED_SCRIPT_BYTE_CEILING` is kept as
 * a deprecated alias of the hard ceiling for source compatibility with G-1 call sites.
 */
export const SCRIPT_BYTE_CEILING = 40_000;
export const MAX_PROJECT_SCRIPT_BYTES = 36_000;
/** @deprecated G-1 name. Use SCRIPT_BYTE_CEILING (hard cap) or MAX_PROJECT_SCRIPT_BYTES (public budget). */
export const MEASURED_SCRIPT_BYTE_CEILING = SCRIPT_BYTE_CEILING;
/**
 * Reference (not independently re-measured by this SDK) gas anchor points, transcribed from the
 * 2026-08-07 supply/launch-modes follow-up fork measurement (test/gas/LaunchGas.fork.t.sol +
 * test/verify/IndependentGas.fork.t.sol): 8KB one-call 6,625,953; 36KB total-tx 12,909,025; plus
 * the 40,000 -> 13,781,287 SCRIPT_BYTE_CEILING boundary (total-tx). NOTE the mixed one-call/total-tx semantics under one `oneCallGas` label —
 * a known, conservative-erring quirk kept for source compatibility. Used ONLY as an offline
 * fallback (source "reference:constants-doc-linear-fit") when no live publicClient is available
 * to run a real `estimateContractGas` — see gas.ts. Whenever a live client IS available,
 * `estimateAtomicLaunchGas()`/`getScriptByteBudget()` prefer a REAL measured gas number from the
 * local fork over this reference model.
 */
export const REFERENCE_GAS_ANCHORS = [
    { scriptBytes: 8_000, oneCallGas: 6_625_953 },
    { scriptBytes: 36_000, oneCallGas: 12_909_025 },
    { scriptBytes: 40_000, oneCallGas: 13_781_287 },
];
/** Local anvil fork defaults (proof-only; never used against a public chain). */
export const DEFAULT_ANVIL_RPC_URL = "http://127.0.0.1:8545";
export const DEFAULT_ANVIL_PORT = 8545;
/**
 * Archive-capable public mainnet endpoints (see foundry.toml `[rpc_endpoints]`). publicnode is
 * NOT archive-capable and must never be used for the pinned fork.
 */
export const ARCHIVE_RPC_CANDIDATES = [
    "https://eth.drpc.org",
    "https://eth-mainnet.public.blastapi.io",
    "https://1rpc.io/eth",
];
// NOTE (A5-F2, 2026-08-07): the well-known anvil default dev accounts used to live here — on the
// published SDK export surface via the barrel. They moved to sdk/src/localfork/devAccounts.ts,
// a clearly-scoped LOCAL-FORK-ONLY module that no published entry point re-exports. Import that
// module directly from proof scripts / anvil client factories; never re-add key material here.
