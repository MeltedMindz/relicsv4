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
//   2. the signer's MINED nonce has moved past the one the intent reserved;
//   3. the signer's PENDING nonce is ahead of the reserved one — i.e. bytes are in the pool;
//   4. the predicted project token address holds code;
//   5. the factory's launch count has moved.
//
// Only when EVERY question is answered and every answer says "no launch" may a resend proceed. An
// UNANSWERABLE question is not a "no" — an unreachable endpoint blocks the resend rather than
// permitting it, because the cost of waiting is a delay and the cost of guessing is a duplicate.
//
// QUESTION 3 IS THE ONE THIS GUARD WAS MISSING, AND ITS ABSENCE VOIDED THE OTHER FOUR IN EXACTLY
// THE WINDOW THE GUARD EXISTS FOR. The failure being defended against is "accepted into the mempool,
// hash lost before it reached disk". In that state, measured against a real node on 2026-09-03:
// there is no recorded hash to look up (that is the premise), `getTransactionCount` at the DEFAULT
// block tag — which is `latest`, i.e. MINED — still reads the reserved nonce, the predicted token
// holds no code, and `totalLaunches` has not moved. Four questions, four honest "no"s, verdict
// SAFE_TO_SEND, and the resend is the duplicate launch. Only the PENDING nonce distinguishes
// "nothing left" from "something left and has not been mined yet".
//
// AND WHEN THE PENDING NONCE HAS MOVED, THE UNKNOWN CASE REFUSES. If a pending transaction can be
// matched to THESE bytes it is proof the launch left; if it cannot be matched — the pool is not
// readable, or the pending transaction is some other one from the same key — the question is
// UNANSWERED, not answered "no". A signer with an in-flight transaction at the nonce this launch
// reserved is not a signer we can prove has sent nothing.
// ================================================================================================
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress, keccak256, type Address, type Hex, type PublicClient } from "viem";
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
  /**
   * Set when this intent has been SETTLED — the chain was asked and answered, and the answer was
   * acted on. An intent without this is UNRESOLVED: a send may or may not have left under it, and
   * nothing may overwrite it. See `writeIntent`.
   */
  resolvedAt?: string;
  resolution?: IntentResolution;
  resolutionDetail?: string;
}

/**
 * How an intent stopped being the open question.
 *
 * `PROVEN_NOT_SENT` is the only one that permits a NEW intent for a different launch, and it may
 * only be recorded from a `decideResend` that returned `SAFE_TO_SEND` — i.e. from the chain's
 * answer, never from a local file or an operator's belief.
 */
export type IntentResolution = "PROVEN_NOT_SENT" | "PROVEN_LANDED" | "ABANDONED_BY_CREATOR";

/**
 * Raised when a new intent would overwrite one that is still open.
 *
 * THE OVERWRITE IS THE BUG, NOT THE ERROR. `writeIntent` used to replace whatever was on disk, so a
 * second broadcast attempt in the same workspace erased the record of the first — including a
 * `txHash` that had already been recorded — and left a resume asking the chain about the wrong
 * launch. A workspace with an unanswered send in it is not a workspace another send may start from.
 */
export class UnresolvedBroadcastIntentError extends Error {
  readonly intent: BroadcastIntent;
  constructor(intent: BroadcastIntent, detail: string) {
    super(`an unresolved broadcast intent is on disk (${detail}). Ask the chain with \`relics agent resume\` and resolve it before writing another.`);
    this.name = "UnresolvedBroadcastIntentError";
    this.intent = intent;
  }
}

function intentPath(workspace: string): string {
  return join(workspace, AGENT_DIR, "broadcast-intent.json");
}

export function readIntent(workspace: string): BroadcastIntent | null {
  const p = intentPath(workspace);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as BroadcastIntent;
}

export function isIntentResolved(intent: BroadcastIntent): boolean {
  return typeof intent.resolvedAt === "string" && intent.resolvedAt.length > 0;
}

/**
 * REPLACE an existing file's contents atomically: write a temp beside it, then rename over it.
 *
 * `writeFileSync` to the live path is not atomic. A crash part-way through leaves a truncated JSON
 * document, and this file's whole job is to survive a crash — an intent that cannot be parsed after
 * one is worth exactly as much as no intent at all, which is to say it silently permits a resend.
 * `rename` within a directory is atomic on every filesystem this runs on: a reader sees the old
 * document or the new one, never half of either.
 */
function replaceJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * CREATE the file, and fail if anything is already there.
 *
 * `link` is the primitive rather than `writeFileSync(..., { flag: "wx" })` because it is both
 * exclusive AND content-atomic: the temp file is complete before it acquires the name, so a reader
 * can never observe a partially written intent, and two processes racing to start a broadcast in
 * one workspace cannot both succeed. That is the mutual exclusion this module needs, and it needs
 * no separate lock file — which matters, because the expected failure here is a SIGKILL, and a
 * lock a crashed process cannot release is a lock that blocks the recovery it was meant to protect.
 */
function createJsonExclusive(path: string, value: unknown): void {
  const tmp = `${path}.new-${process.pid}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
    linkSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * Write intent. MUST be called and flushed before any transaction leaves the process.
 *
 * REFUSES to overwrite an intent that has not been resolved — including one for the SAME launch,
 * because "the same launch" is exactly the case where a silent overwrite drops a recorded `txHash`.
 * Resolve it first (`resolveIntent`), which requires having asked the chain.
 */
export function writeIntent(workspace: string, intent: Omit<BroadcastIntent, "version" | "writtenAt">): BroadcastIntent {
  mkdirSync(join(workspace, AGENT_DIR), { recursive: true });
  const path = intentPath(workspace);
  const existing = readIntent(workspace);
  if (existing && !isIntentResolved(existing)) {
    throw new UnresolvedBroadcastIntentError(
      existing,
      existing.txHash
        ? `it recorded ${existing.txHash} and nothing has confirmed it`
        : `it was written at ${existing.writtenAt} with no tx hash, which is the crash window itself`,
    );
  }
  const full: BroadcastIntent = { version: 1, writtenAt: new Date().toISOString(), ...intent };
  if (existing) replaceJsonAtomic(path, full);
  else createJsonExclusive(path, full);
  return full;
}

/**
 * Settle an intent so a new one may be written.
 *
 * `PROVEN_NOT_SENT` is the resolution a caller reaches for after `decideResend` said
 * `SAFE_TO_SEND`, and the previous intent is KEPT in the new file's history rather than deleted —
 * the record of what was attempted is the thing an operator needs when something did go wrong.
 */
export function resolveIntent(workspace: string, resolution: IntentResolution, detail: string): BroadcastIntent | null {
  const existing = readIntent(workspace);
  if (!existing) return null;
  const next: BroadcastIntent = { ...existing, resolvedAt: new Date().toISOString(), resolution, resolutionDetail: detail };
  replaceJsonAtomic(intentPath(workspace), next);
  return next;
}

export function recordIntentTxHash(workspace: string, txHash: Hex): void {
  const intent = readIntent(workspace);
  if (!intent) throw new Error("recordIntentTxHash: no broadcast intent on disk");
  replaceJsonAtomic(intentPath(workspace), { ...intent, txHash });
}

export type ResendVerdict = "ALREADY_LAUNCHED" | "SAFE_TO_SEND" | "UNKNOWN_DO_NOT_SEND";

/**
 * `STRONG` evidence can establish a landed launch ON ITS OWN. `CORROBORATION` never can.
 *
 * This used to be decided by matching substrings of the question text ("nonce", "predicted project
 * token", "recorded tx"), which meant the classification of every question depended on how its
 * prose happened to be worded — the corroborating one was excluded only because nobody had used
 * the word "nonce" in it. It is a property of the question, so it is now written down as one.
 */
export type EvidenceStrength = "STRONG" | "CORROBORATION";

export interface ResendEvidence {
  readonly question: string;
  readonly answer: string;
  readonly landed: boolean | null;
  readonly strength: EvidenceStrength;
}

export interface ResendDecision {
  readonly verdict: ResendVerdict;
  readonly evidence: readonly ResendEvidence[];
  readonly txHash: Hex | null;
  readonly detail: string;
}

/**
 * Look for THESE bytes in the pending pool.
 *
 * Asks for the pending block WITH full transaction objects and re-hashes each one's `input`, so a
 * match is a statement about the calldata rather than about a hash we were told. `from` is compared
 * too: another account's identical calldata is not our launch.
 *
 * A node that does not serve a pending block, or serves one without transaction bodies, produces
 * `matched: false` with a reason — which the caller turns into UNKNOWN, never into "no".
 */
async function findPendingLaunch(
  client: PublicClient,
  intent: BroadcastIntent,
): Promise<{ matched: true; txHash: Hex } | { matched: false; why: string }> {
  let block: { transactions?: unknown } | null;
  try {
    block = (await client.request({ method: "eth_getBlockByNumber", params: ["pending", true] } as never)) as { transactions?: unknown } | null;
  } catch (err) {
    return { matched: false, why: `the pending pool could not be read (${err instanceof Error ? err.message : String(err)}), so it cannot be shown NOT to hold this launch` };
  }
  const txs = block && Array.isArray(block.transactions) ? (block.transactions as Record<string, unknown>[]) : null;
  if (!txs) return { matched: false, why: "this node serves no pending block with transaction bodies, so the pool cannot be shown NOT to hold this launch" };
  for (const tx of txs) {
    const from = typeof tx.from === "string" ? tx.from : null;
    const input = typeof tx.input === "string" ? (tx.input as Hex) : null;
    const hash = typeof tx.hash === "string" ? (tx.hash as Hex) : null;
    if (!from || !input || !hash) continue;
    if (getAddress(from as Address) !== getAddress(intent.signer)) continue;
    if (keccak256(input).toLowerCase() !== intent.dataHash.toLowerCase()) continue;
    return { matched: true, txHash: hash };
  }
  return { matched: false, why: `the pool holds no transaction from ${intent.signer} carrying these calldata bytes, so the in-flight nonce is unaccounted for` };
}

/**
 * Ask the chain whether the launch this intent describes already happened.
 *
 * Returns ALREADY_LAUNCHED on any positive evidence, UNKNOWN_DO_NOT_SEND if any question could not
 * be answered, and SAFE_TO_SEND only when every question was answered and all say no.
 */
export async function decideResend(client: PublicClient, intent: BroadcastIntent, opts: { factoryAbi: any }): Promise<ResendDecision> {
  const evidence: ResendEvidence[] = [];

  // ---- 1. the recorded hash ---------------------------------------------------------------------
  let txHash: Hex | null = intent.txHash ?? null;
  if (txHash) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
      if (receipt) {
        evidence.push({ question: "recorded tx hash has a receipt", answer: `yes, status ${receipt.status} in block ${receipt.blockNumber}`, landed: true, strength: "STRONG" });
        return { verdict: "ALREADY_LAUNCHED", evidence, txHash, detail: `the recorded transaction ${txHash} is mined. Resending would launch a second project.` };
      }
      const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
      if (tx) {
        evidence.push({ question: "recorded tx hash is known to the network", answer: "yes, in the mempool", landed: true, strength: "STRONG" });
        return { verdict: "ALREADY_LAUNCHED", evidence, txHash, detail: `the recorded transaction ${txHash} is pending. Wait for it; do not send another.` };
      }
      evidence.push({ question: "recorded tx hash is known to the network", answer: "no", landed: false, strength: "STRONG" });
    } catch (err) {
      evidence.push({ question: "recorded tx hash is known to the network", answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null, strength: "STRONG" });
    }
  } else {
    evidence.push({ question: "a tx hash was recorded", answer: "no — intent was written but no hash came back", landed: false, strength: "CORROBORATION" });
  }

  // ---- 2. has the signer's MINED nonce moved? ----------------------------------------------------
  //
  // `blockTag` is stated rather than defaulted. viem's default IS `latest`, but "latest" reads as
  // "the newest thing the node knows" to anyone who has not checked, and the newest thing the node
  // knows about this signer may well be sitting in the pool. Question 3 is the one that asks that.
  try {
    const nonce = await client.getTransactionCount({ address: intent.signer, blockTag: "latest" });
    const moved = nonce > intent.nonceAtIntent;
    evidence.push({ question: "signer nonce (MINED) moved past the one reserved at intent", answer: `nonce ${nonce} vs ${intent.nonceAtIntent} at intent`, landed: moved, strength: "STRONG" });
  } catch (err) {
    evidence.push({ question: "signer nonce (MINED) moved past the one reserved at intent", answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null, strength: "STRONG" });
  }

  // ---- 3. is there an IN-FLIGHT transaction at the nonce this launch reserved? --------------------
  //
  // THE QUESTION THE CRASH WINDOW IS MADE OF. Between `eth_sendRawTransaction` returning and the
  // hash reaching disk, every other question here answers "no launch" truthfully — and the launch
  // is in the mempool. The pending nonce is the only reading that separates the two states.
  //
  // A move is not by itself proof that OUR bytes left, so the pool is asked to identify them. A
  // match is definitive: those exact bytes, from this signer, are in flight. No match is UNKNOWN
  // and refuses — either the pool could not be read, or the signer has some other transaction
  // occupying the nonce, and neither of those is "this launch was never sent".
  const PENDING_Q = "signer nonce (PENDING) is ahead of the reserved one — bytes in the pool";
  try {
    const pending = await client.getTransactionCount({ address: intent.signer, blockTag: "pending" });
    if (pending <= intent.nonceAtIntent) {
      evidence.push({ question: PENDING_Q, answer: `pending nonce ${pending} vs ${intent.nonceAtIntent} at intent — nothing of this signer's is in flight`, landed: false, strength: "STRONG" });
    } else {
      const found = await findPendingLaunch(client, intent);
      if (found.matched) {
        txHash = txHash ?? found.txHash;
        evidence.push({ question: PENDING_Q, answer: `pending nonce ${pending} vs ${intent.nonceAtIntent}, and ${found.txHash} in the pool carries THESE exact calldata bytes`, landed: true, strength: "STRONG" });
      } else {
        evidence.push({
          question: PENDING_Q,
          answer: `pending nonce ${pending} vs ${intent.nonceAtIntent} at intent — something of this signer's is in flight and ${found.why}`,
          landed: null,
          strength: "STRONG",
        });
      }
    }
  } catch (err) {
    evidence.push({ question: PENDING_Q, answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null, strength: "STRONG" });
  }

  // ---- 4. does the predicted token address hold code? --------------------------------------------
  // THE STRONGEST SINGLE SIGNAL. The predicted addresses are deterministic in the launcher and the
  // params, so code at the predicted token address means THIS launch, from THIS signer, with THESE
  // params, already executed. It cannot be another project's.
  try {
    const code = await client.getCode({ address: getAddress(intent.predicted.projectToken) });
    const hasCode = Boolean(code && code !== "0x");
    evidence.push({ question: "predicted project token holds code", answer: hasCode ? `yes, ${(code!.length - 2) / 2} bytes` : "no", landed: hasCode, strength: "STRONG" });
  } catch (err) {
    evidence.push({ question: "predicted project token holds code", answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null, strength: "STRONG" });
  }

  // ---- 5. has the factory's launch count moved? ---------------------------------------------------
  if (intent.totalLaunchesAtIntent !== null) {
    try {
      const now = (await client.readContract({ address: intent.factory, abi: opts.factoryAbi, functionName: "totalLaunches" })) as bigint;
      const moved = now > BigInt(intent.totalLaunchesAtIntent);
      // WEAKER THAN THE OTHERS AND LABELLED AS SUCH: somebody else's launch also moves this counter.
      // It is corroboration, never a verdict on its own.
      evidence.push({ question: "factory totalLaunches moved (weak: anyone's launch moves it)", answer: `${now} vs ${intent.totalLaunchesAtIntent} at intent`, landed: moved ? null : false, strength: "CORROBORATION" });
    } catch (err) {
      evidence.push({ question: "factory totalLaunches moved", answer: `could not ask: ${err instanceof Error ? err.message : String(err)}`, landed: null, strength: "CORROBORATION" });
    }
  }

  const strong = evidence.filter((e) => e.strength === "STRONG");
  if (strong.some((e) => e.landed === true)) {
    return { verdict: "ALREADY_LAUNCHED", evidence, txHash, detail: "at least one independent check says this launch already left. Resending would create a second project." };
  }
  if (evidence.some((e) => e.landed === null)) {
    return { verdict: "UNKNOWN_DO_NOT_SEND", evidence, txHash, detail: "one or more checks could not be answered. An unanswerable question is not a 'no': the cost of waiting is a delay, the cost of guessing is a duplicate launch." };
  }
  return { verdict: "SAFE_TO_SEND", evidence, txHash, detail: "every check was answered and none of them found a landed launch." };
}
