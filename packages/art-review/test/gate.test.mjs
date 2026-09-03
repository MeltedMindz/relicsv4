// SPDX-License-Identifier: MIT
// ================================================================================================
// THE GATE BETWEEN THE BATTERY AND A REVIEWER.
//
// Round one sent two projects to a final reviewer rendering ink 0.000 at all three market states.
// The battery that would have caught it existed and nothing called it. These are the controls for
// the repair: what BLOCKS, what an unrun battery counts as, and the mutation that proves the block
// is doing the work rather than the phrasing.
// ================================================================================================
import assert from "node:assert/strict";
import test from "node:test";

import { BLOCKING_CHECK_IDS, OBJECTIVE_CHECK_IDS, blockingFailures, FLOORS } from "../src/objective.js";

const battery = (checks) => ({ schemaVersion: 1, runtimeId: "VECTOR_COMPOSITION_V1", pass: checks.every((c) => c.ok), unknown: false, checks });
const allOk = () => OBJECTIVE_CHECK_IDS.map((id) => ({ id, ok: true, detail: "ok", measured: null }));

test("a blank token cannot reach a reviewer", () => {
  const checks = allOk();
  checks.find((c) => c.id === "BLANK_DETECTION").ok = false;
  const blocked = blockingFailures(battery(checks));
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].id, "BLANK_DETECTION");
});

test("a token that VANISHES in one market state is the same block as one that is blank in all of them", () => {
  // The distinction matters to the author and not to the gate: BLANK_DETECTION now samples the
  // review ring at all three states, so a healthy neutral frame no longer buys a pass.
  const checks = allOk();
  const c = checks.find((x) => x.id === "BLANK_DETECTION");
  c.ok = false;
  c.detail = "2 of 112 sampled frames are below the 4% floor; the emptiest is review ring seed 249 at stress, covering 0.4%. 2 of them are review-ring frames that VANISH in a market state the token survives elsewhere: stress";
  assert.equal(blockingFailures(battery(checks)).length, 1);
});

test("AN UNRUN BATTERY IS NOT A PASSED ONE", () => {
  const blocked = blockingFailures(null);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].id, "BATTERY_NOT_RUN");
});

test("a battery that could not read the chain blocks on everything it could not answer", () => {
  const b = { schemaVersion: 1, pass: false, unknown: true, checks: [{ id: "CONFIG_LEGAL", ok: false, detail: "the validator could not be read" }] };
  assert.equal(blockingFailures(b).length, 1);
});

test("every declared check blocks, and the list cannot silently shrink", () => {
  // If a check is ever made non-blocking that must be a deliberate edit to BLOCKING_CHECK_IDS with
  // a reason beside it, not a quiet divergence. This asserts the two lists agree today.
  assert.deepEqual([...BLOCKING_CHECK_IDS].sort(), [...OBJECTIVE_CHECK_IDS].sort());
  for (const id of OBJECTIVE_CHECK_IDS) {
    const checks = allOk();
    checks.find((c) => c.id === id).ok = false;
    assert.equal(blockingFailures(battery(checks)).length, 1, `${id} does not block, and nothing says why`);
  }
});

test("a passing battery lets the reviewer through", () => {
  assert.deepEqual(blockingFailures(battery(allOk())), []);
});

test("the ink floor the block is measured against is the one calibrated on the shipped templates", () => {
  assert.equal(FLOORS.ink, 0.04);
});
