// SPDX-License-Identifier: MIT
// Off-chain, deterministic re-derivation of LaunchpadFactory's CREATE2 address scheme
// (src/factory/LaunchpadFactory.sol `_predictToken`/`_predictHook`/`_predictCollection`/`_keyFor`
// + Solady LibClone "clone with immutable args"). This is a transliteration of the exact assembly
// in lib/solady/src/utils/LibClone.sol (`cloneDeterministic`/`initCodeHash`), not a re-derivation
// from a spec — every byte position is load-bearing. ALWAYS cross-check against
// `factory.predict()` on-chain (see verify.ts); a mismatch means this file is wrong, not the
// contract.
import {
  type Address,
  type Hex,
  concatHex,
  encodeAbiParameters,
  encodePacked,
  getAddress,
  getCreate2Address,
  keccak256,
  numberToHex,
  size,
} from "viem";
import { WETH } from "./constants.js";
import { launchHookSalt, launcherSalt, namespacedHookSalt } from "./hookMiner.js";
import { poolIdForKey, poolKeyForLane, type ProtocolLane } from "./poolLane.js";
import type { PoolKey } from "./types.js";

/**
 * Reconstructs Solady LibClone's "clone with immutable args" init code, byte-for-byte, per
 * `cloneDeterministic`/`initCodeHash` in lib/solady/src/utils/LibClone.sol:
 *
 * PUSH2 <runSize>  RETURNDATASIZE  DUP2  PUSH1 0x0a  RETURNDATASIZE  CODECOPY  RETURN   (10 B)
 * CALLDATASIZE RETURNDATASIZE RETURNDATASIZE CALLDATACOPY
 * RETURNDATASIZE RETURNDATASIZE RETURNDATASIZE CALLDATASIZE RETURNDATASIZE
 * PUSH20 <implementation> GAS DELEGATECALL
 * RETURNDATASIZE DUP3 DUP1 RETURNDATACOPY SWAP1 RETURNDATASIZE SWAP2
 * PUSH1 0x2b JUMPI REVERT JUMPDEST RETURN                                            (45 B)
 * <args>                                                                             (n B)
 *
 * runSize = n + 0x2d (0x2d = 45, the fixed runtime prefix length).
 */
export function libCloneInitCode(implementation: Address, args: Hex): Hex {
  const n = size(args);
  if (n >= 0xffd3) throw new Error(`libCloneInitCode: args too large (${n} bytes)`);
  const runSize = numberToHex(n + 0x2d, { size: 2 }); // PUSH2 immediate
  return concatHex([
    "0x61",
    runSize,
    "0x3d81600a3d39f3", // RETURNDATASIZE DUP2 PUSH1 0x0a RETURNDATASIZE CODECOPY RETURN
    "0x363d3d373d3d3d363d73", // calldata-copy + delegatecall setup, ends in PUSH20
    getAddress(implementation),
    "0x5af43d82803e903d91602b57fd5bf3", // GAS DELEGATECALL ... RETURN
    args,
  ]);
}

export function libCloneInitCodeHash(implementation: Address, args: Hex): Hex {
  return keccak256(libCloneInitCode(implementation, args));
}

/** ProjectToken clone's immutable-args blob: abi.encode(name, symbol, totalSupply, mintRecipient). */
export function encodeTokenArgs(name: string, symbol: string, totalSupply: bigint, mintRecipient: Address): Hex {
  return encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "uint256" }, { type: "address" }],
    [name, symbol, totalSupply, mintRecipient],
  );
}

/** Predicts the ProjectToken clone address for a given tokenSalt (factory._predictToken). */
export function predictTokenAddress(opts: {
  factory: Address;
  tokenImplementation: Address;
  tokenArgs: Hex;
  tokenSalt: Hex;
  /**
   * The address that will CALL `launch` (M-01). REQUIRED, and deliberately not optional: the
   * factory consumes `keccak256(abi.encode(launcher, tokenSalt))`, so a prediction made without
   * it describes an address no launch will ever occupy. Making it optional would reintroduce
   * exactly the failure M-01 fixed — a namespacing convention that one side can silently skip.
   *
   * This is the SENDING address. It is not necessarily `creatorRecipient`, which only says where
   * ProjectRights is delivered.
   */
  launcher: Address;
}): Address {
  const bytecodeHash = libCloneInitCodeHash(opts.tokenImplementation, opts.tokenArgs);
  return getCreate2Address({
    from: opts.factory,
    salt: launcherSalt(opts.launcher, opts.tokenSalt),
    bytecodeHash,
  });
}

