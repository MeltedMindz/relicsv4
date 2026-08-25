import { type Address, type Hex } from "viem";
import type { CodeAtChecker } from "./hookMiner.js";
export interface TokenMineResult {
    tokenAddress: Address;
    tokenSalt: Hex;
    attempts: number;
}
/**
 * Which side of the QUOTE ASSET the project token must sort on.
 *
 * `belowWeth`/`aboveWeth` are the original WETH-lane spellings and remain exact synonyms of
 * `belowQuote`/`aboveQuote`. They are NOT deprecated by accident: on a pool quoted against a
 * non-WETH asset the sort target is that asset, and WETH is not one of the two currencies at all,
 * so a caller that thinks in terms of WETH there is already wrong. Pass `sortAgainst` (or the
 * legacy `weth` option) with the SELECTED QUOTE on the multi-quote lane.
 */
export type SortDirection = "belowWeth" | "aboveWeth" | "belowQuote" | "aboveQuote";
/**
 * Brute-forces `salt = bytes32(i)`, i = 1, 2, ..., until the predicted ProjectToken clone address
 * satisfies the requested ordering against WETH. Direction "belowWeth" makes the project token
 * currency0 (the pattern this SDK defaults to, matching the reference gas-measurement test): the
 * genesis position then opens AT the launch-floor tick with active liquidity from tick 0.
 */
export declare function mineTokenSalt(opts: {
    factory: Address;
    tokenImplementation: Address;
    tokenArgs: Hex;
    direction?: SortDirection;
    /** The address the project token is sorted against. Defaults to `weth`, then to the chain WETH. */
    sortAgainst?: Address;
    weth?: Address;
    maxIterations?: number;
    startAt?: number;
    /**
     * The address that will CALL `launch` (M-01). The mined salt is valid for this launcher and
     * no other, so the sort order it establishes only holds for that launcher's launch.
     */
    launcher: Address;
}): TokenMineResult;
/**
 * Same collision concern as `mineHookSaltAvoidingCollision`: two launches with identical
 * (name, symbol, totalSupply, mintRecipient) tokenArgs would deterministically mine the same
 * tokenSalt. Verifies on-chain that the predicted address is unoccupied before returning it.
 */
export declare function mineTokenSaltAvoidingCollision(opts: Parameters<typeof mineTokenSalt>[0] & {
    hasCode: CodeAtChecker;
    maxRounds?: number;
}): Promise<TokenMineResult & {
    rounds: number;
}>;
