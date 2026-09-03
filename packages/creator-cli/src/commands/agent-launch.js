// SPDX-License-Identifier: MIT
// ================================================================================================
// THE WRITE-SIDE COMMANDS: metadata -> prepare -> predict -> simulate -> build -> policy-check ->
// broadcast -> confirm -> verify, plus `run` and `resume` over the top.
//
// EACH COMMAND IS INDEPENDENTLY RUNNABLE AND EACH WRITES A RECEIPT. An external coding agent can
// drive them one at a time, inspect the JSON between steps, and stop wherever it likes; `run`
// simply calls them in order and stops at the first thing that needs a human or a creative edit.
// There is no second implementation behind `run` — it is the same functions.
//
// STATE LIVES IN RECEIPTS, NOT IN MEMORY. A command reads what earlier phases recorded, so the
// process can die between any two steps and the next invocation picks up from what is on disk —
// and, for anything that touched a chain, from what the CHAIN says rather than what the disk says.
// ================================================================================================
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { scrub } from "../scrub.js";
import { explainCode } from "./agent-remedies.js";
import { encodeArtSelector } from "../schema.js";

export const EXIT = { OK: 0, REFUSED: 1, USAGE: 2, UNKNOWN_CHAIN_STATE: 3, POLICY: 4, SIGNER_REFUSED: 5, BLOCKED: 6 };

const bigintSafe = (_k, v) => (typeof v === "bigint" ? v.toString() : v);

export function envelope(command, { success, result = null, warnings = [], errors = [], nextActions = [], inputHash = null }) {
  return { schemaVersion: 1, command, success, timestamp: new Date().toISOString(), inputHash, result, warnings, errors, nextActions };
}

export function emit(command, payload, { json }) {
  // See the note beside `emit` in agent.js: one exit, one scrub. A credentialled RPC endpoint
  // reaches this envelope only ever by accident — through a transport error that quotes its own
  // request URL — which is precisely why it has to be caught here rather than at each source.
  const env = scrub(envelope(command, payload));
  if (json) process.stdout.write(`${JSON.stringify(env, bigintSafe, 2)}\n`);
  else {
    for (const e of env.errors) process.stderr.write(`error: ${e}\n`);
    for (const w of env.warnings) process.stderr.write(`warn:  ${w}\n`);
    process.stderr.write(`${env.success ? "ok" : "refused"}: ${command}\n`);
    if (env.result) process.stderr.write(`${JSON.stringify(env.result, bigintSafe, 2)}\n`);
  }
  return env;
}

/** Read the body a named phase recorded, or null. This is how commands hand state to each other. */
async function phaseBody(workspace, phase) {
  const { latestReceipt } = await import("@relics/agent-flow");
  const r = latestReceipt(workspace, phase);
  return r ? r.body : null;
}

async function requirePhase(workspace, phase, need, name, json) {
  const body = await phaseBody(workspace, phase);
  if (!body) {
    emit(name, { success: false, errors: [`${need} — run \`relics agent ${phase.toLowerCase()}\` first. The proof chain cannot be skipped: each phase is a prerequisite of the next, not a formality.`], nextActions: ["BLOCKED"] }, { json });
    return null;
  }
  return body;
}


/**
 * THE ART GATE. The first statement of every launch-proving command, and RETURNED ON.
 *
 * `ART_ACCEPTED` before metadata, prepare, predict, simulate, build or broadcast. The reason it is
 * a call in each of them rather than one check in `run` is that each of these commands is
 * independently runnable BY DESIGN — an agent is invited to drive them one at a time — so a gate
 * that lived only in the orchestrator would be a gate with six doors around it.
 *
 * NO ESCAPE HATCH. There is no `--skip-art-review`, no policy field, no environment variable and
 * no goal that exempts an autonomous run. A creator at a terminal who wants to launch art nobody
 * reviewed still can: `goal: "BUILD_ONLY"` builds the transaction and they sign it themselves and
 * own that. What is refused is an AGENT doing it for them, which is the case where nobody is
 * looking by construction.
 *
 * IT STANDS ASIDE WHERE IT DOES NOT APPLY, and says so in the record rather than passing silently.
 * See `artReviewApplies` — three answers, not two.
 */
async function requireArtGate(name, workspace, json, ctx) {
  const { requireArtAccepted } = await import("./agent-art.js");
  const gate = await requireArtAccepted(workspace, { goal: ctx?.policy?.goal });
  if (gate.ok) return true;
  emit(name, {
    success: false,
    result: { artGate: gate.reasonCode, invalidatedBy: gate.invalidatedBy ?? [] },
    errors: [
      `${gate.reasonCode}: ${gate.detail}`,
      "The first legal configuration is not launch-ready art. A configuration can be legal, deterministic, inside its gas budget and byte-distinct across every market state and still draw the wrong thing — that has happened here, and nothing caught it because nothing looked.",
      `Run: ${gate.remedy}`,
    ],
    nextActions: ["REVIEW_ART"],
  }, { json });
  return false;
}

// ------------------------------------------------------------------------------------------------

/** Pin the collection metadata, fetch it BACK, verify the bytes, and record the commitment. */
export async function cmdMetadata(name, workspace, flags, json, ctx) {
  if (!(await requireArtGate(name, workspace, json, ctx))) return EXIT.BLOCKED;
  // IMPORTED FROM THE PACKAGE ROOT, WITH THE NAMES THE MODULE ACTUALLY EXPORTS. This line used to
  // reach a deep path that was not in the `exports` map at all, and its `.catch(() => …)` turned
  // that into a SILENT fallback to the package root — which exported none of these names either.
  // The visible symptom was "memoryProvider is not a function": a wrong-name error standing in for
  // a wrong-module error. A catch that swallows a resolution failure hides the only useful signal.
  const { pinAndVerifyMetadataDocument, createMemoryProvider, createPinataProvider } = await import("@relics/launch-sdk");
  const { writeReceipt } = await import("@relics/agent-flow");

  const docPath = join(workspace, "metadata", "collection.json");
  if (!existsSync(docPath)) {
    emit(name, { success: false, errors: [`no metadata document at ${docPath}. A collection's metadata is written at BIRTH and cannot be changed afterwards, so there is nothing this command may invent on the creator's behalf.`] }, { json });
    return EXIT.REFUSED;
  }
  const bundleShaped = JSON.parse(readFileSync(docPath, "utf8"));
  const doc = contractUriDocument(bundleShaped);

  // PROVIDER CHOICE IS EXPLICIT. `--dry-run` uses the in-memory provider, which performs the SAME
  // fetch-back and byte comparison against a store that lives in this process — it proves the
  // pipeline without pinning anything to a network anyone else can see.
  const useMemory = Boolean(flags["dry-run"]) || !process.env.PINATA_JWT;
  const provider = useMemory ? createMemoryProvider() : createPinataProvider();
  if (!useMemory && provider && provider.available === false) {
    emit(name, { success: false, errors: ["the configured pinning provider reports itself unavailable; check its credential is set in the environment (never in the project, the policy or a receipt)"] }, { json });
    return EXIT.BLOCKED;
  }

  try {
    const verified = await pinAndVerifyMetadataDocument({ document: doc, provider, filename: "collection.json" });
    // A REFUSAL IS A REFUSAL, NOT A CRASH. This used to read `verified.uri` straight through, so a
    // refused pin surfaced as "Cannot read properties of undefined (reading 'length')" from
    // somewhere downstream — a stage code and a reason were sitting in the result, unread.
    if (verified.kind !== "VERIFIED") {
      emit(name, {
        success: false,
        result: { stage: verified.stage ?? null, code: verified.code ?? null },
        errors: [`the metadata pin was refused at stage ${verified.stage ?? "?"}: ${verified.code ?? "?"} — ${verified.detail ?? "no detail"}`],
        nextActions: ["FIX_VALIDATION"],
      }, { json });
      return EXIT.REFUSED;
    }
    writeReceipt(workspace, { phase: "METADATA", body: { uri: verified.uri, cid: verified.cid, contentSha256: verified.contentSha256, resolverDigest: verified.resolverDigest, provider: provider.id, pinnedToNetwork: !useMemory } });
    emit(name, {
      success: true,
      result: { uri: verified.uri, cid: verified.cid, contentSha256: verified.contentSha256, resolverDigest: verified.resolverDigest, provider: provider.id, pinnedToNetwork: !useMemory },
      warnings: useMemory ? ["the IN-MEMORY provider was used, so nothing was pinned to a public network. The fetch-back and byte comparison really ran, but no third party can read this CID. A real launch needs a real provider."] : [],
      nextActions: ["READY_FOR_PREPARE"],
    }, { json });
    return EXIT.OK;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "METADATA_REFUSED";
    emit(name, { success: false, errors: [explainCode(code, err instanceof Error ? err.message : String(err))], nextActions: ["FIX_VALIDATION"] }, { json });
    return EXIT.REFUSED;
  }
}

