// SPDX-License-Identifier: MIT
// ACV1 — the creator art configuration, as JavaScript.
//
// THE AUTHORITY FOR THIS FILE IS SOLIDITY, NOT THIS FILE.
//
//   launchpad/src/art/ArtConfigV1.sol         the decoder and validator that runs on chain
//   launchpad/src/art/ArtConfigV1Encoder.sol  the reference encoder, its round-trip partner
//   docs/rc3/ACV1_FORMAT.md                   the field table, itself guarded by a Solidity suite
//
// This module is correct exactly insofar as it agrees with those, and that agreement is not
// asserted by reading: `test/art-config-parity.mjs` and `launchpad/test/art/ArtConfigV1Parity.t.sol`
// exchange preimages so each side computes its own answer independently. Comparing our own numbers
// to our own numbers would prove nothing.
//
// WHY THIS EXISTS AT ALL
// ----------------------
// Before ACV1, a launch's `artConfig` was an opaque blob whose only on-chain properties were its
// length and its hash — which is why every project could be launched with four bytes and still
// render, and why every collection rendered the same built-in shapes no matter what its creator
// drew. ACV1 makes the configuration a DECLARED PROGRAM: a palette, a layer graph binding market
// sensors to drawing primitives, a trait schema, a title. It is validated exhaustively INSIDE the
// atomic launch, so a configuration that reaches chain state is one the runtime can render for
// every reachable market state. That ordering is what lets `tokenURI` have no fallback image.
//
// THE ONE RULE THAT IS EASIEST TO GET WRONG
// -----------------------------------------
// `artConfigHash` is keccak256 over the EXACT TRANSMITTED BYTES — magic through terminator AND the
// opaque appendix. Bytes after the `0xFF` terminator are never interpreted but they ARE inside the
// hash, so two documents that decode identically can hash differently. That means
// `hash(encode(decode(bytes)))` is WRONG for any document carrying an appendix, and silently wrong:
// it produces a plausible digest the chain will reject. {hashArtConfigV1} therefore takes BYTES,
// never a config object, and there is deliberately no overload that takes one.

import { keccak256Hex } from "./keccak256.js";

// ---------------------------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------------------------

/** The `artConfigFormat` a bundle declares for a configuration in this format. */
export const ACV1_FORMAT = "ACV1";

/** Byte 4. Checked for exact equality — a future format is a new version byte and a new parser. */
export const ACV1_VERSION = 1;

/** Bytes 0..3, `0x41435631`, ASCII "ACV1". */
export const ACV1_MAGIC = "41435631";
const MAGIC_BYTES = Object.freeze([0x41, 0x43, 0x56, 0x31]);

/** The terminator that closes the interpreted document. Everything after it is the appendix. */
export const ACV1_TERMINATOR = 0xff;

export const ACV1_FLAGS = Object.freeze({ ANIMATE: 0x01 });
const FLAG_MASK = 0x01;

// ---------------------------------------------------------------------------------------------
// vocabularies — transcribed from ArtConfigV1.sol, index === on-chain value
// ---------------------------------------------------------------------------------------------

/** Drawing primitives. `LAYER_MAX = 5`. */
export const ACV1_LAYER_KINDS = Object.freeze(["STRATA", "RINGS", "BARS", "GRID", "SHARDS", "VEIL"]);

/**
 * Market sensors. Index is the on-chain value.
 *
 * These are NOT the kit's `MARKET_SENSORS` vocabulary (buying_pressure, tick, holder_growth, …).
 * That list drives the market-to-art MAPPING document; this one drives ACV1 layers and traits.
 * They are different axes with different members and must never be cross-mapped.
 */
export const ACV1_SENSORS = Object.freeze([
  "VOLUME_TIER",
  "EPOCH",
  "DRAWDOWN",
  "RECOVERY",
  "VOLATILITY",
  "STRESS",
  "LIQUIDITY",
  "FLOW_BIAS",
  "QUOTE_VOLUME",
  "FRAGMENTATION",
]);

/**
 * The sensors a LAYER may name: everything except `FRAGMENTATION`. `SENSOR_VISUAL_MAX = 8`.
 *
 * FRAGMENTATION is the organic swap COUNT. Driving a visual magnitude with it would let 100 swaps
 * of $1 walk the artwork 100 steps while a single $100 swap moved it once — the exact defect the
 * volume ladder exists to remove. It stays legal in a TRAIT, where it is labelled for what it is
 * and cannot masquerade as a magnitude. A UI's layer picker must not offer it.
 */
