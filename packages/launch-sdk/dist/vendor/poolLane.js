// SPDX-License-Identifier: MIT
// ---------------------------------------------------------------------------------------------
// PROTOCOL LANES — because RC5 and RC6 do not derive the same PoolId for the same project.
//
// THE DEFECT THIS EXISTS TO CLOSE. `PoolId` is
// `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))`, so `PoolKey.fee` is IN
// THE PREIMAGE. RC5 pools carry a static `10_000`. RC6 pools are DYNAMIC-FEE pools and carry
// `LPFeeLibrary.DYNAMIC_FEE_FLAG`, because v4-core only parses a hook's per-swap fee override when
// `key.fee.isDynamicFee()`. Deriving an RC6 PoolId with `10_000` therefore names a pool that does
// not exist — and it does not fail loudly. It returns a well-formed 32-byte id for which every
// subsequent read comes back empty, so prediction, indexing, project pages and explorer links all
// degrade into "not found" with nothing anywhere saying why.
//
// THE LANE IS A REQUIRED ARGUMENT, NOT A DEFAULT. Neither default is safe: defaulting to RC5
// leaves every RC6 derivation broken, and defaulting to RC6 breaks every RC5 pool. So there is no
// default. A caller that has not decided which protocol generation it is deriving for does not
// compile, which is the one form of "an omission fails" that cannot be forgotten in review.
//
// 10_000 IS STILL CORRECT FOR RC5, AND IT IS STILL THE RATE AN RC6 POOL SETTLES AT. The sentinel
// names WHO decides the fee, not what it settles at: an RC6 pool's stored LP fee is written to
// 1.00% at initialization, every disposal pays exactly that, and acquisitions decay to it. Do not
// "simplify" this file by replacing one with the other.
import { getAddress, keccak256, encodeAbiParameters } from "viem";
import { POOL_FEE_PIPS, TICK_SPACING } from "./constants.js";
import { DYNAMIC_FEE_FLAG } from "@relics/project-schema";
export const PROTOCOL_LANES = ["RC5", "RC6"];
/**
 * `PoolKey.fee` per lane.
 *
 * RC6's value is the v4-core sentinel, re-exported from `@v4-art-launchpad/launch-protection`
 * rather than written as a literal here, so it tracks the dependency. `npm run launchpad:protection`
 * reads `LPFeeLibrary.DYNAMIC_FEE_FLAG` out of `lib/v4-core` and fails on a divergence — a hardcoded
 * `0x800000` would keep compiling after an upstream change and keep producing wrong ids.
 */
export const LANE_POOL_FEE = Object.freeze({
    RC5: POOL_FEE_PIPS,
    RC6: DYNAMIC_FEE_FLAG,
});
/**
 * The mined hook-address flag mask per lane.
 *
 * RC6 added `BEFORE_SWAP_FLAG` (0x0080) so the hook can return the launch-fee override, moving the
 * mask from `0x1440` to `0x14C0`. The mask is mined into the address and self-verified in the
 * hook's constructor, so a predictor using the wrong one produces an address the deploy rejects
 * with `BadHookAddress` — loudly, unlike the PoolId case, but still wrong.
 */
export const LANE_HOOK_FLAGS = Object.freeze({
    RC5: 0x1440,
    RC6: 0x14c0,
});
/** True when this lane's pools are dynamic-fee pools. */
export function laneIsDynamicFee(lane) {
    return LANE_POOL_FEE[lane] === DYNAMIC_FEE_FLAG;
}
function assertLane(lane) {
    if (lane !== "RC5" && lane !== "RC6") {
        throw new TypeError(`unknown protocol lane ${String(lane)} — a PoolKey cannot be derived without one`);
    }
    return lane;
}
/**
 * The canonical PoolKey for a project, in a named lane.
 *
 * Mirrors RC5's `LaunchpadFactory._keyFor` and RC6's `LaunchPolicyV1.poolKeyFor`; the two differ in
 * the fee field and in nothing else. `counterAsset` is the OTHER side of the pair — WETH on the
 * single-quote lane, the selected quote asset on Robinhood's multi-quote lane — and it is sorted
 * against the token here rather than assumed.
 */
export function poolKeyForLane(lane, token, hook, counterAsset) {
    assertLane(lane);
    const t = getAddress(token);
    const c = getAddress(counterAsset);
    const tokenIsCurrency0 = t.toLowerCase() < c.toLowerCase();
    return {
        currency0: tokenIsCurrency0 ? t : c,
        currency1: tokenIsCurrency0 ? c : t,
        fee: LANE_POOL_FEE[lane],
        tickSpacing: TICK_SPACING,
        hooks: getAddress(hook),
    };
}
/** v4-core `PoolIdLibrary.toId`: keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks)). */
export function poolIdForKey(key) {
    return keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
}
/** The PoolId for a project in a named lane. */
export function poolIdForLane(lane, token, hook, counterAsset) {
    return poolIdForKey(poolKeyForLane(lane, token, hook, counterAsset));
}
