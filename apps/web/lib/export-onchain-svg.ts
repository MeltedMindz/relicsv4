/**
 * export-onchain-svg — turn a decoded on-chain SVG into a downloadable PNG, safely.
 *
 * This is a generic, dependency-free browser utility. It:
 *   - decodes an ERC-721 `tokenURI` (base64/utf8 JSON) and extracts the embedded SVG,
 *   - validates the SVG (must have a viewBox; must NOT contain <script> or any remote resource),
 *   - rasterizes it via SVG Blob → Image → <canvas> → `canvas.toBlob('image/png')`,
 *   - preserves aspect ratio by LETTERBOXING (never crops or stretches),
 *   - revokes every object URL it creates,
 *   - shares via `navigator.canShare` on mobile, falling back to download, then a new tab.
 *
 * IMPORTANT: a browser PNG is a *snapshot* of dynamic on-chain art at one moment. The canonical
 * artwork is always the contract's on-chain `tokenURI` (which changes with market state). Never
 * treat an exported PNG — or a marketplace CDN image — as the source of truth. See
 * docs/exporting-onchain-svg-as-png.md.
 *
 * The pure helpers (`extractSvgFromTokenURI`, `validateSvg`, `parseViewBox`, `computeLetterbox`)
 * are exported separately and unit-tested. The rasterization/share functions require a browser.
 */

export type ExportSize = 1024 | 2048 | 4096;

export interface ExportResult {
  method: "share" | "download" | "newtab";
}

// ---------------------------------------------------------------------------
// pure helpers (safe in Node; unit-tested)
// ---------------------------------------------------------------------------

