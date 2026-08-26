// SPDX-License-Identifier: MIT
// ================================================================================================
// THE HUMAN BOUNDARY, PROVED BY EXERCISING IT.
//
// Every refusal in this file is produced by RUNNING THE CLI, not by asserting that a constant
// exists. A rule about secrets that is checked by reading the source of the rule is a rule that
// passes forever after someone deletes the call site.
//
// Two things are deliberately NOT tested with a pseudo-terminal:
//
//   * The refusals. Refusing without a terminal is exactly what a piped `execFileSync` reproduces,
//     so the test environment IS the hostile environment. That is the happy case for once.
//   * The decisions inside the wizard. Each step takes its terminal as a parameter, so a fake one
//     that answers a scripted list of strings exercises the real control flow — the same code path
//     a person walks — with no timing and nothing to flake.
//
// The one property a pty would add (that echo is actually off) is a property of `stty`, and a test
// that asserted it would be testing the terminal driver.
// ================================================================================================

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  AUTHORIZATION_PHRASE,
  buildPolicy,
  DEFAULT_MAX_TRANSACTION_GAS,
  deriveGasCeilings,
  ethToWei,
  normalizeRecipient,
  recipientVerdict,
  stepAuthorization,
  stepRecipient,
  weiToEth,
} from "../src/commands/agent-setup.js";
import { BLOCKER_OWNERS } from "../src/commands/agent-ready.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = join(ROOT, "packages", "creator-cli", "bin", "relics.js");

/** Run the CLI with stdin closed — i.e. exactly how an AI agent would invoke it. */
function run(args, extraEnv = {}) {
  const home = mkdtempSync(join(tmpdir(), "relics-home-"));
  // BOTH STREAMS, ALWAYS. This surface deliberately puts machine output on stdout and every human
  // sentence on stderr, so a helper that captured only stdout would read a help screen as empty —
  // and an assertion over an empty string is a test that cannot fail for the reason it claims.
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1", RELICS_HOME: home, ...extraEnv },
    maxBuffer: 32 * 1024 * 1024,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, stdout: r.stdout ?? "", home };
}

/**
 * A terminal that is not a terminal: it answers from a script and records what was written.
 *
 * `askSecret` reads from the SAME list as `ask` on purpose. If a step ever asked for a secret where
 * the test expected a visible answer, the scripted answers would desynchronise and the assertion
 * below it would fail — which is the signal we want, rather than a fake that quietly tolerates it.
 */
function fakeTty(answers) {
  const asked = [];
  const written = [];
  const remaining = [...answers];
  const take = (q) => {
    asked.push(q);
    // Recorded in `written` as well, and in order: a prompt is text the creator reads, so a
    // transcript that omitted it could not be used to assert what they were shown.
    written.push(q);
    if (remaining.length === 0) throw new Error(`the wizard asked more questions than the test scripted; next was ${JSON.stringify(q)}`);
    return remaining.shift();
  };
  return {
    asked,
    written,
    remaining,
    transcript: () => written.join(""),
    write: (t) => { written.push(t); },
    ask: take,
    askSecret: take,
  };
}

// ------------------------------------------------------------------------------------------------
// 1. A MACHINE CANNOT SET UP A WALLET.
// ------------------------------------------------------------------------------------------------

test("agent setup refuses without a terminal, and creates nothing", () => {
  const r = run(["agent", "setup"]);

  assert.notEqual(r.code, 0, "a non-interactive setup must not succeed");
  assert.equal(r.code, 6, "it is BLOCKED (6) rather than a usage or generic error");

  // WHAT: the refusal names the missing condition rather than describing a generic failure.
  assert.match(r.out, /NOT_INTERACTIVE|NO_CONTROLLING_TERMINAL|NO_DEV_TTY_ON_PLATFORM/);
  // WHO: it says a human must do it, in words an agent reading the output will act on.
  assert.match(r.out, /A human must run this command/);
  assert.match(r.out, /npm run kit -- agent setup/);
  assert.match(r.out, /AI agent/i, "the refusal addresses the agent directly; that is what stops it looking for a workaround");
  // AND IT NEVER OFFERS A WAY ROUND. This is the assertion that matters: the failure mode being
  // guarded against is an agent reading a refusal and inferring that a key would satisfy it.
  assert.doesNotMatch(r.out, /--private-key|supply (a|the) (private )?key|paste your key/i);

  // NOTHING WAS WRITTEN. A refusal that had already created a keystore would be a refusal in name.
  const created = existsSync(join(r.home, "keystore")) ? readdirSync(join(r.home, "keystore")) : [];
  assert.deepEqual(created, [], "no keystore may be created by a refused setup");
  assert.equal(existsSync(join(r.home, "authorization.json")), false, "no grant may be written by a refused setup");
  rmSync(r.home, { recursive: true, force: true });
});

