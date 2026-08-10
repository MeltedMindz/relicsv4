// SPDX-License-Identifier: MIT
// Regenerates the ACV1 conformance corpus.
//
//   node packages/project-schema/fixtures/acv1/build.mjs
//
// THE CORPUS IS THE CONTRACT BETWEEN TWO IMPLEMENTATIONS THAT MUST NEVER DISAGREE:
// `@relics/project-schema/art-config` in JavaScript, and `ArtConfigV1.sol` +
// `ArtConfigV1Encoder.sol` in Solidity, the latter being the authority.
//
// It is built so that neither side can pass by reading the other's answer. Every vector carries a
// PREIMAGE — the configuration's fields, or a raw byte string — and each implementation computes
// the encoding, the validation code and the hashes FROM THAT PREIMAGE, then compares against the
// recorded result. Comparing our own numbers to our own numbers would prove nothing; comparing two
// independent computations against one committed expectation is the whole point.
//
// Two vector kinds, because they exercise opposite directions:
//
//   preimage  the fields of a configuration. Both sides ENCODE and must produce identical bytes,
//             then validate and hash them. Covers the encoder.
//   raw       a byte string given directly. Both sides VALIDATE and must return the same code.
//             Covers the decoder against inputs no encoder would produce — bad magic, truncation,
//             a wrong terminator.
//
// Negative vectors are first-class. The reference encoder deliberately does not validate, so it can
// emit documents the decoder refuses, and that is how a negative fixture is built rather than mocked.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeArtConfigV1,
  withArtConfigV1Appendix,
  validateArtConfigV1,
  decodeArtConfigV1,
  hashArtConfigV1,
  ACV1_LAYER_KINDS,
  ACV1_SENSORS,
  ACV1_CURVES,
  ACV1_TRAIT_SOURCES,
  ACV1_TRAIT_STYLES,
  ACV1_ERROR_CODES,
  ACV1_VERSION,
} from "../../art-config.js";
import { visualHashArtConfigV1, traitSchemaHashArtConfigV1 } from "../../src/art-config-v1-hashes.js";
import { stableJsonText } from "../../index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------
// the configurations
// ---------------------------------------------------------------------------------------------

/** A dark, banded, drawdown-driven project. Animates. Mirrors ArtFixtures.strataProject. */
const STRATA = {
  animate: true,
  background: 0,
  palette: ["#0b0b0e", "#7a4b2a", "#c98a3f", "#2e3b46"],
  layers: [
    { kind: "STRATA", sensor: "VOLUME_TIER", curve: "LINEAR", palette: 1, amountMin: 3, amountMax: 18 },
    { kind: "SHARDS", sensor: "DRAWDOWN", curve: "EASE", palette: 2, amountMin: 0, amountMax: 12 },
    { kind: "VEIL", sensor: "STRESS", curve: "LINEAR", palette: 3, amountMin: 1, amountMax: 1 },
  ],
  traits: [
    { name: "Sediment", source: "VOLUME_TIER", style: "WORD" },
    { name: "Fracture", source: "DRAWDOWN", style: "NUMBER" },
    { name: "Vein", source: "DNA_SLOT_0", style: "HEX" },
  ],
  title: "Strata",
};

/** A bright, concentric, volume-driven project. Does not animate. Mirrors ArtFixtures.orbitProject. */
const ORBIT = {
  animate: false,
  background: 0,
  palette: ["#f2efe6", "#1b4965", "#e05263"],
  layers: [
    { kind: "RINGS", sensor: "QUOTE_VOLUME", curve: "LOG2", palette: 1, amountMin: 2, amountMax: 24 },
    { kind: "GRID", sensor: "FLOW_BIAS", curve: "STEP", palette: 2, amountMin: 1, amountMax: 16 },
  ],
  traits: [
    { name: "Orbit", source: "QUOTE_VOLUME", style: "NUMBER" },
    { name: "Bias", source: "FLOW_BIAS", style: "WORD" },
  ],
  title: "Orbit",
};

