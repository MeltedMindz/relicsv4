// SPDX-License-Identifier: MIT
// ================================================================================================
// WHAT TO DO ABOUT IT — the sentence that has to travel with every code.
//
// The autonomous surface is JSON-first and its codes are stable, which is right: a program branches
// on `GAS_PRICE_EXCEEDS_POLICY` and never parses prose. But the same codes reach a person, in a
// terminal, at the moment their launch stopped — and `refused: SIGNER_LOCKED` tells that person
// nothing they can act on. Worse, it tells an AI agent nothing either, so the agent guesses; and
// the most available guess for "the signer will not sign" is to offer to supply a key.
//
// SO EVERY REMEDY HERE ANSWERS THREE THINGS: what happened, who fixes it, and the exact command.
// The owner is not decoration — it is what stops an agent asking a creator to do the agent's work,
// and what stops it attempting a creator's.
//
// NOTHING HERE EVER SUGGESTS SUPPLYING A PRIVATE KEY, and `check-autonomous-controls` has a scan
// for that phrasing. An error message is read at the exact moment someone is willing to do
// something unwise to make the error stop.
// ================================================================================================

export const OWNERS = ["AGENT_CAN_FIX", "CREATOR_ACTION_REQUIRED", "EXTERNAL_SERVICE", "CHAIN_STATE"];

const R = (owner, what, command) => ({ owner, what, command });

/**
 * Keyed by the code as it appears on the wire. Sources: `SignerRefusalCode` in the launch SDK's
 * contracts, `AuthorizationProblem` in the signer's authorization module, and the handful this CLI
 * raises itself. One table, so a code cannot acquire two different pieces of advice.
 */
