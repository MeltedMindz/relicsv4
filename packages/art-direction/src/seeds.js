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
// THIS FILE ONCE CONTAINED THE HOLDOUT ITSELF, AND THAT DEFEATED IT
// ------------------------------------------------------------------------------------------------
// Until 2026-09-03 the holdout was an arithmetic sequence written out in this module, which
// `author.js` imports. The header asserted "THE AUTHOR NEVER SEES THEM" while the twelve integers
// sat four lines above it, computable by anyone who opened the file, and BYTE-IDENTICAL across
// both completed benchmark rounds. It is not enough that no code path hands the seeds to the
// author: the author reads this source.
//
// The holdout is therefore no longer a constant. It is DERIVED PER ROUND from a salt that exists
// only outside author-visible source, committed to before authoring begins by publishing
// sha256(domain, salt) in the round registry. A reviewer holding the salt reproduces the twelve
// exactly and can check the commitment; a reader of this repository sees a hash and cannot.
//
//   commit    holdoutSaltCommitment(salt)   -> published in packages/art-direction/rounds/registry.json
//   derive    deriveHoldoutSeeds({...})     -> the twelve, from roundId + salt
//   verify    holdoutSeedsDigest(seeds)     -> pinned in the registry once the round is unblinded
//
// THERE IS NO DEFAULT SALT AND NO FALLBACK. `resolveHoldoutSalt` throws when the salt is absent.
// A guessable default is exactly the defect this rewrite closes, and "absence of input is not
// success" is the release law this repository family already runs elsewhere.
//
// ------------------------------------------------------------------------------------------------
// THREE GROUPS, DISJOINT, AND THE DISJOINTNESS IS ASSERTED RATHER THAN ASSUMED
// ------------------------------------------------------------------------------------------------
//   AUTHORING_SEEDS          the author renders these while composing. It may look at them freely.
//   DEVELOPMENT_REVIEW_SEEDS the development critic judges these. The author sees the critique,
//                            and through it these images, which is intended -- that is what an
//                            iteration is.
//   FINAL_HOLDOUT_SEEDS      the final blind reviewer judges these, once, after the config is
//                            frozen. THE AUTHOR NEVER SEES THEM. Per round; not a constant.
//
// They must also avoid the seeds `@relics/art-review` already uses. Its objective battery measures
// on REVIEW_SEEDS and its collection sweep on `collectionSeeds`, and battery FAILURES ARE HANDED
// TO THE AUTHOR by design (`loop.js` carries `objectiveFailures` for the author, not the reviewer).
// If a holdout seed were also a battery seed, the author would receive numeric information about a
// token the final reviewer is about to judge — a weaker leak than an image, and still a leak.
// `assertSeedGroupsDisjoint` checks the populations against each other and throws.
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

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { REVIEW_SEEDS, collectionSeeds } from "../../art-review/src/market.js";

export const SEED_GROUPS = Object.freeze(["AUTHORING_SEEDS", "DEVELOPMENT_REVIEW_SEEDS", "FINAL_HOLDOUT_SEEDS"]);

/** Twelve per group: the size a contact sheet is read at, and the size every published Wave-1 sheet uses. */
export const GROUP_SIZE = 12;

const sha256hex = (s) => createHash("sha256").update(s).digest("hex");

/**
 * The two AUTHOR-VISIBLE populations, and they are deliberately still deterministic.
 *
 * Consecutive integers are a bad seed population for this runtime family: `dna` is
 * `keccak256("relics-review", seed)`, so consecutiveness carries no structure and the appearance
 * of an ordered ring invites a reader to expect one. A large odd stride keeps the populations far
 * apart in the integer line as well as disjoint, which matters only for how the sheets read to a
 * human — but that is the whole audience for these images.
 *
 * Predictability is harmless here and load-bearing: the author is ALLOWED to see both, and a
 * development critique the author cannot reproduce is a critique it cannot act on.
 */
const OPEN_GENERATORS = Object.freeze({
  AUTHORING_SEEDS: { base: 2_017, stride: 89 },
  DEVELOPMENT_REVIEW_SEEDS: { base: 5_003, stride: 131 },
});

function generateOpen(group) {
  const { base, stride } = OPEN_GENERATORS[group];
  return Object.freeze(Array.from({ length: GROUP_SIZE }, (_, i) => base + i * stride));
}

export const AUTHORING_SEEDS = generateOpen("AUTHORING_SEEDS");
export const DEVELOPMENT_REVIEW_SEEDS = generateOpen("DEVELOPMENT_REVIEW_SEEDS");

// ------------------------------------------------------------------------------------------------
// THE HOLDOUT DERIVATION
// ------------------------------------------------------------------------------------------------

const HOLDOUT_DOMAIN = "RELICS-ART-HOLDOUT-SEEDS-V1";

