// SPDX-License-Identifier: MIT
// Types for `@relics/project-schema/art-selector` — the RC6 art selector word.
//
// The runtime is plain ESM JavaScript (see `src/art-selector.js`) so the same file runs unbuilt in
// Node, in a browser worker and inside a bundler; these declarations give a TypeScript consumer
// full typing without a compile step.

/** Where the elected art runtime id starts. `ArtSelectorLib.RUNTIME_ID_SHIFT`. Always `224n`. */
export declare const ART_SELECTOR_RUNTIME_ID_SHIFT: bigint;

/** Every bit a template id may occupy. `ArtSelectorLib.TEMPLATE_ID_MASK`. `2n ** 224n - 1n`. */
export declare const ART_SELECTOR_TEMPLATE_ID_MASK: bigint;

/** The largest legal art runtime id: `2n ** 32n - 1n`. The registry keys by a `uint32`. */
export declare const ART_SELECTOR_MAX_RUNTIME_ID: bigint;

/** The largest legal template id: `2n ** 224n - 1n`. Identical to the mask, by construction. */
export declare const ART_SELECTOR_MAX_TEMPLATE_ID: bigint;

/** The largest value a selector word can hold: `2n ** 256n - 1n`. */
export declare const ART_SELECTOR_MAX: bigint;

/**
 * The runtime-half value meaning "the creator expressed no preference" — `0`.
 * It is the art registry's reserved sentinel and can never NAME a runtime.
 */
export declare const ART_SELECTOR_NO_RUNTIME_PREFERENCE: 0;

/** Every verdict {@link validateArtSelector} can return. */
export type ArtSelectorCode =
  | "OK"
  | "NOT_AN_INTEGER"
  | "NEGATIVE"
  | "RUNTIME_ID_OVERFLOW"
  | "TEMPLATE_ID_OVERFLOW"
  | "SELECTOR_OVERFLOW"
  | "NO_RUNTIME_ELECTION"
  | "NO_TEMPLATE"
  | "BAD_INPUT";

export declare const ART_SELECTOR_CODES: readonly ArtSelectorCode[];

/** Anything this module accepts where an unsigned integer is expected. */
export type ArtSelectorIntegral = bigint | number | string;

/** Thrown by {@link encodeArtSelector} and {@link decodeArtSelector}. */
export declare class ArtSelectorError extends Error {
  readonly name: "ArtSelectorError";
  readonly code: ArtSelectorCode;
  constructor(code: ArtSelectorCode, message: string);
}

/**
 * The two halves of a selector word.
 *
 * `artRuntimeId` is a `number` because a `uint32` is exactly representable and every consumer
 * wants one; `templateId` is a `bigint` because a `uint224` is not, and a silent precision loss
 * there becomes a permanently wrong on-chain art binding.
 */
export interface ArtSelectorParts {
  artRuntimeId: number;
  templateId: bigint;
  selector: bigint;
}

export interface ArtSelectorVerdict {
  ok: boolean;
  code: ArtSelectorCode;
  reason: string;
  artRuntimeId: number | null;
  templateId: bigint | null;
  selector: bigint | null;
}

export interface ArtSelectorValidateOptions {
  /**
   * Refuse a zero runtime half. Set this whenever the caller means "this project ELECTS a runtime"
   * — zero is "no preference" and can never name one.
   */
  requireRuntimeElection?: boolean;
  /**
   * Refuse a zero template half. Set this for a launch-bound selector: `TemplateRegistryV1` refuses
   * to register id 0 and `LaunchPolicyV1.validateLaunchParams` reverts `BadTemplate`.
   */
  requireTemplate?: boolean;
}

/** Either half, or the packed word. Passing both is refused with `BAD_INPUT`. */
export type ArtSelectorInput =
  | ArtSelectorIntegral
  | { artRuntimeId?: ArtSelectorIntegral; templateId?: ArtSelectorIntegral; selector?: never }
  | { selector: ArtSelectorIntegral; artRuntimeId?: never; templateId?: never };

