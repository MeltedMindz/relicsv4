// SPDX-License-Identifier: MIT
//
// THE PREVIEW-DRIFT CHECK — does the sketch you looked at still describe the art you will launch?
//
// WHY THIS EXISTS
//
// The `solidity-svg-params` template ships two declarations of the same configuration:
// `generator/params.json`, which IS the art (the ACV1 bytes the on-chain runtime is given), and a
// `CONFIG` constant inside `generator/generate.js`, which is a local sketch so a creator can choose
// values with their eyes. The sketch's comment told the creator that `relics validate` would catch
// a drift between the two.
//
// It did not. Nothing anywhere compared them, in either direction — measured both ways:
//
//   * edit the sketch's palette and ring counts, leave params.json alone  -> validate exit 0
//   * edit params.json within the ACV1 bounds, leave the sketch alone     -> validate exit 0
//
// The three hashes that touch generator source are all re-derived from the same bytes they are
// compared against, so none of them can see a semantic disagreement between two files that both
// changed legally. `SOLIDITY_SVG` is the one runtime a launch actually binds, so the consequence
// was specific and serious: a creator could approve previews showing one artwork and launch a
// different one, with every check green.
//
// WHAT THIS CHECKS, EXACTLY
//
// The keys the two declarations share: `title`, `animate`, `background`, `palette`, and every
// field of every entry in `layers`. `params.json` is authoritative in every comparison, because
// it is the art; the sketch is what has drifted.
//
// WHAT IT DOES NOT CHECK. It does not verify that the sketch DRAWS what the configuration means —
// that is a picture, not a value, and the template says plainly that the sketch does not match the
// on-chain output pixel for pixel. It checks that the two written declarations agree.
//
// AND IT NEVER PASSES BY DEFAULT. If the project has params but the sketch's mirrored constant
// cannot be found or read, that is reported as its own finding rather than skipped. A check that
// silently does nothing when its input is missing is the failure mode this whole repository keeps
// tripping over.

import { runInNewContext } from "node:vm";

/** The bytes of a project file, decoded, or null. @param {Map<string, Uint8Array>} files */
function text(files, path) {
  const bytes = files.get(path);
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The name of the sketch constant that mirrors `params.json`.
 *
 * A single declared name rather than a search: the check has to be able to say "I looked for this
 * and it was not there", and a heuristic that finds *some* object literal would report drift
 * against whatever it happened to find.
 */
export const MIRRORED_CONFIG_NAME = "CONFIG";

/**
 * Extract the `const CONFIG = { … };` literal from generator source and evaluate it.
 *
 * Brace-matched rather than regex-captured, because the literal is nested and a regex would stop
 * at the first `}`. Evaluated in an empty `node:vm` context with a short timeout: the value is
 * data, the file is about to be executed in the render sandbox anyway, and an object literal that
 * needs a scope to evaluate is not a mirrored constant.
 *
 * @param {string} source
 * @returns {{ ok: true, value: any } | { ok: false, reason: string }}
 */
export function extractMirroredConfig(source) {
  const declaration = new RegExp(`(?:^|\\n)\\s*(?:const|let|var)\\s+${MIRRORED_CONFIG_NAME}\\s*=\\s*\\{`);
  const match = declaration.exec(source);
  if (!match) return { ok: false, reason: `no \`const ${MIRRORED_CONFIG_NAME} = { … }\` declaration was found in generator/generate.js` };

  const open = source.indexOf("{", match.index);
  let depth = 0;
  let end = -1;
  let inString = null;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") inString = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return { ok: false, reason: `the \`${MIRRORED_CONFIG_NAME}\` object literal in generator/generate.js is not brace-balanced` };

  try {
    const value = runInNewContext(`(${source.slice(open, end + 1)})`, Object.create(null), { timeout: 200 });
    if (value === null || typeof value !== "object") return { ok: false, reason: `\`${MIRRORED_CONFIG_NAME}\` did not evaluate to an object` };
    return { ok: true, value };
  } catch (err) {
    return { ok: false, reason: `\`${MIRRORED_CONFIG_NAME}\` could not be read as plain data (${err instanceof Error ? err.message : String(err)})` };
  }
}

const show = (v) => (typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v));

