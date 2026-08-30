// SPDX-License-Identifier: MIT
// ================================================================================================
// SVG -> PNG, AND PNG -> SHEETS. The step without which "visual review" is a figure of speech.
//
// EVERY VERDICT THIS PROJECT HAS EVER GOT WRONG WAS GOT WRONG BY NOT LOOKING. An occupancy bitmap
// ranked seed diversity backwards; a template mean of 4.85 hid two structurally dead fields;
// byte-distinct renders turned out to be visually identical; pixelwise delta-E ranked a rejected
// template above three shipped ones. In all four the numbers were computed correctly and the
// conclusion was wrong, and in all four a person looking at a contact sheet got it right in
// seconds. This module exists so the looking can actually happen.
//
// THUMBNAIL SCALE IS WHERE THE VERDICTS WERE ACTUALLY DECIDED. Full-size renders hid failures that
// 120px exposed — a frame topologically identical on every seed reads as variety at 512px and as
// one repeated stamp at 120px, which is the size a collection is browsed at. `THUMB_PX` is
// therefore not a convenience preview: it is the sheet with the highest hit rate, and it is
// produced at TRUE 120px with no upscaling anywhere in the path.
//
// RASTERISATION IS FAIL-CLOSED. If `sharp` is unavailable this module REFUSES with
// `RASTER_UNAVAILABLE` and the loop stops. It never falls back to shipping SVG text to a reviewer
// and calling that a visual review: SVG source is exactly the "not an image" input this whole
// exercise exists to stop being reviewed.
// ================================================================================================
import { createRequire } from "node:module";

/** The browse size. Not a preview convenience — the sheet that catches the most. */
export const THUMB_PX = 120;
/** The reading size for a contact sheet: big enough to see composition, small enough to tile. */
export const CONTACT_PX = 256;
/** The size a single render is inspected at when the question is detail rather than pattern. */
export const SINGLE_PX = 512;
/** The paper. Dark, because these runtimes draw a ground and a white page would fake a frame. */
export const SHEET_BACKGROUND = "#111111";

let sharpModule;
let sharpError = null;

function sharp() {
  if (sharpModule) return sharpModule;
  if (sharpError) throw sharpError;
  try {
    const require = createRequire(import.meta.url);
    sharpModule = require("sharp");
    return sharpModule;
  } catch (err) {
    sharpError = new Error(
      `RASTER_UNAVAILABLE: the SVG rasteriser (sharp) could not be loaded — ${err.message}. ` +
        "The visual review will not proceed without it. There is deliberately no fallback that " +
        "hands SVG source to a reviewer and records the result as a visual review: reading markup " +
        "is the failure mode this loop exists to replace, and a review conducted on it would carry " +
        "the same authority as one conducted on pictures while being worth nothing. " +
        "Install it with `npm install` at the repository root.",
    );
    throw sharpError;
  }
}

/** Whether a review can be conducted on this machine at all. Reported, never silently worked around. */
export function rasterAvailable() {
  try {
    sharp();
    return { available: true, detail: "sharp is loadable" };
  } catch (err) {
    return { available: false, detail: err.message };
  }
}

/**
 * One SVG document -> one square PNG at exactly `px`.
 *
 * `density` is set well above the default because these documents carry a viewBox in user units
 * and a low-density rasterisation of a 512-unit drawing to 512 pixels loses the hairlines that
 * several of these primitives are made of — LINE, POLYLINE, ARC, QUAD and CUBIC have no interior
 * and exist entirely as stroke.
 */
export async function rasterize(svg, px) {
  if (typeof svg !== "string" || !svg.trimStart().startsWith("<svg")) {
    throw new Error("rasterize: this is not an SVG document. If it starts with `data:` it is still a URI and must be decoded first.");
  }
  return sharp()(Buffer.from(svg, "utf8"), { density: 384 })
    .resize(px, px, { fit: "contain", background: SHEET_BACKGROUND })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function labelSvg(text, width, height, fontPx) {
  const safe = String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="${SHEET_BACKGROUND}"/>` +
    `<text x="4" y="${Math.round(height * 0.74)}" font-family="monospace" font-size="${fontPx}" fill="#8a8a8a">${safe}</text></svg>`;
}

/**
 * A grid of rendered cells, optionally captioned.
 *
 * CAPTIONS CARRY THE SEED AND THE MARKET STATE AND NOTHING ELSE. A reviewer needs to know which
 * frame is the drawdown one — a claim about fracture under drawdown cannot be checked without it —
 * and needs nothing else written on the picture. What is deliberately NOT on a sheet: the
 * template's name, the author's intent, any measurement, any prior verdict. See `packet.js`.
 */
export async function grid(cells, { px, cols, gap = 4, caption = true, captionPx = 10 }) {
  if (!Array.isArray(cells) || cells.length === 0) throw new Error("grid: nothing to draw. A sheet of nothing is not a sheet.");
  const capH = caption ? Math.max(12, Math.round(captionPx * 1.5)) : 0;
  const rows = Math.ceil(cells.length / cols);
  const cellW = px + gap;
  const cellH = px + capH + gap;
  const width = cols * cellW + gap;
  const height = rows * cellH + gap;

  const composites = [];
  for (const [i, cell] of cells.entries()) {
    const cx = gap + (i % cols) * cellW;
    const cy = gap + Math.floor(i / cols) * cellH;
    composites.push({ input: await rasterize(cell.svg, px), left: cx, top: cy });
    if (caption) {
      const png = await sharp()(Buffer.from(labelSvg(cell.label, px, capH, captionPx), "utf8")).png().toBuffer();
      composites.push({ input: png, left: cx, top: cy + px });
    }
  }

  return sharp()({ create: { width, height, channels: 3, background: SHEET_BACKGROUND } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** `records` are what `renderMany` returned. The caption is `seed/state`. */
export function cellsOf(records) {
  return records.map((r) => ({ svg: r.svg, label: `${r.seed} ${r.state}` }));
}
