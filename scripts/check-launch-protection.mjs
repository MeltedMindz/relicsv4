#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE STALENESS GATE for launch protection, hook generations and launch-mode availability.
//
//   node scripts/check-launch-protection.mjs           # human output, non-zero exit on failure
//   node scripts/check-launch-protection.mjs --json    # machine output
//   node scripts/check-launch-protection.mjs --controls  # prove the gate can fail
//
// WHY IT EXISTS. This repository is documentation about a protocol that moves. Documentation about
// a moving protocol goes stale silently, and it already did: launchpad pages described the hook
// mask as 0x1440 long after a second generation existed, and nothing failed — someone had to
// notice. "Someone notices" is not a control.
//
// HOW IT WORKS. Nothing below hard-codes a number. Every REQUIRED fact is a sentence DERIVED at
// runtime from `packages/project-schema/src/launch-protection.js`, and the rule is that the
// derived string must appear in the documents that own that fact. So:
//
//   * change a figure in the declaration      -> the derived string changes -> docs no longer
//                                                contain it -> FAIL, naming the file to edit.
//   * add a constant to the declaration       -> the COVERAGE rule finds an exported name that no
//                                                documentation rule claims -> FAIL.
//   * write a prohibited phrase anywhere       -> the phrase scan -> FAIL.
//   * present an undeployed generation as live -> the deployment-honesty rule -> FAIL.
//
// The coverage rule is the part that makes an OMISSION fail rather than pass. A gate that only
// checks the facts it already knows about cannot catch the fact nobody wrote down.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANTI_SNIPE_WINDOW_SECONDS,
  ANTI_SNIPE_START_FEE_PIPS,
  ANTI_SNIPE_END_FEE_PIPS,
  ANTI_SNIPE_INITIAL_ADDON_PIPS,
  SELL_FEE_PIPS,
  ANTI_SNIPE_PUBLIC_DURATION_MINUTES,
  ANTI_SNIPE_WINDOW_ANCHOR,
  ANTI_SNIPE_SALE_PHASE_DECAY,
  PROTECTION_IS_MANDATORY,
  NO_PRIVILEGED_FEE_EXEMPTIONS,
  DYNAMIC_FEE_FLAG,
  FEE_PIPS_DENOMINATOR,
  HOOK_GENERATIONS,
  DEPLOYED_HOOK_GENERATION,
  LAUNCH_PROTECTION_HOOK_GENERATION,
  LAUNCH_MODES,
  LAUNCH_MODE_AVAILABILITY,
  LAUNCHABLE_MODES,
  LAUNCH_MODE_UNAVAILABLE_REASON,
  IMMUTABLE_LIQUIDITY_CLAIM,
  IMMUTABLE_LIQUIDITY_SCOPE,
  PROHIBITED_DOC_PHRASES,
  OVERREACH_CLAIMS,
  AUDIT_STATUS_PHRASES,
  AUDIT_ADJECTIVAL_CLAIM_RE,
  OVERREACH_NEGATORS,
  EVIDENCE_REQUIRED_PHRASES,
  isLaunchModeAvailable,
  pipsToPercentLabel,
  maskLabel,
  // Negation-awareness is NOT reimplemented here. `economics.js` already owns the question "is
  // this mention an assertion or a denial", the sibling gate already trusts it, and a second
  // definition would drift from the first the moment either is tuned.
  isSuppressedMention,
  DETECTOR_SELF_REFERENCE_MARKER,
} from "../packages/project-schema/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

const PROTECTION_DOC = join("docs", "launchpad", "12-launch-protection.md");
const INTEGRATING_DOC = join("docs", "launchpad", "07-integrating.md");
const FAQ_DOC = join("docs", "launchpad", "09-faq.md");

const DECLARATION = join("packages", "project-schema", "src", "launch-protection.js");

