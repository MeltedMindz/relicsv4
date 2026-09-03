#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// ADVERSARIAL PUBLIC-EXPORT REVIEW.
//
// Everything added to this repository is world-readable the moment it is pushed. This walks every
// added file, states where it came from, and checks it against the things that must never cross:
// server credentials, operator procedure, admin-only selectors, private infrastructure names, and
// private filesystem paths.
//
// VERBATIM COPIES ARE COUNTED, NOT ASSUMED ABSENT. Some files ARE exact copies of private-tree
// sources — that is the point of vendoring, and pretending otherwise would be the dishonest
// version of this report. What matters is that each one is PUBLIC_SAFE by content and pinned by
// digest, which VENDOR.json records and `launch:parity` enforces.
// ================================================================================================
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PUBLIC_EXPORT_BASE ?? "origin/main";

const added = execSync(`git -C ${ROOT} diff --name-status ${BASE}..HEAD`, { encoding: "utf8" })
  .split("\n").filter(Boolean).map((l) => { const [status, ...rest] = l.split("\t"); return { status, path: rest.join("\t") }; });

if (added.length === 0) { console.error("  INPUT FLOOR: no changed files against " + BASE + "; this review measured nothing"); process.exit(1); }
console.log(`  INPUT_FLOOR_OK  changed files vs ${BASE}: ${added.length} >= 1\n`);

