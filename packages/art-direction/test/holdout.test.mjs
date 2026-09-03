// SPDX-License-Identifier: MIT
// ================================================================================================
// HOLDOUT CONTAINMENT.
//
// The claim under test is `FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING`, which was a hardcoded
// `false` in twenty-four committed receipts while being FALSE IN SUBSTANCE: the holdout was an
// arithmetic sequence written out in the module the author imports, byte-identical across both
// completed rounds, and a round-one holdout reviewer's sentence naming a holdout seed was quoted
// verbatim in `author.js` before round two was authored.
//
// The test that matters here is `NO HOLDOUT SEED OF A COMPLETED ROUND APPEARS IN AUTHOR-VISIBLE
// SOURCE`. It scans the REAL tree, with the REAL seeds recovered from the committed receipts.
// Planting a holdout seed back into `packages/art-direction/src/author.js` turns it red by name.
// ================================================================================================

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  AUTHOR_VISIBLE_ROOTS, MIN_AUTHOR_VISIBLE_FILES, authorVisibleFiles, readRoundRegistry,
  roundIntegrityForSeeds, scanAuthorVisibleSourceForHoldout,
} from "../src/holdout.js";
import {
  HOLDOUT_SEED_MAX, HOLDOUT_SEED_MIN, deriveHoldoutSeeds, finalHoldoutSeeds, holdoutSaltCommitment,
  holdoutSeedsDigest, resolveHoldoutSalt,
} from "../src/seeds.js";
import { verifyArtAcceptance } from "../src/acceptance.js";
import * as seedsModule from "../src/seeds.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SALT_A = "a-salt-that-is-long-enough-to-commit-to";
const SALT_B = "a-different-salt-that-is-also-long-enough";

/**
 * The holdout seeds of every COMPLETED round, recovered from the committed receipts.
 *
 * Recovered rather than restated: a list typed into this file would itself be a holdout leak into
 * author-visible source, and this file is inside `AUTHOR_VISIBLE_ROOTS`. What lives here is a
 * PATH; the integers live where the reviewer put them.
 */
function completedRoundSeedSets() {
  const artifacts = join(ROOT, "artifacts");
  const sets = new Map();
  if (!existsSync(artifacts)) return sets;
  for (const round of readdirSync(artifacts).sort()) {
    const rd = join(artifacts, round);
    if (!statSync(rd).isDirectory()) continue;
    for (const entry of readdirSync(rd).sort()) {
      const p = join(rd, entry, ".relics-agent", "receipts", "art-acceptance.json");
      if (!existsSync(p)) continue;
      const seeds = JSON.parse(readFileSync(p, "utf8"))?.finalReview?.seeds;
      if (Array.isArray(seeds) && seeds.length) sets.set(holdoutSeedsDigest(seeds), seeds);
    }
  }
  return sets;
}

// ---------------------------------------------------------------------------------------------
// THE DERIVATION
// ---------------------------------------------------------------------------------------------

test("the holdout is not a constant in author-visible source", () => {
  // The defect in one assertion: this module used to export the twelve integers.
  assert.equal(seedsModule.FINAL_HOLDOUT_SEEDS, undefined, "seeds.js must not export a static holdout again");
  assert.equal(typeof seedsModule.deriveHoldoutSeeds, "function");
  assert.equal(typeof seedsModule.finalHoldoutSeeds, "function");
});

test("a missing salt is a refusal, never a default holdout", () => {
  assert.throws(() => resolveHoldoutSalt({}), /HOLDOUT_SALT_UNAVAILABLE/);
  assert.throws(() => finalHoldoutSeeds({ roundId: "r", env: {} }), /HOLDOUT_SALT_UNAVAILABLE/);
  // A short salt is not a commitment. Refusing it is not pedantry: the commitment is only worth
  // publishing if the salt behind it cannot be guessed.
  assert.throws(() => deriveHoldoutSeeds({ roundId: "r", salt: "short" }), /HOLDOUT_SALT_TOO_SHORT/);
  assert.throws(() => holdoutSaltCommitment("short"), /HOLDOUT_SALT_TOO_SHORT/);
});

test("the holdout rotates between rounds and between salts", () => {
  const r1 = deriveHoldoutSeeds({ roundId: "round-1", salt: SALT_A });
  const r2 = deriveHoldoutSeeds({ roundId: "round-2", salt: SALT_A });
  const other = deriveHoldoutSeeds({ roundId: "round-1", salt: SALT_B });

  assert.equal(r1.length, 12);
  assert.equal(new Set(r1).size, 12, "no duplicates");
  assert.deepEqual([...r1], deriveHoldoutSeeds({ roundId: "round-1", salt: SALT_A }), "reproducible for a reviewer holding the salt");

  // BYTE-IDENTICAL REUSE ACROSS ROUNDS IS THE DEFECT. One set served both completed rounds.
  assert.notDeepEqual([...r1], [...r2], "a new round must draw a new holdout");
  assert.notDeepEqual([...r1], [...other], "a different salt must draw a different holdout");
  assert.ok(r1.filter((s) => r2.includes(s)).length <= 1, "successive rounds must not substantially overlap");

  for (const s of r1) assert.ok(s >= HOLDOUT_SEED_MIN && s <= HOLDOUT_SEED_MAX, `${s} is outside the holdout range`);
});

