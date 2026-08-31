// SPDX-License-Identifier: MIT
// ================================================================================================
// RESOLVING A RUNTIME'S NUMERIC ID ON ONE CHAIN — the half of the art selector a bundle may not
// carry.
//
// `LaunchParams.artTemplateId` packs two creator choices into one word:
//
//     artTemplateId = uint256(artRuntimeId) << 224 | templateId
//
// The template half comes out of the project (`art.templateId`, a decimal string in the bundle).
// The runtime half is a KEY INTO `ArtRuntimeRegistryV1` ON THE SELECTED CHAIN, and it is not a
// property of a project: ids are chosen by the registering Safe, may be sparse, and are free to
// differ per chain. So a project names its runtime by STABLE STRING and this module turns that
// string into a number by asking the chain, on the day it is asked.
//
// THE PACKING IS NOT DONE HERE. `encodeArtSelector` in `@relics/project-schema` is the ONE public
// implementation of the shift, checked against the Solidity library's own corpus. Nothing in this
// SDK open-codes `<< 224`.
//
// ------------------------------------------------------------------------------------------------
// TWO MEASURED TRAPS THIS MODULE EXISTS TO WALK PAST
// ------------------------------------------------------------------------------------------------
//
// 1. `runtimeCount()` IS A COUNT, NOT `maxRuntimeId + 1`. Read live on 2026-08-31: Ethereum
//    reports `runtimeCount() == 3` while ids 1, 3 and 4 are registered and active and id 2 is
//    deliberately empty. A `for id in 1..runtimeCount` sweep reads 1, 2, 3 and concludes
//    `VECTOR_COMPOSITION_V1` is NOT REGISTERED — a fabricated fact about a live chain. The
//    registry exposes no enumeration function, so the complete surface is the REGISTRATION LOG,
//    and `runtimeCount()` is used only as an INDEPENDENT DENOMINATOR: a log set of a different
//    size is a truncated read, not an answer.
//
// 2. `runtimeInfo(id)` DOES NOT REVERT FOR AN UNREGISTERED ID. It returns a well-formed record
//    with the zero address and `exists: false`. "The call resolved" is therefore not "the runtime
//    exists", and both booleans plus a non-zero address plus real code are required.
//
// AN UNREAD REGISTRY IS `UNKNOWN`, NEVER `NOT_REGISTERED`. The two refuse a launch alike and say
// different things to a creator, and only one of them is a reason to retry. Collapsing them is how
// a rate-limited endpoint becomes "this chain carries no such runtime".
// ================================================================================================
import { getAddress, keccak256, toHex, type Address, type Hex, type PublicClient } from "viem";
import {
  ART_RUNTIME_REGISTERED_TOPIC0,
  artRuntimeTagPreimage,
  discoverRegisteredRuntimeIds,
  runtimeRecordNamesARuntime,
} from "@relics/project-schema";
import { ART_RUNTIME_REGISTRY_ABI } from "./abi.js";

/** Every state a per-chain runtime lookup can land in. `ACTIVE` is the only one that permits a launch. */
export type ArtRuntimeResolutionState = "ACTIVE" | "INACTIVE" | "NOT_REGISTERED" | "UNKNOWN";

/** How the registration log set was obtained. Reported, because the two are not equally strong. */
export type ArtRuntimeLogSource = "FULL_RANGE" | "WINDOWED";

/**
 * What was established about one runtime on one chain, and how.
 *
 * `evidence` is not decoration: it is what a downstream approval records so a signer can compare a
 * decoded selector against something that was READ rather than asserted.
 */
