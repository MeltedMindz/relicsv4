// SPDX-License-Identifier: MIT
// TypeScript port of src/hook/HookMiner.sol (`HookMiner.find`), used off-chain so the CREATE2
// salt for ArtHook can be discovered without an on-chain brute-force loop. Uniswap v4 selects
// hook callbacks from the low 14 bits of the hook ADDRESS, so the deploy address must encode the
// hook's permission mask exactly. The hook's constructor re-verifies this on-chain
// (`BadHookAddress` otherwise), so a mined salt this function accepts is provably correct or the
// deploy itself reverts — there is no way for a wrong salt to silently pass.
//
// THE MASK IS GENERATION-SPECIFIC AND THIS MODULE IS NOT. RC5 mines 0x1440
// (`EXPECTED_HOOK_FLAGS`); RC6 mines 0x14C0 (`RC6_EXPECTED_HOOK_FLAGS`), because `beforeSwap` is
// what lets the hook set the launch-protection fee on the way in. `mineHookSalt` used to DEFAULT to
// the RC5 value, so a caller who omitted the argument mined an RC5-mask address for an RC6 launch
// and learned about it when `BadHookAddress` reverted the launch. It is a required argument now:
// a caller who forgot it should find out here, for free, rather than be quietly rescued into
// whichever generation this file happened to be written during.
import {
  concatHex,
  encodeAbiParameters,
  getCreate2Address,
  keccak256,
  numberToHex,
  type Address,
  type Hex,
} from "viem";
import { ALL_HOOK_MASK } from "./constants.js";

/**
 * `ArtHookDeployer.namespacedSalt` — keccak256(abi.encode(caller, salt)).
 *
 * The hook is CREATE2'd by the shared, permissionless `ArtHookDeployer`, not by the factory
 * (the factory is EIP-170-bound and can no longer carry ArtHook's creation code). A shared
 * deployer that used the raw salt would let anyone squat the address a launch is about to use,
 * so the deployer namespaces every salt by its CALLER. Off-chain prediction and mining must
 * apply the identical namespacing or the mined address will not carry the requested flags and
 * the hook's constructor will revert `BadHookAddress`.
 */
export function namespacedHookSalt(caller: Address, salt: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [caller, salt]));
}

/**
 * `LaunchpadFactory._launcherSalt` — keccak256(abi.encode(launcher, salt)).
 *
 * M-01. The factory re-hashes BOTH the token salt and the hook salt against the address that
 * calls `launch` before consuming either. Without it, `LaunchParams` carried no field
 * distinguishing one launcher from another, so an observer of a pending launch could replay the
 * calldata with `creatorRecipient` swapped and land on exactly the addresses the victim mined —
 * taking the ProjectRights NFT and with it the creator fee stream.
 *
 * The consequence for this SDK is that a mined salt is valid for EXACTLY ONE launching address.
 * Mining for the wrong one is not a subtle mismatch: the hook address stops satisfying the
 * requested mask and the hook's constructor reverts `BadHookAddress`, taking the launch with it.
 *
 * Note the launcher is the SENDING address, which is not necessarily `creatorRecipient` — those
 * differ whenever a creator launches from a hot wallet and directs rights to a cold one.
 */
export function launcherSalt(launcher: Address, salt: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [launcher, salt]));
}

/**
 * The full composed CREATE2 salt a launch produces from a raw mined salt: the factory's
 * launcher namespacing first, then the deployer's caller namespacing.
 */
export function launchHookSalt(caller: Address, launcher: Address, salt: Hex): Hex {
  return namespacedHookSalt(caller, launcherSalt(launcher, salt));
}

export interface HookMineResult {
  hookAddress: Address;
  salt: Hex;
  attempts: number;
}

const MAX_LOOP = 500_000;

/**
 * Brute-forces a CREATE2 salt so `uint160(hookAddress) & flagMask == flags`, matching
 * `HookMiner.find` exactly: `salt = bytes32(i)` for i = 0, 1, 2, ... and the standard CREATE2
 * formula `keccak256(0xff ++ deployer ++ salt ++ keccak256(creationCode ++ constructorArgs))`.
 */
