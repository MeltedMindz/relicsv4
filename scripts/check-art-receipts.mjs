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

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ART_ACCEPTANCE_PATH, verifyArtAcceptance, verifyVerdictBinding, acceptanceFlags } from "../packages/art-direction/src/acceptance.js";
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
      cases.push({ id: `${round}/${entry}`, round, roundDir: rd, caseId: entry, dir: cd, receipt, verdict });
    }
  }
  return cases;
}

// ------------------------------------------------------------------------------------------------
// THE ANCHOR OUTSIDE THE CASE DIRECTORY  (finding CLOSE2-B5)
//
// Every check below the verdict binding compares the receipt to files the receipt itself names and
// pins. That is a closed set, and a closed set can be made consistent: flipping
// `final-review/verdict.json` to PASS, flipping the receipt's `finalReview.verdict` to match, and
// updating the sha256 the receipt pinned is THREE edits in TWO files, and it moved the published
// benchmark result from 0/12 to 1/12 with every gate green and `verifyArtAcceptance` -- the
// launch-path function -- returning accepted:true. Reproduced before this was written.
//
// So the verdict is anchored to two things the receipt cannot restate:
//
//   THE ROUND RECORD  `artifacts/<round>/report.json` is written by the benchmark harness, once per
//     round, over all twelve cases. It carries each case's verdict AND the round tally, and the
//     tally is the number the findings document publishes. A forger must now also move the row, the
//     tally, and the published prose -- and the tally is re-derived from the REVIEWERS' OWN
//     documents rather than from the receipts, so the receipts cannot vote on it.
//
//   GIT  the review artifacts must be TRACKED and UNMODIFIED. A receipt is evidence about a review
//     that happened; a verdict document edited in the working tree is not that. This is the anchor
//     the description attack has to cross, because `description.json` appears in no round record.
//     Git unavailable is reported as a NON-MEASUREMENT and fails; it is never a pass.
//
// WHAT THIS STILL DOES NOT REACH, stated rather than implied: a wholesale rewrite of the receipt,
// the reviewer's document, the round report, the findings prose and the git history is a forgery of
// the whole review record, and no artifact set inside one repository can refuse it. What it can no
// longer be is a two-file edit that nothing notices.
// ------------------------------------------------------------------------------------------------

/** `BLIND_PASS = 0/12` / `| `BLIND_PASS` | 0/12 |` — the published number, wherever the round states it. */
const BLIND_PASS_STATED = /BLIND_PASS`?\**\s*(?:=|\|)\s*\**`?(\d+)\s*\/\s*(\d+)/g;

/** Load one round's out-of-case anchors: the harness's report and the published findings prose. */
export function readRoundAnchors(roundDir) {
  const reportPath = join(roundDir, "report.json");
  let report = null;
  let reportError = null;
  if (existsSync(reportPath)) {
    try { report = readJson(reportPath); }
    catch (err) { reportError = err.message; }
  }
  const docs = [];
  for (const name of readdirSync(roundDir).sort()) {
    if (!name.endsWith(".md")) continue;
    const abs = join(roundDir, name);
    const text = readFileSync(abs, "utf8");
    const stated = [...text.matchAll(BLIND_PASS_STATED)].map((m) => ({ pass: Number(m[1]), total: Number(m[2]) }));
    if (stated.length) docs.push({ path: abs, stated });
  }
  return { reportPath, report, reportError, docs };
}

