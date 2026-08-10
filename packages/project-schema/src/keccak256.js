// SPDX-License-Identifier: MIT
// Synchronous, dependency-free Keccak-256 — the ORIGINAL Keccak padding (0x01), which is what
// the EVM's `keccak256` computes, NOT NIST SHA3-256 (0x06 padding). The two differ in one byte
// and produce completely different digests; getting it wrong here would mean the CLI printed a
// hash the chain would never agree with, which is precisely the failure this file exists to
// prevent.
//
// WHY THIS PACKAGE NEEDS TWO HASHES
// ---------------------------------
// sha256 is the BUNDLE's hash: it addresses files, content and the container, and it is what a
// creator, a reviewer and a diff tool can reproduce with `shasum` on any machine.
//
// keccak256 is the CHAIN's hash: `LaunchParams.artScriptHash` is `keccak256(artConfig)`, and the
// per-project art binding a collection stores is keccak all the way down. Without keccak here the
// kit could not state a single value the chain would actually hold — it could only describe its
// own files and hope the importer derived the same thing. Now the CLI prints the exact 32 bytes
// that end up in the binding, and any divergence is a test failure rather than a surprise at
// launch time.
//
// Everything is 32-bit lane arithmetic (two words per 64-bit lane, lo/hi) so the implementation
// is byte-identical in Node, in a browser main thread and inside a worker, with no BigInt cost.

/** Round constants, split into low/high 32-bit halves. */
const RC_LO = new Uint32Array([
  0x00000001, 0x00008082, 0x0000808a, 0x80008000, 0x0000808b, 0x80000001, 0x80008081, 0x00008009, 0x0000008a, 0x00000088, 0x80008009, 0x8000000a,
  0x8000808b, 0x0000008b, 0x00008089, 0x00008003, 0x00008002, 0x00000080, 0x0000800a, 0x8000000a, 0x80008081, 0x00008080, 0x80000001, 0x80008008,
]);
const RC_HI = new Uint32Array([
  0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
  0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000,
]);

/** Rotation offsets in the rho step, indexed by lane. */
const R = new Uint8Array([0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14]);

/** Lane permutation for the pi step: `b[PI[i]] = rot(a[i])`. */
const PI = new Uint8Array(25);
for (let x = 0; x < 5; x++) {
  for (let y = 0; y < 5; y++) {
    PI[x + 5 * y] = y + 5 * ((2 * x + 3 * y) % 5);
  }
}

const RATE_BYTES = 136; // 1600 - 2*256 bits

/**
 * The Keccak-f[1600] permutation over 25 lanes held as 50 32-bit words (lo, hi interleaved).
 * @param {Uint32Array} s 50 words
 */
function keccakF(s) {
  const cLo = new Uint32Array(5);
  const cHi = new Uint32Array(5);
  const bLo = new Uint32Array(25);
  const bHi = new Uint32Array(25);

  for (let round = 0; round < 24; round++) {
    // theta
    for (let x = 0; x < 5; x++) {
      cLo[x] = s[2 * x] ^ s[2 * (x + 5)] ^ s[2 * (x + 10)] ^ s[2 * (x + 15)] ^ s[2 * (x + 20)];
      cHi[x] = s[2 * x + 1] ^ s[2 * (x + 5) + 1] ^ s[2 * (x + 10) + 1] ^ s[2 * (x + 15) + 1] ^ s[2 * (x + 20) + 1];
    }
    for (let x = 0; x < 5; x++) {
      const nx = (x + 1) % 5;
      const px = (x + 4) % 5;
      // d = c[x-1] ^ rotl64(c[x+1], 1)
      const dLo = cLo[px] ^ (((cLo[nx] << 1) | (cHi[nx] >>> 31)) >>> 0);
      const dHi = cHi[px] ^ (((cHi[nx] << 1) | (cLo[nx] >>> 31)) >>> 0);
      for (let y = 0; y < 5; y++) {
        const i = 2 * (x + 5 * y);
        s[i] ^= dLo;
        s[i + 1] ^= dHi;
      }
    }

    // rho + pi
    for (let i = 0; i < 25; i++) {
      const n = R[i];
      const lo = s[2 * i];
      const hi = s[2 * i + 1];
      let rLo;
      let rHi;
      if (n === 0) {
        rLo = lo;
        rHi = hi;
      } else if (n < 32) {
        rLo = ((lo << n) | (hi >>> (32 - n))) >>> 0;
        rHi = ((hi << n) | (lo >>> (32 - n))) >>> 0;
      } else if (n === 32) {
        rLo = hi;
        rHi = lo;
      } else {
        const m = n - 32;
        rLo = ((hi << m) | (lo >>> (32 - m))) >>> 0;
        rHi = ((lo << m) | (hi >>> (32 - m))) >>> 0;
      }
      const j = PI[i];
      bLo[j] = rLo;
      bHi[j] = rHi;
    }

    // chi
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const i = x + 5 * y;
        const n1 = ((x + 1) % 5) + 5 * y;
        const n2 = ((x + 2) % 5) + 5 * y;
        s[2 * i] = (bLo[i] ^ (~bLo[n1] & bLo[n2])) >>> 0;
        s[2 * i + 1] = (bHi[i] ^ (~bHi[n1] & bHi[n2])) >>> 0;
      }
    }

    // iota
    s[0] = (s[0] ^ RC_LO[round]) >>> 0;
    s[1] = (s[1] ^ RC_HI[round]) >>> 0;
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} 32-byte digest
 */
