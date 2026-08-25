#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Generates packages/launch-sdk/src/generated/provenance.json — the public SDK's statement of WHICH
// protocol generation its types were generated from.
//
// THIS ARTIFACT PROVES TYPE/ABI GENERATION. IT DOES NOT PROVE A CHAIN IS LIVE, and it deliberately
// carries no chain status: `launchAccess`, deployed addresses and runtime registration are LIVE
// facts that must be read at the moment they are relied on. A checked-in file that said "chain 1 is
// open" would be a stale doc enabling a launch, which is the exact failure this repo refuses.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SDK = join(HERE, "..", "packages", "launch-sdk");
const ABI_DIR = join(SDK, "contracts-abi", "rc6");

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const factory = JSON.parse(readFileSync(join(ABI_DIR, "LaunchpadFactoryV1.json"), "utf8"));
const abi = factory.abi ?? factory;

const launchFn = abi.find((e) => e.type === "function" && e.name === "launch");
if (!launchFn) throw new Error("provenance: LaunchpadFactoryV1 ABI has no launch()");
const params = launchFn.inputs?.[0];
if (!params?.components) throw new Error("provenance: launch()'s first argument is not a struct");

/** Fully-expanded canonical ABI type of one component, recursively. */
function canonicalType(c) {
  if (!c.type.startsWith("tuple")) return c.type;
  const inner = (c.components ?? []).map(canonicalType).join(",");
  return `(${inner})${c.type.slice("tuple".length)}`;
}

const fieldNames = params.components.map((c) => c.name);
const fieldTypes = params.components.map(canonicalType);
const tupleSignature = `(${fieldTypes.join(",")})`;

// THE SELECTOR COMES FROM VIEM'S OWN DERIVATION, NOT FROM A STRING BUILT HERE.
//
// This line used to hand-assemble `launch(${tupleSignature})` and the parity gate hand-assembled
// `launch${tuple}` — the same intent, written twice, and they disagreed. A function taking ONE
// struct has the canonical signature `launch((string,string,...))`: the tuple keeps its own
// parentheses INSIDE the argument list, so one of the two forms was a paren short and produced a
// selector for a function that does not exist. Two hand-built copies of a canonical string is the
// same defect class as two hand-built copies of a field order, and it gets the same answer: derive
// it, once, from the ABI.
const { toFunctionSelector, toFunctionSignature } = await import("viem");
const launchSignature = toFunctionSignature(launchFn);
const launchSelector = toFunctionSelector(launchFn);

const vendor = JSON.parse(readFileSync(join(SDK, "VENDOR.json"), "utf8"));

const provenance = {
  $comment: [
    "GENERATED — do not hand-edit. `npm run launch:provenance` regenerates it.",
    "This records WHICH protocol generation the public SDK's types and encoder were generated from.",
    "It carries NO chain status on purpose: whether a factory is deployed, whether launchAccess is",
    "PUBLIC, and whether a runtime is registered are LIVE facts, read at the moment they are relied",
    "on. A checked-in file asserting a chain is open is a stale doc enabling a launch.",
  ],
  protocolGeneration: "RC6",
  launchParams: {
    fieldCount: fieldNames.length,
    fieldOrder: fieldNames,
    fieldTypes,
    tupleSignature,
    tupleSignatureSha256: sha256(Buffer.from(tupleSignature, "utf8")),
    fieldOrderSha256: sha256(Buffer.from(fieldNames.join(","), "utf8")),
  },
  launch: { signature: launchSignature, selector: launchSelector },
  factoryAbiSha256: sha256(readFileSync(join(ABI_DIR, "LaunchpadFactoryV1.json"))),
  abis: Object.fromEntries(readdirSync(ABI_DIR).sort().map((n) => [n, sha256(readFileSync(join(ABI_DIR, n)))])),
  vendoredSources: Object.fromEntries(Object.entries(vendor.sources).map(([k, v]) => [k, v.publicSha256])),
  publicSdkSourceGeneration: "1",
};

const out = join(SDK, "src", "generated", "provenance.json");
if (process.argv.includes("--check")) {
  const have = readFileSync(out, "utf8");
  const want = `${JSON.stringify(provenance, null, 2)}\n`;
  if (have !== want) { console.error("[provenance] DRIFT — regenerate with `npm run launch:provenance`"); process.exit(1); }
  console.log("[provenance] OK");
} else {
  writeFileSync(out, `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`[provenance] fields=${fieldNames.length} selector=${launchSelector}`);
  console.log(`[provenance] tuple=${tupleSignature.slice(0, 90)}...`);
}
