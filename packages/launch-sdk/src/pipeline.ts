// SPDX-License-Identifier: MIT
// ================================================================================================
// PREPARE -> PREDICT -> SIMULATE -> BUILD.
//
// Each stage produces a hash that the next stage carries, and the LAST stage's hash is what the
// signer independently re-checks. That chain is what makes "the thing that was simulated is the
// thing that gets signed" a property rather than a hope: a bundle edited after simulation, a chain
// swapped after prepare, or a recipient changed after build all break a hash that something
// downstream is holding.
//
// NO STAGE FABRICATES A CHAIN FACT. `predict` asks the deployed factory and cross-checks the answer
// against the vendored off-chain derivation; `simulate` is a real `eth_call` and returns the
// factory's own decoded result or the decoded revert; neither ever returns a plausible zero.
// ================================================================================================
import { encodeFunctionData, getAddress, keccak256, toFunctionSelector, BaseError, ContractFunctionRevertedError, type Abi, type Address, type Hex, type PublicClient } from "viem";
import { FACTORY_ABI, rc6Abi } from "./abi.js";
import { assertAbiMatchesLaunchParams } from "./vendor/launchCalldata.js";
import { launchParamsAsTuple, type LaunchParams, type LaunchResult, type PoolKey } from "./vendor/types.js";
import { buildLaunchParams, type CreatorInput } from "./vendor/params.js";
import { predictAll } from "./vendor/predict.js";
import type { SigningRequest } from "./contracts.js";

const FACTORY_LAUNCH_SELECTOR = toFunctionSelector((FACTORY_ABI() as any).find((e: any) => e.type === "function" && e.name === "launch"));

/** The one selector this system's signer is ever permitted to sign. */
export function launchSelector(): Hex {
  return FACTORY_LAUNCH_SELECTOR as Hex;
}

// ------------------------------------------------------------------------------------------------
// PREPARE
// ------------------------------------------------------------------------------------------------

export interface PrepareResult {
  readonly params: LaunchParams;
  readonly prepareHash: Hex;
  readonly chainId: number;
  readonly factory: Address;
}

/**
 * Build the canonical `LaunchParams` for one launch.
 *
 * THE BUILDER IS THE VENDORED CANONICAL ONE. `buildLaunchParams` is `launchpad/sdk/src/params.ts`
 * byte for byte, so the three deliberate asymmetries it encodes are inherited rather than
 * reproduced: `burnPolicy` and `backingUnitsPerArtwork` default because NONE and full parity are
 * real things a creator means by silence, and `antiSnipeMode` does NOT default because the
 * on-chain zero is `UNSPECIFIED` and the factory refuses it. A reimplementation reading those
 * comments would very plausibly have "tidied" the third into a default.
 */
export function prepare(input: CreatorInput, salts: { tokenSalt: Hex; hookSalt: Hex }, chainId: number, factory: Address): PrepareResult {
  const params = buildLaunchParams(input, salts);
  return { params, prepareHash: hashParams(params, chainId, factory), chainId, factory };
}

/**
 * The identity of a prepared launch: the params, the chain and the target, together.
 *
 * THE CHAIN AND THE FACTORY ARE PART OF IT ON PURPOSE. Identical params sent to a different chain
 * are a different launch — different pool, different quote, different everything — so a hash over
 * the params alone would let a chain swap slip through every downstream check unnoticed.
 */
export function hashParams(params: LaunchParams, chainId: number, factory: Address): Hex {
  const tuple = launchParamsAsTuple(params);
  const canonical = JSON.stringify({ chainId, factory: getAddress(factory), params: tuple }, (_k, v) => (typeof v === "bigint" ? `${v}` : v));
  return keccak256(Buffer.from(canonical, "utf8") as unknown as Hex);
}

// ------------------------------------------------------------------------------------------------
// PREDICT
// ------------------------------------------------------------------------------------------------

export interface PredictResult {
  readonly projectToken: Address;
  readonly projectCollection: Address;
  readonly artHook: Address;
  readonly poolId: Hex;
  readonly source: "onchain:factory.predict";
  /** The vendored off-chain derivation's independent answer, when it could be computed. */
  readonly offchainCrossCheck: { agreed: boolean; detail: string } | null;
}

