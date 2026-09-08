#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE MANIFEST'S LICENSE CLAIMS, RE-READ OFF DISK.
//
//   node scripts/check-manifest-licenses.mjs            # human output, non-zero exit on any failure
//   node scripts/check-manifest-licenses.mjs --json      # machine output
//   node scripts/check-manifest-licenses.mjs --controls  # prove this checker can fail
//
// WHY THIS EXISTS
//
// `PUBLIC_EXPORT_MANIFEST.json` is a published, per-file licensing claim about a public repository.
// It was wrong about 161 files: everything under `lib/v4-core/` (99) and `lib/v4-core/lib/solmate/`
// (62) was published as `license: MIT`, `provenance: original-clean-room`, while on disk 50 of the
// solmate files begin `// SPDX-License-Identifier: AGPL-3.0-only` and 8 v4-core files begin
// `// SPDX-License-Identifier: BUSL-1.1`. BUSL-1.1 is not an open-source license at all; AGPL-3.0 is
// strongly copyleft. Calling either MIT -- and calling somebody else's code clean-room -- is a false
// statement about other people's rights, made by us, in public.
//
// Nothing caught it because nothing compared the two. `export:manifest:check` proves the manifest is
// CURRENT (every digest matches) and says nothing about whether it is TRUE. A manifest can be
// perfectly up to date and perfectly wrong, which is exactly what shipped.
//
// So this gate does the one comparison that was missing: for every entry, open the file the entry
// NAMES and read the license that file states about ITSELF. Both sides come from the same reader
// (`scripts/lib/spdx.mjs`), because a checker with its own second implementation of "what license is
// this file" eventually disagrees with the generator and there is no third opinion to break the tie.
//
// WHAT IT DELIBERATELY WILL NOT ACCEPT AS A FIX. Two ways to make a false claim stop being false are
// to delete the claim and to stop describing the files it is about. Both leave a public repository
// redistributing AGPL and BUSL code with no per-file record of it, so both are failures here:
// ENTRY_MISSING_LICENSE and MANIFEST_MISSING_TRACKED_FILE. The manifest is supposed to describe what
// is actually published.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPOSITORY_LICENSE, isVendoredThirdParty, readDeclaredLicense } from "./lib/spdx.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "PUBLIC_EXPORT_MANIFEST.json");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

// Run only when INVOKED. `evaluate` and `floorBreaches` are exported so other harnesses -- and the
// controls below -- can point them at a manifest that is not the committed one; a module that
// exits the process on import cannot be reused that way.
const IS_ENTRY = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

/**
 * INPUT FLOORS. Absence of input is not success.
 *
 * Every one of these is a positive minimum; a floor of zero is satisfiable by scanning nothing,
 * which is the failure this whole file is a response to. They are named individually because an
 * aggregate floor is cleared by a large corpus in which the interesting category has gone to zero --
 * 2,013 entries with the vendored tree dropped would pass any total-count floor comfortably while
 * checking exactly none of the claims that were false.
 */
const FLOORS = {
  ENTRIES: 500, //            the manifest describes a real repository
  FILES_READ: 500, //         files were actually opened, not merely listed
  SPDX_DECLARED: 300, //      files that state their own license -- the only ones this can verify
  VENDORED_ENTRIES: 100, //   third-party trees are present; this is the category that was false
  DISTINCT_LICENSES: 3, //    the corpus really is mixed-license, so a scan seeing only MIT refuses
};

/** The retired policy sentence. It was false the day it was written; it must not come back. */
const RETIRED_POLICY_CLAIM = /referenced\s+via\s+submodules,\s*not\s+vendored/i;

/**
 * @param {{policy?: string, files?: any[]}} manifest
 * @param {(p: string) => ({license: string, all: string[]} | null)} read  injected so --controls can
 *        move a file's on-disk declaration without writing into the repository
 * @param {string[]} tracked
 * @returns {{failures: {rule: string, path?: string, message: string}[], counts: object}}
 */
