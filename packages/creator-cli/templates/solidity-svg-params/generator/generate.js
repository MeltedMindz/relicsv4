// SPDX-License-Identifier: MIT
//
// SOLIDITY-SVG TEMPLATE — a LOCAL PREVIEW, not the renderer.
//
// This project uses the SOLIDITY_SVG runtime. The art is drawn on chain by a vetted Solidity
// runtime from your ACV1 art configuration in generator/params.json — a palette, a set of layers
// binding market sensors to drawing primitives, a trait schema and a title. The bundle carries that
// configuration; the runtime carries the code. A bundle never carries contract code: there is no
// manifest field for it and no file type that could hold it.
//
// So what is this file? A sketch. It draws roughly what your configuration means, so you can choose
// values with your eyes instead of a spreadsheet. It is not submitted as art, it is not the
// renderer, and it does not match the on-chain output pixel for pixel.
//
// Keeping the two straight matters. The on-chain image is a function of your ACV1 bytes and the
// market. If you change this sketch, nothing about your launched collection changes. If you change
// params.json, BOTH change — that file is the art.

export const manifest = {
  title: "Solidity-SVG art configuration (preview)",
  description: "Local sketch of the ACV1 configuration this project launches with.",
};

// Mirrors generator/params.json. Keep them in step by hand — the preview reads them from here so it
// stays a single, dependency-free file. `relics validate` refuses a bundle whose params.json does
// not encode to the configuration the manifest commits to, so a drift here is caught, not shipped.
const CONFIG = {
  title: "Parameter Study",
  animate: true,
  background: 0,
  palette: ["#0a0a0b", "#ded9d2", "#c9a227", "#b4532a"],
  layers: [
    { kind: "RINGS", sensor: "QUOTE_VOLUME", curve: "LOG2", palette: 2, amountMin: 3, amountMax: 18 },
    { kind: "STRATA", sensor: "DRAWDOWN", curve: "EASE", palette: 1, amountMin: 0, amountMax: 14 },
    { kind: "VEIL", sensor: "STRESS", curve: "LINEAR", palette: 3, amountMin: 1, amountMax: 1 },
  ],
};

// Which market reading drives each sensor in this sketch. On chain the runtime normalises every
// sensor onto one internal scale; here we approximate with the mapped market values the sandbox
// supplies, falling back to the seed so a preview is never blank.
function sensorValue(sensor, market, random) {
  const named = {
    QUOTE_VOLUME: market.density,
    DRAWDOWN: market.fracture,
    STRESS: market.distortion,
    VOLUME_TIER: market.density,
    VOLATILITY: market.distortion,
  }[sensor];
  return typeof named === "number" ? clamp01(named) : random.next();
}

// The four ACV1 response curves, shaping a 0..1 sensor reading into a 0..1 magnitude.
function curve(kind, t) {
  if (kind === "LOG2") return Math.log2(1 + clamp01(t)) ;
  if (kind === "EASE") return t * t * (3 - 2 * clamp01(t));
  if (kind === "STEP") return Math.floor(clamp01(t) * 4) / 4;
  return clamp01(t);
}

export function render(context) {
  const { random, market, size } = context;
  const bg = CONFIG.palette[CONFIG.background];
  const centre = size / 2;
  const usable = size * 0.76;

  let body = `<rect width="${size}" height="${size}" fill="${bg}"/>`;

  for (const layer of CONFIG.layers) {
    const magnitude = curve(layer.curve, sensorValue(layer.sensor, market, random));
    // The element count sweeps the layer's declared band. This is the one number ACV1 lets a
    // sensor move, and the reason amountMax is validated against the WORST case: output size is
    // bounded for the life of the project, not merely bounded today.
    const count = Math.round(layer.amountMin + (layer.amountMax - layer.amountMin) * magnitude);
    const ink = CONFIG.palette[layer.palette];
    body += `<g>`;

    if (layer.kind === "RINGS") {
      for (let i = 0; i < count; i++) {
        const radius = usable * (0.12 + i * 0.026);
        body += `<circle cx="${r(centre)}" cy="${r(centre)}" r="${r(radius)}" fill="none" stroke="${ink}" stroke-width="2" stroke-opacity="${r(Math.max(0.08, 0.55 - i * 0.03))}"/>`;
      }
    } else if (layer.kind === "STRATA") {
      for (let i = 0; i < count; i++) {
        const y = centre - usable / 2 + (usable * i) / Math.max(1, count);
        const w = usable * random.float(0.35, 1);
        body += `<rect x="${r(centre - w / 2)}" y="${r(y)}" width="${r(w)}" height="${r(usable * 0.018)}" fill="${ink}" fill-opacity="0.72"/>`;
      }
    } else if (layer.kind === "VEIL") {
      body += `<rect x="0" y="0" width="${size}" height="${size}" fill="${ink}" fill-opacity="${r(0.06 + magnitude * 0.22)}"/>`;
    } else {
      for (let i = 0; i < count; i++) {
        const x = centre - usable / 2 + usable * random.float(0, 1);
        const y = centre - usable / 2 + usable * random.float(0, 1);
        body += `<rect x="${r(x)}" y="${r(y)}" width="${r(usable * 0.04)}" height="${r(usable * 0.04)}" fill="${ink}" fill-opacity="0.8"/>`;
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
