// SPDX-License-Identifier: MIT
// `market/mappings.json` — declarative SENSOR -> TRANSFORM -> DESTINATION wiring, and the
// deterministic evaluator the preview uses.
//
// This is configuration, not code. A mapping names a sensor id, a transform id, numeric params
// inside published bounds, and a destination id. There is no expression to parse, no callback, no
// address, and no way to reach a fee, a liquidity parameter or an external call.

import { LIMITS } from "./limits.js";
import { MARKET_SENSOR_IDS, MARKET_TRANSFORM_IDS, ART_DESTINATION_IDS, transformSpec } from "./vocabulary.js";
import { error, warn } from "./issues.js";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * @param {any} document
 * @returns {import("./issues.js").Issue[]}
 */
export function validateMarketMappings(document) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];
  const at = "market/mappings.json";

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return [error("MARKET_DOC_SHAPE", at, "the market mapping document must be a JSON object")];
  }
  for (const key of Object.keys(document)) {
    if (!["version", "mappings"].includes(key)) {
      issues.push(error("MARKET_UNKNOWN_KEY", `${at}#${key}`, `unknown key "${key}" (allowed: version, mappings)`));
    }
  }
  if (document.version !== 1) issues.push(error("MARKET_VERSION", `${at}#version`, "version must be 1"));

  const mappings = document.mappings;
  if (!Array.isArray(mappings)) {
    issues.push(error("MARKET_MAPPINGS", `${at}#mappings`, "mappings must be an array (use [] for static art)"));
    return issues;
  }
  if (mappings.length > LIMITS.maxMarketMappings) {
    issues.push(error("MARKET_MAPPING_COUNT", `${at}#mappings`, `at most ${LIMITS.maxMarketMappings} mappings`));
  }

  const seenIds = new Set();
  const seenDestinations = new Map();
  mappings.forEach((mapping, i) => {
    const where = `${at}#mappings[${i}]`;
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      issues.push(error("MARKET_MAPPING", where, "each mapping must be an object"));
      return;
    }
    for (const key of Object.keys(mapping)) {
      if (!["id", "sensor", "transform", "transformParams", "destination"].includes(key)) {
        issues.push(error("MARKET_UNKNOWN_KEY", `${where}.${key}`, `unknown key "${key}" (allowed: id, sensor, transform, transformParams, destination)`));
      }
    }
    if (typeof mapping.id !== "string" || !ID_RE.test(mapping.id)) {
      issues.push(error("MARKET_MAPPING_ID", `${where}.id`, `mapping id must match ${ID_RE}`));
    } else {
      if (seenIds.has(mapping.id)) issues.push(error("MARKET_MAPPING_ID_DUP", `${where}.id`, `duplicate mapping id "${mapping.id}"`));
      seenIds.add(mapping.id);
    }
    if (!MARKET_SENSOR_IDS.includes(mapping.sensor)) {
      issues.push(error("MARKET_SENSOR", `${where}.sensor`, `unknown sensor ${JSON.stringify(mapping.sensor)} (allowed: ${MARKET_SENSOR_IDS.join(", ")})`));
    }
    if (!ART_DESTINATION_IDS.includes(mapping.destination)) {
      issues.push(error("MARKET_DESTINATION", `${where}.destination`, `unknown destination ${JSON.stringify(mapping.destination)} (allowed: ${ART_DESTINATION_IDS.join(", ")})`));
    } else {
      const previous = seenDestinations.get(mapping.destination);
      if (previous !== undefined) {
        issues.push(
          warn("MARKET_DESTINATION_CONTESTED", `${where}.destination`, `"${mapping.destination}" is already driven by mapping[${previous}]; the later mapping wins, which is rarely what a creator means`),
        );
      }
      seenDestinations.set(mapping.destination, i);
    }
    if (!MARKET_TRANSFORM_IDS.includes(mapping.transform)) {
      issues.push(error("MARKET_TRANSFORM", `${where}.transform`, `unknown transform ${JSON.stringify(mapping.transform)} (allowed: ${MARKET_TRANSFORM_IDS.join(", ")})`));
      return;
    }

    const spec = transformSpec(mapping.transform);
    const params = mapping.transformParams;
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      issues.push(error("MARKET_PARAMS", `${where}.transformParams`, "transformParams must be an object (use {} for a transform with no parameters)"));
      return;
    }
    for (const key of Object.keys(params)) {
      if (!spec.params.some((p) => p.key === key)) {
        issues.push(error("MARKET_PARAM_UNKNOWN", `${where}.transformParams.${key}`, `transform "${mapping.transform}" has no parameter "${key}"`));
      }
    }
    for (const p of spec.params) {
      const value = params[p.key];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push(error("MARKET_PARAM_MISSING", `${where}.transformParams.${p.key}`, `"${p.label}" is required and must be a finite number`));
        continue;
      }
      if (value < p.min || value > p.max) {
        issues.push(error("MARKET_PARAM_BOUNDS", `${where}.transformParams.${p.key}`, `"${p.label}" must be between ${p.min} and ${p.max} (got ${value})`));
      }
    }
    if (mapping.transform === "range" && typeof params.inMin === "number" && typeof params.inMax === "number" && params.inMin >= params.inMax) {
      issues.push(error("MARKET_PARAM_ORDER", `${where}.transformParams`, "range: input min must be less than input max"));
    }
    if (mapping.transform === "clamp" && typeof params.min === "number" && typeof params.max === "number" && params.min >= params.max) {
      issues.push(error("MARKET_PARAM_ORDER", `${where}.transformParams`, "clamp: min must be less than max"));
    }
  });

  return issues;
}

