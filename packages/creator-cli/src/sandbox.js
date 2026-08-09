// SPDX-License-Identifier: MIT
// Two ways to run a generator, both shaped for hostile input.
//
//  * IN-PROCESS (`createVmModule`) — a fresh `node:vm` realm whose global object has had every
//    ambient capability removed, with a wall-clock timeout on each render. Used by `preview` and
//    `dev`, where a creator is iterating on their own code and wants an answer immediately.
//
//  * ISOLATED (`renderSeedsIsolated`) — a separate `node` process with a hard heap cap and a hard
//    timeout, rendering a whole batch of seeds and returning their outputs. Used by `validate`,
//    `test-seeds` and `export`. A generator that allocates without bound, spins forever, or
//    crashes the runtime takes the child process with it and nothing else.
//
// NO HOST OBJECT EVER REACHES GENERATOR CODE. That is the rule that makes the in-process realm
// worth anything: handing a sandboxed function a host object lets it walk
// `obj.constructor.constructor` back to the host realm's Function and escape. So the render
// context is BUILT INSIDE the realm from a JSON string, using a PRNG whose source is injected from
// the shared schema package (one implementation, so a seed behaves identically in the sandbox, in
// the studio preview, and in the validator). Only strings cross the boundary in either direction.

import { createContext, Script } from "node:vm";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LIMITS, SCHEMA_PACKAGE_DIR } from "./schema.js";

const RUNNER = fileURLToPath(new URL("./sandbox-runner.js", import.meta.url));

/** The shared PRNG, injected as source so the realm builds its own copy. */
const PRNG_SOURCE = readFileSync(fileURLToPath(new URL("src/prng.js", SCHEMA_PACKAGE_DIR)), "utf8").replace(/^\s*export\s+(?=(function|const|let|var|class)\b)/gm, "");

/** Globals removed from the sandbox realm before a generator sees it. */
export const STRIPPED_GLOBALS = Object.freeze([
  "eval",
  "Function",
  "globalThis",
  "process",
  "require",
  "module",
  "exports",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Request",
  "Response",
  "Headers",
  "FormData",
  "Blob",
  "File",
  "URL",
  "URLSearchParams",
  "Date",
  "Intl",
  "crypto",
  "performance",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
  "queueMicrotask",
  "WebAssembly",
  "Atomics",
  "SharedArrayBuffer",
  "Worker",
  "MessageChannel",
  "BroadcastChannel",
  "structuredClone",
  "Proxy",
  "Reflect",
  "console",
  "navigator",
  "AbortController",
  "AbortSignal",
  "TextEncoder",
  "TextDecoder",
  "CompressionStream",
  "DecompressionStream",
  "EventTarget",
  "Event",
  "Buffer",
]);

const PRELUDE = `
  for (const __name of ${JSON.stringify(STRIPPED_GLOBALS)}) {
    try { delete globalThis[__name]; } catch (__ignored) { /* non-configurable globals stay, shadowed by the strip below */ }
  }
  Math.random = function random() {
    throw new Error("Math.random() is not available inside a generator; use context.random, which is seeded");
  };
  Object.freeze(Math);
  Object.freeze(JSON);

  ${PRNG_SOURCE}

  function __buildContext(json) {
    const data = JSON.parse(json);
    return Object.freeze({
      seed: data.seed,
      random: makeRandom(data.seed),
      market: Object.freeze(data.market),
      sensors: Object.freeze(data.sensors),
      size: data.size,
      project: Object.freeze(data.project),
    });
  }
`;

/**
 * Rewrites a single-file ES module into a script the realm can run. The bundle format allows
 * exactly one generator script with no imports, so this only has to understand `export` on
 * declarations — there is no module graph, no resolver and no dynamic import.
 * @param {string} source
 */
export function toRunnableScript(source) {
  const stripped = source.replace(/^\s*export\s+default\s+/gm, "const __default = ").replace(/^\s*export\s+(?=(async\s+)?(function|const|let|var|class)\b)/gm, "");
  return `${PRELUDE}
${stripped}
;(function () {
  const __out = Object.create(null);
  __out.render = typeof render === "function" ? render : null;
  __out.manifestJson = typeof manifest === "undefined" ? "null" : JSON.stringify(manifest);
  __out.invoke = function (json) {
    const value = __out.render(__buildContext(json));
    return typeof value === "string" ? value : "[[relics:nonstring:" + typeof value + "]]";
  };
  return __out;
})();`;
}

/** Marker the realm uses to report a non-string return without handing back a realm object. */
const NON_STRING_PREFIX = "[[relics:nonstring:";

function decodeOutput(value) {
  if (typeof value === "string" && value.startsWith(NON_STRING_PREFIX)) {
    const kind = value.slice(NON_STRING_PREFIX.length).replace(/\]\]$/, "");
    return { nonString: kind };
  }
  return value;
}

