// SPDX-License-Identifier: MIT
// ================================================================================================
// `relics agent ready` — ONE SCREEN THAT ANSWERS "CAN WE GO?"
//
// The kit already had `agent status`, `agent doctor`, `agent next`, `wallet status` and `status`.
// Between them they knew everything on this page, and no one of them could tell a creator whether
// they were ready — which is the only question anybody actually has. Five partial answers is not
// four answers better than one; it is a reader deciding which command to trust.
//
// EVERY BLOCKER CARRIES AN OWNER, AND THAT IS THE POINT OF THE FILE.
//
//   AGENT_CAN_FIX           the AI can do this right now, without asking. If it asks anyway, it has
//                           wasted the creator's attention on its own work.
//   CREATOR_ACTION_REQUIRED a human must do it: a secret, a passphrase, a decision, money.
//   EXTERNAL_SERVICE        something off this machine is down or unconfigured.
//   CHAIN_STATE             the chain says no. Nobody here can fix it; it can only be waited on or
//                           routed around.
//
// Without that field an agent reads "metadata document missing" and asks the creator to write one,
// when authoring metadata is the agent's entire job. The owner is what turns a checklist into a
// division of labour — and it is why `command` is required beside it: an owner with no command is
// still homework.
//
// PLAIN OUTPUT CARRIES NO HASHES. A policy hash on a status screen is unreadable to the person
// it is shown to and identical-looking whether it is right or wrong. `--json` carries them, because
// its reader can actually compare them.
// ================================================================================================
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadAuthorization, loadKeystore } from "../signer-bridge.js";
import { scrub } from "../scrub.js";
import { bold, cyan, dim, green, red, yellow } from "../report.js";

export const EXIT = { OK: 0, REFUSED: 1, BLOCKED: 6 };

export const BLOCKER_OWNERS = ["AGENT_CAN_FIX", "CREATOR_ACTION_REQUIRED", "EXTERNAL_SERVICE", "CHAIN_STATE"];

/**
 * How long the whole live-read phase gets before the screen gives up and says UNKNOWN.
 *
 * Generous, because the common case is a creator with no configured endpoint reading three chains
 * through public fallbacks, and those are exactly the endpoints that rate-limit. A budget that
 * expires on a working machine trains its reader to ignore UNKNOWN, which is the one value on this
 * screen that must keep meaning something. `--offline` is the way to skip the wait deliberately.
 */
const LIVE_READ_BUDGET_MS = Number(process.env.RELICS_READY_TIMEOUT_MS ?? 15000);

const OK = "OK";
const MISSING = "MISSING";
const UNKNOWN = "UNKNOWN";

/**
 * One row. `state` is what the reader sees; `blocker` is what a program acts on.
 *
 * A row is UNKNOWN when we could not find out — never MISSING. They look the same on a screen and
 * mean opposite things to whoever has to act: MISSING is a fact about this machine, UNKNOWN is an
 * admission about our reading of it, and reporting the second as the first invents a fact about a
 * chain nobody asked.
 */
function row(id, label, state, { detail = "", owner = null, command = null, note = "" } = {}) {
  const r = { id, label, state, detail, note };
  if (state !== OK) {
    r.blocker = { id, owner, command, detail: detail || label };
  }
  return r;
}