/** Deep structural comparison, reporting the FIRST differing path rather than a boolean. */
function firstDifference(sketch, params, path) {
  if (Array.isArray(params) || Array.isArray(sketch)) {
    if (!Array.isArray(sketch) || !Array.isArray(params)) return { path, sketch, params };
    if (sketch.length !== params.length) return { path: `${path}.length`, sketch: sketch.length, params: params.length };
    for (let i = 0; i < params.length; i += 1) {
      const diff = firstDifference(sketch[i], params[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (params !== null && typeof params === "object" && sketch !== null && typeof sketch === "object") {
    for (const key of Object.keys(params)) {
      // Only keys the sketch also declares. `params.json` legitimately carries `version`, `format`
      // and `traits`, which the sketch has no business mirroring.
      if (!Object.hasOwn(sketch, key)) continue;
      const diff = firstDifference(sketch[key], params[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }
  return sketch === params ? null : { path, sketch, params };
}

/**
 * @param {Map<string, Uint8Array>} files a project's path -> bytes
 * @returns {{severity:"error"|"warning", code:string, where:string, message:string}[]}
 */
export function checkPreviewDrift(files) {
  const paramsText = text(files, "generator/params.json");
  // No params file means no second declaration to drift from: a JavaScript-runtime project has one
  // source of truth by construction, and this check has nothing to say about it.
  if (paramsText === null) return [];

  const sourceText = text(files, "generator/generate.js");
  if (sourceText === null) {
    return [
      {
        severity: "error",
        code: "ART_PREVIEW_UNCHECKED",
        where: "generator/generate.js",
        message:
          "generator/params.json is present but generator/generate.js could not be read as UTF-8, so the preview sketch could not be compared against the configuration that is actually launched.",
      },
    ];
  }

  let params;
  try {
    params = JSON.parse(paramsText);
  } catch (err) {
    // The schema reports the malformed JSON itself; this only says why the drift check stood down.
    return [
      {
        severity: "warning",
        code: "ART_PREVIEW_UNCHECKED",
        where: "generator/params.json",
        message: `generator/params.json is not valid JSON (${err instanceof Error ? err.message : String(err)}), so the preview sketch could not be compared against it. Fix the JSON and re-run; this check is not a substitute for the schema's own parse.`,
      },
    ];
  }

  const extracted = extractMirroredConfig(sourceText);
  if (!extracted.ok) {
    return [
      {
        severity: "warning",
        code: "ART_PREVIEW_UNCHECKED",
        where: "generator/generate.js",
        message:
          `${extracted.reason}. This project carries generator/params.json, which IS the art, and a local sketch that draws it — but the two cannot be compared, so nothing here can tell you whether the preview you approved still describes what you would launch. ` +
          `Keep the mirrored values in a single \`const ${MIRRORED_CONFIG_NAME} = { … }\` object literal to restore the comparison, or read the previews as decorative and verify generator/params.json by hand.`,
      },
    ];
  }

  const diff = firstDifference(extracted.value, params, MIRRORED_CONFIG_NAME);
  if (!diff) return [];

  return [
    {
      severity: "error",
      code: "ART_PREVIEW_DRIFT",
      where: `generator/generate.js#${diff.path}`,
      message:
        `The preview sketch and the launched configuration disagree at \`${diff.path}\`: the sketch says ${show(diff.sketch)} and generator/params.json says ${show(diff.params)}. ` +
        `generator/params.json is the art — it is what the on-chain runtime is given — so the picture you have been previewing is not the picture this bundle launches. ` +
        `Change the sketch to match generator/params.json, or change generator/params.json if the sketch is what you meant.`,
    },
  ];
}
