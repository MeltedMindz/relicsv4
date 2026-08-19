// SPDX-License-Identifier: MIT
//
// MONOCHROME PIXEL FIELD — 512 pieces on a strictly one-bit palette.
//
// Brief: drawdowns introduce damage; volatility increases visual noise.
//
// Two decisions keep the market legible instead of decorative:
//
//   * DAMAGE IS SUBTRACTIVE. `fracture` removes cells that the seed placed. A drawdown does not
//     add a "damage layer" on top — it takes the piece apart, so a heavily drawn-down token is
//     recognisably the SAME piece with holes in it, not a different picture.
//   * NOISE IS ADDITIVE AND SEPARATE. `distortion` lights stray cells the seed never chose. The
//     two never touch the same pixel decision, so a viewer can read which force did what.
//
// The palette is one ink on one ground, chosen by seed. There is no colour response, on purpose:
// the brief asked for monochrome, and a market that changed the colour would be answering a
// question nobody asked.

export const manifest = {
  title: "Monochrome Pixel Field",
  description: "A one-bit pixel field. Drawdown removes what the seed drew; volatility lights what it did not.",
  destinations: ["fracture", "distortion"],
};

const GRID = 32;

const INKS = [
  { name: "Bone", ground: "#0a0a0a", ink: "#f2efe9" },
  { name: "Phosphor", ground: "#050806", ink: "#c8f0d2" },
  { name: "Amber", ground: "#0a0704", ink: "#f0c88a" },
  { name: "Ash", ground: "#101010", ink: "#b8b8b8" },
];

export function render(context) {
  const { random, market, size } = context;

  // Read with a neutral fallback so a pre-launch preview is honest rather than blank: before a
  // single trade there is no drawdown and no volatility, and the piece is simply undamaged.
  const fracture = unit(market.fracture, 0);
  const distortion = unit(market.distortion, 0);

  const palette = random.pick(INKS);
  const cell = size / GRID;
  const fill = 0.18 + random.float(0, 0.22);

  // ONE PASS, so the same seed always visits the cells in the same order. Deriving the field from
  // a fresh stream per force would make the market change WHICH cells the seed chose, and the
  // piece would stop being itself.
  let body = "";
  let drawn = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const seeded = random.chance(fill);
      const noise = random.chance(distortion * 0.16);
      const survives = seeded && !random.chance(fracture * 0.75);
      if (!survives && !noise) continue;
      drawn += 1;
      const opacity = seeded ? 1 : 0.55;
      body += `<rect x="${round(x * cell)}" y="${round(y * cell)}" width="${round(cell)}" height="${round(cell)}" fill="${palette.ink}" fill-opacity="${opacity}"/>`;
    }
  }

  // A field that has been damaged into emptiness is still a piece: the ground survives, and the
  // brief's "damage" reaches its limit rather than producing a blank frame the validator refuses.
  if (drawn === 0) {
    const mid = Math.floor(GRID / 2) * cell;
    body += `<rect x="${round(mid)}" y="${round(mid)}" width="${round(cell)}" height="${round(cell)}" fill="${palette.ink}"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" fill="${palette.ground}"/>` +
    body +
    `</svg>`
  );
}

function unit(candidate, fallback) {
  return typeof candidate === "number" && candidate >= 0 && candidate <= 1 ? candidate : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
