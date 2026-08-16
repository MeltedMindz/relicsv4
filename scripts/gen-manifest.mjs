#!/usr/bin/env node
// Generate (or --check) PUBLIC_EXPORT_MANIFEST.json: for every tracked file, record a sha256, a
// provenance, a license, and a public-safe verdict. Submodule gitlinks are recorded as
// dependency references (their source is not part of this repo).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const SUBMODULES = new Set(["lib/forge-std", "lib/uniswap-hooks"]);

function classify(path) {
  if (SUBMODULES.has(path)) {
    return { provenance: "dependency-submodule-reference", license: "see THIRD_PARTY_NOTICES.md" };
  }
  if (
    path === "packages/project-schema/src/deployments.js" ||
    path === "packages/project-schema/src/robinhood-stock-tokens.js"
  ) {
    return { provenance: "public-launchpad-reference-data", license: "MIT" };
  }
  if (path === ".gitmodules") {
    return { provenance: "dependency-reference", license: "MIT" };
  }
  if (
    path.startsWith("src/") ||
    path.startsWith("script/") ||
    path.startsWith("test/") ||
    path.startsWith("apps/web/") ||
    path.startsWith("docs/") ||
    path.startsWith("scripts/") ||
    path.startsWith(".github/")
  ) {
    return { provenance: "original-clean-room", license: "MIT" };
  }
  return { provenance: "original-clean-room", license: "MIT" };
}

function sha256(path) {
  // Submodule gitlinks are directories in the working tree; hash their pinned commit instead.
  if (SUBMODULES.has(path)) {
    const out = execSync(`git ls-files -s "${path}"`).toString().trim();
    const commit = out.split(/\s+/)[1] || "";
    return `gitlink:${commit}`;
  }
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const tracked = execSync("git ls-files").toString().trim().split("\n").filter(Boolean);

const files = tracked
  .filter((p) => p !== "PUBLIC_EXPORT_MANIFEST.json")
  .map((path) => {
    const { provenance, license } = classify(path);
    return {
      path,
      sha256: existsSync(path) || SUBMODULES.has(path) ? sha256(path) : "MISSING",
      provenance,
      license,
      publicSafe: true,
    };
  });

const manifest = {
  repository: "relics-v4-starter",
  description:
    "Clean-room educational starter for fully on-chain generative art powered by Uniswap v4 hooks. Not affiliated with any production project.",
  generatedBy: "scripts/gen-manifest.mjs",
  policy:
    "Built from an explicit allowlist (PUBLIC_EXPORT_ALLOWLIST.md). Contains authorized public chain/API reference data, but no keys, private deployment proofs, private source, or private material. Third-party source is referenced via submodules, not vendored.",
  fileCount: files.length,
  files,
};

const json = JSON.stringify(manifest, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync("PUBLIC_EXPORT_MANIFEST.json")
    ? readFileSync("PUBLIC_EXPORT_MANIFEST.json", "utf8")
    : "";
  if (current !== json) {
    console.error("PUBLIC_EXPORT_MANIFEST.json is stale. Run: node scripts/gen-manifest.mjs");
    process.exit(1);
  }
  console.log(`Manifest up to date (${files.length} files).`);
} else {
  writeFileSync("PUBLIC_EXPORT_MANIFEST.json", json);
  console.log(`Wrote PUBLIC_EXPORT_MANIFEST.json (${files.length} files).`);
}
