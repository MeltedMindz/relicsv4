// SPDX-License-Identifier: MIT
// Static analysis of generator source. This runs BEFORE anything is executed, so a bundle that
// wants to reach the network, read a clock, or pull in a dependency is refused without ever being
// given a chance to run.
//
// The sandbox is the second line of defence, not the first. These checks exist because "the
// sandbox would have blocked it anyway" is a bad answer to "why did you run attacker code".

import { error, warn } from "./issues.js";
import { LIMITS } from "./limits.js";

/**
 * Identifiers a generator may not mention. Each one is either a network reach, a
 * non-deterministic source, a dependency loader, or an escape from the sandboxed frame.
 */
export const FORBIDDEN_IDENTIFIERS = Object.freeze({
  fetch: "network access",
  XMLHttpRequest: "network access",
  WebSocket: "network access",
  EventSource: "network access",
  navigator: "host environment access",
  window: "host environment access",
  self: "host environment access",
  globalThis: "host environment access",
  document: "host environment access",
  location: "host environment access",
  process: "host environment access",
  require: "dependency loading",
  module: "dependency loading",
  exports: "dependency loading — use `export`",
  __dirname: "host filesystem access",
  __filename: "host filesystem access",
  importScripts: "dependency loading",
  eval: "dynamic code execution",
  Function: "dynamic code execution",
  setTimeout: "asynchrony — a render must be synchronous and reproducible",
  setInterval: "asynchrony — a render must be synchronous and reproducible",
  setImmediate: "asynchrony — a render must be synchronous and reproducible",
  queueMicrotask: "asynchrony — a render must be synchronous and reproducible",
  requestAnimationFrame: "asynchrony — a render must be synchronous and reproducible",
  Worker: "worker escape",
  SharedWorker: "worker escape",
  postMessage: "worker escape",
  MessageChannel: "worker escape",
  Atomics: "shared memory",
  SharedArrayBuffer: "shared memory",
  WebAssembly: "unapproved runtime",
  Proxy: "prototype and trap trickery has no place in a generator",
  Reflect: "prototype and trap trickery has no place in a generator",
  localStorage: "host storage access",
  sessionStorage: "host storage access",
  indexedDB: "host storage access",
  caches: "host storage access",
  crypto: "non-deterministic source",
  performance: "non-deterministic source",
  Date: "non-deterministic source — a render must depend only on its inputs",
  Intl: "locale-dependent output is not reproducible",
  OffscreenCanvas: "canvas is not the art runtime; a generator returns SVG",
  createImageBitmap: "canvas is not the art runtime; a generator returns SVG",
  WebGLRenderingContext: "WebGL is not an approved art runtime",
  WebGL2RenderingContext: "WebGL is not an approved art runtime",
  __proto__: "prototype access",
});

