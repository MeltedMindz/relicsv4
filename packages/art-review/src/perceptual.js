// SPDX-License-Identifier: MIT
// ================================================================================================
// PIXEL MEASUREMENTS — the numbers that SUPPLEMENT the looking and never replace it.
//
// Read the warning in `raster.js` before trusting anything in this file. Every one of these
// quantities has, at some point in this program, produced a confident wrong answer: a delta-E
// ranking put a rejected template above three shipped ones, and an occupancy statistic ranked seed
// diversity backwards. They are kept because they catch a different class of defect than a person
// does — a field that draws nothing, a seed population with a duplicate, a state change that is
// literally zero pixels — and they are kept SUBORDINATE because the class they miss is the class
// that matters most.
//
// THE MEASUREMENT SIZE IS 120px AND IT IS NOT NEGOTIABLE. It is the browse size, it is the size
// the published perceptual census (`packages/template-catalog/measurements/STATE-DISTINCTION.json`)
// was computed at, and a delta-E measured at any other size is not comparable with the floor that
// census calibrated. Measuring at 512 and comparing against a 120px floor is a category error that
// reads as a pass.
//
// CIE76, DELIBERATELY. Not CIEDE2000. The published floor was calibrated against CIE76 on this
// exact pipeline; swapping in a better metric would silently move every historical number.
// ================================================================================================
import { createRequire } from "node:module";
import { rasterize } from "./raster.js";

/** The measurement raster. The browse size, and the size every published figure was taken at. */
export const MEASURE_PX = 120;

/**
 * The mean-CIE76 floor two market states must clear to count as perceptually separated.
 *
 * 3.8 IS NOT A ROUND NUMBER SOMEBODY LIKED. It is the published Wave-1 calibration: the midpoint
 * between the highest pairing a blind reviewer called dead (3.576) and the lowest one the same
 * reviewer called strong (3.998), with zero overlap between the two populations. It is carried
 * here so a project's own state separation is comparable with the census the catalog publishes.
 */
export const STATE_SEPARATION_FLOOR = 3.8;

function sharp() {
  return createRequire(import.meta.url)("sharp");
}

