// SPDX-License-Identifier: MIT
// ================================================================================================
// THE GRANT'S LIFECYCLE, EXERCISED RATHER THAN SIMULATED.
//
// WHY THIS FILE EXISTS. `AUTHORIZATION_CONSUMED` had a control, a remedy, a refusal code and a
// mutation, and it was unreachable in shipped code. `consumeAuthorization` was defined, exported,
// documented — and called by nothing. `launchesUsed` was only ever WRITTEN as 0. So a grant saying
// `launchesAllowed: 1` signed as many launches as it was asked to, and the kit's own sentence
// ("someone who agreed to one launch has not agreed to a second one") was false.
//
// THE EXISTING CONTROL COULD NOT HAVE CAUGHT IT, AND THAT IS THE LESSON WORTH KEEPING. It set
// `launchesUsed: 1` into the grant file BY HAND and then asserted the signer refuses. That is a
// true statement about the CHECK and says nothing about whether anything ever writes the field: it
// tested a state production could not reach, and scored green while the boundary was open. The
// mutation harness then scored the check "caught", because the mutation and the fixture were about
// the same half of a lifecycle whose other half did not exist.
//
// SO EVERY CONTROL HERE PERFORMS SIGNATURES. Nothing sets a counter. The grant file is READ BACK
// between signs, and the numbers asserted are the ones the shipped path wrote.
//
// AND IT RUNS IN ITS OWN PROCESS, DELIBERATELY. `node --test` gives each file its own child, so
// this file's `RELICS_HOME` is its own — spending the grant here cannot make another file's
// baseline sign fail, and another file's baseline cannot pre-spend this one.
// ================================================================================================
import test, { before, after } from "node:test";
import { rmSync } from "node:fs";
import assert from "node:assert/strict";
import { encodeFunctionData, keccak256, toHex } from "viem";
import { startSignerServer } from "../src/signerServer.ts";
import { createDevKeystoreSigner } from "../src/adapters/devKeystore.ts";
import { createLocalSidecarSigner } from "../src/adapters/localSidecar.ts";
import { createPolicyBoundSigner, SignerRefusedError } from "../src/index.ts";
import { AuthorizationSpendError, authorizationPath, checkAuthorization, consumeAuthorization, readAuthorization, writeAuthorization } from "../src/authorization.ts";
import { LAUNCH_FACTORY_ABI } from "../src/launchAbi.ts";
import {
  ANVIL_ACCOUNT_ZERO, TEST_POLICY, APPROVED_BUILD, BUNDLE_HASH, LAUNCH_PLAN_HASH,
  launchCalldata, launchParamsWith, signingRequest, withTestAuthorization,
} from "./helpers.mjs";

/**
 * A SECOND, GENUINELY DIFFERENT PROJECT — not the same launch signed twice.
 *
 * Different name, different symbol, therefore different calldata, different bundle and a different
 * launch plan. This is what the verifier signed under a one-launch grant: not a retry, a second
 * real collection with its own pool and its own rights NFT.
 */
const SECOND_PLAN_HASH = keccak256(toHex("plan@second-project"));
const SECOND_BUNDLE_HASH = keccak256(toHex("bundle@second-project"));
const THIRD_PLAN_HASH = keccak256(toHex("plan@third-project"));
const THIRD_BUNDLE_HASH = keccak256(toHex("bundle@third-project"));

function otherProjectCalldata(name, symbol) {
  return encodeFunctionData({ abi: LAUNCH_FACTORY_ABI, functionName: "launch", args: [launchParamsWith({ name, symbol })] });
}

const sim = (r) => ({ ok: true, dataHash: r.dataHash, chainId: r.chainId, blockNumber: "1" });

let grant, servers = [], first, second, third;

/** Start a signer bound to ONE approved build. A different project is a different approval. */
async function signerFor(approvedBuild) {
  const running = await startSignerServer({ adapter: createDevKeystoreSigner({ privateKey: ANVIL_ACCOUNT_ZERO }), policy: TEST_POLICY, approvedBuild });
  servers.push(running);
  return createLocalSidecarSigner({ url: running.url });
}

/** The grant as it is ON DISK, right now. Every number below is read from here, never assumed. */
function grantOnDisk() {
  const auth = readAuthorization();
  assert.ok(auth, "the grant vanished from disk mid-run");
  return auth;
}

async function refusalCode(client, label, req) {
  let code = null;
  try {
    await client.sign(req, sim(req));
  } catch (e) {
    code = e instanceof SignerRefusedError ? e.code : `THREW_NON_REFUSAL:${e?.name} ${e?.message ?? ""}`;
  }
  assert.ok(code !== null, `${label}: the signer SIGNED it.`);
  assert.ok(!String(code).startsWith("THREW_NON_REFUSAL"), `${label}: ${code}`);
  return code;
}

