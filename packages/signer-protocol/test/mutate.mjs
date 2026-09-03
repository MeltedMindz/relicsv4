// SPDX-License-Identifier: MIT
// ================================================================================================
// THE MUTATION RUN. A guard never shown to fail is not evidence that it works.
//
// `test/*.test.mjs` proves the guard refuses eighteen bad requests. It does NOT prove that any
// particular check is what refused them: a guard could be catching every control on one over-broad
// condition, and the suite would stay green while the other seventeen checks did nothing. So this
// harness breaks ONE check at a time in the source and requires a NAMED test to go red for each.
//
// Four rules make this an actual measurement rather than a count.
//
//   * A mutation whose anchor is not found in the source THROWS. It used to be scored SURVIVED and
//     merely printed loudly, which is one step better than a free pass and one step short of a
//     refusal: a stale anchor is a harness defect, not a finding about the guard, and the run that
//     contains one is not a measurement of anything.
//   * EVERY occurrence is replaced, and the count is asserted. `String.replace` takes the FIRST
//     match. This project has already shipped a mutation that removed the first of two identical
//     guards, watched its one named test go red, and scored CAUGHT while the second guard had never
//     been proven at all. A mutation may declare `occurrences` to pin how many copies of a check
//     exist, so a check that silently acquires a second copy fails here instead of hiding behind it.
//   * A red run is not enough on its own — the EXPECTED test has to be the one that went red, and
//     THAT IS NOW ACTUALLY CHECKED. It was not. The suite ran under the default reporter, which
//     prints the test name on PASS as well as on failure ("✔ 18 an EXPIRED authorization is
//     refused"), so `output.includes(expect)` was true whatever happened and the only real condition
//     was "something, somewhere, went red". Measured: every `expect` string in this file was present
//     in a fully GREEN baseline run. The suite now runs under the TAP reporter and the failing set
//     is parsed out of `not ok N - <name>` lines, which appear only for failures.
//   * A mutation must be SHADOW-AWARE. Several grant checks are backstopped by a later guard that
//     refuses the same request for a different reason, so deleting them leaves the suite green
//     unless a control asserts the exact refusal CODE or exercises an input the backstop admits.
//     Each such mutation names the control that separates it below.
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
const ART = join(SRC, "artSelectorGuard.ts");
const GRANT = join(SRC, "grantGuard.ts");
// `walletAttack.test.mjs` AND `artSelector.test.mjs` ARE IN THE SUITE NOW. They were not, and the
// consequence was structural rather than cosmetic: no mutation targeted `grantGuard.ts` at all, so
// every grant-side check in this package was unmeasured by the harness that reports its coverage.
const AUTH = join(SRC, "authorization.ts");
const INDEX = join(SRC, "index.ts");
// `grantLifecycle.test.mjs` IS IN THE SUITE, and without it the six mutations below have nowhere to
// be caught: every other file in this list asserts against a grant whose counter was set by hand,
// so the whole SPEND half of the lifecycle can be deleted and every one of them stays green.
const SUITE = ["policyGuard.test.mjs", "devKeystore.test.mjs", "sidecar.test.mjs", "artSelector.test.mjs", "walletAttack.test.mjs", "grantGuard.test.mjs", "grantLifecycle.test.mjs"].map((f) => join(TEST_DIR, f));

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

  // ---- THE ART SELECTOR -------------------------------------------------------------------------
  //
  // Seven mutations, one per arm, plus the meta-mutation that removes the call entirely. Each names
  // a control that must go red — a red suite from some unrelated test proves nothing about the arm
  // that was broken.
  {
    id: "art selector guard runs at all",
    file: GUARD,
    from: `  const selector = checkArtSelector({ request, policy, approvedArtSelector: approvedBuild.artSelector ?? null });`,
    to: `  const selector = { kind: "ALLOWED" }; void checkArtSelector;`,
    expect: "swapping the elected runtime for the GENERIC one after approval is refused",
  },
  {
    id: "elected runtime matches the approval",
    file: ART,
    from: `  if (decoded.artRuntimeId !== approvedRuntimeId) {`,
    to: `  if (false) {`,
    expect: "swapping the elected runtime for the GENERIC one after approval is refused",
  },
  {
    id: "an election with no approval is refused",
    file: ART,
    from: `    if (elects) {`,
    to: `    if (false) {`,
    expect: "an election with no approved selector at all is refused",
  },
  {
    id: "template half non-zero",
    file: ART,
    from: `  if (decoded.templateId === 0n) {`,
    to: `  if (false) {`,
    expect: "a template half of ZERO is refused ART_SELECTOR_MALFORMED",
  },
  {
    id: "policy runtime allowlist",
    file: ART,
    from: `  if (!policy.allowedRuntimes.some((allowed) => runtimeTagAllowed(allowed, approvedArtSelector.runtimeTag))) {`,
    to: `  if (false) {`,
    expect: "a runtime the POLICY does not allow is refused",
  },
  {
    id: "runtime active on chain",
    file: ART,
    from: `  if (!approvedArtSelector.exists || !approvedArtSelector.active) {`,
    to: `  if (false) {`,
    expect: "an INACTIVE runtime is refused",
  },
  {
    id: "incomplete registry read is not a pass",
    file: ART,
    from: `  if (!approvedArtSelector.registryComplete) {`,
    to: `  if (false) {`,
    expect: "an INCOMPLETE registry read is refused",
  },
  {
    id: "the zero-address record",
    file: ART,
    from: `  if (!approvedArtSelector.runtimeAddress || BigInt(approvedArtSelector.runtimeAddress) === 0n) {`,
    to: `  if (false) {`,
    expect: "the ZERO-ADDRESS record is refused",
  },
  {
    id: "grant names the elected engine",
    file: GRANT,
    grantGuard: true,
    occurrences: 1,
    from: `  if (electedTag && !auth.allowedRuntimes.some((r) => runtimeTagAllowed(r, electedTag))) {`,
    to: `  if (false) {`,
    expect: "a grant that does not name the elected runtime refuses it",
  },

  // ---- THE GRANT'S OWN STATE (authorization.ts) --------------------------------------------------
  //
  // Six checks, none of which any transaction can be inspected to satisfy. They are facts about a
  // human's grant — has it lapsed, was it withdrawn, was it already spent, was it even given to this
  // key — and before this wave exactly ONE mutation in this file touched the grant guard at all, so
  // every one of them was a control with nothing behind it.
  { id: "grant exists at all", file: AUTH, grantGuard: true, occurrences: 1, from: `  if (!auth) {`, to: `  if (false && !auth) {`, expect: "no authorization on disk at all is refused" },
  { id: "grant version is understood", file: AUTH, grantGuard: true, occurrences: 1, from: `  if (auth.version !== 1) {`, to: `  if (false) {`, expect: "an authorization at an unrecognised VERSION is refused" },
  { id: "grant revocation", file: AUTH, grantGuard: true, occurrences: 1, from: `  if (auth.revokedAt) {`, to: `  if (false) {`, expect: "a REVOKED authorization is refused" },
  { id: "grant expiry", file: AUTH, grantGuard: true, occurrences: 1, from: `  if (auth.expiresAt && new Date(auth.expiresAt) <= now) {`, to: `  if (false) {`, expect: "an EXPIRED authorization is refused" },
  {
    // THIS MUTATION SILENTLY RE-AIMED ITSELF ONCE, AND `occurrences` DID NOT NOTICE. Its anchor used
    // to be the bare `if (auth.launchesUsed >= auth.launchesAllowed) {`. When the CHECK gained its
    // "a spent grant still covers the launch it was spent on" clause, that exact text stopped
    // matching the check and started matching the SPEND's bound instead — still exactly one
    // occurrence, still a legal mutation, aimed at a different guard. A count pins how many copies
    // exist; it cannot pin which one you meant.
    //
    // AND THE CHECK IS NOW SHADOWED BY THE SPEND, so the socket control cannot separate them:
    // disabling the check lets a spent grant through the guard and `consumeAuthorization` refuses
    // it one step later, with the same code. Only a direct call to `checkAuthorization` isolates it.
    id: "grant consumption (the CHECK)",
    file: AUTH, grantGuard: true, occurrences: 1,
    from: `  if (!alreadySpentOnThisLaunch(auth, opts.launchPlanHash) && auth.launchesUsed >= auth.launchesAllowed) {`,
    to: `  if (false) {`,
    expect: "checkAuthorization refuses a spent grant on its own, with no spend to fall back on",
  },
  { id: "grant is bound to this signer", file: AUTH, grantGuard: true, occurrences: 1, from: `  if (opts.signerAddress && auth.signerAddress.toLowerCase() !== opts.signerAddress.toLowerCase()) {`, to: `  if (false) {`, expect: "an authorization granted to a DIFFERENT signer is refused" },

  // ---- PHASE ONE: PERMISSION (grantGuard.ts) ------------------------------------------------------
  //
  // THE FIRST OF THESE THREE IS THE `/g` CASE THIS HARNESS EXISTS TO CATCH. The line that acts on
  // `checkAuthorization`'s answer is BYTE-IDENTICAL in both phases, so a single-match replace removes
  // phase one's and leaves phase three's — and every socket control stays green, because phase three
  // refuses the same request with the same code one guard later. `occurrences: 2` pins that there
  // are exactly two copies, and `replaceAll` removes both.
  {
    id: "grant state is acted on (BOTH phases)",
    file: GRANT, grantGuard: true, occurrences: 2,
    from: `  if (!state.ok) return { kind: "REFUSED", code: state.reason as GrantRefusalCode, detail: state.detail };`,
    to: `  if (false) return { kind: "REFUSED", code: state.reason as GrantRefusalCode, detail: state.detail };`,
    expect: "an EXPIRED authorization is refused",
  },
  {
    // Phase one alone, disambiguated by the line that follows it. Over the socket this is invisible;
    // only the direct unit test on `checkGrantPermission` can see it.
    id: "grant state is acted on (phase one only)",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: `  if (!state.ok) return { kind: "REFUSED", code: state.reason as GrantRefusalCode, detail: state.detail };\n  const auth = state.authorization;\n\n  if (!auth.allowBroadcast) {`,
    to: `  if (false) return { kind: "REFUSED", code: state.reason as GrantRefusalCode, detail: state.detail };\n  const auth = state.authorization;\n\n  if (!auth.allowBroadcast) {`,
    expect: "phase one refuses a revoked grant on its own",
  },
  {
    id: "grant state is acted on (phase three only)",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: `  if (!state.ok) return { kind: "REFUSED", code: state.reason as GrantRefusalCode, detail: state.detail };\n  const auth = state.authorization;\n\n  let params: Record<string, unknown>;`,
    to: `  if (false) return { kind: "REFUSED", code: state.reason as GrantRefusalCode, detail: state.detail };\n  const auth = state.authorization;\n\n  let params: Record<string, unknown>;`,
    expect: "phase three refuses a revoked grant on its own",
  },
  { id: "grant permits a broadcast", file: GRANT, grantGuard: true, occurrences: 1, from: `  if (!auth.allowBroadcast) {`, to: `  if (false) {`, expect: "a BUILD_ONLY authorization is refused" },
  {
    // SHADOWED ON THE SUITE-WIDE SIGNER by `policy.allowedChains`. The control that catches it runs
    // on a signer whose policy AND approved build name the chain, so nothing else can refuse.
    id: "grant chain allowlist",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: `  if (!auth.allowedChains.includes(request.chainId)) {`,
    to: `  if (false) {`,
    expect: "a chain the POLICY allows and the GRANT does not is refused",
  },
  { id: "grant total gas-cost product", file: GRANT, grantGuard: true, occurrences: 1, from: `    if (worstCase > ceiling) {`, to: `    if (false) {`, expect: "gas whose PRODUCT exceeds the total ceiling" },
  {
    // SHADOWED by `policy.maxNativeSpendWei`, which in the suite-wide fixture is zero — the tightest
    // possible ceiling. The control that catches it runs against a ten-ether policy.
    id: "grant native-spend ceiling",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: `  if (request.value > BigInt(auth.maxNativeSpendWei)) {`,
    to: `  if (false) {`,
    expect: "native value the POLICY allows and the GRANT does not is refused",
  },
  { id: "grant requires a simulation", file: GRANT, grantGuard: true, occurrences: 1, from: `  if (!sim) {`, to: `  if (false) {`, expect: "a request with NO simulation receipt at all is refused" },
  { id: "grant requires the simulation to have SUCCEEDED", file: GRANT, grantGuard: true, occurrences: 1, from: `  if (!sim.ok) {`, to: `  if (false) {`, expect: "a simulation that REVERTED is refused" },
  { id: "grant simulation is of THESE bytes", file: GRANT, grantGuard: true, occurrences: 1, from: `  if (sim.dataHash.toLowerCase() !== request.dataHash.toLowerCase()) {`, to: `  if (false) {`, expect: "a simulation of DIFFERENT calldata is refused" },
  { id: "grant simulation is on THIS chain", file: GRANT, grantGuard: true, occurrences: 1, from: `  if (sim.chainId !== request.chainId) {`, to: `  if (false) {`, expect: "a simulation taken on a DIFFERENT CHAIN is refused" },

  // ---- PHASE THREE: THE DECODED FIELDS ------------------------------------------------------------
  {
    // The decode arm is unreachable over the socket — the shape guard decodes the same bytes first —
    // so only the direct unit test on `checkGrantCalldata` can observe it failing open.
    id: "grant fails closed on undecodable LaunchParams",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: `    return { kind: "REFUSED", code: "LAUNCH_PARAMS_FIELD_COUNT_WRONG"`,
    to: `    return { kind: "ALLOWED", authorization: auth };\n    return { kind: "REFUSED", code: "LAUNCH_PARAMS_FIELD_COUNT_WRONG"`,
    expect: "phase three refuses calldata that does not decode as LaunchParams",
  },
  {
    // SHADOWED by the shape guard's own recipient check, which runs one phase earlier. The control
    // that catches it pays the POLICY's recipient and narrows the GRANT's.
    id: "grant creator recipient",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: "  if (!recipient || getAddress(recipient as `0x${string}`) !== getAddress(auth.creatorRecipient)) {",
    to: `  if (false) {`,
    expect: "a recipient the POLICY authorizes and the GRANT does not is refused",
  },
  { id: "grant anti-snipe election", file: GRANT, grantGuard: true, occurrences: 1, from: `  if (!auth.allowedAntiSnipeModes.includes(antiSnipe)) {`, to: `  if (false) {`, expect: "an anti-snipe election outside the authorization is refused" },
  { id: "grant royalty ceiling", file: GRANT, grantGuard: true, occurrences: 1, from: `  if (royalty > auth.maxRoyaltyBps) {`, to: `  if (false) {`, expect: "a royalty above the authorization is refused" },
  {
    // NOT A CHECK BUT THE VALUE THE CHECK IS ABOUT. `creatorEarnings` packs
    // `mode | royaltyBps << 8 | policyVersion << 24`, and a shift that is off by a byte yields a
    // plausible small number rather than an obvious error — so the ceiling would still be enforced,
    // against the wrong field.
    id: "grant reads the royalty from the right bits",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: `  return Number((creatorEarnings >> 8n) & 0xffffn);`,
    to: `  return Number((creatorEarnings >> 16n) & 0xffffn);`,
    expect: "the royalty is read from bits 8..23 of creatorEarnings",
  },
  { id: "grant artMode runtime allowlist", file: GRANT, grantGuard: true, occurrences: 1, from: `  if (!auth.allowedRuntimes.some((r) => runtimeTagAllowed(r, modeName))) {`, to: `  if (false) {`, expect: "a runtime the creator did not authorize is refused" },

  // ---- THE GRANT IS ACTUALLY SPENT (index.ts + authorization.ts) ---------------------------------
  //
  // SIX MUTATIONS ON A LIFECYCLE THAT HAD ONE, AND THE ONE IT HAD PROVED THE WRONG HALF. Before
  // 2026-09-03 the only consumption mutation was `grant consumption`, which breaks the CHECK — and
  // it scored CAUGHT against a fixture that wrote `launchesUsed: 1` by hand. The SPEND did not
  // exist: `consumeAuthorization` had zero call sites, `launchesUsed` was only ever written as 0,
  // and no mutation could have found that because a mutation removes code and there was none to
  // remove. These six break the spend, its idempotence, its bound and its ordering.
  {
    id: "the grant is SPENT on a successful sign",
    file: INDEX, grantGuard: true, occurrences: 1,
    from: `        consumeAuthorization(req.launchPlanHash);`,
    to: `        void consumeAuthorization;`,
    expect: "a SECOND, DIFFERENT project under the same one-launch grant is refused",
  },
  {
    id: "a spend is idempotent on the SAME launch",
    file: AUTH, grantGuard: true, occurrences: 1,
    from: `  if (alreadySpentOnThisLaunch(auth, launchPlanHash)) return auth;`,
    to: `  if (false) return auth;`,
    expect: "re-signing THE SAME launch is still permitted",
  },
  {
    id: "a spent grant still covers the launch it was spent on",
    file: AUTH, grantGuard: true, occurrences: 1,
    from: `  if (!alreadySpentOnThisLaunch(auth, opts.launchPlanHash) && auth.launchesUsed >= auth.launchesAllowed) {`,
    to: `  if (auth.launchesUsed >= auth.launchesAllowed) {`,
    expect: "re-signing THE SAME launch is still permitted",
  },
  {
    id: "a spend cannot exceed the allowance",
    file: AUTH, grantGuard: true, occurrences: 1,
    from: `  if (auth.launchesUsed >= auth.launchesAllowed) {\n    throw new AuthorizationSpendError(`,
    to: `  if (false) {\n    throw new AuthorizationSpendError(`,
    expect: "spending an exhausted grant THROWS rather than writing launchesUsed past launchesAllowed",
  },
  {
    id: "a failed spend is a refusal, never a signature",
    file: INDEX, grantGuard: true, occurrences: 1,
    from: `        return {\n          kind: "REFUSED",\n          code: reason as unknown as SignerRefusalCode,`,
    to: `        return adapter.sign(req);\n        return {\n          kind: "REFUSED",\n          code: reason as unknown as SignerRefusalCode,`,
    expect: "a grant that DISAPPEARS between the check and the spend is refused, not signed",
  },

  // ---- THE GRANT IS BOUND TO A KEY, NOT TO A CALLER-SUPPLIED FIELD -------------------------------
  //
  // The defect these replace was not a missing check but a check fed its own answer:
  // `checkAuthorization({ signerAddress: request.from })` compared the grant against the request,
  // for a guard that exists because the request cannot be trusted.
  {
    id: "the key identity is READ FROM THE ADAPTER, not from request.from",
    file: GUARD, grantGuard: true, occurrences: 1,
    from: `  const identity = await readKeyIdentity(input.signer);`,
    to: `  const identity = { keyAddress: input.request.from }; void readKeyIdentity;`,
    expect: "a signer holding a DIFFERENT key than the grant names is refused",
  },
  {
    id: "the request's `from` must be the key that will sign",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: `  if (getAddress(request.from) !== getAddress(identity.keyAddress)) {`,
    to: `  if (false) {`,
    expect: "a signer holding a DIFFERENT key than the grant names is refused",
  },
  {
    id: "an unread key is not a matching one",
    file: GRANT, grantGuard: true, occurrences: 1,
    from: `  if (!identity || identity.keyAddress === null || identity.keyAddress === undefined) {`,
    to: `  if (false) {`,
    expect: "a grant check with NO signer key identity REFUSES rather than falling back to request.from",
  },
  {
    id: "the key binding runs before the grant phases",
    file: GUARD, grantGuard: true, occurrences: 1,
    from: `  const binding = checkSignerKeyBinding(identity, input.request);`,
    to: `  const binding = null; void checkSignerKeyBinding;`,
    expect: "a request whose `from` is not the key this signer holds is refused",
  },

  // ---- THE GRANT IS CONSULTED AT ALL (policyGuard.ts) ---------------------------------------------
  //
  // Three kill switches. Every check above can be perfect and reach nothing if the phase that calls
  // it is skipped, and `requireGrant` is a single boolean that switches both phases off.
  {
    id: "the grant is required at all",
    file: GUARD, grantGuard: true, occurrences: 1,
    from: `  const grantRequired = input.requireGrant !== false;`,
    to: `  const grantRequired = false;`,
    expect: "an EXPIRED authorization is refused",
  },
  {
    id: "phase one runs at all",
    file: GUARD, grantGuard: true, occurrences: 1,
    from: `    const permission = checkGrantPermission(\n      input.simulation !== undefined ? { request: input.request, identity, simulation: input.simulation } : { request: input.request, identity },\n    );`,
    to: `    const permission = { kind: "ALLOWED" } as const; void checkGrantPermission; void identity;`,
    expect: "a request with NO simulation receipt at all is refused",
  },
  {
    id: "phase three runs at all",
    file: GUARD, grantGuard: true, occurrences: 1,
    from: `    const calldata = checkGrantCalldata(approvedTag ? { request: input.request, identity, approvedArtRuntimeTag: approvedTag } : { request: input.request, identity });`,
    to: `    const calldata = { kind: "ALLOWED" } as const; void checkGrantCalldata; void approvedTag; void identity;`,
    expect: "a royalty above the authorization is refused",
  },
];

