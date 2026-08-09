// SPDX-License-Identifier: MIT
// Canonical JSON serialization and hardened JSON parsing.
//
// Two jobs:
//   1. `canonicalJson` — one byte-exact serialization for any value, so a hash computed by the
//      CLI and a hash computed by the web importer cannot differ because of key order or
//      whitespace. Keys are sorted by UTF-16 code unit (the same order `Array#sort` gives), no
//      insignificant whitespace is emitted, and non-finite numbers / undefined / functions /
//      symbols / bigints are refused outright instead of being coerced.
//   2. `safeJsonParse` — parses UNTRUSTED bundle JSON into null-prototype objects and drops
//      `__proto__` / `constructor` / `prototype` keys, so a hostile bundle cannot reach
//      Object.prototype through the importer.

export const POLLUTING_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);

export class CanonicalJsonError extends Error {}

/**
 * Deterministic JSON text for `value`. Throws `CanonicalJsonError` for anything that has no
 * single canonical form.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  return write(value, 0);
}

function write(value, depth) {
  if (depth > 64) throw new CanonicalJsonError("value nests deeper than 64 levels");
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(value)) throw new CanonicalJsonError(`non-finite number (${String(value)}) has no canonical form`);
    if (Object.is(value, -0)) return "0";
    return JSON.stringify(value);
  }
  if (t === "string") return JSON.stringify(value);
  if (t === "bigint") throw new CanonicalJsonError("bigint has no canonical JSON form; serialize it as a decimal string first");
  if (t === "undefined" || t === "function" || t === "symbol") {
    throw new CanonicalJsonError(`${t} is not serializable`);
  }
  if (Array.isArray(value)) {
    const parts = [];
    for (const item of value) parts.push(write(item, depth + 1));
    return `[${parts.join(",")}]`;
  }
  if (t === "object") {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (const key of keys) {
      const v = value[key];
      if (v === undefined) continue; // absent and undefined are the same fact
      parts.push(`${JSON.stringify(key)}:${write(v, depth + 1)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new CanonicalJsonError(`unsupported value of type ${t}`);
}

/** sha256 of the canonical serialization. Imported lazily to keep this module dependency-free. */
export class JsonParseError extends Error {}

/**
 * Parse untrusted JSON text. Objects come back with a null prototype and without any of
 * {@link POLLUTING_KEYS}. Depth and node count are bounded so a deeply nested or enormous
 * document cannot exhaust the stack or the heap of an importer.
 *
 * @param {string} text
 * @param {{ maxDepth?: number, maxNodes?: number }} [limits]
 */
export function safeJsonParse(text, limits = {}) {
  const maxDepth = limits.maxDepth ?? 32;
  const maxNodes = limits.maxNodes ?? 200_000;
  let nodes = 0;

  let raw;
  try {
    raw = JSON.parse(text, function (key, value) {
      if (POLLUTING_KEYS.includes(key)) return undefined;
      return value;
    });
  } catch (err) {
    throw new JsonParseError(`malformed JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const harden = (value, depth) => {
    if (++nodes > maxNodes) throw new JsonParseError(`JSON document exceeds ${maxNodes} nodes`);
    if (depth > maxDepth) throw new JsonParseError(`JSON document nests deeper than ${maxDepth} levels`);
    if (Array.isArray(value)) return value.map((v) => harden(v, depth + 1));
    if (value && typeof value === "object") {
      const out = Object.create(null);
      for (const key of Object.keys(value)) {
        if (POLLUTING_KEYS.includes(key)) continue;
        out[key] = harden(value[key], depth + 1);
      }
      return out;
    }
    return value;
  };

  return harden(raw, 0);
}

/**
 * Recursively converts null-prototype objects back to plain objects. Only needed when handing a
 * parsed document to code that does `instanceof`/prototype-sensitive things; hashing and
 * validation never need it.
 * @param {unknown} value
 */
export function toPlain(value) {
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = toPlain(value[key]);
    return out;
  }
  return value;
}
