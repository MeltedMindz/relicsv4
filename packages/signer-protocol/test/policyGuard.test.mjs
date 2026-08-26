// SPDX-License-Identifier: MIT
//
// `requireGrant: false` ON EVERY CALL BELOW IS DELIBERATE AND NARROW.
//
// These tests predate the 4.2 authorization grant and they check one thing: does the guard refuse a
// transaction whose SHAPE is wrong. A grant is a fact about a human's permission, not about calldata,
// and requiring one here would make every shape assertion depend on a fixture that has nothing to do
// with what is being asserted.
//
// The default is TRUE, and `grantGuard.test.mjs` proves it: a request with no authorization on disk
// is refused when the flag is omitted. Turning the check off here does not turn it off anywhere a
// transaction is actually signed -- `signerServer` never passes the flag.

// ================================================================================================
// NEGATIVE CONTROLS for the policy guard.
//
// Each test does the same two things and both halves are required. It signs a well-formed,
// in-policy launch and asserts it is ACCEPTED — otherwise a guard that refused everything would
// score a clean sheet — and it then changes exactly ONE thing and asserts the refusal names that
// thing by code. A control that asserts only "something was refused" cannot tell a working guard
// from a broken one that refuses for the wrong reason.
//
// Every control also asserts the inner signer was NOT REACHED. That is the property the whole
// package exists for: the check has to run before delegation, not beside it. With a hardware wallet
// behind the adapter, "reached" means a human was asked to approve a transaction the policy had
// already rejected.
// ================================================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import { createPolicyBoundSigner, SignerRefusedError, checkStaticPolicy } from "../src/index.ts";
import {
  APPROVED_BUILD,
  ATTACKER_RECIPIENT,
  BUNDLE_HASH,
  LAUNCH_SELECTOR,
  LAUNCH_PLAN_HASH,
  SOME_OTHER_CONTRACT,
  TEST_POLICY,
  erc20TransferCalldata,
  launchCalldata,
  recordingAdapter,
  signingRequest,
} from "./helpers.mjs";

/**
 * Run one control: prove the baseline signs, then prove the mutation is refused with `code` and
 * never reaches the signer.
 */
async function control(code, overrides, { policy = TEST_POLICY, approvedBuild = APPROVED_BUILD } = {}) {
  const { calls, adapter } = recordingAdapter();
  const signer = createPolicyBoundSigner(adapter, policy, approvedBuild, { requireGrant: false });

  const baseline = await signer.trySign(signingRequest());
  assert.equal(baseline.kind, "SIGNED", "the unmodified in-policy launch must be accepted, or this control proves nothing");
  assert.equal(calls.length, 1);

  const refused = await signer.trySign(signingRequest(overrides));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, code);
  assert.ok(refused.detail.length > 0, "a refusal carries a human detail beside its code");
  assert.equal(calls.length, 1, "the inner signer must not be reached once the guard has refused");

  // `sign` raises the same typed refusal for callers that would rather catch than branch.
  await assert.rejects(
    () => signer.sign(signingRequest(overrides)),
    (error) => error instanceof SignerRefusedError && error.code === code,
  );
  assert.equal(calls.length, 1);
  return refused;
}

test("CONTROL: arbitrary ERC-20 transfer() calldata is refused SELECTOR_NOT_ALLOWED", async () => {
  const data = erc20TransferCalldata();
  const refused = await control("SELECTOR_NOT_ALLOWED", { data });
  assert.match(refused.detail, /0xa9059cbb/, "the refusal names the selector it actually found in the bytes");
});

test("CONTROL: calldata that LIES about its selector is refused SELECTOR_NOT_ALLOWED", async () => {
  // The bytes are a real launch; the request claims something else. The guard reads the bytes, so
  // the mismatch is caught rather than the field being believed.
  await control("SELECTOR_NOT_ALLOWED", { data: launchCalldata(), selector: "0xa9059cbb" });
});

