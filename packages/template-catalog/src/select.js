// SPDX-License-Identifier: MIT
// ================================================================================================
// TEMPLATE SELECTION — FILTER FIRST, MATCH SECOND. THE ORDER IS THE WHOLE MECHANISM.
// ================================================================================================
//
// THE PIPELINE, DECLARED ONCE
// ---------------------------
//     USER BRIEF -> LIVE RUNTIME AVAILABILITY -> SHIP TEMPLATE CATALOG -> CAPABILITY FILTER
//         -> SEMANTIC ART MATCH -> SELECT -> MUTATE CONFIG -> PREVIEW + TEST -> LAUNCH
//
// This module owns the stages up to and including SELECT. The three after it belong elsewhere and
// are named here only so the contract is one list rather than three.
//
// WHY THE ORDER MATTERS, CONCRETELY
// ---------------------------------
// The templates this wave rejected are not bad at DESCRIBING themselves. Several of them describe
// themselves better than the ones that shipped, because their weaknesses are exactly the kind a
// description cannot carry: "recovery duplicates stress", "every token is a centred disc", "at
// least one seed barely moves between neutral and stress", "twelve stamps from one die". A matcher
// scoring `brief -> prose` will happily rank those first — an archaeological brief matches an
// excavation register whose third market state does no work, and nothing in the words says so.
//
// So the pool is built BEFORE any matching happens, and the matcher never sees a template it may
// not choose. Filtering afterwards would still be correct, and would still be wrong: it makes the
// refusal a property of a check somewhere downstream that someone can forget, rather than a
// property of what was ever available.
//
// THE OTHER HALF, AND IT IS EQUALLY LOAD-BEARING
// ----------------------------------------------
// **The template is a STARTING POINT, not a cage.** Nothing in this module constrains the config an
// agent then writes. It picks WHICH preset to start from; the preset may then be changed as far as
// the runtime's own validator allows — different palette, different sensors, different curves,
// different geometry, a different picture entirely. There is no similarity check, no drift budget
// and no comparison against the preset anywhere in this package, and adding one would turn a
// starting point into a cage.
// ================================================================================================

import {
  AUTONOMOUS_SELECTABLE_STATUSES,
  allTemplateIds,
  isAdvancedVisible,
  isAutonomouslySelectable,
  isVisibleToHuman,
  templateStatus,
  templatesWithStatus,
} from "./status.js";
import { RUNTIMES, TEMPLATE_DESCRIPTORS, describeTemplate, describeUnshippedTemplate } from "./descriptors.js";
import { keccak256Utf8 } from "./keccak.js";

/** The declared pipeline. `ownedHere` marks the stages this module implements. */
export const SELECTION_PIPELINE = Object.freeze([
  Object.freeze({ stage: "USER_BRIEF", ownedHere: false, detail: "what the creator asked for, in their words" }),
  Object.freeze({ stage: "LIVE_RUNTIME_AVAILABILITY", ownedHere: true, detail: "read ArtRuntimeRegistryV1 on the target chain; an unread registry is a denial" }),
  Object.freeze({ stage: "SHIP_TEMPLATE_CATALOG", ownedHere: true, detail: "the pool: SHIP templates and nothing else" }),
  Object.freeze({ stage: "CAPABILITY_FILTER", ownedHere: true, detail: "drop every template whose runtime is not ACTIVE on this chain" }),
  Object.freeze({ stage: "SEMANTIC_ART_MATCH", ownedHere: true, detail: "score the surviving pool against the brief" }),
  Object.freeze({ stage: "SELECT", ownedHere: true, detail: "take the best-scoring candidate, or refuse" }),
  Object.freeze({ stage: "MUTATE_CONFIG", ownedHere: false, detail: "the agent's own work; unbounded within the runtime's validator" }),
  Object.freeze({ stage: "PREVIEW_AND_TEST", ownedHere: false, detail: "render, seed-sweep, validate" }),
  Object.freeze({ stage: "LAUNCH", ownedHere: false, detail: "prepare, predict, simulate, build, sign" }),
]);

/** Per-runtime, per-chain availability. `ACTIVE` is the only value that permits a selection. */
export const RUNTIME_AVAILABILITY_STATES = Object.freeze(["ACTIVE", "INACTIVE", "NOT_REGISTERED", "UNKNOWN"]);

/**
 * Turn a live registry snapshot into a per-runtime availability answer.
 *
 * THREE RULES, EACH OF WHICH HAS BEEN GOT WRONG BEFORE IN THIS PROJECT:
 *
 * 1. **AN INCOMPLETE READ IS `UNKNOWN`, NEVER `NOT_REGISTERED`.** A registry that could not be read
 *    completely does not prove a runtime is absent; it proves nobody successfully asked. Reporting
 *    absence would be a fabricated fact about a chain nobody reached, and it is the one error here
 *    that looks like a correct answer.
 * 2. **IDENTITY IS MATCHED ON LABEL *AND* TAG *AND* MODE.** A label is a string an operator typed.
 *    The tag is `keccak256("V4ART.RUNTIME.<ID>")`, which the runtime itself returns, and the mode
 *    says what interface it implements. Matching on the label alone would let a registry entry
 *    named `PIXEL_GRID_V1` pointing at anything at all pass for the real one.
 * 3. **AN ENTRY WITH THE ZERO ADDRESS IS NOT AN ENTRY.** `runtimeInfo(id)` does not revert for an
 *    unregistered id — it returns a fully-formed record with the zero address and `exists: false`,
 *    so a caller asking "did the call resolve?" reads that as success. The snapshot reader already
 *    drops those; this function does not re-admit them.
 *
 * @param {{complete: boolean, entries: Map|Array}} snapshot as returned by `readRegistrySnapshot`
 */
