// SPDX-License-Identifier: MIT
// ================================================================================================
// THE DEVELOPMENT CRITIC, AND THE AUTHOR'S ANSWER TO IT.
//
// TWO ROLES THAT ARE NOT THE SAME ROLE. The FINAL reviewer decides whether the work ships, sees
// only holdout seeds, and is told nothing about the author. The DEVELOPMENT critic is a different
// job entirely: it looks at work in progress, it is allowed to know the brief and the direction,
// and its output is not a verdict but a list of things to do. Collapsing them is how a loop ends
// up with a reviewer that has been arguing with the author for four rounds and can no longer see
// the work fresh — which is the arrangement the whole blind-review programme exists to avoid.
//
// A CRITIQUE IS NOT A SCORE. `packages/art-review` already carries the numeric battery, and the
// corpus shows what happens when a number is the whole feedback: seven runs, twenty-four
// judgements, zero acceptances, and the author with nothing to act on. So a finding here must
// carry five things, and it is refused without them:
//
//     whatFails        the specific thing that is wrong, in the picture, not in a metric
//     why              why it is wrong -- against the brief, the direction, or the medium
//     specificChange   what to actually do. "Improve the composition" is not a change.
//     keep             what must survive the fix. Without this a critique trades one axis for
//                      another and the trade is invisible from inside the axis being fixed --
//                      the atlas measured five of seven runs doing exactly that.
//
// and the critique as a whole must say WHAT WORKS. Not politeness: the author needs to know what
// it is not allowed to break, and a critique that lists only failures licenses a rewrite.
//
// ------------------------------------------------------------------------------------------------
// EVERY FINDING GETS AN ANSWER
// ------------------------------------------------------------------------------------------------
// `CRITIQUE_WITHOUT_AUTHOR_RESPONSE=0` is derived here. An author may disagree — REJECT_WITH_REASON
// is a first-class disposition and the atlas explicitly instructs it ("Send the refusals back as
// facts about the runtime instead of attempting them; recolour-and-swap is what attempting them
// looks like"). What it may not do is silently ignore a finding, because then nobody knows whether
// the next render addressed it or wandered.
//
// The three dispositions are the atlas's own classification of a prescribed action:
//     ACCEPT             = EXECUTABLE            the medium can do this; here is the parameter
//     PARTIALLY_ACCEPT   = NEAREST_SUBSTITUTE    the medium can do something adjacent; here it is
//     REJECT_WITH_REASON = REFUSED_BY_MEDIUM     the medium cannot, and this is why
//
// ------------------------------------------------------------------------------------------------
// ONE CRITICISM MAY NOT MOVE TWENTY FIELDS
// ------------------------------------------------------------------------------------------------
// `assertBoundedChange` compares the configuration before and after a round against the parameters
// the author's own response named. A field that moved without being named is reported. This is the
// property that makes a round mean something: if everything may move, the next render is not
// evidence about the critique, it is a new configuration that happens to arrive later.
// ================================================================================================

import { createHash } from "node:crypto";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export const CRITIQUE_DISPOSITIONS = Object.freeze(["ACCEPT", "PARTIALLY_ACCEPT", "REJECT_WITH_REASON"]);

/** The atlas's classification, which the dispositions mirror one for one. */
export const DISPOSITION_TO_ATLAS_CLASS = Object.freeze({
  ACCEPT: "EXECUTABLE",
  PARTIALLY_ACCEPT: "NEAREST_SUBSTITUTE",
  REJECT_WITH_REASON: "REFUSED_BY_MEDIUM",
});

export const FINDING_FIELDS = Object.freeze(["id", "whatFails", "why", "specificChange", "keep"]);

/** Floors. A finding shorter than this is a placeholder, and placeholders are what killed the corpus. */
export const CRITIQUE_FLOOR = Object.freeze({ minFindingChars: 30, minWhatWorks: 1, minFindings: 1 });

