// SPDX-License-Identifier: MIT
//
// GEOMETRIC ABSTRACT — liquidity changes density, holder growth changes symmetry.
//
// Both mappings are STRUCTURAL, and that was the choice worth making. The easy reading of
// "liquidity changes density" is a fill opacity; the easy reading of "holder growth changes
// symmetry" is a hue rotation. Both would satisfy the brief and neither would use the market for
// anything: a collection whose market response is a colour shift has a market-themed palette, not
// market-responsive art.
//
// So `density` decides HOW MANY forms exist, and `symmetry` decides HOW MANY TIMES the composition
// is mirrored around its centre. A thin market draws a handful of shapes with one axis; a deep,
// widely-held one draws a crowded rosette. The seed still owns what the forms ARE — their kinds,
// their proportions and their palette — so a token stays recognisably itself in every condition.

export const manifest = {
  title: "Geometric Abstract",
  description: "Hard-edged forms in a mirrored field. Liquidity sets how many; holder growth sets how often they repeat.",
  destinations: ["density", "symmetry"],
};

const PALETTES = [
  { name: "Slate", background: "#0c0f12", ink: "#dfe5ea", accent: "#5b8ca8" },
  { name: "Oxide", background: "#120c0a", ink: "#eddbcf", accent: "#c2603a" },
  { name: "Moss", background: "#0a0f0b", ink: "#d9e6d6", accent: "#6f9b58" },
  { name: "Violet", background: "#0d0a12", ink: "#e2dcea", accent: "#8a6bc0" },
];

export function render(context) {
  const { random, market, size } = context;

  // Neutral fallbacks: on day zero there is no liquidity reading and no holder history, and the
  // piece must still be a real piece rather than an empty canvas waiting for a trade.
  const density = unit(market.density, 0.35);
  const symmetry = unit(market.symmetry, 0.25);

  const palette = random.pick(PALETTES);
  const center = size / 2;

  // 1 fold is no mirroring at all. The floor matters: a collection with zero holders must not
  // render as a blank rotational field.
  const folds = 1 + Math.round(symmetry * 7);
  const forms = 3 + Math.round(density * 12);
  const step = 360 / folds;

  let cell = "";
  for (let i = 0; i < forms; i++) {
    const radius = size * (0.08 + random.float(0, 0.32));
    const span = size * random.float(0.03, 0.14);
    const angle = random.float(0, 360);
    const rad = (angle * Math.PI) / 180;
    const x = center + Math.cos(rad) * radius;
    const y = center + Math.sin(rad) * radius;
    const fill = random.chance(0.35) ? palette.accent : palette.ink;
    const opacity = round(0.35 + random.float(0, 0.5));

    const kind = random.pick(["rect", "circle", "triangle"]);
    if (kind === "rect") {
      cell += `<rect x="${round(x - span / 2)}" y="${round(y - span / 2)}" width="${round(span)}" height="${round(span * random.float(0.4, 2.2))}" fill="${fill}" fill-opacity="${opacity}" transform="rotate(${round(angle)} ${round(x)} ${round(y)})"/>`;
    } else if (kind === "circle") {
      cell += `<circle cx="${round(x)}" cy="${round(y)}" r="${round(span / 2)}" fill="none" stroke="${fill}" stroke-opacity="${opacity}" stroke-width="${round(size * random.float(0.002, 0.01))}"/>`;
    } else {
      const h = span * random.float(0.8, 1.8);
      cell += `<polygon points="${round(x)},${round(y - h / 2)} ${round(x + span / 2)},${round(y + h / 2)} ${round(x - span / 2)},${round(y + h / 2)}" fill="${fill}" fill-opacity="${opacity}"/>`;
    }
  }

  let body = "";
  for (let fold = 0; fold < folds; fold++) {
    body += `<g transform="rotate(${round(fold * step)} ${round(center)} ${round(center)})">${cell}</g>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" fill="${palette.background}"/>` +
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