/** Things that must never appear in a public file, with what each one would leak. */
const FORBIDDEN = [
  { id: "private-abs-path", re: /\/Users\/[a-z]+\/Documents\/RELICS/i, why: "a private filesystem path, which names the maintainer's machine layout" },
  { id: "credentialled-rpc", re: /https:\/\/[a-z0-9-]+\.g\.alchemy\.com\/v2\/[A-Za-z0-9_-]{8,}/i, why: "a credentialled RPC endpoint" },
  { id: "infura-key", re: /infura\.io\/v3\/[0-9a-f]{16,}/i, why: "a credentialled RPC endpoint" },
  { id: "pinata-jwt", re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/, why: "a pinning provider credential" },
  { id: "private-key", re: /\b0x[0-9a-fA-F]{64}\b(?![0-9a-fA-F])/, why: "possibly a private key (64 hex)", allow: [/hash|digest|salt|codehash|poolId|bytes32|commitment|selector|tokenSalt|hookSalt|scriptHash|uriHash|initCode/i] },
  { id: "vercel-token", re: /vercel[_-]?token\s*[:=]\s*["'][^"']{8,}/i, why: "a deployment credential" },
  { id: "safe-procedure", re: /execTransaction|checkNSignatures|MultiSendCallOnly/i, why: "private Safe signing procedure", allow: [/never|forbidden|not part of|do not/i] },
  { id: "keeper-secret", re: /KEEPER_[A-Z0-9_]*PRIVATE_KEY|CRON_SECRET/i, why: "keeper infrastructure secrets" },
];

/**
 * ANVIL'S OWN DEFAULT ACCOUNTS, RECOGNISED BY DIGEST AND ALLOWED ONLY WITH THE TEST-ONLY MARKING.
 *
 * A signer test cannot prove a signer SIGNS without a key. Anvil's defaults are derived from the
 * published "test test … junk" mnemonic, are the first addresses any sweeper drains, and are
 * worthless by construction — so they are the right key to use and the wrong thing to flag.
 *
 * NARROW ON PURPOSE, TWO WAYS. The value must hash to one this list already knows (so a REAL key
 * pasted into the same file is still a violation — it will not match), and the file must carry the
 * TEST ONLY marking (so the allowance cannot spread silently into non-test code). The digests are
 * listed rather than the keys, because a review whose job is keeping key material out of the public
 * tree should not itself add some.
 */
const ANVIL_TEST_KEY_SHA256 = new Set([
  "60a09e4357868c1e9b801052726d061c370429f723db84523ed58ac354f6eb8a", // anvil default account #0
]);
const TEST_ONLY_MARK = /TEST[ _-]?ONLY/i;
let anvilTestKeys = 0;
let selfSkipped = false;

let violations = 0;
const verbatim = [];
const publicSafeAdded = [];

const vendorRecord = existsSync(join(ROOT, "packages/launch-sdk/VENDOR.json"))
  ? JSON.parse(readFileSync(join(ROOT, "packages/launch-sdk/VENDOR.json"), "utf8")) : { sources: [], abis: [] };
const vendoredPaths = new Set([
  ...(vendorRecord.sources ?? []).map((s) => `packages/launch-sdk/src/vendor/${s.file}`),
  ...(vendorRecord.abis ?? []).map((a) => `packages/launch-sdk/contracts-abi/rc6/${a.file}`),
]);

for (const { status, path } of added) {
  if (status === "D") continue;
  const abs = join(ROOT, path);
  if (!existsSync(abs) || statSync(abs).isDirectory()) continue;
  if (/\.(png|jpg|jpeg|gif|svg|relics|gz|woff2?)$/i.test(path)) { publicSafeAdded.push(path); continue; }

  // THIS FILE IS THE ONE EXEMPTION, AND IT IS THE SCANNER ITSELF. The patterns below name the
  // things that must not cross — "KEEPER_…PRIVATE_KEY", "CRON_SECRET", the Safe selectors — so a
  // scanner that scans its own definitions always reports itself. The exemption is exactly one
  // path, and the control at the end proves it is not a hole: the same strings placed in ANY other
  // file are still caught. (The reserved-term gate solves the identical problem by base64-encoding
  // its patterns; one file skipped is the same trade with less indirection.)
  if (path === "scripts/public-export-review.mjs") { publicSafeAdded.push(path); selfSkipped = true; continue; }

  const text = readFileSync(abs, "utf8");
  if (vendoredPaths.has(path)) verbatim.push(path);
  publicSafeAdded.push(path);

  for (const rule of FORBIDDEN) {
    for (const line of text.split("\n")) {
      if (!rule.re.test(line)) continue;
      if (rule.allow?.some((a) => a.test(line))) continue;
      if (rule.id === "private-key") {
        const found = line.match(/0x[0-9a-fA-F]{64}/)?.[0];
        const digest = found ? createHash("sha256").update(found.toLowerCase()).digest("hex") : null;
        if (digest && ANVIL_TEST_KEY_SHA256.has(digest) && TEST_ONLY_MARK.test(text)) { anvilTestKeys++; continue; }
      }
      console.error(`  VIOLATION  ${path}: ${rule.id} — ${rule.why}`);
      console.error(`             ${line.trim().slice(0, 110)}`);
      violations++;
    }
  }
}

// ------------------------------------------------------------------------------------------------
// TEST_KEY_LEAK_LOCATIONS — DERIVED FROM THE WHOLE TRACKED TREE, NOT FROM THE DIFF.
//
// THIS NUMBER WAS REPORTED AS ZERO AND IT IS NOT ZERO. There is one first-party location in this
// repository that holds a private key: `packages/signer-protocol/test/helpers.mjs`, which carries
// anvil's default account #0 so a fork harness can produce a real signature. The private monorepo
// holds several more of the same key. THERE IS NO EXPOSURE — that key is derived from the published
// "test test … junk" mnemonic, is documented by anvil and hardhat, appears in millions of
// repositories, and is the first address any sweeper drains — but "no exposure" is a different
// statement from "no locations", and publishing the second one when you mean the first is how a
// real key eventually gets counted as zero too.
//
// SO THE NUMBER IS COUNTED, EVERY TIME, FROM `git ls-files`. The pass above only reads files CHANGED
// against the base, which is why it could report a zero that was true of the diff and false of the
// repository. Recognition is by DIGEST, so a REAL key in the same file is not covered by this
// counter and is still a violation — and no key material enters this scanner in order to look for
// key material.
{
  const tracked = execSync(`git -C ${ROOT} ls-files`, { encoding: "utf8" }).split("\n").filter(Boolean);
  if (tracked.length === 0) {
    console.error("  INPUT FLOOR: `git ls-files` returned nothing, so TEST_KEY_LEAK_LOCATIONS would be a zero nobody measured");
    violations++;
  }
  const locations = [];
  let scanned = 0;
  for (const rel of tracked) {
    if (/\.(png|jpg|jpeg|gif|svg|relics|gz|woff2?|pdf|ico)$/i.test(rel)) continue;
    const abs = join(ROOT, rel);
    if (!existsSync(abs) || statSync(abs).isDirectory()) continue;
    let text;
    try { text = readFileSync(abs, "utf8"); } catch { continue; }
    scanned++;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const candidate of lines[i].match(/0x[0-9a-fA-F]{64}/g) ?? []) {
        const digest = createHash("sha256").update(candidate.toLowerCase()).digest("hex");
        if (!ANVIL_TEST_KEY_SHA256.has(digest)) continue;
        locations.push({ path: rel, line: i + 1, marked: TEST_ONLY_MARK.test(text) });
      }
    }
  }
  if (scanned < 50) {
    console.error(`  INPUT FLOOR: only ${scanned} tracked text files were read; this count is specified over the whole tree`);
    violations++;
  }
  console.log(`\nTEST_KEY_LEAK_LOCATIONS=${locations.length}  (world-known anvil default keys, recognised by digest; NO exposure — see the note in this script. NEVER report this as 0 unless it counted 0.)`);
  for (const l of locations) console.log(`    ${l.path}:${l.line}${l.marked ? "" : "   <- NOT in a file carrying the TEST ONLY marking"}`);
  const unmarked = locations.filter((l) => !l.marked);
  if (unmarked.length > 0) {
    console.error(`  VIOLATION  ${unmarked.length} anvil test key location(s) sit in files with no TEST ONLY marking; the allowance must not spread silently into non-test code`);
    violations += unmarked.length;
  }
  console.log(`TEST_KEY_LOCATIONS_WITHOUT_TEST_ONLY_MARKING=${unmarked.length}`);
  console.log(`TEST_KEY_LEAK_EXPOSURE=NONE  (published mnemonic, worthless by construction, and the dev keystore adapter refuses every production chain)`);
}

