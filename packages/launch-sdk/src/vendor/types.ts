// SPDX-License-Identifier: MIT
// Mirrors src/interfaces/ILaunchpad.sol. FROZEN cross-agent surface; field order and names are
// identical to the Solidity struct because ABI encoding lines up POSITIONALLY.
//
// "Keep them identical" used to be an instruction. It is now a compile-time assertion: the field
// list is GENERATED from the compiled `LaunchpadFactoryV1` ABI into `generated/rc6LaunchParams.ts`,
// and the `Expect<...>` block below fails `tsc` if `keyof LaunchParams` and the generated union
// ever differ. That is what closes the defect this file shipped with — the struct grew
// `antiSnipeMode` and `metadataUriHash`, this mirror grew neither, and every launch the SDK built
// encoded a tuple two fields short of the one the factory decodes.
import type { Abi, Address, Hex } from "viem";
// The ONE keccak the codebase commits with. Imported rather than reimplemented so the digest the
// server publishes and the digest the launch carries cannot come from two different functions.
import { keccak256Utf8 } from "@relics/project-schema";
import { RC6_LAUNCH_PARAMS_FIELDS, type Rc6LaunchParamsField, type Rc6LaunchResultField } from "./generated/rc6LaunchParams.js";

/**
 * A fully-assembled, unsigned call ready for `walletClient.writeContract(tx)`. Every `build*()`
 * export in this SDK (buildCreatorClaim, buildPlatformConversion, buildPlatformClaim,
 * buildAwaken, buildRedeem) returns one of these (or `null` when the action is refused/ineligible
 * — see each function's typed result) rather than submitting anything itself. This SDK never
 * signs or broadcasts on a caller's behalf; every `build*` output is inert data until a caller's
 * own wallet client submits it.
 */
export interface PreparedTx {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  chainId: number;
}

export const ArtMode = {
  SOLIDITY_SVG: 0,
  JAVASCRIPT: 1,
} as const;
export type ArtModeValue = (typeof ArtMode)[keyof typeof ArtMode];

export const StartingPreset = {
  LOW: 0,
  MID: 1,
  HIGH: 2,
} as const;
export type StartingPresetValue = (typeof StartingPreset)[keyof typeof StartingPreset];

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
} as const;
export type BurnPolicyValue = (typeof BurnPolicy)[keyof typeof BurnPolicy];

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
} as const;
export type AntiSnipeModeValue = (typeof AntiSnipeMode)[keyof typeof AntiSnipeMode];

/** The two values a creator may elect. `UNSPECIFIED` is the refused zero, never a third choice. */
export type AntiSnipeElection = typeof AntiSnipeMode.NONE | typeof AntiSnipeMode.PROTECTED_98_MINUTES;

/** bps is a fraction of the CREATOR 75% only, never the platform 25%. */
export interface Collaborator {
  recipient: Address;
  bps: number; // uint16
}

/**
 * All creator inputs for one atomic launch. tokenSalt/hookSalt are mined OFF-CHAIN by this SDK
 * so the resulting addresses satisfy WETH ordering (token) and the hook mask of the generation
 * being launched — the RC5 mask for this RC5 shape, 0x14C0 for an RC6 one.
 */
