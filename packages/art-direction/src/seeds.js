// SPDX-License-Identifier: MIT
// ================================================================================================
// HOLDOUT SEEDS — the reason a final verdict means anything.
//
// A generative collection is not one picture, it is a population, and the failure that has ended
// more Wave-1 templates than any other is a population that reads as one work repeated. `idol` was
// held for exactly this: its frame was topologically identical on every seed, with only its
// texture seeded, and at 120px texture does not survive. No objective gate asks that question —
// the byte check passed it, the perceptual state gate passed it, and a reviewer looking at a grid
// of twelve caught it in one glance.
//
// So the final judgement has to be made on seeds the author never optimised against. Otherwise the
// loop converges on a configuration that is excellent at exactly the twelve tokens it was shown
// and says nothing about the other 9,988. That is overfitting, it is the ordinary failure of any
// iterated process with one held-out set and no discipline about it, and the only defence is that
// the author cannot see the final set at all.
//
// ------------------------------------------------------------------------------------------------
// THREE GROUPS, DISJOINT, AND THE DISJOINTNESS IS ASSERTED RATHER THAN ASSUMED
// ------------------------------------------------------------------------------------------------
//   AUTHORING_SEEDS          the author renders these while composing. It may look at them freely.
//   DEVELOPMENT_REVIEW_SEEDS the development critic judges these. The author sees the critique,
//                            and through it these images, which is intended -- that is what an
//                            iteration is.
//   FINAL_HOLDOUT_SEEDS      the final blind reviewer judges these, once, after the config is
//                            frozen. THE AUTHOR NEVER SEES THEM.
//
// They must also avoid the seeds `@relics/art-review` already uses. Its objective battery measures
// on REVIEW_SEEDS and its collection sweep on `collectionSeeds`, and battery FAILURES ARE HANDED
// TO THE AUTHOR by design (`loop.js` carries `objectiveFailures` for the author, not the reviewer).
// If a holdout seed were also a battery seed, the author would receive numeric information about a
// token the final reviewer is about to judge — a weaker leak than an image, and still a leak.
// `assertSeedGroupsDisjoint` checks all five populations against each other and throws.
//
// ------------------------------------------------------------------------------------------------
// UNBLINDING IS A ONE-WAY DOOR
// ------------------------------------------------------------------------------------------------
// Once the final holdout has been rendered and shown to a reviewer, the configuration is frozen in
// the strong sense: ANY render-affecting change invalidates the verdict, because the pictures that
// were judged are no longer the pictures the bytes draw. That is not a policy this file can
// enforce on its own — it is enforced by binding the verdict to the config hash in
// `acceptance.js` — but the vocabulary lives here so both sides use the same word.
// ================================================================================================

import { REVIEW_SEEDS, collectionSeeds } from "../../art-review/src/market.js";

export const SEED_GROUPS = Object.freeze(["AUTHORING_SEEDS", "DEVELOPMENT_REVIEW_SEEDS", "FINAL_HOLDOUT_SEEDS"]);

/** Twelve per group: the size a contact sheet is read at, and the size every published Wave-1 sheet uses. */
export const GROUP_SIZE = 12;

/**
 * Deterministic, and deliberately NOT contiguous.
 *
 * Consecutive integers are a bad seed population for this runtime family: `dna` is
 * `keccak256("relics-review" ‖ seed)`, so consecutiveness carries no structure and the appearance
 * of an ordered ring invites a reader to expect one. A large odd stride per group keeps the three
 * populations far apart in the integer line as well as disjoint, which matters only for how the
 * sheets read to a human — but that is the whole audience for these images.
 */
const GENERATORS = Object.freeze({
  AUTHORING_SEEDS: { base: 2_017, stride: 89 },
  DEVELOPMENT_REVIEW_SEEDS: { base: 5_003, stride: 131 },
  FINAL_HOLDOUT_SEEDS: { base: 9_011, stride: 179 },
});

function generate(group) {
  const { base, stride } = GENERATORS[group];
  return Object.freeze(Array.from({ length: GROUP_SIZE }, (_, i) => base + i * stride));
}

export const AUTHORING_SEEDS = generate("AUTHORING_SEEDS");
export const DEVELOPMENT_REVIEW_SEEDS = generate("DEVELOPMENT_REVIEW_SEEDS");
export const FINAL_HOLDOUT_SEEDS = generate("FINAL_HOLDOUT_SEEDS");

export const SEEDS_BY_GROUP = Object.freeze({
  AUTHORING_SEEDS,
  DEVELOPMENT_REVIEW_SEEDS,
  FINAL_HOLDOUT_SEEDS,
});

/**
 * Prove the five populations do not overlap.
 *
 * Called at module load AND exported, because a caller that constructs its own groups deserves the
 * same check. An overlap is a thrown error rather than a warning: a holdout that is not held out
 * produces a verdict that reads exactly like a real one.
 */
