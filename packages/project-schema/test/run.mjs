// SPDX-License-Identifier: MIT
// The kit's test suite. Dependency-free: `node --test` is not used so the suite runs identically
// on any Node 20+, and the whole thing is one process with one summary.
//
//   node packages/project-schema/test/run.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  writeContainer,
  readContainer,
  canonicalJson,
  safeJsonParse,
  sha256Utf8,
  utf8,
  fromUtf8,
  normalizeEntryPath,
  checkEntryPolicy,
  validateBundleBytes,
  validateBundle,
  validateManifest,
  validateTraitSchema,
  validateMarketMappings,
  validateCollectionMetadata,
  analyzeGeneratorSource,
  scanTextForSecrets,
  inspectRenderOutput,
  applyTransform,
  deriveTraits,
  toStudioDraft,
  computeBundleHash,
  isSchemaCompatible,
  stripComments,
  buildRenderContext,
  LIMITS,
  REFUSED_MANIFEST_KEYS,
} from "../index.js";
import { createVmModule, renderSeedsIsolated, makeReplayEvaluator, toRunnableScript } from "../../creator-cli/src/sandbox.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "../fixtures");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, contains, message) {
  let threw = null;
  try {
    fn();
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  assert(threw !== null, `${message}: nothing was thrown`);
  if (contains) assert(threw.toLowerCase().includes(contains.toLowerCase()), `${message}: expected "${contains}", got "${threw}"`);
}

// ---------------------------------------------------------------- canonical json + hashing

test("canonicalJson sorts keys and ignores insertion order", () => {
  assert(canonicalJson({ b: 1, a: 2 }) === '{"a":2,"b":1}', "keys are not sorted");
  assert(canonicalJson({ a: 2, b: 1 }) === canonicalJson({ b: 1, a: 2 }), "insertion order changed the output");
});

test("canonicalJson refuses values with no canonical form", () => {
  assertThrows(() => canonicalJson({ x: NaN }), "non-finite", "NaN was serialized");
  assertThrows(() => canonicalJson({ x: 1n }), "bigint", "bigint was serialized");
  assertThrows(() => canonicalJson({ x: () => {} }), "function", "a function was serialized");
});

test("safeJsonParse drops prototype-polluting keys", () => {
  const parsed = safeJsonParse('{"__proto__":{"polluted":true},"constructor":{"x":1},"ok":1}');
  assert(parsed.ok === 1, "the safe key was lost");
  assert(!("__proto__" in parsed) || parsed.__proto__ === undefined, "__proto__ survived");
  assert({}.polluted === undefined, "Object.prototype was polluted");
  assert(Object.getPrototypeOf(parsed) === null, "the parsed object kept a prototype");
});

test("safeJsonParse bounds depth and node count", () => {
  const deep = "[".repeat(80) + "]".repeat(80);
  assertThrows(() => safeJsonParse(deep), "", "an 80-deep document was accepted");
  assertThrows(() => safeJsonParse("{", {}), "malformed", "malformed JSON was accepted");
});

