#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ================================================================================================
// THE WAVE-1 RUNTIME ELECTION, END TO END, THROUGH THE PUBLIC CLI.
//
// One brief in, one frozen signing request out, and the thing this harness measures is the LAST
// four bytes anybody would look at: the art runtime the FINAL CALLDATA elects.
//
// WHY THE CALLDATA AND NOT A RECEIPT. `artTemplateId` carries two creator choices in one word —
// the registered template in the low 224 bits, the elected art runtime's per-chain registry key in
// the top 32 — and a launch that elects the wrong one SUCCEEDS. The pool opens, the collection
// deploys, `tokenURI` returns a perfectly good picture, and it is the wrong runtime's picture,
// permanently, because the art binding is one-shot. Nothing in a receipt, a log line or an exit
// code distinguishes that from success. So this harness decodes the bytes, with an ABI it declares
// itself, and reads the number out.
//
// ------------------------------------------------------------------------------------------------
// WHAT IT SENDS, AND WHERE
// ------------------------------------------------------------------------------------------------
// NOTHING REACHES A PUBLIC CHAIN. The chain is a LOCAL ANVIL FORK of Ethereum, and the fork keeps
// chain id 1 on purpose — the whole point is to exercise the deployed RC6 factory, the deployed
// `ArtRuntimeRegistryV1` and the two deployed Wave-1 runtimes at their real addresses with their
// real state. That is also what makes a mistake here expensive, so every state-changing RPC goes
// through `assertLocalAnvil`, which re-proves loopback + `anvil_nodeInfo` + `web3_clientVersion` on
// the exact URL about to be used, every time.
//
// The run stops at BUILT. It signs nothing and broadcasts nothing, on any chain, fork included:
// `relics agent build` freezes a signing request and the harness reads it. `WAVE1_BROADCASTS=0` is
// derived from the receipt chain rather than asserted.
//
// TWO TRANSACTIONS DO HAPPEN ON THE FORK, and calling them nothing would be a lie. The metadata
// resolver publish is one per project: `launch` reverts `MetadataNotPublished` until the collection
// URI is resolvable, and publishing is permissionless, so the harness sends it from its own funded
// throwaway account. They are fork-local, they are counted, and they are reported.
//
// ------------------------------------------------------------------------------------------------
// WHAT THIS HARNESS DELIBERATELY DOES NOT DO
// ------------------------------------------------------------------------------------------------
// IT DOES NOT PRODUCE A VISUAL VERDICT. The Wave-1 review loop refuses a launch until a reviewer
// that is not the author has LOOKED AT THE PICTURES and written one, and there is no headless
// substitute for that — writing a scripted `verdict.json` here would put a fabricated judgement
// about art into a hash-linked receipt chain, which is worse than not running the loop at all.
//
// So the launch stage runs in a workspace scaffolded by `relics init`, where `artReviewApplies`
// answers NOT_APPLICABLE today: no `art.json`, no template-selection receipt. That is the kit's
// CURRENT behaviour and not an arrangement of this harness, and it is reported as
// `WAVE1_ART_REVIEW_EXERCISED=NO` rather than left for a reader to assume. The selection stage runs
// in its own workspace, where the receipt it writes belongs.
// ================================================================================================

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, decodeFunctionData, getAddress, http, numberToHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { decodeArtSelector } from "@relics/project-schema";
import { METADATA_RESOLVER_ABI, getChainProfile } from "@relics/launch-sdk";

import { HarnessSkip, anvilAvailable, assertLocalAnvil, forkRpcUrl, printSummary, publicClientFor, startAnvilFork } from "./e2e-autonomous-launch.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(REPO_ROOT, "packages", "creator-cli", "bin", "relics.js");
const CHAIN_ID = 1;

class HarnessFailure extends Error {}

/**
 * The `launch(LaunchParams)` ABI, DECLARED HERE.
 *
 * NOT imported from the SDK, and that is the point of the whole file. The SDK is what BUILT these
 * bytes; decoding them with the same declaration would prove the SDK agrees with itself. Nineteen
 * fields, in order, transcribed from the published RC6 factory ABI — if the shipped struct ever
 * moves, this decode fails loudly rather than shifting a dynamic offset in silence.
 */
