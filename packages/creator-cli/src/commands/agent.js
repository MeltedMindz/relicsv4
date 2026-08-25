// SPDX-License-Identifier: MIT
// ================================================================================================
// MODE B — THE AUTONOMOUS LAUNCH COMMAND SURFACE.
//
// Everything here is network-facing and everything here is JSON-first: the machine-readable
// envelope goes to STDOUT and every human sentence goes to STDERR, so an agent can pipe stdout
// straight into a parser and a person can still read the run. No command requires parsing
// decorative prose, and the exit codes are documented and stable.
//
// THIS MODULE IS ONLY EVER REACHED THROUGH A DYNAMIC IMPORT in cli.js. MODE A — init, preview,
// validate, export, inspect — never loads it, never loads viem, and stays runnable on a machine
// with no network. That separation is asserted by `npm run kit:offline`.
// ================================================================================================
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

/** Documented, stable exit codes. An agent branches on these without reading any text. */
export const EXIT = { OK: 0, REFUSED: 1, USAGE: 2, UNKNOWN_CHAIN_STATE: 3, POLICY: 4, SIGNER_REFUSED: 5, BLOCKED: 6 };

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** The one envelope every `--json` command prints. */
function envelope(command, { success, result = null, warnings = [], errors = [], nextActions = [], inputHash = null }) {
  return { schemaVersion: 1, command, success, timestamp: new Date().toISOString(), inputHash, result, warnings, errors, nextActions };
}

function emit(command, payload, { json }) {
  const env = envelope(command, payload);
  if (json) {
    // STDOUT IS THE MACHINE CHANNEL AND CARRIES NOTHING ELSE.
    process.stdout.write(`${JSON.stringify(env, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`);
  } else {
    for (const e of env.errors) process.stderr.write(`error: ${e}\n`);
    for (const w of env.warnings) process.stderr.write(`warn:  ${w}\n`);
    process.stderr.write(`${env.success ? "ok" : "refused"}: ${command}\n`);
    if (env.result) process.stderr.write(`${JSON.stringify(env.result, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`);
  }
  return env;
}

const AGENT_DIR = ".relics-agent";

function workspaceOf(flags, positional) {
  return resolve(flags.workspace ?? positional[0] ?? ".");
}

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { __parseError: err instanceof Error ? err.message : String(err) };
  }
}

/** Load and validate the policy, or return a typed refusal. */
async function loadPolicy(workspace, flags) {
  const { parseAgentPolicy } = await import("@relics/launch-sdk");
  const path = resolve(flags.policy ?? join(workspace, "relics.agent.json"));
  if (!existsSync(path)) {
    return { ok: false, path, issues: [{ field: "$", code: "NOT_FOUND", detail: `no policy at ${path}. relics.agent.json is the authorization boundary; without it nothing may be signed or sent.` }] };
  }
  const raw = readJsonIfPresent(path);
  if (raw?.__parseError) return { ok: false, path, issues: [{ field: "$", code: "NOT_JSON", detail: raw.__parseError }] };
  const parsed = parseAgentPolicy(raw);
  return parsed.ok ? { ok: true, path, policy: parsed.policy, policyHash: parsed.policyHash, warnings: parsed.warnings } : { ok: false, path, issues: parsed.issues };
}

// ------------------------------------------------------------------------------------------------
// COMMANDS
// ------------------------------------------------------------------------------------------------

export async function runNetworkedCommand(group, positional, flags) {
  const sub = positional[0] ?? "status";
  const rest = positional.slice(1);
  const json = Boolean(flags.json);
  const workspace = workspaceOf(flags, rest);
  const name = `${group} ${sub}`;

  try {
    switch (sub) {
      case "init": return await cmdInit(name, workspace, flags, json);
      case "status": return await cmdStatus(name, workspace, flags, json);
      case "doctor": return await cmdDoctor(name, workspace, flags, json);
      case "next": return await cmdNext(name, workspace, flags, json);
      case "chains":
      case "capabilities": return await cmdCapabilities(name, workspace, flags, json);
      case "quotes": return await cmdQuotes(name, workspace, flags, json);
      case "plan":
      case "preflight": return await cmdPreflight(name, workspace, flags, json);
      case "provenance": return await cmdProvenance(name, json);
      case "verify-receipts": return await cmdVerifyReceipts(name, workspace, json);
      default:
        emit(name, { success: false, errors: [`unknown subcommand "${sub}". Known: init, status, doctor, next, capabilities, quotes, preflight, provenance, verify-receipts`] }, { json });
        return EXIT.USAGE;
    }
  } catch (err) {
    emit(name, { success: false, errors: [err instanceof Error ? err.message : String(err)] }, { json });
    return EXIT.REFUSED;
  }
}

