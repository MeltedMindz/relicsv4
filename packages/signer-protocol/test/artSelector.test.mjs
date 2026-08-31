// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ART-SELECTOR CONTROLS.
//
// `artTemplateId` carries TWO creator choices in one word — the registered template in the low 224
// bits, the ELECTED ART RUNTIME's per-chain registry key in the top 32 — and the signer read
// neither. `artMode` is 0 for the generic `SOLIDITY_SVG_V1` and 0 for both Wave-1 engines alike, so
// the one art check that existed could not tell them apart.
//
// EVERY CONTROL HERE PROVES THE BASELINE FIRST. The unmodified, in-policy, correctly-electing launch
// must be SIGNED, and the inner adapter must be reached exactly once — otherwise a guard that
// refuses everything would score a full house.
// ================================================================================================
import assert from "node:assert/strict";
import test from "node:test";
import { createPolicyBoundSigner } from "../src/index.ts";
import {
  APPROVED_BUILD,
  GENERIC_SOLIDITY_RUNTIME_ID,
  GEOMETRIC_RECURSION_RUNTIME_ID,
  TEST_CHAIN_ID,
  TEST_POLICY,
  VECTOR_COMPOSITION_RUNTIME_ID,
  approvedBuildElecting,
  electingCalldata,
  recordingAdapter,
  signingRequest,
} from "./helpers.mjs";

const WAVE1_POLICY = Object.freeze({ ...TEST_POLICY, allowedRuntimes: Object.freeze(["GEOMETRIC_RECURSION_V1"]) });

/**
 * One control: the electing launch is signed, then ONE thing changes and the guard names it.
 *
 * The baseline assertion is the load-bearing half. Without it a control is a test that something
 * was refused, which any broken guard passes.
 */
async function control(code, { data, approvedBuild, policy = WAVE1_POLICY, request = {} } = {}) {
  const { calls, adapter } = recordingAdapter();
  // The baseline is always the KNOWN-GOOD configuration, never the one under test: a control
  // that varies the policy would otherwise refuse its own baseline and prove nothing.
  const good = createPolicyBoundSigner(adapter, WAVE1_POLICY, approvedBuildElecting(), { requireGrant: false });
  const baseline = await good.trySign(signingRequest({ data: electingCalldata(GEOMETRIC_RECURSION_RUNTIME_ID) }));
  assert.equal(baseline.kind, "SIGNED", `the correctly-electing launch must be accepted, or this control proves nothing (${baseline.detail ?? ""})`);
  assert.equal(calls.length, 1);

  const guarded = createPolicyBoundSigner(adapter, policy, approvedBuild ?? approvedBuildElecting(), { requireGrant: false });
  // THE DEFAULT CALLDATA IS THE CORRECTLY-ELECTING ONE, so a control that varies only the APPROVAL
  // still exercises an electing request. Falling back to the suite-wide default (a bare template id
  // with no election) would have made seven of these controls test a launch that elects nothing.
  const refused = await guarded.trySign(signingRequest({ data: data ?? electingCalldata(GEOMETRIC_RECURSION_RUNTIME_ID), ...request }));
  assert.equal(refused.kind, "REFUSED", `expected ${code}, got a signature`);
  assert.equal(refused.code, code, refused.detail);
  assert.ok(refused.detail.length > 0, "a refusal carries a human detail beside its code");
  assert.equal(calls.length, 1, "the inner signer must not be reached once the guard has refused");
  return refused;
}

test("BASELINE: a launch electing the approved Wave-1 runtime is signed", async () => {
  const { calls, adapter } = recordingAdapter();
  const signer = createPolicyBoundSigner(adapter, WAVE1_POLICY, approvedBuildElecting(), { requireGrant: false });
  const outcome = await signer.trySign(signingRequest({ data: electingCalldata(GEOMETRIC_RECURSION_RUNTIME_ID) }));
  assert.equal(outcome.kind, "SIGNED", outcome.detail);
  assert.equal(calls.length, 1);
});