/** An SVG document -> raw RGB bytes at the measurement raster. */
export async function rgbPlane(svg, px = MEASURE_PX) {
  const png = await rasterize(svg, px);
  const { data, info } = await sharp()(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const f = (t) => (t > 0.008856451679035631 ? Math.cbrt(t) : t / 0.12841854934601665 + 4 / 29);

/** sRGB byte triple -> CIE L*a*b* under D65. */
export function rgbToLab(r, g, b) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * A separable 3x3 box blur over a Lab plane.
 *
 * THE PUBLISHED CENSUS BLURS BEFORE COMPARING and this pipeline must too, or its numbers are not
 * comparable with `packages/template-catalog/measurements/STATE-DISTINCTION.json` and the 3.8
 * floor calibrated against it means nothing here. The blur is what stops a one-pixel stroke
 * shifting by a pixel from reading as a whole-frame change.
 */
export function blur1(plane) {
  const { lab, width, height } = plane;
  const tmp = new Float64Array(lab.length);
  const out = new Float64Array(lab.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      const l = (y * width + Math.max(0, x - 1)) * 3;
      const r = (y * width + Math.min(width - 1, x + 1)) * 3;
      for (let c = 0; c < 3; c++) tmp[p + c] = (lab[l + c] + lab[p + c] + lab[r + c]) / 3;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      const u = (Math.max(0, y - 1) * width + x) * 3;
      const d = (Math.min(height - 1, y + 1) * width + x) * 3;
      for (let c = 0; c < 3; c++) out[p + c] = (tmp[u + c] + tmp[p + c] + tmp[d + c]) / 3;
    }
  }
  return { lab: out, width, height };
}

/** Raw RGB -> a flat Lab plane, one triple per pixel. */
export function labPlane({ data, width, height }) {
  const out = new Float64Array(width * height * 3);
  for (let i = 0, p = 0; i < data.length; i += 3, p += 3) {
    const [L, a, b] = rgbToLab(data[i], data[i + 1], data[i + 2]);
    out[p] = L; out[p + 1] = a; out[p + 2] = b;
  }
  return { lab: out, width, height };
}

/** Mean CIE76 delta-E per pixel between two planes of the same size. */
export function meanDeltaE(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error("meanDeltaE: planes of different sizes are not comparable");
  let sum = 0;
  const n = a.width * a.height;
  for (let p = 0; p < n * 3; p += 3) {
    sum += Math.hypot(a.lab[p] - b.lab[p], a.lab[p + 1] - b.lab[p + 1], a.lab[p + 2] - b.lab[p + 2]);
  }
  return sum / n;
}

/**
 * The modal quantised colour — the GROUND the drawing sits on.
 *
 * Quantised coarsely on purpose: a gradient ground is not one colour and a mode over exact values
 * would find a single pixel. The bucket is what makes "the background" a thing that exists.
 */
export function ground({ lab, width, height }) {
  const bins = new Map();
  for (let p = 0; p < width * height * 3; p += 3) {
    const k = `${Math.round(lab[p] / 6)}|${Math.round(lab[p + 1] / 6)}|${Math.round(lab[p + 2] / 6)}`;
    const cur = bins.get(k);
    if (cur) { cur.n++; cur.L += lab[p]; cur.a += lab[p + 1]; cur.b += lab[p + 2]; }
    else bins.set(k, { n: 1, L: lab[p], a: lab[p + 1], b: lab[p + 2] });
  }
  let best = null;
  for (const v of bins.values()) if (!best || v.n > best.n) best = v;
  return [best.L / best.n, best.a / best.n, best.b / best.n];
}

/**
 * The fraction of pixels that are further than `threshold` dE from the ground — how much of the
 * frame is DRAWING rather than background.
 *
 * A blank is not "all one colour". A frame carrying a ground gradient and nothing else is 100%
 * non-uniform and 0% ink, and that is exactly the failure this catches.
 *
 * THIS NUMBER IS NOT THE CENSUS'S `ink` AND MUST NEVER BE COMPARED WITH IT. Measured 2026-08-30:
 * this pipeline reads 0.513 for compass where `STATE-DISTINCTION.json` publishes 0.495, and 0.407
 * for alluvium against its 0.385. The delta-E figures DO reproduce the census exactly, to three
 * decimals, because a difference cancels whatever bias a rasteriser introduces; an absolute
 * coverage fraction does not, and this package rasterises with a different tool than the census
 * did. So ink is used ONLY against this package's own floor, calibrated on this pipeline, and any
 * sentence putting the two numbers side by side is comparing two different measurements.
 */
/** A creator palette entry, in the same Lab space the planes are measured in. */
export function labOfHex(hex) {
  const n = parseInt(String(hex).replace(/^#/, ""), 16);
  return rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/**
 * THE MODAL GROUND CANNOT TELL AN EMPTY FRAME FROM A FULL ONE, AND THAT COST A MEASUREMENT.
 *
 * `ground()` takes the most common quantised colour and calls it the background. On a frame where
 * the drawing covers more than half the canvas the mode IS the drawing, so the coverage fraction
 * measures the REMAINDER and a saturated frame reports 0.0% ink — indistinguishable from a blank
 * one, and reported by BLANK_DETECTION as blank. Measured: a recursion configuration whose
 * rotational replicas filled the frame came back at 0.000 on a collection-sweep neutral frame that
 * is the opposite of empty.
 *
 * When the caller knows the configuration it knows the ground: `palette[groundIx]`. Passing it
 * makes this the fraction of the frame that is not the declared background, which is what the
 * number was always supposed to mean. The modal estimate stays as the fallback for callers that
 * have a picture and no configuration.
 */
export function inkCoverage(plane, threshold = 8, groundLab = null) {
  const g = groundLab ?? ground(plane);
  const { lab, width, height } = plane;
  let n = 0;
  for (let p = 0; p < width * height * 3; p += 3) {
    if (Math.hypot(lab[p] - g[0], lab[p + 1] - g[1], lab[p + 2] - g[2]) >= threshold) n++;
  }
  return n / (width * height);
}

/**
 * An SVG straight to its measured plane — rasterise, Lab, blur. The one entry point callers use.
 *
 * The blur is INSIDE this function rather than left to the caller, because a caller that forgets
 * it gets numbers that look right, sit in the same range, and are not comparable with any
 * published figure. That is the shape of every measurement mistake recorded in this package.
 */
export async function planeOf(svg, px = MEASURE_PX) {
  return blur1(labPlane(await rgbPlane(svg, px)));
}
