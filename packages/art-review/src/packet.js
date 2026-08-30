// SPDX-License-Identifier: MIT
// ================================================================================================
// THE REVIEWER PACKET — what a reviewer is given, and everything it is deliberately not given.
//
// THE AUTHOR MAY NOT APPROVE ITS OWN WORK. That is the whole reason this file exists as a
// redactor rather than as a function that returns an object. The authoring agent has already
// decided the configuration is good; asking it whether the configuration is good returns the
// decision it already made, dressed as a finding. So the judgement is made by a separate reviewer,
// and what reaches that reviewer passes through here.
//
// ANCHORING IS THE SPECIFIC FAILURE BEING PREVENTED, AND IT HAS ALREADY HAPPENED HERE. A labelled
// review in this program rated two runtimes highly and a blind pass over the same material then
// rejected their templates five for five. The labels were not lies; they were context, and context
// is enough. So:
//
//   1. NO AUTHOR CLAIMS. Nothing the author wrote about its own work reaches the packet. Not a
//      change log, not an intent statement, not "this addresses the critique". The reviewer finds
//      out whether the critique was addressed by LOOKING at the new pictures against its own
//      earlier words.
//   2. NO SCORES BEFORE THE FIRST JUDGEMENT. The objective battery's results are withheld until a
//      verdict exists for round 1, and the withholding is enforced by a function that refuses,
//      not by a convention somebody remembers.
//   3. NO PARAMETERS. No configuration, no byte diff, no trait table, no SVG source. A reviewer
//      given parameters reviews parameters. The packet is a brief, a rubric and pictures.
//
// WHAT IS NOT REDACTED, AND WHY. From round two the packet carries the reviewer's OWN prior
// critique. That is not an author claim — it is the reviewer's own work order, and without it the
// reviewer cannot check whether what it asked for was done. Withholding it would make every round
// a fresh first impression and make the loop unable to converge.
// ================================================================================================
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { OBJECTIVE_CHECK_IDS } from "./objective.js";
import { AXIS_JUDGEMENTS, GATE_AXIS, RUBRIC_AXIS_IDS, VERDICTS, rubricMarkdown } from "./rubric.js";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * The ONLY keys `REVIEW_REQUEST.json` may carry.
 *
 * A WHITELIST AND NOT A BLOCKLIST, because the thing being kept out is whatever an author thinks
 * of next. Anything not named here is dropped silently from the request and reported as dropped in
 * the build result, so a caller can see what it tried to send.
 */
export const PACKET_ALLOWED_KEYS = Object.freeze([
  "schemaVersion", "round", "roundsRemaining", "runtimeId", "templateId", "chainId",
  "briefSha256", "images", "priorCritique", "objectiveDisclosed", "instructions",
]);

/**
 * WHAT EACH FILE IN A PACKET IS SCANNED FOR. Three classes, not two, and the reason is that the
 * packet carries text from three different pens.
 *
 *   FULL            everything the packet builder composes. Author claims AND metric names refused.
 *   OBJECTIVE_ONLY  text written by the REVIEWER, in earlier rounds, or by this package quoting
 *                   the phrases it forbids. An author cannot write here — the loop copies it
 *                   verbatim out of a `verdict.json` — so refusing quality vocabulary in it is a
 *                   category error: a reviewer saying "the stress row is the cleanest state in the
 *                   packet" is doing its job. Metric names are STILL refused, so a forged critique
 *                   cannot smuggle a score in.
 *   AUTHOR_ONLY     the objective disclosure. Metric names are the entire point of the file; it is
 *                   written only after the first unanchored judgement, and it must still carry no
 *                   author claim.
 *   NONE            the creator's brief, verbatim, and the generated rubric. Censoring the brief
 *                   would change the ground truth the review is conducted against — "a strong
 *                   vertical axis" is a requirement, not a boast — and the rubric quotes the exact
 *                   phrasings it exists to forbid.
 *
 * A POLICY TABLE THAT DOES NOT MATCH WHAT IT COVERED IS A HIDING PLACE: `buildPacket` asserts that
 * every non-FULL file it wrote is named here and vice versa, so a fourth exempt file cannot appear
 * unnoticed and a declared exemption for a file nobody writes cannot sit here unused.
 */
