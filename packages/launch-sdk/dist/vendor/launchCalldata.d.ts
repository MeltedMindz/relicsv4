import { type Abi, type Hex } from "viem";
import { type LaunchParams } from "./types.js";
/** Raised when the ABI a caller supplied describes a different `LaunchParams` than the SDK builds. */
export declare class LaunchAbiGenerationMismatchError extends Error {
    readonly abiFields: string[];
    readonly sdkFields: string[];
    constructor(message: string, abiFields: string[], sdkFields: string[]);
}
interface AbiComponent {
    name: string;
    type: string;
    components?: AbiComponent[];
}
/**
 * The `LaunchParams` components of an ABI's `<functionName>(LaunchParams, ...)`, or `null` when the
 * ABI has no such function.
 *
 * PARAMETERISED BY THE ENTRYPOINT BECAUSE RC6 HAS TWO OF THEM (finding FINAL-3). The instant lane's
 * is `LaunchpadFactoryV1.launch(LaunchParams)`; the sale lane's is
 * `SaleLaunchpadV1.launchSale(LaunchParams, LaunchMode, SaleTerms)`. Both take the SAME struct in
 * the SAME first position and both are encoded positionally, so both are exposed to the identical
 * silent-shift failure — and the sale lane is where it actually shipped.
 */
export declare function launchParamsComponentsOfFunction(abi: Abi, functionName: string): AbiComponent[] | null;
/** The `LaunchParams` components of an ABI's `launch(...)`, or `null` when it has no such function. */
export declare function launchParamsComponentsOf(abi: Abi): AbiComponent[] | null;
/**
 * Assert `abi` describes exactly the struct this SDK encodes. Throws on ANY difference — a missing
 * field, an extra field, or the same fields in a different order.
 *
 * Exported so a caller that wants to CHECK an ABI (a preflight, a gate, a route handler validating
 * its own wiring) can do so without building a transaction.
 */
export declare function assertAbiMatchesLaunchParams(abi: Abi, context?: string): void;
/**
 * The same assertion for any entrypoint whose FIRST argument is a `LaunchParams` — RC6's sale lane
 * spells it `SaleLaunchpadV1.launchSale(LaunchParams, LaunchMode, SaleTerms)` (finding FINAL-3).
 *
 * The sale lane needs this at least as much as the instant lane does, because the wrong ABI there
 * is not hypothetical: `contracts-abi/rc5/LaunchpadFactory.json` carries a `launchSale` whose
 * `LaunchParams` has FIFTEEN fields, viem drops the three it does not recognise without raising
 * anything, and the resulting transaction is well-formed and wrong.
 */
export declare function assertAbiMatchesLaunchParamsOn(abi: Abi, functionName: string, context?: string): void;
/**
 * Encode `launch(params)` against `abi`, after proving `abi` is the struct these params belong to.
 *
 * Returns the calldata and the args actually encoded, so a caller can decode the SAME bytes back
 * and compare them to the creator's configuration without rebuilding anything.
 */
export declare function encodeLaunchCalldata(abi: Abi, params: LaunchParams, context?: string): {
    data: Hex;
    args: readonly unknown[];
};
export {};