export function runtimeAvailability(snapshot) {
  const ids = Object.keys(RUNTIMES);
  const unknownAll = (detail) => Object.freeze(Object.fromEntries(ids.map((id) => [id, Object.freeze({ state: "UNKNOWN", detail })])));

  if (!snapshot) return unknownAll("no live registry reading was supplied; nobody asked this chain");
  if (snapshot.complete !== true) {
    return unknownAll("the runtime registry could not be read completely on this chain, so whether it carries these runtimes is UNKNOWN — not absent");
  }

  const entries = snapshot.entries instanceof Map ? [...snapshot.entries.values()] : Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const out = {};
  for (const id of ids) {
    const expectedTag = keccak256Utf8(RUNTIMES[id].runtimeTagPreimage).toLowerCase();
    const match = entries.find((e) => {
      if (!e || e.exists !== true) return false;
      if (!e.runtime || /^0x0{40}$/i.test(e.runtime)) return false;
      if (String(e.label) !== id) return false;
      if (String(e.tag ?? "").toLowerCase() !== expectedTag) return false;
      return Number(e.mode) === RUNTIMES[id].artRuntimeMode;
    });
    if (!match) {
      out[id] = Object.freeze({ state: "NOT_REGISTERED", detail: `the registry was read completely on this chain and carries no entry whose label, tag and mode all identify ${id}` });
      continue;
    }
    out[id] = Object.freeze({
      state: match.active === true ? "ACTIVE" : "INACTIVE",
      registryId: match.id,
      detail: match.active === true ? `registered at id ${match.id} and active` : `registered at id ${match.id} but NOT active; a launch against it is refused`,
    });
  }
  return Object.freeze(out);
}

/**
 * THE POOL. SHIP templates, and nothing else, ever.
 *
 * This is stage 3 and it takes no tier argument. There is no parameter here that a caller can pass
 * to widen it, no environment variable that widens it, and no flag. Widening it means editing this
 * function, which turns the three `AUTONOMOUS_AGENT_CAN_SELECT_*` tests red by name.
 */
export function shipCatalog() {
  const ship = new Set(templatesWithStatus("SHIP"));
  return Object.freeze(
    TEMPLATE_DESCRIPTORS.filter((d) => ship.has(d.id) && isAutonomouslySelectable(d.id)).map((d) => d.id),
  );
}

/**
 * Stage 4. Keep only the templates whose runtime is ACTIVE on the chain that was actually read.
 *
 * FAILS CLOSED IN EVERY DIRECTION. `UNKNOWN` removes a template exactly as `NOT_REGISTERED` does —
 * both refuse a selection — while the REASON travels with the refusal, because only one of them is
 * a reason to retry.
 */
export function capabilityFilter(candidateIds, availability) {
  const kept = [];
  const dropped = [];
  for (const id of candidateIds) {
    const runtimeId = id.split("/")[0];
    const answer = availability?.[runtimeId] ?? { state: "UNKNOWN", detail: "no availability answer for this runtime" };
    if (answer.state === "ACTIVE") kept.push(id);
    else dropped.push({ id, runtimeId, state: answer.state, detail: answer.detail });
  }
  return Object.freeze({ kept: Object.freeze(kept), dropped: Object.freeze(dropped) });
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "i", "in", "is", "it", "its", "me", "my",
  "of", "on", "or", "that", "the", "their", "them", "they", "this", "to", "want", "wants", "with", "would", "you",
  "collection", "project", "token", "tokens", "nft", "nfts", "art", "make", "create", "build", "like", "looking",
]);

function terms(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** A tag and a brief term match when either contains the other; "branching" should find "branch". */
function related(a, b) {
  return a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)));
}

/**
 * Stage 5. Score a pool against a brief.
 *
 * REFUSES A POOL IT WAS NOT ALLOWED TO SEE. The pool is supposed to arrive already filtered, and
 * this check is the second, independent guard on that: if a caller assembles its own candidate list
 * containing an EXPERIMENTAL, HELD or REJECTED id, the matcher throws rather than quietly scoring
 * it. Two guards on one rule is deliberate — the first can be removed by an edit that looks like a
 * refactor, and this one turns that edit into a named test failure.
 *
 * The score is a MATCH score, not a quality score. It says how well a template answers THIS brief;
 * it says nothing about how good the template is, it is never persisted, never published in a
 * descriptor and never comparable between briefs.
 */