/**
 * Build a selector word. The template half is SILENTLY MASKED, exactly as `ArtSelectorLib.encode`
 * does; the runtime half is REFUSED when it exceeds `uint32`, because JavaScript has no `uint32()`
 * cast and masking it would bind a different runtime.
 */
export declare function encodeArtSelector(
  artRuntimeId: ArtSelectorIntegral,
  templateId: ArtSelectorIntegral,
): bigint;

/** Split a selector word. Mirrors `ArtSelectorLib.artRuntimeIdOf` + `templateIdOf`. */
export declare function decodeArtSelector(selector: ArtSelectorIntegral): ArtSelectorParts;

/** The registered-template half. Mirrors `ArtSelectorLib.templateIdOf`. */
export declare function templateIdOf(selector: ArtSelectorIntegral): bigint;

/** The elected-art-runtime half. Mirrors `ArtSelectorLib.artRuntimeIdOf`. `0` = no preference. */
export declare function artRuntimeIdOf(selector: ArtSelectorIntegral): number;

/** Whether a runtime-half value NAMES a runtime. False for `0`, the reserved sentinel. */
export declare function isRuntimeElection(artRuntimeId: unknown): boolean;

/** Check a selector, or the pair it would be built from, without throwing. */
export declare function validateArtSelector(
  input: ArtSelectorInput,
  options?: ArtSelectorValidateOptions,
): ArtSelectorVerdict;

// ---------------------------------------------------------------------------------------------
// DISCOVERING WHICH ART RUNTIME IDS EXIST ON A CHAIN
//
// The selector's runtime half is a key into `ArtRuntimeRegistryV1`, so enumerating the keys is the
// same subject. `runtimeCount()` is a COUNT, not `maxRuntimeId + 1`; these helpers reconcile the
// registration log, which is the only complete surface the registry offers.
// ---------------------------------------------------------------------------------------------

/** `RuntimeRegistered(uint32,address,uint8,uint16,bytes32)`. */
export declare const ART_RUNTIME_REGISTERED_SIGNATURE: string;
/** `topics[0]` of a registration log. Derived from the signature, never typed. */
export declare const ART_RUNTIME_REGISTERED_TOPIC0: `0x${string}`;
/** `RuntimeActiveSet(uint32,bool)`. */
export declare const ART_RUNTIME_ACTIVE_SET_SIGNATURE: string;
export declare const ART_RUNTIME_ACTIVE_SET_TOPIC0: `0x${string}`;
/** The id `registerRuntime` refuses by name (`ReservedRuntimeId`). Always `0`. */
export declare const ART_RUNTIME_RESERVED_ID: 0;
/** Largest key the registry's `uint32` can hold. */
export declare const ART_RUNTIME_MAX_ID: number;

/** The minimum a log must expose for this module to read it. */
export interface ArtRuntimeRegisteredLog {
  topics?: readonly string[];
}

export interface ArtRuntimeDiscovery {
  /** Distinct registered ids, ascending. */
  ids: number[];
  /** True only when the log set reconciles against `runtimeCount()`. */
  complete: boolean;
  observedCount: number;
  expectedCount: number | null;
  malformedLogs: number;
  duplicateIds: number[];
  reason: string;
}

/** The `uint32 runtimeId` in `topics[1]`, or `null`. Null is never coerced to `0`. */
export declare function runtimeIdFromRegisteredLog(log: ArtRuntimeRegisteredLog): number | null;

/**
 * Reconcile fetched logs into the registered id set. `runtimeCount` is an INDEPENDENT DENOMINATOR,
 * never a source of ids. An incomplete result is not an absence.
 */
export declare function discoverRegisteredRuntimeIds(
  logs: readonly ArtRuntimeRegisteredLog[],
  expectation?: { runtimeCount?: number | bigint | null },
): ArtRuntimeDiscovery;

/**
 * Whether a `runtimeInfo(id)` record actually names a runtime — the ZERO-ADDRESS TRAP guard.
 * `runtimeInfo` does not revert for an unregistered id; it returns a zero-address `exists: false`
 * record that a "did it resolve?" check reads as success.
 */
export declare function runtimeRecordNamesARuntime(record: unknown): boolean;
