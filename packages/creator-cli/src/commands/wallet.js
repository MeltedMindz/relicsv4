// SPDX-License-Identifier: MIT
// ================================================================================================
// `relics wallet …` — THE CREATOR'S HALF OF THE SIGNER, AND ONLY THE CREATOR'S.
//
// Every command here that touches a secret refuses unless a human is at a terminal, and reads that
// secret from /dev/tty rather than standard input. That is not defence in depth against a thief; it
// is a boundary against the thing actually driving this kit. An AI agent owns its child processes'
// stdin, argv and environment. It does not own the keyboard.
//
// THIS COMMAND GROUP IS DELIBERATELY NOT UNDER `relics agent`.
//
// `agent` is the machine surface: JSON on stdout, stable exit codes, driven by a program. Putting
// `wallet unlock` inside it would put a human-only step into the namespace an agent is told to
// enumerate and drive — and the first thing an agent does with a command it can see is try it.
// `relics agent wallet …` is refused by name in the agent dispatcher for exactly that reason.
//
// THERE IS NO EXPORT. Not here, not in the keystore module, not behind a flag, not behind a typed
// phrase. `backup` copies the ENCRYPTED file, which is the only form of this key that ever exists
// outside the signer's memory. A creator who asks for the raw key is asking for the one artifact
// that makes every other control in this system decorative.
// ================================================================================================
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadAuthorization, loadKeystore } from "../signer-bridge.js";
import { ttyCapability, ttyRefusalMessage, withTty } from "../tty.js";
import { bold, cyan, dim, green, red, yellow } from "../report.js";

export const EXIT = { OK: 0, REFUSED: 1, USAGE: 2, BLOCKED: 6 };

const SUBCOMMANDS = ["create", "unlock", "lock", "status", "backup", "list"];

/** Subcommands that read a secret from a human. Everything else is safe to run from anywhere. */
const HUMAN_ONLY = new Set(["create", "unlock", "backup"]);

function sessionPath(relicsHome) {
  return resolve(relicsHome(), "session.json");
}

/**
 * WHAT A SESSION IS, PRECISELY, so no screen can overstate it.
 *
 * It records that a human proved, at a moment in time, that they can open this keystore. It holds
 * NO KEY: this is a CLI process and it exits. Nothing downstream gains authority from it — the
 * grant in `authorization.json` is the only thing that authorizes a launch, and the signer
 * re-derives every ceiling from the transaction bytes regardless of what is recorded here.
 *
 * It is worth writing because "is the creator actually present on this machine" is a real question
 * `agent ready` has to answer, and the alternative is inferring it from the existence of a file
 * that an agent could have created.
 */
function readSession(relicsHome) {
  const p = sessionPath(relicsHome);
  if (!existsSync(p)) return null;
  try {
    const s = JSON.parse(readFileSync(p, "utf8"));
    return s && typeof s === "object" ? s : null;
  } catch {
    return null;
  }
}

function writeSession(relicsHome, session) {
  const p = sessionPath(relicsHome);
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, p);
  chmodSync(p, 0o600);
}

function clearSession(relicsHome) {
  const p = sessionPath(relicsHome);
  if (existsSync(p)) unlinkSync(p);
  return p;
}

export function sessionLive(session, now = new Date()) {
  if (!session || !session.expiresAt) return false;
  return new Date(session.expiresAt) > now;
}

/** How long a proven-passphrase session counts for. Short: it is a presence signal, not authority. */
const SESSION_HOURS = 12;

