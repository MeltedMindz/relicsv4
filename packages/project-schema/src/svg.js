// SPDX-License-Identifier: MIT
// Output inspection. A generator returns an SVG string; that string ends up rendered in a
// creator's browser, in the studio preview, and eventually in marketplace surfaces. An SVG is a
// document, not an image — it can carry script, load remote resources, and declare entities — so
// every render output is inspected before anything displays it.

import { LIMITS } from "./limits.js";
import { error, warn } from "./issues.js";

const DANGEROUS = Object.freeze([
  { re: /<\s*script\b/i, code: "SVG_SCRIPT", message: "the output contains a <script> element" },
  { re: /<\s*foreignObject\b/i, code: "SVG_FOREIGN_OBJECT", message: "the output contains <foreignObject>, which embeds arbitrary HTML" },
  { re: /<\s*iframe\b/i, code: "SVG_IFRAME", message: "the output contains an <iframe>" },
  { re: /<\s*(embed|object|audio|video)\b/i, code: "SVG_EMBED", message: "the output embeds external media" },
  { re: /<!ENTITY\b/i, code: "SVG_ENTITY", message: "the output declares an XML entity (entity expansion and external entity attacks start here)" },
  { re: /<!DOCTYPE\b/i, code: "SVG_DOCTYPE", message: "the output declares a DOCTYPE; a render returns a bare <svg> element" },
  { re: /\son[a-z]+\s*=/i, code: "SVG_EVENT_HANDLER", message: "the output carries an inline event handler attribute" },
  { re: /javascript\s*:/i, code: "SVG_JAVASCRIPT_URL", message: "the output contains a javascript: URL" },
  { re: /(https?|ftp|ws|wss|ipfs|ipns|ar):\/\//i, code: "SVG_EXTERNAL_REFERENCE", message: "the output references an external URL; a render must be self-contained" },
  { re: /<\s*(use|image)\b[^>]*\b(xlink:)?href\s*=\s*["'](?!#)/i, code: "SVG_EXTERNAL_REFERENCE", message: "the output references a resource outside the document" },
]);

/**
 * The two W3C namespace declarations every SVG carries. They are XML identifiers, not fetches —
 * no renderer ever requests them — so they are removed before the URL scan runs. Nothing else
 * gets an exemption.
 */
const NAMESPACE_DECLARATIONS = /\sxmlns(:xlink)?\s*=\s*["']http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink)["']/g;

/** @param {string} output */
export function stripNamespaceDeclarations(output) {
  return output.replace(NAMESPACE_DECLARATIONS, " ");
}

/**
 * @param {string} where
 * @param {unknown} output
 * @returns {import("./issues.js").Issue[]}
 */
export function inspectRenderOutput(where, output) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];

  if (typeof output !== "string") {
    return [error("RENDER_OUTPUT_TYPE", where, `render must return an SVG string (got ${output === null ? "null" : typeof output})`)];
  }
  const trimmed = output.trim();
  if (trimmed.length === 0) return [error("RENDER_BLANK", where, "render returned an empty string")];
  if (trimmed.length < LIMITS.minRenderOutputBytes) {
    return [error("RENDER_BLANK", where, `render returned only ${trimmed.length} characters, which cannot be a drawn artwork`)];
  }
  if (output.length > LIMITS.maxRenderOutputBytes) {
    issues.push(error("RENDER_TOO_LARGE", where, `render returned ${output.length} characters (limit ${LIMITS.maxRenderOutputBytes})`));
  }
  if (!/^<svg[\s>]/i.test(trimmed)) {
    issues.push(error("RENDER_NOT_SVG", where, "render output must start with a <svg> element"));
  }
  if (!/<\/svg\s*>$/i.test(trimmed)) {
    issues.push(error("RENDER_NOT_SVG", where, "render output must end with a closing </svg> tag"));
  }

  const scannable = stripNamespaceDeclarations(output);
  for (const rule of DANGEROUS) {
    if (rule.re.test(scannable)) issues.push(error(rule.code, where, rule.message));
  }

  // A render that draws nothing visible is technically valid SVG and useless as art.
  const drawn = (output.match(/<(path|rect|circle|ellipse|line|polyline|polygon|text|g)\b/gi) ?? []).length;
  if (drawn === 0) issues.push(error("RENDER_BLANK", where, "render output contains no drawable elements"));
  else if (drawn < 2) issues.push(warn("RENDER_SPARSE", where, `render output contains only ${drawn} drawable element`));

  return issues;
}

/** Cheap structural fingerprint used to tell "different seeds produced different art" apart. */
export function outputFingerprint(output) {
  return typeof output === "string" ? output.replace(/\s+/g, " ").trim() : "";
}