export interface ArtRuntimeResolution {
  readonly state: ArtRuntimeResolutionState;
  readonly chainId: number;
  readonly registry: Address | null;
  /** The stable string id asked about, e.g. `GEOMETRIC_RECURSION_V1`. */
  readonly runtimeTag: string;
  /** `keccak256(utf8("V4ART.RUNTIME." + runtimeTag))` — the `bytes32 tag` the registry stores. */
  readonly tagHash: Hex;
  /** The `uint32` key, or null when nothing was matched. NEVER defaulted, never zero. */
  readonly artRuntimeId: number | null;
  readonly runtimeAddress: Address | null;
  readonly runtimeCodeBytes: number | null;
  readonly artRuntimeMode: number | null;
  readonly artRuntimeVersion: number | null;
  readonly active: boolean;
  readonly exists: boolean;
  /** The ids the registration log yielded, and whether that set reconciled against `runtimeCount()`. */
  readonly registeredIds: readonly number[];
  readonly complete: boolean;
  /** WHICH read answered — a full-range log query, or a windowed one that had to be stitched. */
  readonly logSource: ArtRuntimeLogSource | null;
  readonly declaredCount: number | null;
  /** The block the read was taken at, decimal. A resolution without one was not read from a chain. */
  readonly blockNumber: string | null;
  readonly detail: string;
}

/** The tag hash a stable runtime id resolves to. Derived, never transcribed. */
export function artRuntimeTagHash(runtimeIdOrRuntimeName: string): Hex {
  // Accepts either the vocabulary NAME (`GEOMETRIC_RECURSION`) or the stable ID
  // (`GEOMETRIC_RECURSION_V1`). The registry stores a hash of the id, so a name is mapped first.
  const preimage = artRuntimeTagPreimage(runtimeIdOrRuntimeName) ?? `V4ART.RUNTIME.${runtimeIdOrRuntimeName}`;
  return keccak256(toHex(preimage));
}

function unknown(base: Omit<ArtRuntimeResolution, "state" | "detail">, detail: string): ArtRuntimeResolution {
  return { ...base, state: "UNKNOWN", detail };
}

/**
 * Which numeric id a runtime holds on this chain, established by reading the registry.
 *
 * `fromBlock` exists because a provider may cap an `eth_getLogs` range. It narrows the WINDOW, not
 * the standard of proof: the reconciliation against `runtimeCount()` still has to hold, so a window
 * that misses a registration reports UNKNOWN rather than a short answer.
 */
