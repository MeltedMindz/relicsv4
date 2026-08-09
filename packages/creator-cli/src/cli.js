// SPDX-License-Identifier: MIT
// Argument parsing and dispatch. No dependencies: the parser handles the small, explicit flag set
// the commands need and refuses anything it does not recognise rather than ignoring it.

import { SCHEMA_VERSION, CREATOR_KIT_VERSION, RUNTIME_VERSION, PROTOCOL_RELEASE_COMPATIBILITY, BUNDLE_EXTENSION } from "./schema.js";
import { initProject, printTemplates } from "./commands/init.js";
import { devServer } from "./commands/dev.js";
import { previewProject, testSeeds } from "./commands/preview.js";
import { validateProject, validateBundleFile, printValidation } from "./commands/validate.js";
import { exportProject } from "./commands/export.js";
import { inspectBundle } from "./commands/inspect.js";
import { bold, dim, red } from "./report.js";

const FLAGS = {
  template: "string",
  name: "string",
  symbol: "string",
  output: "string",
  out: "string",
  port: "number",
  seeds: "string",
  count: "number",
  size: "number",
  bundle: "string",
  force: "boolean",
  json: "boolean",
  draft: "boolean",
  "in-process": "boolean",
  "structural-only": "boolean",
  help: "boolean",
  version: "boolean",
};

export async function main(argv) {
  const { command, positional, flags, errors } = parse(argv);
  if (errors.length > 0) {
    for (const message of errors) console.error(red(`relics: ${message}`));
    return 1;
  }
  if (flags.version) {
    console.log(`relics ${CREATOR_KIT_VERSION}  (schema ${SCHEMA_VERSION}, runtime ${RUNTIME_VERSION}, ${PROTOCOL_RELEASE_COMPATIBILITY})`);
    return 0;
  }
  if (!command || flags.help || command === "help") return usage(command === "help" ? positional[0] : undefined);

  const root = positional[0] ?? ".";

  switch (command) {
    case "init":
      if (!positional[0]) {
        console.error(red("relics: init needs a directory, e.g. `relics init my-project`"));
        return 1;
      }
      return initProject(positional[0], { template: flags.template, name: flags.name, symbol: flags.symbol, force: flags.force });

    case "templates":
      return printTemplates();

    case "dev":
      return devServer(root, { port: flags.port });

    case "preview":
      return previewProject(root, {
        seeds: flags.seeds ? String(flags.seeds).split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        count: flags.count,
        out: flags.out,
        size: flags.size,
      });

    case "test-seeds":
      return testSeeds(root, { count: flags.count ?? 100 });

    case "validate": {
      if (flags.bundle) {
        const result = validateBundleFile(flags.bundle, { seeds: flags.count, inProcess: flags["in-process"], structuralOnly: flags["structural-only"] });
        return printValidation(result, flags.bundle);
      }
      const { assembled: _assembled, ...result } = validateProject(root, { seeds: flags.count, inProcess: flags["in-process"] });
      return printValidation(result, root);
    }

    case "export":
      return exportProject(root, { output: flags.output, seeds: flags.count, inProcess: flags["in-process"] });

    case "inspect": {
      const file = positional[0];
      if (!file) {
        console.error(red(`relics: inspect needs a ${BUNDLE_EXTENSION} file`));
        return 1;
      }
      return inspectBundle(file, { json: flags.json, draft: flags.draft });
    }

    default:
      console.error(red(`relics: unknown command "${command}"`));
      return usage();
  }
}

function parse(argv) {
  const positional = [];
  const flags = {};
  const errors = [];
  let command = null;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const [rawName, inlineValue] = splitOnce(token.slice(2), "=");
      const name = rawName;
      const kind = FLAGS[name];
      if (!kind) {
        errors.push(`unknown option --${name}`);
        continue;
      }
      if (kind === "boolean") {
        flags[name] = inlineValue === undefined ? true : inlineValue !== "false";
        continue;
      }
      const value = inlineValue ?? argv[++i];
      if (value === undefined) {
        errors.push(`--${name} needs a value`);
        continue;
      }
      if (kind === "number") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          errors.push(`--${name} must be a number`);
          continue;
        }
        flags[name] = parsed;
      } else {
        flags[name] = value;
      }
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      errors.push(`unknown option ${token} (this CLI uses long options only)`);
      continue;
    }
    if (command === null) command = token;
    else positional.push(token);
  }

  return { command, positional, flags, errors };
}

function splitOnce(value, separator) {
  const index = value.indexOf(separator);
  return index === -1 ? [value, undefined] : [value.slice(0, index), value.slice(index + 1)];
}

const HELP = {
  init: `relics init <directory> [--template <id>] [--name <name>] [--symbol <SYMBOL>] [--force]
  Scaffold a project from a starter template. \`relics templates\` lists them.`,
  templates: `relics templates
  List the starter templates and the art runtime each one uses.`,
  dev: `relics dev [directory] [--port 4321]
  Serve a local studio on 127.0.0.1: render any seed, drag the market destinations, read traits.`,
  preview: `relics preview [directory] [--seeds 1,2,3 | --count 8] [--out previews] [--size 240]
  Write deterministic SVGs plus a contact sheet.`,
  "test-seeds": `relics test-seeds [directory] [--count 100]
  Render a sample in the isolated sandbox and report failures, blanks, non-determinism,
  distinct outputs and the trait duplicate rate.`,
  validate: `relics validate [directory] [--bundle file${BUNDLE_EXTENSION}] [--count 24] [--in-process] [--structural-only]
  Run every check. Nothing is written. Use --bundle to check an exported file instead of a
  project directory.`,
  export: `relics export [directory] --output my-project${BUNDLE_EXTENSION}
  Validate, then write the bundle. A project that fails validation is never packaged.`,
  inspect: `relics inspect <file${BUNDLE_EXTENSION}> [--json] [--draft]
  Read a bundle and print what it declares. The generator is never executed.`,
};

function usage(topic) {
  if (topic && HELP[topic]) {
    console.log("");
    console.log(HELP[topic]);
    console.log("");
    return 0;
  }
  console.log(`
${bold("relics")} — the local creator kit for RELICS Launchpad projects

  ${bold("relics init")} <dir> [--template <id>]   scaffold a project
  ${bold("relics templates")}                      list the starter templates
  ${bold("relics dev")} [dir]                      local studio on 127.0.0.1
  ${bold("relics preview")} [dir]                  write deterministic SVGs
  ${bold("relics test-seeds")} [dir] --count 100   sample the collection at scale
  ${bold("relics validate")} [dir]                 run every check, write nothing
  ${bold("relics export")} [dir] --output x${BUNDLE_EXTENSION}   validate, then write the bundle
  ${bold("relics inspect")} <file${BUNDLE_EXTENSION}>          read a bundle without running it

  ${dim(`schema ${SCHEMA_VERSION} · kit ${CREATOR_KIT_VERSION} · runtime ${RUNTIME_VERSION}`)}
  ${dim(`built against ${PROTOCOL_RELEASE_COMPATIBILITY}`)}

  ${dim("relics help <command> for details. Nothing in this CLI signs, broadcasts, or")}
  ${dim("contacts a network — it produces one file you import in the creator app.")}
`);
  return 0;
}
