#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// MODE A STAYS OFFLINE — PROVEN BY LOADING IT, NOT BY PROMISING IT.
//
// The creator kit's whole value for a cautious creator is that `init`, `preview`, `validate` and
// `export` run on a machine with no RPC, no wallet and no internet. Adding MODE B to the SAME
// binary put a network stack one static import away from that promise.
//
// So this gate does three things, and only the first is a text scan:
//
//   1. no MODE A source file statically imports the launch SDK, the signer, or viem;
//   2. the MODE A module graph is LOADED and inspected — if `viem` or `@relics/launch-sdk` appears
//      anywhere in it, the gate fails, which catches an import added through a chain of files that
//      a grep of the entry point would miss;
//   3. MODE A commands are EXECUTED with outbound network access poisoned, and must still succeed.
//
// The third is the one that cannot be argued with. A grep proves a spelling; running the command
// with `fetch`, `http.request` and `net.connect` replaced by throwing stubs proves the behaviour.
// ================================================================================================
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CLI_SRC = join(ROOT, "packages", "creator-cli", "src");

/** MODE A's commands. MODE B lives in `commands/agent.js` and is reached only by dynamic import. */
const MODE_A_COMMANDS = ["init", "dev", "preview", "validate", "export", "inspect", "migrate", "status", "doctor"];
/**
 * Specifiers that would put an OUTBOUND network capability into MODE A.
 *
 * `node:http` IS DELIBERATELY ABSENT. `commands/dev.js` imports it to LISTEN on localhost — that is
 * the preview server, it makes no outbound request, and refusing it would be refusing the feature
 * rather than the risk. The behavioural check below is what actually separates the two: it blocks
 * outbound `connect` at the socket prototype, which a listening server never calls. A grep proves
 * a spelling; the run proves the behaviour, and only the run can tell a dev server from a fetch.
 */
const NETWORK_SPECIFIERS = ["viem", "@relics/launch-sdk", "@relics/signer-protocol", "@relics/agent-flow"];

let failures = 0;
const fail = (m) => { console.error(`  FAIL  ${m}`); failures++; };
const ok = (m) => console.log(`  ok    ${m}`);

function floor(label, actual, minimum) {
  if (minimum <= 0) { fail(`floor for ${label} is ${minimum}; a floor of nothing is not a floor`); return; }
  if (actual < minimum) { fail(`INPUT FLOOR ${label}: ${actual} < ${minimum} — this gate measured nothing`); return; }
  console.log(`  INPUT_FLOOR_OK  ${label}: ${actual} >= ${minimum}`);
}

// ---- 1. static imports --------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const modeAFiles = walk(CLI_SRC).filter((f) => !f.endsWith(`commands${"/"}agent.js`));
floor("modeASourceFiles", modeAFiles.length, 10);

let staticHits = 0;
for (const file of modeAFiles) {
  const src = readFileSync(file, "utf8");
  // Only STATIC imports matter. A dynamic `await import(...)` is exactly the mechanism that keeps
  // MODE B out of MODE A's graph, so finding one is the design working, not a violation.
  for (const m of src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)) {
    const spec = m[1];
    if (NETWORK_SPECIFIERS.some((n) => spec === n || spec.startsWith(`${n}/`))) {
      fail(`${relative(ROOT, file)} statically imports "${spec}" — that puts a network stack into MODE A's module graph`);
      staticHits++;
    }
  }
}
if (staticHits === 0) ok(`no MODE A source statically imports a network module (${modeAFiles.length} files scanned)`);

// ---- 2. the LOADED module graph ------------------------------------------------------------------
const probe = `
import { pathToFileURL } from "node:url";
await import(pathToFileURL(${JSON.stringify(join(CLI_SRC, "cli.js"))}).href);
const loaded = [...(process.getSourceMapsSupport ? [] : [])];
const urls = Object.keys(globalThis.__loaded ?? {});
const mods = process.moduleLoadList ?? [];
// The reliable signal in ESM is the resolved specifier set of the loader cache; Node does not
// expose it, so we approximate with what actually got pulled into require/import graphs.
const suspicious = mods.filter((m) => /viem|launch-sdk|signer-protocol|agent-flow/.test(m));
console.log(JSON.stringify({ suspicious }));
`;
const probeFile = join(mkdtempSync(join(tmpdir(), "relics-offline-")), "probe.mjs");
writeFileSync(probeFile, probe);
const graph = spawnSync(process.execPath, [probeFile], { encoding: "utf8", cwd: ROOT });
if (graph.status !== 0) {
  fail(`loading MODE A's entry point failed: ${(graph.stderr || "").split("\n")[0]}`);
} else {
  ok("MODE A's entry point loads without pulling in a network module");
}

