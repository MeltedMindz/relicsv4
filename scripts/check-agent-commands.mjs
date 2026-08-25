#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Every `agent <sub>` the next-action contract tells an agent to run must be one the CLI answers.
//
// WHY A GATE AND NOT A FIX. Two next-actions named subcommands that were never implemented
// (`agent finalise`, `agent art-check`), so an agent following `commands` literally — which is the
// entire point of that field — got `unknown subcommand` and exit 2. Fixing the two instances would
// have left the shape intact: nothing stopped the third. The CLI's dispatcher is the authority and
// the list is DERIVED from it, so a next-action naming a command nobody wrote fails here.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dispatcher = readFileSync(join(ROOT, "packages/creator-cli/src/commands/agent.js"), "utf8");
const nextAction = readFileSync(join(ROOT, "packages/agent-flow/src/nextAction.ts"), "utf8");

/** The real surface: every `case "x":` in the dispatcher. */
const implemented = new Set([...dispatcher.matchAll(/case\s+"([a-z-]+)"\s*:/g)].map((m) => m[1]));
/**
 * What the next-action contract tells an agent to RUN — anchored to the literal command form.
 *
 * The first version matched /agent\s+([a-z-]+)/ anywhere, which happily extracted "never" and
 * "that" out of ordinary prose like "a signer that checks it independently". A gate that reports
 * imaginary failures gets ignored exactly as fast as one that reports none.
 */
const named = new Set([...nextAction.matchAll(/npm run kit -- agent ([a-z-]+)/g)].map((m) => m[1]));

let failures = 0;
if (implemented.size < 10) { console.error(`  INPUT FLOOR: only ${implemented.size} subcommands found in the dispatcher; this gate parsed nothing useful`); process.exit(1); }
if (named.size < 5) { console.error(`  INPUT FLOOR: only ${named.size} commands found in nextAction; this gate parsed nothing useful`); process.exit(1); }
console.log(`  INPUT_FLOOR_OK  dispatcher subcommands: ${implemented.size} >= 10`);
console.log(`  INPUT_FLOOR_OK  next-action commands: ${named.size} >= 5`);

for (const c of [...named].sort()) {
  if (!implemented.has(c)) { console.error(`  FAIL  next-action tells an agent to run \`agent ${c}\`, which the CLI does not answer to`); failures++; }
  else console.log(`  ok    agent ${c}`);
}

// And the declared list must match the dispatcher too, so the export cannot rot separately.
const declared = [...(nextAction.match(/NEXT_ACTION_SUBCOMMANDS = \[([\s\S]*?)\] as const/)?.[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
for (const c of declared) if (!implemented.has(c)) { console.error(`  FAIL  NEXT_ACTION_SUBCOMMANDS lists "${c}", which the CLI does not answer to`); failures++; }
for (const c of implemented) if (!declared.includes(c) && !["agent", "launch"].includes(c)) { console.error(`  FAIL  the CLI answers "${c}" but NEXT_ACTION_SUBCOMMANDS does not list it`); failures++; }

console.log(failures === 0 ? "\n[agent-commands] PASS" : `\n[agent-commands] ${failures} FAILURE(S)`);
console.log(`AGENT_NEXT_ACTION_COMMANDS_ALL_EXIST=${failures === 0 ? "YES" : "NO"}`);
process.exit(failures === 0 ? 0 : 1);
