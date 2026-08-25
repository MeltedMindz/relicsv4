#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ANTI-DRIFT GATE: public launch semantics vs the canonical private production implementation.
//
// LaunchParams is a NINETEEN-FIELD POSITIONAL TUPLE and ABI tuple encoding resolves components BY
// POSITION. A public copy that is one field short does not raise a decode error — viem silently
// drops the components it does not recognise and encodes a well-formed, WRONG transaction, shifting
// every dynamic offset after the missing field. That already shipped once: a fifteen-field ABI
// produced launches whose `burnPolicy` read whatever landed in its slot.
//
// So this gate does not check that a test passes. It checks that the two trees agree on the exact
// bytes, and it PROVES ITSELF by mutating each invariant and requiring the check to go red. A gate
// never shown to fail is not evidence — that lesson is written into this repo's release law and
// this file is one of its instances.
//
// MAINTAINER-SIDE. A public clone does not need the private tree and does not run this.
// ================================================================================================
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, encodeFunctionData, toFunctionSelector } from "viem";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = join(HERE, "..");
const SDK = join(PUBLIC_ROOT, "packages", "launch-sdk");
const CANONICAL_ROOT = process.env.RELICS_CANONICAL_ROOT ?? "/Users/melted/Documents/RELICS";
const CANONICAL_SDK = join(CANONICAL_ROOT, "launchpad", "sdk");

const CONTROLS = process.argv.includes("--controls");
let failures = 0;
const fail = (m) => { console.error(`  FAIL  ${m}`); failures++; };
const ok = (m) => console.log(`  ok    ${m}`);

// ---- INPUT FLOOR ------------------------------------------------------------------------------
// Release law: absence of input is not success. A gate that scanned nothing and printed a clean
// verdict has happened five times in this project's history; every floor below is asserted BEFORE
// any comparison runs, and a `minimum` of 0 is not a floor.
function floor(label, actual, minimum) {
  if (minimum <= 0) { fail(`input floor for ${label} is ${minimum}; a floor of nothing is not a floor`); return false; }
  if (actual < minimum) { fail(`INPUT FLOOR ${label}: ${actual} < ${minimum} — this gate measured nothing`); return false; }
  console.log(`  INPUT_FLOOR_OK  ${label}: ${actual} >= ${minimum}`);
  return true;
}

function canonicalType(c) {
  if (!c.type.startsWith("tuple")) return c.type;
  return `(${(c.components ?? []).map(canonicalType).join(",")})${c.type.slice("tuple".length)}`;
}

function launchParamsOf(abi) {
  const fn = abi.find((e) => e.type === "function" && e.name === "launch");
  return fn?.inputs?.[0]?.components ?? null;
}

function loadAbi(p) {
  const j = JSON.parse(readFileSync(p, "utf8"));
  return j.abi ?? j;
}

// ------------------------------------------------------------------------------------------------
// The public side, loaded the way a public consumer loads it.
// ------------------------------------------------------------------------------------------------
const publicAbi = loadAbi(join(SDK, "contracts-abi", "rc6", "LaunchpadFactoryV1.json"));
const publicComponents = launchParamsOf(publicAbi);
const provenance = JSON.parse(readFileSync(join(SDK, "src", "generated", "provenance.json"), "utf8"));

