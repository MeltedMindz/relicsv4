// SPDX-License-Identifier: MIT
// The isolated render process. Started by `renderSeedsIsolated` with a heap cap and a hard
// timeout, it reads its whole job from stdin, writes one JSON result to stdout, and exits. It
// opens no file beyond stdin, no socket, and no environment beyond PATH; this is the only place a
// creator's generator code runs during validation.

import { readFileSync } from "node:fs";
import { buildRenderContext } from "./schema.js";
import { createVmModule } from "./sandbox.js";

function main() {
  const job = JSON.parse(readFileSync(0, "utf8"));
  const sources = new Map(Object.entries(job.sources));
  /** @type {Record<string, { outputs: unknown[], error: string | null }>} */
  const results = {};

  let module;
  try {
    module = createVmModule(sources, job.entry, { timeoutMs: job.timeoutMs });
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err), results: {} }));
    return;
  }

  for (const seed of job.seeds) {
    const outputs = [];
    let error = null;
    for (let i = 0; i < job.renders; i++) {
      try {
        const context = buildRenderContext({ manifest: job.manifest, marketDocument: job.marketDocument, seed });
        const output = module.render(context);
        outputs.push(typeof output === "string" ? output.slice(0, job.maxOutputBytes) : output);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        break;
      }
    }
    results[seed] = { outputs, error };
  }

  process.stdout.write(JSON.stringify({ ok: true, error: null, results }));
}

main();