export const REMEDIES = {
  // ---- the grant --------------------------------------------------------------------------------
  NO_AUTHORIZATION: R(
    "CREATOR_ACTION_REQUIRED",
    "Nothing on this machine has been authorized to launch. An agent cannot grant this to itself — that is the whole reason the grant exists.",
    "npm run kit -- agent setup",
  ),
  AUTHORIZATION_EXPIRED: R(
    "CREATOR_ACTION_REQUIRED",
    "The authorization has expired. Autonomous authority is time-bounded on purpose, so this is the system working rather than failing.",
    "npm run kit -- agent setup",
  ),
  AUTHORIZATION_REVOKED: R(
    "CREATOR_ACTION_REQUIRED",
    "The creator revoked this authorization. Every launch under it is refused, including one already built and checked.",
    "npm run kit -- agent setup",
  ),
  AUTHORIZATION_CONSUMED: R(
    "CREATOR_ACTION_REQUIRED",
    "This grant covered a fixed number of launches and they are used. Someone who agreed to one launch has not agreed to a second one.",
    "npm run kit -- agent setup",
  ),
  AUTHORIZATION_NOT_FOR_THIS_SIGNER: R(
    "CREATOR_ACTION_REQUIRED",
    "The grant was issued for a different wallet. A grant is bound to the key it was given for.",
    "npm run kit -- agent ready",
  ),
  AUTHORIZATION_UNREADABLE: R(
    "CREATOR_ACTION_REQUIRED",
    "The authorization file cannot be read by this version of the signer.",
    "npm run kit -- agent setup",
  ),

  // ---- the wallet -------------------------------------------------------------------------------
  SIGNER_LOCKED: R(
    "CREATOR_ACTION_REQUIRED",
    "Your protected signer is locked. Its passphrase is read from the creator's terminal and exists nowhere else — the AI agent cannot perform this step, and there is no flag, file or environment variable that substitutes for it.",
    "npm run kit -- wallet unlock",
  ),
  NO_WALLET: R(
    "CREATOR_ACTION_REQUIRED",
    "There is no launch wallet on this machine. Creating one needs a passphrase only the creator will know.",
    "npm run kit -- agent setup",
  ),
  SIGNER_NOT_CONFIGURED: R(
    "CREATOR_ACTION_REQUIRED",
    "No signer process is reachable. The agent never holds a key; it hands a signing request to something that does.",
    "npm run kit -- agent ready",
  ),

  // ---- the signer's own refusals ---------------------------------------------------------------
  CHAIN_NOT_ALLOWED: R("CREATOR_ACTION_REQUIRED", "The transaction targets a chain this authorization does not cover.", "npm run kit -- agent setup"),
  TARGET_NOT_CANONICAL_FACTORY: R("AGENT_CAN_FIX", "The transaction is addressed to something other than the launchpad factory for that chain. Rebuild it from the current chain profile rather than from a cached address.", "npm run kit -- agent build --workspace <dir> --json"),
  SELECTOR_NOT_ALLOWED: R("AGENT_CAN_FIX", "The calldata calls a function the signer will not sign. This boundary signs launches and nothing else.", "npm run kit -- agent build --workspace <dir> --json"),
  VALUE_EXCEEDS_POLICY: R("AGENT_CAN_FIX", "The transaction sends more native value than the policy permits. A launch sends none.", "npm run kit -- agent policy-check --workspace <dir> --json"),
  GAS_EXCEEDS_POLICY: R("CREATOR_ACTION_REQUIRED", "The transaction needs more gas than the authorization allows. Raising it is a spending decision, so it is the creator's.", "npm run kit -- agent setup"),
  GAS_PRICE_EXCEEDS_POLICY: R("CHAIN_STATE", "The network's current fee is above the ceiling the creator authorized. Nobody here can lower the fee; wait, or authorize a higher ceiling.", "npm run kit -- agent setup"),
  CALLDATA_HASH_MISMATCH: R("AGENT_CAN_FIX", "The bytes presented for signature are not the bytes that were approved. Re-run the build so the approval covers what is actually being signed.", "npm run kit -- agent build --workspace <dir> --json"),
  POLICY_HASH_MISMATCH: R("CREATOR_ACTION_REQUIRED", "relics.agent.json changed after this build was approved, so the approval no longer covers it. A ceiling edited after the fact is not a ceiling anyone agreed to.", "npm run kit -- agent setup"),
  LAUNCH_PLAN_HASH_MISMATCH: R("AGENT_CAN_FIX", "The launch plan behind this transaction is not the one that was simulated. Re-run prepare through build.", "npm run kit -- agent run --workspace <dir> --json"),
  BUNDLE_HASH_MISMATCH: R("AGENT_CAN_FIX", "The project bundle changed after the build. Re-export and rebuild so the signature covers the art that actually ships.", "npm run kit -- agent run --workspace <dir> --json"),
  RECIPIENT_NOT_POLICY_RECIPIENT: R("AGENT_CAN_FIX", "The creator recipient in the calldata is not the one the creator authorized. Rebuild from the policy rather than from anything else.", "npm run kit -- agent prepare --workspace <dir> --json"),
  SIGNER_DOES_NOT_SUPPORT_CHAIN: R("CREATOR_ACTION_REQUIRED", "The configured signer cannot sign for that chain.", "npm run kit -- agent ready"),
  NO_APPROVED_BUILD: R("AGENT_CAN_FIX", "Nothing has been approved for signing yet. The proof chain cannot be skipped: each phase is a prerequisite of the next.", "npm run kit -- agent run --workspace <dir> --json"),

  // ---- the GRANT's own refusals (grantGuard) ----------------------------------------------------
  //
  // Distinct from the signer refusals above and worth keeping distinct: those are about the SHAPE of
  // a transaction, these are about what a person agreed to. "Your transaction is malformed" and
  // "you did not authorize this" want different readers to do different things.
  TOTAL_GAS_COST_EXCEEDS_AUTHORIZATION: R("CREATOR_ACTION_REQUIRED", "The gas limit times the fee is more than the total network fee the creator authorized. That total is the one number they were actually asked for, so raising it is theirs to decide.", "npm run kit -- agent setup"),
  RUNTIME_NOT_AUTHORIZED: R("CREATOR_ACTION_REQUIRED", "The launch uses an art runtime this grant does not cover.", "npm run kit -- agent setup"),
  ANTISNIPE_NOT_AUTHORIZED: R("CREATOR_ACTION_REQUIRED", "The launch elects an anti-snipe mode this grant does not cover. The election is immutable once launched, so it is not something to widen quietly.", "npm run kit -- agent setup"),
  ROYALTY_EXCEEDS_AUTHORIZATION: R("AGENT_CAN_FIX", "The royalty in the calldata is above the authorized ceiling. Lower it in the project configuration and rebuild.", "npm run kit -- agent prepare --workspace <dir> --json"),
  RECIPIENT_NOT_AUTHORIZED: R("AGENT_CAN_FIX", "The creator recipient in the calldata is not the one the grant names. Rebuild from the policy; never from a brief, a receipt or the signer's own address.", "npm run kit -- agent prepare --workspace <dir> --json"),
  CHAIN_NOT_AUTHORIZED: R("CREATOR_ACTION_REQUIRED", "The grant does not cover that chain.", "npm run kit -- agent setup"),
  NO_SIMULATION_RECEIPT: R("AGENT_CAN_FIX", "Nothing proves these exact bytes were simulated. Run the simulation and carry its receipt with the request.", "npm run kit -- agent simulate --workspace <dir> --json"),
  SIMULATION_CALLDATA_MISMATCH: R("AGENT_CAN_FIX", "The simulation receipt is of DIFFERENT bytes than the ones presented for signature. Re-simulate what is actually going to be signed.", "npm run kit -- agent simulate --workspace <dir> --json"),
  BROADCAST_NOT_AUTHORIZED: R("CREATOR_ACTION_REQUIRED", "This grant builds transactions but does not permit sending them. That was the preset the creator chose, so the run stopping here is the system working.", "npm run kit -- agent setup"),
  LAUNCH_PARAMS_FIELD_COUNT_WRONG: R("AGENT_CAN_FIX", "The launch parameters do not have the shape this release expects, so the grant cannot check them field by field. Rebuild against the current SDK.", "npm run kit -- agent build --workspace <dir> --json"),

  // ---- the environment --------------------------------------------------------------------------
  NO_METADATA_PROVIDER: R("CREATOR_ACTION_REQUIRED", "No pinning provider is configured. Metadata is written at birth and can never be changed, so it must be pinned and read back before the launch is built. A credential belongs in the shell, never in a file this kit writes.", "export PINATA_JWT='…'"),
  NO_RPC: R("CREATOR_ACTION_REQUIRED", "This chain has no configured endpoint, so it is read through a public, rate-limited one — and a partial read is an UNKNOWN rather than a refusal, which preflight will not admit.", "export <CHAIN>_RPC_URL='…'"),
};

/** The remedy for a code, or null. Never invents one: an unrecognised code says so. */
export function remedyFor(code) {
  return REMEDIES[String(code ?? "")] ?? null;
}

/**
 * Attach the remedy to a message the reader is about to see.
 *
 * The CODE STAYS FIRST. A program that greps for it still finds it, and a person still gets the
 * sentence. Dropping the code to make the prose read better would break the machine reader that
 * the JSON envelope exists for.
 */
export function explainCode(code, detail = "") {
  const remedy = remedyFor(code);
  const head = detail ? `${code}: ${detail}` : String(code);
  if (!remedy) return head;
  return [
    head,
    "",
    `  ${remedy.what}`,
    `  → ${remedy.command}`,
    `  (${remedy.owner === "AGENT_CAN_FIX" ? "the AI agent can do this now, without asking" : remedy.owner === "CREATOR_ACTION_REQUIRED" ? "only the creator can do this" : remedy.owner === "CHAIN_STATE" ? "this is the chain's answer; nobody here can change it" : "something outside this machine is unconfigured or unreachable"})`,
  ].join("\n");
}
