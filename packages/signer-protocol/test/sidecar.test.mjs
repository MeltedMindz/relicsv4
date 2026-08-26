// SPDX-License-Identifier: MIT
// ================================================================================================
// The sidecar protocol, both ends.
//
// HONEST SCOPE: this suite runs the client and the server in ONE process, so it proves the
// PROTOCOL — the wire form, the routes, and that the server refuses with the same codes the
// in-process guard produces. It does not prove process separation; that is a property of how the
// sidecar is deployed, not of this code.
//
// The control that matters here is the second one. A guard the agent runs is advice, because the
// agent's own code can skip it. The server's copy is what the request actually meets, so an
// out-of-policy request POSTed straight at the socket — bypassing every agent-side check — has to
// come back refused.
// ================================================================================================
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { keccak256, recoverTransactionAddress } from "viem";
import { SignerRefusedError, SignerTransportError, encodeSigningRequest } from "../src/index.ts";
import { startSignerServer } from "../src/signerServer.ts";
import { createDevKeystoreSigner } from "../src/adapters/devKeystore.ts";
import { SIGNER_URL_ENV, createLocalSidecarSigner } from "../src/adapters/localSidecar.ts";
import {
  ANVIL_ACCOUNT_ZERO,
  ANVIL_ACCOUNT_ZERO_ADDRESS,
  APPROVED_BUILD,
  ATTACKER_RECIPIENT,
  LAUNCH_SELECTOR,
  TEST_CHAIN_ID,
  TEST_POLICY,
  erc20TransferCalldata,
  launchCalldata,
  signingRequest,
  withTestAuthorization,
} from "./helpers.mjs";

let running;
let client;
let grant;

/** The proof the signer now requires: a successful simulation OF THESE EXACT BYTES. */
const simulationFor = (req) => ({ ok: true, dataHash: req.dataHash, chainId: req.chainId, blockNumber: "1" });

before(async () => {
  // THE SERVER REQUIRES A GRANT AND NEVER TAKES THE ESCAPE HATCH -- that is what it is for. So this
  // suite supplies one the way a creator would, relocated into a temp RELICS_HOME so nothing here
  // can touch a real wallet or a real authorization. A test that switched the requirement off
  // instead would be testing a server nobody runs.
  grant = withTestAuthorization();
  await grant.install();
  running = await startSignerServer({
    adapter: createDevKeystoreSigner({ privateKey: ANVIL_ACCOUNT_ZERO }),
    policy: TEST_POLICY,
    approvedBuild: APPROVED_BUILD,
  });
  client = createLocalSidecarSigner({ url: running.url });
});

after(async () => {
  await running.close();
  grant.restore();
});

