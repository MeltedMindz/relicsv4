// SPDX-License-Identifier: MIT
// ================================================================================================
// LIVE CHAIN CAPABILITY. Every fact here is READ FROM THE CHAIN at the moment it is asked for.
//
// NOTHING IN THIS FILE CONSULTS A CHECKED-IN STATUS FIELD TO PERMIT ANYTHING. The public record
// carries `expectedLaunchAccess`, and this module reads it only to REPORT a disagreement — a chain
// whose record says PUBLIC and whose factory says PREPARED is refused, loudly, naming both. That is
// what makes `STALE_DOC_CAN_ENABLE_CHAIN=NO` a property of the code rather than a promise.
//
// THE THREE-VALUED ANSWER IS THE POINT. `UNKNOWN` is not a soft `REFUTED`. A registry that could
// not be read completely does not prove a runtime is absent; it proves nobody successfully asked.
// Both refuse a launch, and they say different things to the creator — and only one of them is a
// reason to retry. Collapsing them is how a transport failure became "this chain has no runtime
// registered", a fabricated fact about a chain nobody reached.
// ================================================================================================
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { ART_RUNTIME_REGISTRY_ABI, FACTORY_ABI } from "./abi.js";
import { getChainProfile, makeClient, type ChainProfile, type RpcSelection } from "./chains.js";
import type { Evidence, Finding } from "./contracts.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** `launchAccess()` returns the state alongside the canary bitmap; 1 is PUBLIC. */
export const LAUNCH_ACCESS = { PREPARED: 0, PUBLIC: 1 } as const;

export interface RuntimeRecord {
  readonly id: number;
  readonly runtime: Address;
  readonly codeHash: Hex;
  readonly tag: Hex;
  readonly version: number;
  readonly mode: number;
  readonly active: boolean;
  readonly exists: boolean;
  readonly label: string;
}

/**
 * A registry read AND whether it was COMPLETE. `entries` alone cannot distinguish "this chain has
 * one runtime" from "this chain has three and two reads timed out" — so the completeness flag
 * travels with the data and every consumer must consult it before concluding an ABSENCE.
 */
export interface RegistrySnapshot {
  readonly entries: ReadonlyMap<number, RuntimeRecord>;
  readonly complete: boolean;
  readonly declaredCount: number | null;
  readonly failedReads: readonly number[];
  readonly errors: readonly string[];
}

export interface ChainCapability {
  readonly chainId: number;
  readonly label: string;
  readonly explorer: string;
  readonly nativeSymbol: string;
  readonly rpcSource: RpcSelection["source"] | null;
  readonly findings: readonly Finding[];
  /** PROVEN only when every required finding is PROVEN. One UNKNOWN makes the whole answer UNKNOWN. */
  readonly launchable: Evidence;
  readonly factory: Address | null;
  readonly metadataResolver: Address | null;
  readonly artRuntimeRegistry: Address | null;
  readonly liveLaunchAccess: number | null;
  readonly expectedLaunchAccess: string | null;
  readonly registry: RegistrySnapshot | null;
  readonly gasPriceWei: bigint | null;
  readonly blockNumber: bigint | null;
}

function finding(id: string, evidence: Evidence, detail: string, unreadReason?: string): Finding {
  return unreadReason ? { id, evidence, detail, unreadReason } : { id, evidence, detail };
}

/** Highest registry key to probe. Ids are chosen by the registering Safe and may be sparse, so
 *  counting to `runtimeCount` alone can miss an entry that lives above the count. */
const MAX_PROBE_ID = 16;
const ENTRY_RETRIES = 1;

/**
 * Read the whole runtime registry, tracking every failure.
 *
 * A FAILED `runtimeInfo` IS RECORDED, NEVER SKIPPED. The production defect this mirrors was a
 * `catch { continue }`: entries that failed to read simply vanished from the map, and the caller —
 * which had no way to tell a missing entry from an absent one — reported the runtime as not
 * registered. Same for a failed `getCode`: a caught error became `codeSize = 0`, which reads as
 * "the address holds no code" rather than "we could not find out".
 */
