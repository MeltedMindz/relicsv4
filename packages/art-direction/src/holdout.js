// SPDX-License-Identifier: MIT
// ================================================================================================
// HOLDOUT CONTAINMENT — the flag `FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING` is MEASURED here.
//
// ------------------------------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// ------------------------------------------------------------------------------------------------
// It was a hardcoded `false`. `scripts/run-art-benchmark.mjs` wrote
// `seedGroups: { authorSawHoldout: false, ... }` into all twenty-four receipts of the two
// completed rounds, and `acceptance.js` read that literal back out and published
// `FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING=NO`. Nothing looked at anything. The containment
// API next door (`seedsVisibleTo`, `holdoutLeak`) had zero production callers.
//
// And the flag was WRONG. Both rounds ran on a holdout that the author-visible source computed
// four lines from the sentence claiming the author never sees it, and round two additionally ran
// with a round-one holdout reviewer's sentence quoted VERBATIM in `author.js`, naming a holdout
// seed and describing what that token rendered as. The mechanism did not fail quietly; it reported
// the answer it was written to report.
//
// So: this module SCANS. It walks the author-visible source, looks for the round's holdout seeds
// as integers, and returns what it found. `authorSawHoldout` becomes an observation with a file
// and a line number behind it, and a receipt that carries it can be re-derived by anyone.
//
// ------------------------------------------------------------------------------------------------
// WHAT "AUTHOR-VISIBLE" MEANS, AND WHAT IT HONESTLY DOES NOT
// ------------------------------------------------------------------------------------------------
// The author lane is an agent that reads and edits `packages/art-direction/src/**` (its own
// implementation), `packages/art-review/src/**` (the renderer and battery it runs against), the
// benchmark harness, and the tests over both. That is the surface below, and it is DERIVED by
// walking the filesystem rather than listed, so a new file in `src/` is scanned the day it lands
// instead of the day someone remembers to add it.
//
// Two directories are deliberately NOT on that surface, and the distinction is the reviewer/author
// boundary rather than a convenience:
//
//   artifacts/**                       reviewer OUTPUT. The verdict prose names holdout seeds
//                                      constantly — that is what a review of twelve tokens reads
//                                      like — and the author never opens it.
//   packages/art-direction/rounds/**   reviewer INPUT: the round registry, and the quarantine for
//                                      historical reviewer quotations that name a seed.
//
// THE LIMIT, SAID PLAINLY: this is a scan of source text, not a capability boundary. An author
// agent that chooses to open `artifacts/` or `rounds/` can read a seed there, and no scanner in
// this repository can stop it. What the scan does is make the leak that actually happened —
// a seed pasted into the author's own source, where it is read on every future run — detectable
// and mutation-provable. Treat the rest as procedure, and do not describe it as enforcement.
// ================================================================================================

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { holdoutSeedsDigest } from "./seeds.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..", "..");
export const ROUNDS_DIR = join(HERE, "..", "rounds");
export const ROUND_REGISTRY_PATH = join(ROUNDS_DIR, "registry.json");

/**
 * The roots the author reads and writes, and the extensions worth reading.
 *
 * Every entry is a DIRECTORY or a FILE relative to the repository root. A missing entry is a
 * failure rather than a skip: a surface that shrank because a directory was renamed would make
 * this scan quieter and greener at the same time, which is the failure mode the whole finding is
 * about.
 */
export const AUTHOR_VISIBLE_ROOTS = Object.freeze([
  "packages/art-direction/src",
  "packages/art-direction/test",
  "packages/art-review/src",
  "packages/art-review/test",
  "scripts/run-art-benchmark.mjs",
  "scripts/measure-authored-briefs.mjs",
]);

const SCANNED_EXTENSIONS = Object.freeze([".js", ".mjs", ".cjs", ".ts", ".json", ".md"]);

/**
 * INPUT FLOOR. A scan that read four files and found nothing has not established anything.
 *
 * The number is derived from what the surface actually holds — at the time of writing, twelve
 * source modules in `art-direction/src`, sixteen in `art-review/src`, the tests, and the two
 * scripts — and set well below it so ordinary growth never trips it while a collapsed surface
 * does. A floor of 0 is not a floor.
 */
export const MIN_AUTHOR_VISIBLE_FILES = 20;

function walk(abs, out) {
  const st = statSync(abs);
  if (st.isFile()) {
    if (SCANNED_EXTENSIONS.some((e) => abs.endsWith(e))) out.push(abs);
    return;
  }
  for (const entry of readdirSync(abs).sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    walk(join(abs, entry), out);
  }
}