const LAUNCH_ABI = [
  {
    type: "function",
    name: "launch",
    stateMutability: "payable",
    outputs: [],
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "totalSupply", type: "uint256" },
          { name: "artworkBackingUnits", type: "uint256" },
          { name: "startingPreset", type: "uint8" },
          { name: "tokenSalt", type: "bytes32" },
          { name: "hookSalt", type: "bytes32" },
          { name: "artMode", type: "uint8" },
          { name: "artTemplateId", type: "uint256" },
          { name: "artScriptHash", type: "bytes32" },
          { name: "artConfig", type: "bytes" },
          { name: "marketStateConfig", type: "bytes" },
          { name: "creatorRecipient", type: "address" },
          { name: "collaborators", type: "tuple[]", components: [{ name: "recipient", type: "address" }, { name: "bps", type: "uint16" }] },
          { name: "burnPolicy", type: "uint8" },
          { name: "antiSnipeMode", type: "uint8" },
          { name: "metadataUriHash", type: "bytes32" },
          { name: "creatorEarnings", type: "uint256" },
          { name: "backingUnitsPerArtwork", type: "uint256" },
        ],
      },
    ],
  },
];
const LAUNCH_PARAMS_FIELD_COUNT = LAUNCH_ABI[0].inputs[0].components.length;

/** A deliberately plain cover. It exists so the collection is not a blank tile; it is not art. */
const COVER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" fill="#0b0c10"/><circle cx="32" cy="32" r="18" fill="none" stroke="#8c6a3f" stroke-width="2"/></svg>\n';

/**
 * The two projects, and the number each one must end up electing.
 *
 * THE EXPECTED IDS ARE NOT ASSERTED ABOUT THE CHAIN — they are what the harness REQUIRES the chain
 * to have said. `resolveArtRuntime` establishes them by reading `ArtRuntimeRegistryV1`; if the
 * registry ever moved a runtime to a different key, this harness would fail rather than quietly
 * accepting the new number, which is the correct behaviour for a value that goes into an immutable
 * art binding.
 */
const CASES = [
  {
    key: "COMPASS",
    scaffold: "geometric-recursion-compass",
    runtime: "GEOMETRIC_RECURSION",
    runtimeTag: "GEOMETRIC_RECURSION_V1",
    catalogTemplate: "GEOMETRIC_RECURSION_V1/compass",
    expectedRuntimeId: 3,
    name: "Compass Assay",
    symbol: "CMPA",
    brief: [
      "# Brief — ORRERY",
      "",
      "A brass and ink orrery. Concentric rings and dials, nested, precise, cartographic. Each token",
      "is an instrument: something that was built to measure. Rings should sit inside rings, and the",
      "register should feel engraved rather than drawn.",
      "",
      "Recovery should open the instrument out. Drawdown should cut generations away so the",
      "instrument reads as incomplete.",
      "",
    ].join("\n"),
  },
  {
    key: "ALLUVIUM",
    scaffold: "vector-composition-alluvium",
    runtime: "VECTOR_COMPOSITION",
    runtimeTag: "VECTOR_COMPOSITION_V1",
    catalogTemplate: "VECTOR_COMPOSITION_V1/alluvium",
    expectedRuntimeId: 4,
    name: "Alluvium Assay",
    symbol: "ALVA",
    brief: [
      "# Brief — STRATA",
      "",
      "A core sample. Horizontal sediment beds laid down one on another, banded in ochre and earth,",
      "the whole history of the deposit legible as layers. Wide silhouettes, no centred emblem, no",
      "radial symmetry.",
      "",
      "Drawdown should lay down more beds. Recovery should rule lines through the field.",
      "",
    ].join("\n"),
  },
];

// ------------------------------------------------------------------------------------------------

const log = (s) => process.stderr.write(`${s}\n`);

function runCli(args, { allowFailure = false } = {}) {
  log(`$ relics ${args.join(" ")}`);
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: REPO_ROOT, env: process.env });
  if (!allowFailure && result.status !== 0) {
    throw new HarnessFailure(`relics ${args.slice(0, 2).join(" ")} exited ${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result;
}

/** Run an `agent` subcommand and return its JSON envelope. A non-envelope answer is a failure. */
function runAgent(args, { allowFailure = false } = {}) {
  const result = runCli([...args, "--json"], { allowFailure: true });
  let envelope = null;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    throw new HarnessFailure(`\`relics ${args.join(" ")}\` produced no JSON envelope (exit ${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  if (!allowFailure && (result.status !== 0 || envelope.success !== true)) {
    throw new HarnessFailure(`\`relics ${args.join(" ")}\` refused: ${(envelope.errors ?? []).join("; ") || `exit ${result.status}`}`);
  }
  return { envelope, status: result.status };
}

