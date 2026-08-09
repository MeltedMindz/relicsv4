// SPDX-License-Identifier: MIT
//
// MARKET-RESPONSIVE TEMPLATE — art that reads its own market.
//
// The seed decides what the piece IS. The market decides what condition it is IN. Keep those two
// jobs separate and the collection stays coherent: every token is recognisably itself, and the
// whole collection moves together as the market moves.
//
// `context.market` holds one value in [0,1] per destination you wired up in
// `market/mappings.json`. A destination with no mapping is simply absent, so read it with a
// fallback and the piece still renders on day zero, before a single trade has happened.
//
//     drawdown  -> fracture     how broken the form looks
//     volume    -> density      how much is drawn
//     tick      -> brightness   how lit the piece is
//     recovery  -> scar         marks that accumulate and stay
//
// Nothing here reaches a fee, a liquidity parameter or an external call. The mapping file is a
// closed vocabulary of sensor, transform and destination ids with published numeric bounds; the
// validator refuses anything outside it.

export const manifest = {
  title: "Market Responsive",
  description: "A lattice that fractures under drawdown, thickens with volume, and keeps its scars.",
  destinations: ["fracture", "density", "brightness", "scar"],
};

const PALETTES = [
  { name: "Ash", background: "#0a0a0b", ink: "#dcd8d2", accent: "#c9a227" },
  { name: "Rust", background: "#100b08", ink: "#e3cdb8", accent: "#b4532a" },
  { name: "Verdigris", background: "#06100e", ink: "#cfe3db", accent: "#3f9e86" },
  { name: "Ultramarine", background: "#070a14", ink: "#cdd6ec", accent: "#4a63c9" },
  { name: "Bone", background: "#0e0d0b", ink: "#efe9dc", accent: "#8f8677" },
];

export function render(context) {
  const { random, market, size } = context;

  // Read the market with a neutral fallback so a pre-launch preview is honest, not blank.
  const fracture = value(market.fracture, 0);
  const density = value(market.density, 0.45);
  const brightness = value(market.brightness, 0.5);
  const scar = value(market.scar, 0);

  const palette = random.pick(PALETTES);
  const columns = 4 + Math.round(density * 8);
  const rows = columns;
  const cell = size / (columns + 2);
  const inkOpacity = 0.25 + brightness * 0.6;

  let body = "";
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // Every draw comes from the seeded stream, so the same seed always lays out the same grid.
      if (random.chance(0.18)) continue;
      const x = cell * (column + 1.5);
      const y = cell * (row + 1.5);
      const jitter = fracture * cell * 0.55;
      const dx = random.float(-jitter, jitter);
      const dy = random.float(-jitter, jitter);
      const span = cell * random.float(0.35, 0.85);
      const weight = 0.5 + brightness * 1.6;

      if (random.chance(0.5)) {
        body += `<line x1="${r(x - span / 2 + dx)}" y1="${r(y + dy)}" x2="${r(x + span / 2 + dx)}" y2="${r(y + dy)}" stroke="${palette.ink}" stroke-opacity="${r(inkOpacity)}" stroke-width="${r(weight)}"/>`;
      } else {
        body += `<line x1="${r(x + dx)}" y1="${r(y - span / 2 + dy)}" x2="${r(x + dx)}" y2="${r(y + span / 2 + dy)}" stroke="${palette.ink}" stroke-opacity="${r(inkOpacity)}" stroke-width="${r(weight)}"/>`;
      }
    }
  }

  // Scars are monotonic: once the market has cut the piece, the mark stays in the composition.
  const scarCount = Math.round(scar * 6);
  for (let i = 0; i < scarCount; i++) {
    const y = size * random.float(0.12, 0.88);
    const lean = size * random.float(-0.08, 0.08);
    body += `<path d="M ${r(size * 0.08)} ${r(y)} L ${r(size * 0.92)} ${r(y + lean)}" stroke="${palette.accent}" stroke-opacity="0.75" stroke-width="${r(1 + scar * 3)}" fill="none"/>`;
  }

  const core = size * (0.03 + brightness * 0.05);
  body += `<circle cx="${r(size / 2)}" cy="${r(size / 2)}" r="${r(core)}" fill="${palette.accent}" fill-opacity="${r(0.35 + brightness * 0.5)}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`
    + `<rect width="${size}" height="${size}" fill="${palette.background}"/>`
    + body
    + `</svg>`;
}

function value(candidate, fallback) {
  return typeof candidate === "number" && candidate >= 0 && candidate <= 1 ? candidate : fallback;
}

function r(n) {
  return Math.round(n * 100) / 100;
}
