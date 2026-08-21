#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// GENERATION SYNC — regenerates the platform deployment records in
// `packages/project-schema/src/deployments.js` FROM the launchpad's own chain profiles.
//
//   node scripts/sync-deployments.mjs --check     verify the kit matches the profiles (CI)
//   node scripts/sync-deployments.mjs --sync      rewrite the kit's records from the profiles
//
// WHY THIS IS A COMMAND AND NOT A HAND EDIT
// -----------------------------------------
// A creator kit that publishes a factory address is telling a creator "this is the contract your
// bundle will be launched through". Typing that address by hand is how it ends up correct for the
// wrong generation, or correct for a package that was never broadcast. Both are addresses a reader
// has no way to detect as wrong.
//
// THE ONE RULE THIS SCRIPT ENFORCES ABOVE ALL OTHERS
// --------------------------------------------------
// AN ADDRESS IS PUBLISHED ONLY FROM A SOURCE THAT WAS READ BACK OFF THE CHAIN. That rule has not
// changed; what changed is which artifact can evidence it.
//
// It used to be `deployments/<gen>/*.json`, the pre-broadcast Safe packages, gated on
// `signed && broadcast`. Those packages carry deterministic addresses long before anything exists
// at them and are re-derived whenever the source tree moves, so the flags were the only thing
// separating a prediction from a deployment. They are still read — as a NEGATIVE source, for chains
// that have no live platform — but they are no longer what publishes an address, because they were
// never regenerated after the RC6 broadcast and so describe a world that no longer exists.
//
// The positive source is now the chain PROFILE, `launchpad/config/chains/<id>.json`. A profile
// publishes an address here only when `platformContracts.status === "DEPLOYED"` AND
// `platformContracts.$verifiedOnChain` states that the addresses were read back with eth_call /
// eth_getCode. That is strictly stronger evidence than a broadcast flag: a flag records that a
// transaction was sent, a verification records that the code is there now.
//
// LAUNCH ACCESS IS READ, NEVER ASSUMED. `platformContracts.$launchAccessState` must begin with
// PUBLIC or PREPARED — the two states the factory's own `launchAccessState()` can return. Anything
// else refuses rather than defaulting, because "closed" is the plausible default and the dangerous
// one: it is indistinguishable from a real answer.
//
// WHAT IS NEVER COPIED
// --------------------
// The launchpad's profiles and packages carry operational material this repository must never
// contain: the broadcaster/agent wallet, Safe owner addresses, RPC endpoints, funding requirements,
// simulation traces. Extraction is an ALLOWLIST of field names, and there is an explicit denylist on
// top of it that fails the run if a forbidden key ever appears in the extracted output — so a future
// change to the profile shape cannot smuggle one through by being merely unanticipated.
//
// The multi-quote lane addresses are deliberately NOT published. The profile records them in a prose
// note rather than a structured field, and a creator kit must not publish an address it had to parse
// out of a sentence. `factory.multiQuoteLane()` returns them on chain and is the authority.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DEPLOYMENTS_JS = join(ROOT, "packages", "project-schema", "src", "deployments.js");

/** Where the launchpad monorepo is checked out. There is no default and no network fetch. */
const LAUNCHPAD_DIR = process.env.RELICS_LAUNCHPAD_DIR ?? null;

/**
 * Generations this script manages.
 *
 * `profiles` is the POSITIVE source — a chain profile that says DEPLOYED and carries an on-chain
 * verification note is what lets an address be printed. `packages` is the NEGATIVE source: for a
 * chain with no live platform it supplies the stated reason, so a `null` says why rather than
 * leaving a reader to infer it from a blank.
 */
const GENERATION_SOURCES = {
  RC6: {
    // The release identifier a profile must declare before this script will publish from it. A
    // profile that names a different release is a profile about a different generation, and the
    // run refuses rather than publishing it under this one.
    tag: "v1.0.0-rc6",
    profiles: join("launchpad", "config", "chains"),
    packages: join("deployments", "rc6"),
  },
};

/**
 * The ONLY fields read out of a deployment package. Anything not listed is not extracted, so a new
 * key in the launchpad's package format arrives here as "not carried" rather than "carried by
 * accident".
 */
const EXTRACTED_FIELDS = ["generation", "sourceCommit", "chainId", "chain", "status", "signed", "broadcast"];

