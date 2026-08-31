// SPDX-License-Identifier: MIT
//
// THE ART SELECTOR WORD, DECLARED ONCE FOR EVERY OFF-CHAIN SURFACE.
//
// `LaunchParams.artTemplateId` carries TWO creator choices in one 256-bit word:
//
//     artTemplateId = uint256(artRuntimeId) << 224 | templateId
//
//   * `templateId`   — the registered template. Bits 0..223.
//   * `artRuntimeId` — the art runtime this project elects. Bits 224..255. ZERO MEANS THE CREATOR
//                      EXPRESSED NO PREFERENCE and resolves to the chain's generic runtime; zero
//                      is also the art registry's reserved "no runtime" sentinel, so it can never
//                      NAME a runtime and an election can never be represented by it.
//
// THE AUTHORITY IS `launchpad/src/rc6/art/ArtSelectorLib.sol`, NOT THIS FILE. That library is
// deployed inside live bytecode on three chains; this is its off-chain mirror. When the two
// disagree, the chain is right and this file is the defect. `fixtures/art-selector/vectors.json`
// is the shared corpus both implementations are checked against, and neither one consumes the
// other's output.
//
// WHY THIS LIVES IN `@relics/project-schema` AND NOWHERE ELSE. The selector is consumed by the
// creator CLI, the launch SDK, the signer protocol, the agent flow, the launchpad site and the
// fork E2E suite. Every one of those already depends on this package, directly or through
// `@relics/launch-sdk`; a second copy anywhere would be a second declaration of a value that is
// written into a project's IMMUTABLE art binding, where a disagreement is permanent. The same
// reasoning the Solidity library states for itself ("two contracts open-coding `>> 224` is how a
// factory and a registry end up disagreeing about which half is which") applies with more force
// off chain, because there are more surfaces.
//
// BIGINT, NOT NUMBER, FOR THE TEMPLATE HALF. 2^224 does not fit a JavaScript number and a silent
// precision loss here becomes a permanently wrong on-chain art binding. The runtime half is a
// `uint32` and IS exactly representable, so it crosses this boundary as a `number` — that
// asymmetry is deliberate and documented at each site rather than smoothed over, because every
// consumer of the runtime id (a registry read, a viem argument, a comparison against a descriptor)
// wants a number and every consumer of the template id must not be handed one.

/** Where the elected art runtime id starts. `ArtSelectorLib.RUNTIME_ID_SHIFT`. */
export const ART_SELECTOR_RUNTIME_ID_SHIFT = 224n;

/** Every bit a template id may occupy. `ArtSelectorLib.TEMPLATE_ID_MASK`. */
export const ART_SELECTOR_TEMPLATE_ID_MASK = (1n << ART_SELECTOR_RUNTIME_ID_SHIFT) - 1n;

/**
 * The largest legal art runtime id: 2^32 - 1.
 *
 * NOT AN ARBITRARY CEILING. The runtime id is a `uint32` everywhere it appears — the key of
 * `ArtRuntimeRegistryV1`, `ArtBindingInputV1.runtimeId`, `TokenIdentityV1.runtimeId` — so the high
 * 32 bits of the selector are EXACTLY the runtime half and no truncation is possible in either
 * direction.
 */
export const ART_SELECTOR_MAX_RUNTIME_ID = 0xffff_ffffn;

/** The largest legal template id: 2^224 - 1. Identical to the mask, by construction. */
export const ART_SELECTOR_MAX_TEMPLATE_ID = ART_SELECTOR_TEMPLATE_ID_MASK;

/** The largest value a selector word can hold: 2^256 - 1. */
export const ART_SELECTOR_MAX = (1n << 256n) - 1n;

/**
 * The runtime-half value meaning "the creator expressed no preference".
 *
 * IT IS NOT A RUNTIME AND MUST NEVER BE USED AS ONE. `ArtRuntimeRegistryV1` reserves zero as its
 * "no runtime" sentinel, and `LaunchpadFactoryV1.artInputFor` reads it as "resolve this chain's
 * generic runtime". A Wave-1 election represented by zero would launch generic art under the
 * creator's name, permanently, with the launch reporting success.
 */
export const ART_SELECTOR_NO_RUNTIME_PREFERENCE = 0;

/**
 * Every verdict `validateArtSelector` can return. Closed, so a caller can exhaustively branch and
 * a new code is a compile-time event rather than a silent fall-through to "not OK".
 */
