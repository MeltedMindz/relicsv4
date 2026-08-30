// SPDX-License-Identifier: MIT
// ================================================================================================
// THE RENDER PATH — `eth_call IArtRuntimeV1.renderV1` on the DEPLOYED runtime.
//
// NOTHING HERE DRAWS ANYTHING. There is no JavaScript reimplementation of either Wave-1 runtime in
// this repository and there must never be one: a local approximation of what the art "looks like"
// is the one picture in a review that the reviewer cannot check against the chain, and a review
// conducted on it would be a review of the approximation. Every image this package puts in front
// of a reviewer is a string a deployed contract returned.
//
// THIS MODULE CARRIES NO ADDRESS BOOK, ON PURPOSE. The chain id, the RPC endpoint and the runtime
// registry address are INPUTS. `packages/template-catalog` refuses to carry a chain fact for the
// same reason and states it in its own header: which runtimes a chain carries changes without this
// file changing. The caller resolves them (the CLI does it through `@relics/launch-sdk`) and hands
// them in, so a stale constant here cannot decide which contract answers for a review.
//
// THE ZERO-ADDRESS TRAP IS THE FAILURE THIS FILE IS SHAPED AROUND. `runtimeInfo(id)` DOES NOT
// REVERT for an unregistered id — it returns a full record with the zero address and
// `exists: false`. A "did it resolve?" check reads that as success. So resolution requires: a
// non-zero address, WITH CODE, `active`, `exists`, and a TAG equal to
// `keccak256("V4ART.RUNTIME.<ID>")`. Identity is matched on the tag and never on the id, because
// registry ids are per-chain and the numbering is not a property of the runtime.
//
// AN UNREAD CHAIN IS `UNKNOWN`, NEVER "ABSENT". Every refusal in this file names a retry rather
// than a fact, because the difference between "this runtime is not registered here" and "nobody
// answered" is the difference between a finding and a network hiccup.
// ================================================================================================
import { createHash } from "node:crypto";
import { decodeFunctionResult, encodeFunctionData, keccak256, stringToHex, concat, pad, toHex } from "viem";

import { marketState } from "./market.js";
import { runtimeFor } from "./runtimes.js";

const ART_STATE_COMPONENTS = [
  { name: "normalizedTick", type: "int24" },
  { name: "athNormalizedTick", type: "int24" },
  { name: "drawdownTicks", type: "uint32" },
  { name: "maxDrawdownTicks", type: "uint32" },
  { name: "recoveryTicks", type: "uint32" },
  { name: "volatilityTickMovement", type: "uint64" },
  { name: "volumeTier", type: "uint32" },
  { name: "epoch", type: "uint32" },
  { name: "stressTier", type: "uint32" },
  { name: "organicBuyVolume", type: "uint256" },
  { name: "organicSellVolume", type: "uint256" },
  { name: "organicQuoteVolume", type: "uint256" },
  { name: "organicProjectVolume", type: "uint128" },
  { name: "netQuoteFlow", type: "int256" },
  { name: "trackedLiquidityUnits", type: "uint128" },
  { name: "observedActiveLiquidity", type: "uint128" },
  { name: "observationSequence", type: "uint64" },
  { name: "fragmentation", type: "uint32" },
  { name: "quoteDecimals", type: "uint8" },
  { name: "historyCommitment", type: "bytes32" },
  { name: "schemaVersion", type: "uint8" },
  { name: "complete", type: "bool" },
];

const ART_REQUEST = {
  name: "req",
  type: "tuple",
  components: [
    { name: "projectId", type: "uint256" },
    { name: "tokenId", type: "uint256" },
    { name: "dna", type: "bytes32" },
    { name: "bornBlock", type: "uint64" },
    { name: "awakenCount", type: "uint32" },
    { name: "artConfig", type: "bytes" },
    { name: "state", type: "tuple", components: ART_STATE_COMPONENTS },
  ],
};

