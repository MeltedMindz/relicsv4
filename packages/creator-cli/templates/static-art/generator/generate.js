// SPDX-License-Identifier: MIT
//
// STATIC ART TEMPLATE — the seed decides everything, forever.
//
// There are no market mappings in this project, so `context.market` is always `{}`. Every choice
// below comes from `context.random`, which is seeded from the token's own seed. Render it today,
// render it in ten years: identical bytes.
//
// That is a promise, and it is worth making on purpose. Say in your collection description that
// the work is fixed, so nobody buys expecting it to move.

export const manifest = {
  title: "Static Art",
  description: "A fixed architectural silhouette under fixed weather.",
};

const GROUNDS = [
  { name: "Slate", sky: "#0d1013", stone: "#8e969c", ink: "#e6ebef" },
  { name: "Umber", sky: "#120d09", stone: "#9b7a5a", ink: "#f0e0cc" },
  { name: "Pitch", sky: "#08080a", stone: "#5e5f66", ink: "#d8d9de" },
  { name: "Chalk", sky: "#141313", stone: "#c9c2b4", ink: "#f7f3ea" },
];

const STRUCTURES = ["Column", "Arch", "Terrace", "Shard", "Basin", "Spire"];

export function render(context) {
  const { random, size } = context;
  const ground = random.pick(GROUNDS);
  const structure = random.pick(STRUCTURES);
  const horizon = size * random.float(0.58, 0.74);

  let body = `<rect width="${size}" height="${size}" fill="${ground.sky}"/>`;
  body += `<rect y="${r(horizon)}" width="${size}" height="${r(size - horizon)}" fill="${ground.stone}" fill-opacity="0.18"/>`;

  // Haze: a few wide, faint bands above the horizon.
  const bands = random.int(2, 6);
  for (let i = 0; i < bands; i++) {
    const y = random.float(size * 0.08, horizon - size * 0.02);
    const height = random.float(size * 0.005, size * 0.03);
    body += `<rect x="0" y="${r(y)}" width="${size}" height="${r(height)}" fill="${ground.ink}" fill-opacity="${r(random.float(0.02, 0.09))}"/>`;
  }

  body += silhouette(structure, random, size, horizon, ground);

  // Age: erosion marks along the base, seeded and permanent.
  const marks = random.int(0, 14);
  for (let i = 0; i < marks; i++) {
    const x = random.float(size * 0.05, size * 0.95);
    const length = random.float(size * 0.01, size * 0.06);
    body += `<line x1="${r(x)}" y1="${r(horizon)}" x2="${r(x + random.float(-6, 6))}" y2="${r(horizon + length)}" stroke="${ground.ink}" stroke-opacity="0.2" stroke-width="1"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
}

function silhouette(structure, random, size, horizon, ground) {
  const centre = size / 2;
  const width = size * random.float(0.16, 0.34);
  const height = size * random.float(0.24, 0.52);
  const top = horizon - height;
  const fill = ground.ink;
  const opacity = r(random.float(0.72, 0.95));

  if (structure === "Arch") {
    const inner = width * 0.42;
    return (
      `<path d="M ${r(centre - width / 2)} ${r(horizon)} L ${r(centre - width / 2)} ${r(top + inner)} A ${r(width / 2)} ${r(inner)} 0 0 1 ${r(centre + width / 2)} ${r(top + inner)} L ${r(centre + width / 2)} ${r(horizon)} Z" ` +
      `fill="${fill}" fill-opacity="${opacity}"/>` +
      `<path d="M ${r(centre - inner / 2)} ${r(horizon)} L ${r(centre - inner / 2)} ${r(top + inner * 1.4)} A ${r(inner / 2)} ${r(inner * 0.6)} 0 0 1 ${r(centre + inner / 2)} ${r(top + inner * 1.4)} L ${r(centre + inner / 2)} ${r(horizon)} Z" ` +
      `fill="${ground.sky}"/>`
    );
  }
  if (structure === "Terrace") {
    let out = "";
    const steps = random.int(3, 6);
    for (let i = 0; i < steps; i++) {
      const stepWidth = width * (1 - i / (steps + 1));
      const stepHeight = height / steps;
      out += `<rect x="${r(centre - stepWidth / 2)}" y="${r(horizon - stepHeight * (i + 1))}" width="${r(stepWidth)}" height="${r(stepHeight)}" fill="${fill}" fill-opacity="${opacity}"/>`;
    }
    return out;
  }
  if (structure === "Shard") {
    const lean = random.float(-width * 0.35, width * 0.35);
    return `<path d="M ${r(centre - width / 2)} ${r(horizon)} L ${r(centre + lean)} ${r(top)} L ${r(centre + width / 2)} ${r(horizon)} Z" fill="${fill}" fill-opacity="${opacity}"/>`;
  }
  if (structure === "Basin") {
    return `<path d="M ${r(centre - width / 2)} ${r(horizon - height * 0.35)} Q ${r(centre)} ${r(horizon + height * 0.2)} ${r(centre + width / 2)} ${r(horizon - height * 0.35)} Z" fill="${fill}" fill-opacity="${opacity}"/>`;
  }
  if (structure === "Spire") {
    return `<path d="M ${r(centre - width * 0.22)} ${r(horizon)} L ${r(centre)} ${r(top - height * 0.25)} L ${r(centre + width * 0.22)} ${r(horizon)} Z" fill="${fill}" fill-opacity="${opacity}"/>`;
  }
  return `<rect x="${r(centre - width / 2)}" y="${r(top)}" width="${r(width)}" height="${r(height)}" fill="${fill}" fill-opacity="${opacity}"/>`;
}

function r(n) {
  return Math.round(n * 100) / 100;
}