/**
 * `abi.encode(factory, poolManager, authorizedLp, conversionSender)` — ArtHook's constructor args.
 *
 * TWO ROLES, AND THEY ARE NOT THE SAME ROLE. `authorizedLp` is the only address the hook accepts
 * liquidity from; `conversionSender` is the address the hook EXCLUDES from organic volume, net
 * flow, observation history and the TWAP, so a protocol-owned conversion cannot move the price a
 * later conversion is anchored to. The second one must be THE CONTRACT THAT ACTUALLY SUBMITS THOSE
 * SWAPS — naming anything else excludes an address that never swaps and leaves the real executor
 * recorded as organic history.
 *
 * THE DEFAULT IS AN RC5 FACT AND ONLY AN RC5 FACT. On RC5 the streamable-fees locker holds both
 * roles, because RC5's `ArtStreamableFeesLocker` really does carry the conversion swap call site.
 * RC6 MOVED THAT CALL SITE: `ArtStreamableFeesLockerRc6` has no swap at all (its two unlock actions
 * are MINT and COLLECT), and the single-quote lane's conversion executor is `FeeAccountingV1`. So
 * the `conversionSender ?? locker` fallback below is correct for RC5 and WRONG for RC6, which is
 * exactly what finding J-1 was. RC6 callers must use {encodeRc6HookConstructorArgs}, which has no
 * default at all.
 *
 * - RC5 WETH lane: locker is both the authorized LP and the excluded conversion sender.
 * - RC6 single-quote lane: locker is the authorized LP, `FeeAccountingV1` is the conversion sender.
 * - RC6 multi-quote lane: `ImmutableLiquidityKernel` is the authorized LP,
 *   `MultiQuoteEconomicKernelV1` is the conversion sender.
 *
 * Different args mean a different init code and therefore a COMPLETELY SEPARATE salt search
 * space. Mining with the wrong pair yields an address that does not carry the expected flag mask,
 * and the hook's constructor reverts `BadHookAddress` — the launch fails rather than mis-deploying.
 */
export function encodeHookConstructorArgs(
  factory: Address,
  poolManager: Address,
  locker: Address,
  conversionSender?: Address,
): Hex {
  return encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }],
    [factory, poolManager, locker, conversionSender ?? locker],
  );
}

/**
 * The RC6 form of {encodeHookConstructorArgs}: `conversionSender` is REQUIRED.
 *
 * There is no safe default on RC6. The single-quote lane's executor is the fee layer and the
 * multi-quote lane's is the economic kernel; neither is the address that holds the LP role, so a
 * fallback to `authorizedLp` would silently reproduce J-1 on every future caller. A missing
 * argument must be a type error and a runtime refusal, not a guess.
 */
export function encodeRc6HookConstructorArgs(
  factory: Address,
  poolManager: Address,
  authorizedLp: Address,
  conversionSender: Address,
): Hex {
  if (!conversionSender || conversionSender === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "encodeRc6HookConstructorArgs: `conversionSender` is required. RC6's ArtHook excludes this " +
        "address from the TWAP its own conversion floor reads, so it must be the contract that " +
        "actually submits the conversion swaps — FeeAccountingV1 on the single-quote lane, " +
        "MultiQuoteEconomicKernelV1 on the multi-quote lane. It is NEVER the locker: " +
        "ArtStreamableFeesLockerRc6 has no swap call site (finding J-1).",
    );
  }
  if (conversionSender.toLowerCase() === authorizedLp.toLowerCase()) {
    throw new Error(
      "encodeRc6HookConstructorArgs: `conversionSender` must not equal `authorizedLp`. On RC6 the " +
        "two roles are held by different contracts on BOTH lanes; collapsing them is finding J-1.",
    );
  }
  return encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }],
    [factory, poolManager, authorizedLp, conversionSender],
  );
}

/**
 * Predicts the ArtHook CREATE2 address for a given hookSalt — the exact mirror of
 * `LaunchpadFactory._predictHook`.
 *
 * The CREATE2 origin is the `ArtHookDeployer`, NOT the factory: the factory is EIP-170-bound and
 * no longer carries ArtHook's creation code. The salt is namespaced by the factory (the caller of
 * `deployHook`), which is what keeps a permissionless shared deployer from letting an outsider
 * squat a launch's address. Read `hookDeployer` off the factory (it is a public immutable).
 */
