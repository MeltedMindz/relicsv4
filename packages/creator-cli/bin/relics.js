#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { main } from "../src/cli.js";

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`relics: ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.RELICS_DEBUG && err instanceof Error && err.stack) console.error(err.stack);
    process.exitCode = 1;
  },
);
