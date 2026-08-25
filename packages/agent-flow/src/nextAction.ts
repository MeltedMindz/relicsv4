// SPDX-License-Identifier: MIT
// ================================================================================================
// THE NEXT-ACTION CONTRACT.
//
// This is the interface an external coding agent — Claude Code, Codex, Cursor, Aider, anything with
// a terminal — actually drives. It answers one question: given everything on disk and everything
// the chain just said, WHAT DO I DO NEXT?
//
// THE VOCABULARY IS CLOSED. An agent branches on `action` and `reasonCode`, never on prose. That is
// what makes this repo operable by a model that has never read it: there is nothing to
// reverse-engineer from decorative terminal output, and a new situation must be given a name here
// rather than being explained in a sentence nobody can match on.
//
// `commands` IS THE ESCAPE HATCH THAT KEEPS IT HONEST. Every result carries the exact commands that
// advance it, so an agent that does not recognise a `reasonCode` can still make progress, and a
// human reading a transcript can reproduce the run by hand.
// ================================================================================================
import type { LaunchState, NextAction, NextActionResult } from "@relics/launch-sdk";

/**
 * EVERY COMMAND STRING RETURNED BY THIS MODULE MUST BE ONE THE CLI ANSWERS TO.
 *
 * This file's whole purpose is that an agent can follow `commands` literally without knowing
 * anything about the repository. Two of them named subcommands that did not exist — `agent finalise`
 * and `agent art-check` — so an agent doing exactly what it was told got `unknown subcommand` and
 * exit 2. Prose cannot be checked; this list can, and `npm run agent:commands` derives the real
 * surface from the CLI's own dispatcher and fails if anything here is not in it.
 */
export const NEXT_ACTION_SUBCOMMANDS = [
  "init", "status", "doctor", "next", "capabilities", "chains", "quotes", "preflight", "plan",
  "metadata", "prepare", "predict", "simulate", "build", "policy-check",
  "broadcast", "confirm", "verify", "resume", "run", "provenance", "verify-receipts",
  // `chains` and `plan` are ALIASES the dispatcher answers to (`chains` -> capabilities,
  // `plan` -> preflight). They are declared because the gate compares this list against the
  // dispatcher in BOTH directions: a command the CLI answers to that nothing here knows about is
  // just as much a drift as the reverse.
] as const;

export interface FlowFacts {
  readonly state: LaunchState;
  readonly hasPolicy: boolean;
  readonly policyProblems: readonly string[];
  readonly hasBrief: boolean;
  readonly hasArt: boolean;
  readonly artProblems: readonly string[];
  readonly validationErrors: readonly string[];
  readonly hasBundle: boolean;
  readonly chainSelected: number | null;
  readonly chainBlockers: readonly string[];
  readonly signerConfigured: boolean;
  readonly signerAddress: string | null;
  readonly signerFunded: boolean | null;
  readonly metadataProviderConfigured: boolean;
  readonly metadataPublished: boolean;
  readonly simulated: boolean;
  readonly simulationRevert: string | null;
  readonly built: boolean;
  readonly policyApproved: boolean;
  readonly broadcastTxHash: string | null;
  readonly confirmed: boolean;
  readonly verified: boolean;
  readonly verificationFailures: readonly string[];
  readonly allowBroadcast: boolean;
  readonly goal: "BUILD_ONLY" | "LAUNCH";
  readonly receiptPaths: readonly string[];
}

function result(
  state: LaunchState,
  action: NextAction,
  reasonCode: string,
  reason: string,
  extra?: Partial<NextActionResult>,
): NextActionResult {
  return {
    schemaVersion: 1, state, action, reasonCode, reason,
    requiredInputs: extra?.requiredInputs ?? [],
    allowedMutations: extra?.allowedMutations ?? [],
    commands: extra?.commands ?? [],
    receipts: extra?.receipts ?? [],
    errors: extra?.errors ?? [],
    warnings: extra?.warnings ?? [],
  };
}

/**
 * Decide the next action.
 *
 * ORDER IS SIGNIFICANT AND IS NOT THE STATE ORDER. Blockers that no amount of local work can fix —
 * a missing signer, an unfunded one, an unconfigured provider — are reported BEFORE creative work,
 * so an agent is never sent off to iterate on artwork for an hour and only then told it could never
 * have launched. That ordering is the difference between an autonomous run and a wasted one.
 */