/**
 * The ONLY `platformContracts` fields a chain profile may publish into this kit, and the name each
 * one is published under.
 *
 * AN ALLOWLIST, IN BOTH DIRECTIONS. A profile key that is not here is not carried — so a new
 * internal component added to a profile does not silently become a creator-facing address. And a
 * name here that a profile does not carry is simply absent from that chain's record, which is how
 * `swapRouter` stays Robinhood-only without a per-chain branch: Ethereum and Base do not declare
 * one, because their official Universal Routers are canonical there.
 *
 * `$`-prefixed profile keys are NEVER published. They are prose annotations, and an address parsed
 * out of a sentence is not an address this kit will print — see the header note on the multi-quote
 * lane.
 */
const PUBLISHED_CONTRACTS = [
  ["launchpadFactory", "factory"],
  ["launchpadFactoryImplementation", "factoryImplementation"],
  ["artStreamableFeesLocker", "locker"],
  ["projectRegistry", "registry"],
  ["projectRights", "projectRights"],
  ["scriptStorage", "scriptStorage"],
  ["templateRegistry", "templateRegistry"],
  ["feeAccounting", "feeAccounting"],
  ["metadataResolver", "metadataResolver"],
  ["swapRouter", "swapRouter"],
];

/** The two states a factory's own `launchAccessState()` can return. There is no third and no default. */
const LAUNCH_ACCESS_STATES = ["PUBLIC", "PREPARED"];

/**
 * Keys that must never appear in extracted output, at any depth. This is the belt to the allowlist's
 * braces: the allowlist decides what is taken, this decides what is unacceptable even if taken.
 */
const FORBIDDEN_KEYS = [
  "broadcaster",
  "safe",
  "owners",
  "endpoint",
  "rpc",
  "rpcUrl",
  "privateKey",
  "mnemonic",
  "keystore",
  "funding",
  "simulation",
  "signature",
  "signatures",
  "AGENT_WALLET_BROADCASTER",
  "AGENT_WALLET_TEMPORARY_OWNER",
];

function log(msg) {
  console.log(`[deployments] ${msg}`);
}

function fail(msg) {
  console.error(`[deployments] ${msg}`);
  process.exitCode = 1;
}

/** Recursively assert nothing forbidden is present. @param {unknown} value @param {string} path */
function assertNothingPrivate(value, path = "") {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNothingPrivate(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        throw new Error(`REFUSING TO PUBLISH: extracted record contains "${key}" at ${path || "<root>"} — that is operational material, not a public deployment fact`);
      }
      assertNothingPrivate(v, path ? `${path}.${key}` : key);
    }
  }
}

/**
 * Every deployment package for `generation`, keyed by chain id. The NEGATIVE source: it supplies
 * the stated reason a chain has no published address, and nothing else.
 * @param {string} generation
 */
function readPackages(generation) {
  const dir = join(LAUNCHPAD_DIR, GENERATION_SOURCES[generation].packages);
  if (!existsSync(dir)) throw new Error(`no ${generation} deployment packages at ${dir}`);
  /** @type {Record<number, any>} */
  const byChain = {};
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const pkg = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const extracted = {};
    for (const field of EXTRACTED_FIELDS) if (field in pkg) extracted[field] = pkg[field];
    assertNothingPrivate(extracted, file);
    const chainId = Number(extracted.chainId);
    if (!Number.isInteger(chainId)) throw new Error(`${file}: no usable chainId`);
    byChain[chainId] = { file, ...extracted };
  }
  if (Object.keys(byChain).length === 0) throw new Error(`${generation}: no packages found in ${dir}`);
  return byChain;
}

/**
 * Pull the publishable half out of one chain profile.
 *
 * REFUSES rather than guesses. A profile that claims DEPLOYED without an on-chain verification
 * note, or whose launch-access field does not begin with one of the two real states, throws — it
 * does not fall back to "closed", and it does not publish an unverified address.
 *
 * @param {number} chainId
 * @param {any} profile
 * @param {string} generation
 */
