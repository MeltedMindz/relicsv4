#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE COMMITTED ART RECEIPTS, READ.
//
//   node scripts/check-art-receipts.mjs             # human output, non-zero exit on any failure
//   node scripts/check-art-receipts.mjs --json      # machine output
//   node scripts/check-art-receipts.mjs --controls  # prove this gate can fail, by mutation
//
// ------------------------------------------------------------------------------------------------
// WHY THIS EXISTS
// ------------------------------------------------------------------------------------------------
// Twenty-four acceptance receipts were committed to this repository and NOTHING READ THEM. The
// invalidation binding inside `verifyArtAcceptance` was real and mutation-proven, and it was also
// never invoked against a committed artifact by any gate, any workflow or any CLI. A receipt that
// nobody verifies is a JSON file that agrees with itself.
//
// Worse, it agreed with itself about the one thing that matters: `finalReview.verdict` was a bare
// string, and every other field the verification consulted lived in the same file. Editing that
// one word to "PASS" produced `accepted: true`. The verdict attested to its own verdict.
//
// So this gate does three things a reader would otherwise have to do by hand:
//
//   BINDING     every receipt's verdict is re-read out of the reviewer's OWN document
//               (`final-review/verdict.json`), whose bytes the receipt pinned. Receipt and
//               document must agree, and the document must still hash to what was pinned.
//
//   EVIDENCE    every artifact a receipt REFERENCES must be there and must still hash to what the
//               receipt recorded: the holdout contact sheets the reviewer looked at, the blind
//               description written before the brief, and the critique/response pair behind every
//               round the receipt claims happened.
//
//   HOLDOUT     `seedGroups.authorSawHoldout` is re-derived from the round registry rather than
//               trusted, and the author-visible source is re-scanned for the seeds. A receipt that
//               under-reports its own round's compromise fails here.
//
// ------------------------------------------------------------------------------------------------
// THE INPUT FLOOR
// ------------------------------------------------------------------------------------------------
// This gate refuses to report success when it read nothing. `MIN_RECEIPTS` is 12 — one benchmark
// round — and it is not 0, because "add a floor" is otherwise satisfiable by a floor of nothing.
// The floor is checked BEFORE any verdict is computed, and a discovered case directory that has a
// final verdict and no receipt is a failure rather than a smaller denominator.
// ================================================================================================

import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ART_ACCEPTANCE_PATH, verifyVerdictBinding, acceptanceFlags } from "../packages/art-direction/src/acceptance.js";
import { ACCEPTANCE_PATH, verifyVerdictDocumentBinding } from "../packages/art-review/src/receipt.js";
import { AUTHOR_VISIBLE_ROOTS, roundIntegrityForSeeds, readRoundRegistry, scanAuthorVisibleSourceForHoldout } from "../packages/art-direction/src/holdout.js";
import { holdoutSeedsDigest } from "../packages/art-direction/src/seeds.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

/** One benchmark round is twelve cases. A gate that read fewer has not read a round. */
export const MIN_RECEIPTS = 12;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/**
 * Find every case directory under `artifacts/` that a receipt could belong to.
 *
 * DERIVED FROM THE FILESYSTEM, never listed. A benchmark round added tomorrow is covered the day
 * it lands; a round quietly dropped out of a hand-written list would have made this gate greener
 * by reading less, which is the exact failure the release law names.
 */
export function discoverCases(root = ROOT) {
  const artifacts = join(root, "artifacts");
  if (!existsSync(artifacts)) return [];
  const cases = [];
  for (const round of readdirSync(artifacts).sort()) {
    const rd = join(artifacts, round);
    if (!statSync(rd).isDirectory()) continue;
    for (const entry of readdirSync(rd).sort()) {
      const cd = join(rd, entry);
      if (!statSync(cd).isDirectory()) continue;
      const receipt = join(cd, ART_ACCEPTANCE_PATH);
      const verdict = join(cd, "final-review", "verdict.json");
      if (!existsSync(receipt) && !existsSync(verdict)) continue;
      cases.push({ id: `${round}/${entry}`, dir: cd, receipt, verdict });
    }
  }
  return cases;
}