export const PACKET_SCAN_POLICY = Object.freeze({
  "brief.md": "NONE",
  "RUBRIC.md": "NONE",
  "reviewer-prompt.md": "OBJECTIVE_ONLY",
  "prior-critique.json": "OBJECTIVE_ONLY",
  "objective-disclosure.json": "AUTHOR_ONLY",
});
export const PACKET_SCAN_CLASSES = Object.freeze(["FULL", "OBJECTIVE_ONLY", "AUTHOR_ONLY", "NONE"]);

/**
 * Author-claim vocabulary. Matched case-insensitively on WORD BOUNDARIES.
 *
 * These are shapes rather than a list of sentences somebody once wrote. The distinction matters:
 * a gate widened to the exact sentence it was shown is a gate that has tested your memory. Each
 * entry is a way of asserting that the work is good, that it satisfies the brief, or that a
 * previous finding has been dealt with — the three things a reviewer must decide for itself.
 */
export const AUTHOR_CLAIM_PATTERNS = Object.freeze([
  { id: "QUALITY_ASSERTION", re: /\b(?:looks?|reads?|is|feels?)\s+(?:really\s+|very\s+|quite\s+)?(?:good|great|strong|excellent|beautiful|striking|polished|solid|clean)\b/i },
  { id: "READY_TO_SHIP", re: /\b(?:ready\s+to\s+ship|ship[- ]ready|launch[- ]ready|good\s+to\s+go|approved|sign[- ]?off)\b/i },
  { id: "BRIEF_SATISFIED", re: /\b(?:matches|meets|satisfies|fulfils|fulfills|delivers\s+on|is\s+faithful\s+to|hits)\s+the\s+brief\b/i },
  { id: "CRITIQUE_RESOLVED", re: /\b(?:addressed|resolved|fixed|corrected|acted\s+on)\s+(?:the\s+|your\s+|every\s+|all\s+)?(?:critique|feedback|note|finding|comment)s?\b/i },
  { id: "SELF_RECOMMENDATION", re: /\b(?:I|we)\s+(?:believe|think|recommend|am\s+confident|are\s+confident)\b/i },
  { id: "IMPROVEMENT_CLAIM", re: /\b(?:much\s+)?(?:improved|better\s+than|stronger\s+than|an\s+improvement\s+(?:on|over))\b/i },
  { id: "GATE_ASSERTION", re: /\b(?:passe[sd]|clears?|cleared)\s+(?:every|all|the)\s+(?:gate|check|test|floor)s?\b/i },
  // A SUPERLATIVE IS A QUALITY ASSERTION WEARING A DESCRIPTION. "the cleanest state in the packet"
  // reads as observation and lands as a ranking, and a ranking supplied by the author is the
  // anchor this whole redaction exists to remove. A reviewer writing the same words about its own
  // findings is exempt — see PACKET_SCAN_POLICY — because there it is the judgement, not a nudge.
  { id: "SUPERLATIVE", re: /\b(?:is|are|reads?|looks?|feels?)\s+(?:by\s+far\s+)?(?:the\s+)?(?:most|best|cleanest|strongest|finest|nicest|clearest|sharpest|boldest)\b/i },
]);

/**
 * The objective battery's own vocabulary, DERIVED from the battery so a new check is covered.
 *
 * EVERY RULE HERE KEYS ON AN IDENTIFIER THIS PACKAGE EMITS, NEVER ON AN ENGLISH WORD. That
 * distinction cost two refused packets before it was written down. A reviewer legitimately says
 * "enforce a floor of 35% lit rows" and "seed 175 goes from 40.3% to 59.3% ink" — those are its own
 * measurements, made by looking, and they are the job. What must not reach a reviewer is the
 * BATTERY'S output: its check ids, its exported constant names, and the JSON keys it serialises to.
 * A rule that cannot tell those apart refuses the reviewer's own work.
 */
