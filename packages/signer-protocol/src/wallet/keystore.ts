// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ENCRYPTED KEYSTORE.
//
// The private key is GENERATED HERE, encrypted before it ever reaches disk, and never returned to
// any caller. There is deliberately no export function, no debug endpoint and no "just this once"
// path: an API that can return the key is an API an agent can be talked into calling, and the whole
// premise of this system is that the agent may be compromised or reading a hostile brief.
//
// WHAT IS ACTUALLY GUARANTEED, so nobody over-reads it:
//   * scrypt (N=2^17) turns a human passphrase into a key at a deliberate cost, so a stolen file is
//     expensive to grind rather than instantly readable.
//   * AES-256-GCM is AUTHENTICATED, so a tampered file fails to open instead of decrypting to
//     attacker-chosen bytes.
//   * 0600 and a directory outside the repository, so it is not committed and not world-readable.
//   * The plaintext key exists only in the signer process's memory, only while unlocked.
//
// WHAT IS NOT GUARANTEED: this does not defend against someone who already runs code as this user.
// A keylogger, a debugger attached to the signer, or swapped-out memory all defeat it. That is why
// the recommended wallet is a GAS-ONLY execution key and the creator's earnings go somewhere else —
// the design assumption is that this key can be lost, and that losing it costs the gas in it.
// ================================================================================================
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { relicsHome } from "../authorization.ts";

export function keystoreDir(): string {
  return join(relicsHome(), "keystore");
}

/** scrypt cost. N=2^17 is ~1s and ~128MB on a laptop: painful once for a human, brutal at scale. */
const SCRYPT_N = 1 << 17;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32;

export interface KeystoreFile {
  readonly version: 1;
  readonly address: Address;
  readonly createdAt: string;
  readonly kdf: "scrypt";
  readonly kdfparams: { readonly N: number; readonly r: number; readonly p: number; readonly dklen: number; readonly salt: string };
  readonly cipher: "aes-256-gcm";
  readonly cipherparams: { readonly iv: string };
  readonly ciphertext: string;
  readonly tag: string;
}

function derive(passphrase: string, salt: Buffer): Buffer {
  // `maxmem` must be raised explicitly or Node refuses N=2^17 with a memory-limit error.
  return scryptSync(passphrase, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 512 * 1024 * 1024 });
}

export function keystorePathFor(address: Address): string {
  return join(keystoreDir(), `${address.toLowerCase()}.json`);
}

export function listWallets(): { address: Address; createdAt: string; path: string }[] {
  const dir = keystoreDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const k = JSON.parse(readFileSync(join(dir, f), "utf8")) as KeystoreFile;
        return { address: k.address, createdAt: k.createdAt, path: join(dir, f) };
      } catch {
        return null;
      }
    })
    .filter((x): x is { address: Address; createdAt: string; path: string } => x !== null);
}

/**
 * Create a wallet. Returns the ADDRESS ONLY.
 *
 * The key is generated in this function, encrypted in this function, and goes out of scope at the
 * end of it. It is never returned, never logged, and never placed in an object a caller receives.
 */
export function createWallet(passphrase: string): { address: Address; path: string } {
  if (passphrase.length < 12) {
    throw new Error("The passphrase must be at least 12 characters. It is the only thing standing between a stolen file and a usable key, and scrypt buys time, not immunity.");
  }
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const path = keystorePathFor(account.address);
  if (existsSync(path)) throw new Error(`A wallet already exists at ${path}. Refusing to overwrite it — a lost launch wallet is a lost balance.`);
  writeEncrypted(privateKey, account.address, passphrase, path);
  return { address: account.address, path };
}

/**
 * Import an existing key. TTY-ONLY by construction — see the wallet commands.
 *
 * Present because a creator may already have a dedicated hot key they want to reuse, and telling
 * them to paste it into a file would be worse than accepting it through a terminal prompt that
 * never touches argv, an env var or the agent's stdin.
 */
export function importWallet(privateKey: Hex, passphrase: string): { address: Address; path: string } {
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("That is not a 32-byte private key.");
  const account = privateKeyToAccount(privateKey);
  const path = keystorePathFor(account.address);
  if (existsSync(path)) throw new Error(`A wallet for ${account.address} already exists.`);
  writeEncrypted(privateKey, account.address, passphrase, path);
  return { address: account.address, path };
}

function writeEncrypted(privateKey: Hex, address: Address, passphrase: string, path: string): void {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const dk = derive(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", dk, iv);
  // The key is stored WITHOUT its 0x prefix as raw bytes; nothing about the file is a hex string a
  // scanner would recognise as a key, and nothing about it is readable without the passphrase.
  const ct = Buffer.concat([cipher.update(Buffer.from(privateKey.slice(2), "hex")), cipher.final()]);
  const file: KeystoreFile = {
    version: 1, address, createdAt: new Date().toISOString(), kdf: "scrypt",
    kdfparams: { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, dklen: KEY_LEN, salt: salt.toString("hex") },
    cipher: "aes-256-gcm", cipherparams: { iv: iv.toString("hex") },
    ciphertext: ct.toString("hex"), tag: cipher.getAuthTag().toString("hex"),
  };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
  dk.fill(0);
}

/**
 * Decrypt. INTERNAL TO THE SIGNER PROCESS — this module is not re-exported from the package index,
 * so nothing outside the signer can reach it without deliberately importing a deep path.
 *
 * A wrong passphrase surfaces as GCM authentication failure, which is the same answer a TAMPERED
 * file gives. Both mean "this did not open", and neither tells an attacker which it was.
 */
export function unlockPrivateKey(address: Address, passphrase: string): Hex {
  const path = keystorePathFor(address);
  if (!existsSync(path)) throw new Error(`No wallet at ${path}`);
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) throw new Error(`${path} is mode ${mode.toString(8)}; it must not be readable by other users. Run: chmod 600 "${path}"`);
  const file = JSON.parse(readFileSync(path, "utf8")) as KeystoreFile;
  const dk = derive(passphrase, Buffer.from(file.kdfparams.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", dk, Buffer.from(file.cipherparams.iv, "hex"));
  decipher.setAuthTag(Buffer.from(file.tag, "hex"));
  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(Buffer.from(file.ciphertext, "hex")), decipher.final()]);
  } catch {
    dk.fill(0);
    throw new Error("Could not open the keystore. Either the passphrase is wrong or the file has been modified — AES-GCM cannot tell you which, on purpose.");
  }
  dk.fill(0);
  const key = `0x${plain.toString("hex")}` as Hex;
  plain.fill(0);
  const derivedAddress = privateKeyToAccount(key).address;
  if (derivedAddress.toLowerCase() !== address.toLowerCase()) {
    throw new Error("The keystore decrypted to a different address than it claims. Do not use it.");
  }
  return key;
}

/** Delete a keystore file. Requires the address to be typed back — see the wallet command. */
export function deleteWallet(address: Address): void {
  const p = keystorePathFor(address);
  if (existsSync(p)) unlinkSync(p);
}

/** An encrypted BACKUP is just the keystore file: it is already encrypted at rest. */
export function backupBytes(address: Address): Buffer {
  return readFileSync(keystorePathFor(address));
}

export const KEYSTORE_HAS_EXPORT_API = false;