/**
 * Applies one transform to a sensor reading in [-1,1] and returns a value in [0,1]. Pure and
 * total: every branch clamps, so a destination can never receive an out-of-range value however
 * strange the sensor reading is.
 *
 * @param {{ transform: string, transformParams: Record<string, number> }} mapping
 * @param {number} reading sensor value, expected in [-1, 1]
 * @param {{ previous?: number, current?: number }} [state]
 */
export function applyTransform(mapping, reading, state = {}) {
  const x = clamp01((clampRange(reading, -1, 1) + 1) / 2);
  const p = mapping.transformParams ?? {};
  switch (mapping.transform) {
    case "threshold":
      return clampRange(reading, -1, 1) >= p.cutoff ? 1 : 0;
    case "range": {
      const span = p.inMax - p.inMin;
      if (!(span > 0)) return 0;
      return clamp01((clampRange(reading, -1, 1) - p.inMin) / span);
    }
    case "clamp":
      return clampRange(x, p.min, p.max);
    case "smoothing": {
      const window = Math.max(1, Math.round(p.window));
      const alpha = 2 / (window + 1);
      const previous = typeof state.previous === "number" ? state.previous : x;
      return clamp01(previous + alpha * (x - previous));
    }
    case "tier": {
      const steps = Math.max(2, Math.round(p.steps));
      return clamp01(Math.min(steps - 1, Math.floor(x * steps)) / (steps - 1));
    }
    case "accumulation": {
      const previous = typeof state.previous === "number" ? state.previous : 0;
      return clamp01(Math.min(p.cap, previous + x * (1 / 16)));
    }
    case "decay": {
      const halfLife = Math.max(1, Math.round(p.halfLife));
      const previous = typeof state.previous === "number" ? state.previous : x;
      return clamp01(previous * Math.pow(0.5, 1 / halfLife));
    }
    case "inverse":
      return clamp01(1 - x);
    case "weighted_mix": {
      const current = typeof state.current === "number" ? state.current : 0;
      return clamp01(current * (1 - p.weight) + x * p.weight);
    }
    default:
      return 0;
  }
}

/**
 * Evaluates every mapping against a market-state reading and returns the destination values a
 * generator receives. Destinations with no mapping are absent, never invented.
 *
 * @param {{ mappings: any[] }} document
 * @param {Record<string, number>} sensors sensor id -> reading in [-1,1]
 * @returns {Record<string, number>} destination id -> value in [0,1]
 */
export function evaluateMappings(document, sensors) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const mapping of document.mappings ?? []) {
    const reading = typeof sensors[mapping.sensor] === "number" ? sensors[mapping.sensor] : 0;
    out[mapping.destination] = applyTransform(mapping, reading, { current: out[mapping.destination] });
  }
  return out;
}

function clamp01(v) {
  return clampRange(v, 0, 1);
}

function clampRange(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}
