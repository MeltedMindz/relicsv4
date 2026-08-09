// SPDX-License-Identifier: MIT
// The bundle validator. Pure with respect to the host: no filesystem, no network, no `node:` APIs
// — so the same function runs in a server route, in a browser worker, and in the CLI.
//
// Executing a creator's generator is the one thing this module cannot do by itself, because
// isolation is a host concern (a `node:vm` context in the CLI, a worker in a browser). The host
// passes an `evaluate` capability; without it the execution checks report `skipped` rather than
// pretending to have run. The CLI never lets `export` proceed on a skipped execution check.

import { readContainer } from "./container.js";
import { checkEntryPolicy, roleOf } from "./paths.js";
import { LIMITS, REQUIRED_ENTRIES } from "./limits.js";
import { parseAndHashJson, computeIntegrity, hashesUnder, fileHash, isSha256Hex, jsonHash } from "./hashes.js";
import { validateManifest } from "./manifest.js";
import { validateTraitSchema, deriveTraits, traitFingerprint, combinationSpace } from "./traits.js";
import { validateMarketMappings, evaluateMappings } from "./market.js";
import { validateCollectionMetadata } from "./metadata.js";
import { analyzeGeneratorSource } from "./static-analysis.js";
import { scanTextForSecrets, isTextPath } from "./secrets.js";
import { inspectRenderOutput, outputFingerprint } from "./svg.js";
import { error, warn, sortIssues, summarize } from "./issues.js";
import { fromUtf8 } from "./sha256.js";
import { SCHEMA_VERSION } from "./version.js";
import { makeRandom } from "./prng.js";

/** The checks this validator runs, in report order. */
export const CHECKS = Object.freeze([
  { id: "CONTAINER_STRUCTURE", title: "container structure" },
  { id: "LAYOUT_AND_PATHS", title: "layout and entry paths" },
  { id: "NO_ARBITRARY_HOOK", title: "no contract code or protocol override" },
  { id: "MANIFEST_SCHEMA", title: "manifest schema" },
  { id: "ALLOWED_RUNTIME", title: "approved art runtime" },
  { id: "ALLOWED_DEPENDENCIES", title: "allowed dependencies" },
  { id: "NO_EXTERNAL_NETWORK", title: "no external network dependency" },
  { id: "SCRIPT_BYTE_LIMIT", title: "script byte budget" },
  { id: "TRAIT_SCHEMA", title: "trait schema" },
  { id: "MARKET_MAPPING_BOUNDS", title: "market mapping bounds" },
  { id: "COLLECTION_METADATA", title: "collection metadata" },
  { id: "EARNINGS_CONFIG", title: "earnings configuration" },
  { id: "SUPPLY_AND_BACKING", title: "supply and artwork backing" },
  { id: "CHAIN_FEATURES", title: "requested chains" },
  { id: "SECRET_SCAN", title: "secret scan" },
  { id: "HASH_INTEGRITY", title: "hash integrity" },
  { id: "RUNTIME_ERRORS", title: "generator runs without errors" },
  { id: "BLANK_OUTPUTS", title: "no blank or unsafe outputs" },
  { id: "DETERMINISTIC_OUTPUT", title: "deterministic output" },
  { id: "DUPLICATE_RATE", title: "trait duplicate rate" },
]);

/**
 * Reads and validates a `.relics` file.
 * @param {Uint8Array} bytes
 * @param {ValidateOptions} [options]
 */
export function validateBundleBytes(bytes, options = {}) {
  let container;
  try {
    container = readContainer(bytes);
  } catch (err) {
    return failFast("CONTAINER_STRUCTURE", error("CONTAINER", "<container>", err instanceof Error ? err.message : String(err)));
  }
  return validateBundle(container.byPath, options);
}

/**
 * @typedef {{
 *   evaluate?: (files: Map<string, string>, entry: string) => { render: (context: any) => unknown },
 *   seeds?: number,
 *   duplicateSampleSize?: number,
 *   skipExecution?: boolean,
 * }} ValidateOptions
 */

/**
 * Validates an already-extracted bundle.
 * @param {Map<string, Uint8Array>} byPath
 * @param {ValidateOptions} [options]
 */