export const ART_SELECTOR_CODES = Object.freeze([
  "OK",
  "NOT_AN_INTEGER",
  "NEGATIVE",
  "RUNTIME_ID_OVERFLOW",
  "TEMPLATE_ID_OVERFLOW",
  "SELECTOR_OVERFLOW",
  "NO_RUNTIME_ELECTION",
  "NO_TEMPLATE",
  "BAD_INPUT",
]);

/** Thrown by `encodeArtSelector` / `decodeArtSelector`. Carries the same code `validate` returns. */
export class ArtSelectorError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "ArtSelectorError";
    this.code = code;
  }
}

const DECIMAL_RE = /^-?[0-9]+$/;
const HEX_RE = /^-?0[xX][0-9a-fA-F]+$/;

/**
 * Coerce an integral input to `bigint` WITHOUT ever losing precision.
 *
 * `BigInt()` on its own is too permissive to be a boundary: `BigInt("")` is `0n`, `BigInt(" 7 ")`
 * is `7n`, and `BigInt("0b101")` is `5n`. A template id arrives from a bundle as a decimal string
 * and from a chain read as `0x…` hex; nothing else is a template id, and accepting prose that
 * happens to parse is how an empty field becomes a launch that binds template 0.
 *
 * A `number` must be a SAFE integer. `2 ** 60` is exactly representable and still refused, because
 * arithmetic reaching this boundary as a number is arithmetic that may already have rounded.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {{ ok: true, value: bigint } | { ok: false, code: string, reason: string }}
 */
function toIntegral(value, field) {
  if (typeof value === "bigint") return { ok: true, value };
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      return {
        ok: false,
        code: "NOT_AN_INTEGER",
        reason: `${field} must be a safe integer; ${String(value)} is not. Values above 2^53-1 must be passed as a bigint or a decimal string — a number there may already have rounded.`,
      };
    }
    return { ok: true, value: BigInt(value) };
  }
  if (typeof value === "string") {
    const trimmed = value;
    if (!DECIMAL_RE.test(trimmed) && !HEX_RE.test(trimmed)) {
      return {
        ok: false,
        code: "NOT_AN_INTEGER",
        reason: `${field} must be a decimal or 0x-hex integer string; got ${JSON.stringify(value)}.`,
      };
    }
    return { ok: true, value: BigInt(trimmed) };
  }
  return {
    ok: false,
    code: "NOT_AN_INTEGER",
    reason: `${field} must be a bigint, a safe-integer number, or a decimal/0x-hex string; got ${value === null ? "null" : typeof value}.`,
  };
}

/**
 * Build a selector word from a runtime election and a template id.
 *
 * THE TEMPLATE HALF IS SILENTLY MASKED, EXACTLY AS THE SOLIDITY DOES.
 * `ArtSelectorLib.encode(3, 2**224)` equals `ArtSelectorLib.encode(3, 0)`, and so does this. That
 * is replicated rather than "improved": an encoder that refused where the chain masks would make
 * the two implementations disagree about a value the chain will accept, and the parity corpus
 * pins the masking case by name. If you want an oversized template id REFUSED, ask
 * {@link validateArtSelector} — refusal is a validation concern and is kept out of the codec.
 *
 * THE RUNTIME HALF IS REFUSED RATHER THAN MASKED, AND THAT IS THE ONE DELIBERATE DIVERGENCE.
 * Solidity's `encode` takes a `uint32`, so an oversized runtime id is unrepresentable at the call
 * site: there is no in-library behaviour to mirror, only a caller's explicit `uint32(x)` cast.
 * JavaScript has no such cast, so masking here would silently bind a DIFFERENT runtime — the
 * failure this whole file exists to make impossible. It throws.
 *
 * @param {bigint | number | string} artRuntimeId 0 for "no preference", else 1..2^32-1
 * @param {bigint | number | string} templateId the registered template id
 * @returns {bigint} the selector word
 */
export function encodeArtSelector(artRuntimeId, templateId) {
  const runtime = toIntegral(artRuntimeId, "artRuntimeId");
  if (!runtime.ok) throw new ArtSelectorError(runtime.code, runtime.reason);
  const template = toIntegral(templateId, "templateId");
  if (!template.ok) throw new ArtSelectorError(template.code, template.reason);

  if (runtime.value < 0n) {
    throw new ArtSelectorError("NEGATIVE", `artRuntimeId must not be negative; got ${runtime.value}.`);
  }
  if (template.value < 0n) {
    throw new ArtSelectorError("NEGATIVE", `templateId must not be negative; got ${template.value}.`);
  }
  if (runtime.value > ART_SELECTOR_MAX_RUNTIME_ID) {
    throw new ArtSelectorError(
      "RUNTIME_ID_OVERFLOW",
      `artRuntimeId ${runtime.value} exceeds the uint32 the registry keys by (${ART_SELECTOR_MAX_RUNTIME_ID}). Masking it here would bind a different runtime, permanently, so it is refused.`,
    );
  }

  return (runtime.value << ART_SELECTOR_RUNTIME_ID_SHIFT) | (template.value & ART_SELECTOR_TEMPLATE_ID_MASK);
}