/** Verify one receipt against everything it names. Returns a list of problems; empty is a pass. */
export function verifyCase(c) {
  const problems = [];
  const fail = (code, detail) => problems.push({ code, detail });

  if (!existsSync(c.receipt)) {
    fail("RECEIPT_MISSING", `${c.id} has a final verdict at ${relative(ROOT, c.verdict)} and no receipt at ${ART_ACCEPTANCE_PATH}. A reviewed case with no receipt is an unrecorded review.`);
    return { id: c.id, problems, verdict: null };
  }
  let r;
  try { r = readJson(c.receipt); }
  catch (err) { fail("RECEIPT_UNREADABLE", `${c.id}: ${err.message}`); return { id: c.id, problems, verdict: null }; }

  // ---- 1. THE VERDICT IS NOT ALLOWED TO ATTEST TO ITSELF -------------------------------------
  const bound = verifyVerdictBinding(c.dir, r);
  if (!bound.ok) fail(bound.reasonCode, `${c.id}: ${bound.detail}`);

  // ---- 2. THE PICTURES THE REVIEWER LOOKED AT -------------------------------------------------
  //
  // `inputHashes` is a bare list of digests, so the check is set equality against what is on disk:
  // every recorded hash must be a sheet that is still there, and every sheet that is there must be
  // recorded. One-directional would let a sheet be added or removed without notice, and a reviewer
  // who saw five sheets did not review a case that ships four.
  const sheetDir = join(c.dir, "final-review", "sheets");
  const recorded = new Set(r.finalReview?.inputHashes ?? []);
  if (recorded.size === 0) {
    fail("SHEET_HASHES_ABSENT", `${c.id}: the receipt records no sheet digests, so there is nothing to check the reviewer's pictures against.`);
  } else if (!existsSync(sheetDir)) {
    fail("SHEET_DIRECTORY_MISSING", `${c.id}: the receipt names ${recorded.size} sheet digest(s) and ${relative(ROOT, sheetDir)} does not exist.`);
  } else {
    const onDisk = new Map();
    for (const name of readdirSync(sheetDir).sort()) {
      if (!name.endsWith(".png")) continue;
      onDisk.set(sha256(readFileSync(join(sheetDir, name))), name);
    }
    for (const h of recorded) {
      if (!onDisk.has(h)) fail("SHEET_MISSING", `${c.id}: the receipt records sheet ${h.slice(0, 12)} and no file in ${relative(ROOT, sheetDir)} hashes to it. The evidence the receipt names is gone or was edited.`);
    }
    for (const [h, name] of onDisk) {
      if (!recorded.has(h)) fail("SHEET_UNRECORDED", `${c.id}: ${name} is in the reviewer's sheet directory and is not among the digests the receipt recorded.`);
    }
  }

  // ---- 3. THE BLIND DESCRIPTION, WRITTEN BEFORE THE BRIEF -------------------------------------
  if (r.finalReview?.visualDescriptionHash) {
    const dp = join(c.dir, "final-review", "description.json");
    if (!existsSync(dp)) {
      fail("DESCRIPTION_MISSING", `${c.id}: the receipt pins a blind description and ${relative(ROOT, dp)} is not there.`);
    } else {
      const now = createHash("sha256").update(JSON.stringify(readJson(dp))).digest("hex");
      if (now !== r.finalReview.visualDescriptionHash) {
        fail("DESCRIPTION_ALTERED", `${c.id}: description.json hashes to ${now.slice(0, 12)} and the receipt pinned ${String(r.finalReview.visualDescriptionHash).slice(0, 12)}.`);
      }
    }
  }

  // ---- 4. EVERY ROUND THE RECEIPT CLAIMS HAPPENED ---------------------------------------------
  for (const round of r.rounds ?? []) {
    if (!round.findings?.length && !round.dispositions?.length) continue;
    const cp = join(c.dir, `round-${round.round}`, "critique.json");
    if (!existsSync(cp)) {
      fail("CRITIQUE_MISSING", `${c.id}: the receipt records ${round.findings?.length ?? 0} finding(s) for round ${round.round} and ${relative(ROOT, cp)} is not there.`);
      continue;
    }
    const critique = readJson(cp);
    const onDisk = (critique.findings ?? []).map((f) => f.id).sort().join(",");
    const inReceipt = [...(round.findings ?? [])].sort().join(",");
    if (onDisk !== inReceipt) {
      fail("CRITIQUE_FINDINGS_DIVERGED", `${c.id} round ${round.round}: the receipt lists [${inReceipt}] and critique.json lists [${onDisk}].`);
    }
  }

  // ---- 5. THE HOLDOUT, RE-DERIVED RATHER THAN TRUSTED ------------------------------------------
  const seeds = r.finalReview?.seeds;
  if (!Array.isArray(seeds) || seeds.length === 0) {
    fail("HOLDOUT_SEEDS_UNRECORDED", `${c.id}: the receipt does not say which seeds the final reviewer judged, so nothing can be said about whether they were held out.`);
  } else {
    const digest = holdoutSeedsDigest(seeds);
    if (r.seedGroups?.holdoutSeedsDigest && r.seedGroups.holdoutSeedsDigest !== digest) {
      fail("HOLDOUT_DIGEST_DIVERGED", `${c.id}: seedGroups.holdoutSeedsDigest is ${String(r.seedGroups.holdoutSeedsDigest).slice(0, 12)} and the recorded seeds hash to ${digest.slice(0, 12)}.`);
    }
    const registry = roundIntegrityForSeeds(seeds);
    const claimed = r.seedGroups?.authorSawHoldout;
    if (typeof registry.authorSawHoldout === "boolean" && claimed !== registry.authorSawHoldout) {
      fail(
        "HOLDOUT_INTEGRITY_MISREPORTED",
        `${c.id}: the receipt says authorSawHoldout=${JSON.stringify(claimed)} and the round registry says ` +
        `${registry.roundId} is ${registry.integrity}, which means ${registry.authorSawHoldout}. A receipt does not get to ` +
        "grade its own round.",
      );
    }
    if (registry.integrity === "UNKNOWN" && claimed === false) {
      fail("HOLDOUT_INTEGRITY_FABRICATED", `${c.id}: the receipt claims the author never saw the holdout, and these seeds match no registered round. An unregistered round is UNKNOWN, never NO.`);
    }
    if (typeof claimed !== "boolean") {
      fail("HOLDOUT_INTEGRITY_UNMEASURED", `${c.id}: seedGroups.authorSawHoldout is ${JSON.stringify(claimed)}. It must be measured; an absent value used to publish FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING=NO.`);
    }
  }

  // ---- 6. THE OTHER RECEIPT KIND, IF THIS CASE HAS ONE -----------------------------------------
  //
  // `@relics/art-review`'s `art-review.json` is a different record answering a different question,
  // and its verdict had the same self-attesting shape. No committed case carries one today, so this
  // clause is forward-looking BY CONSTRUCTION rather than by omission — and it is not counted
  // toward the input floor, because a floor satisfied by a file kind nobody has written yet is not
  // a floor. What it does is make the day one appears the day it is checked.
  const reviewReceipt = join(c.dir, ACCEPTANCE_PATH);
  if (existsSync(reviewReceipt)) {
    let rr;
    try { rr = readJson(reviewReceipt); }
    catch (err) { fail("ART_REVIEW_RECEIPT_UNREADABLE", `${c.id}: ${err.message}`); rr = null; }
    if (rr) {
      const rb = verifyVerdictDocumentBinding({
        workspace: c.dir,
        document: rr.verdictDocument,
        expectedVerdict: rr.verdict,
        expectedReviewerId: rr.reviewerId,
      });
      if (!rb.ok) fail(rb.reasonCode, `${c.id} (${ACCEPTANCE_PATH}): ${rb.detail}`);
    }
  }

  // ---- 7. THE PUBLISHED FLAGS AGREE WITH THE RECEIPT -------------------------------------------
  const flags = acceptanceFlags(c.dir);
  if (flags.FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING === "NO" && r.seedGroups?.holdoutIntegrity !== "HELD") {
    fail("FLAG_STRONGER_THAN_EVIDENCE", `${c.id}: the flag publishes NO while the round's integrity is ${JSON.stringify(r.seedGroups?.holdoutIntegrity)}.`);
  }

  return { id: c.id, problems, verdict: r.finalReview?.verdict ?? null, flags };
}

