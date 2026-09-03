// SPDX-License-Identifier: MIT
// ================================================================================================
// THE GRANT GUARD, SEPARATED FROM THE SHAPE GUARD.
//
// WHY THIS FILE EXISTS AT ALL, AND WHY `walletAttack.test.mjs` COULD NOT HOLD IT.
//
// The grant guard exposes seventeen refusal codes. It runs FIRST — before the shape guard — and the
// shape guard bounds several of the same quantities: both have a chain allowlist, both have a
// native-value ceiling, both check the creatorRecipient inside the calldata. So on the suite-wide
// signer a bad chain surfaces as `CHAIN_NOT_AUTHORIZED` rather than `CHAIN_NOT_ALLOWED` purely
// because the grant asked first, and DELETING the grant's chain check leaves every control green:
// the policy refuses the same request one guard later, for a different reason, and no control was
// looking at the reason.
//
// A GUARD THAT IS BACKSTOPPED BY ANOTHER GUARD IS UNPROVABLE FROM A REFUSAL ALONE. It could be
// deleted tomorrow with no signal, and this repository's standing law is that a guard never shown
// to fail is not evidence. So the signers below are built the other way round: THE POLICY IS
// DELIBERATELY WIDER THAN THE GRANT on every axis where the two overlap. A launch that is inside
// the policy and outside the grant has exactly one thing that can refuse it, and if that thing is
// removed the signer SIGNS — which is a control with somewhere to fail.
//
// Three checks cannot be separated over the wire at all, because the guard that shadows them is a
// guard we would never remove to test one:
//
//   * phase one's `checkAuthorization` result is shadowed by phase three's, and vice versa — both
//     call it, so deleting either leaves the other refusing with the identical code;
//   * phase three's LaunchParams decode is shadowed by the shape guard, which already decoded the
//     same bytes to read the recipient and would refuse first.
//
// Those three get direct unit tests against the exported functions instead. A direct test of one
// phase is not a weaker proof than a socket test — it is the only proof that isolates the phase.
// ================================================================================================
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, keccak256, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { startSignerServer } from "../src/signerServer.ts";
import { createDevKeystoreSigner } from "../src/adapters/devKeystore.ts";
import { createLocalSidecarSigner } from "../src/adapters/localSidecar.ts";
import { SignerRefusedError } from "../src/index.ts";
import { checkGrantPermission, checkGrantCalldata } from "../src/grantGuard.ts";
import { LAUNCH_SELECTOR, LAUNCH_FACTORY_ABI } from "../src/launchAbi.ts";
import {
  ANVIL_ACCOUNT_ZERO, ANVIL_ACCOUNT_ZERO_ADDRESS, TEST_CHAIN_ID, TEST_POLICY, APPROVED_BUILD,
  CREATOR_RECIPIENT, SOME_OTHER_CONTRACT, launchCalldata, launchParamsWith, signingRequest,
  withTestAuthorization,
} from "./helpers.mjs";

/**
 * THE KEY BEHIND THE SIGNER, stated rather than taken from the request.
 *
 * `checkGrantPermission` and `checkGrantCalldata` take this as a REQUIRED argument because the
 * grant is bound to a key, and until 2026-09-03 they read `request.from` instead — a field the
 * caller supplies, compared against a grant, by a guard whose whole purpose is not to trust the
 * caller. A direct unit test that omitted it would be re-testing the defect.
 */
const HELD_KEY = { keyAddress: ANVIL_ACCOUNT_ZERO_ADDRESS };

/**
 * A SECOND LOCAL CHAIN ID. Not 1/8453/4663/56 — the dev keystore refuses every production chain,
 * so a cross-chain control on one of those would be refused by the ADAPTER and prove nothing about
 * the grant.
 */
const OTHER_LOCAL_CHAIN_ID = 31338;

/**
 * THE POLICY IS WIDER THAN THE GRANT, ON PURPOSE.
 *
 * `TEST_POLICY.maxNativeSpendWei` is 0, which is the tightest possible ceiling and therefore
 * refuses every non-zero value before the grant's own ceiling can be shown to matter. Ten ether
 * here means the policy says yes to a value the grant says no to, and the refusal that arrives is
 * necessarily the grant's.
 */
const WIDE_POLICY = Object.freeze({ ...TEST_POLICY, maxNativeSpendWei: parseEther("10") });

/** The same, for a chain the suite-wide approved build does not name. */
const OTHER_CHAIN_POLICY = Object.freeze({ ...WIDE_POLICY, allowedChains: Object.freeze([OTHER_LOCAL_CHAIN_ID]) });
const OTHER_CHAIN_BUILD = Object.freeze({ ...APPROVED_BUILD, chainId: OTHER_LOCAL_CHAIN_ID });

