#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE PRODUCT-BOUNDARY COPY GATE — two capabilities ship together and only one is production-ready.
//
//   node scripts/check-product-boundary.mjs              # human output, non-zero exit on any hit
//   node scripts/check-product-boundary.mjs --json       # machine output
//   node scripts/check-product-boundary.mjs --controls   # must-catch and must-allow, both directions
//   node scripts/check-product-boundary.mjs --root <dir> # scan another tree (the private mirror)
//
// WHY THIS EXISTS
//
// `npm run kit:artauthority` measures what the product does. This measures what the product SAYS,
// and the two have to agree. The measured facts are: an autonomous launch of art that already
// carries an acceptance walks every phase against the deployed factory, and the autonomous ART
// AUTHOR has been scored blind three times and produced zero accepted configurations. A document
// that flattens those into one capability is selling the second on the evidence of the first.
//
// FOUR SHAPES ARE REFUSED, and they are refused as SHAPES rather than as sentences:
//
//   1. Every plain-language brief becomes launch-quality art.
//   2. The agent always creates the final collection, with no artistic review.
//   3. The autonomous art author is production-ready.
//   4. Unattended brief-to-art launch validation is complete.
//
// WHAT IS DELIBERATELY ALLOWED, because the honest product is a good one and a gate that could not
// describe it would be traded away the first time it got in the way:
//
//   - agents can create and iterate RELICS projects
//   - agents can autonomously launch ACCEPTED projects from the terminal
//   - the protected signer never exposes the wallet key
//   - agent-created art must pass the independent visual gate before unattended broadcast
//   - human creators remain free to launch valid work after reviewing a subjective warning
//
// THE ANTI-DELETION CLAUSE. A blocklist is always satisfiable by deleting the sentence, so this
// gate ALSO REQUIRES the boundary to be stated: README.md and AGENTS.md must each carry a line
// naming the experimental status of agent art creation AND a line naming the gate that stands
// between agent-created art and an unattended broadcast. Removing the caveat fails exactly as
// loudly as making the claim. Never trade one for the other.
//
// MARKUP IS STRIPPED BEFORE ANY RULE SEES A LINE. Most of what this scans is Markdown and JSX; a
// rule written for prose is defeated by `**production-ready**` or a link, and a gate defeated by
// two asterisks is a gate that reads as enforcement while enforcing nothing.
// ================================================================================================

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = join("scripts", "check-product-boundary.mjs");
const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");
const rootFlag = process.argv.indexOf("--root");
const ROOT = rootFlag !== -1 ? process.argv[rootFlag + 1] : DEFAULT_ROOT;

// ------------------------------------------------------------------------------------------------