/** Every author-visible file, derived from the filesystem. Throws when a declared root is gone. */
export function authorVisibleFiles(root = REPO_ROOT) {
  const files = [];
  const missing = [];
  for (const rel of AUTHOR_VISIBLE_ROOTS) {
    const abs = join(root, rel);
    if (!existsSync(abs)) { missing.push(rel); continue; }
    walk(abs, files);
  }
  if (missing.length) {
    throw new Error(
      `AUTHOR_VISIBLE_SURFACE_MISSING: ${missing.join(", ")} is declared author-visible and does not exist. ` +
      "A surface that shrinks makes this scan quieter and greener at once; fix the list or the tree, never ignore it.",
    );
  }
  if (files.length < MIN_AUTHOR_VISIBLE_FILES) {
    throw new Error(
      `AUTHOR_VISIBLE_SURFACE_TOO_SMALL: scanned ${files.length} file(s), floor is ${MIN_AUTHOR_VISIBLE_FILES}. ` +
      "Absence of input is not success.",
    );
  }
  return files;
}

/**
 * Does the author-visible source name any of these seeds?
 *
 * Word-boundary integer match, so `1234567` inside `21234567` is not a hit and a seed written into
 * a comment, a string, a filename or an array literal all are. Every occurrence carries its file,
 * line and the line's text, because "a holdout seed is somewhere in the tree" is not actionable and
 * "author.js:1117 quotes a holdout reviewer" is.
 *
 * REFUSES an empty seed list. Scanning for nothing finds nothing and would report a clean tree.
 */
export function scanAuthorVisibleSourceForHoldout({ seeds, root = REPO_ROOT } = {}) {
  const list = [...new Set(seeds ?? [])];
  if (list.length === 0) {
    throw new Error("HOLDOUT_SCAN_WITHOUT_SEEDS: scanning for zero seeds finds zero leaks and would report a clean tree. Absence of input is not success.");
  }
  const files = authorVisibleFiles(root);
  const pattern = new RegExp(`(?<![0-9])(${list.map((s) => String(s)).join("|")})(?![0-9])`, "g");
  const occurrences = [];
  for (const abs of files) {
    const text = readFileSync(abs, "utf8");
    if (!list.some((s) => text.includes(String(s)))) continue;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(lines[i])) !== null) {
        occurrences.push({
          file: relative(root, abs),
          line: i + 1,
          seed: Number(m[1]),
          text: lines[i].trim().slice(0, 200),
        });
      }
    }
  }
  return {
    authorSawHoldout: occurrences.length > 0,
    scannedFiles: files.length,
    seedCount: list.length,
    occurrences,
    seedsDigest: holdoutSeedsDigest(list),
  };
}

// ------------------------------------------------------------------------------------------------
// THE ROUND REGISTRY
// ------------------------------------------------------------------------------------------------

export const ROUND_INTEGRITY = Object.freeze(["HELD", "COMPROMISED", "UNKNOWN"]);

/** Read the registry. A missing or unparseable registry is an error, never an empty round list. */
export function readRoundRegistry(path = ROUND_REGISTRY_PATH) {
  if (!existsSync(path)) throw new Error(`HOLDOUT_ROUND_REGISTRY_MISSING: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const rounds = parsed?.rounds;
  if (!Array.isArray(rounds) || rounds.length === 0) {
    throw new Error("HOLDOUT_ROUND_REGISTRY_EMPTY: a registry with no rounds cannot answer which holdout a receipt was judged on.");
  }
  for (const r of rounds) {
    if (!r.roundId) throw new Error("HOLDOUT_ROUND_WITHOUT_ID");
    if (!ROUND_INTEGRITY.includes(r.integrity)) {
      throw new Error(`HOLDOUT_ROUND_INTEGRITY_INVALID: ${r.roundId} declares ${JSON.stringify(r.integrity)}; one of ${ROUND_INTEGRITY.join(", ")}`);
    }
  }
  return parsed;
}

/**
 * Which round was this seed list the holdout of?
 *
 * Identified BY DIGEST rather than by a name written into a run record, so a run cannot claim a
 * round whose seeds it did not use. An unrecognised digest returns null and the caller reports
 * UNKNOWN — never `HELD`, which would be a fact about a round nobody registered.
 */
export function roundForSeeds(seeds, registry = readRoundRegistry()) {
  const digest = holdoutSeedsDigest(seeds);
  return registry.rounds.find((r) => r.seedsDigest === digest) ?? null;
}

/**
 * The integrity of the round a receipt was judged under, plus why.
 *
 * Three answers and they are not interchangeable. `HELD` says a registered round's holdout was
 * never in author-visible source. `COMPROMISED` says it was, and names the evidence. `UNKNOWN`
 * says the seeds match no registered round — which is not a pass and must never be rendered as one.
 */
export function roundIntegrityForSeeds(seeds, registry = readRoundRegistry()) {
  const round = roundForSeeds(seeds, registry);
  if (!round) {
    return {
      roundId: null,
      integrity: "UNKNOWN",
      authorSawHoldout: "UNKNOWN",
      detail: "these holdout seeds match no round in packages/art-direction/rounds/registry.json, so nothing is known about whether they were held out.",
    };
  }
  return {
    roundId: round.roundId,
    integrity: round.integrity,
    authorSawHoldout: round.integrity === "COMPROMISED" ? true : round.integrity === "HELD" ? false : "UNKNOWN",
    detail: round.detail ?? null,
    compromise: round.compromise ?? null,
    derivation: round.derivation ?? null,
  };
}

