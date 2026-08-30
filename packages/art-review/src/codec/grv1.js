// SPDX-License-Identifier: MIT
// ================================================================================================
// THE `GRV1` CODEC — GEOMETRIC_RECURSION_V1's creator configuration, symbolic <-> bytes.
//
// BYTE LAYOUT, transcribed from `RecursionConfigV1.sol` (big-endian, counts inclusive):
//
//     0   4   magic          0x47525631 ("GRV1")
//     4   1   version        == 2
//     5   1   flags          bit0 ANIMATE, bit1 DEPTH_PALETTE, bit2 OUTLINE; rest MUST be 0
//     6   1   groundMode     0 FLAT | 1 LINEAR | 2 RADIAL | 3 BANDED
//     7   1   groundIx       < paletteCount
//     8   1   groundIx2      < paletteCount
//     9   1   paletteCount P 2..10
//    10   3P  palette        P x RGB triples
//     .   1   ruleCount R    1..3
//     .  15R  rules          byte 14 of each is RESERVED and MUST be 0
//     .   1   traitCount T   0..8
//     .   ..  traits         T x { nameLen 1..24, name, source, style }
//     .   1   titleLen       0..32
//     .   ..  title
//     .   1   terminator     == 0xFF
//     .   *   appendix       opaque, committed, NOT interpreted
//
// ONE RULE RECORD, 15 BYTES:
//     0 shapeSet (6-bit mask, non-zero) · 1 ruleSet (6-bit mask, non-zero) · 2 paletteIx
//     3 sensor · 4 curve · 5 drive · 6 depthMin · 7 depthMax · 8 branch · 9 contraction
//    10 rotation · 11 prune · 12 packed(bits 0-5 symSet mask, bit 6 stroke, bit 7 zero)
//    13 variant 0..7 · 14 reserved 0
//
// WHY VERSION 2 IS WRITTEN AS A SYMBOL AND NOT A LITERAL. Under version 1 a rule was 14 bytes and
// three of these fields were VALUES rather than SETS. A decoder cannot tell the two layouts apart
// from the bytes and the failure is not a parse error — it is a different picture. Every legal
// version-1 shape value 1..5 is also a legal set mask.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO: validate. There is no node budget here, no render-unit
// arithmetic, no palette-index bound. Those live in the deployed runtime and are read back through
// `validateConfigV1`. Reimplementing them would produce a second opinion that agrees until it does
// not, and the day it does not is the day a creator reviews art the chain will refuse.
// ================================================================================================
import {
  CURVES, GROUND_MODES, RECURSION_DRIVES, RECURSION_FLAGS, RECURSION_RULES, RECURSION_SHAPES,
  SENSORS, SYMMETRIES, TRAIT_STYLES,
  flagNames, flagsOf, hexOf, indexOf, maskOf, namesOf, rgbOf,
} from "./vocab.js";

export const GRV1_MAGIC = [0x47, 0x52, 0x56, 0x31];
export const GRV1_VERSION = 2;
export const GRV1_TERMINATOR = 0xff;
export const GRV1_RULE_BYTES = 15;

