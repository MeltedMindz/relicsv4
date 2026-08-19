// SPDX-License-Identifier: MIT
// The reviewed-protocol-template MECHANISM. This file deliberately contains no template.
//
// A reviewed protocol template is an immutable PRODUCT integration: a named canonical-economics
// artifact that a launchpad operator has reviewed once and then binds BY HASH, so a bundle can
// state "these are the economics" without a single number becoming creator-editable. It is not a
// creator setting, it is not chosen in the studio, and it is not part of the creator kit's
// authoring surface.
//
// WHY THERE IS NO CONCRETE TEMPLATE HERE.
//
// A concrete template is one operator's commercial configuration — genesis supply, activation
// schedule, staking weights, fee split, target opening valuation. Two things go wrong when that is
// written into the shared schema. It publishes that operator's launch strategy to everyone who
// reads the format; and it makes one product's economics look like part of the FORMAT, so every
// other consumer inherits constants that were never about them.
//
// So the split is: THE FORMAT OWNS THE MECHANISM AND THE REGISTRY; the operator owns the instance
// and registers it at start-up, from their own configuration, against this same source —
//
//     import { registerReviewedProtocolTemplate } from "@relics/project-schema";
//     registerReviewedProtocolTemplate({
//       id: "MY_REVIEWED_TEMPLATE_V1",
//       economicsSha256: "…",              // the reviewed artifact, committed by hash
//       supply: { totalSupplyWhole: "…", artworkSupply: "…", genesisTokensPerPossibleNftWhole: "…" },
//     });
//
// — rather than forking this file. One source runs in the CLI, in the web importer and in the
// operator's own build; only the registry contents differ, and the registry is data.
//
// WITH NOTHING REGISTERED — the default, and the state of the public creator kit — a bundle that
// declares any `protocolTemplate` block is REFUSED BY NAME. That is the correct behaviour for a
// build that implements no template: the alternative is accepting a block whose economics nothing
// in this build can check, which is exactly the silent-drop failure the compatibility rule exists
// to prevent.

import { canonicalJson } from "./canonical-json.js";
import { error } from "./issues.js";
import { sha256Utf8 } from "./sha256.js";

/** The three keys a `protocolTemplate` block may carry. Anything else is refused by name. */
export const PROTOCOL_TEMPLATE_KEYS = Object.freeze(["id", "canonicalEconomics", "economicsSha256"]);

/** A registered template id must look like an id, not like prose or a path. */
const TEMPLATE_ID_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

const SHA256_RE = /^[0-9a-f]{64}$/;

/** @type {Map<string, Readonly<ReviewedProtocolTemplateSpec>>} */
const REGISTRY = new Map();

/**
 * @typedef {{
 *   id: string,
 *   economicsSha256?: string,
 *   supply?: { totalSupplyWhole: string, artworkSupply: string, genesisTokensPerPossibleNftWhole: string },
 *   verify?: (canonicalEconomics: any) => import("./issues.js").Issue[],
 * }} ReviewedProtocolTemplateSpec
 */

/**
 * Ids this build implements. LIVE binding: it is reassigned by `registerReviewedProtocolTemplate`,
 * so an importer that read it at module load sees the registry as it is now, not as it was.
 * @type {readonly string[]}
 */
export let REVIEWED_PROTOCOL_TEMPLATE_IDS = Object.freeze([]);

/** A frozen snapshot of the registered ids. Prefer this to the live binding in new code. */
export function reviewedProtocolTemplateIds() {
  return REVIEWED_PROTOCOL_TEMPLATE_IDS;
}

/** The registered spec for `id`, or null. Never throws. @param {string} id */
export function reviewedProtocolTemplate(id) {
  return REGISTRY.get(id) ?? null;
}

/**
 * The supply values a registered template pins, or null when it pins none.
 *
 * `manifest.js` reads this rather than carrying any product's numbers: a template that pins its
 * supply gets the supply checked; a template that does not still gets the STRUCTURAL rule
 * (`totalSupplyWhole / artworkSupply === genesisTokensPerPossibleNftWhole`), which is a property
 * of the shape and belongs to the format.
 * @param {string} id
 */