export const ACV1_LAYER_SENSORS = Object.freeze(ACV1_SENSORS.slice(0, 9));

/** DNA slots, trait-only value sources. `DNA_SLOT_0 = 10`, `TRAIT_SOURCE_MAX = 13`. */
export const ACV1_DNA_SLOTS = Object.freeze(["DNA_SLOT_0", "DNA_SLOT_1", "DNA_SLOT_2", "DNA_SLOT_3"]);

/** Everything a trait `source` may name: sensors 0..9 then DNA slots 10..13. */
export const ACV1_TRAIT_SOURCES = Object.freeze([...ACV1_SENSORS, ...ACV1_DNA_SLOTS]);

/** Response curves. `CURVE_MAX = 3`. */
export const ACV1_CURVES = Object.freeze(["LINEAR", "LOG2", "EASE", "STEP"]);

/** Trait render styles. `STYLE_MAX = 2`. */
export const ACV1_TRAIT_STYLES = Object.freeze(["NUMBER", "WORD", "HEX"]);

// ---------------------------------------------------------------------------------------------
// bounds
// ---------------------------------------------------------------------------------------------

export const ACV1_LIMITS = Object.freeze({
  maxPalette: 8,
  maxLayers: 8,
  maxTraits: 8,
  maxTraitName: 24,
  maxTitle: 32,
  /** Per-layer element ceiling, checked against `amountMax`. */
  maxLayerElements: 32,
  /** Whole-document element budget, checked against the sum of `amountMax`. */
  maxTotalElements: 96,
  /**
   * The smallest VALID document: P=1, L=1, T=0, titleLen=0.
   *   4 magic + 1 version + 1 flags + 1 bg + 1 paletteCount + 3 palette
   * + 1 layerCount + 6 layer + 1 traitCount + 1 titleLen + 1 terminator = 21
   */
  minBytes: 21,
  /** The largest INTERPRETED document: P=8, L=8, T=8, every name 24, title 32. */
  maxBytes: 332,
  /**
   * The header's cheap early-out, and NOT the minimum — 19- and 20-byte documents clear it and are
   * refused further in by the bounds checks at steps 7, 9, 14 and 16. Exported so it can be
   * asserted to be what it is; never use it as "minimum valid length".
   */
  headerGateBytes: 19,
});

// ---------------------------------------------------------------------------------------------
// error codes — the table ArtConfigRejected(code) carries verbatim
// ---------------------------------------------------------------------------------------------

export const ACV1_ERROR_CODES = Object.freeze({
  0: "ERR_NONE",
  1: "ERR_TOO_SHORT",
  2: "ERR_MAGIC",
  3: "ERR_VERSION",
  4: "ERR_FLAGS",
  5: "ERR_PALETTE_COUNT",
  6: "ERR_BACKGROUND",
  7: "ERR_LAYER_COUNT",
  8: "ERR_LAYER_KIND",
  9: "ERR_LAYER_SENSOR",
  10: "ERR_LAYER_CURVE",
  11: "ERR_LAYER_PALETTE",
  12: "ERR_LAYER_AMOUNT",
  13: "ERR_ELEMENT_BUDGET",
  14: "ERR_TRAIT_COUNT",
  15: "ERR_TRAIT_NAME",
  16: "ERR_TRAIT_SOURCE",
  17: "ERR_TRAIT_STYLE",
  18: "ERR_TITLE",
  19: "ERR_TERMINATOR",
  /** RETIRED — never returned. Kept so an off-chain code table does not shift. */
  20: "ERR_TRAILING",
});

const ERR_NONE = 0;
const ERR_TOO_SHORT = 1;
const ERR_MAGIC = 2;
const ERR_VERSION = 3;
const ERR_FLAGS = 4;
const ERR_PALETTE_COUNT = 5;
const ERR_BACKGROUND = 6;
const ERR_LAYER_COUNT = 7;
const ERR_LAYER_KIND = 8;
const ERR_LAYER_SENSOR = 9;
const ERR_LAYER_CURVE = 10;
const ERR_LAYER_PALETTE = 11;
const ERR_LAYER_AMOUNT = 12;
const ERR_ELEMENT_BUDGET = 13;
const ERR_TRAIT_COUNT = 14;
const ERR_TRAIT_NAME = 15;
const ERR_TRAIT_SOURCE = 16;
const ERR_TRAIT_STYLE = 17;
const ERR_TITLE = 18;
const ERR_TERMINATOR = 19;

