import { type Address, type Hex } from "viem";
import type { PoolKey } from "./types.js";
/** The two protocol generations whose PoolKeys differ. */
export type ProtocolLane = "RC5" | "RC6";
export declare const PROTOCOL_LANES: readonly ProtocolLane[];
/**
 * `PoolKey.fee` per lane.
 *
 * RC6's value is the v4-core sentinel, re-exported from `@v4-art-launchpad/launch-protection`
 * rather than written as a literal here, so it tracks the dependency. `npm run launchpad:protection`
 * reads `LPFeeLibrary.DYNAMIC_FEE_FLAG` out of `lib/v4-core` and fails on a divergence — a hardcoded
 * `0x800000` would keep compiling after an upstream change and keep producing wrong ids.
 */
export declare const LANE_POOL_FEE: Readonly<Record<ProtocolLane, number>>;
/**
 * The mined hook-address flag mask per lane.
 *
 * RC6 added `BEFORE_SWAP_FLAG` (0x0080) so the hook can return the launch-fee override, moving the
 * mask from `0x1440` to `0x14C0`. The mask is mined into the address and self-verified in the
 * hook's constructor, so a predictor using the wrong one produces an address the deploy rejects
 * with `BadHookAddress` — loudly, unlike the PoolId case, but still wrong.
 */
export declare const LANE_HOOK_FLAGS: Readonly<Record<ProtocolLane, number>>;
/** True when this lane's pools are dynamic-fee pools. */
export declare function laneIsDynamicFee(lane: ProtocolLane): boolean;
/**
 * The canonical PoolKey for a project, in a named lane.
 *
 * Mirrors RC5's `LaunchpadFactory._keyFor` and RC6's `LaunchPolicyV1.poolKeyFor`; the two differ in
 * the fee field and in nothing else. `counterAsset` is the OTHER side of the pair — WETH on the
 * single-quote lane, the selected quote asset on Robinhood's multi-quote lane — and it is sorted
 * against the token here rather than assumed.
 */
export declare function poolKeyForLane(lane: ProtocolLane, token: Address, hook: Address, counterAsset: Address): PoolKey;
/** v4-core `PoolIdLibrary.toId`: keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks)). */
export declare function poolIdForKey(key: PoolKey): Hex;
/** The PoolId for a project in a named lane. */
export declare function poolIdForLane(lane: ProtocolLane, token: Address, hook: Address, counterAsset: Address): Hex;
