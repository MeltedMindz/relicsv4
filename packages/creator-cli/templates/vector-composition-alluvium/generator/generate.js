// SPDX-License-Identifier: MIT
//
// VECTOR_COMPOSITION_V1 — a LOCAL PREVIEW, not the renderer.
//
// This project's art is drawn on chain by VECTOR_COMPOSITION_V1 from the VCV1 configuration in
// generator/params.json: a palette, a ground, and a set of FIELDS, each a layout of one primitive
// composed into one plate. The bundle carries that configuration; the runtime carries the code. A
// bundle never carries contract code — there is no manifest field for it and no file type that
// could hold it.
//
// So what is this file? A sketch. It draws roughly what the configuration means, so values can be
// chosen with the eyes rather than a spreadsheet. It is NOT the renderer, it is not submitted as
// art, and it does not match the on-chain output pixel for pixel.
//
// WHICH FILE IS THE ART. generator/params.json. Change it and both the launch and this preview
// change. Change this file and nothing about the launched collection moves.
//
// WHAT KEEPS THE TWO IN STEP. `relics validate` and `relics export` compare the object below
// against generator/params.json field by field, over the keys they SHARE, and refuse on any
// disagreement (ART_PREVIEW_DRIFT). params.json wins every comparison: it is the art. Keep the
// mirrored values in one `const CONFIG = { … }` object literal or the comparison cannot run, and
// validate says so (ART_PREVIEW_UNCHECKED) rather than passing quietly.
const CONFIG = {
  title: "Alluvium",
  groundMode: "LINEAR",
  groundIx: 0,
  palette: ["#0b0c10", "#8c6a3f", "#d8cbb0", "#3f5a63", "#161a20", "#a33b24"],
  fields: [
    { layout: "STACK", primitive: "RECT", paletteIx: 1, sensor: "DRAWDOWN", curve: "LINEAR", drive: "COUNT", countMin: 8, countMax: 34, sizeMax: 20, spreadMax: 122 },
    { layout: "LINEFIELD", primitive: "LINE", paletteIx: 2, sensor: "RECOVERY", curve: "LOG2", drive: "COUNT", countMin: 9, countMax: 28, sizeMax: 20, spreadMax: 118 },
    { layout: "ORBIT", primitive: "ARC", paletteIx: 5, sensor: "STRESS", curve: "LINEAR", drive: "DEPTH", countMin: 26, countMax: 26, sizeMax: 16, spreadMax: 110 },
  ],
};

function sensorValue(sensor, market, random) {
  const named = {
    DRAWDOWN: market.fracture,
    RECOVERY: market.density,
    STRESS: market.distortion,
    VOLATILITY: market.distortion,
  }[sensor];
  return typeof named === "number" ? clamp01(named) : random.next();
}

function curve(kind, t) {
  if (kind === "LOG2") return Math.log2(1 + clamp01(t));
  if (kind === "EASE") return clamp01(t) * clamp01(t) * (3 - 2 * clamp01(t));
  if (kind === "STEP") return Math.floor(clamp01(t) * 4) / 4;
  return clamp01(t);
}

export const manifest = {
  title: "Vector composition (preview)",
  description: "Local sketch of the VCV1 configuration this project launches with.",
};

export function render(context) {
  const { random, market, size } = context;
  const ground = CONFIG.palette[CONFIG.groundIx];
  const centre = size / 2;
  let body = `<rect width="${size}" height="${size}" fill="${ground}"/>`;

  for (const field of CONFIG.fields) {
    const magnitude = curve(field.curve, sensorValue(field.sensor, market, random));
    const count = Math.max(1, Math.round(field.countMin + (field.countMax - field.countMin) * magnitude));
    const ink = CONFIG.palette[field.paletteIx];
    const spread = (size * field.spreadMax) / 255;
    body += `<g>`;

    if (field.layout === "STACK") {
      for (let i = 0; i < count; i++) {
        const y = centre - spread / 2 + (spread * i) / count;
        const w = spread * random.float(0.4, 1);
        body += `<rect x="${r(centre - w / 2)}" y="${r(y)}" width="${r(w)}" height="${r((size * field.sizeMax) / 255 / 3)}" fill="${ink}" fill-opacity="0.72"/>`;
      }
    } else if (field.layout === "LINEFIELD") {
      for (let i = 0; i < count; i++) {
        const y = centre - spread / 2 + (spread * i) / count;
        body += `<line x1="${r(centre - spread / 2)}" y1="${r(y)}" x2="${r(centre + spread / 2)}" y2="${r(y)}" stroke="${ink}" stroke-width="1.5" stroke-opacity="0.6"/>`;
      }
    } else {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const radius = spread / 2;
        body += `<circle cx="${r(centre + Math.cos(angle) * radius)}" cy="${r(centre + Math.sin(angle) * radius)}" r="${r((size * field.sizeMax) / 255 / 4)}" fill="${ink}" fill-opacity="0.8"/>`;
      }
    }
    body += `</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
}

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function r(n) {
  return Math.round(n * 100) / 100;
}
