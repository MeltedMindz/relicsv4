// SPDX-License-Identifier: MIT
//
// MINIMAL TEMPLATE — the smallest generator that is still a real collection.
//
// A generator is one file that exports one function:
//
//     export function render(context) -> an SVG string
//
// `context` is frozen plain data. It is everything the generator is allowed to know:
//
//     context.seed      the token's seed, as a string
//     context.random    a SEEDED random helper — next/float/int/chance/pick/weighted
//     context.market    market-driven values in [0,1], one per destination you mapped
//     context.sensors   raw sensor readings in [-1,1] (usually you want context.market)
//     context.size      the canvas edge, in user units
//     context.project   name, symbol, artworkSupply
//
// There is no clock, no network, no filesystem and no host object. `Math.random` is not
// available: same seed, same picture, forever — that is what makes the art verifiable.

export const manifest = {
  title: "Minimal",
  description: "One ring, one core, palette by seed.",
};

const PALETTES = [
  { name: "Ash", background: "#0b0b0c", ink: "#e8e6e3", accent: "#c9a227" },
  { name: "Rust", background: "#120c09", ink: "#e6d5c3", accent: "#b4532a" },
  { name: "Verdigris", background: "#07100e", ink: "#d6e6df", accent: "#3f9e86" },
  { name: "Bone", background: "#100f0d", ink: "#f0ece1", accent: "#8f8677" },
];

export function render(context) {
  const { random, size } = context;
  const palette = random.pick(PALETTES);
  const rings = random.int(3, 7);
  const center = size / 2;

  let body = "";
  for (let i = 0; i < rings; i++) {
    const radius = (size * 0.12) + (i * size * 0.055);
    const stroke = random.float(0.6, 2.4);
    const dash = random.chance(0.4) ? ` stroke-dasharray="${round(random.float(4, 30))} ${round(random.float(6, 24))}"` : "";
    body += `<circle cx="${center}" cy="${center}" r="${round(radius)}" fill="none" stroke="${palette.ink}" stroke-opacity="${round(random.float(0.25, 0.8))}" stroke-width="${round(stroke)}"${dash}/>`;
  }

  const coreRadius = size * random.float(0.04, 0.09);
  body += `<circle cx="${center}" cy="${center}" r="${round(coreRadius)}" fill="${palette.accent}" fill-opacity="0.9"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" fill="${palette.background}"/>`
    + body
    + `</svg>`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
