// SPDX-License-Identifier: MIT
// ================================================================================================
// THE SIGNER BOUNDARY.
//
// An AI agent driving a launch must never hold a raw private key. Not because a key in a variable
// is likely to be printed — though a key in an agent's process is one stack trace, one debug log or
// one `--verbose` from being in a transcript — but because a key in the agent's process makes the
// agent's judgement the last line of defence. Anything that steers the agent (a poisoned brief, a
// hostile file it read, a plan it rebuilt after the creator looked away) steers the signature.
//
// So the agent gets a `SigningRequest` and a channel. On the other side of that channel something
// with a key re-derives, from the bytes it was handed, every fact the creator's policy depends on,
// and refuses with a typed code when any of them fails. `createPolicyBoundSigner` puts that
// enforcement in front of ANY adapter — a local sidecar, a hardware wallet, a KMS, a development
// keystore — so the check does not depend on which one is wired in.
//
// THE ADAPTERS ARE NOT RE-EXPORTED HERE, on purpose. `adapters/devKeystore.ts` holds a key in
// process and exists for anvil and fork harnesses only; a caller has to name that file to get it.
// Making it reachable by autocomplete from the package root is how a test-only signer ends up in a
// production import.
// ================================================================================================
import type { Address, AgentPolicy, SignerRefusal, SignerRefusalCode, SignerResult, SigningRequest } from "./contracts.ts";
import { guardSigningRequest, type ApprovedBuild, type PolicyVerdict } from "./policyGuard.ts";
import { AuthorizationSpendError, consumeAuthorization } from "./authorization.ts";
import type { SimulationReceipt } from "./grantGuard.ts";

export * from "./contracts.ts";
export { checkGrantPermission, checkGrantCalldata, checkSignerKeyBinding, type GrantVerdict, type GrantRefusal, type GrantRefusalCode, type SignerKeyIdentity, type SimulationReceipt } from "./grantGuard.ts";
export { checkAuthorization, readAuthorization, writeAuthorization, revokeAuthorization, consumeAuthorization, AuthorizationSpendError, authorizationFingerprint, relicsHome, authorizationPath, type Authorization, type AuthorizationPreset, type AuthorizationMode } from "./authorization.ts";
export { checkStaticPolicy, guardSigningRequest, type ApprovedBuild, type ChainSupportProbe, type PolicyGuardInput, type PolicyVerdict } from "./policyGuard.ts";
export { checkArtSelector, runtimeTagAllowed, type ApprovedArtSelector, type ArtSelectorRefusalCode, type ArtSelectorVerdict } from "./artSelectorGuard.ts";
export { ALLOWED_SELECTORS, LAUNCH_FACTORY_ABI, LAUNCH_FUNCTION_NAME, LAUNCH_SELECTOR, LaunchAbiShapeError, LaunchCalldataDecodeError, decodeCreatorRecipient } from "./launchAbi.ts";
export { WireFormatError, decodeSignerRefusal, decodeSignerResult, decodeSigningRequest, encodeSigningRequest, type WireSigningRequest } from "./wire.ts";

/**
 * ONE SIGNER, WHATEVER IS BEHIND IT.
 *
 * Deliberately three methods and no more. There is no `signMessage`, no `signTypedData` and no
 * `sendRawTransaction`: this boundary exists to sign ONE kind of transaction, and every capability
 * added here is a capability a compromised agent inherits. RC6 needs no separate metadata
 * signature — the launch calldata is the creator's authorization of the whole configuration — so
 * there is nothing else for an agent to ask a signer for.
 */
export interface SignerAdapter {
  /** Stable identifier for receipts and logs. Never a secret, never a key fingerprint. */
  readonly id: string;
  getAddress(): Promise<Address>;
  supportsChain(chainId: number): Promise<boolean>;
  sign(req: SigningRequest): Promise<SignerResult>;
}

/**
 * A refusal, raised as an error because `SignerAdapter.sign` has no refusal channel in its return
 * type. The typed `refusal` is the contract; the message exists for humans reading a log.
 *
 * Callers that would rather branch than catch should use `PolicyBoundSigner.trySign`, which returns
 * the same object as a value.
 */
export class SignerRefusedError extends Error {
  readonly refusal: SignerRefusal;
  readonly code: SignerRefusalCode;
  constructor(refusal: SignerRefusal) {
    super(`signer refused: ${refusal.code} — ${refusal.detail}`);
    this.name = "SignerRefusedError";
    this.refusal = refusal;
    this.code = refusal.code;
  }
}

/**
 * A transport, configuration or wire failure — NOT a refusal.
 *
 * Kept separate from `SignerRefusedError` because an agent does different things about them. A
 * refusal means the request was read and declined, and rebuilding it the same way will be declined
 * again. A transport failure means nobody answered, which says nothing about whether the request
 * was acceptable — and treating "the sidecar was not running" as "the policy refused" would tell a
 * creator their launch was rejected when it was never seen.
 */
export class SignerTransportError extends Error {
  readonly reason: string;
  constructor(reason: string, detail: string, options?: { cause?: unknown }) {
    super(`${reason}: ${detail}`, options);
    this.name = "SignerTransportError";
    this.reason = reason;
  }
}

