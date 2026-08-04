/**
 * Deterministic LOCAL fixtures for the Explore page, so the UI has something honest to show
 * with no chain, no RPC, and no secrets. These previews mirror the on-chain renderer's visual
 * concept (rings + a rotating polygon core) but are NOT the canonical artwork — the source of
 * truth is always the contract's on-chain `tokenURI`. This is a neutral placeholder identity.
 */

const PALETTES: Array<{ bg: string; ink: string; accent: string }> = [
  { bg: "#0d0f14", ink: "#c8d0dc", accent: "#5aa9e6" },
  { bg: "#12100c", ink: "#e8dcc0", accent: "#e0a94b" },
  { bg: "#0a1410", ink: "#bfe6cf", accent: "#3fbf7f" },
  { bg: "#140a12", ink: "#e6c0dc", accent: "#c65aa9" },
  { bg: "#0c0c14", ink: "#cccce6", accent: "#8a7ff0" },
  { bg: "#141010", ink: "#e6cccc", accent: "#e0605a" },
];

// tiny deterministic string hash -> 32-bit int
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SigilPreview {
  id: number;
  seed: string;
  svg: string;
  archetype: string;
}

const ARCHETYPES = ["Trigon", "Quadric", "Pentode", "Hexal", "Septet", "Octave"];

export function generateSigil(id: number, drawdownBand = 0): SigilPreview {
  const seed = `relics-v4-starter/example/${id}`;
  const h = hash(seed);
  const palette = PALETTES[h % PALETTES.length];
  const sides = 3 + ((h >> 3) % 6); // 3..8
  const ringCount = 2 + ((h >> 6) % 5); // 2..6
  const rotation = (h >> 9) % 360;
  const coreScale = 28 + ((h >> 12) % 33); // 28..60
  const cx = 250;
  const cy = 250;

  let rings = "";
  for (let i = 0; i < ringCount; i++) {
    const r = coreScale + 20 * (i + 1);
    rings += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${palette.ink}" stroke-opacity="0.35" stroke-width="2"/>`;
  }

  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotation + (i * 360) / sides) * Math.PI) / 180;
    const x = Math.round(cx + coreScale * Math.cos(a));
    const y = Math.round(cy + coreScale * Math.sin(a));
    pts.push(`${x},${y}`);
  }
  const opacity = Math.max(0.2, 1 - drawdownBand / 12500);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">` +
    `<rect width="500" height="500" fill="${palette.bg}"/>` +
    rings +
    `<polygon points="${pts.join(" ")}" fill="${palette.accent}" fill-opacity="${opacity.toFixed(2)}" stroke="${palette.accent}" stroke-width="3"/>` +
    `<text x="24" y="476" font-family="monospace" font-size="14" fill="${palette.ink}" fill-opacity="0.6">#${id}</text>` +
    `</svg>`;

  return { id, seed, svg, archetype: ARCHETYPES[(sides - 3) % ARCHETYPES.length] };
}

export function sampleSigils(count = 12, drawdownBand = 0): SigilPreview[] {
  return Array.from({ length: count }, (_, i) => generateSigil(i + 1, drawdownBand));
}

export function svgToDataUri(svg: string): string {
  // Browser-safe base64 without Buffer.
  const b64 = typeof window === "undefined" ? Buffer.from(svg).toString("base64") : btoa(svg);
  return `data:image/svg+xml;base64,${b64}`;
}
