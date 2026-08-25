import { type Address, type Hex } from "viem";
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
export declare function namespacedHookSalt(caller: Address, salt: Hex): Hex;
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
export declare function launcherSalt(launcher: Address, salt: Hex): Hex;
/**
 * The full composed CREATE2 salt a launch produces from a raw mined salt: the factory's
 * launcher namespacing first, then the deployer's caller namespacing.
 */
export declare function launchHookSalt(caller: Address, launcher: Address, salt: Hex): Hex;
export interface HookMineResult {
    hookAddress: Address;
    salt: Hex;
    attempts: number;
}
/**
 * Brute-forces a CREATE2 salt so `uint160(hookAddress) & flagMask == flags`, matching
 * `HookMiner.find` exactly: `salt = bytes32(i)` for i = 0, 1, 2, ... and the standard CREATE2
 * formula `keccak256(0xff ++ deployer ++ salt ++ keccak256(creationCode ++ constructorArgs))`.
 */
export declare function mineHookSalt(opts: {
    deployer: Address;
    creationCode: Hex;
    constructorArgs: Hex;
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
    flagMask?: bigint;
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
}): HookMineResult;
export interface CodeAtChecker {
    (address: Address): Promise<boolean>;
}
/**
 * Mines a hook salt, then verifies on-chain that the predicted address is NOT already deployed
 * (see the collision note on `mineHookSalt`). If it is, resumes the search past the salt that
 * just collided and retries, up to `maxRounds` times. This is the collision-safe entry point any
 * orchestration layer (Node or browser) should use when a factory may already have prior launches.
 */
export declare function mineHookSaltAvoidingCollision(opts: Parameters<typeof mineHookSalt>[0] & {
    hasCode: CodeAtChecker;
    maxRounds?: number;
}): Promise<HookMineResult & {
    rounds: number;
}>;
/**
 * FROZEN SDK export name (sdk/README.md export list). Collision-safe by construction: identical
 * to `mineHookSaltAvoidingCollision` (see its doc comment for why collision-safety is mandatory,
 * not optional, given ArtHook's per-factory-constant constructor args). Kept as a thin named
 * alias so the frozen 16-export surface never has to reference the lower-level, collision-UNSAFE
 * `mineHookSalt` directly.
 */
export declare const mineArtHookSalt: typeof mineHookSaltAvoidingCollision;
