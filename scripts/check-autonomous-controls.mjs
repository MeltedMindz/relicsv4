#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ADVERSARIAL CONTROLS for the autonomous launch flow. The count is REPORTED, not asserted
// in prose: it was written out as "twenty" and was stale the first time a control was added. A
// floor of 20 is enforced below; the number that ran is printed.
//
// Each one MUTATES the exact thing it is about and REQUIRES a refusal. A control that passes
// because some unrelated older guard happened to catch it proves nothing about the guard it names,
// so every case here is constructed to reach the specific check under test.
//
// Controls 1-5 delegate to the packages that own them and are re-run here so one command answers
// for the whole surface; the rest are exercised directly. A delegated suite that fails to run at
// all is a FAILURE, never a skip — an unrun control must never read as a passed one.
// ================================================================================================
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, encodeFunctionData, toFunctionSelector, getAddress } from "viem";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
let n = 0;

function control(name, fn) {
  n += 1;
  const id = String(n).padStart(2, "0");
  try {
    const outcome = fn();
    const pass = outcome === true;
    results.push({ id, name, pass, detail: pass ? "refused as required" : String(outcome) });
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${id}. ${name}${pass ? "" : ` -> ${outcome}`}`);
  } catch (err) {
    results.push({ id, name, pass: false, detail: err instanceof Error ? err.message : String(err) });
    console.log(`  FAIL  ${id}. ${name} -> threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function controlAsync(name, fn) {
  n += 1;
  const id = String(n).padStart(2, "0");
  try {
    const outcome = await fn();
    const pass = outcome === true;
    results.push({ id, name, pass, detail: pass ? "refused as required" : String(outcome) });
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${id}. ${name}${pass ? "" : ` -> ${outcome}`}`);
  } catch (err) {
    results.push({ id, name, pass: false, detail: err instanceof Error ? err.message : String(err) });
    console.log(`  FAIL  ${id}. ${name} -> threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const sdk = await import("@relics/launch-sdk");
const flow = await import("@relics/agent-flow");
const factoryAbi = sdk.FACTORY_ABI();

const BASE_POLICY = {
  version: 1, goal: "LAUNCH", allowedChains: [1, 8453], chainSelection: "PREFERRED_ORDER",
  allowedRuntimes: ["SOLIDITY_SVG_V1"], allowedQuoteAssets: "AUTO",
  creatorRecipient: "0x00000000000000000000000000000000000000A1",
  allowedAntiSnipeModes: ["NONE", "PROTECTED_98_MINUTES"], antiSnipePreference: "AUTO",
  maxRoyaltyBps: 500, maxNativeSpendWei: "0", maxGasPriceWei: "50000000000",
  maxTransactionGas: "16000000", requireSimulation: true, requireMetadataReadback: true,
  requireDeterministicPrediction: true, requiredConfirmations: 2, allowBroadcast: true, signer: "local-sidecar",
};
const parsed = sdk.parseAgentPolicy(BASE_POLICY);
if (!parsed.ok) { console.error("the base policy fixture does not parse:", parsed.issues); process.exit(1); }
const POLICY = parsed.policy;

const PARAMS = {
  name: "Control Fixture", symbol: "CTL", totalSupply: 1_000_000n * 10n ** 18n, artworkBackingUnits: 10_000n,
  startingPreset: 1, tokenSalt: `0x${"11".repeat(32)}`, hookSalt: `0x${"22".repeat(32)}`, artMode: 0,
  artTemplateId: 1n, artScriptHash: `0x${"33".repeat(32)}`, artConfig: "0xdeadbeef", marketStateConfig: "0x",
  creatorRecipient: POLICY.creatorRecipient, collaborators: [], burnPolicy: 0, antiSnipeMode: 2,
  metadataUriHash: `0x${"44".repeat(32)}`, creatorEarnings: 0n, backingUnitsPerArtwork: 1n,
};
const CALLDATA = sdk.encodeLaunch(PARAMS).data;

console.log("\n=== the adversarial controls ===\n");

// ---- delegated suites (each must actually RUN) ---------------------------------------------------
function runSuite(label, argv) {
  const r = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  if (r.status === null) return `${label} did not run to completion (timeout/kill) — an unrun control is not a passed one`;
  if (r.status !== 0) return `${label} exited ${r.status}: ${(r.stdout + r.stderr).split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 160)}`;
  lastSuiteOutput = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return true;
}
let lastSuiteOutput = "";

control("LaunchParams 19->15 / field swap / enum drift are all caught by the parity gate", () => runSuite("launch:parity --controls", ["scripts/check-launch-semantics-parity.mjs", "--controls"]));
// THE MUTATION COUNT IS READ OUT OF THE HARNESS, NEVER TYPED HERE. This label said "27 mutations"
// while the harness ran 53, which is the ordinary way a control's own description stops describing
// it. The harness prints its totals; a run that does not print them has not been measured, so the
// absence of the line is a failure rather than a count of zero.
control("signer refuses arbitrary transactions (mutation count read from the harness, none survive)", () => {
  const ok = runSuite("signer:mutate", ["packages/signer-protocol/test/mutate.mjs"]);
  if (ok !== true) return ok;
  const totals = /MUTATIONS=(\d+) SURVIVED=(\d+)/.exec(lastSuiteOutput);
  if (!totals) return "signer:mutate exited 0 but printed no MUTATIONS=/SURVIVED= line; there is nothing to read a result out of";
  const [, ran, survived] = totals;
  if (Number(survived) !== 0) return `${survived} of ${ran} signer mutations SURVIVED`;
  const grant = /SIGNER_GRANT_GUARD_MUTATIONS=(\d+)\/(\d+)_CAUGHT/.exec(lastSuiteOutput);
  if (!grant) return "signer:mutate printed no SIGNER_GRANT_GUARD_MUTATIONS line; the grant guard is the protected boundary and its coverage must be reported, not assumed";
  if (grant[1] !== grant[2]) return `only ${grant[1]} of ${grant[2]} grant-guard mutations were caught`;
  if (Number(grant[2]) === 0) return "the harness reports ZERO grant-guard mutations; an empty subject set is not a pass";
  console.log(`        (${ran} mutations, ${grant[2]} of them on the grant guard, 0 survivors)`);
  return true;
});
control("metadata fetch-back mismatch, gateway URI and digest conflation are refused", () => runSuite("launch:test", ["--test", "packages/launch-sdk/test/metadata.test.mjs"]));
control("MODE A stays offline when outbound connect is blocked", () => runSuite("kit:offline", ["scripts/check-offline-mode.mjs"]));
control("the vendored SDK has not drifted from the canonical private tree", () => runSuite("launch:parity", ["scripts/check-launch-semantics-parity.mjs"]));

// ---- policy ----------------------------------------------------------------------------------------
control("an unsupported chain is refused by policy", () => {
  const p = sdk.parseAgentPolicy({ ...BASE_POLICY, allowedChains: [999999] });
  if (!p.ok) return true;
  return p.policy.allowedChains.includes(1) ? "chain 1 leaked into a policy that did not allow it" : true;
});
control("an unknown policy field fails closed instead of being ignored", () => {
  const p = sdk.parseAgentPolicy({ ...BASE_POLICY, maxNativeSpendWeiTypo: "999" });
  return p.ok === false && p.issues.some((i) => i.code === "UNKNOWN_FIELD") ? true : "a misspelled ceiling was accepted";
});
control("allowBroadcast without requireSimulation is refused", () => {
  const p = sdk.parseAgentPolicy({ ...BASE_POLICY, requireSimulation: false });
  return p.ok === false && p.issues.some((i) => i.code === "BROADCAST_WITHOUT_SIMULATION") ? true : "broadcast authorised with simulation switched off";
});
control("a wei ceiling given as an unsafe JSON number is refused, not rounded", () => {
  const p = sdk.parseAgentPolicy({ ...BASE_POLICY, maxNativeSpendWei: 100000000000000000000 });
  return p.ok === false && p.issues.some((i) => i.code === "UNSAFE_NUMBER") ? true : "a ceiling that had already lost precision was accepted";
});
control("a gas ceiling above the EIP-7825 per-transaction cap is refused", () => {
  const p = sdk.parseAgentPolicy({ ...BASE_POLICY, maxTransactionGas: "99000000" });
  return p.ok === false && p.issues.some((i) => i.code === "ABOVE_PROTOCOL_CAP") ? true : "an unreachable gas ceiling was accepted as a looser one";
});

// ---- economics reconstructed from the FINAL calldata -------------------------------------------------
control("a recipient changed after simulation is caught by decoding the calldata", () => {
  const swapped = sdk.encodeLaunch({ ...PARAMS, creatorRecipient: "0x00000000000000000000000000000000000000bb" }).data;
  const r = sdk.reconstructAndCheck({ data: swapped, policy: POLICY, quote: null });
  return r.problems.some((p) => p.code === "RECIPIENT_NOT_POLICY_RECIPIENT") ? true : "a recipient the policy never authorised passed the economic check";
});
control("a royalty above the policy ceiling is caught in the final calldata", () => {
  const packed = sdk.packCreatorEarnings({ mode: 1, royaltyBps: 900 });
  const d = sdk.encodeLaunch({ ...PARAMS, creatorEarnings: packed }).data;
  const r = sdk.reconstructAndCheck({ data: d, policy: POLICY, quote: null });
  return r.problems.some((p) => p.code === "ROYALTY_ABOVE_POLICY") ? true : "a royalty above the ceiling was accepted";
});
control("antiSnipeMode UNSPECIFIED is refused rather than read as 'no protection'", () => {
  const d = sdk.encodeLaunch({ ...PARAMS, antiSnipeMode: 0 }).data;
  const r = sdk.reconstructAndCheck({ data: d, policy: POLICY, quote: null });
  return r.problems.some((p) => p.code === "ANTISNIPE_UNSPECIFIED") ? true : "an unelected launch passed as a deliberate one";
});
control("backing that exceeds total supply is refused", () => {
  const d = sdk.encodeLaunch({ ...PARAMS, backingUnitsPerArtwork: 1_000_000n }).data;
  const r = sdk.reconstructAndCheck({ data: d, policy: POLICY, quote: null });
  return r.problems.some((p) => p.code === "BACKING_EXCEEDS_SUPPLY") ? true : "a collection that could never awaken its supply passed";
});
control("a supply that differs from what the project configured is caught", () => {
  const r = sdk.reconstructAndCheck({ data: CALLDATA, policy: POLICY, quote: null, intent: { totalSupplyWhole: 42n } });
  return r.problems.some((p) => p.code === "SUPPLY_NOT_AS_CONFIGURED") ? true : "the signed bytes disagreed with the configuration and nothing noticed";
});

// ---- state machine + receipts -------------------------------------------------------------------------
control("VALIDATED -> BROADCAST is refused; the proof chain cannot be skipped", () => {
  const t = flow.canTransition("VALIDATED", "BROADCAST");
  return t.allowed === false ? true : "a launch could jump straight from validation to broadcast";
});
control("changing the bundle invalidates EXPORTED and everything after it", () => {
  // THIS CONTROL WAS WRONG BEFORE THE CODE WAS. It asserted a bundle change must rewind past
  // VALIDATED, and the state machine correctly rewinds to VALIDATED. VALIDATED is a fact about the
  // PROJECT SOURCE; EXPORTED is the fact about the bundle produced from it. Swapping the bundle
  // file voids the export and everything built on it, and leaves the source validation standing —
  // which is what "invalidate downstream receipts" actually means here. Asserting the stricter
  // thing would have forced a re-validation of art that nobody touched.
  const back = flow.rewindFor("SIMULATED", "BUNDLE");
  const i = flow.STATE_ORDER.indexOf(back);
  if (i >= flow.STATE_ORDER.indexOf("EXPORTED")) return `a bundle change left the run at ${back}, with EXPORTED still standing`;
  // and the states that depend on the bundle must all be listed as invalidated
  const invalid = flow.invalidatedBy("BUNDLE");
  for (const required of ["EXPORTED", "METADATA_PUBLISHED", "PREPARED", "SIMULATED", "BUILT"]) {
    if (!invalid.includes(required)) return `${required} depends on the bundle but is not invalidated by a bundle change`;
  }
  return true;
});
control("changing the policy invalidates BUILT", () => {
  const back = flow.rewindFor("BUILT", "POLICY");
  return flow.STATE_ORDER.indexOf(back) < flow.STATE_ORDER.indexOf("BUILT") ? true : `a policy change left the run at ${back}`;
});
control("an edited receipt breaks the hash chain", () => {
  const ws = mkdtempSync(join(tmpdir(), "relics-receipts-"));
  flow.writeReceipt(ws, { phase: "PREFLIGHT", body: { a: 1 } });
  flow.writeReceipt(ws, { phase: "METADATA", body: { b: 2 } });
  flow.writeReceipt(ws, { phase: "SIMULATE", body: { c: 3 } });
  if (!flow.verifyReceiptChain(ws).intact) { rmSync(ws, { recursive: true, force: true }); return "the chain was already broken before tampering"; }
  const f = join(ws, ".relics-agent", "receipts", "001-preflight.json");
  const r = JSON.parse(readFileSync(f, "utf8"));
  r.body = { a: 999 };
  writeFileSync(f, JSON.stringify(r, null, 2));
  const after = flow.verifyReceiptChain(ws);
  rmSync(ws, { recursive: true, force: true });
  return after.intact === false ? true : "a receipt was edited after the fact and the chain still verified";
});
await controlAsync("a crash after broadcast does NOT permit a resend", async () => {
  // The signer's nonce has moved past the one the intent reserved, and code exists at the predicted
  // token address. Either alone must be enough; here both say the launch landed.
  const intent = {
    version: 1, launchPlanHash: "0xaa", buildHash: "0xbb", dataHash: keccak256(CALLDATA), chainId: 1,
    factory: "0x25003C3EBC2036CfE9E4037d4e7E6F840a06522E", signer: "0x00000000000000000000000000000000000000A2",
    nonceAtIntent: 7,
    predicted: { projectToken: "0x00000000000000000000000000000000000000A3", projectCollection: "0x00000000000000000000000000000000000000A4", artHook: "0x00000000000000000000000000000000000000A5", poolId: `0x${"00".repeat(32)}` },
    totalLaunchesAtIntent: "0", writtenAt: new Date(0).toISOString(),
  };
  const landedClient = {
    getTransactionReceipt: async () => null, getTransaction: async () => null,
    getTransactionCount: async () => 8,                    // moved past 7
    getCode: async () => "0x6080604052",                   // predicted token holds code
    readContract: async () => 1n,
  };
  const d = await flow.decideResend(landedClient, intent, { factoryAbi });
  if (d.verdict !== "ALREADY_LAUNCHED") return `a landed launch scored ${d.verdict}, which would have sent a second one`;

  // And the other direction: an endpoint that cannot answer must NOT be read as "safe to send".
  const unreachable = {
    getTransactionReceipt: async () => { throw new Error("rpc down"); },
    getTransaction: async () => { throw new Error("rpc down"); },
    getTransactionCount: async () => { throw new Error("rpc down"); },
    getCode: async () => { throw new Error("rpc down"); },
    readContract: async () => { throw new Error("rpc down"); },
  };
  const u = await flow.decideResend(unreachable, intent, { factoryAbi });
  if (u.verdict !== "UNKNOWN_DO_NOT_SEND") return `an unreachable endpoint scored ${u.verdict}; guessing here costs a duplicate launch`;

  // ---- AND THE WINDOW THE GUARD ACTUALLY EXISTS FOR ---------------------------------------------
  //
  // Accepted into the mempool, hash lost before it reached disk. Every question above answers "no
  // launch" HONESTLY — the MINED nonce has not moved, the predicted token has no code, no hash was
  // recorded — and the launch is in flight. That combination scored SAFE_TO_SEND until 2026-09-03.
  // `npm run e2e:resume:pending` proves this against a real node with the miner stopped; this is the
  // same state as a fixture, so the always-run gate covers it too.
  const inFlight = {
    getTransactionReceipt: async () => null,
    getTransaction: async () => null,
    getTransactionCount: async ({ blockTag }) => (blockTag === "pending" ? 8 : 7),
    getCode: async () => "0x",
    readContract: async () => 0n,
    request: async () => { throw new Error("this endpoint does not enumerate the pending pool"); },
  };
  const w = await flow.decideResend(inFlight, intent, { factoryAbi });
  if (w.verdict === "SAFE_TO_SEND") return "a transaction sitting in the mempool scored SAFE_TO_SEND; this is the duplicate launch the guard is for";

  // And it is a reading of the PENDING nonce, not of anything else: with the pool quiet, the same
  // client says SAFE_TO_SEND. Without this the arm above is satisfied by refusing everything.
  const quiet = { ...inFlight, getTransactionCount: async () => 7 };
  const q = await flow.decideResend(quiet, intent, { factoryAbi });
  return q.verdict === "SAFE_TO_SEND" ? true : `with nothing in flight the verdict is ${q.verdict}; the pending-nonce arm would be a constant`;
});

control("an UNRESOLVED broadcast intent is never silently overwritten", () => {
  // A second `writeIntent` used to replace whatever was on disk — including a `txHash` that had
  // already been recorded — leaving a resume asking the chain about the wrong launch. A workspace
  // with an unanswered send in it is not a workspace another send may start from.
  const ws = mkdtempSync(join(tmpdir(), "relics-intent-"));
  try {
    const base = {
      launchPlanHash: `0x${"11".repeat(32)}`, buildHash: `0x${"22".repeat(32)}`, dataHash: keccak256(CALLDATA),
      chainId: 1, factory: "0x25003C3EBC2036CfE9E4037d4e7E6F840a06522E", signer: "0x00000000000000000000000000000000000000A2",
      nonceAtIntent: 7,
      predicted: { projectToken: "0x00000000000000000000000000000000000000A3", projectCollection: "0x00000000000000000000000000000000000000A4", artHook: "0x00000000000000000000000000000000000000A5", poolId: `0x${"00".repeat(32)}` },
      totalLaunchesAtIntent: null,
    };
    flow.writeIntent(ws, base);
    flow.recordIntentTxHash(ws, `0x${"ab".repeat(32)}`);

    let threw = null;
    try { flow.writeIntent(ws, { ...base, launchPlanHash: `0x${"33".repeat(32)}`, dataHash: `0x${"44".repeat(32)}` }); }
    catch (err) { threw = err; }
    if (!threw) return "a second launch overwrote an intent that had a recorded tx hash and nothing had confirmed it";
    if (flow.readIntent(ws).txHash !== `0x${"ab".repeat(32)}`) return "the recorded tx hash was lost";

    // And a RESOLVED intent may be superseded — otherwise the refusal is a wedge rather than a guard,
    // and a workspace could never launch twice even after the chain had answered.
    flow.resolveIntent(ws, "PROVEN_NOT_SENT", "the chain was asked and this launch never left");
    const next = flow.writeIntent(ws, { ...base, launchPlanHash: `0x${"33".repeat(32)}`, dataHash: `0x${"44".repeat(32)}` });
    if (next.launchPlanHash !== `0x${"33".repeat(32)}`) return "a resolved intent could not be superseded";
    if (flow.readIntent(ws).txHash !== undefined) return "the superseding intent inherited the previous one's tx hash";

    // The journal is written temp-then-rename, so no partial or leftover file may remain beside it.
    const dir = join(ws, ".relics-agent");
    const stray = readdirSync(dir).filter((f) => f.includes(".tmp-") || f.includes(".new-"));
    if (stray.length > 0) return `the journal left ${stray.join(", ")} behind; an atomic write cleans up after itself`;
    return true;
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});
control("an incomplete quote inventory refuses instead of falling back to the wrapped native", () => {
  const inv = {
    chainId: 4663, multiQuoteWired: true, complete: false,
    errors: ["quote registry enumeration failed: execution reverted"],
    candidates: [{ chainId: 4663, symbol: "WETH", address: "0x00000000000000000000000000000000000000A6", decimals: 18, admitted: "PROVEN", isWrappedNative: true, detail: "" }],
  };
  const chosen = sdk.selectQuote(inv, "AUTO");
  return chosen.quote === null ? true : `an unread registry still selected ${chosen.quote.symbol}`;
});

// ---- the collection identity, which is the SECOND unbounded input to the render ---------------------
//
// Every art runtime bounds its ART CONFIG against a portable eth_call gas budget. `collectionName`
// (emitted TWICE into every tokenURI document) and `collectionSymbol` are bounded by no contract at
// all, and cost ~1,034 and ~518 gas per byte: a long enough name pushes `tokenURI` past what an
// indexer will execute, PERMANENTLY, because the art binding is one-shot. A `.relics` bundle has
// always been bounded by the schema's own maxNameLength/maxSymbolLength. This is the DIRECT path —
// the one an autonomous agent takes — being held to the same number.
//
// BOTH DIRECTIONS ARE ASSERTED. A control that only proves 65 is refused is also satisfied by a
// builder that refuses everything, which would be a worse bug than the one being fixed.
const IDENTITY_INPUT = {
  name: "Control Fixture", symbol: "CTL", totalSupplyWhole: 1_000_000n, artworkBackingUnits: 10_000n,
  startingPreset: 1, creatorRecipient: POLICY.creatorRecipient,
  art: { mode: 0, artTemplateId: 1n, artConfig: "0xdeadbeef" },
  antiSnipeMode: 2, metadataUri: "ipfs://bafkreicwcpyuqhcj5mtofwruwnn32vectrxbetjvvfgimbikqevxhzrqni",
};
const IDENTITY_SALTS = { tokenSalt: `0x${"11".repeat(32)}`, hookSalt: `0x${"22".repeat(32)}` };
function buildsWithIdentity(patch) {
  try {
    sdk.buildLaunchParams({ ...IDENTITY_INPUT, ...patch }, IDENTITY_SALTS);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
control("a collection name over the schema's bound is refused before params exist", () => {
  const atBound = buildsWithIdentity({ name: "A".repeat(64) });
  if (atBound !== null) return `a name AT the bound was refused, so the check is a blanket refusal: ${atBound}`;
  const over = buildsWithIdentity({ name: "A".repeat(65) });
  return over !== null && over.includes("64-character bound")
    ? true
    : "a 65-character name built launch params; it would have reached tokenURI, twice, forever";
});
control("a collection symbol over the schema's bound is refused before params exist", () => {
  const atBound = buildsWithIdentity({ symbol: "A".repeat(11) });
  if (atBound !== null) return `a symbol AT the bound was refused, so the check is a blanket refusal: ${atBound}`;
  const over = buildsWithIdentity({ symbol: "A".repeat(12) });
  return over !== null && over.includes("11-character bound")
    ? true
    : "a 12-character symbol built launch params";
});

// ---- report ------------------------------------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
if (results.length < 20) {
  console.error(`\n  INPUT FLOOR: only ${results.length} controls ran; this gate is specified to run at least 20`);
}
console.log(`\nAUTONOMOUS_AGENT_NEGATIVE_CONTROLS=${passed}/${results.length}${passed === results.length && results.length >= 20 ? "_PASS" : "_FAIL"}`);
process.exit(passed === results.length && results.length >= 20 ? 0 : 1);
