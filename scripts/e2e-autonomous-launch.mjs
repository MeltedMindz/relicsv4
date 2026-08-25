#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE LOCAL AUTONOMOUS END-TO-END LAUNCH HARNESS.
//
// One brief in, one launched-and-verified project out, with nothing touched by a human in between
// and nothing sent to a public chain. Every phase is the REAL code path: the creator CLI scaffolds,
// validates and exports; `@relics/launch-sdk` reads live chain capability, selects the quote,
// prepares, predicts, simulates and builds; `@relics/signer-protocol` enforces the policy next to
// the key in a separate process; `@relics/agent-flow` writes the hash-linked receipt chain and the
// no-double-launch intent. Nothing here reimplements launch semantics — if it did, this harness
// would be testing itself.
//
// ------------------------------------------------------------------------------------------------
// THE SAFETY PROPERTY, WHICH IS THE MOST IMPORTANT THING IN THIS FILE
// ------------------------------------------------------------------------------------------------
//
// The fork keeps CHAIN ID 1. That is deliberate — the whole point is to exercise the deployed
// Ethereum RC6 factory at its real address with its real state — and it is exactly what makes a
// mistake here expensive: every transaction this harness signs is a VALID ETHEREUM TRANSACTION,
// signed with a key whose value is printed in anvil's own startup banner. A launch is irreversible.
//
// So the guard is not "the chain id is not mainnet" (it is mainnet) and not "the URL looks local"
// (a string can be edited). It is: BEFORE EVERY STATE-CHANGING RPC, prove the endpoint is a
// loopback host AND prove the node answers `anvil_nodeInfo` with a fork configuration AND prove
// `web3_clientVersion` names anvil. All three, every time, on the exact URL about to be used.
// `assertLocalAnvil` throws a `RefusedToBroadcast` on any doubt, and every send goes through it.
//
// The shipped `createDevKeystoreSigner` refuses chain 1 outright for this same reason, and it is
// RIGHT to. This harness therefore cannot use it to sign — so instead it (a) uses a fork-only
// adapter whose refusal is the anvil proof rather than the chain id, and (b) ASSERTS that the
// shipped adapter still refuses chain 1, so the production guard is exercised rather than bypassed
// quietly. That assertion is reported as `E2E_DEV_KEYSTORE_REFUSES_CHAIN_1`.
//
// ------------------------------------------------------------------------------------------------
// SKIPPED IS NOT PASSED
// ------------------------------------------------------------------------------------------------
//
// No anvil, or no upstream RPC to fork from, means the harness cannot run. It says SKIPPED, loudly,
// and exits 0 — and `AUTONOMOUS_LOCAL_FULL_LAUNCH=SKIPPED` never reads as PASS. There is no code
// path in this file that prints PASS without a mined receipt and a verified read-back.
// ================================================================================================

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  getCreate2Address,
  http,
  numberToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  ArtMode,
  AntiSnipeMode,
  FACTORY_ABI,
  METADATA_RESOLVER_ABI,
  PROJECT_COLLECTION_ABI,
  StartingPreset,
  build,
  encodeLaunch,
  getChainCapability,
  getChainProfile,
  getQuoteAssets,
  parseAgentPolicy,
  predict,
  prepare,
  selectChain,
  selectQuote,
  simulate,
  verifyLaunch,
  waitForConfirmation,
} from "@relics/launch-sdk";
import { keccak256Utf8, readContainer, encodeArtConfigV1Checked, validateArtConfigV1 } from "@relics/project-schema";
import { verifyReceiptChain, writeIntent, writeReceipt, recordIntentTxHash } from "@relics/agent-flow";
// `SignerRefusedError` is the package's public surface. The other two are reached by file path on
// purpose and it is the package's purpose: `signerServer.ts` and `adapters/localSidecar.ts` are
// deliberately NOT re-exported from the root, so that a test-shaped signer cannot arrive in a
// production import by autocomplete. Naming the file is the friction, and it is working.
import { SignerRefusedError } from "@relics/signer-protocol";
const { startSignerServer } = await import(new URL("../packages/signer-protocol/src/signerServer.ts", import.meta.url).href);
const { createLocalSidecarSigner } = await import(new URL("../packages/signer-protocol/src/adapters/localSidecar.ts", import.meta.url).href);

// The metadata birth pipeline is NOT re-exported from `@relics/launch-sdk`'s root and the package
// declares no subpath for it, so it is reached by file path. That is a gap in the package's export
// map rather than a shortcut taken here — noted so the next reader does not "tidy" this into a bare
// specifier that does not resolve.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { createMemoryProvider, pinAndVerifyMetadataDocument, verifyMetadataCommitment } = await import(
  new URL("../packages/launch-sdk/dist/metadata/index.js", import.meta.url).href
);
// The canonical CREATE2 salt composition the factory and the hook deployer apply, imported rather
// than rewritten. `mineHookSalt` itself cannot be used: it takes the hook's CREATION CODE, which
// the public record does not carry. The chain does carry `keccak256(creationCode ++ ctorArgs)` as
// `hookInitCodeHashes()`, which is the same input one step further along, so the search below uses
// the contract's own value and the SDK's own namespacing.
const { launchHookSalt } = await import(new URL("../packages/launch-sdk/dist/vendor/hookMiner.js", import.meta.url).href);

// ------------------------------------------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------------------------------------------

/** RC6's hook permission mask. RC5's was 0x1440; the delta is BEFORE_SWAP. */
const RC6_HOOK_FLAGS = 0x14c0n;
const ALL_HOOK_MASK = 0x3fffn;

/**
 * TEST ONLY — anvil default account #0. PUBLIC KNOWLEDGE, printed in anvil's own banner, and the
 * first key any attacker sweeps. NEVER FUND THIS ADDRESS. It is here because a fork harness needs
 * a pre-funded account on a node whose entire state is discarded when the process exits.
 */
const ANVIL_ACCOUNT_0_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const FIXTURE_DIR = join(REPO_ROOT, "test", "fixtures", "autonomous-e2e");
const CLI = join(REPO_ROOT, "packages", "creator-cli", "bin", "relics.js");

class RefusedToBroadcast extends Error {}
class HarnessSkip extends Error {}
class HarnessFailure extends Error {}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bigintJson = (_k, v) => (typeof v === "bigint" ? v.toString() : v);

// ------------------------------------------------------------------------------------------------
// SAFETY
// ------------------------------------------------------------------------------------------------

/**
 * The only door to a state-changing RPC.
 *
 * THE URL IS RE-PARSED EVERY TIME rather than trusted from a variable set at startup: the cost of
 * caching a decision here is that a later reassignment of the endpoint inherits an approval it
 * never earned. Three independent facts must hold, and none of them is "the chain id is not 1" —
 * on this fork the chain id IS 1, which is precisely the trap.
 */
