// SPDX-License-Identifier: MIT
// The kit's deterministic PRNG. Same algorithm the launchpad studio's preview canvas uses
// (mulberry32 over a 32-bit string hash), so a seed that looks a certain way in the CLI looks the
// same way in the studio.
//
// Determinism is the whole point: templates must never reach for `Math.random`, `Date.now`, or
// anything else the sandbox cannot reproduce. The validator refuses a generator that does.

/**
 * @param {number} seed
 * @returns {() => number} uniform [0,1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string} seed */
export function seedStringToNumber(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * A small, frozen random helper handed to a generator. Everything a template needs to be
 * expressive, nothing it needs to be non-deterministic.
 * @param {string} seed
 */
export function makeRandom(seed) {
  const next = mulberry32(seedStringToNumber(seed));
  const api = {
    /** uniform [0,1) */
    next,
    /** uniform float in [min,max) */
    float: (min, max) => min + next() * (max - min),
    /** uniform integer in [min,max] */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** true with probability p */
    chance: (p) => next() < p,
    /** uniform element of a non-empty array */
    pick: (items) => items[Math.floor(next() * items.length)],
    /**
     * Weighted pick. `weights[i]` must be a positive finite number.
     * @param {any[]} items @param {number[]} weights
     */
    weighted: (items, weights) => {
      let total = 0;
      for (const w of weights) total += w;
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i];
        if (roll < 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
  return Object.freeze(api);
}