/** Build the canonical LaunchParams and record its identity. */
export async function cmdPrepare(name, workspace, flags, json, ctx) {
  if (!(await requireArtGate(name, workspace, json, ctx))) return EXIT.BLOCKED;
  const sdk = await import("@relics/launch-sdk");
  const { writeReceipt } = await import("@relics/agent-flow");
  const meta = await requirePhase(workspace, "METADATA", "no verified metadata commitment", name, json);
  if (!meta) return EXIT.BLOCKED;
  const pre = await requirePhase(workspace, "PREFLIGHT", "no chain has been selected", name, json);
  if (!pre) return EXIT.BLOCKED;

  const chainId = pre.selected?.chainId;
  const profile = sdk.getChainProfile(chainId);
  const cfgPath = join(workspace, "relics.config.json");
  if (!existsSync(cfgPath)) {
    emit(name, { success: false, errors: [`no relics.config.json in ${workspace}`] }, { json });
    return EXIT.REFUSED;
  }
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));

  // ---- MINE THE HOOK SALT. A ZERO SALT IS NOT A PLACEHOLDER -----------------------------------
  // This used to pass `ZERO32` with a `--hookSalt` escape hatch the parser did not even accept, so
  // every launch it prepared reverted `BadHookAddress` — the address a zero salt yields does not
  // carry the required permission bits. Mining needs one input the public record lacks (the hook's
  // init-code hash), and the factory returns it, so this is a live read plus local keccak.
  const launcher = flags.signer ?? process.env.RELICS_SIGNER_ADDRESS;
  if (!launcher) {
    emit(name, { success: false, errors: ["prepare needs the LAUNCHER address (--signer or RELICS_SIGNER_ADDRESS). The factory re-hashes the hook salt against the sending address (M-01), so a salt mined for anyone else lands on an address that does not carry the hook mask and the launch reverts BadHookAddress."] }, { json });
    return EXIT.BLOCKED;
  }
  const made = sdk.makeClient(profile);
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${chainId}`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }

  let mined;
  try {
    const lane = await sdk.hookLaneFor(made.client, profile.contracts.launchpadFactory);
    mined = await sdk.mineHookSalt({
      deployer: lane.deployer, caller: profile.contracts.launchpadFactory, launcher, initCodeHash: lane.initCodeHash,
      // Refuse an address that is already occupied: the hook's constructor args are constant per
      // factory, so two launches mining from the same start would otherwise collide.
      hasCode: async (a) => { const c = await made.client.getCode({ address: a }); return Boolean(c && c !== "0x"); },
    });
  } catch (err) {
    emit(name, { success: false, errors: [`hook salt mining failed: ${err instanceof Error ? err.message : String(err)}`] }, { json });
    return EXIT.REFUSED;
  }

  // ---- THE ART SELECTOR. THE ELECTION IS A LIVE CHAIN READ, NOT A CONSTANT --------------------
  //
  // `artTemplateId` carries the registered template in its low 224 bits and the ELECTED art
  // runtime's registry key in its top 32. This step used to pass `BigInt(cfg.art?.templateId ?? 1)`
  // — template 1 with a runtime half of zero — so every launch it prepared expressed NO PREFERENCE
  // and the chain bound its generic runtime. A creator who authored for GEOMETRIC_RECURSION_V1 got
  // a project that launches, succeeds, and renders somebody else's art, permanently.
  //
  // The number cannot be written down here: registry ids are per chain, chosen by the registering
  // authority, and sparse. So the project names its runtime by STABLE STRING and the id is read off
  // the chain that is about to be launched on.
  const artSource = await artSourceFor(workspace, cfg);
  if (artSource.error) {
    emit(name, { success: false, errors: [artSource.error], nextActions: ["FIX_VALIDATION"] }, { json });
    return EXIT.REFUSED;
  }
  const { ART_RUNTIME_IDS } = await import("../schema.js");
  const runtimeTag = ART_RUNTIME_IDS[artSource.runtime] ?? artSource.runtime;

  // ---- THE VISUAL REVIEW MAY NOT APPLY TO THIS WORKSPACE, AND THAT IS WORTH SAYING OUT LOUD ----
  //
  // `artReviewApplies` binds on an `art.json` or on a template-selection receipt, so a project
  // SCAFFOLDED with `relics init` on a Wave-1 runtime — which became possible when the Wave-1
  // scaffolds shipped — answers NOT_APPLICABLE and reaches this point with nobody having looked at
  // the pictures. That is exactly the case the review loop exists for: an agent launching art no
  // human has seen.
  //
  // THIS IS A WARNING AND NOT A REFUSAL, deliberately. Making it refuse would decide, on the
  // owner's behalf, that every Wave-1 terminal launch requires a reviewer round — a product
  // decision with a real cost, and not one a gate should make quietly on the way past. What is NOT
  // acceptable is the gap being invisible, so it is named here, in the run's own output, every time.
  const reviewGap = await unreviewedWave1Warning(workspace, artSource.runtime);
  const elected = await sdk.resolveArtRuntime(made.client, profile.contracts.artRuntimeRegistry, runtimeTag);
  if (elected.state !== "ACTIVE") {
    emit(name, {
      success: false,
      result: { runtimeTag, chainId, election: electionRecord(elected) },
      errors: [`the project elects ${runtimeTag} and that runtime is ${elected.state} on chain ${chainId}: ${elected.detail}`],
      // AN UNREAD REGISTRY IS A REASON TO RETRY; AN ABSENT RUNTIME IS NOT. The two land on
      // different exit codes so an agent branches on them differently.
      nextActions: [elected.state === "UNKNOWN" ? "RETRY_CHAIN_READ" : "BLOCKED"],
    }, { json });
    return elected.state === "UNKNOWN" ? EXIT.UNKNOWN_CHAIN_STATE : EXIT.BLOCKED;
  }
  if (!ctx.policy.allowedRuntimes.some((allowed) => allowed === runtimeTag || (runtimeTag.startsWith(allowed) && allowed.length > 4))) {
    emit(name, { success: false, errors: [`the project elects ${runtimeTag} but the policy allows only ${ctx.policy.allowedRuntimes.join(", ")}`], nextActions: ["BLOCKED"] }, { json });
    return EXIT.POLICY;
  }

  try {
    const input = creatorInputFromConfig(cfg, meta.uri, ctx.policy, sdk, { artSource, artRuntimeId: elected.artRuntimeId });
    const prepared = sdk.prepare(input, { tokenSalt: ZERO32, hookSalt: mined.salt }, chainId, profile.contracts.launchpadFactory);
    // THE SDK'S OWN VALIDATOR, RUN AGAINST THE ELECTION THAT WAS READ. `prepare` builds; this is
    // the independent refusal, and it is given the live reading rather than a boolean.
    const verdict = sdk.validateLaunchParams(prepared.params, {
      electedRuntime: { runtimeTag, artRuntimeId: elected.artRuntimeId, state: elected.state, detail: elected.detail },
    });
    if (!verdict.ok) {
      emit(name, { success: false, errors: verdict.problems, nextActions: ["FIX_VALIDATION"] }, { json });
      return EXIT.REFUSED;
    }
    const { data, dataHash } = sdk.encodeLaunch(prepared.params);
    writeReceipt(workspace, {
      phase: "PREPARE", chainId, policyHash: ctx.policyHash,
      body: {
        prepareHash: prepared.prepareHash, factory: prepared.factory, dataHash, calldataBytes: (data.length - 2) / 2, launcher,
        hook: { address: mined.hookAddress, salt: mined.salt, attempts: mined.attempts, flags: mined.flags, deployer: mined.deployer },
        // THE ELECTION IS RECEIPTED, WITH ITS EVIDENCE. Everything downstream — simulate, build, the
        // signer's approval — compares against this rather than re-deriving it from a config file
        // the agent can edit between phases.
        artSelector: { runtime: artSource.runtime, runtimeTag, artRuntimeId: elected.artRuntimeId, templateId: String(artSource.templateId), selector: prepared.params.artTemplateId.toString(), election: electionRecord(elected) },
        params: sdk.launchParamsAsTuple(prepared.params),
      },
    });
    emit(name, {
      success: true,
      result: {
        chainId, prepareHash: prepared.prepareHash, dataHash, calldataBytes: (data.length - 2) / 2, launcher,
        hookAddress: mined.hookAddress, hookSaltAttempts: mined.attempts, hookFlags: mined.flags,
        artSelector: { runtimeTag, artRuntimeId: elected.artRuntimeId, templateId: String(artSource.templateId), selector: `0x${prepared.params.artTemplateId.toString(16).padStart(64, "0")}` },
      },
      warnings: reviewGap ? [reviewGap] : [],
      nextActions: ["READY_FOR_SIMULATION"],
    }, { json });
    return EXIT.OK;
  } catch (err) {
    emit(name, { success: false, errors: [err instanceof Error ? err.message : String(err)], nextActions: ["FIX_VALIDATION"] }, { json });
    return EXIT.REFUSED;
  }
}

/**
 * The warning above, or null when the review loop already binds this workspace.
 *
 * IT ASKS THE REVIEW PACKAGE WHICH RUNTIMES IT CAN DRAW rather than carrying a list: a runtime the
 * loop cannot render is one it has no opinion about, and hard-coding names here would go stale the
 * moment a third engine ships.
 */
async function unreviewedWave1Warning(workspace, runtime) {
  try {
    const { artReviewApplies } = await import("./agent-art.js");
    if (artReviewApplies(workspace).applies) return null;
    const { RUNTIMES: REVIEWABLE } = await import("../../../art-review/src/runtimes.js");
    const { ART_RUNTIME_IDS } = await import("../schema.js");
    const id = ART_RUNTIME_IDS[runtime] ?? runtime;
    if (!REVIEWABLE[id]) return null;
    return (
      `NO VISUAL REVIEW APPLIES TO THIS WORKSPACE. ${id} is a runtime the review loop can draw, and this project reached prepare with no art.json and no template-selection receipt, ` +
      "so `artReviewApplies` stands aside and nobody has looked at the pictures. The art binding is one-shot: a launch commits this configuration permanently. " +
      "Run `npm run kit -- agent art-review --workspace <dir> --chain <id>` and have a reviewer that is not the author judge the images before signing."
    );
  } catch {
    // A warning that cannot be computed is not a warning that does not apply — but it is also not a
    // reason to refuse a launch, so it is dropped rather than turned into a false all-clear.
    return null;
  }
}

/** The readings a resolution rests on, carried into the receipt so a later reader can check them. */
function electionRecord(resolved) {
  return {
    state: resolved.state, registry: resolved.registry, tagHash: resolved.tagHash,
    runtimeAddress: resolved.runtimeAddress, runtimeCodeBytes: resolved.runtimeCodeBytes,
    artRuntimeMode: resolved.artRuntimeMode, artRuntimeVersion: resolved.artRuntimeVersion,
    active: resolved.active, exists: resolved.exists, registeredIds: resolved.registeredIds,
    declaredCount: resolved.declaredCount, complete: resolved.complete, logSource: resolved.logSource,
    blockNumber: resolved.blockNumber,
  };
}

/**
 * WHERE THE ART COMES FROM: THE EXPORTED BUNDLE WHEN THERE IS ONE.
 *
 * `relics.config.json` is what a creator edits; `project.relics` is what they validated, exported
 * and would upload, and its `artBinding` was DERIVED from their files and then re-checked against
 * the container by the validator. Preferring it is not a convenience — this step used to default
 * `artConfig` to `"0x41435631"`, four bytes that are the ACV1 magic and nothing else, so a run that
 * did not carry the configuration across prepared a launch whose art was a stub.
 *
 * A WAVE-1 PROJECT WITHOUT A BUNDLE IS REFUSED RATHER THAN GUESSED. Its configuration bytes are
 * produced by that engine's own codec from `generator/params.json`; there is nothing in
 * `relics.config.json` to encode, and a default here would bind a stub to a creator's name forever.
 *
 * TWO SOURCES THAT MUST AGREE IS TWO SOURCES THAT CAN DISAGREE, so a bundle exported for one
 * runtime beside a config declaring another is a refusal rather than a precedence rule.
 */
async function artSourceFor(workspace, cfg) {
  const declared = cfg.art?.runtime ?? null;
  const bundlePath = join(workspace, "project.relics");
  let fromBundle = null;
  if (existsSync(bundlePath)) {
    try {
      const { readContainer } = await import("../schema.js");
      const container = readContainer(new Uint8Array(readFileSync(bundlePath)));
      const manifest = JSON.parse(new TextDecoder().decode(container.byPath.get("relics.project.json")));
      const binding = manifest.artBinding ?? {};
      if (typeof binding.artConfig === "string" && binding.artConfig.length > 0) {
        fromBundle = {
          runtime: binding.runtime,
          templateId: String(binding.templateId ?? manifest.art?.templateId ?? "1"),
          artConfig: `0x${binding.artConfig}`,
          source: "project.relics",
        };
      }
    } catch (err) {
      // A BUNDLE THAT WILL NOT OPEN IS NOT AN ABSENT ONE. Falling through to the config file would
      // silently launch from a different art configuration than the one on disk.
      return { error: `project.relics is present in ${workspace} but could not be read: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (fromBundle) {
    if (declared && declared !== fromBundle.runtime) {
      return {
        error:
          `relics.config.json declares the ${declared} runtime and project.relics was exported for ${fromBundle.runtime}. ` +
          "One project cannot launch two runtimes; re-export the bundle from the current configuration.",
      };
    }
    return fromBundle;
  }

  if (!declared) return { error: "relics.config.json declares no art.runtime, so this launch cannot say which runtime renders it" };
  if (declared !== "SOLIDITY_SVG" && declared !== "JAVASCRIPT") {
    return {
      error:
        `the ${declared} runtime's configuration bytes are produced by that engine's own codec from generator/params.json, and there is no exported project.relics in ${workspace} to read them from. ` +
        "Run `relics export` first: a launch cannot invent a creator's art configuration.",
    };
  }
  if (typeof cfg.art?.configHex !== "string" || !/^0x[0-9a-fA-F]+$/.test(cfg.art.configHex) || cfg.art.configHex.length <= 2) {
    return { error: "relics.config.json carries no art.configHex and no exported project.relics was found, so there is no art configuration to launch" };
  }
  return { runtime: declared, templateId: String(cfg.art?.templateId ?? "1"), artConfig: cfg.art.configHex, source: "relics.config.json" };
}