/**
 * Ask the DEPLOYED FACTORY where this launch's contracts will land, then cross-check.
 *
 * THE CONTRACT IS THE AUTHORITY AND THE LOCAL DERIVATION IS THE CHECK, never the other way round.
 * The vendored `predict.ts` is a byte-exact transliteration of Solady's LibClone assembly, and its
 * own header says it: a mismatch means the local file is wrong, not the contract. Running both and
 * refusing on disagreement catches the case where the factory's implementation moved under the
 * proxy and the local math is describing a generation that is no longer deployed.
 */
export async function predict(client: PublicClient, factory: Address, params: LaunchParams, launcher: Address): Promise<PredictResult> {
  const [projectToken, projectCollection, artHook, poolId] = (await client.readContract({
    address: factory,
    abi: FACTORY_ABI(),
    functionName: "predict",
    args: [launchParamsAsTuple(params), launcher],
  })) as [Address, Address, Address, Hex];

  // ---- THE INDEPENDENT CROSS-CHECK, ACTUALLY RUN ------------------------------------------------
  //
  // This block used to set `agreed: true` unconditionally inside a `try` that could not throw, with
  // a comment claiming an unrun check must never read as a passed one — while doing exactly that.
  // The hook IS derivable: `hookInitCodeHashes()` supplies the one input the public record lacks,
  // and the two namespacing layers are vendored. So the hook address is now re-derived locally from
  // the factory's own init-code hash and compared with what the contract returned.
  //
  // The TOKEN and COLLECTION are NOT derivable here — they need the component implementation
  // addresses, which this public SDK genuinely does not carry — and that is reported as
  // NOT_DERIVABLE rather than as agreement. A partial check that says which part it covered is
  // worth something; one that claims to have covered everything is worth less than nothing.
  let offchainCrossCheck: PredictResult["offchainCrossCheck"] = null;
  try {
    const { hookLaneFor, mineHookSalt } = await import("./hookSalt.js");
    const lane = await hookLaneFor(client, factory);
    const derived = await mineHookSalt({ deployer: lane.deployer, caller: factory, launcher, initCodeHash: lane.initCodeHash, startAt: Number(BigInt(params.hookSalt)), maxAttempts: 1 });
    const agreed = getAddress(derived.hookAddress) === getAddress(artHook);
    offchainCrossCheck = {
      agreed,
      detail: agreed
        ? `the hook address was independently re-derived from the factory's own hookInitCodeHashes() and matches what predict() returned (${artHook}). The project token and collection are NOT derivable from the public record and were not cross-checked.`
        : `MISMATCH: the contract predicts the hook at ${artHook} and the local derivation gives ${derived.hookAddress}. Do not launch on this — one of the two is describing a generation that is not deployed.`,
    };
  } catch (err) {
    offchainCrossCheck = { agreed: false, detail: `the off-chain cross-check could not be run: ${err instanceof Error ? err.message : String(err)}. This is UNKNOWN, not agreement.` };
  }

  return { projectToken: getAddress(projectToken), projectCollection: getAddress(projectCollection), artHook: getAddress(artHook), poolId, source: "onchain:factory.predict", offchainCrossCheck };
}

// ------------------------------------------------------------------------------------------------
// CALLDATA
// ------------------------------------------------------------------------------------------------

/**
 * `launch(params)` calldata, built through the vendored positional-ABI refusal.
 *
 * `assertAbiMatchesLaunchParams` runs FIRST and throws on any difference — a missing field, an
 * extra one, or the same fields in a different order. That refusal is the reason this system can
 * claim a 19-field tuple: viem would otherwise encode a 15-field one silently.
 */
export function encodeLaunch(params: LaunchParams, abi: Abi = FACTORY_ABI()): { data: Hex; dataHash: Hex } {
  assertAbiMatchesLaunchParams(abi, "the public SDK's committed RC6 LaunchpadFactoryV1 ABI");
  const data = encodeFunctionData({ abi, functionName: "launch", args: [launchParamsAsTuple(params)] });
  return { data, dataHash: keccak256(data) };
}