/** The one policy both projects run under. Written per workspace, exactly as a creator would. */
function agentPolicy(creatorRecipient, runtimeTag) {
  return {
    version: 1,
    goal: "BUILD_ONLY",
    allowedChains: [CHAIN_ID],
    chainSelection: "PREFERRED_ORDER",
    // THE STABLE STRING, NOT A NUMBER. A creator writes the tag; the numeric registry key is a
    // per-chain fact this file must not contain.
    allowedRuntimes: [runtimeTag],
    allowedQuoteAssets: "AUTO",
    creatorRecipient,
    allowedAntiSnipeModes: ["NONE", "PROTECTED_98_MINUTES"],
    antiSnipePreference: "AUTO",
    maxRoyaltyBps: 500,
    maxNativeSpendWei: "0",
    maxGasPriceWei: "500000000000",
    maxTransactionGas: "14000000",
    requireSimulation: true,
    requireMetadataReadback: true,
    requireDeterministicPrediction: false,
    requiredConfirmations: 1,
    // THE RUN STOPS AT BUILT. Nothing here can sign and nothing here can send.
    allowBroadcast: false,
    signer: "dev-keystore",
  };
}

// ------------------------------------------------------------------------------------------------

export async function runWave1E2E(options = {}) {
  const summary = {
    PUBLIC_CLI_WAVE1_RUNTIME_E2E: "FAIL",
    PUBLIC_CLI_COMPASS_FINAL_RUNTIME_ID: "UNKNOWN",
    PUBLIC_CLI_ALLUVIUM_FINAL_RUNTIME_ID: "UNKNOWN",
    PUBLIC_CLI_COMPASS_SELECTED_TEMPLATE: "UNKNOWN",
    PUBLIC_CLI_ALLUVIUM_SELECTED_TEMPLATE: "UNKNOWN",
    PUBLIC_CLI_COMPASS_BUNDLE_RUNTIME_ID: "UNKNOWN",
    PUBLIC_CLI_ALLUVIUM_BUNDLE_RUNTIME_ID: "UNKNOWN",
    WAVE1_LAUNCHPARAMS_FIELD_COUNT: String(LAUNCH_PARAMS_FIELD_COUNT),
    WAVE1_REGISTRY_RPC_HOST: "UNKNOWN",
    WAVE1_ART_REVIEW_EXERCISED: "NO",
    WAVE1_FORK_TRANSACTIONS: "0",
    WAVE1_BROADCASTS: "0",
  };

  if (!anvilAvailable()) throw new HarnessSkip("`anvil` is not on PATH. Install Foundry (https://getfoundry.sh) to run this harness.");
  const fork = options.reuseNodeUrl ? null : (forkRpcUrl() ?? fallbackForkRpc());
  if (!options.reuseNodeUrl && !fork) {
    throw new HarnessSkip("no upstream RPC to fork from. Set E2E_FORK_RPC_URL (or ETHEREUM_RPC_URL / MAINNET_RPC_URL) to an Ethereum endpoint.");
  }
  // WHICH HOST ANSWERED IS PART OF THE REPORT. A credentialled endpoint's URL is a secret and is
  // never printed; its HOST is not, and "which provider answered" is exactly the thing a reader
  // needs when a rate-limited one turns a measurement into an UNKNOWN.
  summary.WAVE1_REGISTRY_RPC_HOST = fork ? `${new URL(fork.url).host} (via ${fork.envKey})` : "reused node";

  let node = null;
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), "relics-wave1-"));
  mkdirSync(workspace, { recursive: true });
  let forkTransactions = 0;

  try {
    const rpcUrl = options.reuseNodeUrl ?? (node = await startAnvilFork({ forkUrl: fork.url, port: options.port ?? 8599, log })).url;
    const client = publicClientFor(rpcUrl);
    await assertLocalAnvil(rpcUrl, client);
    const live = await client.getChainId();
    if (live !== CHAIN_ID) throw new HarnessFailure(`the fork reports chain ${live}; this harness needs a fork of Ethereum so the deployed registry and runtimes are the real ones`);

    // THE WHOLE CLI IS POINTED AT THE FORK through the SDK's ordinary env var, not through a flag
    // the CLI would have to grow. There is no test-only code path.
    process.env.ETHEREUM_RPC_URL = rpcUrl;

    const account = privateKeyToAccount(generatePrivateKey());
    await assertLocalAnvil(rpcUrl, client);
    await client.request({ method: "anvil_setBalance", params: [account.address, numberToHex(10n ** 21n)] });
    const inherited = await client.getCode({ address: account.address });
    if (inherited && inherited !== "0x") {
      await assertLocalAnvil(rpcUrl, client);
      await client.request({ method: "anvil_setCode", params: [account.address, "0x"] });
    }
    const wallet = createWalletClient({ account, chain: client.chain, transport: http(rpcUrl) });
    const profile = getChainProfile(CHAIN_ID);
    const resolver = getAddress(profile.contracts.metadataResolver);

    for (const spec of CASES) {
      log(`\n────── ${spec.key} ──────`);

      // ---- STAGE A: the agent chooses a template from the brief, against a LIVE registry read ----
      const selectWs = join(workspace, `select-${spec.key.toLowerCase()}`);
      mkdirSync(selectWs, { recursive: true });
      writeFileSync(join(selectWs, "brief.md"), spec.brief);
      writeFileSync(join(selectWs, "relics.agent.json"), `${JSON.stringify(agentPolicy(account.address, spec.runtimeTag), null, 2)}\n`);
      const selected = runAgent(["agent", "select-template", "--workspace", selectWs, "--brief", join(selectWs, "brief.md"), "--chain", String(CHAIN_ID)]).envelope;
      if (selected.result.selected !== spec.catalogTemplate) {
        throw new HarnessFailure(`the brief selected ${selected.result.selected}, not ${spec.catalogTemplate}: ${selected.result.reason}`);
      }
      summary[`PUBLIC_CLI_${spec.key}_SELECTED_TEMPLATE`] = selected.result.selected;
      log(`  selected ${selected.result.selected} from a pool of ${selected.result.poolSize}`);

      // ---- STAGE B: the project, validated and exported by the public CLI -----------------------
      const projectDir = join(workspace, `project-${spec.key.toLowerCase()}`);
      runCli(["init", projectDir, "--template", spec.scaffold, "--name", spec.name, "--symbol", spec.symbol]);

      const configPath = join(projectDir, "relics.config.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.earnings.creatorRecipient = account.address;
      // A template ships `UNSPECIFIED`, a draft value the format refuses in a FINAL bundle. Elected
      // here exactly as a creator would, for the same reason the recipient is filled in.
      config.market.antiSnipeMode = "NONE";
      config.chains.requested = [CHAIN_ID];
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

      // THE COLLECTION'S OWN IDENTITY, declared a second time because the bundle format requires the
      // two to agree and refuses a project whose manifest and metadata disagree about its name.
      const metadataPath = join(projectDir, "metadata", "collection.json");
      const collection = JSON.parse(readFileSync(metadataPath, "utf8"));
      collection.name = spec.name;
      collection.symbol = spec.symbol;
      // A cover, because a collection with none renders as a blank tile everywhere. The bundle uses
      // the format's camelCase keys; the `contractURI` document `relics agent metadata` pins is
      // OpenSea's snake_case shape, and the CLI projects between them.
      mkdirSync(join(projectDir, "assets"), { recursive: true });
      writeFileSync(join(projectDir, "assets", "cover.svg"), COVER_SVG);
      collection.image = "assets/cover.svg";
      writeFileSync(metadataPath, `${JSON.stringify(collection, null, 2)}\n`);

      runCli(["validate", projectDir]);
      const bundlePath = join(projectDir, "project.relics");
      runCli(["export", projectDir, "--output", bundlePath]);

      const inspected = JSON.parse(runCli(["inspect", bundlePath, "--json"]).stdout);
      if (!inspected.ok) throw new HarnessFailure(`the exported bundle does not inspect cleanly: ${(inspected.issues ?? []).map((i) => i.code).join(", ")}`);
      const binding = inspected.manifest.artBinding;
      if (binding.runtimeId !== spec.runtimeTag) throw new HarnessFailure(`the bundle binds ${binding.runtimeId}, not ${spec.runtimeTag}`);
      summary[`PUBLIC_CLI_${spec.key}_BUNDLE_RUNTIME_ID`] = binding.runtimeId;
      log(`  exported ${binding.runtimeId} · ${binding.artConfigFormat} · ${binding.artConfigBytes} bytes · ${binding.artConfigHash.slice(0, 16)}…`);

      // ---- STAGE C: the launch chain, through the CLI's own agent commands ----------------------
      writeFileSync(join(projectDir, "relics.agent.json"), `${JSON.stringify(agentPolicy(account.address, spec.runtimeTag), null, 2)}\n`);
      runAgent(["agent", "preflight", "--workspace", projectDir, "--chain", String(CHAIN_ID), "--signer", account.address]);

      const metadata = runAgent(["agent", "metadata", "--workspace", projectDir, "--dry-run"]).envelope;
      // THE RESOLVER PUBLISH — the one fork transaction per project, and the reason `launch` does
      // not revert `MetadataNotPublished`. It is permissionless, so the harness's own funded
      // throwaway account sends it; no impersonation and no cheat code beyond funding.
      await assertLocalAnvil(rpcUrl, client);
      const published = await client.readContract({ address: resolver, abi: METADATA_RESOLVER_ABI(), functionName: "isPublished", args: [metadata.result.resolverDigest] });
      if (!published) {
        const hash = await wallet.writeContract({ address: resolver, abi: METADATA_RESOLVER_ABI(), functionName: "publish", args: [metadata.result.uri] });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new HarnessFailure(`the resolver publish reverted (${hash})`);
        forkTransactions += 1;
      }

      const prepared = runAgent(["agent", "prepare", "--workspace", projectDir, "--signer", account.address]).envelope;
      log(`  prepared, electing runtime ${prepared.result.artSelector.artRuntimeId} (${prepared.result.artSelector.runtimeTag})`);
      runAgent(["agent", "predict", "--workspace", projectDir, "--signer", account.address]);
      runAgent(["agent", "simulate", "--workspace", projectDir, "--signer", account.address]);
      const built = runAgent(["agent", "build", "--workspace", projectDir]).envelope;

      // ---- THE MEASUREMENT: decode the FINAL calldata --------------------------------------------
      const request = latestReceiptBody(projectDir, "BUILD").request;
      if (request.dataHash !== built.result.dataHash) throw new HarnessFailure("the build receipt and the build envelope disagree about the calldata hash");
      const decoded = decodeFunctionData({ abi: LAUNCH_ABI, data: request.data });
      const params = decoded.args[0];
      const present = Object.keys(params).filter((k) => Number.isNaN(Number(k)));
      if (present.length !== LAUNCH_PARAMS_FIELD_COUNT) {
        throw new HarnessFailure(`the final calldata decoded ${present.length} of ${LAUNCH_PARAMS_FIELD_COUNT} LaunchParams fields. A short positional tuple is not a partial transaction; it is a different one.`);
      }
      const selector = decodeArtSelector(params.artTemplateId);
      log(`  FINAL CALLDATA artTemplateId = 0x${params.artTemplateId.toString(16).padStart(64, "0")}`);
      log(`    -> art runtime ${selector.artRuntimeId}, template ${selector.templateId}`);
      if (selector.templateId !== 1n) throw new HarnessFailure(`the final calldata binds template ${selector.templateId}; the registered template is 1`);
      if (selector.artRuntimeId !== spec.expectedRuntimeId) {
        throw new HarnessFailure(
          `THE FINAL CALLDATA ELECTS ART RUNTIME ${selector.artRuntimeId}, NOT ${spec.expectedRuntimeId}. ` +
            "A valid picture from the wrong runtime is not success: the art binding is one-shot and this launch would render the wrong work permanently.",
        );
      }
      summary[`PUBLIC_CLI_${spec.key}_FINAL_RUNTIME_ID`] = String(selector.artRuntimeId);

      // The art config in the calldata must be the bundle's own bytes — otherwise the right runtime
      // would be handed the wrong configuration, which fails in a different direction.
      if (params.artConfig.toLowerCase() !== `0x${binding.artConfig}`.toLowerCase()) {
        throw new HarnessFailure("the final calldata's artConfig is not the bytes the exported bundle carries");
      }

      // NOTHING WAS SIGNED AND NOTHING WAS SENT, derived from the receipt chain rather than asserted.
      const phases = receiptPhases(projectDir);
      for (const forbidden of ["BROADCAST", "SIGN", "CONFIRM"]) {
        if (phases.includes(forbidden)) throw new HarnessFailure(`a ${forbidden} receipt exists; this harness must stop at BUILT`);
      }
    }

    summary.WAVE1_FORK_TRANSACTIONS = String(forkTransactions);
    const ok =
      summary.PUBLIC_CLI_COMPASS_FINAL_RUNTIME_ID === "3" &&
      summary.PUBLIC_CLI_ALLUVIUM_FINAL_RUNTIME_ID === "4" &&
      summary.PUBLIC_CLI_COMPASS_BUNDLE_RUNTIME_ID === "GEOMETRIC_RECURSION_V1" &&
      summary.PUBLIC_CLI_ALLUVIUM_BUNDLE_RUNTIME_ID === "VECTOR_COMPOSITION_V1";
    summary.PUBLIC_CLI_WAVE1_RUNTIME_E2E = ok ? "PASS" : "FAIL";
    return { summary, workspace, exitCode: ok ? 0 : 1 };
  } catch (err) {
    if (err instanceof HarnessSkip) {
      log(`\nSKIPPED — ${err.message}`);
      summary.PUBLIC_CLI_WAVE1_RUNTIME_E2E = "SKIPPED";
      return { summary, workspace, exitCode: 0, skipped: true, reason: err.message };
    }
    log(`\nFAILED — ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.RELICS_DEBUG && err instanceof Error) log(err.stack ?? "");
    summary.WAVE1_FORK_TRANSACTIONS = String(forkTransactions);
    return { summary, workspace, exitCode: 1 };
  } finally {
    // `startAnvilFork` returns { child, url, client } -- there is no `close`, so the optional call
    // here silently no-opped and the anvil child OUTLIVED the harness. The run still exited 0, so
    // nothing said a fork node was left listening on the port the next run wants. Kill the child,
    // the way `startAnvilFork`'s own failure path already does.
    if (node && !options.keepNode) node.child?.kill("SIGKILL");
  }
}

function fallbackForkRpc() {
  const profile = getChainProfile(CHAIN_ID);
  // THE PUBLIC FALLBACK IS NAMED, NEVER SILENTLY SUBSTITUTED. It is rate-limited by nature, so a
  // run on it that turns a read into an UNKNOWN has to be attributable to the endpoint.
  return profile?.publicFallbackRpc ? { url: profile.publicFallbackRpc, envKey: "the chain profile's public fallback" } : null;
}

function receiptDir(workspace) {
  return join(workspace, ".relics-agent", "receipts");
}

function receiptPhases(workspace) {
  const dir = receiptDir(workspace);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")).phase);
}

function latestReceiptBody(workspace, phase) {
  const dir = receiptDir(workspace);
  const rows = readdirSync(dir)
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    .filter((r) => r.phase === phase)
    .sort((a, b) => a.sequence - b.sequence);
  if (rows.length === 0) throw new HarnessFailure(`no ${phase} receipt was written`);
  return rows[rows.length - 1].body;
}

// ------------------------------------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const options = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--workspace") options.workspace = resolve(argv[++i]);
    else if (argv[i] === "--port") options.port = Number(argv[++i]);
    else if (argv[i] === "--reuse-node") options.reuseNodeUrl = argv[++i];
    else if (argv[i] === "--keep-node") options.keepNode = true;
    else if (argv[i] === "--keep-workspace") options.keepWorkspace = true;
    else throw new HarnessFailure(`unknown flag ${argv[i]}`);
  }
  const result = await runWave1E2E(options);
  printSummary(result.summary);
  if (!options.workspace && !options.keepWorkspace && result.exitCode === 0) rmSync(result.workspace, { recursive: true, force: true });
  else log(`\nworkspace kept at ${result.workspace}`);
  process.exit(result.exitCode);
}
