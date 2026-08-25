// SPDX-License-Identifier: MIT
// ================================================================================================
// BROADCAST -> CONFIRM -> VERIFY.
//
// A TRANSACTION HASH IS NOT A LAUNCH. It is a claim that an endpoint accepted some bytes. Between
// that and a launched project sit: the transaction never being mined, being replaced by one with
// the same nonce, being mined and REVERTING, or being mined on a block that is later reorged away.
// Every one of those produces a hash, and only one of them produces a project.
//
// So confirmation here means a receipt with `status === 1`, at the configured depth, re-read from
// chain — and verification means reading the RESULT back from chain independently, never trusting
// the build object that predicted it.
// ================================================================================================
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { FACTORY_ABI, PROJECT_COLLECTION_ABI, PROJECT_REGISTRY_ABI, ART_HOOK_ABI } from "./abi.js";
import type { Evidence, Finding } from "./contracts.js";

export type ConfirmState = "PENDING" | "CONFIRMED" | "REVERTED" | "REPLACED" | "NOT_FOUND" | "UNKNOWN";

export interface ConfirmResult {
  readonly state: ConfirmState;
  readonly txHash: Hex;
  readonly blockNumber: bigint | null;
  readonly confirmations: number;
  readonly status: "success" | "reverted" | null;
  readonly gasUsed: bigint | null;
  readonly detail: string;
}

/**
 * Wait for `requiredConfirmations`, reporting each distinguishable outcome truthfully.
 *
 * `NOT_FOUND` IS NOT `REVERTED` AND NEITHER IS `UNKNOWN`. A transaction the endpoint has never
 * heard of might be seconds from propagating; one that reverted is finished; one we could not ask
 * about is our problem, not the chain's. An agent branches differently on all three, and collapsing
 * them is how a resumable process either gives up on a live launch or relaunches a dead one.
 */
export async function waitForConfirmation(client: PublicClient, txHash: Hex, requiredConfirmations: number, opts?: { timeoutMs?: number; pollMs?: number }): Promise<ConfirmResult> {
  const deadline = Date.now() + (opts?.timeoutMs ?? 600_000);
  const pollMs = opts?.pollMs ?? 4_000;
  let lastDetail = "not yet seen by this endpoint";

  while (Date.now() < deadline) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
      if (receipt) {
        const head = await client.getBlockNumber();
        const confirmations = Number(head - receipt.blockNumber) + 1;
        if (receipt.status === "reverted") {
          return { state: "REVERTED", txHash, blockNumber: receipt.blockNumber, confirmations, status: "reverted", gasUsed: receipt.gasUsed, detail: "the transaction was mined and REVERTED. It has a hash and it is not a launch." };
        }
        if (confirmations >= requiredConfirmations) {
          return { state: "CONFIRMED", txHash, blockNumber: receipt.blockNumber, confirmations, status: "success", gasUsed: receipt.gasUsed, detail: `receipt status 1 at depth ${confirmations}` };
        }
        lastDetail = `mined at block ${receipt.blockNumber}, ${confirmations}/${requiredConfirmations} confirmations`;
      } else {
        const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
        lastDetail = tx ? "in the mempool, not yet mined" : "not yet seen by this endpoint";
      }
    } catch (err) {
      // An endpoint that stopped answering does not tell us the transaction failed.
      lastDetail = `the endpoint did not answer: ${err instanceof Error ? err.message : String(err)}`;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { state: "PENDING", txHash, blockNumber: null, confirmations: 0, status: null, detail: `still unconfirmed after the timeout: ${lastDetail}`, gasUsed: null };
}

export interface VerifyResult {
  readonly verified: Evidence;
  readonly findings: readonly Finding[];
  readonly observed: {
    projectId: bigint | null;
    projectToken: Address | null;
    projectCollection: Address | null;
    artHook: Address | null;
    poolId: Hex | null;
  };
  readonly predictionMatch: boolean | null;
}

/**
 * Read the launched project back OFF THE CHAIN and compare it with what was predicted.
 *
 * THE BUILD OBJECT IS NOT EVIDENCE ABOUT ITSELF. Verification that consulted the plan would be
 * asking the prediction whether the prediction came true. Everything below is a fresh read: the
 * factory's own event from the mined receipt, then `eth_getCode` at each produced address, then the
 * hook's own election, then the collection's own `contractURI`.
 */
