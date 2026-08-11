#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE STALE-ALLOCATION GATE.
//
//   node scripts/check-economics.mjs            # human output, non-zero exit on any active claim
//   node scripts/check-economics.mjs --json     # machine output
//
// Two jobs, both of which exist because of the same failure mode: a number asserted in one place
// and restated in five survives a change to it.
//
//   1. RETIRED CLAIMS. Nothing in the working tree may still assert the pre-RC3 allocation
//      (buyback = 25% of the platform share, 6.25% of collected fees, 18.75% retained) unless the
//      file carries an explicit supersession header. The three counters this reports are
//      contractual and are checked BY NAME:
//        ACTIVE_STALE_BUYBACK_25_PERCENT_OF_PLATFORM_CLAIMS
//        ACTIVE_STALE_EFFECTIVE_6_25_PERCENT_CLAIMS
//        ACTIVE_STALE_RETAINED_18_75_PERCENT_CLAIMS
//
//   2. SINGLE SOURCE. The current numbers may be DECLARED only in
//      packages/project-schema/src/economics.js. Any other file that types the live bps or a
//      rendered percentage is a second source of truth, and next time the constant moves it will
//      be the one that does not.
//
// The claim patterns themselves come from `RETIRED_ALLOCATION_CLAIMS` in the schema package, so
// this scanner holds no copy of them either.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  RETIRED_ALLOCATION_CLAIMS,
  hasSupersessionBanner,
  scanTextForRetiredClaims,
  RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE,
  PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE,
  NOMINAL_ALLOCATION_BPS,
  NOMINAL_ALLOCATION_PERCENT,
} from "../packages/project-schema/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");

/** The one file allowed to DECLARE the live constants. */
const DECLARATION_SITE = join("packages", "project-schema", "src", "economics.js");

/** Files whose whole purpose is to check these rules; they necessarily name the numbers. */
const RULE_FILES = new Set([
  join("scripts", "check-economics.mjs"),
  join("packages", "project-schema", "test", "run.mjs"),
  // The declaration site itself: it names the retired values in the amendment note that records
  // what moved, and it holds the retired-claim patterns the scanner reads.
  join("packages", "project-schema", "src", "economics.js"),
]);

const SKIP_DIRS = new Set(["node_modules", ".git", "lib", "out", "cache", "output", "submissions", ".next", "dist", "broadcast"]);
const SCAN_EXTENSIONS = new Set([".md", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".sol", ".yml", ".yaml", ".txt"]);

/** Generated digests-of-everything files: content is hashes, not claims. */
const SKIP_FILES = new Set(["PUBLIC_EXPORT_MANIFEST.json", "package-lock.json", "foundry.lock"]);

function* walk(dir) {
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile()) yield full;
  }
}

function scannable(rel) {
  const base = rel.split(sep).pop();
  if (SKIP_FILES.has(base)) return false;
  if (rel.startsWith(join("packages", "project-schema", "fixtures") + sep)) return false;
  return SCAN_EXTENSIONS.has(extname(rel));
}

// ---------------------------------------------------------------------------------------------

// The MATCHER lives in the schema package (`scanTextForRetiredClaims`) so both repositories' gates
// share one implementation — per-line, counter-name-stripped, raw + normalised. This file only
// keeps the per-claim tally.
const retired = RETIRED_ALLOCATION_CLAIMS.map((c) => ({ ...c, hits: [], superseded: [] }));
const byId = new Map(retired.map((c) => [c.id, c]));

/**
 * Live-value declarations outside the one declaration site. Deliberately narrow: it fires on the
 * SHAPE of a declaration (a named constant, a bps assignment, a rendered percentage in prose), not
 * on the digits appearing anywhere — "5000" is a perfectly ordinary number.
 */
