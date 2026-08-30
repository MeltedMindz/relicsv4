// SPDX-License-Identifier: MIT
// ================================================================================================
// THE `VCV1` CODEC — VECTOR_COMPOSITION_V1's creator configuration, symbolic <-> bytes.
//
// BYTE LAYOUT, transcribed from `VectorConfigV1.sol` (big-endian, counts inclusive):
//
//     0   4   magic          0x56435631 ("VCV1")
//     4   1   version        == 1
//     5   1   flags          bit0 ANIMATE, bit1 PALETTE_SHIFT, bit2 OUTLINE; rest MUST be 0
//     6   1   groundMode     0 FLAT | 1 LINEAR | 2 RADIAL | 3 BANDED
//     7   1   groundIx       < paletteCount
//     8   1   groundIx2      < paletteCount (read in EVERY mode, not only the gradients)
//     9   1   paletteCount P 2..10
//    10   3P  palette        P x RGB triples
//     .   1   fieldCount F   1..6
//     .  12F  fields         byte 11 of each is RESERVED and MUST be 0
//     .   1   traitCount T   0..8
//     .   ..  traits         T x { nameLen 1..24, name, source, style }
//     .   1   titleLen       0..32
//     .   ..  title
//     .   1   terminator     == 0xFF
//     .   *   appendix       opaque, committed, NOT interpreted
//
// ONE FIELD RECORD, 12 BYTES:
//     0 layout · 1 primitive · 2 paletteIx · 3 sensor · 4 curve · 5 drive
//     6 countMin · 7 countMax · 8 sizeMax · 9 spreadMax
//    10 packed(bits 0-2 symmetry, bits 3-5 variant, bit 6 stroke, bit 7 zero) · 11 reserved 0
//
// THE SAME NON-VALIDATION RULE AS `grv1.js`: this file produces bytes and names them back. The
// site count, the total-site ceiling and the render-unit budget are the deployed runtime's to
// enforce, and `validateConfigV1` is asked before anything is rendered or shown to anyone.
// ================================================================================================
import {
  CURVES, GROUND_MODES, SENSORS, SYMMETRIES, TRAIT_STYLES,
  VECTOR_DRIVES, VECTOR_FLAGS, VECTOR_LAYOUTS, VECTOR_PRIMITIVES,
  flagNames, flagsOf, hexOf, indexOf, rgbOf,
} from "./vocab.js";

export const VCV1_MAGIC = [0x56, 0x43, 0x56, 0x31];
export const VCV1_VERSION = 1;
export const VCV1_TERMINATOR = 0xff;
export const VCV1_FIELD_BYTES = 12;