async function assertLocalAnvil(url, client) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new RefusedToBroadcast(`REFUSING TO SEND: "${url}" is not a URL.`);
  }
  if (parsed.protocol !== "http:") {
    throw new RefusedToBroadcast(`REFUSING TO SEND: ${parsed.protocol} is not the loopback http: transport this harness signs for.`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new RefusedToBroadcast(
      `REFUSING TO SEND: ${parsed.hostname} is not a loopback host. This harness signs transactions that are VALID ON ETHEREUM ` +
        `with a publicly-known key; the only endpoint it will hand them to is a local anvil fork.`,
    );
  }
  let clientVersion;
  try {
    clientVersion = await client.request({ method: "web3_clientVersion" });
  } catch (err) {
    throw new RefusedToBroadcast(`REFUSING TO SEND: ${url} did not answer web3_clientVersion (${err?.message ?? err}), so it cannot be shown to be anvil.`);
  }
  if (!/anvil/i.test(String(clientVersion))) {
    throw new RefusedToBroadcast(`REFUSING TO SEND: ${url} reports client "${clientVersion}", which is not anvil.`);
  }
  let nodeInfo;
  try {
    nodeInfo = await client.request({ method: "anvil_nodeInfo" });
  } catch (err) {
    throw new RefusedToBroadcast(`REFUSING TO SEND: ${url} did not answer anvil_nodeInfo (${err?.message ?? err}). A node that cannot prove it is anvil is treated as a public node.`);
  }
  if (!nodeInfo || typeof nodeInfo !== "object") {
    throw new RefusedToBroadcast(`REFUSING TO SEND: ${url} answered anvil_nodeInfo with something that is not a node description.`);
  }
  return true;
}

// ------------------------------------------------------------------------------------------------
// ANVIL
// ------------------------------------------------------------------------------------------------