test("wallet create and wallet unlock refuse without a terminal too", () => {
  for (const sub of ["create", "unlock"]) {
    const r = run(["wallet", sub]);
    assert.equal(r.code, 6, `wallet ${sub} must be BLOCKED without a terminal`);
    assert.match(r.out, /A human must run this/, `wallet ${sub} must name who fixes it`);
    assert.doesNotMatch(r.out, /--private-key/i);
    rmSync(r.home, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------------
// 2. KEY MATERIAL IN ARGV IS REFUSED BY NAME.
// ------------------------------------------------------------------------------------------------

const SECRET_FLAGS = [
  ["--private-key", "0x1111111111111111111111111111111111111111111111111111111111111111"],
  ["--mnemonic", "test test test test test test test test test test test junk"],
  ["--seed-phrase", "test test test test test test test test test test test junk"],
];

for (const [flag, value] of SECRET_FLAGS) {
  test(`${flag} is refused by name, on every command`, () => {
    // Tried against three different commands, because the refusal lives in the PARSER and would be
    // a per-command afterthought if it lived anywhere else.
    for (const argv of [["agent", "setup", flag, value], ["wallet", "create", flag, value], ["validate", flag, value]]) {
      const r = run(argv);
      assert.notEqual(r.code, 0, `${argv.join(" ")} must fail`);

      // BY NAME, NOT AS "UNKNOWN OPTION". "unknown option" reads as a spelling mistake and invites
      // a retry with a different flag; there is no different flag, and saying so is the point.
      assert.match(r.out, new RegExp(`${flag} is refused`), `${flag} must be refused by name`);
      assert.doesNotMatch(r.out, new RegExp(`unknown option ${flag}`), `${flag} must not be reported as a typo`);

      // WHY, in a sentence the reader can act on.
      assert.match(r.out, /shell history|ps` output|argv/i);

      // AND THE VALUE IS NEVER ECHOED BACK. An error handler that prints the offending argument is
      // how a key ends up in a log written by the very code that refused it.
      assert.ok(!r.out.includes(value), `${flag}'s value must never appear in the output`);

      rmSync(r.home, { recursive: true, force: true });
    }
  });
}

test("the refusal points at the interactive path instead of a different flag", () => {
  const r = run(["agent", "setup", "--private-key", "0x" + "22".repeat(32)]);
  assert.match(r.out, /wallet create|agent setup/);
  assert.match(r.out, /\/dev\/tty/, "it names the channel that replaces the flag");
  rmSync(r.home, { recursive: true, force: true });
});

// ------------------------------------------------------------------------------------------------
// 3. BACKUP IS NOT AUTOMATABLE.
// ------------------------------------------------------------------------------------------------

test("wallet backup refuses under --json", () => {
  const r = run(["wallet", "backup", "--json"]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /refused under --json/);
  assert.match(r.out, /npm run kit -- wallet backup/, "it names the command that does work");

  // THE REFUSAL COMES BEFORE ANY KEYSTORE READ, so it holds whether or not a wallet exists — the
  // failure mode being guarded against is a script harvesting backups, and such a script would be
  // running on a machine that does have one.
  assert.doesNotMatch(r.out, /"wallets"/, "nothing about the keystore may be emitted on the refusal path");
  rmSync(r.home, { recursive: true, force: true });
});

test("wallet backup refuses without a terminal even without --json", () => {
  const r = run(["wallet", "backup"]);
  assert.equal(r.code, 6);
  assert.match(r.out, /A human must run this/);
  rmSync(r.home, { recursive: true, force: true });
});

// ------------------------------------------------------------------------------------------------
// 4. EVERY BLOCKER SAYS WHOSE IT IS.
// ------------------------------------------------------------------------------------------------

test("agent ready --json gives every blocker an owner and a command", () => {
  const workspace = mkdtempSync(join(tmpdir(), "relics-ready-"));
  const r = run(["agent", "ready", "--offline", "--json", "--workspace", workspace]);
  const env = JSON.parse(r.stdout);

  // INPUT FLOOR. A bare-machine workspace has plenty wrong with it; zero blockers here would mean
  // the evaluation found nothing to evaluate, and every assertion below would pass vacuously.
  assert.ok(env.result.blockers.length >= 4, `expected several blockers on a bare machine, got ${env.result.blockers.length}`);

  for (const b of env.result.blockers) {
    assert.ok(BLOCKER_OWNERS.includes(b.owner), `blocker ${b.id} has owner ${JSON.stringify(b.owner)}, which is not one of ${BLOCKER_OWNERS.join(" | ")}`);
    assert.ok(typeof b.command === "string" && b.command.length > 0, `blocker ${b.id} has an owner but no command — an owner with no command is still homework`);
    assert.ok(typeof b.detail === "string" && b.detail.length > 20, `blocker ${b.id} has no usable detail`);
  }

  // THE OWNER FIELD MUST DISCRIMINATE. If everything were CREATOR_ACTION_REQUIRED the field would
  // be a constant with a long name, and an agent would still be handing its own work back.
  const owners = new Set(env.result.blockers.map((b) => b.owner));
  assert.ok(owners.has("CREATOR_ACTION_REQUIRED"), "a bare machine has creator-owned blockers");
  assert.ok(owners.has("AGENT_CAN_FIX"), "writing the metadata document and exporting the bundle are the agent's own work and must be marked as such");

  // Specifically: the row this whole field exists for.
  const metadata = env.result.blockers.find((b) => b.id === "metadata.document");
  assert.equal(metadata.owner, "AGENT_CAN_FIX", "an agent must never ask a creator to write the collection metadata");

  rmSync(workspace, { recursive: true, force: true });
  rmSync(r.home, { recursive: true, force: true });
});

test("agent ready prints no hashes to a human", () => {
  const workspace = mkdtempSync(join(tmpdir(), "relics-ready-"));
  const r = run(["agent", "ready", "--offline", "--workspace", workspace]);
  // A 32-byte hash on a status screen is unreadable to its reader and looks identical whether it is
  // right or wrong. `--json` carries them; this surface does not.
  assert.doesNotMatch(r.out, /0x[0-9a-fA-F]{64}/, "no hash may reach the human screen");
  assert.match(r.out, /RELICS AGENT/);
  rmSync(workspace, { recursive: true, force: true });
  rmSync(r.home, { recursive: true, force: true });
});

// ------------------------------------------------------------------------------------------------
// 5. THE RECIPIENT IS NOT THE SIGNER BY DEFAULT.
// ------------------------------------------------------------------------------------------------

const SIGNER = "0xCF83c5f64fc0B4DE639Cf61649Ac174f32474e22";
const COLD = "0x7A6f3B4c2D1e0f9A8B7c6D5e4F3a2b1c0d9E8F7A";
const addressTools = await import("viem").then((v) => ({ getAddress: v.getAddress, isAddress: v.isAddress }));

test("recipientVerdict flags the signer's own address and demands an override", () => {
  const same = recipientVerdict(SIGNER, SIGNER);
  assert.equal(same.same, true);
  assert.equal(same.requiresOverride, true);
  assert.match(same.detail, /hot key/i);
  assert.match(same.detail, /cannot be changed/i, "the reason has to name the permanence, or it reads as fussiness");

  // Case must not matter: the same address in a different case is the same address.
  assert.equal(recipientVerdict(SIGNER.toLowerCase(), SIGNER).requiresOverride, true);

  const different = recipientVerdict(COLD, SIGNER);
  assert.equal(different.same, false);
  assert.equal(different.requiresOverride, false);
});

test("the wizard will not accept the signer's address without the typed override", async () => {
  // The creator enters the signer, is warned, declines (bare Enter), then enters a cold address.
  const tty = fakeTty([SIGNER, "", COLD]);
  const chosen = await stepRecipient(tty, SIGNER, addressTools);

  assert.equal(chosen, COLD, "declining the override must return to the question, not proceed");
  assert.match(tty.transcript(), /WARNING/);
  assert.match(tty.transcript(), /USE MY LAUNCH WALLET/, "the override is a typed phrase, not a keystroke");
  assert.equal(tty.remaining.length, 0, "every scripted answer was consumed, so the flow is the one under test");
});

test("the wizard accepts the signer's address only when the override phrase is typed exactly", async () => {
  const accepted = fakeTty([SIGNER, "USE MY LAUNCH WALLET"]);
  assert.equal(await stepRecipient(accepted, SIGNER, addressTools), addressTools.getAddress(SIGNER));

  // `y`, `yes` and the phrase in the wrong case are all refused: this is the answer that cannot be
  // taken back, so it must not share a keystroke with any other question in the wizard.
  const rejected = fakeTty([SIGNER, "y", "yes", "use my launch wallet", "", COLD]);
  assert.equal(await stepRecipient(rejected, SIGNER, addressTools), COLD);
  assert.equal(rejected.remaining.length, 0);
});

test("a mixed-case address with a broken checksum is refused rather than silently re-checksummed", async () => {
  // One character of the checksummed form flipped in case: still 40 hex characters, still parses,
  // and viem's getAddress would happily hand back a valid-looking address belonging to nobody.
  const body = COLD.slice(2);
  const at = [...body].findIndex((c) => /[a-fA-F]/.test(c));
  assert.ok(at >= 0, "the fixture must contain a letter for the checksum to encode anything");
  const flipped = body[at] === body[at].toLowerCase() ? body[at].toUpperCase() : body[at].toLowerCase();
  const broken = `0x${body.slice(0, at)}${flipped}${body.slice(at + 1)}`;
  assert.notEqual(broken, COLD, "the fixture must actually differ, or this test proves nothing");
  assert.throws(() => normalizeRecipient(broken, addressTools), /checksum/i);

  // An ALL-lowercase address carries no checksum claim at all, so it is accepted and normalised —
  // refusing it would reject what most wallets and explorers actually display.
  assert.equal(normalizeRecipient(COLD.toLowerCase(), addressTools), COLD);
});

// ------------------------------------------------------------------------------------------------
// 6. THE HUMAN'S ETH CEILING BECOMES THE MACHINE'S WEI CEILING, EXACTLY.
// ------------------------------------------------------------------------------------------------

test("ethToWei is exact, and refuses what it cannot represent", () => {
  assert.equal(ethToWei("0.03"), 30_000_000_000_000_000n);
  assert.equal(ethToWei("1"), 10n ** 18n);
  assert.equal(ethToWei("0.000000000000000001"), 1n);
  assert.equal(ethToWei(" 2.5 "), 2_500_000_000_000_000_000n);
  assert.equal(ethToWei(".5"), 500_000_000_000_000_000n);

  // THE FLOAT PATH IS THE ONE THAT MATTERS. Number("0.03") * 1e18 is not 3e16 on this hardware,
  // and a ceiling four wei away from what a creator typed is a ceiling nobody chose.
  assert.notEqual(BigInt(Math.round(Number("0.1") * 1e18)), ethToWei("0.1") + 1n);
  assert.equal(ethToWei("0.1"), 100_000_000_000_000_000n);

  // Refusals, each because rounding a spending ceiling silently is worse than asking again.
  assert.throws(() => ethToWei("0.0000000000000000001"), /18/);
  assert.throws(() => ethToWei("1e-2"), /exponent|in full/i);
  assert.throws(() => ethToWei("0"), /zero/i);
  assert.throws(() => ethToWei(""), /amount/i);
  assert.throws(() => ethToWei("abc"), /decimal/i);
  assert.throws(() => ethToWei("-1"), /decimal/i);
});

test("weiToEth round-trips what the summary shows the creator", () => {
  for (const input of ["0.03", "1", "12.5", "0.000000000000000001"]) {
    assert.equal(weiToEth(ethToWei(input)), input.replace(/^\./, "0."));
  }
});

test("the two policy ceilings can never jointly exceed the fee the creator authorized", () => {
  for (const eth of ["0.03", "0.005", "1", "12.5"]) {
    const total = ethToWei(eth);
    const d = deriveGasCeilings(total, DEFAULT_MAX_TRANSACTION_GAS);
    assert.ok(d.usable, `${eth} ETH must produce a usable ceiling`);
    assert.ok(
      d.maxGasPriceWei * d.maxTransactionGas <= total,
      `${eth} ETH: maxGasPriceWei * maxTransactionGas (${d.maxGasPriceWei * d.maxTransactionGas}) must not exceed the authorized ${total}`,
    );
  }

  // AND A CEILING TOO SMALL TO USE IS REPORTED, NOT ROUNDED UP TO ONE THAT WORKS. Writing a policy
  // that refuses every transaction is a worse outcome than telling the creator their number is too
  // small, but quietly raising it would be worse than both.
  const tiny = deriveGasCeilings(1n, DEFAULT_MAX_TRANSACTION_GAS);
  assert.equal(tiny.usable, false);
  assert.equal(tiny.maxGasPriceWei, 0n);
});

test("the fee question carries the creator's answer into maxTotalGasCostWei", async () => {
  // Safe autonomous, 0.25 ETH, default expiry. The step is driven exactly as a person drives it.
  const tty = fakeTty(["2", "0.25", "2"]);
  const answers = await stepAuthorization(tty);

  assert.equal(answers.maxTotalGasCostWei, 250_000_000_000_000_000n, "0.25 ETH is 25e16 wei");
  assert.equal(answers.preset, "SAFE_AUTONOMOUS");
  assert.equal(answers.allowBroadcastIntent, true);
  assert.equal(answers.maxTransactionGas, DEFAULT_MAX_TRANSACTION_GAS);
  assert.ok(answers.maxGasPriceWei * answers.maxTransactionGas <= answers.maxTotalGasCostWei);
  assert.equal(answers.launchesAllowed, 1, "the default grant covers ONE launch");
  assert.equal(answers.mode, "SINGLE_LAUNCH");
  assert.ok(answers.expiresAt !== null, "the default grant expires");
  assert.equal(tty.remaining.length, 0);

  // AND THE PRESET ALONE NEVER GRANTS BROADCAST. `allowBroadcastIntent` is a proposal; the wizard
  // only turns it into `allowBroadcast` after the phrase is typed.
  assert.equal(Object.hasOwn(answers, "allowBroadcast"), false, "the step must not decide allowBroadcast");
});

test("build only proposes no broadcast, whatever fee is authorized", async () => {
  const tty = fakeTty(["1", "0.03", "2"]);
  const answers = await stepAuthorization(tty);
  assert.equal(answers.preset, "BUILD_ONLY");
  assert.equal(answers.goal, "BUILD_ONLY");
  assert.equal(answers.allowBroadcastIntent, false);
});

test("no expiry is never chosen silently", async () => {
  // Choosing "no expiry" and then pressing Enter falls back to 24 hours rather than granting it.
  const declined = fakeTty(["2", "0.03", "4", ""]);
  const a = await stepAuthorization(declined);
  assert.ok(a.expiresAt !== null, "an unconfirmed 'no expiry' must not produce an indefinite grant");

  const confirmed = fakeTty(["2", "0.03", "4", "NO EXPIRY"]);
  const b = await stepAuthorization(confirmed);
  assert.equal(b.expiresAt, null, "typing the phrase does grant it");
});

// ------------------------------------------------------------------------------------------------
// The authorization gesture itself.
// ------------------------------------------------------------------------------------------------

test("the authorization phrase is a phrase, not a keystroke", () => {
  assert.equal(AUTHORIZATION_PHRASE, "AUTHORIZE RELICS LAUNCH");
  assert.ok(AUTHORIZATION_PHRASE.includes(" "), "a single token can be typed by accident or by a program that assumes a default");
  assert.ok(!/^[yn]$/i.test(AUTHORIZATION_PHRASE));
});

test("agent --help leads with the three questions people arrive with", () => {
  const r = run(["agent", "--help"]);
  assert.equal(r.code, 0);
  const first = r.out.indexOf("FIRST TIME");
  const ready = r.out.indexOf("READY?");
  const creating = r.out.indexOf("AGENT CREATING?");
  const advanced = r.out.indexOf("Advanced");
  assert.ok(first > -1 && ready > first && creating > ready, "the three entry points come first, in order");
  assert.ok(advanced > creating, "the twenty-two subcommands come after them, not before");
  assert.match(r.out, /agent setup/);
  assert.match(r.out, /agent ready/);
  assert.match(r.out, /agent run --workspace/);
  rmSync(r.home, { recursive: true, force: true });
});

test("the wallet commands are unreachable from the agent namespace", () => {
  const r = run(["agent", "wallet", "unlock", "--json"]);
  assert.notEqual(r.code, 0);
  const env = JSON.parse(r.stdout);
  assert.match(env.errors[0], /does not exist/);
  assert.match(env.errors[0], /npm run kit -- wallet unlock/, "the refusal names the real command");
  assert.match(env.errors[0], /human at a terminal/);
  rmSync(r.home, { recursive: true, force: true });
});

// ------------------------------------------------------------------------------------------------
// The human-only commands must be unreachable from the machine's own vocabulary.
// ------------------------------------------------------------------------------------------------

test("no wallet command appears in the next-action vocabulary or in `agent run`", async () => {
  const { NEXT_ACTION_SUBCOMMANDS } = await import("@relics/agent-flow");
  const { WALLET_SUBCOMMANDS } = await import("../src/commands/wallet.js");

  // `NEXT_ACTION_SUBCOMMANDS` is what an agent is told it may run. A human-only step listed there
  // is a step the agent will try, fail, and then report as a blocker of the whole run — so the
  // absence is the mechanism, not an oversight.
  assert.ok(NEXT_ACTION_SUBCOMMANDS.length >= 20, "input floor: the vocabulary must have been read");
  assert.equal(NEXT_ACTION_SUBCOMMANDS.includes("wallet"), false);
  for (const w of ["create", "unlock", "lock", "backup"]) {
    assert.equal(NEXT_ACTION_SUBCOMMANDS.includes(`wallet-${w}`), false, `wallet-${w} must not be a next action`);
  }
  assert.ok(WALLET_SUBCOMMANDS.includes("backup"), "input floor: the wallet surface must have been read");

  // And `agent run` — the one command that executes a sequence without asking — must not name any
  // of them. Read from the dispatcher's source because the step list IS the thing under test.
  const { readFileSync } = await import("node:fs");
  const dispatcher = readFileSync(join(ROOT, "packages/creator-cli/src/commands/agent.js"), "utf8");
  // BOUNDED TO THE FUNCTION. An unbounded slice ran to the end of the file and picked up the help
  // text, which quite correctly tells a reader that `wallet create` exists — so the first version
  // of this assertion failed on the sentence that documents the very separation it was checking.
  const start = dispatcher.indexOf("async function cmdRun");
  assert.ok(start > 0, "input floor: cmdRun must have been located");
  const end = dispatcher.indexOf("\n}\n", start);
  assert.ok(end > start, "input floor: cmdRun's closing brace must have been located");
  const runBody = dispatcher.slice(start, end);
  assert.ok(runBody.includes("BROADCAST"), "input floor: the step list must be inside the slice");
  for (const w of WALLET_SUBCOMMANDS) {
    assert.doesNotMatch(runBody, new RegExp(`wallet[^\\n]*${w}`, "i"), `agent run must not reach wallet ${w}`);
  }
});

test("a credentialled RPC endpoint never reaches the ready screen or its JSON", () => {
  // THE MACHINE THIS PROTECTS IS THE RECOMMENDED ONE. The kit tells creators to set
  // <CHAIN>_RPC_URL, and the endpoints worth setting carry an API key in the path. The SDK is
  // careful to report `source` rather than the URL — but a transport error quotes the request URL
  // back, and a finding that wraps one would print the key onto a status screen and into any
  // transcript watching it.
  const secret = "SUPERSECRETAPIKEY" + "0".repeat(20);
  const workspace = mkdtempSync(join(tmpdir(), "relics-ready-"));
  // A POLICY IS REQUIRED FOR THE PROPERTY TO EXIST AT ALL: with no authorized chains there is
  // nothing to read, no transport error, and therefore nothing to redact — the first version of
  // this test passed against a screen that had never touched an endpoint.
  writeFileSync(
    join(workspace, "relics.agent.json"),
    `${JSON.stringify(buildPolicy({
      goal: "BUILD_ONLY",
      allowedChains: [1, 8453],
      allowedRuntimes: ["SOLIDITY_SVG_V1"],
      creatorRecipient: COLD,
      maxRoyaltyBps: 500,
      allowBroadcast: false,
      maxGasPriceWei: 1_875_000_000n,
      maxTransactionGas: 16_000_000n,
    }), null, 2)}\n`,
  );
  for (const argv of [["agent", "ready", "--workspace", workspace], ["agent", "ready", "--json", "--workspace", workspace]]) {
    const r = run(argv, {
      ETHEREUM_RPC_URL: `https://eth-mainnet.example.invalid/v2/${secret}`,
      BASE_RPC_URL: `https://base-mainnet.example.invalid/v2/${secret}`,
      ROBINHOOD_RPC_URL: `https://rh.example.invalid/v2/${secret}`,
      RELICS_READY_TIMEOUT_MS: "4000",
    });
    assert.ok(!r.out.includes(secret), `${argv.join(" ")} leaked the endpoint credential`);
    assert.ok(!r.out.includes("example.invalid"), `${argv.join(" ")} printed the endpoint host`);
    // INPUT FLOOR: the run must actually have tried and failed to read, or there was no error text
    // to redact and this assertion passed on an empty page.
    assert.match(r.out, /<endpoint>|UNKNOWN|did not answer|No chain answered/i, "the read must have produced something to redact");
    rmSync(r.home, { recursive: true, force: true });
  }
  rmSync(workspace, { recursive: true, force: true });
});

// ------------------------------------------------------------------------------------------------
// Every refusal code the system can emit has a sentence saying what to do about it.
// ------------------------------------------------------------------------------------------------

test("every refusal code carries a remedy, and the list is DERIVED from the declarations", async () => {
  const { readFileSync } = await import("node:fs");
  const { remedyFor, OWNERS } = await import("../src/commands/agent-remedies.js");

  // DERIVED, NOT TYPED OUT. A hand-maintained list of codes is a list that goes stale the first
  // time someone adds a fourteenth refusal — and the symptom of that is a creator reading a bare
  // code at the exact moment their launch stopped, which is what this table exists to prevent.
  const sources = [
    ["SignerRefusalCode", join(ROOT, "packages/launch-sdk/src/contracts.ts")],
    ["GrantRefusalCode", join(ROOT, "packages/signer-protocol/src/grantGuard.ts")],
  ];

  const codes = [];
  for (const [name, path] of sources) {
    const src = readFileSync(path, "utf8");
    const decl = src.slice(src.indexOf(`export type ${name} =`));
    assert.ok(decl.length > 0, `${name} must be declared in ${path}`);
    const body = decl.slice(0, decl.indexOf(";"));
    const found = [...body.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    assert.ok(found.length >= 10, `input floor: expected to parse many ${name} members, got ${found.length}`);
    codes.push(...found);
  }

  const missing = codes.filter((c) => !remedyFor(c));
  assert.deepEqual(missing, [], `these refusal codes reach a reader with no advice: ${missing.join(", ")}`);

  for (const c of codes) {
    const r = remedyFor(c);
    assert.ok(OWNERS.includes(r.owner), `${c} has owner ${r.owner}`);
    assert.ok(r.command.length > 0, `${c} names no command`);
    assert.ok(r.what.length > 30, `${c}'s advice is too short to be advice`);
    // AND IT NEVER OFFERS A KEY. An error message is read at the moment someone is most willing to
    // do something unwise to make the error stop.
    assert.doesNotMatch(`${r.what} ${r.command}`, /private key|--private-key|mnemonic|seed phrase/i, `${c} must never suggest supplying key material`);
  }
});

// ------------------------------------------------------------------------------------------------
// No credential this process was handed may leave it, through any command.
// ------------------------------------------------------------------------------------------------

test("a credentialled endpoint never reaches any agent command's output", () => {
  // THIS WAS A REAL LEAK, NOT A HYPOTHETICAL. `agent capabilities --json` printed the API key from
  // ETHEREUM_RPC_URL — not because anything logged the variable, but because a failed chain read
  // produced a viem transport error, the error quoted its own request URL, and the message rode out
  // inside a Finding.detail that nothing had reason to suspect. The scrub is at the emit boundary
  // precisely because no source deserves to be trusted to remember.
  const canary = "LEAKCANARY" + "9".repeat(16);
  const workspace = mkdtempSync(join(tmpdir(), "relics-leak-"));
  writeFileSync(
    join(workspace, "relics.agent.json"),
    `${JSON.stringify(buildPolicy({
      goal: "BUILD_ONLY",
      allowedChains: [1],
      allowedRuntimes: ["SOLIDITY_SVG_V1"],
      creatorRecipient: COLD,
      maxRoyaltyBps: 500,
      allowBroadcast: false,
      maxGasPriceWei: 1_875_000_000n,
      maxTransactionGas: 16_000_000n,
    }), null, 2)}\n`,
  );
  const env = {
    ETHEREUM_RPC_URL: `https://eth.example.invalid/v2/${canary}`,
    PINATA_JWT: `jwt.${canary}.signature`,
    RELICS_READY_TIMEOUT_MS: "4000",
  };

  let sawSomething = false;
  for (const argv of [
    ["agent", "capabilities", "--json", "--workspace", workspace],
    ["agent", "preflight", "--json", "--workspace", workspace],
    ["agent", "doctor", "--json", "--workspace", workspace],
    ["agent", "quotes", "--json", "--workspace", workspace],
    ["agent", "ready", "--json", "--workspace", workspace],
    ["agent", "ready", "--workspace", workspace],
  ]) {
    const r = run(argv, env);
    assert.ok(!r.out.includes(canary), `${argv.join(" ")} leaked a credential`);
    if (r.out.includes("<redacted:") || r.out.includes("<endpoint>")) sawSomething = true;
    rmSync(r.home, { recursive: true, force: true });
  }

  // INPUT FLOOR. If no command ever produced text containing the endpoint, the assertions above
  // held because nothing was measured. At least one run must show the redaction actually firing.
  assert.ok(sawSomething, "no command produced redacted text, so this test proved nothing");
  rmSync(workspace, { recursive: true, force: true });
});

test("the scrub matches by VALUE, so it does not blank ordinary URLs", async () => {
  const { scrub, knownSecrets } = await import("../src/scrub.js");
  const env = { ETHEREUM_RPC_URL: "https://eth.example.invalid/v2/SECRETVALUE12345", PATH: "/usr/bin" };

  assert.equal(knownSecrets(env).length, 1, "only credential-shaped variable names count");

  const out = scrub(
    { explorer: "https://etherscan.io/tx/0xabc", detail: "failed: https://eth.example.invalid/v2/SECRETVALUE12345 timed out" },
    env,
  );
  // An explorer link is the most useful thing in a broadcast receipt and must survive. A blanket
  // URL redaction would have taken it, which is why the scrub is keyed on the value.
  assert.equal(out.explorer, "https://etherscan.io/tx/0xabc");
  assert.match(out.detail, /<redacted:ETHEREUM_RPC_URL>/);
  assert.ok(!out.detail.includes("SECRETVALUE12345"));

  // A short value is not treated as a secret: redacting "1" would turn ordinary output into noise.
  assert.deepEqual(knownSecrets({ SOME_KEY: "abc" }), []);
});