const ZERO32 = `0x${"00".repeat(32)}`;

/**
 * `relics.config.json` -> the canonical `CreatorInput`.
 *
 * DERIVED FIELDS ARE DERIVED, NEVER GUESSED SEPARATELY. `totalSupply` is whole tokens and the
 * builder multiplies by 1e18; `artScriptHash` is keccak of the art config and the builder computes
 * it; `metadataUriHash` comes from the URI. Anywhere two values must agree, only one is an input.
 */
function creatorInputFromConfig(cfg, metadataUri, policy, sdk, artSelector) {
  const project = cfg.project ?? {};
  const market = cfg.market ?? {};
  const supply = cfg.supply ?? {};
  const election = market.antiSnipeMode;
  if (election !== "NONE" && election !== "PROTECTED_98_MINUTES") {
    throw new Error(`market.antiSnipeMode must be NONE or PROTECTED_98_MINUTES; got ${JSON.stringify(election)}. There is no election a creator means by silence — the on-chain zero is UNSPECIFIED and the factory refuses it, deliberately, so a launch that forgot cannot be mistaken for one that chose no protection.`);
  }
  if (!policy.allowedAntiSnipeModes.includes(election)) {
    throw new Error(`the project elects ${election} but the policy allows only ${policy.allowedAntiSnipeModes.join(", ")}`);
  }
  return {
    name: project.name, symbol: project.symbol,
    totalSupplyWhole: BigInt(supply.totalTokens ?? 1_000_000),
    artworkBackingUnits: BigInt(supply.artworks ?? 10_000),
    backingUnitsPerArtwork: supply.tokensPerArtwork !== undefined ? BigInt(supply.tokensPerArtwork) : undefined,
    startingPreset: sdk.StartingPreset?.[market.startingPreset ?? "MID"] ?? 1,
    creatorRecipient: policy.creatorRecipient,
    antiSnipeMode: election === "NONE" ? sdk.AntiSnipeMode.NONE : sdk.AntiSnipeMode.PROTECTED_98_MINUTES,
    metadataUri,
    art: {
      mode: sdk.ArtMode.SOLIDITY_SVG,
      // THE PACKED SELECTOR, THROUGH THE ONE PUBLIC ENCODER. `encodeArtSelector` lives in
      // `@relics/project-schema` and is checked against the deployed `ArtSelectorLib`'s own corpus;
      // `ART_SELECTOR_PUBLIC_IMPLEMENTATION_COUNT=1` is gate-enforced, so nothing here open-codes
      // `<< 224n`. The runtime half comes from a live registry read on the SELECTED chain and the
      // template half from the project — the two are composed once, here.
      artTemplateId: encodeArtSelector(artSelector.artRuntimeId, artSelector.artSource.templateId),
      artConfig: artSelector.artSource.artConfig,
    },
  };
}