let grant, wide, wideClient, other, otherClient;
const sim = (r) => ({ ok: true, dataHash: r.dataHash, chainId: r.chainId, blockNumber: "1" });

/** Run `fn` with the grant temporarily overridden, then put the original back. */
async function withGrant(overrides, fn) {
  const { writeAuthorization, readAuthorization } = await import("../src/authorization.ts");
  const previous = readAuthorization();
  writeAuthorization({ ...previous, ...overrides });
  try { return await fn(); } finally { writeAuthorization(previous); }
}

/** Run `fn` with NO authorization file on disk at all, then put it back. */
async function withoutGrant(fn) {
  const { writeAuthorization, readAuthorization, authorizationPath } = await import("../src/authorization.ts");
  const { rmSync } = await import("node:fs");
  const previous = readAuthorization();
  assert.ok(previous, "there was no grant to remove; this control would pass vacuously");
  rmSync(authorizationPath(), { force: true });
  try { return await fn(); } finally { writeAuthorization(previous); }
}

before(async () => {
  grant = withTestAuthorization();
  await grant.install();
  wide = await startSignerServer({ adapter: createDevKeystoreSigner({ privateKey: ANVIL_ACCOUNT_ZERO }), policy: WIDE_POLICY, approvedBuild: APPROVED_BUILD });
  wideClient = createLocalSidecarSigner({ url: wide.url });
  other = await startSignerServer({ adapter: createDevKeystoreSigner({ privateKey: ANVIL_ACCOUNT_ZERO }), policy: OTHER_CHAIN_POLICY, approvedBuild: OTHER_CHAIN_BUILD });
  otherClient = createLocalSidecarSigner({ url: other.url });
});
after(async () => { await wide?.close(); await other?.close(); grant.restore(); });

/** Refuse, and report WHICH code, so a right-answer-wrong-reason pass is visible. */
async function refusedBy(client, label, req, simulation = undefined) {
  let refusal = null;
  try {
    await client.sign(req, simulation === undefined ? sim(req) : simulation);
  } catch (e) {
    refusal = e instanceof SignerRefusedError ? e.code : `THREW_NON_REFUSAL:${e?.name} ${e?.message ?? ""}`;
  }
  assert.ok(refusal !== null, `${label}: the signer SIGNED it. This is the whole boundary and it did not hold.`);
  assert.ok(!String(refusal).startsWith("THREW_NON_REFUSAL"), `${label}: refused by throwing ${refusal} rather than a typed refusal an agent can branch on`);
  return refusal;
}

// ---- BASELINES ---------------------------------------------------------------------------------
//
// WITHOUT THESE EVERY CONTROL BELOW IS FREE. A signer that refused every request would score a
// perfect run, and a wider policy is exactly the kind of change that could make one refuse for a
// reason nobody intended.

test("G-01 BASELINE the wide-policy signer signs the launch the grant permits", async () => {
  const data = launchCalldata();
  const req = signingRequest({ data, dataHash: keccak256(data) });
  const signed = await wideClient.sign(req, sim(req));
  assert.equal(signed.kind, "SIGNED");
});

test("G-02 BASELINE the other-chain signer signs when the grant names that chain", async () => {
  await withGrant({ allowedChains: [OTHER_LOCAL_CHAIN_ID] }, async () => {
    const data = launchCalldata();
    const req = signingRequest({ data, dataHash: keccak256(data), chainId: OTHER_LOCAL_CHAIN_ID });
    const signed = await otherClient.sign(req, sim(req));
    assert.equal(signed.kind, "SIGNED");
  });
});

// ---- THE SHADOWED CEILINGS, SEPARATED ----------------------------------------------------------

test("G-03 a chain the POLICY allows and the GRANT does not is refused", async () => {
  // On the suite-wide signer this control is unfalsifiable: the policy's own allowlist refuses the
  // same chain one guard later. Here the policy names 31338 and the approved build is for 31338, so
  // deleting the grant's chain check does not move the refusal to another code — it SIGNS.
  const data = launchCalldata();
  const req = signingRequest({ data, dataHash: keccak256(data), chainId: OTHER_LOCAL_CHAIN_ID });
  const code = await refusedBy(otherClient, "chain outside the grant", req);
  assert.equal(code, "CHAIN_NOT_AUTHORIZED", `refused with ${code}; only the GRANT's chain list should be able to catch this`);
});

