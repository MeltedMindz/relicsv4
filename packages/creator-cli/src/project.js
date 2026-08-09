// SPDX-License-Identifier: MIT
// Reading a creator's project directory into the byte map the schema package works with. This is
// the only file in the kit that touches a filesystem for project content, and it is deliberately
// strict: it walks a known set of directories, refuses symlinks, and never follows a path out of
// the project root.

import { readdirSync, readFileSync, statSync, lstatSync, existsSync } from "node:fs";
import { join, relative, sep, resolve } from "node:path";
import { LIMITS, safeJsonParse, checkEntryPolicy } from "./schema.js";

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
  try {
    return safeJsonParse(text, { maxDepth: LIMITS.maxJsonDepth, maxNodes: LIMITS.maxJsonNodes });
  } catch (err) {
    throw new ProjectError(`${CONFIG_FILE} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
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