export function reviewedTemplateSupplyPin(id) {
  return REGISTRY.get(id)?.supply ?? null;
}

/**
 * Register one reviewed template. Called by whoever operates a launchpad, from their own
 * configuration — never from inside this package.
 *
 * Re-registering the SAME spec is a no-op, so a module that is imported twice does not explode.
 * Re-registering a DIFFERENT spec under the same id throws: silently replacing a reviewed
 * artifact is how a bundle ends up validated against economics nobody reviewed.
 * @param {ReviewedProtocolTemplateSpec} spec
 */
export function registerReviewedProtocolTemplate(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new TypeError("registerReviewedProtocolTemplate(spec): spec must be an object");
  }
  const unknown = Object.keys(spec).filter((k) => !["id", "economicsSha256", "supply", "verify"].includes(k));
  if (unknown.length > 0) {
    throw new TypeError(`registerReviewedProtocolTemplate: unknown spec key(s) ${unknown.join(", ")}`);
  }
  if (typeof spec.id !== "string" || !TEMPLATE_ID_RE.test(spec.id)) {
    throw new TypeError(`registerReviewedProtocolTemplate: id must match ${TEMPLATE_ID_RE} (got ${JSON.stringify(spec.id)})`);
  }
  if (spec.economicsSha256 !== undefined && (typeof spec.economicsSha256 !== "string" || !SHA256_RE.test(spec.economicsSha256))) {
    throw new TypeError("registerReviewedProtocolTemplate: economicsSha256 must be 64 lowercase hex characters");
  }
  if (spec.supply !== undefined) {
    const keys = ["totalSupplyWhole", "artworkSupply", "genesisTokensPerPossibleNftWhole"];
    if (!spec.supply || typeof spec.supply !== "object" || Array.isArray(spec.supply)) {
      throw new TypeError("registerReviewedProtocolTemplate: supply must be an object");
    }
    for (const key of keys) {
      if (!/^[0-9]+$/.test(String(spec.supply[key]))) {
        throw new TypeError(`registerReviewedProtocolTemplate: supply.${key} must be a whole-number decimal string`);
      }
    }
    const extra = Object.keys(spec.supply).filter((k) => !keys.includes(k));
    if (extra.length > 0) throw new TypeError(`registerReviewedProtocolTemplate: unknown supply key(s) ${extra.join(", ")}`);
  }
  if (spec.verify !== undefined && typeof spec.verify !== "function") {
    throw new TypeError("registerReviewedProtocolTemplate: verify must be a function");
  }

  const frozen = Object.freeze({
    id: spec.id,
    ...(spec.economicsSha256 === undefined ? {} : { economicsSha256: spec.economicsSha256 }),
    ...(spec.supply === undefined ? {} : { supply: Object.freeze({ ...spec.supply }) }),
    ...(spec.verify === undefined ? {} : { verify: spec.verify }),
  });

  const existing = REGISTRY.get(spec.id);
  if (existing) {
    const same =
      existing.economicsSha256 === frozen.economicsSha256 &&
      existing.verify === frozen.verify &&
      canonicalJson(existing.supply ?? null) === canonicalJson(frozen.supply ?? null);
    if (!same) throw new Error(`registerReviewedProtocolTemplate: ${spec.id} is already registered with a different specification`);
    return existing;
  }

  REGISTRY.set(spec.id, frozen);
  REVIEWED_PROTOCOL_TEMPLATE_IDS = Object.freeze([...REGISTRY.keys()].sort());
  return frozen;
}

/** Empty the registry. Exists for tests and for a host that rebuilds its configuration. */
export function clearReviewedProtocolTemplates() {
  REGISTRY.clear();
  REVIEWED_PROTOCOL_TEMPLATE_IDS = Object.freeze([]);
}

/**
 * Bind a canonical economics document to a template id, committing to it by hash.
 *
 * Pure: it computes, it does not consult the registry. A binding produced here for an id this
 * build has not registered is still REFUSED by `validateReviewedProtocolTemplate` — producing a
 * binding and honouring one are different acts.
 * @param {string} id
 * @param {any} canonicalEconomics
 */