function anvilAvailable() {
  const probe = spawnSync("anvil", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
}

/** The upstream endpoint to fork FROM. Its value is a credential and is never printed or receipted. */
function forkRpcUrl() {
  for (const key of ["E2E_FORK_RPC_URL", "ETHEREUM_RPC_URL", "MAINNET_RPC_URL"]) {
    const value = process.env[key];
    if (value && value.trim().length > 0) return { url: value.trim(), envKey: key };
  }
  return null;
}

async function waitForNode(client, deadlineMs) {
  const until = Date.now() + deadlineMs;
  let lastError = "no attempt made";
  while (Date.now() < until) {
    try {
      return await client.getChainId();
    } catch (err) {
      lastError = err?.shortMessage ?? err?.message ?? String(err);
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new HarnessSkip(`the local node never answered eth_chainId within ${deadlineMs}ms: ${lastError}`);
}

async function startAnvilFork({ forkUrl, port, log }) {
  const child = spawn("anvil", ["--fork-url", forkUrl, "--port", String(port), "--silent"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += String(d);
  });
  child.on("error", (err) => {
    stderr += `\n${err.message}`;
  });
  const url = `http://127.0.0.1:${port}`;
  const client = publicClientFor(url);
  try {
    await waitForNode(client, 90_000);
  } catch (err) {
    child.kill("SIGKILL");
    throw new HarnessSkip(`${err.message}${stderr ? ` — anvil said: ${stderr.trim().slice(0, 400)}` : ""}`);
  }
  log(`anvil is forking chain ${await client.getChainId()} at block ${await client.getBlockNumber()} on ${url}`);
  return { child, url, client };
}

function publicClientFor(url) {
  const chain = defineChain({
    id: 1,
    name: "ethereum-local-fork",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  return createPublicClient({ chain, transport: http(url, { timeout: 60_000 }) });
}

// ------------------------------------------------------------------------------------------------
// THE FORK-ONLY SIGNER ADAPTER
// ------------------------------------------------------------------------------------------------

/**
 * TEST ONLY. Holds an anvil default key in process, and refuses on a DIFFERENT test than the
 * shipped `createDevKeystoreSigner`.
 *
 * The shipped adapter refuses every production chain id, which is the right refusal for the mistake
 * it guards (a fork left on chain id 1 and pointed at a real endpoint). This harness deliberately
 * runs ON chain id 1, so that test would refuse everything — and "carve an exception into the
 * production adapter" is exactly the repair that must never be made. Instead the refusal is
 * re-derived from the thing that actually distinguishes safe from unsafe here: whether the endpoint
 * this signer is bound to can PROVE it is a loopback anvil node, re-proved on every signature.
 */
function createForkOnlySigner({ privateKey, rpcUrl, chainId }) {
  const client = publicClientFor(rpcUrl);
  return {
    id: "fork-only:anvil",
    async getAddress() {
      return privateKeyToAccount(privateKey).address;
    },
    async supportsChain(id) {
      if (id !== chainId) return false;
      try {
        await assertLocalAnvil(rpcUrl, client);
        return true;
      } catch {
        return false;
      }
    },
    async sign(req) {
      // RE-PROVED HERE, not inherited from `supportsChain`. The guard runs before the key is read,
      // so a request that reaches an endpoint this signer cannot vouch for never loads a key.
      await assertLocalAnvil(rpcUrl, client);
      if (req.chainId !== chainId) throw new RefusedToBroadcast(`fork signer is bound to chain ${chainId}, asked for ${req.chainId}`);
      if (req.nonce === undefined) throw new HarnessFailure("the signing request carries no nonce; this signer will not invent one");
      if (req.maxFeePerGas === undefined || req.maxPriorityFeePerGas === undefined) {
        throw new HarnessFailure("the signing request carries no fee cap; this signer will not price a transaction");
      }
      const account = privateKeyToAccount(privateKey);
      const rawTransaction = await account.signTransaction({
        type: "eip1559",
        chainId: req.chainId,
        to: req.to,
        value: req.value,
        data: req.data,
        gas: req.estimatedGas,
        maxFeePerGas: req.maxFeePerGas,
        maxPriorityFeePerGas: req.maxPriorityFeePerGas,
        nonce: req.nonce,
      });
      return { kind: "SIGNED", rawTransaction, signerAddress: account.address };
    },
  };
}

// ------------------------------------------------------------------------------------------------
// WORKSPACE INTEGRITY — what makes `E2E_MANUAL_MUTATIONS=0` a MEASUREMENT
// ------------------------------------------------------------------------------------------------

/**
 * Every file under `root` except the agent's own run history, by content hash.
 *
 * `.relics-agent/` is excluded because it GROWS during the run by design — that is the receipt
 * chain being written, not the project being edited. Everything else (the brief, the policy, the
 * art, the config, the exported bundle) is frozen from the moment it is authored, and the
 * comparison at the end is what turns "no manual mutations" from a claim into a reading.
 */
function snapshotTree(root) {
  const out = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".relics-agent") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.set(relative(root, full), sha256(readFileSync(full)));
    }
  };
  walk(root);
  return out;
}

function diffSnapshots(before, after) {
  const changes = [];
  for (const [path, hash] of before) {
    if (!after.has(path)) changes.push(`REMOVED ${path}`);
    else if (after.get(path) !== hash) changes.push(`CHANGED ${path}`);
  }
  for (const path of after.keys()) if (!before.has(path)) changes.push(`ADDED ${path}`);
  return changes;
}

// ------------------------------------------------------------------------------------------------
// BRIEF
// ------------------------------------------------------------------------------------------------

/**
 * The machine-readable block of the brief.
 *
 * FENCED AND NAMED rather than inferred from prose. A harness that claimed to read the prose would
 * be claiming a language model ran inside a deterministic test; the fence is where the creator's
 * decisions are stated in a form this process can act on, and the prose beside it is what a human
 * wrote to explain them.
 */
function readBrief(path) {
  const text = readFileSync(path, "utf8");
  const match = /```json e2e-brief\n([\s\S]*?)\n```/.exec(text);
  if (!match) throw new HarnessFailure(`${path} carries no \`\`\`json e2e-brief block; the harness will not guess a creator's decisions from prose`);
  return JSON.parse(match[1]);
}

// ------------------------------------------------------------------------------------------------
// THE CLI, AS A CREATOR RUNS IT
// ------------------------------------------------------------------------------------------------

function runCli(args, { log }) {
  log(`$ relics ${args.join(" ")}`);
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: REPO_ROOT });
  if (result.status !== 0) {
    throw new HarnessFailure(`relics ${args[0]} exited ${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result;
}

/**
 * Rewrite the sketch's mirrored `CONFIG` literal so it still describes the art.
 *
 * `generator/params.json` IS the art and `generate.js`'s `CONFIG` is a local sketch of it; the
 * kit's own `ART_PREVIEW_DRIFT` check refuses a bundle where the two disagree. So authoring art
 * means writing BOTH, which is what a creator does and what this does. Brace-matched, like the
 * kit's own extractor, because the literal is nested.
 */
function rewriteMirroredConfig(source, config) {
  const declaration = /(?:^|\n)\s*(?:const|let|var)\s+CONFIG\s*=\s*\{/.exec(source);
  if (!declaration) throw new HarnessFailure("generator/generate.js has no `const CONFIG = { … }` to mirror the art configuration into");
  const open = source.indexOf("{", declaration.index);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new HarnessFailure("generator/generate.js's CONFIG literal is unbalanced");
  const mirrored = {
    title: config.title,
    animate: config.animate,
    background: config.background,
    palette: config.palette,
    layers: config.layers,
  };
  return `${source.slice(0, open)}${JSON.stringify(mirrored, null, 2)}${source.slice(end + 1)}`;
}

// ------------------------------------------------------------------------------------------------
// THE RUN
// ------------------------------------------------------------------------------------------------

export async function runAutonomousLaunch(options = {}) {
  const log = options.log ?? ((m) => process.stderr.write(`${m}\n`));
  const phase = (n) => log(`\n── ${n} ${"─".repeat(Math.max(0, 66 - n.length))}`);

  const summary = {
    AUTONOMOUS_LOCAL_FULL_LAUNCH: "FAIL",
    E2E_CHAIN_ID: "",
    E2E_TX_HASH: "",
    E2E_PROJECT_TOKEN: "",
    E2E_PROJECT_COLLECTION: "",
    E2E_POOL_ID: "",
    E2E_PREDICTION_MATCH: "NO",
    E2E_RECEIPT_CHAIN_INTACT: "NO",
    E2E_MANUAL_MUTATIONS: "0",
    E2E_DEV_KEYSTORE_REFUSES_CHAIN_1: "NO",
    E2E_ANTI_SNIPE_ELECTION_ONCHAIN: "UNKNOWN",
    E2E_METADATA_COMMITMENT: "UNKNOWN",
  };

  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), "relics-e2e-"));
  mkdirSync(workspace, { recursive: true });

  let anvil = null;
  let signerServer = null;

  try {
    // ---- 0. can this machine run the harness at all? ------------------------------------------
    phase("PRECHECK");
    if (!anvilAvailable()) throw new HarnessSkip("`anvil` is not on PATH. Install Foundry (https://getfoundry.sh) to run this harness.");
    const fork = options.reuseNodeUrl ? null : forkRpcUrl();
    if (!options.reuseNodeUrl && !fork) {
      throw new HarnessSkip("no upstream RPC to fork from. Set E2E_FORK_RPC_URL (or ETHEREUM_RPC_URL / MAINNET_RPC_URL) to an Ethereum endpoint.");
    }
    log(options.reuseNodeUrl ? `reusing the node at ${options.reuseNodeUrl}` : `forking Ethereum through ${fork.envKey} (value never printed)`);

    // ---- 1. the node ---------------------------------------------------------------------------
    let rpcUrl;
    let client;
    if (options.reuseNodeUrl) {
      rpcUrl = options.reuseNodeUrl;
      client = publicClientFor(rpcUrl);
      await waitForNode(client, 30_000);
    } else {
      anvil = await startAnvilFork({ forkUrl: fork.url, port: options.port ?? 8545, log });
      rpcUrl = anvil.url;
      client = anvil.client;
    }
    await assertLocalAnvil(rpcUrl, client);
    const chainId = await client.getChainId();
    summary.E2E_CHAIN_ID = String(chainId);
    if (chainId !== 1) {
      throw new HarnessFailure(
        `the fork reports chain ${chainId}, not 1. This harness exercises the DEPLOYED Ethereum RC6 factory at its real address; a different chain id means a different deployment record and nothing below would be evidence about it.`,
      );
    }

    // THE SDK IS POINTED AT THE FORK THROUGH THE SAME ENV VAR A PRODUCTION RUN USES. Not a
    // parameter, not an override: `getChainProfile(1).rpcEnvKey` is `ETHEREUM_RPC_URL`, and setting
    // it is what makes `getChainCapability`, `selectChain` and `getQuoteAssets` read the fork
    // through their ordinary path instead of a special one that only this harness exercises.
    process.env.ETHEREUM_RPC_URL = rpcUrl;

    /**
     * anvil's default accounts CARRY REAL MAINNET STATE ON A FORK, and it broke this harness once.
     *
     * Somebody has published EIP-7702 delegations for the well-known anvil addresses on Ethereum,
     * so on a mainnet fork every one of them has `0xef0100…` code and behaves as a smart account.
     * `ProjectRights` mints with `_safeMint`, the delegate's `onERC721Received` does something else
     * entirely, and the whole launch reverted `TransferToNonERC721ReceiverImplementer()` — a
     * failure with nothing to do with the launch. Clearing the delegation restores the accounts to
     * the plain EOAs anvil intends them to be. It is a fork-only state edit and it is reported.
     */
    const walletAccount = privateKeyToAccount(ANVIL_ACCOUNT_0_KEY);
    const policyRaw = JSON.parse(readFileSync(join(FIXTURE_DIR, "relics.agent.json"), "utf8"));
    for (const address of [walletAccount.address, getAddress(policyRaw.creatorRecipient)]) {
      const code = await client.getCode({ address });
      if (code && code !== "0x") {
        await assertLocalAnvil(rpcUrl, client);
        await client.request({ method: "anvil_setCode", params: [address, "0x"] });
        log(`cleared inherited mainnet code at ${address} (${code.slice(0, 10)}…) — an EIP-7702 delegation on an anvil default account`);
      }
      // anvil pre-funds its own accounts; the recipient is topped up so a funding check that reads
      // it is answering about a real balance rather than about anvil's defaults.
      await client.request({ method: "anvil_setBalance", params: [address, numberToHex(10n ** 21n)] });
    }

    // ---- 2. BRIEF_RECEIVED ---------------------------------------------------------------------
    phase("BRIEF_RECEIVED");
    cpSync(join(FIXTURE_DIR, "brief.md"), join(workspace, "brief.md"));
    cpSync(join(FIXTURE_DIR, "relics.agent.json"), join(workspace, "relics.agent.json"));
    const brief = readBrief(join(workspace, "brief.md"));
    const parsedPolicy = parseAgentPolicy(policyRaw);
    if (!parsedPolicy.ok) {
      throw new HarnessFailure(`relics.agent.json was refused:\n${parsedPolicy.issues.map((i) => `  ${i.field}: ${i.detail}`).join("\n")}`);
    }
    const policy = parsedPolicy.policy;
    const policyHash = parsedPolicy.policyHash;
    log(`policy ${policyHash} — goal ${policy.goal}, broadcast ${policy.allowBroadcast}, chains [${policy.allowedChains.join(", ")}]`);
    writeReceipt(workspace, {
      phase: "BRIEF",
      chainId,
      policyHash,
      body: { brief: { name: brief.name, symbol: brief.symbol, antiSnipeElection: brief.antiSnipeElection }, policyWarnings: parsedPolicy.warnings },
    });

    // THE ELECTION. `AUTO` here means "take the creator's, from the brief" — it never means a
    // default. `UNSPECIFIED` is the on-chain zero and the factory refuses it, so there is no value
    // this layer could supply on silence.
    const election = policy.antiSnipePreference === "AUTO" ? brief.antiSnipeElection : policy.antiSnipePreference;
    if (!policy.allowedAntiSnipeModes.includes(election)) {
      throw new HarnessFailure(`the brief elects ${election}, which relics.agent.json does not allow ([${policy.allowedAntiSnipeModes.join(", ")}])`);
    }

    // ---- 3. PROJECT_SCAFFOLDED -----------------------------------------------------------------
    phase("PROJECT_SCAFFOLDED");
    const projectDir = join(workspace, "project");
    runCli(["init", projectDir, "--template", "solidity-svg-params", "--name", brief.name, "--symbol", brief.symbol], { log });

    // ---- 4. ART_AUTHORED -----------------------------------------------------------------------
    phase("ART_AUTHORED");
    const artConfigDoc = { version: 1, format: "ACV1", ...brief.art };
    const verdict = validateArtConfigV1(artConfigDoc);
    if (!verdict.ok) throw new HarnessFailure(`the brief's art configuration is not valid ACV1: ${verdict.name} (${verdict.code}) — ${verdict.reason}`);
    // Encoded through the kit's CHECKED encoder, which refuses bytes the on-chain decoder would
    // reject. The bytes that reach calldata are re-derived from this same document by the schema
    // package during export; this call is the early refusal, not a second derivation.
    const artBytes = encodeArtConfigV1Checked(artConfigDoc);
    writeFileSync(join(projectDir, "generator", "params.json"), `${JSON.stringify(artConfigDoc, null, 2)}\n`);
    const generatorPath = join(projectDir, "generator", "generate.js");
    writeFileSync(generatorPath, rewriteMirroredConfig(readFileSync(generatorPath, "utf8"), artConfigDoc));

    const config = JSON.parse(readFileSync(join(projectDir, "relics.config.json"), "utf8"));
    config.project.name = brief.name;
    config.project.symbol = brief.symbol;
    config.project.description = brief.description;
    config.supply.totalSupplyWhole = brief.totalSupplyWhole;
    config.supply.artworkSupply = brief.artworkSupply;
    config.market.startingPreset = brief.startingPreset;
    config.market.antiSnipeMode = election;
    config.earnings.creatorRecipient = policy.creatorRecipient;
    config.chains.requested = [...policy.allowedChains];
    writeFileSync(join(projectDir, "relics.config.json"), `${JSON.stringify(config, null, 2)}\n`);
    log(`authored ${artBytes.length} bytes of ACV1 — ${artConfigDoc.layers.length} layers, ${artConfigDoc.traits.length} traits, election ${election}`);
    runCli(["preview", projectDir], { log });
    writeReceipt(workspace, { phase: "ART", chainId, policyHash, body: { acv1Bytes: artBytes.length, title: artConfigDoc.title, election } });

    // ---- 5. VALIDATED --------------------------------------------------------------------------
    phase("VALIDATED");
    runCli(["validate", projectDir], { log });
    writeReceipt(workspace, { phase: "VALIDATE", chainId, policyHash, body: { ok: true } });

    // ---- 6. EXPORTED ---------------------------------------------------------------------------
    phase("EXPORTED");
    const bundlePath = join(workspace, "project.relics");
    runCli(["export", projectDir, "--output", bundlePath], { log });
    const bundleBytes = new Uint8Array(readFileSync(bundlePath));
    const container = readContainer(bundleBytes);
    const manifest = JSON.parse(new TextDecoder().decode(container.byPath.get("relics.project.json")));
    const bundleHash = `0x${manifest.integrity.bundleHash}`;
    log(`bundle ${manifest.integrity.bundleHash} — art ${manifest.artBinding.artConfigFormat} ${manifest.artBinding.artConfigBytes} bytes`);
    if (`0x${manifest.artBinding.artConfig}`.toLowerCase() !== `0x${Buffer.from(artBytes).toString("hex")}`.toLowerCase()) {
      throw new HarnessFailure("the bundle's artConfig is not the bytes this run authored — the export and the authoring disagree");
    }
    // THE CONTRACT-URI DOCUMENT IS ASSEMBLED HERE, BEFORE THE FREEZE, AND WRITTEN TO DISK.
    //
    // It has to be assembled rather than taken from the bundle: `metadata/collection.json` is the
    // creator's document and carries none of `image`, `banner_image`, `featured_image`,
    // `external_link` or `collaborators`, and `inspectRetrievedDocument` refuses a document that is
    // MISSING a required key (an empty one is a different thing from an absent one).
    //
    // Writing it now, before the freeze, is what makes the content-hash relation real. The pin is
    // fed the bytes READ BACK OFF DISK together with an `expectedContentHash` this file computed
    // with `node:crypto`, so the pipeline's own `sha256Hex` has to agree with a different
    // implementation over bytes that made a round trip — and the result reports
    // `BUNDLE_COMMITTED` rather than `SELF_COMPUTED`. A hash passed straight from the assembler to
    // the verifier compares our bytes to a hash of our bytes and always agrees.
    const collectionMetadata = JSON.parse(new TextDecoder().decode(container.byPath.get("metadata/collection.json")));
    const contractUriPath = join(workspace, "contract-uri.json");
    writeFileSync(
      contractUriPath,
      canonicalMetadataBytes({
        name: collectionMetadata.name,
        symbol: collectionMetadata.symbol,
        description: collectionMetadata.description ?? "",
        image: collectionMetadata.image ?? "",
        banner_image: collectionMetadata.banner_image ?? "",
        featured_image: collectionMetadata.featured_image ?? "",
        external_link: collectionMetadata.external_link ?? "",
        collaborators: manifest.earnings.collaborators ?? [],
      }),
    );

    writeReceipt(workspace, {
      phase: "EXPORT",
      chainId,
      policyHash,
      projectBundleHash: manifest.integrity.bundleHash,
      body: { entries: container.entries.length, artConfigHash: manifest.artBinding.artConfigHash, contractUriDocument: sha256(readFileSync(contractUriPath)) },
    });

    // FROM HERE ON NOTHING IS EDITED. The snapshot is the evidence for that, not the sentence.
    const frozen = snapshotTree(workspace);

    // ---- 7. CHAIN_SELECTED + CHAIN_PREFLIGHT_PASSED ---------------------------------------------
    phase("CHAIN_SELECTED / PREFLIGHT");
    const signerAddress = walletAccount.address;
    const selection = await selectChain(policy, { signerAddress, requiredRuntimeTag: policy.allowedRuntimes[0] });
    for (const candidate of selection.candidates) {
      log(`  chain ${candidate.chainId} ${candidate.admitted ? "ADMITTED" : "refused"} evidence=${candidate.evidence}${candidate.rejections.map((r) => `\n      ${r.code}: ${r.detail}`).join("")}`);
    }
    if (!selection.selected) throw new HarnessFailure(`no chain passed admission: ${selection.blockedReason}`);
    const selectedChainId = selection.selected.chainId;
    const profile = getChainProfile(selectedChainId);
    const factory = getAddress(profile.contracts.launchpadFactory);
    const resolver = getAddress(profile.contracts.metadataResolver);
    log(`selected chain ${selectedChainId} by rule: ${selection.rule}`);

    const capability = await getChainCapability(selectedChainId, { requiredRuntimeTag: policy.allowedRuntimes[0] });
    if (capability.launchable !== "PROVEN") {
      throw new HarnessFailure(`chain ${selectedChainId} is ${capability.launchable}:\n${capability.findings.map((f) => `  ${f.evidence} ${f.id}: ${f.detail}`).join("\n")}`);
    }
    log(`  capability PROVEN — launchAccess ${capability.liveLaunchAccess}, ${capability.registry.entries.size} runtime(s) registered`);

    const inventory = await getQuoteAssets(client, factory);
    const quote = selectQuote(inventory, policy.allowedQuoteAssets);
    if (!quote.quote) throw new HarnessFailure(`no quote asset: ${quote.reason}`);
    log(`  quote ${quote.quote.symbol} (${quote.quote.address}, ${quote.quote.decimals} decimals) — ${quote.reason}`);
    writeReceipt(workspace, {
      phase: "PREFLIGHT",
      chainId: selectedChainId,
      policyHash,
      projectBundleHash: manifest.integrity.bundleHash,
      addresses: { factory, metadataResolver: resolver, quoteAsset: quote.quote.address },
      body: {
        rule: selection.rule,
        findings: capability.findings,
        quote: { symbol: quote.quote.symbol, address: quote.quote.address, decimals: quote.quote.decimals, reason: quote.reason },
      },
    });

    // ---- 8. METADATA_PUBLISHED ------------------------------------------------------------------
    phase("METADATA_PUBLISHED");
    const collectionMetadata = JSON.parse(new TextDecoder().decode(container.byPath.get("metadata/collection.json")));
    // THE DOCUMENT IS ASSEMBLED FROM THE BUNDLE, and every key `contractURI` consumers read is
    // present — including the empty ones. An absent key and an empty one are different documents
    // to `inspectRetrievedDocument`, and it refuses the first.
    const metadataDocument = {
      name: collectionMetadata.name,
      symbol: collectionMetadata.symbol,
      description: collectionMetadata.description ?? "",
      image: collectionMetadata.image ?? "",
      banner_image: collectionMetadata.banner_image ?? "",
      featured_image: collectionMetadata.featured_image ?? "",
      external_link: collectionMetadata.external_link ?? "",
      collaborators: manifest.earnings.collaborators ?? [],
    };
    const provider = createMemoryProvider();
    const pinned = await pinAndVerifyMetadataDocument({ provider, document: metadataDocument });
    if (pinned.kind !== "VERIFIED") {
      throw new HarnessFailure(`metadata was refused at stage ${pinned.stage}: ${pinned.code} — ${pinned.detail}`);
    }
    log(`  pinned ${pinned.uri} (${pinned.byteLength} bytes), read back and re-hashed by "${pinned.verifiedBy}"`);
    if (!pinned.fetchBackVerified) throw new HarnessFailure("the metadata pin was not read back; `requireMetadataReadback` cannot be satisfied");

    // ROUTE E — the resolver publish is a SERVER transaction, not a creator signature. It is a real
    // transaction on the fork, sent through the same guard as everything else.
    await assertLocalAnvil(rpcUrl, client);
    const serverWallet = createWalletClient({ account: walletAccount, chain: client.chain, transport: http(rpcUrl) });
    const alreadyPublished = await client.readContract({ address: resolver, abi: METADATA_RESOLVER_ABI(), functionName: "isPublished", args: [pinned.resolverDigest] });
    if (!alreadyPublished) {
      const publishHash = await serverWallet.writeContract({ address: resolver, abi: METADATA_RESOLVER_ABI(), functionName: "publish", args: [pinned.uri] });
      const publishReceipt = await client.waitForTransactionReceipt({ hash: publishHash });
      if (publishReceipt.status !== "success") throw new HarnessFailure(`the resolver publish reverted (${publishHash})`);
      log(`  published to the resolver in ${publishHash}`);
    } else {
      log("  the resolver already holds this URI");
    }
    const resolvedUri = await client.readContract({ address: resolver, abi: METADATA_RESOLVER_ABI(), functionName: "uriOf", args: [pinned.resolverDigest] });
    if (resolvedUri !== pinned.uri) throw new HarnessFailure(`the resolver answers "${resolvedUri}" under this key, not "${pinned.uri}"`);
    writeReceipt(workspace, {
      phase: "METADATA",
      chainId: selectedChainId,
      policyHash,
      projectBundleHash: manifest.integrity.bundleHash,
      body: { uri: pinned.uri, cid: pinned.cid, contentSha256: pinned.contentSha256, resolverDigest: pinned.resolverDigest, fetchBackVerified: pinned.fetchBackVerified },
    });

    // ---- 9. PREPARED ----------------------------------------------------------------------------
    phase("PREPARED");
    const wiring = await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "wiring" });
    const hookDeployer = getAddress(wiring[7]);
    const [singleQuoteInitCodeHash] = await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "hookInitCodeHashes" });
    const mined = mineHookSalt({ factory, hookDeployer, launcher: signerAddress, initCodeHash: singleQuoteInitCodeHash });
    log(`  mined hookSalt ${mined.salt} -> ${mined.hookAddress} (mask 0x${(BigInt(mined.hookAddress) & ALL_HOOK_MASK).toString(16)}) in ${mined.attempts} attempts`);

    const creatorInput = {
      name: manifest.project.name,
      symbol: manifest.project.symbol,
      totalSupplyWhole: BigInt(manifest.supply.totalSupplyWhole),
      artworkBackingUnits: BigInt(manifest.supply.artworkSupply),
      startingPreset: StartingPreset[manifest.market.startingPreset],
      creatorRecipient: getAddress(manifest.earnings.creatorRecipient),
      antiSnipeMode: AntiSnipeMode[manifest.market.antiSnipeMode],
      metadataUri: pinned.uri,
      art: { mode: ArtMode.SOLIDITY_SVG, artTemplateId: BigInt(manifest.artBinding.templateId), artConfig: `0x${manifest.artBinding.artConfig}` },
    };
    if (creatorInput.creatorRecipient !== getAddress(policy.creatorRecipient)) {
      throw new HarnessFailure(`the bundle names creatorRecipient ${creatorInput.creatorRecipient}; the policy authorizes ${policy.creatorRecipient}`);
    }
    // A FREE TOKEN SALT, not a mined one. Sorting the project token below the quote is a geometry
    // preference, not a validity requirement, and the factory's own `predict` is what establishes
    // the address either way; the loop below takes the first salt whose predicted addresses are
    // unoccupied, which is the collision concern that IS real.
    let prepared = null;
    let predicted = null;
    for (let i = 1; i <= 64; i++) {
      const candidate = prepare(creatorInput, { tokenSalt: numberToHex(i, { size: 32 }), hookSalt: mined.salt }, selectedChainId, factory);
      const p = await predict(client, factory, candidate.params, signerAddress);
      const occupied = await client.getCode({ address: p.projectToken });
      if (occupied && occupied !== "0x") continue;
      prepared = candidate;
      predicted = p;
      break;
    }
    if (!prepared) throw new HarnessFailure("no free tokenSalt found in 64 attempts");
    log(`  prepareHash ${prepared.prepareHash}`);
    writeReceipt(workspace, {
      phase: "PREPARE",
      chainId: selectedChainId,
      policyHash,
      launchPlanHash: prepared.prepareHash,
      projectBundleHash: manifest.integrity.bundleHash,
      body: { prepareHash: prepared.prepareHash, antiSnipeMode: manifest.market.antiSnipeMode, metadataUriHash: prepared.params.metadataUriHash },
    });

    // ---- 10. PREDICTED ---------------------------------------------------------------------------
    phase("PREDICTED");
    log(`  token ${predicted.projectToken}  collection ${predicted.projectCollection}  hook ${predicted.artHook}`);
    log(`  pool  ${predicted.poolId}`);
    if (policy.requireDeterministicPrediction) {
      // TWO INDEPENDENT CHECKS, because `requireDeterministicPrediction` is not satisfied by asking
      // the same contract twice and getting the same answer — that only shows the contract is a
      // view function.
      const again = await predict(client, factory, prepared.params, signerAddress);
      if (again.projectToken !== predicted.projectToken || again.artHook !== predicted.artHook || again.poolId !== predicted.poolId) {
        throw new HarnessFailure("factory.predict returned different addresses for identical params");
      }
      // The off-chain derivation the SDK reports as UNAVAILABLE (it needs component
      // implementations the public record does not carry) is available HERE for the hook, because
      // the chain publishes the one input it lacks: `hookInitCodeHashes()`. The salt composition is
      // the SDK's own `launchHookSalt`, so agreement here is a real cross-check of the contract's
      // answer rather than a second reading of it.
      const derivedHook = getCreate2Address({
        from: hookDeployer,
        salt: launchHookSalt(factory, signerAddress, prepared.params.hookSalt),
        bytecodeHash: singleQuoteInitCodeHash,
      });
      if (getAddress(derivedHook) !== getAddress(predicted.artHook)) {
        throw new HarnessFailure(`the off-chain hook derivation says ${derivedHook}; the factory says ${predicted.artHook}`);
      }
      if ((BigInt(predicted.artHook) & ALL_HOOK_MASK) !== RC6_HOOK_FLAGS) {
        throw new HarnessFailure(`the predicted hook does not carry the RC6 mask 0x14C0 — it would revert BadHookAddress`);
      }
      log(`  deterministic: factory.predict agrees with the off-chain CREATE2 derivation, mask 0x14C0`);
    }
    writeReceipt(workspace, {
      phase: "PREDICT",
      chainId: selectedChainId,
      policyHash,
      launchPlanHash: prepared.prepareHash,
      addresses: { projectToken: predicted.projectToken, projectCollection: predicted.projectCollection, artHook: predicted.artHook },
      body: { poolId: predicted.poolId, source: predicted.source },
    });

    // ---- 11. SIMULATED ---------------------------------------------------------------------------
    phase("SIMULATED");
    const { data, dataHash } = encodeLaunch(prepared.params);
    const simulated = await simulate(client, { from: signerAddress, to: factory, value: 0n, data, params: prepared.params });
    if (!simulated.ok) throw new HarnessFailure(`the launch reverts in simulation: ${simulated.revert}`);
    if (simulated.gasEstimate === null) throw new HarnessFailure("simulation produced no gas estimate; this harness will not guess one");
    log(`  simulation OK at block ${simulated.blockNumber}, gas ${simulated.gasEstimate}`);
    writeReceipt(workspace, {
      phase: "SIMULATE",
      chainId: selectedChainId,
      policyHash,
      launchPlanHash: prepared.prepareHash,
      body: { ok: true, dataHash: simulated.dataHash, gasEstimate: simulated.gasEstimate, blockNumber: simulated.blockNumber },
    });

    // ---- 12. BUILT -------------------------------------------------------------------------------
    phase("BUILT");
    const fees = await client.estimateFeesPerGas();
    if (fees.maxFeePerGas > policy.maxGasPriceWei) {
      throw new HarnessFailure(`the live maxFeePerGas ${fees.maxFeePerGas} exceeds policy.maxGasPriceWei ${policy.maxGasPriceWei}`);
    }
    const gasLimit = (simulated.gasEstimate * 12n) / 10n;
    if (gasLimit > policy.maxTransactionGas) {
      throw new HarnessFailure(`a 20% headroom over the ${simulated.gasEstimate} estimate is ${gasLimit}, above policy.maxTransactionGas ${policy.maxTransactionGas}`);
    }
    const nonce = await client.getTransactionCount({ address: signerAddress });
    const built = build({
      chainId: selectedChainId,
      from: signerAddress,
      to: factory,
      value: 0n,
      data,
      estimatedGas: gasLimit,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      nonce,
      launchPlanHash: prepared.prepareHash,
      bundleHash,
      policyHash,
    });
    log(`  buildHash ${built.buildHash}  selector ${built.request.selector}  gas ${gasLimit}`);
    writeReceipt(workspace, {
      phase: "BUILD",
      chainId: selectedChainId,
      policyHash,
      launchPlanHash: prepared.prepareHash,
      projectBundleHash: manifest.integrity.bundleHash,
      body: { buildHash: built.buildHash, dataHash: built.request.dataHash, selector: built.request.selector, gas: gasLimit, nonce },
    });

    // ---- 13. POLICY_APPROVED — checked against the FINAL calldata --------------------------------
    phase("POLICY_APPROVED");
    const approvedBuild = { chainId: selectedChainId, factory, policyHash, launchPlanHash: prepared.prepareHash, bundleHash };
    signerServer = await startSignerServer({
      adapter: createForkOnlySigner({ privateKey: ANVIL_ACCOUNT_0_KEY, rpcUrl, chainId: selectedChainId }),
      policy,
      approvedBuild,
    });
    const sidecar = createLocalSidecarSigner({ url: signerServer.url });
    const sidecarAddress = await sidecar.getAddress();
    if (getAddress(sidecarAddress) !== signerAddress) throw new HarnessFailure(`the sidecar signs as ${sidecarAddress}, not ${signerAddress}`);
    log(`  signer sidecar on ${signerServer.url} as ${sidecarAddress} (policy enforced next to the key)`);

    // THE PRODUCTION GUARD, EXERCISED RATHER THAN BYPASSED. The shipped development keystore
    // refuses chain 1 structurally, which is why this harness cannot use it — and asserting that
    // it still refuses is the only way that refusal is evidence rather than a comment.
    const { createDevKeystoreSigner } = await import(
      new URL("../packages/signer-protocol/src/adapters/devKeystore.ts", import.meta.url).href
    );
    try {
      await createDevKeystoreSigner({ privateKey: ANVIL_ACCOUNT_0_KEY }).sign(built.request);
      throw new HarnessFailure("the shipped dev keystore signed a chain-1 request. Its production-chain refusal has been weakened and that is a security regression, not a harness problem.");
    } catch (err) {
      if (err instanceof HarnessFailure) throw err;
      if (!(err instanceof SignerRefusedError) || err.code !== "SIGNER_DOES_NOT_SUPPORT_CHAIN") {
        throw new HarnessFailure(`the shipped dev keystore refused chain 1 for the wrong reason: ${err?.message ?? err}`);
      }
      summary.E2E_DEV_KEYSTORE_REFUSES_CHAIN_1 = "YES";
      log("  control: the shipped dev keystore still refuses chain 1 (SIGNER_DOES_NOT_SUPPORT_CHAIN)");
    }

    writeReceipt(workspace, {
      phase: "POLICY_CHECK",
      chainId: selectedChainId,
      policyHash,
      launchPlanHash: prepared.prepareHash,
      body: { approvedBuild, signer: sidecar.id, devKeystoreRefusesChain1: summary.E2E_DEV_KEYSTORE_REFUSES_CHAIN_1 },
    });

    // ---- 14. SIGNED ------------------------------------------------------------------------------
    phase("SIGNED");
    let signed;
    try {
      signed = await sidecar.sign(built.request);
    } catch (err) {
      if (err instanceof SignerRefusedError) throw new HarnessFailure(`the signer refused: ${err.refusal.code} — ${err.refusal.detail}`);
      throw err;
    }
    if (signed.kind !== "SIGNED") throw new HarnessFailure(`the signer returned ${signed.kind}; this harness broadcasts the bytes itself`);
    log(`  signed ${signed.rawTransaction.length / 2 - 1} bytes as ${signed.signerAddress}`);
    writeReceipt(workspace, { phase: "SIGN", chainId: selectedChainId, policyHash, launchPlanHash: prepared.prepareHash, body: { signerAddress: signed.signerAddress, rawTransactionBytes: signed.rawTransaction.length / 2 - 1 } });

    // ---- 15. BROADCAST — INTENT FIRST, THEN BYTES ------------------------------------------------
    phase("BROADCAST");
    const totalLaunchesAtIntent = await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "totalLaunches" });
    writeIntent(workspace, {
      launchPlanHash: prepared.prepareHash,
      buildHash: built.buildHash,
      dataHash,
      chainId: selectedChainId,
      factory,
      signer: signerAddress,
      nonceAtIntent: nonce,
      predicted: { projectToken: predicted.projectToken, projectCollection: predicted.projectCollection, artHook: predicted.artHook, poolId: predicted.poolId },
      totalLaunchesAtIntent: totalLaunchesAtIntent.toString(),
    });
    log("  intent written BEFORE the bytes leave — a crash from here on is answerable by the chain");

    await assertLocalAnvil(rpcUrl, client);
    const txHash = await client.request({ method: "eth_sendRawTransaction", params: [signed.rawTransaction] });

    // THE CRASH POINT. `--crash-after-send` kills this process between the send returning and the
    // hash reaching disk, which is the exact window `decideResend` exists for. SIGKILL rather than
    // `process.exit` so no flush, no handler and no finally block can run.
    if (options.crashAfterSend) {
      log(`  [crash-after-send] the endpoint accepted ${txHash}; killing this process before the hash is recorded`);
      process.kill(process.pid, "SIGKILL");
    }

    recordIntentTxHash(workspace, txHash);
    summary.E2E_TX_HASH = txHash;
    log(`  broadcast ${txHash}`);
    writeReceipt(workspace, { phase: "BROADCAST", chainId: selectedChainId, policyHash, launchPlanHash: prepared.prepareHash, body: { txHash } });

    // ---- 16. CONFIRMED ---------------------------------------------------------------------------
    phase("CONFIRMED");
    // anvil automines one block per transaction, so depth beyond 1 needs blocks to exist. Mining
    // empty blocks is how a local chain advances; it is not a substitute for a receipt, and the
    // receipt is still read back from the node below.
    if (policy.requiredConfirmations > 1) {
      await assertLocalAnvil(rpcUrl, client);
      await client.request({ method: "anvil_mine", params: [numberToHex(policy.requiredConfirmations)] });
    }
    const confirmation = await waitForConfirmation(client, txHash, policy.requiredConfirmations, { timeoutMs: 120_000, pollMs: 500 });
    if (confirmation.state !== "CONFIRMED") throw new HarnessFailure(`the launch did not confirm: ${confirmation.state} — ${confirmation.detail}`);
    log(`  ${confirmation.detail}, gasUsed ${confirmation.gasUsed}`);
    writeReceipt(workspace, { phase: "CONFIRM", chainId: selectedChainId, policyHash, launchPlanHash: prepared.prepareHash, body: { state: confirmation.state, blockNumber: confirmation.blockNumber, confirmations: confirmation.confirmations, gasUsed: confirmation.gasUsed } });

    // ---- 17. VERIFIED — read back from chain, never from the plan --------------------------------
    phase("VERIFIED");
    const verified = await verifyLaunch(client, {
      txHash,
      factory,
      predicted: { projectToken: predicted.projectToken, projectCollection: predicted.projectCollection, artHook: predicted.artHook, poolId: predicted.poolId },
      expected: { creatorRecipient: policy.creatorRecipient, antiSnipeMode: election, metadataUriHash: prepared.params.metadataUriHash, metadataUri: pinned.uri },
    });
    for (const f of verified.findings) log(`  ${f.evidence} ${f.id}: ${f.detail}`);
    if (verified.verified !== "PROVEN") throw new HarnessFailure(`verification is ${verified.verified}`);
    summary.E2E_PREDICTION_MATCH = verified.predictionMatch === true ? "YES" : "NO";
    summary.E2E_PROJECT_TOKEN = verified.observed.projectToken ?? "";
    summary.E2E_PROJECT_COLLECTION = verified.observed.projectCollection ?? "";
    summary.E2E_POOL_ID = verified.observed.poolId ?? predicted.poolId;
    summary.E2E_ANTI_SNIPE_ELECTION_ONCHAIN = verified.findings.find((f) => f.id === "hook.antiSnipeMode")?.evidence === "PROVEN" ? election : "UNKNOWN";

    // THE THREE METADATA RELATIONS, over the values each stage actually holds.
    //
    // The keccak is INJECTED, and it is the schema package's — the same function
    // `metadataDigestForUri` builds `LaunchParams.metadataUriHash` with. Passing anything else here
    // would make relation 3 a comparison between two implementations of a canonical hash, which is
    // the arrangement the module's own header refuses.
    //
    // `deployedMetadataUriHash` is READ FROM THE COLLECTION, not carried over from the plan: the
    // collection resolves `contractURI()` through the resolver under that key, so the URI it answers
    // with IS the deployed side of relation 1, and its keccak is the deployed side of relation 3.
    const deployedUri = await client.readContract({ address: verified.observed.projectCollection, abi: PROJECT_COLLECTION_ABI(), functionName: "contractURI" });
    const commitment = verifyMetadataCommitment(
      {
        reviewedUri: pinned.uri,
        committedUri: pinned.uri,
        collectionContractUri: deployedUri,
        pinnedContentHash: pinned.contentSha256,
        bundleMetadataHash: pinned.contentSha256,
        launchMetadataUriHash: prepared.params.metadataUriHash,
        deployedMetadataUriHash: keccak256Utf8(deployedUri),
      },
      keccak256Utf8,
    );
    summary.E2E_METADATA_COMMITMENT = commitment.ok ? "BOUND" : `UNBOUND(${commitment.problems.length})`;
    if (!commitment.ok) log(`  metadata commitment problems: ${commitment.problems.join("; ")}`);

    writeReceipt(workspace, {
      phase: "VERIFY",
      chainId: selectedChainId,
      policyHash,
      launchPlanHash: prepared.prepareHash,
      addresses: { projectToken: summary.E2E_PROJECT_TOKEN, projectCollection: summary.E2E_PROJECT_COLLECTION, artHook: verified.observed.artHook ?? "" },
      body: { verified: verified.verified, predictionMatch: verified.predictionMatch, findings: verified.findings, contractURI: deployedUri },
    });

    // ---- 18. COMPLETE ----------------------------------------------------------------------------
    phase("COMPLETE");
    const mutations = diffSnapshots(frozen, snapshotTree(workspace));
    summary.E2E_MANUAL_MUTATIONS = String(mutations.length);
    for (const m of mutations) log(`  MUTATION ${m}`);

    const integrity = verifyReceiptChain(workspace);
    summary.E2E_RECEIPT_CHAIN_INTACT = integrity.intact ? "YES" : "NO";
    log(`  receipts: ${integrity.detail}`);

    const ok =
      integrity.intact &&
      mutations.length === 0 &&
      summary.E2E_PREDICTION_MATCH === "YES" &&
      summary.E2E_DEV_KEYSTORE_REFUSES_CHAIN_1 === "YES" &&
      summary.E2E_TX_HASH.length === 66;
    summary.AUTONOMOUS_LOCAL_FULL_LAUNCH = ok ? "PASS" : "FAIL";
    return { summary, workspace, exitCode: ok ? 0 : 1 };
  } catch (err) {
    if (err instanceof HarnessSkip) {
      summary.AUTONOMOUS_LOCAL_FULL_LAUNCH = "SKIPPED";
      log("");
      log("################################################################################");
      log("#  SKIPPED — THIS RUN PROVED NOTHING. IT IS NOT A PASS.                        #");
      log(`#  ${err.message}`);
      log("################################################################################");
      return { summary, workspace, exitCode: 0, skipped: true, reason: err.message };
    }
    summary.AUTONOMOUS_LOCAL_FULL_LAUNCH = "FAIL";
    log("");
    log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof RefusedToBroadcast) log("This is the broadcast guard doing its job. Nothing was sent.");
    if (process.env.RELICS_DEBUG && err instanceof Error && err.stack) log(err.stack);
    return { summary, workspace, exitCode: 1, error: err };
  } finally {
    if (signerServer) await signerServer.close().catch(() => {});
    if (anvil && !options.keepNode) anvil.child.kill("SIGKILL");
  }
}

