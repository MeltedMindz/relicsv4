// SPDX-License-Identifier: MIT
//
// DISCOVERING WHICH ART RUNTIME IDS EXIST ON A CHAIN — the sparse-safe way.
//
// The runtime half of an art selector is a key into `ArtRuntimeRegistryV1`, so "which ids exist"
// is the same subject as "how is the selector packed" and lives beside it.
//
// `runtimeCount()` IS A COUNT, NOT `maxRuntimeId + 1`, AND SWEEPING `1..runtimeCount` IS WRONG.
// The registry's whole storage is
//
//     mapping(uint32 => RuntimeRecord) runtimes;
//     uint32 runtimeCount;
//
// (`ArtRuntimeRegistryV1.sol:120-123`). `registerRuntime(uint32 runtimeId, …)` takes the id as a
// CALLER ARGUMENT and only does `$.runtimeCount += 1` (`:213-215`), so ids are chosen by the
// registering Safe and are free to be sparse. Measured live on 2026-08-30: Ethereum and Base both
// report `runtimeCount() == 3` while ids 1, 3 and 4 are registered and id 2 is deliberately empty
// (id 2 is registered on Robinhood alone, and the other two chains were left with a hole so one
// runtime has one id everywhere). A `for id in 1..runtimeCount` sweep therefore reads ids
// 1, 2, 3 and concludes NOT_REGISTERED for `VECTOR_COMPOSITION_V1`, which is live at id 4.
//
// A FIXED-WINDOW PROBE IS NOT A FIX EITHER. Scanning `1..16` and stopping once `runtimeCount`
// entries have been seen happens to work today and has a hard ceiling: an id above the window is
// permanently invisible AND pins the snapshot incomplete forever, which degrades every absence
// claim to "the registry could not be read" on a perfectly healthy chain.
//
// THE REGISTRY EXPOSES NO ENUMERATION FUNCTION. There is no `runtimeIds()`, no `runtimeIdAt(i)`,
// no index array — unlike `TemplateRegistryV1`, which does keep `uint256[] templateIds` and expose
// it. So the complete surface is the REGISTRATION LOG:
//
//     RuntimeRegistered(uint32 indexed runtimeId, address indexed runtime, uint8 mode,
//                       uint16 version, bytes32 tag)
//
// emitted exactly once per registration, inside the same branch that guards `exists` and adjacent
// to the counter increment. That makes the log set EXACTLY the registered id set, with no ceiling
// and no sparsity assumption — and it makes `logs.length === runtimeCount()` a completeness proof
// the probe can never offer.
//
// THIS MODULE IS PURE. It decodes and reconciles logs the caller fetched; it opens no socket and
// depends on nothing. The transport belongs to the caller, and keeping it there is what lets the
// browser, a Node script, a test with recorded logs and a fork suite all share one reconciliation.

import { keccak256Utf8 } from "./keccak256.js";

/** The registration event's canonical signature, exactly as `ArtRuntimeRegistryV1` declares it. */
export const ART_RUNTIME_REGISTERED_SIGNATURE = "RuntimeRegistered(uint32,address,uint8,uint16,bytes32)";

/**
 * `topics[0]` of a registration log. DERIVED, never typed: a hand-copied topic is a 32-byte
 * literal nothing checks, and getting it wrong yields zero logs — which reads exactly like a chain
 * with no runtimes registered.
 */
export const ART_RUNTIME_REGISTERED_TOPIC0 = `0x${keccak256Utf8(ART_RUNTIME_REGISTERED_SIGNATURE)}`;

/** The activation event, for a caller that also wants current `active` state from logs. */
export const ART_RUNTIME_ACTIVE_SET_SIGNATURE = "RuntimeActiveSet(uint32,bool)";
export const ART_RUNTIME_ACTIVE_SET_TOPIC0 = `0x${keccak256Utf8(ART_RUNTIME_ACTIVE_SET_SIGNATURE)}`;

/**
 * The id `ArtRuntimeRegistryV1.registerRuntime` refuses by name (`ReservedRuntimeId`, `:194`).
 * It is the same zero the art selector reads as "no preference", which is why an election can
 * never be represented by it: there is nothing at that key and there never can be.
 */
export const ART_RUNTIME_RESERVED_ID = 0;

/** Largest key the registry's `uint32` can hold. Same ceiling as the selector's runtime half. */
export const ART_RUNTIME_MAX_ID = 0xffff_ffff;

