// SPDX-License-Identifier: MIT
// ================================================================================================
// NOTHING THIS CLI EMITS MAY CONTAIN A CREDENTIAL IT WAS GIVEN.
//
// THE LEAK THIS EXISTS TO CLOSE, MEASURED. With `ETHEREUM_RPC_URL` set to a credentialled endpoint
// — which is what this kit tells creators to do — `relics agent capabilities --json` printed the
// API key. Not because anything logged the variable: the SDK is careful never to return a URL and
// reports `source` instead. It leaked because a chain read FAILED, viem's transport error embeds
// the request URL in its message, that message became a `Finding.detail`, and the finding was
// emitted verbatim into the machine envelope an agent reads, stores and often uploads.
//
// So the rule cannot be "do not log secrets" — nobody logged one. It has to be a scrub at the last
// possible moment, applied to everything, by the one function every command emits through.
//
// IT SCRUBS BY VALUE, NOT BY SHAPE. A blanket URL redaction would also blank the explorer links
// that are the most useful thing in a broadcast receipt. What is secret is knowable exactly: the
// VALUES this process was handed in credential-shaped environment variables. Matching those means
// a public fallback endpoint still prints in full and a creator's Alchemy key never does.
// ================================================================================================

/**
 * Environment variables whose VALUE is a secret. Suffix-matched rather than listed, so a chain
 * added tomorrow with a `FOO_RPC_URL` is covered on the day it is added and not on the day someone
 * remembers to extend a list.
 */
const SECRET_ENV_SUFFIX = /(_RPC_URL|_JWT|_KEY|_SECRET|_TOKEN|_PASSWORD|_PASSPHRASE|_MNEMONIC)$/i;

/** Too short to be a credential and too likely to appear by chance. "1" must not become a redaction. */
const MIN_SECRET_LENGTH = 12;

/** The (value -> label) pairs to scrub, read fresh so a test can set an env var and see the effect. */
export function knownSecrets(env = process.env) {
  const out = [];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string" || value.length < MIN_SECRET_LENGTH) continue;
    if (!SECRET_ENV_SUFFIX.test(key)) continue;
    out.push({ key, value });
  }
  // LONGEST FIRST. If two variables share a prefix, replacing the short one first would leave the
  // tail of the long one in place — a partially redacted credential still tells an attacker most of
  // what they wanted and reads, falsely, as though it had been handled.
  return out.sort((a, b) => b.value.length - a.value.length);
}

export function scrubString(text, secrets) {
  let out = String(text);
  for (const { key, value } of secrets) {
    if (out.includes(value)) out = out.split(value).join(`<redacted:${key}>`);
  }
  return out;
}

/**
 * Scrub a whole value, recursively, in place of nothing — the caller gets a copy.
 *
 * OBJECT KEYS ARE SCRUBBED TOO. A credential is a plausible map key the moment anything indexes a
 * result by endpoint, and a scrub that only walked values would be exactly as leaky in that case
 * while looking thorough.
 */
export function scrub(value, env = process.env) {
  const secrets = knownSecrets(env);
  if (secrets.length === 0) return value;
  const walk = (v) => {
    if (typeof v === "string") return scrubString(v, secrets);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[scrubString(k, secrets)] = walk(val);
      return o;
    }
    return v;
  };
  return walk(value);
}
