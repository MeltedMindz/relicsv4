#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE NEGATIVE CONTROL FOR THE WAVE-1 E2E — break the wiring, require the proof to go red.
//
// THE FAILURE THIS EXISTS TO CATCH IS A PASSING RUN THAT MEASURED NOTHING. `e2e-wave1-runtime.mjs`
// ends in a `PASS` line, and a `PASS` line is worth exactly as much as the last time somebody
// watched it fail. Every mutation below removes the runtime election in a way that a reader of the
// diff would plausibly call a simplification, and each one must turn the harness red.
//
// A VALID PICTURE FROM THE WRONG RUNTIME IS NOT SUCCESS. That is the whole point: a launch built by
// the mutated wiring SUCCEEDS on chain. The pool opens, the collection deploys, `tokenURI` returns
// a perfectly good SVG — drawn by the generic runtime, not the one the creator chose, permanently.
// Nothing but the decoded selector separates that from the real thing, which is why the harness
// decodes it and why this file proves the harness would notice.
//
// AN ANCHOR THAT NO LONGER MATCHES IS A SURVIVAL, NOT A PASS. A mutation whose `from` string has
// drifted out of the source changes nothing and would otherwise score free — it is reported as
// SURVIVED with that reason, the same rule the signer's mutation harness uses.
// ================================================================================================
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS = join(ROOT, "scripts", "e2e-wave1-runtime.mjs");
const LAUNCH = join(ROOT, "packages", "creator-cli", "src", "commands", "agent-launch.js");

const MUTATIONS = [
  {
    id: "the election is dropped from the selector",
    file: LAUNCH,
    // The exact shape the code had before this wave: a bare template id with no runtime half. It
    // is not a syntax error, it is not a type error, and every launch it builds succeeds.
    from: "      artTemplateId: encodeArtSelector(artSelector.artRuntimeId, artSelector.artSource.templateId),",
    to: "      artTemplateId: BigInt(artSelector.artSource.templateId),",
    expect: "the final calldata must elect nothing, so the harness must refuse",
  },
  {
    id: "the election is hardcoded to the generic runtime",
    file: LAUNCH,
    from: "      artTemplateId: encodeArtSelector(artSelector.artRuntimeId, artSelector.artSource.templateId),",
    to: "      artTemplateId: encodeArtSelector(1, artSelector.artSource.templateId),",
    expect: "the final calldata must elect runtime 1, so the harness must refuse",
  },
  {
    id: "the live registry read is replaced by a plausible constant",
    file: LAUNCH,
    // The most tempting mutation of all: id 3 is genuinely correct for compass on all three chains
    // today. It is still wrong, because registry ids are per chain and chosen by the registering
    // authority — and it is wrong for alluvium in the same run, which is how the harness sees it.
    from: "  const elected = await sdk.resolveArtRuntime(made.client, profile.contracts.artRuntimeRegistry, runtimeTag);",
    to: "  const elected = { state: \"ACTIVE\", artRuntimeId: 3, detail: \"hardcoded\", registry: null, tagHash: null, runtimeAddress: null, runtimeCodeBytes: null, artRuntimeMode: null, artRuntimeVersion: null, active: true, exists: true, registeredIds: [], declaredCount: null, complete: true, logSource: null, blockNumber: null };",
    expect: "alluvium must then elect 3 rather than 4, so the harness must refuse",
  },
];

const args = process.argv.slice(2);
const reuse = args.includes("--reuse-node") ? args[args.indexOf("--reuse-node") + 1] : null;

function runHarness() {
  const result = spawnSync(process.execPath, [HARNESS, ...(reuse ? ["--reuse-node", reuse] : [])], { encoding: "utf8", cwd: ROOT, env: process.env });
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const flag = (key) => (new RegExp(`^${key}=(.*)$`, "m").exec(out)?.[1] ?? "MISSING");
  return { status: result.status, out, verdict: flag("PUBLIC_CLI_WAVE1_RUNTIME_E2E"), compass: flag("PUBLIC_CLI_COMPASS_FINAL_RUNTIME_ID"), alluvium: flag("PUBLIC_CLI_ALLUVIUM_FINAL_RUNTIME_ID") };
}

const backupDir = mkdtempSync(join(tmpdir(), "relics-wave1-controls-"));
const backup = join(backupDir, "agent-launch.js");
copyFileSync(LAUNCH, backup);
// RESTORE IS IDEMPOTENT AND SURVIVES THE EXIT HOOK. The backup directory is removed by the hook
// itself, AFTER the final restore, so nothing here can leave a mutated guard on disk — the first
// version deleted the backup before `process.exit` fired its own restore and crashed on the copy.
let restored = false;
const restore = () => {
  if (restored) return;
  copyFileSync(backup, LAUNCH);
};
const finish = () => {
  restore();
  restored = true;
  rmSync(backupDir, { recursive: true, force: true });
};
process.on("exit", finish);
process.on("SIGINT", () => { finish(); process.exit(130); });

// ---- THE GREEN BASELINE. Without it every mutation below would score CAUGHT on a harness that was
// already red for an unrelated reason, which is the cheapest way to fake this whole file.
console.log("baseline:");
const baseline = runHarness();
if (baseline.verdict === "SKIPPED") {
  console.log("\nSKIPPED — the harness could not run (no anvil, or no endpoint to fork from). SKIPPED IS NOT PASSED.");
  console.log("\nWRONG_RUNTIME_VALID_RENDER_CAN_PASS=NOT_MEASURED");
  process.exit(0);
}
if (baseline.verdict !== "PASS") {
  console.log(baseline.out.slice(-3000));
  console.log("\nBASELINE IS RED. Every control below would score a free CAUGHT; fix the harness first.");
  console.log("\nWRONG_RUNTIME_VALID_RENDER_CAN_PASS=NOT_MEASURED");
  process.exit(1);
}
console.log(`  PASS  compass=${baseline.compass} alluvium=${baseline.alluvium}\n`);

let survived = 0;
for (const mutation of MUTATIONS) {
  const original = readFileSync(mutation.file, "utf8");
  if (!original.includes(mutation.from)) {
    survived++;
    console.log(`SURVIVED  ${mutation.id}\n          ANCHOR NOT FOUND. This mutation changed nothing; it has been scoring a free pass.`);
    continue;
  }
  try {
    writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
    const run = runHarness();
    const red = run.verdict !== "PASS" && run.status !== 0;
    if (red) console.log(`CAUGHT    ${mutation.id}\n          -> ${mutation.expect} (verdict ${run.verdict}, compass=${run.compass} alluvium=${run.alluvium})`);
    else {
      survived++;
      console.log(`SURVIVED  ${mutation.id}\n          the harness still reported ${run.verdict} with compass=${run.compass} alluvium=${run.alluvium}`);
    }
  } finally {
    restore();
  }
}

console.log(`\nWAVE1_E2E_MUTATIONS=${MUTATIONS.length} SURVIVED=${survived}`);
console.log(`WRONG_RUNTIME_VALID_RENDER_CAN_PASS=${survived === 0 ? "NO" : "YES"}`);
process.exit(survived === 0 ? 0 : 1);
