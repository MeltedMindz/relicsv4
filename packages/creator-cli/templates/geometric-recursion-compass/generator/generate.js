// SPDX-License-Identifier: MIT
//
// GEOMETRIC_RECURSION_V1 — a LOCAL PREVIEW, not the renderer.
//
// This project's art is drawn on chain by GEOMETRIC_RECURSION_V1 from the GRV1 configuration in
// generator/params.json: a palette, a ground, and a small set of RULES that are applied to
// themselves, level on level. The bundle carries that configuration; the runtime carries the code.
// A bundle never carries contract code — there is no manifest field for it and no file type that
// could hold it.
//
// So what is this file? A sketch. It draws roughly what the configuration means, so values can be
// chosen with the eyes rather than a spreadsheet. It is NOT the renderer, it is not submitted as
// art, and it does not match the on-chain output pixel for pixel — the recursion, the symmetry
// sets and the shape sets are all approximated here.
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
  title: "Compass",
  groundMode: "RADIAL",
  groundIx: 0,
  palette: ["#0f0c08", "#e0b44a", "#3f7e72", "#ede4d0", "#a8492a", "#7c8aa6", "#241c14"],
  rules: [
    { paletteIx: 1, sensor: "RECOVERY", curve: "LOG2", drive: "CONTRACT", depthMin: 3, depthMax: 3, branch: 3, contraction: 90, rotation: 24 },
    { paletteIx: 2, sensor: "DRAWDOWN", curve: "LINEAR", drive: "DEPTH", depthMin: 1, depthMax: 4, branch: 2, contraction: 78, rotation: 12 },
  ],
};

// Which market reading stands in for each sensor in this sketch. The runtime normalises every
// sensor onto its own internal scale; here the sandbox's mapped market values are used, falling
// back to the seed so a preview is never blank.
function sensorValue(sensor, market, random) {
  const named = {
    RECOVERY: market.density,
    DRAWDOWN: market.fracture,
    STRESS: market.distortion,
    VOLATILITY: market.distortion,
  }[sensor];
  return typeof named === "number" ? clamp01(named) : random.next();
}

// The response curves, shaping a 0..1 sensor reading into a 0..1 magnitude.
function curve(kind, t) {
  if (kind === "LOG2") return Math.log2(1 + clamp01(t));
  if (kind === "EASE") return clamp01(t) * clamp01(t) * (3 - 2 * clamp01(t));
  if (kind === "STEP") return Math.floor(clamp01(t) * 4) / 4;
  return clamp01(t);
}

export const manifest = {
  title: "Geometric recursion (preview)",
  description: "Local sketch of the GRV1 configuration this project launches with.",
};

export function render(context) {
  const { random, market, size } = context;
  const centre = size / 2;
  const ground = CONFIG.palette[CONFIG.groundIx];
  let body = `<rect width="${size}" height="${size}" fill="${ground}"/>`;

  for (const rule of CONFIG.rules) {
    const magnitude = curve(rule.curve, sensorValue(rule.sensor, market, random));
    // `CONTRACT` moves the self-similarity ratio; `DEPTH` moves how many generations are drawn.
    // Both are approximations of what the runtime does with the same two knobs.
    const depth = rule.drive === "DEPTH" ? Math.max(1, Math.round(rule.depthMin + (rule.depthMax - rule.depthMin) * magnitude)) : rule.depthMax;
    const ratio = rule.drive === "CONTRACT" ? clamp01(rule.contraction / 100) * (0.7 + 0.3 * magnitude) : rule.contraction / 100;
    const ink = CONFIG.palette[rule.paletteIx];
    body += `<g stroke="${ink}" fill="none" stroke-width="2">`;
    let radius = size * 0.4;
    for (let level = 0; level < depth; level++) {
      const arms = Math.max(2, rule.branch + level);
      for (let arm = 0; arm < arms; arm++) {
        const angle = (arm / arms) * Math.PI * 2 + (level * rule.rotation * Math.PI) / 180;
        const cx = centre + Math.cos(angle) * radius * (1 - ratio);
        const cy = centre + Math.sin(angle) * radius * (1 - ratio);
        body += `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius * ratio * 0.5)}" stroke-opacity="${r(Math.max(0.12, 0.85 - level * 0.18))}"/>`;
      }
      radius *= ratio;
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
