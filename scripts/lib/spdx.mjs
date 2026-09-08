#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE ONE READING OF A FILE'S OWN LICENSE.
//
// `PUBLIC_EXPORT_MANIFEST.json` is a published claim about what this repository redistributes and
// under what terms. It got that claim wrong for 161 files: everything under `lib/v4-core/` and
// `lib/v4-core/lib/solmate/` was labelled `license: MIT` / `provenance: original-clean-room`, while
// 50 solmate files carry `SPDX-License-Identifier: AGPL-3.0-only` and 8 v4-core files carry
// `BUSL-1.1`. `lib/v4-core/lib/solmate/src/test/RolesAuthority.t.sol` begins with the AGPL line and
// the manifest called it MIT clean-room code.
//
// The generator had ASSUMED. It carried `SUBMODULES = new Set(["lib/forge-std", "lib/uniswap-hooks"])`
// and a policy string reading "Third-party source is referenced via submodules, not vendored" — but
// `.gitmodules` does not exist in this repository, there are ZERO gitlinks (mode 160000), and 739
// third-party files are vendored byte-exact and published here. Every path that was not one of two
// hardcoded names fell through to a final `return { provenance: "original-clean-room", license: "MIT" }`,
// so a false licensing claim was the DEFAULT rather than an accident.
//
// The repair is to stop assuming. A file states its own license on its first line; that statement is
// the authority. This module is the single place that reads it, imported by both the generator and
// the checker, because two implementations of "what license is this file" agree until they do not
// and the disagreement is published.
//
// See THIRD_PARTY_NOTICES.md, which had it right the whole time.

import { readFileSync } from "node:fs";

/**
 * An SPDX header, anchored to a whole line and to an optional comment opener.
 *
 * Anchoring matters. A loose `SPDX-License-Identifier:\s*(\S+)` also matches PROSE — the string
 * "...carry SPDX-License-Identifier: MIT; copyright remains with their respective authors" inside
 * `submissions/relics-v4/submission.json` is a sentence about other files, not a declaration about
 * that one, and reading it as a declaration would put a fabricated license in the manifest.
 */
export const SPDX_RE =
  /^[ \t]*(?:\/\/+|\/\*+|\*|#+|--|;+|<!--)?[ \t]*SPDX-License-Identifier:[ \t]*([A-Za-z0-9.\-+]+(?:[ \t]+(?:OR|AND|WITH)[ \t]+[A-Za-z0-9.\-+]+)*)[ \t]*(?:\*\/|-->)?[ \t]*$/gm;

/** This repository's own license, the one `LICENSE` grants over first-party source. */
export const REPOSITORY_LICENSE = "MIT";

/**
 * Where third-party source is VENDORED — copied in byte-exact and redistributed from this tree.
 *
 * These are directory prefixes, not submodules. `THIRD_PARTY_NOTICES.md` is the authoritative
 * component table; this list is the machine-readable shape of the same fact. It is deliberately not
 * the only thing standing between the manifest and a false claim: `check-manifest-licenses.mjs`
 * ALSO refuses `original-clean-room` on any file whose own SPDX line is not this repository's
 * license, so a vendored tree added later and forgotten here is still caught — by its contents
 * rather than by its name.
 */
export const VENDORED_THIRD_PARTY_ROOTS = ["lib/", "flagship/lib/"];

/** @returns {boolean} whether `path` (a repo-relative, forward-slash path) is vendored third-party. */
export function isVendoredThirdParty(path) {
  return VENDORED_THIRD_PARTY_ROOTS.some((root) => path.startsWith(root));
}

/**
 * Read the license a file declares about ITSELF.
 *
 * @param {string} absPath
 * @returns {{ license: string, all: string[] } | null} `null` when the file declares nothing.
 *
 * A file carrying two DIFFERENT identifiers is returned with both, so a caller can refuse rather
 * than silently take the first — an unnoticed second identifier is how a concatenated or partially
 * relicensed file would publish half a truth.
 */
export function readDeclaredLicense(absPath) {
  let text;
  try {
    const buf = readFileSync(absPath);
    // Binary files declare nothing. A NUL in the first block is the cheap, reliable tell, and
    // decoding one as UTF-8 would only produce replacement characters to search through.
    if (buf.includes(0, 0)) return null;
    text = buf.toString("utf8");
  } catch {
    return null;
  }
  const found = [];
  SPDX_RE.lastIndex = 0;
  for (const m of text.matchAll(SPDX_RE)) found.push(m[1].replace(/[ \t]+/g, " ").trim());
  if (found.length === 0) return null;
  return { license: found[0], all: [...new Set(found)] };
}
