#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE CRASH-RESUME PROOF — no double launch.
//
// THE FAILURE THIS EXISTS FOR, stated exactly. The endpoint accepts the transaction and the process
// dies before the hash reaches disk. On restart the local files say a build was SIGNED, an intent
// was written, and nothing says BROADCAST. A naive resume signs and sends again — and a second
// launch is not an error message. It is a second real project, a second pool, a second ProjectRights
// NFT, and a creator's money spent twice on a thing that cannot be undone.
//
// SO THE CRASH IS REAL. This script spawns `e2e-autonomous-launch.mjs --crash-after-send`, which
// SIGKILLs ITSELF in the window between `eth_sendRawTransaction` returning and
// `recordIntentTxHash` writing. Not a mocked failure, not an injected exception, not a flag that
// makes a function pretend: the process is destroyed, so no `finally`, no flush and no handler can
// tidy up after it. What is left on disk is exactly what a real crash leaves.
//
// AND THE ANSWER COMES FROM THE CHAIN. `decideResend` asks four independent questions and refuses a
// resend on any positive evidence, refuses on any UNANSWERABLE question, and permits one only when
// every question was answered and all say no. This script asserts the verdict, and then asserts the
// thing the verdict is FOR: that nothing was sent. The signer's nonce and the factory's launch
// counter are read before and after, and a `Launched` log scan proves there is exactly one.
//
// THE NEGATIVE CONTROL IS NOT OPTIONAL. A `decideResend` that returned ALREADY_LAUNCHED
// unconditionally would pass the assertion above and be worthless, so this also builds an intent
// for a launch that never happened and requires SAFE_TO_SEND. One test proves the guard refuses;
// the pair proves it is reading something.
// ================================================================================================

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getAddress, parseEventLogs } from "viem";
import { FACTORY_ABI } from "@relics/launch-sdk";
import { decideResend, listReceipts, readIntent, verifyReceiptChain } from "@relics/agent-flow";

import {
  ALL_HOOK_MASK,
  HarnessSkip,
  REPO_ROOT,
  RC6_HOOK_FLAGS,
  anvilAvailable,
  assertLocalAnvil,
  forkRpcUrl,
  printSummary,
  startAnvilFork,
} from "./e2e-autonomous-launch.mjs";

const LAUNCH_SCRIPT = join(REPO_ROOT, "scripts", "e2e-autonomous-launch.mjs");

/** A never-launched address, used only to give the negative control something absent to look for. */
const NEVER_LAUNCHED = getAddress("0x00000000000000000000000000000000DeaDBeef");
/** anvil default account #9 — TEST ONLY, public knowledge, never fund. Used for its untouched nonce. */
const UNUSED_ANVIL_ACCOUNT = getAddress("0xa0Ee7A142d267C1f36714E4a8F75612F20a79720");

class ProofFailure extends Error {}

const log = (m) => process.stderr.write(`${m}\n`);
const phase = (n) => log(`\n── ${n} ${"─".repeat(Math.max(0, 66 - n.length))}`);

/**
 * Run the launch harness in a child process and wait for it to die.
 *
 * The child's death is the observation: a normal exit here would mean the crash flag did nothing.
 */