export function evaluate(manifest, read, tracked) {
  const failures = [];
  const entries = Array.isArray(manifest?.files) ? manifest.files : [];
  const counts = { entries: entries.length, filesRead: 0, spdxDeclared: 0, vendoredEntries: 0, licenses: new Set() };

  // --- the document-level claim ------------------------------------------------------------------
  // The per-file labels were downstream of one sentence asserting the whole tree was somewhere else.
  // Correcting 161 rows and leaving that sentence would leave a reader with the same false idea.
  if (typeof manifest?.policy === "string" && RETIRED_POLICY_CLAIM.test(manifest.policy)) {
    failures.push({
      rule: "POLICY_CLAIMS_SUBMODULES_NOT_VENDORED",
      message:
        "the manifest policy says third-party source is referenced via submodules and not vendored. " +
        "`.gitmodules` does not exist in this repository, there are zero gitlinks, and third-party source " +
        "IS vendored and published from this tree -- that sentence is the assumption every false per-file label came from.",
    });
  }

  const seen = new Set();
  for (const entry of entries) {
    const path = entry?.path;
    if (typeof path !== "string" || path.length === 0) {
      failures.push({ rule: "ENTRY_MISSING_PATH", message: `manifest entry has no path: ${JSON.stringify(entry)}` });
      continue;
    }
    seen.add(path);
    if (isVendoredThirdParty(path)) counts.vendoredEntries += 1;

    // DELETING THE FIELD IS NOT A FIX. A published redistribution manifest with no license column
    // tells a reader nothing about the AGPL and BUSL code it is handing them.
    if (typeof entry.license !== "string" || entry.license.length === 0) {
      failures.push({ rule: "ENTRY_MISSING_LICENSE", path, message: `${path}: entry declares no license` });
      continue;
    }

    const abs = join(ROOT, path);
    if (!existsSync(abs)) continue; // gitlinks and deleted paths: `export:manifest:check` owns that
    const declared = read(abs);
    counts.filesRead += 1;

    // R3 -- ASKED OF THE PATH, AND ASKED BEFORE THE HEADER IS REQUIRED (finding CLOSE2-B6).
    //
    // This rule used to sit below the `if (!declared) continue` on the next line, so it could only
    // ever see files that state a license. A vendored file with NO SPDX header at all -- and there
    // are plenty; a header is a convention, not a requirement -- was skipped by "a file that states
    // nothing cannot contradict anything" and could be published as MIT, original-clean-room, with
    // nothing to catch it. But the PATH is evidence on its own: source sitting inside a vendored
    // third-party tree is not this repository's clean-room work whether or not it says so, and this
    // rule is the one that reads the path rather than the header. It belongs above the skip.
    if (isVendoredThirdParty(path) && entry.provenance === "original-clean-room") {
      failures.push({
        rule: "VENDORED_ENTRY_CLAIMED_AS_CLEAN_ROOM",
        path,
        message:
          `${path}: vendored third-party source published with provenance original-clean-room` +
          (declared ? "" : " (and the file states no license of its own, which is why the header rules cannot see it)"),
      });
    }

    if (!declared) continue; // a file that states nothing cannot contradict THE HEADER RULES below
    counts.spdxDeclared += 1;
    counts.licenses.add(declared.license);

    // R1 -- THE CENTRAL COMPARISON.
    if (entry.license !== declared.license) {
      failures.push({
        rule: "LICENSE_DISAGREES_WITH_SPDX",
        path,
        message: `${path}: manifest says "${entry.license}", the file's own SPDX-License-Identifier says "${declared.license}"`,
      });
    }

    // R2 -- a file declaring somebody else's terms is not this repository's clean-room work, wherever
    // it happens to sit. Keyed on CONTENT rather than on a path prefix, so a vendored tree added
    // later and never added to the prefix list is still caught -- by what is in it, not by its name.
    if (declared.license !== REPOSITORY_LICENSE && entry.provenance === "original-clean-room") {
      failures.push({
        rule: "THIRD_PARTY_LICENSE_CLAIMED_AS_CLEAN_ROOM",
        path,
        message: `${path}: declares "${declared.license}" but the manifest claims provenance original-clean-room`,
      });
    }

    // R4 -- one file, two different identifiers. Taking the first silently publishes half a truth.
    if (declared.all.length > 1) {
      failures.push({
        rule: "AMBIGUOUS_SPDX",
        path,
        message: `${path}: declares more than one license (${declared.all.join(", ")}); the manifest states a single one`,
      });
    }

    // R5 -- THE ORIGINAL BUG'S EXACT SHAPE: the file states its license and the manifest reached its
    // answer some other way. Even where the two happen to agree, that is the generator assuming.
    if (entry.licenseSource && entry.licenseSource !== "spdx-header") {
      failures.push({
        rule: "LICENSE_SOURCE_DISAGREES",
        path,
        message: `${path}: the file carries an SPDX header but the manifest records licenseSource "${entry.licenseSource}"`,
      });
    }
  }

  // --- coverage ---------------------------------------------------------------------------------
  // DROPPING THE VENDORED TREE IS NOT A FIX EITHER. If it is published, it is described.
  for (const path of tracked) {
    if (path === "PUBLIC_EXPORT_MANIFEST.json") continue;
    if (!seen.has(path)) {
      failures.push({
        rule: "MANIFEST_MISSING_TRACKED_FILE",
        path,
        message: `${path} is published by this repository and the manifest does not describe it`,
      });
    }
  }

  return { failures, counts };
}