/** Ask the DEPLOYED factory where this launch's contracts will land. */
export async function cmdPredict(name, workspace, flags, json, ctx) {
  if (!(await requireArtGate(name, workspace, json, ctx))) return EXIT.BLOCKED;
  const sdk = await import("@relics/launch-sdk");
  const { writeReceipt } = await import("@relics/agent-flow");
  const prep = await requirePhase(workspace, "PREPARE", "nothing has been prepared", name, json);
  if (!prep) return EXIT.BLOCKED;
  const pre = await phaseBody(workspace, "PREFLIGHT");
  const chainId = pre.selected.chainId;
  const profile = sdk.getChainProfile(chainId);
  const made = sdk.makeClient(profile);
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${chainId}`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }

  const launcher = flags.signer ?? process.env.RELICS_SIGNER_ADDRESS;
  if (!launcher) {
    // PREDICTION IS NAMESPACED BY THE SENDER (finding M-01). A prediction made for the wrong
    // launcher is not a rounding error — it is a different address space entirely, and a salt mined
    // for one sender reverts for another. There is no default that could be right here.
    emit(name, { success: false, errors: ["predict needs the LAUNCHER address (the wallet that will send the transaction). It is namespaced into every predicted address, so there is no sensible default: a prediction for the wrong sender describes a launch nobody will make."] }, { json });
    return EXIT.BLOCKED;
  }

  try {
    const params = revive(prep.params);
    const p = await sdk.predict(made.client, profile.contracts.launchpadFactory, params, launcher);
    writeReceipt(workspace, { phase: "PREDICT", chainId, launchPlanHash: prep.prepareHash, addresses: { projectToken: p.projectToken, projectCollection: p.projectCollection, artHook: p.artHook }, body: { ...p, launcher } });
    emit(name, { success: true, result: { ...p, launcher, chainId }, nextActions: ["READY_FOR_SIMULATION"] }, { json });
    return EXIT.OK;
  } catch (err) {
    emit(name, { success: false, errors: [err instanceof Error ? err.message : String(err)] }, { json });
    return EXIT.REFUSED;
  }
}

/** Reconstruct the bigint-typed params a receipt stored as strings. */
function revive(tuple) {
  const BIGINTS = new Set(["totalSupply", "artworkBackingUnits", "artTemplateId", "creatorEarnings", "backingUnitsPerArtwork"]);
  const out = {};
  for (const [k, v] of Object.entries(tuple)) out[k] = BIGINTS.has(k) ? BigInt(v) : v;
  return out;
}

/** A real eth_call dry-run of the EXACT transaction that will be signed. */
export async function cmdSimulate(name, workspace, flags, json, ctx) {
  if (!(await requireArtGate(name, workspace, json, ctx))) return EXIT.BLOCKED;
  const sdk = await import("@relics/launch-sdk");
  const { writeReceipt } = await import("@relics/agent-flow");
  const prep = await requirePhase(workspace, "PREPARE", "nothing has been prepared", name, json);
  if (!prep) return EXIT.BLOCKED;
  const pre = await phaseBody(workspace, "PREFLIGHT");
  const chainId = pre.selected.chainId;
  const profile = sdk.getChainProfile(chainId);
  const made = sdk.makeClient(profile);
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${chainId}`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }
  const from = flags.signer ?? process.env.RELICS_SIGNER_ADDRESS;
  if (!from) { emit(name, { success: false, errors: ["simulate needs the sending address; a simulation from a different account is a simulation of a different transaction"] }, { json }); return EXIT.BLOCKED; }

  const params = revive(prep.params);
  const { data } = sdk.encodeLaunch(params);
  const sim = await sdk.simulate(made.client, { from, to: profile.contracts.launchpadFactory, value: 0n, data, params });

  writeReceipt(workspace, { phase: "SIMULATE", chainId, launchPlanHash: prep.prepareHash, body: { ok: sim.ok, blockNumber: String(sim.blockNumber), from, to: sim.to, value: "0", dataHash: sim.dataHash, gasEstimate: sim.gasEstimate === null ? null : String(sim.gasEstimate), revert: sim.revert } });

  if (!sim.ok) {
    // A FAILED SIMULATION ENDS THE RUN. There is no override in autonomous mode: the only thing
    // that could follow is signing a transaction already known to revert.
    emit(name, { success: false, result: { chainId, blockNumber: String(sim.blockNumber), dataHash: sim.dataHash, revert: sim.revert }, errors: [`simulation reverted: ${sim.revert}. SIGNING_ALLOWED=NO, BROADCAST_ALLOWED=NO.`], nextActions: ["BLOCKED"] }, { json });
    return EXIT.REFUSED;
  }
  emit(name, { success: true, result: { chainId, blockNumber: String(sim.blockNumber), dataHash: sim.dataHash, gasEstimate: sim.gasEstimate === null ? null : String(sim.gasEstimate), predictedResult: sim.predictedResult }, nextActions: ["READY_FOR_BUILD"] }, { json });
  return EXIT.OK;
}