export async function verifyLaunch(client: PublicClient, args: {
  txHash: Hex;
  factory: Address;
  predicted: { projectToken: Address; projectCollection: Address; artHook: Address; poolId: Hex };
  expected: { creatorRecipient: Address; antiSnipeMode: string; metadataUriHash: Hex; metadataUri?: string };
}): Promise<VerifyResult> {
  const findings: Finding[] = [];
  const add = (id: string, evidence: Evidence, detail: string, unreadReason?: string) => findings.push(unreadReason ? { id, evidence, detail, unreadReason } : { id, evidence, detail });

  const observed: VerifyResult["observed"] = { projectId: null, projectToken: null, projectCollection: null, artHook: null, poolId: null };

  const receipt = await client.getTransactionReceipt({ hash: args.txHash }).catch(() => null);
  if (!receipt) {
    add("receipt.present", "UNKNOWN", "the transaction receipt could not be read", "verification cannot proceed without it; this is not evidence the launch failed");
    return { verified: "UNKNOWN", findings, observed, predictionMatch: null };
  }
  if (receipt.status !== "success") {
    add("receipt.status", "REFUTED", "the mined receipt reports status 0 (reverted): no project was created");
    return { verified: "REFUTED", findings, observed, predictionMatch: null };
  }
  add("receipt.status", "PROVEN", `receipt status 1 in block ${receipt.blockNumber}`);

  // ---- the factory's OWN event, parsed from the mined logs -------------------------------------
  try {
    const { parseEventLogs } = await import("viem");
    const events = parseEventLogs({ abi: FACTORY_ABI(), logs: receipt.logs });
    const launched = events.find((e: any) => /launch/i.test(e.eventName)) as any;
    if (!launched) {
      add("factory.event", "UNKNOWN", "no launch event from the factory was found in this receipt's logs", "the ABI may not describe the emitted event; the address reads below are independent of it");
    } else {
      const a = launched.args ?? {};
      observed.projectId = a.projectId ?? null;
      observed.projectToken = a.projectToken ? getAddress(a.projectToken) : null;
      observed.projectCollection = a.projectCollection ? getAddress(a.projectCollection) : null;
      observed.artHook = a.artHook ? getAddress(a.artHook) : null;
      observed.poolId = a.poolId ?? null;
      add("factory.event", "PROVEN", `${launched.eventName} emitted by the factory, projectId ${observed.projectId}`);
    }
  } catch (err) {
    add("factory.event", "UNKNOWN", "could not parse the factory's logs", err instanceof Error ? err.message : String(err));
  }

  // ---- predicted vs observed --------------------------------------------------------------------
  let predictionMatch: boolean | null = null;
  const pairs: [string, Address | null, Address][] = [
    ["projectToken", observed.projectToken, args.predicted.projectToken],
    ["projectCollection", observed.projectCollection, args.predicted.projectCollection],
    ["artHook", observed.artHook, args.predicted.artHook],
  ];
  const comparable = pairs.filter(([, o]) => o !== null);
  if (comparable.length === 0) {
    add("prediction.match", "UNKNOWN", "no observed addresses were available to compare with the prediction");
  } else {
    const mismatches = comparable.filter(([, o, p]) => getAddress(o!) !== getAddress(p));
    predictionMatch = mismatches.length === 0;
    if (predictionMatch) add("prediction.match", "PROVEN", `${comparable.length} predicted address(es) match what the chain produced`);
    else add("prediction.match", "REFUTED", `predicted != observed: ${mismatches.map(([n, o, p]) => `${n} predicted ${p} got ${o}`).join("; ")}`);
  }

  // ---- code really exists at each produced address ----------------------------------------------
  for (const [label, addr] of [["projectToken", observed.projectToken], ["projectCollection", observed.projectCollection], ["artHook", observed.artHook]] as const) {
    if (!addr) continue;
    try {
      const code = await client.getCode({ address: addr });
      if (!code || code === "0x") add(`${label}.code`, "REFUTED", `${label} ${addr} holds no code`);
      else add(`${label}.code`, "PROVEN", `${label} holds ${(code.length - 2) / 2} bytes`);
    } catch (err) {
      add(`${label}.code`, "UNKNOWN", `could not read code at ${label}`, err instanceof Error ? err.message : String(err));
    }
  }

  // ---- the hook's OWN anti-snipe election -------------------------------------------------------
  if (observed.artHook) {
    try {
      const mode = await client.readContract({ address: observed.artHook, abi: ART_HOOK_ABI(), functionName: "antiSnipeMode" });
      const NAMES = ["UNSPECIFIED", "NONE", "PROTECTED_98_MINUTES"];
      const got = NAMES[Number(mode)] ?? `UNKNOWN(${mode})`;
      if (got === args.expected.antiSnipeMode) add("hook.antiSnipeMode", "PROVEN", `the hook reports ${got}, as elected`);
      else add("hook.antiSnipeMode", "REFUTED", `the hook reports ${got} but ${args.expected.antiSnipeMode} was elected`);
    } catch (err) {
      // AN UNREAD ELECTION IS UNKNOWN AND RENDERS AS UNKNOWN — never as protected, never as NONE.
      add("hook.antiSnipeMode", "UNKNOWN", "the hook's election could not be read", err instanceof Error ? err.message : String(err));
    }
  }

  // ---- the collection's OWN contractURI ---------------------------------------------------------
  if (observed.projectCollection) {
    try {
      const uri = (await client.readContract({ address: observed.projectCollection, abi: PROJECT_COLLECTION_ABI(), functionName: "contractURI" })) as string;
      if (!uri || uri.length === 0) add("collection.contractURI", "REFUTED", "contractURI() is empty: no marketplace will render this collection");
      else if (args.expected.metadataUri && uri !== args.expected.metadataUri) add("collection.contractURI", "REFUTED", `contractURI() is ${uri}, not the committed ${args.expected.metadataUri}`);
      else add("collection.contractURI", "PROVEN", `contractURI() resolves to ${uri}`);
    } catch (err) {
      add("collection.contractURI", "UNKNOWN", "contractURI() could not be read", err instanceof Error ? err.message : String(err));
    }
  }

  const verified: Evidence = findings.some((f) => f.evidence === "REFUTED") ? "REFUTED" : findings.some((f) => f.evidence === "UNKNOWN") ? "UNKNOWN" : "PROVEN";
  return { verified, findings, observed, predictionMatch };
}

/** Explorer links for a launched project. Only for chains whose explorer the record actually names. */
export function explorerLinks(explorer: string, o: { txHash?: Hex; token?: Address | null; collection?: Address | null }): Record<string, string> {
  if (!explorer) return {};
  const out: Record<string, string> = {};
  if (o.txHash) out.transaction = `${explorer}/tx/${o.txHash}`;
  if (o.token) out.token = `${explorer}/address/${o.token}`;
  if (o.collection) out.collection = `${explorer}/address/${o.collection}`;
  return out;
}
