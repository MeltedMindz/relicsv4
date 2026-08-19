// SPDX-License-Identifier: MIT
// Terminal reporting. Colour is opt-in: it is used only when stdout is a TTY and NO_COLOR is
// unset, so piping a run into a file or a CI log gives plain text.

import { isRuntimeLaunchable } from "./schema.js";
import { remedyFor } from "./remedies.js";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const ESC = String.fromCharCode(27);
const paint = (code, text) => (useColor ? ESC + "[" + code + "m" + text + ESC + "[0m" : text);

export const bold = (t) => paint("1", t);
export const dim = (t) => paint("2", t);
export const red = (t) => paint("31", t);
export const green = (t) => paint("32", t);
export const yellow = (t) => paint("33", t);
export const cyan = (t) => paint("36", t);

const STATUS = {
  pass: () => green("PASS"),
  warn: () => yellow("WARN"),
  fail: () => red("FAIL"),
  skipped: () => dim("SKIP"),
};

/** @param {import("./schema.js").ValidationResult} result */
export function printChecks(result) {
  for (const check of result.checks) {
    const status = (STATUS[check.status] ?? STATUS.skipped)();
    const detail = check.detail ? dim(` — ${truncate(check.detail, 96)}`) : "";
    console.log(`  ${status}  ${check.title}${detail}`);
  }
}

/**
 * Every issue, with the two things the schema cannot supply: the file a creator can actually EDIT,
 * and the command to RUN afterwards.
 *
 * The schema's own message already says what failed, where and why. It stops there because it is a
 * schema — it does not know it is being run from a project directory by a person with a terminal.
 * Roughly half its issues point at `relics.project.json`, which is GENERATED and overwritten on
 * every export, so a creator who opens it has been sent to a dead end. `remedies.js` names a real
 * file instead. See its header for the rules.
 *
 * @param {import("./schema.js").ValidationResult} result
 */
export function printIssues(result) {
  if (result.issues.length === 0) return;
  const checkOf = checkResolver(result);
  console.log("");
  for (const issue of result.issues) {
    const tag = issue.severity === "error" ? red("error") : yellow("warn ");
    console.log(`  ${tag} ${bold(issue.code)} ${dim(issue.where)}`);
    console.log(`        ${issue.message}`);
    const remedy = remedyFor(issue.code, checkOf(issue));
    console.log(`        ${dim("fix ")} ${remedy.edit}`);
    if (remedy.run) console.log(`        ${dim("then")} ${cyan(`$ ${remedy.run}`)}`);
  }
}

/**
 * Which CHECK raised each issue.
 *
 * `validateBundle` marks checks but returns issues in one flat list, so the mapping is rebuilt the
 * same way the launchpad importer rebuilds it: an exact match on the check's recorded detail first
 * (a check keeps only its most severe message), then a code-prefix table. Getting it wrong only
 * changes which FALLBACK remedy is shown — never whether a bundle is refused, and never for an
 * issue whose own code has a remedy.
 *
 * @param {import("./schema.js").ValidationResult} result
 * @returns {(issue: { code: string, message: string }) => string}
 */
function checkResolver(result) {
  const checks = result.checks ?? [];
  return (issue) => {
    const exact = checks.find((c) => c.status !== "pass" && c.detail === issue.message);
    if (exact) return exact.id;
    return CODE_PREFIX_TO_CHECK.find(([prefix]) => issue.code.startsWith(prefix))?.[1] ?? "MANIFEST_SCHEMA";
  };
}

/** Longest prefix first, so `GEN_DEPENDENCY` beats `GEN_`. */
const CODE_PREFIX_TO_CHECK = [
  ["BUNDLE_CONTRACT_CODE", "NO_ARBITRARY_HOOK"],
  ["MANIFEST_REFUSED_KEY", "NO_ARBITRARY_HOOK"],
  ["BUNDLE_MULTIPLE_SCRIPTS", "ALLOWED_DEPENDENCIES"],
  ["GEN_DEPENDENCY", "ALLOWED_DEPENDENCIES"],
  ["GEN_FORBIDDEN_IDENTIFIER", "NO_EXTERNAL_NETWORK"],
  ["GEN_EXTERNAL_URL", "NO_EXTERNAL_NETWORK"],
  ["GEN_SCRIPT_TOO_LARGE", "SCRIPT_BYTE_LIMIT"],
  ["GEN_NONDETERMINISTIC", "DETERMINISTIC_OUTPUT"],
  ["GEN_RERENDER_THREW", "DETERMINISTIC_OUTPUT"],
  ["GEN_IDENTICAL_OUTPUT", "DETERMINISTIC_OUTPUT"],
  ["GEN_", "RUNTIME_ERRORS"],
  ["SANDBOX_FAILED", "RUNTIME_ERRORS"],
  ["RENDER_", "BLANK_OUTPUTS"],
  ["SVG_", "BLANK_OUTPUTS"],
  ["PREVIEW_", "PREVIEWS_FRESH"],
  ["TRAITS_DUPLICATE_RATE", "DUPLICATE_RATE"],
  ["TRAITS_", "TRAIT_SCHEMA"],
  ["MARKET_QUOTE", "MANIFEST_SCHEMA"],
  ["MARKET_", "MARKET_MAPPING_BOUNDS"],
  ["METADATA_", "COLLECTION_METADATA"],
  ["EARNINGS_", "EARNINGS_CONFIG"],
  ["SUPPLY_", "SUPPLY_AND_BACKING"],
  ["CHAIN_", "CHAIN_FEATURES"],
  ["CHAINS_", "CHAIN_FEATURES"],
  ["SECRET_DETECTED", "SECRET_SCAN"],
  ["CHECKSUMS_", "HASH_INTEGRITY"],
  ["HASH_", "HASH_INTEGRITY"],
  ["HASHES_", "HASH_INTEGRITY"],
  ["INTEGRITY_", "HASH_INTEGRITY"],
  ["BUNDLE_COMMITMENT", "HASH_INTEGRITY"],
  ["ART_BINDING", "ART_BINDING"],
  ["ART_RUNTIME", "ALLOWED_RUNTIME"],
  ["PROTOCOL_TEMPLATE", "PROTOCOL_TEMPLATE"],
  ["CONTAINER", "CONTAINER_STRUCTURE"],
  ["BUNDLE_PATH_POLICY", "LAYOUT_AND_PATHS"],
  ["BUNDLE_MISSING_ENTRY", "LAYOUT_AND_PATHS"],
  ["BUNDLE_GENERATOR_FILES", "LAYOUT_AND_PATHS"],
];

