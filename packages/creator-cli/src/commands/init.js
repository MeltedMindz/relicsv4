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
import {
  ADVANCED_FLAG_STATUSES,
  describeUnshippedTemplate,
  humanCatalog,
  latestVerdict,
  templateStatus,
} from "../../../template-catalog/src/index.js";

const TEMPLATES_DIR = fileURLToPath(new URL("../../templates/", import.meta.url));

/**
 * The scaffold `relics init` uses when the creator names none.
 *
 * A NAMED CONSTANT, not a literal buried in `initProject`. A default is a decision, and a decision
 * that only exists as a string inside a function cannot be found by anyone asking what it is. It is
 * also the one place a non-SHIP art template could reach a creator without being asked for, which
 * is why the art catalog is a separate list that `init` refuses outright (see `catalogRefusal`).
 */
export const DEFAULT_TEMPLATE_ID = "minimal";

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

/**
 * Why an ART CATALOG id is not an `init` target, said precisely rather than as "unknown template".
 *
 * The two lists are different kinds of thing and the error has to say which one you reached. A
 * starter template is a project directory; a Wave-1 art template is a configuration preset for a
 * runtime, and there is no scaffold to copy. Answering "unknown template" would send a creator —
 * or an agent — looking for a typo that is not there.
 *
 * A NON-SHIP id gets a different sentence again, because the honest answer to "can I start from
 * `PIXEL_GRID_V1/ossuary`?" is not "that does not exist", it is "review held it, and here is what
 * it would take to change that".
 *
 * @returns {string|null} the refusal, or null when this is not a catalog id at all
 */
export function catalogRefusal(templateId) {
  if (!/^[A-Z][A-Z0-9_]+\/[a-z][a-z0-9-]*$/.test(String(templateId ?? ""))) return null;
  const status = templateStatus(templateId);
  if (status === "UNREVIEWED") return `"${templateId}" is not a starter template and is not in the Wave-1 art catalog either. \`relics templates\` lists both.`;
  if (status === "SHIP") {
    return `"${templateId}" is a Wave-1 ART template — a configuration preset for an art runtime, not a project scaffold. \`relics init\` copies scaffolds; run \`relics templates\` to see the art catalog and what each preset binds.`;
  }
  return `"${templateId}" is a Wave-1 art template with review status ${status}, so it is not offered as a starting point. Promotion to SHIP takes a contained fix, a config inside the runtime's final bounds, a regenerated sheet, and a NEW blind review returning SHIP — never maintainer judgement. \`relics templates --experimental\` shows it with its measured weakness.`;
}

/**
 * The Wave-1 ART TEMPLATE CATALOG — a second, separate list.
 *
 * NOTHING HERE SAYS A RUNTIME CAN BE LAUNCHED, and the omission is the point. These four runtimes
 * are not registered on any chain this build knows about, whether that is still true tomorrow is a
 * per-chain fact, and the only thing that answers it is a live read of `ArtRuntimeRegistryV1`. The
 * CLI points at that read rather than printing an answer it would have to keep up to date.
 */
function printArtCatalog({ experimental = false } = {}) {
  const entries = humanCatalog({ advanced: experimental });
  const shipped = entries.filter((e) => e.review.status === "SHIP");

  console.log("");
  heading("art templates (Wave 1)");
  console.log(dim("  Configuration presets for the on-chain art runtimes. Not `relics init` targets."));
  console.log(dim("  A preset is a STARTING POINT: change anything the runtime's validator accepts."));
  console.log("");

  for (const e of shipped) {
    console.log(`  ${bold(e.id.padEnd(34))} ${e.summary}`);
    const effective = e.signals.effective.map((b) => `${b.sensor}/${b.curve}`).join(", ") || "none";
    console.log(`  ${" ".repeat(34)} ${dim(`runtime ${e.runtime.id} · config schema v${e.runtime.configSchemaVersion} · market-responsive ${e.marketResponsive ? "yes" : "no"}`)}`);
    console.log(`  ${" ".repeat(34)} ${dim(`effective signals (measured): ${effective}`)}`);
    if (e.signals.ineffective.length > 0) {
      console.log(`  ${" ".repeat(34)} ${yellow(`bound but measured DEAD: ${e.signals.ineffective.map((b) => `${b.sensor}/${b.curve}`).join(", ")}`)}`);
    }
  }

  const others = entries.filter((e) => e.review.status !== "SHIP");
  if (experimental) {
    console.log("");
    console.log(dim(`  ${ADVANCED_FLAG_STATUSES.join(" and ")} — shown because --experimental was passed. NOT offered as starting points.`));
    for (const e of others) {
      const w = e.weakestMeasuredStatePairing;
      console.log(`  ${bold(e.id.padEnd(34))} ${yellow(e.review.status)}`);
      if (w) console.log(`  ${" ".repeat(34)} ${dim(`weakest measured state pairing: ${w.states} at dE ${w.deltaE} (floor ${w.floorDeltaE})`)}`);
    }
    console.log("");
    console.log(dim("  Review REJECTED the remainder of the wave. Those are not listed here and are not offered."));
  } else if (others.length === 0) {
    console.log("");
    console.log(dim(`  ${ADVANCED_FLAG_STATUSES.join(" and ")} templates exist and are hidden. \`relics templates --experimental\` shows them with their measured weakness.`));
  }

  console.log("");
  console.log(dim("  WHETHER THESE RUNTIMES ARE REGISTERED ON YOUR CHAIN IS A LIVE READ, not a line in this kit."));
  console.log(dim("  `relics agent ready --chain <id>` asks the chain. An unread registry answers UNKNOWN, never \"no\"."));
  return 0;
}

export function printTemplates(options = {}) {
  heading("starter templates");
  for (const template of listTemplates()) {
    console.log(`  ${bold(template.id.padEnd(22))} ${template.summary}`);
    const runtime = `runtime ${template.runtimeId}`;
    // THIS COLUMN IS ABOUT THE RUNTIME AND SAYS SO. Launching needs two independent yeses — a
    // runtime a launch will bind, and a chain whose factory is open — and only the first is a
    // property of a template. It used to append "launching itself is closed", which was a chain
    // fact stated in a per-template line and went stale the moment one chain opened. The chain half
    // has exactly one honest source and the CLI points at it instead of restating it.
    const status = template.launchable
      ? dim("— the runtime a launch binds; whether YOUR chain is open is a separate answer, see `relics status`")
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
  printArtCatalog({ experimental: options.experimental === true });
  return 0;
}

/**
 * @param {string} target
 * @param {{ template?: string, name?: string, symbol?: string, force?: boolean }} options
 */
export function initProject(target, options = {}) {
  const templates = listTemplates();
  const templateId = options.template ?? DEFAULT_TEMPLATE_ID;
  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    const refusal = catalogRefusal(templateId);
    if (refusal) {
      console.log(red(`  ${refusal}`));
      return 1;
    }
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
    console.log(yellow(`  ${template.runtime} is an approved runtime that no launch binds and renders.`));
    console.log(dim("  Everything here works — authoring, preview, validate, export. Launching does not, and the refusal is structural rather than scheduled."));
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