export interface PolicyBoundSigner extends SignerAdapter {
  /** The policy this signer enforces. Exposed so a receipt can record what was enforced. */
  readonly policy: AgentPolicy;
  /** The build this signer is bound to, or `null` — in which case every `sign` refuses. */
  readonly approvedBuild: ApprovedBuild | null;
  /** `sign`, without the throw: the refusal comes back as a value an agent can branch on. */
  trySign(req: SigningRequest, simulation?: SimulationReceipt | null): Promise<SignerResult | SignerRefusal>;
  /** The verdict alone, with nothing signed. For preflights and for explaining a refusal. */
  check(req: SigningRequest, simulation?: SimulationReceipt | null): Promise<PolicyVerdict>;
}

/**
 * Wrap any adapter so the policy is enforced BEFORE the request reaches it.
 *
 * The order is the whole point and the tests assert it: on a refusal the inner adapter's `sign` is
 * never called, so a wrapped hardware wallet never sees a request the policy rejects and never gets
 * the chance to prompt a human to approve one. A guard that ran after delegation, or beside it,
 * would be a report rather than a boundary.
 *
 * `approvedBuild` is a REQUIRED argument that may be `null`. Making it optional would let a caller
 * omit it and get a signer that checks the chain, the target and the ceilings while silently
 * skipping the three hashes and signing a build nobody approved.
 */
export interface PolicyBoundSignerOptions {
  /**
   * Require a live authorization GRANT (not expired, not revoked, not spent) before signing.
   *
   * DEFAULTS TO TRUE, and production never sets it. It exists so the shape tests -- which predate
   * the grant model and assert only that a malformed transaction is refused -- can run without a
   * fixture grant that has nothing to do with what they assert. A default of false would mean a
   * caller who forgot the option got a signer that checks the calldata and ignores whether the
   * human still permits a launch at all.
   */
  readonly requireGrant?: boolean;
  /** The simulation receipt for THESE bytes. Required by the grant guard; see grantGuard.ts. */
  readonly simulation?: SimulationReceipt | null;
}

export function createPolicyBoundSigner(
  adapter: SignerAdapter,
  policy: AgentPolicy,
  approvedBuild: ApprovedBuild | null,
  options?: PolicyBoundSignerOptions,
): PolicyBoundSigner {
  const check = (req: SigningRequest, simulation?: SimulationReceipt | null): Promise<PolicyVerdict> =>
    guardSigningRequest({
      request: req,
      policy,
      approvedBuild,
      requireGrant: options?.requireGrant !== false,
      ...(simulation !== undefined ? { simulation } : options?.simulation !== undefined ? { simulation: options.simulation } : {}),
      // Bound rather than passed as the adapter itself: the guard is given the two capabilities it
      // needs and no way to reach `sign`. `getAddress` is one of them because the GRANT IS BOUND TO
      // A KEY, and the only component that knows which key is behind this boundary is the adapter.
      signer: {
        supportsChain: (chainId: number) => adapter.supportsChain(chainId),
        getAddress: () => adapter.getAddress(),
      },
    });

  // The simulation proof travels WITH the call rather than being baked into the signer at
  // construction: one signer serves many requests, and each one must show its own evidence.
  //
  // ---- AND THE GRANT IS SPENT HERE, WHICH IS THE ONLY PLACE IT CAN BE ------------------------------
  //
  // `consumeAuthorization` had ZERO call sites until 2026-09-03. Every check on `launchesUsed`
  // therefore read a number nothing ever incremented, `AUTHORIZATION_CONSUMED` was unreachable in
  // shipped code, and a grant declaring `launchesAllowed: 1` signed an unbounded stream of launches
  // — measured: five repeats of one request, then a second, DIFFERENT project.
  //
  // IT IS SPENT BEFORE THE ADAPTER IS ASKED TO SIGN, not after. A spend that follows the signature
  // leaves a window in which a killed process has handed back signed bytes against a grant that
  // still reads unspent; a spend that precedes it can at worst cost a slot for a signature that was
  // never produced, which costs a re-authorization rather than a second project. `checkAuthorization`
  // treats a re-sign of the SAME `launchPlanHash` as the same launch, so a resumed run is not
  // charged twice and a crash between broadcast and receipt cannot strand a launch that succeeded.
  //
  // A SPEND THAT FAILS IS A REFUSAL, NEVER A SIGNATURE. `consumeAuthorization` throws only when the
  // grant and the check disagree, and the fail-closed answer to that disagreement is not to sign.
  const trySign = async (req: SigningRequest, simulation?: SimulationReceipt | null): Promise<SignerResult | SignerRefusal> => {
    const verdict = await check(req, simulation);
    if (verdict.kind !== "ALLOWED") return verdict;
    if (options?.requireGrant !== false) {
      try {
        consumeAuthorization(req.launchPlanHash);
      } catch (cause) {
        const reason = cause instanceof AuthorizationSpendError ? cause.reason : "AUTHORIZATION_CONSUMED";
        return {
          kind: "REFUSED",
          code: reason as unknown as SignerRefusalCode,
          detail: `the grant could not be spent for this launch, so nothing was signed: ${cause instanceof Error ? cause.message : String(cause)}`,
        };
      }
    }
    return adapter.sign(req);
  };

  return {
    id: `policy-bound:${adapter.id}`,
    policy,
    approvedBuild,
    check,
    trySign,
    getAddress: () => adapter.getAddress(),
    supportsChain: (chainId: number) => adapter.supportsChain(chainId),
    async sign(req: SigningRequest): Promise<SignerResult> {
      const outcome = await trySign(req);
      if (outcome.kind === "REFUSED") throw new SignerRefusedError(outcome);
      return outcome;
    },
  };
}