/**
 * A change that is not a change.
 *
 * `specificChange` is the field an author executes, so it has to name a direction or a destination.
 * These are the phrasings that look like instructions and are not — measured against the corpus,
 * where "strengthen the composition" and "make it more cohesive" appear repeatedly and no author
 * could act on either.
 */
const VAGUE_CHANGE = /^(?:\W*)(?:improve|strengthen|enhance|refine|polish|fix|address|rework|reconsider|tighten|balance|adjust|tweak|clean\s+up|make\s+it\s+(?:better|nicer|stronger|more\s+\w+))\b[^.]{0,40}$/i;
// WIDENED ONCE, WITH THE EVIDENCE. A critic wrote "Grow the outermost generation until the
// figure's extent reaches 85-90% of frame width ... halve the stroke width at each successive
// generation ... and clamp the figure's bounding box inside the viewBox" -- three verbs, a
// magnitude and a destination, which is about as executable as a critique gets. It was refused,
// because the list held `increase` and `reduce` but not `grow`, `halve` or `clamp`.
//
// The rule is about whether a change has a DIRECTION, not about vocabulary, so the fix is to add
// the verbs rather than to relax the rule. The must-reject fixtures were re-run against the
// widened pattern afterwards and still fail: widening a gate without checking what it now lets
// through is how a gate becomes decorative.
const ACTION_DIRECTION = /\b(increase|decrease|raise|lower|widen|narrow|add|remove|drop|replace|swap|declare|pin|unpin|shift|reduce|extend|shorten|darken|lighten|separate|merge|move|set|bind|unbind|elect|spread|contract|thicken|thin|grow|shrink|halve|double|clamp|constrain|bound|restrict|invert|reverse|flip|reserve|withhold|fill|stroke|centre|center|align|more|fewer|larger|smaller|toward|from\s+\w+\s+to)\b/i;

/**
 * Validate a development critique.
 *
 * Returns problems rather than throwing: a malformed critique is something a caller reports back
 * to the critic, not a crash.
 */
export function validateCritique(critique) {
  const problems = [];
  if (!critique || typeof critique !== "object") return { ok: false, problems: ["the critique is not an object"], hash: null };

  if (!Array.isArray(critique.whatWorks) || critique.whatWorks.filter((w) => typeof w === "string" && w.trim().length >= CRITIQUE_FLOOR.minFindingChars).length < CRITIQUE_FLOOR.minWhatWorks) {
    problems.push(`whatWorks: needs at least ${CRITIQUE_FLOOR.minWhatWorks} substantive entry. A critique that lists only failures licenses a rewrite, and the author has no way to know what it must not break.`);
  }

  const findings = Array.isArray(critique.findings) ? critique.findings : [];
  if (findings.length < CRITIQUE_FLOOR.minFindings) {
    problems.push(`findings: needs at least ${CRITIQUE_FLOOR.minFindings}. A critique with no finding is not a critique; if the work is good, that is a verdict and belongs to the final reviewer.`);
  }
  const ids = new Set();
  for (const [i, f] of findings.entries()) {
    const at = `findings[${i}]`;
    if (!f || typeof f !== "object") { problems.push(`${at}: not an object`); continue; }
    if (typeof f.id !== "string" || !f.id.trim()) problems.push(`${at}: needs a stable id so a response can name it`);
    else if (ids.has(f.id)) problems.push(`${at}: duplicate id "${f.id}"`);
    else ids.add(f.id);
    for (const field of ["whatFails", "why", "specificChange", "keep"]) {
      const v = f[field];
      if (typeof v !== "string" || v.trim().length < CRITIQUE_FLOOR.minFindingChars) {
        problems.push(`${at}.${field}: missing or under ${CRITIQUE_FLOOR.minFindingChars} characters`);
      }
    }
    if (typeof f.specificChange === "string") {
      if (VAGUE_CHANGE.test(f.specificChange.trim())) {
        problems.push(`${at}.specificChange: "${f.specificChange.trim().slice(0, 60)}" names no destination. An author cannot execute it.`);
      } else if (!ACTION_DIRECTION.test(f.specificChange)) {
        problems.push(`${at}.specificChange: names no direction or destination (no verb like increase/replace/declare/remove). Say which way the thing should move.`);
      }
    }
  }
  return { ok: problems.length === 0, problems, hash: problems.length === 0 ? sha256(JSON.stringify(critique)) : null };
}

