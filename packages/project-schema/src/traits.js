// SPDX-License-Identifier: MIT
// `traits/schema.json` — the declarative trait schema, and the ONE deterministic derivation of a
// token's traits from its seed. The CLI's duplicate-rate report and any importer preview both go
// through `deriveTraits`, so "this seed has these traits" is the same statement everywhere.

import { LIMITS } from "./limits.js";
import { TRAIT_DISTRIBUTIONS } from "./vocabulary.js";
import { error, warn } from "./issues.js";
import { makeRandom } from "./prng.js";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _'\-.]*$/;

/**
 * @param {any} schema
 * @returns {import("./issues.js").Issue[]}
 */
export function validateTraitSchema(schema) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];
  const at = "traits/schema.json";

  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return [error("TRAITS_SHAPE", at, "the trait schema must be a JSON object")];
  }
  for (const key of Object.keys(schema)) {
    if (!["version", "dimensions"].includes(key)) {
      issues.push(error("TRAITS_UNKNOWN_KEY", `${at}#${key}`, `unknown key "${key}" (allowed: version, dimensions)`));
    }
  }
  if (schema.version !== 1) issues.push(error("TRAITS_VERSION", `${at}#version`, "version must be 1"));

  const dimensions = schema.dimensions;
  if (!Array.isArray(dimensions)) {
    issues.push(error("TRAITS_DIMENSIONS", `${at}#dimensions`, "dimensions must be an array (use [] for a collection with no traits)"));
    return issues;
  }
  if (dimensions.length > LIMITS.maxTraitDimensions) {
    issues.push(error("TRAITS_DIMENSION_COUNT", `${at}#dimensions`, `at most ${LIMITS.maxTraitDimensions} trait dimensions`));
  }
  if (dimensions.length === 0) {
    issues.push(warn("TRAITS_EMPTY", `${at}#dimensions`, "no trait dimensions — every artwork will report the same (empty) trait set"));
  }

  const seenNames = new Set();
  dimensions.forEach((dimension, i) => {
    const where = `${at}#dimensions[${i}]`;
    if (!dimension || typeof dimension !== "object" || Array.isArray(dimension)) {
      issues.push(error("TRAITS_DIMENSION", where, "each dimension must be an object"));
      return;
    }
    for (const key of Object.keys(dimension)) {
      if (!["name", "distribution", "values"].includes(key)) {
        issues.push(error("TRAITS_UNKNOWN_KEY", `${where}.${key}`, `unknown key "${key}" (allowed: name, distribution, values)`));
      }
    }
    if (typeof dimension.name !== "string" || !NAME_RE.test(dimension.name) || dimension.name.length > LIMITS.maxTraitNameLength) {
      issues.push(error("TRAITS_DIMENSION_NAME", `${where}.name`, `dimension name must match ${NAME_RE} and be at most ${LIMITS.maxTraitNameLength} characters`));
    } else {
      const key = dimension.name.toLowerCase();
      if (seenNames.has(key)) issues.push(error("TRAITS_DIMENSION_DUP", `${where}.name`, `duplicate dimension name "${dimension.name}"`));
      seenNames.add(key);
    }
    if (!TRAIT_DISTRIBUTIONS.includes(dimension.distribution)) {
      issues.push(error("TRAITS_DISTRIBUTION", `${where}.distribution`, `distribution must be one of ${TRAIT_DISTRIBUTIONS.join(", ")}`));
    }

    const values = dimension.values;
    if (!Array.isArray(values) || values.length === 0) {
      issues.push(error("TRAITS_VALUES", `${where}.values`, "each dimension needs at least one value"));
      return;
    }
    if (values.length > LIMITS.maxTraitValuesPerDimension) {
      issues.push(error("TRAITS_VALUE_COUNT", `${where}.values`, `at most ${LIMITS.maxTraitValuesPerDimension} values per dimension`));
    }
    const seenValues = new Set();
    values.forEach((value, j) => {
      const vw = `${where}.values[${j}]`;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        issues.push(error("TRAITS_VALUE", vw, "each value must be an object"));
        return;
      }
      for (const key of Object.keys(value)) {
        if (!["name", "weight"].includes(key)) issues.push(error("TRAITS_UNKNOWN_KEY", `${vw}.${key}`, `unknown key "${key}" (allowed: name, weight)`));
      }
      if (typeof value.name !== "string" || !NAME_RE.test(value.name) || value.name.length > LIMITS.maxTraitNameLength) {
        issues.push(error("TRAITS_VALUE_NAME", `${vw}.name`, `value name must match ${NAME_RE} and be at most ${LIMITS.maxTraitNameLength} characters`));
      } else {
        const key = value.name.toLowerCase();
        if (seenValues.has(key)) issues.push(error("TRAITS_VALUE_DUP", `${vw}.name`, `duplicate value "${value.name}" in dimension "${dimension.name}"`));
        seenValues.add(key);
      }
      if (dimension.distribution === "weighted") {
        if (!Number.isInteger(value.weight) || value.weight < LIMITS.minTraitWeight || value.weight > LIMITS.maxTraitWeight) {
          issues.push(error("TRAITS_WEIGHT", `${vw}.weight`, `weighted values need an integer weight between ${LIMITS.minTraitWeight} and ${LIMITS.maxTraitWeight}`));
        }
      } else if (value.weight !== undefined) {
        issues.push(error("TRAITS_WEIGHT_UNEXPECTED", `${vw}.weight`, "uniform dimensions must not carry weights"));
      }
    });
  });

  return issues;
}

/**
 * Deterministically derives one token's traits. Each dimension draws from its own PRNG stream
 * (`<seed>:trait:<dimension name>`), so adding a dimension never reshuffles the ones before it.
 *
 * @param {{ dimensions: { name: string, distribution: string, values: { name: string, weight?: number }[] }[] }} schema
 * @param {string} seed
 * @returns {{ name: string, value: string }[]}
 */
export function deriveTraits(schema, seed) {
  const out = [];
  for (const dimension of schema.dimensions ?? []) {
    const random = makeRandom(`${seed}:trait:${dimension.name}`);
    const names = dimension.values.map((v) => v.name);
    if (dimension.distribution === "weighted") {
      out.push({ name: dimension.name, value: random.weighted(names, dimension.values.map((v) => v.weight ?? 1)) });
    } else {
      out.push({ name: dimension.name, value: random.pick(names) });
    }
  }
  return out;
}

/** Stable fingerprint of a derived trait set, used to count duplicates. */
export function traitFingerprint(traits) {
  return traits.map((t) => `${t.name}=${t.value}`).join("|");
}

/**
 * The theoretical maximum number of distinct trait combinations. A collection whose artwork
 * supply exceeds this cannot avoid duplicates, which is worth saying out loud before launch.
 * @param {{ dimensions: { values: unknown[] }[] }} schema
 */
export function combinationSpace(schema) {
  let total = 1n;
  for (const dimension of schema.dimensions ?? []) {
    total *= BigInt(dimension.values.length);
    if (total > 10n ** 30n) return 10n ** 30n;
  }
  return total;
}
