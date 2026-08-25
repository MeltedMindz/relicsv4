// SPDX-License-Identifier: MIT
// ================================================================================================
// NO DOUBLE LAUNCH.
//
// THE FAILURE THIS EXISTS FOR: the endpoint accepts the transaction, and the process dies before
// the tx hash reaches disk. On restart the local receipts say SIGNED and nothing says BROADCAST, so
// a naive resume signs and sends again — and a second launch is not an error message, it is a
// second real project, a second pool, and a creator's money spent twice.
//
// THE ORDER IS: WRITE INTENT, THEN SEND. Intent is written BEFORE the bytes leave, so a crash at
// the worst possible moment still leaves a durable record that a send was ATTEMPTED. Intent is not
// proof it landed — that is the point. It is proof we must go and ASK the chain before doing
// anything else.
//
// AND THE CHAIN IS WHAT ANSWERS, NEVER THE LOCAL FILE. Four independent questions, any one of which
// establishing a landed launch is enough to refuse a resend:
//
//   1. the recorded tx hash, if we got one, has a receipt;
//   2. the signer's nonce has moved past the one the intent reserved;
//   3. the predicted project token address holds code;
//   4. the factory's launch count has moved.
//
// Only when EVERY question is answered and every answer says "no launch" may a resend proceed. An
// UNANSWERABLE question is not a "no" — an unreachable endpoint blocks the resend rather than
// permitting it, because the cost of waiting is a delay and the cost of guessing is a duplicate.
// ================================================================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { AGENT_DIR } from "./receipts.js";

export interface BroadcastIntent {
  readonly version: 1;
  readonly launchPlanHash: string;
  readonly buildHash: string;
  readonly dataHash: string;
  readonly chainId: number;
  readonly factory: Address;
  readonly signer: Address;
  /** The nonce the signer was at when intent was written. A move past it means bytes left. */
  readonly nonceAtIntent: number;
  readonly predicted: { projectToken: Address; projectCollection: Address; artHook: Address; poolId: Hex };
  readonly totalLaunchesAtIntent: string | null;
  readonly writtenAt: string;
  /** Filled in AFTER a send returns. Absent means "we do not know whether it landed". */
  txHash?: Hex;
}

function intentPath(workspace: string): string {
  return join(workspace, AGENT_DIR, "broadcast-intent.json");
}

export function readIntent(workspace: string): BroadcastIntent | null {
  const p = intentPath(workspace);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as BroadcastIntent;
}

/** Write intent. MUST be called and flushed before any transaction leaves the process. */
export function writeIntent(workspace: string, intent: Omit<BroadcastIntent, "version" | "writtenAt">): BroadcastIntent {
  mkdirSync(join(workspace, AGENT_DIR), { recursive: true });
  const full: BroadcastIntent = { version: 1, writtenAt: new Date().toISOString(), ...intent };
  writeFileSync(intentPath(workspace), `${JSON.stringify(full, null, 2)}\n`);
  return full;
}

export function recordIntentTxHash(workspace: string, txHash: Hex): void {
  const intent = readIntent(workspace);
  if (!intent) throw new Error("recordIntentTxHash: no broadcast intent on disk");
  writeFileSync(intentPath(workspace), `${JSON.stringify({ ...intent, txHash }, null, 2)}\n`);
}

export type ResendVerdict = "ALREADY_LAUNCHED" | "SAFE_TO_SEND" | "UNKNOWN_DO_NOT_SEND";

export interface ResendDecision {
  readonly verdict: ResendVerdict;
  readonly evidence: readonly { question: string; answer: string; landed: boolean | null }[];
  readonly txHash: Hex | null;
  readonly detail: string;
}

/**
 * Ask the chain whether the launch this intent describes already happened.
 *
 * Returns ALREADY_LAUNCHED on any positive evidence, UNKNOWN_DO_NOT_SEND if any question could not
 * be answered, and SAFE_TO_SEND only when every question was answered and all say no.
 */