/** Scaffold `relics.agent.json` with every ceiling present and broadcast OFF. */
async function cmdInit(name, workspace, flags, json) {
  const path = join(workspace, "relics.agent.json");
  if (existsSync(path) && !flags.force) {
    emit(name, { success: false, errors: [`${path} already exists; pass --force to overwrite`] }, { json });
    return EXIT.REFUSED;
  }
  mkdirSync(workspace, { recursive: true });
  const template = {
    $comment: [
      "THE AUTHORIZATION BOUNDARY. This file is NOT part of your .relics project and must never be",
      "packed into one: a bundle describes art, this describes what an agent may do with your signer",
      "and your money. Unknown fields are REFUSED rather than ignored, because a silently-dropped",
      "ceiling is an absent ceiling.",
      "allowBroadcast ships FALSE. Setting it true is the moment you authorize an autonomous launch;",
      "after that the agent will not ask again, because asking again is what this file replaces.",
    ],
    version: 1,
    goal: "BUILD_ONLY",
    allowedChains: [1, 8453, 4663],
    chainSelection: "PREFERRED_THEN_GAS",
    allowedRuntimes: ["SOLIDITY_SVG_V1"],
    allowedQuoteAssets: "AUTO",
    creatorRecipient: "0x0000000000000000000000000000000000000000",
    allowedAntiSnipeModes: ["NONE", "PROTECTED_98_MINUTES"],
    antiSnipePreference: "AUTO",
    maxRoyaltyBps: 500,
    maxNativeSpendWei: "0",
    maxGasPriceWei: "50000000000",
    maxTransactionGas: "16000000",
    requireSimulation: true,
    requireMetadataReadback: true,
    requireDeterministicPrediction: true,
    requiredConfirmations: 2,
    allowBroadcast: false,
    signer: "local-sidecar",
  };
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`);
  emit(name, {
    success: true,
    result: { path, goal: template.goal, allowBroadcast: template.allowBroadcast },
    warnings: ["creatorRecipient is the zero address and MUST be set to a real address you control. It is never derived from the signer: the wallet that pays for a launch and the wallet that receives the creator fee stream are routinely different."],
    nextActions: ["CONFIGURE_PROJECT"],
  }, { json });
  return EXIT.OK;
}

/** Everything on disk plus the policy verdict. No chain reads: `doctor` and `preflight` do those. */
async function cmdStatus(name, workspace, flags, json) {
  const { verifyReceiptChain, listReceipts } = await import("@relics/agent-flow");
  const policy = await loadPolicy(workspace, flags);
  const chain = verifyReceiptChain(workspace);
  const receipts = listReceipts(workspace);
  const result = {
    workspace,
    policy: policy.ok ? { path: policy.path, goal: policy.policy.goal, allowBroadcast: policy.policy.allowBroadcast, policyHash: policy.policyHash, allowedChains: policy.policy.allowedChains } : { path: policy.path, valid: false },
    receipts: { count: receipts.length, chainIntact: chain.intact, detail: chain.detail, phases: receipts.map((r) => r.phase) },
    brief: existsSync(join(workspace, "brief.md")),
    bundle: existsSync(join(workspace, "project.relics")),
  };
  emit(name, { success: policy.ok && chain.intact, result, errors: policy.ok ? (chain.intact ? [] : [chain.detail]) : policy.issues.map((i) => `${i.field}: ${i.detail}`) }, { json });
  return policy.ok && chain.intact ? EXIT.OK : EXIT.REFUSED;
}

/** Is this machine configured to run an autonomous launch at all? */
async function cmdDoctor(name, workspace, flags, json) {
  const policy = await loadPolicy(workspace, flags);
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok, detail });

  add("policy.present", policy.ok, policy.ok ? `valid policy at ${policy.path}` : policy.issues.map((i) => i.detail).join("; "));

  const { knownChainIds, getChainProfile, resolveRpc } = await import("@relics/launch-sdk");
  for (const id of knownChainIds()) {
    const profile = getChainProfile(id);
    if (!profile) continue;
    const rpc = resolveRpc(profile);
    // THE VALUE IS NEVER PRINTED. `source` is what a reader needs and the URL may carry a credential.
    add(`rpc.${id}`, rpc !== null, rpc === null ? `no endpoint: set ${profile.rpcEnvKey}` : rpc.source === "PUBLIC_FALLBACK" ? `using the PUBLIC fallback because ${profile.rpcEnvKey} is unset — rate-limited, and a partial read is an UNKNOWN rather than a refusal` : `configured via ${profile.rpcEnvKey}`);
  }

  const signerUrl = process.env.RELICS_SIGNER_URL ?? null;
  add("signer.configured", Boolean(signerUrl), signerUrl ? "RELICS_SIGNER_URL is set" : "no RELICS_SIGNER_URL. The agent never holds a key; it needs a signer process to hand a SigningRequest to.");
  add("metadata.provider", Boolean(process.env.PINATA_JWT), process.env.PINATA_JWT ? "a pinning provider is configured" : "no PINATA_JWT. Metadata is written at birth and cannot be changed afterwards, so it must be pinned and read back before the launch is built.");

  const ok = checks.every((c) => c.ok);
  emit(name, { success: ok, result: { checks }, errors: checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`) }, { json });
  return ok ? EXIT.OK : EXIT.BLOCKED;
}

