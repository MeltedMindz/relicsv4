// The ONE keccak the codebase commits with. Imported rather than reimplemented so the digest the
// server publishes and the digest the launch carries cannot come from two different functions.
import { keccak256Utf8 } from "@relics/project-schema";
import { RC6_LAUNCH_PARAMS_FIELDS } from "./generated/rc6LaunchParams.js";
export const ArtMode = {
    SOLIDITY_SVG: 0,
    JAVASCRIPT: 1,
};
export const StartingPreset = {
    LOW: 0,
    MID: 1,
    HIGH: 2,
};
/**
 * The creator-selected, IMMUTABLE burn policy of the PROJECT token (`BurnPolicy` in
 * src/interfaces/ILaunchpad.sol). It decides which token implementation the factory clones and can
 * never be changed afterwards — there is no setter, no admin and no migration.
 *
 * `NONE` is the default and nothing is pre-selected. A non-`NONE` policy means the project's own
 * `totalSupply` really can fall and a real `Transfer` to the zero address is emitted. That is a
 * property of a PROJECT token only; $RELICS has no burn function at all.
 */
export const BurnPolicy = {
    NONE: 0,
    HOLDER_BURN: 1,
    HOLDER_AND_ALLOWANCE_BURN: 2,
};
/**
 * THE CREATOR'S LAUNCH-PROTECTION ELECTION, made once and never changeable (`AntiSnipeMode` in
 * src/rc6/AntiSnipeTypes.sol).
 *
 * `UNSPECIFIED` is the zero value and the factory REFUSES it, so a launch that forgot to set this
 * cannot be mistaken for one that deliberately chose no protection. That is why this field has no
 * default in `CreatorInput` — unlike `BurnPolicy.NONE`, which is a real thing a creator can mean,
 * there is nothing a creator means by silence about a 98-minute fee schedule they cannot change
 * afterwards.
 *
 * THE NUMBERS ARE NOT A SECOND DECLARATION. They are the index into
 * `ANTI_SNIPE_WIRE_VALUES` in `@v4-art-launchpad/launch-protection`, which is the one place the
 * enum's wire order is written down for the off-chain surfaces. They are spelled out here so the
 * type is a literal union rather than `number`, and
 * `test/unit/launch-params-abi-parity.test.ts` asserts position-for-position that this object and
 * that array agree — and that both agree with the compiled `internalType` on the ABI field.
 */
export const AntiSnipeMode = {
    UNSPECIFIED: 0,
    NONE: 1,
    PROTECTED_98_MINUTES: 2,
};
const _launchParamsCoversTheStruct = true;
const _launchResultCoversTheStruct = true;
void _launchParamsCoversTheStruct;
void _launchResultCoversTheStruct;
/**
 * Tuple encoder for `launch(LaunchParams calldata)` / `predict(LaunchParams calldata, address)`.
 *
 * BUILT BY ITERATING THE GENERATED FIELD ORDER, not by writing the fields out again. viem encodes a
 * named tuple by looking each component up by name, so a hand-written literal that happens to be
 * missing a field encodes silently short — which is precisely how this SDK came to build
 * fifteen-field calldata for a seventeen-field struct. Iterating the generated list means the
 * encoder cannot be more or less than the struct, and the key ORDER of the returned object is the
 * struct's order, so anything that does read positionally reads it correctly too.
 */
export function launchParamsAsTuple(p) {
    const tuple = {};
    for (const field of RC6_LAUNCH_PARAMS_FIELDS) {
        const value = p[field];
        if (value === undefined) {
            throw new TypeError(`launchParamsAsTuple: LaunchParams is missing "${field}". Every field of the on-chain ` +
                "struct must be present — an absent one does not encode as a default, it shortens the " +
                "tuple and shifts every dynamic offset after it.");
        }
        tuple[field] = value;
    }
    return tuple;
}
/**
 * The resolver key for a canonical metadata URI: `keccak256(bytes(uri))`.
 *
 * ONE IMPLEMENTATION, used by the server that publishes to the resolver, the SDK that builds the
 * launch calldata, and any check that compares them. `keccak256Utf8` comes from the schema package
 * — the same function the rest of the codebase commits with — so this is a named use of an existing
 * hash, not a second one.
 *
 * Refuses anything but a canonical `ipfs://` URI. A gateway URL hashes to a different key, so the
 * resolver lookup would miss and `contractURI()` would return nothing — a failure that would only
 * surface after the launch, which is exactly when nothing can be changed.
 */
export function metadataDigestForUri(uri) {
    if (typeof uri !== "string" || !/^ipfs:\/\/[A-Za-z0-9]+(\/[^\s]*)?$/.test(uri)) {
        throw new TypeError(`metadataDigestForUri: expected a canonical ipfs:// URI, got ${JSON.stringify(uri)}`);
    }
    const hex = keccak256Utf8(uri);
    return (hex.startsWith("0x") ? hex : `0x${hex}`);
}