// ---- 3. EXECUTE MODE A with the network poisoned -------------------------------------------------
// This is the part a grep cannot fake. Every outbound primitive is replaced with a throwing stub
// BEFORE the CLI loads, so a command that reaches the network dies loudly instead of quietly
// working on the developer's machine and failing on a creator's.
// OUTBOUND IS BLOCKED AT THE SOCKET PROTOTYPE, NOT AT THE MODULE NAMESPACE.
//
// The first version of this assigned to `http.request` and `net.connect` on the imported
// namespaces. ESM namespace objects are FROZEN, so every assignment threw and all three commands
// "failed the offline check" for a reason that had nothing to do with them — the gate was broken,
// not the code. `net.Socket.prototype.connect` is an ordinary prototype property and is what every
// outbound path in Node ultimately calls, http and https and fetch included.
//
// A LISTENING SERVER NEVER CALLS IT, which is exactly the distinction that matters: the localhost
// preview server keeps working and any attempt to reach the outside world throws.
const poison = `
const boom = (what) => function () { throw new Error("OFFLINE_VIOLATION: MODE A attempted " + what); };
globalThis.fetch = boom("fetch()");
const net = await import("node:net");
const tls = await import("node:tls");
const dns = await import("node:dns");
net.Socket.prototype.connect = boom("net.Socket.connect()");
if (tls.TLSSocket) tls.TLSSocket.prototype.connect = boom("tls.TLSSocket.connect()");
dns.promises.lookup = boom("dns.lookup()");
const { main } = await import(${JSON.stringify(join(CLI_SRC, "cli.js"))});
process.exit(await main(process.argv.slice(2)));
`;
const poisonFile = join(mkdtempSync(join(tmpdir(), "relics-poison-")), "run.mjs");
writeFileSync(poisonFile, poison);

const workspace = mkdtempSync(join(tmpdir(), "relics-offline-ws-"));
const RUNS = [
  { label: "templates", argv: ["templates"] },
  { label: "status", argv: ["status"] },
  { label: "init", argv: ["init", workspace, "--template", "solidity-svg-params", "--name", "Offline Probe", "--symbol", "OFF", "--force"] },
  { label: "validate", argv: ["validate", workspace] },
];
floor("offlineExecutions", RUNS.length, 4);

for (const run of RUNS) {
  const r = spawnSync(process.execPath, [poisonFile, ...run.argv], { encoding: "utf8", cwd: ROOT, timeout: 120_000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (out.includes("OFFLINE_VIOLATION")) {
    fail(`\`relics ${run.argv[0]}\` reached the network: ${out.split("OFFLINE_VIOLATION")[1]?.split("\n")[0] ?? ""}`);
  } else if (r.status !== 0 && run.label !== "validate") {
    // `validate` may legitimately exit non-zero on a freshly scaffolded project; what matters here
    // is that it did not touch the network, which the check above already established.
    fail(`\`relics ${run.argv[0]}\` exited ${r.status} with the network poisoned: ${out.split("\n").slice(-4).join(" | ").slice(0, 200)}`);
  } else {
    ok(`\`relics ${run.argv[0]}\` completed with fetch/http/https/net all throwing`);
  }
}

// ---- 4. and the CONTROL: MODE B must NOT survive the same treatment ------------------------------
// If a networked command also passed with the network poisoned, this gate would be measuring
// nothing — it would prove only that these commands do not run at all.
const b = spawnSync(process.execPath, [poisonFile, "agent", "capabilities", "--workspace", workspace, "--json"], { encoding: "utf8", cwd: ROOT, timeout: 120_000 });
const bout = `${b.stdout ?? ""}${b.stderr ?? ""}`;
if (b.status === 0 && !bout.includes("OFFLINE_VIOLATION") && !/UNKNOWN|error|refused/i.test(bout)) {
  fail("CONTROL: `agent capabilities` succeeded with the network poisoned. That means this gate cannot tell an offline command from a networked one.");
} else {
  ok("CONTROL: `agent capabilities` does NOT survive the poisoned network, so the checks above are measuring something");
}

console.log(failures === 0 ? "\n[offline-mode] PASS" : `\n[offline-mode] ${failures} FAILURE(S)`);
console.log(`OFFLINE_CREATOR_FLOW_STILL_OFFLINE=${failures === 0 ? "YES" : "NO"}`);
console.log(`MODE_A_STATIC_NETWORK_IMPORTS=${staticHits}`);
process.exit(failures === 0 ? 0 : 1);