export async function decideResend(client: PublicClient, intent: BroadcastIntent, opts: { factoryAbi: any }): Promise<ResendDecision> {
  const evidence: { question: string; answer: string; landed: boolean | null }[] = [];

  // ---- 1. the recorded hash ---------------------------------------------------------------------
  let txHash: Hex | null = intent.txHash ?? null;
  if (txHash) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
      if (receipt) {
        evidence.push({ question: "recorded tx hash has a receipt", answer: `yes, status ${receipt.status} in block ${receipt.blockNumber}`, landed: true });
        return { verdict: "ALREADY_LAUNCHED", evidence, txHash, detail: `the recorded transaction ${txHash} is mined. Resending would launch a second project.` };
      }
      const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
      if (tx) {
        evidence.push({ question: "recorded tx hash is known to the network", answer: "yes, in the mempool", landed: true });
        return { verdict: "ALREADY_LAUNCHED", evidence, txHash, detail: `the recorded transaction ${txHash} is pending. Wait for it; do not send another.` };
      }
      evidence.push({ question: "recorded tx hash is known to the network", answer: "no", landed: false });
    } catch (err) {
      evidence.push({ question: "recorded tx hash is known to the network", answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null });
    }
  } else {
    evidence.push({ question: "a tx hash was recorded", answer: "no — intent was written but no hash came back", landed: false });
  }

  // ---- 2. has the signer's nonce moved? ----------------------------------------------------------
  try {
    const nonce = await client.getTransactionCount({ address: intent.signer });
    const moved = nonce > intent.nonceAtIntent;
    evidence.push({ question: "signer nonce moved past the one reserved at intent", answer: `nonce ${nonce} vs ${intent.nonceAtIntent} at intent`, landed: moved });
  } catch (err) {
    evidence.push({ question: "signer nonce moved past the one reserved at intent", answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null });
  }

  // ---- 3. does the predicted token address hold code? --------------------------------------------
  // THE STRONGEST SINGLE SIGNAL. The predicted addresses are deterministic in the launcher and the
  // params, so code at the predicted token address means THIS launch, from THIS signer, with THESE
  // params, already executed. It cannot be another project's.
  try {
    const code = await client.getCode({ address: getAddress(intent.predicted.projectToken) });
    const hasCode = Boolean(code && code !== "0x");
    evidence.push({ question: "predicted project token holds code", answer: hasCode ? `yes, ${(code!.length - 2) / 2} bytes` : "no", landed: hasCode });
  } catch (err) {
    evidence.push({ question: "predicted project token holds code", answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null });
  }

  // ---- 4. has the factory's launch count moved? ---------------------------------------------------
  if (intent.totalLaunchesAtIntent !== null) {
    try {
      const now = (await client.readContract({ address: intent.factory, abi: opts.factoryAbi, functionName: "totalLaunches" })) as bigint;
      const moved = now > BigInt(intent.totalLaunchesAtIntent);
      // WEAKER THAN THE OTHERS AND LABELLED AS SUCH: somebody else's launch also moves this counter.
      // It is corroboration, never a verdict on its own.
      evidence.push({ question: "factory totalLaunches moved (weak: anyone's launch moves it)", answer: `${now} vs ${intent.totalLaunchesAtIntent} at intent`, landed: moved ? null : false });
    } catch (err) {
      evidence.push({ question: "factory totalLaunches moved", answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null });
    }
  }

  const strong = evidence.filter((e) => e.question.includes("predicted project token") || e.question.includes("nonce") || e.question.includes("recorded tx"));
  if (strong.some((e) => e.landed === true)) {
    return { verdict: "ALREADY_LAUNCHED", evidence, txHash, detail: "at least one independent check says this launch already left. Resending would create a second project." };
  }
  if (evidence.some((e) => e.landed === null)) {
    return { verdict: "UNKNOWN_DO_NOT_SEND", evidence, txHash, detail: "one or more checks could not be answered. An unanswerable question is not a 'no': the cost of waiting is a delay, the cost of guessing is a duplicate launch." };
  }
  return { verdict: "SAFE_TO_SEND", evidence, txHash, detail: "every check was answered and none of them found a landed launch." };
}
