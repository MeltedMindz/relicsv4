// SPDX-License-Identifier: MIT
// ================================================================================================
// THE LAUNCH ENTRYPOINT, AS THIS SIGNER READS IT.
//
// The signer's job is to check BYTES, so it needs its own way to read them. Everything here is
// derived from two committed artifacts and nothing is typed in by hand:
//
//   * `packages/launch-sdk/contracts-abi/rc6/LaunchpadFactoryV1.json` — the compiled RC6 ABI.
//   * `packages/launch-sdk/src/vendor/generated/rc6LaunchParams.ts` — the SDK's own declaration of
//     the nineteen `LaunchParams` fields, IN THE SOLIDITY STRUCT'S ORDER.
//
// The selector is COMPUTED from the ABI rather than pasted, so a factory that renames or reshapes
// `launch` changes this constant instead of leaving a stale four bytes that no longer name
// anything. And the ABI is checked against the field list POSITIONALLY at load, because that is
// the failure this package cannot survive: `LaunchParams` is a positional tuple, `creatorRecipient`
// is field 12 of 19, and an ABI one field short does not raise a decode error — it shifts every
// dynamic offset after the gap, so the address this signer reads as "the creator's recipient" is a
// slice of some neighbouring field. A guard that compares the wrong twenty bytes to the policy is
// worse than no guard, because it reports a PASS.
//
// This file therefore refuses at import time rather than at call time. A mis-wired ABI is a
// property of the deployment, not of one request, and finding out on the first launch of the day
// is finding out too late.
// ================================================================================================
import { readFileSync } from "node:fs";
import { decodeFunctionData, toFunctionSelector, type Abi, type AbiFunction, type Address, type Hex } from "viem";
import { RC6_LAUNCH_PARAMS_FIELDS } from "../../launch-sdk/src/vendor/generated/rc6LaunchParams.ts";

/** Raised when the committed ABI does not describe the struct this signer decodes. */
export class LaunchAbiShapeError extends Error {
  readonly abiFields: readonly string[];
  readonly expectedFields: readonly string[];
  constructor(message: string, abiFields: readonly string[], expectedFields: readonly string[]) {
    super(message);
    this.name = "LaunchAbiShapeError";
    this.abiFields = abiFields;
    this.expectedFields = expectedFields;
  }
}

/** Raised when calldata carrying the launch selector cannot be decoded back into `LaunchParams`. */
export class LaunchCalldataDecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LaunchCalldataDecodeError";
  }
}

const ARTIFACT_URL = new URL("../../launch-sdk/contracts-abi/rc6/LaunchpadFactoryV1.json", import.meta.url);

interface AbiComponent {
  readonly name: string;
  readonly type: string;
}

function loadFactoryAbi(): Abi {
  const artifact = JSON.parse(readFileSync(ARTIFACT_URL, "utf8")) as { abi?: Abi };
  const abi = artifact.abi;
  if (!Array.isArray(abi)) {
    throw new LaunchAbiShapeError(`${ARTIFACT_URL.pathname} carries no \`abi\` array`, [], RC6_LAUNCH_PARAMS_FIELDS);
  }
  return abi;
}

/** The compiled RC6 `LaunchpadFactoryV1` ABI, exactly as committed. */
export const LAUNCH_FACTORY_ABI: Abi = loadFactoryAbi();

/** The one entrypoint this signer will sign for. */
export const LAUNCH_FUNCTION_NAME = "launch" as const;

function launchAbiItem(abi: Abi): AbiFunction {
  const item = abi.find((entry) => entry.type === "function" && entry.name === LAUNCH_FUNCTION_NAME);
  if (!item) {
    throw new LaunchAbiShapeError(`the committed factory ABI has no ${LAUNCH_FUNCTION_NAME}(...) function`, [], RC6_LAUNCH_PARAMS_FIELDS);
  }
  return item as AbiFunction;
}

/**
 * Prove the ABI's `LaunchParams` is the struct this signer decodes — field for field and INDEX for
 * index. Names alone cannot see the dangerous mutation: `burnPolicy` and `antiSnipeMode` are
 * adjacent `uint8`s, so a swapped pair keeps every name and every type while meaning something
 * else entirely.
 */
function assertLaunchParamsShape(abi: Abi): readonly AbiComponent[] {
  const item = launchAbiItem(abi);
  const components = (item.inputs?.[0] as { components?: AbiComponent[] } | undefined)?.components;
  if (!Array.isArray(components)) {
    throw new LaunchAbiShapeError(`${LAUNCH_FUNCTION_NAME}'s first argument is not a struct in the committed ABI`, [], RC6_LAUNCH_PARAMS_FIELDS);
  }
  const abiFields = components.map((c) => c.name);
  const expected = RC6_LAUNCH_PARAMS_FIELDS;
  const same = abiFields.length === expected.length && abiFields.every((name, index) => name === expected[index]);
  if (!same) {
    throw new LaunchAbiShapeError(
      `the committed factory ABI describes a different LaunchParams than this signer decodes: ` +
        `ABI [${abiFields.join(", ")}] vs SDK [${expected.join(", ")}]. ` +
        `Tuple encoding is positional, so this is a different transaction, not a different spelling.`,
      abiFields,
      expected,
    );
  }
  return components;
}