export function validateBundle(byPath, options = {}) {
  /** @type {import("./issues.js").Issue[]} */
  const issues = [];
  /** @type {Record<string, { status: string, detail: string }>} */
  const checks = {};
  const mark = (id, status, detail) => {
    const existing = checks[id];
    if (existing && rank(existing.status) >= rank(status)) return;
    checks[id] = { status, detail };
  };
  for (const check of CHECKS) checks[check.id] = { status: "pass", detail: "" };

  const collect = (checkId, produced) => {
    for (const issue of produced) {
      issues.push(issue);
      mark(checkId, issue.severity === "error" ? "fail" : "warn", issue.message);
    }
    return produced;
  };

  // ---- 1. layout and entry policy ----------------------------------------------------------
  if (byPath.size === 0) return failFast("CONTAINER_STRUCTURE", error("CONTAINER", "<container>", "the bundle is empty"));
  for (const path of byPath.keys()) {
    const policy = checkEntryPolicy(path);
    if (!policy.ok) {
      const isCodeSmuggling = /\.(sol|vy|yul|wasm)$/i.test(path);
      collect(isCodeSmuggling ? "NO_ARBITRARY_HOOK" : "LAYOUT_AND_PATHS", [error(isCodeSmuggling ? "BUNDLE_CONTRACT_CODE" : "BUNDLE_PATH_POLICY", path, policy.reason)]);
    }
  }
  for (const required of REQUIRED_ENTRIES) {
    if (!byPath.has(required)) collect("LAYOUT_AND_PATHS", [error("BUNDLE_MISSING_ENTRY", required, `required entry "${required}" is missing`)]);
  }
  const generatorFiles = [...byPath.keys()].filter((p) => p.startsWith("generator/"));
  if (generatorFiles.length > LIMITS.maxGeneratorFiles) {
    collect("LAYOUT_AND_PATHS", [error("BUNDLE_GENERATOR_FILES", "generator/", `the generator directory holds ${generatorFiles.length} files (max ${LIMITS.maxGeneratorFiles})`)]);
  }
  // Exactly one script. A launch stores ONE script, so a generator split across several files
  // could not be submitted as written — refusing it here beats discovering it at prepare time.
  const generatorScripts = generatorFiles.filter((p) => p.endsWith(".js"));
  if (generatorScripts.length > 1) {
    collect("ALLOWED_DEPENDENCIES", [
      error("BUNDLE_MULTIPLE_SCRIPTS", "generator/", `a bundle carries exactly one generator script; found ${generatorScripts.length} (${generatorScripts.join(", ")}). Keep the generator in generator/generate.js.`),
    ]);
  }

  // ---- 2. JSON documents -------------------------------------------------------------------
  const documents = {};
  for (const [path, checkId] of [
    ["relics.project.json", "MANIFEST_SCHEMA"],
    ["checksums.json", "HASH_INTEGRITY"],
    ["traits/schema.json", "TRAIT_SCHEMA"],
    ["market/mappings.json", "MARKET_MAPPING_BOUNDS"],
    ["metadata/collection.json", "COLLECTION_METADATA"],
  ]) {
    const bytes = byPath.get(path);
    if (!bytes) continue;
    try {
      documents[path] = parseAndHashJson(bytes);
    } catch (err) {
      collect(checkId, [error("JSON_MALFORMED", path, err instanceof Error ? err.message : String(err))]);
    }
  }

  const manifest = documents["relics.project.json"]?.value ?? null;
  const traitSchema = documents["traits/schema.json"]?.value ?? null;
  const marketDocument = documents["market/mappings.json"]?.value ?? null;
  const collectionMetadata = documents["metadata/collection.json"]?.value ?? null;
  const checksums = documents["checksums.json"]?.value ?? null;

  if (manifest) {
    const manifestIssues = validateManifest(manifest);
    for (const issue of manifestIssues) {
      issues.push(issue);
      const target =
        issue.code === "MANIFEST_REFUSED_KEY"
          ? "NO_ARBITRARY_HOOK"
          : issue.code.startsWith("ART_RUNTIME")
            ? "ALLOWED_RUNTIME"
            : issue.code.startsWith("ART_SCRIPT_BYTES")
              ? "SCRIPT_BYTE_LIMIT"
              : issue.code.startsWith("EARNINGS")
                ? "EARNINGS_CONFIG"
                : issue.code.startsWith("SUPPLY")
                  ? "SUPPLY_AND_BACKING"
                  : issue.code.startsWith("CHAIN")
                    ? "CHAIN_FEATURES"
                    : issue.code.startsWith("MARKET")
                      ? "MARKET_MAPPING_BOUNDS"
                      : "MANIFEST_SCHEMA";
      mark(target, issue.severity === "error" ? "fail" : "warn", issue.message);
    }
  }
  if (traitSchema) collect("TRAIT_SCHEMA", validateTraitSchema(traitSchema));
  if (marketDocument) collect("MARKET_MAPPING_BOUNDS", validateMarketMappings(marketDocument));
  if (collectionMetadata) collect("COLLECTION_METADATA", validateCollectionMetadata(collectionMetadata));

  // Cross-document agreement: three places name the collection; they must agree.
  if (manifest?.project && collectionMetadata) {
    for (const field of ["name", "symbol", "description"]) {
      if (collectionMetadata[field] !== undefined && manifest.project[field] !== collectionMetadata[field]) {
        collect("COLLECTION_METADATA", [
          error("METADATA_DISAGREES", `metadata/collection.json#${field}`, `${field} disagrees with relics.project.json#project.${field}; the importer would have to guess which one the creator meant`),
        ]);
      }
    }
  }
  if (manifest?.market && marketDocument && Array.isArray(marketDocument.mappings) && manifest.market.mappingCount !== marketDocument.mappings.length) {
    collect("MARKET_MAPPING_BOUNDS", [
      error("MARKET_COUNT_DISAGREES", "relics.project.json#market.mappingCount", `manifest says ${manifest.market.mappingCount} mappings, market/mappings.json holds ${marketDocument.mappings.length}`),
    ]);
  }
  if (manifest?.media?.cover?.path && !byPath.has(manifest.media.cover.path)) {
    collect("COLLECTION_METADATA", [error("MEDIA_COVER_MISSING", "relics.project.json#media.cover.path", `the declared cover ${manifest.media.cover.path} is not in the bundle`)]);
  }
  for (const key of ["image", "bannerImage", "featuredImage"]) {
    const value = collectionMetadata?.[key];
    if (typeof value === "string" && value !== "" && value.startsWith("assets/") && !byPath.has(value)) {
      collect("COLLECTION_METADATA", [error("METADATA_IMAGE_MISSING", `metadata/collection.json#${key}`, `${value} is referenced but not in the bundle`)]);
    }
  }

  // ---- 3. generator source ------------------------------------------------------------------
  const knownPaths = new Set(generatorFiles);
  /** @type {Map<string, string>} */
  const sources = new Map();
  for (const path of generatorFiles) {
    if (!path.endsWith(".js")) continue;
    let source;
    try {
      source = fromUtf8(byPath.get(path));
    } catch {
      collect("LAYOUT_AND_PATHS", [error("GEN_NOT_UTF8", path, "generator source must be valid UTF-8")]);
      continue;
    }
    sources.set(path, source);
    const produced = analyzeGeneratorSource(path, source, { entry: path === "generator/generate.js", knownPaths });
    for (const issue of produced) {
      issues.push(issue);
      const target = issue.code === "GEN_EXTERNAL_URL" || issue.code === "GEN_FORBIDDEN_IDENTIFIER" ? networkOrDependency(issue) : issue.code === "GEN_SCRIPT_TOO_LARGE" ? "SCRIPT_BYTE_LIMIT" : issue.code.startsWith("GEN_DEPENDENCY") ? "ALLOWED_DEPENDENCIES" : "RUNTIME_ERRORS";
      mark(target, issue.severity === "error" ? "fail" : "warn", issue.message);
    }
  }

  const entrySource = sources.get("generator/generate.js");
  const scriptBytes = byPath.get("generator/generate.js")?.length ?? 0;
  if (manifest?.art && Number.isInteger(manifest.art.scriptBytes) && manifest.art.scriptBytes !== scriptBytes) {
    collect("SCRIPT_BYTE_LIMIT", [error("ART_SCRIPT_BYTES_MISMATCH", "relics.project.json#art.scriptBytes", `manifest declares ${manifest.art.scriptBytes} bytes; generator/generate.js is ${scriptBytes} bytes`)]);
  }

  // ---- 4. secret scan ------------------------------------------------------------------------
  for (const [path, bytes] of byPath) {
    if (!isTextPath(path)) continue;
    let text;
    try {
      text = fromUtf8(bytes);
    } catch {
      collect("SECRET_SCAN", [error("TEXT_NOT_UTF8", path, "a text entry is not valid UTF-8")]);
      continue;
    }
    collect("SECRET_SCAN", scanTextForSecrets(path, text));
  }

  // ---- 5. hash integrity ---------------------------------------------------------------------
  let computed = null;
  if (manifest) {
    computed = computeIntegrity(manifest, byPath);
    const declared = manifest.integrity;
    if (declared && typeof declared === "object") {
      for (const key of ["contentHash", "projectConfigHash", "bundleHash"]) {
        if (isSha256Hex(declared[key]) && declared[key] !== computed[key]) {
          collect("HASH_INTEGRITY", [error("INTEGRITY_MISMATCH", `relics.project.json#integrity.${key}`, `declared ${declared[key]}, recomputed ${computed[key]}`)]);
        }
      }
    }
    const hashes = manifest.hashes;
    if (hashes && typeof hashes === "object") {
      const expected = {
        script: byPath.has("generator/generate.js") ? fileHash(byPath.get("generator/generate.js")) : null,
        generator: generatorHashOf(byPath),
        traitSchema: documents["traits/schema.json"]?.hash ?? null,
        marketMapping: documents["market/mappings.json"]?.hash ?? null,
        metadata: documents["metadata/collection.json"]?.hash ?? null,
      };
      for (const [key, value] of Object.entries(expected)) {
        if (value && hashes[key] && hashes[key] !== value) {
          collect("HASH_INTEGRITY", [error("HASH_MISMATCH", `relics.project.json#hashes.${key}`, `declared ${hashes[key]}, recomputed ${value}`)]);
        }
      }
      if (hashes.dependencies && typeof hashes.dependencies === "object") {
        const actual = hashesUnder(byPath, "generator/");
        for (const [path, digest] of Object.entries(hashes.dependencies)) {
          if (actual[path] !== digest) collect("HASH_INTEGRITY", [error("HASH_MISMATCH", `relics.project.json#hashes.dependencies["${path}"]`, `declared ${digest}, recomputed ${actual[path] ?? "(file absent)"}`)]);
        }
        for (const path of Object.keys(actual)) {
          if (!(path in hashes.dependencies)) collect("HASH_INTEGRITY", [error("HASH_UNDECLARED", `relics.project.json#hashes.dependencies`, `${path} is in the bundle but not declared`)]);
        }
      }
      if (hashes.media && typeof hashes.media === "object") {
        const actual = hashesUnder(byPath, "assets/");
        for (const [path, digest] of Object.entries(hashes.media)) {
          if (actual[path] !== digest) collect("HASH_INTEGRITY", [error("HASH_MISMATCH", `relics.project.json#hashes.media["${path}"]`, `declared ${digest}, recomputed ${actual[path] ?? "(file absent)"}`)]);
        }
      }
    }
  }
  if (checksums) {
    if (checksums.algorithm !== "sha256") collect("HASH_INTEGRITY", [error("CHECKSUMS_ALGORITHM", "checksums.json#algorithm", 'checksums.algorithm must be "sha256"')]);
    if (!checksums.files || typeof checksums.files !== "object") {
      collect("HASH_INTEGRITY", [error("CHECKSUMS_FILES", "checksums.json#files", "checksums.files must be an object of path -> digest")]);
    } else {
      for (const [path, digest] of Object.entries(checksums.files)) {
        const bytes = byPath.get(path);
        if (!bytes) {
          collect("HASH_INTEGRITY", [error("CHECKSUMS_MISSING_FILE", `checksums.json#files["${path}"]`, "a checksummed file is not in the bundle")]);
          continue;
        }
        const digestNow = fileHash(bytes);
        if (digestNow !== digest) collect("HASH_INTEGRITY", [error("CHECKSUMS_MISMATCH", path, `checksums.json says ${digest}, the file hashes to ${digestNow}`)]);
      }
      for (const path of byPath.keys()) {
        if (path === "checksums.json") continue;
        if (!(path in checksums.files)) collect("HASH_INTEGRITY", [error("CHECKSUMS_UNDECLARED", path, "the file is in the bundle but has no entry in checksums.json")]);
      }
    }
    if (computed && checksums.bundleHash && checksums.bundleHash !== computed.bundleHash) {
      collect("HASH_INTEGRITY", [error("CHECKSUMS_BUNDLE_HASH", "checksums.json#bundleHash", `declared ${checksums.bundleHash}, recomputed ${computed.bundleHash}`)]);
    }
  }

  // ---- 6. execution --------------------------------------------------------------------------
  const execution = runExecutionChecks({ options, sources, manifest, traitSchema, marketDocument, entrySource, collect, mark });

  const summary = summarize(issues);
  return {
    ok: summary.ok,
    schemaVersion: SCHEMA_VERSION,
    issues: sortIssues(issues),
    summary,
    checks: CHECKS.map((check) => ({ id: check.id, title: check.title, status: checks[check.id].status, detail: checks[check.id].detail })),
    manifest,
    traitSchema,
    marketMappings: marketDocument,
    collectionMetadata,
    hashes: computed
      ? { bundleHash: computed.bundleHash, projectConfigHash: computed.projectConfigHash, contentHash: computed.contentHash, files: computed.files }
      : null,
    execution,
  };
}