/**
 * Split a selector word into its two halves.
 *
 * `artRuntimeId` comes back as a `number` because a `uint32` is exactly representable and every
 * consumer wants one; `templateId` comes back as a `bigint` because a `uint224` is not.
 *
 * @param {bigint | number | string} selector
 * @returns {{ artRuntimeId: number, templateId: bigint, selector: bigint }}
 */
export function decodeArtSelector(selector) {
  const word = toIntegral(selector, "selector");
  if (!word.ok) throw new ArtSelectorError(word.code, word.reason);
  if (word.value < 0n) {
    throw new ArtSelectorError("NEGATIVE", `selector must not be negative; got ${word.value}.`);
  }
  if (word.value > ART_SELECTOR_MAX) {
    throw new ArtSelectorError(
      "SELECTOR_OVERFLOW",
      `selector ${word.value} does not fit in a uint256. A word wider than the field it travels in is not a selector.`,
    );
  }
  return {
    artRuntimeId: Number(word.value >> ART_SELECTOR_RUNTIME_ID_SHIFT),
    templateId: word.value & ART_SELECTOR_TEMPLATE_ID_MASK,
    selector: word.value,
  };
}

/**
 * The registered-template half of a selector. Mirrors `ArtSelectorLib.templateIdOf`.
 * @param {bigint | number | string} selector
 */
export function templateIdOf(selector) {
  return decodeArtSelector(selector).templateId;
}

/**
 * The elected-art-runtime half of a selector. Mirrors `ArtSelectorLib.artRuntimeIdOf`.
 * `0` means "no preference" — never a runtime.
 * @param {bigint | number | string} selector
 */
export function artRuntimeIdOf(selector) {
  return decodeArtSelector(selector).artRuntimeId;
}

/**
 * Whether a runtime-half value NAMES a runtime.
 *
 * THE ONE PREDICATE THAT SEPARATES "no preference" FROM AN ELECTION. Zero is a legal selector half
 * and an ILLEGAL election: the registry reserves it, so no runtime can ever be registered under it
 * and a surface that treats a zero as a Wave-1 election is asserting a fact about a chain nobody
 * asked. Call this rather than testing `!== undefined` or `>= 0`.
 *
 * @param {unknown} artRuntimeId
 * @returns {boolean}
 */
export function isRuntimeElection(artRuntimeId) {
  const parsed = toIntegral(artRuntimeId, "artRuntimeId");
  if (!parsed.ok) return false;
  return parsed.value > 0n && parsed.value <= ART_SELECTOR_MAX_RUNTIME_ID;
}

/**
 * Check a selector, or the pair it would be built from, WITHOUT throwing.
 *
 * SEPARATE FROM THE CODEC ON PURPOSE. `encodeArtSelector` masks an oversized template id because
 * the chain does; this refuses one, because a creator who typed a template id that will be silently
 * truncated has not asked for template 0. Keeping the two apart is what lets the codec be
 * bit-faithful to deployed bytecode while the product still refuses nonsense.
 *
 * Accepts either shape:
 *   * a word — `validateArtSelector(0x03…n)`
 *   * a pair — `validateArtSelector({ artRuntimeId: 3, templateId: 7n })`
 *
 * @param {bigint | number | string | { artRuntimeId?: unknown, templateId?: unknown, selector?: unknown }} input
 * @param {{ requireRuntimeElection?: boolean, requireTemplate?: boolean }} [options]
 * @returns {{ ok: boolean, code: string, reason: string, artRuntimeId: number | null, templateId: bigint | null, selector: bigint | null }}
 */