/**
 * Brute-force a `hookSalt` whose deployed ArtHook address carries the RC6 permission mask.
 *
 * The SDK's `mineHookSalt` takes the hook's CREATION CODE, which the public record does not carry.
 * The chain carries `keccak256(creationCode ++ constructorArgs)` as `hookInitCodeHashes().singleQuote`
 * — the same input one hash further along — so this searches with the CONTRACT'S OWN value and the
 * SDK's own `launchHookSalt` composition (factory launcher-namespacing, then deployer
 * caller-namespacing). Nothing about the address scheme is restated here.
 */
export function mineHookSalt({ factory, hookDeployer, launcher, initCodeHash, maxAttempts = 5_000_000 }) {
  for (let i = 0; i < maxAttempts; i++) {
    const salt = numberToHex(i, { size: 32 });
    const hookAddress = getCreate2Address({ from: hookDeployer, salt: launchHookSalt(factory, launcher, salt), bytecodeHash: initCodeHash });
    if ((BigInt(hookAddress) & ALL_HOOK_MASK) === RC6_HOOK_FLAGS) return { salt, hookAddress, attempts: i + 1 };
  }
  throw new HarnessFailure(`no hookSalt carrying mask 0x14C0 in ${maxAttempts} attempts for launcher ${launcher}`);
}