/** What the external coding agent should do next. */
async function cmdNext(name, workspace, flags, json) {
  const { decideNextAction } = await import("@relics/agent-flow");
  const { listReceipts } = await import("@relics/agent-flow");
  const policy = await loadPolicy(workspace, flags);
  const receipts = listReceipts(workspace);
  const has = (phase) => receipts.some((r) => r.phase === phase);

  const facts = {
    state: has("VERIFY") ? "VERIFIED" : has("BROADCAST") ? "BROADCAST" : has("BUILD") ? "BUILT" : has("SIMULATE") ? "SIMULATED" : has("METADATA") ? "METADATA_PUBLISHED" : has("PREFLIGHT") ? "CHAIN_SELECTED" : "BRIEF_RECEIVED",
    hasPolicy: policy.ok,
    policyProblems: policy.ok ? [] : policy.issues.map((i) => `${i.field}: ${i.detail}`),
    hasBrief: existsSync(join(workspace, "brief.md")),
    hasArt: existsSync(join(workspace, "generator")) || existsSync(join(workspace, "project.json")),
    artProblems: [],
    validationErrors: [],
    hasBundle: existsSync(join(workspace, "project.relics")),
    chainSelected: null,
    chainBlockers: [],
    signerConfigured: Boolean(process.env.RELICS_SIGNER_URL),
    signerAddress: null,
    signerFunded: null,
    metadataProviderConfigured: Boolean(process.env.PINATA_JWT) || Boolean(process.env.RELICS_METADATA_PROVIDER),
    metadataPublished: has("METADATA"),
    simulated: has("SIMULATE"),
    simulationRevert: null,
    built: has("BUILD"),
    policyApproved: has("POLICY_CHECK"),
    broadcastTxHash: null,
    confirmed: has("CONFIRM"),
    verified: has("VERIFY"),
    verificationFailures: [],
    allowBroadcast: policy.ok ? policy.policy.allowBroadcast : false,
    goal: policy.ok ? policy.policy.goal : "BUILD_ONLY",
    receiptPaths: receipts.map((r) => `${AGENT_DIR}/receipts/${String(r.sequence).padStart(3, "0")}-${r.phase.toLowerCase()}.json`),
  };

  const decision = decideNextAction(facts);
  emit(name, { success: decision.action !== "BLOCKED", result: decision, errors: decision.errors, warnings: decision.warnings, nextActions: [decision.action] }, { json });
  return decision.action === "BLOCKED" ? EXIT.BLOCKED : EXIT.OK;
}

/** Live capability for every allowed chain. Reads only. */
async function cmdCapabilities(name, workspace, flags, json) {
  const { getChainCapability, knownChainIds } = await import("@relics/launch-sdk");
  const policy = await loadPolicy(workspace, flags);
  const ids = flags.chain ? [Number(flags.chain)] : policy.ok ? policy.policy.allowedChains : knownChainIds();
  const runtimeTag = policy.ok ? policy.policy.allowedRuntimes[0] : "SOLIDITY_SVG_V1";

  const chains = [];
  for (const id of ids) chains.push(await getChainCapability(id, { requiredRuntimeTag: runtimeTag }));
  const anyUnknown = chains.some((c) => c.launchable === "UNKNOWN");
  emit(name, {
    success: chains.some((c) => c.launchable === "PROVEN"),
    result: { requiredRuntimeTag: runtimeTag, chains: chains.map((c) => ({ chainId: c.chainId, label: c.label, launchable: c.launchable, rpcSource: c.rpcSource, blockNumber: c.blockNumber, liveLaunchAccess: c.liveLaunchAccess, expectedLaunchAccess: c.expectedLaunchAccess, findings: c.findings })) },
  }, { json });
  return anyUnknown ? EXIT.UNKNOWN_CHAIN_STATE : EXIT.OK;
}