/**
 * THE BLOCKLIST EXEMPTION, and why it is a REGION rather than a file.
 *
 * Two files must contain the phrases they forbid: the declaration holds the lists, and this
 * checker holds the fixtures that prove it can catch them. Exempting either FILE would be the
 * loophole — the next edit could smuggle a real claim into prose, a doc comment or an error
 * message in the same file and nothing would fire.
 *
 * So the exemption is by NAMED DECLARATION. For each file below, the bracket-matched extent of
 * each named top-level binding is permitted and every other line is scanned exactly as any other
 * file. A banned phrase one line outside the list still fails.
 */
const BLOCKLIST_REGIONS = new Map([
  [DECLARATION, ["OVERREACH_CLAIMS", "AUDIT_STATUS_PHRASES", "AUDIT_ADJECTIVAL_CLAIM_RE", "WRONG_DURATION_PHRASES", "PROHIBITED_DOC_PHRASES", "OVERREACH_NEGATORS", "EVIDENCE_REQUIRED_PHRASES"]],
  [join("scripts", "check-launch-protection.mjs"), ["RULE_STATEMENT_CUES", "controls"]],
]);

/**
 * Line numbers (1-based, inclusive) covered by the named bindings, bracket-matched from each
 * declaration so a list that grows stays covered and the lines after it do not.
 *
 * @param {string} source
 * @param {string[]} names
 * @returns {(line:number) => boolean}
 */
