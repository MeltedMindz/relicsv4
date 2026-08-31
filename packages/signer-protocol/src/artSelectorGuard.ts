// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ART SELECTOR, DECODED OUT OF THE FINAL CALLDATA.
//
// `LaunchParams.artTemplateId` is not a template id. It is a packed word carrying TWO creator
// choices — the registered template in its low 224 bits, and the ELECTED ART RUNTIME's per-chain
// registry key in its top 32:
//
//     artTemplateId = uint256(artRuntimeId) << 224 | templateId
//
// The signer checked neither half. `artTemplateId` was decoded, because the nineteen-field arity
// check requires it to be present, and then never read — so a request could elect any runtime the
// chain happens to carry and be signed on the strength of `artMode` alone, which is 0 for the
// generic runtime and 0 for both Wave-1 engines alike.
//
// WHAT THIS IS DEFENDING AGAINST, CONCRETELY. An agent prepares, predicts and simulates a launch on
// GEOMETRIC_RECURSION_V1 (id 3), and then hands the signer calldata that elects nothing — runtime
// half 0, which resolves to the chain's GENERIC runtime. Every other field is identical. The launch
// succeeds. The collection renders generic art under the creator's name, and the art binding is
// one-shot, so there is no transaction that repairs it.
//
// ------------------------------------------------------------------------------------------------
// WHY THE APPROVAL IS THE AUTHORITY AND AN AUXILIARY FIELD IS NOT
// ------------------------------------------------------------------------------------------------
// The election is a fact about a CHAIN — which uint32 key a runtime holds, and whether it is active
// there — and this guard has no RPC and should not grow one: a signer that read a registry would
// read it through the same table the orchestrator used to build the transaction, and a poisoned
// table would satisfy both sides at once. That is the identical argument `policyGuard` already
// makes for the canonical factory address.
//
// So the reading is taken ONCE, upstream, at approval time, before the request existed, and travels
// on `ApprovedBuild` with the evidence it rests on. The value compared against it is DECODED FROM
// THE BYTES ABOUT TO BE SIGNED. Nothing here reads a runtime id supplied beside the request — that
// is precisely the substitution this check exists to stop.
//
// ONE DECODER, AND IT IS NOT THIS FILE'S. `decodeArtSelector` lives in `@relics/project-schema`,
// is checked against the deployed `ArtSelectorLib`'s own corpus, and is the only public
// implementation of the shift. Nothing here open-codes `>> 224n`.
// ================================================================================================
import { decodeArtSelector, isRuntimeElection } from "@relics/project-schema";
import { decodeLaunchParamsFromCalldata } from "./launchAbi.ts";
import type { Address, AgentPolicy, SigningRequest } from "./contracts.ts";

/**
 * Refusal codes this guard adds.
 *
 * A LOCAL UNION, CAST AT THE CALL SITE, exactly as `GrantRefusalCode` already is. `SignerRefusalCode`
 * is the closed thirteen-member vocabulary an agent is documented to handle exhaustively; widening
 * it is a cross-package contract change, and the grant guard established that a guard's own codes
 * ride locally instead. The codes are still typed, still closed, and still reach the agent verbatim.
 */
export type ArtSelectorRefusalCode =
  | "ART_SELECTOR_MALFORMED"
  | "ART_SELECTOR_NOT_APPROVED"
  | "ART_RUNTIME_NOT_ALLOWED_BY_POLICY"
  | "ART_RUNTIME_NOT_ACTIVE_ON_CHAIN";

export type ArtSelectorVerdict =
  | { readonly kind: "ALLOWED"; readonly artRuntimeId: number; readonly templateId: bigint }
  | { readonly kind: "REFUSED"; readonly code: ArtSelectorRefusalCode; readonly detail: string };

/**
 * The election the creator's approval carries, WITH the reading it rests on.
 *
 * EVERY FIELD IS SOMETHING THAT WAS READ. `artRuntimeId` is the key the approving process resolved
 * from `ArtRuntimeRegistryV1`; `registryComplete` says whether that enumeration reconciled against
 * `runtimeCount()`; `active`, `exists` and `runtimeCodeBytes` are what `runtimeInfo` and
 * `eth_getCode` returned. The shape exists so an approval cannot express an election without also
 * saying where its answer came from — an unread registry has to be visible as one.
 */
