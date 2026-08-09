// SPDX-License-Identifier: MIT
// Entry-path hardening. Every path that comes out of a bundle passes through `normalizeEntryPath`
// before anything else looks at it. A path is accepted only if it is already in canonical form —
// the reader never "repairs" a hostile path into a safe one, because a repaired path and the
// creator's declared checksums would then describe different files.

import { LIMITS, ALLOWED_EXTENSIONS, FORBIDDEN_EXTENSIONS, BUNDLE_LAYOUT } from "./limits.js";

export class EntryPathError extends Error {}

// C0/C1 controls, zero-width characters, RTL/LTR marks and overrides, and the BOM.
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/u;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * Validates one raw ZIP entry name and returns the normalized path.
 *
 * Refuses, with a specific reason:
 *  - absolute paths and Windows drive letters
 *  - `..` traversal, `.` segments, empty segments, trailing slashes
 *  - backslashes (a Windows separator that some extractors turn into a directory boundary)
 *  - control characters, zero-width characters and bidirectional overrides (path confusion)
 *  - names that are not already Unicode NFC (two visually identical names that normalize to one)
 *  - non-ASCII names entirely — the format is deliberately ASCII-only so "same path" is a
 *    byte comparison in every runtime
 *  - dotfiles, Windows reserved device names, and over-long or over-deep paths
 *
 * @param {string} raw
 * @returns {string} normalized path
 */
export function normalizeEntryPath(raw) {
  if (typeof raw !== "string" || raw.length === 0) throw new EntryPathError("empty entry path");
  if (raw.length > LIMITS.maxPathBytes) throw new EntryPathError(`entry path longer than ${LIMITS.maxPathBytes} bytes: ${preview(raw)}`);
  if (CONTROL_OR_BIDI.test(raw)) throw new EntryPathError(`entry path contains control, zero-width or bidirectional characters: ${preview(raw)}`);
  if (raw.includes("\\")) throw new EntryPathError(`entry path contains a backslash: ${preview(raw)}`);
  if (raw.normalize("NFC") !== raw) throw new EntryPathError(`entry path is not Unicode NFC: ${preview(raw)}`);
  // eslint-disable-next-line no-control-regex
  if (!/^[\x20-\x7e]+$/.test(raw)) throw new EntryPathError(`entry path must be printable ASCII: ${preview(raw)}`);
  if (raw.startsWith("/")) throw new EntryPathError(`absolute entry path: ${preview(raw)}`);
  if (/^[a-zA-Z]:/.test(raw)) throw new EntryPathError(`entry path carries a drive letter: ${preview(raw)}`);
  if (raw.endsWith("/")) throw new EntryPathError(`directory entries are not stored in a bundle: ${preview(raw)}`);

  const segments = raw.split("/");
  if (segments.length > LIMITS.maxPathDepth) throw new EntryPathError(`entry path nests deeper than ${LIMITS.maxPathDepth} segments: ${preview(raw)}`);
  for (const segment of segments) {
    if (segment === "") throw new EntryPathError(`entry path has an empty segment: ${preview(raw)}`);
    if (segment === "." || segment === "..") throw new EntryPathError(`entry path contains a traversal segment: ${preview(raw)}`);
    if (segment.startsWith(".")) throw new EntryPathError(`hidden files are not carried in a bundle: ${preview(raw)}`);
    if (segment.endsWith(".") || segment.endsWith(" ")) throw new EntryPathError(`entry path segment ends in a dot or space: ${preview(raw)}`);
    if (WINDOWS_RESERVED.test(segment)) throw new EntryPathError(`entry path uses a reserved device name: ${preview(raw)}`);
  }
  return raw;
}

/**
 * The case-and-separator-insensitive key two entries would collide on after extraction. Used to
 * refuse duplicate normalized paths (`Assets/a.png` vs `assets/a.png` land on the same file on a
 * case-insensitive filesystem).
 * @param {string} path
 */
export function collisionKey(path) {
  return path.toLowerCase();
}

/** @param {string} path */
export function extensionOf(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

/**
 * The bundle role a path belongs to (`root`, `generator`, `traits`, …), or null when the path is
 * not inside the declared layout.
 * @param {string} path
 */
export function roleOf(path) {
  if (!path.includes("/")) {
    const known = BUNDLE_LAYOUT.find((e) => e.kind === "file" && e.path === path);
    if (known) return known.role;
    return path === "LICENSE" ? "root" : null;
  }
  const top = `${path.slice(0, path.indexOf("/"))}/`;
  const dir = BUNDLE_LAYOUT.find((e) => e.kind === "dir" && e.path === top);
  return dir ? dir.role : null;
}

/**
 * Full policy check for one entry path: layout membership, extension allowlist, and the
 * everywhere-forbidden extension list.
 * @param {string} path
 * @returns {{ ok: true, role: string } | { ok: false, reason: string }}
 */
export function checkEntryPolicy(path) {
  const ext = extensionOf(path);
  const forbidden = FORBIDDEN_EXTENSIONS[ext];
  if (forbidden) return { ok: false, reason: `"${path}" uses the forbidden extension ${ext} — ${forbidden}` };

  const role = roleOf(path);
  if (!role) return { ok: false, reason: `"${path}" is outside the bundle layout (allowed: ${BUNDLE_LAYOUT.map((e) => e.path).join(", ")})` };

  if (path === "LICENSE") return { ok: true, role };
  const allowed = ALLOWED_EXTENSIONS[role];
  if (!allowed.includes(ext)) {
    return { ok: false, reason: `"${path}" has extension "${ext || "(none)"}", which ${role} entries may not use (allowed: ${allowed.join(", ")})` };
  }
  return { ok: true, role };
}

function preview(value) {
  const clipped = value.length > 60 ? `${value.slice(0, 60)}…` : value;
  return JSON.stringify(clipped);
}