export function mineHookSalt(opts: {
  deployer: Address; // the address that will CREATE2-deploy the hook (the ArtHookDeployer)
  creationCode: Hex; // type(ArtHook).creationCode
  constructorArgs: Hex; // abi.encode(...) of the hook constructor args
  /**
   * The permission bitmap the mined address must carry: `EXPECTED_HOOK_FLAGS` (RC5, 0x1440) or
   * `RC6_EXPECTED_HOOK_FLAGS` (RC6, 0x14C0).
   *
   * REQUIRED, and refused at runtime as well as in the type — see the note in the file header. It
   * defaulted to the RC5 mask, which was correct on the day it was written and silently wrong for
   * every RC6 launch afterwards. There is no mask this function can guess for a caller: the answer
   * is a property of the hook bytecode being deployed, which only the caller knows.
   */
  flags: bigint;
  flagMask?: bigint; // defaults to Constants.ALL_HOOK_MASK (0x3FFF)
  maxLoop?: number;
  /**
   * Salt index to start searching from (default 0). IMPORTANT: ArtHook's constructor args are
   * `(factory, poolManager, locker, locker)` — IDENTICAL for every launch from one factory. A
   * miner that always starts at 0 therefore always finds the SAME salt/address, which collides
   * with whatever a previous launch already deployed there. Callers making more than one launch
   * from the same factory MUST vary `startAt` (see `mineHookSaltAvoidingCollision`, which does
   * this automatically by checking on-chain code) or track a persistent cursor themselves.
   */
  startAt?: number;
  /**
   * The address whose call to `ArtHookDeployer.deployHook` will produce the hook — in production
   * the LaunchpadFactory. When set, the effective CREATE2 salt is
   * `namespacedHookSalt(saltNamespace, salt)` while the RETURNED salt stays the raw value, which
   * is what `LaunchpadFactory.launch` takes as `hookSalt`.
   */
  saltNamespace?: Address;
  /**
   * The address that will CALL `launch` — the creator's own sending address (M-01). The factory's
   * launcher namespacing is applied BENEATH `saltNamespace`, reproducing the full on-chain chain:
   * raw -> launcherSalt(launcher, raw) -> namespacedHookSalt(factory, that).
   *
   * REQUIRED. It was briefly optional while this fix was written, and in that state
   * `mineArtHookSalt` silently mined launch salts without it — producing addresses that fail the
   * requested mask and revert `BadHookAddress`, with nothing to warn the caller. That is the same
   * shape as the defect this whole change closes: a namespacing one side can skip in silence.
   * Every caller in this repo mines for a launch, so the type now says so.
   */
  launcher: Address;
}): HookMineResult {
  // NO DEFAULT MASK. `opts.flags ?? EXPECTED_HOOK_FLAGS` selected the retired RC5 mask for anyone
  // who omitted the argument — including a caller mining for an RC6 launch, who got a valid-looking
  // salt, a valid-looking address, and `BadHookAddress` at signing time. The typeof check is what
  // makes this a real refusal: `flags: 0x14C0` written as a NUMBER is the near-miss this function
  // is most likely to be handed, and a number never equals a bigint, so it does not mismatch — it
  // exhausts 500,000 attempts and reports "no salt found", which reads as bad luck rather than a
  // bug in the call.
  if (typeof opts.flags !== "bigint") {
    throw new Error(
      "mineHookSalt: `flags` is required and must be a bigint. Pass EXPECTED_HOOK_FLAGS for an " +
        "RC5 hook, or RC6_EXPECTED_HOOK_FLAGS (0x14C0) for an RC6 one — RC6 adds beforeSwap, so an " +
        "address mined against the RC5 mask reverts BadHookAddress in ArtHookRc6's constructor. " +
        "There is no default: the mask is a property of the bytecode being deployed, which only " +
        "the caller knows.",
    );
  }
  const flags = opts.flags;
  const flagMask = opts.flagMask ?? ALL_HOOK_MASK;
  const maxLoop = opts.maxLoop ?? MAX_LOOP;
  const startAt = opts.startAt ?? 0;
  const bytecodeHash = keccak256(concatHex([opts.creationCode, opts.constructorArgs]));

  // M-01: NO TRUTHY FALLBACK. An earlier version of this fix wrote
  // `opts.launcher ? launcherSalt(opts.launcher, salt) : salt`
  // and tightened only the TYPE to required. TypeScript is not a runtime check: three site routes
  // called this without a launcher, the ternary silently fell back to the RAW salt, and the
  // preflight endpoint reported `status: "pass"` on a salt that reverts `BadHookAddress` the
  // moment the creator signs. A green check on a void value is worse than no check, and it is the
  // same shape as the defect this whole change closes. Refuse instead.
  if (!opts.launcher) {
    throw new Error(
      "mineHookSalt: `launcher` is required (M-01). Every salt the factory consumes is " +
        "keccak256(abi.encode(launcher, salt)), so a salt mined without one lands on an address " +
        "that fails the requested mask and reverts BadHookAddress at launch. Pass the address that " +
        "will CALL launch — the sending account, which is not necessarily creatorRecipient.",
    );
  }

  for (let i = startAt; i < startAt + maxLoop; i++) {
    const salt = numberToHex(i, { size: 32 });
    const launcherScoped = launcherSalt(opts.launcher, salt);
    const effectiveSalt = opts.saltNamespace
      ? namespacedHookSalt(opts.saltNamespace, launcherScoped)
      : launcherScoped;
    const hookAddress = getCreate2Address({ from: opts.deployer, salt: effectiveSalt, bytecodeHash });
    if ((BigInt(hookAddress) & flagMask) === flags) {
      return { hookAddress, salt, attempts: i - startAt + 1 };
    }
  }
  throw new Error(`mineHookSalt: no salt found for flags=0x${flags.toString(16)} within ${maxLoop} attempts starting at ${startAt}`);
}