export function objectiveLeakPatterns() {
  return Object.freeze([
    ...OBJECTIVE_CHECK_IDS.map((id) => ({ id: `CHECK_ID_${id}`, re: new RegExp(`\\b${id}\\b`) })),
    { id: "DELTA_E_MEASURE", re: /\bdeltaE\b|\bminPairDeltaE\b|"(?:meanDeltaE|minDeltaE|weakestPairing)"\s*:/ },
    { id: "INK_MEASURE", re: /\binkCoverage\b|"(?:minInk|meanInk)"\s*:/ },
    // THE BATTERY'S FLOOR TABLE, NOT THE ENGLISH WORD. Written as `\bfloor:?\b` this matched a
    // reviewer's own "enforce a floor of 35% lit rows", which is a work order and not a leak — it
    // refused two real packets before its own controls named the shape. What must not reach a
    // reviewer is the battery's exported constant and the JSON key it serialises to.
    { id: "FLOOR_TABLE", re: /\bFLOORS\b|"floors"\s*:/ },
    { id: "OBJECTIVE_RESULT", re: /\bobjective\s+(?:battery|result|check|score)s?\b/i },
  ]);
}

/**
 * The one pure predicate the controls exercise.
 *
 * Returns every finding rather than the first, because a packet with three leaks and one reported
 * gets fixed once and shipped with two.
 */
export function scanForLeaks(text, { scanClass = "FULL" } = {}) {
  if (!PACKET_SCAN_CLASSES.includes(scanClass)) throw new Error(`scanForLeaks: ${scanClass} is not a scan class`);
  if (scanClass === "NONE") return [];
  const findings = [];
  const lines = String(text).split("\n");
  const patterns =
    scanClass === "AUTHOR_ONLY" ? AUTHOR_CLAIM_PATTERNS
      : scanClass === "OBJECTIVE_ONLY" ? objectiveLeakPatterns()
        : [...AUTHOR_CLAIM_PATTERNS, ...objectiveLeakPatterns()];
  for (const [i, line] of lines.entries()) {
    for (const p of patterns) {
      if (p.re.test(line)) findings.push({ rule: p.id, line: i + 1, text: line.trim().slice(0, 160) });
    }
  }
  return findings;
}

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

const TEXTUAL = /\.(?:json|md|txt)$/i;

/**
 * Write one round's packet and PROVE it carries nothing it should not.
 *
 * The scan runs over the packet AS WRITTEN, not over the inputs, because the question is what a
 * reviewer will actually read. If it finds anything, the packet is reported unusable and the
 * caller must refuse the round rather than review it.
 */