/**
 * The holdout lives in its own decade of the integer line.
 *
 * Not for secrecy — a range is not a secret — but so that a stray seed in a log, a filename or a
 * source comment is IMMEDIATELY recognisable as a holdout seed by whoever reads it. Nothing else
 * in this kit renders a seed above one million.
 */
export const HOLDOUT_SEED_MIN = 1_000_000;
export const HOLDOUT_SEED_MAX = 1_999_999;

/**
 * The public commitment to a salt.
 *
 * Published in the round registry BEFORE authoring starts. It fixes the holdout without revealing
 * it: a reviewer handed the salt afterwards recomputes this and sees that the set it is about to
 * judge is the set that was committed to, rather than one chosen after seeing the work.
 */
export function holdoutSaltCommitment(salt) {
  const s = String(salt ?? "");
  if (s.length < 16) throw new Error(`HOLDOUT_SALT_TOO_SHORT: a salt of ${s.length} character(s) is not a commitment; use at least 16`);
  return sha256hex(`${HOLDOUT_DOMAIN} COMMITMENT ${s}`);
}

/** The canonical digest of a resolved seed list. Pinned in the registry once a round is unblinded. */
export function holdoutSeedsDigest(seeds) {
  const list = [...(seeds ?? [])];
  if (list.length === 0) throw new Error("HOLDOUT_SEEDS_DIGEST_OF_NOTHING: an empty seed list has no digest worth pinning");
  return sha256hex(`${HOLDOUT_DOMAIN} SEEDS ${list.join(",")}`);
}

/**
 * Derive the round's twelve.
 *
 * A counter-mode SHA-256 stream, rejection-sampled into the holdout decade and de-duplicated, with
 * every already-spoken-for population excluded. Deterministic given (roundId, salt) and infeasible
 * without the salt, which is the whole point: the source below is public and the seeds are not.
 *
 * The rejection loop is BOUNDED and throws rather than returning a short list — a holdout of eleven
 * seeds because a loop gave up is a quieter version of the same defect this file exists to close.
 */
export function deriveHoldoutSeeds({ roundId, salt, size = GROUP_SIZE, exclude = null } = {}) {
  const id = String(roundId ?? "");
  const s = String(salt ?? "");
  if (!id) throw new Error("HOLDOUT_DERIVATION_NEEDS_A_ROUND_ID: seeds are per round, and an unnamed round cannot be committed to");
  if (s.length < 16) throw new Error(`HOLDOUT_SALT_TOO_SHORT: a salt of ${s.length} character(s) is not a commitment; use at least 16`);
  if (!Number.isInteger(size) || size < 1) throw new Error(`HOLDOUT_SIZE_INVALID: ${size}`);

  const taken = new Set(exclude ?? [...AUTHORING_SEEDS, ...DEVELOPMENT_REVIEW_SEEDS, ...REVIEW_SEEDS, ...collectionSeeds()]);
  const span = HOLDOUT_SEED_MAX - HOLDOUT_SEED_MIN + 1;
  const out = [];
  const MAX_DRAWS = size * 4096;
  for (let counter = 0; out.length < size; counter += 1) {
    if (counter >= MAX_DRAWS) throw new Error(`HOLDOUT_DERIVATION_EXHAUSTED: ${MAX_DRAWS} draws produced only ${out.length} of ${size} seeds`);
    const block = createHash("sha256").update(`${HOLDOUT_DOMAIN} DERIVE ${id} ${s} ${counter}`).digest();
    const candidate = HOLDOUT_SEED_MIN + (block.readUInt32BE(0) % span);
    if (taken.has(candidate)) continue;
    taken.add(candidate);
    out.push(candidate);
  }
  return Object.freeze(out.sort((a, b) => a - b));
}

/**
 * Where the salt comes from, and why it is never a constant.
 *
 * `RELICS_ART_HOLDOUT_SALT` in the environment, or a file named by
 * `RELICS_ART_HOLDOUT_SALT_FILE`. Both live outside the repository by construction. There is NO
 * third option and no default: a missing salt is a refusal, because the alternative — falling back
 * to something derivable from the source — is precisely the compromise being repaired.
 */
export function resolveHoldoutSalt(env = process.env) {
  const direct = env.RELICS_ART_HOLDOUT_SALT;
  if (direct && String(direct).trim()) return String(direct).trim();
  const file = env.RELICS_ART_HOLDOUT_SALT_FILE;
  if (file && existsSync(file)) {
    const v = readFileSync(file, "utf8").trim();
    if (v) return v;
  }
  throw new Error(
    "HOLDOUT_SALT_UNAVAILABLE: the final holdout is derived per round from a salt that is deliberately " +
    "not in this repository. Set RELICS_ART_HOLDOUT_SALT or RELICS_ART_HOLDOUT_SALT_FILE. There is no " +
    "default, because a default salt is a guessable holdout, which is the defect this mechanism closes.",
  );
}