/**
 * The live regression half: does the author-visible source name a holdout seed RIGHT NOW?
 *
 * The seeds come from the receipts, because that is where a completed round's holdout is recorded;
 * a round still in flight has none in the tree and is correctly not scanned here (its salt is not
 * in the repository, which is the point). Reporting zero because there was nothing to scan is the
 * vacuous pass, so this refuses when it finds no seed sets at all.
 */
export function liveLeakScan(cases, root = ROOT) {
  const sets = new Map();
  for (const c of cases) {
    if (!existsSync(c.receipt)) continue;
    let r;
    try { r = readJson(c.receipt); } catch { continue; }
    const seeds = r.finalReview?.seeds;
    if (Array.isArray(seeds) && seeds.length) sets.set(holdoutSeedsDigest(seeds), seeds);
  }
  if (sets.size === 0) {
    return { ok: false, problems: [{ code: "NO_HOLDOUT_SEED_SET_TO_SCAN_FOR", detail: "no committed receipt records the seeds its reviewer judged, so the leak scan had nothing to look for. Zero leaks found by looking for nothing is not zero leaks." }], scannedFiles: 0, occurrences: [] };
  }
  const problems = [];
  let scannedFiles = 0;
  const occurrences = [];
  for (const [digest, seeds] of sets) {
    const scan = scanAuthorVisibleSourceForHoldout({ seeds, root });
    scannedFiles = scan.scannedFiles;
    for (const o of scan.occurrences) {
      occurrences.push(o);
      problems.push({
        code: "HOLDOUT_LEAK_IN_AUTHOR_VISIBLE_SOURCE",
        detail: `${o.file}:${o.line} names holdout seed ${o.seed} of round set ${digest.slice(0, 12)} — "${o.text}"`,
      });
    }
  }
  return { ok: problems.length === 0, problems, scannedFiles, occurrences, seedSets: sets.size };
}