/** Multi-token patterns with their own message. */
const FORBIDDEN_PATTERNS = Object.freeze([
  { re: /\bMath\s*\.\s*random\b/g, code: "GEN_NONDETERMINISM", message: "Math.random() is not reproducible — use the `random` helper the runtime provides, which is seeded" },
  { re: /\bnew\s+Function\b/g, code: "GEN_DYNAMIC_CODE", message: "new Function(...) is dynamic code execution" },
  { re: /\bimport\s*\(/g, code: "GEN_DYNAMIC_IMPORT", message: "dynamic import() is dependency loading" },
  { re: /\bawait\b/g, code: "GEN_ASYNC", message: "a render is synchronous; `await` cannot appear in a generator" },
  { re: /\basync\s+function\b/g, code: "GEN_ASYNC", message: "a render is synchronous; `async function` cannot appear in a generator" },
  { re: /\bwhile\s*\(\s*(true|1)\s*\)/g, code: "GEN_INFINITE_LOOP", message: "`while (true)` is an unbounded loop — bound every loop by a value derived from the inputs" },
  { re: /\bfor\s*\(\s*;\s*;\s*\)/g, code: "GEN_INFINITE_LOOP", message: "`for (;;)` is an unbounded loop — bound every loop by a value derived from the inputs" },
  { re: /(https?|wss?|ftp|ipfs|ipns|ar):\/\//g, code: "GEN_EXTERNAL_URL", message: "a generator cannot reference an external URL; every input arrives through the render context" },
  { re: /\bdata:[a-z]+\/[a-z0-9.+-]+;base64,/gi, code: "GEN_EMBEDDED_BLOB", message: "embedded base64 blobs belong in assets/, not in generator source" },
]);

/**
 * Strips comments so identifier checks look at code only. String and template literals are kept
 * (a forbidden identifier hidden inside a string is still worth reporting), and an ambiguous `/`
 * is treated as ordinary code, which can only make the scan stricter, never laxer.
 * @param {string} source
 */
export function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * @param {string} path
 * @param {string} source
 * @param {{ entry?: boolean, knownPaths?: Set<string> }} [options]
 * @returns {import("./issues.js").Issue[]}
 */
export function analyzeGeneratorSource(path, source, options = {}) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];
  const code = stripComments(source);

  for (const [identifier, reason] of Object.entries(FORBIDDEN_IDENTIFIERS)) {
    const re = new RegExp(`(^|[^A-Za-z0-9_$.])${escapeRe(identifier)}\\b`, "g");
    if (re.test(code)) {
      issues.push(error("GEN_FORBIDDEN_IDENTIFIER", path, `"${identifier}" is not available to a generator (${reason})`));
    }
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(code)) issues.push(error(pattern.code, path, pattern.message));
  }

  // ---- dependency policy -------------------------------------------------------------------
  const importRe = /\bimport\s+(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']/g;
  const exportFromRe = /\bexport\s+[\s\S]*?\bfrom\s*["']([^"']+)["']/g;
  for (const re of [importRe, exportFromRe]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(code)) !== null) {
      const specifier = match[1];
      if (!specifier.startsWith("./")) {
        issues.push(
          error(
            "GEN_DEPENDENCY_REFUSED",
            path,
            `import "${specifier}" is refused — a generator may only import sibling files inside generator/ with a "./name.js" specifier. There is no package resolution and no network fetch at render time.`,
          ),
        );
        continue;
      }
      if (!specifier.endsWith(".js")) {
        issues.push(error("GEN_DEPENDENCY_REFUSED", path, `import "${specifier}" must name a .js file explicitly`));
        continue;
      }
      if (specifier.includes("..")) {
        issues.push(error("GEN_DEPENDENCY_REFUSED", path, `import "${specifier}" escapes generator/`));
        continue;
      }
      if (options.knownPaths) {
        const resolved = `generator/${specifier.slice(2)}`;
        if (!options.knownPaths.has(resolved)) {
          issues.push(error("GEN_DEPENDENCY_MISSING", path, `import "${specifier}" resolves to ${resolved}, which is not in the bundle`));
        }
      }
    }
  }

  if (options.entry) {
    if (!/\bexport\s+function\s+render\b/.test(code) && !/\bexport\s*\{[^}]*\brender\b/.test(code)) {
      issues.push(error("GEN_NO_RENDER_EXPORT", path, "the generator entry must `export function render(context)`"));
    }
    if (!/\bexport\s+const\s+manifest\b/.test(code) && !/\bexport\s*\{[^}]*\bmanifest\b/.test(code)) {
      issues.push(warn("GEN_NO_MANIFEST_EXPORT", path, "the generator entry does not export a `manifest` describing its parameters; the studio will show fewer controls"));
    }
  }

  if (source.length > LIMITS.maxScriptBytes) {
    issues.push(error("GEN_SCRIPT_TOO_LARGE", path, `${source.length} bytes exceeds the ${LIMITS.maxScriptBytes}-byte public script budget`));
  }

  return issues;
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