export function assertSeedGroupsDisjoint(groups = SEEDS_BY_GROUP) {
  const populations = {
    ...groups,
    ART_REVIEW_RING: REVIEW_SEEDS,
    ART_REVIEW_COLLECTION_SWEEP: collectionSeeds(),
  };
  const names = Object.keys(populations);
  const problems = [];
  for (let i = 0; i < names.length; i += 1) {
    const a = new Set(populations[names[i]]);
    if (a.size !== populations[names[i]].length) problems.push(`${names[i]} contains a duplicate seed`);
    for (let j = i + 1; j < names.length; j += 1) {
      const shared = populations[names[j]].filter((s) => a.has(s));
      if (shared.length) problems.push(`${names[i]} and ${names[j]} share ${shared.length} seed(s): ${shared.slice(0, 5).join(", ")}`);
    }
  }
  if (problems.length) throw new Error(`SEED_GROUPS_NOT_DISJOINT:\n  ${problems.join("\n  ")}`);
  return {
    ok: true,
    populations: Object.fromEntries(names.map((n) => [n, populations[n].length])),
    totalDistinct: new Set(names.flatMap((n) => populations[n])).size,
  };
}

assertSeedGroupsDisjoint();

/**
 * What each ROLE is allowed to render.
 *
 * The author's entry deliberately lists ONE group. Everything that enforces the holdout downstream
 * reads this table, so widening it here is the single place a leak could be introduced — and that
 * is exactly why it is a table rather than a convention spread across call sites.
 */
export const ROLE_VISIBILITY = Object.freeze({
  AUTHOR: Object.freeze(["AUTHORING_SEEDS"]),
  DEVELOPMENT_CRITIC: Object.freeze(["DEVELOPMENT_REVIEW_SEEDS"]),
  FINAL_REVIEWER: Object.freeze(["FINAL_HOLDOUT_SEEDS"]),
});

/** The seeds a role may be shown. Throws for an unknown role rather than defaulting to none. */
export function seedsVisibleTo(role) {
  const groups = ROLE_VISIBILITY[role];
  if (!groups) throw new Error(`unknown review role "${role}"; known roles: ${Object.keys(ROLE_VISIBILITY).join(", ")}`);
  return Object.freeze(groups.flatMap((g) => SEEDS_BY_GROUP[g]));
}

/**
 * Would showing these seeds to this role leak the holdout?
 *
 * Used by the packet builders. Returns the offending seeds rather than a boolean, because the
 * useful error message names them.
 */
export function holdoutLeak(role, seeds) {
  const allowed = new Set(seedsVisibleTo(role));
  const leaked = [...new Set(seeds)].filter((s) => !allowed.has(s));
  const holdout = new Set(FINAL_HOLDOUT_SEEDS);
  return {
    leaks: leaked.length > 0,
    seeds: leaked,
    includesFinalHoldout: leaked.filter((s) => holdout.has(s)),
  };
}

/**
 * Does this brief claim the market changes the work?
 *
 * When it does, the final holdout must be rendered at all three market states rather than at
 * neutral alone — the claim under test is a claim about a DIFFERENCE, and a single-state sheet
 * cannot evidence or refute it. When it does not, the states are still rendered but the reviewer
 * is not asked to find a change that was never promised.
 *
 * Deliberately generous: any market vocabulary at all counts. A false positive costs two extra
 * sheets; a false negative silently drops the axis on which `marketResponse` is judged.
 */
export function marketResponseClaimed(briefText) {
  return /\b(market|drawdown|stress|volatil\w+|recover\w+|liquidit\w+|volume|epoch|regime|crash|rally|flow)\b/i.test(String(briefText ?? ""));
}

/**
 * The render plan for a role: which seeds, at which market states.
 *
 * ALL THREE STATES ARE ALWAYS RENDERED, whatever the brief claims. An earlier cut of this made the
 * state list conditional on `marketResponseClaimed`, which was wrong in the more dangerous
 * direction: a brief that promises nothing about the market can still SHIP a configuration whose
 * stress render is a blank frame, and rendering only neutral would have hidden it. The claim
 * changes what the reviewer is ASKED, not what it is SHOWN — `marketResponseClaimed` travels on
 * the plan so the rubric's `marketResponse` axis can be posed as "is the promised change visible"
 * rather than "find a change nobody promised".
 */
export function renderPlanFor(role, { briefText = "", states = null } = {}) {
  const seeds = seedsVisibleTo(role);
  const marketStates = states ?? ["neutral", "stress", "recovery"];
  return Object.freeze({
    role,
    seeds,
    states: Object.freeze([...marketStates]),
    marketResponseClaimed: marketResponseClaimed(briefText),
    cells: seeds.length * marketStates.length,
  });
}
