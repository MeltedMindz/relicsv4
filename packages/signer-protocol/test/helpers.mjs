// SPDX-License-Identifier: MIT
// Fixtures shared by the negative controls.
//
// Every test here works the same way: build ONE well-formed, in-policy launch, prove it is
// accepted, then change exactly one thing and prove the guard names that thing. A control that only
// shows a refusal proves nothing — a guard that refuses everything would pass it.
import { encodeFunctionData, keccak256, toHex } from "viem";
import { LAUNCH_FACTORY_ABI, LAUNCH_SELECTOR } from "../src/launchAbi.ts";

// ------------------------------------------------------------------------------------------------
// TEST ONLY — anvil default account #0, public knowledge, never fund.
//
// This is the first account anvil and hardhat print on every start, documented in both projects and
// present in millions of repositories. It is here so a fork harness can produce a real signature;
// it protects nothing and must never hold value. The dev keystore adapter refuses every production
// chain, so this account cannot be used to sign one.
// ------------------------------------------------------------------------------------------------
export const ANVIL_ACCOUNT_ZERO = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const ANVIL_ACCOUNT_ZERO_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

/** A local development chain id. Deliberately not 1/8453/4663/56 — see `adapters/devKeystore.ts`. */
export const TEST_CHAIN_ID = 31337;

/** Synthetic addresses. None of them is a deployed contract; they exist to be compared. */
export const CREATOR_RECIPIENT = "0x1111111111111111111111111111111111111111";
export const ATTACKER_RECIPIENT = "0x2222222222222222222222222222222222222222";
export const APPROVED_FACTORY = "0x3333333333333333333333333333333333333333";
export const SOME_OTHER_CONTRACT = "0x4444444444444444444444444444444444444444";

export const POLICY_HASH = keccak256(toHex("policy@v1"));
export const LAUNCH_PLAN_HASH = keccak256(toHex("plan@v1"));
export const BUNDLE_HASH = keccak256(toHex("bundle@v1"));

/** `relics.agent.json` as this suite's creator wrote it. */
export const TEST_POLICY = Object.freeze({
  version: 1,
  goal: "LAUNCH",
  allowedChains: Object.freeze([TEST_CHAIN_ID]),
  chainSelection: "PREFERRED_ORDER",
  allowedRuntimes: Object.freeze(["SOLIDITY_SVG"]),
  allowedQuoteAssets: "AUTO",
  creatorRecipient: CREATOR_RECIPIENT,
  allowedAntiSnipeModes: Object.freeze(["NONE", "PROTECTED_98_MINUTES"]),
  antiSnipePreference: "AUTO",
  maxRoyaltyBps: 500,
  maxNativeSpendWei: 0n,
  maxGasPriceWei: 50_000_000_000n,
  maxTransactionGas: 14_000_000n,
  requireSimulation: true,
  requireMetadataReadback: true,
  requireDeterministicPrediction: true,
  requiredConfirmations: 1,
  allowBroadcast: true,
  signer: "dev-keystore",
});

export const APPROVED_BUILD = Object.freeze({
  chainId: TEST_CHAIN_ID,
  factory: APPROVED_FACTORY,
  policyHash: POLICY_HASH,
  launchPlanHash: LAUNCH_PLAN_HASH,
  bundleHash: BUNDLE_HASH,
});

const ART_CONFIG = "0xdeadbeefcafebabe";

/** A complete nineteen-field `LaunchParams`. Only `creatorRecipient` ever varies in these tests. */
export function launchParams(creatorRecipient = CREATOR_RECIPIENT) {
  return {
    name: "Control Project",
    symbol: "CTRL",
    totalSupply: 10_000n * 10n ** 18n,
    artworkBackingUnits: 1_000n,
    startingPreset: 0,
    tokenSalt: keccak256(toHex("token-salt")),
    hookSalt: keccak256(toHex("hook-salt")),
    // artMode 0 = SOLIDITY_SVG_V1, the only runtime any chain binds today and the only one the
    // test authorization allows. It was 1 (JavaScript) when the fixture only had to be well-formed
    // bytes; the grant guard reads this field, so it now has to be a runtime a creator would allow.
    artMode: 0,
    artTemplateId: 1n,
    artScriptHash: keccak256(ART_CONFIG),
    artConfig: ART_CONFIG,
    marketStateConfig: "0x",
    creatorRecipient,
    collaborators: [],
    burnPolicy: 0,
    antiSnipeMode: 1,
    metadataUriHash: keccak256(toHex("ipfs://bafkTestOnlyNotARealCid")),
    creatorEarnings: 0n,
    backingUnitsPerArtwork: 10n,
  };
}

