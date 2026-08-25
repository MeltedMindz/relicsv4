#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE PRODUCTION READ-ONLY REHEARSAL.
//
// Runs the real autonomous flow against the real mainnets and BROADCASTS NOTHING. Every call below
// is `eth_call`, `eth_getCode`, `eth_getBalance` or a log read. No transaction is signed and no
// metadata is pinned, so this leaves no trace on any chain and costs nothing but RPC.
//
// IT STOPS AT A NAMED BOUNDARY AND SAYS SO. `simulate` calls `launch()` for real, and the factory
// reverts `MetadataNotPublished` because this rehearsal deliberately does not publish a metadata
// URI to the resolver — publishing one is a WRITE, and the whole point of a read-only rehearsal is
// that it performs none. That revert is the EXPECTED result and is reported as a pass of the
// rehearsal; a rehearsal that quietly published throwaway metadata to make a green tick appear
// would be a different, worse thing.
//
// What this therefore proves, precisely: chain admission, quote selection, deterministic chain
// scoring, canonical params assembly, and the deployed factory's OWN address prediction — all live.
// What it does not prove is the post-metadata half, which the local fork harness covers.
// ================================================================================================
import { getAddress } from "viem";

const CHAINS = [1, 8453, 4663];
const sdk = await import("@relics/launch-sdk");

const POLICY_INPUT = {
  version: 1, goal: "LAUNCH", allowedChains: CHAINS, chainSelection: "PREFERRED_THEN_GAS",
  allowedRuntimes: ["SOLIDITY_SVG_V1"], allowedQuoteAssets: "AUTO",
  creatorRecipient: "0x00000000000000000000000000000000000000A1",
  allowedAntiSnipeModes: ["NONE", "PROTECTED_98_MINUTES"], antiSnipePreference: "AUTO",
  maxRoyaltyBps: 500, maxNativeSpendWei: "0", maxGasPriceWei: "500000000000",
  maxTransactionGas: "16000000", requireSimulation: true, requireMetadataReadback: true,
  requireDeterministicPrediction: true, requiredConfirmations: 2, allowBroadcast: false, signer: "none",
};
const parsed = sdk.parseAgentPolicy(POLICY_INPUT);
if (!parsed.ok) { console.error("policy fixture invalid:", parsed.issues); process.exit(1); }
const policy = parsed.policy;

/** A launcher with no funds and no keys anywhere. Prediction is namespaced by the SENDER, so this
 *  address's predicted set belongs to nobody and can never be launched by anyone else. */
const LAUNCHER = "0x000000000000000000000000000000000000dEaD";

/** The solidity-svg-params template's own configuration, encoded by the canonical ACV1 encoder. */
const { encodeArtConfigV1Checked } = await import("@relics/project-schema/art-config");
const { toHex } = await import("viem");
// The encoder returns BYTES; `LaunchParams.artConfig` is `bytes` on the wire and viem wants hex.
const ART_CONFIG = toHex(encodeArtConfigV1Checked({
  version: 1, format: "ACV1", title: "Rehearsal", animate: true, background: 0,
  palette: ["#0a0a0b", "#ded9d2", "#c9a227", "#b4532a"],
  layers: [
    { kind: "RINGS", sensor: "QUOTE_VOLUME", curve: "LOG2", palette: 2, amountMin: 3, amountMax: 18 },
    { kind: "STRATA", sensor: "DRAWDOWN", curve: "EASE", palette: 1, amountMin: 0, amountMax: 14 },
    { kind: "VEIL", sensor: "STRESS", curve: "LINEAR", palette: 3, amountMin: 1, amountMax: 1 },
  ],
  traits: [
    { name: "Volume", source: "VOLUME_TIER", style: "WORD" },
    { name: "Drawdown", source: "DRAWDOWN", style: "NUMBER" },
    { name: "Swaps", source: "FRAGMENTATION", style: "NUMBER" },
    { name: "Vein", source: "DNA_SLOT_0", style: "HEX" },
  ],
}));

let failures = 0;
const rows = [];