function refuseNonHuman(what, capability) {
  process.stderr.write(`${red(`relics wallet ${what}: refused`)}\n\n`);
  process.stderr.write(`  ${ttyRefusalMessage(capability, `\`wallet ${what}\``)}\n\n`);
  process.stderr.write(`  ${bold("A human must run this:")}\n      npm run kit -- wallet ${what}\n\n`);
  process.stderr.write(`  ${dim("There is no flag, environment variable or file that supplies the passphrase instead.")}\n`);
  process.stderr.write(`  ${dim("If you are an AI agent: this step is not yours to perform. Ask the creator to run it.")}\n`);
  process.stderr.write(`\n  ${dim(`reason: ${capability.code}`)}\n`);
  return EXIT.BLOCKED;
}

function shortAddress(a) {
  const s = String(a);
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export async function walletCommand(positional, flags) {
  const sub = positional[0] ?? "status";
  if (!SUBCOMMANDS.includes(sub)) {
    process.stderr.write(`${red(`relics wallet: unknown subcommand "${sub}"`)}\n  known: ${SUBCOMMANDS.join(", ")}\n`);
    return EXIT.USAGE;
  }

  // ---- THE --json REFUSAL, BEFORE ANYTHING ELSE ------------------------------------------------
  //
  // `--json` means "a program is reading me". `backup` writes a file whose whole content is key
  // material — encrypted, but still the artifact that becomes a key given one passphrase. A machine
  // asking for it in a machine-readable way is either not the creator, or is about to put the path
  // to it somewhere a transcript will keep. There is no legitimate automated backup through this
  // CLI: a creator copies the file, once, deliberately, to somewhere they chose.
  if (flags.json && sub === "backup") {
    process.stderr.write(`${red("relics wallet backup: refused under --json")}\n\n`);
    process.stderr.write("  This command writes your encrypted key material to a path you name out loud, at a prompt.\n");
    process.stderr.write("  --json means a program is reading this output, and there is no automated backup of a key\n");
    process.stderr.write("  in this kit — a backup a script can take is a backup a compromised script can take.\n\n");
    process.stderr.write(`  ${bold("Run it yourself, without --json:")}\n      npm run kit -- wallet backup\n`);
    return EXIT.REFUSED;
  }

  if (HUMAN_ONLY.has(sub)) {
    const capability = ttyCapability();
    if (!capability.ok) return refuseNonHuman(sub, capability);
  }

  const keystore = await loadKeystore();
  const { relicsHome, readAuthorization } = await loadAuthorization();

  switch (sub) {
    case "create": return walletCreate(keystore);
    case "unlock": return walletUnlock(keystore, relicsHome, readAuthorization, positional[1] ?? flags.signer);
    case "lock": return walletLock(relicsHome, flags);
    case "list": return walletList(keystore, flags);
    case "status": return walletStatus(keystore, relicsHome, readAuthorization, flags);
    case "backup": return walletBackup(keystore, positional[1]);
    default: return EXIT.USAGE;
  }
}

/** `wallet create` — TTY only. Prints an ADDRESS and nothing else that came from the key. */
async function walletCreate(keystore) {
  return withTty((tty) => {
    tty.write(`\n${bold("Create a launch wallet")}\n\n`);
    tty.write(`  ${dim("A hot key on this machine whose only job is paying gas. Encrypted with a passphrase that")}\n`);
    tty.write(`  ${dim("is not stored anywhere and cannot be recovered. Nothing you type is shown.")}\n\n`);
    for (;;) {
      const first = tty.askSecret("  Passphrase (12+ characters): ");
      if (first.length < 12) { tty.write(`  ${red("At least 12 characters.")}\n`); continue; }
      const again = tty.askSecret("  Type it again:               ");
      if (again !== first) { tty.write(`  ${red("Those did not match. Nothing was saved.")}\n`); continue; }
      const { address, path } = keystore.createWallet(first);
      tty.write(`\n  ${green("✓")} ${cyan(address)}\n`);
      tty.write(`  ${dim(`encrypted at ${path} (mode 0600)`)}\n\n`);
      tty.write(`  ${dim("The private key was never printed. There is no command in this kit that will print it.")}\n`);
      tty.write(`  ${yellow("Back it up: npm run kit -- wallet backup")}\n\n`);
      return EXIT.OK;
    }
  });
}

/**
 * `wallet unlock` — prove the passphrase opens this keystore, and record that a human did so.
 *
 * WHAT THIS DOES NOT DO, stated because the opposite would be a comfortable thing to imply: it does
 * not leave a key in memory for later commands. This process exits. The signer that holds a key is
 * a separate, per-launch process, and it reads its own passphrase.
 */
async function walletUnlock(keystore, relicsHome, readAuthorization, requestedAddress) {
  const wallets = keystore.listWallets();
  if (wallets.length === 0) {
    process.stderr.write(`\n  ${yellow("There is no wallet on this machine to unlock.")}\n\n`);
    process.stderr.write(`  ${bold("Create one:")}  npm run kit -- wallet create\n`);
    process.stderr.write(`  ${dim("Or run the full setup, which does this and the authorization together:")}\n`);
    process.stderr.write("      npm run kit -- agent setup\n\n");
    return EXIT.REFUSED;
  }

  return withTty((tty) => {
    let target = wallets[0];
    if (requestedAddress) {
      const found = wallets.find((w) => w.address.toLowerCase() === String(requestedAddress).toLowerCase());
      if (!found) {
        tty.write(`\n  ${red(`No wallet ${requestedAddress} on this machine.`)}\n`);
        tty.write(`  ${dim("Known:")} ${wallets.map((w) => w.address).join(", ")}\n\n`);
        return EXIT.REFUSED;
      }
      target = found;
    } else if (wallets.length > 1) {
      tty.write(`\n${bold("Which wallet?")}\n\n`);
      wallets.forEach((w, i) => tty.write(`    ${i + 1}. ${cyan(w.address)}\n`));
      tty.write("\n");
      for (;;) {
        const pick = tty.ask("  Which? ").trim();
        const idx = Number(pick);
        if (Number.isInteger(idx) && idx >= 1 && idx <= wallets.length) { target = wallets[idx - 1]; break; }
        tty.write(`  ${red(`Choose 1..${wallets.length}.`)}\n`);
      }
    }

    tty.write(`\n${bold("Unlock")} ${cyan(target.address)}\n\n`);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const passphrase = tty.askSecret("  Passphrase: ");
      try {
        // The key comes back, is used for nothing, and goes out of scope on the next line. Its only
        // purpose is to prove the passphrase and the file agree — a check that cannot be faked by
        // reading the file, which is exactly why it is worth doing.
        keystore.unlockPrivateKey(target.address, passphrase);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        tty.write(`  ${red(message)}\n`);
        if (attempt === 3) {
          tty.write(`\n  ${red("Three attempts. Stopping.")}\n`);
          tty.write(`  ${dim("If the passphrase is genuinely lost the wallet cannot be recovered — that is what the")}\n`);
          tty.write(`  ${dim("encryption is for. Create a new one and move any gas across:")}\n`);
          tty.write("      npm run kit -- wallet create\n\n");
          return EXIT.REFUSED;
        }
        continue;
      }

      const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString();
      writeSession(relicsHome, { version: 1, address: target.address, provedAt: new Date().toISOString(), expiresAt });

      tty.write(`\n  ${green("✓ unlocked")} ${cyan(target.address)}\n`);
      tty.write(`  ${dim(`this session is recorded until ${expiresAt}`)}\n\n`);

      const auth = readAuthorization();
      tty.write(`  ${bold("Authorization")}\n`);
      if (!auth) {
        tty.write(`    ${yellow("none")} — a wallet is not an authorization. Nothing may be launched yet.\n`);
        tty.write(`    ${dim("Grant one:")} npm run kit -- agent setup\n`);
      } else if (auth.revokedAt) {
        tty.write(`    ${yellow("revoked")} ${auth.revokedAt} — every launch under it is refused.\n`);
        tty.write(`    ${dim("Grant a new one:")} npm run kit -- agent setup\n`);
      } else if (auth.expiresAt && new Date(auth.expiresAt) <= new Date()) {
        tty.write(`    ${yellow("expired")} ${auth.expiresAt}\n`);
        tty.write(`    ${dim("Grant a new one:")} npm run kit -- agent setup\n`);
      } else if (auth.signerAddress.toLowerCase() !== target.address.toLowerCase()) {
        tty.write(`    ${yellow("granted to a different wallet")} (${shortAddress(auth.signerAddress)})\n`);
        tty.write(`    ${dim("A grant is bound to the key it was given for. Unlock that wallet, or run agent setup.")}\n`);
      } else {
        tty.write(`    preset       ${auth.preset}\n`);
        tty.write(`    earnings to  ${auth.creatorRecipient}\n`);
        tty.write(`    chains       ${auth.allowedChains.join(", ")}\n`);
        tty.write(`    launches     ${auth.launchesUsed} of ${auth.launchesAllowed} used\n`);
        tty.write(`    broadcast    ${auth.allowBroadcast ? green("permitted") : "not permitted — builds only"}\n`);
        tty.write(`    expires      ${auth.expiresAt ?? "never (revoke it yourself)"}\n`);
      }
      tty.write("\n");
      tty.write(`  ${dim("This did not leave a key in memory for anything else to use. This process is exiting.")}\n`);
      tty.write(`  ${dim("The signer that holds the key is started per launch and reads its own passphrase.")}\n\n`);
      return EXIT.OK;
    }
    return EXIT.REFUSED;
  });
}

/** `wallet lock` — forget the presence record. Safe, non-secret, runnable by anything. */
async function walletLock(relicsHome, flags) {
  const before = readSession(relicsHome);
  const path = clearSession(relicsHome);
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "wallet lock", success: true, wasUnlocked: Boolean(before), path }, null, 2)}\n`);
    return EXIT.OK;
  }
  process.stderr.write(`\n  ${green("✓ locked")}\n`);
  process.stderr.write(`  ${dim(before ? "the unlock record was removed" : "there was no unlock record; nothing to remove")}\n`);
  process.stderr.write(`  ${dim("Your keystore file is untouched — it was encrypted the whole time.")}\n\n`);
  return EXIT.OK;
}