test("the server binds loopback and reports the origin it actually got", () => {
  assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test("GET /address and GET /supports-chain answer the two questions an adapter has to", async () => {
  assert.equal((await client.getAddress()).toLowerCase(), ANVIL_ACCOUNT_ZERO_ADDRESS.toLowerCase());
  assert.equal(await client.supportsChain(TEST_CHAIN_ID), true);
  assert.equal(await client.supportsChain(1), false);
});

test("a well-formed in-policy launch is signed across the wire", async () => {
  const request = signingRequest();
  const result = await client.sign(request, simulationFor(request));
  assert.equal(result.kind, "SIGNED");
  const recovered = await recoverTransactionAddress({ serializedTransaction: result.rawTransaction });
  assert.equal(recovered.toLowerCase(), ANVIL_ACCOUNT_ZERO_ADDRESS.toLowerCase());
});

test("CONTROL: the SERVER applies the same guard — an out-of-policy request POSTed straight at the socket is refused", async () => {
  // AN ERC-20 TRANSFER WEARING THE LAUNCH SELECTOR. It carries a valid simulation proof so it gets
  // PAST the grant checks and reaches the shape guard this control is actually about; without the
  // proof it would refuse for the right reason at the wrong step and prove nothing about selectors.
  const data = erc20TransferCalldata();
  const arbitrary = signingRequest({ data, dataHash: keccak256(data), selector: LAUNCH_SELECTOR });
  await assert.rejects(
    () => client.sign(arbitrary, simulationFor(arbitrary)),
    (error) => error instanceof SignerRefusedError && error.code === "SELECTOR_NOT_ALLOWED",
  );

  // …and the raw HTTP answer is a 403 carrying the typed refusal, not a 500 and not a signature.
  //
  // TWO GUARDS REFUSE A REDIRECTED RECIPIENT AND THE SHAPE GUARD GETS THERE FIRST. The order is
  // permission -> shape -> grant-calldata, so `RECIPIENT_NOT_POLICY_RECIPIENT` fires before the
  // grant's `RECIPIENT_NOT_AUTHORIZED` ever runs. Both compare the recipient DECODED FROM THE
  // BYTES against an authorized value, and the redundancy is deliberate: the shape guard checks it
  // against the policy the build was approved under, the grant against what the human typed. A
  // launch has to satisfy both.
  const redirected = signingRequest({ data: launchCalldata(ATTACKER_RECIPIENT) });
  const response = await fetch(new URL("/sign", running.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: encodeSigningRequest(redirected), simulation: simulationFor(redirected) }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(Object.keys(await response.clone().json()).sort(), ["code", "detail", "kind"]);
  assert.equal((await response.json()).code, "RECIPIENT_NOT_POLICY_RECIPIENT");
});

test("a body that does not parse is a 400, never a refusal code", async () => {
  // "The JSON was truncated" and "the policy declined this launch" must not arrive on the same
  // channel: an agent that confused them would tell a creator their launch was rejected.
  const response = await fetch(new URL("/sign", running.url), { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "MALFORMED_SIGNING_REQUEST");
  assert.equal(body.kind, undefined);
  assert.equal(body.code, undefined);
});

test("a JSON number where a wei amount belongs is refused rather than rounded", async () => {
  const wire = { ...encodeSigningRequest(signingRequest()), value: 12345678901234567890 };
  const response = await fetch(new URL("/sign", running.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(wire) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).detail, /^value:/);
});

test("only the three protocol routes exist", async () => {
  assert.equal((await fetch(new URL("/keys", running.url))).status, 404);
  assert.equal((await fetch(new URL("/sign", running.url))).status, 405);
});

test("an oversized body is refused while it streams", async () => {
  const server = await startSignerServer({
    adapter: createDevKeystoreSigner({ privateKey: ANVIL_ACCOUNT_ZERO }),
    policy: TEST_POLICY,
    approvedBuild: APPROVED_BUILD,
    maxBodyBytes: 1024,
  });
  try {
    const response = await fetch(new URL("/sign", server.url), { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(4096) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).detail, /1024-byte limit/);
  } finally {
    await server.close();
  }
});

test("the client reads RELICS_SIGNER_URL, and refuses a signer that is not on loopback", () => {
  const previous = process.env[SIGNER_URL_ENV];
  try {
    process.env[SIGNER_URL_ENV] = running.url;
    assert.ok(createLocalSidecarSigner().id.includes(running.url));

    process.env[SIGNER_URL_ENV] = "http://signer.example.com:8080";
    assert.throws(() => createLocalSidecarSigner(), (e) => e instanceof SignerTransportError && e.reason === "SIGNER_URL_NOT_LOOPBACK");

    delete process.env[SIGNER_URL_ENV];
    assert.throws(() => createLocalSidecarSigner(), (e) => e instanceof SignerTransportError && e.reason === "SIGNER_URL_NOT_CONFIGURED");
  } finally {
    if (previous === undefined) delete process.env[SIGNER_URL_ENV];
    else process.env[SIGNER_URL_ENV] = previous;
  }
});

test("a signer that is not listening is a transport failure, never a refusal", async () => {
  // Nothing about an unreachable signer says the request was unacceptable, and reporting it as a
  // refusal would stop an agent that should have retried.
  const dead = createLocalSidecarSigner({ url: "http://127.0.0.1:1", timeoutMs: 500 });
  await assert.rejects(() => dead.sign(signingRequest()), (e) => e instanceof SignerTransportError && e.reason === "SIGNER_UNREACHABLE");
});