function extractProfile(chainId, profile, generation) {
  const pc = profile?.platformContracts ?? null;
  const rel = `launchpad/config/chains/${chainId}.json`;
  if (!pc) return { deployed: false, source: rel, why: "the chain profile declares no platformContracts" };

  if (pc.status !== "DEPLOYED") {
    return { deployed: false, source: rel, why: `chain profile says platformContracts.status is ${JSON.stringify(pc.status ?? null)}` };
  }

  // DEPLOYED is a claim. The verification note is the evidence, and this kit publishes no address
  // without it -- a profile edited to say DEPLOYED must also say what was read back off the chain.
  const verified = typeof pc.$verifiedOnChain === "string" && pc.$verifiedOnChain.trim().length > 0;
  if (!verified) {
    throw new Error(
      `${rel}: platformContracts.status is DEPLOYED but there is no $verifiedOnChain note. `
        + "This kit publishes an address only from a profile that states the addresses were read back off the chain.",
    );
  }

  const release = pc.$release ?? pc.$generation ?? null;
  if (release !== GENERATION_SOURCES[generation].tag) {
    throw new Error(`${rel}: platformContracts declares release ${JSON.stringify(release)}, not ${JSON.stringify(GENERATION_SOURCES[generation].tag)}`);
  }

  const access = LAUNCH_ACCESS_STATES.find((state) => new RegExp(`^\\s*${state}\\b`).test(String(pc.$launchAccessState ?? "")));
  if (!access) {
    throw new Error(
      `${rel}: platformContracts.$launchAccessState does not begin with ${LAUNCH_ACCESS_STATES.join(" or ")}. `
        + "Launch access is read from the factory, never defaulted -- a wrong 'closed' is indistinguishable from a real one.",
    );
  }

  /** @type {Record<string,string>} */
  const contracts = {};
  for (const [publishAs, profileKey] of PUBLISHED_CONTRACTS) {
    const raw = pc[profileKey];
    if (raw === undefined || raw === null) continue;
    // Profiles store CAIP-2 ids (`eip155:<chain>:0x…`). Publish the bare address, and refuse one
    // that names a different chain than the record it is about.
    const m = /^(?:eip155:(\d+):)?(0x[0-9a-fA-F]{40})$/.exec(String(raw));
    if (!m) throw new Error(`${rel}: platformContracts.${profileKey} is not an address or CAIP-2 id: ${JSON.stringify(raw)}`);
    if (m[1] !== undefined && Number(m[1]) !== chainId) {
      throw new Error(`${rel}: platformContracts.${profileKey} is scoped to chain ${m[1]}, not ${chainId}`);
    }
    contracts[publishAs] = m[2];
  }
  if (!contracts.launchpadFactory) throw new Error(`${rel}: a DEPLOYED profile with no factory address`);

  assertNothingPrivate(contracts, rel);

  return {
    deployed: true,
    source: rel,
    label: profile.displayName ?? `chain ${chainId}`,
    explorer: profile.explorer ?? null,
    launchAccess: access,
    deployedAt: pc.$deployedAt ?? null,
    freezeCommit: pc.$freezeCommit ?? null,
    contracts,
  };
}

/**
 * Reads one generation from the launchpad checkout and returns a per-chain record.
 *
 * EVERY chain the launchpad declares a profile for appears in the result, deployed or not. Absence
 * is what gets misread, so a chain with no live platform is a stated `null` with a reason rather
 * than a missing row.
 *
 * @param {string} generation
 * @returns {{ generation: string, tag: string|null, chains: Record<number, any> }}
 */
function readGeneration(generation) {
  if (!LAUNCHPAD_DIR) throw new Error("set RELICS_LAUNCHPAD_DIR to the launchpad monorepo checkout — this script reads its chain profiles and never fetches anything");
  const profileDir = join(LAUNCHPAD_DIR, GENERATION_SOURCES[generation].profiles);
  if (!existsSync(profileDir)) throw new Error(`no chain profiles at ${profileDir}`);
  const packages = readPackages(generation);

  /** @type {Record<number, any>} */
  const chains = {};
  for (const file of readdirSync(profileDir).sort()) {
    if (!file.endsWith(".json")) continue;
    const chainId = Number(file.replace(/\.json$/, ""));
    if (!Number.isInteger(chainId)) continue;
    const profile = JSON.parse(readFileSync(join(profileDir, file), "utf8"));
    // A profile whose own chainId disagrees with its filename is not a record to publish from.
    if (Number(profile.chainId) !== chainId) continue;
    // Only chains the deployment packages also name. A profile with no package is a chain the
    // release never planned for, and this table is about one release.
    if (!Object.hasOwn(packages, chainId)) continue;

    const extracted = extractProfile(chainId, profile, generation);
    if (extracted.deployed) {
      chains[chainId] = extracted;
      continue;
    }
    const pkg = packages[chainId];
    chains[chainId] = {
      deployed: false,
      why: `${extracted.why} (deployment package is ${pkg.status ?? "not broadcast"})`,
    };
  }

  if (Object.keys(chains).length === 0) throw new Error(`${generation}: no chain profiles matched the deployment packages in ${profileDir}`);
  return { generation, tag: GENERATION_SOURCES[generation].tag, chains };
}

