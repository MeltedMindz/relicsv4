#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// FRESH-CLONE VERIFICATION.
//
// Clones the PUBLISHED repository into a temp directory, installs it the way the README tells a
// creator to, and runs the documented flow there. Nothing from this working tree is reused.
//
// WHY A CLONE AND NOT THIS DIRECTORY. Everything here works partly because of state that will not
// exist for anyone else: node_modules laid out by a workspace install that happened before some
// packages existed, build output from a dozen incremental `tsc` runs, a `.gitignore`d `dist/` that
// a clone does not receive, and untracked files. A repository is only publishable if it works from
// what was actually PUSHED — and the way to know that is to fetch what was pushed.
// ================================================================================================
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REMOTE = process.env.FRESH_CLONE_REMOTE ?? "https://github.com/MeltedMindz/relicsv4.git";
const REF = process.env.FRESH_CLONE_REF ?? "main";
const dir = mkdtempSync(join(tmpdir(), "relics-fresh-"));
let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.error(`  FAIL  ${m}`); failures++; };

function run(label, cmd, opts = {}) {
  const r = spawnSync("bash", ["-lc", cmd], { cwd: opts.cwd ?? dir, encoding: "utf8", timeout: opts.timeout ?? 900_000, env: { ...process.env, ...opts.env } });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0 && !opts.allowFail) { fail(`${label}: exit ${r.status}\n         ${out.split("\n").filter(Boolean).slice(-3).join("\n         ").slice(0, 300)}`); return { ok: false, out }; }
  ok(label);
  return { ok: true, out };
}

console.log(`\n=== fresh clone of ${REMOTE} @ ${REF} ===\n`);
try {
  run("git clone", `git clone --depth 1 --branch ${REF} ${REMOTE} repo`, { cwd: dir });
  const repo = join(dir, "repo");
  if (!existsSync(repo)) { fail("the clone produced no repo directory"); process.exit(1); }

  run("npm install", "npm install --no-audit --no-fund", { cwd: repo, timeout: 1_800_000 });

  // ---- MODE A, exactly as the README documents it -------------------------------------------
  run("relics --version", "node packages/creator-cli/bin/relics.js --version", { cwd: repo });
  run("relics templates", "node packages/creator-cli/bin/relics.js templates", { cwd: repo });
  run("scaffold + validate + export a project", `
    set -e
    node packages/creator-cli/bin/relics.js init /tmp/fresh-proj --template solidity-svg-params --name "Fresh Clone" --symbol FRC --force
    node -e '
      const fs=require("fs"),p="/tmp/fresh-proj/relics.config.json";
      const d=JSON.parse(fs.readFileSync(p,"utf8"));
      d.earnings=d.earnings||{}; d.earnings.creatorRecipient="0x00000000000000000000000000000000000000A1";
      d.market=d.market||{}; d.market.antiSnipeMode="PROTECTED_98_MINUTES";
      fs.writeFileSync(p,JSON.stringify(d,null,2)+"\\n");'
    node packages/creator-cli/bin/relics.js validate /tmp/fresh-proj
    node packages/creator-cli/bin/relics.js export /tmp/fresh-proj --output /tmp/fresh-proj/project.relics
    test -s /tmp/fresh-proj/project.relics
  `, { cwd: repo });

  // ---- MODE B is REACHABLE from a clone, without any private tree -----------------------------
  run("the launch SDK builds from what was pushed", "npm run launch:build && npx tsc -p packages/agent-flow/tsconfig.json", { cwd: repo, timeout: 900_000 });
  run("agent provenance (no chain, no private tree)", "node packages/creator-cli/bin/relics.js agent provenance --json | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(j.result.launchParams.fieldCount!==19)process.exit(1)})\"", { cwd: repo });
  run("agent init scaffolds a policy", "node packages/creator-cli/bin/relics.js agent init --workspace /tmp/fresh-proj --force", { cwd: repo });
  run("agent next answers", "node packages/creator-cli/bin/relics.js agent next --workspace /tmp/fresh-proj --json | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j.result.action)process.exit(1)})\"", { cwd: repo });

  // ---- the gates a public clone can run WITHOUT the private tree --------------------------------
  run("launch:parity (public arm only)", "npm run launch:parity", { cwd: repo });
  run("agent:commands", "npm run agent:commands", { cwd: repo });
  run("agent:controls", "npm run agent:controls", { cwd: repo, timeout: 1_200_000 });
  run("kit:offline", "npm run kit:offline", { cwd: repo, timeout: 900_000 });
  run("kit:test", "npm run kit:test", { cwd: repo, timeout: 900_000 });
  run("secrets:scan", "npm run secrets:scan", { cwd: repo });

  // ---- and the maintainer-only gate must SKIP cleanly rather than crash -------------------------
  const sync = run("launch:sync --check skips cleanly with no private tree", "npm run launch:sync -- --check", { cwd: repo });
  if (sync.ok && !/MAINTAINER-SIDE|unset/i.test(sync.out)) fail("launch:sync did not explain that it is maintainer-side; a public clone should be told why it skipped");

  // ---- live chain reads, only when a credential is present ---------------------------------------
  if (process.env.ETHEREUM_RPC_URL) {
    run("agent capabilities against live Ethereum", "node packages/creator-cli/bin/relics.js agent capabilities --workspace /tmp/fresh-proj --chain 1 --json | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(j.result.chains[0].launchable!=='PROVEN')process.exit(1)})\"", { cwd: repo });
  } else {
    console.log("  skip  live chain read: ETHEREUM_RPC_URL is unset. NOT counted as a pass.");
  }
} finally {
  rmSync("/tmp/fresh-proj", { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\n[fresh-clone] PASS" : `\n[fresh-clone] ${failures} FAILURE(S)`);
console.log(`FRESH_PUBLIC_CLONE_AUTONOMOUS_FLOW=${failures === 0 ? "PASS" : "FAIL"}`);
process.exit(failures === 0 ? 0 : 1);
