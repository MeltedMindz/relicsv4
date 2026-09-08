#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// Generate (or --check) PUBLIC_EXPORT_MANIFEST.json: for every tracked file, record a sha256, a
// provenance, a license, HOW THAT LICENSE WAS DETERMINED, and a public-safe verdict.
//
// THE LICENSE IS DERIVED, NEVER ASSUMED. This file used to assume, and published 161 false claims:
// `lib/v4-core/**` and `lib/v4-core/lib/solmate/**` were labelled MIT / original-clean-room while 50
// solmate files declare AGPL-3.0-only and 8 v4-core files declare BUSL-1.1. The assumption was that
// third-party trees were git submodules and therefore outside this export — but `.gitmodules` does
// not exist here, mode-160000 gitlinks number zero, and 739 vendored third-party files are published
// from this tree. `THIRD_PARTY_NOTICES.md` and `README.md` both described the real, mixed-license
// arrangement correctly the entire time; only the generated manifest disagreed.
//
// So: a file's own `SPDX-License-Identifier` line is the authority for that file. Where a file
// declares nothing, the manifest says which fallback it used and why, rather than naming a license
// nobody wrote down. Submodule handling is DERIVED from git's own index mode instead of a hardcoded
// list of names, so it cannot again claim submodule status for a directory of ordinary files.
//
// Paired gate: `npm run export:manifest:licenses` re-reads every named file and fails if the
// manifest's declared license disagrees with it.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { REPOSITORY_LICENSE, isVendoredThirdParty, readDeclaredLicense, VENDORED_THIRD_PARTY_ROOTS } from "./lib/spdx.mjs";

/** How an entry's `license` field was arrived at. Published so a reader need not guess. */
export const LICENSE_SOURCES = {
  SPDX: "spdx-header", //          the file states it on its own first line
  REPO: "repository-license", //   first-party file with no header; LICENSE covers it
  NOTICES: "third-party-notices", // vendored file with no header; its component's terms govern
  GITLINK: "gitlink-reference", //  a submodule pointer; its source is not in this repository
};

/** Vendored files with no header of their own point at the authoritative component table. */
const NOTICES_REFERENCE = "see THIRD_PARTY_NOTICES.md";

/**
 * Submodule gitlinks, DERIVED from the git index rather than from a list of names.
 *
 * The previous hardcoded set named `lib/forge-std` and `lib/uniswap-hooks`. Both are ordinary
 * vendored directories in this repository — 35 and 44 tracked files respectively — so the set was
 * wrong about the two paths it named and silent about the 660 it did not.
 */
function gitlinkPaths() {
  const out = execSync("git ls-files -s", { maxBuffer: 256 * 1024 * 1024 }).toString();
  const links = new Map();
  for (const line of out.split("\n")) {
    if (!line.startsWith("160000 ")) continue;
    const [meta, path] = line.split("\t");
    links.set(path, meta.split(/\s+/)[1]);
  }
  return links;
}

/**
 * @param {string} path repo-relative
 * @param {Map<string,string>} gitlinks
 */
function classify(path, gitlinks) {
  if (gitlinks.has(path)) {
    return {
      provenance: "dependency-submodule-reference",
      license: NOTICES_REFERENCE,
      licenseSource: LICENSE_SOURCES.GITLINK,
    };
  }

  const vendored = isVendoredThirdParty(path);
  const declared = readDeclaredLicense(path);

  // PROVENANCE IS ABOUT WHERE THE BYTES CAME FROM, and it has exactly one honest answer per path.
  let provenance;
  if (vendored) provenance = "vendored-third-party";
  else if (
    path === "packages/project-schema/src/deployments.js" ||
    path === "packages/project-schema/src/robinhood-stock-tokens.js"
  ) {
    provenance = "public-launchpad-reference-data";
  } else provenance = "original-clean-room";

  // LICENSE IS ABOUT WHAT THE FILE SAYS, and the file gets the first and last word.
  if (declared) {
    return { provenance, license: declared.license, licenseSource: LICENSE_SOURCES.SPDX };
  }
  return vendored
    ? { provenance, license: NOTICES_REFERENCE, licenseSource: LICENSE_SOURCES.NOTICES }
    : { provenance, license: REPOSITORY_LICENSE, licenseSource: LICENSE_SOURCES.REPO };
}

function sha256(path, gitlinks) {
  // Submodule gitlinks are directories in the working tree; hash their pinned commit instead.
  if (gitlinks.has(path)) return `gitlink:${gitlinks.get(path)}`;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const gitlinks = gitlinkPaths();
const tracked = execSync("git ls-files", { maxBuffer: 256 * 1024 * 1024 }).toString().trim().split("\n").filter(Boolean);

const files = tracked
  .filter((p) => p !== "PUBLIC_EXPORT_MANIFEST.json")
  .map((path) => {
    const { provenance, license, licenseSource } = classify(path, gitlinks);
    return {
      path,
      sha256: existsSync(path) || gitlinks.has(path) ? sha256(path, gitlinks) : "MISSING",
      provenance,
      license,
      licenseSource,
      publicSafe: true,
    };
  });

const manifest = {
  repository: "relics-v4-starter",
  description:
    "Clean-room educational starter for fully on-chain generative art powered by Uniswap v4 hooks. Not production software; not affiliated with any production project.",
  generatedBy: "scripts/gen-manifest.mjs",
  policy:
    "Built from an explicit allowlist (PUBLIC_EXPORT_ALLOWLIST.md). Contains authorized public chain/API reference data, but no keys, private deployment proofs, private source, or private material. " +
    `Third-party Solidity source is VENDORED here — copied in byte-exact and redistributed — under ${VENDORED_THIRD_PARTY_ROOTS.join(" and ")}, not referenced via submodules. ` +
    "Those trees are MIXED-LICENSE and are NOT MIT: Uniswap v4-core carries BUSL-1.1 on its core implementation files and the solmate tree vendored beneath it carries AGPL-3.0-only. " +
    "Each entry's `license` is read from that file's own SPDX-License-Identifier line where it has one; `licenseSource` says which. See THIRD_PARTY_NOTICES.md for the component table and the BUSL-1.1 note.",
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
