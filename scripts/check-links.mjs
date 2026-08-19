#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// LINK CHECKER — internal by default and offline, external only when asked.
//
//   node scripts/check-links.mjs              internal only. No network. This is the CI gate.
//   node scripts/check-links.mjs --external   also resolve http(s) links, with retries.
//
// WHY THE TWO ARE SEPARATE COMMANDS
// ---------------------------------
// An internal link is a fact about this repository: it is either right or it is a bug, and checking
// it is deterministic, instant and offline. An external link depends on someone else's uptime, rate
// limiting and bot policy, so folding the two together produces a gate that fails for reasons no
// commit caused — and a gate that goes red for reasons nobody controls is a gate people learn to
// ignore, which then also stops catching the internal breakage it was good at.
//
// WHAT "INTERNAL" COVERS. Not just file existence:
//
//   files     a relative target resolves to a file that exists
//   anchors   `guide.md#section` and bare `#section` resolve to a heading in the target document,
//             slugged the way GitHub slugs headings. A link to a section that was renamed lands the
//             reader at the top of a long page with no error — the most common broken link that
//             does not look broken.
//   assets    images and other referenced assets exist
//   templates a `--template <id>` named in prose is a template the kit actually ships
//   commands  an `npm run <script>` named in prose is a script package.json actually defines
//
// Emits README_INTERNAL_LINKS_BROKEN as a COUNT.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join, relative } from "node:path";

const ROOT = process.cwd();
const ROOT_DOCS = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "AGENTS.md", "CLAUDE.md", "CODE_OF_CONDUCT.md", "THIRD_PARTY_NOTICES.md", "PUBLIC_EXPORT_ALLOWLIST.md", "NO_PRIVATE_DATA_ATTESTATION.md"];

/**
 * External hosts that are allowed to fail without failing the run.
 *
 * Each entry needs a REASON, because an allowlist without one becomes the place broken links go to
 * be forgotten. These are hosts that refuse automated requests by policy — the link is fine in a
 * browser and unresolvable from CI, which is a fact about the host, not about the link.
 */
const EXTERNAL_ALLOWLIST = [
  { host: "x.com", why: "serves a login wall to non-browser clients" },
  { host: "twitter.com", why: "serves a login wall to non-browser clients" },
  { host: "opensea.io", why: "bot-protected; returns 403 to automated requests" },
  { host: "app.uniswap.org", why: "client-rendered app; a HEAD says nothing about the route" },
];

const EXTERNAL_RETRIES = 3;
const EXTERNAL_TIMEOUT_MS = 10_000;

function collectMarkdown(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectMarkdown(full, out);
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

const files = [...ROOT_DOCS.filter((f) => existsSync(f)), ...collectMarkdown("docs")];

/**
 * GitHub's heading slug: lowercase, strip anything that is not a word character, whitespace or a
 * hyphen, then replace EACH remaining whitespace character with a hyphen.
 *
 * "each", not "each run", and the difference is not cosmetic. `Recipient — the project` loses the em
 * dash and keeps the two spaces that surrounded it, so GitHub produces `recipient--the-project`
 * with a double hyphen. Collapsing whitespace first produces a single hyphen, and every heading
 * containing a dash-separated clause — which in this repository is most of them — then reads as a
 * broken anchor that is not broken. That false-positive shape is worse than no anchor checking at
 * all: it trains a reader to dismiss the checker's output.
 */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");
}