test("G-04 native value the POLICY allows and the GRANT does not is refused", async () => {
  // ONE WEI. The point is not the size — it is that the policy's ceiling is ten ether and the
  // grant's is zero, so the only thing in the system that can refuse this is the grant.
  const data = launchCalldata();
  assert.ok(parseEther("10") > 1n, "fixture drift: the policy ceiling must sit ABOVE the value or this control proves nothing");
  const req = signingRequest({ data, dataHash: keccak256(data), value: 1n });
  const code = await refusedBy(wideClient, "value outside the grant", req);
  assert.equal(code, "TOTAL_GAS_COST_EXCEEDS_AUTHORIZATION", `refused with ${code}; the policy admits this value, so only the grant's ceiling should catch it`);
});

test("G-05 a recipient the POLICY authorizes and the GRANT does not is refused", async () => {
  // The calldata pays the POLICY's creatorRecipient, so the shape guard is satisfied and cannot be
  // what refuses. The grant names someone else.
  await withGrant({ creatorRecipient: SOME_OTHER_CONTRACT }, async () => {
    const data = launchCalldata(CREATOR_RECIPIENT);
    const req = signingRequest({ data, dataHash: keccak256(data) });
    const code = await refusedBy(wideClient, "recipient outside the grant", req);
    assert.equal(code, "RECIPIENT_NOT_AUTHORIZED", `refused with ${code}; the policy authorizes this recipient, so only the grant should catch it`);
  });
});

// ---- THE GRANT'S OWN STATE ---------------------------------------------------------------------

test("G-06 a BUILD_ONLY authorization is refused", async () => {
  // `policy.allowBroadcast` is deliberately NOT consulted by the shape guard — the comment at the
  // top of policyGuard.ts says why — so this bound exists in exactly one place.
  await withGrant({ allowBroadcast: false, preset: "BUILD_ONLY" }, async () => {
    const data = launchCalldata();
    const code = await refusedBy(wideClient, "build-only grant", signingRequest({ data, dataHash: keccak256(data) }));
    assert.equal(code, "BROADCAST_NOT_AUTHORIZED");
  });
});

test("G-07 an authorization granted to a DIFFERENT signer is refused", async () => {
  // A grant is bound to the key it was given for. Copying `authorization.json` next to a second
  // signer must not hand that signer the creator's authority.
  await withGrant({ signerAddress: SOME_OTHER_CONTRACT }, async () => {
    const data = launchCalldata();
    const code = await refusedBy(wideClient, "grant for another signer", signingRequest({ data, dataHash: keccak256(data) }));
    assert.equal(code, "AUTHORIZATION_NOT_FOR_THIS_SIGNER");
  });
});

test("G-08 an authorization at an unrecognised VERSION is refused", async () => {
  // A record this signer cannot read is not a record it may interpret leniently. Every other field
  // in this fixture is valid, so nothing except the version check can refuse it.
  await withGrant({ version: 2 }, async () => {
    const data = launchCalldata();
    const code = await refusedBy(wideClient, "unreadable grant", signingRequest({ data, dataHash: keccak256(data) }));
    assert.equal(code, "AUTHORIZATION_UNREADABLE");
  });
});

test("G-09 no authorization on disk at all is refused", async () => {
  // THE DEFAULT MUST BE NO AUTHORITY. An agent that finds no grant has not been given one, and the
  // absence of a file is the most likely state a fresh machine is in.
  await withoutGrant(async () => {
    const data = launchCalldata();
    const code = await refusedBy(wideClient, "no grant at all", signingRequest({ data, dataHash: keccak256(data) }));
    assert.equal(code, "NO_AUTHORIZATION");
  });
});

// ---- THE SIMULATION REQUIREMENT ----------------------------------------------------------------

test("G-10 a simulation that REVERTED is refused", async () => {
  // Control 25 in walletAttack proves an ABSENT simulation is refused and control 17 proves a
  // MISMATCHED one is. Neither reaches this arm: a receipt that is present, is of these exact
  // bytes, is on this exact chain, and says the transaction FAILS.
  const data = launchCalldata();
  const req = signingRequest({ data, dataHash: keccak256(data) });
  const code = await refusedBy(wideClient, "failed simulation", req, { ok: false, dataHash: req.dataHash, chainId: req.chainId, blockNumber: "1" });
  assert.equal(code, "NO_SIMULATION_RECEIPT", `refused with ${code}; a reverted simulation is not a proven transaction`);
});