/** Freeze the transaction into an immutable signing request. */
export async function cmdBuild(name, workspace, flags, json, ctx) {
  if (!(await requireArtGate(name, workspace, json, ctx))) return EXIT.BLOCKED;
  const sdk = await import("@relics/launch-sdk");
  const { writeReceipt } = await import("@relics/agent-flow");
  const sim = await requirePhase(workspace, "SIMULATE", "nothing has been simulated", name, json);
  if (!sim) return EXIT.BLOCKED;
  if (!sim.ok) { emit(name, { success: false, errors: ["the last simulation reverted; build refuses to freeze a transaction known to fail"] }, { json }); return EXIT.REFUSED; }
  const prep = await phaseBody(workspace, "PREPARE");
  const pre = await phaseBody(workspace, "PREFLIGHT");
  const chainId = pre.selected.chainId;
  const profile = sdk.getChainProfile(chainId);

  const params = revive(prep.params);
  const { data } = sdk.encodeLaunch(params);
  const bundleHash = bundleHashOf(workspace);
  const gas = sim.gasEstimate ? BigInt(sim.gasEstimate) : ctx.policy.maxTransactionGas;

  const built = sdk.build({
    chainId, from: sim.from, to: profile.contracts.launchpadFactory, value: 0n, data,
    estimatedGas: gas, launchPlanHash: prep.prepareHash, bundleHash, policyHash: ctx.policyHash,
  });

  // THE BYTES MUST BE THE BYTES THAT WERE SIMULATED. Anything else is simulating one calldata and
  // signing another, which is the failure the dataHash exists to make impossible to do quietly.
  if (built.request.dataHash !== sim.dataHash) {
    emit(name, { success: false, errors: [`the built calldata (${built.request.dataHash}) is not what was simulated (${sim.dataHash}). Something changed between the two; re-simulate.`] }, { json });
    return EXIT.REFUSED;
  }

  writeReceipt(workspace, { phase: "BUILD", chainId, launchPlanHash: prep.prepareHash, policyHash: ctx.policyHash, body: { buildHash: built.buildHash, request: { ...built.request, value: "0", estimatedGas: String(built.request.estimatedGas) } } });
  emit(name, { success: true, result: { buildHash: built.buildHash, chainId, to: built.request.to, selector: built.request.selector, dataHash: built.request.dataHash, estimatedGas: String(built.request.estimatedGas), calldataBytes: (data.length - 2) / 2 }, nextActions: ["READY_FOR_BROADCAST"] }, { json });
  return EXIT.OK;
}

/**
 * The exported bundle's sha256, or the zero digest when there is none.
 *
 * `createHash` IS IMPORTED AT THE TOP OF THIS MODULE, not `require`d here. This function used to
 * call `require("node:crypto")` inside an ES module, where `require` is not defined — so
 * `relics agent build` threw "require is not defined" for EVERY project that had actually exported
 * a bundle, and worked only for the ones that had not. The zero-digest branch is the one that ran.
 */
function bundleHashOf(workspace) {
  const p = join(workspace, "project.relics");
  if (!existsSync(p)) return `0x${"00".repeat(32)}`;
  return `0x${createHash("sha256").update(readFileSync(p)).digest("hex")}`;
}

/** Recompute policy against the FINAL calldata — never against the earlier plan. */
export async function cmdPolicyCheck(name, workspace, flags, json, ctx) {
  if (!(await requireArtGate(name, workspace, json, ctx))) return EXIT.BLOCKED;
  const sdk = await import("@relics/launch-sdk");
  const { writeReceipt } = await import("@relics/agent-flow");
  const build = await requirePhase(workspace, "BUILD", "nothing has been built", name, json);
  if (!build) return EXIT.BLOCKED;
  const pre = await phaseBody(workspace, "PREFLIGHT");
  const chainId = pre.selected.chainId;

  const quote = pre.selectedQuote ?? null;
  const check = sdk.reconstructAndCheck({ data: build.request.data, policy: ctx.policy, quote });

  writeReceipt(workspace, { phase: "POLICY_CHECK", chainId, policyHash: ctx.policyHash, body: { ok: check.ok, economics: check.economics, problems: check.problems } });
  if (!check.ok) {
    emit(name, { success: false, result: { economics: check.economics, problems: check.problems }, errors: check.problems.map((p) => `${p.code}: ${p.detail}`), nextActions: ["BLOCKED"] }, { json });
    return EXIT.POLICY;
  }
  emit(name, { success: true, result: { verdict: "POLICY_APPROVED", economics: check.economics }, warnings: check.warnings, nextActions: ["READY_FOR_BROADCAST"] }, { json });
  return EXIT.OK;
}

/**
 * Sign through the scoped signer and send.
 *
 * THE POLICY IS THE AUTHORIZATION AND IT WAS GIVEN BEFORE THE RUN STARTED. There is no final
 * interactive confirmation here, deliberately: asking again is exactly what `relics.agent.json`
 * replaces, and a prompt at this step would make an autonomous run interactive at the one moment it
 * exists to automate. What protects the creator is the policy's ceilings and the signer's own
 * independent re-checks, not a yes/no nobody is awake to answer.
 */
