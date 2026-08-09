// SPDX-License-Identifier: MIT
// Secret scan over bundle contents. A creator working locally has private keys, RPC URLs and API
// tokens lying around; the export path must refuse to package them, and an importer must refuse
// to store them. Both call this.
//
// The scan is deliberately conservative about false positives: a hit is an ERROR, so every
// pattern here is one that has essentially no innocent explanation inside a project bundle.

import { error } from "./issues.js";

/** @type {{ id: string, label: string, re: RegExp }[]} */
export const SECRET_PATTERNS = [
  { id: "PRIVATE_KEY_ASSIGNMENT", label: "a populated private key / mnemonic assignment", re: /(private[_-]?key|secret[_-]?key|signing[_-]?key|mnemonic|seed[_-]?phrase)["']?\s*[:=]\s*["']?(0x)?[0-9a-fA-F]{64}\b/i },
  { id: "RAW_PRIVATE_KEY", label: "a bare 32-byte hex key", re: /\b0x[0-9a-fA-F]{64}\b/ },
  // Anchored on both quotes so an ordinary sentence of prose cannot trip it: a hit is a quoted
  // string that is NOTHING BUT 12-24 lowercase words separated by single spaces.
  { id: "BIP39_MNEMONIC", label: "a BIP-39 style mnemonic phrase", re: /(["'])(?:[a-z]{3,8} ){11,23}[a-z]{3,8}\1/ },
  { id: "KEYSTORE_JSON", label: "an Ethereum keystore document", re: /"crypto"\s*:\s*\{[^}]*"ciphertext"/i },
  { id: "PEM_BLOCK", label: "a PEM private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: "CREDENTIALED_RPC_URL", label: "an RPC URL with an embedded credential", re: /https?:\/\/[^\s"']*(infura|alchemy|quiknode|quicknode|ankr|blastapi|chainstack|drpc)[^\s"']*\/(v[0-9]\/)?[A-Za-z0-9_-]{20,}/i },
  { id: "AWS_ACCESS_KEY", label: "an AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "GITHUB_TOKEN", label: "a GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { id: "SLACK_TOKEN", label: "a Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: "STRIPE_KEY", label: "a Stripe secret key", re: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/ },
  { id: "OPENAI_KEY", label: "an API key", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { id: "JWT", label: "a JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: "PINATA_JWT_FIELD", label: "a pinning-service credential field", re: /(pinata|web3storage|nft\.storage|infura)[_-]?(jwt|key|secret|token)["']?\s*[:=]\s*["'][^"']{16,}/i },
  { id: "GENERIC_API_KEY", label: "an API key assignment", re: /\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i },
  { id: "BASIC_AUTH_URL", label: "a URL with inline credentials", re: /https?:\/\/[^\s/:@"']+:[^\s/@"']+@[^\s"']+/ },
];

/** Text-bearing extensions worth scanning. Binary assets are skipped. */
const TEXT_EXTENSIONS = new Set([".js", ".json", ".md", ".txt", ".svg"]);

/**
 * @param {string} path
 * @param {string} text
 * @returns {import("./issues.js").Issue[]}
 */
export function scanTextForSecrets(path, text) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];
  for (const pattern of SECRET_PATTERNS) {
    const match = pattern.re.exec(text);
    if (!match) continue;
    const line = text.slice(0, match.index).split("\n").length;
    issues.push(error("SECRET_DETECTED", `${path}:${line}`, `${pattern.label} was detected (${pattern.id}). Nothing secret may travel in a bundle — remove it and rotate the value.`));
  }
  return issues;
}

/** @param {string} path */
export function isTextPath(path) {
  const dot = path.lastIndexOf(".");
  return dot > 0 && TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}