// ------------------------------------------------------------------------------------------------
// SIMULATE
// ------------------------------------------------------------------------------------------------

export interface SimulateResult {
  readonly ok: boolean;
  readonly chainId: number;
  readonly blockNumber: bigint;
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly dataHash: Hex;
  readonly gasEstimate: bigint | null;
  readonly revert: string | null;
  readonly predictedResult: LaunchResult | null;
}

/**
 * A real `eth_call` dry-run of the EXACT transaction that will be signed.
 *
 * `dataHash` is recorded so a later stage can prove the bytes did not move between simulation and
 * signature. Simulating one calldata and signing another is the failure this field exists to make
 * impossible to do quietly.
 */
export async function simulate(client: PublicClient, req: { from: Address; to: Address; value: bigint; data: Hex; params: LaunchParams }): Promise<SimulateResult> {
  const chainId = await client.getChainId();
  const blockNumber = await client.getBlockNumber();
  const dataHash = keccak256(req.data);
  try {
    const { result } = await client.simulateContract({
      address: req.to,
      abi: FACTORY_ABI(),
      functionName: "launch",
      args: [launchParamsAsTuple(req.params)],
      account: req.from,
      value: req.value,
    });
    const r = result as unknown as LaunchResult;
    let gasEstimate: bigint | null = null;
    try {
      gasEstimate = await client.estimateContractGas({ address: req.to, abi: FACTORY_ABI(), functionName: "launch", args: [launchParamsAsTuple(req.params)], account: req.from, value: req.value });
    } catch {
      // A gas estimate that could not be produced is null, never a guess. A fabricated number here
      // would flow straight into the signer's gas ceiling check and defeat it.
    }
    return { ok: true, chainId, blockNumber, from: req.from, to: req.to, value: req.value, dataHash, gasEstimate, revert: null, predictedResult: r };
  } catch (err) {
    return { ok: false, chainId, blockNumber, from: req.from, to: req.to, value: req.value, dataHash, gasEstimate: null, revert: decodeRevert(err), predictedResult: null };
  }
}

/**
 * Every error the RC6 deployment can revert with, gathered from ALL committed artifacts.
 *
 * A LAUNCH REVERTS FROM MORE THAN ONE CONTRACT. Decoding against the factory's ABI alone reported
 * "unknown error" for a revert that was actually `BadHookAddress()` raised by the ART HOOK — the
 * single most likely first failure a creator will hit, because it is what an unmined hook salt
 * produces. Naming the error is the difference between "mine a hook salt" and "something went
 * wrong"; viem cannot decode what the ABI it is handed does not describe.
 */
function allRc6Errors(): Abi {
  const names = ["LaunchpadFactoryV1", "ArtHookRc6", "ProjectCollectionV1", "ProjectTokenV1", "MetadataResolverRc6", "ProjectRegistryV1"];
  const out: unknown[] = [];
  for (const n of names) {
    try {
      for (const e of rc6Abi(n) as unknown as { type: string }[]) if (e.type === "error") out.push(e);
    } catch {
      // An artifact that is not committed contributes nothing; it must never make this throw.
    }
  }
  return out as Abi;
}

let ERROR_ABI: Abi | null = null;

/** Decode a raw revert selector against the whole RC6 error surface. */
function decodeRawRevert(data: string): string | null {
  if (!/^0x[0-9a-fA-F]{8}/.test(data)) return null;
  ERROR_ABI ??= allRc6Errors();
  const selector = data.slice(0, 10).toLowerCase();
  for (const entry of ERROR_ABI as unknown as { type: string; name: string; inputs?: { type: string }[] }[]) {
    if (entry.type !== "error") continue;
    try {
      // `toFunctionSelector` over the error's own ABI item. Hand-building the signature string and
      // hashing it was the first attempt and it silently matched nothing — the same class of
      // mistake as hand-building the launch signature, and it gets the same answer: ask viem.
      if (toFunctionSelector({ ...(entry as object), type: "function" } as never).toLowerCase() === selector) {
        return `${entry.name}${(entry.inputs ?? []).length ? "(…)" : "()"}`;
      }
    } catch {
      /* an entry viem cannot turn into a selector simply does not match */
    }
  }
  return null;
}