/** The literal the generated block in deployments.js should contain, for one generation. */
function renderBlock(record) {
  const lines = [];
  for (const chainId of Object.keys(record.chains).map(Number).sort((a, b) => a - b)) {
    const entry = record.chains[chainId];
    if (!entry.deployed) {
      lines.push(`  ${chainId}: null, // not deployed — ${entry.why}`);
      continue;
    }
    lines.push(`  ${chainId}: Object.freeze({`);
    lines.push(`    chainId: ${chainId},`);
    lines.push(`    label: ${JSON.stringify(entry.label)},`);
    lines.push(`    generation: ${JSON.stringify(record.generation)},`);
    lines.push(`    launchAccess: /** @type {LaunchAccess} */ (${JSON.stringify(entry.launchAccess)}),`);
    lines.push(`    explorer: ${JSON.stringify(entry.explorer)},`);
    lines.push(`    contracts: Object.freeze({`);
    for (const [name, address] of Object.entries(entry.contracts)) lines.push(`      ${name}: ${JSON.stringify(address)},`);
    lines.push(`    }),`);
    lines.push(`  }),`);
  }
  return lines.join("\n");
}

/**
 * The current block in deployments.js for `generation`, as text.
 * @param {string} generation
 */
function currentBlock(generation) {
  const source = readFileSync(DEPLOYMENTS_JS, "utf8");
  const marker = `export const ${generation}_DEPLOYMENTS = Object.freeze({`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`deployments.js has no ${generation}_DEPLOYMENTS block`);
  const end = source.indexOf("\n});", start);
  if (end === -1) throw new Error(`deployments.js: ${generation}_DEPLOYMENTS block is not terminated`);
  return { source, start: start + marker.length + 1, end, text: source.slice(start + marker.length + 1, end) };
}

function normalize(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function run(mode) {
  const generations = Object.keys(GENERATION_SOURCES);
  let changed = 0;

  for (const generation of generations) {
    const record = readGeneration(generation);
    const wanted = renderBlock(record);
    const block = currentBlock(generation);

    const deployedChains = Object.entries(record.chains).filter(([, e]) => e.deployed);

    if (normalize(block.text) === normalize(wanted)) {
      log(`${generation}: matches ${Object.keys(record.chains).length} chain profile(s) at ${record.tag} — ${deployedChains.length} deployed`);
      continue;
    }

    if (mode === "--check") {
      fail(`${generation}_DEPLOYMENTS in ${relative(ROOT, DEPLOYMENTS_JS)} does not match the launchpad chain profiles.`);
      console.error("--- kit says ---");
      console.error(block.text.replace(/\n$/, ""));
      console.error("--- profiles say ---");
      console.error(wanted);
      console.error(`Fix with: RELICS_LAUNCHPAD_DIR=… node scripts/sync-deployments.mjs --sync`);
      changed += 1;
      continue;
    }

    writeFileSync(DEPLOYMENTS_JS, `${block.source.slice(0, block.start)}${wanted}${block.source.slice(block.end)}`);
    log(`${generation}: rewrote ${Object.keys(record.chains).length} chain record(s) from ${GENERATION_SOURCES[generation].profiles}`);
    changed += 1;
  }

  if (mode === "--check" && changed === 0) log("OK — every generated deployment record matches the launchpad chain profiles");
  if (mode === "--check" && changed > 0) log("FAIL — the kit's deployment records are stale");
}

const mode = process.argv[2] ?? "--check";
if (!["--check", "--sync"].includes(mode)) {
  console.error("usage: sync-deployments.mjs [--check|--sync]");
  process.exitCode = 2;
} else if (!LAUNCHPAD_DIR) {
  // NOT A FAILURE, AND SAID SO. Public CI has no launchpad checkout, and a gate that only passes on
  // one workstation is worse than a weaker one honestly labelled. What DOES run everywhere is the
  // schema test that asserts no undeployed generation publishes an address; see test/run.mjs.
  log("SKIPPED — RELICS_LAUNCHPAD_DIR is not set, so the launchpad's chain profiles cannot be read.");
  log("  This check compares the kit's published addresses against those profiles; it needs the monorepo checked out.");
  log("  The invariant that an UNDEPLOYED generation publishes no address is tested without it (npm run kit:test).");
} else {
  run(mode);
}
