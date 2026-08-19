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
// chain", while README.md and AGENTS.md both carried a table column headed **"Launchable today?"**
// answering **yes** for one template — and README then said the opposite of its own table 170
// lines further down. AGENTS.md instructed agents to run `kit:status` and never describe a chain
// as publicly open, and then its own table did.
//
// The intended meaning was defensible ("this is the runtime the launchpad will bind first"). The
// column literally asked *today*, and today the answer is no for every template on every chain.
//
// SO THE RULE IS DERIVED, NOT TYPED. This gate asks the deployment records the same question
// `relics status` asks — `acceptsPublicLaunches(chainId, generation)` across every chain and every
// generation — and only then decides what the documents are allowed to say. When a chain does open,
// this gate stops forbidding the claim by itself, because the fact it derives from will have moved.
// Nobody has to remember to relax it.
//
// WHAT IS DELIBERATELY STILL ALLOWED. "Approved is not the same as launchable", "not launchable
// yet", "preview only" — every sentence that draws the distinction rather than collapsing it. The
// gate is about affirmative claims, and a repository that could not discuss the word would have to
// stop explaining the thing that matters most.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { acceptsPublicLaunches, PLATFORM_GENERATION_IDS, SUPPORTED_CHAIN_IDS } from "../packages/project-schema/index.js";

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

if (open > 0) {
  // The derived fact moved. Say so loudly rather than continuing to enforce a rule whose premise
  // has expired — and do not silently pass either, because the documents now need a real review.
  console.log(`launch-claims gate: ${open} chain/generation pairs now accept public launches.`);
  console.log("The premise of this gate has changed. Re-read every 'not launchable yet' claim in the tree before relaxing it.");
  console.log(`PUBLIC_LAUNCH_OPEN_PAIRS=${open}`);
  console.log("LAUNCH_CLAIM_GATE=REVIEW_REQUIRED");
  process.exit(1);
}

const { files, hits } = scanTree();
const pass = hits.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ LAUNCH_CLAIM_GATE: pass ? "PASS" : "FAIL", openPairs: open, scanned: files, hits }, null, 2));
} else {
  console.log(`launch-claims gate: no chain/generation pair accepts public launches, ${files} files scanned`);
  for (const h of hits) console.error(`  ${h.rule}  ${h.file}:${h.line}\n      ${h.text}`);
  console.log(`AFFIRMATIVE_LAUNCHABLE_CLAIMS=${hits.length}`);
  console.log(`LAUNCH_CLAIM_GATE=${pass ? "PASS" : "FAIL"}`);
}

if (!pass) {
  console.error("");
  console.error("A document answers 'launchable today' affirmatively while every chain is closed to");
  console.error("public creator launch. Ask the narrower question the kit can answer honestly — which");
  console.error("runtime a launch binds first — or delete the column. Do not soften the wording and");
  console.error("keep the claim.");
  process.exit(1);
}
