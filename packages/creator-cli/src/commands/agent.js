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
import { scrub } from "../scrub.js";
import { createHash } from "node:crypto";
import { bold, cyan, dim } from "../report.js";
import { explainCode } from "./agent-remedies.js";

/** Documented, stable exit codes. An agent branches on these without reading any text. */
export const EXIT = { OK: 0, REFUSED: 1, USAGE: 2, UNKNOWN_CHAIN_STATE: 3, POLICY: 4, SIGNER_REFUSED: 5, BLOCKED: 6 };

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** The one envelope every `--json` command prints. */
function envelope(command, { success, result = null, warnings = [], errors = [], nextActions = [], inputHash = null }) {
  return { schemaVersion: 1, command, success, timestamp: new Date().toISOString(), inputHash, result, warnings, errors, nextActions };
}

function emit(command, payload, { json }) {
  // THE LAST GATE BEFORE ANYTHING LEAVES THIS PROCESS, AND THE ONLY ONE.
  //
  // Every command emits through here, so the scrub cannot be forgotten by a command written later —
  // which matters because the leak this closes was not written by anyone. A failed chain read
  // produced a viem transport error, that error quoted the credentialled request URL, and it rode
  // out inside a `Finding.detail` that nothing had any reason to suspect. Scrubbing at the source
  // of each message would mean auditing every source forever; scrubbing at the exit is one place.
  const env = scrub(envelope(command, payload));
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

  // HANDLED BEFORE THE SWITCH, AND THAT PLACEMENT IS LOAD-BEARING.
  //
  // `scripts/check-agent-commands.mjs` derives the real subcommand surface from every switch label
  // in this file and requires each one to be declared as a next action. (It derives that by reading
  // the source text, so this comment deliberately does not spell the label pattern out — a comment
  // that names its own gate's pattern gets counted by it, which is exactly what happened here.)
  // Neither of these is a next
  // action — one is help, the other exists only to say the command lives somewhere else — so
  // putting them in the switch would force two lies into that declaration to keep the gate green.
  if (sub === "help") return printAgentHelp(rest[0]);
  if (sub === "wallet") {
    // A HUMAN-ONLY COMMAND MUST NOT BE REACHABLE FROM THE MACHINE NAMESPACE. Not because the wallet
    // commands would misbehave — each refuses on its own with no terminal attached — but because
    // `relics agent …` is the list an agent is told to work from, and a step it cannot perform
    // appearing there is an invitation to try it, fail, and report the failure as a blocker of the
    // whole run. Naming the real command is the fix.
    const which = rest[0] ?? "status";
    emit(name, {
      success: false,
      errors: [`\`relics agent wallet\` does not exist, and not by omission: wallet commands need a human at a terminal, so they are deliberately outside the agent namespace. The command is \`npm run kit -- wallet ${which}\`, and the creator must run it themselves — there is no flag, file or environment variable that supplies the passphrase.`],
      nextActions: ["BLOCKED"],
    }, { json });
    return EXIT.USAGE;
  }

  try {
    switch (sub) {
      // ---- THE HUMAN ENTRY POINTS -------------------------------------------------------------
      //
      // `setup` and `revoke` are conversations with a person and refuse without a terminal; `ready`
      // is the one screen that says whether this machine can launch and, for everything it cannot
      // do, WHO has to do it. They live here rather than under `wallet` because they are about the
      // agent's authority, not about a key — but note what is NOT here: no wallet subcommand is
      // reachable from this namespace. See the `wallet` case below.
      case "setup": {
        const { agentSetup } = await import("./agent-setup.js");
        return await agentSetup(workspace, flags);
      }
      case "ready": {
        const { agentReady } = await import("./agent-ready.js");
        return await agentReady(workspace, flags);
      }
      case "revoke": {
        const { agentRevoke } = await import("./agent-setup.js");
        return await agentRevoke(flags);
      }
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

      // ---- the write side. Each needs a valid policy, so it is loaded once and passed down ----
      case "metadata": case "prepare": case "predict": case "simulate":
      case "build": case "policy-check": case "broadcast": case "confirm":
      case "verify": case "resume": case "run": case "token-metadata": {
        const policy = await loadPolicy(workspace, flags);
        if (!policy.ok) {
          emit(name, { success: false, errors: policy.issues.map((i) => `${i.field}: ${i.detail}`), nextActions: ["BLOCKED"] }, { json });
          return EXIT.POLICY;
        }
        const ctx = { policy: policy.policy, policyHash: policy.policyHash };
        const L = await import("./agent-launch.js");
        switch (sub) {
          case "metadata": return await L.cmdMetadata(name, workspace, flags, json, ctx);
          case "prepare": return await L.cmdPrepare(name, workspace, flags, json, ctx);
          case "predict": return await L.cmdPredict(name, workspace, flags, json, ctx);
          case "simulate": return await L.cmdSimulate(name, workspace, flags, json, ctx);
          case "build": return await L.cmdBuild(name, workspace, flags, json, ctx);
          case "policy-check": return await L.cmdPolicyCheck(name, workspace, flags, json, ctx);
          case "broadcast": return await L.cmdBroadcast(name, workspace, flags, json, ctx);
          case "confirm": return await L.cmdConfirm(name, workspace, flags, json, ctx);
          case "verify": return await L.cmdVerify(name, workspace, flags, json, ctx);
          case "token-metadata": return await L.cmdTokenMetadata(name, workspace, flags, json, ctx);
          case "resume": return await L.cmdResume(name, workspace, flags, json, ctx);
          case "run": return await cmdRun(name, workspace, flags, json, ctx, L);
        }
        return EXIT.USAGE;
      }
      default:
        emit(name, { success: false, errors: [`unknown subcommand "${sub}".\n  First time?    agent setup\n  Where am I?    agent ready\n  Creating?      agent run --workspace <dir> --json\n  Everything:    init, status, doctor, next, capabilities, quotes, preflight, metadata, prepare, predict, simulate, build, policy-check, broadcast, confirm, verify, resume, run, provenance, verify-receipts, revoke`] }, { json });
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
    // A PUBLIC FALLBACK IS NOT "ok" HERE, BECAUSE PREFLIGHT WILL REFUSE IT. `doctor` used to score
    // it a pass, and then `preflight` rejected the same chain with `UNKNOWN:rpc.credentialled` —
    // two commands giving opposite answers about one fact, which reads as a bug in whichever one
    // the reader trusted less. They now agree: a chain without its own configured endpoint is not
    // ready for an autonomous launch, and doctor is the command that is supposed to say so BEFORE
    // any work is done.
    const rpcReady = rpc !== null && rpc.source !== "PUBLIC_FALLBACK";
    add(`rpc.${id}`, rpcReady,
      rpc === null
        ? `no endpoint: set ${profile.rpcEnvKey}`
        : rpc.source === "PUBLIC_FALLBACK"
          ? `only the PUBLIC fallback is available because ${profile.rpcEnvKey} is unset. Public endpoints rate-limit, and a partial read is an UNKNOWN rather than a refusal — so preflight will not admit this chain. Set ${profile.rpcEnvKey}.`
          : `configured via ${profile.rpcEnvKey}`);
  }

  const signerUrl = process.env.RELICS_SIGNER_URL ?? null;
  // A BARE CODE IS NOT A DIAGNOSIS. Both of these used to state a fact and stop, and the reader —
  // person or agent — was left to work out whose problem it was. `explainCode` attaches the owner
  // and the exact command, from the one remedy table.
  add("signer.configured", Boolean(signerUrl), signerUrl ? "RELICS_SIGNER_URL is set" : explainCode("SIGNER_NOT_CONFIGURED", "no RELICS_SIGNER_URL. The agent never holds a key; it hands a SigningRequest to a process that does."));
  add("metadata.provider", Boolean(process.env.PINATA_JWT), process.env.PINATA_JWT ? "a pinning provider is configured" : explainCode("NO_METADATA_PROVIDER", "no PINATA_JWT."));

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

  // A POLICY THAT EXISTS BUT DOES NOT PARSE IS NOT AN ABSENT POLICY. `hasPolicy: policy.ok`
  // reported "There is no relics.agent.json" while the file was sitting right there — a
  // lowercase-checksum creatorRecipient is enough to trigger it — and sent the reader looking for a
  // missing file instead of a wrong field. The two conditions get separate answers.
  const policyFileExists = existsSync(resolve(flags.policy ?? join(workspace, "relics.agent.json")));

  const facts = {
    state: has("VERIFY") ? "VERIFIED" : has("BROADCAST") ? "BROADCAST" : has("BUILD") ? "BUILT" : has("SIMULATE") ? "SIMULATED" : has("METADATA") ? "METADATA_PUBLISHED" : has("PREFLIGHT") ? "CHAIN_SELECTED" : "BRIEF_RECEIVED",
    hasPolicy: policyFileExists,
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

/**
 * `run` — the orchestration engine an external coding agent drives.
 *
 * IT IS NOT AN LLM AND IT CONTAINS NO SECOND IMPLEMENTATION. Every step below calls the SAME
 * exported function the standalone command calls, in order, and stops at the first one that
 * refuses. When it stops for a creative reason it emits the machine-readable next action so the
 * agent knows what to edit; when it stops for a blocker it says which.
 *
 * `run` IS RESUMABLE BY CONSTRUCTION, because each step reads what the previous one recorded on
 * disk. Re-running it after a crash re-enters at the first incomplete phase — and the broadcast
 * step asks the CHAIN, not the disk, whether it already sent.
 */
async function cmdRun(name, workspace, flags, json, ctx, L) {
  const { decideNextAction, listReceipts } = await import("@relics/agent-flow");
  const steps = [
    ["PREFLIGHT", (n) => cmdPreflight(n, workspace, flags, json)],
    ["METADATA", (n) => L.cmdMetadata(n, workspace, flags, json, ctx)],
    ["PREPARE", (n) => L.cmdPrepare(n, workspace, flags, json, ctx)],
    ["PREDICT", (n) => L.cmdPredict(n, workspace, flags, json, ctx)],
    ["SIMULATE", (n) => L.cmdSimulate(n, workspace, flags, json, ctx)],
    ["BUILD", (n) => L.cmdBuild(n, workspace, flags, json, ctx)],
    ["POLICY_CHECK", (n) => L.cmdPolicyCheck(n, workspace, flags, json, ctx)],
    ["BROADCAST", (n) => L.cmdBroadcast(n, workspace, flags, json, ctx)],
    ["CONFIRM", (n) => L.cmdConfirm(n, workspace, flags, json, ctx)],
    ["VERIFY", (n) => L.cmdVerify(n, workspace, flags, json, ctx)],
  ];
  const done = new Set(listReceipts(workspace).map((r) => r.phase));
  const ran = [];
  for (const [phase, fn] of steps) {
    if (done.has(phase)) { ran.push({ phase, status: "ALREADY_DONE" }); continue; }
    // BUILD_ONLY stops cleanly at BUILT with the transaction available for manual signing.
    if (phase === "BROADCAST" && (ctx.policy.goal === "BUILD_ONLY" || !ctx.policy.allowBroadcast)) {
      ran.push({ phase, status: "STOPPED_BY_POLICY", detail: "goal is BUILD_ONLY or allowBroadcast is false; the signing request is built and ready for manual signing" });
      break;
    }
    const code = await fn(`agent ${phase.toLowerCase()}`);
    ran.push({ phase, status: code === EXIT.OK ? "OK" : "STOPPED", exitCode: code });
    if (code !== EXIT.OK) break;
  }
  // The last word is always the next action, so an agent driving `run` never has to infer it.
  return ran[ran.length - 1]?.status === "OK" || ran.every((r) => r.status === "ALREADY_DONE") ? EXIT.OK : EXIT.BLOCKED;
}

// ------------------------------------------------------------------------------------------------
// HELP
// ------------------------------------------------------------------------------------------------

/**
 * `relics agent --help`.
 *
 * LEADS WITH THE THREE QUESTIONS PEOPLE ACTUALLY ARRIVE WITH, in the order they arrive in. The
 * previous surface opened with an alphabetical list of twenty-two subcommands, which is a correct
 * answer to "what exists" and no answer at all to "what do I type". A first-time creator was
 * expected to infer that `init` scaffolds a policy file they must then hand-edit, and an agent was
 * expected to infer which of the twenty-two it may run — both inferred wrong, repeatedly.
 *
 * The advanced list is kept, below, because the individually-runnable phases are the point of the
 * design and hiding them would make the pipeline look like a black box.
 */
export function printAgentHelp(topic) {
  const w = process.stderr;
  if (topic && topic !== "agent") {
    w.write(`\nrelics agent ${topic}\n\n  See \`npm run kit -- agent --help\` for the full list.\n\n`);
    return EXIT.OK;
  }
  w.write(`
${bold("relics agent")} — create and launch a project with an AI agent

  ${bold("FIRST TIME?")}
      ${cyan("npm run kit -- agent setup")}
      ${dim("One wizard, run by a person: launch wallet, where your earnings go, which chains,")}
      ${dim("and how much you authorize. Nothing is saved until you read a summary and type a")}
      ${dim("phrase. This is the only step an AI agent cannot do for you, and it is deliberate.")}

  ${bold("READY?")}
      ${cyan("npm run kit -- agent ready")}
      ${dim("One screen: wallet, earnings, chains, metadata, endpoints, authorization. Anything")}
      ${dim("outstanding says WHO fixes it — you, the agent, a service, or the chain — and the")}
      ${dim("exact command. Add --json for the machine form.")}

  ${bold("AGENT CREATING?")}
      ${cyan("npm run kit -- agent run --workspace <dir> --json")}
      ${dim("Runs the whole pipeline in order and stops at the first thing that needs a decision.")}
      ${dim("Resumable: re-running re-enters at the first incomplete phase, and anything that")}
      ${dim("touched a chain asks the CHAIN whether it already happened.")}

  ${bold("CHANGED YOUR MIND?")}
      ${cyan("npm run kit -- agent revoke")}
      ${dim("Ends the authorization. Your wallet and its gas are untouched — revoking authority")}
      ${dim("does not touch a key.")}

  ${dim("──────────────────────────────────────────────────────────────────────")}
  ${bold("Advanced")} ${dim("— every phase is independently runnable and writes a receipt")}

    ${dim("read-only")}   status · doctor · next · capabilities · quotes · preflight
                  provenance · verify-receipts
    ${dim("write side")}  init · metadata · prepare · predict · simulate · build
                  policy-check · broadcast · confirm · verify · resume · run

  ${bold("Your wallet")} ${dim("is not under this namespace, on purpose:")}
    ${cyan("npm run kit -- wallet <create|unlock|lock|status|backup|list>")}
    ${dim("Those need a human at a terminal. An agent listing `relics agent …` should never")}
    ${dim("find a step it cannot perform and report the failure as a blocker.")}

  ${dim("Exit codes: 0 ok · 1 refused · 2 usage · 3 unknown chain state · 4 policy · 5 signer refused · 6 blocked")}

`);
  return EXIT.OK;
}