/** The round's twelve, resolved from the environment. Throws when the salt is absent. */
export function finalHoldoutSeeds({ roundId, env = process.env } = {}) {
  return deriveHoldoutSeeds({ roundId, salt: resolveHoldoutSalt(env) });
}

export const SEEDS_BY_GROUP_OPEN = Object.freeze({ AUTHORING_SEEDS, DEVELOPMENT_REVIEW_SEEDS });

/**
 * Prove the populations do not overlap.
 *
 * The holdout is now an ARGUMENT rather than a module constant, and passing none is legal: the two
 * open groups still have to be disjoint from each other and from art-review's own, and that check
 * is worth running with no salt in hand. What is NOT legal is reporting a holdout as checked when
 * none was supplied — `holdoutChecked` in the return value says which of the two happened.
 *
 * An overlap is a thrown error rather than a warning: a holdout that is not held out produces a
 * verdict that reads exactly like a real one.
 */
export function assertSeedGroupsDisjoint(groups = SEEDS_BY_GROUP_OPEN, { finalHoldout = null } = {}) {
  const populations = {
    ...groups,
    ...(finalHoldout ? { FINAL_HOLDOUT_SEEDS: [...finalHoldout] } : {}),
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
      if (shared.length) problems.push(`${names[i]} and ${names[j]} share ${shared.length} seed(s)`);
    }
  }
  if (problems.length) throw new Error(`SEED_GROUPS_NOT_DISJOINT:\n  ${problems.join("\n  ")}`);
  return {
    ok: true,
    holdoutChecked: Boolean(finalHoldout),
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

/**
 * The seeds a role may be shown. Throws for an unknown role rather than defaulting to none.
 *
 * The FINAL_REVIEWER's group is not a constant any more, so it must be supplied. Asking for it
 * without one throws rather than returning `[]` — an empty allow-list would make every check
 * against it vacuously true, which is the shape of a gate that reads as enforcement and is not.
 */
export function seedsVisibleTo(role, { finalHoldout = null } = {}) {
  const groups = ROLE_VISIBILITY[role];
  if (!groups) throw new Error(`unknown review role "${role}"; known roles: ${Object.keys(ROLE_VISIBILITY).join(", ")}`);
  const byGroup = { ...SEEDS_BY_GROUP_OPEN, FINAL_HOLDOUT_SEEDS: finalHoldout };
  return Object.freeze(groups.flatMap((g) => {
    const seeds = byGroup[g];
    if (!seeds) throw new Error(`SEED_GROUP_UNRESOLVED: ${g} is derived per round and none was supplied to seedsVisibleTo("${role}")`);
    return [...seeds];
  }));
}

/**
 * Would showing these seeds to this role leak the holdout?
 *
 * Used by the packet builders AND by the benchmark harness before it renders a single author or
 * critic sheet. Returns the offending seeds rather than a boolean, because the useful error
 * message names them.
 *
 * `finalHoldout` is optional for the two open roles and required to answer `includesFinalHoldout`
 * honestly. Without it that field is `"UNKNOWN"` — never `[]`, which would read as "no holdout
 * seeds leaked" on the strength of never having looked.
 */
export function holdoutLeak(role, seeds, { finalHoldout = null } = {}) {
  const allowed = new Set(role === "FINAL_REVIEWER" ? seedsVisibleTo(role, { finalHoldout }) : seedsVisibleTo(role));
  const leaked = [...new Set(seeds)].filter((s) => !allowed.has(s));
  const holdout = finalHoldout ? new Set(finalHoldout) : null;
  return {
    leaks: leaked.length > 0,
    seeds: leaked,
    includesFinalHoldout: holdout ? leaked.filter((s) => holdout.has(s)) : "UNKNOWN",
  };
}

/** Throw if a render plan would put a seed in front of a role that may not see it. */
export function assertNoHoldoutLeak(role, seeds, { finalHoldout = null, context = "" } = {}) {
  const leak = holdoutLeak(role, seeds, { finalHoldout });
  if (leak.leaks) {
    throw new Error(`HOLDOUT_LEAK${context ? ` (${context})` : ""}: role ${role} may not be shown seed(s) ${leak.seeds.slice(0, 8).join(", ")}`);
  }
  return leak;
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
export function renderPlanFor(role, { briefText = "", states = null, finalHoldout = null } = {}) {
  const seeds = role === "FINAL_REVIEWER" ? seedsVisibleTo(role, { finalHoldout }) : seedsVisibleTo(role);
  const marketStates = states ?? ["neutral", "stress", "recovery"];
  return Object.freeze({
    role,
    seeds,
    states: Object.freeze([...marketStates]),
    marketResponseClaimed: marketResponseClaimed(briefText),
    cells: seeds.length * marketStates.length,
  });
}
