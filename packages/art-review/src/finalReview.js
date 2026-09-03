// SPDX-License-Identifier: MIT
// ================================================================================================
// THE FINAL BLIND REVIEW — the instruction, written down.
//
// WHY THIS FILE EXISTS. The first benchmark round produced twelve blind verdicts and the
// INSTRUCTION THOSE REVIEWERS WERE GIVEN IS NOWHERE IN THE REPOSITORY. `FINAL_REVIEW_BLINDED=YES`
// and `VISUAL_DESCRIPTION_BEFORE_BRIEF_COMPARISON=YES` were both derived from fields in the
// verdict files — from the reviewer's own report that it had been blind. That is a claim about the
// process resting on the testimony of the thing being measured, and it is the same shape as a gate
// that scores itself.
//
// So the prompt is generated here, from the rubric, and written beside the sheets. Twelve
// reviewers get a byte-identical instruction, its hash goes in the run record, and a later round
// can be compared with this one because the standard is a file rather than a memory.
//
// NOTHING HERE MAY SOFTEN THE STANDARD. The rubric is `@relics/art-review`'s own, `briefFidelity`
// is its declared gate and stays one, and the two-stage discipline is the point: a reviewer that
// reads the brief first sees what it was told to look for. The round-one verdicts show what the
// discipline buys — "I wrote the phrase 'a swarm orbiting a core' before I had read a word of the
// brief, and the brief turns out to ask for a single form with almost nothing else" — a refusal
// nobody could argue was anchored.
//
// WHAT THE REVIEWER IS NOT GIVEN, and each omission has a reason:
//   the configuration            it would review the parameters instead of the pictures
//   the objective battery        a number on the sheet is an anchor, and this programme has
//                                already watched a labelled review rate two runtimes highly whose
//                                templates a blind pass then rejected five for five
//   the art direction            that is the DEVELOPMENT critic's input; the final question is
//                                whether the work stands against the BRIEF, not against the plan
//   the author's notes           the author does not get to explain itself to its judge
//   another reviewer's verdict   twelve independent readings, or one reading twelve times
// ================================================================================================

import { createHash } from "node:crypto";

import { GATE_AXIS, RUBRIC_AXES, RUBRIC_AXIS_IDS } from "./rubric.js";

/** The benchmark's own verdict vocabulary. Deliberately NOT the loop's SHIP/REVISE/REJECT. */
export const FINAL_VERDICTS = Object.freeze(["PASS", "REFUSE"]);

/** The prose fields a verdict must carry beside its axes. */
export const VERDICT_PROSE_FIELDS = Object.freeze(["reasoning", "wouldChange"]);

/**
 * The two-stage instruction, generated from the rubric so the two cannot drift.
 *
 * `sheets` are file names only — the reviewer opens them itself. Passing image data through this
 * function would make the prompt unhashable and the instruction unverifiable.
 */
export function finalReviewPrompt({ caseId, sheetDir, sheets, seedCount, states }) {
  const lines = [
    "# Final blind review",
    "",
    "You are the FINAL REVIEWER. You did not make this work, you have not seen it before, and you",
    "are not in conversation with whoever did. Your verdict decides whether it would be committed",
    "permanently on chain. Nobody overrules you and you overrule nobody: a separate objective",
    "battery has already refused anything that is broken as a collection, so everything you are",
    "shown renders, is deterministic, has no duplicate or empty token, and has three distinct",
    "market states. None of that means it is any good. That question is yours alone.",
    "",
    "## The images",
    "",
    `In \`${sheetDir}\`:`,
    "",
    ...sheets.map((s) => `- \`${s}\``),
    "",
    `${seedCount} seeds, ${states.length} market states (${states.join(" / ")}). The 120px sheets are the`,
    "size a collection is actually browsed at and are where these decisions are really settled; the",
    "256px sheets exist so you can check whether what you are seeing at 120 is detail or mush.",
    "",
    "## STAGE 1 — describe, before you are told anything",
    "",
    "Do this FIRST and do not read the brief until it is written. Look at every sheet and write",
    "what you actually see: what the work is made of, what it is a picture OF if anything, what",
    "the twelve have in common and how they differ, what happens across the three market states,",
    "and what survives at 120px. Name it as you would to someone who cannot see it.",
    "",
    "Write it to `description.json`:",
    "",
    "```json",
    JSON.stringify({ reviewerId: `final-${caseId}`, description: "what you see, in your own words, before reading the brief" }, null, 2),
    "```",
    "",
    "## STAGE 2 — now read the brief, and judge",
    "",
    "The brief is in `brief.md` beside the sheets. Read it, then compare it against what you",
    "already wrote. Where your own description and the brief disagree, that disagreement IS the",
    "finding and it is the strongest evidence this process produces — you cannot have been anchored",
    "by something you had not read.",
    "",
    "Judge each axis. Say what you see, name the seeds you are talking about, and be specific:",
    "",
    ...RUBRIC_AXES.map((a) => `### ${a.id}${a.id === GATE_AXIS ? "  (THE GATE)" : ""}\n${a.ask}\n`),
    "## The verdict",
    "",
    `\`PASS\` or \`REFUSE\`. **${GATE_AXIS} is a gate**: if the work is not the thing the brief asked`,
    "for, the verdict is REFUSE however accomplished it is on its own terms. A PASS means you would",
    "be content to see this committed permanently, as it stands, as the answer to that brief.",
    "",
    "Do not grade on a curve, do not soften a refusal, and do not pass work because it is close.",
    "Equally: do not refuse work for failing to be a different artwork than the one commissioned.",
    "",
    "Write `verdict.json`:",
    "",
    "```json",
    JSON.stringify({
      reviewerId: `final-${caseId}`,
      verdict: "PASS | REFUSE",
      describedBeforeBrief: true,
      ...Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, "what you see on this axis, with seeds named"])),
      reasoning: "one paragraph: why this verdict, and what decided it",
      wouldChange: "what you would do to the work, concretely",
    }, null, 2),
    "```",
    "",
    "`describedBeforeBrief` must be `true` and it must be true. If you read the brief first, say so",
    "and say it is false; a review that reports its own procedure wrongly is worth less than none.",
  ];
  return lines.join("\n");
}

export function finalReviewPromptHash(prompt) {
  return createHash("sha256").update(prompt).digest("hex");
}

/**
 * Validate a final verdict.
 *
 * REFUSES A VERDICT THAT SKIPPED AN AXIS rather than treating the absence as a pass, and refuses
 * one whose `describedBeforeBrief` is anything but a literal `true` — including a missing field,
 * which is the shape a reviewer that never wrote a description produces.
 */
export function validateFinalVerdict(v) {
  const problems = [];
  if (!v || typeof v !== "object") return { ok: false, problems: ["the verdict is not an object"] };
  if (!FINAL_VERDICTS.includes(v.verdict)) problems.push(`verdict must be one of ${FINAL_VERDICTS.join(", ")}`);
  if (typeof v.reviewerId !== "string" || !v.reviewerId.trim()) problems.push("reviewerId is missing");
  if (v.describedBeforeBrief !== true) problems.push("describedBeforeBrief must be literally true; an absent field is not a blind review");
  for (const id of [...RUBRIC_AXIS_IDS, ...VERDICT_PROSE_FIELDS]) {
    const value = v[id];
    if (typeof value !== "string" || value.trim().length < 40) problems.push(`${id}: missing or under 40 characters`);
  }
  return { ok: problems.length === 0, problems };
}