const u8 = (v, what, lo = 0, hi = 255) => {
  if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${what}: ${v} is not an integer in ${lo}..${hi}`);
  return v;
};

/** Symbolic configuration -> the exact bytes the chain will be handed. */
export function encodeGrv1(cfg) {
  const out = [...GRV1_MAGIC, GRV1_VERSION];
  out.push(flagsOf(RECURSION_FLAGS, cfg.flags, "grv1.flags"));
  out.push(indexOf(GROUND_MODES, cfg.groundMode ?? "FLAT", "grv1.groundMode"));
  out.push(u8(cfg.groundIx ?? 0, "grv1.groundIx"));
  out.push(u8(cfg.groundIx2 ?? 0, "grv1.groundIx2"));

  const palette = cfg.palette ?? [];
  out.push(u8(palette.length, "grv1.paletteCount", 2, 10));
  for (const c of palette) out.push(...rgbOf(c, "grv1.palette"));

  const rules = cfg.rules ?? [];
  out.push(u8(rules.length, "grv1.ruleCount", 1, 3));
  for (const [i, r] of rules.entries()) {
    const at = `grv1.rules[${i}]`;
    const symSet = maskOf(SYMMETRIES, r.symSet, `${at}.symSet`);
    if ((symSet & 0xc0) !== 0) throw new Error(`${at}.symSet: bits 6-7 are reserved and must be zero`);
    out.push(
      maskOf(RECURSION_SHAPES, r.shapeSet, `${at}.shapeSet`),
      maskOf(RECURSION_RULES, r.ruleSet, `${at}.ruleSet`),
      u8(r.paletteIx, `${at}.paletteIx`),
      indexOf(SENSORS, r.sensor, `${at}.sensor`),
      indexOf(CURVES, r.curve, `${at}.curve`),
      indexOf(RECURSION_DRIVES, r.drive, `${at}.drive`),
      u8(r.depthMin, `${at}.depthMin`),
      u8(r.depthMax, `${at}.depthMax`),
      u8(r.branch, `${at}.branch`, 1, 4),
      u8(r.contraction, `${at}.contraction`, 20, 90),
      u8(r.rotation, `${at}.rotation`, 0, 90),
      u8(r.prune, `${at}.prune`, 1, 15),
      (symSet & 0x3f) | (r.stroke ? 0x40 : 0),
      u8(r.variant ?? 0, `${at}.variant`, 0, 7),
      0, // reserved — REFUSED by the runtime if non-zero, never ignored
    );
  }

  const traits = cfg.traits ?? [];
  out.push(u8(traits.length, "grv1.traitCount", 0, 8));
  for (const [i, t] of traits.entries()) {
    const name = Buffer.from(String(t.name), "utf8");
    u8(name.length, `grv1.traits[${i}].name length`, 1, 24);
    out.push(name.length, ...name, indexOf(SENSORS, t.source, `grv1.traits[${i}].source`), indexOf(TRAIT_STYLES, t.style, `grv1.traits[${i}].style`));
  }

  const title = Buffer.from(String(cfg.title ?? ""), "utf8");
  u8(title.length, "grv1.title length", 0, 32);
  out.push(title.length, ...title, GRV1_TERMINATOR);

  const appendix = cfg.appendix ? Buffer.from(String(cfg.appendix).replace(/^0x/, ""), "hex") : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(out), appendix]);
}

/** Bytes -> symbolic configuration. Throws on anything it cannot name; never guesses. */
export function decodeGrv1(bytes) {
  const d = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes).replace(/^0x/, ""), "hex");
  for (let i = 0; i < 4; i++) if (d[i] !== GRV1_MAGIC[i]) throw new Error("grv1: bytes 0..3 are not the GRV1 magic");
  if (d[4] !== GRV1_VERSION) throw new Error(`grv1: version ${d[4]}, expected ${GRV1_VERSION}`);

  let o = 5;
  const flags = d[o++];
  const groundMode = GROUND_MODES[d[o++]];
  const groundIx = d[o++];
  const groundIx2 = d[o++];
  const paletteCount = d[o++];
  const palette = [];
  for (let i = 0; i < paletteCount; i++, o += 3) palette.push(hexOf([d[o], d[o + 1], d[o + 2]]));

  const ruleCount = d[o++];
  const rules = [];
  for (let i = 0; i < ruleCount; i++) {
    const b = d.subarray(o, o + GRV1_RULE_BYTES);
    rules.push({
      shapeSet: namesOf(RECURSION_SHAPES, b[0]),
      ruleSet: namesOf(RECURSION_RULES, b[1]),
      paletteIx: b[2],
      sensor: SENSORS[b[3]],
      curve: CURVES[b[4]],
      drive: RECURSION_DRIVES[b[5]],
      depthMin: b[6], depthMax: b[7], branch: b[8], contraction: b[9], rotation: b[10], prune: b[11],
      symSet: namesOf(SYMMETRIES, b[12] & 0x3f),
      stroke: (b[12] & 0x40) !== 0,
      variant: b[13],
    });
    o += GRV1_RULE_BYTES;
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
  if (d[o] !== GRV1_TERMINATOR) throw new Error(`grv1: byte ${o} is 0x${(d[o] ?? 0).toString(16)}, not the 0xFF terminator`);
  const appendix = d.subarray(o + 1);

  return {
    version: GRV1_VERSION,
    flags: flagNames(RECURSION_FLAGS, flags),
    groundMode, groundIx, groundIx2, palette, rules, traits, title,
    ...(appendix.length > 0 ? { appendix: appendix.toString("hex") } : {}),
  };
}