/** Human-readable reason for a code, for a creator who has to fix it. */
const REASONS = Object.freeze({
  [ERR_NONE]: "valid",
  [ERR_TOO_SHORT]: "the document ends before a field the layout requires",
  [ERR_MAGIC]: 'bytes 0..3 are not the ACV1 magic (0x41435631, "ACV1")',
  [ERR_VERSION]: "byte 4 is not version 1",
  [ERR_FLAGS]: "a flag bit outside ANIMATE (0x01) is set",
  [ERR_PALETTE_COUNT]: "the palette must hold 1..8 colours",
  [ERR_BACKGROUND]: "the background index is outside the palette",
  [ERR_LAYER_COUNT]: "a configuration must declare 1..8 layers",
  [ERR_LAYER_KIND]: `a layer names a primitive outside ${ACV1_LAYER_KINDS.join(", ")}`,
  [ERR_LAYER_SENSOR]: "a layer names a sensor it may not use — FRAGMENTATION is a trait source only, never a layer's magnitude",
  [ERR_LAYER_CURVE]: `a layer names a curve outside ${ACV1_CURVES.join(", ")}`,
  [ERR_LAYER_PALETTE]: "a layer's palette index is outside the palette",
  [ERR_LAYER_AMOUNT]: "a layer's amountMax must be 1..32 and amountMin must not exceed it",
  [ERR_ELEMENT_BUDGET]: `the layers' worst-case element total exceeds ${ACV1_LIMITS.maxTotalElements}`,
  [ERR_TRAIT_COUNT]: "at most 8 traits may be declared",
  [ERR_TRAIT_NAME]: "a trait name must be 1..24 printable ASCII characters and may not contain a quote or a backslash",
  [ERR_TRAIT_SOURCE]: "a trait names a value source outside the sensors and DNA slots",
  [ERR_TRAIT_STYLE]: `a trait names a style outside ${ACV1_TRAIT_STYLES.join(", ")}`,
  [ERR_TITLE]: "the title must be at most 32 printable ASCII characters and may not contain a quote or a backslash",
  [ERR_TERMINATOR]: "the byte closing the document is not the 0xFF terminator",
});

/** @param {number} code */
export function acv1Reason(code) {
  return REASONS[code] ?? `unknown ACV1 error code ${code}`;
}

// ---------------------------------------------------------------------------------------------
// encoding
// ---------------------------------------------------------------------------------------------

export class ArtConfigV1Error extends Error {}

/**
 * Encode a configuration into its canonical ACV1 byte string.
 *
 * A FAITHFUL MIRROR OF `ArtConfigV1Encoder.encode`, INCLUDING ITS REFUSAL TO VALIDATE. The Solidity
 * reference will happily emit a document the decoder refuses — zero layers, an out-of-range sensor,
 * an oversized title — and that is deliberate: it is how negative fixtures are constructed. Keeping
 * that property here is what lets the parity suite drive both encoders with the same illegal inputs
 * and compare bytes. Callers that need a guarantee use {encodeArtConfigV1Checked}; the creator kit
 * always does.
 *
 * It also never emits an appendix, exactly like the reference. An appendix is concatenated by the
 * caller AFTER encoding, and doing so changes `artConfigHash`.
 *
 * @param {import("../types.js").ArtConfigV1} config
 * @returns {Uint8Array}
 */