/** `wallet list` — addresses and creation dates. Never a path to anything secret beyond the dir. */
async function walletList(keystore, flags) {
  const wallets = keystore.listWallets();
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command: "wallet list", success: true, wallets: wallets.map((w) => ({ address: w.address, createdAt: w.createdAt })) }, null, 2)}\n`);
    return EXIT.OK;
  }
  if (wallets.length === 0) {
    process.stderr.write(`\n  ${dim("No launch wallet on this machine.")}\n`);
    process.stderr.write(`  ${bold("Create one:")} npm run kit -- wallet create\n\n`);
    return EXIT.OK;
  }
  process.stderr.write(`\n${bold("Launch wallets")}\n\n`);
  for (const w of wallets) process.stderr.write(`  ${cyan(w.address)}  ${dim(`created ${w.createdAt}`)}\n`);
  process.stderr.write("\n");
  return EXIT.OK;
}

/** `wallet status` — is there a wallet, is it protected, was it recently unlocked. No secrets. */
async function walletStatus(keystore, relicsHome, readAuthorization, flags) {
  const wallets = keystore.listWallets();
  const session = readSession(relicsHome);
  const auth = readAuthorization();
  const live = sessionLive(session);

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: "wallet status",
      success: true,
      wallets: wallets.map((w) => ({ address: w.address, createdAt: w.createdAt })),
      session: session ? { address: session.address, provedAt: session.provedAt, expiresAt: session.expiresAt, live } : null,
      authorizationPresent: Boolean(auth),
    }, null, 2)}\n`);
    return EXIT.OK;
  }

  process.stderr.write(`\n${bold("Wallet")}\n\n`);
  if (wallets.length === 0) {
    process.stderr.write(`  ${yellow("none")} — no launch wallet on this machine\n`);
    process.stderr.write(`  ${bold("Create one:")} npm run kit -- wallet create\n\n`);
    return EXIT.OK;
  }
  for (const w of wallets) {
    let mode = null;
    try { mode = (statSync(keystore.keystorePathFor(w.address)).mode & 0o777).toString(8); } catch { mode = null; }
    process.stderr.write(`  ${cyan(w.address)}\n`);
    process.stderr.write(`  ${mode === "600" ? green("✓") : yellow("!")} encrypted keystore${mode ? dim(` (mode ${mode})`) : ""}\n`);
  }
  process.stderr.write(`  ${live ? green("✓") : dim("·")} ${live ? `unlocked in this session until ${session.expiresAt}` : "locked"}\n`);
  process.stderr.write(`  ${auth ? green("✓") : yellow("!")} ${auth ? "an authorization exists" : "no authorization — a wallet alone launches nothing"}\n\n`);
  if (!live) process.stderr.write(`  ${dim("Unlock:")} npm run kit -- wallet unlock\n\n`);
  return EXIT.OK;
}