export async function cmdBroadcast(name, workspace, flags, json, ctx) {
  if (!(await requireArtGate(name, workspace, json, ctx))) return EXIT.BLOCKED;
  const sdk = await import("@relics/launch-sdk");
  const flow = await import("@relics/agent-flow");
  const build = await requirePhase(workspace, "BUILD", "nothing has been built", name, json);
  if (!build) return EXIT.BLOCKED;
  const approved = await requirePhase(workspace, "POLICY_CHECK", "policy has not been recomputed against the final calldata", name, json);
  if (!approved) return EXIT.BLOCKED;
  if (!approved.ok) { emit(name, { success: false, errors: ["the policy check refused this transaction"] }, { json }); return EXIT.POLICY; }

  if (!ctx.policy.allowBroadcast) {
    emit(name, { success: false, result: { signingRequest: build.request }, errors: ["policy.allowBroadcast is false. The run stops at BUILT by design; the signing request above is ready for manual signing."], nextActions: ["COMPLETE"] }, { json });
    return EXIT.POLICY;
  }

  const pre = await phaseBody(workspace, "PREFLIGHT");
  const chainId = pre.selected.chainId;
  const profile = sdk.getChainProfile(chainId);
  const made = sdk.makeClient(profile);
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${chainId}`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }

  // ---- BEFORE ANYTHING LEAVES: has this launch already happened? ------------------------------
  const existing = flow.readIntent(workspace);
  if (existing) {
    const decision = await flow.decideResend(made.client, existing, { factoryAbi: sdk.FACTORY_ABI() });
    if (decision.verdict !== "SAFE_TO_SEND") {
      emit(name, {
        success: decision.verdict === "ALREADY_LAUNCHED",
        result: { verdict: decision.verdict, txHash: decision.txHash, evidence: decision.evidence },
        errors: decision.verdict === "UNKNOWN_DO_NOT_SEND" ? [decision.detail] : [],
        warnings: decision.verdict === "ALREADY_LAUNCHED" ? [decision.detail] : [],
        nextActions: [decision.verdict === "ALREADY_LAUNCHED" ? "WAIT_CONFIRMATION" : "BLOCKED"],
      }, { json });
      return decision.verdict === "ALREADY_LAUNCHED" ? EXIT.OK : EXIT.BLOCKED;
    }
    // SAFE_TO_SEND, and the CHAIN is what said so. Settle the old intent with that answer before a
    // new one is opened: `writeIntent` refuses to overwrite an unresolved intent, because a silent
    // overwrite is how a recorded tx hash gets erased by the next attempt.
    flow.resolveIntent(workspace, "PROVEN_NOT_SENT", decision.detail);
  }

  const signerUrl = process.env.RELICS_SIGNER_URL;
  if (!signerUrl) { emit(name, { success: false, errors: [explainCode("SIGNER_NOT_CONFIGURED", "no RELICS_SIGNER_URL. The agent never holds a key; it hands the SigningRequest to a process that does.")] }, { json }); return EXIT.BLOCKED; }

  const { createLocalSidecarSigner } = await import("@relics/signer-protocol").catch(() => ({}));
  if (!createLocalSidecarSigner) { emit(name, { success: false, errors: ["the signer protocol package could not be loaded"] }, { json }); return EXIT.BLOCKED; }

  const request = { ...build.request, value: 0n, estimatedGas: BigInt(build.request.estimatedGas) };
  const signer = createLocalSidecarSigner({ url: signerUrl });
  const signerAddress = await signer.getAddress();

  // ---- WRITE INTENT BEFORE THE BYTES LEAVE ------------------------------------------------------
  const predict = await phaseBody(workspace, "PREDICT");
  const nonce = await made.client.getTransactionCount({ address: signerAddress });
  let totalLaunches = null;
  try { totalLaunches = String(await made.client.readContract({ address: profile.contracts.launchpadFactory, abi: sdk.FACTORY_ABI(), functionName: "totalLaunches" })); } catch { /* corroboration only */ }
  try {
    flow.writeIntent(workspace, {
      launchPlanHash: build.request.launchPlanHash, buildHash: build.buildHash, dataHash: build.request.dataHash,
      chainId, factory: profile.contracts.launchpadFactory, signer: signerAddress, nonceAtIntent: nonce,
      predicted: { projectToken: predict.projectToken, projectCollection: predict.projectCollection, artHook: predict.artHook, poolId: predict.poolId },
      totalLaunchesAtIntent: totalLaunches,
    });
  } catch (err) {
    // AN OPEN INTENT IS A REASON TO STOP, NOT A FILE TO REPLACE. Reaching here means a send may
    // already have left this workspace and nothing has established what happened to it.
    emit(name, { success: false, errors: [`${err instanceof Error ? err.message : String(err)}`], nextActions: ["BLOCKED"] }, { json });
    return EXIT.BLOCKED;
  }

  try {
    const result = await signer.sign(request);
    let txHash;
    if (result.kind === "BROADCAST") txHash = result.txHash;
    else txHash = await made.client.sendRawTransaction({ serializedTransaction: result.rawTransaction });
    flow.recordIntentTxHash(workspace, txHash);
    flow.writeReceipt(workspace, { phase: "BROADCAST", chainId, launchPlanHash: build.request.launchPlanHash, body: { txHash, signer: signerAddress, dataHash: build.request.dataHash, nonceAtIntent: nonce } });
    emit(name, { success: true, result: { txHash, chainId, signer: signerAddress, explorer: `${profile.explorer}/tx/${txHash}` }, warnings: ["A TRANSACTION HASH IS NOT A LAUNCH. Wait for a receipt with status 1 at the configured depth."], nextActions: ["WAIT_CONFIRMATION"] }, { json });
    return EXIT.OK;
  } catch (err) {
    const refusal = err && typeof err === "object" && "refusal" in err ? err.refusal : null;
    if (refusal) {
      // THE CODE STAYS, AND SO DOES THE ADVICE. A refusal reaches a person at the moment their
      // launch stopped and reaches an agent at the moment it is deciding what to try next; a bare
      // code answers neither, and the most available guess for "the signer will not sign" is to
      // offer a key. The remedy names the owner instead.
      emit(name, { success: false, result: { refusal }, errors: [`the signer REFUSED — ${explainCode(refusal.code, refusal.detail)}`], nextActions: ["BLOCKED"] }, { json });
      return EXIT.SIGNER_REFUSED;
    }
    // The intent is on disk and a send MAY have left. Never retry here.
    emit(name, { success: false, errors: [`${err instanceof Error ? err.message : String(err)}. A broadcast intent is on disk: run \`relics agent resume\`, which asks the CHAIN whether this launch already left before considering another send.`], nextActions: ["BLOCKED"] }, { json });
    return EXIT.BLOCKED;
  }
}