export function encodeArtConfigV1(config) {
  if (!config || typeof config !== "object") throw new ArtConfigV1Error("an ACV1 configuration must be an object");

  const out = [];
  out.push(...MAGIC_BYTES);
  out.push(ACV1_VERSION);
  out.push(flagsByte(config));
  out.push(u8(config.background, "background"));

  const palette = asArray(config.palette, "palette");
  out.push(u8(palette.length, "palette.length"));
  for (let i = 0; i < palette.length; i++) {
    const rgb = parseColor(palette[i], `palette[${i}]`);
    out.push((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
  }

  const layers = asArray(config.layers, "layers");
  out.push(u8(layers.length, "layers.length"));
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!l || typeof l !== "object") throw new ArtConfigV1Error(`layers[${i}] must be an object`);
    out.push(
      enumValue(l.kind, ACV1_LAYER_KINDS, `layers[${i}].kind`),
      // Encoded against the FULL sensor list: the encoder does not validate, so a layer naming
      // FRAGMENTATION encodes to 9 and is refused by the decoder — which is the negative fixture.
      enumValue(l.sensor, ACV1_SENSORS, `layers[${i}].sensor`),
      enumValue(l.curve, ACV1_CURVES, `layers[${i}].curve`),
      u8(l.palette, `layers[${i}].palette`),
      u8(l.amountMin, `layers[${i}].amountMin`),
      u8(l.amountMax, `layers[${i}].amountMax`),
    );
  }

  const traits = asArray(config.traits ?? [], "traits");
  out.push(u8(traits.length, "traits.length"));
  for (let i = 0; i < traits.length; i++) {
    const t = traits[i];
    if (!t || typeof t !== "object") throw new ArtConfigV1Error(`traits[${i}] must be an object`);
    const name = asciiBytes(t.name, `traits[${i}].name`);
    out.push(u8(name.length, `traits[${i}].name length`), ...name);
    out.push(enumValue(t.source, ACV1_TRAIT_SOURCES, `traits[${i}].source`), enumValue(t.style, ACV1_TRAIT_STYLES, `traits[${i}].style`));
  }

  const title = asciiBytes(config.title ?? "", "title");
  out.push(u8(title.length, "title length"), ...title);
  out.push(ACV1_TERMINATOR);

  return Uint8Array.from(out);
}

/**
 * {encodeArtConfigV1}, refusing to hand back bytes the on-chain decoder would reject. This is what
 * the creator kit calls: a creator should never be able to export a configuration whose launch is
 * guaranteed to revert.
 * @param {import("../types.js").ArtConfigV1} config
 * @returns {Uint8Array}
 */
export function encodeArtConfigV1Checked(config) {
  const bytes = encodeArtConfigV1(config);
  const verdict = validateArtConfigV1(bytes);
  if (!verdict.ok) {
    throw new ArtConfigV1Error(`this configuration encodes to bytes the on-chain validator refuses: ${verdict.code} ${verdict.name} — ${verdict.reason}`);
  }
  return bytes;
}

/**
 * Append an opaque appendix to an encoded document. Separate from {encodeArtConfigV1} because the
 * distinction is load-bearing: the appendix is never interpreted but IS committed, so this changes
 * `artConfigHash` while changing nothing about the image.
 * @param {Uint8Array} document
 * @param {Uint8Array} appendix
 */
export function withArtConfigV1Appendix(document, appendix) {
  const out = new Uint8Array(document.length + appendix.length);
  out.set(document, 0);
  out.set(appendix, document.length);
  return out;
}

// ---------------------------------------------------------------------------------------------
// decoding + validation — one parser, exactly as ArtConfigV1._parse has exactly one
// ---------------------------------------------------------------------------------------------

/**
 * Decode a configuration. Never throws: like the on-chain decoder it REPORTS, so a caller can show
 * a creator the precise byte-level reason their configuration was refused.
 *
 * @param {Uint8Array} bytes the EXACT transmitted bytes, appendix included
 * @returns {{ ok: boolean, code: number, name: string, reason: string, config: any, appendix: string }}
 */
export function decodeArtConfigV1(bytes) {
  return parse(bytes, true);
}

/**
 * Validate a configuration. Accepts either the encoded bytes or a config object (which it encodes
 * first, so a creator's authoring document and its wire form are judged by one rule).
 *
 * @param {Uint8Array | import("../types.js").ArtConfigV1} configOrBytes
 * @returns {{ ok: boolean, code: number, name: string, reason: string, issues: string[] }}
 */
export function validateArtConfigV1(configOrBytes) {
  let bytes;
  if (configOrBytes instanceof Uint8Array) {
    bytes = configOrBytes;
  } else {
    try {
      bytes = encodeArtConfigV1(configOrBytes);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, code: -1, name: "ERR_NOT_ENCODABLE", reason, issues: [reason] };
    }
  }
  const { ok, code, name, reason } = parse(bytes, false);
  return { ok, code, name, reason, issues: ok ? [] : [`${name} (${code}): ${reason}`] };
}

/**
 * Whether a byte string even claims to be ACV1 — magic and version only. Cheap, total, and never
 * throws, so a UI can branch on "is this the format?" separately from "is it valid?".
 * @param {Uint8Array} bytes
 */
export function isArtConfigV1(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 5) return false;
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC_BYTES[i]) return false;
  return bytes[4] === ACV1_VERSION;
}