function shortAddress(a) {
  const s = String(a ?? "");
  return s.length >= 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function withTimeout(promise, ms, fallback) {
  let timer = null;
  return Promise.race([
    promise.then((v) => { if (timer) clearTimeout(timer); return v; }, () => { if (timer) clearTimeout(timer); return fallback; }),
    new Promise((res) => { timer = setTimeout(() => res(fallback), ms); }),
  ]);
}

/**
 * Gather every fact, then decide. Kept separate from rendering so `--json` and the screen are two
 * views of ONE evaluation — the alternative is two checklists that agree until they do not.
 */
export async function evaluateReadiness(workspace, { live = true } = {}) {
  const root = resolve(workspace ?? ".");
  const sections = [];
  const notes = [];

  const [{ readAuthorization, checkAuthorization, relicsHome }, keystore] = await Promise.all([
    loadAuthorization(),
    loadKeystore(),
  ]);
  const sdk = await import("@relics/launch-sdk");

  // ---- policy on disk --------------------------------------------------------------------------
  const policyPath = join(root, "relics.agent.json");
  let policy = null;
  let policyHash = null;
  let policyIssues = [];
  if (existsSync(policyPath)) {
    try {
      const parsed = sdk.parseAgentPolicy(JSON.parse(readFileSync(policyPath, "utf8")));
      if (parsed.ok) { policy = parsed.policy; policyHash = parsed.policyHash; }
      else policyIssues = parsed.issues.map((i) => `${i.field}: ${i.detail}`);
    } catch (err) {
      policyIssues = [`relics.agent.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`];
    }
  }

  // ---- wallet ----------------------------------------------------------------------------------
  const wallets = keystore.listWallets();
  const auth = readAuthorization();
  // The wallet this run is ABOUT is the one the grant names; without a grant, the only one present.
  const signerAddress = auth?.signerAddress ?? (wallets.length === 1 ? wallets[0].address : null);
  const walletRows = [];

  if (wallets.length === 0) {
    walletRows.push(row("wallet.present", "launch wallet", MISSING, {
      detail: "There is no launch wallet on this machine. One has to be created by a person, at a terminal, because it is protected by a passphrase only they will know.",
      owner: "CREATOR_ACTION_REQUIRED",
      command: "npm run kit -- agent setup",
    }));
  } else {
    walletRows.push(row("wallet.present", signerAddress ? shortAddress(signerAddress) : shortAddress(wallets[0].address), OK, { detail: signerAddress ?? wallets[0].address }));
    const target = signerAddress ?? wallets[0].address;
    let mode = null;
    let path = null;
    try { path = keystore.keystorePathFor(target); mode = statSync(path).mode & 0o777; } catch { mode = null; }
    if (mode === null) {
      walletRows.push(row("wallet.protected", "protected signer", MISSING, {
        detail: auth ? `The grant names ${target}, and there is no keystore for it on this machine.` : "The keystore file could not be read.",
        owner: "CREATOR_ACTION_REQUIRED",
        command: "npm run kit -- wallet list",
      }));
    } else if (mode & 0o077) {
      walletRows.push(row("wallet.protected", "protected signer", MISSING, {
        detail: `The keystore is mode ${mode.toString(8)}, which other users on this machine can read. The signer refuses to open it until that is fixed.`,
        owner: "CREATOR_ACTION_REQUIRED",
        command: `chmod 600 "${path}"`,
      }));
    } else {
      walletRows.push(row("wallet.protected", "protected signer", OK, { detail: "encrypted keystore, readable only by you; there is no command in this kit that can print the key" }));
    }
  }

  // ---- creator earnings ------------------------------------------------------------------------
  const earningsRows = [];
  const ZERO = "0x0000000000000000000000000000000000000000";
  const recipient = policy?.creatorRecipient ?? auth?.creatorRecipient ?? null;
  if (!recipient || recipient.toLowerCase() === ZERO) {
    earningsRows.push(row("earnings.recipient", "creator recipient", MISSING, {
      detail: "No address is set to receive this project's fees. It is written into the launch permanently and cannot be changed afterwards, so it is not something that may be defaulted or derived.",
      owner: "CREATOR_ACTION_REQUIRED",
      command: "npm run kit -- agent setup",
    }));
  } else {
    earningsRows.push(row("earnings.recipient", shortAddress(recipient), OK, { detail: recipient }));
    if (signerAddress && recipient.toLowerCase() === signerAddress.toLowerCase()) {
      notes.push("Your earnings are set to the same address as your launch wallet — a hot key on this machine. That was accepted deliberately at setup, so it is not treated as an error here, but it is worth a second look: the recipient is permanent and the wallet is disposable.");
    }
  }

  // ---- chains ----------------------------------------------------------------------------------
  const allowedChains = policy?.allowedChains ?? auth?.allowedChains ?? [];
  const chainRows = [];
  const rpcRows = [];
  if (allowedChains.length === 0) {
    chainRows.push(row("chains.allowed", "allowed chains", MISSING, {
      detail: "No chains are authorized. Which chains an agent may launch on is a permission, so it comes from setup rather than from a default.",
      owner: "CREATOR_ACTION_REQUIRED",
      command: "npm run kit -- agent setup",
    }));
  } else {
    const profiles = [];
    for (const id of allowedChains) {
      let p = null;
      try { p = sdk.getChainProfile(id); } catch { p = null; }
      profiles.push({ id, profile: p });
      const key = p?.rpcEnvKey ?? `CHAIN_${id}_RPC_URL`;
      const label = p?.label ?? `chain ${id}`;
      if (process.env[key]) {
        rpcRows.push(row(`rpc.${id}`, label, OK, { detail: `${key} is set (its value is never read into any output)` }));
      } else {
        rpcRows.push(row(`rpc.${id}`, label, MISSING, {
          detail: `${key} is not set. Without it this chain is read through a public, rate-limited endpoint, and a partial read is an UNKNOWN rather than a refusal — so preflight will not admit it.`,
          owner: "CREATOR_ACTION_REQUIRED",
          command: `export ${key}='…'`,
        }));
      }
    }

    if (!live) {
      chainRows.push(row("chains.open", "launches open", UNKNOWN, {
        detail: "Not read: this run was asked not to touch the network. Whether a chain accepts creator launches is a live fact and this kit never caches it.",
        owner: "CHAIN_STATE",
        command: "npm run kit -- agent ready",
      }));
    } else {
      const runtimeTag = policy?.allowedRuntimes?.[0] ?? "SOLIDITY_SVG_V1";
      const results = await withTimeout(
        Promise.all(profiles.map(async ({ id, profile }) => {
          if (!profile) return { id, launchable: "UNKNOWN", detail: "this kit carries no deployment record for that chain" };
          try {
            const cap = await sdk.getChainCapability(id, { requiredRuntimeTag: runtimeTag });
            return { id, label: cap.label, launchable: cap.launchable, detail: unresolvedFindings(cap.findings) };
          } catch (err) {
            return { id, launchable: "UNKNOWN", detail: err instanceof Error ? err.message : String(err) };
          }
        })),
        LIVE_READ_BUDGET_MS,
        null,
      );
      if (results === null) {
        chainRows.push(row("chains.open", "launches open", UNKNOWN, {
          detail: `No chain answered within ${LIVE_READ_BUDGET_MS}ms. That is a statement about the read, not about the chain — nothing here concluded a chain is closed.`,
          owner: "EXTERNAL_SERVICE",
          command: "npm run kit -- agent capabilities --json",
        }));
      } else {
        const proven = results.filter((r) => r.launchable === "PROVEN");
        for (const r of results) {
          const state = r.launchable === "PROVEN" ? OK : r.launchable === "UNKNOWN" ? UNKNOWN : MISSING;
          chainRows.push(row(`chain.${r.id}`, r.label ?? `chain ${r.id}`, state, {
            detail: state === OK ? "open to creator launches" : r.detail || `launchable: ${r.launchable}`,
            owner: state === UNKNOWN ? "EXTERNAL_SERVICE" : "CHAIN_STATE",
            command: "npm run kit -- agent capabilities --json",
          }));
        }
        if (proven.length === 0) {
          chainRows.push(row("chains.open", "at least one chain open", MISSING, {
            detail: "None of the authorized chains could be proven open to creator launches. Nobody on this machine can change that; it is the chain's answer.",
            owner: "CHAIN_STATE",
            command: "npm run kit -- agent capabilities --json",
          }));
        }
      }
    }
  }

  // ---- funded for gas --------------------------------------------------------------------------
  if (signerAddress && allowedChains.length > 0) {
    if (!live) {
      walletRows.push(row("wallet.funded", "funded for gas", UNKNOWN, {
        detail: "Not read: this run was asked not to touch the network.",
        owner: "CHAIN_STATE",
        command: "npm run kit -- agent ready",
      }));
    } else {
      const balances = await withTimeout(
        Promise.all(allowedChains.map(async (id) => {
          try {
            const profile = sdk.getChainProfile(id);
            if (!profile) return { id, balance: null };
            const made = sdk.makeClient(profile);
            if (!made) return { id, balance: null };
            const balance = await made.client.getBalance({ address: signerAddress });
            return { id, label: profile.label, symbol: profile.nativeSymbol, balance };
          } catch {
            return { id, balance: null };
          }
        })),
        LIVE_READ_BUDGET_MS,
        null,
      );
      if (balances === null || balances.every((b) => b.balance === null)) {
        walletRows.push(row("wallet.funded", "funded for gas", UNKNOWN, {
          detail: "No chain could be read for a balance. Whether this wallet can pay for a launch is therefore not known — which is not the same as it being empty.",
          owner: "EXTERNAL_SERVICE",
          command: "npm run kit -- agent doctor --json",
        }));
      } else {
        const funded = balances.filter((b) => b.balance !== null && b.balance > 0n);
        if (funded.length === 0) {
          walletRows.push(row("wallet.funded", "funded for gas", MISSING, {
            detail: `${shortAddress(signerAddress)} holds no native balance on any authorized chain, so it cannot pay for a launch. Send it gas — only gas; this wallet should never hold earnings.`,
            owner: "CREATOR_ACTION_REQUIRED",
            command: `send gas to ${signerAddress}`,
          }));
        } else {
          walletRows.push(row("wallet.funded", "funded for gas", OK, {
            detail: funded.map((b) => `${b.label}: ${b.balance} wei ${b.symbol}`).join(", "),
          }));
        }
      }
    }
  }

  // ---- metadata --------------------------------------------------------------------------------
  const metadataRows = [];
  if (process.env.PINATA_JWT) {
    metadataRows.push(row("metadata.provider", "pinning provider", OK, { detail: "PINATA_JWT is set; its value is never read into any output" }));
  } else {
    metadataRows.push(row("metadata.provider", "pinning provider", MISSING, {
      detail: "No pinning provider is configured. Collection metadata is written at birth and can never be changed, so it has to be pinned and read back before the launch is built. A credential is a secret and belongs in the shell, not in a file this kit writes.",
      owner: "CREATOR_ACTION_REQUIRED",
      command: "export PINATA_JWT='…'",
    }));
  }
  const metadataDoc = join(root, "metadata", "collection.json");
  if (existsSync(metadataDoc)) {
    metadataRows.push(row("metadata.document", "collection metadata", OK, { detail: metadataDoc }));
  } else {
    // THE ROW THIS WHOLE OWNER FIELD EXISTS FOR. Writing the collection's name, description and
    // image is the agent's work. An agent that reads "missing" and asks the creator to supply it
    // has handed back its own task.
    metadataRows.push(row("metadata.document", "collection metadata", MISSING, {
      detail: `No metadata document at ${metadataDoc}. Writing it is the agent's job, not the creator's: it is the collection's name, description and image, derived from the brief and the art.`,
      owner: "AGENT_CAN_FIX",
      command: `write ${metadataDoc}`,
    }));
  }

  // ---- authorization ---------------------------------------------------------------------------
  const authRows = [];
  const verdict = checkAuthorization(signerAddress ? { signerAddress } : {});
  if (!verdict.ok) {
    authRows.push(row("authorization.live", "authorization", MISSING, {
      detail: verdict.detail,
      owner: "CREATOR_ACTION_REQUIRED",
      command: verdict.reason === "NO_AUTHORIZATION" ? "npm run kit -- agent setup" : "npm run kit -- agent setup",
    }));
  } else {
    const a = verdict.authorization;
    authRows.push(row("authorization.live", `${a.preset}, ${a.launchesAllowed - a.launchesUsed} of ${a.launchesAllowed} launches left`, OK, {
      detail: `granted ${a.grantedAt}`,
      note: a.expiresAt ? `expires ${a.expiresAt}` : "no expiry — you must revoke it yourself",
    }));
    if (policy && policyHash && policyHash !== a.policyHash) {
      // A CHANGED POLICY INVALIDATES THE GRANT BY DESIGN. Saying "hash mismatch" would be true and
      // useless; what a reader needs is what changed and what to do.
      authRows.push(row("authorization.policy", "grant matches this project's policy", MISSING, {
        detail: "relics.agent.json has changed since this authorization was granted, so the grant no longer covers it. That is deliberate: a ceiling edited after the fact is not a ceiling anyone agreed to. Re-run setup to authorize the current file.",
        owner: "CREATOR_ACTION_REQUIRED",
        command: "npm run kit -- agent setup",
      }));
    } else if (policy && policyHash) {
      authRows.push(row("authorization.policy", "grant matches this project's policy", OK, { detail: "the grant was issued against exactly this policy" }));
    }
    if (policy?.goal === "LAUNCH" && !a.allowBroadcast) {
      authRows.push(row("authorization.broadcast", "may broadcast", MISSING, {
        detail: "This project's policy asks to launch, but the grant does not permit broadcasting. The run will build a complete transaction and stop.",
        owner: "CREATOR_ACTION_REQUIRED",
        command: "npm run kit -- agent setup",
      }));
    } else {
      authRows.push(row("authorization.broadcast", a.allowBroadcast ? "may broadcast one launch" : "builds only — will not broadcast", OK, { detail: a.allowBroadcast ? "the agent may send the launch transaction" : "the agent stops at a built, unsigned transaction" }));
    }
  }

  // ---- the project itself ----------------------------------------------------------------------
  const projectRows = [];
  if (!existsSync(policyPath)) {
    projectRows.push(row("project.policy", "relics.agent.json", MISSING, {
      detail: `No authorization boundary at ${policyPath}. It is written by setup, in the directory the project lives in.`,
      owner: "CREATOR_ACTION_REQUIRED",
      command: `npm run kit -- agent setup ${root}`,
    }));
  } else if (policyIssues.length > 0) {
    projectRows.push(row("project.policy", "relics.agent.json", MISSING, {
      detail: `The policy file exists but is refused: ${policyIssues.join("; ")}`,
      owner: "CREATOR_ACTION_REQUIRED",
      command: "npm run kit -- agent setup",
    }));
  } else {
    projectRows.push(row("project.policy", "relics.agent.json", OK, { detail: policyPath }));
  }
  const bundle = join(root, "project.relics");
  if (existsSync(bundle)) projectRows.push(row("project.bundle", "exported bundle", OK, { detail: bundle }));
  else projectRows.push(row("project.bundle", "exported bundle", MISSING, {
    detail: `No ${bundle}. Authoring the art and exporting the bundle is the agent's work.`,
    owner: "AGENT_CAN_FIX",
    command: `npm run kit -- export ${root} --output ${bundle}`,
  }));

  sections.push({ id: "wallet", title: "Wallet", rows: walletRows });
  sections.push({ id: "earnings", title: "Creator earnings", rows: earningsRows });
  sections.push({ id: "chains", title: "Chains", rows: chainRows });
  sections.push({ id: "metadata", title: "Metadata", rows: metadataRows });
  sections.push({ id: "rpc", title: "RPC", rows: rpcRows });
  sections.push({ id: "authorization", title: "Authorization", rows: authRows });
  sections.push({ id: "project", title: "Project", rows: projectRows });

  const blockers = sections.flatMap((s) => s.rows.filter((r) => r.blocker).map((r) => ({ section: s.id, ...r.blocker, state: r.state })));
  const hardBlockers = blockers.filter((b) => b.state === MISSING);

  const verdictLine =
    hardBlockers.length === 0 && blockers.length === 0
      ? "READY TO CREATE + LAUNCH"
      : hardBlockers.length === 0
        ? "READY, WITH UNKNOWNS"
        : blockers.every((b) => b.owner === "AGENT_CAN_FIX")
          ? "READY — THE AGENT'S WORK IS OUTSTANDING"
          : "NOT READY";

  return { workspace: root, sections, blockers, notes, verdict: verdictLine, ready: hardBlockers.length === 0, relicsHome: relicsHome() };
}


/**
 * The findings that explain a non-PROVEN chain, as sentences.
 *
 * A `Finding` is an OBJECT — `{ id, evidence, detail, unreadReason }` — and joining the array
 * directly produced a row that read `[object Object]; [object Object]`, which is worse than
 * printing nothing: it looks like a diagnosis while carrying none. Only the findings that are not
 * PROVEN are shown, because the PROVEN ones are the reason the row would have said OK.
 */
function unresolvedFindings(findings) {
  const list = (findings ?? []).filter((f) => f && f.evidence !== "PROVEN");
  if (list.length === 0) return "";
  return list
    .slice(0, 3)
    .map((f) => sanitizeFinding(f.unreadReason ? `${f.detail} (${f.unreadReason})` : f.detail))
    .join("; ") + (list.length > 3 ? ` — and ${list.length - 3} more; see \`agent capabilities --json\`` : "");
}

/**
 * REDACT ENDPOINTS, THEN TRUNCATE. Both halves are load-bearing and the first one is a secret rule.
 *
 * A finding's `detail` frequently wraps a transport error, and viem's transport errors embed the
 * REQUEST URL. On a machine where `ETHEREUM_RPC_URL` carries an API key — which is exactly the
 * machine this kit tells creators to have — a raw finding would print that key onto a status
 * screen, into `--json`, and from there into whatever transcript is watching. The SDK is careful
 * never to return the URL itself and reports `source` instead; an error message that quotes it back
 * defeats that, so the redaction happens here, before the text reaches either renderer.
 *
 * The truncation is the readable half: an unabridged viem error is eleven lines of call arguments
 * and a documentation link, and a status row that long is one nobody finishes reading.
 */
function sanitizeFinding(text) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  // TWO LAYERS, AND THEY CATCH DIFFERENT THINGS. `scrub` (applied at every exit) removes the exact
  // values this process was handed as credentials — precise, and blind to a credential that arrived
  // some other way. This blanket redaction removes ANY URL from a finding, because a finding is
  // never the place a reader gets an endpoint from and the belt is cheap. Neither alone is enough:
  // drop the first and an explorer link survives while a key does not; drop the second and a
  // credential from a source we did not enumerate rides out inside a transport error.
  const redacted = flat.replace(/\bhttps?:\/\/\S+/gi, "<endpoint>");
  return redacted.length > 180 ? `${redacted.slice(0, 177)}…` : redacted;
}