/**
 * Walk an error chain for a raw revert payload.
 *
 * MEASURED, NOT GUESSED. viem nests the payload five levels deep for a `simulateContract` revert it
 * cannot name: ContractFunctionExecutionError -> ContractFunctionRevertedError (`raw`) ->
 * AbiErrorSignatureNotFoundError -> CallExecutionError -> ExecutionRevertedError ->
 * RpcRequestError (`data`). Checking only the top level found nothing and every refusal read
 * "unknown error", which is the least useful thing a launch can tell a creator.
 */
function rawRevertPayload(err: unknown): string | null {
  let node: unknown = err;
  for (let depth = 0; node && depth < 8; depth++) {
    const n = node as { data?: unknown; raw?: unknown; cause?: unknown };
    if (typeof n.raw === "string" && n.raw.startsWith("0x")) return n.raw;
    if (typeof n.data === "string" && n.data.startsWith("0x")) return n.data;
    node = n.cause;
  }
  return null;
}

export function decodeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name) {
        const args = reverted.data?.args ?? [];
        return args.length > 0 ? `${name}(${args.join(", ")})` : name;
      }
      // NO EARLY RETURN OF "unknown error". This branch used to `?? "unknown error"` and return,
      // which meant the raw-selector fallback below was unreachable for exactly the case it was
      // written for: viem knows the call reverted but cannot NAME the error, because the error
      // belongs to a different contract than the one whose ABI it was given. A launch reverts from
      // the hook, the collection and the resolver as well as the factory.
      const rawInner = rawRevertPayload(err);
      if (typeof rawInner === "string") {
        const named = decodeRawRevert(rawInner);
        if (named) return named;
        return `unnamed revert ${rawInner.slice(0, 10)} (not in any committed RC6 ABI)`;
      }
      return "reverted without a decodable reason";
    }
    // viem could not name it against the ABI it was given. Fall back to the RAW SELECTOR decoded
    // over every RC6 contract's errors — this is where `BadHookAddress()` was hiding.
    const raw = rawRevertPayload(err);
    if (typeof raw === "string") {
      const named = decodeRawRevert(raw);
      if (named) return named;
      return `${err.shortMessage ?? err.message} (raw revert ${raw.slice(0, 10)}, not in any committed RC6 ABI)`;
    }
    return err.shortMessage ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

// ------------------------------------------------------------------------------------------------
// BUILD
// ------------------------------------------------------------------------------------------------

export interface BuildResult {
  readonly request: SigningRequest;
  readonly buildHash: Hex;
}

/**
 * Freeze the transaction. After this, ANY change to the bundle, chain, quote, metadata commitment,
 * economics, recipient, anti-snipe election or royalties invalidates the build and everything after
 * it — because each of those changes the params, which changes `data`, which changes `dataHash`,
 * which the signer recomputes.
 */
export function build(args: {
  chainId: number; from: Address; to: Address; value: bigint; data: Hex;
  estimatedGas: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; nonce?: number;
  launchPlanHash: Hex; bundleHash: Hex; policyHash: Hex;
}): BuildResult {
  const dataHash = keccak256(args.data);
  const request: SigningRequest = {
    chainId: args.chainId, from: getAddress(args.from), to: getAddress(args.to), value: args.value,
    data: args.data, dataHash, selector: args.data.slice(0, 10) as Hex,
    estimatedGas: args.estimatedGas, maxFeePerGas: args.maxFeePerGas, maxPriorityFeePerGas: args.maxPriorityFeePerGas,
    nonce: args.nonce, launchPlanHash: args.launchPlanHash, bundleHash: args.bundleHash, policyHash: args.policyHash,
  };
  const canonical = JSON.stringify(request, (_k, v) => (typeof v === "bigint" ? `${v}` : v));
  return { request, buildHash: keccak256(Buffer.from(canonical, "utf8") as unknown as Hex) };
}

export type { CreatorInput, LaunchParams, LaunchResult, PoolKey };