/** Live quote inventory for one chain. */
async function cmdQuotes(name, workspace, flags, json) {
  const { getChainProfile, makeClient, getQuoteAssets, selectQuote } = await import("@relics/launch-sdk");
  const policy = await loadPolicy(workspace, flags);
  const chainId = Number(flags.chain ?? (policy.ok ? policy.policy.allowedChains[0] : 1));
  const profile = getChainProfile(chainId);
  if (!profile) { emit(name, { success: false, errors: [`chain ${chainId} is not in the public record`] }, { json }); return EXIT.REFUSED; }
  const made = makeClient(profile);
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${chainId}: set ${profile.rpcEnvKey}`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }

  const inventory = await getQuoteAssets(made.client, profile.contracts.launchpadFactory);
  const chosen = selectQuote(inventory, policy.ok ? policy.policy.allowedQuoteAssets : "AUTO");
  emit(name, {
    success: chosen.quote !== null,
    result: { chainId, multiQuoteWired: inventory.multiQuoteWired, complete: inventory.complete, candidates: inventory.candidates, selected: chosen.quote, reason: chosen.reason },
    errors: chosen.quote ? [] : [chosen.reason],
    warnings: inventory.errors,
  }, { json });
  return chosen.quote ? EXIT.OK : EXIT.BLOCKED;
}

/** Admission + deterministic scoring across every allowed chain. */
async function cmdPreflight(name, workspace, flags, json) {
  const { selectChain } = await import("@relics/launch-sdk");
  const { writeReceipt } = await import("@relics/agent-flow");
  const policy = await loadPolicy(workspace, flags);
  if (!policy.ok) { emit(name, { success: false, errors: policy.issues.map((i) => `${i.field}: ${i.detail}`) }, { json }); return EXIT.POLICY; }

  const signerAddress = flags.signer ?? process.env.RELICS_SIGNER_ADDRESS ?? undefined;
  const selection = await selectChain(policy.policy, { signerAddress, requiredRuntimeTag: policy.policy.allowedRuntimes[0] });

  const body = {
    strategy: selection.strategy,
    rule: selection.rule,
    selected: selection.selected ? { chainId: selection.selected.chainId, label: selection.selected.label, score: selection.selected.score } : null,
    candidates: selection.candidates.map((c) => ({ chainId: c.chainId, label: c.label, admitted: c.admitted, evidence: c.evidence, score: c.score, gasPriceWei: c.gasPriceWei, rejections: c.rejections })),
    blockedReason: selection.blockedReason,
  };
  if (selection.selected) {
    writeReceipt(workspace, { phase: "PREFLIGHT", chainId: selection.selected.chainId, policyHash: policy.policyHash, body });
  }
  emit(name, { success: selection.selected !== null, result: body, errors: selection.blockedReason ? [selection.blockedReason] : [], nextActions: selection.selected ? ["READY_FOR_METADATA"] : ["BLOCKED"] }, { json });
  return selection.selected ? EXIT.OK : EXIT.BLOCKED;
}

/** What generation this SDK's types came from. Carries no chain status by design. */
async function cmdProvenance(name, json) {
  const { PROVENANCE } = await import("@relics/launch-sdk");
  emit(name, { success: true, result: PROVENANCE, warnings: ["This artifact proves TYPE/ABI generation only. Whether a chain is live is a live read — see `relics agent capabilities`."] }, { json });
  return EXIT.OK;
}

/** Prove the receipt chain has not been edited. */
async function cmdVerifyReceipts(name, workspace, json) {
  const { verifyReceiptChain } = await import("@relics/agent-flow");
  const chain = verifyReceiptChain(workspace);
  emit(name, { success: chain.intact, result: chain, errors: chain.intact ? [] : [chain.detail] }, { json });
  return chain.intact ? EXIT.OK : EXIT.REFUSED;
}
