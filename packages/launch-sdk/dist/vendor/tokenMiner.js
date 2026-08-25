// SPDX-License-Identifier: MIT
// Mines a CREATE2 `tokenSalt` for the ProjectToken clone so the deployed token address sorts on
// a chosen side of WETH. WETH sort order decides which currency slot (currency0/currency1) the
// project token occupies in the v4 PoolKey, which in turn decides which side of the range the
// genesis single-sided position opens on (see LaunchpadFactory._geometry). Mirrors the pattern in
// test/gas/LaunchGas.fork.t.sol `_mineTokenSaltBelowWeth`.
import { numberToHex } from "viem";
import { WETH } from "./constants.js";
import { predictTokenAddress } from "./predict.js";
/**
 * Brute-forces `salt = bytes32(i)`, i = 1, 2, ..., until the predicted ProjectToken clone address
 * satisfies the requested ordering against WETH. Direction "belowWeth" makes the project token
 * currency0 (the pattern this SDK defaults to, matching the reference gas-measurement test): the
 * genesis position then opens AT the launch-floor tick with active liquidity from tick 0.
 */
export function mineTokenSalt(opts) {
    const direction = opts.direction ?? "belowWeth";
    const sortTarget = BigInt(opts.sortAgainst ?? opts.weth ?? WETH);
    const maxIterations = opts.maxIterations ?? 100_000;
    const startAt = opts.startAt ?? 1;
    for (let i = startAt; i < startAt + maxIterations; i++) {
        const tokenSalt = numberToHex(i, { size: 32 });
        const tokenAddress = predictTokenAddress({
            factory: opts.factory,
            tokenImplementation: opts.tokenImplementation,
            tokenArgs: opts.tokenArgs,
            tokenSalt,
            launcher: opts.launcher,
        });
        const below = direction === "belowWeth" || direction === "belowQuote";
        const ok = below ? BigInt(tokenAddress) < sortTarget : BigInt(tokenAddress) > sortTarget;
        if (ok)
            return { tokenAddress, tokenSalt, attempts: i - startAt + 1 };
    }
    throw new Error(`mineTokenSalt: no salt found (direction=${direction}) within ${maxIterations} attempts`);
}
/**
 * Same collision concern as `mineHookSaltAvoidingCollision`: two launches with identical
 * (name, symbol, totalSupply, mintRecipient) tokenArgs would deterministically mine the same
 * tokenSalt. Verifies on-chain that the predicted address is unoccupied before returning it.
 */
export async function mineTokenSaltAvoidingCollision(opts) {
    const maxRounds = opts.maxRounds ?? 64;
    let startAt = opts.startAt ?? 1;
    let totalAttempts = 0;
    for (let round = 0; round < maxRounds; round++) {
        const result = mineTokenSalt({ ...opts, startAt });
        totalAttempts += result.attempts;
        if (!(await opts.hasCode(result.tokenAddress))) {
            return { ...result, attempts: totalAttempts, rounds: round + 1 };
        }
        startAt = startAt + result.attempts;
    }
    throw new Error(`mineTokenSaltAvoidingCollision: no free token address found within ${maxRounds} rounds`);
}