const TOPIC_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * The `uint32 runtimeId` carried in `topics[1]` of a `RuntimeRegistered` log.
 *
 * Returns `null` for anything that is not one — a different event, a malformed topic, a value that
 * does not fit a `uint32`. NULL IS NOT ZERO: zero is a reserved id the registry refuses, so a
 * decoder that fell back to it would manufacture a registration at the one key that cannot have one.
 *
 * @param {{ topics?: readonly string[] }} log
 * @returns {number | null}
 */
export function runtimeIdFromRegisteredLog(log) {
  const topics = log && Array.isArray(log.topics) ? log.topics : null;
  if (topics === null || topics.length < 2) return null;
  const [topic0, topic1] = topics;
  if (typeof topic0 !== "string" || topic0.toLowerCase() !== ART_RUNTIME_REGISTERED_TOPIC0) return null;
  if (typeof topic1 !== "string" || !TOPIC_RE.test(topic1)) return null;
  const value = BigInt(topic1);
  if (value <= 0n || value > BigInt(ART_RUNTIME_MAX_ID)) return null;
  return Number(value);
}

/**
 * Reconcile a fetched log set into the registered id set, and say whether it is COMPLETE.
 *
 * `runtimeCount` is not used to derive an id and never can be. It is used as an INDEPENDENT
 * DENOMINATOR: the counter increments once per emitted event, so a log set of a different size is
 * a log set that is missing something (a truncated `eth_getLogs` range, a provider cap, a wrong
 * from-block) and must be reported as incomplete rather than served as an answer.
 *
 * AN INCOMPLETE SET IS NOT AN ABSENCE. A caller must not conclude NOT_REGISTERED from it — the
 * honest verdict is that the registry was not read.
 *
 * @param {readonly { topics?: readonly string[] }[]} logs
 * @param {{ runtimeCount?: number | bigint | null }} [expectation]
 * @returns {{
 *   ids: number[],
 *   complete: boolean,
 *   observedCount: number,
 *   expectedCount: number | null,
 *   malformedLogs: number,
 *   duplicateIds: number[],
 *   reason: string,
 * }}
 */
export function discoverRegisteredRuntimeIds(logs, expectation = {}) {
  const rows = Array.isArray(logs) ? logs : [];
  const seen = new Set();
  const duplicateIds = [];
  let malformedLogs = 0;

  for (const log of rows) {
    const id = runtimeIdFromRegisteredLog(log);
    if (id === null) {
      malformedLogs += 1;
      continue;
    }
    if (seen.has(id)) duplicateIds.push(id);
    seen.add(id);
  }

  const ids = [...seen].sort((a, b) => a - b);

  let expectedCount = null;
  if (expectation.runtimeCount !== undefined && expectation.runtimeCount !== null) {
    const n = BigInt(expectation.runtimeCount);
    expectedCount = n >= 0n && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
  }

  let complete = true;
  let reason = "";
  if (malformedLogs > 0) {
    complete = false;
    reason = `${malformedLogs} log(s) did not decode as RuntimeRegistered; the fetched set is not trustworthy as an enumeration.`;
  } else if (expectedCount === null) {
    complete = false;
    reason =
      "runtimeCount() was not supplied, so the log set has no independent denominator. A set that looks whole and a set that was truncated are indistinguishable without it.";
  } else if (ids.length !== expectedCount) {
    complete = false;
    reason = `the registry reports runtimeCount() == ${expectedCount} and the log set yields ${ids.length} distinct id(s). The counter increments once per emitted event, so this set is missing registrations — most likely a truncated eth_getLogs range.`;
  }

  return { ids, complete, observedCount: ids.length, expectedCount, malformedLogs, duplicateIds, reason };
}

/**
 * Whether a `runtimeInfo(id)` record actually names a runtime.
 *
 * THE ZERO-ADDRESS TRAP. `runtimeInfo` is a bare mapping read with no `exists` guard
 * (`ArtRuntimeRegistryV1.sol:251-253`), so it DOES NOT REVERT for an unregistered id — it returns
 * a fully-formed default record with `runtime == address(0)` and `exists == false`. A "did the
 * call resolve?" check reads that as success. Both conditions are required, and a caller that has
 * the code size should require that too: an id can exist, name an address, and that address can
 * have been emptied.
 *
 * @param {{ exists?: unknown, runtime?: unknown } | null | undefined} record
 * @returns {boolean}
 */
export function runtimeRecordNamesARuntime(record) {
  if (record === null || record === undefined || typeof record !== "object") return false;
  if (record.exists !== true) return false;
  if (typeof record.runtime !== "string") return false;
  return /^0x[0-9a-fA-F]{40}$/.test(record.runtime) && BigInt(record.runtime) !== 0n;
}