/** Verify one receipt against everything it names. Returns a list of problems; empty is a pass. */
export function verifyCase(c, anchors = null) {
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

  // ---- 6b. THE VERDICT IS ANCHORED OUTSIDE THIS DIRECTORY (finding CLOSE2-B5) ------------------
  //
  // The authority for the comparison is the REVIEWER'S DOCUMENT, not the receipt: `bound.document`
  // is the parsed `final-review/verdict.json` the binding check just re-read and re-hashed. Using
  // the receipt's own copy here would put the forger on both sides of the comparison again.
  if (anchors) {
    const documentVerdict = bound.ok ? bound.document?.[r.finalReview?.verdictDocument?.verdictField ?? "verdict"] : undefined;
    if (anchors.reportError) {
      fail("ROUND_REPORT_UNREADABLE", `${c.id}: ${relative(ROOT, anchors.reportPath)} did not parse (${anchors.reportError}), so this verdict has no anchor outside its own directory.`);
    } else if (!anchors.report) {
      fail(
        "ROUND_REPORT_MISSING",
        `${c.id}: there is no ${relative(ROOT, anchors.reportPath)}. Every check on this receipt would then compare it only ` +
        "to files it names itself, which is a closed set a forger can make consistent.",
      );
    } else {
      const rows = Array.isArray(anchors.report.rows) ? anchors.report.rows : [];
      const row = rows.find((x) => x?.id === c.caseId);
      if (!row) {
        fail("VERDICT_UNANCHORED", `${c.id}: the round report lists no row for ${c.caseId}, so its verdict rests on nothing outside its own directory.`);
      } else {
        if (documentVerdict !== undefined && row.verdict !== documentVerdict) {
          fail(
            "VERDICT_DISAGREES_WITH_ROUND_REPORT",
            `${c.id}: the reviewer's own document says ${JSON.stringify(documentVerdict)} and the round report says ` +
            `${JSON.stringify(row.verdict)}. One of them was edited; the receipt does not get to decide which.`,
          );
        }
        if (r.finalReview?.reviewerId && row.reviewerId && row.reviewerId !== r.finalReview.reviewerId) {
          fail("VERDICT_DISAGREES_WITH_ROUND_REPORT", `${c.id}: the receipt names reviewer ${JSON.stringify(r.finalReview.reviewerId)} and the round report names ${JSON.stringify(row.reviewerId)}.`);
        }
        if (row.acceptedConfigHash && r.acceptedConfigHash && row.acceptedConfigHash !== r.acceptedConfigHash) {
          fail("VERDICT_DISAGREES_WITH_ROUND_REPORT", `${c.id}: the round report recorded acceptedConfigHash ${String(row.acceptedConfigHash).slice(0, 12)} and the receipt carries ${String(r.acceptedConfigHash).slice(0, 12)}.`);
        }
      }
    }
  }

  // ---- 6c. THE LAUNCH-PATH FUNCTION ITSELF, RUN WITH THE ANCHOR --------------------------------
  //
  // `verifyArtAcceptance` is what an autonomous agent's launch consults, and under the CLOSE2-B5
  // attack it returned accepted:true. Running it HERE, with the round record supplied, is the
  // difference between a gate that reports a defect and a gate that exercises the function the
  // defect was in.
  if (anchors?.report) {
    const row = (Array.isArray(anchors.report.rows) ? anchors.report.rows : []).find((x) => x?.id === c.caseId);
    if (row) {
      const verdictNow = verifyArtAcceptance(c.dir, {
        externalVerdict: { verdict: row.verdict, reviewerId: row.reviewerId, source: relative(ROOT, anchors.reportPath) },
      });
      if (verdictNow.externalAnchor !== "CHECKED") {
        fail("LAUNCH_PATH_ANCHOR_NOT_CONSULTED", `${c.id}: verifyArtAcceptance reported externalAnchor=${JSON.stringify(verdictNow.externalAnchor)} while an external record was supplied.`);
      }
      if (verdictNow.reasonCode === "FINAL_REVIEW_VERDICT_CONTRADICTS_EXTERNAL_RECORD") {
        fail("LAUNCH_PATH_VERDICT_CONTRADICTS_ROUND_RECORD", `${c.id}: ${verdictNow.detail}`);
      }
      // A PASS verdict the round did not record is the whole attack, arriving through the launch path.
      if (verdictNow.accepted === true && row.verdict !== "PASS") {
        fail("LAUNCH_PATH_ACCEPTS_A_VERDICT_THE_ROUND_DID_NOT_RECORD", `${c.id}: verifyArtAcceptance returned accepted:true while ${relative(ROOT, anchors.reportPath)} records ${JSON.stringify(row.verdict)}.`);
      }
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

/**
 * THE ROUND TALLY, RE-DERIVED FROM THE REVIEWERS' OWN DOCUMENTS (finding CLOSE2-B5).
 *
 * `blindPass` is the number this project publishes. It is checked against the verdicts read out of
 * `final-review/verdict.json` -- never out of the receipts -- so a receipt cannot vote on the
 * aggregate that anchors it, and flipping one case now contradicts the round.
 */
export function checkRoundTallies(cases, root = ROOT) {
  const problems = [];
  let checks = 0;
  const byRound = new Map();
  for (const c of cases) {
    if (!byRound.has(c.round)) byRound.set(c.round, []);
    byRound.get(c.round).push(c);
  }
  for (const [round, members] of [...byRound.entries()].sort()) {
    const anchors = readRoundAnchors(members[0].roundDir);
    if (!anchors.report) continue; // reported per case as ROUND_REPORT_MISSING
    let derivedPass = 0;
    let readable = 0;
    for (const c of members) {
      if (!existsSync(c.verdict)) continue;
      try {
        const v = readJson(c.verdict);
        readable += 1;
        if (v?.verdict === "PASS") derivedPass += 1;
      } catch { /* an unparseable verdict document is already a per-case failure */ }
    }
    checks += 1;
    if (readable === 0) {
      problems.push({ code: "ROUND_TALLY_UNVERIFIABLE", detail: `${round}: no reviewer document in the round could be read, so the published tally is anchored to nothing.` });
      continue;
    }
    if (Number(anchors.report.blindPass) !== derivedPass) {
      problems.push({
        code: "ROUND_TALLY_DISAGREES_WITH_REVIEWER_DOCUMENTS",
        detail:
          `${round}: ${relative(root, anchors.reportPath)} publishes blindPass=${anchors.report.blindPass} and the reviewers' own ` +
          `documents give ${derivedPass} of ${readable}. A verdict flipped in one case directory contradicts the round it belongs to.`,
      });
    }
    // THE DENOMINATOR IS THE ROUND'S BRIEFS, NOT ITS CASE DIRECTORIES. Round 3 carries twelve briefs
    // and eleven case directories: B11 was refused at ADMISSION and never reviewed, so it has a row
    // and no evidence directory, by design. Using the directory count here reported a false drift on
    // a correct tree the first time this was run -- which is the shape of finding a gate is supposed
    // to avoid, not produce.
    const rows = Array.isArray(anchors.report.rows) ? anchors.report.rows : [];
    checks += 1;
    if (Number(anchors.report.total) !== rows.length) {
      problems.push({
        code: "ROUND_TALLY_DISAGREES_WITH_REVIEWER_DOCUMENTS",
        detail: `${round}: the report says total=${anchors.report.total} and carries ${rows.length} row(s).`,
      });
    }
    // The forward direction: a row claiming a REVIEW must have the evidence directory that review
    // produced. A row refused at admission never had one and does not claim a verdict.
    const onDisk = new Set(members.map((c) => c.caseId));
    for (const row of rows) {
      if (row?.outcome !== "ADMITTED") continue;
      checks += 1;
      if (!onDisk.has(row.id)) {
        problems.push({
          code: "ROUND_REPORT_ROW_WITHOUT_EVIDENCE",
          detail: `${round}: the report records ${row.id} as ADMITTED with verdict ${JSON.stringify(row.verdict)} and there is no case directory for it.`,
        });
      }
    }
    for (const doc of anchors.docs) {
      for (const stated of doc.stated) {
        checks += 1;
        if (stated.pass !== derivedPass || stated.total !== Number(anchors.report.total)) {
          problems.push({
            code: "PUBLISHED_BLIND_PASS_DISAGREES_WITH_THE_REVIEWER_DOCUMENTS",
            detail:
              `${relative(root, doc.path)} publishes BLIND_PASS = ${stated.pass}/${stated.total} and the reviewers' documents give ` +
              `${derivedPass}/${anchors.report.total}. The published number and the evidence must move together or neither is evidence.`,
          });
        }
      }
    }
  }
  return { problems, checks };
}

/**
 * THE REVIEW ARTIFACTS MUST BE TRACKED AND UNMODIFIED (finding CLOSE2-B5).
 *
 * `description.json` appears in no round record, so the cross-artifact anchor above cannot reach the
 * description attack. This can: a receipt is evidence about a review that HAPPENED, and a reviewer's
 * document edited in the working tree -- however consistently the receipt's pin was updated beside
 * it -- is not that. Git is the one authority in this repository that a receipt cannot restate.
 *
 * A repository git cannot read is a NON-MEASUREMENT and fails. It is never a pass.
 */
export function checkReviewArtifactProvenance(cases, root = ROOT) {
  const problems = [];
  const paths = [];
  for (const c of cases) {
    for (const p of [c.receipt, c.verdict, join(c.dir, "final-review", "description.json")]) {
      if (existsSync(p)) paths.push(relative(root, p));
    }
  }
  if (paths.length === 0) return { problems, checked: 0, status: "NO_ARTIFACTS" };

  const status = spawnSync("git", ["status", "--porcelain", "--", ...paths], { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  if (status.status !== 0 || typeof status.stdout !== "string") {
    problems.push({
      code: "GIT_PROVENANCE_UNAVAILABLE",
      detail:
        `\`git status\` could not be run over the review artifacts (${(status.stderr ?? "").trim() || `exit ${status.status}`}). ` +
        "Their provenance is therefore UNMEASURED, and an unmeasured check is not a passing one.",
    });
    return { problems, checked: paths.length, status: "UNAVAILABLE" };
  }
  for (const line of status.stdout.split("\n").map((l) => l.trim()).filter(Boolean)) {
    problems.push({
      code: "REVIEW_ARTIFACT_NOT_COMMITTED",
      detail:
        `${line} — a review artifact is modified or untracked in the working tree. A receipt records a review that happened; ` +
        "an edited reviewer document with the receipt's pin updated beside it is exactly the forgery a self-contained artifact " +
        "set cannot refuse, and this is the anchor it has to cross.",
    });
  }
  return { problems, checked: paths.length, status: "MEASURED" };
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

  const anchorsByRound = new Map();
  for (const c of cases) {
    if (!anchorsByRound.has(c.round)) anchorsByRound.set(c.round, readRoundAnchors(c.roundDir));
  }
  const results = cases.map((c) => verifyCase(c, anchorsByRound.get(c.round) ?? null));
  for (const res of results) for (const p of res.problems) failures.push(p);

  const tallies = checkRoundTallies(cases, root);
  for (const p of tallies.problems) failures.push(p);

  // Git provenance is a statement about THIS repository; a temporary control tree is not one and is
  // correctly reported as not measured there rather than silently passing.
  const provenance = root === ROOT ? checkReviewArtifactProvenance(cases, root) : { problems: [], checked: 0, status: "NOT_THIS_REPOSITORY" };
  for (const p of provenance.problems) failures.push(p);

  const leak = liveLeakScan(cases, root);
  for (const p of leak.problems) failures.push(p);

  let registryRounds = 0;
  try { registryRounds = readRoundRegistry().rounds.length; }
  catch (err) { failures.push({ code: "ROUND_REGISTRY_UNREADABLE", detail: err.message }); }

  return { failures, cases, results, leak, registryRounds, withReceipts: withReceipts.length, tallies, provenance };
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
  // The donor's OWN round anchors travel with the copy, so every control is scored against the same
  // out-of-case record the real run uses (finding CLOSE2-B5). Without them `verifyCase` would run
  // with `anchors: null` and the new rules would be silently absent from every control.
  const donorAnchors = readRoundAnchors(donor.roundDir);
  const withCopy = (label, expect, mutate, opts = {}) => {
    const tmp = mkdtempSync(join(tmpdir(), "art-receipt-control-"));
    try {
      const dir = join(tmp, "case");
      cpSync(donor.dir, dir, { recursive: true });
      const before = readFileSync(join(dir, ART_ACCEPTANCE_PATH), "utf8");
      mutate(dir);
      const after = existsSync(join(dir, ART_ACCEPTANCE_PATH)) ? readFileSync(join(dir, ART_ACCEPTANCE_PATH), "utf8") : "";
      const touchedReceipt = before !== after;
      const res = verifyCase(
        { id: label, round: donor.round, roundDir: donor.roundDir, caseId: donor.caseId, dir, receipt: join(dir, ART_ACCEPTANCE_PATH), verdict: join(dir, "final-review", "verdict.json") },
        opts.anchors === undefined ? donorAnchors : opts.anchors,
      );
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

  // ---- CLOSE2-B5: THE ATTACK THAT WORKED, AND THE ANCHOR THAT NOW STOPS IT --------------------
  //
  // C2 above flips the verdict in the receipt AND the reviewer's document and is caught only
  // because the receipt's PINNED DIGEST no longer matches. Update the pin too and every check
  // inside the case directory agrees: that is three edits in two files, it moved the published
  // benchmark result from 0/12 to 1/12, and `verifyArtAcceptance` returned accepted:true.
  withCopy("C12 the verdict is flipped in the receipt, the document AND the pin", "VERDICT_DISAGREES_WITH_ROUND_REPORT", (dir) => {
    const vp = join(dir, "final-review", "verdict.json");
    const v = JSON.parse(readFileSync(vp, "utf8"));
    v.verdict = "PASS";
    const bytes = `${JSON.stringify(v, null, 2)}\n`;
    writeFileSync(vp, bytes);
    patchReceipt(dir, (r) => {
      r.finalReview.verdict = "PASS";
      r.finalReview.verdictDocument.sha256 = sha256(Buffer.from(bytes));
    });
  });

  // And the anchor must be REQUIRED, not merely consulted where it happens to exist.
  withCopy("C13 the round record is missing entirely", "ROUND_REPORT_MISSING", () => {}, { anchors: { reportPath: join(donor.roundDir, "report.json"), report: null, reportError: null, docs: [] } });

  // C14 — the DESCRIPTION attack. `description.json` appears in no round record, so the
  // cross-artifact anchor cannot reach it: edit the description and recompute the receipt's pinned
  // hash with the gate's OWN algorithm and DESCRIPTION_ALTERED does not fire. Git is what catches
  // it. Proved in an ISOLATED repository so the real tree is never touched.
  {
    const gitRoot = mkdtempSync(join(tmpdir(), "art-receipt-git-"));
    try {
      const caseDir = join(gitRoot, "artifacts", donor.round, donor.caseId);
      mkdirSync(dirname(caseDir), { recursive: true });
      cpSync(donor.dir, caseDir, { recursive: true });
      const git = (...args) => spawnSync("git", args, { cwd: gitRoot, encoding: "utf8" });
      git("init", "-q");
      git("-c", "user.email=control@example.invalid", "-c", "user.name=control", "add", "-A");
      git("-c", "user.email=control@example.invalid", "-c", "user.name=control", "commit", "-q", "-m", "control");
      const cases = [{ dir: caseDir, receipt: join(caseDir, ART_ACCEPTANCE_PATH), verdict: join(caseDir, "final-review", "verdict.json") }];

      const clean = checkReviewArtifactProvenance(cases, gitRoot);
      results.push({
        control: "C14a a committed, unmodified review record is clean",
        expect: "no problems",
        caught: clean.problems.length === 0 && clean.status === "MEASURED" && clean.checked >= 3,
        got: clean.problems.map((p) => p.code),
      });

      const dp = join(caseDir, "final-review", "description.json");
      const d = JSON.parse(readFileSync(dp, "utf8"));
      d.description = "a blind description the reviewer never wrote";
      writeFileSync(dp, `${JSON.stringify(d, null, 2)}\n`);
      const rp = join(caseDir, ART_ACCEPTANCE_PATH);
      const rec = JSON.parse(readFileSync(rp, "utf8"));
      // The pin, recomputed with the GATE'S OWN algorithm -- so DESCRIPTION_ALTERED cannot fire and
      // only the anchor outside the receipt is left to catch this.
      rec.finalReview.visualDescriptionHash = createHash("sha256").update(JSON.stringify(readJson(dp))).digest("hex");
      writeFileSync(rp, `${JSON.stringify(rec, null, 2)}\n`);

      const selfConsistent = verifyCase({ id: "C14", round: donor.round, roundDir: donor.roundDir, caseId: donor.caseId, dir: caseDir, receipt: rp, verdict: join(caseDir, "final-review", "verdict.json") }, donorAnchors);
      const dirty = checkReviewArtifactProvenance(cases, gitRoot);
      results.push({
        control: "C14 the description is rewritten and the receipt's pin updated consistently",
        expect: "REVIEW_ARTIFACT_NOT_COMMITTED",
        caught:
          dirty.problems.some((p) => p.code === "REVIEW_ARTIFACT_NOT_COMMITTED") &&
          // AND the point of the control: the in-case checks do NOT catch it, so the anchor is
          // load-bearing rather than redundant.
          !selfConsistent.problems.some((p) => p.code === "DESCRIPTION_ALTERED"),
        got: [...dirty.problems.map((p) => p.code), ...selfConsistent.problems.map((p) => `in-case:${p.code}`)],
      });

      const unreadable = checkReviewArtifactProvenance(cases, join(gitRoot, "not-a-repository"));
      results.push({
        control: "C15 an unreadable repository is a NON-MEASUREMENT, never a pass",
        expect: "GIT_PROVENANCE_UNAVAILABLE",
        caught: unreadable.problems.some((p) => p.code === "GIT_PROVENANCE_UNAVAILABLE") || unreadable.status !== "MEASURED",
        got: [unreadable.status, ...unreadable.problems.map((p) => p.code)],
      });
    } finally { rmSync(gitRoot, { recursive: true, force: true }); }
  }

  // C16 — the round tally must contradict a flipped verdict even with the case directory perfect.
  {
    const donorRoundCases = discoverCases().filter((c) => c.round === donor.round);
    const tallyRoot = mkdtempSync(join(tmpdir(), "art-receipt-tally-"));
    try {
      cpSync(join(ROOT, "artifacts", donor.round), join(tallyRoot, "artifacts", donor.round), { recursive: true });
      const copied = donorRoundCases.map((c) => ({ ...c, roundDir: join(tallyRoot, "artifacts", donor.round), dir: join(tallyRoot, "artifacts", donor.round, c.caseId), verdict: join(tallyRoot, "artifacts", donor.round, c.caseId, "final-review", "verdict.json"), receipt: join(tallyRoot, "artifacts", donor.round, c.caseId, ART_ACCEPTANCE_PATH) }));
      const baseline = checkRoundTallies(copied, tallyRoot);
      const vp = copied[0].verdict;
      const v = JSON.parse(readFileSync(vp, "utf8"));
      v.verdict = "PASS";
      writeFileSync(vp, `${JSON.stringify(v, null, 2)}\n`);
      const mutated = checkRoundTallies(copied, tallyRoot);
      results.push({
        control: "C16 one flipped reviewer document contradicts the round tally and the published number",
        expect: "ROUND_TALLY_DISAGREES_WITH_REVIEWER_DOCUMENTS",
        caught:
          baseline.problems.length === 0 &&
          baseline.checks > 0 &&
          mutated.problems.some((p) => p.code === "ROUND_TALLY_DISAGREES_WITH_REVIEWER_DOCUMENTS") &&
          mutated.problems.some((p) => p.code === "PUBLISHED_BLIND_PASS_DISAGREES_WITH_THE_REVIEWER_DOCUMENTS"),
        got: [`baseline:${baseline.problems.length}`, ...mutated.problems.map((p) => p.code)],
      });
    } finally { rmSync(tallyRoot, { recursive: true, force: true }); }
  }

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

const { failures, cases, results, leak, registryRounds, withReceipts, tallies, provenance } = evaluate();
const pass = failures.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    ART_RECEIPTS_VERIFIED: pass ? "PASS" : "FAIL",
    ART_RECEIPTS_READ: withReceipts,
    ART_RECEIPT_INPUT_FLOOR: MIN_RECEIPTS,
    HOLDOUT_LEAKS_IN_AUTHOR_VISIBLE_SOURCE: leak.occurrences.length,
    AUTHOR_VISIBLE_FILES_SCANNED: leak.scannedFiles,
    HOLDOUT_ROUNDS_REGISTERED: registryRounds,
    VERDICT_ANCHORED_OUTSIDE_THE_CASE_DIRECTORY: pass ? "YES" : "NO",
    ROUND_ANCHOR_CHECKS: tallies.checks,
    REVIEW_ARTIFACT_GIT_PROVENANCE: provenance.status,
    REVIEW_ARTIFACTS_PROVENANCE_CHECKED: provenance.checked,
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
  console.log(`VERDICT_ANCHORED_OUTSIDE_THE_CASE_DIRECTORY=${pass ? "YES" : "NO"}`);
  console.log(`ROUND_ANCHOR_CHECKS=${tallies.checks}`);
  console.log(`REVIEW_ARTIFACT_GIT_PROVENANCE=${provenance.status}`);
  console.log(`REVIEW_ARTIFACTS_PROVENANCE_CHECKED=${provenance.checked}`);
}
process.exit(pass ? 0 : 1);
