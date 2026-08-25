// SPDX-License-Identifier: MIT
// ================================================================================================
// THE WIRE FORM. One encoding, used by both ends of the sidecar protocol.
//
// `SigningRequest` carries four `bigint`s and `JSON.stringify` throws on every one of them, so the
// protocol needs a representation. It is DECIMAL STRINGS, not numbers: `value` and
// `maxFeePerGas` routinely exceed 2^53, and a `number` there does not fail — it rounds, silently,
// and the signer then checks a ceiling against an amount that is not the one being signed.
//
// The decoder is STRICT and it is the only thing standing between a signer process and whatever
// posted to it. It rejects rather than coerces: a missing field, a float where an integer belongs,
// a `0x` string with an odd number of digits. Coercion is how a malformed request becomes a
// plausible one, and this side of the boundary is where a plausible request gets signed.
//
// A WIRE FAILURE IS NOT A POLICY REFUSAL, and this file never produces one. `SignerRefusal` means
// the signer read a well-formed request and declined it; a body that does not parse was never a
// policy question. Conflating them would put "the JSON was truncated" into the same channel an
// agent uses to decide whether to fix a plan or stop.
// ================================================================================================
import type { Address, Hex, SignerRefusal, SignerResult, SigningRequest } from "./contracts.ts";

/** Raised when a wire payload is not the shape the protocol declares. Never a refusal. */
export class WireFormatError extends Error {
  readonly field: string;
  constructor(field: string, detail: string) {
    super(`${field}: ${detail}`);
    this.name = "WireFormatError";
    this.field = field;
  }
}

/** `SigningRequest` with every `bigint` written as a decimal string. */
export interface WireSigningRequest {
  readonly chainId: number;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly data: string;
  readonly dataHash: string;
  readonly selector: string;
  readonly estimatedGas: string;
  readonly maxFeePerGas?: string;
  readonly maxPriorityFeePerGas?: string;
  readonly nonce?: number;
  readonly launchPlanHash: string;
  readonly bundleHash: string;
  readonly policyHash: string;
}

const HEX = /^0x([0-9a-fA-F]{2})*$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new WireFormatError(what, `expected an object, got ${Array.isArray(value) ? "an array" : typeof value}`);
  return value as Record<string, unknown>;
}

function requireHex(source: Record<string, unknown>, field: string): Hex {
  const value = source[field];
  if (typeof value !== "string" || !HEX.test(value)) throw new WireFormatError(field, `expected 0x-prefixed hex with an even number of digits, got ${JSON.stringify(value)}`);
  return value as Hex;
}

function requireUint(source: Record<string, unknown>, field: string): bigint {
  const value = source[field];
  // Only a decimal STRING. A JSON number is refused outright rather than range-checked, because the
  // rounding has already happened by the time this code sees it.
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new WireFormatError(field, `expected an unsigned decimal integer as a string, got ${JSON.stringify(value)}`);
  return BigInt(value);
}

function requireInt(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new WireFormatError(field, `expected a non-negative safe integer, got ${JSON.stringify(value)}`);
  return value;
}

export function encodeSigningRequest(request: SigningRequest): WireSigningRequest {
  return {
    chainId: request.chainId,
    from: request.from,
    to: request.to,
    value: request.value.toString(10),
    data: request.data,
    dataHash: request.dataHash,
    selector: request.selector,
    estimatedGas: request.estimatedGas.toString(10),
    ...(request.maxFeePerGas === undefined ? {} : { maxFeePerGas: request.maxFeePerGas.toString(10) }),
    ...(request.maxPriorityFeePerGas === undefined ? {} : { maxPriorityFeePerGas: request.maxPriorityFeePerGas.toString(10) }),
    ...(request.nonce === undefined ? {} : { nonce: request.nonce }),
    launchPlanHash: request.launchPlanHash,
    bundleHash: request.bundleHash,
    policyHash: request.policyHash,
  };
}

