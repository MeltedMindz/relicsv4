#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE CRASH WINDOW, HELD OPEN — the state `decideResend` exists for, actually observed.
//
// THE DEFECT THIS PROVES CLOSED, stated exactly. A launch is accepted into the mempool and the
// process dies before the hash reaches disk. On restart the guard asks the chain four questions and
// every one of them answers "no launch", HONESTLY: there is no recorded hash to look up (that is
// the premise), the MINED nonce still sits at the one the intent reserved, the predicted project
// token holds no code, and the factory's counter has not moved. Verdict: SAFE_TO_SEND. The resend
// is the duplicate launch the guard was written to prevent.
//
// AND THE EXISTING PROOF COULD NOT SEE IT. `e2e-crash-resume.mjs` runs against an automining anvil,
// so by the time the child is killed the transaction is already MINED — the nonce has moved, the
// token has code, and the guard answers ALREADY_LAUNCHED for reasons that do not exist in the
// window it claims to cover. A harness that cannot enter a state cannot test it.
//
// SO THIS ONE STOPS THE MINER. `anvil --no-mining`, a real transaction, really signed, really
// accepted, and really sitting in the pool while the resume decision is taken. Nothing is mocked:
// the client is viem against a real node, and the window is asserted BEFORE the verdict is read —
// if the transaction turns out to be mined, this run proves nothing and says so instead of passing.
//
// THE GUARD IS ALSO SHOWN TO FAIL. `--controls` deletes the pending-nonce question from the shipped
// source, recompiles, and requires THIS proof to go red. Without that, "it answered correctly" is
// compatible with a guard that answers ALREADY_LAUNCHED unconditionally, which is why the negative
// controls below (an intent for a launch that never happened) run on the same node in the same run.
//
// NO PUBLISHED KEY IS USED. The sending account is generated per run and funded with
// `anvil_setBalance`. This repository already carries the anvil default key in one test helper, and
// adding a second location for the sake of a local harness would be a worse trade than four extra
// lines of setup.
// ================================================================================================
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, getAddress, http, keccak256, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUARD_SRC = join(ROOT, "packages/agent-flow/src/broadcastGuard.ts");
const PORT = Number(process.env.RESUME_WINDOW_PORT ?? 8547);

class ProofFailure extends Error {}
class HarnessSkip extends Error {}

const log = (m) => process.stderr.write(`${m}\n`);

function anvilAvailable() {
  return spawnSync("anvil", ["--version"], { encoding: "utf8" }).status === 0;
}