export const RUNTIME_ABI = [
  {
    type: "function",
    name: "renderV1",
    stateMutability: "view",
    inputs: [ART_REQUEST],
    outputs: [{
      type: "tuple",
      components: [
        { name: "ok", type: "bool" },
        { name: "failure", type: "uint8" },
        { name: "image", type: "string" },
        { name: "animationUrl", type: "string" },
        { name: "traitsJson", type: "string" },
        { name: "visualTraitConfigHash", type: "bytes32" },
        { name: "metadataTraitConfigHash", type: "bytes32" },
        { name: "configCommitment", type: "bytes32" },
        { name: "title", type: "string" },
      ],
    }],
  },
  {
    type: "function",
    name: "validateConfigV1",
    stateMutability: "view",
    inputs: [{ name: "config", type: "bytes" }],
    outputs: [{ name: "code", type: "uint8" }, { name: "traitSchemaHash", type: "bytes32" }],
  },
  { type: "function", name: "runtimeTag", stateMutability: "pure", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "runtimeMode", stateMutability: "pure", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "runtimeVersion", stateMutability: "pure", inputs: [], outputs: [{ type: "uint16" }] },
];

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "runtimeInfo",
    stateMutability: "view",
    inputs: [{ name: "runtimeId", type: "uint32" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "runtime", type: "address" },
        { name: "codeHash", type: "bytes32" },
        { name: "tag", type: "bytes32" },
        { name: "version", type: "uint16" },
        { name: "mode", type: "uint8" },
        { name: "active", type: "bool" },
        { name: "exists", type: "bool" },
        { name: "label", type: "string" },
      ],
    }],
  },
  { type: "function", name: "runtimeCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
];

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * How far a registry sweep will walk before it gives up and says UNKNOWN.
 *
 * A ceiling exists so an unreachable endpoint cannot turn into an unbounded call loop; it is
 * generous against a registry that holds single digits of runtimes, and a sweep that hits it
 * without accounting for `runtimeCount()` rows REFUSES rather than concluding.
 */
const MAX_REGISTRY_ID_SCAN = 64;

/** The DNA the published review sheets were drawn with: `keccak256(abi.encodePacked("relics-review", seed))`. */
export function reviewDna(seed) {
  return keccak256(concat([stringToHex("relics-review"), pad(toHex(BigInt(seed)), { size: 32 })]));
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** `data:image/svg+xml;base64,...` -> the document itself. */
export function decodeImageDataUri(image) {
  const s = String(image);
  const comma = s.indexOf(",");
  if (comma === -1) throw new Error("render: the runtime returned something that is not a data URI");
  const head = s.slice(0, comma);
  const body = s.slice(comma + 1);
  // A REVIEW THAT MEASURES THE BASE64 TEXT MEASURES NOTHING, and this project has already produced
  // one set of confidently wrong numbers that way — every value came back zero because the
  // measurement ran over the encoding rather than over the document. Decoding is not optional and
  // it is not a convenience: it is the difference between looking at art and looking at an alphabet.
  const svg = head.includes(";base64") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body);
  if (!svg.trimStart().startsWith("<svg")) {
    throw new Error("render: the decoded image does not start with <svg — this is the base64-text trap, not a render failure");
  }
  return svg;
}

class RpcError extends Error {
  constructor(message, { retryable }) {
    super(message);
    this.retryable = retryable;
  }
}

/**
 * One `eth_call`, with a bounded retry for the two failures that are about the endpoint rather
 * than about the contract: a rate limit and a transport hiccup. A revert is NOT retried — it is
 * an answer.
 */
async function ethCall(rpcUrl, to, data, { attempts = 5, backoffMs = 400 } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      });
      const json = await res.json();
      if (json.error) {
        const msg = String(json.error.message ?? "");
        const retryable = /rate limit|too many requests|timeout|capacity|busy|429/i.test(msg);
        throw new RpcError(`eth_call failed: ${msg}`, { retryable });
      }
      return json.result;
    } catch (err) {
      last = err;
      const retryable = err instanceof RpcError ? err.retryable : true;
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** i));
    }
  }
  throw last ?? new Error("eth_call failed for a reason nothing recorded");
}

async function ethGetCode(rpcUrl, address) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`eth_getCode failed: ${json.error.message}`);
  return json.result ?? "0x";
}

/**
 * Resolve one runtime's live address on one chain, or REFUSE with a reason that names a retry.
 *
 * Walks the registry by id and matches on TAG. `expectedRegistryId` is tried first because it is
 * usually right and a single call is cheaper than `runtimeCount` calls — but a miss there falls
 * through to the sweep rather than concluding anything, because an id is not an identity.
 */
