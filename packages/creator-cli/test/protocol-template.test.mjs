// SPDX-License-Identifier: MIT
// The reviewed-protocol-template MECHANISM as the CLI meets it.
//
// No concrete template is asserted here, because the kit registers none. A reviewed template is a
// launchpad OPERATOR's immutable product integration; the operator registers an instance into the
// schema registry and the kit's job is to behave correctly both with an empty registry (refuse by
// name) and with one registered (bind by hash, refuse anything that is not the reviewed artifact).
//
// The economics document below is a deliberately NEUTRAL fixture — invented for this test, tied to
// no product. That is the point: the mechanism must work without the format knowing any product's
// numbers.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readConfig } from "../src/project.js";
import { listReviewedProtocolTemplates } from "../src/commands/init.js";
import { bindCanonicalEconomics, canonicalJson, clearReviewedProtocolTemplates, registerReviewedProtocolTemplate, sha256Utf8 } from "../src/schema.js";

const TEMPLATE_ID = "EXAMPLE_REVIEWED_TEMPLATE_V1";

/** A neutral canonical economics document. Values are illustrative, not any project's. */
const economics = {
  schemaVersion: 1,
  launchpadTemplateId: TEMPLATE_ID,
  erc20GenesisSupplyWhole: 1000000,
  erc20Decimals: 18,
  erc721MaxSupply: 1000,
  genesisTokensPerPossibleNftWhole: 1000,
  rewardDistributionMode: "IMMEDIATE_CLAIMABLE",
};
const ECONOMICS_SHA256 = sha256Utf8(canonicalJson(economics));

function writeProject(dir, protocolTemplate, artifact = economics) {
  if (artifact !== null) writeFileSync(path.join(dir, "canonical.json"), `${JSON.stringify(artifact)}\n`);
  writeFileSync(path.join(dir, "relics.config.json"), JSON.stringify({ protocolTemplate }));
}

function tmp(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test("the creator kit registers no reviewed protocol template", () => {
  clearReviewedProtocolTemplates();
  assert.deepEqual(listReviewedProtocolTemplates(), []);
});

test("with nothing registered, a protocolTemplate block is refused BY NAME, not silently accepted", () => {
  clearReviewedProtocolTemplates();
  const dir = tmp("relics-template-unregistered-");
  writeProject(dir, { id: TEMPLATE_ID, canonicalEconomicsPath: "canonical.json" });
  try {
    assert.throws(
      () => readConfig(dir),
      (error) => {
        assert.match(error.message, /PROTOCOL_TEMPLATE_ID/, "the refusal must name the failing check");
        assert.match(error.message, /implements no reviewed protocol template/, "it must say WHY there is no template to bind");
        assert.match(error.message, /relics\.config\.json/, "it must name the file to edit");
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a registered template materializes from the operator's artifact and commits to it by hash", () => {
  clearReviewedProtocolTemplates();
  registerReviewedProtocolTemplate({ id: TEMPLATE_ID, economicsSha256: ECONOMICS_SHA256 });
  const dir = tmp("relics-template-");
  writeProject(dir, { id: TEMPLATE_ID, canonicalEconomicsPath: "canonical.json" });
  try {
    const config = readConfig(dir);
    assert.equal(config.protocolTemplate.id, TEMPLATE_ID);
    assert.equal(config.protocolTemplate.canonicalEconomicsPath, undefined, "the local path never travels into the bundle");
    assert.equal(config.protocolTemplate.canonicalEconomics.rewardDistributionMode, "IMMEDIATE_CLAIMABLE");
    assert.equal(config.protocolTemplate.economicsSha256, ECONOMICS_SHA256);
    assert.match(config.protocolTemplate.economicsSha256, /^[0-9a-f]{64}$/);
  } finally {
    clearReviewedProtocolTemplates();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an artifact that is not the REVIEWED one is refused, even though it is internally consistent", () => {
  clearReviewedProtocolTemplates();
  registerReviewedProtocolTemplate({ id: TEMPLATE_ID, economicsSha256: ECONOMICS_SHA256 });
  const dir = tmp("relics-template-edited-");
  // Self-consistent by construction: bindCanonicalEconomics will hash exactly these bytes. The pin
  // is what makes "consistent" insufficient.
  writeProject(dir, { id: TEMPLATE_ID, canonicalEconomicsPath: "canonical.json" }, { ...economics, erc721MaxSupply: 2000 });
  try {
    assert.throws(
      () => readConfig(dir),
      (error) => {
        assert.match(error.message, /PROTOCOL_TEMPLATE_ECONOMICS_PIN/);
        return true;
      },
    );
  } finally {
    clearReviewedProtocolTemplates();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bindCanonicalEconomics is pure: producing a binding is not the same as honouring one", () => {
  clearReviewedProtocolTemplates();
  const binding = bindCanonicalEconomics(TEMPLATE_ID, economics);
  assert.equal(binding.economicsSha256, ECONOMICS_SHA256, "the binding is computable with nothing registered");
});

test("the artifact must exist, and the refusal says where it was looked for", () => {
  clearReviewedProtocolTemplates();
  registerReviewedProtocolTemplate({ id: TEMPLATE_ID, economicsSha256: ECONOMICS_SHA256 });
  const dir = tmp("relics-template-missing-");
  writeProject(dir, { id: TEMPLATE_ID, canonicalEconomicsPath: "missing.json" }, null);
  try {
    assert.throws(
      () => readConfig(dir),
      (error) => {
        assert.ok(error.message.startsWith("BLOCKED_CANONICAL_ECONOMICS_MISSING:"), error.message);
        assert.match(error.message, /missing\.json/);
        return true;
      },
    );
  } finally {
    clearReviewedProtocolTemplates();
    rmSync(dir, { recursive: true, force: true });
  }
});
