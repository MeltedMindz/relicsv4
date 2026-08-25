// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ONE PLACE `launch(LaunchParams)` CALLDATA IS BUILT.
//
// Every launch this SDK produces goes through `encodeLaunchCalldata`, and it REFUSES an ABI whose
// `LaunchParams` is not, field for field and INDEX FOR INDEX, the struct the SDK's types describe.
//
// WHY A RUNTIME REFUSAL AND NOT JUST A TEST. The defect was not a wrong value; it was a correct
// params object handed to the wrong ABI. `sdk/contracts-abi/rc5/LaunchpadFactory.json` describes a
// fifteen-field struct that is live on three chains, and viem resolves a named tuple component by
// component: handed a seventeen-field object it silently DROPS the two it does not recognise and
// encodes a well-formed, wrong transaction. No exception, no warning, no decode error — a launch
// that either reverts opaquely or, worse, succeeds with `burnPolicy` reading whatever landed in its
// slot. A unit test can prove the right ABI is wired today; only a refusal at the encode site can
// stop the wrong one being wired tomorrow.
//
// The comparison is POSITIONAL because names alone cannot see the dangerous mutation.
// `burnPolicy`, `antiSnipeMode` are adjacent `uint8`s: swap them and every name exists, every type
// matches, and every launch elects the wrong burn policy and the wrong protection schedule.
// ================================================================================================
import { encodeFunctionData } from "viem";
import { RC6_LAUNCH_PARAMS_FIELDS } from "./generated/rc6LaunchParams.js";
import { launchParamsAsTuple } from "./types.js";
/** Raised when the ABI a caller supplied describes a different `LaunchParams` than the SDK builds. */
export class LaunchAbiGenerationMismatchError extends Error {
    abiFields;
    sdkFields;
    constructor(message, abiFields, sdkFields) {
        super(message);
        this.name = "LaunchAbiGenerationMismatchError";
        this.abiFields = abiFields;
        this.sdkFields = sdkFields;
    }
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
export function launchParamsComponentsOfFunction(abi, functionName) {
    const entry = abi.find((e) => e.type === "function" && e.name === functionName);
    const params = entry?.inputs?.[0];
    return params?.components ?? null;
}
/** The `LaunchParams` components of an ABI's `launch(...)`, or `null` when it has no such function. */
export function launchParamsComponentsOf(abi) {
    return launchParamsComponentsOfFunction(abi, "launch");
}
/**
 * Assert `abi` describes exactly the struct this SDK encodes. Throws on ANY difference — a missing
 * field, an extra field, or the same fields in a different order.
 *
 * Exported so a caller that wants to CHECK an ABI (a preflight, a gate, a route handler validating
 * its own wiring) can do so without building a transaction.
 */
export function assertAbiMatchesLaunchParams(abi, context = "this ABI") {
    assertAbiMatchesLaunchParamsOn(abi, "launch", context);
}
/**
 * The same assertion for any entrypoint whose FIRST argument is a `LaunchParams` — RC6's sale lane
 * spells it `SaleLaunchpadV1.launchSale(LaunchParams, LaunchMode, SaleTerms)` (finding FINAL-3).
 *
 * The sale lane needs this at least as much as the instant lane does, because the wrong ABI there
 * is not hypothetical: `contracts-abi/rc5/LaunchpadFactory.json` carries a `launchSale` whose
 * `LaunchParams` has FIFTEEN fields, viem drops the three it does not recognise without raising
 * anything, and the resulting transaction is well-formed and wrong.
 */
export function assertAbiMatchesLaunchParamsOn(abi, functionName, context = "this ABI") {
    const components = launchParamsComponentsOfFunction(abi, functionName);
    if (components === null) {
        throw new LaunchAbiGenerationMismatchError(`${context} has no ${functionName}(LaunchParams, ...) function`, [], [...RC6_LAUNCH_PARAMS_FIELDS]);
    }
    const abiFields = components.map((c) => c.name);
    const sdkFields = [...RC6_LAUNCH_PARAMS_FIELDS];
    if (abiFields.length === sdkFields.length && abiFields.every((name, index) => name === sdkFields[index]))
        return;
    const missing = sdkFields.filter((f) => !abiFields.includes(f));
    const extra = abiFields.filter((f) => !sdkFields.includes(f));
    const reordered = missing.length === 0 && extra.length === 0;
    const detail = reordered
        ? `the same fields in a different ORDER: ABI [${abiFields.join(", ")}] vs SDK [${sdkFields.join(", ")}]. ` +
            "ABI tuple encoding is positional, so this is a different transaction, not a different spelling."
        : `${missing.length ? `absent from the ABI: ${missing.join(", ")}. ` : ""}${extra.length ? `present only in the ABI: ${extra.join(", ")}. ` : ""}` +
            `The ABI describes ${abiFields.length} fields; this SDK builds ${sdkFields.length}. ` +
            "A shorter tuple does not raise a decode error — it shifts every dynamic offset after the missing field.";
    throw new LaunchAbiGenerationMismatchError(`${context} describes a different LaunchParams than this SDK encodes. ${detail} ` +
        "If you meant the DEPLOYED RC5 factory, its launch() takes a different struct and RC6 params cannot be sent to it; " +
        "if you meant RC6, load sdk/contracts-abi/rc6/LaunchpadFactoryV1.json (Rc6LaunchpadFactoryArtifact()).", abiFields, sdkFields);
}
/**
 * Encode `launch(params)` against `abi`, after proving `abi` is the struct these params belong to.
 *
 * Returns the calldata and the args actually encoded, so a caller can decode the SAME bytes back
 * and compare them to the creator's configuration without rebuilding anything.
 */
export function encodeLaunchCalldata(abi, params, context = "the supplied ABI") {
    assertAbiMatchesLaunchParams(abi, context);
    const args = [launchParamsAsTuple(params)];
    return { data: encodeFunctionData({ abi, functionName: "launch", args }), args };
}
