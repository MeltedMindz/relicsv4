// SPDX-License-Identifier: MIT
// Every numeric bound the bundle format enforces, in one place. These are the numbers that make
// "treat every bundle as hostile" concrete: a validator with no limits is a denial-of-service
// surface, so nothing is unbounded — not the container, not a file, not a string, not a loop.

export const LIMITS = Object.freeze({
  // ---- container -------------------------------------------------------------------------
  /** Largest `.relics` file the reader will even open. */
  maxBundleBytes: 20 * 1024 * 1024,
  /** Largest single entry inside a bundle. */
  maxEntryBytes: 4 * 1024 * 1024,
  /** Total uncompressed bytes across all entries. Equal to the bundle cap because the container
   *  is STORE-only: expansion is structurally impossible, so a zip bomb cannot exist. */
  maxTotalEntryBytes: 20 * 1024 * 1024,
  /** Entry count ceiling. */
  maxEntries: 512,
  /** Longest normalized entry path, in bytes. */
  maxPathBytes: 180,
  /** Deepest path nesting (segments). */
  maxPathDepth: 6,

  // ---- generator -------------------------------------------------------------------------
  /**
   * Public per-project script-byte budget. The launchpad's conservative product limit is 36,000
   * bytes (its hard one-transaction ceiling is higher; the kit always gates on the public
   * budget, never the hard cap).
   */
  maxScriptBytes: 36_000,
  /** Files the generator directory may contain. */
  maxGeneratorFiles: 16,
  /** Wall-clock budget for one deterministic render, in milliseconds. */
  renderTimeoutMs: 4_000,
  /** Largest SVG a render may return. */
  maxRenderOutputBytes: 512 * 1024,
  /** Minimum output length below which an output counts as blank. */
  minRenderOutputBytes: 64,

  // ---- traits ----------------------------------------------------------------------------
  maxTraitDimensions: 16,
  maxTraitValuesPerDimension: 64,
  maxTraitNameLength: 48,
  /** Weight bounds for a weighted trait value. */
  minTraitWeight: 1,
  maxTraitWeight: 1_000_000,

  // ---- market mappings -------------------------------------------------------------------
  maxMarketMappings: 8,

  // ---- metadata / identity ---------------------------------------------------------------
  maxNameLength: 64,
  maxSymbolLength: 11,
  maxDescriptionLength: 4_000,
  maxUrlLength: 300,
  maxLicenseLength: 64,

  // ---- economics -------------------------------------------------------------------------
  /** Whole-token supply bounds. */
  minTotalSupplyWhole: 1n,
  maxTotalSupplyWhole: 1_000_000_000_000n,
  /** Collaborator (earnings split) bounds. Mirrors the launchpad's MAX_COLLABORATORS. */
  maxCollaborators: 16,
  /** Attribution-only collaborators shown in contract metadata. */
  maxMetaCollaborators: 16,
  bpsDenominator: 10_000,
  /** Provisional cap on the optional creator allocation, in bps of total supply. */
  maxCreatorAllocationBps: 1_000,
  maxSaleAllocationBps: 10_000,

  // ---- validation work bounds ------------------------------------------------------------
  /** Seeds `test-seeds` will render at most in one run. */
  maxTestSeeds: 1_000,
  /** JSON parse guards. */
  maxJsonDepth: 32,
  maxJsonNodes: 200_000,
});

/** File extensions a bundle entry may use, by directory role. */
export const ALLOWED_EXTENSIONS = Object.freeze({
  generator: Object.freeze([".js", ".json", ".md"]),
  traits: Object.freeze([".json"]),
  market: Object.freeze([".json"]),
  metadata: Object.freeze([".json"]),
  assets: Object.freeze([".png", ".jpg", ".jpeg", ".webp", ".svg", ".json", ".txt", ".md"]),
  previews: Object.freeze([".svg", ".png", ".json"]),
  root: Object.freeze([".json", ".md", ".txt"]),
});

/**
 * Extensions that are refused everywhere, with the reason. `.sol` is on this list for the same
 * reason the manifest has no hook field: a one-click bundle may configure art, never contract
 * code.
 */
export const FORBIDDEN_EXTENSIONS = Object.freeze({
  ".sol": "Solidity source cannot travel in a bundle — custom contracts need the separate reviewed process.",
  ".vy": "Vyper source cannot travel in a bundle.",
  ".yul": "Yul source cannot travel in a bundle.",
  ".wasm": "WebAssembly is not an approved art runtime.",
  ".exe": "executables are never carried in a bundle.",
  ".dll": "executables are never carried in a bundle.",
  ".so": "executables are never carried in a bundle.",
  ".dylib": "executables are never carried in a bundle.",
  ".sh": "shell scripts are never carried in a bundle.",
  ".bash": "shell scripts are never carried in a bundle.",
  ".zsh": "shell scripts are never carried in a bundle.",
  ".bat": "shell scripts are never carried in a bundle.",
  ".cmd": "shell scripts are never carried in a bundle.",
  ".ps1": "shell scripts are never carried in a bundle.",
  ".py": "no interpreter runs inside the importer.",
  ".rb": "no interpreter runs inside the importer.",
  ".php": "no interpreter runs inside the importer.",
  ".jar": "no interpreter runs inside the importer.",
  ".node": "native addons are never carried in a bundle.",
  ".env": "environment files can carry secrets and are never carried in a bundle.",
  ".pem": "key material is never carried in a bundle.",
  ".key": "key material is never carried in a bundle.",
  ".p12": "key material is never carried in a bundle.",
  ".keystore": "key material is never carried in a bundle.",
  ".html": "HTML would give a preview surface a document to execute.",
  ".htm": "HTML would give a preview surface a document to execute.",
  ".mjs": "generator code uses the .js extension; a second module extension is one more thing to reason about.",
  ".cjs": "the art runtime is ESM only.",
  ".ts": "bundles carry runnable JavaScript, never a language that needs a compiler.",
});

/** Top-level directories a bundle may contain, and whether they are required. */
export const BUNDLE_LAYOUT = Object.freeze([
  { path: "relics.project.json", kind: "file", role: "root", required: true },
  { path: "checksums.json", kind: "file", role: "root", required: true },
  { path: "README.md", kind: "file", role: "root", required: false },
  { path: "LICENSE", kind: "file", role: "root", required: false },
  { path: "generator/", kind: "dir", role: "generator", required: true },
  { path: "traits/", kind: "dir", role: "traits", required: true },
  { path: "market/", kind: "dir", role: "market", required: true },
  { path: "metadata/", kind: "dir", role: "metadata", required: true },
  { path: "assets/", kind: "dir", role: "assets", required: false },
  { path: "previews/", kind: "dir", role: "previews", required: false },
]);

/** Files that must exist inside a bundle. */
export const REQUIRED_ENTRIES = Object.freeze([
  "relics.project.json",
  "checksums.json",
  "generator/generate.js",
  "traits/schema.json",
  "market/mappings.json",
  "metadata/collection.json",
]);
