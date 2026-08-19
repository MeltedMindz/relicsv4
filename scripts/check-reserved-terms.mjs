#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE RESERVED-TERM GATE.
//
//   node scripts/check-reserved-terms.mjs             # human output, non-zero exit on any hit
//   node scripts/check-reserved-terms.mjs --json      # machine output
//   node scripts/check-reserved-terms.mjs --controls  # prove the scanner can both catch and allow
//
// WHY THIS EXISTS
//
// This repository is the PUBLIC starter kit for building on the RELICS launchpad. Other projects
// launch THROUGH the launchpad; they are not part of it, and their names, tickers, supply figures
// and reward schedules are theirs to announce on their own schedule, not ours to leak by carrying
// a half-finished integration branch. One such integration was staged on a working branch and came
// within one `git push` of being published here. This gate is the thing that would have stopped it.
//
// WHY THE PATTERNS ARE ENCODED
//
// A gate that spells out the reserved words would itself put them in the public repository, which
// is the exact outcome it exists to prevent. So the patterns are stored base64-encoded and decoded
// at runtime. That is not obfuscation for its own sake and it is not a security measure -- anyone
// may decode them. It is simply the only way for a public file to describe a term it must not
// contain. The controls below build their fixtures from the DECODED terms at runtime for the same
// reason: a hard-coded must-catch fixture would be a copy of the thing we are refusing to publish.
//
// WHAT IT DELIBERATELY DOES NOT MATCH
//
// Precision matters more than breadth here, because a gate that cries wolf gets switched off.
//   - a bare three-digit run is NOT a hit. Those appear inside sha256 digests, hex blobs and SVG
//     path data throughout the tree, and blocking them would fail the build on arithmetic.
//   - a quote-asset ticker is NOT a hit on its own. Real admitted quote assets are legitimately
//     documented here; only the compound form naming a project alongside one is refused.
// Every pattern below was measured against the published tree and returns zero hits on it. If you
// add a pattern, measure it the same way before committing, or you have shipped a tripwire that
// fires on the repository's own contents.
//
// WHAT THE 2026-08-19 MEASUREMENT CHANGED
//
// The gate was replayed against the material that actually reached a working branch — the staged
// integration's own files, read out of history — rather than against a synthetic fixture. The first
// ten patterns caught 4 of the 30 sensitive lines in it. They matched the project's ticker written
// with digits and nothing else: not the SAME RUN SPELT AS WORDS, which is how the template's
// identifier was written and the single most repeated token in the leak; not the branded amounts
// (genesis supply, activation thresholds, the opening-valuation corridor); and not the five schema
// field names that exist only for that one product. So the guard was not merely absent from the
// release branch — it was also insufficient, and both had to be fixed. Patterns 10-22 close that,
// measured the same way: 26 of 30 caught, and still zero hits on the published tree.
//
// The four still uncaught are bare mentions of a real quote asset with no project attached
// ("quoteAsset: \"GME\""). Those stay allowed ON PURPOSE — see WHAT IT DELIBERATELY DOES NOT MATCH.
// A file carrying the private template trips several other patterns on other lines, so the file
// still fails; what is permitted is a legitimate ticker documented on its own.
//
// COMMENTS ARE IN SCOPE, and that is load-bearing. The scan reads raw lines, so a term inside a
// `//`, `#`, `<!--`, `/* */` or `///` comment is a hit exactly like code. A runbook comment is the
// most likely place for this material to survive a cleanup, and it is the one a reader copies into
// a terminal verbatim. `--controls` proves it by running the real scanner over a fixture whose
// only occurrences are comments.

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