const backupDir = mkdtempSync(join(tmpdir(), "relics-signer-mutate-"));
const backups = new Map();
for (const file of new Set(MUTATIONS.map((m) => m.file))) {
  const backup = join(backupDir, file.split("/").pop());
  copyFileSync(file, backup);
  backups.set(file, backup);
}
let backupsUsable = true;
function restoreAll() {
  if (!backupsUsable) return;
  for (const [file, backup] of backups) copyFileSync(backup, file);
}
process.on("exit", restoreAll);
process.on("SIGINT", () => process.exit(130));

/**
 * THE TAP REPORTER IS NOT A STYLE CHOICE. Under the default reporter a passing test prints its own
 * name, so "the named test went red" could not be distinguished from "the named test exists". TAP
 * prints `ok N - name` and `not ok N - name`, and only the second form means a failure.
 */
function runSuite() {
  const args = ["--test", "--test-reporter=tap", ...SUITE];
  try {
    return { failed: false, output: execFileSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { failed: true, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

/** The names TAP reported as failing. Nested subtests are indented, hence the leading `\s*`. */
function failedTestNames(output) {
  return output
    .split("\n")
    .map((line) => /^\s*not ok \d+ - (.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => m[1].trim());
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

// EVERY MUTATION MUST NAME A TEST THAT EXISTS. A typo in `expect` produces a mutation that can
// never be CAUGHT — it would be reported as a survivor, i.e. as a hole in the guard, when the hole
// is in this file. The baseline TAP output lists every test that ran, so the names are checkable.
const baselineTestNames = new Set(
  baseline.output
    .split("\n")
    .map((line) => /^\s*(?:not )?ok \d+ - (.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => m[1].trim()),
);
const unmatched = MUTATIONS.filter((m) => ![...baselineTestNames].some((name) => name.includes(m.expect)));
if (unmatched.length > 0) {
  console.error("THESE MUTATIONS NAME A TEST THAT DOES NOT EXIST. They could never be caught, so the run is not a measurement:");
  for (const m of unmatched) console.error(`  ${m.id} -> "${m.expect}"`);
  process.exit(1);
}

/** How many times `needle` occurs in `haystack`. Plain count; no regex, no escaping question. */
function occurrencesOf(haystack, needle) {
  let n = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    n++;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return n;
}

let survived = 0;
const table = [];
for (const mutation of MUTATIONS) {
  const original = readFileSync(mutation.file, "utf8");
  const found = occurrencesOf(original, mutation.from);

  // AN ANCHOR THAT NO LONGER MATCHES IS A HARNESS FAILURE, NOT A GUARD FINDING. Scoring it as a
  // survivor would blame the guard for this file going stale, and reporting it as caught would be
  // the free pass the whole harness exists to refuse. So it stops the run.
  if (found === 0) {
    restoreAll();
    throw new Error(
      `MUTATION "${mutation.id}" HAS A STALE ANCHOR: its \`from\` text is not present in ${mutation.file}. ` +
        "It changes nothing, so it can neither pass nor fail honestly. Re-point it at the check it is meant to break.",
    );
  }
  if (mutation.occurrences !== undefined && found !== mutation.occurrences) {
    restoreAll();
    throw new Error(
      `MUTATION "${mutation.id}" EXPECTED ${mutation.occurrences} occurrence(s) of its anchor and found ${found}. ` +
        "A check that gained or lost a copy is exactly the case this count exists to surface — the guard may now be " +
        "half-mutated by every run of this harness. Re-derive the count before changing it.",
    );
  }

  // EVERY occurrence, never the first. `String.replace` with a string pattern takes one match.
  const mutated = original.replaceAll(mutation.from, mutation.to);
  if (mutated === original) {
    restoreAll();
    throw new Error(`MUTATION "${mutation.id}" DID NOT CHANGE THE SOURCE even though its anchor matched ${found} time(s).`);
  }
  writeFileSync(mutation.file, mutated);

  let result;
  try {
    result = runSuite();
  } finally {
    restoreAll();
  }

  const reds = failedTestNames(result.output);
  const named = reds.filter((name) => name.includes(mutation.expect));
  if (result.failed && named.length > 0) {
    console.log(`CAUGHT    ${mutation.id} (x${found}) -> ${named.map((n) => `"${n}"`).join(", ")}`);
    table.push({ id: mutation.id, occurrences: found, red: named });
  } else {
    survived++;
    const why = !result.failed
      ? "the suite stayed GREEN — nothing observed this check at all"
      : `the suite went red but on ${reds.length} OTHER test(s): ${reds.slice(0, 4).map((n) => `"${n}"`).join(", ")}${reds.length > 4 ? ", …" : ""}`;
    console.log(`SURVIVED  ${mutation.id} (x${found}) — ${why}`);
    table.push({ id: mutation.id, occurrences: found, red: [] });
  }
}

restoreAll();
backupsUsable = false;
rmSync(backupDir, { recursive: true, force: true });
const grant = MUTATIONS.filter((m) => m.grantGuard);
const grantCaught = grant.filter((m) => (table.find((t) => t.id === m.id)?.red.length ?? 0) > 0).length;
console.log(`\nMUTATIONS=${MUTATIONS.length} SURVIVED=${survived}`);
console.log(`SIGNER_GRANT_GUARD_MUTATIONS=${grantCaught}/${grant.length}_CAUGHT`);
process.exit(survived === 0 ? 0 : 1);