export function buildPacket({ packetDir, round, roundsRemaining, runtimeId, templateId, chainId, briefText, sheetsDir, sheetArtifacts, priorCritique = [], objectiveDisclosure = null }) {
  mkdirSync(join(packetDir, "images"), { recursive: true });

  writeFileSync(join(packetDir, "brief.md"), briefText);
  writeFileSync(join(packetDir, "RUBRIC.md"), rubricMarkdown());

  const images = [];
  for (const a of sheetArtifacts) {
    const flat = a.path.replace(/[/\\]/g, "--");
    copyFileSync(join(sheetsDir, a.path), join(packetDir, "images", flat));
    images.push({ file: `images/${flat}`, sha256: a.sha256, bytes: a.bytes });
  }

  const request = {
    schemaVersion: 1,
    round,
    roundsRemaining,
    runtimeId,
    templateId,
    chainId,
    briefSha256: sha256(briefText),
    images,
    // A POINTER, NOT THE TEXT. The reviewer's earlier words live in their own file so the request
    // itself stays under the FULL scan; carrying them inline made the whole request unscannable for
    // author claims, which is the one thing it exists to be scanned for.
    priorCritique: priorCritique.length > 0 ? "prior-critique.json" : null,
    objectiveDisclosed: objectiveDisclosure !== null,
    instructions: [
      "Open every image in this packet and look at it. The verdict is about the pictures.",
      "Read brief.md first, then RUBRIC.md, then judge.",
      "The 120px sheets are not previews of the large ones. They are the size a collection is browsed at, and they are where this project's verdicts have actually been decided.",
      "You were not told what the author thinks of this work, and that is deliberate. Do not ask.",
      "Write your judgement to verdict.json beside this file.",
    ],
  };
  const dropped = [];
  for (const k of Object.keys(request)) if (!PACKET_ALLOWED_KEYS.includes(k)) dropped.push(k);
  const filtered = Object.fromEntries(Object.entries(request).filter(([k]) => PACKET_ALLOWED_KEYS.includes(k)));
  writeFileSync(join(packetDir, "REVIEW_REQUEST.json"), `${JSON.stringify(filtered, null, 2)}\n`);

  if (priorCritique.length > 0) {
    writeFileSync(join(packetDir, "prior-critique.json"), `${JSON.stringify({ $note: "Your own findings from earlier rounds. Not the author's.", rounds: priorCritique }, null, 2)}\n`);
  }

  if (objectiveDisclosure) {
    writeFileSync(join(packetDir, "objective-disclosure.json"), `${JSON.stringify(objectiveDisclosure, null, 2)}\n`);
  }

  // THE SKELETON AND THE PROMPT. Both are generated, and generating them is what makes the
  // separation operable rather than aspirational: an author handing this packet to a reviewer has
  // nothing left to write, so there is no natural place for it to add what it thinks of the work.
  writeFileSync(join(packetDir, "verdict.template.json"), `${JSON.stringify(verdictTemplate(round), null, 2)}\n`);
  writeFileSync(join(packetDir, "reviewer-prompt.md"), reviewerPrompt({ round, roundsRemaining, priorCritique, objectiveDisclosed: objectiveDisclosure !== null }));

  // ---- the proof ---------------------------------------------------------------------------------
  const files = walk(packetDir);
  const scanned = [];
  const relaxed = [];
  const leaks = [];
  for (const f of files) {
    if (!TEXTUAL.test(f)) continue;
    const scanClass = PACKET_SCAN_POLICY[f] ?? "FULL";
    if (scanClass !== "FULL") relaxed.push(f);
    scanned.push({ file: f, scanClass });
    for (const finding of scanForLeaks(readFileSync(join(packetDir, f), "utf8"), { scanClass })) {
      leaks.push({ file: f, scanClass, ...finding });
    }
  }
  const declaredPresent = Object.keys(PACKET_SCAN_POLICY).filter((f) => files.includes(f));
  if (relaxed.length !== declaredPresent.length || relaxed.some((f) => !declaredPresent.includes(f))) {
    leaks.push({ file: "$packet", rule: "SCAN_POLICY_DRIFT", line: 0, text: `${relaxed.length} file(s) were scanned under a relaxed class but ${declaredPresent.length} are declared. A policy table that does not match what it covered is a hiding place.` });
  }
  if (images.length === 0) {
    leaks.push({ file: "$packet", rule: "NO_IMAGES", line: 0, text: "a review packet with no images is not a visual review packet" });
  }

  return { ok: leaks.length === 0, packetDir, images: images.length, scannedFiles: scanned.length, scanned, droppedKeys: dropped, leaks };
}

/**
 * Whether the objective results may be shown for this round yet.
 *
 * THE RULE IS THE FIRST JUDGEMENT, NOT THE FIRST ROUND. Scores stay withheld until a verdict
 * exists for round 1, and this refuses rather than returning a boolean nobody checks.
 */
export function objectiveDisclosureAllowed(roundsDir) {
  const firstVerdict = join(roundsDir, "round-1", "verdict.json");
  if (!existsSync(firstVerdict)) {
    return { allowed: false, detail: "no verdict has been recorded for round 1. The objective results are withheld until the reviewer has judged the pictures once, unanchored." };
  }
  return { allowed: true, detail: "round 1 has been judged; the objective results may accompany later rounds as subordinate evidence." };
}