export function bindCanonicalEconomics(id, canonicalEconomics) {
  return {
    id,
    canonicalEconomics,
    economicsSha256: sha256Utf8(canonicalJson(canonicalEconomics)),
  };
}

/**
 * Validate a `protocolTemplate` block. Structural rules always; instance rules only from the
 * registered spec.
 * @param {unknown} binding
 * @returns {import("./issues.js").Issue[]}
 */
export function validateReviewedProtocolTemplate(binding) {
  const issues = [];
  const at = "relics.project.json#protocolTemplate";
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    return [error("PROTOCOL_TEMPLATE_SHAPE", at, "protocolTemplate must be an object")];
  }
  for (const key of Object.keys(binding)) {
    if (!PROTOCOL_TEMPLATE_KEYS.includes(key)) {
      issues.push(error("PROTOCOL_TEMPLATE_UNKNOWN_KEY", `${at}.${key}`, `unknown protocolTemplate key ${key}`));
    }
  }

  const spec = typeof binding.id === "string" ? REGISTRY.get(binding.id) : undefined;
  if (!spec) {
    issues.push(
      error(
        "PROTOCOL_TEMPLATE_ID",
        `${at}.id`,
        REGISTRY.size === 0
          ? `this build implements no reviewed protocol template, so it cannot honour ${JSON.stringify(binding.id ?? null)}. ` +
            "A reviewed template is an immutable product integration registered by the launchpad operator, not a creator setting — " +
            "export the project without the protocolTemplate block."
          : `unknown reviewed protocol template ${JSON.stringify(binding.id ?? null)} (this build implements ${REVIEWED_PROTOCOL_TEMPLATE_IDS.join(", ")})`,
      ),
    );
    return issues;
  }

  const economics = binding.canonicalEconomics;
  if (!economics || typeof economics !== "object" || Array.isArray(economics)) {
    issues.push(error("PROTOCOL_TEMPLATE_ECONOMICS", `${at}.canonicalEconomics`, "canonicalEconomics must be an object"));
    return issues;
  }

  // The block must name ITSELF as the template it belongs to. Without this a binding could carry
  // one template's id and another's economics, and both halves would look individually correct.
  if (economics.launchpadTemplateId !== binding.id) {
    issues.push(
      error("PROTOCOL_TEMPLATE_ID_MISMATCH", `${at}.canonicalEconomics.launchpadTemplateId`, "canonical economics launchpadTemplateId must match the reviewed template"),
    );
  }

  // The hash must commit to the economics ACTUALLY CARRIED. This is the check that makes the
  // block self-verifying: edit a number and the digest stops matching.
  let computed = null;
  try {
    computed = sha256Utf8(canonicalJson(economics));
  } catch {
    // A canonical-JSON failure is a shape problem; the shape issues above say more than a stack trace.
  }
  if (typeof binding.economicsSha256 !== "string" || binding.economicsSha256 !== computed) {
    issues.push(error("PROTOCOL_TEMPLATE_ECONOMICS_HASH", `${at}.economicsSha256`, "economicsSha256 must commit to the canonical economics object"));
  }

  // And it must be the REVIEWED artifact, not merely an internally consistent one. A binding is
  // self-consistent by construction — `bindCanonicalEconomics` makes it so — which is exactly why
  // consistency alone proves nothing about whether anyone reviewed the numbers.
  if (spec.economicsSha256 !== undefined && binding.economicsSha256 !== spec.economicsSha256) {
    issues.push(
      error(
        "PROTOCOL_TEMPLATE_ECONOMICS_PIN",
        `${at}.economicsSha256`,
        `${binding.id} is bound to a reviewed economics artifact; this bundle carries a different one. ` +
          "Re-export against the reviewed artifact — the economics of a reviewed template are not editable.",
      ),
    );
  }

  if (spec.verify) issues.push(...(spec.verify(economics) ?? []));
  return issues;
}