const liveDeclarations = [
  {
    id: "LIVE_BUYBACK_BPS_LITERAL",
    regex: new RegExp(`RELICS_BUYBACK_BPS(?:_OF_PLATFORM_SHARE)?\\s*[=:]\\s*${RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE}|relicsBuybackBps\\s*[=:]\\s*${RELICS_BUYBACK_BPS_OF_PLATFORM_SHARE}`, "gi"),
    description: "declares the live buyback bps instead of importing it",
  },
  {
    id: "LIVE_NOMINAL_BPS_LITERAL",
    regex: new RegExp(`(?:relicsBuybackReserve|platformTreasury|buybackBps|retainedBps)\\s*[=:]\\s*(?:${NOMINAL_ALLOCATION_BPS.relicsBuybackReserve}|${PLATFORM_RETAINED_BPS_OF_PLATFORM_SHARE})\\b`, "gi"),
    description: "declares a live nominal bps instead of deriving it",
  },
  {
    id: "LIVE_PERCENT_LITERAL",
    // A rendered percentage assigned to a constant, e.g. `SHARE_LABEL = "12.50%"`.
    regex: new RegExp(`[A-Za-z_$][\\w$]*\\s*[=:]\\s*["'\`]\\s*(?:${NOMINAL_ALLOCATION_PERCENT.relicsBuybackReserve.replace(".", "\\.")}|50\\.00%)\\s*["'\`]`, "gi"),
    description: "hardcodes a rendered percentage instead of deriving it from bps",
  },
];
for (const d of liveDeclarations) d.hits = [];

let filesScanned = 0;
for (const abs of walk(ROOT)) {
  const rel = relative(ROOT, abs);
  if (!scannable(rel)) continue;
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  filesScanned++;
  const isSuperseded = hasSupersessionBanner(text);
  const isRuleFile = RULE_FILES.has(rel);

  if (!isRuleFile) {
    const grouped = new Map();
    for (const hit of scanTextForRetiredClaims(text)) {
      if (!grouped.has(hit.id)) grouped.set(hit.id, []);
      grouped.get(hit.id).push(hit);
    }
    for (const [id, hits] of grouped) {
      const claim = byId.get(id);
      if (!claim) continue;
      const record = { file: rel, count: hits.length, samples: hits.slice(0, 3).map((h) => `L${h.line}: ${h.sample}`) };
      if (isSuperseded) claim.superseded.push(record);
      else claim.hits.push(record);
    }
  }

  if (rel === DECLARATION_SITE || isRuleFile) continue;
  for (const d of liveDeclarations) {
    d.regex.lastIndex = 0;
    const found = [...text.matchAll(d.regex)];
    if (found.length > 0) d.hits.push({ file: rel, count: found.length, samples: found.slice(0, 3).map((m) => m[0].trim()) });
  }
}

// ---------------------------------------------------------------------------------------------

const counters = Object.fromEntries(retired.map((c) => [c.counter, c.hits.reduce((n, h) => n + h.count, 0)]));
const duplicateSources = liveDeclarations.filter((d) => d.hits.length > 0);
const activeTotal = Object.values(counters).reduce((a, b) => a + b, 0);
const ok = activeTotal === 0 && duplicateSources.length === 0;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        ok,
        filesScanned,
        counters,
        supersededOnly: Object.fromEntries(retired.map((c) => [c.id, c.superseded])),
        activeClaims: Object.fromEntries(retired.map((c) => [c.id, c.hits])),
        duplicateSources: duplicateSources.map((d) => ({ id: d.id, description: d.description, hits: d.hits })),
        declarationSite: DECLARATION_SITE,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`economics gate — ${filesScanned} files scanned; the allocation is declared once, in ${DECLARATION_SITE}\n`);
  for (const claim of retired) {
    const n = counters[claim.counter];
    console.log(`  ${n === 0 ? "PASS" : "FAIL"}  ${claim.counter}=${n}   (${claim.description})`);
    for (const hit of claim.hits) console.log(`          ${hit.file}  x${hit.count}  ${hit.samples.join(" | ")}`);
    if (claim.superseded.length > 0) {
      console.log(`          ${claim.superseded.length} superseded-header file(s) allowed to keep it: ${claim.superseded.map((s) => s.file).join(", ")}`);
    }
  }
  console.log("");
  if (duplicateSources.length === 0) {
    console.log("  PASS  no second declaration of the live constants");
  } else {
    for (const d of duplicateSources) {
      console.log(`  FAIL  ${d.id} — ${d.description}`);
      for (const hit of d.hits) console.log(`          ${hit.file}  x${hit.count}  ${hit.samples.join(" | ")}`);
    }
  }
  console.log("");
  console.log(ok ? "economics gate PASS" : "economics gate FAIL");
}

process.exitCode = ok ? 0 : 1;