/** Every anchor a Markdown file offers: heading slugs plus explicit `<a id>`/`name` targets. */
const anchorCache = new Map();
function anchorsOf(path) {
  if (anchorCache.has(path)) return anchorCache.get(path);
  const anchors = new Set();
  if (existsSync(path) && path.endsWith(".md")) {
    const text = readFileSync(path, "utf8");
    let inFence = false;
    for (const line of text.split("\n")) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
      if (heading) {
        const base = slug(heading[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"));
        // GitHub disambiguates repeats with -1, -2, …
        let candidate = base;
        let n = 1;
        while (anchors.has(candidate)) candidate = `${base}-${n++}`;
        anchors.add(candidate);
      }
      for (const m of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(m[1]);
    }
  }
  anchorCache.set(path, anchors);
  return anchors;
}

const templates = existsSync("packages/creator-cli/templates")
  ? new Set(readdirSync("packages/creator-cli/templates", { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name))
  : new Set();

const scripts = existsSync("package.json") ? new Set(Object.keys(JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {})) : new Set();

const broken = [];
const external = new Map();
let checked = 0;

/** Text with fenced code blocks removed, so an illustrative link inside an example is not a claim. */
function withoutFences(text) {
  return text.replace(/```[\s\S]*?```/g, (block) => "\n".repeat(block.split("\n").length - 1));
}

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const prose = withoutFences(raw);

  // ---- links and images ----------------------------------------------------------------------
  for (const m of prose.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1].trim();
    if (!target || /^(mailto:|data:|tel:)/.test(target)) continue;

    if (/^https?:/.test(target)) {
      external.set(target, [...(external.get(target) ?? []), file]);
      continue;
    }

    checked += 1;
    const [pathPart, anchor] = target.split("#");

    if (!pathPart) {
      // A same-document anchor.
      if (anchor && !anchorsOf(file).has(anchor)) broken.push(`${file} -> #${anchor} (no such heading in this file)`);
      continue;
    }

    const resolved = resolve(dirname(file), pathPart.split("?")[0]);
    if (!existsSync(resolved)) {
      broken.push(`${file} -> ${target} (no such file)`);
      continue;
    }
    if (anchor && resolved.endsWith(".md") && !anchorsOf(resolved).has(anchor)) {
      // The link that does not look broken: it opens the right document at the wrong place.
      broken.push(`${file} -> ${target} (${relative(ROOT, resolved)} has no heading "#${anchor}")`);
    }
  }

  // ---- referenced templates --------------------------------------------------------------------
  for (const m of raw.matchAll(/--template\s+([a-z0-9][a-z0-9-]*)/g)) {
    if (templates.size === 0) break;
    checked += 1;
    if (!templates.has(m[1])) broken.push(`${file} -> --template ${m[1]} (the kit ships: ${[...templates].sort().join(", ")})`);
  }

  // ---- referenced npm scripts --------------------------------------------------------------------
  for (const m of raw.matchAll(/npm run ([a-z0-9:_-]+)/g)) {
    if (scripts.size === 0) break;
    checked += 1;
    if (!scripts.has(m[1])) broken.push(`${file} -> npm run ${m[1]} (package.json defines no such script)`);
  }
}

console.log("");
console.log(`  ${checked} internal reference(s) across ${files.length} file(s): links, anchors, assets, templates and npm scripts`);
for (const b of broken) console.log(`  BROKEN  ${b}`);
console.log("");
console.log(`README_INTERNAL_LINKS_BROKEN=${broken.length}`);

if (!process.argv.includes("--external")) {
  console.log(`  ${external.size} external link(s) not checked — run with --external (network required)`);
  process.exitCode = broken.length === 0 ? 0 : 1;
} else {
  await checkExternal();
}

async function checkExternal() {
  const allowed = (url) => EXTERNAL_ALLOWLIST.find((a) => new URL(url).hostname.endsWith(a.host));
  const failures = [];
  let skipped = 0;

  console.log("");
  console.log(`  resolving ${external.size} external link(s), ${EXTERNAL_RETRIES} attempts each`);

  for (const [url, sources] of external) {
    const allow = allowed(url);
    if (allow) {
      skipped += 1;
      continue;
    }
    let ok = false;
    let last = "";
    for (let attempt = 1; attempt <= EXTERNAL_RETRIES && !ok; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
        // HEAD first (cheap); some hosts only answer GET, so fall back once.
        let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
        if (response.status === 405 || response.status === 403) response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) ok = true;
        else last = `HTTP ${response.status}`;
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
      if (!ok && attempt < EXTERNAL_RETRIES) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    if (!ok) failures.push(`${url} (${last}) referenced by ${sources.join(", ")}`);
  }

  for (const f of failures) console.log(`  UNREACHABLE  ${f}`);
  console.log("");
  console.log(`EXTERNAL_LINKS_CHECKED=${external.size - skipped}`);
  console.log(`EXTERNAL_LINKS_UNREACHABLE=${failures.length}`);
  console.log(`EXTERNAL_LINKS_ALLOWLISTED=${skipped}${skipped > 0 ? ` (${EXTERNAL_ALLOWLIST.map((a) => `${a.host}: ${a.why}`).join("; ")})` : ""}`);
  process.exitCode = broken.length === 0 && failures.length === 0 ? 0 : 1;
}