test("G-11 a simulation taken on a DIFFERENT CHAIN is refused", async () => {
  // The dataHash matches, so the calldata-identity arm passes. Simulating on a fork of another
  // chain and signing for this one is a real and quiet way to sign an unproven transaction.
  const data = launchCalldata();
  const req = signingRequest({ data, dataHash: keccak256(data) });
  assert.notEqual(req.chainId, OTHER_LOCAL_CHAIN_ID, "fixture drift: the simulation must name a DIFFERENT chain");
  const code = await refusedBy(wideClient, "simulation from another chain", req, { ok: true, dataHash: req.dataHash, chainId: OTHER_LOCAL_CHAIN_ID, blockNumber: "1" });
  assert.equal(code, "SIMULATION_CALLDATA_MISMATCH");
});

// ---- THE THREE THAT CANNOT BE SEPARATED OVER THE WIRE -------------------------------------------
//
// Each of these calls ONE exported function, so the guard that shadows it is not in the call at
// all. That is the whole point: over the socket, removing the check under test leaves the other
// one refusing with the identical code and every control stays green.

test("G-12 phase one refuses a revoked grant on its own, with no phase three to fall back on", async () => {
  await withGrant({ revokedAt: new Date().toISOString() }, async () => {
    const data = launchCalldata();
    const req = signingRequest({ data, dataHash: keccak256(data) });
    const verdict = checkGrantPermission({ request: req, identity: HELD_KEY, simulation: sim(req) });
    assert.equal(verdict.kind, "REFUSED", "checkGrantPermission allowed a revoked grant; over the socket phase three would have hidden this");
    assert.equal(verdict.code, "AUTHORIZATION_REVOKED");
  });
});

test("G-13 phase three refuses a revoked grant on its own, with no phase one to fall back on", async () => {
  await withGrant({ revokedAt: new Date().toISOString() }, async () => {
    const data = launchCalldata();
    const req = signingRequest({ data, dataHash: keccak256(data) });
    const verdict = checkGrantCalldata({ request: req, identity: HELD_KEY });
    assert.equal(verdict.kind, "REFUSED", "checkGrantCalldata allowed a revoked grant; over the socket phase one would have hidden this");
    assert.equal(verdict.code, "AUTHORIZATION_REVOKED");
  });
});

test("G-14 phase three refuses calldata that does not decode as LaunchParams", async () => {
  // OVER THE WIRE THIS ARM IS UNREACHABLE, and that is correct rather than a defect: the shape
  // guard decodes the same bytes first to read the recipient, so undecodable calldata is refused as
  // a shape problem before phase three sees it. The arm still has to fail closed, because
  // `checkGrantCalldata` is exported and an integrator may call it directly.
  const data = `${LAUNCH_SELECTOR}${"11".repeat(64)}`;
  const req = signingRequest({ data, dataHash: keccak256(data), selector: LAUNCH_SELECTOR });
  const verdict = checkGrantCalldata({ request: req, identity: HELD_KEY });
  assert.equal(verdict.kind, "REFUSED", "undecodable calldata was ALLOWED by the grant guard; an unread struct is not a matching one");
  assert.equal(verdict.code, "LAUNCH_PARAMS_FIELD_COUNT_WRONG");
});

// ---- THE ROYALTY IS READ OUT OF A PACKED WORD ---------------------------------------------------

test("G-15 the royalty is read from bits 8..23 of creatorEarnings, not from the whole word", async () => {
  // `creatorEarnings` packs `mode | royaltyBps << 8 | policyVersion << 24`. A shift that is off by
  // a byte still produces a plausible small number for plausible inputs, so this pins the field
  // rather than the ceiling: 500 bps is exactly the grant's maximum and must be ALLOWED, while the
  // same word read one nibble wrong is not 500.
  const atCeiling = launchParamsWith({ creatorEarnings: 1n | (500n << 8n) | (1n << 24n) });
  const data = encodeFunctionData({ abi: LAUNCH_FACTORY_ABI, functionName: "launch", args: [atCeiling] });
  const req = signingRequest({ data, dataHash: keccak256(data) });
  const verdict = checkGrantCalldata({ request: req, identity: HELD_KEY });
  assert.equal(verdict.kind, "ALLOWED", `a royalty exactly AT the authorized ceiling was refused (${verdict.detail}); the ceiling is inclusive and the policyVersion byte above it must not be read as royalty`);

  // And one bps over is refused, so the two assertions together bracket the field.
  const overCeiling = launchParamsWith({ creatorEarnings: 1n | (501n << 8n) | (1n << 24n) });
  const overData = encodeFunctionData({ abi: LAUNCH_FACTORY_ABI, functionName: "launch", args: [overCeiling] });
  const overVerdict = checkGrantCalldata({ request: signingRequest({ data: overData, dataHash: keccak256(overData) }), identity: HELD_KEY });
  assert.equal(overVerdict.kind, "REFUSED");
  assert.equal(overVerdict.code, "ROYALTY_EXCEEDS_AUTHORIZATION");
});