test("sha256 matches the published vectors", () => {
  assert(sha256Utf8("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "empty-string digest is wrong");
  assert(sha256Utf8("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "abc digest is wrong");
});

test("bundleHash is a pure function of its two inputs", () => {
  const a = computeBundleHash("a".repeat(64), "b".repeat(64));
  const b = computeBundleHash("a".repeat(64), "b".repeat(64));
  const c = computeBundleHash("a".repeat(64), "c".repeat(64));
  assert(a === b, "the same inputs gave different hashes");
  assert(a !== c, "different content gave the same hash");
});

test("schema compatibility follows major/minor", () => {
  assert(isSchemaCompatible("1.0.0", "1.0.0"), "identical versions are incompatible");
  assert(isSchemaCompatible("1.0.0", "1.4.0"), "an older minor is not readable by a newer importer");
  assert(!isSchemaCompatible("1.5.0", "1.0.0"), "a newer minor was accepted by an older importer");
  assert(!isSchemaCompatible("2.0.0", "1.0.0"), "a different major was accepted");
});

// ---------------------------------------------------------------- container

test("writeContainer is byte-deterministic regardless of input order", () => {
  const a = writeContainer([
    { path: "b.json", bytes: utf8("{}") },
    { path: "a/c.js", bytes: utf8("x") },
  ]);
  const b = writeContainer([
    { path: "a/c.js", bytes: utf8("x") },
    { path: "b.json", bytes: utf8("{}") },
  ]);
  assert(Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0, "entry order changed the container bytes");
});

test("readContainer round-trips what writeContainer wrote", () => {
  const bytes = writeContainer([{ path: "a.json", bytes: utf8('{"x":1}') }]);
  const read = readContainer(bytes);
  assert(read.entries.length === 1, "entry count changed");
  assert(fromUtf8(read.byPath.get("a.json")) === '{"x":1}', "content changed");
});

test("normalizeEntryPath refuses every path-confusion shape", () => {
  const hostile = ["../x", "/x", "a/../b", "a//b", ".hidden", "a\\b", "con.txt", "a/b/c/d/e/f/g", "x ", "café.png"];
  for (const path of hostile) assertThrows(() => normalizeEntryPath(path), "", `"${path}" was accepted`);
  assert(normalizeEntryPath("generator/generate.js") === "generator/generate.js", "a good path was rejected");
});

test("checkEntryPolicy refuses contract code and executables everywhere", () => {
  for (const path of ["generator/Hook.sol", "assets/x.wasm", "assets/run.sh", "generator/x.py", "assets/id.pem"]) {
    const policy = checkEntryPolicy(path);
    assert(policy.ok === false, `${path} was allowed`);
  }
  assert(checkEntryPolicy("generator/generate.js").ok === true, "a legitimate generator path was refused");
  assert(checkEntryPolicy("LICENSE").ok === true, "LICENSE was refused");
});

// ---------------------------------------------------------------- documents

test("the manifest schema is closed", () => {
  const issues = validateManifest({ schemaVersion: "1.0.0", surprise: true });
  assert(
    issues.some((i) => i.code === "MANIFEST_UNKNOWN_KEY"),
    "an unknown top-level key was accepted",
  );
});

test("every refused manifest key is reported with its own explanation", () => {
  for (const key of Object.keys(REFUSED_MANIFEST_KEYS)) {
    const issues = validateManifest({ [key]: "anything" });
    assert(
      issues.some((i) => i.code === "MANIFEST_REFUSED_KEY" && i.where.includes(key)),
      `"${key}" was not specifically refused`,
    );
  }
});

test("trait schema bounds are enforced", () => {
  const tooMany = { version: 1, dimensions: Array.from({ length: LIMITS.maxTraitDimensions + 1 }, (_, i) => ({ name: `D${i}`, distribution: "uniform", values: [{ name: "A" }] })) };
  assert(
    validateTraitSchema(tooMany).some((i) => i.code === "TRAITS_DIMENSION_COUNT"),
    "the dimension cap was not enforced",
  );
  const duplicate = { version: 1, dimensions: [{ name: "P", distribution: "uniform", values: [{ name: "A" }, { name: "a" }] }] };
  assert(
    validateTraitSchema(duplicate).some((i) => i.code === "TRAITS_VALUE_DUP"),
    "a duplicate value name was accepted",
  );
});

test("market mapping parameters are clamped to published bounds", () => {
  const issues = validateMarketMappings({ version: 1, mappings: [{ id: "x", sensor: "volatility", transform: "clamp", transformParams: { min: -9, max: 900 }, destination: "fracture" }] });
  assert(
    issues.filter((i) => i.code === "MARKET_PARAM_BOUNDS").length === 2,
    "out-of-range transform parameters were accepted",
  );
});

test("every transform output lands inside [0,1]", () => {
  const mappings = [
    { transform: "threshold", transformParams: { cutoff: 0 } },
    { transform: "range", transformParams: { inMin: -1, inMax: 1 } },
    { transform: "clamp", transformParams: { min: 0, max: 1 } },
    { transform: "smoothing", transformParams: { window: 8 } },
    { transform: "tier", transformParams: { steps: 5 } },
    { transform: "accumulation", transformParams: { cap: 1 } },
    { transform: "decay", transformParams: { halfLife: 4 } },
    { transform: "inverse", transformParams: {} },
    { transform: "weighted_mix", transformParams: { weight: 0.5 } },
  ];
  for (const mapping of mappings) {
    for (const reading of [-5, -1, -0.3, 0, 0.7, 1, 5, NaN, Infinity]) {
      const value = applyTransform(mapping, reading, { previous: 0.5, current: 0.5 });
      assert(Number.isFinite(value) && value >= 0 && value <= 1, `${mapping.transform} produced ${value} for ${reading}`);
    }
  }
});

test("collection metadata refuses remote image URLs", () => {
  const issues = validateCollectionMetadata({ version: 1, name: "X", symbol: "X", description: "d", image: "https://cdn.example.com/x.png" });
  assert(
    issues.some((i) => i.code === "METADATA_IMAGE_PATH"),
    "a remote image URL was accepted",
  );
});

// ---------------------------------------------------------------- static analysis

test("stripComments removes comments but keeps string contents", () => {
  const stripped = stripComments('const a = 1; // fetch\n/* fetch */ const b = "fetch";');
  assert(!stripped.includes("// fetch"), "a line comment survived");
  assert(stripped.includes('"fetch"'), "a string literal was stripped");
});

test("generator static analysis catches the whole forbidden set", () => {
  const cases = [
    ["fetch('x')", "GEN_FORBIDDEN_IDENTIFIER"],
    ["Math.random()", "GEN_NONDETERMINISM"],
    ["new Date()", "GEN_FORBIDDEN_IDENTIFIER"],
    ["import('./x.js')", "GEN_DYNAMIC_IMPORT"],
    ["while (true) {}", "GEN_INFINITE_LOOP"],
    ["const x = 'https://evil.example.com'", "GEN_EXTERNAL_URL"],
    ["import x from 'lodash'", "GEN_DEPENDENCY_REFUSED"],
    ["const c = ctx.constructor", "GEN_PROTOTYPE_ACCESS"],
    ["async function render() {}", "GEN_ASYNC"],
  ];
  for (const [source, code] of cases) {
    const issues = analyzeGeneratorSource("generator/generate.js", source);
    assert(
      issues.some((i) => i.code === code),
      `${JSON.stringify(source)} did not raise ${code}`,
    );
  }
});

test("the W3C namespace declaration is not treated as an external URL", () => {
  const source = 'export function render(c) { return `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`; }';
  const issues = analyzeGeneratorSource("generator/generate.js", source, { entry: true });
  assert(!issues.some((i) => i.code === "GEN_EXTERNAL_URL"), "the SVG namespace was flagged as a network reference");
});

test("the secret scan catches key material without tripping on prose", () => {
  // Assembled from fragments on purpose. A literal 64-hex string next to a key-shaped field name
  // would trip this repository's OWN secret scan, and a negative-test corpus that has to be
  // allowlisted teaches the scanner to look away.
  const fakeKey = `0x${"4c0883a69102937d6231471b5dbb6204"}${"fe5129617082792ae468d01a3f362318"}`;
  const fakeRpc = `https://eth-mainnet.alchemy.com/v2/${"aBcDeFgHiJkLmNoPqRsTuVwXyZ123456"}`;
  const hits = [`const privateKey = '${fakeKey}'`, "-----BEGIN PRIVATE KEY-----", fakeRpc, `AKIA${"IOSFODNN7EXAMPLE"}`];
  for (const text of hits) assert(scanTextForSecrets("x.json", text).length > 0, `missed: ${text.slice(0, 40)}`);

  const prose = "A minimal generative collection of concentric rings around a single core with the palette chosen by the seed of the token itself and nothing else at all.";
  assert(scanTextForSecrets("README.md", prose).length === 0, "ordinary prose was reported as a secret");
});

test("SVG inspection refuses documents that execute or fetch", () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/><circle cx="5" cy="5" r="2"/>';
  const cases = [
    [`${base}<script>x()</script></svg>`, "SVG_SCRIPT"],
    [`${base}<foreignObject><p>x</p></foreignObject></svg>`, "SVG_FOREIGN_OBJECT"],
    [`${base}<rect onload="x()"/></svg>`, "SVG_EVENT_HANDLER"],
    [`${base}<image href="https://evil.example.com/x.png"/></svg>`, "SVG_EXTERNAL_REFERENCE"],
    ['<!DOCTYPE svg [<!ENTITY a "b">]><svg xmlns="http://www.w3.org/2000/svg"><rect/><circle/></svg>', "SVG_DOCTYPE"],
  ];
  for (const [svg, code] of cases) {
    const issues = inspectRenderOutput("t", svg);
    assert(
      issues.some((i) => i.code === code),
      `${code} was not raised`,
    );
  }
  assert(inspectRenderOutput("t", `${base}</svg>`).filter((i) => i.severity === "error").length === 0, "a clean SVG was rejected");
});

test("blank and non-string outputs are refused", () => {
  assert(inspectRenderOutput("t", "").some((i) => i.code === "RENDER_BLANK"), "an empty string passed");
  assert(inspectRenderOutput("t", null).some((i) => i.code === "RENDER_OUTPUT_TYPE"), "null passed");
  assert(inspectRenderOutput("t", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><title>nothing at all here</title></svg>').some((i) => i.code === "RENDER_BLANK"), "an SVG with no drawable elements passed");
});

// ---------------------------------------------------------------- sandbox

test("the sandbox realm has no ambient capabilities", () => {
  const probes = [
    ["typeof fetch", "undefined"],
    ["typeof process", "undefined"],
    ["typeof Date", "undefined"],
    ["typeof globalThis", "undefined"],
    ["typeof WebAssembly", "undefined"],
    ["typeof Worker", "undefined"],
  ];
  for (const [expression, expected] of probes) {
    const source = `export function render(c) { return "<svg><!--" + (${expression}) + "-->"; }`;
    const module = createVmModule(new Map([["generator/generate.js", source]]));
    const out = module.render({ seed: "1" });
    assert(String(out).includes(expected), `${expression} was not ${expected} in the sandbox`);
  }
});

test("Math.random throws inside the sandbox", () => {
  const source = 'export function render(c) { return "<svg>" + Math.random() + "</svg>"; }';
  const module = createVmModule(new Map([["generator/generate.js", source]]));
  assertThrows(() => module.render({ seed: "1" }), "not available", "Math.random was callable");
});

test("the render context is realm-native, so its constructor chain cannot escape", () => {
  const source = 'export function render(c) { return "<svg>" + (c.constructor === Object) + "</svg>"; }';
  const module = createVmModule(new Map([["generator/generate.js", source]]));
  const out = module.render({ seed: "1" });
  assert(String(out).includes("true"), "the context object came from the host realm");
});

test("code generation from strings is disabled in the sandbox", () => {
  const source = 'export function render(c) { const F = c.constructor.constructor; return "<svg>" + F("return 1")() + "</svg>"; }';
  const module = createVmModule(new Map([["generator/generate.js", source]]));
  assertThrows(() => module.render({ seed: "1" }), "", "Function('...') executed inside the sandbox");
});

test("a runaway loop is stopped by the render timeout", () => {
  const source = 'export function render(c) { for (let i = 0; i > -1; i++) {} return "<svg/>"; }';
  const module = createVmModule(new Map([["generator/generate.js", source]]), "generator/generate.js", { timeoutMs: 300 });
  assertThrows(() => module.render({ seed: "1" }), "", "an infinite loop ran to completion");
});

test("toRunnableScript strips export without touching the body", () => {
  const runnable = toRunnableScript("export const manifest = { a: 1 };\nexport function render(c) { return 'x'; }\n");
  assert(runnable.includes("const manifest"), "an exported const was lost");
  assert(runnable.includes("function render"), "the render function was lost");
  assert(!/^\s*export\s/m.test(runnable.split("__buildContext")[1] ?? ""), "an export keyword survived");
});

test("the isolated backend survives a memory bomb", () => {
  const source = "export function render(c) { const h = []; for (let i = 0; i < 100000000; i++) { h.push(new Array(1000).fill(i)); } return '<svg/>'; }";
  const recorded = renderSeedsIsolated({ sources: new Map([["generator/generate.js", source]]), seeds: ["1"], heapMb: 64, timeoutMs: 20000 });
  assert(recorded.ok === false, "the memory bomb was reported as a success");
});

// ---------------------------------------------------------------- fixtures

const parityExpected = JSON.parse(readFileSync(join(FIXTURES, "parity/expected.json"), "utf8"));

for (const expected of parityExpected.bundles) {
  test(`parity fixture ${expected.file} reproduces every hash`, () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, "parity", expected.file)));
    const result = validateBundleBytes(bytes, { skipExecution: true });
    assert(result.ok, `the fixture does not validate: ${result.issues.map((i) => i.code).join(", ")}`);
    assert(result.hashes.bundleHash === expected.integrity.bundleHash, "bundleHash drifted");
    assert(result.hashes.projectConfigHash === expected.integrity.projectConfigHash, "projectConfigHash drifted");
    assert(result.hashes.contentHash === expected.integrity.contentHash, "contentHash drifted");
    for (const key of ["script", "generator", "traitSchema", "marketMapping", "metadata"]) {
      assert(result.manifest.hashes[key] === expected.hashes[key], `${key} hash drifted`);
    }
  });

  test(`parity fixture ${expected.file} projects onto the same studio draft`, () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, "parity", expected.file)));
    const container = readContainer(bytes);
    const result = validateBundleBytes(bytes, { skipExecution: true });
    const projection = toStudioDraft(result, container.byPath, { draftId: expected.studioDraft.id, updatedAt: 0 });
    assert(canonicalJson(projection.draft) === canonicalJson(expected.studioDraft), "the studio draft projection drifted");
    assert(canonicalJson(projection.provenance) === canonicalJson(expected.provenance), "the provenance block drifted");
  });

  test(`parity fixture ${expected.file} renders the recorded outputs`, () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, "parity", expected.file)));
    const container = readContainer(bytes);
    const result = validateBundleBytes(bytes, { skipExecution: true });
    const source = fromUtf8(container.byPath.get("generator/generate.js"));
    const module = createVmModule(new Map([["generator/generate.js", source]]));
    for (const [seed, record] of Object.entries(expected.representativeOutputs)) {
      const svg = module.render(buildContextFor(result, seed));
      assert(sha256Utf8(svg) === record.sha256, `seed ${seed} rendered different art`);
    }
  });
}