async function startIdleAnvil() {
  // `--no-mining` is the whole harness. With it, a transaction the node ACCEPTS stays accepted and
  // unmined for as long as we want to look at it, which is the state a crash leaves behind.
  const child = spawn("anvil", ["--port", String(PORT), "--silent", "--no-mining"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${PORT}`;
  const client = createPublicClient({ chain: foundry, transport: http(url) });
  for (let i = 0; i < 100; i++) {
    try {
      await client.getBlockNumber();
      return { child, url, client };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill("SIGKILL");
  throw new HarnessSkip("anvil did not come up on " + url);
}

/**
 * A client that answers the PENDING nonce question with the MINED one.
 *
 * This is the guard as it shipped: `getTransactionCount` was called with no block tag, viem
 * defaults to `latest`, and nothing ever asked the pool. Reproducing it by BLINDING THE CLIENT
 * rather than by editing the guard isolates exactly one variable — whether the pending nonce is
 * consulted — with every other question answered identically by the same node.
 */
/**
 * A client that serves the PENDING NONCE but no pending block.
 *
 * This is the ordinary case on most real endpoints: the nonce moves, and the pool is not
 * enumerable. There is then nothing that can show the in-flight transaction IS this launch — and
 * nothing that can show it is not. The only honest answer is UNKNOWN, and the guard must refuse on
 * it. Answering "no" here is the same defect as never asking, one step further in.
 */
function blindToPendingBlock(client) {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "request") {
        return async (args) => {
          if (args?.method === "eth_getBlockByNumber" && args?.params?.[0] === "pending") {
            throw new Error("this endpoint does not enumerate the pending pool");
          }
          return target.request(args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function blindToPending(client) {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "getTransactionCount") {
        return (args) => target.getTransactionCount({ ...args, blockTag: "latest" });
      }
      if (prop === "request") {
        return async (args) => {
          if (args?.method === "eth_getBlockByNumber" && args?.params?.[0] === "pending") {
            throw new Error("this client does not serve a pending block");
          }
          return target.request(args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function proof() {
  const summary = {
    RESUME_PENDING_WINDOW: "UNKNOWN",
    PENDING_WINDOW_OBSERVED: "NO",
    WINDOW_MINED_NONCE_MOVED: "UNKNOWN",
    WINDOW_PENDING_NONCE_MOVED: "UNKNOWN",
    WINDOW_RECEIPT_EXISTS: "UNKNOWN",
    WINDOW_PREDICTED_TOKEN_HAS_CODE: "UNKNOWN",
    RESUME_VERDICT_IN_WINDOW: "UNKNOWN",
    RESUME_VERDICT_WITHOUT_PENDING_QUESTION: "UNKNOWN",
    RESUME_VERDICT_WITH_UNIDENTIFIABLE_POOL: "UNKNOWN",
    RESUME_CONTROL_UNLAUNCHED: "UNKNOWN",
    RESUME_VERDICT_AFTER_MINING: "UNKNOWN",
    RESUME_TRANSACTIONS_SENT_BY_THE_DECISION: "UNKNOWN",
  };
  if (!anvilAvailable()) throw new HarnessSkip("`anvil` is not on PATH. Install Foundry (https://getfoundry.sh) to run this proof.");

  const { decideResend } = await import("@relics/agent-flow");
  const node = await startIdleAnvil();
  try {
    const { client, url } = node;
    const account = privateKeyToAccount(generatePrivateKey());
    const wallet = createWalletClient({ account, chain: foundry, transport: http(url) });
    await client.request({ method: "anvil_setBalance", params: [account.address, "0xde0b6b3a7640000"] });

    // ---- 1. the intent, written BEFORE the bytes leave --------------------------------------------
    const data = `0x${"5f".repeat(200)}`;
    const nonceAtIntent = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
    const predictedToken = getAddress(`0x${"a1".repeat(20)}`);
    const intent = {
      version: 1,
      launchPlanHash: keccak256("0x01"),
      buildHash: keccak256("0x02"),
      dataHash: keccak256(data),
      chainId: foundry.id,
      factory: getAddress(`0x${"f0".repeat(20)}`),
      signer: account.address,
      nonceAtIntent,
      predicted: { projectToken: predictedToken, projectCollection: predictedToken, artHook: predictedToken, poolId: `0x${"00".repeat(32)}` },
      // `null` on purpose: the factory here is not a contract, and the corroborating question must
      // not be the reason anything below refuses. Every verdict is carried by a STRONG question.
      totalLaunchesAtIntent: null,
      writtenAt: new Date().toISOString(),
      // NO txHash. That absence IS the crash: the send returned and the process died first.
    };

    // ---- 2. the send, accepted and left in the pool -----------------------------------------------
    const txHash = await wallet.sendTransaction({ to: predictedToken, value: 0n, data, gas: 100_000n });
    log(`  the node ACCEPTED ${txHash} and is not mining it`);

    // ---- 3. IS THIS ACTUALLY THE WINDOW? Asserted before any verdict is read ----------------------
    const minedNonce = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
    const pendingNonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
    const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
    const code = await client.getCode({ address: predictedToken }).catch(() => null);
    summary.WINDOW_MINED_NONCE_MOVED = minedNonce > nonceAtIntent ? "YES" : "NO";
    summary.WINDOW_PENDING_NONCE_MOVED = pendingNonce > nonceAtIntent ? "YES" : "NO";
    summary.WINDOW_RECEIPT_EXISTS = receipt ? "YES" : "NO";
    summary.WINDOW_PREDICTED_TOKEN_HAS_CODE = code && code !== "0x" ? "YES" : "NO";
    if (summary.WINDOW_MINED_NONCE_MOVED !== "NO" || summary.WINDOW_PENDING_NONCE_MOVED !== "YES" || summary.WINDOW_RECEIPT_EXISTS !== "NO" || summary.WINDOW_PREDICTED_TOKEN_HAS_CODE !== "NO") {
      throw new ProofFailure(
        `this is not the crash window: mined-nonce-moved=${summary.WINDOW_MINED_NONCE_MOVED} pending-nonce-moved=${summary.WINDOW_PENDING_NONCE_MOVED} ` +
          `receipt=${summary.WINDOW_RECEIPT_EXISTS} predicted-code=${summary.WINDOW_PREDICTED_TOKEN_HAS_CODE}. ` +
          `Every question except the pending nonce must answer "no launch", or this run is measuring some other state.`,
      );
    }
    summary.PENDING_WINDOW_OBSERVED = "YES";
    log(`  window held: mined nonce ${minedNonce} (unmoved), pending nonce ${pendingNonce}, no receipt, no code at the predicted token`);

    // ---- 4. the verdict, in the window -------------------------------------------------------------
    const inWindow = await decideResend(client, intent, { factoryAbi: [] });
    summary.RESUME_VERDICT_IN_WINDOW = inWindow.verdict;
    for (const e of inWindow.evidence) log(`    ${e.landed === null ? "?" : e.landed ? "YES" : "no "} [${e.strength}] ${e.question} — ${e.answer}`);
    if (inWindow.verdict === "SAFE_TO_SEND") {
      throw new ProofFailure("decideResend says SAFE_TO_SEND while the launch is sitting in the mempool. This is the duplicate launch, exactly.");
    }

    // ---- 5. THE SAME READING WITH THE PENDING QUESTION BLINDED -------------------------------------
    // Not a second opinion: the guard as it shipped. If this does NOT say SAFE_TO_SEND, then step 4
    // was carried by something other than the pending nonce and this proof is about the wrong thing.
    const blind = await decideResend(blindToPending(client), intent, { factoryAbi: [] });
    summary.RESUME_VERDICT_WITHOUT_PENDING_QUESTION = blind.verdict;
    if (blind.verdict !== "SAFE_TO_SEND") {
      throw new ProofFailure(
        `with the pending nonce hidden the verdict is ${blind.verdict}, not SAFE_TO_SEND. Something other than the pending question is ` +
          `carrying step 4, so this run does not evidence the fix it claims.`,
      );
    }
    log(`  with the pending question blinded, the SAME node and the SAME intent answer ${blind.verdict} — that was the shipped behaviour`);

    // ---- 5b. AND WHEN THE POOL CANNOT BE ENUMERATED, THE ANSWER IS UNKNOWN ------------------------
    // Most endpoints do not serve a pending block. The pending nonce still moved, so the guard knows
    // something of this signer's is in flight and cannot show what — which must refuse, not permit.
    const unidentifiable = await decideResend(blindToPendingBlock(client), intent, { factoryAbi: [] });
    summary.RESUME_VERDICT_WITH_UNIDENTIFIABLE_POOL = unidentifiable.verdict;
    if (unidentifiable.verdict === "SAFE_TO_SEND") {
      throw new ProofFailure(
        "with the pending nonce moved and the pool unreadable, the verdict is SAFE_TO_SEND. An unanswered question is not an answer of 'no'.",
      );
    }
    log(`  pending nonce moved, pool not enumerable: ${unidentifiable.verdict}`);

    // ---- 6. and the guard is a reading, not a constant ----------------------------------------------
    const neverSent = privateKeyToAccount(generatePrivateKey()).address;
    const controlIntent = {
      ...intent,
      signer: neverSent,
      nonceAtIntent: await client.getTransactionCount({ address: neverSent, blockTag: "latest" }),
      predicted: { ...intent.predicted, projectToken: getAddress(`0x${"b2".repeat(20)}`) },
    };
    const control = await decideResend(client, controlIntent, { factoryAbi: [] });
    summary.RESUME_CONTROL_UNLAUNCHED = control.verdict;
    if (control.verdict !== "SAFE_TO_SEND") {
      throw new ProofFailure(`an intent for a launch that never happened scored ${control.verdict}; the guard would be a constant rather than a reading`);
    }

    // ---- 7. once it is mined, the ordinary path still answers ---------------------------------------
    const nonceBeforeDecision = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
    await client.request({ method: "anvil_mine", params: ["0x1"] });
    const mined = await decideResend(client, intent, { factoryAbi: [] });
    summary.RESUME_VERDICT_AFTER_MINING = mined.verdict;
    if (mined.verdict !== "ALREADY_LAUNCHED") throw new ProofFailure(`after mining, the verdict is ${mined.verdict}`);

    // Nothing this proof did sent a transaction of its own. `decideResend` is a reader.
    const nonceAfter = await client.getTransactionCount({ address: account.address, blockTag: "latest" });
    summary.RESUME_TRANSACTIONS_SENT_BY_THE_DECISION = String(nonceAfter - nonceBeforeDecision - 1);
    if (nonceAfter - nonceBeforeDecision !== 1) throw new ProofFailure(`the signer's nonce moved by ${nonceAfter - nonceBeforeDecision}; only the one pending transaction should have been mined`);

    summary.RESUME_PENDING_WINDOW = "PASS";
    return { summary, exitCode: 0 };
  } finally {
    node.child.kill("SIGKILL");
  }
}

/**
 * `--controls`: break the guard in the SHIPPED SOURCE and require this proof to go red.
 *
 * A gate that has only ever been seen green is not evidence. The mutation deletes the pending-nonce
 * question — the exact code this file was written for — recompiles the package, and runs the proof
 * in a child process, which must FAIL.
 */
async function controls() {
  const backupDir = mkdtempSync(join(tmpdir(), "relics-resume-mutate-"));
  const backup = join(backupDir, "broadcastGuard.ts");
  copyFileSync(GUARD_SRC, backup);
  const restore = () => {
    copyFileSync(backup, GUARD_SRC);
    spawnSync("npx", ["tsc", "-p", "packages/agent-flow/tsconfig.json"], { cwd: ROOT, encoding: "utf8" });
  };
  process.on("exit", () => rmSync(backupDir, { recursive: true, force: true }));

  const MUTATIONS = [
    {
      id: "the pending nonce is asked for at all",
      from: `    const pending = await client.getTransactionCount({ address: intent.signer, blockTag: "pending" });`,
      to: `    const pending = await client.getTransactionCount({ address: intent.signer, blockTag: "latest" });`,
    },
    {
      id: "an unaccounted-for in-flight nonce is UNKNOWN, not 'no'",
      from: `          landed: null,\n          strength: "STRONG",`,
      to: `          landed: false,\n          strength: "STRONG",`,
    },
  ];

  let survived = 0;
  try {
    for (const m of MUTATIONS) {
      const original = readFileSync(GUARD_SRC, "utf8");
      if (!original.includes(m.from)) {
        throw new Error(`MUTATION "${m.id}" HAS A STALE ANCHOR: its \`from\` text is not in ${GUARD_SRC}. It changes nothing, so it can neither pass nor fail honestly.`);
      }
      writeFileSync(GUARD_SRC, original.replaceAll(m.from, m.to));
      const build = spawnSync("npx", ["tsc", "-p", "packages/agent-flow/tsconfig.json"], { cwd: ROOT, encoding: "utf8" });
      if (build.status !== 0) throw new Error(`MUTATION "${m.id}" did not compile: ${build.stdout}${build.stderr}`);
      const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RESUME_WINDOW_PORT: String(PORT + 1) } });
      copyFileSync(backup, GUARD_SRC);
      if (run.status === 0) {
        survived++;
        console.log(`  SURVIVED  ${m.id} — the proof stayed green with the guard broken`);
      } else {
        const why = `${run.stdout}${run.stderr}`.split("\n").filter((l) => /FAILED|SAFE_TO_SEND|not the crash window/.test(l)).slice(0, 2).join(" | ");
        console.log(`  CAUGHT    ${m.id} -> ${why.slice(0, 180)}`);
      }
    }
  } finally {
    restore();
  }
  console.log(`\nRESUME_PENDING_WINDOW_MUTATIONS=${MUTATIONS.length} SURVIVED=${survived}`);
  return survived === 0 ? 0 : 1;
}

function printSummary(summary) {
  console.log("");
  for (const [k, v] of Object.entries(summary)) console.log(`${k}=${v}`);
}

if (process.argv.includes("--controls")) {
  process.exit(await controls());
}

try {
  const { summary, exitCode } = await proof();
  printSummary(summary);
  process.exit(exitCode);
} catch (err) {
  if (err instanceof HarnessSkip) {
    log("");
    log("################################################################################");
    log("#  SKIPPED — THIS RUN PROVED NOTHING. IT IS NOT A PASS.                        #");
    log(`#  ${err.message}`);
    log("################################################################################");
    console.log("RESUME_PENDING_WINDOW=SKIPPED");
    process.exit(0);
  }
  log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  console.log("RESUME_PENDING_WINDOW=UNPROVEN");
  process.exit(1);
}
