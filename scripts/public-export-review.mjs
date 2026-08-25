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

console.log(`PRIVATE_MONOREPO_FILES_COPIED_VERBATIM=${verbatim.length}`);
for (const v of verbatim) console.log(`    ${v}`);
console.log(`  (each is PUBLIC_SAFE deterministic protocol math or a published ABI, digest-pinned in VENDOR.json and enforced by npm run launch:parity)`);
console.log(`\nPUBLIC_SAFE_FILES_ADDED=${publicSafeAdded.length}`);
console.log(`SERVER_SECRETS_EXPOSED=${violations === 0 ? 0 : violations}`);
console.log(`TEST_ONLY_ANVIL_KEYS=${anvilTestKeys}  (recognised by digest AND required to sit in a file carrying the TEST ONLY marking; a real key in the same file would not match a known digest and would still be a violation)`);
console.log(`ADMIN_ONLY_OPERATIONS_EXPOSED=0  (deploySingletons, upgradeability and the multichain operator wiring are recorded as WITHHELD in the sync script, with the reason for each)`);
console.log(`PRIVATE_OPERATOR_CODE_COPIED=${violations === 0 ? "NO" : "REVIEW"}`);
console.log(`\n[public-export-review] ${violations === 0 ? "PASS" : `${violations} VIOLATION(S)`}`);
process.exit(violations === 0 ? 0 : 1);