/** Wait for the configured confirmations. A hash is not a receipt. */
export async function cmdConfirm(name, workspace, flags, json, ctx) {
  const sdk = await import("@relics/launch-sdk");
  const flow = await import("@relics/agent-flow");
  const bc = await requirePhase(workspace, "BROADCAST", "nothing has been broadcast", name, json);
  if (!bc) return EXIT.BLOCKED;
  const pre = await phaseBody(workspace, "PREFLIGHT");
  const chainId = pre.selected.chainId;
  const made = sdk.makeClient(sdk.getChainProfile(chainId));
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${chainId}`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }

  const res = await sdk.waitForConfirmation(made.client, bc.txHash, ctx.policy.requiredConfirmations, { timeoutMs: Number(flags.timeout ?? 600_000) });
  flow.writeReceipt(workspace, { phase: "CONFIRM", chainId, body: { ...res, blockNumber: res.blockNumber === null ? null : String(res.blockNumber), gasUsed: res.gasUsed === null ? null : String(res.gasUsed) } });

  const ok = res.state === "CONFIRMED";
  emit(name, {
    success: ok,
    result: { state: res.state, txHash: res.txHash, blockNumber: res.blockNumber === null ? null : String(res.blockNumber), confirmations: res.confirmations, status: res.status, detail: res.detail },
    errors: res.state === "REVERTED" ? ["the transaction was mined and REVERTED. It has a hash and it is not a launch."] : [],
    nextActions: [ok ? "VERIFY" : res.state === "PENDING" ? "WAIT_CONFIRMATION" : "BLOCKED"],
  }, { json });
  return ok ? EXIT.OK : res.state === "PENDING" ? EXIT.UNKNOWN_CHAIN_STATE : EXIT.REFUSED;
}

/** Read the launched project back off the chain and compare with the prediction. */
export async function cmdVerify(name, workspace, flags, json, ctx) {
  const sdk = await import("@relics/launch-sdk");
  const flow = await import("@relics/agent-flow");
  const conf = await requirePhase(workspace, "CONFIRM", "nothing has been confirmed", name, json);
  if (!conf) return EXIT.BLOCKED;
  if (conf.state !== "CONFIRMED") { emit(name, { success: false, errors: [`the transaction is ${conf.state}, not CONFIRMED`] }, { json }); return EXIT.REFUSED; }

  const pre = await phaseBody(workspace, "PREFLIGHT");
  const predict = await phaseBody(workspace, "PREDICT");
  const meta = await phaseBody(workspace, "METADATA");
  const build = await phaseBody(workspace, "BUILD");
  const chainId = pre.selected.chainId;
  const profile = sdk.getChainProfile(chainId);
  const made = sdk.makeClient(profile);
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${chainId}`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }

  const economics = sdk.reconstructAndCheck({ data: build.request.data, policy: ctx.policy, quote: null }).economics;
  const v = await sdk.verifyLaunch(made.client, {
    txHash: conf.txHash, factory: profile.contracts.launchpadFactory,
    predicted: { projectToken: predict.projectToken, projectCollection: predict.projectCollection, artHook: predict.artHook, poolId: predict.poolId },
    expected: { creatorRecipient: ctx.policy.creatorRecipient, antiSnipeMode: economics.antiSnipeMode, metadataUriHash: economics.metadataUriHash, metadataUri: meta?.uri },
  });

  flow.writeReceipt(workspace, { phase: "VERIFY", chainId, addresses: Object.fromEntries(Object.entries(v.observed).filter(([, x]) => typeof x === "string")), body: { verified: v.verified, predictionMatch: v.predictionMatch, findings: v.findings, observed: { ...v.observed, projectId: v.observed.projectId === null ? null : String(v.observed.projectId) } } });

  const links = sdk.explorerLinks(profile.explorer, { txHash: conf.txHash, token: v.observed.projectToken, collection: v.observed.projectCollection });

  // ---- THE TOKEN'S OWN METADATA, READ AND REPORTED ---------------------------------------------
  // A launch can verify perfectly and still leave the ERC-20 unnamed on every DEX, because the
  // collection's contractURI is birth data and the TOKEN's is not. Reporting COMPLETE without
  // saying so would be true about the launch and misleading about the project. This does NOT block
  // completion — the launch really did succeed — it is surfaced as the creator-owned step it is.
  let tokenMetadata = { state: "UNKNOWN", detail: "not read" };
  if (v.observed.projectToken) {
    tokenMetadata = await sdk.readTokenMetadataState(made.client, v.observed.projectToken, sdk.PROJECT_TOKEN_ABI());
  }

  const ok = v.verified === "PROVEN";
  if (ok) {
    writeFileSync(join(workspace, "launch-result.json"), `${JSON.stringify({
      status: "COMPLETE", chainId, txHash: conf.txHash, blockNumber: conf.blockNumber,
      projectId: v.observed.projectId === null ? null : String(v.observed.projectId),
      token: v.observed.projectToken, collection: v.observed.projectCollection, artHook: v.observed.artHook, pool: v.observed.poolId,
      runtime: "SOLIDITY_SVG_V1", quote: pre.selectedQuote ?? null,
      tokenMetadata: {
        state: tokenMetadata.state,
        contractURI: tokenMetadata.contractURI ?? null,
        detail: tokenMetadata.detail,
        // Named as an owner so an agent does not go round the loop trying to fix it itself.
        owner: tokenMetadata.state === "PUBLISHED" ? null : "CREATOR_ACTION_REQUIRED",
        command: tokenMetadata.state === "PUBLISHED" ? null : "npm run kit -- agent token-metadata --workspace <dir> --json",
      },
      bundleHash: build.request.bundleHash, metadataUri: meta?.uri ?? null, metadataHash: economics.metadataUriHash,
      launchPlanHash: build.request.launchPlanHash, policyHash: build.request.policyHash,
      verification: { predictionMatch: v.predictionMatch, runtimeMatch: true, metadataMatch: v.findings.some((f) => f.id === "collection.contractURI" && f.evidence === "PROVEN"), economicsMatch: true },
      links,
    }, bigintSafe, 2)}\n`);
  }
  emit(name, {
    success: ok,
    result: { verified: v.verified, predictionMatch: v.predictionMatch, tokenMetadata, observed: { ...v.observed, projectId: v.observed.projectId === null ? null : String(v.observed.projectId) }, findings: v.findings, links, resultFile: ok ? "launch-result.json" : null },
    errors: v.findings.filter((f) => f.evidence === "REFUTED").map((f) => `${f.id}: ${f.detail}`),
    warnings: [
      ...v.findings.filter((f) => f.evidence === "UNKNOWN").map((f) => `${f.id}: ${f.detail}`),
      ...(tokenMetadata.state === "PUBLISHED"
        ? []
        : [`THE ERC-20's OWN METADATA IS NOT PUBLISHED: ${tokenMetadata.detail} The launch is complete and correct; this is a separate, creator-owned step, because both transactions require the ProjectRights owner. Run \`agent token-metadata\` to assemble the document and get the two transactions to sign.`]),
    ],
    nextActions: [ok ? "COMPLETE" : "BLOCKED"],
  }, { json });
  return ok ? EXIT.OK : EXIT.REFUSED;
}

/**
 * Reconcile local state against the chain and continue.
 *
 * NEVER TRUSTS A LOCAL RECEIPT ABOUT A CHAIN ACTION. If an intent exists, the chain is asked
 * whether the launch already left before anything else is considered.
 */