const LAUNCH_PARAMS_COMPONENTS = assertLaunchParamsShape(LAUNCH_FACTORY_ABI);

/**
 * THE WHOLE DECODED STRUCT, for the checks that need more than the recipient.
 *
 * 4.1.0 decoded exactly one field because that was the only one policy bounded. A grant now bounds
 * the runtime, the anti-snipe election and the royalty too, and every one of those must be read out
 * of the BYTES for the same reason the recipient is: an auxiliary JSON field beside the calldata is
 * a claim, and the calldata is the transaction.
 */
export function decodeLaunchParamsFromCalldata(data: Hex): Record<string, unknown> {
  const { args } = decodeFunctionData({ abi: LAUNCH_FACTORY_ABI, data });
  const params = (args as readonly unknown[])[0] as Record<string, unknown> | undefined;
  if (!params || typeof params !== "object") {
    throw new LaunchCalldataDecodeError("launch() calldata decoded but carried no LaunchParams struct");
  }
  // THE FIELD COUNT IS A CHECK, NOT A FORMALITY. A tuple that decoded with the wrong arity means
  // the ABI and the bytes disagree, and a positional tuple that disagrees is a different transaction.
  const present = RC6_LAUNCH_PARAMS_FIELDS.filter((f) => params[f] !== undefined);
  if (present.length !== RC6_LAUNCH_PARAMS_FIELDS.length) {
    throw new LaunchCalldataDecodeError(
      `LaunchParams decoded with ${present.length} of ${RC6_LAUNCH_PARAMS_FIELDS.length} fields present. ` +
        "A short positional tuple is not a partial transaction; it is a different one.",
    );
  }
  return params;
}

/** How many fields the struct must have. Read from the SDK's generated list, never typed here. */
export const LAUNCH_PARAMS_FIELD_COUNT = RC6_LAUNCH_PARAMS_FIELDS.length;

/** Index of `creatorRecipient` in the struct, taken from the SDK's declaration rather than typed. */
export const CREATOR_RECIPIENT_FIELD_INDEX = RC6_LAUNCH_PARAMS_FIELDS.indexOf("creatorRecipient");

if (CREATOR_RECIPIENT_FIELD_INDEX < 0 || LAUNCH_PARAMS_COMPONENTS[CREATOR_RECIPIENT_FIELD_INDEX]?.type !== "address") {
  throw new LaunchAbiShapeError(
    "LaunchParams has no `creatorRecipient` address field; this signer cannot check a launch it cannot read a recipient out of",
    LAUNCH_PARAMS_COMPONENTS.map((c) => c.name),
    RC6_LAUNCH_PARAMS_FIELDS,
  );
}

/** `launch(LaunchParams)`'s four-byte selector, computed from the committed ABI. */
export const LAUNCH_SELECTOR: Hex = toFunctionSelector(launchAbiItem(LAUNCH_FACTORY_ABI));

/**
 * THE WHOLE ALLOWLIST. One selector, because an agent policy authorizes a LAUNCH and nothing else.
 *
 * `launchWithQuote` is deliberately absent. It is a real factory entrypoint and a creator may
 * genuinely want it, but its first argument is a different struct in a different position, so this
 * package could not read a recipient out of its calldata — and a selector admitted without a
 * recipient check is a selector this signer cannot police. Adding it means teaching the decoder its
 * shape first, not widening this set.
 */
export const ALLOWED_SELECTORS: readonly Hex[] = Object.freeze([LAUNCH_SELECTOR]);

/**
 * The `creatorRecipient` INSIDE `data`, decoded from the bytes that will actually be signed.
 *
 * Never accept a caller-supplied recipient in place of this. The orchestrator that built the
 * transaction is exactly the component whose mistake — or capture — this check exists to catch, so
 * asking it what it put in the calldata answers the wrong question.
 */
export function decodeCreatorRecipient(data: Hex): Address {
  const selector = data.slice(0, 10).toLowerCase();
  if (selector !== LAUNCH_SELECTOR.toLowerCase()) {
    throw new LaunchCalldataDecodeError(`calldata carries selector ${selector}, not ${LAUNCH_SELECTOR} (${LAUNCH_FUNCTION_NAME}); there is no LaunchParams to read`);
  }
  let decoded: { readonly args?: readonly unknown[] | undefined };
  try {
    decoded = decodeFunctionData({ abi: LAUNCH_FACTORY_ABI, data });
  } catch (cause) {
    throw new LaunchCalldataDecodeError("calldata carries the launch selector but its body does not decode as LaunchParams", { cause });
  }
  const params = decoded.args?.[0] as Record<string, unknown> | undefined;
  const recipient = params?.creatorRecipient;
  // Reading by NAME is only safe because `assertLaunchParamsShape` already proved this ABI's field
  // order is the SDK's. Without that proof the name would resolve against whatever tuple the ABI
  // happened to describe.
  if (typeof recipient !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    throw new LaunchCalldataDecodeError(`LaunchParams decoded, but \`creatorRecipient\` is not an address: ${String(recipient)}`);
  }
  return recipient as Address;
}