export interface CodeAtChecker {
  (address: Address): Promise<boolean>; // true if the address already has deployed code
}

/**
 * Mines a hook salt, then verifies on-chain that the predicted address is NOT already deployed
 * (see the collision note on `mineHookSalt`). If it is, resumes the search past the salt that
 * just collided and retries, up to `maxRounds` times. This is the collision-safe entry point any
 * orchestration layer (Node or browser) should use when a factory may already have prior launches.
 */
export async function mineHookSaltAvoidingCollision(
  opts: Parameters<typeof mineHookSalt>[0] & { hasCode: CodeAtChecker; maxRounds?: number },
): Promise<HookMineResult & { rounds: number }> {
  const maxRounds = opts.maxRounds ?? 64;
  let startAt = opts.startAt ?? 0;
  let totalAttempts = 0;
  for (let round = 0; round < maxRounds; round++) {
    const result = mineHookSalt({ ...opts, startAt });
    totalAttempts += result.attempts;
    if (!(await opts.hasCode(result.hookAddress))) {
      return { ...result, attempts: totalAttempts, rounds: round + 1 };
    }
    // This salt's address is already occupied by a prior launch; resume just past it.
    startAt = startAt + result.attempts;
  }
  throw new Error(`mineHookSaltAvoidingCollision: no free hook address found within ${maxRounds} rounds`);
}

/**
 * FROZEN SDK export name (sdk/README.md export list). Collision-safe by construction: identical
 * to `mineHookSaltAvoidingCollision` (see its doc comment for why collision-safety is mandatory,
 * not optional, given ArtHook's per-factory-constant constructor args). Kept as a thin named
 * alias so the frozen 16-export surface never has to reference the lower-level, collision-UNSAFE
 * `mineHookSalt` directly.
 */
export const mineArtHookSalt = mineHookSaltAvoidingCollision;