before(async () => {
  grant = withTestAuthorization({ launchesAllowed: 1, launchesUsed: 0, consumedLaunchPlanHashes: [] });
  await grant.install();
  first = await signerFor(APPROVED_BUILD);
  second = await signerFor({ ...APPROVED_BUILD, launchPlanHash: SECOND_PLAN_HASH, bundleHash: SECOND_BUNDLE_HASH });
  third = await signerFor({ ...APPROVED_BUILD, launchPlanHash: THIRD_PLAN_HASH, bundleHash: THIRD_BUNDLE_HASH });
});
after(async () => { for (const s of servers) await s.close(); grant.restore(); });

// ---- THE LIFECYCLE, IN ORDER -------------------------------------------------------------------

test("L-01 BASELINE a fresh one-launch grant reads 0 of 1 used, with nothing consumed", () => {
  const auth = grantOnDisk();
  assert.equal(auth.launchesAllowed, 1);
  assert.equal(auth.launchesUsed, 0, "the fixture must start unspent or every control below is measuring the wrong thing");
  assert.deepEqual([...auth.consumedLaunchPlanHashes], []);
});

test("L-02 signing a launch SPENDS the grant, and the spend is on disk", async () => {
  const data = launchCalldata();
  const req = signingRequest({ data, dataHash: keccak256(data) });
  const signed = await first.sign(req, sim(req));
  assert.equal(signed.kind, "SIGNED", "the baseline launch was refused; nothing below would be evidence");

  const auth = grantOnDisk();
  assert.equal(auth.launchesUsed, 1, "the signature was produced and the grant still reads unspent — this is the defect, not a rounding of it");
  assert.deepEqual([...auth.consumedLaunchPlanHashes].map((h) => h.toLowerCase()), [LAUNCH_PLAN_HASH.toLowerCase()], "the spend must record WHICH launch spent it, or a resume cannot be told apart from a second launch");
});

test("L-03 a SECOND, DIFFERENT project under the same one-launch grant is refused AUTHORIZATION_CONSUMED", async () => {
  // THE EXPLOIT, EXECUTED. Under the shipped code this signed: a second collection, a second pool,
  // a second rights NFT, under a grant whose holder agreed to one.
  const data = otherProjectCalldata("Second Project", "SCND");
  const req = signingRequest({ data, dataHash: keccak256(data), launchPlanHash: SECOND_PLAN_HASH, bundleHash: SECOND_BUNDLE_HASH });
  const code = await refusalCode(second, "a second distinct project on a one-launch grant", req);
  assert.equal(code, "AUTHORIZATION_CONSUMED", `refused with ${code}; the grant is spent and only the spend check should be able to catch this`);
  assert.equal(grantOnDisk().launchesUsed, 1, "a REFUSED launch must not spend a slot");
});

test("L-04 re-signing THE SAME launch is still permitted, and does not spend a second slot", async () => {
  // THE COMPANION CONTROL, AND IT IS NOT OPTIONAL. "Refuse the second sign" is also satisfied by
  // "refuse every sign after the first", which would break crash recovery: a process killed between
  // broadcast and receipt has to be able to re-sign the launch it already sent, or the creator's
  // only authorization is burned on a launch that succeeded and cannot be finished.
  const data = launchCalldata();
  const req = signingRequest({ data, dataHash: keccak256(data) });
  const signed = await first.sign(req, sim(req));
  assert.equal(signed.kind, "SIGNED", "a resumed run could not re-sign the launch it had already sent");
  assert.equal(grantOnDisk().launchesUsed, 1, "the same launch was charged twice");
});

test("L-05 CONTROL widening the grant to two launches lets the second project through, and spends the second slot", async () => {
  // Without this, L-03 is satisfied by a signer that refuses every launch after the first
  // regardless of what the creator authorized — a constant, not a reading of `launchesAllowed`.
  writeAuthorization({ ...grantOnDisk(), launchesAllowed: 2 });
  const data = otherProjectCalldata("Second Project", "SCND");
  const req = signingRequest({ data, dataHash: keccak256(data), launchPlanHash: SECOND_PLAN_HASH, bundleHash: SECOND_BUNDLE_HASH });
  const signed = await second.sign(req, sim(req));
  assert.equal(signed.kind, "SIGNED", "a grant that allows two launches refused the second");
  const auth = grantOnDisk();
  assert.equal(auth.launchesUsed, 2);
  assert.equal(auth.consumedLaunchPlanHashes.length, 2, "the second launch was signed without being recorded");
});