export async function resolveRuntime({ rpcUrl, registry, runtimeId }) {
  const rt = runtimeFor(runtimeId);
  const wantTag = keccak256(stringToHex(rt.tagPreimage));

  let count = 0;
  try {
    const raw = await ethCall(rpcUrl, registry, encodeFunctionData({ abi: REGISTRY_ABI, functionName: "runtimeCount" }));
    count = Number(decodeFunctionResult({ abi: REGISTRY_ABI, functionName: "runtimeCount", data: raw }));
  } catch (err) {
    return { ok: false, state: "UNKNOWN", detail: `the runtime registry at ${registry} could not be read: ${err.message}. That is an unread chain, not a chain without this runtime — retry before concluding anything.` };
  }
  if (count < 1) {
    return { ok: false, state: "UNKNOWN", detail: `runtimeCount() answered ${count} on this chain, which is not a number a live registry returns. Treat it as an unread registry.` };
  }

  // THE ID SPACE IS NOT `1..runtimeCount` AND ASSUMING IT IS COSTS YOU A RUNTIME.
  //
  // Measured 2026-08-30 on Ethereum: `runtimeCount()` answers 3 while the registered ids are
  // 1, 3 and 4 — id 2 is a hole. A sweep of `1..count` reads rows 1, 2, 3, never asks about 4,
  // and concludes `NOT_REGISTERED` for VECTOR_COMPOSITION_V1, which is live at id 4 on all three
  // chains. That refusal looks exactly like a finding and it is a bug in the sweep.
  //
  // So the sweep walks a bounded id space and STOPS when it has seen `count` rows that exist. If
  // it reaches the ceiling without accounting for all of them, the answer is UNKNOWN rather than
  // NOT_REGISTERED, because the rows it never asked about are exactly the ones that could have
  // carried the tag.
  const order = [rt.expectedRegistryId, ...Array.from({ length: MAX_REGISTRY_ID_SCAN }, (_, i) => i + 1).filter((i) => i !== rt.expectedRegistryId)];
  const seen = [];
  let existing = 0;
  for (const id of order) {
    if (existing >= count && seen.length > 0) break;
    let info;
    try {
      const raw = await ethCall(rpcUrl, registry, encodeFunctionData({ abi: REGISTRY_ABI, functionName: "runtimeInfo", args: [id] }));
      info = decodeFunctionResult({ abi: REGISTRY_ABI, functionName: "runtimeInfo", data: raw });
    } catch (err) {
      // A FAILED READ IS RECORDED, NEVER SKIPPED. Skipping it would let a partially-read registry
      // answer "not registered" on the strength of the ids that happened to come back.
      seen.push({ id, read: "FAILED", detail: err.message });
      continue;
    }
    // THE ZERO-ADDRESS TRAP: this call does not revert for an unregistered id, it answers a
    // well-formed record with `exists: false`. A hole in the numbering is silence, not an answer.
    if (info.exists !== true) { seen.push({ id, read: "OK", exists: false }); continue; }
    existing++;
    seen.push({ id, read: "OK", tag: info.tag, exists: info.exists, active: info.active, address: info.runtime });
    if (info.tag !== wantTag) continue;
    if (info.active !== true || info.runtime === ZERO) {
      return { ok: false, state: "INACTIVE", detail: `${runtimeId} resolves at registry id ${id} but reads active=${info.active} address=${info.runtime}. An inactive runtime is not a renderable one.`, considered: seen };
    }
    const code = await ethGetCode(rpcUrl, info.runtime);
    if (!code || code === "0x") {
      return { ok: false, state: "NO_CODE", detail: `${runtimeId} resolves to ${info.runtime} and that address has no code. A registry row is not a contract.`, considered: seen };
    }
    return {
      ok: true, runtimeId, registryId: id, address: info.runtime, tag: info.tag,
      mode: Number(info.mode), version: Number(info.version), label: info.label,
      codeBytes: (code.length - 2) / 2,
      // Resolution succeeding does not make a partial sweep complete; say so rather than imply it.
      partialSweep: seen.some((s) => s.read === "FAILED"),
      considered: seen,
    };
  }

  if (existing < count) {
    return {
      ok: false,
      state: "UNKNOWN",
      detail: `the registry reports ${count} runtimes and this sweep accounted for only ${existing} of them within ids 1..${MAX_REGISTRY_ID_SCAN}. The rows it never reached are exactly the ones that could carry ${runtimeId}'s tag, so this is an unread registry rather than an absent runtime.`,
      considered: seen,
    };
  }

  const anyFailed = seen.some((s) => s.read === "FAILED");
  return {
    ok: false,
    state: anyFailed ? "UNKNOWN" : "NOT_REGISTERED",
    detail: anyFailed
      ? `${runtimeId} was not found among ${count} registry rows, but ${seen.filter((s) => s.read === "FAILED").length} of those rows could not be read. An unread row is UNKNOWN and this is therefore not a finding that the runtime is absent.`
      : `${runtimeId} is not registered on this chain: all ${count} rows were read and none carries its tag.`,
    considered: seen,
  };
}

/**
 * A renderer bound to one chain and one resolved runtime address.
 *
 * CACHED BY (address, config, seed, state). The loop re-renders the same neutral frames across
 * rounds whenever the author changed something that does not affect them, and a review that costs
 * 300 chain calls per round is a review that gets skipped.
 */
