// SPDX-License-Identifier: MIT
// ================================================================================================
// `relics agent setup` — THE ONE-TIME HUMAN WIZARD.
//
// This command exists because of a gap that is not technical. 4.1.0 already had a policy file, an
// encrypted keystore, a scoped signer and a grant format; what it did not have was a moment where a
// PERSON looked at what they were authorizing and said yes. Without that moment every ceiling in
// the system is a number an agent wrote into a file on the creator's behalf, which is not
// authorization — it is an agent authorizing itself and filing the paperwork.
//
// SO THE WHOLE FILE IS BUILT AROUND ONE PROPERTY: nothing here can be answered by a machine.
//
//   * Secrets are read from /dev/tty, never process.stdin — a parent process owns a child's stdin,
//     and an AI agent driving this kit IS the parent process.
//   * `--private-key`, `--mnemonic` and `--seed-phrase` are refused BY NAME rather than being
//     unknown flags, because "unknown option" reads as "wrong spelling" and invites a retry.
//   * The final gesture is a typed phrase, not `[Y/n]`. A single keystroke is what a person emits
//     while thinking about something else, and it is what an agent emits when it has been told the
//     prompt is a formality.
//
// IT BUILDS NOTHING NEW. The policy it writes is `@relics/launch-sdk`'s schema, validated by that
// schema's own parser before a byte is written; the grant it writes is the signer's `Authorization`
// through the signer's own `writeAuthorization`; the wallet it makes is the signer's keystore. This
// file is a conversation, and everything it decides is stored by the code that already owned it.
// ================================================================================================
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadAddressTools, loadAuthorization, loadKeystore } from "../signer-bridge.js";
import { PromptAborted, ttyCapability, ttyRefusalMessage, withTty } from "../tty.js";
import { bold, cyan, dim, green, red, yellow } from "../report.js";

export const EXIT = { OK: 0, REFUSED: 1, USAGE: 2, BLOCKED: 6 };

/**
 * THE AUTHORIZATION GESTURE.
 *
 * Exported so the tests and the docs quote the same string the code compares against. A phrase that
 * is written down in two places is a phrase that will one day be checked in one of them.
 */
export const AUTHORIZATION_PHRASE = "AUTHORIZE RELICS LAUNCH";

/** The policy default. Under the EIP-7825 per-transaction cap of 2^24, which the schema enforces. */
export const DEFAULT_MAX_TRANSACTION_GAS = 16_000_000n;

export const EXPIRY_CHOICES = [
  { key: "1", label: "1 hour", hours: 1 },
  { key: "2", label: "24 hours", hours: 24, default: true },
  { key: "3", label: "7 days", hours: 24 * 7 },
  { key: "4", label: "no expiry", hours: null },
];

export const PRESETS = [
  {
    key: "1",
    id: "BUILD_ONLY",
    goal: "BUILD_ONLY",
    allowBroadcast: false,
    title: "Build only",
    blurb: "The agent may do everything up to a signed-ready transaction and then stops. Nothing is broadcast. You sign the final step yourself.",
  },
  {
    key: "2",
    id: "SAFE_AUTONOMOUS",
    goal: "LAUNCH",
    allowBroadcast: true,
    title: "Safe autonomous",
    blurb: "The agent may broadcast ONE launch, within every ceiling below, until the grant expires. This is the only preset that can spend your gas.",
  },
  {
    key: "3",
    id: "CUSTOM",
    goal: "BUILD_ONLY",
    allowBroadcast: false,
    title: "Custom",
    blurb: "Set the gas price and per-transaction gas ceilings yourself, and choose how many launches the grant covers. Like build-only, it does not authorize broadcasting: a preset that both loosens ceilings and grants sending would be the one preset nobody should reach for by accident.",
  },
];

// ------------------------------------------------------------------------------------------------
// PURE HELPERS — no terminal, no disk. Everything a test needs to check without a human present.
// ------------------------------------------------------------------------------------------------

/**
 * A decimal ETH amount to wei, EXACTLY.
 *
 * PARSED AS A STRING AND NEVER THROUGH `Number`. `Number("0.03") * 1e18` is 30000000000000000.004
 * on this hardware, and a spending ceiling that is four wei away from what the creator typed is a
 * ceiling nobody chose — the same reasoning that makes the policy schema refuse a JSON number.
 * More than 18 decimals is REFUSED rather than truncated: silently dropping the digits a person
 * deliberately typed is how a ceiling ends up smaller than they believe.
 */
export function ethToWei(input) {
  const text = String(input ?? "").trim().replace(/^\+/, "");
  if (text === "") throw new Error("Enter an amount, for example 0.03");
  if (/[eE]/.test(text)) throw new Error("Write the amount in full (0.03), not in exponent form — a ceiling should be readable at a glance.");
  if (!/^\d*(\.\d*)?$/.test(text) || text === "." ) throw new Error(`"${input}" is not a plain decimal number of ETH. Write it like 0.03`);
  const [wholeRaw, fracRaw = ""] = text.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  if (fracRaw.length > 18) throw new Error(`${fracRaw.length} decimal places, but wei only has 18. Refusing to round your ceiling for you.`);
  const frac = fracRaw.padEnd(18, "0");
  const wei = BigInt(whole) * 10n ** 18n + BigInt(frac);
  if (wei === 0n) throw new Error("A ceiling of zero authorizes nothing at all — every launch would be refused for exceeding it. Enter the largest network fee you are willing to pay.");
  return wei;
}