for (const chainId of CHAINS) {
  const row = { chainId, capability: null, quote: null, prepare: null, predict: null, simulate: null };
  const profile = sdk.getChainProfile(chainId);
  const made = sdk.makeClient(profile);
  if (!made) { row.capability = "NO_RPC"; rows.push(row); failures++; continue; }
  const { client } = made;

  // ---- 1/2. capability -------------------------------------------------------------------------
  const cap = await sdk.getChainCapability(chainId, { requiredRuntimeTag: "SOLIDITY_SVG_V1" });
  row.capability = cap.launchable;
  if (cap.launchable !== "PROVEN") { failures++; rows.push(row); continue; }

  // ---- 3. quotes --------------------------------------------------------------------------------
  const inventory = await sdk.getQuoteAssets(client, profile.contracts.launchpadFactory);
  const chosen = sdk.selectQuote(inventory, policy.allowedQuoteAssets);
  row.quote = chosen.quote ? `${chosen.quote.symbol}/${chosen.quote.decimals}dp` : `REFUSED: ${chosen.reason.slice(0, 60)}`;
  if (!chosen.quote) { failures++; rows.push(row); continue; }
  row.quoteCandidates = inventory.candidates.length;

  // ---- 4. prepare — the canonical builder, no chain write ----------------------------------------
  const input = {
    name: "Rehearsal", symbol: "RHS", totalSupplyWhole: 1_000_000n, artworkBackingUnits: 10_000n,
    startingPreset: 1, creatorRecipient: policy.creatorRecipient,
    antiSnipeMode: sdk.AntiSnipeMode.PROTECTED_98_MINUTES,
    // A well-formed ipfs:// URI that is NOT published to the resolver. `prepare` only hashes the
    // string, so this is honest input; `simulate` is where the absence shows up, by design.
    metadataUri: "ipfs://bafkreicwcpyuqhcj5mtofwruwnn32vectrxbetjvvfgimbikqevxhzrqni",
    // REAL ACV1 BYTES from the kit's own launchable template, not a four-byte magic header. The
    // stub was rejected by `ArtConfigRejected` — correctly, because it is not a configuration.
    art: { mode: sdk.ArtMode.SOLIDITY_SVG, artTemplateId: 1n, artConfig: ART_CONFIG },
  };
  // ---- MINE A REAL HOOK SALT, AND USE REAL ART BYTES ------------------------------------------
  // The first version of this rehearsal passed `0x00…00` for both salts and every chain reverted
  // `BadHookAddress()` — which the decoder could not even name, because the hook's errors are not
  // in the factory's ABI. A zero hook salt is an ADDRESS THAT DOES NOT CARRY THE REQUIRED FLAG
  // BITS, so the launch is refused before it reaches any of the checks this rehearsal is trying to
  // exercise. Mining here makes the rehearsal reach the boundary it claims to reach.
  let hookSalt;
  try {
    const lane = await sdk.hookLaneFor(client, profile.contracts.launchpadFactory);
    const mined = await sdk.mineHookSalt({ deployer: lane.deployer, caller: profile.contracts.launchpadFactory, launcher: LAUNCHER, initCodeHash: lane.initCodeHash });
    hookSalt = mined.salt;
    row.hookInitCodeHash = lane.initCodeHash.slice(0, 14) + "…";
    row.hookAddress = mined.hookAddress;
    row.hookAttempts = mined.attempts;
  } catch (err) {
    row.hookInitCodeHash = `mining failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 60)}`;
    failures++; rows.push(row); continue;
  }

  let prepared;
  try {
    prepared = sdk.prepare(input, { tokenSalt: `0x${"00".repeat(32)}`, hookSalt }, chainId, profile.contracts.launchpadFactory);
    row.prepare = `OK prepareHash=${prepared.prepareHash.slice(0, 14)}…`;
  } catch (err) { row.prepare = `FAILED: ${err instanceof Error ? err.message : String(err)}`; failures++; rows.push(row); continue; }

  // ---- 5. predict — the DEPLOYED FACTORY's own answer ---------------------------------------------
  try {
    const p = await sdk.predict(client, profile.contracts.launchpadFactory, prepared.params, LAUNCHER);
    row.predict = `token=${p.projectToken.slice(0, 10)}… collection=${p.projectCollection.slice(0, 10)}… hook=${p.artHook.slice(0, 10)}…`;
    row.poolId = p.poolId.slice(0, 14) + "…";
  } catch (err) { row.predict = `FAILED: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`; failures++; }

  // ---- 6. simulate — real eth_call, expected to stop at the metadata boundary ----------------------
  const { data } = sdk.encodeLaunch(prepared.params);
  const sim = await sdk.simulate(client, { from: LAUNCHER, to: profile.contracts.launchpadFactory, value: 0n, data, params: prepared.params });
  row.simulate = sim.ok ? "SUCCEEDED" : `reverted: ${String(sim.revert).slice(0, 60)}`;
  row.simulateBlock = String(sim.blockNumber);
  row.calldataBytes = (data.length - 2) / 2;
  row.dataHash = sim.dataHash.slice(0, 14) + "…";
  rows.push(row);
}