export function printSummary(summary, write = (s) => process.stdout.write(`${s}\n`)) {
  write("");
  for (const [key, value] of Object.entries(summary)) write(`${key}=${value}`);
}

export { assertLocalAnvil, startAnvilFork, publicClientFor, anvilAvailable, forkRpcUrl, snapshotTree, HarnessSkip, HarnessFailure, RefusedToBroadcast, ANVIL_ACCOUNT_0_KEY, RC6_HOOK_FLAGS, ALL_HOOK_MASK, FIXTURE_DIR, REPO_ROOT };

// ------------------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workspace") out.workspace = resolve(argv[++i]);
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--reuse-node") out.reuseNodeUrl = argv[++i];
    else if (a === "--keep-node") out.keepNode = true;
    else if (a === "--keep-workspace") out.keepWorkspace = true;
    else if (a === "--crash-after-send") out.crashAfterSend = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new HarnessFailure(`unknown flag ${a}`);
  }
  return out;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      [
        "usage: node scripts/e2e-autonomous-launch.mjs [flags]",
        "",
        "  --workspace <dir>     run in this directory instead of a fresh temp one",
        "  --port <n>            anvil port (default 8545)",
        "  --reuse-node <url>    do not start anvil; use this loopback node",
        "  --keep-node           leave anvil running when the run ends",
        "  --keep-workspace      do not delete a temp workspace on success",
        "  --crash-after-send    SIGKILL between the send and recording the hash (crash-resume proof)",
        "",
        "Needs anvil on PATH and E2E_FORK_RPC_URL (or ETHEREUM_RPC_URL / MAINNET_RPC_URL).",
        "",
      ].join("\n"),
    );
    process.exit(0);
  }
  const result = await runAutonomousLaunch(options);
  printSummary(result.summary);
  if (!options.workspace && !options.keepWorkspace && result.exitCode === 0 && !result.skipped) {
    rmSync(result.workspace, { recursive: true, force: true });
  } else if (existsSync(result.workspace) && statSync(result.workspace).isDirectory()) {
    process.stderr.write(`\nworkspace kept at ${result.workspace}\n`);
  }
  process.exit(result.exitCode);
}