/** wei back to a short, honest ETH string for the summary. Never rounded up. */
export function weiToEth(wei) {
  const v = BigInt(wei);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac === "" ? `${whole}` : `${whole}.${frac}`;
}

export function weiToGwei(wei) {
  const v = BigInt(wei);
  const whole = v / 10n ** 9n;
  const frac = (v % 10n ** 9n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac === "" ? `${whole}` : `${whole}.${frac}`;
}

/**
 * THE HUMAN CEILING BECOMES THE TWO MACHINE CEILINGS, and it can only ever bound them.
 *
 * A creator understands "at most 0.03 ETH in network fees". They do not, and should not have to,
 * hold an opinion about gwei or a gas limit. So one number is asked for and the policy's
 * `maxGasPriceWei` is DERIVED from it against a fixed transaction-gas ceiling, which makes the
 * product of the two policy ceilings less than or equal to the number the creator actually agreed
 * to. Asking for all three separately is how a policy ends up authorizing 40x what its owner meant.
 */
export function deriveGasCeilings(maxTotalGasCostWei, maxTransactionGas = DEFAULT_MAX_TRANSACTION_GAS) {
  const total = BigInt(maxTotalGasCostWei);
  const gas = BigInt(maxTransactionGas);
  const maxGasPriceWei = total / gas;
  return {
    maxTransactionGas: gas,
    maxGasPriceWei,
    // Reported so the caller can refuse rather than write an unusable policy: a gas price of zero
    // means every transaction is over the ceiling and the grant can never be used.
    usable: maxGasPriceWei > 0n,
    impliedGwei: weiToGwei(maxGasPriceWei),
  };
}

/**
 * IS THIS RECIPIENT THE SIGNER? A warning, and a stop, not a refusal.
 *
 * The launch wallet is a hot key that lives on this laptop and is expected to be lost one day; the
 * creator recipient is a permanent, irreversible right to a fee stream. Pointing the second at the
 * first is legal, occasionally deliberate, and usually a mistake made by someone who has only one
 * address to hand. So it is stopped and explained rather than blocked — the creator can still
 * choose it, but not by accident.
 */
export function recipientVerdict(recipient, signerAddress) {
  const same = String(recipient ?? "").toLowerCase() === String(signerAddress ?? "").toLowerCase();
  if (!same) return { same: false, requiresOverride: false, detail: "" };
  return {
    same: true,
    requiresOverride: true,
    detail:
      "That is the same address as your launch wallet.\n" +
      "  The LAUNCH WALLET is a hot key stored on this machine. It pays gas. It is designed to be\n" +
      "  cheap to lose, and this kit assumes it will be.\n" +
      "  The CREATOR RECIPIENT permanently receives your share of every fee this project ever earns.\n" +
      "  It is written into the launch and cannot be changed afterwards by anyone, including you.\n" +
      "  Sending a permanent revenue right to a disposable key is almost never what someone means.",
  };
}

/** Turn hours into the grant's ISO expiry, or null for a grant the creator chose not to expire. */
export function expiryFrom(hours, now = new Date()) {
  if (hours === null) return null;
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

/**
 * The policy object, built from the wizard's answers ALONE.
 *
 * Exported so a test can build one without a terminal, and so the field list lives beside the
 * questions that fill it. `parseAgentPolicy` is still the authority — this returns a candidate and
 * the caller must have the schema accept it before anything is written.
 */
export function buildPolicy(answers) {
  return {
    $comment: [
      "Written by `relics agent setup` on " + new Date().toISOString() + ".",
      "THE AUTHORIZATION BOUNDARY. Not part of your .relics project and never packed into one.",
      "The ceilings below were derived from one question: the largest network fee you authorized.",
      "Editing this file by hand does NOT widen what the signer will do — the grant in ~/.relics is",
      "bound to this file's hash, and changing a value here invalidates it. Re-run `agent setup`.",
    ],
    version: 1,
    goal: answers.goal,
    allowedChains: answers.allowedChains,
    chainSelection: "PREFERRED_THEN_GAS",
    allowedRuntimes: answers.allowedRuntimes,
    allowedQuoteAssets: "AUTO",
    creatorRecipient: answers.creatorRecipient,
    allowedAntiSnipeModes: ["NONE", "PROTECTED_98_MINUTES"],
    antiSnipePreference: "AUTO",
    maxRoyaltyBps: answers.maxRoyaltyBps,
    maxNativeSpendWei: "0",
    maxGasPriceWei: answers.maxGasPriceWei.toString(),
    maxTransactionGas: answers.maxTransactionGas.toString(),
    requireSimulation: true,
    requireMetadataReadback: true,
    requireDeterministicPrediction: true,
    requiredConfirmations: 2,
    allowBroadcast: answers.allowBroadcast,
    signer: "local-sidecar",
  };
}

/** The plain-language summary the creator reads immediately before typing the phrase. */
export function summaryLines(answers) {
  const lines = [];
  lines.push(`  Launch wallet        ${answers.signerAddress}`);
  lines.push(`  Creator earnings to  ${answers.creatorRecipient}`);
  lines.push(`  Chains               ${answers.allowedChains.join(", ")}`);
  lines.push(`  Art runtime          ${answers.allowedRuntimes.join(", ")}`);
  lines.push(`  Max network fee      ${weiToEth(answers.maxTotalGasCostWei)} ETH total`);
  lines.push(`                       (at most ${answers.maxTransactionGas} gas at ${weiToGwei(answers.maxGasPriceWei)} gwei)`);
  lines.push(`  Other spending       none — this grant authorizes gas and nothing else`);
  lines.push(`  Launches covered     ${answers.launchesAllowed} (${answers.mode})`);
  lines.push(`  Expires              ${answers.expiresAt ?? "never — you must revoke it yourself"}`);
  lines.push(`  May broadcast        ${answers.allowBroadcast ? "YES — the agent can send the launch transaction" : "NO — the agent stops at a built, unsigned transaction"}`);
  return lines;
}

// ------------------------------------------------------------------------------------------------
// THE WIZARD
// ------------------------------------------------------------------------------------------------

const RULE = "────────────────────────────────────────────────────────────";

function step(tty, n, total, title) {
  tty.write(`\n${bold(`STEP ${n}/${total}`)}  ${bold(title)}\n`);
}

function note(tty, text) {
  for (const line of String(text).split("\n")) tty.write(`  ${dim(line)}\n`);
}

function shortAddress(a) {
  const s = String(a);
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

/** Ask until the answer parses. `parse` throws a creator-facing sentence; it is printed verbatim. */
function askUntil(tty, question, parse, { secret = false } = {}) {
  for (;;) {
    const raw = secret ? tty.askSecret(question) : tty.ask(question);
    try {
      return parse(raw);
    } catch (err) {
      tty.write(`  ${red(err instanceof Error ? err.message : String(err))}\n`);
    }
  }
}

function askChoice(tty, question, keys) {
  return askUntil(tty, question, (raw) => {
    const v = raw.trim();
    if (!keys.includes(v)) throw new Error(`Choose one of: ${keys.join(", ")}`);
    return v;
  });
}

function askYes(tty, question) {
  // NOT the authorization gesture — used only for navigation ("show me the list again?"). The one
  // decision that matters is never a keystroke; see AUTHORIZATION_PHRASE.
  return askUntil(tty, question, (raw) => {
    const v = raw.trim().toLowerCase();
    if (["y", "yes"].includes(v)) return true;
    if (["n", "no", ""].includes(v)) return false;
    throw new Error("Answer y or n.");
  });
}


/**
 * A typed address to its checksummed form — REFUSING a mixed-case one whose checksum is wrong.
 *
 * viem's `getAddress` re-checksums whatever it is given and does not object to a wrong one, so
 * calling it alone would silently "fix" a transposed character into a perfectly valid address that
 * belongs to nobody. EIP-55 exists precisely to catch that, and this is the one field in the wizard
 * where the mistake is permanent and unrecoverable.
 *
 * An all-lowercase (or all-uppercase) address carries NO checksum information — every wallet that
 * displays one that way is telling the truth — so it is accepted and normalised. Only a mixed-case
 * address makes a claim, and only that claim is checked.
 */
export function normalizeRecipient(raw, addressTools) {
  const v = String(raw ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error("That is not an Ethereum address (0x followed by 40 hex characters).");
  const checksummed = addressTools.getAddress(v);
  const body = v.slice(2);
  const carriesChecksum = body !== body.toLowerCase() && body !== body.toUpperCase();
  if (carriesChecksum && checksummed !== v) {
    throw new Error("That address's EIP-55 checksum does not match, which means at least one character is wrong. Copy it again from your wallet rather than retyping it — this address is permanent and cannot be corrected after launch.");
  }
  return checksummed;
}

/** STEP: the wallet. Create, reuse or import — and never overwrite one that already exists. */
async function stepWallet(tty, keystore) {
  const existing = keystore.listWallets();
  if (existing.length > 0) {
    tty.write(`  You already have ${existing.length === 1 ? "a launch wallet" : `${existing.length} launch wallets`} on this machine:\n\n`);
    existing.forEach((w, i) => tty.write(`    ${i + 1}. ${cyan(w.address)}  ${dim(`created ${w.createdAt}`)}\n`));
    tty.write("\n");
    note(tty, "An existing wallet is never replaced or overwritten by this wizard. A launch wallet holds\nreal gas and a lost keystore is a lost balance, so removing one is a deliberate,\nseparate act: `npm run kit -- wallet list` then delete the file it names.");
    tty.write("\n");
    const keys = [...existing.map((_, i) => String(i + 1)), "n", "i"];
    tty.write(`  ${dim("1..n = use that wallet   n = create a new one   i = import an existing key")}\n`);
    const choice = askChoice(tty, "  Which? ", keys);
    if (/^\d+$/.test(choice)) {
      const chosen = existing[Number(choice) - 1];
      tty.write(`  ${green("✓")} using ${chosen.address}\n`);
      return { address: chosen.address, created: false };
    }
    return choice === "i" ? importWallet(tty, keystore) : createWallet(tty, keystore);
  }
  tty.write("  You have no launch wallet yet.\n\n");
  note(tty, "This is a hot key that lives on this machine, encrypted with a passphrase. Its only job is\npaying gas. It should never hold your earnings, and this kit assumes you may lose it one day —\nwhich is exactly why the creator recipient you set in a moment is a DIFFERENT address.");
  tty.write("\n");
  tty.write(`  ${dim("n = create a new wallet   i = import an existing private key")}\n`);
  const choice = askChoice(tty, "  Which? ", ["n", "i"]);
  return choice === "i" ? importWallet(tty, keystore) : createWallet(tty, keystore);
}

function askPassphrase(tty, purpose) {
  for (;;) {
    const first = tty.askSecret(`  ${purpose} `);
    if (first.length < 12) {
      tty.write(`  ${red("At least 12 characters. This passphrase is the only thing between a stolen file and a usable key.")}\n`);
      continue;
    }
    const again = tty.askSecret("  Type it again: ");
    if (again !== first) {
      tty.write(`  ${red("Those did not match. Nothing was saved; try again.")}\n`);
      continue;
    }
    return first;
  }
}

function createWallet(tty, keystore) {
  tty.write("\n");
  note(tty, "Choose a passphrase. It is not stored anywhere and cannot be recovered — if you lose it,\nthe wallet is gone and so is any gas in it. Nothing you type here is shown.");
  tty.write("\n");
  const passphrase = askPassphrase(tty, "Passphrase:     ");
  // createWallet returns the ADDRESS ONLY. There is no key in this scope to leak.
  const { address, path } = keystore.createWallet(passphrase);
  tty.write(`\n  ${green("✓")} wallet created: ${cyan(address)}\n`);
  tty.write(`  ${dim(`encrypted at ${path} (mode 0600)`)}\n`);
  tty.write(`  ${dim("The private key was never printed and there is no command that will print it.")}\n`);
  tty.write(`  ${yellow("Back it up now: `npm run kit -- wallet backup` writes the ENCRYPTED file somewhere you choose.")}\n`);
  return { address, created: true };
}

function importWallet(tty, keystore) {
  tty.write("\n");
  note(tty, "Paste the private key of a wallet you already control. It is read from your terminal with\nthe echo turned off: it will not appear on screen, will not enter your shell history, and\nwill not be visible to anything that started this command.");
  tty.write("\n");
  const key = askUntil(tty, "  Private key:    ", (raw) => {
    const v = raw.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error("That is not a 32-byte private key (0x followed by 64 hex characters). Nothing was saved.");
    return v;
  }, { secret: true });
  const passphrase = askPassphrase(tty, "Passphrase to encrypt it with:");
  const { address, path } = keystore.importWallet(key, passphrase);
  tty.write(`\n  ${green("✓")} wallet imported: ${cyan(address)}\n`);
  tty.write(`  ${dim(`encrypted at ${path} (mode 0600)`)}\n`);
  return { address, created: true };
}

/** STEP: the creator recipient. The one address in this wizard that is permanent. */
export async function stepRecipient(tty, signerAddress, addressTools) {
  note(tty, "Where your share of this project's fees is paid, forever. This is written into the launch\nand no one — not you, not the launchpad — can change it afterwards.");
  tty.write("\n");
  note(tty, "Use a wallet you would be comfortable holding money in for years: a hardware wallet, or a\nSafe. It should NOT be the launch wallet above.");
  tty.write("\n");
  for (;;) {
    const address = askUntil(tty, "  Creator recipient: ", (raw) => normalizeRecipient(raw, addressTools));
    const verdict = recipientVerdict(address, signerAddress);
    if (!verdict.same) {
      tty.write(`  ${green("✓")} ${address}\n`);
      return address;
    }
    tty.write(`\n  ${yellow("WARNING")}\n`);
    for (const line of verdict.detail.split("\n")) tty.write(`  ${yellow(line.trim() === "" ? "" : line)}\n`);
    tty.write("\n");
    // AN EXPLICIT OVERRIDE, TYPED IN FULL. `y` here would be indistinguishable from `y` to the
    // question above it, and this is the answer a creator cannot take back.
    const confirmed = askUntil(tty, `  Type ${bold("USE MY LAUNCH WALLET")} to accept this anyway, or press Enter to choose another address: `, (raw) => {
      const v = raw.trim();
      if (v === "") return false;
      if (v === "USE MY LAUNCH WALLET") return true;
      throw new Error("Not that. Type the phrase exactly, or press Enter to enter a different address.");
    });
    if (confirmed) {
      tty.write(`  ${yellow("✓ accepted — your earnings will go to the launch wallet")}\n`);
      return address;
    }
  }
}

/** STEP: which chains this grant covers. */
async function stepChains(tty, sdk) {
  const ids = sdk.knownChainIds();
  const rows = [];
  for (const id of ids) {
    let profile = null;
    try { profile = sdk.getChainProfile(id); } catch { profile = null; }
    // A CHAIN IS NEVER SILENTLY DROPPED. `status` learned this the hard way: an omitted row and a
    // "not available" row look identical to a reader, and the omitted one reads as fine.
    rows.push({ id, label: profile?.label ?? `chain ${id}`, available: profile !== null, rpcEnvKey: profile?.rpcEnvKey ?? null });
  }
  rows.forEach((r) => {
    tty.write(`    ${r.id.toString().padEnd(6)} ${r.available ? cyan(r.label) : dim(`${r.label} — no deployment record in this kit; it cannot be selected`)}\n`);
  });
  tty.write("\n");
  const selectable = rows.filter((r) => r.available).map((r) => r.id);
  const suggested = selectable.filter((id) => [1, 8453, 4663].includes(id));
  note(tty, "The agent picks ONE of these at launch time by reading each chain live. Listing several is a\npermission, not a plan — a chain the agent cannot prove is open is refused, not substituted.");
  tty.write("\n");
  return askUntil(tty, `  Chains (comma-separated) [${suggested.join(",")}]: `, (raw) => {
    const v = raw.trim();
    const chosen = v === "" ? suggested : v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    if (chosen.length === 0) throw new Error("Name at least one chain.");
    const bad = chosen.filter((id) => !selectable.includes(id));
    if (bad.length > 0) throw new Error(`This kit has no deployment record for ${bad.join(", ")}. Choose from ${selectable.join(", ")}.`);
    return chosen;
  });
}

/** STEP: the metadata provider. WE NEVER ASK FOR THE CREDENTIAL — only whether one is present. */
async function stepMetadata(tty) {
  const present = Boolean(process.env.PINATA_JWT);
  if (present) {
    tty.write(`  ${green("✓")} PINATA_JWT is set in this environment\n`);
    note(tty, "Its value is never read by this wizard, never written to a file, and never printed.");
    return { configured: true, provider: "pinata" };
  }
  tty.write(`  ${yellow("!")} no pinning provider is configured\n\n`);
  note(tty, "Your collection's metadata is written at BIRTH and can never be changed, so it has to be\npinned and read back before the launch is built. Without a provider the agent can rehearse\nthe whole pipeline against an in-memory store, but nothing it pins will be readable by anyone.");
  tty.write("\n");
  note(tty, "Set it in your shell, not here — a credential typed into a wizard ends up in the wizard's\nmemory, and this one deliberately has nowhere to put it:\n\n    export PINATA_JWT='…'");
  return { configured: false, provider: null };
}

/** STEP: RPC endpoints, per selected chain. Values are never read or shown; only presence. */
async function stepRpc(tty, sdk, chains) {
  const missing = [];
  for (const id of chains) {
    let profile = null;
    try { profile = sdk.getChainProfile(id); } catch { profile = null; }
    if (!profile) continue;
    const set = Boolean(process.env[profile.rpcEnvKey]);
    tty.write(`    ${set ? green("✓") : yellow("!")} ${profile.label.padEnd(16)} ${set ? dim(`${profile.rpcEnvKey} is set`) : `${profile.rpcEnvKey} is unset`}\n`);
    if (!set) missing.push(profile.rpcEnvKey);
  }
  if (missing.length > 0) {
    tty.write("\n");
    note(tty, "A chain without its own endpoint falls back to a public one, which rate-limits. A partial\nread is an UNKNOWN rather than a refusal, so preflight will not admit that chain — the\nlaunch would stop there rather than proceed on half an answer. Set these in your shell:\n\n" + missing.map((k) => `    export ${k}='…'`).join("\n"));
  }
  return { missing };
}

/** STEP: the preset, the fee ceiling, the expiry and the number of launches. */
export async function stepAuthorization(tty) {
  for (const p of PRESETS) {
    tty.write(`    ${bold(p.key)}. ${bold(p.title)}\n`);
    for (const line of wrap(p.blurb, 70)) tty.write(`       ${dim(line)}\n`);
    tty.write("\n");
  }
  const key = askChoice(tty, "  Which? [1] ", ["1", "2", "3", ""]) || "1";
  const preset = PRESETS.find((p) => p.key === (key === "" ? "1" : key));

  tty.write(`\n  ${bold("The most you authorize in network fees")}\n\n`);
  note(tty, "One number, in ETH. Everything the agent is allowed to spend on gas is bounded by it, and\nthe signer refuses any transaction whose gas limit times its fee exceeds it. This grant\nauthorizes gas and NOTHING else: it cannot move your tokens and it cannot send value.");
  tty.write("\n");
  const maxTotalGasCostWei = askUntil(tty, "  Maximum network fee in ETH [0.03]: ", (raw) => {
    const v = raw.trim() === "" ? "0.03" : raw.trim();
    return ethToWei(v);
  });

  let maxTransactionGas = DEFAULT_MAX_TRANSACTION_GAS;
  if (preset.id === "CUSTOM") {
    maxTransactionGas = askUntil(tty, `  Max gas for one transaction [${DEFAULT_MAX_TRANSACTION_GAS}]: `, (raw) => {
      const v = raw.trim() === "" ? DEFAULT_MAX_TRANSACTION_GAS.toString() : raw.trim();
      if (!/^\d+$/.test(v)) throw new Error("A whole number of gas units.");
      const n = BigInt(v);
      if (n > 16_777_216n) throw new Error("Above the EIP-7825 per-transaction cap of 16,777,216. No transaction could ever use it, so the policy would be refused.");
      if (n === 0n) throw new Error("Zero gas authorizes nothing.");
      return n;
    });
  }

  const derived = deriveGasCeilings(maxTotalGasCostWei, maxTransactionGas);
  if (!derived.usable) {
    tty.write(`\n  ${red(`${weiToEth(maxTotalGasCostWei)} ETH spread over ${maxTransactionGas} gas works out below 1 wei per gas, so every transaction would be refused for exceeding the ceiling.`)}\n`);
    tty.write(`  ${red("Raise the fee ceiling and run setup again.")}\n`);
    throw new PromptAborted("fee ceiling too small to be usable");
  }

  let maxGasPriceWei = derived.maxGasPriceWei;
  if (preset.id === "CUSTOM") {
    maxGasPriceWei = askUntil(tty, `  Max gas price in gwei [${derived.impliedGwei}]: `, (raw) => {
      const v = raw.trim() === "" ? derived.impliedGwei : raw.trim();
      // Gwei reuses the exact decimal parser and is then scaled down, so 1.5 gwei is 1500000000 wei
      // and not a float's approximation of it — the same reason ethToWei exists at all.
      const wei = ethToWei(v) / 10n ** 9n;
      if (wei === 0n) throw new Error("A gas price of zero refuses every transaction.");
      // THE TWO CEILINGS MAY NOT OUTGROW THE ONE THE CREATOR STATED IN PLAIN ENGLISH. Custom exists
      // to let someone shape the ceilings, not to let a second answer quietly overrule the first —
      // and the grant enforces the total regardless, so a policy above it would only ever produce a
      // refusal at signing time, long after metadata is pinned.
      if (wei * maxTransactionGas > maxTotalGasCostWei) {
        throw new Error(`${weiToGwei(wei)} gwei over ${maxTransactionGas} gas is ${weiToEth(wei * maxTransactionGas)} ETH, above the ${weiToEth(maxTotalGasCostWei)} ETH you authorized. Lower the gas price, lower the gas, or start again with a higher fee ceiling.`);
      }
      return wei;
    });
  }
  tty.write(`  ${dim(`→ at most ${maxTransactionGas} gas at ${weiToGwei(maxGasPriceWei)} gwei = ${weiToEth(maxGasPriceWei * maxTransactionGas)} ETH worst case`)}\n`);

  tty.write(`\n  ${bold("How long this authorization lasts")}\n\n`);
  for (const c of EXPIRY_CHOICES) tty.write(`    ${c.key}. ${c.label}${c.default ? dim("  (default)") : ""}\n`);
  tty.write("\n");
  const expiryKey = askChoice(tty, "  Which? [2] ", ["1", "2", "3", "4", ""]) || "2";
  // COPIED, NOT REFERENCED. The fallback below used to assign `chosenExpiry.hours = 24`, which wrote
  // straight through into the exported EXPIRY_CHOICES table: after one creator declined an
  // indefinite grant, choice 4 silently meant "24 hours" for every later run in that process. A
  // shared constant that a prompt can edit is not a constant.
  const chosenExpiry = { ...EXPIRY_CHOICES.find((c) => c.key === (expiryKey === "" ? "2" : expiryKey)) };
  if (chosenExpiry.hours === null) {
    // NEVER SILENTLY. An authority with no end date is the one a creator forgets they granted.
    tty.write("\n");
    note(tty, "A grant with no expiry stays live until you revoke it by hand, on a laptop, months from now,\nwhen you are no longer thinking about this project.");
    tty.write("\n");
    const sure = askUntil(tty, `  Type ${bold("NO EXPIRY")} to confirm, or press Enter to take 24 hours instead: `, (raw) => {
      const v = raw.trim();
      if (v === "") return false;
      if (v === "NO EXPIRY") return true;
      throw new Error("Type the phrase exactly, or press Enter for 24 hours.");
    });
    if (!sure) chosenExpiry.hours = 24;
  }

  let mode = "SINGLE_LAUNCH";
  let launchesAllowed = 1;
  if (preset.id === "CUSTOM") {
    launchesAllowed = askUntil(tty, "  How many launches does this cover? [1]: ", (raw) => {
      const v = raw.trim() === "" ? "1" : raw.trim();
      if (!/^\d+$/.test(v) || Number(v) < 1) throw new Error("At least one.");
      return Number(v);
    });
    mode = launchesAllowed === 1 ? "SINGLE_LAUNCH" : "MULTI_LAUNCH";
  }

  return {
    preset: preset.id,
    goal: preset.goal,
    allowBroadcastIntent: preset.allowBroadcast,
    maxTotalGasCostWei,
    maxTransactionGas,
    maxGasPriceWei,
    expiresAt: expiryFrom(chosenExpiry.hours),
    mode,
    launchesAllowed,
  };
}

function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line.length + w.length + 1 > width) { lines.push(line); line = w; }
    else line = line === "" ? w : `${line} ${w}`;
  }
  if (line !== "") lines.push(line);
  return lines;
}

// ------------------------------------------------------------------------------------------------

/**
 * `relics agent setup`.
 *
 * Returns an exit code. Nothing is written until the creator has typed the phrase — every refusal
 * before that point leaves the machine exactly as it found it, which is what makes it safe to run
 * this command just to see what it asks.
 */
export async function agentSetup(workspace, flags) {
  const root = resolve(workspace ?? ".");
  const capability = ttyCapability();

  // THE TTY GATE COMES FIRST, BEFORE ANY DISK READ. A non-interactive run must not get halfway
  // through discovering state and then refuse: the whole command is unavailable to a machine, and
  // saying so immediately is what makes that unambiguous rather than situational.
  if (!capability.ok) {
    process.stderr.write(`${red("relics agent setup: refused")}\n\n`);
    process.stderr.write(`  ${ttyRefusalMessage(capability, "Setting up your wallet and authorization")}\n\n`);
    process.stderr.write(`  ${bold("A human must run this command:")}\n`);
    process.stderr.write("      npm run kit -- agent setup\n\n");
    process.stderr.write(`  ${dim("If you are an AI agent reading this: this is not a step you can perform or work around.")}\n`);
    process.stderr.write(`  ${dim("There is no flag, no environment variable and no file that supplies the passphrase.")}\n`);
    process.stderr.write(`  ${dim("Ask the person you are working with to run it, then continue with `agent ready`.")}\n`);
    process.stderr.write(`\n  ${dim(`reason: ${capability.code}`)}\n`);
    return EXIT.BLOCKED;
  }

  const [{ readAuthorization, writeAuthorization, authorizationPath }, keystore, addressTools, sdk] = await Promise.all([
    loadAuthorization(),
    loadKeystore(),
    loadAddressTools(),
    import("@relics/launch-sdk"),
  ]);

  const policyPath = join(root, "relics.agent.json");

  return withTty(async (tty) => {
    try {
      tty.write(`\n${bold("RELICS — one-time setup")}\n${dim(RULE)}\n`);
      note(tty, "Six questions. At the end you will read a summary and type one phrase to authorize it.\nNothing is saved until you do. Ctrl-C at any point leaves this machine unchanged.");
      tty.write("\n");

      const existingAuth = readAuthorization();
      if (existingAuth) {
        const live = !existingAuth.revokedAt && (!existingAuth.expiresAt || new Date(existingAuth.expiresAt) > new Date());
        tty.write(`  ${live ? yellow("An authorization already exists on this machine.") : dim("A past authorization exists on this machine (no longer live).")}\n`);
        tty.write(`    granted   ${existingAuth.grantedAt}\n`);
        tty.write(`    signer    ${existingAuth.signerAddress}\n`);
        tty.write(`    expires   ${existingAuth.expiresAt ?? "never"}\n`);
        tty.write(`    launches  ${existingAuth.launchesUsed} of ${existingAuth.launchesAllowed} used\n`);
        tty.write(`    state     ${existingAuth.revokedAt ? `REVOKED ${existingAuth.revokedAt}` : live ? "LIVE" : "EXPIRED"}\n\n`);
        tty.write(`  ${dim("k = keep it and stop here   r = replace it   x = revoke it and stop here")}\n`);
        const what = askChoice(tty, "  Which? ", ["k", "r", "x"]);
        if (what === "k") {
          tty.write(`\n  ${green("✓")} kept. Nothing changed. Run ${bold("npm run kit -- agent ready")} to see where you stand.\n\n`);
          return EXIT.OK;
        }
        if (what === "x") {
          const { revokeAuthorization } = await loadAuthorization(); // already resolved; the module is cached
          revokeAuthorization();
          tty.write(`\n  ${green("✓")} revoked. The signer will refuse every launch under it from now on.\n`);
          tty.write(`  ${dim(`The record is kept at ${authorizationPath()} so `)}${dim("`agent ready`")}${dim(" can say why it is refusing.")}\n\n`);
          return EXIT.OK;
        }
        tty.write(`\n  ${dim("Replacing. The old grant stays on disk until the new one is written.")}\n`);
      }

      const total = 6;

      step(tty, 1, total, "Your launch wallet");
      const wallet = await stepWallet(tty, keystore);

      step(tty, 2, total, "Where your earnings go");
      const creatorRecipient = await stepRecipient(tty, wallet.address, addressTools);

      step(tty, 3, total, "Which chains you allow");
      const allowedChains = await stepChains(tty, sdk);

      step(tty, 4, total, "Metadata pinning");
      await stepMetadata(tty);

      step(tty, 5, total, "Chain endpoints");
      await stepRpc(tty, sdk, allowedChains);

      step(tty, 6, total, "What the agent may do");
      const auth = await stepAuthorization(tty);

      const answers = {
        signerAddress: wallet.address,
        creatorRecipient,
        allowedChains,
        allowedRuntimes: ["SOLIDITY_SVG_V1"],
        maxRoyaltyBps: 500,
        goal: auth.goal,
        allowBroadcast: false, // set below, only by the phrase, and only for SAFE_AUTONOMOUS
        maxGasPriceWei: auth.maxGasPriceWei,
        maxTransactionGas: auth.maxTransactionGas,
        maxTotalGasCostWei: auth.maxTotalGasCostWei,
        mode: auth.mode,
        launchesAllowed: auth.launchesAllowed,
        expiresAt: auth.expiresAt,
      };

      // ---- THE AUTHORIZATION MOMENT -----------------------------------------------------------
      tty.write(`\n${dim(RULE)}\n${bold("  YOU ARE ABOUT TO AUTHORIZE")}\n\n`);
      for (const line of summaryLines({ ...answers, allowBroadcast: auth.allowBroadcastIntent })) tty.write(`${line}\n`);
      tty.write("\n");
      if (auth.allowBroadcastIntent) {
        note(tty, "After this, the agent will not ask again. That is the point of the grant: it replaces being\nasked. It can still only do what is listed above, and the signer re-derives every one of\nthose facts from the transaction bytes before it signs.");
      } else {
        note(tty, "This grant does NOT permit broadcasting. The agent will build a complete, checked\ntransaction and stop. You send it yourself.");
      }
      tty.write(`\n${dim(RULE)}\n\n`);

      const typed = tty.ask(`  Type ${bold(AUTHORIZATION_PHRASE)} to authorize, or anything else to cancel:\n  > `);
      if (typed.trim() !== AUTHORIZATION_PHRASE) {
        tty.write(`\n  ${yellow("Cancelled. Nothing was written.")}\n`);
        tty.write(`  ${dim("Your wallet, if you created one, is saved — a wallet is not an authorization.")}\n\n`);
        return EXIT.REFUSED;
      }

      // allowBroadcast is set HERE and nowhere else: the preset proposes it, the phrase grants it.
      answers.allowBroadcast = auth.allowBroadcastIntent === true;

      // ---- WRITE. The schema validates before anything reaches disk. ---------------------------
      const candidate = buildPolicy(answers);
      const parsed = sdk.parseAgentPolicy(candidate);
      if (!parsed.ok) {
        tty.write(`\n  ${red("The policy this wizard built was refused by the schema, so nothing was written:")}\n`);
        for (const i of parsed.issues) tty.write(`    ${red(`${i.field}: ${i.detail}`)}\n`);
        tty.write(`\n  ${dim("This is a defect in the wizard, not in your answers. Please report it.")}\n\n`);
        return EXIT.REFUSED;
      }
      writeFileSync(policyPath, `${JSON.stringify(candidate, null, 2)}\n`);

      writeAuthorization({
        version: 1,
        preset: auth.preset,
        mode: auth.mode,
        grantedAt: new Date().toISOString(),
        expiresAt: auth.expiresAt,
        launchesAllowed: auth.launchesAllowed,
        launchesUsed: 0,
        revokedAt: null,
        signerAddress: wallet.address,
        creatorRecipient,
        allowedChains,
        allowedRuntimes: candidate.allowedRuntimes,
        allowedQuoteAssets: "AUTO",
        allowedAntiSnipeModes: candidate.allowedAntiSnipeModes,
        maxRoyaltyBps: candidate.maxRoyaltyBps,
        maxTotalGasCostWei: auth.maxTotalGasCostWei.toString(),
        maxNativeSpendWei: "0",
        allowBroadcast: answers.allowBroadcast,
        policyHash: parsed.policyHash,
        consumedLaunchPlanHashes: [],
      });

      tty.write(`\n  ${green("✓ authorized")}\n\n`);
      tty.write(`    policy   ${policyPath}\n`);
      tty.write(`    grant    ${authorizationPath()}\n`);
      tty.write(`    wallet   ${shortAddress(wallet.address)}\n\n`);
      note(tty, "Next:\n  npm run kit -- agent ready        see whether anything is still missing\n  npm run kit -- agent run --workspace <dir> --json   let the agent build the launch");
      tty.write("\n");
      return EXIT.OK;
    } catch (err) {
      if (err instanceof PromptAborted) {
        tty.write(`\n  ${yellow(`Stopped: ${err.message}. Nothing was written.`)}\n\n`);
        return EXIT.REFUSED;
      }
      throw err;
    }
  });
}

/** `relics agent revoke` — end the grant, in plain language. */
export async function agentRevoke(flags) {
  const { readAuthorization, revokeAuthorization, authorizationPath } = await loadAuthorization();
  const existing = readAuthorization();
  const json = Boolean(flags?.json);

  if (!existing) {
    const message = "There is no authorization on this machine, so there is nothing to revoke. The agent already cannot sign anything.";
    if (json) process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "agent revoke", success: true, revoked: false, reason: "NO_AUTHORIZATION", detail: message }, null, 2)}\n`);
    else process.stderr.write(`\n  ${message}\n\n`);
    return EXIT.OK;
  }
  if (existing.revokedAt) {
    const message = `This authorization was already revoked at ${existing.revokedAt}. It stays on disk so that anything refusing a launch can say why.`;
    if (json) process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "agent revoke", success: true, revoked: false, reason: "ALREADY_REVOKED", revokedAt: existing.revokedAt, detail: message }, null, 2)}\n`);
    else process.stderr.write(`\n  ${message}\n\n`);
    return EXIT.OK;
  }

  const next = revokeAuthorization();
  const message =
    "Revoked. From now on the signer refuses every launch under this grant, including one that was\n" +
    "  already built and checked. Your wallet still exists and still holds whatever gas is in it —\n" +
    "  revoking authority does not touch a key. To authorize again: npm run kit -- agent setup";
  if (json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "agent revoke", success: true, revoked: true, revokedAt: next.revokedAt, signerAddress: next.signerAddress, path: authorizationPath() }, null, 2)}\n`);
  } else {
    process.stderr.write(`\n  ${green("✓ revoked")}  ${dim(next.revokedAt)}\n\n  ${message}\n\n`);
  }
  return EXIT.OK;
}
