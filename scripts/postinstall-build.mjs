#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Compile the two TypeScript packages after install, so `npm install` is genuinely enough — which
// is what the README tells a creator to run and what a fresh clone gets.
//
// BUILD OUTPUT IS NOT COMMITTED. `dist/` was tracked for a while because the first `git add -A`
// beat the .gitignore entry, which put thirty generated files into the PUBLIC EXPORT MANIFEST as
// though they were exported source. A manifest that lists build artifacts is describing a local
// machine, not a publication.
//
// THIS MUST NEVER BREAK AN INSTALL. The offline creator kit is plain ESM with no build step at all;
// if tsc is unavailable or the compile fails, `relics init/preview/validate/export` still work and
// only MODE B is unavailable. So a failure here WARNS and exits 0, and says exactly what is
// degraded rather than failing an install for a feature the user may never touch.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.RELICS_SKIP_POSTINSTALL === "1") process.exit(0);

const tsc = join(ROOT, "node_modules", ".bin", "tsc");
if (!existsSync(tsc)) {
  console.warn("[relics] typescript is not installed; the offline creator kit is unaffected. Run `npm run build:packages` before using `relics agent`.");
  process.exit(0);
}

for (const pkg of ["packages/launch-sdk", "packages/agent-flow"]) {
  const r = spawnSync(tsc, ["-p", join(ROOT, pkg, "tsconfig.json")], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    console.warn(`[relics] could not build ${pkg}: the OFFLINE creator kit still works (it has no build step). \`relics agent\` needs \`npm run build:packages\` to succeed first.`);
    console.warn((r.stdout ?? "").split("\n").slice(0, 3).join("\n"));
    process.exit(0);
  }
}
console.log("[relics] launch SDK and agent-flow compiled.");