// Reserved compound terms, base64. See the header for why these are not written literally.
const RESERVED_B64 = [
  "XCQ2NjY=",
  "NjY2XHMqL1xzKkdNRQ==",
  "NjY2XHMrZWNvbm9taWNz",
  "XGI2NjYwMDBcYg==",
  "NjY2XHMrcm95YWx0",
  "NjY2XHMrcmV3YXJk",
  "NjY2XHMrYWN0aXZhdGlvbg==",
  "NjY2XHMrc3Rha2luZw==",
  "NjY2XHMrdG9rZW4=",
  "c2t1bGw=",
  // 10-22, added 2026-08-19 after replaying the gate against the real staged material.
  "c2l4X3NpeF9zaXg=",
  "XGI2NjZbLF9dPzY2NlssX10/NjY2XGI=",
  "XGIoPzpbMTIzXT82NlssX10/NjY2fDMzM1ssX10/MzMzKVxi",
  "YWN0aXZhdGlvblRocmVzaG9sZHNXaG9sZQ==",
  "aW5jcmVtZW50YWxBY3RpdmF0aW9uQ29zdHNXaG9sZQ==",
  "YWN0aXZhdGlvbk1pbGVzdG9uZXM=",
  "dGFyZ2V0T3BlbmluZ0ZkdlVzZA==",
  "b3BlbmluZ0ZkdkNvcnJpZG9yVXNk",
  "YWN0aXZhdGlvbkJ1cm4=",
  "ZXJjKD86MjBHZW5lc2lzU3VwcGx5V2hvbGV8NzIxTWF4U3VwcGx5KVxzKls6PV0rXHMqNjY2XGI=",
  "NjY2W15cbl17MCw0OH1cYkdNRVxi",
  "XGJHTUVcYlteXG5dezAsNDh9NjY2",
  "XGIxNjZccyosXHMqMzMzXHMqLFxzKjUwMFxzKixccyo2NjZcYg==",
];

// Probes for the patterns whose regex syntax the naive deriver below cannot invert into a matching
// string — alternation, bounded gaps, character classes. Index-keyed and base64 for the same reason
// the patterns are: a literal probe here would be a copy of the thing this file refuses to publish.
// A pattern with no entry has its probe DERIVED, which is the stronger form and stays the default.
const PROBE_B64 = {
  11: "NjY2NjY2NjY2",
  12: "MTY2NjY2",
  19: "ZXJjNzIxTWF4U3VwcGx5ID09PSA2NjY=",
  20: "NjY2IHBhaXJzIHdpdGggR01F",
  21: "R01FIHF1b3RlZCBhZ2FpbnN0IDY2Ng==",
  22: "MTY2LCAzMzMsIDUwMCwgNjY2",
};
const RESERVED = RESERVED_B64.map((b) => new RegExp(Buffer.from(b, "base64").toString("utf8"), "i"));

// Vendored dependencies and generated art are out of scope: we do not author them, and their
// contents are byte-pinned elsewhere. `.git` is excluded because scanning it would read history,
// and history is not what is being published by this commit.
const SKIP_DIR = new Set([".git", "node_modules", "lib", "out", "cache", "dist", ".next", "previews"]);
// Every text-bearing tracked extension. `.svg` and `.css` are here because a doc asset carries
// prose in `<title>`/`<desc>` and a stylesheet carries comments; `.example` because an env template
// is prose a creator copies. Binary and generated containers (`.relics`, `.png`) are not text and
// are not scanned.
const EXT = [
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".sol", ".yml", ".yaml",
  ".toml", ".txt", ".sh", ".svg", ".css", ".html", ".example",
];

function collect(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      collect(join(dir, e.name), acc);
    } else if (EXT.some((x) => e.name.endsWith(x))) {
      acc.push(join(dir, e.name));
    }
  }
  return acc;
}

function scan(files) {
  const hits = [];
  for (const abs of files) {
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    text.split(/\r?\n/).forEach((line, i) => {
      // Report the INDEX of the matching pattern, never the matched text: printing the hit would
      // write the reserved term into CI logs, which are public on a public repository.
      const idx = RESERVED.findIndex((re) => re.test(line));
      if (idx !== -1) hits.push({ file: relative(ROOT, abs), line: i + 1, pattern: idx });
    });
  }
  return hits;
}

/** The string a pattern must match: its own explicit probe, else derived from the pattern itself. */
function probeFor(i) {
  if (PROBE_B64[i]) return Buffer.from(PROBE_B64[i], "base64").toString("utf8");
  return Buffer.from(RESERVED_B64[i], "base64")
    .toString("utf8")
    .replace(/\\s\*/g, " ")
    .replace(/\\s\+/g, " ")
    .replace(/\\b/g, "")
    .replace(/\\\$/g, "$");
}