export interface ApprovedArtSelector {
  /** The chain the reading was taken on. An approval for one chain says nothing about another. */
  readonly chainId: number;
  /** The stable string id, e.g. `GEOMETRIC_RECURSION_V1`. What a policy and a grant name. */
  readonly runtimeTag: string;
  /** The `uint32` registry key that tag resolved to. Null is an unresolved election, not a zero. */
  readonly artRuntimeId: number | null;
  /** The registered template, decimal. */
  readonly templateId: string;
  readonly registry: Address | null;
  readonly runtimeAddress: Address | null;
  readonly runtimeCodeBytes: number | null;
  readonly active: boolean;
  readonly exists: boolean;
  /** Whether the id enumeration reconciled against `runtimeCount()`. An incomplete read is UNKNOWN. */
  readonly registryComplete: boolean;
  readonly blockNumber: string | null;
}

function refuse(code: ArtSelectorRefusalCode, detail: string): ArtSelectorVerdict {
  return { kind: "REFUSED", code, detail };
}

/**
 * The whole check, over the bytes.
 *
 * ORDER IS LOAD-BEARING. The word is decoded first, because every later question is about its
 * halves; the TEMPLATE half is checked before the runtime half, because a launch carrying template
 * 0 cannot succeed whatever it elects; and the approval is compared before the policy and the chain,
 * because "this is not the launch that was approved" is a more precise thing to tell a creator than
 * "this runtime is not allowed".
 */
