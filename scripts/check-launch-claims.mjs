#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE "LAUNCHABLE TODAY" GATE — a document may not answer a question the protocol answers no.
//
//   node scripts/check-launch-claims.mjs             # human output, non-zero exit on any hit
//   node scripts/check-launch-claims.mjs --json      # machine output
//   node scripts/check-launch-claims.mjs --controls  # prove it can catch and can allow
//
// WHY THIS EXISTS
//
// `npm run kit:status` printed "Public creator launches are closed on every generation and every
// chain" -- true at the time -- while README.md and AGENTS.md both carried a table column headed **"Launchable today?"**
// answering **yes** for one template — and README then said the opposite of its own table 170
// lines further down. AGENTS.md instructed agents to run `kit:status` and never describe a chain
// as publicly open, and then its own table did.
//
// The intended meaning was defensible ("this is the runtime the launchpad will bind first"). The
// column literally asked *today*, and today the answer is no for every template on every chain.
//
// SO THE RULE IS DERIVED, NOT TYPED. This gate asks the deployment records the same question
// `relics status` asks — `acceptsPublicLaunches(chainId, generation)` across every chain and every
// generation — and only then decides what the documents are allowed to say.
//
// WHEN A CHAIN OPENS, THE PREMISE MOVES AND THE GATE DEMANDS A REVIEW — ONCE, PINNED TO THE COUNT.
// The first version exited non-zero forever after any chain opened, which is a gate that has to be
// edited to go green and therefore a gate people edit without reading. Instead the reviewed count
// is recorded below. While the observed count matches it, the scan keeps running and keeps failing
// on an unqualified claim. When the count MOVES AGAIN — another chain opening, or one that never
// should have — the acknowledgement no longer describes reality and the gate hard-stops for a fresh
// review. An acknowledgement that cannot expire is a comment, not a control.
//
// WHY THE SCAN STILL RUNS WITH A CHAIN OPEN. "Launchable today" collapses two independent yeses:
// a runtime a launch will bind (`LAUNCHABLE_ART_RUNTIMES`, one entry) and a chain whose factory is
// open (one of four). A column asking the collapsed question is misleading in the new world for the
// same reason it was in the old one — it now answers "yes" for a combination most readers are not
// in — so the header stays refused and the honest answer stays two facts, stated separately.
//
// WHAT IS DELIBERATELY STILL ALLOWED. "Approved is not the same as launchable", "not launchable
// yet", "preview only" — every sentence that draws the distinction rather than collapsing it. The
// gate is about affirmative claims, and a repository that could not discuss the word would have to
// stop explaining the thing that matters most.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { acceptsPublicLaunches, PLATFORM_GENERATION_IDS, SUPPORTED_CHAIN_IDS } from "../packages/project-schema/index.js";

/**
 * THE REVIEW, PINNED TO THE FACT IT REVIEWED.
 *
 * `REVIEWED_OPEN_PAIRS` is how many chain/generation pairs accepted public launches when the tree's
 * launchability claims were last read end to end. It is not a threshold and not a maximum: any
 * disagreement in either direction stops the gate, because a pair closing is as much a change of
 * premise as a pair opening.
 */
const REVIEWED_OPEN_PAIRS = 3;
const REVIEWED_AT = "2026-08-21";
const REVIEWED_NOTE =
  "RC6 is PUBLIC on Ethereum (1), Base (8453) and Robinhood Chain (4663) -- launchAccessState() reads 1 on all three, read live 2026-08-21 -- and the kit now publishes their addresses. Every launchability claim in README.md, AGENTS.md, PUBLIC_EXPORT_ALLOWLIST.md, docs/launchpad/** and docs/creator-kit/** was re-read against that: the deployment tables, the status banners, the FAQ, the creator flow, the CLI status and export output, and the two hook generations. The framing is unchanged and still binds -- launchability is a RUNTIME question (LAUNCHABLE_ART_RUNTIMES is SOLIDITY_SVG alone) crossed with a CHAIN question (`relics status`), and no surface may state either half as if it were both -- and it matters MORE now, not less, because three of the four chains answer yes to the chain half.";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