function blocklistRegionTest(source, names) {
  const lines = source.split("\n");
  /** @type {[number, number][]} */
  const ranges = [];
  for (const name of names) {
    const start = lines.findIndex((l) => new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=`).test(l));
    if (start === -1) continue;
    let depth = 0;
    let started = false;
    let end = start;
    for (let i = start; i < lines.length; i += 1) {
      for (const ch of lines[i]) {
        if (ch === "[" || ch === "(" || ch === "{") {
          depth += 1;
          started = true;
        } else if (ch === "]" || ch === ")" || ch === "}") depth -= 1;
      }
      end = i;
      if (started && depth <= 0) break;
      // A single-line declaration with no brackets at all (a regex literal, say) ends on its line.
      if (!started && /;\s*$/.test(lines[i])) break;
    }
    ranges.push([start + 1, end + 1]);
  }
  return (line) => ranges.some(([a, b]) => line >= a && line <= b);
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "lib", "out", "cache", "output", "submissions", ".next", "dist", "broadcast",
]);
const SCAN_EXT = new Set([".md", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".sol", ".yml", ".yaml"]);

const failures = [];
const fail = (rule, file, message) => failures.push({ rule, file, message });

// ---------------------------------------------------------------------------------------------
// Derived facts. Each is { id, claims, text, files } where `claims` lists the declaration exports
// the fact is derived from — that list is what the coverage rule reconciles against.
// ---------------------------------------------------------------------------------------------

const pct = (p) => pipsToPercentLabel(p);

/** @type {{id:string, claims:string[], text:string, files:string[]}[]} */
const DERIVED_FACTS = [
  {
    id: "WINDOW_DURATION",
    claims: ["ANTI_SNIPE_WINDOW_SECONDS", "ANTI_SNIPE_PUBLIC_DURATION_MINUTES"],
    text: `${ANTI_SNIPE_PUBLIC_DURATION_MINUTES} minutes`,
    files: [PROTECTION_DOC],
  },
  {
    id: "WINDOW_SECONDS",
    claims: ["ANTI_SNIPE_WINDOW_SECONDS"],
    text: `${ANTI_SNIPE_WINDOW_SECONDS.toLocaleString("en-US")} seconds`,
    files: [PROTECTION_DOC],
  },
  {
    id: "BUY_FEE_RANGE",
    claims: ["ANTI_SNIPE_START_FEE_PIPS", "ANTI_SNIPE_END_FEE_PIPS", "FEE_PIPS_DENOMINATOR"],
    text: `${pct(ANTI_SNIPE_START_FEE_PIPS)} to ${pct(ANTI_SNIPE_END_FEE_PIPS)}`,
    files: [PROTECTION_DOC],
  },
  {
    id: "SELL_FEE",
    claims: ["SELL_FEE_PIPS"],
    text: `sell side is a flat ${pct(SELL_FEE_PIPS)}`,
    files: [PROTECTION_DOC],
  },
  {
    id: "PIPS_START",
    claims: ["ANTI_SNIPE_START_FEE_PIPS"],
    text: `MAX_EFFECTIVE_BUY = ${ANTI_SNIPE_START_FEE_PIPS}`,
    files: [PROTECTION_DOC],
  },
  {
    id: "DECAYING_ADDON",
    claims: ["ANTI_SNIPE_INITIAL_ADDON_PIPS"],
    // The add-on is what the hook interpolates. A curve rebuilt from the endpoints agrees at both
    // ends and is one pip out almost everywhere between, so the page has to publish THIS number.
    text: `ADDON = ${ANTI_SNIPE_INITIAL_ADDON_PIPS}`,
    files: [PROTECTION_DOC],
  },
  {
    id: "NO_EXEMPTIONS",
    claims: ["NO_PRIVILEGED_FEE_EXEMPTIONS"],
    text: NO_PRIVILEGED_FEE_EXEMPTIONS ? "neither mode has an exemption for anybody" : "some addresses are exempt from the schedule",
    files: [PROTECTION_DOC],
  },
  {
    id: "MANDATORY",
    claims: ["PROTECTION_IS_MANDATORY"],
    text: PROTECTION_IS_MANDATORY ? "cannot be disabled" : "must never be described as protected",
    files: [PROTECTION_DOC],
  },
  {
    id: "ANCHOR",
    claims: ["ANTI_SNIPE_WINDOW_ANCHOR"],
    text: ANTI_SNIPE_WINDOW_ANCHOR,
    files: [PROTECTION_DOC],
  },
  {
    id: "SALE_PHASE_NO_DECAY",
    claims: ["ANTI_SNIPE_SALE_PHASE_DECAY"],
    text: ANTI_SNIPE_SALE_PHASE_DECAY ? "the sale phase decays" : "however long the sale ran",
    files: [PROTECTION_DOC],
  },
  {
    id: "DYNAMIC_FEE_SENTINEL",
    claims: ["DYNAMIC_FEE_FLAG"],
    text: `0x${DYNAMIC_FEE_FLAG.toString(16).toUpperCase()}`,
    files: [PROTECTION_DOC, INTEGRATING_DOC],
  },
  {
    id: "DEPLOYED_HOOK_MASK",
    claims: ["HOOK_GENERATIONS", "DEPLOYED_HOOK_GENERATION"],
    text: maskLabel(HOOK_GENERATIONS[DEPLOYED_HOOK_GENERATION].mask),
    files: [PROTECTION_DOC],
  },
  {
    id: "PROTECTION_HOOK_MASK",
    claims: ["HOOK_GENERATIONS", "LAUNCH_PROTECTION_HOOK_GENERATION"],
    text: maskLabel(HOOK_GENERATIONS[LAUNCH_PROTECTION_HOOK_GENERATION].mask),
    files: [PROTECTION_DOC, INTEGRATING_DOC],
  },
  {
    id: "LIQUIDITY_CLAIM",
    claims: ["IMMUTABLE_LIQUIDITY_CLAIM"],
    text: IMMUTABLE_LIQUIDITY_CLAIM,
    files: [PROTECTION_DOC],
  },
  {
    id: "LIQUIDITY_SCOPE",
    claims: ["IMMUTABLE_LIQUIDITY_SCOPE"],
    text: IMMUTABLE_LIQUIDITY_SCOPE,
    files: [PROTECTION_DOC],
  },
  {
    id: "DISABLED_MODE_REASON",
    claims: ["LAUNCH_MODE_UNAVAILABLE_REASON"],
    text: LAUNCH_MODE_UNAVAILABLE_REASON.FIXED_PRICE_SALE_TO_V4,
    files: [PROTECTION_DOC],
  },
];

// Every mode name must appear in the protection doc, with its availability.
for (const mode of LAUNCH_MODES) {
  DERIVED_FACTS.push({
    id: `MODE_${mode}`,
    claims: ["LAUNCH_MODES", "LAUNCH_MODE_AVAILABILITY", "LAUNCHABLE_MODES", "isLaunchModeAvailable"],
    text: mode,
    files: [PROTECTION_DOC],
  });
}

// ---------------------------------------------------------------------------------------------
// Rule 1 — every derived fact appears in the documents that own it.
// ---------------------------------------------------------------------------------------------

const readDoc = (rel) => {
  try {
    return readFileSync(join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
};

const docCache = new Map();
const docText = (rel) => {
  if (!docCache.has(rel)) docCache.set(rel, readDoc(rel));
  return docCache.get(rel);
};

let factsChecked = 0;
for (const fact of DERIVED_FACTS) {
  for (const rel of fact.files) {
    const text = docText(rel);
    if (text === null) {
      fail("DERIVED_FACT_MISSING", rel, `${fact.id}: document does not exist`);
      continue;
    }
    factsChecked += 1;
    if (!text.includes(fact.text)) {
      fail(
        "DERIVED_FACT_MISSING",
        rel,
        `${fact.id}: the declaration derives "${fact.text}" and this document does not contain it. ` +
          `Either the declaration moved and this page is now stale, or the page never carried the fact.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Rule 2 — COVERAGE. Every export of the declaration must be claimed by some derived fact.
//
// This is what makes an omission fail. Adding a constant without documenting it is the exact drift
// that produced the stale mask, and it is invisible to a gate that only re-checks known facts.
// ---------------------------------------------------------------------------------------------

const declSource = readFileSync(join(ROOT, DECLARATION), "utf8");
const exportedNames = [...declSource.matchAll(/^export (?:const|function)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)].map((m) => m[1]);
const claimed = new Set(DERIVED_FACTS.flatMap((f) => f.claims));

/**
 * Exports that carry no protocol fact of their own: label helpers, and the phrase lists that ARE
 * the rules this gate enforces. A phrase list is checked by being applied to every file, which is a
 * stronger test than requiring a page to quote it.
 */
const COVERAGE_EXEMPT = new Set([
  "pipsToPercentLabel",
  "maskLabel",
  "PROHIBITED_DOC_PHRASES",
  "OVERREACH_CLAIMS",
  "AUDIT_STATUS_PHRASES",
  "AUDIT_ADJECTIVAL_CLAIM_RE",
  "WRONG_DURATION_PHRASES",
  "OVERREACH_NEGATORS",
  "EVIDENCE_REQUIRED_PHRASES",
]);

const uncovered = exportedNames.filter((n) => !claimed.has(n) && !COVERAGE_EXEMPT.has(n));
for (const name of uncovered) {
  fail(
    "DECLARATION_EXPORT_UNDOCUMENTED",
    DECLARATION,
    `${name} is exported by the declaration but no documentation rule claims it. Add a DERIVED_FACTS ` +
      `entry naming it in \`claims\` and document it, or add it to COVERAGE_EXEMPT with a reason.`,
  );
}

// ---------------------------------------------------------------------------------------------
// Rule 3 — deployment honesty. A generation that is not deployed may never be described as live,
// and the protection doc must state each generation's status explicitly.
// ---------------------------------------------------------------------------------------------

const protectionText = docText(PROTECTION_DOC) ?? "";
for (const [gen, info] of Object.entries(HOOK_GENERATIONS)) {
  const mask = maskLabel(info.mask);
  if (!protectionText.includes(mask)) {
    fail("DEPLOYMENT_HONESTY", PROTECTION_DOC, `generation ${gen} (${mask}) is declared but not described`);
    continue;
  }
  const needle = info.deployed ? "Deployed" : "Not deployed";
  if (!protectionText.includes(needle)) {
    fail(
      "DEPLOYMENT_HONESTY",
      PROTECTION_DOC,
      `generation ${gen} is declared deployed=${info.deployed}; the page must carry "${needle}" so a ` +
        `reader is never left to infer a deployment that does not exist`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Rule 4 — prohibited phrases, repository-wide, and evidence-gated phrases.
// ---------------------------------------------------------------------------------------------

/**
 * Cues that mark a line as STATING A RULE about a phrase rather than asserting it.
 *
 * `isSuppressedMention` already covers "do not write X". A rules file more often says "never call
 * it X", and an instruction file has to be able to name the thing it forbids. Kept local rather
 * than added to the shared economics cues, because widening those would change a sibling gate's
 * verdicts as a side effect of this one's needs.
 */
const RULE_STATEMENT_CUES = [
  /\bnever\s+(?:write|call|say|use|state|publish|describe|claim|imply)/i,
  /\bmust\s+not\s+(?:write|call|say|use|state|publish|describe|claim|imply)/i,
  /\bdo(?:es)?\s+not\s+(?:carry|contain|appear|describe|write|say|use|state|call|publish|claim|imply)/i,
  /\bbanned\b|\bforbidden\b|\bprohibited\b/i,
  /\bno\s+public\s+surface\b/i,
  // `Say "internally reviewed" — not "audited"`: negating a QUOTED term is contrast, not a claim.
  // The quotes are what make this narrow — bare "not audited" prose is still caught.
  // Case-insensitive: a sentence may start with it. `Not "nobody can rug", which is unrestricted
  // and false.` is the honest denial, and it was being reported as the claim.
  /\bnot\s+["“']/i,
];

/**
 * True when this line, or the line above it, states a rule about the phrase.
 *
 * The lookback is not optional. Prose wraps, and "Do not" landing at the end of one line with
 * "describe the launchpad as audited" on the next is ordinary Markdown, not evasion. One line of
 * context is enough for a wrapped clause and short enough that it cannot launder a separate
 * sentence — the sibling economics gate uses a bounded lookback for the same reason.
 */
/**
 * The [start, end) ranges of quoted text on a line, for all three quote characters.
 *
 * Used only together with {@link isCommentLine}: a banned phrase written INSIDE QUOTES INSIDE A
 * COMMENT is a mention — the code is naming the phrase in order to reason about it — while the same
 * phrase in reader-facing prose, a markdown blockquote, or an error message is an assertion and is
 * still reported. Deliberately not applied to a markdown blockquote, which reaches a reader.
 * @param {string} line
 */
function quotedSpans(line) {
  const spans = [];
  const quotes = new Set(['"', "'", "\u201c", "\u201d", "`"]);
  let open = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (!quotes.has(line[i])) continue;
    if (open === -1) open = i;
    else {
      spans.push([open + 1, i]);
      open = -1;
    }
  }
  return spans;
}

const isCommentLine = (line) => /^\s*(\/\/|\*|\/\*|#)/.test(line);

/** True when [at, at+len) lies wholly inside a quoted span on a comment line. */
const isQuotedMention = (line, at, len) => isCommentLine(line) && quotedSpans(line).some(([a, b]) => at >= a && at + len <= b);

const isRuleStatement = (line, prev = "", listIntro = "") =>
  RULE_STATEMENT_CUES.some((re) => re.test(line) || re.test(`${prev.trimEnd()} ${line.trimStart()}`)) ||
  // A LIST OF FORBIDDEN PHRASES is the commonest way a rules page names one, and its introducer
  // ("Do not write, and do not let an interface imply:") sits above the whole list rather than one
  // line above each item. `listIntro` is the introducer of the CONTIGUOUS list this line belongs to
  // and nothing else — it is cleared by the first blank line or non-item, so it cannot reach across
  // a paragraph break and launder an unrelated sentence.
  (listIntro !== "" && RULE_STATEMENT_CUES.some((re) => re.test(listIntro)));

/**
 * True when a negator sits in the few words immediately before `at`.
 *
 * Deliberately local: it looks only at the run of text just before the phrase, so a "not" earlier
 * in a long sentence about something else cannot launder a claim at the end of it.
 */
function negatedAt(lowerLine, at, lowerPrev = "") {
  // Prose wraps, and a negator can land at the end of the line above: "none of it is\nSybil-
  // resistant". The lookback is the same bounded one `isRuleStatement` uses, and it applies only
  // when the phrase sits at the very start of its line — so a "not" earlier in an unrelated
  // sentence still cannot reach it.
  const before = at <= 2 ? `${lowerPrev.trimEnd()} `.slice(-24) : lowerLine.slice(Math.max(0, at - 24), at);
  return OVERREACH_NEGATORS.some((n) => new RegExp(`\\b${n.replace(/'/g, "'")}\\b[\\s\\-—:,]*$`).test(before));
}

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

let filesScanned = 0;
let phraseHits = 0;
for (const abs of walk(ROOT)) {
  const rel = relative(ROOT, abs);
  const text = readFileSync(abs, "utf8");
  filesScanned += 1;
  // A phrase inside a named blocklist is the list doing its job. A phrase anywhere else in the
  // same file is a claim, and is reported like any other.
  const inBlocklist = BLOCKLIST_REGIONS.has(rel) ? blocklistRegionTest(text, BLOCKLIST_REGIONS.get(rel)) : () => false;

  // A file whose job is to name these phrases in order to ban them declares itself, exactly as the
  // sibling economics gate allows. Same trust model, same marker.
  if (text.includes(DETECTOR_SELF_REFERENCE_MARKER)) continue;

  const lines = text.split("\n");
  // The introducer of the contiguous markdown list the current line belongs to, or "".
  let listIntro = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (/^\s*[-*+]\s/.test(line)) {
      if (listIntro === "") {
        // One blank line between the introducer and the list is ordinary Markdown, so look past
        // exactly one. Two would be a paragraph break, and reaching across it is how a lookback
        // stops being a lookback.
        const above = (lines[i - 1] ?? "").trim();
        listIntro = above === "" ? (lines[i - 2] ?? "").trim() : above;
      }
    } else {
      listIntro = "";
    }

    if (inBlocklist(i + 1)) continue;

    // The adjectival form, never suppressed by a link elsewhere on the page.
    const adjectival = new RegExp(AUDIT_ADJECTIVAL_CLAIM_RE.source, "gi").exec(line);
    if (adjectival && !isSuppressedMention(line) && !isRuleStatement(line, lines[i - 1] ?? "", listIntro) && !isQuotedMention(line, adjectival.index, adjectival[0].length)) {
      phraseHits += 1;
      fail("PROHIBITED_PHRASE", `${rel}:${i + 1}`, "an assurance asserted about a specific component");
    }

    for (const phrase of PROHIBITED_DOC_PHRASES) {
      const at = lower.indexOf(phrase.toLowerCase());
      if (at === -1) continue;
      if (isSuppressedMention(line) || isRuleStatement(line, lines[i - 1] ?? "", listIntro)) continue;
      if (isQuotedMention(line, at, phrase.length)) continue;
      // An OVERREACH claim is inverted by a negator immediately before it: denying the claim is
      // the honest sentence and must stay legal. Audit-status and wrong-duration phrases are NOT
      // suppressible this way; see the declaration for why.
      if (OVERREACH_CLAIMS.includes(phrase) && negatedAt(lower, at, (lines[i - 1] ?? "").toLowerCase())) continue;
      phraseHits += 1;
      fail("PROHIBITED_PHRASE", `${rel}:${i + 1}`, `"${phrase}"`);
    }

    for (const [phrase, evidence] of Object.entries(EVIDENCE_REQUIRED_PHRASES)) {
      if (!lower.includes(phrase.toLowerCase())) continue;
      if (isSuppressedMention(line) || isRuleStatement(line, lines[i - 1] ?? "", listIntro)) continue;
      // Evidence may sit anywhere on the page, not necessarily on the same line.
      if (evidence.some((e) => text.toLowerCase().includes(e.toLowerCase()))) continue;
      phraseHits += 1;
      fail(
        "UNBACKED_CLAIM",
        `${rel}:${i + 1}`,
        `"${phrase}" appears with no matching evidence on the page (one of: ${evidence.join(", ")})`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Rule 5 — internal consistency of the declaration itself.
// ---------------------------------------------------------------------------------------------

{
  const span = (ANTI_SNIPE_START_FEE_PIPS - ANTI_SNIPE_END_FEE_PIPS) / FEE_PIPS_DENOMINATOR * 100;
  if (Math.round(span) !== ANTI_SNIPE_PUBLIC_DURATION_MINUTES) {
    fail(
      "DECLARATION_INCONSISTENT",
      DECLARATION,
      `the fee span is ${span} percentage points but the window is ${ANTI_SNIPE_PUBLIC_DURATION_MINUTES} minutes. ` +
        `The public name of this schedule is its SPAN at one point per minute; if they diverge, the "98-minute" ` +
        `wording stops being derivable and must be re-decided by the owner rather than silently renamed.`,
    );
  }
  if (ANTI_SNIPE_END_FEE_PIPS !== SELL_FEE_PIPS) {
    fail("DECLARATION_INCONSISTENT", DECLARATION, "the terminal buy fee and the sell fee are documented as the same rate");
  }
  for (const mode of LAUNCHABLE_MODES) {
    if (!isLaunchModeAvailable(mode)) fail("DECLARATION_INCONSISTENT", DECLARATION, `${mode} is derived launchable but not AVAILABLE`);
  }
  for (const mode of Object.keys(LAUNCH_MODE_UNAVAILABLE_REASON)) {
    if (isLaunchModeAvailable(mode)) fail("DECLARATION_INCONSISTENT", DECLARATION, `${mode} has an unavailable-reason but is AVAILABLE`);
  }
  for (const mode of LAUNCH_MODES) {
    if (isLaunchModeAvailable(mode)) continue;
    if (!LAUNCH_MODE_UNAVAILABLE_REASON[mode]) fail("DECLARATION_INCONSISTENT", DECLARATION, `${mode} is unavailable with no stated reason`);
  }
}

// ---------------------------------------------------------------------------------------------
// Controls — prove the gate can fail. A gate nobody has seen fail is a gate nobody should trust.
// ---------------------------------------------------------------------------------------------

if (CONTROLS) {
  const controls = [
    { name: "stale-window", text: "The window is 97 minutes.", shouldCatch: (t) => !t.includes(`${ANTI_SNIPE_PUBLIC_DURATION_MINUTES} minutes`) },
    { name: "wrong-duration-name", text: "a 99-minute decay", shouldCatch: (t) => PROHIBITED_DOC_PHRASES.some((p) => t.toLowerCase().includes(p.toLowerCase())) },
    { name: "rug-overreach", text: "nobody can rug this pool", shouldCatch: (t) => PROHIBITED_DOC_PHRASES.some((p) => t.toLowerCase().includes(p.toLowerCase())) },
    { name: "audit-negative", text: "this is unaudited software", shouldCatch: (t) => PROHIBITED_DOC_PHRASES.some((p) => t.toLowerCase().includes(p.toLowerCase())) },
    { name: "audit-positive-unbacked", text: "the launchpad is audited", shouldCatch: (t) => t.toLowerCase().includes("audited") && !EVIDENCE_REQUIRED_PHRASES.audited.some((e) => t.toLowerCase().includes(e)) },
    { name: "audit-positive-backed", text: "audited by Example Labs, audit report at https://example.com", shouldCatch: () => false, expectPass: true },
    { name: "sybil-overreach", text: "the schedule is sybil-resistant", shouldCatch: (t) => PROHIBITED_DOC_PHRASES.some((p) => t.toLowerCase().includes(p.toLowerCase())) },
    { name: "fair-distribution", text: "it guarantees fair distribution", shouldCatch: (t) => PROHIBITED_DOC_PHRASES.some((p) => t.toLowerCase().includes(p.toLowerCase())) },
    // The five POSITIVE claims found in shipped Solidity that the literal list matched none of.
    { name: "adjectival-curve-presets", text: "Audited fixed curve presets", shouldCatch: (t) => AUDIT_ADJECTIVAL_CLAIM_RE.test(t) },
    { name: "adjectival-curve-sale", text: "audited fixed-curve-preset sale", shouldCatch: (t) => AUDIT_ADJECTIVAL_CLAIM_RE.test(t) },
    { name: "adjectival-template", text: "audited Solidity-SVG template", shouldCatch: (t) => AUDIT_ADJECTIVAL_CLAIM_RE.test(t) },
    { name: "adjectival-template-2", text: "the audited Solidity-SVG template a launch binds", shouldCatch: (t) => AUDIT_ADJECTIVAL_CLAIM_RE.test(t) },
    { name: "adjectival-library", text: "v4-core's audited {FullMath}", shouldCatch: (t) => AUDIT_ADJECTIVAL_CLAIM_RE.test(t) },
    // …and the evidenced form it must not swallow.
    { name: "adjectival-by-form", text: "audited by Example Labs, report at https://example.com", shouldCatch: (t) => AUDIT_ADJECTIVAL_CLAIM_RE.test(t), expectPass: true },
  ];

  // THE EXEMPTION IS A REGION, NOT A FILE. Prove it on the declaration itself: a line inside the
  // blocklist is permitted, and the SAME phrase one line outside it is not.
  const declSourceForControls = readFileSync(join(ROOT, DECLARATION), "utf8");
  const inList = blocklistRegionTest(declSourceForControls, BLOCKLIST_REGIONS.get(DECLARATION));
  const declLines = declSourceForControls.split("\n");
  // The needle is DERIVED from the imported list, so this line does not itself have to contain a
  // banned phrase in order to look for one.
  const needle = JSON.stringify(AUDIT_STATUS_PHRASES[0]);
  const listLine = declLines.findIndex((l) => l.trim().startsWith(needle)) + 1;
  const proseLine = declLines.findIndex((l) => l.startsWith("// SPDX")) + 1;
  const regionScoped = listLine > 0 && proseLine > 0 && inList(listLine) && !inList(proseLine);
  if (!regionScoped) console.error("  control NOT caught: the blocklist exemption is not region-scoped");
  let caught = 0;
  let falsePositives = 0;
  for (const c of controls) {
    const got = c.shouldCatch(c.text);
    if (c.expectPass) {
      if (got) falsePositives += 1;
    } else if (got) caught += 1;
    else console.error(`  control NOT caught: ${c.name} — ${c.text}`);
  }
  const expected = controls.filter((c) => !c.expectPass).length;
  console.log(`LAUNCH_PROTECTION_CONTROLS_CAUGHT=${caught}/${expected}`);
  console.log(`LAUNCH_PROTECTION_CONTROL_FALSE_POSITIVES=${falsePositives}`);
  console.log(`BLOCKLIST_EXEMPTION_IS_REGION_SCOPED=${regionScoped ? "yes" : "NO"}`);
  const ok = caught === expected && falsePositives === 0 && regionScoped;
  console.log(`LAUNCH_PROTECTION_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------------------------

const pass = failures.length === 0;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        LAUNCH_PROTECTION_DOC_GATE: pass ? "PASS" : "FAIL",
        derivedFactsChecked: factsChecked,
        declarationExports: exportedNames.length,
        undocumentedExports: uncovered,
        filesScanned,
        prohibitedPhraseHits: phraseHits,
        failures,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`launch-protection doc gate: ${factsChecked} derived facts checked against the declaration`);
  console.log(`  declaration exports: ${exportedNames.length}, all claimed by a documentation rule: ${uncovered.length === 0 ? "yes" : "NO"}`);
  console.log(`  files scanned for prohibited phrasing: ${filesScanned}`);
  if (!pass) {
    console.error("");
    for (const f of failures) console.error(`  ${f.rule}  ${f.file}\n      ${f.message}`);
    console.error("");
  }
  console.log(`DERIVED_FACTS_CHECKED=${factsChecked}`);
  console.log(`UNDOCUMENTED_DECLARATION_EXPORTS=${uncovered.length}`);
  console.log(`PROHIBITED_PHRASE_HITS=${phraseHits}`);
  console.log(`LAUNCH_PROTECTION_DOC_GATE=${pass ? "PASS" : "FAIL"}`);
}

process.exit(pass ? 0 : 1);
