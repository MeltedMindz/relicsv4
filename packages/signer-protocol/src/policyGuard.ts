// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ENFORCEMENT. Everything this file checks, it checks AGAINST THE BYTES, ITSELF.
//
// The agent that built a transaction is the component whose failure this guard exists to catch —
// a prompt-injected plan, a swapped config file, a rebuilt bundle after the creator approved the
// last one. So nothing here is taken on the orchestrator's word:
//
//   * the calldata hash is RECOMPUTED from `data`, never read out of `dataHash`;
//   * the selector is taken from the first four bytes of `data`, never out of `selector`;
//   * the creator's recipient is DECODED out of `data`, never supplied beside it.
//
// Two things are deliberately supplied by the caller instead of looked up here:
//
//   * THE CANONICAL FACTORY ADDRESS. If this guard resolved the factory itself it would resolve it
//     from the same deployment table the orchestrator used to build the transaction, and a poisoned
//     table would then satisfy both sides at once. Taking it from the approved build means the
//     address was fixed at approval time, before the request existed.
//   * THE POLICY AND ITS THREE HASHES. Same argument: the creator approved a policy, a plan and a
//     bundle, and the signer's question is whether THIS request is the one that was approved.
//
// WHAT THIS GUARD DOES NOT CHECK, and why the gap is deliberate. `policy.goal`,
// `policy.allowBroadcast` and `policy.requireSimulation` are orchestrator gates: they decide
// whether a request should ever be built. There is no `SignerRefusalCode` for them, and inventing
// one here would put a code in the signer's vocabulary that the agent's exhaustive handling does
// not know. A `BUILD_ONLY` run refuses upstream by never producing an approved build, which lands
// here as `NO_APPROVED_BUILD`.
// ================================================================================================
import { keccak256, type Address, type Hex } from "viem";
import type { AgentPolicy, SignerRefusal, SignerRefusalCode, SigningRequest } from "./contracts.ts";
import { ALLOWED_SELECTORS, LAUNCH_SELECTOR, LaunchCalldataDecodeError, decodeCreatorRecipient } from "./launchAbi.ts";

/**
 * What the creator approved, captured BEFORE the signing request existed.
 *
 * The three hashes are the join between an approval and a transaction. A signer that checked only
 * `to` and `data` would happily sign a well-formed launch built from a policy the creator never
 * read, or from a bundle edited after it was simulated.
 */
export interface ApprovedBuild {
  /** The chain the build was approved for. A request for any other chain is not this build. */
  readonly chainId: number;
  /** The canonical RC6 factory for `chainId`, established upstream and frozen at approval. */
  readonly factory: Address;
  readonly policyHash: Hex;
  readonly launchPlanHash: Hex;
  readonly bundleHash: Hex;
}

/** The guard's answer. `ALLOWED` is the only value that permits a signature. */
export type PolicyVerdict = { readonly kind: "ALLOWED" } | SignerRefusal;

export interface PolicyGuardInput {
  readonly request: SigningRequest;
  readonly policy: AgentPolicy;
  /** `null` when no build was ever approved — refused, never treated as "no constraints". */
  readonly approvedBuild: ApprovedBuild | null | undefined;
}

import { checkGrantPermission, checkGrantCalldata, type SimulationReceipt } from "./grantGuard.ts";

function refuse(code: SignerRefusalCode, detail: string): SignerRefusal {
  return { kind: "REFUSED", code, detail };
}

const ALLOWED: PolicyVerdict = Object.freeze({ kind: "ALLOWED" as const });

/** Hex compared as VALUE, not as text: `0xAB…` and `0xab…` are the same twenty or thirty-two bytes. */
function sameHex(a: unknown, b: unknown): boolean {
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}

const ADDRESS_SHAPE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_SHAPE = /^0x[0-9a-fA-F]{64}$/;
const CALLDATA_SHAPE = /^0x([0-9a-fA-F]{2})*$/;