/**
 * @param {object} counts
 * @param {object} floors
 * @returns {string[]} the floors that were breached.
 */
export function floorBreaches(counts, floors = FLOORS) {
  const breaches = [];
  const check = (name, got, min) => {
    if (!(min > 0)) {
      throw new Error(`floor ${name} must be a positive minimum; a floor of ${min} is satisfiable by scanning nothing`);
    }
    if (got < min) breaches.push(`${name}: ${got} < ${min}`);
  };
  check("ENTRIES", counts.entries, floors.ENTRIES);
  check("FILES_READ", counts.filesRead, floors.FILES_READ);
  check("SPDX_DECLARED", counts.spdxDeclared, floors.SPDX_DECLARED);
  check("VENDORED_ENTRIES", counts.vendoredEntries, floors.VENDORED_ENTRIES);
  check("DISTINCT_LICENSES", counts.licenses.size, floors.DISTINCT_LICENSES);
  return breaches;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split(" ")
    .filter(Boolean);
}

function loadManifest() {
  if (!existsSync(MANIFEST)) throw new Error("PUBLIC_EXPORT_MANIFEST.json does not exist");
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

// ------------------------------------------------------------------------------------------------
// CONTROLS. A checker nobody has watched fail is decorative.
//
// Each control mutates the checker's REAL input -- the committed manifest, and for the last one a
// file's on-disk declaration through the injected reader -- and is scored on the RULE IDENTIFIERS
// the evaluation returns. Never on a test's name: a control that passes because a string was found
// in a source file is measuring the source file, not the checker.
//
// Every control also ASSERTS THAT IT CHANGED SOMETHING, by comparing a serialization of the input
// before and after. A mutation whose anchor has drifted changes nothing and would otherwise score a
// free pass -- which is exactly how a mutation in the sibling repository went on reporting SURVIVED
// for weeks after its pattern stopped matching anything.
// ------------------------------------------------------------------------------------------------
if (IS_ENTRY && CONTROLS) {
  const base = loadManifest();
  const tracked = trackedFiles();
  const realRead = readDeclaredLicense;
  const clone = () => JSON.parse(JSON.stringify(base));
  const ser = (m, extra) => JSON.stringify(m) + " " + extra;

  const baseline = evaluate(base, realRead, tracked);
  const baselineFloors = floorBreaches(baseline.counts);
  const baseRules = new Set(baseline.failures.map((f) => f.rule));

  /** Pick a subject out of the committed manifest by what the FILE says, never by a hardcoded name. */
  const pathDeclaring = (license) => {
    const hit = base.files.find((f) => {
      const abs = join(ROOT, f.path);
      if (!existsSync(abs)) return false;
      const d = realRead(abs);
      return d && d.license === license;
    });
    if (!hit) throw new Error(`no committed entry declares ${license}; this control has lost its subject`);
    return hit.path;
  };

  const controls = [
    {
      name: "every AGPL-3.0 file is relabelled MIT (the exact defect that shipped)",
      apply: (m) => {
        for (const f of m.files) {
          const abs = join(ROOT, f.path);
          const d = existsSync(abs) ? realRead(abs) : null;
          if (d && d.license === "AGPL-3.0-only") f.license = "MIT";
        }
      },
      expect: "LICENSE_DISAGREES_WITH_SPDX",
    },
    {
      name: "every BUSL-1.1 file is relabelled MIT",
      apply: (m) => {
        for (const f of m.files) {
          const abs = join(ROOT, f.path);
          const d = existsSync(abs) ? realRead(abs) : null;
          if (d && d.license === "BUSL-1.1") f.license = "MIT";
        }
      },
      expect: "LICENSE_DISAGREES_WITH_SPDX",
    },
    {
      name: "an AGPL file keeps its correct license but is called this repository's own work",
      apply: (m) => {
        const p = pathDeclaring("AGPL-3.0-only");
        m.files.find((f) => f.path === p).provenance = "original-clean-room";
      },
      expect: "THIRD_PARTY_LICENSE_CLAIMED_AS_CLEAN_ROOM",
    },
    {
      name: "a vendored MIT file is called this repository's own work",
      apply: (m) => {
        const f = m.files.find((x) => isVendoredThirdParty(x.path) && x.license === "MIT");
        if (!f) throw new Error("no vendored MIT entry; this control has lost its subject");
        f.provenance = "original-clean-room";
      },
      expect: "VENDORED_ENTRY_CLAIMED_AS_CLEAN_ROOM",
    },
    {
      name: "the manifest reaches a license some way other than reading the file that states one",
      apply: (m) => {
        const p = pathDeclaring("BUSL-1.1");
        m.files.find((f) => f.path === p).licenseSource = "repository-license";
      },
      expect: "LICENSE_SOURCE_DISAGREES",
    },
    {
      name: "the retired policy sentence comes back",
      apply: (m) => {
        m.policy = `${m.policy} Third-party source is referenced via submodules, not vendored.`;
      },
      expect: "POLICY_CLAIMS_SUBMODULES_NOT_VENDORED",
    },
    {
      name: "the vendored tree is dropped from the manifest instead of described (the forbidden non-fix)",
      apply: (m) => {
        m.files = m.files.filter((f) => !isVendoredThirdParty(f.path));
      },
      expect: "MANIFEST_MISSING_TRACKED_FILE",
    },
    {
      name: "the license field is deleted instead of corrected (the other forbidden non-fix)",
      apply: (m) => {
        for (const f of m.files) delete f.license;
      },
      expect: "ENTRY_MISSING_LICENSE",
    },
    {
      // FINDING CLOSE2-B6. The rule that reads the PATH used to sit BELOW the "a file that states
      // nothing cannot contradict anything" skip, so a vendored file with no SPDX header at all
      // could be published as this repository's own clean-room MIT work and nothing looked. This
      // control removes the header (through the injected reader, so no file on disk is touched) AND
      // makes the claim, which is the combination that used to pass.
      name: "a vendored file with NO header of its own is published as this repository's clean-room work",
      readOverride: () => {
        const f = base.files.find((x) => isVendoredThirdParty(x.path) && existsSync(join(ROOT, x.path)) && realRead(join(ROOT, x.path)));
        if (!f) throw new Error("no vendored entry with a readable header; this control has lost its subject");
        return {
          subject: f.path,
          // The file declares NOTHING, exactly as a header-less vendored file does.
          read: (abs) => (abs === join(ROOT, f.path) ? null : realRead(abs)),
        };
      },
      apply: (m) => {
        const f = m.files.find((x) => isVendoredThirdParty(x.path) && existsSync(join(ROOT, x.path)) && realRead(join(ROOT, x.path)));
        f.provenance = "original-clean-room";
        f.license = "MIT";
        delete f.licenseSource;
      },
      expect: "VENDORED_ENTRY_CLAIMED_AS_CLEAN_ROOM",
    },
    {
      name: "a file's own header moves under a manifest nobody regenerated",
      // The one control that moves the OTHER side of the comparison. It proves the gate reads disk
      // rather than checking the manifest against itself.
      readOverride: () => {
        const target = pathDeclaring("BUSL-1.1");
        return {
          subject: target,
          read: (abs) => (abs === join(ROOT, target) ? { license: "MIT", all: ["MIT"] } : realRead(abs)),
        };
      },
      expect: "LICENSE_DISAGREES_WITH_SPDX",
    },
  ];

  let caught = 0;
  const misses = [];
  for (const c of controls) {
    const m = clone();
    let read = realRead;
    let extraBefore = "";
    let extraAfter = "";
    if (c.readOverride) {
      const o = c.readOverride();
      extraBefore = JSON.stringify(realRead(join(ROOT, o.subject)));
      read = o.read;
      extraAfter = JSON.stringify(read(join(ROOT, o.subject)));
    }
    const before = ser(m, extraBefore);
    if (c.apply) c.apply(m);
    const after = ser(m, extraAfter);
    // THE MUTATION MUST HAVE MUTATED.
    if (before === after) {
      misses.push(`  control CHANGED NOTHING: ${c.name} -- its anchor has drifted and it was proving nothing`);
      continue;
    }
    const got = evaluate(m, read, tracked);
    const newRules = new Set(got.failures.map((f) => f.rule).filter((r) => !baseRules.has(r)));
    if (newRules.has(c.expect)) caught += 1;
    else misses.push(`  control NOT caught: ${c.name} (expected ${c.expect}, got ${[...newRules].join(",") || "nothing"})`);
  }

  // ZERO INPUT MUST REFUSE, not agree.
  const zeroRefused = floorBreaches(evaluate({ policy: "", files: [] }, realRead, []).counts).length > 0;

  // A FLOOR OF ZERO IS NOT A FLOOR. Satisfying "add a floor" with a floor of nothing has to throw.
  let rejectsZeroFloor = false;
  try {
    floorBreaches(
      { entries: 9e9, filesRead: 9e9, spdxDeclared: 9e9, vendoredEntries: 9e9, licenses: new Set(["a", "b", "c"]) },
      { ...FLOORS, ENTRIES: 0 },
    );
  } catch {
    rejectsZeroFloor = true;
  }

  for (const m of misses) console.error(m);
  console.log(`MANIFEST_LICENSE_CONTROLS_CAUGHT=${caught}/${controls.length}`);
  console.log(`MANIFEST_LICENSE_ZERO_INPUT_REFUSED=${zeroRefused ? "yes" : "NO"}`);
  console.log(`MANIFEST_LICENSE_FLOOR_OF_ZERO_REJECTED=${rejectsZeroFloor ? "yes" : "NO"}`);
  console.log(`MANIFEST_LICENSE_BASELINE_GREEN=${baseline.failures.length === 0 && baselineFloors.length === 0 ? "yes" : "NO"}`);
  const ok = caught === controls.length && zeroRefused && rejectsZeroFloor;
  console.log(`MANIFEST_LICENSE_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

// ------------------------------------------------------------------------------------------------
if (IS_ENTRY) main();

function main() {
const manifest = loadManifest();
const tracked = trackedFiles();
const { failures, counts } = evaluate(manifest, readDeclaredLicense, tracked);
const breaches = floorBreaches(counts);
const pass = failures.length === 0 && breaches.length === 0;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        MANIFEST_LICENSE_PARITY: pass ? "PASS" : "FAIL",
        counts: { ...counts, licenses: [...counts.licenses].sort() },
        floorBreaches: breaches,
        failures: failures.slice(0, 200),
        failureCount: failures.length,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `manifest license parity: ${counts.entries} entries, ${counts.filesRead} files read, ` +
      `${counts.spdxDeclared} declaring their own license, ${counts.vendoredEntries} vendored third-party`,
  );
  console.log(`  licenses observed on disk: ${[...counts.licenses].sort().join(", ")}`);
  for (const b of breaches) console.error(`  INPUT_FLOOR  ${b}\n      refusing rather than reporting a pass this did not earn.`);
  for (const f of failures.slice(0, 60)) console.error(`  ${f.rule}\n      ${f.message}`);
  if (failures.length > 60) console.error(`  ... and ${failures.length - 60} more`);
  console.log(`MANIFEST_ENTRIES_CHECKED=${counts.entries}`);
  console.log(`MANIFEST_FILES_DECLARING_A_LICENSE=${counts.spdxDeclared}`);
  console.log(`MANIFEST_LICENSE_DISAGREEMENTS=${failures.filter((f) => f.rule === "LICENSE_DISAGREES_WITH_SPDX").length}`);
  console.log(`MANIFEST_FALSE_CLEAN_ROOM_CLAIMS=${failures.filter((f) => f.rule.includes("CLEAN_ROOM")).length}`);
  console.log(`MANIFEST_LICENSE_PARITY=${pass ? "PASS" : "FAIL"}`);
}

process.exit(pass ? 0 : 1);
}
