// SPDX-License-Identifier: MIT
//
// THE PREVIEW-DRIFT CHECK, in both directions and in the direction nobody thinks about.
//
// The `solidity-svg-params` template told a creator that `relics validate` would catch a drift
// between the preview sketch and `generator/params.json`. It did not, in either direction, and
// `SOLIDITY_SVG` is the one runtime a launch actually binds — so a creator could approve previews
// showing one artwork and launch a different one with every check green.
//
// These tests run against the SHIPPED TEMPLATE FILES rather than a hand-built fixture. A fixture
// would keep passing after someone restructured the template, which is exactly the change that
// would silently switch the check off.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkPreviewDrift, extractMirroredConfig, MIRRORED_CONFIG_NAME } from "../src/preview-drift.js";

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "solidity-svg-params");

const bytes = (s) => new TextEncoder().encode(s);
const SKETCH = readFileSync(join(TEMPLATE, "generator", "generate.js"), "utf8");
const PARAMS = readFileSync(join(TEMPLATE, "generator", "params.json"), "utf8");

/** The shipped template, as a project file map. */
function shippedFiles({ sketch = SKETCH, params = PARAMS } = {}) {
  return new Map([
    ["generator/generate.js", bytes(sketch)],
    ["generator/params.json", bytes(params)],
  ]);
}

const codes = (files) => checkPreviewDrift(files).map((i) => i.code);

test("the shipped template is in step with itself", () => {
  assert.deepEqual(codes(shippedFiles()), [], "the template ships a drift between its own sketch and its own params");
});

test("a drifted SKETCH is refused, naming the field and both values", () => {
  // The exact mutation the review used: a palette entry and a layer amount, both legal on their own.
  const sketch = SKETCH.replace('"#c9a227"', '"#22ff88"');
  assert.notEqual(sketch, SKETCH, "the mutation did not apply — the template's palette moved");
  const issues = checkPreviewDrift(shippedFiles({ sketch }));
  assert.equal(issues.length, 1, `expected one finding, got ${issues.map((i) => i.code).join(", ")}`);
  assert.equal(issues[0].code, "ART_PREVIEW_DRIFT");
  assert.equal(issues[0].severity, "error", "a drift that changes the launched art must not be a warning");
  assert.match(issues[0].message, /#22ff88/, "the finding does not quote the sketch value");
  assert.match(issues[0].message, /#c9a227/, "the finding does not quote the launched value");
  assert.match(issues[0].message, /params\.json is the art/, "the finding does not say which file wins");
});

test("a drifted PARAMS file is refused too — the check is symmetric", () => {
  // In-bounds on the ACV1 side, so the bounds checks (ART_BINDING_CONFIG / ERR_LAYER_AMOUNT) stay
  // silent. A bounds check is not a drift check, and this is the direction that proves it.
  const params = PARAMS.replace('"#c9a227"', '"#22ff88"');
  assert.notEqual(params, PARAMS, "the mutation did not apply");
  const issues = checkPreviewDrift(shippedFiles({ params }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "ART_PREVIEW_DRIFT");
});

test("a layer amount that drifts inside the legal range is still caught", () => {
  const sketch = SKETCH.replace("amountMax: 18", "amountMax: 12");
  assert.notEqual(sketch, SKETCH, "the mutation did not apply");
  const issues = checkPreviewDrift(shippedFiles({ sketch }));
  assert.equal(issues.length, 1);
  assert.match(issues[0].where, /layers\[0\]\.amountMax/, `the finding does not locate the layer: ${issues[0].where}`);
});

test("keys only params.json carries are not treated as drift", () => {
  // `version`, `format` and `traits` are ACV1 fields the sketch has no business mirroring. If the
  // comparison walked them, the shipped template would fail — which is the first test above, but
  // this asserts the REASON rather than the symptom.
  const params = JSON.parse(PARAMS);
  assert.ok("traits" in params && "format" in params, "the template's params no longer carry the fields this exempts");
  const sketchOnly = extractMirroredConfig(SKETCH);
  assert.ok(sketchOnly.ok, `the shipped sketch's ${MIRRORED_CONFIG_NAME} could not be read: ${sketchOnly.ok ? "" : sketchOnly.reason}`);
  for (const key of ["version", "format", "traits"]) {
    assert.ok(!(key in sketchOnly.value), `the sketch mirrors ${key}, so this exemption now hides a real comparison`);
  }
});

test("a check that CANNOT run reports that, rather than passing", () => {
  // The failure mode this repository keeps hitting: no output read as no problem.
  // Anchored at the start of a line, so this renames the DECLARATION and not the mention of it in
  // the template's own comment — which is also why the extractor anchors its own match that way.
  const renamed = SKETCH.replace(new RegExp(`\\nconst ${MIRRORED_CONFIG_NAME}\\s*=`), "\nconst SETTINGS =");
  assert.notEqual(renamed, SKETCH, "the rename did not apply");
  const issues = checkPreviewDrift(shippedFiles({ sketch: renamed }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "ART_PREVIEW_UNCHECKED");
  assert.match(issues[0].message, /cannot be compared|no `const CONFIG/, "the finding does not say the comparison did not happen");
});

test("a project with no params.json has one source of truth and is left alone", () => {
  const files = new Map([["generator/generate.js", bytes("export function render() {}")]]);
  assert.deepEqual(codes(files), [], "a JavaScript-runtime project was given a drift finding it cannot have");
});

test("the mirrored constant is read as data, not executed with a scope", () => {
  const hostile = "const CONFIG = { title: (() => { throw new Error('boom'); })() };\n";
  const result = extractMirroredConfig(hostile);
  assert.equal(result.ok, false, "a literal that needs to run arbitrary code was accepted as a mirrored constant");
});