/** Decode a base64 string to a UTF-8 string in both Node and the browser. */
export function base64ToUtf8(b64: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Extract the raw SVG document from an ERC-721 tokenURI. Handles:
 *   - `data:application/json;base64,<b64 json>` with an `image` of
 *     `data:image/svg+xml;base64,<b64 svg>` or `data:image/svg+xml;utf8,<svg>`,
 *   - `data:application/json;utf8,<json>` / `data:application/json,<json>`,
 *   - a direct `data:image/svg+xml...` URI,
 *   - a bare `<svg ...>` string.
 * Throws on anything that is not ultimately an SVG document. NEVER fetches a remote URL.
 */
export function extractSvgFromTokenURI(tokenURI: string): string {
  const uri = tokenURI.trim();

  if (uri.startsWith("<svg")) return uri;

  if (uri.startsWith("data:image/svg+xml")) {
    return decodeDataUri(uri);
  }

  if (uri.startsWith("data:application/json")) {
    const json = decodeDataUri(uri);
    const meta = JSON.parse(json) as { image?: string };
    if (!meta.image) throw new Error("tokenURI JSON has no `image` field");
    return extractSvgFromTokenURI(meta.image);
  }

  if (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("ipfs://")) {
    // We deliberately do NOT fetch remote URLs. The canonical art is on chain; a remote image is
    // an off-chain cache and is out of scope for this on-chain exporter.
    throw new Error("remote tokenURI is not supported by the on-chain exporter");
  }

  throw new Error("unrecognized tokenURI format");
}

/** Decode a `data:...;base64,` or `data:...;utf8,` / `data:...,` URI to its text payload. */
function decodeDataUri(uri: string): string {
  const comma = uri.indexOf(",");
  if (comma === -1) throw new Error("malformed data URI");
  const header = uri.slice(5, comma); // after "data:"
  const payload = uri.slice(comma + 1);
  if (/;base64/i.test(header)) return base64ToUtf8(payload);
  // utf8 / plain: may be percent-encoded
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

export interface SvgValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Validate an SVG string for safe rasterization. Rejects anything that could execute code or pull
 * a remote resource — both of which would make the "PNG" depend on outside state or run scripts.
 */
export function validateSvg(svg: string): SvgValidation {
  const s = svg.trim();
  if (!s.startsWith("<svg")) return { ok: false, reason: "not an <svg> document" };
  if (!/viewBox\s*=/.test(s) && !/width\s*=/.test(s)) {
    return { ok: false, reason: "missing viewBox/width (cannot size safely)" };
  }
  if (/<script[\s>]/i.test(s)) return { ok: false, reason: "contains <script>" };
  if (/<foreignObject[\s>]/i.test(s)) return { ok: false, reason: "contains <foreignObject>" };
  if (/\bon[a-z]+\s*=/i.test(s)) return { ok: false, reason: "contains inline event handler" };
  // Remote resources: href/src/url() pointing off-box. Allow only inline `data:` and local refs.
  const remote = /(?:href|xlink:href|src)\s*=\s*["']?\s*(?:https?:|\/\/|ipfs:)/i;
  if (remote.test(s)) return { ok: false, reason: "references a remote resource" };
  if (/url\(\s*["']?\s*(?:https?:|\/\/|ipfs:)/i.test(s)) {
    return { ok: false, reason: "CSS url() references a remote resource" };
  }
  return { ok: true };
}

/** Parse a viewBox (preferred) or width/height into pixel dimensions. */
export function parseViewBox(svg: string): { width: number; height: number } | null {
  const vb = svg.match(/viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/i);
  if (vb) {
    const width = Number(vb[3]);
    const height = Number(vb[4]);
    if (width > 0 && height > 0) return { width, height };
  }
  const w = svg.match(/\bwidth\s*=\s*["']?\s*([\d.]+)/i);
  const h = svg.match(/\bheight\s*=\s*["']?\s*([\d.]+)/i);
  if (w && h) {
    const width = Number(w[1]);
    const height = Number(h[1]);
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

export interface Letterbox {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Fit (srcW × srcH) inside (size × size) preserving aspect ratio; return the centered rect. */
export function computeLetterbox(srcW: number, srcH: number, size: number): Letterbox {
  const scale = Math.min(size / srcW, size / srcH);
  const dw = Math.round(srcW * scale);
  const dh = Math.round(srcH * scale);
  const dx = Math.round((size - dw) / 2);
  const dy = Math.round((size - dh) / 2);
  return { dx, dy, dw, dh };
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "art";
}

// ---------------------------------------------------------------------------
// browser-only: rasterize + share/download
// ---------------------------------------------------------------------------

/** Rasterize an SVG string into a PNG Blob of `size`×`size`, letterboxed on a transparent bg. */
export async function rasterizeSvgToPngBlob(svg: string, size: ExportSize): Promise<Blob> {
  const validation = validateSvg(svg);
  if (!validation.ok) throw new Error(`unsafe SVG: ${validation.reason}`);

  const dims = parseViewBox(svg) ?? { width: size, height: size };
  const { dx, dy, dw, dh } = computeLetterbox(dims.width, dims.height, size);

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.clearRect(0, 0, size, size); // transparent background
    ctx.drawImage(img, dx, dy, dw, dh);
    return await canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // The SVG is a local object URL with no remote resources (we validated), so this is same-origin.
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load SVG into an image"));
    img.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob returned null"));
    }, "image/png");
  });
}

/**
 * High-level export: decode/validate/rasterize, then share on mobile or download. Returns which
 * method was used. Never throws for a missing Web Share API — it falls back gracefully.
 */
export async function exportOnchainSvgAsPng(opts: {
  tokenURI?: string;
  svg?: string;
  tokenId: number | string;
  size: ExportSize;
  fileName?: string;
}): Promise<ExportResult> {
  const svg = opts.svg ?? (opts.tokenURI ? extractSvgFromTokenURI(opts.tokenURI) : undefined);
  if (!svg) throw new Error("provide either `svg` or `tokenURI`");

  const blob = await rasterizeSvgToPngBlob(svg, opts.size);
  const fileName = sanitizeFileName(opts.fileName ?? `sigil-${opts.tokenId}-${opts.size}.png`);
  const file = new File([blob], fileName, { type: "image/png" });

  // Mobile-first: use the native share sheet when available and willing to share this file.
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean }) : undefined;
  if (nav?.canShare?.({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file], title: fileName });
      return { method: "share" };
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    // Some mobile browsers ignore the download attribute; opening a new tab is the last resort.
    if ("download" in a) {
      document.body.appendChild(a);
      a.click();
      a.remove();
      return { method: "download" };
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return { method: "newtab" };
  } finally {
    // Revoke on the next tick so the download/navigation can start first.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