export function printHashes(result) {
  if (!result.hashes || !result.manifest) return;
  const m = result.manifest;
  console.log("");
  console.log(bold("  hashes"));
  const rows = [
    ["bundle", result.hashes.bundleHash],
    ["project config", result.hashes.projectConfigHash],
    ["content", result.hashes.contentHash],
    ["generator", m.hashes.generator],
    ["script", m.hashes.script],
    ["trait schema", m.hashes.traitSchema],
    ["market mapping", m.hashes.marketMapping],
    ["metadata", m.hashes.metadata],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) console.log(`    ${label.padEnd(width)}  ${cyan(value)}`);
}

/**
 * The art binding, printed as the values that end up on chain.
 *
 * These are keccak256 and they are the point of the whole block: `artConfigHash`
 * is what the factory checks `keccak256(artConfig)` against, and the rest is what the collection
 * binds so `tokenURI` renders THIS project's art rather than a built-in placeholder. A creator can
 * copy any line here and compare it against the launch transaction.
 */
export function printBinding(result) {
  const binding = result.manifest?.artBinding;
  if (!binding) return;
  console.log("");
  console.log(bold("  art binding (the values a launch writes on chain)"));
  // Printed WITH the `0x` prefix even though the manifest stores these bare: on screen the value is
  // about to be compared against a `bytes32` in a transaction or an explorer, and that is the form
  // it takes there. The manifest keeps the bare form so it never trips the secret scanner.
  const at = (digest) => (digest ? `0x${digest}` : null);
  const rows = [
    ["runtime", `${binding.runtimeId} v${binding.artRuntimeVersion}${isRuntimeLaunchable(binding.runtime) ? "" : "  (preview only — not launchable yet)"}`],
    ["runtime id hash", at(binding.runtimeIdHash)],
    ["art config format", `${binding.artConfigFormat}  ${dim(`${binding.artConfigBytes.toLocaleString()} bytes`)}`],
    ["art config", at(binding.artConfigHash)],
    ["  visual", at(binding.artConfigVisualHash) ?? dim("null  (a JavaScript generator declares no layer graph)")],
    ["  trait schema", at(binding.artConfigTraitSchemaHash) ?? dim("null")],
    ["template params", at(binding.templateParamsHash) ?? "null"],
    ["generator source", at(binding.generatorSourceHash)],
    ["trait schema doc", at(binding.traitSchemaDocumentHash)],
    ["market mapping", at(binding.marketMappingHash)],
    ["metadata", at(binding.metadataHash)],
    ["outputs", at(binding.representativeOutputsHash) ?? "null"],
    ["bundle", at(result.manifest?.integrity?.bundleCommitment) ?? "-"],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) console.log(`    ${label.padEnd(width)}  ${cyan(value)}`);
  console.log(dim("    runtime code hash and script pointer are resolved on chain; a bundle never states them."));
}

export function heading(text) {
  console.log("");
  console.log(bold(text));
}

export function truncate(text, max) {
  const flat = String(text).replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}


/**
 * A THROWN failure, rendered like a validation issue.
 *
 * Some failures never reach the validator: `assembleBundle` refuses a project it cannot assemble,
 * `readProjectFiles` refuses a tree it cannot read, and the container refuses bytes it cannot
 * write. Those arrived as one bare `relics: <message>` line with no file to open and no command to
 * run — the two most useful sentences, missing exactly where a creator is most stuck, because the
 * layer that knows the fix is this one and the throw happened below it.
 *
 * @param {unknown} err
 * @param {{ root?: string, command?: string }} [context]
 */
