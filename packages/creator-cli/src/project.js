// SPDX-License-Identifier: MIT
// Reading a creator's project directory into the byte map the schema package works with. This is
// the only file in the kit that touches a filesystem for project content, and it is deliberately
// strict: it walks a known set of directories, refuses symlinks, and never follows a path out of
// the project root.

import { readdirSync, readFileSync, statSync, lstatSync, existsSync } from "node:fs";
import { join, relative, sep, resolve } from "node:path";
import { LIMITS, safeJsonParse, checkEntryPolicy, bindCanonicalEconomics, validateReviewedProtocolTemplate } from "./schema.js";

export const CONFIG_FILE = "relics.config.json";

/** Directories and root files that become bundle entries. Anything else in the project is local. */
const INCLUDED_ROOTS = ["generator", "traits", "market", "metadata", "assets", "previews"];
const INCLUDED_ROOT_FILES = ["README.md", "LICENSE"];

export class ProjectError extends Error {}

/** @param {string} root */
export function readConfig(root) {
  const path = join(root, CONFIG_FILE);
  if (!existsSync(path)) {
    throw new ProjectError(`no ${CONFIG_FILE} in ${root} — run \`relics init\` first, or point at a project directory`);
  }
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new ProjectError(`could not read ${CONFIG_FILE}: ${err instanceof Error ? err.message : String(err)}`);
  }
  let config;
  try {
    config = safeJsonParse(text, { maxDepth: LIMITS.maxJsonDepth, maxNodes: LIMITS.maxJsonNodes });
  } catch (err) {
    throw new ProjectError(`${CONFIG_FILE} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return materializeProtocolTemplate(resolve(root), config);
}

/**
 * Turns a `protocolTemplate` REQUEST in relics.config.json into the BINDING a bundle carries.
 *
 * A reviewed protocol template is a launchpad operator's immutable product integration, not a
 * creator setting, so the creator kit registers none: on a stock kit this whole path ends in a
 * refusal that names the field, the file and the fix. Ordinary projects never reach it — the block
 * is absent and this returns immediately.
 */
function materializeProtocolTemplate(root, config) {
  const request = config.protocolTemplate;
  if (request === undefined) return config;
  const at = `${CONFIG_FILE} #protocolTemplate`;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new ProjectError(
      `${at} must be an object.\n` +
        `  where   ${join(root, CONFIG_FILE)}\n` +
        `  edit    remove the protocolTemplate block, or make it an object with "id" and "canonicalEconomicsPath"\n` +
        `  then    relics validate ${root}`,
    );
  }
  const relativePath = request.canonicalEconomicsPath;
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new ProjectError(
      `${at}.canonicalEconomicsPath is required — a reviewed template binds an artifact the operator gave you, and the kit will not invent one.\n` +
        `  where   ${join(root, CONFIG_FILE)}\n` +
        `  edit    set "canonicalEconomicsPath" to the JSON file the launchpad operator issued, relative to this project\n` +
        `  then    relics validate ${root}`,
    );
  }
  const artifactPath = resolve(root, relativePath);
  if (!existsSync(artifactPath)) {
    throw new ProjectError(
      `BLOCKED_CANONICAL_ECONOMICS_MISSING: ${artifactPath}\n` +
        `  what    ${at}.canonicalEconomicsPath points at a file that does not exist\n` +
        `  where   ${relativePath} (resolved to ${artifactPath})\n` +
        `  edit    put the operator's canonical economics JSON there, or correct the path in ${CONFIG_FILE}\n` +
        `  then    relics validate ${root}`,
    );
  }
  let canonicalEconomics;
  try {
    canonicalEconomics = safeJsonParse(readFileSync(artifactPath, "utf8"), {
      maxDepth: LIMITS.maxJsonDepth,
      maxNodes: LIMITS.maxJsonNodes,
    });
  } catch (err) {
    throw new ProjectError(
      `canonical economics is not valid JSON: ${err instanceof Error ? err.message : String(err)}\n` +
        `  where   ${artifactPath}\n` +
        `  edit    restore the file exactly as the operator issued it — a reviewed artifact is never hand-edited\n` +
        `  then    relics validate ${root}`,
    );
  }
  const binding = bindCanonicalEconomics(request.id, canonicalEconomics);
  const issues = validateReviewedProtocolTemplate(binding);
  if (issues.length > 0) {
    const detail = issues.map((issue) => `  ${issue.code}  ${issue.message}`).join("\n");
    throw new ProjectError(
      `BLOCKED_CANONICAL_ECONOMICS_INVALID: ${issues.map((issue) => issue.code).join(", ")}\n` +
        `${detail}\n` +
        `  where   ${join(root, CONFIG_FILE)} and ${artifactPath}\n` +
        `  edit    remove the protocolTemplate block from ${CONFIG_FILE} unless a launchpad operator gave you one\n` +
        `  then    relics validate ${root}`,
    );
  }
  return { ...config, protocolTemplate: binding };
}

/**
 * Collects the project's bundle entries as a path -> bytes map.
 * @param {string} root
 * @param {{ includePreviews?: boolean }} [options]
 * @returns {Map<string, Uint8Array>}
 */
export function readProjectFiles(root, options = {}) {
  const includePreviews = options.includePreviews ?? true;
  const absoluteRoot = resolve(root);
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();

  for (const name of INCLUDED_ROOT_FILES) {
    const path = join(absoluteRoot, name);
    if (existsSync(path) && lstatSync(path).isFile()) files.set(name, new Uint8Array(readFileSync(path)));
  }

  for (const dir of INCLUDED_ROOTS) {
    if (dir === "previews" && !includePreviews) continue;
    const path = join(absoluteRoot, dir);
    if (!existsSync(path)) continue;
    walk(absoluteRoot, path, files);
  }

  if (files.size === 0) throw new ProjectError(`no bundle content found under ${absoluteRoot}`);
  return files;
}

function walk(root, dir, files, depth = 0) {
  if (depth > LIMITS.maxPathDepth) throw new ProjectError(`${dir} nests deeper than the bundle format allows`);
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const absolute = join(dir, entry.name);
    const rel = relative(root, absolute).split(sep).join("/");
    if (entry.isSymbolicLink()) throw new ProjectError(`${rel} is a symbolic link; a bundle carries plain files only`);
    if (entry.isDirectory()) {
      walk(root, absolute, files, depth + 1);
      continue;
    }
    if (!entry.isFile()) throw new ProjectError(`${rel} is not a regular file`);
    if (entry.name.startsWith(".")) continue;
    const policy = checkEntryPolicy(rel);
    if (!policy.ok) throw new ProjectError(policy.reason);
    const size = statSync(absolute).size;
    if (size > LIMITS.maxEntryBytes) throw new ProjectError(`${rel} is ${size} bytes; the per-entry limit is ${LIMITS.maxEntryBytes}`);
    files.set(rel, new Uint8Array(readFileSync(absolute)));
  }
}

/**
 * The generator sources as text, for static analysis and sandboxed evaluation.
 * @param {Map<string, Uint8Array>} files
 */
export function generatorSources(files) {
  /** @type {Map<string, string>} */
  const sources = new Map();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const [path, bytes] of files) {
    if (path.startsWith("generator/") && path.endsWith(".js")) sources.set(path, decoder.decode(bytes));
  }
  return sources;
}
