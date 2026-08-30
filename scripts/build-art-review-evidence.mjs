#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// BUILD THE COMMITTED EVIDENCE FOR `npm run kit:artreview`.
//
//   node scripts/build-art-review-evidence.mjs <workspace> [<workspace> ...]
//
// A CLAIM THAT THE LOOP PRODUCES DISTINCT COLLECTIONS HAS TO BE RE-DERIVABLE, and a sentence in a
// document is not. This reads finished review workspaces and writes
// `packages/art-review/evidence/loop-runs.json` plus a verbatim copy of each brief, so the gate can
// decode every recorded configuration, compare it against the template preset it started from and
// against the other runs on the same runtime, and re-check every brief digest — offline, from
// committed bytes, without a chain and without trusting this script.
//
// WHAT IT RECORDS AND WHAT IT DOES NOT. It records the configuration bytes, the brief digest, the
// per-round verdicts and critiques in the reviewers' own words, the render commitments, and the
// objective results where a round produced them. It records NO IMAGES: hashes and paths, because a
// record with pictures inside it is a record nobody opens and a diff nobody can read.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readArtDocument, listRounds, readRound, ART_REVIEW_DIR, ITERATION_CEILING } from "../packages/art-review/src/loop.js";
import { readAcceptance } from "../packages/art-review/src/receipt.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "packages", "art-review", "evidence");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const workspaces = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (workspaces.length === 0) {
  console.error("usage: node scripts/build-art-review-evidence.mjs <workspace> [<workspace> ...]");
  process.exit(2);
}

const runs = [];
for (const w of workspaces) {
  const ws = resolve(w);
  const id = basename(ws);
  const art = readArtDocument(ws);
  if (!art.ok) { console.error(`${id}: ${art.detail}`); process.exit(1); }
  const briefText = readFileSync(join(ws, "brief.md"), "utf8");
  writeFileSync(join(OUT, "briefs", `${id}.md`), briefText);

  const rounds = listRounds(ws).map((n) => readRound(ws, n)).filter(Boolean).map((r) => ({
    round: r.round,
    configHash: r.configHash,
    reviewerId: r.reviewerId ?? null,
    verdict: r.verdict ?? null,
    judgedAt: r.judgedAt ?? null,
    axes: r.axes ?? null,
    critique: r.critique ?? [],
    renderCommitment: r.renderCommitment,
    packet: r.packet,
  }));

  const acceptance = readAcceptance(ws);
  const judged = rounds.filter((r) => r.verdict);
  const objectivePath = join(ws, ART_REVIEW_DIR, `round-${rounds.length}`, "objective.json");
  const objective = existsSync(objectivePath) ? JSON.parse(readFileSync(objectivePath, "utf8")) : null;

  const outcome = acceptance?.accepted
    ? "ART_ACCEPTED"
    : judged.length >= ITERATION_CEILING
      ? "ART_QUALITY_NOT_ACCEPTABLE"
      : "IN_PROGRESS";

  runs.push({
    id,
    runtimeId: art.doc.runtimeId,
    templateId: art.doc.templateId ?? null,
    brief: `briefs/${id}.md`,
    briefSha256: sha256(briefText),
    configBytes: art.configBytes,
    configHash: art.configHash,
    outcome,
    judgements: judged.length,
    iterationCeiling: ITERATION_CEILING,
    rounds,
    objective: objective
      ? { pass: objective.pass, checks: objective.checks.map((c) => ({ id: c.id, ok: c.ok, measured: c.measured })) }
      : null,
    acceptedConfigHash: acceptance?.acceptedConfigHash ?? null,
  });
}

const record = {
  $comment: [
    "THE LOOP'S OWN EVIDENCE. Every run here was executed against the runtimes deployed on Ethereum",
    "mainnet: the images were strings returned by eth_call to IArtRuntimeV1.renderV1, they were",
    "rasterised, and a reviewer that was not the author looked at them and wrote the verdict recorded",
    "here in its own words.",
    "NO IMAGES ARE STORED. Hashes and paths, because a record with pictures inside it is a record",
    "nobody opens. The render commitment is sha256 over sorted `<name> <sha256(bytes)>` lines, the",
    "same algorithm the template catalog publishes, so a reader with the chain can recompute it.",
    "A REFUSAL IS A RESULT. Runs that ended ART_QUALITY_NOT_ACCEPTABLE are kept, not deleted: a loop",
    "that has never refused anything has not been shown to be able to.",
  ],
  generatedAt: new Date().toISOString(),
  chainId: 1,
  runtimeRegistry: "0xCB19507D713DfC4cD212BDc545480e1549A9F231",
  iterationCeiling: ITERATION_CEILING,
  runs,
};
writeFileSync(join(OUT, "loop-runs.json"), `${JSON.stringify(record, null, 2)}\n`);
console.log(`wrote ${runs.length} run(s)`);
for (const r of runs) console.log(`  ${r.id.padEnd(20)} ${r.runtimeId.padEnd(24)} ${r.outcome.padEnd(28)} ${r.judgements} judgement(s)`);