/** Markdown/JSX decoration a prose rule must not be defeated by. */
function strip(line) {
  return line
    .replace(/`[^`]*`/g, (m) => m.replace(/`/g, " "))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    // ARROWS SURVIVE THE STRIP, and they have to. `>` is blockquote punctuation and was removed
    // with the rest of the Markdown decoration — which quietly turned every `->` into `- ` and made
    // the diagram rule below match nothing at all. Normalising ASCII arrows to `→` BEFORE that pass
    // is what lets one rule read both spellings. The `->` must-catch control is what found it.
    .replace(/[-=]>/g, "→")
    .replace(/[*_~|>#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A brief, an idea, a description in words — the input side of the art author. */
const BRIEF = String.raw`(?:brief|idea|prompt|description|sentence|paragraph|paragraph of prose)`;
/** Art good enough to launch. */
const LAUNCH_QUALITY = String.raw`(?:launch[-\s]?(?:quality|ready)|shippable|ship[-\s]?ready|finished(?:\s+\w+){0,2}\s*(?:art|collection|work)|production(?:[-\s]?grade)?\s+art)`;
/** The verbs a claim of automatic conversion uses. */
const BECOMES = String.raw`(?:becomes?|turns?\s+into|yields?|produces?|delivers?|results?\s+in|gets?\s+you|is\s+turned\s+into|converts?\s+(?:in)?to)`;
/** The autonomous author, named however a document names it. */
const AUTHOR = String.raw`(?:(?:autonomous|automatic|ai|agent(?:ic)?)[-\s]?(?:art\s+)?(?:author(?:ing)?|artist|art\s+(?:creation|generation|generator|pipeline|loop))|art\s+author|brief[-\s]?to[-\s]?art)`;
/** Words that assert maturity. */
const MATURE = String.raw`(?:production[-\s]?ready|ready\s+for\s+production|generally\s+available|battle[-\s]?tested|proven\s+in\s+production|fully\s+(?:validated|proven|tested)|GA\b)`;
/** Unattended: no person in the loop at the moment it matters. */
const UNATTENDED = String.raw`(?:unattended|hands[-\s]?off|without\s+(?:a\s+)?human|no\s+human|fully\s+autonomous|end[-\s]?to[-\s]?end\s+autonomous)`;
const COMPLETE = String.raw`(?:complete|completed|finished|validated|proven|verified|done|covered)`;

const RULES = [
  {
    id: "BRIEF_ALWAYS_YIELDS_LAUNCH_QUALITY",
    // A quantifier over briefs, a conversion verb, and launch-quality output — in either order,
    // because "launch-ready art from any brief" is the same claim written backwards.
    re: [
      new RegExp(String.raw`\b(?:any|every|each|whatever|whichever|all)\b[^.]{0,40}\b${BRIEF}\b[^.]{0,60}\b${BECOMES}\b[^.]{0,60}${LAUNCH_QUALITY}`, "i"),
      new RegExp(String.raw`${LAUNCH_QUALITY}[^.]{0,60}\bfrom\b[^.]{0,30}\b(?:any|every|each|whatever|a\s+plain[-\s]language)\b[^.]{0,30}\b${BRIEF}\b`, "i"),
      new RegExp(String.raw`\b${BRIEF}\s+in\b[^.]{0,30}\b${LAUNCH_QUALITY}[^.]{0,20}\bout\b`, "i"),
    ],
    why: "no brief is promised launch-quality art. Three blind rounds produced zero accepted configurations.",
  },
  {
    id: "AGENT_MAKES_FINAL_ART_WITHOUT_REVIEW",
    re: [
      new RegExp(String.raw`\bagent\b[^.]{0,50}\b(?:always|automatically)\b[^.]{0,40}\b(?:creates?|makes?|produces?|authors?|delivers?)\b[^.]{0,40}\b(?:final|finished)\b[^.]{0,20}\b(?:collection|art|work)\b`, "i"),
      new RegExp(String.raw`\bagent\b[^.]{0,60}\b(?:creates?|makes?|produces?|authors?|launch(?:es)?)\b[^.]{0,60}\bwith(?:out|\s+no)\b[^.]{0,30}\b(?:artistic\s+|visual\s+|independent\s+)?review\b`, "i"),
      new RegExp(String.raw`\bno\s+(?:artistic|visual|independent)\s+review\s+is\s+(?:needed|required)\b`, "i"),
    ],
    why: "agent-created art must pass the independent visual gate before an unattended broadcast; the gate refuses without it.",
  },
  {
    id: "ART_AUTHOR_PRODUCTION_READY",
    re: [
      new RegExp(String.raw`${AUTHOR}[^.]{0,60}\b(?:is|are|now)\b[^.]{0,20}${MATURE}`, "i"),
      new RegExp(String.raw`${MATURE}[^.]{0,40}${AUTHOR}`, "i"),
    ],
    why: "AUTONOMOUS_ART_CREATION_STATUS=EXPERIMENTAL. Only the launch of already-accepted art is the production path.",
  },
  {
    id: "UNATTENDED_BRIEF_TO_ART_VALIDATED",
    re: [
      new RegExp(String.raw`${UNATTENDED}[^.]{0,60}\b(?:brief[-\s]?to[-\s]?(?:art|launch)|idea[-\s]?to[-\s]?(?:art|launch)|art\s+creation)\b[^.]{0,60}\b(?:is|are|has\s+been)\b[^.]{0,25}${COMPLETE}`, "i"),
      new RegExp(String.raw`\b(?:brief|idea)[-\s]?to[-\s]?(?:art|launch)\b[^.]{0,50}\b(?:validation|coverage|testing)\b[^.]{0,30}\b(?:is|are)\b[^.]{0,20}${COMPLETE}`, "i"),
      new RegExp(String.raw`\bthe\s+${UNATTENDED}\s+(?:path|flow|pipeline)\b[^.]{0,40}\b(?:is|has\s+been)\b[^.]{0,20}${COMPLETE}`, "i"),
    ],
    why: "the unattended brief-to-art path is not validated; what is validated is the launch of art that already carries an acceptance.",
  },
  {
    id: "PIPELINE_DIAGRAM_ELIDES_THE_ART_GATE",
    // A BLOCK RULE, NOT A LINE RULE, AND THE SELF-TEST IS WHAT SETTLED THAT. Written line by line
    // it caught the original one-line diagram and MISSED the same diagram wrapped over two lines --
    // which is how this README actually formats it. `verify-gates-fail.mjs` restored the original
    // claim, the gate stayed green, and the mutation was scored VACUOUS. A diagram is a paragraph.
    block: true,
    // THE CLAIM WITH NO VERB IN IT. The first screen of this README carried
    //   YOUR IDEA -> AI CREATES THE ART -> RELICS PROVES IT -> ... -> ONCHAIN
    // and every rule above walked past it, because a rule written for prose looks for a subject and
    // a predicate and an arrow diagram has neither. It is still the strongest claim on the page: a
    // reader takes an unbroken chain from an idea to a chain as a statement that nothing in the
    // middle stops. So the shape is the hit — an arrow chain that starts at an idea, passes through
    // art creation, ends on a chain, and names no review anywhere along it.
    re: [
      new RegExp(String.raw`→[^\n]*→`, "i"),
    ],
    guard: (s) =>
      /\b(?:idea|brief|prompt|description)\b/i.test(s) &&
      /\b(?:creates?\s+the\s+art|art\s+creation|makes?\s+the\s+art|authors?\s+the\s+art|ai\s+creates?)\b/i.test(s) &&
      /\b(?:onchain|on[-\s]chain|broadcast|launched|mainnet)\b/i.test(s) &&
      !/\b(?:review|gate|accept(?:ed|ance)?|approv(?:ed|al)|verdict|looked\s+at)\b/i.test(s),
    why: "a pipeline diagram running from an idea to a chain with no review step reads as a promise that nothing in the middle stops. Name the gate in the chain, or do not draw the chain.",
  },
];

/**
 * Shapes that DENY the claim, or draw the distinction. Checked BEFORE every rule, so a document may
 * discuss what it refuses to promise. A gate that could not say "the art author is not
 * production-ready" would force the repository to stop explaining the thing that matters most.
 */
const ALLOW = [
  /\bnot\s+(?:yet\s+)?production[-\s]?ready\b/i,
  /\bis\s+not\b[^.]{0,40}\b(?:complete|validated|proven|ready)\b/i,
  /\bexperimental\b/i,
  /\bnever\b[^.]{0,40}\b(?:launch|broadcast|accepted)\b/i,
  /\bmust\s+pass\b/i,
  /\bdoes\s+not\s+(?:become|guarantee|promise|mean)\b/i,
  /\bno\s+brief\s+is\s+promised\b/i,
  /\bcannot\b/i,
  /\brefus(?:e|es|ed|al)\b/i,
  /\bbefore\s+(?:an\s+)?unattended\b/i,
  /\bzero\s+accepted\b/i,
  /\bshortfall\b/i,
  // This file names the shapes in order to refuse them, and the manifest records its digest.
  /check-product-boundary/i,
];

/**
 * THE ANTI-DELETION CLAUSE. Each of these documents must carry BOTH halves of the boundary.
 * Matched on stripped prose so formatting cannot satisfy or defeat it.
 */
const REQUIRED = [
  {
    file: "README.md",
    clauses: [
      // BOTH ORDERS. "the art author is EXPERIMENTAL" and "EXPERIMENTAL art author" are the same
      // statement, and a one-directional clause refused the sentence that was actually written.
      { id: "STATES_ART_CREATION_IS_EXPERIMENTAL", re: /\bexperimental\b[^.]{0,120}\b(?:art|author)|\b(?:art|author)\w*\b[^.]{0,120}\bexperimental\b/i },
      { id: "STATES_THE_GATE_BEFORE_UNATTENDED_BROADCAST", re: /\bmust\s+pass\b[^.]{0,120}\b(?:before|gate)\b/i },
    ],
  },
  {
    file: "AGENTS.md",
    clauses: [
      // BOTH ORDERS. "the art author is EXPERIMENTAL" and "EXPERIMENTAL art author" are the same
      // statement, and a one-directional clause refused the sentence that was actually written.
      { id: "STATES_ART_CREATION_IS_EXPERIMENTAL", re: /\bexperimental\b[^.]{0,120}\b(?:art|author)|\b(?:art|author)\w*\b[^.]{0,120}\bexperimental\b/i },
      { id: "STATES_THE_GATE_BEFORE_UNATTENDED_BROADCAST", re: /\bmust\s+pass\b[^.]{0,120}\b(?:before|gate)\b/i },
    ],
  },
];

const SKIP_DIRS = new Set([".git", "node_modules", "lib", "out", "cache", "dist", ".next", "previews", "broadcast", "submissions", "artifacts", "coverage", ".vercel", ".turbo"]);
const SCAN_EXT = new Set([".md", ".mdx", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yml", ".yaml", ".txt", ".html"]);

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) yield* walk(abs);
    else if (SCAN_EXT.has(extname(entry))) yield abs;
  }
}

/** @returns {{rule:string, text:string}[]} */
/** Apply a chosen set of rules to one already-stripped string. */
function apply(rules, s) {
  if (!s) return [];
  if (ALLOW.some((re) => re.test(s))) return [];
  const out = [];
  for (const rule of rules) {
    if (!rule.re.some((re) => re.test(s))) continue;
    // A rule may carry a GUARD: a second condition the regex cannot express. The diagram rule needs
    // one, because "has two arrows" is every ASCII pipeline in the tree and the hit is what the
    // chain omits rather than what it contains.
    if (rule.guard && !rule.guard(s)) continue;
    out.push({ rule: rule.id, text: s.slice(0, 140) });
  }
  return out;
}

const LINE_RULES = RULES.filter((r) => !r.block);
const BLOCK_RULES = RULES.filter((r) => r.block);

/**
 * One line, for the prose rules. Exposed for the controls, which feed it single sentences.
 *
 * It also runs the BLOCK rules, so a control may hand it a one-line diagram and get the answer a
 * one-line diagram deserves. The block pass below is what adds the wrapped case; neither replaces
 * the other.
 */
function scanLine(line) {
  return apply(RULES, strip(line));
}

/**
 * Consecutive non-blank lines, joined, for the rules that read a PARAGRAPH.
 *
 * A pipeline diagram wraps. Fenced or not, the chain is one statement and a rule that reads it one
 * line at a time sees an idea with no chain at the end of it and a chain with no idea at the start,
 * and clears both halves of a claim it would refuse whole.
 */
function scanBlocks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let start = -1;
  let buf = [];
  const flush = () => {
    if (buf.length > 1) {
      const joined = strip(buf.join(" "));
      for (const h of apply(BLOCK_RULES, joined)) out.push({ line: start + 1, ...h });
    }
    start = -1;
    buf = [];
  };
  lines.forEach((line, i) => {
    if (strip(line) === "") { flush(); return; }
    if (start === -1) start = i;
    buf.push(line);
  });
  flush();
  return out;
}

