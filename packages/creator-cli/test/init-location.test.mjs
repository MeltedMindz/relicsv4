// SPDX-License-Identifier: MIT
// `relics init` MUST SAY WHERE IT JUST PUT SOMEBODY'S PROJECT.
//
// The command writes wherever it is pointed, and a bare name points it into this repository: the
// project lands untracked, uncovered by .gitignore, and one `git add -A` from being committed as a
// change to the kit. It succeeds while doing it — exit 0, a printed path, no warning — which is why
// the README taught the bad form for a long time beside an AGENTS.md that marked it bad.
//
// These tests pin BOTH directions. A warning that never fires is decoration; a warning that always
// fires is noise the next reader learns to skip.

import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { kitCheckoutRoot, landsInsideKitCheckout } from "../src/commands/init.js";

const KIT = kitCheckoutRoot();

test("the kit checkout resolves to the repository that ships this CLI", () => {
  assert.notEqual(KIT, null, "kitCheckoutRoot() returned null inside a real checkout");
  // Derived from the module's own location, so it must contain this very test file.
  assert.ok(fileURLToPath(import.meta.url).startsWith(`${KIT}/`));
});

test("a bare name lands inside the checkout and is reported as such", () => {
  assert.equal(landsInsideKitCheckout(join(KIT, "my-project"), KIT), true);
});

test("the checkout root itself counts as inside", () => {
  assert.equal(landsInsideKitCheckout(KIT, KIT), true);
});

test("a nested path lands inside the checkout", () => {
  assert.equal(landsInsideKitCheckout(join(KIT, "packages", "my-project"), KIT), true);
});

test("the documented `../` form does not warn", () => {
  assert.equal(landsInsideKitCheckout(join(KIT, "..", "my-project"), KIT), false);
});

test("an unrelated absolute path does not warn", () => {
  const dir = mkdtempSync(join(tmpdir(), "relics-init-loc-"));
  try {
    assert.equal(landsInsideKitCheckout(join(dir, "my-project"), KIT), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("containment is answered by path, not by string prefix", () => {
  // `<kit>-notes` shares a prefix with `<kit>` and is not inside it. A `startsWith` check calls
  // this a hazard and sends a creator to fix a directory that was already correct.
  assert.equal(landsInsideKitCheckout(`${KIT}-notes`, KIT), false);
});

test("with no establishable checkout, nothing is claimed", () => {
  // A vendored or relocated copy must not name an unrelated directory as the checkout. Silence is
  // the honest answer to a question that cannot be asked.
  assert.equal(landsInsideKitCheckout(join(KIT, "my-project"), null), false);
});