/**
 * EVERY CHECK EXCEPT THE ONE THAT NEEDS THE SIGNER ITSELF.
 *
 * Synchronous and total: it reads only the request, the policy and the approved build, so a caller
 * can run it in a preflight, in a test, or on a server that has not yet chosen an adapter. Order is
 * load-bearing where one check makes another meaningless — the calldata hash is verified BEFORE the
 * recipient is decoded, so a mutated body is reported as the tampering it is rather than as a
 * recipient the creator never chose.
 */
export function checkStaticPolicy(input: PolicyGuardInput): PolicyVerdict {
  const { request, policy, approvedBuild } = input;

  // NO APPROVED BUILD IS NOT "NO CONSTRAINTS". Without one there is nothing to compare the three
  // hashes or the target address against, so every check below would pass vacuously. Absence of an
  // approval is a refusal, and it is the first one because it is the reason the rest cannot run.
  if (!approvedBuild) {
    return refuse("NO_APPROVED_BUILD", "no approved build is bound to this signer; there is nothing this request can be shown to match");
  }

  // CHAIN. `allowedChains` is the creator's list, not the agent's preference. A chain absent from
  // it may still be a chain the signer can reach and the factory exists on — which is exactly why
  // the policy has to be consulted rather than inferred from capability.
  if (!policy.allowedChains.includes(request.chainId)) {
    return refuse("CHAIN_NOT_ALLOWED", `chain ${request.chainId} is not in the policy's allowedChains [${policy.allowedChains.join(", ")}]`);
  }

  // TARGET. An approved build names the factory for ONE chain. The RC6 factory happens to share a
  // CREATE2 address across Ethereum, Base and Robinhood, so a same-address comparison would pass on
  // a chain nobody approved — the address alone cannot tell those three apart. Refusing here says
  // the honest thing: this build cannot show that `to` is canonical for the chain being asked.
  if (approvedBuild.chainId !== request.chainId) {
    return refuse(
      "TARGET_NOT_CANONICAL_FACTORY",
      `the approved build names the factory for chain ${approvedBuild.chainId}; this request is for chain ${request.chainId}, so its target cannot be shown canonical`,
    );
  }
  if (!ADDRESS_SHAPE.test(request.to)) {
    return refuse("TARGET_NOT_CANONICAL_FACTORY", `\`to\` is not an address: ${String(request.to)}`);
  }
  if (!sameHex(request.to, approvedBuild.factory)) {
    return refuse("TARGET_NOT_CANONICAL_FACTORY", `\`to\` is ${request.to}; the approved canonical factory for chain ${request.chainId} is ${approvedBuild.factory}`);
  }

  // SELECTOR — READ OUT OF THE BYTES. `request.selector` is a claim the request makes about itself,
  // and a request that claims `launch` while carrying an ERC-20 `transfer` body is precisely the
  // shape of the attack. So the four bytes are sliced off `data` and BOTH are required to be the
  // launch selector: the one in the bytes, and the one the request declared.
  if (typeof request.data !== "string" || !CALLDATA_SHAPE.test(request.data) || request.data.length < 10) {
    return refuse("SELECTOR_NOT_ALLOWED", `\`data\` is not calldata carrying a four-byte selector: ${String(request.data).slice(0, 24)}`);
  }
  const actualSelector = request.data.slice(0, 10).toLowerCase() as Hex;
  if (!ALLOWED_SELECTORS.some((allowed) => allowed.toLowerCase() === actualSelector)) {
    return refuse("SELECTOR_NOT_ALLOWED", `calldata calls ${actualSelector}; this signer signs only ${LAUNCH_SELECTOR} (launch(LaunchParams))`);
  }
  if (!sameHex(request.selector, actualSelector)) {
    return refuse("SELECTOR_NOT_ALLOWED", `the request declares selector ${String(request.selector)} but its calldata calls ${actualSelector}`);
  }

  // VALUE. A launch's own cost is gas; a non-zero `value` is the creator's money leaving with the
  // transaction, so it is bounded by a number the creator wrote rather than by what fits.
  if (typeof request.value !== "bigint") {
    return refuse("VALUE_EXCEEDS_POLICY", `\`value\` is not a bigint (${typeof request.value}); an unreadable amount is not a bounded one`);
  }
  if (request.value > policy.maxNativeSpendWei) {
    return refuse("VALUE_EXCEEDS_POLICY", `value ${request.value} wei exceeds the policy ceiling of ${policy.maxNativeSpendWei} wei`);
  }

  // GAS. The ceiling bounds what one transaction can burn if it reverts late, which is the loss a
  // runaway build actually produces — a launch that reverts still pays for everything it did.
  if (typeof request.estimatedGas !== "bigint") {
    return refuse("GAS_EXCEEDS_POLICY", `\`estimatedGas\` is not a bigint (${typeof request.estimatedGas})`);
  }
  if (request.estimatedGas > policy.maxTransactionGas) {
    return refuse("GAS_EXCEEDS_POLICY", `estimatedGas ${request.estimatedGas} exceeds the policy ceiling of ${policy.maxTransactionGas}`);
  }

  // GAS PRICE — CHECKED ONLY WHEN PRESENT, because a legacy or provider-priced transaction carries
  // none and an absent field is not a zero. An absent fee is a request the signer cannot price; the
  // ceiling it would have been compared to is the caller's to enforce upstream.
  if (request.maxFeePerGas !== undefined) {
    if (typeof request.maxFeePerGas !== "bigint") {
      return refuse("GAS_PRICE_EXCEEDS_POLICY", `\`maxFeePerGas\` is present but not a bigint (${typeof request.maxFeePerGas})`);
    }
    if (request.maxFeePerGas > policy.maxGasPriceWei) {
      return refuse("GAS_PRICE_EXCEEDS_POLICY", `maxFeePerGas ${request.maxFeePerGas} wei exceeds the policy ceiling of ${policy.maxGasPriceWei} wei`);
    }
  }

  // CALLDATA HASH — RECOMPUTED. This is the check that makes every other one about `data` mean
  // something: it proves the bytes in front of the signer are the bytes that were hashed, simulated
  // and approved. A signer that trusted `dataHash` would validate a hash and sign a body.
  if (!BYTES32_SHAPE.test(request.dataHash)) {
    return refuse("CALLDATA_HASH_MISMATCH", `\`dataHash\` is not a 32-byte hex value: ${String(request.dataHash)}`);
  }
  const recomputed = keccak256(request.data);
  if (!sameHex(recomputed, request.dataHash)) {
    return refuse("CALLDATA_HASH_MISMATCH", `keccak256(data) is ${recomputed}; the request carries dataHash ${request.dataHash}`);
  }

  // THE THREE APPROVAL HASHES. Separate codes because they fail for different reasons and an agent
  // does different things about them: a policy hash that moved means the creator's authorization
  // was edited, a plan hash that moved means the transaction was rebuilt, a bundle hash that moved
  // means the art changed. Collapsing them into one code would tell the agent only that something
  // moved.
  if (!sameHex(request.policyHash, approvedBuild.policyHash)) {
    return refuse("POLICY_HASH_MISMATCH", `the request carries policyHash ${String(request.policyHash)}; the approved build was authorized under ${approvedBuild.policyHash}`);
  }
  if (!sameHex(request.launchPlanHash, approvedBuild.launchPlanHash)) {
    return refuse("LAUNCH_PLAN_HASH_MISMATCH", `the request carries launchPlanHash ${String(request.launchPlanHash)}; the approved build is ${approvedBuild.launchPlanHash}`);
  }
  if (!sameHex(request.bundleHash, approvedBuild.bundleHash)) {
    return refuse("BUNDLE_HASH_MISMATCH", `the request carries bundleHash ${String(request.bundleHash)}; the approved build is ${approvedBuild.bundleHash}`);
  }

  // THE RECIPIENT, OUT OF THE CALLDATA. `creatorRecipient` is field 12 of a nineteen-field
  // positional tuple and it is the one field an attacker gains anything by changing: it takes the
  // project's ProjectRights NFT and its 75% fee stream. Everything above can be correct — right
  // chain, right factory, right selector, right hashes — while this field names someone else.
  let recipient: Address;
  try {
    recipient = decodeCreatorRecipient(request.data);
  } catch (cause) {
    // AN UNREAD RECIPIENT IS NOT A MATCHING ONE. Refusing on the same code is the fail-closed
    // answer: the guard is saying it could not show the recipient is the creator's, which is the
    // only thing that would let it sign.
    const why = cause instanceof LaunchCalldataDecodeError ? cause.message : String(cause);
    return refuse("RECIPIENT_NOT_POLICY_RECIPIENT", `the creatorRecipient could not be read out of the calldata, so it cannot be shown to be the creator's: ${why}`);
  }
  if (!sameHex(recipient, policy.creatorRecipient)) {
    return refuse("RECIPIENT_NOT_POLICY_RECIPIENT", `the calldata names creatorRecipient ${recipient}; the policy authorizes ${policy.creatorRecipient}`);
  }

  return ALLOWED;
}