function scanTree(root) {
  const hits = [];
  let files = 0;
  for (const abs of walk(root)) {
    const rel = relative(root, abs);
    if (rel === SELF) continue;
    files += 1;
    let text;
    try { text = readFileSync(abs, "utf8"); } catch { continue; }
    const seen = new Set();
    text.split(/\r?\n/).forEach((line, i) => {
      for (const h of apply(LINE_RULES, strip(line))) {
        hits.push({ file: rel, line: i + 1, ...h });
        seen.add(`${h.rule}:${i + 1}`);
      }
    });
    // The paragraph pass. A one-line diagram would otherwise be reported twice.
    for (const h of scanBlocks(text)) {
      if (seen.has(`${h.rule}:${h.line}`)) continue;
      hits.push({ file: rel, ...h });
    }
  }
  return { files, hits };
}

// ------------------------------------------------------------------------------------------------

if (CONTROLS) {
  // MUST-CATCH. Every one of these is a sentence somebody would plausibly write, and the first is
  // the shape this repository actually shipped on the first screen of its README.
  const mustCatch = [
    ["BRIEF_ALWAYS_YIELDS_LAUNCH_QUALITY", "Any plain-language brief becomes launch-quality art."],
    ["BRIEF_ALWAYS_YIELDS_LAUNCH_QUALITY", "You get launch-ready art from any brief, in one paste."],
    ["BRIEF_ALWAYS_YIELDS_LAUNCH_QUALITY", "**Every idea turns into a finished collection.**"],
    ["AGENT_MAKES_FINAL_ART_WITHOUT_REVIEW", "The agent always creates the final collection and hands it straight to the launch flow."],
    ["AGENT_MAKES_FINAL_ART_WITHOUT_REVIEW", "The agent creates the art and launches it with no artistic review."],
    ["AGENT_MAKES_FINAL_ART_WITHOUT_REVIEW", "No visual review is required — paste the brief and walk away."],
    ["ART_AUTHOR_PRODUCTION_READY", "The autonomous art author is production-ready."],
    ["ART_AUTHOR_PRODUCTION_READY", "Our agentic art generation is now `production ready` on all three chains."],
    ["ART_AUTHOR_PRODUCTION_READY", "Brief-to-art is battle-tested."],
    ["UNATTENDED_BRIEF_TO_ART_VALIDATED", "Unattended brief-to-art launch validation is complete."],
    ["UNATTENDED_BRIEF_TO_ART_VALIDATED", "Idea-to-launch coverage is validated end to end."],
    ["UNATTENDED_BRIEF_TO_ART_VALIDATED", "The fully autonomous pipeline has been proven."],
    // THE ORIGINAL. This is the exact line this repository shipped on the first screen of its
    // README, and every prose rule above walks past it. A gate that only catches the instance you
    // already fixed has tested your memory rather than the code.
    ["PIPELINE_DIAGRAM_ELIDES_THE_ART_GATE", "YOUR IDEA → AI CREATES THE ART → RELICS PROVES IT → AGENT CHOOSES A LIVE CHAIN → PROTECTED SIGNER → ONCHAIN"],
    ["PIPELINE_DIAGRAM_ELIDES_THE_ART_GATE", "brief -> agent creates the art -> signer -> broadcast"],
  ];
  // MUST-ALLOW. The honest product, and the sentences that draw the distinction.
  const mustAllow = [
    "Agents can create, test and launch RELICS projects from the terminal.",
    "An agent can autonomously launch a project whose art already carries an acceptance.",
    "The protected signer never exposes the wallet key, under any spelling.",
    "For unattended broadcast, agent-created art must pass RELICS' independent visual gate.",
    "Human creators remain free to launch valid work after reviewing any artistic warning.",
    "The autonomous art author is EXPERIMENTAL and is not production-ready.",
    "No brief is promised launch-quality art; three blind rounds returned zero accepted configurations.",
    "Unattended brief-to-art launch validation is **not** complete, and this section says why.",
    "The agent creates the art, and a separate reviewer that is not the agent must pass it first.",
    "A subjective visual warning does not become an acceptance.",
    // The SAME diagram with the gate named in it. The rule must admit the honest chain, or the only
    // way to satisfy it would be to delete the picture.
    "YOUR IDEA → AGENT CREATES THE ART → INDEPENDENT VISUAL GATE → RELICS PROVES IT → AGENT CHOOSES A LIVE CHAIN → PROTECTED SIGNER → ONCHAIN",
    "preflight → metadata → prepare → predict → simulate → build → broadcast → verify",
  ];

  let caught = 0;
  const missed = [];
  for (const [expected, s] of mustCatch) {
    const hits = scanLine(s);
    if (hits.some((h) => h.rule === expected)) caught += 1;
    else missed.push(`${expected} <- ${s.slice(0, 80)} (got: ${hits.map((h) => h.rule).join(",") || "nothing"})`);
  }
  let falsePositives = 0;
  for (const s of mustAllow) {
    const hits = scanLine(s);
    if (hits.length) {
      falsePositives += 1;
      missed.push(`FALSE POSITIVE ${hits.map((h) => h.rule).join(",")} <- ${s.slice(0, 80)}`);
    }
  }
  // THE WRAPPED DIAGRAM. The same claim over two lines, which is how this README formats it, and
  // which the line-based first draft cleared in both halves. `verify-gates-fail.mjs` found this by
  // restoring the original claim and watching the gate stay green.
  const mustCatchBlocks = [
    "YOUR IDEA → AI CREATES THE ART → RELICS PROVES IT\n          → AGENT CHOOSES A LIVE CHAIN → PROTECTED SIGNER → ONCHAIN",
    "your brief\n  -> the agent creates the art\n  -> the protected signer\n  -> broadcast",
  ];
  const mustAllowBlocks = [
    "YOUR IDEA → AGENT CREATES THE ART → INDEPENDENT VISUAL GATE → RELICS PROVES IT\n          → AGENT CHOOSES A LIVE CHAIN → PROTECTED SIGNER → ONCHAIN",
    "preflight → metadata → prepare → predict\n  → simulate → build → broadcast → verify",
  ];
  let blockCaught = 0;
  for (const b of mustCatchBlocks) {
    if (scanBlocks(b).some((h) => h.rule === "PIPELINE_DIAGRAM_ELIDES_THE_ART_GATE")) blockCaught += 1;
    else missed.push(`WRAPPED DIAGRAM not caught <- ${b.slice(0, 70).replace(/\n/g, " / ")}`);
  }
  for (const b of mustAllowBlocks) {
    if (scanBlocks(b).length) {
      falsePositives += 1;
      missed.push(`FALSE POSITIVE on a wrapped diagram that names its gate <- ${b.slice(0, 70).replace(/\n/g, " / ")}`);
    }
  }

  // ZERO-INPUT FLOOR. A scanner that reads nothing must not be able to satisfy the catch direction.
  const zeroInput = scanLine("").length === 0 && scanBlocks("").length === 0 && scanTree(join(DEFAULT_ROOT, "does-not-exist")).files === 0;

  for (const m of missed) console.error(`  ${m}`);
  console.log(`PRODUCT_BOUNDARY_CONTROLS_CAUGHT=${caught}/${mustCatch.length}`);
  console.log(`PRODUCT_BOUNDARY_WRAPPED_DIAGRAM_CONTROLS_CAUGHT=${blockCaught}/${mustCatchBlocks.length}`);
  console.log(`PRODUCT_BOUNDARY_CONTROL_FALSE_POSITIVES=${falsePositives}`);
  console.log(`PRODUCT_BOUNDARY_CONTROL_ZERO_INPUT_IS_NOT_A_HIT=${zeroInput ? "yes" : "NO"}`);
  const ok = caught === mustCatch.length && blockCaught === mustCatchBlocks.length && falsePositives === 0 && zeroInput;
  console.log(`PRODUCT_BOUNDARY_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

const { files, hits } = scanTree(ROOT);

// INPUT FLOOR. A scan that reached nothing must refuse rather than report a pass it did not earn.
const FLOOR = 100;
if (files < FLOOR) {
  console.error(`product-boundary gate: scanned only ${files} files under ${ROOT} (floor ${FLOOR}) — refusing rather than reporting a pass it did not earn.`);
  process.exit(1);
}

// The anti-deletion clause runs only on the tree that owns these documents.
const missingClauses = [];
const isOwnTree = ROOT === DEFAULT_ROOT;
if (isOwnTree) {
  for (const doc of REQUIRED) {
    let text;
    try { text = readFileSync(join(ROOT, doc.file), "utf8"); } catch { missingClauses.push(`${doc.file}: unreadable`); continue; }
    const lines = text.split(/\r?\n/).map(strip);
    for (const c of doc.clauses) {
      if (!lines.some((l) => c.re.test(l))) missingClauses.push(`${doc.file}: ${c.id}`);
    }
  }
}

const pass = hits.length === 0 && missingClauses.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    PUBLIC_PRODUCT_BOUNDARY_TRUTHFUL: pass ? "YES" : "NO",
    FALSE_FULLY_AUTONOMOUS_ART_CLAIMS: hits.length,
    root: ROOT, scanned: files, hits, missingClauses,
  }, null, 2));
} else {
  console.log(`product-boundary gate: scanned ${files} files under ${ROOT}`);
  for (const h of hits) console.error(`  ${h.rule}  ${h.file}:${h.line}\n      ${h.text}`);
  for (const m of missingClauses) console.error(`  BOUNDARY_STATEMENT_MISSING  ${m}`);
  console.log(`FALSE_FULLY_AUTONOMOUS_ART_CLAIMS=${hits.length}`);
  if (isOwnTree) console.log(`BOUNDARY_STATEMENTS_MISSING=${missingClauses.length}`);
  console.log(`PUBLIC_PRODUCT_BOUNDARY_TRUTHFUL=${pass ? "YES" : "NO"}`);
}

if (!pass) {
  console.error("");
  console.error("Public copy is describing the autonomous ART AUTHOR on the evidence of the autonomous");
  console.error("LAUNCH. They are two capabilities at two maturities: launching art that already carries");
  console.error("an acceptance is the production path; authoring art from a brief has been scored blind");
  console.error("three times and produced zero accepted configurations. Say both, or say neither. Do not");
  console.error("delete the caveat to make this pass — its absence fails here exactly as loudly.");
  process.exit(1);
}
