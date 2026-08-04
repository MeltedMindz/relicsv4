# Exporting on-chain SVG as PNG

On-chain art lives as an SVG computed inside `tokenURI`. People still want a PNG — for a profile
picture, a print, a social post. This guide shows a **generic, dependency-free** way to rasterize
the canonical on-chain SVG in the browser, safely, while keeping the chain as the source of truth.

Implementation: `apps/web/lib/export-onchain-svg.ts` (+ unit tests) and the drop-in
`apps/web/components/export-png-button.tsx`.

## The canonical source is the chain, not the PNG

Read this first, because it shapes every decision below:

> A browser-exported PNG is a **snapshot** of dynamic on-chain art at one moment. The artwork
> changes as market state changes. The **canonical** artwork is the contract's on-chain
> `tokenURI` — never a PNG, never a marketplace CDN image. Export PNGs for sharing/printing, but
> treat them as derivatives that can go stale, not as the work itself.

For the same reason, this exporter never fetches a remote image (OpenSea CDN, IPFS gateway) as a
source. It rasterizes the SVG you already decoded from the chain.

## Step 1 — decode the tokenURI

`tokenURI(id)` typically returns:

```
data:application/json;base64,<base64 of a JSON object>
```

Decode the base64 to UTF-8, `JSON.parse` it, and read the `image` field, which is itself usually:

```
data:image/svg+xml;base64,<base64 of the SVG document>
```

`extractSvgFromTokenURI` handles all the common shapes — base64 or utf8 JSON, base64 or utf8
SVG, a direct `data:image/svg+xml` URI, or a bare `<svg>` string — and refuses remote
(`http(s)://`, `ipfs://`) URIs, which are out of scope for an on-chain exporter.

## Step 2 — validate the SVG

Before handing an SVG to the browser's image pipeline, `validateSvg` rejects anything unsafe:

- must start with `<svg` and have a `viewBox` (or `width`) so we can size it,
- must NOT contain `<script>`, `<foreignObject>`, or inline `on*=` event handlers,
- must NOT reference any remote resource via `href`/`src`/CSS `url()`.

This matters: a `<canvas>` will happily execute or fetch things an SVG references. Validating keeps
the "PNG" a pure function of on-chain bytes, and avoids `dangerouslySetInnerHTML` entirely — we
never inject the SVG into the DOM as markup; we load it as an image from an object URL.

## Step 3 — rasterize with aspect ratio preserved

```
SVG string
  → new Blob([svg], {type:"image/svg+xml"})
  → URL.createObjectURL(blob)
  → new Image(); img.src = url; await onload
  → <canvas width=size height=size>
  → ctx.drawImage(img, dx, dy, dw, dh)   // letterboxed, never cropped/stretched
  → canvas.toBlob("image/png")
```

`computeLetterbox(srcW, srcH, size)` fits the art's native aspect ratio inside a square `size×size`
canvas and centers it, leaving transparent bars if the art is not square. We never stretch to fill
(which distorts) and never crop to fill (which loses art). Offered sizes: **1024 / 2048 / 4096**.

Every object URL we create is revoked (`URL.revokeObjectURL`) — the SVG URL in a `finally`, the
download URL on a short timer so the download can start first.

## Step 4 — deliver: share on mobile, download on desktop

`exportOnchainSvgAsPng` builds a `File` and:

1. tries the **Web Share API** (`navigator.canShare({ files })` + `navigator.share`) so mobile
   users get the native share sheet;
2. falls back to a hidden `<a download>` click on desktop and browsers without share;
3. falls back again to opening the PNG in a new tab if `download` is unsupported.

It never throws just because Web Share is missing — it degrades.

## The button

`<ExportPngButton tokenId={id} svg={svg} />` (or pass `tokenURI={uri}` to decode for you) renders a
size selector + a button with idle / rendering / success / error states, an `aria-live` status
region for screen readers, and a duplicate-click guard while a render is in flight.

## Testing

The pure helpers (`extractSvgFromTokenURI`, `validateSvg`, `parseViewBox`, `computeLetterbox`,
`base64ToUtf8`, `sanitizeFileName`) are unit-tested in Node — see
`apps/web/tests/unit/export-onchain-svg.test.ts`. The browser-only rasterization is verified
manually / via the Explore page, which wires the button to the local sample sigils.