test("CONTROL: a transfer body wearing the launch selector is refused SELECTOR_NOT_ALLOWED", async () => {
  const data = erc20TransferCalldata();
  await control("SELECTOR_NOT_ALLOWED", { data, dataHash: keccak256(data), selector: LAUNCH_SELECTOR });
});

test("CONTROL: `to` pointing at some other contract is refused TARGET_NOT_CANONICAL_FACTORY", async () => {
  const refused = await control("TARGET_NOT_CANONICAL_FACTORY", { to: SOME_OTHER_CONTRACT });
  assert.match(refused.detail, new RegExp(APPROVED_BUILD.factory, "i"), "the refusal names the factory that WAS approved");
});

test("CONTROL: gas above the policy ceiling is refused GAS_EXCEEDS_POLICY", async () => {
  await control("GAS_EXCEEDS_POLICY", { estimatedGas: TEST_POLICY.maxTransactionGas + 1n });
});

test("CONTROL: value above the policy ceiling is refused VALUE_EXCEEDS_POLICY", async () => {
  await control("VALUE_EXCEEDS_POLICY", { value: TEST_POLICY.maxNativeSpendWei + 1n });
});

test("CONTROL: maxFeePerGas above the policy ceiling is refused GAS_PRICE_EXCEEDS_POLICY", async () => {
  await control("GAS_PRICE_EXCEEDS_POLICY", { maxFeePerGas: TEST_POLICY.maxGasPriceWei + 1n });
});

test("CONTROL: data mutated after dataHash was computed is refused CALLDATA_HASH_MISMATCH", async () => {
  // The last byte of the tuple is `backingUnitsPerArtwork`. The request still decodes, still calls
  // launch, still names the creator — it is simply not the transaction that was hashed.
  const original = launchCalldata();
  const mutated = `${original.slice(0, -1)}${original.endsWith("a") ? "b" : "a"}`;
  assert.notEqual(mutated, original);
  await control("CALLDATA_HASH_MISMATCH", { data: mutated, dataHash: keccak256(original) });
});

test("CONTROL: a policyHash changed after build approval is refused POLICY_HASH_MISMATCH", async () => {
  await control("POLICY_HASH_MISMATCH", { policyHash: keccak256("0xdeadbeef") });
});

test("CONTROL: a launchPlanHash that moved is refused LAUNCH_PLAN_HASH_MISMATCH", async () => {
  const refused = await control("LAUNCH_PLAN_HASH_MISMATCH", { launchPlanHash: keccak256("0xfeedface") });
  assert.match(refused.detail, new RegExp(LAUNCH_PLAN_HASH, "i"));
});

test("CONTROL: a bundleHash that moved is refused BUNDLE_HASH_MISMATCH", async () => {
  const refused = await control("BUNDLE_HASH_MISMATCH", { bundleHash: keccak256("0xc0ffee") });
  assert.match(refused.detail, new RegExp(BUNDLE_HASH, "i"));
});

test("CONTROL: a recipient inside the calldata that is not the policy's is refused RECIPIENT_NOT_POLICY_RECIPIENT", async () => {
  // Everything else is correct: right chain, right factory, right selector, right hashes, and the
  // dataHash genuinely matches these bytes. Only field 12 of the tuple names someone else.
  const refused = await control("RECIPIENT_NOT_POLICY_RECIPIENT", { data: launchCalldata(ATTACKER_RECIPIENT) });
  assert.match(refused.detail, new RegExp(ATTACKER_RECIPIENT, "i"));
  assert.match(refused.detail, new RegExp(TEST_POLICY.creatorRecipient, "i"));
});

test("CONTROL: calldata that carries the launch selector but does not decode is refused RECIPIENT_NOT_POLICY_RECIPIENT", async () => {
  // An unread recipient is not a matching recipient. The guard fails closed rather than treating a
  // body it could not parse as one it approved.
  const truncated = `${LAUNCH_SELECTOR}${"00".repeat(64)}`;
  await control("RECIPIENT_NOT_POLICY_RECIPIENT", { data: truncated, dataHash: keccak256(truncated) });
});

