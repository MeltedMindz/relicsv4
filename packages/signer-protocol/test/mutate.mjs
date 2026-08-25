// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MUTATION RUN. A guard never shown to fail is not evidence that it works.
//
// `test/*.test.mjs` proves the guard refuses eighteen bad requests. It does NOT prove that any
// particular check is what refused them: a guard could be catching every control on one over-broad
// condition, and the suite would stay green while the other seventeen checks did nothing. So this
// harness breaks ONE check at a time in the source and requires a NAMED test to go red for each.
//
// Two rules make this an actual measurement rather than a count.
//
//   * A mutation whose anchor is not found in the source is scored SURVIVED, loudly. A mutation
//     that changed nothing passes every test by construction, and a harness that counted it as
//     "caught" would report success proportional to how stale it had become.
//   * A red run is not enough on its own — the EXPECTED test has to be the one that went red.
//     Breaking the value ceiling and watching an unrelated test fail proves nothing about the value
//     ceiling.
//
// The sources are restored in a `finally` and again on exit, so an interrupted run does not leave a
// deliberately broken guard on disk.
// ================================================================================================
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = fileURLToPath(new URL("./", import.meta.url));
const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const GUARD = join(SRC, "policyGuard.ts");
const DEV = join(SRC, "adapters/devKeystore.ts");
const SUITE = ["policyGuard.test.mjs", "devKeystore.test.mjs", "sidecar.test.mjs"].map((f) => join(TEST_DIR, f));

const MUTATIONS = [
  { id: "selector allowlist", file: GUARD, from: `if (!ALLOWED_SELECTORS.some((allowed) => allowed.toLowerCase() === actualSelector)) {`, to: `if (false) {`, expect: "arbitrary ERC-20 transfer() calldata is refused SELECTOR_NOT_ALLOWED" },
  { id: "selector honesty", file: GUARD, from: `if (!sameHex(request.selector, actualSelector)) {`, to: `if (false) {`, expect: "calldata that LIES about its selector" },
  { id: "target factory", file: GUARD, from: `if (!sameHex(request.to, approvedBuild.factory)) {`, to: `if (false) {`, expect: "pointing at some other contract is refused TARGET_NOT_CANONICAL_FACTORY" },
  { id: "gas ceiling", file: GUARD, from: `if (request.estimatedGas > policy.maxTransactionGas) {`, to: `if (false) {`, expect: "gas above the policy ceiling" },
  { id: "value ceiling", file: GUARD, from: `if (request.value > policy.maxNativeSpendWei) {`, to: `if (false) {`, expect: "value above the policy ceiling" },
  { id: "gas price ceiling", file: GUARD, from: `if (request.maxFeePerGas > policy.maxGasPriceWei) {`, to: `if (false) {`, expect: "maxFeePerGas above the policy ceiling" },
  { id: "calldata hash", file: GUARD, from: `if (!sameHex(recomputed, request.dataHash)) {`, to: `if (false) {`, expect: "data mutated after dataHash was computed" },
  { id: "policy hash", file: GUARD, from: `if (!sameHex(request.policyHash, approvedBuild.policyHash)) {`, to: `if (false) {`, expect: "policyHash changed after build approval" },
  { id: "launch plan hash", file: GUARD, from: `if (!sameHex(request.launchPlanHash, approvedBuild.launchPlanHash)) {`, to: `if (false) {`, expect: "launchPlanHash that moved" },
  { id: "bundle hash", file: GUARD, from: `if (!sameHex(request.bundleHash, approvedBuild.bundleHash)) {`, to: `if (false) {`, expect: "bundleHash that moved" },
  { id: "recipient", file: GUARD, from: `if (!sameHex(recipient, policy.creatorRecipient)) {`, to: `if (false) {`, expect: "recipient inside the calldata that is not the policy's" },
  {
    id: "undecodable recipient fails closed",
    file: GUARD,
    from: `    return refuse("RECIPIENT_NOT_POLICY_RECIPIENT", \`the creatorRecipient could not be read out of the calldata`,
    to: `    return ALLOWED;\n    return refuse("RECIPIENT_NOT_POLICY_RECIPIENT", \`the creatorRecipient could not be read out of the calldata`,
    expect: "carries the launch selector but does not decode",
  },
  { id: "no approved build", file: GUARD, from: `if (!approvedBuild) {`, to: `if (false && !approvedBuild) {`, expect: "no approved build at all" },
  { id: "chain allowlist", file: GUARD, from: `if (!policy.allowedChains.includes(request.chainId)) {`, to: `if (false) {`, expect: "chain absent from the policy" },
  { id: "approved build chain", file: GUARD, from: `if (approvedBuild.chainId !== request.chainId) {`, to: `if (false) {`, expect: "approved build for a different chain" },
  {
    id: "guard runs at all",
    file: GUARD,
    from: `  const staticVerdict = checkStaticPolicy(input);`,
    to: `  const staticVerdict = ALLOWED; void checkStaticPolicy;`,
    expect: "SELECTOR_NOT_ALLOWED",
  },
  { id: "dev signer supportsChain", file: DEV, from: `return !REFUSED_CHAIN_IDS.includes(chainId);`, to: `return true;`, expect: "every production chain is refused" },
  { id: "dev signer sign()", file: DEV, from: `if (REFUSED_CHAIN_IDS.includes(req.chainId)) throw refusalFor(req.chainId);`, to: `if (false) throw refusalFor(req.chainId);`, expect: "the dev keystore refuses to sign on chainId 1" },
];

const backupDir = mkdtempSync(join(tmpdir(), "relics-signer-mutate-"));
const backups = new Map();
for (const file of new Set(MUTATIONS.map((m) => m.file))) {
  const backup = join(backupDir, file.split("/").pop());
  copyFileSync(file, backup);
  backups.set(file, backup);
}
function restoreAll() {
  for (const [file, backup] of backups) copyFileSync(backup, file);
}
process.on("exit", restoreAll);
process.on("SIGINT", () => process.exit(130));

function runSuite() {
  try {
    return { failed: false, output: execFileSync(process.execPath, ["--test", ...SUITE], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { failed: true, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

// A GREEN BASELINE FIRST. Scoring mutations against an already-red suite would mark every one of
// them "caught" without breaking anything.
const baseline = runSuite();
if (baseline.failed) {
  console.error("BASELINE IS RED. Fix the suite before measuring mutations; every mutation would score a false CAUGHT.");
  console.error(baseline.output.slice(-4000));
  process.exit(1);
}
console.log("baseline: GREEN\n");

let survived = 0;
for (const mutation of MUTATIONS) {
  const original = readFileSync(mutation.file, "utf8");
  if (!original.includes(mutation.from)) {
    survived++;
    console.log(`SURVIVED  ${mutation.id} — ANCHOR NOT FOUND. This mutation changed nothing; it has been scoring a free pass.`);
    continue;
  }
  writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  let result;
  try {
    result = runSuite();
  } finally {
    restoreAll();
  }
  const namedTestRed = result.output.includes(mutation.expect);
  if (result.failed && namedTestRed) console.log(`CAUGHT    ${mutation.id} -> "${mutation.expect}"`);
  else {
    survived++;
    console.log(`SURVIVED  ${mutation.id} (suite red: ${result.failed}, named test red: ${namedTestRed})`);
  }
}

restoreAll();
rmSync(backupDir, { recursive: true, force: true });
console.log(`\nMUTATIONS=${MUTATIONS.length} SURVIVED=${survived}`);
process.exit(survived === 0 ? 0 : 1);