/**
 * Evaluates a generator in a stripped realm.
 * @param {Map<string, string>} sources
 * @param {string} entry
 * @param {{ timeoutMs?: number }} [options]
 * @returns {{ manifest: unknown, render: (context: { seed: string, market?: object, sensors?: object, size?: number, project?: object }) => unknown }}
 */
export function createVmModule(sources, entry = "generator/generate.js", options = {}) {
  const source = sources.get(entry);
  if (typeof source !== "string") throw new Error(`${entry} is not in the bundle`);
  const timeout = options.timeoutMs ?? LIMITS.renderTimeoutMs;

  const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  let exported;
  try {
    exported = new Script(toRunnableScript(source), { filename: entry }).runInContext(context, { timeout });
  } catch (err) {
    throw new Error(`${entry} failed to load: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!exported || typeof exported.render !== "function") {
    throw new Error(`${entry} does not export a callable render(context)`);
  }

  let parsedManifest = null;
  try {
    parsedManifest = JSON.parse(exported.manifestJson);
  } catch {
    parsedManifest = null;
  }

  return {
    manifest: parsedManifest,
    render(renderContext) {
      const payload = JSON.stringify({
        seed: String(renderContext.seed),
        market: renderContext.market ?? {},
        sensors: renderContext.sensors ?? {},
        size: renderContext.size ?? 1000,
        project: renderContext.project ?? {},
      });
      return decodeOutput(exported.invoke(payload));
    },
  };
}

/**
 * Renders a batch of seeds in a separate process with a heap cap and a hard timeout.
 *
 * @param {{
 *   sources: Map<string, string>,
 *   entry?: string,
 *   seeds: string[],
 *   manifest?: unknown,
 *   marketDocument?: unknown,
 *   renders?: number,
 *   heapMb?: number,
 *   timeoutMs?: number,
 * }} input
 * @returns {{ ok: boolean, error: string | null, results: Record<string, { outputs: unknown[], error: string | null }> }}
 */
export function renderSeedsIsolated(input) {
  const payload = JSON.stringify({
    sources: Object.fromEntries(input.sources),
    entry: input.entry ?? "generator/generate.js",
    seeds: input.seeds,
    manifest: input.manifest ?? null,
    marketDocument: input.marketDocument ?? null,
    renders: input.renders ?? 2,
    timeoutMs: LIMITS.renderTimeoutMs,
    maxOutputBytes: LIMITS.maxRenderOutputBytes + 1,
  });

  const heapMb = input.heapMb ?? 256;
  const timeoutMs = input.timeoutMs ?? Math.max(20_000, input.seeds.length * LIMITS.renderTimeoutMs);
  const child = spawnSync(process.execPath, [`--max-old-space-size=${heapMb}`, RUNNER], {
    input: payload,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 128 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });

  if (child.error && child.error.code === "ETIMEDOUT") {
    return { ok: false, error: `the generator did not finish within ${timeoutMs} ms across ${input.seeds.length} seeds; the sandbox was terminated`, results: {} };
  }
  if (child.status !== 0) {
    const stderr = child.stderr ?? "";
    const oom = /heap out of memory|Allocation failed|JavaScript heap/i.test(stderr);
    const detail = stderr.trim().split("\n").slice(-2).join(" ").slice(0, 300);
    return {
      ok: false,
      error: oom ? `the generator exhausted the ${heapMb} MB sandbox heap; the sandbox was terminated` : `the sandbox exited with status ${child.status}${detail ? `: ${detail}` : ""}`,
      results: {},
    };
  }
  try {
    const parsed = JSON.parse(child.stdout);
    for (const record of Object.values(parsed.results ?? {})) {
      record.outputs = record.outputs.map((value) => (value && typeof value === "object" && "nonString" in value ? { nonString: value.nonString } : value));
    }
    return parsed;
  } catch {
    return { ok: false, error: "the sandbox produced unreadable output", results: {} };
  }
}

/**
 * Turns recorded sandbox output into the synchronous `evaluate` capability `validateBundle` wants.
 * The validator asks for two renders of each seed; the replay hands back exactly what the isolated
 * process produced, in order, so a non-deterministic generator still reads as non-deterministic.
 * @param {ReturnType<typeof renderSeedsIsolated>} recorded
 */
export function makeReplayEvaluator(recorded) {
  return () => {
    /** @type {Map<string, number>} */
    const calls = new Map();
    return {
      render(context) {
        const record = recorded.results[context.seed];
        if (!record) throw new Error(`the sandbox did not render seed ${context.seed}`);
        const n = calls.get(context.seed) ?? 0;
        calls.set(context.seed, n + 1);
        if (record.error) throw new Error(record.error);
        const value = record.outputs[Math.min(n, record.outputs.length - 1)];
        if (value && typeof value === "object" && "nonString" in value) return { __nonString: value.nonString };
        return value;
      },
    };
  };
}

/** The in-process realm as an `evaluate` capability, for fast local runs. */
export function makeVmEvaluator() {
  return (sources, entry) => createVmModule(sources, entry);
}