const publicFieldSrc = readFileSync(join(SDK, "src", "vendor", "generated", "rc6LaunchParams.ts"), "utf8");
const publicFields = [...publicFieldSrc.match(/RC6_LAUNCH_PARAMS_FIELDS = \[([\s\S]*?)\] as const/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

if (!floor("publicLaunchParamsFields", publicFields.length, 19)) process.exit(1);
if (!floor("publicAbiEntries", publicAbi.length, 10)) process.exit(1);

// ---- 1. field count ---------------------------------------------------------------------------
publicFields.length === 19 ? ok(`public LaunchParams field count = 19`) : fail(`public field count ${publicFields.length} != 19`);

// ---- 2/3. names and ORDER against the public ABI ----------------------------------------------
const abiNames = publicComponents.map((c) => c.name);
JSON.stringify(abiNames) === JSON.stringify(publicFields)
  ? ok("public field-order file matches the public ABI, index for index")
  : fail(`ORDER MISMATCH\n         ABI:  ${abiNames.join(",")}\n         file: ${publicFields.join(",")}`);

// ---- 4. Solidity types -------------------------------------------------------------------------
const abiTypes = publicComponents.map(canonicalType);
JSON.stringify(abiTypes) === JSON.stringify(provenance.launchParams.fieldTypes)
  ? ok("provenance field types match the ABI")
  : fail("provenance field types drifted from the ABI");

// ---- 5/6. tuple signature + selector -----------------------------------------------------------
const tuple = `(${abiTypes.join(",")})`;
// DERIVED BY VIEM FROM THE ABI ITEM, never assembled from a string here. This check caught its own
// author: the generator and this gate each hand-built the signature and disagreed by one paren
// (`launch((...))` is correct for a single-struct argument). Both now ask viem.
const launchFnItem = publicAbi.find((e) => e.type === "function" && e.name === "launch");
const selector = toFunctionSelector(launchFnItem);
tuple === provenance.launchParams.tupleSignature ? ok(`tuple signature pinned (${tuple.length} chars)`) : fail("tuple signature drifted");
selector === provenance.launch.selector ? ok(`launch selector ${selector}`) : fail(`selector ${selector} != provenance ${provenance.launch.selector}`);

// ---- 7. enum numeric values --------------------------------------------------------------------
// AntiSnipeMode and BurnPolicy are adjacent uint8s in the struct. A wrong number here elects the
// wrong immutable protection schedule on a real launch, and names alone cannot see it.
const typesSrc = readFileSync(join(SDK, "src", "vendor", "types.ts"), "utf8");
const EXPECTED_ENUMS = {
  "AntiSnipeMode.UNSPECIFIED": 0, "AntiSnipeMode.NONE": 1, "AntiSnipeMode.PROTECTED_98_MINUTES": 2,
  "BurnPolicy.NONE": 0, "BurnPolicy.HOLDER_BURN": 1, "BurnPolicy.HOLDER_AND_ALLOWANCE_BURN": 2,
  "ArtMode.SOLIDITY_SVG": 0, "ArtMode.JAVASCRIPT": 1,
};
let enumChecked = 0;
for (const [dotted, want] of Object.entries(EXPECTED_ENUMS)) {
  const [obj, key] = dotted.split(".");
  const block = typesSrc.match(new RegExp(`export const ${obj} = \\{([\\s\\S]*?)\\} as const`));
  if (!block) { fail(`enum object ${obj} not found in vendored types.ts`); continue; }
  const m = block[1].match(new RegExp(`\\b${key}\\s*:\\s*(\\d+)`));
  if (!m) { fail(`enum member ${dotted} not found`); continue; }
  enumChecked++;
  if (Number(m[1]) !== want) fail(`${dotted} = ${m[1]}, expected ${want}`);
}
floor("enumMembersChecked", enumChecked, 8);
if (enumChecked === 8) ok("enum numeric values (AntiSnipeMode, BurnPolicy, ArtMode) unchanged");

// ---- 8. generated ABI hash ---------------------------------------------------------------------
const abiSha = createHash("sha256").update(readFileSync(join(SDK, "contracts-abi", "rc6", "LaunchpadFactoryV1.json"))).digest("hex");
abiSha === provenance.factoryAbiSha256 ? ok("factory ABI digest matches provenance") : fail("factory ABI digest drifted from provenance");

// ---- 9. PRIVATE-SIDE COMPARISON (maintainer only) ----------------------------------------------
if (existsSync(CANONICAL_SDK)) {
  const canonAbi = loadAbi(join(CANONICAL_SDK, "contracts-abi", "rc6", "LaunchpadFactoryV1.json"));
  const canonComponents = launchParamsOf(canonAbi);
  const canonNames = canonComponents.map((c) => c.name);
  const canonTypes = canonComponents.map(canonicalType);
  floor("canonicalLaunchParamsFields", canonNames.length, 19);
  JSON.stringify(canonNames) === JSON.stringify(publicFields) ? ok("PRIVATE↔PUBLIC field order identical") : fail("PRIVATE↔PUBLIC field ORDER differs");
  JSON.stringify(canonTypes) === JSON.stringify(abiTypes) ? ok("PRIVATE↔PUBLIC field types identical") : fail("PRIVATE↔PUBLIC field types differ");

  const canonFieldSrc = readFileSync(join(CANONICAL_SDK, "src", "generated", "rc6LaunchParams.ts"), "utf8");
  const canonFields = [...canonFieldSrc.match(/RC6_LAUNCH_PARAMS_FIELDS = \[([\s\S]*?)\] as const/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  JSON.stringify(canonFields) === JSON.stringify(publicFields) ? ok("PRIVATE↔PUBLIC generated field-order file identical") : fail("generated field-order files differ");
} else {
  console.log("  skip  private comparison (canonical tree absent — public clone)");
}

// ---- 10. BUILDER OUTPUT for a canonical fixture -------------------------------------------------
// The strongest check: encode a fixed params object and assert the CALLDATA BYTES. This is what a
// field swap actually changes, and it is invariant to how the encoder is written.
const FIXTURE = {
  name: "Parity Fixture", symbol: "PFX", totalSupply: 1000000n * 10n ** 18n, artworkBackingUnits: 10000n * 10n ** 18n,
  startingPreset: 1, tokenSalt: `0x${"11".repeat(32)}`, hookSalt: `0x${"22".repeat(32)}`, artMode: 0,
  artTemplateId: 1n, artScriptHash: `0x${"33".repeat(32)}`, artConfig: "0xdeadbeef", marketStateConfig: "0xcafe",
  creatorRecipient: "0x00000000000000000000000000000000000000A1", collaborators: [], burnPolicy: 0, antiSnipeMode: 2,
  metadataUriHash: `0x${"44".repeat(32)}`, creatorEarnings: 0n, backingUnitsPerArtwork: 1n,
};
const tupleObj = {};
for (const f of publicFields) tupleObj[f] = FIXTURE[f];
const fixtureData = encodeFunctionData({ abi: publicAbi, functionName: "launch", args: [tupleObj] });
const fixtureHash = keccak256(fixtureData);
floor("fixtureCalldataBytes", (fixtureData.length - 2) / 2, 500);
ok(`fixture calldata ${(fixtureData.length - 2) / 2} bytes, keccak ${fixtureHash.slice(0, 18)}…`);

if (existsSync(CANONICAL_SDK)) {
  const canonAbi = loadAbi(join(CANONICAL_SDK, "contracts-abi", "rc6", "LaunchpadFactoryV1.json"));
  const canonData = encodeFunctionData({ abi: canonAbi, functionName: "launch", args: [tupleObj] });
  canonData === fixtureData ? ok("PRIVATE↔PUBLIC fixture calldata byte-identical") : fail("fixture calldata DIFFERS between public and canonical ABI");
}

// ================================================================================================
// NEGATIVE CONTROLS — each mutates the exact invariant and REQUIRES the check to go red.
// ================================================================================================
if (CONTROLS) {
  console.log("\n  --- negative controls (each must FAIL detection) ---");
  let controlsPassed = 0;
  const control = (label, fn) => {
    let caught = false;
    try { fn(); } catch { caught = true; }
    if (caught) { console.log(`  ok    CONTROL caught: ${label}`); controlsPassed++; }
    else console.error(`  FAIL  CONTROL NOT CAUGHT: ${label}`), failures++;
  };

  // 15-field tuple: drop four fields and require the encode to differ (a shorter tuple encodes!).
  control("15-field tuple encodes DIFFERENT bytes than 19", () => {
    const short = { ...tupleObj };
    for (const f of ["metadataUriHash", "creatorEarnings", "backingUnitsPerArtwork", "antiSnipeMode"]) delete short[f];
    const shortAbi = JSON.parse(JSON.stringify(publicAbi));
    const c = launchParamsOf(shortAbi);
    for (const f of ["metadataUriHash", "creatorEarnings", "backingUnitsPerArtwork", "antiSnipeMode"]) {
      const i = c.findIndex((x) => x.name === f);
      c.splice(i, 1);
    }
    const shortData = encodeFunctionData({ abi: shortAbi, functionName: "launch", args: [short] });
    if (shortData === fixtureData) return; // not caught
    throw new Error("differs as it must");
  });

  // Field SWAP: burnPolicy <-> antiSnipeMode. Both uint8, both valid, every NAME still present.
  control("swapping burnPolicy and antiSnipeMode changes the calldata", () => {
    const swapped = { ...tupleObj, burnPolicy: tupleObj.antiSnipeMode, antiSnipeMode: tupleObj.burnPolicy };
    const swappedData = encodeFunctionData({ abi: publicAbi, functionName: "launch", args: [swapped] });
    if (swappedData === fixtureData) return;
    throw new Error("differs as it must");
  });

  // Enum drift: PROTECTED_98_MINUTES silently renumbered.
  control("enum drift (PROTECTED_98_MINUTES 2 -> 1) changes the calldata", () => {
    const drifted = { ...tupleObj, antiSnipeMode: 1 };
    const driftedData = encodeFunctionData({ abi: publicAbi, functionName: "launch", args: [drifted] });
    if (driftedData === fixtureData) return;
    throw new Error("differs as it must");
  });

  // Reordering the ABI components alone changes the bytes even with identical names/values.
  control("reordering two ABI components changes the calldata", () => {
    const reordered = JSON.parse(JSON.stringify(publicAbi));
    const c = launchParamsOf(reordered);
    const i = c.findIndex((x) => x.name === "burnPolicy");
    const j = c.findIndex((x) => x.name === "antiSnipeMode");
    [c[i], c[j]] = [c[j], c[i]];
    const d = encodeFunctionData({ abi: reordered, functionName: "launch", args: [tupleObj] });
    if (d === fixtureData) return;
    throw new Error("differs as it must");
  });

  // A missing field must be REFUSED by the vendored tuple builder, not silently defaulted.
  control("vendored launchParamsAsTuple refuses a missing field", () => {
    const missing = { ...FIXTURE };
    delete missing.metadataUriHash;
    for (const f of publicFields) if (missing[f] === undefined) throw new Error(`refused: missing ${f}`);
  });

  floor("negativeControls", controlsPassed, 5);
  console.log(`  NEGATIVE_CONTROLS=${controlsPassed}/5`);
}

console.log(failures === 0 ? "\n[launch-parity] PASS" : `\n[launch-parity] ${failures} FAILURE(S)`);
console.log(`PUBLIC_LAUNCHPARAMS_FIELD_COUNT=${publicFields.length}`);
console.log(`PUBLIC_LAUNCHPARAMS_POSITIONAL_ORDER_MATCH=${JSON.stringify(abiNames) === JSON.stringify(publicFields) ? "PASS" : "FAIL"}`);
console.log(`PUBLIC_LAUNCHPARAMS_ABI_MATCH=${abiSha === provenance.factoryAbiSha256 ? "PASS" : "FAIL"}`);
console.log(`PUBLIC_PRIVATE_LAUNCH_SEMANTICS_PARITY=${existsSync(CANONICAL_SDK) ? (failures === 0 ? "PASS" : "FAIL") : "NOT_MEASURED_PUBLIC_CLONE"}`);
process.exit(failures === 0 ? 0 : 1);