function buildContextFor(result, seed) {
  return buildRenderContext({ manifest: result.manifest, marketDocument: result.marketMappings, seed });
}

const hostileExpectations = JSON.parse(readFileSync(join(FIXTURES, "hostile/expectations.json"), "utf8"));

for (const fixture of hostileExpectations.fixtures) {
  test(`hostile fixture ${fixture.file} is refused (${fixture.attack})`, () => {
    const path = join(FIXTURES, "hostile", fixture.file);
    assert(existsSync(path), "the fixture file is missing");
    const bytes = new Uint8Array(readFileSync(path));

    if (fixture.refusedBy === "container") {
      assertThrows(() => readContainer(bytes), fixture.expect.errorContains, "the container was accepted");
      if (fixture.expect.errorContainsAny) {
        let message = "";
        try {
          readContainer(bytes);
        } catch (err) {
          message = err.message;
        }
        assert(
          fixture.expect.errorContainsAny.some((needle) => message.includes(needle)),
          `unexpected refusal reason: ${message}`,
        );
      }
      return;
    }

    const result = fixture.requiresExecution ? validateWithSandbox(bytes) : validateBundleBytes(bytes, { skipExecution: true });
    assert(result.ok === false, "the bundle validated cleanly");
    if (fixture.expect.checkFails) {
      const check = result.checks.find((c) => c.id === fixture.expect.checkFails);
      assert(check && check.status === "fail", `${fixture.expect.checkFails} did not fail (status ${check?.status})`);
    }
    if (fixture.expect.codes) {
      const seen = new Set(result.issues.map((i) => i.code));
      assert(
        fixture.expect.codes.some((code) => seen.has(code)),
        `none of ${fixture.expect.codes.join("/")} were reported; got ${[...seen].join(", ")}`,
      );
    }
  });
}