export function predictHookAddress(opts: {
  factory: Address;
  hookDeployer: Address;
  hookCreationCode: Hex;
  poolManager: Address;
  /** Multi-quote lane only: the MultiQuoteEconomicKernel. Omit on the WETH lane. */
  conversionSender?: Address;
  locker: Address;
  hookSalt: Hex;
  /**
   * The address that will CALL `launch` (M-01). REQUIRED — see the note on
   * {predictTokenAddress}. Two namespacings compose on the launch path and BOTH are applied
   * here: the factory's launcher namespacing first, then the deployer's caller namespacing.
   */
  launcher: Address;
}): Address {
  const constructorArgs = encodeHookConstructorArgs(
    opts.factory,
    opts.poolManager,
    opts.locker,
    (opts as { conversionSender?: Address }).conversionSender,
  );
  const bytecodeHash = keccak256(concatHex([opts.hookCreationCode, constructorArgs]));
  return getCreate2Address({
    from: opts.hookDeployer,
    salt: launchHookSalt(opts.factory, opts.launcher, opts.hookSalt),
    bytecodeHash,
  });
}

/**
 * LaunchpadFactory._collectionSalt: keccak256(abi.encodePacked(token, hook)) — the PER-LAUNCH base
 * salt, before helper namespacing (see `helperCollectionSalt`).
 */
export function collectionSalt(token: Address, hook: Address): Hex {
  return keccak256(encodePacked(["address", "address"], [getAddress(token), getAddress(hook)]));
}

/**
 * G-1.1: ProjectDeploymentHelper.deployCollection namespaces the CREATE2 salt by ITS caller
 * (`msg.sender`, i.e. the factory) so a front-runner invoking the helper directly with the same
 * baseSalt lands at a DIFFERENT address and can never pre-occupy the address a factory launch
 * predicts (ProjectDeploymentHelper.sol's own doc comment). Mirrors
 * `keccak256(abi.encode(msg.sender, baseSalt))` exactly.
 */
export function helperCollectionSalt(factory: Address, token: Address, hook: Address): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [getAddress(factory), collectionSalt(token, hook)]),
  );
}

/**
 * Solady LibClone's PLAIN EIP-1167 minimal-proxy init code (no immutable args), byte-for-byte per
 * `LibClone.initCodeHash` in lib/solady/src/utils/LibClone.sol. 53 bytes total:
 *
 * PUSH1 0x2c  RETURNDATASIZE  DUP2  PUSH1 0x09  RETURNDATASIZE  CODECOPY  RETURN        (9 B)
 * RETURNDATASIZE x4  CALLDATASIZE  RETURNDATASIZE RETURNDATASIZE  CALLDATACOPY
 * CALLDATASIZE  RETURNDATASIZE  PUSH20 <implementation>  GAS  DELEGATECALL
 * RETURNDATASIZE RETURNDATASIZE SWAP4 DUP1 RETURNDATACOPY  PUSH1 0x2a JUMPI REVERT
 * JUMPDEST RETURN                                                                      (44 B)
 *
 * This is the plain-clone sibling of {libCloneInitCode} above (which is the immutable-args CWIA
 * variant `ProjectToken` uses). ProjectCollection needs no immutable args — every per-project field
 * arrives through `initialize` — so it clones with this shorter, argument-free form.
 */
export function cloneInitCode(implementation: Address): Hex {
  return concatHex([
    "0x602c3d8160093d39f33d3d3d3d363d3d37363d73",
    getAddress(implementation).toLowerCase() as Hex,
    "0x5af43d3d93803e602a57fd5bf3",
  ]);
}

/**
 * `IProjectDeploymentHelper.collectionInitCodeHash()`'s return value, recomputed off-chain.
 *
 * A launched ProjectCollection is an EIP-1167 CLONE of the single implementation the helper
 * deployed in its own constructor, NOT a fresh deployment of ProjectCollection's creation code —
 * that change is what took ~2.4M gas out of every launch. So this hash is a function of the
 * IMPLEMENTATION ADDRESS, and can no longer be derived from the artifact's `bytecode.object`
 * alone. Read the implementation from `IProjectDeploymentHelper.collectionImplementation()` (one
 * `eth_call` returning an immutable), or read the hash itself from `collectionInitCodeHash()`.
 */
export function computeCollectionInitCodeHash(collectionImplementation: Address): Hex {
  return keccak256(cloneInitCode(collectionImplementation));
}

/**
 * G-1.1: predicts the ProjectCollection CREATE2 address AS DEPLOYED BY `deploymentHelper` (the
 * pinned `IProjectDeploymentHelper`), NOT by the factory itself — `LaunchpadFactory._predictCollection`
 * calls `LibClone.predictDeterministicAddress(collectionInitCodeHash, salt, address(deploymentHelper))`.
 * This function is a cross-check utility only: the canonical, always-correct source for this
 * address is `predictProjectAddresses()` (an on-chain `factory.predict()` read) — see that
 * function's doc comment for why a UI must never trust an off-chain recompute alone.
 */