export function semanticMatch(candidateIds, brief) {
  for (const id of candidateIds) {
    if (!isAutonomouslySelectable(id)) {
      throw new Error(
        `semanticMatch refused a ${templateStatus(id)} template (${id}). Only ${AUTONOMOUS_SELECTABLE_STATUSES.join(", ")} may reach the matcher; the tier filter runs BEFORE the match, not after it.`,
      );
    }
  }

  const wanted = terms(typeof brief === "string" ? brief : [brief?.summary, brief?.text, ...(brief?.keywords ?? [])].join(" "));
  const scored = candidateIds.map((id) => {
    const d = describeTemplate(id);
    const hits = [];
    let score = 0;
    for (const w of wanted) {
      for (const tag of d.brief.tags) if (related(tag.toLowerCase(), w)) { score += 3; hits.push(`tag:${tag}`); break; }
      for (const use of d.brief.useCases) if (terms(use).some((t) => related(t, w))) { score += 1; hits.push(`useCase:${w}`); break; }
      for (const no of d.brief.notFor) if (terms(no).some((t) => related(t, w))) { score -= 2; hits.push(`notFor:${w}`); break; }
      if (terms(d.summary).some((t) => related(t, w))) { score += 1; hits.push(`summary:${w}`); }
    }
    return Object.freeze({ id, score, matched: Object.freeze([...new Set(hits)]) });
  });

  // Ties broken by id so a run is reproducible. A random tiebreak makes an agent's choice
  // unrepeatable, and an unrepeatable choice cannot be reviewed.
  return Object.freeze([...scored].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)));
}

/**
 * THE AUTONOMOUS PATH, end to end. Stages 2 through 6.
 *
 * TAKES NO TIER ARGUMENT AND HAS NO OVERRIDE. An autonomous agent cannot ask for an EXPERIMENTAL,
 * HELD or REJECTED template because there is no way to express the request: the pool comes from
 * `shipCatalog()`, the matcher refuses anything else it is handed, and the final answer is checked
 * a third time before it is returned.
 *
 * @returns {{selected: string|null, reason: string, considered: readonly object[], dropped: readonly object[], pipeline: readonly object[]}}
 */
export function selectForAutonomousAgent({ brief, registrySnapshot = null, availability = null } = {}) {
  const live = availability ?? runtimeAvailability(registrySnapshot);
  const pool = shipCatalog();
  const { kept, dropped } = capabilityFilter(pool, live);

  const base = { pipeline: SELECTION_PIPELINE, dropped, availability: live, poolSize: pool.length };

  if (kept.length === 0) {
    return Object.freeze({
      ...base,
      selected: null,
      considered: Object.freeze([]),
      reason:
        "NO_ACTIVE_RUNTIME — every SHIP template belongs to a runtime this chain does not currently carry as ACTIVE. This is a live reading, not a checked-in status: re-read the registry rather than editing a file.",
    });
  }

  const ranked = semanticMatch(kept, brief);
  const best = ranked[0];
  if (!best || best.score <= 0) {
    return Object.freeze({
      ...base,
      selected: null,
      considered: ranked,
      reason: "NO_SEMANTIC_MATCH — no SHIP template answers this brief. Declining is the correct outcome; reaching for a template that did not clear review because its words fit is not.",
    });
  }

  // THIRD GUARD. Belt, braces, and a third thing: if either of the first two is ever weakened by an
  // edit that looks harmless, this one still refuses and a named test still goes red.
  if (!isAutonomouslySelectable(best.id)) {
    throw new Error(`selectForAutonomousAgent produced a ${templateStatus(best.id)} template (${best.id}). This is a bug in the filter, not a permitted outcome.`);
  }

  return Object.freeze({ ...base, selected: best.id, considered: ranked, reason: `MATCHED — ${best.matched.join(", ") || "brief terms"}` });
}

/**
 * What a HUMAN surface lists. Separate function, separate rules, on purpose.
 *
 * A human passing `--experimental` has asked to see work that did not clear the bar and is shown
 * its measured weakness beside it. An agent has asked nothing and read nothing. The two questions
 * are answered by two functions so that widening one cannot widen the other by accident — which is
 * what a single function with an options bag would allow.
 *
 * The advanced tiers come back as REDUCED records with `offeredAsAStartingPoint: false` and no
 * descriptor. Seeing what was judged is not the same as being handed a starting point, and the
 * difference has to survive into the data or tooling will erase it.
 */
export function humanCatalog({ advanced = false } = {}) {
  const shipped = TEMPLATE_DESCRIPTORS.map((d) => d.id)
    .filter((id) => isVisibleToHuman(id, { advanced: false }))
    .map((id) => describeTemplate(id));
  if (advanced !== true) return Object.freeze(shipped);

  const others = allTemplateIds()
    .filter((id) => isAdvancedVisible(id))
    .map((id) => describeUnshippedTemplate(id))
    .filter(Boolean);
  return Object.freeze([...shipped, ...others]);
}