/**
 * OPERATIONAL IMPERATIVES. A critique has to name a MOVE, not a destination.
 *
 * THIS LIST WAS TOO NARROW AND ITS OWN EVIDENCE SAID SO. Six real reviews were run through it and
 * it refused seven perfectly executable actions — "hold the base course's outline invariant",
 * "enforce a floor and a ceiling on the drawn ink", "snap every fragment edge to the parent slab's
 * edges", "retire the free-floating square population" — because none of those verbs was on it.
 * Widening it to the SHAPE (an operation performed on something) rather than to the seven
 * sentences it happened to refuse is the difference between a rule and a memory. What is
 * deliberately still absent is `make`, `improve`, `enhance`, `polish` and `fix up`: those name
 * where to arrive, not what to do, and `VAGUE_DESTINATION` below refuses them by name.
 *
 * IT WAS WIDENED A SECOND TIME, on the same evidence and for the same reason: a real critique read
 * "protect three named carriers through every stress frame" and "re-test this axis after the
 * arc-removal mechanic is restored", and neither `protect` nor `re-test` nor `restore` was here.
 * Every widening is checked in BOTH directions by the gate's controls — the real actions must be
 * accepted and "make the composition better" must still be refused — because a verb list that only
 * grows is a verb list on its way to accepting anything.
 */
const ACTION_VERBS = /\b(?:cut|raise|lower|narrow|widen|reduce|increase|remove|add|replace|shift|tighten|loosen|darken|lighten|slow|speed|swap|set|drop|restrict|extend|separate|merge|rotate|scale|centre|center|thin|thicken|desaturate|saturate|re-?bind|re-?order|hold|keep|preserve|fix|snap|forbid|resolve|cap|delete|enforce|require|retire|demote|promote|move|verify|anchor|clamp|offset|align|invert|break|bound|limit|constrain|split|pin|target|clip|inset|crop|vary|stop|disable|introduce|convert|redraw|rebuild|weight|space|stagger|quantise|quantize|protect|re-?test|restore|ensure|maintain|lock|assign|allocate|distribute|sample|reserve|tie|bind|place|seat|carry|apply|exclude|include|admit|refuse|prefer|favour|favor|draw|render|re-?render|re-?draw|insert|join|fill|emit|plot|colour|color|shade|taper|ramp|nest|stack|bleed|mask|re-?verify|re-?colour|re-?color)\b/i;

/**
 * A DECLARED MAGNITUDE IS AN INSTRUCTION WHATEVER VERB INTRODUCES IT.
 *
 * The verb list above was widened three times, each time by a real critique it had refused, and a
 * list that only grows is a list on its way to accepting anything. This is the structural half:
 * "at 0.12-0.18 of the outer radius", "by about 40%", "2.5px at 512", "6:1 or wider", "within 5
 * degrees" are unambiguously work orders however they are phrased, so an action carrying one
 * satisfies the rule without needing its verb enumerated. It closes the class rather than chasing
 * the next verb.
 */
const MAGNITUDE = /\d+(?:\.\d+)?\s*(?:%|px|pt|deg|degrees?|:\s*\d|x\b)|\b\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\b|\b0\.\d+\b/;

/**
 * A destination is not a work order.
 *
 * "Make it better" fails the verb test already. "Make the composition better" does not — it names
 * a noun — so a quality adjective is refused unless there is an actual OPERATION beside it. The
 * test is the verb and not a number, because "improve the palette by 100%" carries a magnitude and
 * still says nothing about what to do; "cut peripheral density by 40% so it reads stronger" carries
 * the same adjective and is executable, and the difference between them is `cut`.
 */
const VAGUE_DESTINATION = /\b(?:better|nicer|prettier|good|great|stronger|striking|beautiful|improve|improved|enhance|polish|more\s+interesting|more\s+appealing)\b/i;
/**
 * SOMETHING IN THE PICTURE TO ACT ON.
 *
 * The second half of the actionability test: an action needs a magnitude OR a named thing. This
 * list started as the configuration's own field names, which was the author's vocabulary rather
 * than the reviewer's — a reviewer says "silhouette", "centroid", "bounding box", "stone value",
 * and none of those is a config field. Three real critiques were refused on exactly that mismatch.
 * It now covers what a person describing a picture actually names, which is what a critique is
 * written in.
 */