/**
 * Validate the author's response to a critique.
 *
 * This is where `CRITIQUE_WITHOUT_AUTHOR_RESPONSE` is actually enforced — not by counting, but by
 * refusing a response set that does not cover the finding set.
 */
export function validateResponse(critique, response) {
  const problems = [];
  const findings = Array.isArray(critique?.findings) ? critique.findings : [];
  const responses = Array.isArray(response?.responses) ? response.responses : [];

  const byId = new Map(responses.map((r) => [r?.findingId, r]));
  for (const f of findings) {
    const r = byId.get(f.id);
    if (!r) {
      problems.push(`finding "${f.id}" has no response. Disagreeing is allowed and silence is not: REJECT_WITH_REASON is a disposition.`);
      continue;
    }
    if (!CRITIQUE_DISPOSITIONS.includes(r.disposition)) {
      problems.push(`response to "${f.id}": disposition must be one of ${CRITIQUE_DISPOSITIONS.join(", ")}`);
      continue;
    }
    if (r.disposition === "REJECT_WITH_REASON" || r.disposition === "PARTIALLY_ACCEPT") {
      if (typeof r.reason !== "string" || r.reason.trim().length < CRITIQUE_FLOOR.minFindingChars) {
        problems.push(`response to "${f.id}": ${r.disposition} needs a reason of at least ${CRITIQUE_FLOOR.minFindingChars} characters`);
      }
    }
    if (r.disposition === "ACCEPT" || r.disposition === "PARTIALLY_ACCEPT") {
      if (!Array.isArray(r.parameters) || r.parameters.length === 0) {
        problems.push(`response to "${f.id}": ${r.disposition} must name the exact parameter(s) it will move`);
      }
      if (typeof r.expectedVisualEffect !== "string" || r.expectedVisualEffect.trim().length < CRITIQUE_FLOOR.minFindingChars) {
        problems.push(`response to "${f.id}": ${r.disposition} must state the expected VISUAL effect, so the next render can be compared against a prediction rather than merely inspected`);
      }
      // `keep` exists on the finding; the response must acknowledge it. This is the anti-trade rule.
      if (!Array.isArray(r.preserve) || r.preserve.length === 0) {
        problems.push(`response to "${f.id}": must name what it will preserve while making this change. Five of seven corpus runs traded one axis for another and the trade was invisible from inside the axis being fixed.`);
      }
    }
  }
  const unknown = responses.filter((r) => r?.findingId && !findings.some((f) => f.id === r.findingId));
  for (const r of unknown) problems.push(`response names finding "${r.findingId}", which the critique does not contain`);

  return {
    ok: problems.length === 0,
    problems,
    coverage: { findings: findings.length, answered: findings.filter((f) => byId.has(f.id)).length },
    critiqueWithoutAuthorResponse: findings.filter((f) => !byId.has(f.id)).length,
  };
}

/** Flatten a config to `path -> value` so two rounds can be diffed by parameter. */
export function flattenConfig(config, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(config ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] !== null) {
      v.forEach((item, i) => Object.assign(out, flattenConfig(item, `${path}[${i}]`)));
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenConfig(v, path));
    } else {
      out[path] = Array.isArray(v) ? JSON.stringify(v) : v;
    }
  }
  return out;
}

/**
 * Did the author change only what it said it would?
 *
 * `unit`-scoped paths are compared loosely on the index, because a response that says it will
 * change `rules[].symSet` legitimately touches `rules[0].symSet`. What is being caught is a field
 * nobody mentioned moving at all.
 */
