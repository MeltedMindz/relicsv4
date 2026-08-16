#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE RESERVED-TERM GATE.
//
//   node scripts/check-reserved-terms.mjs             # human output, non-zero exit on any hit
//   node scripts/check-reserved-terms.mjs --json      # machine output
//   node scripts/check-reserved-terms.mjs --controls  # prove the scanner can both catch and allow
//
// WHY THIS EXISTS
//
// This repository is the PUBLIC starter kit for building on the RELICS launchpad. Other projects
// launch THROUGH the launchpad; they are not part of it, and their names, tickers, supply figures
// and reward schedules are theirs to announce on their own schedule, not ours to leak by carrying
// a half-finished integration branch. One such integration was staged on a working branch and came
// within one `git push` of being published here. This gate is the thing that would have stopped it.
//
// WHY THE PATTERNS ARE ENCODED
//
// A gate that spells out the reserved words would itself put them in the public repository, which
// is the exact outcome it exists to prevent. So the patterns are stored base64-encoded and decoded
// at runtime. That is not obfuscation for its own sake and it is not a security measure -- anyone
// may decode them. It is simply the only way for a public file to describe a term it must not
// contain. The controls below build their fixtures from the DECODED terms at runtime for the same
// reason: a hard-coded must-catch fixture would be a copy of the thing we are refusing to publish.
//
// WHAT IT DELIBERATELY DOES NOT MATCH
//
// Precision matters more than breadth here, because a gate that cries wolf gets switched off.
//   - a bare three-digit run is NOT a hit. Those appear inside sha256 digests, hex blobs and SVG
//     path data throughout the tree, and blocking them would fail the build on arithmetic.
//   - a quote-asset ticker is NOT a hit on its own. Real admitted quote assets are legitimately
//     documented here; only the compound form naming a project alongside one is refused.
// Every pattern below was measured against the published tree and returns zero hits on it. If you
// add a pattern, measure it the same way before committing, or you have shipped a tripwire that
// fires on the repository's own contents.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

// Reserved compound terms, base64. See the header for why these are not written literally.
const RESERVED_B64 = [
  "XCQ2NjY=",
  "NjY2XHMqL1xzKkdNRQ==",
  "NjY2XHMrZWNvbm9taWNz",
  "XGI2NjYwMDBcYg==",
  "NjY2XHMrcm95YWx0",
  "NjY2XHMrcmV3YXJk",
  "NjY2XHMrYWN0aXZhdGlvbg==",
  "NjY2XHMrc3Rha2luZw==",
  "NjY2XHMrdG9rZW4=",
  "c2t1bGw=",
];
const RESERVED = RESERVED_B64.map((b) => new RegExp(Buffer.from(b, "base64").toString("utf8"), "i"));

// Vendored dependencies and generated art are out of scope: we do not author them, and their
// contents are byte-pinned elsewhere. `.git` is excluded because scanning it would read history,
// and history is not what is being published by this commit.
const SKIP_DIR = new Set([".git", "node_modules", "lib", "out", "cache", "dist", ".next", "previews"]);
const EXT = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".md", ".sol", ".yml", ".yaml", ".toml", ".txt", ".sh"];

function collect(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      collect(join(dir, e.name), acc);
    } else if (EXT.some((x) => e.name.endsWith(x))) {
      acc.push(join(dir, e.name));
    }
  }
  return acc;
}

function scan(files) {
  const hits = [];
  for (const abs of files) {
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    text.split(/\r?\n/).forEach((line, i) => {
      // Report the INDEX of the matching pattern, never the matched text: printing the hit would
      // write the reserved term into CI logs, which are public on a public repository.
      const idx = RESERVED.findIndex((re) => re.test(line));
      if (idx !== -1) hits.push({ file: relative(ROOT, abs), line: i + 1, pattern: idx });
    });
  }
  return hits;
}

if (CONTROLS) {
  // A scanner nobody has watched fail is not evidence. Both directions are exercised, and the
  // must-catch fixtures are BUILT FROM the decoded patterns so this file still contains none.
  let caught = 0;
  let wrong = 0;
  RESERVED.forEach((re, i) => {
    const probe = Buffer.from(RESERVED_B64[i], "base64")
      .toString("utf8")
      .replace(/\\s\*/g, " ")
      .replace(/\\s\+/g, " ")
      .replace(/\\b/g, "")
      .replace(/\\\$/g, "$");
    if (re.test(probe)) caught += 1;
    else {
      wrong += 1;
      console.log(`  MISSED  pattern ${i} does not match its own decoded form`);
    }
  });
  // Must-allow: the shapes that made a naive scanner unusable. A digest that happens to contain the
  // digit run, and a genuine quote-asset ticker documented on its own.
  const allow = [
    '"sha256": "eebdbc1b6e431072ce5521b9e1b603d43831e3b6e062743e6665e070d5cf8a1a"',
    "GME is an admitted quote asset on Robinhood Chain.",
    "erc721MaxSupply: 10000",
    '<path d="M6 6 6 66 666 6" />',
  ];
  let falsePositives = 0;
  for (const s of allow) {
    if (RESERVED.some((re) => re.test(s))) {
      falsePositives += 1;
      console.log(`  FALSE POSITIVE on a permitted shape: ${s.slice(0, 60)}`);
    }
  }
  console.log(`RESERVED_TERM_CONTROLS_CAUGHT=${caught}/${RESERVED.length}`);
  console.log(`RESERVED_TERM_CONTROL_FALSE_POSITIVES=${falsePositives}`);
  const ok = wrong === 0 && falsePositives === 0;
  console.log(`RESERVED_TERM_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

const files = collect(ROOT);

// INPUT FLOOR. A scan that reached nothing must refuse, not pass. Absence of input is not success:
// a mis-set root or an over-broad skip list would otherwise report a clean tree it never read.
const FLOOR = 150;
if (files.length < FLOOR) {
  console.error(`reserved-term gate: scanned only ${files.length} files (floor ${FLOOR}) -- refusing rather than reporting a pass it did not earn.`);
  process.exit(1);
}

const hits = scan(files);

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: files.length, hits: hits.length, findings: hits }, null, 2));
} else {
  console.log(`reserved-term gate: scanned ${files.length} files`);
  for (const h of hits) console.log(`  RESERVED TERM  ${h.file}:${h.line}  (pattern ${h.pattern})`);
  console.log(`RESERVED_TERM_HITS=${hits.length}`);
  console.log(`RESERVED_TERM_GATE=${hits.length === 0 ? "PASS" : "FAIL"}`);
}

if (hits.length) {
  console.error("");
  console.error("A reserved term reached the public tree. This is not a formatting problem:");
  console.error("another project's identity would be published by this commit, ahead of its own");
  console.error("announcement. Remove the content -- do not add an exemption, and do not weaken a");
  console.error("pattern to make this pass.");
  process.exit(1);
}
