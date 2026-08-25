// SPDX-License-Identifier: MIT
// ================================================================================================
// HOOK SALT MINING FROM THE FACTORY'S OWN INIT-CODE HASH.
//
// A ZERO HOOK SALT IS NOT A PLACEHOLDER. It produces an address whose low bits do not carry the
// required permission flags, and the hook's constructor reverts `BadHookAddress` — which is
// exactly what every launch this CLI built did, and what the production rehearsal hit on all three
// chains. Mining is not an optimisation; a launch without a mined salt cannot execute.
//
// THE ONE INPUT THE PUBLIC RECORD LACKS COMES FROM THE FACTORY. Mining normally needs the hook's
// creation code, which this repo does not ship. `LaunchpadFactoryV1.hookInitCodeHashes()` returns
// `keccak256(creationCode ++ constructorArgs)` directly — the only thing CREATE2 actually consumes
// — so the address space is derivable from a live read and one keccak per candidate, with no hook
// bytecode anywhere.
//
// THE NAMESPACING IS NOT OPTIONAL AND IT IS TWO LAYERS. The factory re-hashes the salt against the
// LAUNCHER (M-01, so a pending launch's calldata cannot be replayed onto the victim's addresses),
// and the shared permissionless deployer re-hashes again against ITS CALLER (so nobody can squat an
// address a launch is about to use). Both are applied here, in that order, by the vendored
// functions rather than re-derived — get either wrong and the mined address silently stops
// carrying the mask.
// ================================================================================================
import { concatHex, getAddress, keccak256, pad, slice, toHex, type Address, type Hex, type PublicClient } from "viem";
import { FACTORY_ABI } from "./abi.js";
import { launchHookSalt } from "./vendor/hookMiner.js";
import { RC6_EXPECTED_HOOK_FLAGS, ALL_HOOK_MASK } from "./vendor/constants.js";

/** `keccak256(0xff ++ deployer ++ salt ++ initCodeHash)[12:]` — the standard CREATE2 address. */
function create2(deployer: Address, salt: Hex, initCodeHash: Hex): Address {
  return getAddress(slice(keccak256(concatHex(["0xff", deployer, salt, initCodeHash])), 12));
}

export interface MinedHookSalt {
  /** The RAW salt that goes into `LaunchParams.hookSalt`. Not the composed one. */
  readonly salt: Hex;
  readonly hookAddress: Address;
  readonly attempts: number;
  readonly flags: string;
  readonly initCodeHash: Hex;
  readonly deployer: Address;
  readonly caller: Address;
  readonly launcher: Address;
}

export interface MineOptions {
  /** The CREATE2 deployer — `ArtHookDeployer`. This is the `from` of the CREATE2, nothing else. */
  readonly deployer: Address;
  /**
   * The address that CALLS the deployer, which is the FACTORY.
   *
   * NOT the deployer. The shared deployer namespaces by ITS CALLER so nobody can squat an address a
   * launch is about to use, and the caller on the launch path is the factory. Passing the deployer
   * here produced a perfectly valid-looking address carrying the right mask that the contract did
   * not agree with — caught only because the cross-check compares against `factory.predict()`.
   */
  readonly caller: Address;
  readonly launcher: Address;
  readonly initCodeHash: Hex;
  readonly flags?: bigint;
  readonly flagMask?: bigint;
  readonly maxAttempts?: number;
  readonly startAt?: number;
  /** Optional: refuse a salt whose address already holds code, so two launches cannot collide. */
  readonly hasCode?: (address: Address) => Promise<boolean>;
}

/**
 * Find a raw salt whose resulting hook address carries the required flag bits.
 *
 * `flags` defaults to the RC6 mask and `flagMask` to the full 14 bits. The default is stated rather
 * than inferred: the vendored miner deliberately REFUSES to guess a mask, because the answer is a
 * property of the hook bytecode being deployed. RC6 is the only generation this public SDK builds
 * for, and `rc6:surface` in the private tree is what would catch that changing.
 */
export async function mineHookSalt(opts: MineOptions): Promise<MinedHookSalt> {
  const flags = opts.flags ?? RC6_EXPECTED_HOOK_FLAGS;
  const mask = opts.flagMask ?? ALL_HOOK_MASK;
  const maxAttempts = opts.maxAttempts ?? 500_000;
  let attempts = 0;

  for (let i = opts.startAt ?? 0; i < (opts.startAt ?? 0) + maxAttempts; i++) {
    attempts += 1;
    const raw = pad(toHex(i), { size: 32 });
    // BOTH namespacing layers, in the order the chain applies them.
    const composed = launchHookSalt(opts.caller, opts.launcher, raw);
    const address = create2(opts.deployer, composed, opts.initCodeHash);
    if ((BigInt(address) & mask) !== flags) continue;
    if (opts.hasCode && (await opts.hasCode(address))) continue; // already taken; keep looking
    return { salt: raw, hookAddress: address, attempts, flags: `0x${flags.toString(16)}`, initCodeHash: opts.initCodeHash, deployer: opts.deployer, caller: opts.caller, launcher: opts.launcher };
  }
  throw new Error(
    `mineHookSalt: no salt carrying flags 0x${flags.toString(16)} found in ${maxAttempts} attempts. ` +
      "That is not a normal outcome — the expected search length for a 14-bit mask is a few thousand — " +
      "so check the deployer, the launcher and the init-code hash are the ones this chain actually uses.",
  );
}

/** Read the hook init-code hash and the deployer this chain's factory will use. */
export async function hookLaneFor(client: PublicClient, factory: Address): Promise<{ initCodeHash: Hex; deployer: Address }> {
  const hashes = (await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "hookInitCodeHashes" })) as unknown;
  const initCodeHash = (Array.isArray(hashes) ? hashes[0] : hashes) as Hex;
  const wiring = (await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "wiring" })) as readonly unknown[];
  // `wiring()`'s eighth member is the ArtHookDeployer — the shared, permissionless CREATE2 deployer.
  const deployer = getAddress(wiring[7] as Address);
  return { initCodeHash, deployer };
}