export function predictCollectionAddress(opts: {
  deploymentHelper: Address;
  factory: Address;
  collectionInitCodeHash: Hex;
  token: Address;
  hook: Address;
}): Address {
  const salt = helperCollectionSalt(opts.factory, opts.token, opts.hook);
  return getCreate2Address({ from: opts.deploymentHelper, salt, bytecodeHash: opts.collectionInitCodeHash });
}

/**
 * The canonical PoolKey for a project. Sorts token vs the counter-asset into currency0/currency1.
 *
 * THE LANE IS REQUIRED AND HAS NO DEFAULT. RC5 pools carry a static `10_000`; RC6 pools carry
 * `LPFeeLibrary.DYNAMIC_FEE_FLAG` so the hook can return the launch-fee override. `fee` is in the
 * PoolId preimage, so the wrong lane yields a well-formed id for a pool that does not exist — and
 * nothing errors, every later read just comes back empty. Neither default is safe, so there is
 * none: a caller that has not decided which generation it is deriving for does not compile.
 *
 * Implementation lives in `poolLane.ts`; this is the historical name, kept so the whole SDK has one
 * derivation rather than two that agree until they do not.
 */
export function poolKeyFor(lane: ProtocolLane, token: Address, hook: Address, counterAsset: Address = WETH): PoolKey {
  return poolKeyForLane(lane, token, hook, counterAsset);
}

/** v4-core PoolIdLibrary.toId: keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks)). */
export const poolIdFor = poolIdForKey;

export interface PredictedAddresses {
  projectToken: Address;
  artHook: Address;
  projectCollection: Address;
  poolKey: PoolKey;
  poolId: Hex;
}

/**
 * Full OFF-CHAIN prediction pipeline, mirroring `LaunchpadFactory.predict()` byte-for-byte
 * (including the G-1.1 helper-namespaced collection salt/deployer). This is a CROSS-CHECK
 * utility only — see `predictProjectAddresses()` for the canonical on-chain source of truth.
 */
export function predictAll(opts: {
  /**
   * Which protocol generation this prediction is for. REQUIRED — RC5 and RC6 do not produce the
   * same PoolId for the same project, and a defaulted lane would silently answer for the other one.
   */
  lane: ProtocolLane;
  factory: Address;
  hookDeployer: Address;
  tokenImplementation: Address;
  hookCreationCode: Hex;
  deploymentHelper: Address;
  collectionInitCodeHash: Hex;
  poolManager: Address;
  locker: Address;
  tokenName: string;
  tokenSymbol: string;
  totalSupply: bigint;
  tokenSalt: Hex;
  hookSalt: Hex;
  weth?: Address;
  /**
   * The address that will CALL `launch` (M-01). Every salt below is namespaced by it, so a
   * prediction is only valid for the launcher it names.
   */
  launcher: Address;
}): PredictedAddresses {
  const tokenArgs = encodeTokenArgs(opts.tokenName, opts.tokenSymbol, opts.totalSupply, opts.locker);
  const projectToken = predictTokenAddress({
    factory: opts.factory,
    tokenImplementation: opts.tokenImplementation,
    tokenArgs,
    tokenSalt: opts.tokenSalt,
    launcher: opts.launcher,
  });
  const artHook = predictHookAddress({
    factory: opts.factory,
    hookDeployer: opts.hookDeployer,
    hookCreationCode: opts.hookCreationCode,
    poolManager: opts.poolManager,
    locker: opts.locker,
    hookSalt: opts.hookSalt,
    launcher: opts.launcher,
  });
  const projectCollection = predictCollectionAddress({
    deploymentHelper: opts.deploymentHelper,
    factory: opts.factory,
    collectionInitCodeHash: opts.collectionInitCodeHash,
    token: projectToken,
    hook: artHook,
  });
  const poolKey = poolKeyFor(opts.lane, projectToken, artHook, opts.weth ?? WETH);
  const poolId = poolIdFor(poolKey);
  return { projectToken, artHook, projectCollection, poolKey, poolId };
}

// NOTE: `predictProjectAddresses()` — the FROZEN SDK export that reads the canonical, always-
// correct `factory.predict()` on-chain — lives in `predictLive.ts`, NOT this file. This file
// (`predict.ts`) is deliberately kept BROWSER-SAFE (pure math, no `node:fs`/`node:url`/`node:path`
// imports) so `sdk/app/main.ts` can import it directly without pulling in `abi.ts` (which reads
// trimmed artifacts off disk via `node:fs` — Node-only). See predictLive.ts's doc comment for why
// that on-chain read is the canonical address source, and predictAll() above is a cross-check only.