function runToCrash({ workspace, nodeUrl }) {
  return new Promise((resolveP) => {
    const child = spawn(
      process.execPath,
      [LAUNCH_SCRIPT, "--workspace", workspace, "--reuse-node", nodeUrl, "--crash-after-send"],
      { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
    );
    let stderr = "";
    child.stdout.on("data", (d) => {
      stderr += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (code, signal) => resolveP({ code, signal, output: stderr }));
  });
}

async function main() {
  const summary = {
    BROADCAST_CRASH_DUPLICATE_TX: "UNKNOWN",
    CRASH_WAS_REAL: "NO",
    CRASH_INTENT_WITHOUT_TX_HASH: "NO",
    RESUME_VERDICT: "UNKNOWN",
    RESUME_TRANSACTIONS_SENT: "UNKNOWN",
    RESUME_LAUNCHED_EVENTS: "UNKNOWN",
    RESUME_RECOVERED_TX: "",
    RESUME_CONTROL_UNLAUNCHED: "UNKNOWN",
    RESUME_RECEIPT_CHAIN_INTACT: "NO",
  };
  const workspace = join(tmpdir(), `relics-e2e-crash-${process.pid}`);
  let anvil = null;

  try {
    phase("PRECHECK");
    if (!anvilAvailable()) throw new HarnessSkip("`anvil` is not on PATH. Install Foundry (https://getfoundry.sh) to run this proof.");
    const fork = forkRpcUrl();
    if (!fork) throw new HarnessSkip("no upstream RPC to fork from. Set E2E_FORK_RPC_URL (or ETHEREUM_RPC_URL / MAINNET_RPC_URL).");
    log(`forking Ethereum through ${fork.envKey} (value never printed)`);

    mkdirSync(workspace, { recursive: true });
    anvil = await startAnvilFork({ forkUrl: fork.url, port: Number(process.env.E2E_PORT ?? 8546), log });
    const client = anvil.client;
    await assertLocalAnvil(anvil.url, client);

    // ---- 1. run to the crash -------------------------------------------------------------------
    phase("RUN TO CRASH");
    const crashed = await runToCrash({ workspace, nodeUrl: anvil.url });
    if (crashed.signal !== "SIGKILL") {
      throw new ProofFailure(
        `the child exited with code ${crashed.code} / signal ${crashed.signal} instead of being killed after the send. ` +
          `The crash window was never entered, so nothing below would be evidence.\n${crashed.output.slice(-3000)}`,
      );
    }
    summary.CRASH_WAS_REAL = "YES";
    log("  the child was SIGKILLed between eth_sendRawTransaction returning and the hash being recorded");

    // ---- 2. what a real crash left on disk ------------------------------------------------------
    phase("WHAT THE CRASH LEFT");
    const intent = readIntent(workspace);
    if (!intent) throw new ProofFailure("no broadcast intent on disk. Intent must be written BEFORE the bytes leave; without it a resume has nothing to ask the chain about.");
    if (intent.txHash !== undefined) {
      throw new ProofFailure(`the intent already carries txHash ${intent.txHash}. The crash landed outside the window this proof is about.`);
    }
    summary.CRASH_INTENT_WITHOUT_TX_HASH = "YES";
    const phases = listReceipts(workspace).map((r) => r.phase);
    if (phases.includes("BROADCAST")) throw new ProofFailure("a BROADCAST receipt exists; the process survived past the crash point");
    log(`  intent: launchPlanHash ${intent.launchPlanHash}, nonceAtIntent ${intent.nonceAtIntent}, NO txHash`);
    log(`  receipts on disk: ${phases.join(" -> ")}`);
    log("  a naive resume looking only at these files would sign and send again.");

    // ---- 3. the chain's answer -------------------------------------------------------------------
    phase("RESUME");
    const nonceBefore = await client.getTransactionCount({ address: getAddress(intent.signer) });
    const launchesBefore = await client.readContract({ address: getAddress(intent.factory), abi: FACTORY_ABI(), functionName: "totalLaunches" });

    const decision = await decideResend(client, intent, { factoryAbi: FACTORY_ABI() });
    summary.RESUME_VERDICT = decision.verdict;
    for (const e of decision.evidence) log(`  ${e.landed === null ? "?" : e.landed ? "YES" : "no "} ${e.question} — ${e.answer}`);
    log(`  verdict: ${decision.verdict} — ${decision.detail}`);
    if (decision.verdict !== "ALREADY_LAUNCHED") {
      throw new ProofFailure(
        `decideResend says ${decision.verdict}. The transaction WAS accepted before the crash, so a resend would create a second project. ` +
          `This is the exact duplicate the guard exists to prevent.`,
      );
    }

    // ---- 4. and nothing was sent -----------------------------------------------------------------
    // THE VERDICT IS NOT THE PROOF. A function returning the right string while something else sent
    // a transaction would satisfy step 3 and fail the thing that matters, so the chain is asked
    // directly: did the signer's nonce move, and did the factory launch twice?
    const nonceAfter = await client.getTransactionCount({ address: getAddress(intent.signer) });
    const launchesAfter = await client.readContract({ address: getAddress(intent.factory), abi: FACTORY_ABI(), functionName: "totalLaunches" });
    summary.RESUME_TRANSACTIONS_SENT = String(nonceAfter - nonceBefore);
    if (nonceAfter !== nonceBefore) throw new ProofFailure(`the signer's nonce moved from ${nonceBefore} to ${nonceAfter} during the resume — something sent a transaction`);
    if (launchesAfter !== launchesBefore) throw new ProofFailure(`totalLaunches moved from ${launchesBefore} to ${launchesAfter} during the resume`);

    // FROM THE FORK BLOCK, not from 0. Everything before the fork point is upstream history this
    // run did not create, and asking a fork for it is both slow and beside the point: the question
    // is how many launches THIS node has seen.
    const nodeInfo = await client.request({ method: "anvil_nodeInfo" });
    const forkBlock = BigInt(nodeInfo?.forkConfig?.forkBlockNumber ?? 0);
    if (forkBlock === 0n) throw new ProofFailure("anvil_nodeInfo reports no fork block, so the local launch cannot be separated from upstream history");
    const logs = await client.getLogs({ address: getAddress(intent.factory), fromBlock: forkBlock + 1n, toBlock: "latest" });
    const launched = parseEventLogs({ abi: FACTORY_ABI(), logs }).filter(
      (e) => e.eventName === "Launched" && getAddress(e.args.projectToken) === getAddress(intent.predicted.projectToken),
    );
    summary.RESUME_LAUNCHED_EVENTS = String(launched.length);
    if (launched.length !== 1) throw new ProofFailure(`the chain carries ${launched.length} Launched events for ${intent.predicted.projectToken}; exactly one is the whole point`);
    summary.RESUME_RECOVERED_TX = launched[0].transactionHash;
    log(`  exactly one Launched event for ${intent.predicted.projectToken}, in ${launched[0].transactionHash}`);
    log("  the hash the crash lost is RECOVERABLE FROM THE CHAIN, which is why a resend is never the repair");

    // The hook the one launch produced still carries the RC6 mask — a cheap confirmation that the
    // recovered launch is the one the intent predicted rather than some other project's.
    if ((BigInt(intent.predicted.artHook) & ALL_HOOK_MASK) !== RC6_HOOK_FLAGS) {
      throw new ProofFailure("the intent's predicted hook does not carry the RC6 mask; this intent does not describe an RC6 launch");
    }

    // ---- 5. the negative control -----------------------------------------------------------------
    phase("NEGATIVE CONTROL");
    const controlIntent = {
      ...intent,
      signer: UNUSED_ANVIL_ACCOUNT,
      nonceAtIntent: await client.getTransactionCount({ address: UNUSED_ANVIL_ACCOUNT }),
      totalLaunchesAtIntent: launchesAfter.toString(),
      predicted: { ...intent.predicted, projectToken: NEVER_LAUNCHED },
    };
    delete controlIntent.txHash;
    const control = await decideResend(client, controlIntent, { factoryAbi: FACTORY_ABI() });
    summary.RESUME_CONTROL_UNLAUNCHED = control.verdict;
    log(`  an intent for a launch that never happened: ${control.verdict}`);
    if (control.verdict !== "SAFE_TO_SEND") {
      throw new ProofFailure(
        `the control says ${control.verdict}. If an unlaunched intent is also refused, ALREADY_LAUNCHED above proves nothing — ` +
          `the guard would be a constant rather than a reading.`,
      );
    }

    const integrity = verifyReceiptChain(workspace);
    summary.RESUME_RECEIPT_CHAIN_INTACT = integrity.intact ? "YES" : "NO";
    log(`  receipts: ${integrity.detail}`);

    summary.BROADCAST_CRASH_DUPLICATE_TX = "NO";
    return { summary, exitCode: integrity.intact ? 0 : 1 };
  } catch (err) {
    if (err instanceof HarnessSkip) {
      summary.BROADCAST_CRASH_DUPLICATE_TX = "SKIPPED";
      log("");
      log("################################################################################");
      log("#  SKIPPED — THIS RUN PROVED NOTHING. IT IS NOT A PASS.                        #");
      log(`#  ${err.message}`);
      log("################################################################################");
      return { summary, exitCode: 0 };
    }
    summary.BROADCAST_CRASH_DUPLICATE_TX = "UNPROVEN";
    log("");
    log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.RELICS_DEBUG && err instanceof Error && err.stack) log(err.stack);
    return { summary, exitCode: 1 };
  } finally {
    if (anvil) anvil.child.kill("SIGKILL");
    if (existsSync(workspace) && !process.env.E2E_KEEP_WORKSPACE) rmSync(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await main();
  printSummary(result.summary);
  process.exit(result.exitCode);
}