console.log("\n=== production read-only rehearsal — NOTHING WAS BROADCAST, NOTHING WAS PINNED ===\n");
for (const r of rows) {
  console.log(`chain ${r.chainId}`);
  console.log(`  capability      ${r.capability}`);
  console.log(`  quote           ${r.quote}${r.quoteCandidates ? ` (of ${r.quoteCandidates} candidate(s) read live)` : ""}`);
  console.log(`  prepare         ${r.prepare}`);
  console.log(`  predict         ${r.predict}`);
  console.log(`  poolId          ${r.poolId ?? "-"}`);
  console.log(`  hook            ${r.hookAddress ?? "-"} (mined in ${r.hookAttempts ?? "-"} attempts, initCodeHash ${r.hookInitCodeHash ?? "-"})`);
  console.log(`  calldata        ${r.calldataBytes ?? "-"} bytes, keccak ${r.dataHash ?? "-"}`);
  console.log(`  simulate        ${r.simulate}   (block ${r.simulateBlock ?? "-"})`);
}

// The rehearsal PASSES when every chain got through prediction. A `MetadataNotPublished` revert at
// simulate is the expected boundary of a no-write rehearsal, not a failure of it — and any OTHER
// revert is a real finding, so the two are distinguished rather than lumped together.
const predicted = rows.filter((r) => r.predict && !String(r.predict).startsWith("FAILED")).length;
// THE BOUNDARY IS WHATEVER THE CHAIN ACTUALLY SAID, REPORTED BY NAME. This list is not a
// whitelist of excuses: each entry is a refusal a NO-WRITE, NO-MINE rehearsal necessarily hits,
// and anything else is a real finding that must not be absorbed into a green tick.
//   BadHookAddress      — no hook salt was mined; mining is a local computation, but binding the
//                         mined address is part of the launch this rehearsal deliberately does not send.
//   MetadataNotPublished — no URI was published to the resolver; publishing is a WRITE.
// The boundary a no-WRITE rehearsal necessarily hits. Publishing a URI to the resolver is a write,
// and it is the ONLY remaining thing between this and a launch — the hook salt is mined, the art
// config is real, the params are canonical and the addresses agree with the contract.
const EXPECTED_BOUNDARIES = /MetadataNotPublished|SUCCEEDED/;
const unexpected = rows.filter((r) => r.simulate && !EXPECTED_BOUNDARIES.test(r.simulate));
console.log(`\nPRODUCTION_READONLY_CHAINS=${predicted}/${CHAINS.length}`);
console.log(`PRODUCTION_READONLY_BROADCASTS=0`);
console.log(`PRODUCTION_READONLY_PINS=0`);
const boundaries = [...new Set(rows.map((r) => String(r.simulate).replace(/^reverted: /, "")))];
console.log(`READONLY_BOUNDARY=${unexpected.length === 0 ? boundaries.join(" | ") : "UNEXPECTED_REVERT"}`);
console.log(`READONLY_BOUNDARY_EXPECTED=${unexpected.length === 0 ? "YES" : "NO"}`);
for (const u of unexpected) console.log(`  unexpected revert on chain ${u.chainId}: ${u.simulate}`);
// PASS REQUIRES THE BOUNDARY TO BE THE EXPECTED ONE. The first version printed UNEXPECTED_REVERT
// and PASS in the same breath, which is exactly the kind of self-contradicting green this project
// treats as a defect in the gate rather than a quirk of it.
const pass = predicted === CHAINS.length && failures === 0 && unexpected.length === 0;
console.log(`PRODUCTION_READONLY_AGENT_FLOW=${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