test("BASELINE: the same guard signs an alluvium launch when THAT is what was approved", async () => {
  const { adapter } = recordingAdapter();
  const policy = { ...TEST_POLICY, allowedRuntimes: ["VECTOR_COMPOSITION_V1"] };
  const build = approvedBuildElecting({ runtimeTag: "VECTOR_COMPOSITION_V1", artRuntimeId: VECTOR_COMPOSITION_RUNTIME_ID });
  const signer = createPolicyBoundSigner(adapter, policy, build, { requireGrant: false });
  const outcome = await signer.trySign(signingRequest({ data: electingCalldata(VECTOR_COMPOSITION_RUNTIME_ID) }));
  assert.equal(outcome.kind, "SIGNED", outcome.detail);
});

test("CONTROL: swapping the elected runtime for the GENERIC one after approval is refused ART_SELECTOR_NOT_APPROVED", async () => {
  // THE CENTRAL ATTACK. Prepare, predict and simulate on runtime 3; hand the signer calldata that
  // elects runtime 1. Every other field is identical and the launch would SUCCEED on chain.
  const refused = await control("ART_SELECTOR_NOT_APPROVED", { data: electingCalldata(GENERIC_SOLIDITY_RUNTIME_ID) });
  assert.match(refused.detail, /elects art runtime 1/);
  assert.match(refused.detail, /elects 3/);
});

test("CONTROL: dropping the election to NO PREFERENCE is refused ART_SELECTOR_NOT_APPROVED", async () => {
  // Runtime half 0 is not runtime 0 — the registry reserves that id and can never hold anything
  // there. It means "resolve this chain's generic runtime", which is the same theft with a subtler
  // shape: the word looks like a plain template id.
  const refused = await control("ART_SELECTOR_NOT_APPROVED", { data: electingCalldata(0) });
  assert.match(refused.detail, /NO PREFERENCE/);
});

test("CONTROL: swapping one Wave-1 runtime for the other is refused ART_SELECTOR_NOT_APPROVED", async () => {
  await control("ART_SELECTOR_NOT_APPROVED", { data: electingCalldata(VECTOR_COMPOSITION_RUNTIME_ID) });
});

test("CONTROL: an election with no approved selector at all is refused ART_SELECTOR_NOT_APPROVED", async () => {
  // ABSENCE IS NOT PERMISSION. An approval that never established an election cannot show that this
  // one is the one that was approved.
  const refused = await control("ART_SELECTOR_NOT_APPROVED", { approvedBuild: APPROVED_BUILD });
  assert.match(refused.detail, /carries no art selector/);
});

test("CONTROL: a different template under the right runtime is refused ART_SELECTOR_NOT_APPROVED", async () => {
  await control("ART_SELECTOR_NOT_APPROVED", { data: electingCalldata(GEOMETRIC_RECURSION_RUNTIME_ID, 7n) });
});

test("CONTROL: a template half of ZERO is refused ART_SELECTOR_MALFORMED even though the word is huge", async () => {
  // `3 << 224` is a very large non-zero number, so the old `artTemplateId !== 0n` shape check could
  // never have seen this. The chain reverts BadTemplate.
  const refused = await control("ART_SELECTOR_MALFORMED", { data: electingCalldata(GEOMETRIC_RECURSION_RUNTIME_ID, 0n) });
  assert.match(refused.detail, /TEMPLATE half is 0/);
});

test("CONTROL: an approval read on ANOTHER chain is refused ART_SELECTOR_NOT_APPROVED", async () => {
  const refused = await control("ART_SELECTOR_NOT_APPROVED", { approvedBuild: approvedBuildElecting({ chainId: TEST_CHAIN_ID + 1 }) });
  assert.match(refused.detail, /per chain/);
});