test("the holdout is disjoint from every population the author or the battery can see", () => {
  const holdout = new Set(deriveHoldoutSeeds({ roundId: "disjointness", salt: SALT_A }));
  for (const s of seedsModule.AUTHORING_SEEDS) assert.ok(!holdout.has(s));
  for (const s of seedsModule.DEVELOPMENT_REVIEW_SEEDS) assert.ok(!holdout.has(s));
  const r = seedsModule.assertSeedGroupsDisjoint(undefined, { finalHoldout: [...holdout] });
  assert.equal(r.holdoutChecked, true);
});

test("the commitment fixes the salt without revealing it", () => {
  const c = holdoutSaltCommitment(SALT_A);
  assert.match(c, /^[0-9a-f]{64}$/);
  assert.equal(c, holdoutSaltCommitment(SALT_A));
  assert.notEqual(c, holdoutSaltCommitment(SALT_B));
  assert.ok(!c.includes(SALT_A));
});

// ---------------------------------------------------------------------------------------------
// THE SCAN
// ---------------------------------------------------------------------------------------------

test("the author-visible surface is derived from the filesystem and carries an input floor", () => {
  const files = authorVisibleFiles();
  assert.ok(files.length >= MIN_AUTHOR_VISIBLE_FILES, `scanned ${files.length}, floor ${MIN_AUTHOR_VISIBLE_FILES}`);
  assert.ok(MIN_AUTHOR_VISIBLE_FILES > 0, "a minimum of 0 is not a floor");
  // The surface must contain the file the leak actually landed in, or the scan is decorative.
  assert.ok(files.some((f) => f.endsWith(join("art-direction", "src", "author.js"))));
  assert.ok(files.some((f) => f.endsWith(join("art-direction", "src", "seeds.js"))));
  assert.ok(files.some((f) => f.endsWith("run-art-benchmark.mjs")));
});

test("the leak scan refuses to scan for zero seeds", () => {
  // Scanning for nothing finds nothing and would report a clean tree. Absence of input is not
  // success, and this is the shape of five vacuous passes already found in this repository family.
  assert.throws(() => scanAuthorVisibleSourceForHoldout({ seeds: [] }), /HOLDOUT_SCAN_WITHOUT_SEEDS/);
  assert.throws(() => scanAuthorVisibleSourceForHoldout({}), /HOLDOUT_SCAN_WITHOUT_SEEDS/);
});

