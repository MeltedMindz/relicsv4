// SPDX-License-Identifier: MIT
// The two ACV1 commitments the RUNTIME computes from a decoded configuration, reproduced off chain.
//
// `artConfigHash` (in art-config-v1.js) is keccak256 over raw transmitted bytes and needs no ABI
// encoder. These two do: they are keccak256 over `abi.encode(...)` of the DECODED struct, which is
// the padded encoding, NOT `encodePacked`. Getting that distinction wrong produces a digest that
// looks right and matches nothing.
//
//   visualHash      = keccak256(abi.encode(uint8(1), flags, bgPaletteIx, palette, layers))
//   traitSchemaHash = keccak256(abi.encode(uint8(1), traits))
//
// WHY THE KIT COMPUTES THEM AT ALL. `traitSchemaHash` is what `validateConfigV1` returns and what
// `ProjectCollection.bindArt` stores. Reproducing it here means the creator kit can print, before a
// launch exists, the exact value the collection will hold afterwards — and any divergence becomes a
// test failure instead of a surprise at launch time. `visualHash` is its partner over the half of
// the configuration that decides the image.
//
// The leading `1` in both is the VERSION CONSTANT, not a value read from the document. A document
// claiming a different version never decodes, so there is no case where the two differ.

import { keccak256Hex } from "./keccak256.js";
import { ACV1_VERSION, ACV1_LAYER_KINDS, ACV1_SENSORS, ACV1_CURVES, ACV1_TRAIT_SOURCES, ACV1_TRAIT_STYLES, ACV1_FLAGS } from "./art-config-v1.js";

const WORD = 32;

/**
 * `visualHash` — the commitment over everything that decides what the image looks like: flags,
 * background, palette and the layer graph. Excludes traits and title.
 * @param {any} config a decoded ACV1 configuration
 */
export function visualHashArtConfigV1(config) {
  const flags = flagsOf(config);
  const palette = config.palette.map(colorInt);
  const layers = config.layers.map(layerWords);

  // (uint8, uint8, uint8, uint24[], ArtLayerV1[]) — three static heads then two dynamic offsets.
  const head = [];
  const paletteBlock = arrayOfStatic(palette.map((c) => [c]));
  const layersBlock = arrayOfStatic(layers);
  const headBytes = 5 * WORD;

  head.push(word(ACV1_VERSION), word(flags), word(config.background));
  head.push(word(headBytes));
  head.push(word(headBytes + paletteBlock.length));

  return keccak256Hex(concat([...head, paletteBlock, layersBlock]));
}

/**
 * `traitSchemaHash` — the commitment over the declared trait schema: names, sources and styles.
 * This is the value `validateConfigV1` returns during the atomic launch and the collection stores.
 * @param {any} config a decoded ACV1 configuration
 */
export function traitSchemaHashArtConfigV1(config) {
  const traits = config.traits ?? [];

  // (uint8, ArtTraitV1[]) where ArtTraitV1 = { string name; uint8 source; uint8 style } — a DYNAMIC
  // tuple, so the array body is a table of offsets followed by the tuples themselves.
  const tuples = traits.map((t) => {
    const name = stringBlock(t.name);
    // tuple head is three words: offset-to-string, source, style. The offset is relative to the
    // start of THIS tuple, so it is always 96.
    return concat([word(3 * WORD), word(indexOf(t.source, ACV1_TRAIT_SOURCES, "trait source")), word(indexOf(t.style, ACV1_TRAIT_STYLES, "trait style")), name]);
  });

  const offsets = [];
  let running = tuples.length * WORD;
  for (const tuple of tuples) {
    offsets.push(word(running));
    running += tuple.length;
  }
  const arrayBlock = concat([word(tuples.length), ...offsets, ...tuples]);

  return keccak256Hex(concat([word(ACV1_VERSION), word(2 * WORD), arrayBlock]));
}

/**
 * The runtime's visual/metadata parity commitment, emitted twice per render and compared. Included
 * so the kit can state it too.
 * @param {string} configCommitment bare hex `artConfigHash`
 * @param {string} visualHash bare hex
 * @param {string} traitSchemaHash bare hex
 */
export function runtimeCommitmentArtConfigV1(configCommitment, visualHash, traitSchemaHash) {
  const RUNTIME_TAG = keccak256Hex(utf8("V4ART.RUNTIME.SOLIDITY_SVG_V1"));
  return keccak256Hex(concat([hexWord(RUNTIME_TAG), word(1), hexWord(configCommitment), hexWord(visualHash), hexWord(traitSchemaHash)]));
}

// ---------------------------------------------------------------------------------------------
// a minimal ABI encoder — only the shapes ACV1 needs, nothing more
// ---------------------------------------------------------------------------------------------

function word(value) {
  const out = new Uint8Array(WORD);
  let v = BigInt(value);
  for (let i = WORD - 1; i >= 0 && v > 0n; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function hexWord(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(WORD);
  for (let i = 0; i < WORD; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** A dynamic array of STATIC elements: length word, then every element's words inline. */
function arrayOfStatic(elements) {
  const parts = [word(elements.length)];
  for (const element of elements) for (const value of element) parts.push(word(value));
  return concat(parts);
}

/** An ABI `string`: length word then the UTF-8 bytes, right-padded to a whole word. */
function stringBlock(value) {
  const bytes = utf8(value);
  const padded = new Uint8Array(Math.ceil(bytes.length / WORD) * WORD);
  padded.set(bytes, 0);
  return concat([word(bytes.length), padded]);
}

function concat(parts) {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function utf8(text) {
  return new TextEncoder().encode(text);
}

function flagsOf(config) {
  if (typeof config.flags === "number") return config.flags;
  return config.animate ? ACV1_FLAGS.ANIMATE : 0;
}

function colorInt(value) {
  if (Number.isInteger(value)) return value;
  return parseInt(String(value).replace(/^#/, ""), 16);
}

function layerWords(layer) {
  return [
    indexOf(layer.kind, ACV1_LAYER_KINDS, "layer kind"),
    indexOf(layer.sensor, ACV1_SENSORS, "layer sensor"),
    indexOf(layer.curve, ACV1_CURVES, "layer curve"),
    layer.palette,
    layer.amountMin,
    layer.amountMax,
  ];
}

function indexOf(value, vocabulary, what) {
  if (Number.isInteger(value)) return value;
  const ix = vocabulary.indexOf(value);
  if (ix < 0) throw new Error(`unknown ${what}: ${value}`);
  return ix;
}