export interface LaunchParams {
  name: string;
  symbol: string;
  totalSupply: bigint; // whole tokens * 1e18
  artworkBackingUnits: bigint; // whole units reserved as artwork backing
  startingPreset: StartingPresetValue;
  tokenSalt: Hex; // bytes32
  hookSalt: Hex; // bytes32
  artMode: ArtModeValue;
  artTemplateId: bigint; // registered template id (SOLIDITY_SVG), or 0 for JS
  artScriptHash: Hex; // bytes32, keccak256(artConfig)
  artConfig: Hex; // per-launch template config or raw JS script bytes
  marketStateConfig: Hex; // bounded config for the hook
  creatorRecipient: Address;
  collaborators: Collaborator[];
  /**
   * The creator-selected, immutable {BurnPolicy}. REQUIRED: the on-chain `LaunchParams` struct
   * carries this field, so a params object without it encodes to calldata the factory cannot
   * decode. It has no default here on purpose — `BurnPolicy.NONE` is a creator's choice to make,
   * not a value this layer supplies on their behalf.
   */
  burnPolicy: BurnPolicyValue;
  /**
   * THE CREATOR'S LAUNCH-PROTECTION ELECTION. REQUIRED, and deliberately not defaulted here.
   *
   * It sits between `burnPolicy` (uint8) and `metadataUriHash` (bytes32) in the struct, and both of
   * its neighbours in the head are 32-byte words like it is — which is exactly why NAMES ARE NOT
   * ENOUGH and this SDK checks POSITION. Swap this field with `burnPolicy` and every type still
   * matches, every name still exists, and every launch elects the wrong burn policy and the wrong
   * protection schedule. `test/unit/launch-params-abi-parity.test.ts` asserts index-for-index
   * against the compiled ABI for that reason.
   *
   * `AntiSnipeMode.UNSPECIFIED` (0) is REFUSED on chain. Passing it is not "no protection", it is a
   * launch nobody configured, and the factory reverts rather than opening an unprotected pool that
   * looks deliberate.
   */
  antiSnipeMode: AntiSnipeModeValue;
  /**
   * THE COLLECTION'S METADATA DIGEST — `keccak256(bytes(uri))` of the canonical `ipfs://` URI.
   *
   * REQUIRED, and a `bytes32` rather than the URI itself. A string here was measured at +173 bytes
   * on a factory with 29 to spare, because adding one changes the struct's calldata layout — so the
   * launch carries only this static digest and the URI reaches chain through
   * `MetadataResolverRc6.publish(uri)`, which the server calls before the launch. The creator still
   * signs exactly one transaction.
   *
   * IT IS NOT THE CONTENT HASH, DESPITE THE NAME. `metadataUriHash` is the settled field name
   * and is used verbatim, but the value is the RESOLVER KEY: keccak256 of the URI STRING, which is
   * what the resolver keys by and therefore what the collection needs to resolve `contractURI()`.
   * The sha256 of the JSON bytes is a different quantity that lives in the `.relics` bundle and
   * never reaches chain. Conflating them is the mistake this comment exists to prevent; see
   * `launchpad/packages/launch-protection/src/metadataCommitment.js`.
   *
   * Derive it with `metadataDigestForUri(uri)` rather than hashing here, so one implementation
   * produces every copy of this value.
   */
  metadataUriHash: Hex;
  /**
   * THE CREATOR'S NFT-EARNINGS ELECTION, PACKED INTO ONE WORD, SETTLED AT BIRTH.
   *
   * `mode | royaltyBps << 8 | validatorPolicyVersion << 24`; every bit at or above 40 is RESERVED
   * and REFUSED on chain rather than masked. Build it with `packCreatorEarnings` — never by hand,
   * and never by writing the shifts a second time.
   *
   * REQUIRED, and `0n` is a real value rather than an absent one: it decodes to
   * `NONE / 0 bps / no policy version`, which the launch SETTLES. Every RC6 launch receipt reads
   * `configured = true`, so there is no "elected nothing yet" state and no second transaction in
   * which to elect. An ENFORCED collection that launched without its election cannot be repaired:
   * the mode is a birth property.
   *
   * ONE WORD, NOT A STRUCT, AND THE REASON IS MEASURED. `LaunchParams` is decoded and re-encoded at
   * five sites inside the EIP-170-bounded factory, so every head word of this struct is paid for
   * five times: one extra static field costs 60 bytes and a four-field `CreatorEarningsConfig`
   * sub-struct costs 443. One word carries the whole election with 216 bits to spare.
   */
  creatorEarnings: bigint;
  /**
   * HOW MANY WHOLE PROJECT TOKENS BACK ONE ARTWORK — the creator's escrow-weight election, made
   * once, at launch, and never changeable afterwards.
   *
   * THE UNIT IS WHOLE TOKENS, NOT WEI. `1n` is full parity and the launch default. A project that
   * wants 25,000 tokens per artwork sends `25_000n`, NOT `25_000n * WHOLE_UNIT`; the collection
   * multiplies by 1e18 itself at every escrow and every release, so a wei value here is a 10^18
   * error that fails the on-chain supply invariant rather than launching anything.
   *
   * REQUIRED, and `0n` is REFUSED on chain rather than defaulted to parity: a collection's backing
   * terms are written at birth and there is no later transaction in which to correct them.
   *
   * `awaken(count)` pulls `count * backingUnitsPerArtwork * 1e18` from the awakener into escrow
   * before it mints, and only `redeem`/`redeemMany` release it — transferring an artwork does not.
   */
  backingUnitsPerArtwork: bigint;
}

/** Canonical addresses + identifiers returned by one launch. */
export interface LaunchResult {
  projectToken: Address;
  projectCollection: Address;
  artHook: Address;
  projectId: bigint;
  poolKey: PoolKey;
  poolId: Hex; // bytes32 PoolId
  genesisLiquidity: bigint;
}

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number; // uint24
  tickSpacing: number; // int24
  hooks: Address;
}

// ------------------------------------------------------------------------------------------------
// THE COMPILE-TIME TIE TO THE COMPILED STRUCT.
//
// `RC6_LAUNCH_PARAMS_FIELDS` is generated from launchpad/out/LaunchpadFactoryV1.sol by
// sdk/scripts/refresh-contracts-abi.mjs. These two lines make a field added to, removed from or
// renamed in the Solidity struct a `tsc` failure in this file rather than a shorter tuple in
// production calldata. A `@ts-expect-error` here is never the repair; the repair is the interface.
// ------------------------------------------------------------------------------------------------
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _launchParamsCoversTheStruct: Exact<keyof LaunchParams, Rc6LaunchParamsField> = true;
const _launchResultCoversTheStruct: Exact<keyof LaunchResult, Rc6LaunchResultField> = true;
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
export function launchParamsAsTuple(p: LaunchParams): Record<Rc6LaunchParamsField, unknown> {
  const tuple = {} as Record<Rc6LaunchParamsField, unknown>;
  for (const field of RC6_LAUNCH_PARAMS_FIELDS) {
    const value = p[field];
    if (value === undefined) {
      throw new TypeError(
        `launchParamsAsTuple: LaunchParams is missing "${field}". Every field of the on-chain ` +
          "struct must be present — an absent one does not encode as a default, it shortens the " +
          "tuple and shifts every dynamic offset after it.",
      );
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
export function metadataDigestForUri(uri: string): Hex {
  if (typeof uri !== "string" || !/^ipfs:\/\/[A-Za-z0-9]+(\/[^\s]*)?$/.test(uri)) {
    throw new TypeError(`metadataDigestForUri: expected a canonical ipfs:// URI, got ${JSON.stringify(uri)}`);
  }
  const hex = keccak256Utf8(uri);
  return (hex.startsWith("0x") ? hex : `0x${hex}`) as Hex;
}