/**
 * The same params with individual fields overridden — for the attack controls that need to change
 * one thing inside the struct (a royalty, a runtime, an election) rather than the recipient.
 */
export function launchParamsWith(overrides = {}) {
  return { ...launchParams(), ...overrides };
}

/** `launch(LaunchParams)` calldata, encoded against the committed RC6 ABI. */
export function launchCalldata(creatorRecipient = CREATOR_RECIPIENT) {
  return encodeFunctionData({ abi: LAUNCH_FACTORY_ABI, functionName: "launch", args: [launchParams(creatorRecipient)] });
}

/** ERC-20 `transfer(address,uint256)` — the "arbitrary calldata" control. */
export function erc20TransferCalldata(to = ATTACKER_RECIPIENT, amount = 1_000n) {
  return encodeFunctionData({
    abi: [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
    functionName: "transfer",
    args: [to, amount],
  });
}

/**
 * A `SigningRequest` that is correct in every respect, then overridden.
 *
 * `dataHash` and `selector` are DERIVED from whatever `data` ends up being, so a control that
 * changes the calldata gets a request that is internally consistent and fails on the field it meant
 * to test rather than tripping the hash check by accident. A control that wants the hash check must
 * override `dataHash` explicitly.
 */
export function signingRequest(overrides = {}) {
  const data = overrides.data ?? launchCalldata();
  const base = {
    chainId: TEST_CHAIN_ID,
    from: ANVIL_ACCOUNT_ZERO_ADDRESS,
    to: APPROVED_FACTORY,
    value: 0n,
    data,
    dataHash: keccak256(data),
    selector: data.slice(0, 10),
    estimatedGas: 9_000_000n,
    maxFeePerGas: 3_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    nonce: 0,
    launchPlanHash: LAUNCH_PLAN_HASH,
    bundleHash: BUNDLE_HASH,
    policyHash: POLICY_HASH,
  };
  return { ...base, ...overrides };
}

/**
 * A signer that records whether it was reached.
 *
 * `calls` is the assertion that matters in every refusal control: a guard that runs AFTER
 * delegation, or beside it, would leave this at zero only by luck.
 */
export function recordingAdapter(address = ANVIL_ACCOUNT_ZERO_ADDRESS, chains = [TEST_CHAIN_ID]) {
  const calls = [];
  return {
    calls,
    adapter: {
      id: "recording",
      getAddress: async () => address,
      supportsChain: async (chainId) => chains.includes(chainId),
      sign: async (req) => {
        calls.push(req);
        return { kind: "SIGNED", rawTransaction: "0x02", signerAddress: address };
      },
    },
  };
}

export { LAUNCH_SELECTOR };

// ------------------------------------------------------------------------------------------------
// A TEMPORARY AUTHORIZATION GRANT, for the tests that exercise the SERVER.
//
// `signerServer` requires a live grant and never takes the `requireGrant` escape hatch — that is
// the point of it. So a test that drives the server over a socket has to supply one, exactly as a
// creator would, rather than switching the requirement off. `RELICS_HOME` relocates the whole
// signer state directory into a temp dir, so nothing here touches a real creator's wallet or grant.
// ------------------------------------------------------------------------------------------------
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function withTestAuthorization(overrides = {}) {
  const home = mkdtempSync(join(tmpdir(), "relics-auth-"));
  const previous = process.env.RELICS_HOME;
  process.env.RELICS_HOME = home;
  const auth = {
    version: 1, preset: "SAFE_AUTONOMOUS", mode: "SINGLE_LAUNCH",
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    launchesAllowed: 1, launchesUsed: 0, revokedAt: null,
    signerAddress: ANVIL_ACCOUNT_ZERO_ADDRESS,
    creatorRecipient: CREATOR_RECIPIENT,
    allowedChains: [TEST_CHAIN_ID], allowedRuntimes: ["SOLIDITY_SVG_V1"],
    allowedQuoteAssets: "AUTO", allowedAntiSnipeModes: ["NONE", "PROTECTED_98_MINUTES"],
    maxRoyaltyBps: 500,
    maxTotalGasCostWei: (10n ** 18n).toString(),
    maxNativeSpendWei: "0",
    allowBroadcast: true, policyHash: POLICY_HASH, consumedLaunchPlanHashes: [],
    ...overrides,
  };
  return {
    auth,
    async install() {
      const { writeAuthorization } = await import("../src/authorization.ts");
      writeAuthorization(auth);
      return auth;
    },
    restore() {
      if (previous === undefined) delete process.env.RELICS_HOME;
      else process.env.RELICS_HOME = previous;
      rmSync(home, { recursive: true, force: true });
    },
  };
}