export async function resolveArtRuntime(
  client: PublicClient,
  registry: Address,
  runtimeTag: string,
  opts?: { fromBlock?: bigint | "earliest" },
): Promise<ArtRuntimeResolution> {
  const chainId = await client.getChainId().catch(() => -1);
  const tagHash = artRuntimeTagHash(runtimeTag);
  const base = {
    chainId,
    registry: (registry ?? null) as Address | null,
    runtimeTag,
    tagHash,
    artRuntimeId: null,
    runtimeAddress: null,
    runtimeCodeBytes: null,
    artRuntimeMode: null,
    artRuntimeVersion: null,
    active: false,
    exists: false,
    registeredIds: [] as number[],
    complete: false,
    logSource: null as ArtRuntimeLogSource | null,
    declaredCount: null as number | null,
    blockNumber: null as string | null,
  };

  if (!registry) {
    return unknown(base, "the public record names no art runtime registry on this chain, so no runtime claim can be established either way");
  }

  let blockNumber: bigint;
  try {
    blockNumber = await client.getBlockNumber();
  } catch (err) {
    return unknown(base, `the endpoint did not answer: ${err instanceof Error ? err.message : String(err)}`);
  }
  const withBlock = { ...base, blockNumber: blockNumber.toString() };

  let declaredCount: number;
  try {
    declaredCount = Number(await client.readContract({ address: registry, abi: ART_RUNTIME_REGISTRY_ABI, functionName: "runtimeCount" }));
  } catch (err) {
    // WITHOUT THE COUNT THERE IS NO DENOMINATOR. A log set that looks whole and one that was
    // truncated are indistinguishable, so no number of successful reads could prove completeness.
    return unknown(withBlock, `runtimeCount() could not be read, so a log set has no independent denominator: ${err instanceof Error ? err.message : String(err)}`);
  }
  const withCount = { ...withBlock, declaredCount };

  const gathered = await gatherRegistrationLogs(client, registry, blockNumber, declaredCount, opts);
  if (gathered.kind === "UNREADABLE") {
    return unknown({ ...withCount, logSource: gathered.source }, gathered.detail);
  }

  const discovered = discoverRegisteredRuntimeIds(gathered.logs, { runtimeCount: declaredCount });
  const withIds = { ...withCount, registeredIds: discovered.ids, complete: discovered.complete, logSource: gathered.source };
  if (!discovered.complete) {
    return unknown(withIds, `the registry could not be enumerated completely: ${discovered.reason}`);
  }

  // Every registered id is read, and a FAILED read is recorded rather than skipped. A caught error
  // that becomes "not this one" turns a transport failure into a claim about the chain.
  let match: { id: number; record: any } | null = null;
  for (const id of discovered.ids) {
    let record: any;
    try {
      record = await client.readContract({ address: registry, abi: ART_RUNTIME_REGISTRY_ABI, functionName: "runtimeInfo", args: [id] });
    } catch (err) {
      return unknown(withIds, `runtimeInfo(${id}) could not be read, so this registry was not fully examined: ${err instanceof Error ? err.message : String(err)}`);
    }
    // THE ZERO-ADDRESS TRAP. A successful CALL is not a successful RESOLUTION.
    if (!runtimeRecordNamesARuntime({ exists: record.exists, runtime: record.runtime })) continue;
    if (String(record.tag).toLowerCase() !== tagHash.toLowerCase()) continue;
    match = { id, record };
    break;
  }

  if (!match) {
    return {
      ...withIds,
      state: "NOT_REGISTERED",
      detail:
        `no runtime tagged ${runtimeTag} is registered on chain ${chainId}. The registry read was COMPLETE ` +
        `(${discovered.ids.length} registered id(s) reconciled against runtimeCount() == ${declaredCount}), so this is a real absence rather than an unread registry.`,
    };
  }

  const runtimeAddress = getAddress(match.record.runtime as Address);
  let codeBytes: number;
  try {
    const code = await client.getCode({ address: runtimeAddress });
    codeBytes = code && code !== "0x" ? (code.length - 2) / 2 : 0;
  } catch (err) {
    return unknown({ ...withIds, artRuntimeId: match.id, runtimeAddress }, `the runtime's code could not be read at ${runtimeAddress}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const resolved = {
    ...withIds,
    artRuntimeId: match.id,
    runtimeAddress,
    runtimeCodeBytes: codeBytes,
    artRuntimeMode: Number(match.record.mode),
    artRuntimeVersion: Number(match.record.version),
    active: Boolean(match.record.active),
    exists: true,
  };

  if (codeBytes === 0) {
    // AN ID CAN EXIST, NAME AN ADDRESS, AND THAT ADDRESS CAN HOLD NOTHING. Registered is not
    // deployed; a launch bound to an empty address renders nothing, permanently.
    return { ...resolved, state: "INACTIVE", detail: `${runtimeTag} is registered at id ${match.id} but ${runtimeAddress} holds no code on chain ${chainId}` };
  }
  if (!resolved.active) {
    return { ...resolved, state: "INACTIVE", detail: `${runtimeTag} is registered at id ${match.id} on chain ${chainId} but is not active` };
  }
  return {
    ...resolved,
    state: "ACTIVE",
    detail: `${runtimeTag} is active at id ${match.id} on chain ${chainId} (${runtimeAddress}, ${codeBytes} bytes of code, mode ${resolved.artRuntimeMode}, version ${resolved.artRuntimeVersion}) at block ${blockNumber}`,
  };
}

/** How many blocks one `eth_getLogs` window covers when the full range is refused. */
const DEFAULT_WINDOW_BLOCKS = 9_500n;
/** How many windows may be walked backwards before the search gives up and answers UNKNOWN. */
const DEFAULT_MAX_WINDOWS = 512;

type GatheredLogs =
  | { kind: "READ"; logs: { topics?: readonly string[] }[]; source: ArtRuntimeLogSource }
  | { kind: "UNREADABLE"; detail: string; source: ArtRuntimeLogSource | null };

/**
 * Fetch every `RuntimeRegistered` log, working around a provider's range cap without weakening the
 * standard of proof.
 *
 * THE FULL RANGE IS TRIED FIRST because it is the only query whose answer is complete by
 * construction. Free endpoints refuse it — measured on `eth.drpc.org`, 2026-08-31: *"ranges over
 * 10000 blocks are not supported on free plan"* — so the fallback walks backwards in windows.
 *
 * THE STOP CONDITION IS THE COUNTER, NOT A GUESS ABOUT HOW FAR BACK TO LOOK. `runtimeCount()`
 * increments once per emitted event, so the moment the accumulated windows yield that many distinct
 * ids the set is provably whole and the walk stops. Running out of windows first is reported as
 * UNREADABLE — an unfinished search is an unread registry, and an unread registry is `UNKNOWN`
 * rather than an absence.
 *
 * THE WINDOWED READ IS LABELLED, not silently substituted. It covers a bounded suffix of history,
 * and the only thing that makes it as strong as the full range is the reconciliation it had to pass.
 */
async function gatherRegistrationLogs(
  client: PublicClient,
  registry: Address,
  head: bigint,
  declaredCount: number,
  opts?: { fromBlock?: bigint | "earliest"; windowBlocks?: bigint; maxWindows?: number },
): Promise<GatheredLogs> {
  const topics = [ART_RUNTIME_REGISTERED_TOPIC0 as Hex];
  const query = async (fromBlock: bigint | "earliest", toBlock: bigint) =>
    (await client.request({
      method: "eth_getLogs",
      params: [
        {
          address: registry,
          fromBlock: typeof fromBlock === "bigint" ? toHex(fromBlock) : fromBlock,
          toBlock: toHex(toBlock),
          topics,
        },
      ],
    } as never)) as unknown as { topics?: readonly string[] }[];

  const from = opts?.fromBlock ?? "earliest";
  try {
    return { kind: "READ", logs: await query(from, head), source: "FULL_RANGE" };
  } catch (fullRangeErr) {
    // A caller that NAMED a from-block asked for one query, not a search. Widening it here would
    // answer a question nobody asked and hide the cap that refused it.
    if (typeof from === "bigint") {
      return { kind: "UNREADABLE", source: "FULL_RANGE", detail: `the RuntimeRegistered log range from block ${from} could not be read: ${message(fullRangeErr)}` };
    }

    const windowBlocks = opts?.windowBlocks ?? DEFAULT_WINDOW_BLOCKS;
    const maxWindows = opts?.maxWindows ?? DEFAULT_MAX_WINDOWS;
    const accumulated: { topics?: readonly string[] }[] = [];
    let upper = head;
    for (let window = 0; window < maxWindows; window++) {
      const lower = upper > windowBlocks ? upper - windowBlocks + 1n : 0n;
      let batch: { topics?: readonly string[] }[];
      try {
        batch = await query(lower, upper);
      } catch (windowErr) {
        return {
          kind: "UNREADABLE",
          source: "WINDOWED",
          detail:
            `the full RuntimeRegistered range was refused (${message(fullRangeErr)}) and the windowed read failed at blocks ` +
            `${lower}..${upper}: ${message(windowErr)}`,
        };
      }
      accumulated.push(...batch);
      if (discoverRegisteredRuntimeIds(accumulated, { runtimeCount: declaredCount }).complete) {
        return { kind: "READ", logs: accumulated, source: "WINDOWED" };
      }
      if (lower === 0n) break;
      upper = lower - 1n;
    }
    return {
      kind: "UNREADABLE",
      source: "WINDOWED",
      detail:
        `the full RuntimeRegistered range was refused (${message(fullRangeErr)}) and ${maxWindows} windows of ${windowBlocks} blocks did not yield the ` +
        `${declaredCount} registration(s) runtimeCount() reports. The registry was NOT read; this is not an absence.`,
    };
  }
}

function message(err: unknown): string {
  const text = err instanceof Error ? (err as { shortMessage?: string }).shortMessage ?? err.message : String(err);
  return text.split("\n")[0]!.slice(0, 200);
}