/**
 * Parse an untrusted payload into a `SigningRequest`.
 *
 * NOTHING HERE IS TRUSTED AFTERWARDS. This function proves the payload has the right SHAPE; the
 * policy guard then recomputes `keccak256(data)` and re-slices the selector, so a wire tamper that
 * survives this parse is caught by the checks that read the bytes rather than the fields.
 */
export function decodeSigningRequest(payload: unknown): SigningRequest {
  const source = requireObject(payload, "request");
  const from = requireHex(source, "from");
  const to = requireHex(source, "to");
  if (from.length !== 42) throw new WireFormatError("from", `expected a 20-byte address, got ${from.length - 2} hex digits`);
  if (to.length !== 42) throw new WireFormatError("to", `expected a 20-byte address, got ${to.length - 2} hex digits`);
  const request: SigningRequest = {
    chainId: requireInt(source, "chainId"),
    from: from as Address,
    to: to as Address,
    value: requireUint(source, "value"),
    data: requireHex(source, "data"),
    dataHash: requireHex(source, "dataHash"),
    selector: requireHex(source, "selector"),
    estimatedGas: requireUint(source, "estimatedGas"),
    ...(source.maxFeePerGas === undefined ? {} : { maxFeePerGas: requireUint(source, "maxFeePerGas") }),
    ...(source.maxPriorityFeePerGas === undefined ? {} : { maxPriorityFeePerGas: requireUint(source, "maxPriorityFeePerGas") }),
    ...(source.nonce === undefined ? {} : { nonce: requireInt(source, "nonce") }),
    launchPlanHash: requireHex(source, "launchPlanHash"),
    bundleHash: requireHex(source, "bundleHash"),
    policyHash: requireHex(source, "policyHash"),
  };
  return request;
}

/** A signer's answer, validated on arrival. A client that trusts a response shape has no boundary. */
export function decodeSignerResult(payload: unknown): SignerResult {
  const source = requireObject(payload, "result");
  const signerAddress = requireHex(source, "signerAddress");
  if (signerAddress.length !== 42) throw new WireFormatError("signerAddress", `expected a 20-byte address, got ${signerAddress.length - 2} hex digits`);
  if (source.kind === "SIGNED") return { kind: "SIGNED", rawTransaction: requireHex(source, "rawTransaction"), signerAddress: signerAddress as Address };
  if (source.kind === "BROADCAST") {
    const txHash = requireHex(source, "txHash");
    if (txHash.length !== 66) throw new WireFormatError("txHash", `expected a 32-byte hash, got ${txHash.length - 2} hex digits`);
    return { kind: "BROADCAST", txHash, signerAddress: signerAddress as Address };
  }
  throw new WireFormatError("kind", `expected "SIGNED" or "BROADCAST", got ${JSON.stringify(source.kind)}`);
}

/**
 * A refusal, validated on arrival.
 *
 * `code` is checked for SHAPE ONLY. `SignerRefusalCode` is a compile-time union in the shared
 * contracts with no runtime enumeration, and this package will not write a second copy of that list
 * to validate against — a local list is exactly the thing that drifts from the one the agent
 * branches on. The consequence is stated rather than hidden: a sidecar can return a code this
 * version of the agent does not know, and an agent's handling of refusal codes must therefore have
 * a real fallback arm rather than an exhaustiveness assertion.
 */
export function decodeSignerRefusal(payload: unknown): SignerRefusal {
  const source = requireObject(payload, "refusal");
  if (source.kind !== "REFUSED") throw new WireFormatError("kind", `expected "REFUSED", got ${JSON.stringify(source.kind)}`);
  if (typeof source.code !== "string" || source.code.length === 0) throw new WireFormatError("code", `expected a non-empty refusal code, got ${JSON.stringify(source.code)}`);
  if (typeof source.detail !== "string") throw new WireFormatError("detail", `expected a string, got ${typeof source.detail}`);
  return { kind: "REFUSED", code: source.code as SignerRefusal["code"], detail: source.detail };
}