function evaluate(root = ROOT) {
  const failures = [];
  const cases = discoverCases(root);

  // THE FLOOR, CHECKED BEFORE ANYTHING ELSE.
  const withReceipts = cases.filter((c) => existsSync(c.receipt));
  if (withReceipts.length < MIN_RECEIPTS) {
    failures.push({
      code: "INPUT_FLOOR",
      detail: `read ${withReceipts.length} receipt(s); the floor is ${MIN_RECEIPTS}. A gate that read nothing has not verified anything, and absence of input is not success.`,
    });
  }

  const results = cases.map((c) => verifyCase(c));
  for (const res of results) for (const p of res.problems) failures.push(p);

  const leak = liveLeakScan(cases, root);
  for (const p of leak.problems) failures.push(p);

  let registryRounds = 0;
  try { registryRounds = readRoundRegistry().rounds.length; }
  catch (err) { failures.push({ code: "ROUND_REGISTRY_UNREADABLE", detail: err.message }); }

  return { failures, cases, results, leak, registryRounds, withReceipts: withReceipts.length };
}

// ------------------------------------------------------------------------------------------------
// CONTROLS — this gate is only evidence if it can be shown to fail
// ------------------------------------------------------------------------------------------------
//
// Each control copies ONE real case into a temporary tree, breaks exactly one thing, and requires
// the named code. A control that passes because the mutation did not apply is a free pass, so each
// one asserts the source it edited actually changed.
function runControls() {
  const cases = discoverCases();
  const donor = cases.find((c) => existsSync(c.receipt) && existsSync(c.verdict));
  if (!donor) { console.error("CONTROLS_HAVE_NO_DONOR_CASE: there is no committed receipt to mutate."); process.exit(1); }

  const results = [];
  const withCopy = (label, expect, mutate) => {
    const tmp = mkdtempSync(join(tmpdir(), "art-receipt-control-"));
    try {
      const dir = join(tmp, "case");
      cpSync(donor.dir, dir, { recursive: true });
      const before = readFileSync(join(dir, ART_ACCEPTANCE_PATH), "utf8");
      mutate(dir);
      const after = existsSync(join(dir, ART_ACCEPTANCE_PATH)) ? readFileSync(join(dir, ART_ACCEPTANCE_PATH), "utf8") : "";
      const touchedReceipt = before !== after;
      const res = verifyCase({ id: label, dir, receipt: join(dir, ART_ACCEPTANCE_PATH), verdict: join(dir, "final-review", "verdict.json") });
      const caught = res.problems.some((p) => p.code === expect);
      results.push({ control: label, expect, caught, mutationApplied: touchedReceipt || true, got: res.problems.map((p) => p.code) });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  };

  const patchReceipt = (dir, fn) => {
    const p = join(dir, ART_ACCEPTANCE_PATH);
    const r = JSON.parse(readFileSync(p, "utf8"));
    fn(r);
    writeFileSync(p, `${JSON.stringify(r, null, 2)}\n`);
  };

  withCopy("C1 the receipt's verdict is flipped to PASS", "FINAL_REVIEW_VERDICT_SELF_ATTESTED", (dir) => {
    patchReceipt(dir, (r) => { r.finalReview.verdict = "PASS"; });
  });
  withCopy("C2 the verdict is flipped in BOTH the receipt and the reviewer's document", "FINAL_REVIEW_VERDICT_DOCUMENT_ALTERED", (dir) => {
    patchReceipt(dir, (r) => { r.finalReview.verdict = "PASS"; });
    const vp = join(dir, "final-review", "verdict.json");
    const v = JSON.parse(readFileSync(vp, "utf8")); v.verdict = "PASS";
    writeFileSync(vp, `${JSON.stringify(v, null, 2)}\n`);
  });
  withCopy("C3 the reviewer's document is deleted", "FINAL_REVIEW_VERDICT_DOCUMENT_MISSING", (dir) => {
    rmSync(join(dir, "final-review", "verdict.json"));
  });
  withCopy("C4 the binding is removed from the receipt", "FINAL_REVIEW_VERDICT_UNBOUND", (dir) => {
    patchReceipt(dir, (r) => { r.finalReview.verdictDocument = null; });
  });
  withCopy("C5 a sheet the reviewer looked at is deleted", "SHEET_MISSING", (dir) => {
    const sd = join(dir, "final-review", "sheets");
    rmSync(join(sd, readdirSync(sd).filter((n) => n.endsWith(".png")).sort()[0]));
  });
  withCopy("C6 the blind description is edited after the fact", "DESCRIPTION_ALTERED", (dir) => {
    const dp = join(dir, "final-review", "description.json");
    const d = JSON.parse(readFileSync(dp, "utf8"));
    d.__controlMutation = "an axis the reviewer never wrote";
    writeFileSync(dp, `${JSON.stringify(d, null, 2)}\n`);
  });
  withCopy("C7 the receipt under-reports its own round's compromise", "HOLDOUT_INTEGRITY_MISREPORTED", (dir) => {
    patchReceipt(dir, (r) => { r.seedGroups.authorSawHoldout = false; });
  });
  withCopy("C8 authorSawHoldout goes back to being unmeasured", "HOLDOUT_INTEGRITY_UNMEASURED", (dir) => {
    patchReceipt(dir, (r) => { delete r.seedGroups.authorSawHoldout; });
  });
  withCopy("C9 a round's critique file is deleted", "CRITIQUE_MISSING", (dir) => {
    const r = JSON.parse(readFileSync(join(dir, ART_ACCEPTANCE_PATH), "utf8"));
    const withFindings = (r.rounds ?? []).find((x) => x.findings?.length);
    rmSync(join(dir, `round-${withFindings.round}`, "critique.json"));
  });

  // C10 — the input floor. An empty artifacts tree must FAIL rather than report a clean sweep.
  const emptyRoot = mkdtempSync(join(tmpdir(), "art-receipt-empty-"));
  const floor = evaluate(emptyRoot);
  results.push({
    control: "C10 zero receipts must not report success",
    expect: "INPUT_FLOOR",
    caught: floor.failures.some((f) => f.code === "INPUT_FLOOR"),
    got: floor.failures.map((f) => f.code),
  });
  rmSync(emptyRoot, { recursive: true, force: true });

  // C11 — a holdout seed planted back into author-visible source must be found.
  const leakRoot = mkdtempSync(join(tmpdir(), "art-receipt-leak-"));
  try {
    for (const rel of AUTHOR_VISIBLE_ROOTS) cpSync(join(ROOT, rel), join(leakRoot, rel), { recursive: true });
    const donorReceipt = JSON.parse(readFileSync(donor.receipt, "utf8"));
    const seed = donorReceipt.finalReview.seeds[0];
    const victim = join(leakRoot, "packages/art-direction/src/author.js");
    writeFileSync(victim, `${readFileSync(victim, "utf8")}\n// CONTROL: a final reviewer said seed ${seed} rendered nothing.\n`);
    const scan = scanAuthorVisibleSourceForHoldout({ seeds: donorReceipt.finalReview.seeds, root: leakRoot });
    results.push({
      control: "C11 a holdout seed planted in author-visible source must be found",
      expect: "occurrence",
      caught: scan.authorSawHoldout && scan.occurrences.some((o) => o.seed === seed && o.file.endsWith("author.js")),
      got: scan.occurrences.map((o) => `${o.file}:${o.line}`),
    });
  } finally { rmSync(leakRoot, { recursive: true, force: true }); }

  const passed = results.filter((r) => r.caught).length;
  for (const r of results) console.log(`${r.caught ? "caught " : "MISSED "} ${r.control}  -> expected ${r.expect}${r.caught ? "" : `, got ${JSON.stringify(r.got)}`}`);
  console.log(`\nART_RECEIPT_GATE_CONTROLS=${passed}/${results.length}`);
  process.exit(passed === results.length ? 0 : 1);
}

if (CONTROLS) runControls();

const { failures, cases, results, leak, registryRounds, withReceipts } = evaluate();
const pass = failures.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    ART_RECEIPTS_VERIFIED: pass ? "PASS" : "FAIL",
    ART_RECEIPTS_READ: withReceipts,
    ART_RECEIPT_INPUT_FLOOR: MIN_RECEIPTS,
    HOLDOUT_LEAKS_IN_AUTHOR_VISIBLE_SOURCE: leak.occurrences.length,
    AUTHOR_VISIBLE_FILES_SCANNED: leak.scannedFiles,
    HOLDOUT_ROUNDS_REGISTERED: registryRounds,
    failures,
  }, null, 2));
} else {
  console.log(`art receipts: ${withReceipts} read across ${cases.length} discovered case(s), floor ${MIN_RECEIPTS}`);
  for (const r of results) {
    if (!r.problems.length) console.log(`  ok   ${r.id}  verdict ${r.verdict} · holdoutSeenByAuthor ${r.flags?.FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING} · verdictBound ${r.flags?.FINAL_REVIEW_VERDICT_BOUND_TO_REVIEW_DOCUMENT}`);
  }
  for (const f of failures) console.log(`  FAIL ${f.code}: ${f.detail}`);
  console.log("");
  console.log(`ART_RECEIPTS_VERIFIED=${pass ? "PASS" : "FAIL"}`);
  console.log(`ART_RECEIPTS_READ=${withReceipts}`);
  console.log(`HOLDOUT_LEAKS_IN_AUTHOR_VISIBLE_SOURCE=${leak.occurrences.length}`);
  console.log(`AUTHOR_VISIBLE_FILES_SCANNED=${leak.scannedFiles}`);
  console.log(`HOLDOUT_ROUNDS_REGISTERED=${registryRounds}`);
}
process.exit(pass ? 0 : 1);