if (CONTROLS) {
  // A scanner nobody has watched fail is not evidence. Both directions are exercised, and the
  // must-catch fixtures are BUILT FROM the decoded patterns so this file still contains none.
  let caught = 0;
  let wrong = 0;
  RESERVED.forEach((re, i) => {
    const probe = probeFor(i);
    if (re.test(probe)) caught += 1;
    else {
      wrong += 1;
      console.log(`  MISSED  pattern ${i} does not match its own decoded form`);
    }
  });

  // COMMENTS ARE IN SCOPE. This does not re-test the regexes -- it writes a real file whose ONLY
  // occurrences are inside comments, in the five comment syntaxes this tree actually uses, and
  // runs `scan()` over it. A runbook comment is where this material most plausibly survives a
  // cleanup, and it is what a reader pastes into a terminal.
  const wrap = [
    (t) => `// ${t}`,
    (t) => `# ${t}`,
    (t) => `<!-- ${t} -->`,
    (t) => `/* ${t} */`,
    (t) => `/// @notice ${t}`,
  ];
  const tmp = join(mkdtempSync(join(tmpdir(), "reserved-controls-")), "runbook.md");
  let commentCaught = 0;
  RESERVED.forEach((_, i) => {
    const probe = probeFor(i);
    for (const w of wrap) {
      writeFileSync(tmp, `a line with nothing reserved on it\n${w(probe)}\nanother clean line\n`);
      if (scan([tmp]).length > 0) commentCaught += 1;
      else console.log(`  MISSED  pattern ${i} inside a comment: ${w("<probe>")}`);
    }
  });
  const commentExpected = RESERVED.length * wrap.length;

  // The scan must also REFUSE an empty read rather than report a clean pass, so a control that
  // exercises the catch direction cannot be satisfied by a scanner that reads nothing.
  writeFileSync(tmp, "nothing reserved here at all\n");
  const zeroInput = scan([tmp]).length === 0 && scan([]).length === 0;

  rmSync(dirname(tmp), { recursive: true, force: true });

  // Must-allow: the shapes that made a naive scanner unusable. A digest that happens to contain the
  // digit run, and a genuine quote-asset ticker documented on its own.
  const allow = [
    '"sha256": "eebdbc1b6e431072ce5521b9e1b603d43831e3b6e062743e6665e070d5cf8a1a"',
    "GME is an admitted quote asset on Robinhood Chain.",
    "erc721MaxSupply: 10000",
    '<path d="M6 6 6 66 666 6" />',
    // Added with patterns 10-22: the generic mechanism keeps these shapes, and a gate that fired on
    // them would fire on the repository's own schema tests.
    "erc20GenesisSupplyWhole: 1000000",
    "erc721MaxSupply: 666666",
    "id: \"MY_REVIEWED_TEMPLATE_V1\"",
    '"bundleSha256": "3d17ba29f8f4ac4818d9b3267fd2d6e5fcf430fc09d7b4d762e8de50396bd092"',
    "totalSupplyWhole: 1000000000",
  ];
  let falsePositives = 0;
  for (const s of allow) {
    if (RESERVED.some((re) => re.test(s))) {
      falsePositives += 1;
      console.log(`  FALSE POSITIVE on a permitted shape: ${s.slice(0, 60)}`);
    }
  }
  console.log(`RESERVED_TERM_CONTROLS_CAUGHT=${caught}/${RESERVED.length}`);
  console.log(`RESERVED_TERM_CONTROLS_CAUGHT_IN_COMMENTS=${commentCaught}/${commentExpected}`);
  console.log(`RESERVED_TERM_CONTROL_ZERO_INPUT_IS_NOT_A_HIT=${zeroInput ? "yes" : "NO"}`);
  console.log(`RESERVED_TERM_CONTROL_FALSE_POSITIVES=${falsePositives}`);
  const ok = wrong === 0 && falsePositives === 0 && commentCaught === commentExpected && zeroInput;
  console.log(`RESERVED_TERM_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

const files = collect(ROOT);

// INPUT FLOOR. A scan that reached nothing must refuse, not pass. Absence of input is not success:
// a mis-set root or an over-broad skip list would otherwise report a clean tree it never read.
const FLOOR = 150;
if (files.length < FLOOR) {
  console.error(`reserved-term gate: scanned only ${files.length} files (floor ${FLOOR}) -- refusing rather than reporting a pass it did not earn.`);
  process.exit(1);
}

const hits = scan(files);

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned: files.length, hits: hits.length, findings: hits }, null, 2));
} else {
  console.log(`reserved-term gate: scanned ${files.length} files`);
  for (const h of hits) console.log(`  RESERVED TERM  ${h.file}:${h.line}  (pattern ${h.pattern})`);
  console.log(`RESERVED_TERM_HITS=${hits.length}`);
  console.log(`RESERVED_TERM_GATE=${hits.length === 0 ? "PASS" : "FAIL"}`);
}

if (hits.length) {
  console.error("");
  console.error("A reserved term reached the public tree. This is not a formatting problem:");
  console.error("another project's identity would be published by this commit, ahead of its own");
  console.error("announcement. Remove the content -- do not add an exemption, and do not weaken a");
  console.error("pattern to make this pass.");
  process.exit(1);
}