const CONFIG_NOUNS = /\b(?:palette|colour|color|contrast|density|scale|depth|count|spread|size|symmetry|rotation|contraction|branch|prune|stroke|ground|layout|primitive|sensor|curve|drive|variant|title|trait|seed|field|rule|jitter|twist|weight|silhouette|outline|edge|edges|bounding\s+box|centroid|centre|center|value|values|luminance|lightness|saturation|hue|tone|fill|frame|margin|inset|band|bands|row|rows|course|courses|ring|rings|arc|arcs|lobe|lobes|node|nodes|element|elements|mark|marks|tile|tiles|aspect|ratio|position|structure|register|state|states|thumbnail|figure|form|shape|line|lines|gap|gaps|pitch|width|height|radius|angle|axis|axes)\b/i;

/**
 * Validate a verdict. Empty array means well-formed.
 *
 * THE ACTIONABILITY RULE IS MECHANICAL, and it is here rather than in prose because "make the
 * critique actionable" is exactly the instruction that gets nodded at and not followed. A critique
 * item has to name an axis, record something seen, and give an instruction with a direction and
 * either a magnitude or a named thing to change. "Not good enough" fails; "cut peripheral density
 * by about 40% and raise the central recursion scale" passes.
 */
export function validateVerdict(v, { round } = {}) {
  const p = [];
  if (!v || typeof v !== "object") return ["verdict.json did not parse into an object"];
  if (v.schemaVersion !== 1) p.push("schemaVersion must be 1");
  if (round !== undefined && v.round !== round) p.push(`round is ${v.round}; this packet is round ${round}. A verdict from another round is not a verdict on these pictures.`);
  if (!VERDICTS.includes(v.verdict)) p.push(`verdict must be one of ${VERDICTS.join(", ")}`);
  if (typeof v.reviewerId !== "string" || v.reviewerId.trim().length < 3) p.push("reviewerId must say who judged this");

  const axes = v.axes ?? {};
  for (const id of RUBRIC_AXIS_IDS) {
    if (!AXIS_JUDGEMENTS.includes(axes[id])) p.push(`axes.${id} must be one of ${AXIS_JUDGEMENTS.join(", ")}`);
  }
  for (const id of Object.keys(axes)) if (!RUBRIC_AXIS_IDS.includes(id)) p.push(`axes.${id} is not a rubric axis`);

  // THE BRIEF-FIDELITY GATE. A reviewer may not return SHIP on work it has just said does not
  // depict what the brief asked for, and the refusal is here rather than in the loop so that a
  // hand-written verdict cannot express the contradiction either.
  if (axes[GATE_AXIS] === "FAIL" && v.verdict === "SHIP") {
    p.push(`axes.${GATE_AXIS} is FAIL and the verdict is SHIP. Brief fidelity is a gate: technical legality and every other axis together cannot overrule it.`);
  }

  const critique = Array.isArray(v.critique) ? v.critique : [];
  if (v.verdict !== "SHIP" && critique.length === 0) {
    p.push("a verdict of REVISE or REJECT with no critique is a refusal the author cannot act on");
  }
  for (const [i, c] of critique.entries()) {
    const at = `critique[${i}]`;
    if (!RUBRIC_AXIS_IDS.includes(c?.axis)) p.push(`${at}.axis must be a rubric axis`);
    if (typeof c?.observation !== "string" || c.observation.trim().length < 20) p.push(`${at}.observation must record what was actually seen`);
    const action = typeof c?.action === "string" ? c.action : "";
    const hasVerb = ACTION_VERBS.test(action);
    if (action.trim().length < 15) p.push(`${at}.action is too short to execute`);
    else if (!hasVerb && !MAGNITUDE.test(action)) p.push(`${at}.action does not tell the author what to DO — it needs an operation (cut, raise, narrow, replace, draw, remove) or a declared magnitude`);
    else if (!/\d/.test(action) && !CONFIG_NOUNS.test(action)) p.push(`${at}.action gives no magnitude and names nothing to change; "improve it" is not a work order`);
    else if (VAGUE_DESTINATION.test(action) && !hasVerb) p.push(`${at}.action names a destination rather than a move. "Better" is where to arrive; the author needs what to do.`);
  }
  return p;
}

