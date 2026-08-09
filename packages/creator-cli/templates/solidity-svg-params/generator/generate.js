// SPDX-License-Identifier: MIT
//
// SOLIDITY-SVG PARAMETER TEMPLATE — a LOCAL PREVIEW, not the renderer.
//
// This project uses the SOLIDITY_SVG runtime: a registered on-chain Solidity template draws the
// art, and your project supplies parameter VALUES (see generator/params.json). The bundle carries
// parameters; the template carries code. A bundle never carries contract code — there is no
// manifest field for it and no file type that could hold it.
//
// So what is this file? A sketch. It draws roughly what the template's parameters mean, so you can
// choose values with your eyes instead of a spreadsheet. It is not submitted, it is not the
// renderer, and it does not have to match the on-chain output pixel for pixel.
//
// Keeping the two straight matters: if you change a parameter here and the preview changes, that
// tells you about YOUR parameters. It tells you nothing about the template's code.

export const manifest = {
  title: "Solidity-SVG parameters (preview)",
  description: "Local sketch of a registered on-chain template's parameter space.",
};

// These mirror generator/params.json. Keep them in step by hand — the preview reads them from
// here so it stays a single, dependency-free file.
const PARAMS = {
  strokeWeight: 2,
  ringCount: 5,
  silhouette: "monolith",
  paletteIndex: 0,
  symmetry: 4,
  margin: 0.12,
};

const PALETTES = [
  { name: "Ash", background: "#0a0a0b", ink: "#ded9d2", accent: "#c9a227" },
  { name: "Rust", background: "#110b08", ink: "#e6cdb6", accent: "#b4532a" },
  { name: "Verdigris", background: "#06100e", ink: "#cfe3db", accent: "#3f9e86" },
  { name: "Bone", background: "#0e0d0b", ink: "#efe9dc", accent: "#8f8677" },
];

export function render(context) {
  const { random, market, size } = context;

  const paletteDrive = typeof market.palette === "number" ? market.palette : random.next();
  const fracture = typeof market.fracture === "number" ? market.fracture : 0;
  const palette = PALETTES[Math.min(PALETTES.length - 1, Math.floor(paletteDrive * PALETTES.length))];

  const inset = size * PARAMS.margin;
  const centre = size / 2;
  const usable = size - inset * 2;

  let body = `<rect width="${size}" height="${size}" fill="${palette.background}"/>`;

  // PARAMETERS set the family; the SEED sets the individual. A registered template works the same
  // way, so a preview that ignored the seed would teach the wrong intuition: every token would
  // look identical and the collection would be one picture printed a thousand times.
  const rotation = random.int(0, 359);
  const rings = Math.max(1, PARAMS.ringCount + random.int(-2, 2));
  const notches = random.int(0, PARAMS.symmetry);
  body += `<g transform="rotate(${rotation} ${r(centre)} ${r(centre)})">`;

  // Silhouette: the parameter that decides the base form.
  const width = usable * (0.34 * random.float(0.72, 1.24));
  const height = usable * (0.62 * random.float(0.78, 1.18));
  if (PARAMS.silhouette === "vessel") {
    body += `<path d="M ${r(centre - width / 2)} ${r(centre - height / 2)} Q ${r(centre)} ${r(centre + height * 0.7)} ${r(centre + width / 2)} ${r(centre - height / 2)} Z" fill="${palette.ink}" fill-opacity="0.9"/>`;
  } else if (PARAMS.silhouette === "lattice") {
    for (let i = 0; i <= PARAMS.symmetry; i++) {
      const x = centre - width / 2 + (width * i) / PARAMS.symmetry;
      body += `<line x1="${r(x)}" y1="${r(centre - height / 2)}" x2="${r(x)}" y2="${r(centre + height / 2)}" stroke="${palette.ink}" stroke-width="${PARAMS.strokeWeight}" stroke-opacity="0.85"/>`;
    }
  } else {
    body += `<rect x="${r(centre - width / 2)}" y="${r(centre - height / 2)}" width="${r(width)}" height="${r(height)}" fill="${palette.ink}" fill-opacity="0.9"/>`;
  }

  // Rings: the parameter that decides how much structure surrounds the form. The count and the
  // spacing take a seeded nudge so two tokens of the same family still read as two tokens.
  const spacing = random.float(0.055, 0.09);
  for (let i = 0; i < rings; i++) {
    const radius = usable * (0.2 + i * spacing);
    const dash = fracture > 0 ? ` stroke-dasharray="${r(12 - fracture * 9)} ${r(4 + fracture * 18)}"` : "";
    body += `<circle cx="${r(centre)}" cy="${r(centre)}" r="${r(radius)}" fill="none" stroke="${palette.accent}" stroke-opacity="${r(Math.max(0.08, 0.5 - i * 0.06))}" stroke-width="${PARAMS.strokeWeight}"${dash}/>`;
  }

  // Notches: a seeded count of marks around the outer ring.
  for (let i = 0; i < notches; i++) {
    const angle = random.float(0, Math.PI * 2);
    const inner = usable * 0.2;
    const outer = inner + usable * random.float(0.04, 0.14);
    body += `<line x1="${r(centre + Math.cos(angle) * inner)}" y1="${r(centre + Math.sin(angle) * inner)}" x2="${r(centre + Math.cos(angle) * outer)}" y2="${r(centre + Math.sin(angle) * outer)}" stroke="${palette.accent}" stroke-width="${PARAMS.strokeWeight}" stroke-opacity="0.8"/>`;
  }

  body += `</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
}

function r(n) {
  return Math.round(n * 100) / 100;
}