export function decideNextAction(f: FlowFacts): NextActionResult {
  const R = { receipts: f.receiptPaths };

  // ---- terminal states first -------------------------------------------------------------------
  if (f.state === "COMPLETE") {
    return result(f.state, "COMPLETE", "COMPLETE", "The project is launched, confirmed and independently verified against chain state.", R);
  }
  if (f.verified && f.state === "VERIFIED") {
    return result(f.state, "COMPLETE", "VERIFIED", "Verification passed and `agent verify` has already written launch-result.json. There is nothing further to run.", { ...R, commands: [] });
  }

  // ---- anything already on chain is reconciled against chain, never re-derived -------------------
  if (f.broadcastTxHash && !f.confirmed) {
    return result(f.state, "WAIT_CONFIRMATION", "AWAITING_CONFIRMATION", `Transaction ${f.broadcastTxHash} was broadcast and is not yet confirmed to the required depth. A hash is not a launch: wait for a receipt with status 1.`, { ...R, commands: [`npm run kit -- agent confirm --workspace <dir> --json`] });
  }
  if (f.confirmed && !f.verified) {
    if (f.verificationFailures.length > 0) {
      return result(f.state, "BLOCKED", "VERIFICATION_FAILED", "The transaction confirmed but independent verification found a mismatch. This is not a launch that can be marked complete.", { ...R, errors: [...f.verificationFailures] });
    }
    return result(f.state, "VERIFY", "CONFIRMED_AWAITING_VERIFY", "The transaction is confirmed. Read the result back off the chain and compare it with the prediction.", { ...R, commands: ["npm run kit -- agent verify --workspace <dir> --json"] });
  }

  // ---- authorization boundary --------------------------------------------------------------------
  if (!f.hasPolicy) {
    return result(f.state, "BLOCKED", "NO_POLICY", "There is no relics.agent.json. It is the authorization boundary: without it nothing may be signed or sent on the creator's behalf.", { ...R, requiredInputs: ["relics.agent.json"], commands: ["npm run kit -- agent init --workspace <dir>"] });
  }
  if (f.policyProblems.length > 0) {
    return result(f.state, "BLOCKED", "POLICY_INVALID", "relics.agent.json was refused. Unknown fields fail closed on purpose: a silently-ignored ceiling is an absent ceiling.", { ...R, errors: [...f.policyProblems], allowedMutations: ["relics.agent.json"] });
  }

  // ---- blockers that creative work cannot fix ----------------------------------------------------
  if (f.goal === "LAUNCH" && !f.signerConfigured) {
    return result(f.state, "CONFIGURE_SIGNER", "NO_SIGNER", "The goal is LAUNCH but no signer adapter is configured. The agent never holds a key; it hands a SigningRequest to a signer that checks it independently.", { ...R, requiredInputs: ["RELICS_SIGNER_URL or a configured adapter"], commands: ["npm run kit -- agent doctor --workspace <dir> --json"] });
  }
  if (f.goal === "LAUNCH" && f.signerFunded === false) {
    return result(f.state, "FUND_SIGNER", "SIGNER_UNDERFUNDED", `The signer ${f.signerAddress ?? ""} does not hold enough native currency to pay for a launch at the current gas price on any allowed chain.`, { ...R, requiredInputs: ["native currency at the signer address"] });
  }
  if (f.goal === "LAUNCH" && !f.metadataProviderConfigured) {
    return result(f.state, "CONFIGURE_PROVIDER", "NO_METADATA_PROVIDER", "No metadata provider is configured. A collection's metadata is written at birth and cannot be changed afterwards, so it must be pinned and read back before the launch is built.", { ...R, requiredInputs: ["PINATA_JWT or another configured provider"] });
  }

  // ---- creative work ------------------------------------------------------------------------------
  if (!f.hasBrief) {
    return result(f.state, "BLOCKED", "NO_BRIEF", "There is no brief to work from.", { ...R, requiredInputs: ["brief.md"] });
  }
  if (!f.hasArt) {
    return result(f.state, "WRITE_ART", "ART_ABSENT", "The project has no art configuration yet. Author it against a runtime that is currently LAUNCHABLE — the goal is a launch, so a preview-only runtime would be discovered as unusable only at the end.", { ...R, allowedMutations: ["generator/**", "project.json"], commands: ["npm run kit -- preview --seeds 8", "npm run kit -- agent status --workspace <dir> --json"] });
  }
  if (f.artProblems.length > 0) {
    return result(f.state, "FIX_ART", "ART_QUALITY_GATE_FAILED", "The art was produced but did not pass the objective collection checks.", { ...R, errors: [...f.artProblems], allowedMutations: ["generator/**"], commands: ["npm run kit -- preview --seeds 24", "npm run kit -- validate <dir>"] });
  }
  if (f.validationErrors.length > 0) {
    return result(f.state, "FIX_VALIDATION", "VALIDATION_ERRORS", "The project does not validate against the canonical schema. Never edit the schema to pass; edit the project.", { ...R, errors: [...f.validationErrors], allowedMutations: ["project.json", "generator/**", "metadata/**"] });
  }
  if (!f.hasBundle) {
    return result(f.state, "CONFIGURE_PROJECT", "NOT_EXPORTED", "The project validates but no .relics bundle has been exported.", { ...R, commands: ["npm run kit -- export --out project.relics"] });
  }

  // ---- chain ---------------------------------------------------------------------------------------
  if (f.chainSelected === null) {
    if (f.chainBlockers.length > 0) {
      return result(f.state, "BLOCKED", "NO_ADMISSIBLE_CHAIN", "No allowed chain passed admission. Every requirement is a live read, so this is a statement about the chains right now, not about the configuration.", { ...R, errors: [...f.chainBlockers] });
    }
    return result(f.state, "READY_FOR_PREFLIGHT", "CHAIN_NOT_SELECTED", "Ready to read the allowed chains and select one deterministically.", { ...R, commands: ["npm run kit -- agent preflight --workspace <dir> --json"] });
  }
  if (!f.metadataPublished) {
    return result(f.state, "READY_FOR_METADATA", "METADATA_NOT_PUBLISHED", "The chain is selected. Publish the metadata, fetch it back and verify the bytes before anything is prepared — a pin receipt is not evidence that anyone can read it.", { ...R, commands: ["npm run kit -- agent metadata --workspace <dir> --json"] });
  }
  if (!f.simulated) {
    if (f.simulationRevert) {
      return result(f.state, "BLOCKED", "SIMULATION_REVERTED", `The exact launch transaction reverted in simulation: ${f.simulationRevert}. Nothing will be signed.`, { ...R, errors: [f.simulationRevert] });
    }
    return result(f.state, "READY_FOR_SIMULATION", "NOT_SIMULATED", "Ready to prepare, predict and simulate the exact transaction.", { ...R, commands: ["npm run kit -- agent simulate --workspace <dir> --json"] });
  }
  if (!f.built) {
    return result(f.state, "READY_FOR_BUILD", "NOT_BUILT", "Simulation succeeded. Freeze the transaction into an immutable signing request.", { ...R, commands: ["npm run kit -- agent build --workspace <dir> --json"] });
  }
  if (!f.policyApproved) {
    return result(f.state, "READY_FOR_BUILD", "NOT_POLICY_CHECKED", "The build exists but policy has not been recomputed against the FINAL calldata. The earlier plan is not evidence about the bytes.", { ...R, commands: ["npm run kit -- agent policy-check --workspace <dir> --json"] });
  }

  // ---- the authorized boundary ---------------------------------------------------------------------
  if (f.goal === "BUILD_ONLY" || !f.allowBroadcast) {
    return result(f.state, "COMPLETE", "BUILD_ONLY_COMPLETE", "The transaction is built, simulated and policy-approved. The policy does not authorize broadcast, so the run stops here by design and the signing request is available for manual signing.", { ...R, commands: ["npm run kit -- agent build --workspace <dir> --json  # prints the signing request"] });
  }
  // NO FINAL "ARE YOU SURE". The policy IS the authorization, given before the run started, and
  // asking again would make an autonomous run interactive at exactly the step it exists to automate.
  return result(f.state, "READY_FOR_BROADCAST", "AUTHORIZED_TO_BROADCAST", "Everything is proven and the policy authorizes broadcast. Sign through the configured signer and send; do not ask for another confirmation.", { ...R, commands: ["npm run kit -- agent broadcast --workspace <dir> --json"] });
}