export function readVerdict(path) {
  if (!existsSync(path)) return { present: false };
  try {
    return { present: true, verdict: JSON.parse(readFileSync(path, "utf8")) };
  } catch (err) {
    return { present: true, parseError: err.message };
  }
}


/**
 * The empty verdict, so a reviewer has a shape to fill rather than a format to infer.
 *
 * Every field is empty or null. A template that arrived pre-filled with anything — a default
 * verdict, a plausible axis judgement, an example critique — would be the author's opinion wearing
 * the reviewer's signature, which is the exact substitution this packet exists to prevent.
 */
export function verdictTemplate(round) {
  return {
    schemaVersion: 1,
    round,
    reviewerId: "",
    judgedAt: "",
    verdict: "",
    axes: Object.fromEntries(RUBRIC_AXIS_IDS.map((id) => [id, ""])),
    critique: [{ axis: "", observation: "", action: "" }],
  };
}

/**
 * The exact text to hand a fresh reviewer.
 *
 * IT IS GENERATED RATHER THAN WRITTEN BY THE CALLER, and that is the mechanism. If the prompt were
 * the author's to compose, "do not tell the reviewer what you think" would be a rule the author
 * enforces on itself — which is the arrangement that failed. Here the author supplies a packet
 * path and nothing else reaches the reviewer.
 */
export function reviewerPrompt({ round, roundsRemaining, priorCritique = [], objectiveDisclosed = false }) {
  const lines = [
    "# You are reviewing rendered art. You did not make it.",
    "",
    `This is round ${round}. ${roundsRemaining} judgement(s) remain before the work is refused outright.`,
    "",
    "## What to do",
    "",
    "1. Read `brief.md`. That is what the creator asked for.",
    "2. Read `RUBRIC.md`.",
    "3. **Open every file in `images/` and look at it.** Not the filenames, not the captions — the pictures.",
    "   The `*-thumb.png` sheets are at 120px, which is the size a collection is actually browsed at, and",
    "   they are where this project's verdicts have really been decided. A frame that reads as varied at",
    "   full size and as one repeated stamp at 120px fails there and nowhere else.",
    "4. Write your judgement into `verdict.json` beside this file, in the shape of `verdict.template.json`.",
    "",
    "## What you have not been given, and why",
    "",
    "You have not been told what the author thinks of this work, whether it believes it addressed anything,",
    "or what it was trying to do beyond the brief. That is deliberate. A labelled review in this project",
    "rated two runtimes highly and a blind pass over the same material then rejected their templates five",
    "for five; the labels were not lies, they were context, and context was enough. Do not go looking for",
    "the author's opinion and do not ask for it.",
    "",
    objectiveDisclosed
      ? "You have been given the previous round's mechanical measurements as subordinate evidence. They cannot overrule what you see. In this project the numbers have been right about dead fields and duplicates, and wrong — four separate times — about whether the work was any good."
      : "You have not been given any measurements. They are withheld until you have judged the pictures once, unanchored.",
    "",
    "## The one rule that ends the round",
    "",
    "`briefFidelity` is a gate, not an axis. If the work does not read as the thing the brief asked for,",
    "it is `FAIL` and the verdict cannot be `SHIP` — however legal, however competent, however much you",
    "like it on its own terms. Brief says botanical and it reads industrial: FAIL. Brief says monumental",
    "and sparse and it is confetti-dense: FAIL. Brief claims it fractures under drawdown and the stress",
    "row is indistinguishable at browse size: FAIL.",
    "",
    "## Make the critique executable",
    "",
    'Not "not good enough". Something an author can act on, with a direction and a magnitude:',
    '*"no focal hierarchy; peripheral blocks overwhelm the central form. Cut peripheral density by about',
    '40%, narrow the palette contrast, raise the central recursion scale."*',
    "",
  ];
  if (priorCritique.length > 0) {
    lines.push("## Your own earlier findings", "", "These are YOUR words from earlier rounds, not the author's. Check whether they were acted on by looking.", "");
    for (const r of priorCritique) {
      lines.push(`### Round ${r.round} — ${r.verdict}`, "");
      for (const c of r.critique ?? []) lines.push(`- **${c.axis}**: ${c.observation} → ${c.action}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