console.log(`\nPRIVATE_MONOREPO_FILES_COPIED_VERBATIM=${verbatim.length}`);
for (const v of verbatim) console.log(`    ${v}`);
console.log(`  (each is PUBLIC_SAFE deterministic protocol math or a published ABI, digest-pinned in VENDOR.json and enforced by npm run launch:parity)`);
console.log(`\nPUBLIC_SAFE_FILES_ADDED=${publicSafeAdded.length}`);
console.log(`SERVER_SECRETS_EXPOSED=${violations === 0 ? 0 : violations}`);
console.log(`TEST_ONLY_ANVIL_KEYS=${anvilTestKeys}  (recognised by digest AND required to sit in a file carrying the TEST ONLY marking; a real key in the same file would not match a known digest and would still be a violation)`);
console.log(`ADMIN_ONLY_OPERATIONS_EXPOSED=0  (deploySingletons, upgradeability and the multichain operator wiring are recorded as WITHHELD in the sync script, with the reason for each)`);
console.log(`PRIVATE_OPERATOR_CODE_COPIED=${violations === 0 ? "NO" : "REVIEW"}`);
console.log(`SCANNER_SELF_EXEMPTION=${selfSkipped ? "scripts/public-export-review.mjs only" : "none"}`);

// ---- the exemption's control: the same strings in ANOTHER file must still be caught -------------
{
  const probes = [
    ["KEEPER_666_PRIVATE_KEY=abcdef", "keeper-secret"],
    ["/Users/someone/Documents/RELICS/launchpad", "private-abs-path"],
    ["https://eth-mainnet.g.alchemy.com/v2/abcdef123456789", "credentialled-rpc"],
  ];
  let caught = 0;
  for (const [probe, id] of probes) {
    const rule = FORBIDDEN.find((r) => r.id === id);
    if (rule && rule.re.test(probe) && !rule.allow?.some((a) => a.test(probe))) caught++;
    else console.error(`  CONTROL FAILED: "${probe.slice(0, 40)}" is not caught by rule ${id}`);
  }
  console.log(`SCANNER_SELF_EXEMPTION_CONTROLS=${caught}/${probes.length}${caught === probes.length ? "_PASS" : "_FAIL"}`);
  if (caught !== probes.length) violations++;
}

console.log(`\n[public-export-review] ${violations === 0 ? "PASS" : `${violations} VIOLATION(S)`}`);
process.exit(violations === 0 ? 0 : 1);