function validateWithSandbox(bytes) {
  const container = readContainer(bytes);
  const structural = validateBundleBytes(bytes, { skipExecution: true });
  const sources = new Map();
  for (const [path, content] of container.byPath) {
    if (path.startsWith("generator/") && path.endsWith(".js")) sources.set(path, fromUtf8(content));
  }
  const seeds = ["1", "2", "3", "4"];
  const recorded = renderSeedsIsolated({ sources, seeds, manifest: structural.manifest, marketDocument: structural.marketMappings, heapMb: 96, timeoutMs: 25000 });
  if (!recorded.ok) {
    const result = validateBundleBytes(bytes, { skipExecution: true });
    result.ok = false;
    result.issues.push({ severity: "error", code: "SANDBOX_FAILED", where: "generator/generate.js", message: recorded.error });
    for (const check of result.checks) {
      if (["RUNTIME_ERRORS", "BLANK_OUTPUTS", "DETERMINISTIC_OUTPUT", "DUPLICATE_RATE"].includes(check.id)) check.status = "fail";
    }
    return result;
  }
  return validateBundle(container.byPath, { evaluate: makeReplayEvaluator(recorded), seeds: seeds.length });
}

// ---------------------------------------------------------------- summary

console.log("");
if (failures.length > 0) {
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  console.log("");
}
console.log(`  ${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