const MARK = { [OK]: green("✓"), [MISSING]: red("✗"), [UNKNOWN]: yellow("?") };

const OWNER_SENTENCE = {
  AGENT_CAN_FIX: "the AI agent can do this now, without asking you",
  CREATOR_ACTION_REQUIRED: "only you can do this",
  EXTERNAL_SERVICE: "something outside this machine is unconfigured or unreachable",
  CHAIN_STATE: "this is the chain's answer; nobody here can change it",
};

function render(report) {
  const out = [];
  out.push("");
  out.push(bold("RELICS AGENT"));
  out.push(dim("────────────"));
  for (const section of report.sections) {
    if (section.rows.length === 0) continue;
    out.push("");
    out.push(bold(section.title));
    for (const r of section.rows) {
      out.push(`${MARK[r.state]} ${r.state === OK ? r.label : `${r.label}`}`);
      if (r.state !== OK) {
        for (const line of wrap(r.detail, 74)) out.push(`  ${dim(line)}`);
        if (r.blocker?.command) out.push(`  ${cyan(`→ ${r.blocker.command}`)}   ${dim(`(${OWNER_SENTENCE[r.blocker.owner] ?? r.blocker.owner})`)}`);
      } else if (r.note) {
        out.push(`  ${dim(r.note)}`);
      }
    }
  }
  if (report.notes.length > 0) {
    out.push("");
    out.push(bold("Worth a look"));
    for (const n of report.notes) for (const line of wrap(n, 74)) out.push(`  ${yellow(line)}`);
  }
  out.push("");
  out.push(report.ready ? green(bold(report.verdict)) : yellow(bold(report.verdict)));
  if (!report.ready) {
    // EVERY BLOCKER IS ACCOUNTED FOR IN THE TALLY. Naming only two of the four owners left a reader
    // subtracting to find out where the rest went, and "8 outstanding — 2 and 3" reads as a bug.
    const by = (o) => report.blockers.filter((b) => b.owner === o).length;
    const parts = [
      [by("AGENT_CAN_FIX"), "the agent can fix"],
      [by("CREATOR_ACTION_REQUIRED"), "needing you"],
      [by("EXTERNAL_SERVICE"), "waiting on a service"],
      [by("CHAIN_STATE"), "the chain's answer"],
    ].filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`);
    out.push(dim(`${report.blockers.length} outstanding — ${parts.join(", ")}.`));
  }
  out.push("");
  return out.join("\n");
}

function wrap(text, width) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line.length + w.length + 1 > width) { lines.push(line); line = w; }
    else line = line === "" ? w : `${line} ${w}`;
  }
  if (line !== "") lines.push(line);
  return lines;
}

/** `relics agent ready`. */
export async function agentReady(workspace, flags) {
  const json = Boolean(flags?.json);
  const live = flags?.offline !== true;
  const report = await evaluateReadiness(workspace, { live });

  if (json) {
    // Same exit-gate rule as the agent envelope: a chain finding can quote a credentialled URL, and
    // the machine surface is the one whose output gets stored.
    process.stdout.write(`${JSON.stringify(scrub({
      schemaVersion: 1,
      command: "agent ready",
      success: report.ready,
      timestamp: new Date().toISOString(),
      result: {
        workspace: report.workspace,
        verdict: report.verdict,
        ready: report.ready,
        sections: report.sections,
        blockers: report.blockers,
        notes: report.notes,
      },
      errors: report.blockers.filter((b) => b.state === MISSING).map((b) => `${b.id}: ${b.detail}`),
      warnings: report.blockers.filter((b) => b.state === UNKNOWN).map((b) => `${b.id}: ${b.detail}`),
      nextActions: report.ready ? ["READY"] : ["BLOCKED"],
    }), null, 2)}\n`);
    return report.ready ? EXIT.OK : EXIT.BLOCKED;
  }

  process.stderr.write(`${scrub(render(report))}\n`);
  return report.ready ? EXIT.OK : EXIT.BLOCKED;
}