/** The one capability the guard needs from a signer, kept minimal so the guard imports no adapter. */
export interface ChainSupportProbe {
  supportsChain(chainId: number): Promise<boolean>;
}

/**
 * The whole guard: every static check, then the signer's own answer about the chain.
 *
 * The chain question is asked LAST and asked of the signer rather than inferred, because "the
 * policy allows chain 1" and "this signer will sign for chain 1" are different facts. A development
 * signer refuses every production chain by design (`adapters/devKeystore.ts`), and that refusal has
 * to reach the agent as a typed code rather than as a signature nobody expected.
 */
export async function guardSigningRequest(
  input: PolicyGuardInput & { readonly signer: ChainSupportProbe; readonly simulation?: SimulationReceipt | null; readonly requireGrant?: boolean },
): Promise<PolicyVerdict> {
  // ---- THE GRANT COMES FIRST -------------------------------------------------------------------
  //
  // Whether the creator still permits ANY launch is cheaper to answer than whether this particular
  // transaction has the right shape, and a revoked or expired grant makes the shape irrelevant. It
  // also means a spent authorization refuses before the signer decodes bytes it will never sign.
  //
  // `requireGrant` defaults to TRUE. It exists so the 4.1.0 unit tests — which predate the grant
  // model and construct a request directly — can exercise the shape checks in isolation. Production
  // never sets it: `signerServer` requires a grant unconditionally.
  const grantRequired = input.requireGrant !== false;

  // PHASE 1 — permission. No calldata is touched, so an expired or revoked grant refuses before the
  // signer does any work on bytes it will never sign.
  if (grantRequired) {
    const permission = checkGrantPermission(input.simulation !== undefined ? { request: input.request, simulation: input.simulation } : { request: input.request });
    if (permission.kind === "REFUSED") return { kind: "REFUSED", code: permission.code as unknown as SignerRefusalCode, detail: permission.detail };
  }

  // PHASE 2 — shape. Establishes that this is a launch() at the canonical factory before anything
  // tries to read `LaunchParams` out of it.
  const staticVerdict = checkStaticPolicy(input);
  if (staticVerdict.kind !== "ALLOWED") return staticVerdict;

  // PHASE 3 — the decoded fields against what the creator authorized.
  if (grantRequired) {
    const calldata = checkGrantCalldata({ request: input.request });
    if (calldata.kind === "REFUSED") return { kind: "REFUSED", code: calldata.code as unknown as SignerRefusalCode, detail: calldata.detail };
  }

  let supported: boolean;
  try {
    supported = await input.signer.supportsChain(input.request.chainId);
  } catch (cause) {
    // A signer that could not be asked has not said yes. Fail closed.
    return refuse("SIGNER_DOES_NOT_SUPPORT_CHAIN", `the signer could not be asked whether it supports chain ${input.request.chainId}: ${String(cause)}`);
  }
  if (!supported) {
    return refuse("SIGNER_DOES_NOT_SUPPORT_CHAIN", `the signer does not sign for chain ${input.request.chainId}`);
  }
  return ALLOWED;
}