export function checkArtSelector(input: {
  readonly request: SigningRequest;
  readonly policy: AgentPolicy;
  readonly approvedArtSelector: ApprovedArtSelector | null | undefined;
}): ArtSelectorVerdict {
  const { request, policy, approvedArtSelector } = input;

  let params: Record<string, unknown>;
  try {
    params = decodeLaunchParamsFromCalldata(request.data);
  } catch (cause) {
    return refuse("ART_SELECTOR_MALFORMED", `the art selector could not be read out of the calldata: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  const raw = params.artTemplateId;
  let decoded: { artRuntimeId: number; templateId: bigint };
  try {
    decoded = decodeArtSelector(raw as bigint);
  } catch (cause) {
    return refuse("ART_SELECTOR_MALFORMED", `artTemplateId ${String(raw)} is not a legal art selector: ${cause instanceof Error ? cause.message : String(cause)}`);
  }

  // A JAVASCRIPT-MODE LAUNCH CARRIES NO SELECTOR AT ALL and the chain requires the word to be zero.
  // It is refused elsewhere (the grant's runtime allowlist, and the protocol itself), so this guard
  // stands aside rather than inventing a second reason.
  const artMode = Number(params.artMode ?? -1);
  if (artMode !== 0) return { kind: "ALLOWED", artRuntimeId: decoded.artRuntimeId, templateId: decoded.templateId };

  // THE TEMPLATE HALF. A word that elects runtime 3 with template 0 is `0x03 << 224` — very large,
  // very non-zero, and refused on chain by `LaunchPolicyV1` as `BadTemplate`. A `!== 0n` test on the
  // whole word cannot see it.
  if (decoded.templateId === 0n) {
    return refuse(
      "ART_SELECTOR_MALFORMED",
      `the selector's TEMPLATE half is 0, the registry's reserved no-template sentinel. The word ${String(raw)} is non-zero because it elects art runtime ${decoded.artRuntimeId}, but a launch carrying template 0 reverts BadTemplate.`,
    );
  }

  const elects = isRuntimeElection(decoded.artRuntimeId);

  if (!approvedArtSelector) {
    // ABSENCE IS NOT PERMISSION. An approval that never established an election cannot show that
    // THIS one is the one that was approved, and a runtime bound to a project is bound forever.
    if (elects) {
      return refuse(
        "ART_SELECTOR_NOT_APPROVED",
        `the calldata elects art runtime ${decoded.artRuntimeId}, and the approved build carries no art selector — so there is nothing this election can be shown to match. An election nobody approved is not an approved election.`,
      );
    }
    // Runtime half 0 is "no preference", not a runtime: the chain resolves its generic runtime.
    // That is what every launch did before the Wave-1 engines existed, and an approval that predates
    // the field describes it truthfully.
    return { kind: "ALLOWED", artRuntimeId: decoded.artRuntimeId, templateId: decoded.templateId };
  }

  if (approvedArtSelector.chainId !== request.chainId) {
    return refuse(
      "ART_SELECTOR_NOT_APPROVED",
      `the approved art selector was read on chain ${approvedArtSelector.chainId} and this request is for chain ${request.chainId}. Registry ids are per chain, so the same number names a different runtime — or none — on another one.`,
    );
  }

  const approvedRuntimeId = approvedArtSelector.artRuntimeId;
  if (approvedRuntimeId === null) {
    return refuse(
      "ART_RUNTIME_NOT_ACTIVE_ON_CHAIN",
      `the approved build names ${approvedArtSelector.runtimeTag} but resolved no numeric id for it on chain ${request.chainId}. An unresolved election is not an absent one and it is not a zero; nothing was established, so nothing can be signed on it.`,
    );
  }
  if (decoded.artRuntimeId !== approvedRuntimeId) {
    return refuse(
      "ART_SELECTOR_NOT_APPROVED",
      `the calldata elects art runtime ${decoded.artRuntimeId}${elects ? "" : " (0 — NO PREFERENCE, which resolves to this chain's generic runtime and is not a runtime)"} and the approved build elects ${approvedRuntimeId} (${approvedArtSelector.runtimeTag}). ` +
        "The art binding is one-shot; a launch that binds the wrong runtime renders the wrong art permanently.",
    );
  }
  if (decoded.templateId.toString() !== String(approvedArtSelector.templateId)) {
    return refuse(
      "ART_SELECTOR_NOT_APPROVED",
      `the calldata binds template ${decoded.templateId} and the approved build binds ${approvedArtSelector.templateId}.`,
    );
  }

  // THE POLICY'S OWN RUNTIME ALLOWLIST, against the stable string id. The numeric half is a chain
  // fact and a creator does not write numbers into a policy; the tag is what they wrote.
  if (!policy.allowedRuntimes.some((allowed) => runtimeTagAllowed(allowed, approvedArtSelector.runtimeTag))) {
    return refuse(
      "ART_RUNTIME_NOT_ALLOWED_BY_POLICY",
      `the calldata launches on ${approvedArtSelector.runtimeTag} (art runtime ${decoded.artRuntimeId}); the policy allows ${policy.allowedRuntimes.join(", ")}.`,
    );
  }

  // THE CHAIN'S OWN ANSWER, as it was read. Registered is not active, active is not deployed, and an
  // incomplete enumeration is none of the three — it is nobody's answer, and a launch built on it is
  // a launch built on a read that did not finish.
  if (!approvedArtSelector.registryComplete) {
    return refuse(
      "ART_RUNTIME_NOT_ACTIVE_ON_CHAIN",
      `the art runtime registry on chain ${request.chainId} was not read completely when this build was approved, so ${approvedArtSelector.runtimeTag} was never shown to be active there. An unread registry is not an absence and it is not a presence.`,
    );
  }
  if (!approvedArtSelector.exists || !approvedArtSelector.active) {
    return refuse(
      "ART_RUNTIME_NOT_ACTIVE_ON_CHAIN",
      `${approvedArtSelector.runtimeTag} is ${approvedArtSelector.exists ? "registered but not active" : "not registered"} at id ${approvedRuntimeId} on chain ${request.chainId}.`,
    );
  }
  if (!approvedArtSelector.runtimeAddress || BigInt(approvedArtSelector.runtimeAddress) === 0n) {
    // THE ZERO-ADDRESS TRAP, carried through to the signer. `runtimeInfo` does not revert for an
    // unregistered id — it answers with the zero address — so "the read succeeded" is not "the
    // runtime exists".
    return refuse("ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", `${approvedArtSelector.runtimeTag} resolved to the zero address at id ${approvedRuntimeId}; a successful registry call is not a resolved runtime.`);
  }
  if (approvedArtSelector.runtimeCodeBytes !== null && approvedArtSelector.runtimeCodeBytes <= 0) {
    return refuse("ART_RUNTIME_NOT_ACTIVE_ON_CHAIN", `${approvedArtSelector.runtimeTag} is registered at id ${approvedRuntimeId} but ${approvedArtSelector.runtimeAddress} holds no code on chain ${request.chainId}.`);
  }

  return { kind: "ALLOWED", artRuntimeId: decoded.artRuntimeId, templateId: decoded.templateId };
}

/**
 * Whether a policy or grant entry admits a runtime tag.
 *
 * ONE RULE, SHARED WITH THE GRANT GUARD, because two spellings of the same list are already in use:
 * a policy fixture says `SOLIDITY_SVG` and a grant says `SOLIDITY_SVG_V1`. The prefix arm tolerates
 * the unversioned form and the length floor stops a two-character entry matching everything.
 */
export function runtimeTagAllowed(allowed: string, tag: string): boolean {
  return allowed === tag || (tag.startsWith(allowed) && allowed.length > 4);
}