// ---- THE GRANT IS BOUND TO A KEY, NOT TO A FIELD IN THE REQUEST ---------------------------------
//
// MEASURED DEFECT, 2026-09-03. `checkAuthorization({ signerAddress: request.from })` compared the
// grant's address against a value the CALLER supplied. So a signer holding key B signed under a
// grant issued for key A, because the request said A — and `AUTHORIZATION_NOT_FOR_THIS_SIGNER`,
// the refusal written for exactly that, could not fire: the two things being compared both came
// from the request.
//
// THE CONTROL HAS TO SEPARATE THREE ADDRESSES OR IT PROVES NOTHING. G-07 already sets the grant to
// a third party while the request and the key agree, and it passed BEFORE the fix as well as after
// — the request's `from` was the grant's counterparty, so the mismatch was visible either way. The
// case that distinguishes them is: the grant names A, the request CLAIMS A, and the key is B.

const OTHER_KEY = generatePrivateKey();
const OTHER_KEY_ADDRESS = privateKeyToAccount(OTHER_KEY).address;

test("G-16 a signer holding a DIFFERENT key than the grant names is refused, though the request claims the grant's address", async () => {
  assert.notEqual(OTHER_KEY_ADDRESS.toLowerCase(), ANVIL_ACCOUNT_ZERO_ADDRESS.toLowerCase(), "fixture drift: the two keys must differ or this control is vacuous");
  const wrongKey = await startSignerServer({
    adapter: createDevKeystoreSigner({ privateKey: OTHER_KEY }),
    policy: WIDE_POLICY,
    approvedBuild: APPROVED_BUILD,
  });
  const wrongKeyClient = createLocalSidecarSigner({ url: wrongKey.url });
  try {
    // The grant is the suite's ordinary one: issued to ANVIL_ACCOUNT_ZERO_ADDRESS. The request says
    // it is from ANVIL_ACCOUNT_ZERO_ADDRESS too, so every value the OLD guard compared agreed. The
    // key behind the socket is neither of them.
    const held = await wrongKeyClient.getAddress();
    assert.equal(held.toLowerCase(), OTHER_KEY_ADDRESS.toLowerCase(), "the harness did not actually put a different key behind the signer");
    const data = launchCalldata();
    const code = await refusedBy(wrongKeyClient, "grant for a key this signer does not hold", signingRequest({ data, dataHash: keccak256(data) }));
    assert.equal(code, "REQUEST_FROM_NOT_SIGNER_KEY", `refused with ${code}; the signature would have come from ${OTHER_KEY_ADDRESS} under a grant issued to ${ANVIL_ACCOUNT_ZERO_ADDRESS}`);
  } finally {
    await wrongKey.close();
  }
});

test("G-17 BASELINE the same request through the signer that DOES hold the grant's key is signed", async () => {
  // Without this, G-16 is satisfied by a signer that refuses everything — and the change under test
  // is one that adds a refusal, which is exactly the kind that can over-refuse.
  const data = launchCalldata();
  const req = signingRequest({ data, dataHash: keccak256(data) });
  const signed = await wideClient.sign(req, sim(req));
  assert.equal(signed.kind, "SIGNED");
});

test("G-18 a grant check with NO signer key identity REFUSES rather than falling back to request.from", async () => {
  // `checkGrantPermission` and `checkGrantCalldata` are exported and a JavaScript integrator can
  // still call them with the old one-argument shape. That call must produce a typed refusal — not a
  // TypeError the caller's `catch` turns into a retry, and above all not a silent fallback to the
  // field whose use was the defect.
  const data = launchCalldata();
  const req = signingRequest({ data, dataHash: keccak256(data) });
  const permission = checkGrantPermission({ request: req, simulation: sim(req) });
  assert.equal(permission.kind, "REFUSED", "an unidentified key was ALLOWED; an unread key is not a matching one");
  assert.equal(permission.code, "AUTHORIZATION_NOT_FOR_THIS_SIGNER");
  const calldata = checkGrantCalldata({ request: req });
  assert.equal(calldata.kind, "REFUSED", "an unidentified key was ALLOWED by phase three");
  assert.equal(calldata.code, "AUTHORIZATION_NOT_FOR_THIS_SIGNER");
});