/** The same question `relics status` asks, over the same records. */
function openChainCount() {
  let open = 0;
  for (const generation of PLATFORM_GENERATION_IDS) {
    for (const chainId of SUPPORTED_CHAIN_IDS) if (acceptsPublicLaunches(chainId, generation)) open += 1;
  }
  return open;
}

/**
 * An affirmative launchability claim, in the two shapes that actually shipped.
 *
 * 1. A MARKDOWN TABLE COLUMN asking the question. `| Template | … | Launchable today |` is a
 *    column whose honest content today is "no" in every row, which makes it a column that should
 *    not exist. The header is the hit, not the cell, because a header promising a per-row answer
 *    is the thing that misleads even when a row is careful.
 * 2. PROSE pairing the claim with a yes on the same line.
 */
const TABLE_HEADER_RE = /^\s*\|.*\|\s*\**\s*launchable(\s+today)?\s*\??\s*\**\s*\|/i;
const PROSE_RE = /launchable\s+today[^.\n]{0,80}\byes\b|\byes\b[^.\n]{0,40}launchable\s+today/i;

/**
 * Shapes that draw the distinction instead of collapsing it. Checked BEFORE the rules above, so a
 * sentence explaining that nothing is launchable can never be read as claiming something is.
 */
const ALLOW_RE = [
  /\bnot\s+launchable\b/i,
  /\bnever\s+.{0,30}launchable\b/i,
  /\bis\s+not\s+the\s+same\s+as\s+launchable\b/i,
  /\bapproved\s+(is|and)\s+.{0,20}launchable\b/i,
  /\bpreview\s+only\b/i,
  /\bcannot\s+(be\s+)?launch/i,
  /\banswer\s+(today\s+)?is\s+no\b/i,
  /\bno\s+for\s+all\s+five\b/i,
  // This file names the shapes in order to refuse them.
  /check-launch-claims/i,
];

const SKIP_DIRS = new Set([".git", "node_modules", "lib", "out", "cache", "dist", ".next", "previews", "broadcast", "submissions"]);
const SCAN_EXT = new Set([".md", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yml", ".yaml"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(abs);
    else if (SCAN_EXT.has(extname(entry))) yield abs;
  }
}

/** @returns {{file:string, line:number, rule:string, text:string}[]} */
function scanLine(rel, line, i, hits) {
  if (ALLOW_RE.some((re) => re.test(line))) return hits;
  if (TABLE_HEADER_RE.test(line)) hits.push({ file: rel, line: i + 1, rule: "LAUNCHABLE_COLUMN", text: line.trim().slice(0, 120) });
  else if (PROSE_RE.test(line)) hits.push({ file: rel, line: i + 1, rule: "LAUNCHABLE_TODAY_YES", text: line.trim().slice(0, 120) });
  return hits;
}

function scanTree() {
  const hits = [];
  let files = 0;
  for (const abs of walk(ROOT)) {
    const rel = relative(ROOT, abs);
    // This file carries the must-catch fixtures, so it necessarily contains the shapes it refuses.
    // Declared here rather than pattern-matched away, so the exemption is one named file and not a
    // loophole any document could claim.
    if (rel === join("scripts", "check-launch-claims.mjs")) continue;
    files += 1;
    const text = readFileSync(abs, "utf8");
    text.split(/\r?\n/).forEach((line, i) => scanLine(rel, line, i, hits));
  }
  // INPUT FLOOR. A scan that reached nothing must refuse, not pass.
  if (files < 100) {
    console.error(`launch-claims gate: scanned only ${files} files (floor 100) — refusing rather than reporting a pass it did not earn.`);
    process.exit(1);
  }
  return { files, hits };
}

