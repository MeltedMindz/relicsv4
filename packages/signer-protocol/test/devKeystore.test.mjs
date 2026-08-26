// SPDX-License-Identifier: MIT
// ================================================================================================
// The development keystore adapter: what it signs, and the four chains it will not.
//
// The refusal is asserted TWO ways, because they fail independently. `supportsChain` is what the
// policy guard asks, so it is what turns a mainnet request into a typed `SIGNER_DOES_NOT_SUPPORT_CHAIN`
// for the agent. `sign` is what a caller that skipped the guard reaches, so it has to refuse on its
// own — an adapter whose only protection is the wrapper in front of it is not protected.
// ================================================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { parseTransaction, recoverTransactionAddress } from "viem";
import { createPolicyBoundSigner, SignerRefusedError, SignerTransportError } from "../src/index.ts";
import { DEV_SIGNER_KEY_ENV, REFUSED_CHAIN_IDS, createDevKeystoreSigner } from "../src/adapters/devKeystore.ts";
import { ANVIL_ACCOUNT_ZERO, ANVIL_ACCOUNT_ZERO_ADDRESS, APPROVED_BUILD, TEST_CHAIN_ID, TEST_POLICY, signingRequest } from "./helpers.mjs";

const devSigner = () => createDevKeystoreSigner({ privateKey: ANVIL_ACCOUNT_ZERO });

test("the refused set is exactly the production chains, derived from the kit's declaration", () => {
  assert.deepEqual([...REFUSED_CHAIN_IDS].sort((a, b) => a - b), [1, 56, 4663, 8453].sort((a, b) => a - b));
});

test("CONTROL: the dev keystore refuses to sign on chainId 1", async () => {
  const signer = devSigner();

  // It signs on a local chain — so the refusal below is about the chain and not about the adapter
  // being broken.
  const local = await signer.sign(signingRequest({ chainId: TEST_CHAIN_ID }));
  assert.equal(local.kind, "SIGNED");

  assert.equal(await signer.supportsChain(1), false);
  await assert.rejects(
    () => signer.sign(signingRequest({ chainId: 1 })),
    (error) => error instanceof SignerRefusedError && error.code === "SIGNER_DOES_NOT_SUPPORT_CHAIN" && /chain 1/.test(error.refusal.detail),
  );
});

test("CONTROL: every production chain is refused, not only Ethereum", async () => {
  const signer = devSigner();
  for (const chainId of [1, 8453, 4663, 56]) {
    assert.equal(await signer.supportsChain(chainId), false, `chain ${chainId} must not be supported`);
    await assert.rejects(
      () => signer.sign(signingRequest({ chainId })),
      (error) => error instanceof SignerRefusedError && error.code === "SIGNER_DOES_NOT_SUPPORT_CHAIN",
      `chain ${chainId} must be refused by sign()`,
    );
  }
  assert.equal(await signer.supportsChain(TEST_CHAIN_ID), true);
});

test("the chain is checked BEFORE the key is read: a mainnet request with no key configured still refuses on the chain", async () => {
  const previous = process.env[DEV_SIGNER_KEY_ENV];
  delete process.env[DEV_SIGNER_KEY_ENV];
  try {
    const keyless = createDevKeystoreSigner();
    // Configuring a key must not "fix" a mainnet request, so the mainnet refusal cannot be the
    // missing-key error.
    await assert.rejects(
      () => keyless.sign(signingRequest({ chainId: 1 })),
      (error) => error instanceof SignerRefusedError && error.code === "SIGNER_DOES_NOT_SUPPORT_CHAIN",
    );
    // On a local chain the same signer reports the real problem instead.
    await assert.rejects(
      () => keyless.sign(signingRequest({ chainId: TEST_CHAIN_ID })),
      (error) => error instanceof SignerTransportError && error.reason === "DEV_SIGNER_KEY_NOT_CONFIGURED",
    );
  } finally {
    if (previous === undefined) delete process.env[DEV_SIGNER_KEY_ENV];
    else process.env[DEV_SIGNER_KEY_ENV] = previous;
  }
});

test("a mainnet request through the policy-bound signer comes back as a typed refusal, not a signature", async () => {
  // The policy here ALLOWS chain 1, so every static check passes and the only thing standing
  // between this request and a signature is the adapter's own answer about the chain.
  const policy = { ...TEST_POLICY, allowedChains: [1] };
  const build = { ...APPROVED_BUILD, chainId: 1 };
  const signer = createPolicyBoundSigner(devSigner(), policy, build, { requireGrant: false });
  const refused = await signer.trySign(signingRequest({ chainId: 1 }));
  assert.equal(refused.kind, "REFUSED");
  assert.equal(refused.code, "SIGNER_DOES_NOT_SUPPORT_CHAIN");
});

test("a well-formed in-policy launch is SIGNED, and the signature is over the bytes that were checked", async () => {
  const signer = createPolicyBoundSigner(devSigner(), TEST_POLICY, APPROVED_BUILD, { requireGrant: false });
  const request = signingRequest();
  const result = await signer.sign(request);

  assert.equal(result.kind, "SIGNED");
  assert.equal(result.signerAddress.toLowerCase(), ANVIL_ACCOUNT_ZERO_ADDRESS.toLowerCase());

  // Decoded back out of the signed bytes rather than read off the request: this is the same
  // "check the bytes" rule the guard follows, applied to its own output.
  const parsed = parseTransaction(result.rawTransaction);
  assert.equal(parsed.data, request.data);
  assert.equal(parsed.to.toLowerCase(), request.to.toLowerCase());
  assert.equal(parsed.chainId, request.chainId);
  assert.equal(parsed.value ?? 0n, request.value);
  assert.equal(parsed.gas, request.estimatedGas);
  assert.equal(parsed.maxFeePerGas, request.maxFeePerGas);
  assert.equal(parsed.nonce, request.nonce);

  const recovered = await recoverTransactionAddress({ serializedTransaction: result.rawTransaction });
  assert.equal(recovered.toLowerCase(), ANVIL_ACCOUNT_ZERO_ADDRESS.toLowerCase());
});

test("a request without a nonce or a fee is not signed with an invented one", async () => {
  const signer = devSigner();
  const noNonce = signingRequest();
  delete noNonce.nonce;
  await assert.rejects(() => signer.sign(noNonce), (e) => e instanceof SignerTransportError && e.reason === "INCOMPLETE_SIGNING_REQUEST");

  const noFee = signingRequest();
  delete noFee.maxFeePerGas;
  await assert.rejects(() => signer.sign(noFee), (e) => e instanceof SignerTransportError && e.reason === "INCOMPLETE_SIGNING_REQUEST");
});

test("a malformed key is refused without the value reaching the error message", async () => {
  const signer = createDevKeystoreSigner({ privateKey: "0xnotakey" });
  await assert.rejects(
    () => signer.getAddress(),
    (error) => error instanceof SignerTransportError && error.reason === "DEV_SIGNER_KEY_MALFORMED" && !error.message.includes("notakey"),
  );
});