function runExecutionChecks({ options, sources, manifest, traitSchema, marketDocument, entrySource, collect, mark }) {
  const skipped = { ran: false, reason: "", seeds: 0, deterministic: null, duplicateRate: null, outputs: [] };
  if (options.skipExecution) {
    skipped.reason = "execution checks were explicitly skipped";
  } else if (typeof options.evaluate !== "function") {
    skipped.reason = "no sandboxed evaluator was supplied by the host";
  } else if (!entrySource) {
    skipped.reason = "generator/generate.js is missing or unreadable";
  }
  if (skipped.reason) {
    for (const id of ["RUNTIME_ERRORS", "BLANK_OUTPUTS", "DETERMINISTIC_OUTPUT", "DUPLICATE_RATE"]) {
      mark(id, "skipped", skipped.reason);
    }
    return skipped;
  }

  let module;
  try {
    module = options.evaluate(sources, "generator/generate.js");
  } catch (err) {
    collect("RUNTIME_ERRORS", [error("GEN_LOAD_FAILED", "generator/generate.js", `the generator failed to load: ${err instanceof Error ? err.message : String(err)}`)]);
    return { ...skipped, reason: "the generator failed to load" };
  }
  if (!module || typeof module.render !== "function") {
    collect("RUNTIME_ERRORS", [error("GEN_NO_RENDER", "generator/generate.js", "the generator does not export a callable render(context)")]);
    return { ...skipped, reason: "no render export" };
  }

  const seedCount = clampInt(options.seeds ?? 24, 1, LIMITS.maxTestSeeds);
  const seeds = [];
  for (let i = 1; i <= seedCount; i++) seeds.push(String(i));

  const fingerprints = new Map();
  const traitCounts = new Map();
  let deterministic = true;
  let firstNonDeterministicSeed = null;
  const outputs = [];

  for (const seed of seeds) {
    const context = buildRenderContext({ manifest, marketDocument, seed });
    let first;
    try {
      first = module.render(context);
    } catch (err) {
      collect("RUNTIME_ERRORS", [error("GEN_RENDER_THREW", `generator/generate.js seed=${seed}`, `render() threw: ${err instanceof Error ? err.message : String(err)}`)]);
      continue;
    }
    collect("BLANK_OUTPUTS", inspectRenderOutput(`generator/generate.js seed=${seed}`, first));

    let second;
    try {
      second = module.render(buildRenderContext({ manifest, marketDocument, seed }));
    } catch (err) {
      collect("DETERMINISTIC_OUTPUT", [error("GEN_RERENDER_THREW", `generator/generate.js seed=${seed}`, `the second render of the same seed threw: ${err instanceof Error ? err.message : String(err)}`)]);
      deterministic = false;
      continue;
    }
    if (outputFingerprint(first) !== outputFingerprint(second)) {
      deterministic = false;
      if (firstNonDeterministicSeed === null) firstNonDeterministicSeed = seed;
    }

    const fingerprint = outputFingerprint(first);
    const previous = fingerprints.get(fingerprint);
    if (previous !== undefined) {
      collect("DETERMINISTIC_OUTPUT", [
        warn("GEN_IDENTICAL_OUTPUT", `generator/generate.js seed=${seed}`, `seed ${seed} draws exactly the same artwork as seed ${previous}; the generator may be ignoring its seed`),
      ]);
    } else {
      fingerprints.set(fingerprint, seed);
    }
    outputs.push({ seed, sha: fingerprint.length, length: typeof first === "string" ? first.length : 0 });

    if (traitSchema && Array.isArray(traitSchema.dimensions)) {
      const key = traitFingerprint(deriveTraits(traitSchema, seed));
      traitCounts.set(key, (traitCounts.get(key) ?? 0) + 1);
    }
  }

  if (!deterministic) {
    collect("DETERMINISTIC_OUTPUT", [
      error("GEN_NONDETERMINISTIC", `generator/generate.js seed=${firstNonDeterministicSeed}`, "rendering the same seed twice produced different output — the generator depends on something outside its inputs"),
    ]);
  }

  let duplicateRate = null;
  if (traitSchema && Array.isArray(traitSchema.dimensions) && traitSchema.dimensions.length > 0) {
    const distinct = traitCounts.size;
    duplicateRate = seeds.length === 0 ? 0 : (seeds.length - distinct) / seeds.length;
    const space = combinationSpace(traitSchema);
    const artworkSupply = manifest?.supply?.artworkSupply ? BigInt(manifest.supply.artworkSupply) : null;
    if (artworkSupply !== null && space < artworkSupply) {
      collect("DUPLICATE_RATE", [
        error(
          "TRAITS_SPACE_TOO_SMALL",
          "traits/schema.json",
          `the trait schema can express ${space} distinct combinations but the collection mints ${artworkSupply} artworks — duplicates are unavoidable`,
        ),
      ]);
    }
    if (duplicateRate > 0.5) {
      collect("DUPLICATE_RATE", [warn("TRAITS_DUPLICATE_RATE", "traits/schema.json", `${(duplicateRate * 100).toFixed(1)}% of the sampled seeds share a trait set`)]);
    }
  }

  return { ran: true, reason: "", seeds: seeds.length, deterministic, duplicateRate, distinctOutputs: fingerprints.size, outputs };
}