/** The maximum-shaped configuration the validator accepts: 332 bytes exactly. */
const MAXIMAL = {
  animate: true,
  background: 7,
  palette: Array.from({ length: 8 }, (_, i) => `#${(0x101010 * (i + 1)).toString(16).padStart(6, "0")}`),
  // 8 layers x amountMax 12 == 96 == the whole-artwork element budget, exactly.
  layers: Array.from({ length: 8 }, (_, i) => ({
    kind: ACV1_LAYER_KINDS[i % 6],
    sensor: ACV1_SENSORS[i % 9],
    curve: ACV1_CURVES[i % 4],
    palette: i,
    amountMin: 1,
    amountMax: 12,
  })),
  traits: Array.from({ length: 8 }, (_, i) => ({
    name: "ABCDEFGHIJKLMNOPQRSTUVWX", // 24 characters, the maximum
    source: ACV1_TRAIT_SOURCES[i % 10],
    style: ACV1_TRAIT_STYLES[i % 3],
  })),
  title: "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345", // 32 characters, the maximum
};

/** The SMALLEST valid document: P=1, L=1, T=0, no title. 21 bytes. */
const MINIMAL = {
  animate: false,
  background: 0,
  palette: ["#000000"],
  layers: [{ kind: "STRATA", sensor: "VOLUME_TIER", curve: "LINEAR", palette: 0, amountMin: 0, amountMax: 1 }],
  traits: [],
  title: "",
};

