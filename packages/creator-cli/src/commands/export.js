// SPDX-License-Identifier: MIT
// `relics export` — assemble, validate, and only then write the `.relics` file.
//
// The order matters and is not configurable: a bundle is written only after the SAME bytes have
// passed the SAME validator the importer will run. There is no `--force`, because a bundle that
// fails validation is a bundle the launchpad will refuse anyway, and writing one would only move
// the failure somewhere less useful.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BUNDLE_EXTENSION, DRAFT_EXTENSION, isRuntimeLaunchable } from "../schema.js";
import { validateProject, printValidation } from "./validate.js";
import { bold, cyan, dim, green, red, yellow, heading } from "../report.js";

/**
 * @param {string} root
 * @param {{ output?: string, seeds?: number, inProcess?: boolean, draft?: boolean }} options
 */
export function exportProject(root, options = {}) {
  const draft = options.draft === true;
  const status = draft ? "DRAFT" : "FINAL";
  const extension = draft ? DRAFT_EXTENSION : BUNDLE_EXTENSION;

  const { assembled, ...result } = validateProject(root, { ...options, status });
  const code = printValidation(result, draft ? "export --draft" : "export");
  if (code !== 0) {
    console.log("");
    console.log(red("  no bundle was written — export refuses to package a project that fails validation"));
    return 1;
  }

  const target = resolve(options.output ?? `${assembled.manifest.project.symbol.toLowerCase()}${extension}`);
  if (!target.endsWith(extension)) {
    console.log(red(`  --output must end in ${extension}`));
    return 1;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(assembled.bytes));

  heading("bundle");
  console.log(`  ${bold(target)}`);
  console.log(`  ${dim("size")}         ${assembled.bytes.length.toLocaleString()} bytes`);
  console.log(`  ${dim("entries")}      ${assembled.entries.size}`);
  console.log(`  ${dim("bundle hash")}  ${cyan(assembled.manifest.integrity.bundleHash)}`);
  console.log(`  ${dim("commitment")}   ${cyan(assembled.manifest.integrity.bundleCommitment)}`);
  console.log(`  ${dim("art binding")}  ${cyan(assembled.manifest.artBinding.runtimeId)}`);
  console.log("");
  if (!isRuntimeLaunchable(assembled.manifest.artBinding.runtime)) {
    console.log(yellow(`  ${assembled.manifest.artBinding.runtime} is not a launchable runtime yet — this bundle is valid and previewable, but the launchpad will not bind it.`));
    console.log("");
  }
  if (draft) {
    console.log(yellow("  DRAFT — this file is not launchable, and renaming it cannot make it one."));
    console.log(dim("  Its archive marker, its manifest `status` and its commitment all say DRAFT; the importer"));
    console.log(dim("  refuses it as a bundle. Share it for review, then re-run `relics export` without --draft."));
    console.log("");
    return 0;
  }
  // ---- THE CLOSING BLOCK -----------------------------------------------------------------
  //
  // What a creator holds now, and what they do next. Three things and no more: the file, the digest
  // that identifies it, and the next step.
  //
  // NO UPLOAD URL IS PRINTED. The public creator route is not confirmed open — `relics status`
  // reports every generation and chain as closed to public creation — so printing an address here
  // would be inventing a destination, which is the same failure as a placeholder contract address:
  // copyable, plausible and wrong. The bundle is complete and portable either way; where it goes is
  // the launchpad's announcement to make, not this command's guess.
  console.log(green("  READY TO UPLOAD"));
  console.log(`    ${dim("bundle")}       ${bold(target)}`);
  console.log(`    ${dim("bundle hash")}  ${cyan(assembled.manifest.integrity.bundleHash)}`);
  console.log(`    ${dim("next step")}    Import this file in the launchpad creator app. It re-derives every hash above from`);
  console.log(`    ${" ".repeat(12)}   your bytes, so the value it shows must match the one printed here — if it does`);
  console.log(`    ${" ".repeat(12)}   not, the file changed after export and you should re-run this command.`);
  console.log(`    ${" ".repeat(12)}   Run ${bold("relics status")} for the current chains and whether public creation is open.`);
  console.log("");
  return 0;
}