export function createRenderer({ rpcUrl, chainId, resolved, concurrency = 4 }) {
  if (!resolved?.ok) throw new Error("createRenderer: hand me a resolution that succeeded, or refuse upstream");
  const cache = new Map();

  const key = (config, seed, state) => `${resolved.address}|${sha256(config)}|${seed}|${state}`;

  async function renderOne(config, seed, state) {
    const k = key(config, seed, state);
    const hit = cache.get(k);
    if (hit) return hit;
    const data = encodeFunctionData({
      abi: RUNTIME_ABI,
      functionName: "renderV1",
      args: [{
        projectId: 1n,
        tokenId: BigInt(seed),
        dna: reviewDna(seed),
        bornBlock: 1n,
        awakenCount: 1,
        artConfig: config,
        state: marketState(state),
      }],
    });
    const raw = await ethCall(rpcUrl, resolved.address, data);
    const out = decodeFunctionResult({ abi: RUNTIME_ABI, functionName: "renderV1", data: raw });
    const record = {
      seed, state,
      ok: out.ok,
      failure: Number(out.failure),
      image: out.image,
      svg: out.ok ? decodeImageDataUri(out.image) : "",
      traitsJson: out.traitsJson,
      configCommitment: out.configCommitment,
      title: out.title,
      imageSha256: sha256(String(out.image)),
      svgSha256: out.ok ? sha256(decodeImageDataUri(out.image)) : null,
    };
    cache.set(k, record);
    return record;
  }

  /** `(seed, state)` pairs, rendered with bounded concurrency, in the order asked for. */
  async function renderMany(config, cells) {
    const out = new Array(cells.length);
    let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= cells.length) return;
        out[i] = await renderOne(config, cells[i].seed, cells[i].state);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, cells.length) }, worker));
    return out;
  }

  /**
   * The runtime's OWN verdict on the configuration bytes.
   *
   * This is the authority. The JS codec produces bytes and names them back; it does not validate,
   * and every claim about legality in this package comes from here. `code === 0` is legal.
   */
  async function validateConfig(config) {
    const data = encodeFunctionData({ abi: RUNTIME_ABI, functionName: "validateConfigV1", args: [config] });
    try {
      const raw = await ethCall(rpcUrl, resolved.address, data);
      const [code, traitSchemaHash] = decodeFunctionResult({ abi: RUNTIME_ABI, functionName: "validateConfigV1", data: raw });
      return { read: true, legal: Number(code) === 0, code: Number(code), traitSchemaHash };
    } catch (err) {
      return { read: false, legal: null, code: null, detail: `validateConfigV1 could not be read: ${err.message}. An unread validator is UNKNOWN and must never be reported as legal.` };
    }
  }

  /**
   * The worst `renderV1` cost over a small, fixed probe of cells.
   *
   * MEASURED, NOT ESTIMATED FROM THE CONFIG. Both runtimes bound their own configurations against
   * a portable 10,000,000-gas `eth_call` budget, and their validators are calibrated against the
   * WORST case the sensors could ever produce. A configuration that renders at 18M is legal
   * nowhere useful: it draws on a developer's node and shows nothing in a marketplace, and the art
   * binding is one-shot so no transaction repairs it.
   *
   * AN UNREAD ESTIMATE IS `read: false`, never a zero and never a pass. Some endpoints refuse
   * `eth_estimateGas` on a `view` call; that is a fact about the endpoint, and the caller must
   * treat it as an unmeasured budget rather than a met one.
   */
  async function estimateWorstRenderGas(config, cells = [{ seed: 101, state: "stress" }, { seed: 138, state: "recovery" }, { seed: 175, state: "neutral" }, { seed: 212, state: "stress" }]) {
    let worst = 0;
    let at = null;
    for (const c of cells) {
      const data = encodeFunctionData({
        abi: RUNTIME_ABI,
        functionName: "renderV1",
        args: [{ projectId: 1n, tokenId: BigInt(c.seed), dna: reviewDna(c.seed), bornBlock: 1n, awakenCount: 1, artConfig: config, state: marketState(c.state) }],
      });
      let json;
      try {
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_estimateGas", params: [{ to: resolved.address, data }] }),
        });
        json = await res.json();
      } catch (err) {
        return { read: false, detail: `eth_estimateGas is unavailable on this endpoint: ${err.message}` };
      }
      if (json.error) return { read: false, detail: `eth_estimateGas refused: ${json.error.message}` };
      const g = Number(BigInt(json.result));
      if (g > worst) { worst = g; at = c; }
    }
    return { read: true, worst, cell: at };
  }

  return { chainId, address: resolved.address, registryId: resolved.registryId, renderOne, renderMany, validateConfig, estimateWorstRenderGas, cacheSize: () => cache.size };
}