/** FRAGMENTATION is legal HERE and only here — as a trait, never as a layer's magnitude. */
const FRAGMENTATION_TRAIT = {
  ...MINIMAL,
  traits: [{ name: "Swaps", source: "FRAGMENTATION", style: "NUMBER" }],
  title: "Frag",
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/** A copy of `base` with one surgical defect applied. */
function broken(base, mutate) {
  const copy = clone(base);
  mutate(copy);
  return copy;
}

const zeroLayers = (palette) => ({ ...clone(MINIMAL), palette, layers: [] });

// ---------------------------------------------------------------------------------------------
// vectors
// ---------------------------------------------------------------------------------------------

const PREIMAGE_VECTORS = [
  { name: "strata", note: "the reference animated project", config: STRATA },
  { name: "orbit", note: "a second, genuinely different project", config: ORBIT },
  { name: "maximal", note: "every count and length at its ceiling; 332 bytes, the interpreted maximum", config: MAXIMAL },
  { name: "minimal", note: "the smallest VALID document: 21 bytes, not the 19 of the header early-out", config: MINIMAL },
  { name: "fragmentation-trait", note: "FRAGMENTATION as a trait source is legal", config: FRAGMENTATION_TRAIT },
  {
    name: "strata-with-appendix",
    note: "identical interpreted document to `strata`, different artConfigHash — the appendix is committed but never read",
    config: STRATA,
    appendixHex: "63726561746f723a20612e656c646572",
  },
  {
    name: "empty-appendix-is-not-an-appendix",
    note: "a zero-length appendix must hash exactly like no appendix",
    config: ORBIT,
    appendixHex: "",
  },

  // ---- negatives, one defect each ----------------------------------------------------------
  { name: "err-flags", note: "a bit outside ANIMATE is set", config: broken(MINIMAL, (c) => (c.flags = 0x02)) },
  { name: "err-palette-count-zero", note: "empty palette", config: broken(MINIMAL, (c) => (c.palette = [])) },
  { name: "err-palette-count-nine", note: "nine colours", config: broken(MAXIMAL, (c) => c.palette.push("#ffffff")) },
  { name: "err-background", note: "background index outside the palette", config: broken(MINIMAL, (c) => (c.background = 1)) },
  {
    name: "err-too-short-zero-layers-small-palette",
    note: "ZERO LAYERS with a 1-colour palette: 15 bytes, refused by the length gate before the layer rule is ever reached",
    config: zeroLayers(["#000000"]),
  },
  {
    name: "err-layer-count-zero-layers-large-palette",
    note: "THE SAME DEFECT with an 8-colour palette: 36 bytes, so it reaches the layer rule and reports it. One defect, two codes, decided by an unrelated field.",
    config: zeroLayers(Array.from({ length: 8 }, () => "#000000")),
  },
  { name: "err-layer-count-nine", note: "nine layers", config: broken(MAXIMAL, (c) => c.layers.push(clone(c.layers[0]))) },
  { name: "err-layer-kind", note: "a primitive beyond VEIL", config: broken(MINIMAL, (c) => (c.layers[0].kind = 6)) },
  {
    name: "err-layer-sensor-fragmentation",
    note: "THE FRAGMENTATION REFUSAL: a dust swarm may not walk the artwork",
    config: broken(MINIMAL, (c) => (c.layers[0].sensor = "FRAGMENTATION")),
  },
  { name: "err-layer-curve", note: "a curve beyond STEP", config: broken(MINIMAL, (c) => (c.layers[0].curve = 4)) },
  { name: "err-layer-palette", note: "a layer's palette index outside the palette", config: broken(MINIMAL, (c) => (c.layers[0].palette = 1)) },
  { name: "err-layer-amount-zero-max", note: "amountMax of 0", config: broken(MINIMAL, (c) => (c.layers[0].amountMax = 0)) },
  { name: "err-layer-amount-over-32", note: "amountMax of 33", config: broken(MINIMAL, (c) => (c.layers[0].amountMax = 33)) },
  { name: "err-layer-amount-inverted", note: "amountMin above amountMax", config: broken(MINIMAL, (c) => ((c.layers[0].amountMin = 5), (c.layers[0].amountMax = 4))) },
  {
    name: "err-element-budget",
    note: "97 worst-case elements, one over the whole-artwork budget",
    config: broken(MAXIMAL, (c) => (c.layers[0].amountMax = 13)),
  },
  { name: "err-trait-count-nine", note: "nine traits", config: broken(MAXIMAL, (c) => c.traits.push(clone(c.traits[0]))) },
  { name: "err-trait-name-empty", note: "a zero-length trait name", config: broken(STRATA, (c) => (c.traits[0].name = "")) },
  { name: "err-trait-name-long", note: "a 25-character trait name", config: broken(STRATA, (c) => (c.traits[0].name = "ABCDEFGHIJKLMNOPQRSTUVWXY")) },
  { name: "err-trait-name-quote", note: 'a trait name carrying a quote — the character that could forge a metadata field', config: broken(STRATA, (c) => (c.traits[0].name = 'Sed"ment')) },
  { name: "err-trait-name-backslash", note: "a trait name carrying a backslash", config: broken(STRATA, (c) => (c.traits[0].name = "Sed\\ment")) },
  { name: "err-trait-name-control", note: "a trait name carrying a control character", config: broken(STRATA, (c) => (c.traits[0].name = "Sed\x01ment")) },
  { name: "err-trait-source", note: "a value source beyond DNA_SLOT_3", config: broken(STRATA, (c) => (c.traits[0].source = 14)) },
  { name: "err-trait-style", note: "a style beyond HEX", config: broken(STRATA, (c) => (c.traits[0].style = 3)) },
  { name: "err-title-long", note: "a 33-character title", config: broken(MINIMAL, (c) => (c.title = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456")) },
  { name: "err-title-quote", note: "a title carrying a quote", config: broken(MINIMAL, (c) => (c.title = 'Str"ta')) },
];

/**
 * Byte strings no encoder would produce. These prove the DECODER, and several of them are the
 * reason `validate` has to be non-reverting: an out-of-range read would panic, and a panic is not
 * a code a creator can be shown.
 */
const RAW_VECTORS = (() => {
  const strata = encodeArtConfigV1(STRATA);
  const minimal = encodeArtConfigV1(MINIMAL);
  const hex = (b) => Buffer.from(b).toString("hex");
  const mutated = (base, at, value) => {
    const copy = Uint8Array.from(base);
    copy[at] = value;
    return copy;
  };

  return [
    { name: "raw-empty", note: "no bytes at all", hex: "" },
    { name: "raw-magic", note: "the right length, the wrong magic", hex: hex(mutated(strata, 0, 0x42)) },
    { name: "raw-version", note: "version 2", hex: hex(mutated(strata, 4, 2)) },
    { name: "raw-terminator", note: "the closing byte is not 0xFF", hex: hex(mutated(strata, strata.length - 1, 0xfe)) },
    { name: "raw-truncated-header", note: "cut inside the palette", hex: hex(strata.subarray(0, 10)) },
    { name: "raw-truncated-layers", note: "cut inside the layer table", hex: hex(strata.subarray(0, 24)) },
    { name: "raw-truncated-tail", note: "cut before the terminator", hex: hex(strata.subarray(0, strata.length - 1)) },
    {
      name: "raw-19-bytes",
      note: "EXACTLY the header early-out threshold. It clears `n < 19` and is still refused — proof that 19 is not the minimum valid length.",
      hex: hex(minimal.subarray(0, 19)),
    },
    {
      name: "raw-20-bytes",
      note: "one byte more, still refused. The minimum is 21.",
      hex: hex(minimal.subarray(0, 20)),
    },
    { name: "raw-21-bytes-valid", note: "the smallest document that is actually valid", hex: hex(minimal) },
  ];
})();

// ---------------------------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------------------------

/**
 * The column-oriented view of a configuration. Solidity reads JSON through typed array readers, so
 * a transpose here saves the on-chain side from decoding nested tuples — a mechanical rearrangement
 * of the same preimage, never a second source of truth.
 */
function columns(config) {
  const layers = config.layers ?? [];
  const traits = config.traits ?? [];
  const ix = (value, vocabulary) => (Number.isInteger(value) ? value : vocabulary.indexOf(value));
  return {
    flags: typeof config.flags === "number" ? config.flags : config.animate ? 1 : 0,
    background: config.background,
    palette: (config.palette ?? []).map((c) => parseInt(String(c).replace(/^#/, ""), 16)),
    layerKind: layers.map((l) => ix(l.kind, ACV1_LAYER_KINDS)),
    layerSensor: layers.map((l) => ix(l.sensor, ACV1_SENSORS)),
    layerCurve: layers.map((l) => ix(l.curve, ACV1_CURVES)),
    layerPalette: layers.map((l) => l.palette),
    layerAmountMin: layers.map((l) => l.amountMin),
    layerAmountMax: layers.map((l) => l.amountMax),
    traitName: traits.map((t) => t.name),
    traitSource: traits.map((t) => ix(t.source, ACV1_TRAIT_SOURCES)),
    traitStyle: traits.map((t) => ix(t.style, ACV1_TRAIT_STYLES)),
    title: config.title ?? "",
  };
}

const vectors = [];

for (const vector of PREIMAGE_VECTORS) {
  const document = encodeArtConfigV1(vector.config);
  const appendix = Buffer.from(vector.appendixHex ?? "", "hex");
  const bytes = appendix.length > 0 ? withArtConfigV1Appendix(document, Uint8Array.from(appendix)) : document;
  const verdict = validateArtConfigV1(bytes);
  const decoded = decodeArtConfigV1(bytes);

  vectors.push({
    kind: "preimage",
    name: vector.name,
    note: vector.note,
    preimage: vector.config,
    columns: columns(vector.config),
    appendixHex: vector.appendixHex ?? "",
    encodedHex: Buffer.from(bytes).toString("hex"),
    totalBytes: bytes.length,
    code: verdict.code,
    codeName: ACV1_ERROR_CODES[verdict.code] ?? verdict.name,
    artConfigHash: hashArtConfigV1(bytes),
    // The abi.encode commitments exist only for a document that decodes.
    visualHash: decoded.ok ? visualHashArtConfigV1(decoded.config) : null,
    traitSchemaHash: decoded.ok ? traitSchemaHashArtConfigV1(decoded.config) : null,
  });
}

for (const vector of RAW_VECTORS) {
  const bytes = Uint8Array.from(Buffer.from(vector.hex, "hex"));
  const verdict = validateArtConfigV1(bytes);
  const decoded = decodeArtConfigV1(bytes);
  vectors.push({
    kind: "raw",
    name: vector.name,
    note: vector.note,
    encodedHex: vector.hex,
    totalBytes: bytes.length,
    code: verdict.code,
    codeName: ACV1_ERROR_CODES[verdict.code] ?? verdict.name,
    artConfigHash: hashArtConfigV1(bytes),
    // Carried for raw vectors too, so the commitment comparison covers EVERY decodable vector
    // rather than only the ones an encoder produced.
    visualHash: decoded.ok ? visualHashArtConfigV1(decoded.config) : null,
    traitSchemaHash: decoded.ok ? traitSchemaHashArtConfigV1(decoded.config) : null,
  });
}

const corpus = {
  note: "ACV1 conformance corpus. Every vector carries its preimage so the JavaScript and Solidity implementations each compute the result independently; neither reads the other's answer. Regenerate with fixtures/acv1/build.mjs.",
  authority: "launchpad/src/art/ArtConfigV1.sol (decoder) + ArtConfigV1Encoder.sol (encoder)",
  acv1Version: ACV1_VERSION,
  errorCodes: ACV1_ERROR_CODES,
  vectorCount: vectors.length,
  vectors,
};

mkdirSync(HERE, { recursive: true });
writeFileSync(join(HERE, "vectors.json"), stableJsonText(corpus));

const negatives = vectors.filter((v) => v.code !== 0).length;
console.log(`acv1: ${vectors.length} vectors (${vectors.length - negatives} valid, ${negatives} refused)`);