export function validateArtSelector(input, options = {}) {
  const requireRuntimeElection = options.requireRuntimeElection === true;
  const requireTemplate = options.requireTemplate === true;

  const refuse = (code, reason) => ({ ok: false, code, reason, artRuntimeId: null, templateId: null, selector: null });

  /** @type {bigint} */ let runtime;
  /** @type {bigint} */ let template;
  /** @type {bigint} */ let selector;

  const isPair =
    input !== null &&
    typeof input === "object" &&
    ("artRuntimeId" in input || "templateId" in input || "selector" in input);

  if (isPair) {
    const obj = /** @type {{ artRuntimeId?: unknown, templateId?: unknown, selector?: unknown }} */ (input);
    const hasWord = obj.selector !== undefined;
    const hasHalves = obj.artRuntimeId !== undefined || obj.templateId !== undefined;
    if (hasWord && hasHalves) {
      return refuse(
        "BAD_INPUT",
        "validateArtSelector was given both a packed `selector` and its halves. Two statements of the same value are two chances to disagree; pass one.",
      );
    }
    if (hasWord) {
      const word = toIntegral(obj.selector, "selector");
      if (!word.ok) return refuse(word.code, word.reason);
      if (word.value < 0n) return refuse("NEGATIVE", `selector must not be negative; got ${word.value}.`);
      if (word.value > ART_SELECTOR_MAX) {
        return refuse("SELECTOR_OVERFLOW", `selector ${word.value} does not fit in a uint256.`);
      }
      selector = word.value;
      runtime = selector >> ART_SELECTOR_RUNTIME_ID_SHIFT;
      template = selector & ART_SELECTOR_TEMPLATE_ID_MASK;
    } else {
      const r = toIntegral(obj.artRuntimeId ?? 0, "artRuntimeId");
      if (!r.ok) return refuse(r.code, r.reason);
      const t = toIntegral(obj.templateId ?? 0, "templateId");
      if (!t.ok) return refuse(t.code, t.reason);
      if (r.value < 0n) return refuse("NEGATIVE", `artRuntimeId must not be negative; got ${r.value}.`);
      if (t.value < 0n) return refuse("NEGATIVE", `templateId must not be negative; got ${t.value}.`);
      if (r.value > ART_SELECTOR_MAX_RUNTIME_ID) {
        return refuse(
          "RUNTIME_ID_OVERFLOW",
          `artRuntimeId ${r.value} exceeds the uint32 the registry keys by (${ART_SELECTOR_MAX_RUNTIME_ID}).`,
        );
      }
      // REFUSED HERE, MASKED IN THE CODEC. See the note on `encodeArtSelector`.
      if (t.value > ART_SELECTOR_MAX_TEMPLATE_ID) {
        return refuse(
          "TEMPLATE_ID_OVERFLOW",
          `templateId ${t.value} exceeds the ${ART_SELECTOR_RUNTIME_ID_SHIFT}-bit template half (max ${ART_SELECTOR_MAX_TEMPLATE_ID}). Encoding it would silently truncate into the runtime half, which TemplateRegistryV1 refuses to register precisely so that cannot happen.`,
        );
      }
      runtime = r.value;
      template = t.value;
      selector = (runtime << ART_SELECTOR_RUNTIME_ID_SHIFT) | template;
    }
  } else {
    const word = toIntegral(input, "selector");
    if (!word.ok) return refuse(word.code, word.reason);
    if (word.value < 0n) return refuse("NEGATIVE", `selector must not be negative; got ${word.value}.`);
    if (word.value > ART_SELECTOR_MAX) {
      return refuse("SELECTOR_OVERFLOW", `selector ${word.value} does not fit in a uint256.`);
    }
    selector = word.value;
    runtime = selector >> ART_SELECTOR_RUNTIME_ID_SHIFT;
    template = selector & ART_SELECTOR_TEMPLATE_ID_MASK;
  }

  const resolved = {
    artRuntimeId: Number(runtime),
    templateId: template,
    selector,
  };

  if (requireRuntimeElection && runtime === 0n) {
    return {
      ...resolved,
      ok: false,
      code: "NO_RUNTIME_ELECTION",
      reason:
        "the runtime half is 0, which means the creator expressed NO PREFERENCE and the chain's generic runtime will be bound. Zero is the art registry's reserved sentinel and can never name a runtime, so it cannot represent an election.",
    };
  }

  if (requireTemplate && template === 0n) {
    return {
      ...resolved,
      ok: false,
      code: "NO_TEMPLATE",
      reason:
        "the template half is 0, the registry's reserved no-template sentinel. `TemplateRegistryV1.registerTemplate` refuses it and `LaunchPolicyV1.validateLaunchParams` reverts `BadTemplate`, so a launch carrying it cannot succeed.",
    };
  }

  return { ...resolved, ok: true, code: "OK", reason: "" };
}
