import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base64ToUtf8,
  extractSvgFromTokenURI,
  validateSvg,
  parseViewBox,
  computeLetterbox,
  sanitizeFileName,
} from "../../lib/export-onchain-svg.ts";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><rect width="500" height="500" fill="#000"/></svg>';

function jsonTokenURI(svg: string): string {
  const image = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  const json = JSON.stringify({ name: "Example Sigil #1", image });
  return "data:application/json;base64," + Buffer.from(json).toString("base64");
}

test("base64ToUtf8 round-trips UTF-8", () => {
  const s = "hello — sigil ✦";
  assert.equal(base64ToUtf8(Buffer.from(s, "utf8").toString("base64")), s);
});

test("extractSvgFromTokenURI decodes a base64 JSON tokenURI", () => {
  assert.equal(extractSvgFromTokenURI(jsonTokenURI(SVG)), SVG);
});

test("extractSvgFromTokenURI decodes a direct base64 SVG data URI", () => {
  const uri = "data:image/svg+xml;base64," + Buffer.from(SVG).toString("base64");
  assert.equal(extractSvgFromTokenURI(uri), SVG);
});

test("extractSvgFromTokenURI accepts a bare svg string", () => {
  assert.equal(extractSvgFromTokenURI(`  ${SVG}`), SVG);
});

test("extractSvgFromTokenURI decodes utf8 JSON with utf8 SVG image", () => {
  const image = "data:image/svg+xml;utf8," + encodeURIComponent(SVG);
  const json = "data:application/json;utf8," + encodeURIComponent(JSON.stringify({ image }));
  assert.equal(extractSvgFromTokenURI(json), SVG);
});

test("extractSvgFromTokenURI refuses remote URIs", () => {
  assert.throws(() => extractSvgFromTokenURI("https://example.com/art.png"));
  assert.throws(() => extractSvgFromTokenURI("ipfs://Qm.../art.svg"));
});

test("validateSvg accepts a clean svg", () => {
  assert.equal(validateSvg(SVG).ok, true);
});

test("validateSvg rejects scripts, handlers, remote refs, and missing viewBox", () => {
  assert.equal(validateSvg('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>').ok, false);
  assert.equal(validateSvg('<svg viewBox="0 0 1 1" onload="x()"></svg>').ok, false);
  assert.equal(
    validateSvg('<svg viewBox="0 0 1 1"><image href="https://evil/x.png"/></svg>').ok,
    false,
  );
  assert.equal(
    validateSvg('<svg viewBox="0 0 1 1"><rect fill="url(https://evil/x)"/></svg>').ok,
    false,
  );
  assert.equal(validateSvg("<svg></svg>").ok, false); // no viewBox/width
  assert.equal(validateSvg("<div>not svg</div>").ok, false);
});

test("parseViewBox reads viewBox then width/height", () => {
  assert.deepEqual(parseViewBox(SVG), { width: 500, height: 500 });
  assert.deepEqual(parseViewBox('<svg width="300" height="150"></svg>'), { width: 300, height: 150 });
  assert.equal(parseViewBox("<svg></svg>"), null);
});

test("computeLetterbox preserves aspect ratio and centers", () => {
  // Square art fills a square canvas exactly.
  assert.deepEqual(computeLetterbox(500, 500, 1024), { dx: 0, dy: 0, dw: 1024, dh: 1024 });
  // Wide art (2:1) letterboxes with vertical bars.
  const lb = computeLetterbox(400, 200, 1000);
  assert.equal(lb.dw, 1000);
  assert.equal(lb.dh, 500);
  assert.equal(lb.dx, 0);
  assert.equal(lb.dy, 250);
});

test("sanitizeFileName strips unsafe characters but keeps dots/dashes", () => {
  assert.equal(sanitizeFileName("sigil #1/../x.png"), "sigil-1-..-x.png");
  assert.equal(sanitizeFileName("///"), "art");
});