export function assertBoundedChange({ before, after, response }) {
  const a = flattenConfig(before);
  const b = flattenConfig(after);
  const named = new Set();
  for (const r of response?.responses ?? []) {
    for (const p of r.parameters ?? []) {
      named.add(String(p));
      named.add(String(p).replace(/\[\d+\]/g, "[]"));
    }
  }
  const moved = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[key] === b[key]) continue;
    const generic = key.replace(/\[\d+\]/g, "[]");
    const wasNamed = named.has(key) || named.has(generic)
      || [...named].some((n) => key.endsWith(n) || generic.endsWith(n.replace(/\[\d+\]/g, "[]")));
    moved.push({ parameter: key, from: a[key], to: b[key], named: wasNamed });
  }
  const unnamed = moved.filter((m) => !m.named);
  return {
    ok: unnamed.length === 0,
    moved,
    unnamed,
    counts: { moved: moved.length, named: moved.length - unnamed.length, unnamed: unnamed.length },
    detail: unnamed.length === 0
      ? `${moved.length} parameter(s) moved, all of them named in the author's response`
      : `${unnamed.length} parameter(s) moved that no response named: ${unnamed.map((m) => m.parameter).join(", ")}`,
  };
}

/**
 * The critic's brief — what the development critic is told.
 *
 * IT IS GIVEN THE DIRECTION, and that is the deliberate difference from the final reviewer. A
 * development critique's job is to close the gap between the work and the intent, so it must know
 * the intent. The final reviewer is asked whether the work stands up without ever being told what
 * was aimed at until after it has described what it sees.
 *
 * IT IS NOT GIVEN THE CONFIGURATION, the parameter names, the byte diff, the objective numbers or
 * any previous critique's score. Those either let it critique the config instead of the picture,
 * or anchor it to an earlier judgement.
 */
export function criticPrompt({ round, roundsRemaining, direction, briefText, priorResponses = [] }) {
  const lines = [
    "# Development critique",
    "",
    `Round ${round}. ${roundsRemaining} round(s) remain after this one.`,
    "",
    "You are the DEVELOPMENT CRITIC. You are not the author, and you are not the final reviewer.",
    "Your job is to close the gap between the work and its stated direction. You will not give a",
    "verdict and you will not score anything: something else decides whether this ships.",
    "",
    "## What you are looking at",
    "",
    "Rendered images from the deployed art runtime: a contact sheet of twelve seeds at 256px, the",
    "same twelve at 120px, and market-state rows (neutral / stress / recovery) for four of them.",
    "The 120px sheet is the size a collection is actually browsed at, and it is where most of these",
    "decisions are really made.",
    "",
    "## The brief",
    "",
    briefText.trim(),
    "",
    "## The art direction this work is being held to",
    "",
    ...Object.entries(direction).map(([k, v]) => `- **${k}**: ${v}`),
    "",
    "## What to return",
    "",
    "JSON, matching this shape exactly:",
    "",
    "```json",
    JSON.stringify({
      whatWorks: ["at least one substantive thing that is working and must not be broken"],
      findings: [{
        id: "short-stable-id",
        whatFails: "the specific thing that is wrong, in the picture",
        why: "why it is wrong -- against the brief, the direction, or the medium",
        specificChange: "what to actually do, naming a direction or a destination",
        keep: "what must survive this fix",
      }],
      overall: "one paragraph",
    }, null, 2),
    "```",
    "",
    "Rules that are enforced and will be rejected if broken:",
    "- `whatWorks` may not be empty. An author told only what is wrong will rewrite rather than fix.",
    "- every finding needs all five fields.",
    "- `specificChange` must name a direction or a destination. \"Improve the composition\" is refused.",
    "- `keep` is not optional. Five of seven runs in the prior corpus fixed one axis and broke another.",
  ];
  if (priorResponses.length) {
    lines.push("", "## What the author did with your last critique", "");
    for (const r of priorResponses) {
      lines.push(`- **${r.findingId}** — ${r.disposition}${r.reason ? `: ${r.reason}` : ""}${r.parameters?.length ? ` (moved ${r.parameters.join(", ")})` : ""}`);
    }
    lines.push("", "Judge the CURRENT images. A finding you raised before is only still a finding if you can still see it.");
  }
  return lines.join("\n");
}
