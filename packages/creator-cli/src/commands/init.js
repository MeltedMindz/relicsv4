// SPDX-License-Identifier: MIT
// `relics init` — copy a starter template into a new project directory.
//
// Templates are plain files, copied verbatim with a few identity substitutions. There is no
// generator step, no network fetch, and no dependency install: after `init` the directory is a
// complete project that `validate`, `preview` and `export` already understand.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bold, cyan, dim, green, red, yellow, heading } from "../report.js";
import { ART_RUNTIME_IDS, LAUNCHABLE_ART_RUNTIMES, reviewedProtocolTemplateIds } from "../schema.js";

const TEMPLATES_DIR = fileURLToPath(new URL("../../templates/", import.meta.url));

/**
 * Every shipped template, with the runtime it targets and whether that runtime can currently be
 * LAUNCHED.
 *
 * Launchability is read from the schema's own list, never from `template.json`. A template file
 * cannot be allowed to declare itself launchable: that would let a template outlive the protocol
 * decision it depends on, which is exactly how a creator ends up spending a day on art that cannot
 * be bound. When a runtime is gated off, its templates stay — they are still authoring work, still
 * previewable, still correct — and the kit says plainly that launching is not available yet.
 *
 * @returns {{ id: string, title: string, summary: string, runtime: string, runtimeId: string, launchable: boolean }[]}
 */
export function listTemplates() {
  return readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const meta = JSON.parse(readFileSync(join(TEMPLATES_DIR, e.name, "template.json"), "utf8"));
      return {
        id: e.name,
        title: meta.title,
        summary: meta.summary,
        runtime: meta.runtime,
        runtimeId: ART_RUNTIME_IDS[meta.runtime] ?? meta.runtime,
        launchable: LAUNCHABLE_ART_RUNTIMES.includes(meta.runtime),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Reviewed protocol templates this build implements — NOT art scaffolds and never `relics init`
 * targets. A reviewed template is an immutable product integration a launchpad operator registers
 * into the schema; the creator kit registers none, so this is normally empty and the CLI says so
 * rather than listing a heading with nothing under it.
 */
export function listReviewedProtocolTemplates() {
  return reviewedProtocolTemplateIds().map((id) => ({ id }));
}

export function printTemplates() {
  heading("templates");
  for (const template of listTemplates()) {
    console.log(`  ${bold(template.id.padEnd(22))} ${template.summary}`);
    const runtime = `runtime ${template.runtimeId}`;
    // NOTHING HERE SAYS "LAUNCHABLE", because today nothing is: public creator launch is closed on
    // every chain (`relics status`). A blank status next to the one bound runtime used to read as
    // "this one you can launch", which is a claim the CLI is not entitled to make. The distinction
    // that IS true per template is which runtime a launch binds and renders FIRST.
    const status = template.launchable
      ? dim("— the runtime a launch binds first; launching itself is closed, see `relics status`")
      : yellow("— preview only; this runtime is not bound by a launch yet");
    console.log(`  ${" ".repeat(22)} ${dim(runtime)} ${status}`);
  }
  const reviewed = listReviewedProtocolTemplates();
  if (reviewed.length > 0) {
    console.log("");
    console.log(dim("  reviewed protocol templates (an operator binding, not an art scaffold — not an init target)"));
    for (const template of reviewed) console.log(`  ${bold(template.id)}`);
  }
  console.log("");
  console.log(dim("  relics init <directory> --template <id>"));
  return 0;
}

/**
 * @param {string} target
 * @param {{ template?: string, name?: string, symbol?: string, force?: boolean }} options
 */
export function initProject(target, options = {}) {
  const templates = listTemplates();
  const templateId = options.template ?? "minimal";
  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    console.log(red(`  unknown template "${templateId}"`));
    printTemplates();
    return 1;
  }

  const root = resolve(target);
  if (existsSync(root) && readdirSync(root).length > 0 && !options.force) {
    console.log(red(`  ${root} already exists and is not empty (pass --force to write into it anyway)`));
    return 1;
  }
  mkdirSync(root, { recursive: true });

  const source = join(TEMPLATES_DIR, templateId);
  for (const entry of readdirSync(source)) {
    if (entry === "template.json") continue;
    cpSync(join(source, entry), join(root, entry), { recursive: true });
  }

  const name = options.name ?? defaultName(root);
  const symbol = options.symbol ?? defaultSymbol(name);
  const configPath = join(root, "relics.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.project.name = name;
  config.project.symbol = symbol;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const metadataPath = join(root, "metadata", "collection.json");
  if (existsSync(metadataPath)) {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    metadata.name = name;
    metadata.symbol = symbol;
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }

  heading(`created ${bold(name)} (${symbol})`);
  console.log(`  ${dim("template")}  ${template.title} — ${template.summary}`);
  console.log(`  ${dim("runtime")}   ${template.runtimeId}${template.launchable ? "" : yellow("  (preview only — the launchpad does not bind this runtime yet)")}`);
  console.log(`  ${dim("path")}      ${cyan(root)}`);
  console.log("");
  console.log("  next:");
  console.log(`    ${dim("$")} relics dev ${target}            ${dim("# open the local studio")}`);
  console.log(`    ${dim("$")} relics preview ${target}        ${dim("# write deterministic SVGs")}`);
  console.log(`    ${dim("$")} relics validate ${target}       ${dim("# run every check")}`);
  console.log(`    ${dim("$")} relics export ${target} --output ${symbol.toLowerCase()}.relics`);
  console.log("");
  console.log(yellow("  set earnings.creatorRecipient in relics.config.json before exporting — the placeholder address is not yours."));
  if (!template.launchable) {
    console.log("");
    console.log(yellow(`  ${template.runtime} is an approved runtime that the launchpad does not bind and render yet.`));
    console.log(dim("  Everything here works — authoring, preview, validate, export. Launching does not, until it is enabled."));
  }
  return 0;
}

function defaultName(root) {
  const base = root.split(/[/\\]/).filter(Boolean).pop() ?? "untitled";
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 64);
}

/**
 * A SYMBOL MAY START WITH A DIGIT, and the scaffold must not mangle one that does.
 *
 * This used to prepend "P" to anything not starting with a letter, so a project called "1inch
 * Tribute" was scaffolded as `P1INCH`. That silently renamed the creator's token to satisfy a
 * constraint the schema does not have — `SYMBOL_RE` is `^[A-Z0-9]{1,11}$` and always accepted a
 * leading digit. The only reason a symbol is rejected here is that it contains nothing usable.
 * @param {string} name
 */
function defaultSymbol(name) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (letters || "PROJECT").slice(0, 6);
}

export { TEMPLATES_DIR };