export function keccak256Bytes(bytes) {
  const state = new Uint32Array(50);

  // Absorb. The padded message is `bytes || 0x01 || 0x00* || 0x80`, always a multiple of the rate.
  const blocks = Math.floor(bytes.length / RATE_BYTES);
  for (let b = 0; b < blocks; b++) absorb(state, bytes, b * RATE_BYTES, RATE_BYTES);

  const tailLength = bytes.length - blocks * RATE_BYTES;
  const tail = new Uint8Array(RATE_BYTES);
  tail.set(bytes.subarray(blocks * RATE_BYTES));
  tail[tailLength] = 0x01; // original Keccak domain padding — NOT SHA3's 0x06
  tail[RATE_BYTES - 1] |= 0x80;
  absorb(state, tail, 0, RATE_BYTES);

  // Squeeze: 32 bytes fit inside one rate block, so one permutation is enough.
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    // Lanes are little-endian: byte i lives in word i>>2, at shift (i%4)*8.
    out[i] = (state[i >> 2] >>> ((i % 4) * 8)) & 0xff;
  }
  return out;
}

/**
 * XOR one rate-sized block into the state and permute.
 * @param {Uint32Array} state
 * @param {Uint8Array} src
 * @param {number} offset
 * @param {number} length
 */
function absorb(state, src, offset, length) {
  for (let i = 0; i < length; i += 4) {
    const word = (src[offset + i] | (src[offset + i + 1] << 8) | (src[offset + i + 2] << 16) | (src[offset + i + 3] << 24)) >>> 0;
    state[i >> 2] = (state[i >> 2] ^ word) >>> 0;
  }
  keccakF(state);
}

const HEX = "0123456789abcdef";

/** @param {Uint8Array} bytes */
function hex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  return s;
}

/**
 * Keccak-256 as a BARE lowercase 64-character hex digest — no `0x`.
 *
 * The prefix is deliberately absent. A `0x` followed by 64 hex characters is exactly the shape of
 * a raw secp256k1 private key, and this project's secret scanner refuses that pattern anywhere in
 * a bundle. Prefixing these digests would have meant either a manifest that trips the scanner or a
 * scanner taught to ignore the one shape it exists to catch; both are worse than dropping two
 * characters. It also keeps every digest in the manifest the same shape, whatever hashed it —
 * the field's block, not its punctuation, says which algorithm produced it.
 *
 * Use {@link prefixed} at the moment a value is displayed or handed to a chain call.
 * @param {Uint8Array} bytes
 */
export function keccak256Hex(bytes) {
  return hex(keccak256Bytes(bytes));
}

const encoder = new TextEncoder();

/** @param {string} text */
export function keccak256Utf8(text) {
  return keccak256Hex(encoder.encode(text));
}

/** `0x`-prefixed form, for printing and for anything that speaks `bytes32`. @param {string} digest */
export function prefixed(digest) {
  return typeof digest === "string" && digest.startsWith("0x") ? digest : `0x${digest}`;
}

/** True for a bare lowercase 32-byte hex digest. @param {unknown} value */
export function isKeccak256Hex(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** The all-zero digest — what an unbound chain field reads as. */
export const ZERO_DIGEST = "0".repeat(64);