test("L-06 and the THIRD project is refused again, on the same widened grant", async () => {
  const data = otherProjectCalldata("Third Project", "THRD");
  const req = signingRequest({ data, dataHash: keccak256(data), launchPlanHash: THIRD_PLAN_HASH, bundleHash: THIRD_BUNDLE_HASH });
  const code = await refusalCode(third, "a third distinct project on a two-launch grant", req);
  assert.equal(code, "AUTHORIZATION_CONSUMED");
  assert.equal(grantOnDisk().launchesUsed, 2);
});

test("L-07 spending an exhausted grant THROWS rather than writing launchesUsed past launchesAllowed", () => {
  // The guard refuses before this is reached, so this arm is only ever entered when the check and
  // the spend disagree. Clamping or incrementing anyway would turn that disagreement into an
  // unbounded grant, silently, in the one file that records the creator's authority.
  const before = grantOnDisk();
  assert.ok(before.launchesUsed >= before.launchesAllowed, "fixture drift: the grant must be exhausted here or this control proves nothing");
  assert.throws(
    () => consumeAuthorization(THIRD_PLAN_HASH),
    (err) => err instanceof AuthorizationSpendError && err.reason === "AUTHORIZATION_CONSUMED",
    "an exhausted grant was spent again",
  );
  assert.equal(grantOnDisk().launchesUsed, before.launchesUsed, "the failed spend still wrote to the grant");
});

// ---- THE CHECK, ISOLATED FROM THE SPEND ---------------------------------------------------------

test("L-08 checkAuthorization refuses a spent grant on its own, with no spend to fall back on", () => {
  // OVER THE SOCKET THESE TWO SHADOW EACH OTHER. Disabling the CHECK lets a spent grant reach
  // `consumeAuthorization`, which refuses it one step later with the identical code — so every
  // socket control stays green while the check does nothing. Calling it directly is the only way to
  // see it fail. (Before this file existed the reverse hole was the shipped one: the spend did not
  // exist at all, and the check was the only thing anybody had written a control for.)
  const auth = grantOnDisk();
  assert.ok(auth.launchesUsed >= auth.launchesAllowed, "fixture drift: the grant must be spent here");

  const spent = checkAuthorization({ signerAddress: auth.signerAddress, launchPlanHash: THIRD_PLAN_HASH });
  assert.equal(spent.ok, false, "a spent grant was reported usable for a launch it has never covered");
  assert.equal(spent.reason, "AUTHORIZATION_CONSUMED");

  // And the other half of the same rule: the launches it WAS spent on are still covered, so a
  // resumed run is not locked out. Without this assertion the check could be "always refuse".
  const resumed = checkAuthorization({ signerAddress: auth.signerAddress, launchPlanHash: LAUNCH_PLAN_HASH });
  assert.equal(resumed.ok, true, "a spent grant stopped covering the launch it was spent on; a crash-resume would be locked out");
});

test("L-09 a grant that DISAPPEARS between the check and the spend is refused, not signed", () => {
  // THE ARM THAT ONLY A RACE REACHES. `consumeAuthorization` throwing means the check and the spend
  // disagree, which the guard normally makes impossible — so the fail-closed handling around it has
  // no control unless something actually creates the disagreement. A creator revoking (or a
  // filesystem losing) the grant between the two is the real version of that race, and this
  // reproduces it exactly: the adapter's own `supportsChain`, which the guard asks LAST, removes
  // the file.
  //
  // The requirement is not that it refuses politely. It is that `adapter.sign` is never reached.
  return (async () => {
    const path = authorizationPath();
    const saved = grantOnDisk();
    writeAuthorization({ ...saved, launchesAllowed: 99 }); // the CHECK will pass; the file will not survive to the SPEND
    const calls = [];
    const adapter = {
      id: "vanishing-grant",
      getAddress: async () => saved.signerAddress,
      supportsChain: async () => { rmSync(path, { force: true }); return true; },
      sign: async (req) => { calls.push(req); return { kind: "SIGNED", rawTransaction: "0x02", signerAddress: saved.signerAddress }; },
    };
    const signer = createPolicyBoundSigner(adapter, TEST_POLICY, APPROVED_BUILD);
    const data = launchCalldata();
    const req = signingRequest({ data, dataHash: keccak256(data), launchPlanHash: THIRD_PLAN_HASH, bundleHash: APPROVED_BUILD.bundleHash });
    const outcome = await signer.trySign({ ...req, launchPlanHash: APPROVED_BUILD.launchPlanHash }, sim(req));
    assert.equal(outcome.kind, "REFUSED", "the grant vanished and the key was asked to sign anyway");
    assert.equal(calls.length, 0, "the adapter was reached after the spend failed; a signature was produced against no authorization");
    writeAuthorization(saved);
  })();
});