const u8 = (v, what, lo = 0, hi = 255) => {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${what}: ${v} is not an integer in ${lo}..${hi}`);
  return v;
};

/** Symbolic configuration -> the exact bytes the chain will be handed. */
export function encodeVcv1(cfg) {
  const out = [...VCV1_MAGIC, VCV1_VERSION];
  out.push(flagsOf(VECTOR_FLAGS, cfg.flags, "vcv1.flags"));
  out.push(indexOf(GROUND_MODES, cfg.groundMode ?? "FLAT", "vcv1.groundMode"));
  out.push(u8(cfg.groundIx ?? 0, "vcv1.groundIx"));
  out.push(u8(cfg.groundIx2 ?? 0, "vcv1.groundIx2"));

  const palette = cfg.palette ?? [];
  out.push(u8(palette.length, "vcv1.paletteCount", 2, 10));
  for (const c of palette) out.push(...rgbOf(c, "vcv1.palette"));

  const fields = cfg.fields ?? [];
  out.push(u8(fields.length, "vcv1.fieldCount", 1, 6));
  for (const [i, f] of fields.entries()) {
    const at = `vcv1.fields[${i}]`;
    const sym = indexOf(SYMMETRIES, f.symmetry ?? "NONE", `${at}.symmetry`);
    const variant = u8(f.variant ?? 0, `${at}.variant`, 0, 7);
    out.push(
      indexOf(VECTOR_LAYOUTS, f.layout, `${at}.layout`),
      indexOf(VECTOR_PRIMITIVES, f.primitive, `${at}.primitive`),
      u8(f.paletteIx, `${at}.paletteIx`),
      indexOf(SENSORS, f.sensor, `${at}.sensor`),
      indexOf(CURVES, f.curve, `${at}.curve`),
      indexOf(VECTOR_DRIVES, f.drive, `${at}.drive`),
      u8(f.countMin, `${at}.countMin`),
      u8(f.countMax, `${at}.countMax`),
      u8(f.sizeMax, `${at}.sizeMax`, 2, 64),
      u8(f.spreadMax, `${at}.spreadMax`, 16, 128),
      (sym & 0x07) | ((variant & 0x07) << 3) | (f.stroke ? 0x40 : 0),
      0, // reserved — REFUSED by the runtime if non-zero, never ignored
    );
  }

  const traits = cfg.traits ?? [];
  out.push(u8(traits.length, "vcv1.traitCount", 0, 8));
  for (const [i, t] of traits.entries()) {
    const name = Buffer.from(String(t.name), "utf8");
    u8(name.length, `vcv1.traits[${i}].name length`, 1, 24);
    out.push(name.length, ...name, indexOf(SENSORS, t.source, `vcv1.traits[${i}].source`), indexOf(TRAIT_STYLES, t.style, `vcv1.traits[${i}].style`));
  }

  const title = Buffer.from(String(cfg.title ?? ""), "utf8");
  u8(title.length, "vcv1.title length", 0, 32);
  out.push(title.length, ...title, VCV1_TERMINATOR);

  const appendix = cfg.appendix ? Buffer.from(String(cfg.appendix).replace(/^0x/, ""), "hex") : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(out), appendix]);
}

/** Bytes -> symbolic configuration. Throws on anything it cannot name; never guesses. */
export function decodeVcv1(bytes) {
  const d = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes).replace(/^0x/, ""), "hex");
  for (let i = 0; i < 4; i++) if (d[i] !== VCV1_MAGIC[i]) throw new Error("vcv1: bytes 0..3 are not the VCV1 magic");
  if (d[4] !== VCV1_VERSION) throw new Error(`vcv1: version ${d[4]}, expected ${VCV1_VERSION}`);

  let o = 5;
  const flags = d[o++];
  const groundMode = GROUND_MODES[d[o++]];
  const groundIx = d[o++];
  const groundIx2 = d[o++];
  const paletteCount = d[o++];
  const palette = [];
  for (let i = 0; i < paletteCount; i++, o += 3) palette.push(hexOf([d[o], d[o + 1], d[o + 2]]));

  const fieldCount = d[o++];
  const fields = [];
  for (let i = 0; i < fieldCount; i++) {
    const b = d.subarray(o, o + VCV1_FIELD_BYTES);
    fields.push({
      layout: VECTOR_LAYOUTS[b[0]],
      primitive: VECTOR_PRIMITIVES[b[1]],
      paletteIx: b[2],
      sensor: SENSORS[b[3]],
      curve: CURVES[b[4]],
      drive: VECTOR_DRIVES[b[5]],
      countMin: b[6], countMax: b[7], sizeMax: b[8], spreadMax: b[9],
      symmetry: SYMMETRIES[b[10] & 0x07],
      variant: (b[10] >> 3) & 0x07,
      stroke: (b[10] & 0x40) !== 0,
    });
    o += VCV1_FIELD_BYTES;
  }

  const traitCount = d[o++];
  const traits = [];
  for (let i = 0; i < traitCount; i++) {
    const len = d[o++];
    traits.push({ name: d.subarray(o, o + len).toString("utf8"), source: SENSORS[d[o + len]], style: TRAIT_STYLES[d[o + len + 1]] });
    o += len + 2;
  }

  const titleLen = d[o++];
  const title = d.subarray(o, o + titleLen).toString("utf8");
  o += titleLen;
  if (d[o] !== VCV1_TERMINATOR) throw new Error(`vcv1: byte ${o} is 0x${(d[o] ?? 0).toString(16)}, not the 0xFF terminator`);
  const appendix = d.subarray(o + 1);

  return {
    version: VCV1_VERSION,
    flags: flagNames(VECTOR_FLAGS, flags),
    groundMode, groundIx, groundIx2, palette, fields, traits, title,
    ...(appendix.length > 0 ? { appendix: appendix.toString("hex") } : {}),
  };
}