/**
 * Builds the frozen context a generator receives. This is the whole surface: a seed, a seeded
 * random helper, the evaluated market destinations, and the declared trait set. No clock, no
 * network, no host objects.
 */
export function buildRenderContext({ manifest, marketDocument, seed, sensors }) {
  const readings = sensors ?? neutralSensors(seed);
  const market = marketDocument ? evaluateMappings(marketDocument, readings) : {};
  const context = {
    seed,
    random: makeRandom(seed),
    market: Object.freeze({ ...market }),
    sensors: Object.freeze({ ...readings }),
    size: 1000,
    project: Object.freeze({
      name: manifest?.project?.name ?? "",
      symbol: manifest?.project?.symbol ?? "",
      artworkSupply: manifest?.supply?.artworkSupply ?? "0",
    }),
  };
  return Object.freeze(context);
}

/**
 * Reproducible sensor readings for validation runs. Real readings come from chain state at render
 * time; these are derived from the seed so a validation run is repeatable and still exercises the
 * whole [-1,1] range across a sample of seeds.
 */
export function neutralSensors(seed) {
  const random = makeRandom(`${seed}:sensors`);
  return {
    buying_pressure: random.float(-1, 1),
    selling_pressure: random.float(-1, 1),
    volume: random.float(0, 1),
    tick: random.float(-1, 1),
    volatility: random.float(0, 1),
    drawdown: random.float(0, 1),
    recovery: random.float(0, 1),
    liquidity: random.float(0, 1),
    holder_growth: random.float(-1, 1),
    epoch: random.float(0, 1),
    market_seed: random.float(0, 1),
  };
}