test("CONTROL: a runtime the POLICY does not allow is refused ART_RUNTIME_NOT_ALLOWED_BY_POLICY", async () => {
  await control("ART_RUNTIME_NOT_ALLOWED_BY_POLICY", { policy: { ...TEST_POLICY, allowedRuntimes: ["SOLIDITY_SVG_V1"] } });
});

test("CONTROL: an INACTIVE runtime is refused ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", async () => {
  await control("ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", { approvedBuild: approvedBuildElecting({ active: false }) });
});

test("CONTROL: a runtime that does not exist on the chain is refused ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", async () => {
  await control("ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", { approvedBuild: approvedBuildElecting({ exists: false }) });
});

test("CONTROL: an INCOMPLETE registry read is refused ART_RUNTIME_NOT_ACTIVE_ON_CHAIN, not passed", async () => {
  // AN UNREAD REGISTRY IS NOBODY'S ANSWER. It does not prove the runtime absent and it does not
  // prove it present; a launch built on it is built on a read that did not finish.
  const refused = await control("ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", { approvedBuild: approvedBuildElecting({ registryComplete: false }) });
  assert.match(refused.detail, /not read completely/);
});

test("CONTROL: the ZERO-ADDRESS record is refused ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", async () => {
  // `runtimeInfo` does not revert for an unregistered id; it answers with the zero address. A
  // successful call is not a resolved runtime.
  const refused = await control("ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", {
    approvedBuild: approvedBuildElecting({ runtimeAddress: "0x0000000000000000000000000000000000000000" }),
  });
  assert.match(refused.detail, /zero address/);
});

test("CONTROL: a registered runtime whose address holds NO CODE is refused ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", async () => {
  await control("ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", { approvedBuild: approvedBuildElecting({ runtimeCodeBytes: 0 }) });
});

test("CONTROL: an approval with an UNRESOLVED numeric id is refused ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", async () => {
  // Null is not zero. Zero is the registry's reserved id and could never name a runtime; null means
  // nothing was established at all, and neither may be signed on.
  const refused = await control("ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", { approvedBuild: approvedBuildElecting({ artRuntimeId: null }) });
  assert.match(refused.detail, /is not a zero/);
});

test("the guard reads the selector out of the BYTES, not out of a field beside them", async () => {
  // The whole point: there is no auxiliary runtime field on a SigningRequest, and adding one would
  // be the substitution this check exists to stop. Proving it by construction — an override that
  // claims runtime 3 changes nothing about calldata that elects runtime 1.
  const { adapter } = recordingAdapter();
  const guarded = createPolicyBoundSigner(adapter, WAVE1_POLICY, approvedBuildElecting(), { requireGrant: false });
  const outcome = await guarded.trySign(
    signingRequest({ data: electingCalldata(GENERIC_SOLIDITY_RUNTIME_ID), artRuntimeId: GEOMETRIC_RECURSION_RUNTIME_ID, runtimeTag: "GEOMETRIC_RECURSION_V1" }),
  );
  assert.equal(outcome.kind, "REFUSED");
  assert.equal(outcome.code, "ART_SELECTOR_NOT_APPROVED");
});

test("a JavaScript-mode launch is not judged by this guard, and is refused elsewhere", async () => {
  // artMode 1 carries no selector at all and the chain requires the word to be zero. Inventing a
  // second reason to refuse it here would put two codes on one defect.
  const { adapter } = recordingAdapter();
  const policy = { ...TEST_POLICY, allowedRuntimes: ["ONCHAIN_JAVASCRIPT_V1"] };
  const guarded = createPolicyBoundSigner(adapter, policy, APPROVED_BUILD, { requireGrant: false });
  const outcome = await guarded.trySign(signingRequest({ data: electingCalldata(0, 0n, { artMode: 1, artTemplateId: 0n }) }));
  assert.equal(outcome.kind, "SIGNED", "the shape guard has nothing to say about a JavaScript launch; the grant and the protocol refuse it");
});