/**
 * `wallet backup` — copy the ENCRYPTED keystore somewhere the creator names.
 *
 * The file written is byte-identical to the one in ~/.relics: it is already encrypted at rest, so a
 * backup needs no new format and no decryption step. That is the whole design — there is no moment
 * in this command where plaintext key material exists.
 */
async function walletBackup(keystore, requestedAddress) {
  const wallets = keystore.listWallets();
  if (wallets.length === 0) {
    process.stderr.write(`\n  ${yellow("There is no wallet on this machine to back up.")}\n\n`);
    return EXIT.REFUSED;
  }
  return withTty((tty) => {
    let target = wallets[0];
    if (requestedAddress) {
      const found = wallets.find((w) => w.address.toLowerCase() === String(requestedAddress).toLowerCase());
      if (!found) { tty.write(`\n  ${red(`No wallet ${requestedAddress} on this machine.`)}\n\n`); return EXIT.REFUSED; }
      target = found;
    } else if (wallets.length > 1) {
      tty.write(`\n${bold("Which wallet?")}\n\n`);
      wallets.forEach((w, i) => tty.write(`    ${i + 1}. ${cyan(w.address)}\n`));
      tty.write("\n");
      for (;;) {
        const idx = Number(tty.ask("  Which? ").trim());
        if (Number.isInteger(idx) && idx >= 1 && idx <= wallets.length) { target = wallets[idx - 1]; break; }
        tty.write(`  ${red(`Choose 1..${wallets.length}.`)}\n`);
      }
    }

    tty.write(`\n${bold("Back up")} ${cyan(target.address)}\n\n`);
    tty.write(`  ${dim("What is written is the ENCRYPTED keystore, byte for byte. Anyone who takes this file still")}\n`);
    tty.write(`  ${dim("needs your passphrase — and has as long as they like to try, so the passphrase is the whole")}\n`);
    tty.write(`  ${dim("of the protection. Your private key is never written in the clear, by this or any command.")}\n\n`);
    tty.write(`  ${yellow("Do not put this in a git repository, a shared drive, or a chat message.")}\n\n`);

    // A TYPED CONFIRMATION, NOT A KEYSTROKE. Copying key material off this machine is the act that
    // makes every other control depend on wherever it lands.
    const confirmed = tty.ask(`  Type ${bold("BACKUP MY KEYSTORE")} to continue, or press Enter to cancel:\n  > `).trim();
    if (confirmed !== "BACKUP MY KEYSTORE") {
      tty.write(`\n  ${yellow("Cancelled. Nothing was written.")}\n\n`);
      return EXIT.REFUSED;
    }

    for (;;) {
      const raw = tty.ask("\n  Write the encrypted backup to which path? ").trim();
      if (raw === "") { tty.write(`  ${red("Give a path, or press Ctrl-C to cancel.")}\n`); continue; }
      const dest = resolve(raw);
      if (existsSync(dest)) { tty.write(`  ${red(`${dest} already exists. Refusing to overwrite it — name a new file.`)}\n`); continue; }
      const bytes = keystore.backupBytes(target.address);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, bytes, { mode: 0o600 });
      chmodSync(dest, 0o600);
      tty.write(`\n  ${green("✓")} ${dest}  ${dim(`(${bytes.length} bytes, mode 0600, still encrypted)`)}\n\n`);
      tty.write(`  ${dim("To restore it later, copy it back into the keystore directory and unlock as usual.")}\n\n`);
      return EXIT.OK;
    }
  });
}

/** The list, exported so the CLI's help and the tests do not restate it. */
export const WALLET_SUBCOMMANDS = SUBCOMMANDS;