test("CONTROL: a chain absent from the policy is refused CHAIN_NOT_ALLOWED", async () => {
  await control("CHAIN_NOT_ALLOWED", { chainId: 1337 });
});

test("CONTROL: an approved build for a different chain is refused TARGET_NOT_CANONICAL_FACTORY", async () => {
  // The RC6 factory shares one CREATE2 address across three chains, so `to` alone cannot tell them
  // apart. The build's own chain is what settles it.
  const policy = { ...TEST_POLICY, allowedChains: [31337, 31338] };
  const { calls, adapter } = recordingAdapter(undefined, [31337, 31338]);
  const signer = createPolicyBoundSigner(adapter, policy, APPROVED_BUILD, { requireGrant: false });
  const refused = await signer.trySign(signingRequest({ chainId: 31338 }));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "TARGET_NOT_CANONICAL_FACTORY");
  assert.equal(calls.length, 0);
});

test("CONTROL: no approved build at all is refused NO_APPROVED_BUILD", async () => {
  const { calls, adapter } = recordingAdapter();
  const signer = createPolicyBoundSigner(adapter, TEST_POLICY, null, { requireGrant: false });
  const refused = await signer.trySign(signingRequest());
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "NO_APPROVED_BUILD");
  assert.equal(calls.length, 0, "with nothing approved, nothing is signed");

  // And the same request IS accepted once a build is bound — so the refusal is about the absence,
  // not about the request.
  const bound = createPolicyBoundSigner(adapter, TEST_POLICY, APPROVED_BUILD, { requireGrant: false });
  assert.equal((await bound.trySign(signingRequest())).kind, "SIGNED");
});

test("CONTROL: a signer that does not support the chain is refused SIGNER_DOES_NOT_SUPPORT_CHAIN", async () => {
  const { calls, adapter } = recordingAdapter(undefined, []);
  const signer = createPolicyBoundSigner(adapter, TEST_POLICY, APPROVED_BUILD, { requireGrant: false });
  const refused = await signer.trySign(signingRequest());
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "SIGNER_DOES_NOT_SUPPORT_CHAIN");
  assert.equal(calls.length, 0);
});

test("a signer whose supportsChain THROWS is refused, never assumed", async () => {
  const { calls, adapter } = recordingAdapter();
  const failing = { ...adapter, supportsChain: async () => { throw new Error("socket closed"); } };
  const signer = createPolicyBoundSigner(failing, TEST_POLICY, APPROVED_BUILD, { requireGrant: false });
  const refused = await signer.trySign(signingRequest());
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "SIGNER_DOES_NOT_SUPPORT_CHAIN");
  assert.equal(calls.length, 0);
});

test("checkStaticPolicy is total and synchronous: the same verdicts without a signer", () => {
  assert.equal(checkStaticPolicy({ request: signingRequest(), policy: TEST_POLICY, approvedBuild: APPROVED_BUILD }).kind, "ALLOWED");
  assert.equal(checkStaticPolicy({ request: signingRequest(), policy: TEST_POLICY, approvedBuild: null }).code, "NO_APPROVED_BUILD");
  assert.equal(checkStaticPolicy({ request: signingRequest({ to: SOME_OTHER_CONTRACT }), policy: TEST_POLICY, approvedBuild: APPROVED_BUILD }).code, "TARGET_NOT_CANONICAL_FACTORY");
});

test("a well-formed in-policy launch is ALLOWED and reaches the signer exactly once", async () => {
  const { calls, adapter } = recordingAdapter();
  const signer = createPolicyBoundSigner(adapter, TEST_POLICY, APPROVED_BUILD, { requireGrant: false });
  const request = signingRequest();
  const result = await signer.sign(request);
  assert.equal(result.kind, "SIGNED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].data, request.data, "the signer is handed the exact bytes the guard checked");
});