test("a vanished author-visible root is a failure, not a smaller scan", () => {
  const tmp = mkdtempSync(join(tmpdir(), "holdout-surface-"));
  try {
    assert.throws(() => authorVisibleFiles(tmp), /AUTHOR_VISIBLE_SURFACE_MISSING/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------
// THE MUTATION TARGET
// ---------------------------------------------------------------------------------------------

test("NO HOLDOUT SEED OF A COMPLETED ROUND APPEARS IN AUTHOR-VISIBLE SOURCE", () => {
  const sets = completedRoundSeedSets();
  assert.ok(sets.size > 0, "no committed receipt records the seeds its reviewer judged, so this test scanned for nothing");
  let scanned = 0;
  const found = [];
  for (const seeds of sets.values()) {
    const scan = scanAuthorVisibleSourceForHoldout({ seeds });
    scanned = scan.scannedFiles;
    found.push(...scan.occurrences);
  }
  assert.ok(scanned >= MIN_AUTHOR_VISIBLE_FILES, `only ${scanned} file(s) scanned`);
  assert.deepEqual(
    found.map((o) => `${o.file}:${o.line} names holdout seed ${o.seed}`),
    [],
    "a holdout seed in the author's own source is the leak the holdout exists to prevent",
  );
});

test("MUTATION: a holdout seed planted in author-visible source is found and named", () => {
  const sets = completedRoundSeedSets();
  assert.ok(sets.size > 0);
  const seeds = [...sets.values()][0];
  const tmp = mkdtempSync(join(tmpdir(), "holdout-leak-"));
  try {
    for (const rel of AUTHOR_VISIBLE_ROOTS) cpSync(join(ROOT, rel), join(tmp, rel), { recursive: true });
    const clean = scanAuthorVisibleSourceForHoldout({ seeds, root: tmp });
    assert.equal(clean.authorSawHoldout, false, "the copy must start clean, or the mutation proves nothing");

    const victim = join(tmp, "packages", "art-direction", "src", "author.js");
    writeFileSync(victim, `${readFileSync(victim, "utf8")}\n// a reviewer said seed ${seeds[0]} rendered nothing at all.\n`);

    const dirty = scanAuthorVisibleSourceForHoldout({ seeds, root: tmp });
    assert.equal(dirty.authorSawHoldout, true);
    assert.equal(dirty.occurrences.length, 1);
    assert.equal(dirty.occurrences[0].seed, seeds[0]);
    assert.ok(dirty.occurrences[0].file.endsWith("author.js"));
    assert.ok(dirty.occurrences[0].line > 0);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("MUTATION: a longer integer containing a holdout seed is not a false positive", () => {
  const seeds = [...completedRoundSeedSets().values()][0];
  const tmp = mkdtempSync(join(tmpdir(), "holdout-boundary-"));
  try {
    for (const rel of AUTHOR_VISIBLE_ROOTS) cpSync(join(ROOT, rel), join(tmp, rel), { recursive: true });
    const victim = join(tmp, "packages", "art-direction", "src", "author.js");
    writeFileSync(victim, `${readFileSync(victim, "utf8")}\n// const unrelated = 9${seeds[0]}7;\n`);
    assert.equal(scanAuthorVisibleSourceForHoldout({ seeds, root: tmp }).authorSawHoldout, false);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------
// THE ROUND REGISTRY, AND WHAT IT SAYS ABOUT THE TWO COMPLETED ROUNDS
// ---------------------------------------------------------------------------------------------

test("the round registry is readable and every round declares an integrity", () => {
  const reg = readRoundRegistry();
  assert.ok(reg.rounds.length > 0);
  for (const r of reg.rounds) {
    assert.ok(r.roundId);
    assert.ok(["HELD", "COMPROMISED", "UNKNOWN"].includes(r.integrity));
  }
});

test("the two completed benchmark rounds are recorded COMPROMISED, and one holdout served both", () => {
  const sets = completedRoundSeedSets();
  assert.equal(sets.size, 1, "both completed rounds used ONE holdout set, byte for byte; that is the reuse, and it is a fact about the artifacts rather than a claim");
  const [seeds] = [...sets.values()];
  const integrity = roundIntegrityForSeeds(seeds);
  assert.equal(integrity.integrity, "COMPROMISED");
  assert.equal(integrity.authorSawHoldout, true);
  assert.equal(integrity.compromise.reScoreableWithoutAFreshRound, false);
  assert.ok(integrity.compromise.evidence.length >= 2);
});

test("seeds that match no registered round are UNKNOWN, never held out", () => {
  const unknown = deriveHoldoutSeeds({ roundId: "a-round-nobody-registered", salt: SALT_A });
  const integrity = roundIntegrityForSeeds(unknown);
  assert.equal(integrity.integrity, "UNKNOWN");
  assert.equal(integrity.authorSawHoldout, "UNKNOWN");
  assert.notEqual(integrity.authorSawHoldout, false, "an unregistered round must never read as a held-out one");
});

test("MUTATION: a receipt whose round is compromised is refused by verifyArtAcceptance", () => {
  const tmp = mkdtempSync(join(tmpdir(), "holdout-receipt-"));
  try {
    const sets = completedRoundSeedSets();
    const donorDir = (() => {
      const base = join(ROOT, "artifacts", "art-benchmark", "B01");
      return existsSync(join(base, ".relics-agent", "receipts", "art-acceptance.json")) ? base : null;
    })();
    assert.ok(donorDir, "no committed receipt to check");
    cpSync(donorDir, tmp, { recursive: true });
    const p = join(tmp, ".relics-agent", "receipts", "art-acceptance.json");
    const r = JSON.parse(readFileSync(p, "utf8"));
    assert.equal(r.seedGroups.authorSawHoldout, true, "the committed receipt must record the compromise it ran under");
    assert.ok(sets.has(holdoutSeedsDigest(r.finalReview.seeds)));

    // Even with a PASS verdict written into both the receipt and the reviewer's document, a
    // compromised holdout is not an acceptance. This is the clause that makes the correction bite:
    // it is not enough to relabel the flag, the receipt has to stop being acceptable.
    r.finalReview.verdict = "PASS";
    const vp = join(tmp, "final-review", "verdict.json");
    const v = JSON.parse(readFileSync(vp, "utf8"));
    v.verdict = "PASS";
    const bytes = Buffer.from(`${JSON.stringify(v, null, 2)}\n`);
    writeFileSync(vp, bytes);
    r.finalReview.verdictDocument.sha256 = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(p, `${JSON.stringify(r, null, 2)}\n`);

    const out = verifyArtAcceptance(tmp, {});
    assert.equal(out.accepted, false);
    assert.equal(out.reasonCode, "FINAL_REVIEW_HOLDOUT_COMPROMISED");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
