// SPDX-License-Identifier: MIT
//
// STATIC GENERATIVE — no market mappings at all.
//
// This is the case a market-aware format has to get right or it is not a format, it is a theme.
// The generator never touches `context.market`, `market/mappings.json` declares an empty list, and
// every piece is a pure function of its seed: the same token renders identically on day zero and
// after ten thousand trades, forever.
//
// The composition is a stack of translucent bands. It is deliberately unremarkable — the interest
// here is that the pipeline treats "does not respond" as a first-class answer rather than a
// degenerate configuration to be warned about.

export const manifest = {
  title: "Static Generative",
  description: "Layered bands, fixed at birth. The market is not consulted and never will be.",
  destinations: [],
};

const PALETTES = [
  { name: "Dune", background: "#100d09", bands: ["#e8d5b7", "#c9a227", "#8a6d3b", "#4a3a22"] },
  { name: "Tide", background: "#070d10", bands: ["#cfe4ea", "#5b9aa8", "#356571", "#1c3b44"] },
  { name: "Ember", background: "#120806", bands: ["#f0d6c8", "#c2603a", "#8a3a22", "#4a1f12"] },
  { name: "Pine", background: "#080d09", bands: ["#d6e4d2", "#6f9b58", "#42663a", "#243a20"] },
];

export function render(context) {
  // `market` is not destructured, and that is the statement. Nothing outside the seed reaches this
  // function, so there is nothing for a market to change.
  const { random, size } = context;

  const palette = random.pick(PALETTES);
  const bands = 5 + random.int(0, 7);
  const drift = random.float(-0.12, 0.12);

  let body = "";
  let y = 0;
  for (let i = 0; i < bands; i++) {
    const height = (size / bands) * random.float(0.6, 1.5);
    const ink = random.pick(palette.bands);
    const opacity = round(0.35 + random.float(0, 0.5));
    const skew = size * drift * random.float(0.2, 1);
    body += `<polygon points="0,${round(y)} ${round(size)},${round(y + skew)} ${round(size)},${round(y + skew + height)} 0,${round(y + height)}" fill="${ink}" fill-opacity="${opacity}"/>`;
    y += height * random.float(0.55, 0.95);
    if (y > size) break;
  }

  const markRadius = size * random.float(0.02, 0.06);
  body += `<circle cx="${round(size * random.float(0.2, 0.8))}" cy="${round(size * random.float(0.2, 0.8))}" r="${round(markRadius)}" fill="${palette.bands[0]}" fill-opacity="0.9"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" fill="${palette.background}"/>` +
    body +
    `</svg>`
  );
}

function round(value) {
  return Math.round(value * 100) / 100;
}