if (CONTROLS) {
  const mustCatch = [
    "| Template | Runtime | Market-responsive | Launchable today |",
    "| id | runtime | launchable today? | use it when |",
    "The solidity-svg-params template is launchable today: yes.",
    "| id | runtime | **Launchable** | notes |",
  ];
  const mustAllow = [
    "**Approved is not the same as launchable.** Both runtimes are approved.",
    "runtime ONCHAIN_JAVASCRIPT_V1 — preview only; this runtime is not bound by a launch yet",
    "They are real, valid projects that cannot be launched yet.",
    '**Nothing in that last column says "launchable today", because today the answer is no for all five.**',
    "| Template | Runtime | Market-responsive | Runtime the launchpad binds first |",
  ];
  let caught = 0;
  for (const s of mustCatch) {
    const hits = scanLine("probe", s, 0, []);
    if (hits.length) caught += 1;
    else console.error(`  control NOT caught: ${s.slice(0, 70)}`);
  }
  let falsePositives = 0;
  for (const s of mustAllow) {
    const hits = scanLine("probe", s, 0, []);
    if (hits.length) {
      falsePositives += 1;
      console.error(`  FALSE POSITIVE on a permitted shape: ${s.slice(0, 70)}`);
    }
  }
  console.log(`LAUNCH_CLAIM_CONTROLS_CAUGHT=${caught}/${mustCatch.length}`);
  console.log(`LAUNCH_CLAIM_CONTROL_FALSE_POSITIVES=${falsePositives}`);
  const ok = caught === mustCatch.length && falsePositives === 0;
  console.log(`LAUNCH_CLAIM_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

const open = openChainCount();

if (open !== REVIEWED_OPEN_PAIRS) {
  // The derived fact moved away from what was reviewed. Say so loudly rather than continuing to
  // enforce a rule whose premise has expired — and do not silently pass either, because every
  // launchability claim in the tree now needs re-reading against a different world.
  console.log(`launch-claims gate: ${open} chain/generation pairs accept public launches; the recorded review covered ${REVIEWED_OPEN_PAIRS}.`);
  console.log(`Recorded review: ${REVIEWED_AT} — ${REVIEWED_NOTE}`);
  console.log("Re-read every launchability claim in the tree, then update REVIEWED_OPEN_PAIRS/REVIEWED_AT/REVIEWED_NOTE in this file.");
  console.log(`PUBLIC_LAUNCH_OPEN_PAIRS=${open}`);
  console.log("LAUNCH_CLAIM_GATE=REVIEW_REQUIRED");
  process.exit(1);
}

const { files, hits } = scanTree();
const pass = hits.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ LAUNCH_CLAIM_GATE: pass ? "PASS" : "FAIL", openPairs: open, reviewedOpenPairs: REVIEWED_OPEN_PAIRS, scanned: files, hits }, null, 2));
} else {
  console.log(
    open === 0
      ? `launch-claims gate: no chain/generation pair accepts public launches, ${files} files scanned`
      : `launch-claims gate: ${open} chain/generation pair(s) open (reviewed ${REVIEWED_AT}), ${files} files scanned`,
  );
  for (const h of hits) console.error(`  ${h.rule}  ${h.file}:${h.line}\n      ${h.text}`);
  console.log(`PUBLIC_LAUNCH_OPEN_PAIRS=${open}`);
  console.log(`AFFIRMATIVE_LAUNCHABLE_CLAIMS=${hits.length}`);
  console.log(`LAUNCH_CLAIM_GATE=${pass ? "PASS" : "FAIL"}`);
}

if (!pass) {
  console.error("");
  console.error("A document answers 'launchable today' affirmatively, collapsing two independent yeses:");
  console.error("a runtime the launchpad will bind (LAUNCHABLE_ART_RUNTIMES has one entry) and a chain");
  console.error("whose factory is open. Ask the two questions separately — or delete the column. Do not");
  console.error("soften the wording and keep the claim.");
  process.exit(1);
}
