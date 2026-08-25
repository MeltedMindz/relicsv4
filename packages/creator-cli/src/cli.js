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
import { migrateBundle } from "./commands/migrate.js";
import { printStatus } from "./commands/status.js";
import { doctor } from "./commands/doctor.js";
import { bold, dim, printFatal, red } from "./report.js";

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
  // ---- MODE B (autonomous launch) flags. Present in the parser so an unknown flag is still
  // refused rather than ignored, but every command that uses them lives behind the lazy import
  // below and none of MODE A's commands reads one.
  workspace: "string",
  policy: "string",
  brief: "string",
  chain: "number",
  signer: "string",
  "dry-run": "boolean",
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

  // A THROWN failure is still a creator-facing failure.
  //
  // `assembleBundle`, `readProjectFiles` and the container writer all refuse by throwing, and those
  // throws used to escape all the way to bin/relics.js, which prints one bare `relics: <message>`
  // line. The message was accurate and the creator was left with no file to open and no command to
  // run — missing exactly where they are most stuck. `printFatal` renders them in the same
  // WHAT / WHERE / fix / then shape every validation issue gets.
  try {
    return await dispatch(command, positional, flags, root);
  } catch (err) {
    if (process.env.RELICS_DEBUG && err instanceof Error && err.stack) console.error(err.stack);
    return printFatal(err, { root, command });
  }
}

async function dispatch(command, positional, flags, root) {
  switch (command) {
    case "init":
      if (!positional[0]) {
        console.error(red("relics: init needs a directory, e.g. `relics init my-project`"));
        return 1;
      }
      return initProject(positional[0], { template: flags.template, name: flags.name, symbol: flags.symbol, force: flags.force });

    case "templates":
      return printTemplates();

    case "status":
      return printStatus();

    case "doctor":
      return doctor();

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
      return exportProject(root, { output: flags.output, seeds: flags.count, inProcess: flags["in-process"], draft: flags.draft });

    case "migrate": {
      if (!positional[0]) return fail("migrate needs a .relics file");
      return migrateBundle(positional[0], { out: flags.out ?? flags.output });
    }

    case "inspect": {
      const file = positional[0];
      if (!file) {
        console.error(red(`relics: inspect needs a ${BUNDLE_EXTENSION} file`));
        return 1;
      }
      return inspectBundle(file, { json: flags.json, draft: flags.draft });
    }

    // ------------------------------------------------------------------------------------------
    // MODE B — AUTONOMOUS LAUNCH. Everything network-facing lives behind this one lazy import.
    //
    // THE IMPORT IS DYNAMIC AND THAT IS LOAD-BEARING, NOT STYLE. `@relics/launch-sdk` pulls in
    // viem and reads chain profiles; a static import at the top of this file would put a network
    // stack into the module graph of `relics validate`, which is documented as offline and whose
    // whole value is that a creator can run it on a machine with no RPC, no wallet and no
    // internet. `scripts/check-offline-mode.mjs` asserts this by loading MODE A's graph and
    // failing if the SDK appears in it — so the property is tested, not promised.
    case "agent":
    case "launch": {
      const { runNetworkedCommand } = await import("./commands/agent.js");
      return runNetworkedCommand(command, positional, flags);
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
  status: `relics status
  Show the platform deployment addresses BY GENERATION and whether public creator launches are
  open. A generation that is not deployed prints a row saying so rather than being omitted.`,
  doctor: `relics doctor
  Check that THIS MACHINE can run the kit: Node version, dependencies, the schema package, the
  templates, and the isolated sandbox (by actually rendering in it). Offline — it contacts no
  network, no RPC and no chain, so a green result says nothing about the launchpad. Use
  \`relics status\` for that.`,
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
  Read a bundle and print what it declares, including its decoded art configuration. The
  generator is never executed.`,
  migrate: `relics migrate <file${BUNDLE_EXTENSION}> [--out directory]
  Open a bundle from an older schema into a project directory you can finish.

  A pre-3.0.0 Solidity bundle cannot be converted automatically and this command does not
  pretend otherwise. It carries over everything that IS recoverable and writes an art
  configuration whose artist-supplied fields are explicitly null, with the vocabularies and
  bounds you need to fill them. \`relics export\` refuses those nulls by name.

  Nothing is defaulted and nothing is borrowed from a template: art derived from a generic
  template is the failure this format exists to prevent. The source bundle hash is kept as
  provenance; re-exporting mints a new one.`,
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
  ${bold("relics status")}                         deployment addresses, by generation
  ${bold("relics doctor")}                         check this machine can run the kit (offline)
  ${bold("relics dev")} [dir]                      local studio on 127.0.0.1
  ${bold("relics preview")} [dir]                  write deterministic SVGs
  ${bold("relics test-seeds")} [dir] --count 100   sample the collection at scale
  ${bold("relics validate")} [dir]                 run every check, write nothing
  ${bold("relics export")} [dir] --output x${BUNDLE_EXTENSION}   validate, then write the bundle
  ${bold("relics inspect")} <file${BUNDLE_EXTENSION}>          read a bundle without running it
  ${bold("relics migrate")} <file${BUNDLE_EXTENSION}>          open an older bundle as a draft to finish

  ${dim(`schema ${SCHEMA_VERSION} · kit ${CREATOR_KIT_VERSION} · runtime ${RUNTIME_VERSION}`)}
  ${dim(`built against ${PROTOCOL_RELEASE_COMPATIBILITY}`)}

  ${dim("relics help <command> for details.")}
  ${dim("")}
  ${dim("Two modes. The commands above are OFFLINE: no network, no wallet, no signer, and")}
  ${dim("they produce one .relics file you can import by hand. `relics agent ...` is the")}
  ${dim("autonomous launch mode — it reads live chains and, if relics.agent.json authorises")}
  ${dim("it, signs through a scoped signer and broadcasts. See docs/creator-kit/autonomous-launch-agent.md.")}
`);
  return 0;
}