/**
 * `artConfigHash` — keccak256 over the EXACT TRANSMITTED BYTES, appendix included. Bare lowercase
 * hex, no `0x` (a `0x`-prefixed 64-hex string is the raw private-key shape the secret scanner
 * refuses, so every digest in this format is stored bare).
 *
 * This is `LaunchParams.artScriptHash`. It is checked twice inside one launch: the factory compares
 * it against the caller's own bytes, and the collection reads the stored SSTORE2 chunks back,
 * re-hashes them and compares again — which is the check that proves the bytes STORED are the bytes
 * COMMITTED.
 *
 * TAKES BYTES, NEVER A CONFIG OBJECT, ON PURPOSE. Hashing a re-encode of a decoded document drops
 * any appendix and produces a plausible digest the chain will reject.
 *
 * @param {Uint8Array} bytes
 */
export function hashArtConfigV1(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new ArtConfigV1Error("hashArtConfigV1 takes the exact transmitted bytes, not a configuration object — re-encoding a decoded document drops its appendix and changes the hash");
  }
  return keccak256Hex(bytes);
}

/**
 * The single parser behind {decodeArtConfigV1} and {validateArtConfigV1}, mirroring the on-chain
 * `_parse(d, build)` step for step so the two can never disagree about what is valid.
 *
 * The check ORDER is normative, not decorative. One defect can produce two different codes
 * depending on an unrelated field: a zero-layer config with a 1-colour palette returns
 * ERR_TOO_SHORT because it never reaches the layer rule, while the same defect with an 8-colour
 * palette returns ERR_LAYER_COUNT. The code names the EARLIEST violated rule, nothing more.
 */