export async function readRegistrySnapshot(client: PublicClient, registry: Address): Promise<RegistrySnapshot> {
  const errors: string[] = [];
  const failedReads: number[] = [];
  const entries = new Map<number, RuntimeRecord>();

  let declaredCount: number | null = null;
  try {
    declaredCount = Number(await client.readContract({ address: registry, abi: ART_RUNTIME_REGISTRY_ABI, functionName: "runtimeCount" }));
  } catch (err) {
    errors.push(`runtimeCount failed: ${err instanceof Error ? err.message : String(err)}`);
    // The count is the only thing that tells us how many entries SHOULD exist. Without it, no
    // number of successful entry reads can prove we saw them all.
    return { entries, complete: false, declaredCount: null, failedReads, errors };
  }

  for (let id = 1; id <= MAX_PROBE_ID; id++) {
    let record: RuntimeRecord | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= ENTRY_RETRIES; attempt++) {
      try {
        const r = (await client.readContract({ address: registry, abi: ART_RUNTIME_REGISTRY_ABI, functionName: "runtimeInfo", args: [id] })) as any;
        record = { id, runtime: getAddress(r.runtime), codeHash: r.codeHash, tag: r.tag, version: Number(r.version), mode: Number(r.mode), active: Boolean(r.active), exists: Boolean(r.exists), label: String(r.label ?? "") };
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!record) {
      failedReads.push(id);
      errors.push(`runtimeInfo(${id}) failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
      continue;
    }
    // THE ZERO-ADDRESS TRAP. `runtimeInfo` does not revert for an unregistered id; it returns a
    // full record with the zero address and `exists: false`. Treating a successful CALL as a
    // successful RESOLUTION is the bug — the record has to say so.
    if (!record.exists || record.runtime === ZERO_ADDRESS) continue;
    entries.set(id, record);
    if (declaredCount !== null && entries.size >= declaredCount) break;
  }

  const complete = failedReads.length === 0 && declaredCount !== null && entries.size >= declaredCount;
  if (!complete && failedReads.length === 0 && declaredCount !== null) {
    errors.push(`observed ${entries.size} registered entr${entries.size === 1 ? "y" : "ies"} but runtimeCount reports ${declaredCount}`);
  }
  return { entries, complete, declaredCount, failedReads, errors };
}

/**
 * Everything a chain must prove before it may be launched on. Reads only; nothing here can send a
 * transaction, and nothing here consults a document.
 */
export async function getChainCapability(chainId: number, opts?: { rpcUrl?: string; requiredRuntimeTag?: string }): Promise<ChainCapability> {
  const profile = getChainProfile(chainId);
  const findings: Finding[] = [];

  const base = {
    chainId,
    label: profile?.label ?? String(chainId),
    explorer: profile?.explorer ?? "",
    nativeSymbol: profile?.nativeSymbol ?? "",
    expectedLaunchAccess: profile?.expectedLaunchAccess ?? null,
  };

  if (!profile) {
    findings.push(finding("chain.known", "REFUTED", `chain ${chainId} is not in the public deployment record`));
    return { ...base, rpcSource: null, findings, launchable: "REFUTED", factory: null, metadataResolver: null, artRuntimeRegistry: null, liveLaunchAccess: null, registry: null, gasPriceWei: null, blockNumber: null };
  }

  const made = makeClient(profile, opts?.rpcUrl);
  if (!made) {
    findings.push(finding("rpc.configured", "UNKNOWN", `no RPC endpoint for chain ${chainId}`, `set ${profile.rpcEnvKey}`));
    return { ...base, rpcSource: null, findings, launchable: "UNKNOWN", factory: null, metadataResolver: null, artRuntimeRegistry: null, liveLaunchAccess: null, registry: null, gasPriceWei: null, blockNumber: null };
  }
  const { client, rpc } = made;
  if (rpc.source === "PUBLIC_FALLBACK") {
    findings.push(finding("rpc.credentialled", "UNKNOWN", `reading through the public fallback endpoint because ${profile.rpcEnvKey} is unset`, "public endpoints rate-limit; a partial read here is an UNKNOWN, not a refusal"));
  }

  // ---- 1. the endpoint really is this chain --------------------------------------------------
  let blockNumber: bigint | null = null;
  try {
    const live = await client.getChainId();
    if (live !== chainId) {
      findings.push(finding("rpc.chainId", "REFUTED", `endpoint reports chain ${live}, expected ${chainId}`));
      return { ...base, rpcSource: rpc.source, findings, launchable: "REFUTED", factory: null, metadataResolver: null, artRuntimeRegistry: null, liveLaunchAccess: null, registry: null, gasPriceWei: null, blockNumber: null };
    }
    findings.push(finding("rpc.chainId", "PROVEN", `endpoint reports chain ${live}`));
    blockNumber = await client.getBlockNumber();
  } catch (err) {
    findings.push(finding("rpc.reachable", "UNKNOWN", "the endpoint did not answer", err instanceof Error ? err.message : String(err)));
    return { ...base, rpcSource: rpc.source, findings, launchable: "UNKNOWN", factory: null, metadataResolver: null, artRuntimeRegistry: null, liveLaunchAccess: null, registry: null, gasPriceWei: null, blockNumber: null };
  }

  const factory = (profile.contracts.launchpadFactory ?? null) as Address | null;
  const metadataResolver = (profile.contracts.metadataResolver ?? null) as Address | null;
  const artRuntimeRegistry = (profile.contracts.artRuntimeRegistry ?? null) as Address | null;

  // ---- 2. factory holds code -----------------------------------------------------------------
  if (!factory) {
    findings.push(finding("factory.address", "REFUTED", "the public record names no RC6 factory on this chain"));
  } else {
    const code = await codeAt(client, factory, findings, "factory.code", "the factory address");
    if (code === "PROVEN") {
      // ---- 3/4. generation identity and LIVE launch access ---------------------------------
      try {
        const impl = (await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "currentImplementation" })) as Address;
        const expectedImpl = profile.contracts.launchpadFactoryImplementation;
        if (expectedImpl && getAddress(impl) !== getAddress(expectedImpl as Address)) {
          // NOT a refusal on its own. The proxy is the thing a launch is built against and the
          // implementation under it is Safe-replaceable BY DESIGN, so an unexpected implementation
          // means the record is behind, not that the launch is unsafe. Reported, never fatal.
          findings.push(finding("factory.implementation", "PROVEN", `implementation ${impl} differs from the record's ${expectedImpl} — the proxy is pinned and its implementation is replaceable by design`));
        } else {
          findings.push(finding("factory.implementation", "PROVEN", `implementation ${impl}`));
        }
      } catch (err) {
        findings.push(finding("factory.implementation", "UNKNOWN", "could not read currentImplementation()", err instanceof Error ? err.message : String(err)));
      }

      try {
        const raw = (await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "launchAccess" })) as unknown;
        const state = Number(Array.isArray(raw) ? raw[0] : (raw as any)?.state ?? raw);
        if (state === LAUNCH_ACCESS.PUBLIC) {
          findings.push(finding("factory.launchAccess", "PROVEN", "launchAccess() == 1 (PUBLIC): permissionless launches are admitted"));
        } else {
          findings.push(finding("factory.launchAccess", "REFUTED", `launchAccess() == ${state} — this factory does not admit a permissionless launch` + (profile.expectedLaunchAccess === "PUBLIC" ? `. THE CHECKED-IN RECORD SAYS "${profile.expectedLaunchAccess}" AND THE CHAIN DISAGREES; the chain wins.` : "")));
        }
      } catch (err) {
        // RC5's factory answers `launchAccessState()`; asking RC6's question of an RC5 address
        // returns an empty revert, which reads exactly like "not open". Name the generation.
        findings.push(finding("factory.launchAccess", "UNKNOWN", "launchAccess() did not answer — if this address is an RC5 factory its getter is launchAccessState() and this is the wrong question, not a closed launchpad", err instanceof Error ? err.message : String(err)));
      }
    }
  }

  // ---- 5. metadata resolver ------------------------------------------------------------------
  if (!metadataResolver) findings.push(finding("metadataResolver.address", "REFUTED", "the public record names no metadata resolver on this chain"));
  else await codeAt(client, metadataResolver, findings, "metadataResolver.code", "the metadata resolver");

  // ---- 6. runtime registry, read COMPLETELY --------------------------------------------------
  let registry: RegistrySnapshot | null = null;
  if (!artRuntimeRegistry) {
    findings.push(finding("artRuntimeRegistry.address", "UNKNOWN", "the public record names no art runtime registry on this chain", "without the registry address no runtime claim can be established either way"));
  } else {
    registry = await readRegistrySnapshot(client, artRuntimeRegistry);
    if (!registry.complete) {
      findings.push(finding("artRuntimeRegistry.complete", "UNKNOWN", "the runtime registry could not be read completely", registry.errors.join("; ") || "incomplete read"));
    } else {
      findings.push(finding("artRuntimeRegistry.complete", "PROVEN", `read ${registry.entries.size} registered runtime(s) against a declared count of ${registry.declaredCount}`));
      const tag = opts?.requiredRuntimeTag;
      if (tag) {
        const match = [...registry.entries.values()].find((r) => r.label === tag || r.tag === tag);
        if (!match) findings.push(finding("runtime.required", "REFUTED", `no runtime tagged "${tag}" is registered on this chain (the registry read was complete, so this is a real absence)`));
        else if (!match.active) findings.push(finding("runtime.required", "REFUTED", `runtime "${tag}" is registered at id ${match.id} but is not active`));
        else {
          const rc = await codeAt(client, match.runtime, findings, "runtime.code", `runtime "${tag}"`);
          if (rc === "PROVEN") findings.push(finding("runtime.required", "PROVEN", `runtime "${tag}" active at id ${match.id} (${match.runtime})`));
        }
      }
    }
  }

  let gasPriceWei: bigint | null = null;
  try {
    gasPriceWei = await client.getGasPrice();
  } catch {
    findings.push(finding("gas.price", "UNKNOWN", "gas price could not be read"));
  }

  // ONE UNKNOWN MAKES THE WHOLE ANSWER UNKNOWN, and one REFUTED makes it REFUTED. Refusal
  // dominates: a chain that is proven closed is closed even if something else was unreadable.
  const launchable: Evidence = findings.some((f) => f.evidence === "REFUTED")
    ? "REFUTED"
    : findings.some((f) => f.evidence === "UNKNOWN")
      ? "UNKNOWN"
      : "PROVEN";

  let liveLaunchAccess: number | null = null;
  const accessFinding = findings.find((f) => f.id === "factory.launchAccess");
  if (accessFinding?.evidence === "PROVEN") liveLaunchAccess = LAUNCH_ACCESS.PUBLIC;
  else if (accessFinding?.evidence === "REFUTED") {
    const m = accessFinding.detail.match(/launchAccess\(\) == (\d+)/);
    liveLaunchAccess = m ? Number(m[1]) : null;
  }

  return { ...base, rpcSource: rpc.source, findings, launchable, factory, metadataResolver, artRuntimeRegistry, liveLaunchAccess, registry, gasPriceWei, blockNumber };
}

/**
 * `eth_getCode`, with a FAILED read reported as UNKNOWN rather than as an empty result.
 *
 * The distinction is the whole point: `catch { size = 0 }` says "this address holds no code", which
 * is a claim about the chain. A transport error is a claim about us.
 */
async function codeAt(client: PublicClient, address: Address, findings: Finding[], id: string, what: string): Promise<Evidence> {
  try {
    const code = await client.getCode({ address });
    if (!code || code === "0x") {
      findings.push(finding(id, "REFUTED", `${what} (${address}) holds no code on this chain`));
      return "REFUTED";
    }
    findings.push(finding(id, "PROVEN", `${what} holds ${(code.length - 2) / 2} bytes of code`));
    return "PROVEN";
  } catch (err) {
    findings.push(finding(id, "UNKNOWN", `could not read code at ${what}`, err instanceof Error ? err.message : String(err)));
    return "UNKNOWN";
  }
}