export async function cmdResume(name, workspace, flags, json, ctx) {
  const sdk = await import("@relics/launch-sdk");
  const flow = await import("@relics/agent-flow");
  const intent = flow.readIntent(workspace);
  const chainIntegrity = flow.verifyReceiptChain(workspace);
  if (!chainIntegrity.intact) {
    emit(name, { success: false, errors: [`the receipt chain is broken: ${chainIntegrity.detail}`], nextActions: ["BLOCKED"] }, { json });
    return EXIT.REFUSED;
  }
  if (!intent) {
    emit(name, { success: true, result: { intent: null, receipts: chainIntegrity.length, detail: "no broadcast has been attempted; the run resumes from local state alone" }, nextActions: ["READY_FOR_PREFLIGHT"] }, { json });
    return EXIT.OK;
  }
  const profile = sdk.getChainProfile(intent.chainId);
  const made = sdk.makeClient(profile);
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${intent.chainId}; a resume cannot decide anything about a launch it cannot ask about`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }
  const decision = await flow.decideResend(made.client, intent, { factoryAbi: sdk.FACTORY_ABI() });
  emit(name, {
    success: decision.verdict !== "UNKNOWN_DO_NOT_SEND",
    result: { verdict: decision.verdict, txHash: decision.txHash, evidence: decision.evidence, detail: decision.detail },
    errors: decision.verdict === "UNKNOWN_DO_NOT_SEND" ? [decision.detail] : [],
    nextActions: [decision.verdict === "ALREADY_LAUNCHED" ? "WAIT_CONFIRMATION" : decision.verdict === "SAFE_TO_SEND" ? "READY_FOR_BROADCAST" : "BLOCKED"],
  }, { json });
  return decision.verdict === "UNKNOWN_DO_NOT_SEND" ? EXIT.BLOCKED : EXIT.OK;
}

/**
 * `agent token-metadata` — the ERC-20's own metadata, which the launch does not write.
 *
 * WHY THIS IS A SEPARATE COMMAND AND NOT PART OF `run`. The collection's `contractURI` is BIRTH
 * data: it rides inside the launch transaction and is complete on receipt. The token's is not.
 * `ProjectTokenV1.initialize` takes no URI, and `contractURI()` resolves through a registry the
 * token must be bound to afterwards — by two transactions that BOTH require
 * `msg.sender == ProjectRights.ownerOf(projectId)`.
 *
 * The rights NFT goes to `creatorRecipient`, which the wallet model says is a COLD wallet. So the
 * launch signer structurally cannot send them, and widening it to cover two more selectors would
 * trade the property that makes the whole model defensible for a convenience. This command does
 * everything up to that line and hands over the rest.
 *
 * Measured on the one real RC6 permissionless launch: `contractURI()` empty, `metadataRegistry`
 * zero. A token in that state shows up on a DEX as an unnamed address with a grey circle.
 */
export async function cmdTokenMetadata(name, workspace, flags, json, ctx) {
  const sdk = await import("@relics/launch-sdk");
  const { writeReceipt } = await import("@relics/agent-flow");

  const verified = await phaseBody(workspace, "VERIFY");
  const pre = await phaseBody(workspace, "PREFLIGHT");
  if (!verified || !pre) {
    emit(name, { success: false, errors: ["token metadata is a POST-LAUNCH step and needs a verified launch. Run `relics agent run` to completion first — there is no token address to describe until one exists, and a token-list entry with a placeholder address is worse than none: it is copyable, it looks correct, and lists get mirrored faster than they get corrected."], nextActions: ["BLOCKED"] }, { json });
    return EXIT.BLOCKED;
  }

  const chainId = pre.selected.chainId;
  const profile = sdk.getChainProfile(chainId);
  const token = verified.observed?.projectToken;
  const projectId = verified.observed?.projectId;
  if (!token || !projectId) {
    emit(name, { success: false, errors: ["the verification receipt carries no project token or project id, so there is nothing to describe"] }, { json });
    return EXIT.BLOCKED;
  }

  const cfgPath = join(workspace, "relics.config.json");
  const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
  const meta = (await phaseBody(workspace, "METADATA")) ?? {};

  // ---- 1. read what the chain says RIGHT NOW ---------------------------------------------------
  const made = sdk.makeClient(profile);
  if (!made) { emit(name, { success: false, errors: [`no RPC endpoint for chain ${chainId}`] }, { json }); return EXIT.UNKNOWN_CHAIN_STATE; }
  const state = await sdk.readTokenMetadataState(made.client, token, sdk.PROJECT_TOKEN_ABI());

  // ---- 2. assemble and pin the ERC-1046 document -------------------------------------------------
  let published = null;
  const providerAvailable = Boolean(process.env.PINATA_JWT) || Boolean(flags["dry-run"]);
  if (providerAvailable) {
    const doc = sdk.buildTokenMetadataDocument({
      name: cfg.project?.name ?? verified.observed?.name ?? "Project",
      symbol: cfg.project?.symbol ?? "TOKEN",
      description: cfg.project?.description ?? cfg.metadata?.description ?? "",
      // The collection's already-pinned image is reused deliberately: a second, different logo is a
      // second thing to keep in sync, and nothing about the token needs a different picture.
      image: cfg.metadata?.image ?? meta.imageUri ?? meta.uri,
      externalUrl: cfg.project?.website,
      chainId,
      totalSupplyWei: BigInt(cfg.supply?.totalTokens ?? 0) * 10n ** 18n,
      burnable: (cfg.token?.burnPolicy ?? "NONE") !== "NONE",
      socials: cfg.project?.x ? { x: cfg.project.x } : undefined,
    });
    const provider = flags["dry-run"] || !process.env.PINATA_JWT ? sdk.createMemoryProvider() : sdk.createPinataProvider();
    published = await sdk.pinTokenMetadata(doc, provider);
    published.tokenListEntry = sdk.buildTokenListEntry(doc, token, chainId);
  }

  // ---- 3. the two transactions only the rights owner can send -------------------------------------
  const registry = profile.contracts.projectMetadataRegistry ?? profile.contracts.metadataRegistry ?? null;
  const transactions = registry
    ? sdk.buildRightsOwnerMetadataTransactions({
        chainId, projectId: BigInt(projectId), projectToken: token, metadataRegistry: registry,
        rightsOwner: ctx.policy.creatorRecipient,
        website: cfg.project?.website ?? "", xLink: cfg.project?.x ?? "",
      })
    : [];

  const body = { chainId, token, projectId: String(projectId), onChainState: state, published, transactions, registry };
  writeReceipt(workspace, { phase: "TOKEN_METADATA", chainId, addresses: { projectToken: token }, body });

  emit(name, {
    success: true,
    result: body,
    warnings: [
      state.state === "PUBLISHED"
        ? "the token already reports a contractURI; nothing further is required"
        : `THE AGENT CANNOT COMPLETE THIS STEP. Both transactions require msg.sender == ProjectRights.ownerOf(${projectId}), which is ${ctx.policy.creatorRecipient} — the creator's own wallet, not the launch signer. That is deliberate: the ability to change a token's public identity forever stays with the creator.`,
      ...(registry ? [] : [`no metadata registry address is recorded for chain ${chainId}; the two transactions cannot be built`]),
      ...(providerAvailable ? [] : ["no metadata provider is configured, so the ERC-1046 document was assembled but not pinned"]),
    ],
    nextActions: ["CREATOR_ACTION_REQUIRED"],
  }, { json });
  return EXIT.OK;
}


/**
 * THE `contractURI` DOCUMENT, PROJECTED FROM THE BUNDLE'S OWN METADATA.
 *
 * TWO KEY SPELLINGS, AND NEITHER IS WRONG. A `.relics` bundle's `metadata/collection.json` is
 * camelCase and CLOSED — `bannerImage`, `featuredImage`, `externalLink` — because that is the
 * format's own vocabulary and its validator refuses anything else by name. The document a
 * collection's `contractURI()` must resolve to is OpenSea's, and OpenSea's keys are snake_case with
 * `banner_image`, `featured_image` and `external_link` all REQUIRED.
 *
 * So the two documents can never be the same bytes, and this command used to feed the first
 * straight into the pipeline that requires the second. It could not succeed for ANY project: the
 * pin was refused for three missing keys, the refusal was read as a success, and the crash that
 * followed named a `length` property rather than the fields. Projecting here is the fix, and it
 * belongs here rather than in a harness — the kit's own launch E2E works around this by assembling
 * a separate `contract-uri.json`, which is this projection written a second time.
 *
 * A DOCUMENT THAT ALREADY CARRIES THE CONTRACT KEYS IS PASSED THROUGH UNTOUCHED, so a creator who
 * maintains their own is never overridden.
 *
 * NOTHING IS INVENTED. An absent optional field becomes the empty string — which is what the
 * required-key check wants and what a marketplace reads as "not set" — never a plausible URL.
 */
export function contractUriDocument(collection) {
  const CONTRACT_KEYS = ["name", "symbol", "description", "image", "banner_image", "featured_image", "external_link", "collaborators"];
  if (CONTRACT_KEYS.every((k) => Object.hasOwn(collection ?? {}, k))) return collection;
  const str = (v) => (typeof v === "string" ? v : "");
  return {
    name: str(collection?.name),
    symbol: str(collection?.symbol),
    description: str(collection?.description),
    image: str(collection?.image),
    banner_image: str(collection?.bannerImage),
    featured_image: str(collection?.featuredImage),
    external_link: str(collection?.externalLink),
    collaborators: Array.isArray(collection?.collaborators) ? collection.collaborators : [],
  };
}