function parse(d, build) {
  if (!(d instanceof Uint8Array)) return fail(ERR_TOO_SHORT, build);
  const n = d.length;

  // ---- header ------------------------------------------------------------------------------
  // A cheap early-out, NOT the minimum: 19- and 20-byte documents clear this and are refused by
  // the bounds checks further in.
  if (n < ACV1_LIMITS.headerGateBytes) return fail(ERR_TOO_SHORT, build);
  for (let i = 0; i < 4; i++) if (d[i] !== MAGIC_BYTES[i]) return fail(ERR_MAGIC, build);
  if (d[4] !== ACV1_VERSION) return fail(ERR_VERSION, build);
  if ((d[5] & ~FLAG_MASK & 0xff) !== 0) return fail(ERR_FLAGS, build);

  const p = d[7];
  if (p === 0 || p > ACV1_LIMITS.maxPalette) return fail(ERR_PALETTE_COUNT, build);
  if (d[6] >= p) return fail(ERR_BACKGROUND, build);

  let off = 8;
  if (n < off + p * 3 + 1) return fail(ERR_TOO_SHORT, build);

  const palette = [];
  if (build) {
    for (let i = 0; i < p; i++) {
      palette.push(colorHex((d[off + i * 3] << 16) | (d[off + i * 3 + 1] << 8) | d[off + i * 3 + 2]));
    }
  }
  off += p * 3;

  // ---- layers ------------------------------------------------------------------------------
  const l = d[off++];
  if (l === 0 || l > ACV1_LIMITS.maxLayers) return fail(ERR_LAYER_COUNT, build);
  if (n < off + l * 6 + 1) return fail(ERR_TOO_SHORT, build);

  const layers = [];
  let budget = 0;
  for (let i = 0; i < l; i++) {
    const kind = d[off];
    const sensor = d[off + 1];
    const curve = d[off + 2];
    const paletteIx = d[off + 3];
    const amountMin = d[off + 4];
    const amountMax = d[off + 5];

    if (kind > ACV1_LAYER_KINDS.length - 1) return fail(ERR_LAYER_KIND, build);
    // The FRAGMENTATION refusal, in one place, exactly as on chain.
    if (sensor > ACV1_LAYER_SENSORS.length - 1) return fail(ERR_LAYER_SENSOR, build);
    if (curve > ACV1_CURVES.length - 1) return fail(ERR_LAYER_CURVE, build);
    if (paletteIx >= p) return fail(ERR_LAYER_PALETTE, build);
    if (amountMax === 0 || amountMax > ACV1_LIMITS.maxLayerElements || amountMin > amountMax) return fail(ERR_LAYER_AMOUNT, build);

    budget += amountMax;
    if (build) {
      layers.push({
        kind: ACV1_LAYER_KINDS[kind],
        sensor: ACV1_SENSORS[sensor],
        curve: ACV1_CURVES[curve],
        palette: paletteIx,
        amountMin,
        amountMax,
      });
    }
    off += 6;
  }
  if (budget > ACV1_LIMITS.maxTotalElements) return fail(ERR_ELEMENT_BUDGET, build);

  // ---- traits ------------------------------------------------------------------------------
  const t = d[off++];
  if (t > ACV1_LIMITS.maxTraits) return fail(ERR_TRAIT_COUNT, build);
  const traits = [];
  for (let i = 0; i < t; i++) {
    if (off >= n) return fail(ERR_TOO_SHORT, build);
    const nameLen = d[off++];
    if (nameLen === 0 || nameLen > ACV1_LIMITS.maxTraitName) return fail(ERR_TRAIT_NAME, build);
    if (n < off + nameLen + 2) return fail(ERR_TOO_SHORT, build);
    if (!jsonSafe(d, off, nameLen)) return fail(ERR_TRAIT_NAME, build);

    const name = build ? asciiString(d, off, nameLen) : "";
    const source = d[off + nameLen];
    const style = d[off + nameLen + 1];
    off += nameLen + 2;

    // The shipped check is two adjacent bands; because DNA_SLOT_0 == SENSOR_TRAIT_MAX + 1 there is
    // no gap and the effective rule is `source <= 13`. Written literally here, and asserted
    // equivalent to the single bound in the parity suite.
    if (source > ACV1_SENSORS.length - 1 && (source < ACV1_SENSORS.length || source > ACV1_TRAIT_SOURCES.length - 1)) {
      return fail(ERR_TRAIT_SOURCE, build);
    }
    if (style > ACV1_TRAIT_STYLES.length - 1) return fail(ERR_TRAIT_STYLE, build);
    if (build) traits.push({ name, source: ACV1_TRAIT_SOURCES[source], style: ACV1_TRAIT_STYLES[style] });
  }

  // ---- tail --------------------------------------------------------------------------------
  if (off >= n) return fail(ERR_TOO_SHORT, build);
  const titleLen = d[off++];
  if (titleLen > ACV1_LIMITS.maxTitle) return fail(ERR_TITLE, build);
  if (n < off + titleLen + 1) return fail(ERR_TOO_SHORT, build);
  if (titleLen !== 0 && !jsonSafe(d, off, titleLen)) return fail(ERR_TITLE, build);
  const title = build ? asciiString(d, off, titleLen) : "";
  off += titleLen;

  if (d[off] !== ACV1_TERMINATOR) return fail(ERR_TERMINATOR, build);
  // Everything beyond the terminator is the opaque appendix: committed by `artConfigHash`, bounded
  // by the factory's script-byte limit, and never read here.
  const appendix = build ? toHexString(d.subarray(off + 1)) : "";

  return {
    ok: true,
    code: ERR_NONE,
    name: "ERR_NONE",
    reason: REASONS[ERR_NONE],
    config: build
      ? {
          version: ACV1_VERSION,
          format: ACV1_FORMAT,
          animate: (d[5] & ACV1_FLAGS.ANIMATE) !== 0,
          background: d[6],
          palette,
          layers,
          traits,
          title,
        }
      : null,
    appendix,
  };
}

function fail(code, build) {
  return { ok: false, code, name: ACV1_ERROR_CODES[code], reason: REASONS[code], config: null, appendix: "", issues: [] };
}

// ---------------------------------------------------------------------------------------------
// presentation + authoring helpers
// ---------------------------------------------------------------------------------------------

/**
 * A display projection of a decoded configuration, for `relics inspect` and the studio. Pure
 * formatting: it adds no fact the bytes do not already carry.
 * @param {any} decoded the `config` from {decodeArtConfigV1}
 * @param {Uint8Array} [bytes] the transmitted bytes, so length and hash can be reported truthfully
 */
