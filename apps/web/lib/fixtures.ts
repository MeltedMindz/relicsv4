/**
 * Deterministic LOCAL previews for the Explore page, so the UI has something honest to show with
 * no chain, no RPC, and no secrets. These mirror the on-chain renderers' concepts (Sigil / Strata
 * / Orbital) but are NOT the canonical artwork — the source of truth is always the contract's
 * on-chain `tokenURI`. Neutral placeholder identity.
 */
import type { RendererStyle } from "@config";

const PALETTES: Array<{ bg: string; ink: string; accent: string }> = [
  { bg: "#0d0f14", ink: "#c8d0dc", accent: "#5aa9e6" },
  { bg: "#12100c", ink: "#e8dcc0", accent: "#e0a94b" },
  { bg: "#0a1410", ink: "#bfe6cf", accent: "#3fbf7f" },
  { bg: "#140a12", ink: "#e6c0dc", accent: "#c65aa9" },
  { bg: "#0c0c14", ink: "#cccce6", accent: "#8a7ff0" },
  { bg: "#141010", ink: "#e6cccc", accent: "#e0605a" },
];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface PreviewMarket {
  drawdownBand?: number; // 0..10000
  recoveryBand?: number; // 0..10000
  swaps?: number;
  epoch?: number;
  holders?: number;
  buyDominant?: boolean;
}

export interface Preview {
  id: number;
  svg: string;
  label: string;
}

const svgOpen =
  '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">';

function footer(id: number, ink: string, note: string): string {
  return `<text x="24" y="476" font-family="monospace" font-size="14" fill="${ink}" fill-opacity="0.6">#${id}  ${note}</text>`;
}

function sigil(id: number, m: PreviewMarket): Preview {
  const h = hash(`sigil/${id}`);
  const p = PALETTES[h % PALETTES.length];
  const sides = 3 + ((h >> 3) % 6);
  const rings = 2 + ((h >> 6) % 5);
  const rotation = (h >> 9) % 360;
  const coreScale = 28 + ((h >> 12) % 33);
  const drawdown = m.drawdownBand ?? 0;
  let out = svgOpen + `<rect width="500" height="500" fill="${p.bg}"/>`;
  for (let i = 0; i < rings; i++) {
    out += `<circle cx="250" cy="250" r="${coreScale + 20 * (i + 1)}" fill="none" stroke="${p.ink}" stroke-opacity="0.35" stroke-width="2"/>`;
  }
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotation + (i * 360) / sides) * Math.PI) / 180;
    pts.push(`${Math.round(250 + coreScale * Math.cos(a))},${Math.round(250 + coreScale * Math.sin(a))}`);
  }
  const op = Math.max(0.2, 1 - drawdown / 12500);
  out += `<polygon points="${pts.join(" ")}" fill="${p.accent}" fill-opacity="${op.toFixed(2)}" stroke="${p.accent}" stroke-width="3"/>`;
  out += footer(id, p.ink, `epoch ${m.epoch ?? 0}`) + "</svg>";
  return { id, svg: out, label: `Sigil #${id}` };
}

function strata(id: number, m: PreviewMarket): Preview {
  const h = hash(`strata/${id}`);
  const p = PALETTES[h % PALETTES.length];
  const bands = Math.min(16, (m.epoch ?? 0) + 3);
  const buyDom = m.buyDominant ?? true;
  const bandH = Math.floor(500 / bands);
  let out = svgOpen + `<rect width="500" height="500" fill="${p.bg}"/>`;
  for (let i = 0; i < bands; i++) {
    const fill = (i + (buyDom ? 0 : 1)) % 2 === 0 ? p.accent : p.ink;
    const op = (22 + Math.floor((i * 55) / bands)) / 100;
    out += `<rect x="0" y="${i * bandH}" width="500" height="${bandH + 1}" fill="${fill}" fill-opacity="${op.toFixed(2)}"/>`;
  }
  const darken = (m.drawdownBand ?? 0) / 200 / 100;
  if (darken > 0) out += `<rect width="500" height="500" fill="#000000" fill-opacity="${darken.toFixed(2)}"/>`;
  const rec = m.recoveryBand ?? 0;
  if (rec > 0) {
    const y = 500 - Math.round((rec * 500) / 10000);
    out += `<line x1="0" y1="${y}" x2="500" y2="${y}" stroke="${p.accent}" stroke-width="3" stroke-opacity="0.5"/>`;
  }
  out += footer(id, p.ink, `strata ${m.epoch ?? 0}`) + "</svg>";
  return { id, svg: out, label: `Strata #${id}` };
}

function orbital(id: number, m: PreviewMarket): Preview {
  const h = hash(`orbital/${id}`);
  const p = PALETTES[h % PALETTES.length];
  const rings = 2 + ((h >> 6) % 5);
  const rotation = (h >> 9) % 360;
  const holders = Math.min(40, m.holders ?? 0);
  const nucleusR = 26 + holders;
  const bodies = Math.min(16, m.swaps ?? 0);
  const spread = 30 + ((m.epoch ?? 0) % 9) * 8;
  const op = Math.max(0.25, 1 - (m.drawdownBand ?? 0) / 12000);
  let out = svgOpen + `<rect width="500" height="500" fill="${p.bg}"/>`;
  for (let i = 0; i < rings; i++) {
    out += `<circle cx="250" cy="250" r="${70 + i * 45}" fill="none" stroke="${p.ink}" stroke-opacity="0.15" stroke-width="1"/>`;
  }
  out += `<circle cx="250" cy="250" r="${nucleusR}" fill="${p.accent}" fill-opacity="0.7"/>`;
  for (let i = 0; i < bodies; i++) {
    const a = ((rotation + (i * 360) / 16) * Math.PI) / 180;
    const r = nucleusR + spread + ((i * 7) % 60);
    const fill = i % 3 === 0 ? p.accent : p.ink;
    out += `<circle cx="${Math.round(250 + r * Math.cos(a))}" cy="${Math.round(250 + r * Math.sin(a))}" r="5" fill="${fill}" fill-opacity="${op.toFixed(2)}"/>`;
  }
  out += footer(id, p.ink, `holders ${m.holders ?? 0}`) + "</svg>";
  return { id, svg: out, label: `Orbital #${id}` };
}

const GENERATORS: Record<RendererStyle, (id: number, m: PreviewMarket) => Preview> = {
  sigil,
  strata,
  orbital,
};

export function samplePreviews(style: RendererStyle, count: number, market: PreviewMarket): Preview[] {
  const gen = GENERATORS[style] ?? sigil;
  return Array.from({ length: count }, (_, i) => gen(i + 1, market));
}

export function svgToDataUri(svg: string): string {
  const b64 = typeof window === "undefined" ? Buffer.from(svg).toString("base64") : btoa(svg);
  return `data:image/svg+xml;base64,${b64}`;
}