function generatorHashOf(byPath) {
  const files = hashesUnder(byPath, "generator/");
  return Object.keys(files).length === 0 ? null : jsonHash(files);
}

function networkOrDependency(issue) {
  if (issue.code === "GEN_EXTERNAL_URL") return "NO_EXTERNAL_NETWORK";
  const networkIdentifiers = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"];
  return networkIdentifiers.some((id) => issue.message.startsWith(`"${id}"`)) ? "NO_EXTERNAL_NETWORK" : "RUNTIME_ERRORS";
}

function clampInt(value, min, max) {
  const n = Number.isInteger(value) ? value : min;
  return n < min ? min : n > max ? max : n;
}

function rank(status) {
  return { pass: 0, warn: 1, skipped: 2, fail: 3 }[status] ?? 0;
}

function failFast(checkId, issue) {
  return {
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    issues: [issue],
    summary: summarize([issue]),
    checks: CHECKS.map((check) => ({ id: check.id, title: check.title, status: check.id === checkId ? "fail" : "skipped", detail: check.id === checkId ? issue.message : "the container could not be read" })),
    manifest: null,
    traitSchema: null,
    marketMappings: null,
    collectionMetadata: null,
    hashes: null,
    execution: { ran: false, reason: issue.message, seeds: 0, deterministic: null, duplicateRate: null, outputs: [] },
  };
}