export function printFatal(err, context = {}) {
  const message = err instanceof Error ? err.message : String(err);
  const root = context.root && context.root !== "." ? context.root : ".";
  const remedy = fatalRemedy(message, root);

  console.log("");
  console.log(`  ${red("error")} ${bold(remedy.code)}`);
  for (const line of message.split("\n")) console.log(`        ${line}`);
  console.log(`        ${dim("fix ")} ${remedy.edit}`);
  console.log(`        ${dim("then")} ${cyan(`$ ${remedy.run.replace(/\.$/, root)}`)}`);
  console.log("");
  return 1;
}

/**
 * Thrown messages are prose, so this matches on the distinctive phrase each throw site writes.
 * Ordered most specific first. The fallback still names a file and a command — an unrecognised
 * failure is a reason to say less confidently, never a reason to say nothing.
 */
function fatalRemedy(message, root) {
  const table = [
    [/public script budget/, { code: "GEN_SCRIPT_TOO_LARGE", edit: "generator/generate.js is over the on-chain script budget. The whole source is stored on chain, so this is a real limit, not a lint: inline fewer literal tables, shorten repeated strings, drop dead branches. Comments count.", run: "relics validate ." }],
    [/is not an art runtime this format approves/, { code: "ART_RUNTIME_UNAPPROVED", edit: "relics.config.json -> art.runtime must name an approved runtime. `relics templates` shows which template uses which; nothing else can be bound, so a bundle declaring an unapproved runtime could never be launched.", run: "relics templates" }],
    [/params\.json is required for the SOLIDITY_SVG runtime/, { code: "ART_BINDING_CONFIG_MISSING", edit: "generator/params.json is missing. A SOLIDITY_SVG project's art IS that file — the layer graph, palette, sensors and curves its runtime is handed. `relics init --template solidity-svg-params` writes a complete one to start from.", run: "relics validate ." }],
    [/is an unfinished art configuration/, { code: "ART_BINDING_CONFIG_INCOMPLETE", edit: "generator/params.json still has null fields. Each one is an artistic decision the kit will not make for you; the vocabularies and bounds for every field are in that file's `_migration` block.", run: "relics validate ." }],
    [/must declare "format"/, { code: "ART_BINDING_CONFIG_FORMAT", edit: "generator/params.json is a pre-3.0.0 parameter document, not an art configuration — it names no sensor, no response curve and no literal palette, and those cannot be guessed. `relics migrate` carries over what is recoverable.", run: "relics migrate <file>.relics" }],
    [/is not a valid ACV1 configuration/, { code: "ART_BINDING_CONFIG", edit: "generator/params.json breaks an ACV1 rule; the message names which. The bounds are published in that file's own comments and in `relics dev`.", run: "relics dev ." }],
    [/is generated by the builder/, { code: "BUNDLE_GENERATED_ENTRY", edit: "Delete that file from your project directory. The builder writes it on every export, so a copy in the project can only ever be a stale one that shadows the real thing.", run: "relics validate ." }],
    [/is required$/, { code: "BUNDLE_MISSING_ENTRY", edit: "A required file is missing from the project. `relics init` writes all of them; compare against a fresh scaffold to see which one is gone.", run: "relics validate ." }],
    [/no relics\.config\.json/, { code: "PROJECT_NOT_FOUND", edit: "There is no project here. Point the command at a project directory, or scaffold one: `relics init my-project`.", run: "relics init my-project" }],
    [/is a symbolic link/, { code: "PROJECT_SYMLINK", edit: "Replace the symlink with the real file. A bundle carries plain files only — a link would package a path rather than the bytes it points at.", run: "relics validate ." }],
    [/the per-entry limit is/, { code: "ENTRY_TOO_LARGE", edit: "One file is over the per-entry byte limit; the message names it. Shrink or remove it — an oversized asset is almost always an unoptimised image under assets/.", run: "relics validate ." }],
    [/container is larger than|content exceeds|too many entries|declares \d+ entries/, { code: "BUNDLE_TOO_LARGE", edit: "The project exceeds the container's byte or entry budget. Remove or shrink files under assets/ and previews/ — those are where the bytes almost always are.", run: "relics validate ." }],
    [/is not valid JSON/, { code: "JSON_MALFORMED", edit: "The named file is not valid JSON. A trailing comma and an unquoted key are the two usual causes; the message gives the position.", run: "relics validate ." }],
    [/no bundle content found/, { code: "PROJECT_EMPTY", edit: "The directory has a config but none of the content a bundle carries. It needs at least generator/, traits/, market/ and metadata/ — `relics init` writes all four.", run: "relics init my-project" }],
    [/nests deeper than/, { code: "PROJECT_TOO_DEEP", edit: "A directory in the project nests deeper than the bundle layout allows. Flatten it.", run: "relics validate ." }],
  ];
  const hit = table.find(([pattern]) => pattern.test(message))?.[1];
  if (hit) return { ...hit, run: hit.run.endsWith(".") ? hit.run : hit.run };
  return {
    code: "EXPORT_FAILED",
    edit: "The project could not be assembled. The message above names the file; fix it in the project directory — never edit a `.relics` file, and never hand-write a manifest.",
    run: "relics validate .",
  };
}