export function describeArtConfigV1(decoded, bytes) {
  if (!decoded) return null;
  const interpreted = encodeArtConfigV1(decoded).length;
  return {
    format: ACV1_FORMAT,
    version: decoded.version,
    title: decoded.title,
    animate: decoded.animate,
    background: `${decoded.background} (${decoded.palette[decoded.background] ?? "?"})`,
    palette: [...decoded.palette],
    layers: decoded.layers.map((l) => `${l.kind} <- ${l.sensor} via ${l.curve}, palette ${l.palette}, ${l.amountMin}..${l.amountMax}`),
    traits: decoded.traits.map((t) => `${t.name}: ${t.source} as ${t.style}`),
    worstCaseElements: decoded.layers.reduce((sum, l) => sum + l.amountMax, 0),
    elementBudget: ACV1_LIMITS.maxTotalElements,
    interpretedBytes: interpreted,
    totalBytes: bytes ? bytes.length : interpreted,
    appendixBytes: bytes ? bytes.length - interpreted : 0,
    configHash: bytes ? hashArtConfigV1(bytes) : null,
  };
}

/**
 * The all-null authoring skeleton. Every artist-supplied field is explicitly absent, so a migration
 * or a scaffold produces a document a creator MUST fill rather than one that silently carries a
 * plausible default. There is no generic template to fall back to, by design: defaulting an artist
 * parameter is the exact failure this format exists to eliminate.
 */
export function emptyArtConfigV1() {
  return { version: ACV1_VERSION, format: ACV1_FORMAT, animate: null, background: null, palette: null, layers: null, traits: null, title: null };
}

/** The worst-case element count a configuration can ever emit — the budget the launch checks. */
export function worstCaseElementsV1(config) {
  return asArray(config?.layers ?? [], "layers").reduce((sum, l) => sum + (Number(l?.amountMax) || 0), 0);
}

// ---------------------------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------------------------

/** Printable ASCII minus the two characters that could break out of a JSON string. */
function jsonSafe(d, off, len) {
  for (let i = 0; i < len; i++) {
    const c = d[off + i];
    if (c < 0x20 || c > 0x7e) return false;
    if (c === 0x22 || c === 0x5c) return false;
  }
  return true;
}

function asciiString(d, off, len) {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(d[off + i]);
  return s;
}

/**
 * A string as bytes, refusing only what cannot be REPRESENTED — a non-string, a non-ASCII
 * character, a length that will not fit the one-byte prefix. Emptiness and the JSON-safe charset
 * are VALIDATION rules, and the encoder deliberately does not validate: the reference encoder emits
 * documents the decoder refuses, which is how the negative half of the conformance corpus is built
 * from real bytes instead of mocks.
 */
function asciiBytes(value, where) {
  if (typeof value !== "string") throw new ArtConfigV1Error(`${where} must be a string`);
  const out = [];
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c > 0xff) throw new ArtConfigV1Error(`${where} must be ASCII; "${value[i]}" is not`);
    out.push(c);
  }
  if (out.length > 0xff) throw new ArtConfigV1Error(`${where} does not fit in a one-byte length`);
  return out;
}

function u8(value, where) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new ArtConfigV1Error(`${where} must be an integer 0..255`);
  return value;
}

function flagsByte(config) {
  if (typeof config.flags === "number") return u8(config.flags, "flags");
  if (config.animate === true) return ACV1_FLAGS.ANIMATE;
  if (config.animate === false || config.animate === undefined) return 0;
  throw new ArtConfigV1Error("animate must be a boolean");
}

function asArray(value, where) {
  if (!Array.isArray(value)) throw new ArtConfigV1Error(`${where} must be an array`);
  return value;
}

/**
 * Accepts the on-chain integer or a name from the vocabulary. Names are what a creator authors —
 * a typo becomes a refusal with the legal set listed, where a raw integer would silently mean
 * something else.
 */
function enumValue(value, vocabulary, where) {
  if (Number.isInteger(value)) return u8(value, where);
  if (typeof value === "string") {
    const ix = vocabulary.indexOf(value);
    if (ix < 0) throw new ArtConfigV1Error(`${where} must be one of ${vocabulary.join(", ")} (got "${value}")`);
    return ix;
  }
  throw new ArtConfigV1Error(`${where} must be one of ${vocabulary.join(", ")}`);
}

function parseColor(value, where) {
  if (Number.isInteger(value)) {
    if (value < 0 || value > 0xffffff) throw new ArtConfigV1Error(`${where} must be a 24-bit colour`);
    return value;
  }
  if (typeof value === "string") {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(value);
    if (!m) throw new ArtConfigV1Error(`${where} must be a "#RRGGBB" colour (got "${value}")`);
    return parseInt(m[1], 16);
  }
  throw new ArtConfigV1Error(`${where} must be a "#RRGGBB" colour`);
}

function colorHex(rgb) {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
}

function toHexString(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
