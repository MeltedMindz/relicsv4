// SPDX-License-Identifier: MIT
// ================================================================================================
// `relics agent art-review` — the visual review loop's command surface.
//
// THE FIRST LEGAL CONFIGURATION IS NOT LAUNCH-READY ART, and until this command existed the
// autonomous path treated it as though it were: legal, deterministic, in budget, byte-distinct
// across market states, proceed. Every one of those is also true of a configuration that draws the
// wrong thing, and one did — a variant that read as industrial crates and scaffolding full of
// confetti for a brief asking for botanical work, through every gate, because nothing looked.
//
// IT IS RESUMABLE AND IT NEVER WAITS. The reviewer is a SEPARATE AGENT, so this command renders,
// writes a packet and returns `AWAITING_VISUAL_REVIEW`; something else judges and writes
// `verdict.json`; the next call picks it up. A command that blocked waiting for a judgement would
// be a command that had to be run by whoever also authored the work, which is precisely the
// arrangement this exists to break.
//
// EXIT CODES ARE THE CONTRACT. `OK` only when the art is ACCEPTED. Everything else — awaiting a
// reviewer, a revision requested, a refusal at the ceiling — is `BLOCKED`, because `agent run`
// stops on any non-zero and every one of those states means the run must not proceed to metadata.
// ================================================================================================
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** How many judgements a run may spend. Argued in `packages/art-review/src/loop.js`. */
export const DEFAULT_CEILING = 4;

/**
 * The review engine, loaded LAZILY.
 *
 * Not a top-level await, and not a static import. `npm run kit:offline` asserts that MODE A —
 * init, preview, validate, export, inspect — never loads viem and stays runnable on a machine with
 * no network. This module reaches viem (through the render path) and `sharp` (through the raster
 * path), so it must not be on any import chain a Mode A command walks.
 */
let engine = null;
async function artReview() {
  if (!engine) engine = await import("../../../art-review/src/index.js");
  return engine;
}

/**
 * Resolve the chain, the endpoint and the registry for a review.
 *
 * THE REGISTRY ADDRESS COMES FROM THE CHAIN PROFILE, never from the art-review package. That
 * package deliberately carries no address book so a constant in it cannot decide which contract
 * answers for a review — the same rule `packages/template-catalog` states about chain facts.
 */
async function resolveChain(chainId, flags) {
  const { getChainProfile, resolveRpc } = await import("@relics/launch-sdk");
  const profile = getChainProfile(chainId);
  if (!profile) return { ok: false, detail: `chain ${chainId} is not in the public record` };
  const registry = profile.contracts?.artRuntimeRegistry;
  if (!registry) return { ok: false, detail: `chain ${chainId} has no artRuntimeRegistry in the public record, so there is nothing to render through` };
  const rpc = resolveRpc(profile, flags.rpc);
  if (!rpc) return { ok: false, detail: `no RPC endpoint for chain ${chainId}: set ${profile.rpcEnvKey}` };
  // THE VALUE IS NEVER RETURNED IN ANYTHING PRINTABLE. `source` is what a reader needs.
  return { ok: true, profile, registry, rpcUrl: rpc.url, rpcSource: rpc.source, label: profile.label };
}

/**
 * Scaffold `art.json` from a template preset.
 *
 * A STARTING POINT AND NOT A CAGE. The preset is the published Wave-1 configuration for that
 * runtime; every value in it may move as far as the runtime's own validator allows, and nothing
 * downstream compares the finished configuration against the preset it began as. Selecting the
 * template constrains which runtime you start from and places no bound on where you go.
 */
export async function scaffoldArtDocument(workspace, runtimeId, templateId) {
  const AR = await artReview();
  const doc = {
    $comment: [
      "The creator art configuration, symbolic. The runtime's own encoder turns this into the exact",
      "bytes a launch commits to, and the deployed runtime validates them — this file is not the",
      "authority on what is legal and never guesses.",
      "This began as a template preset and is a STARTING POINT. Change anything the runtime accepts.",
    ],
    schemaVersion: 1,
    runtimeId,
    templateId: templateId ?? null,
    config: AR.presetConfig(runtimeId),
  };
  writeFileSync(join(workspace, "art.json"), `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/**
 * One step of the loop.
 *
 * `emit` and `EXIT` are passed in rather than imported, because this module is loaded dynamically
 * from the agent dispatcher and the envelope's scrub is the last gate before anything leaves the
 * process — there is exactly one of it and it lives there.
 */
export async function cmdArtReview(name, workspace, flags, json, { emit, EXIT }) {
  const AR = await artReview();
  const raster = AR.rasterAvailable();
  if (!raster.available) {
    emit(name, { success: false, errors: [raster.detail], nextActions: ["BLOCKED"] }, { json });
    return EXIT.BLOCKED;
  }

  if (flags.scaffold) {
    const runtimeId = String(flags.runtime ?? flags.scaffold);
    if (!existsSync(workspace)) mkdirSync(workspace, { recursive: true });
    try {
      const doc = await scaffoldArtDocument(workspace, runtimeId, flags.template ?? null);
      emit(name, { success: true, result: { wrote: join(workspace, "art.json"), runtimeId: doc.runtimeId, templateId: doc.templateId }, nextActions: ["WRITE_ART"] }, { json });
      return EXIT.OK;
    } catch (err) {
      emit(name, { success: false, errors: [err.message], nextActions: ["BLOCKED"] }, { json });
      return EXIT.USAGE;
    }
  }

  const art = AR.readArtDocument(workspace);
  if (!art.ok) {
    emit(name, {
      success: false,
      errors: [art.detail],
      nextActions: ["WRITE_ART"],
    }, { json });
    return EXIT.BLOCKED;
  }

  // THE CHAIN THE LAUNCH WILL USE, NOT A DEFAULT.
  //
  // `--chain` wins; otherwise the chain PREFLIGHT already selected, read out of its receipt. A
  // review conducted on a different chain's registry is a review of whatever runtime happens to sit
  // at that id there — and registry ids are per-chain, so "id 3" is not an identity. Falling back
  // to 1 when nothing has been selected is a starting point for a standalone review, and it is
  // recorded in the result so a reader can see which chain answered.
  let chainId = flags.chain !== undefined ? Number(flags.chain) : null;
  if (chainId === null) {
    const { latestReceipt } = await import("@relics/agent-flow");
    chainId = latestReceipt(workspace, "PREFLIGHT")?.chainId ?? 1;
  }
  const chain = await resolveChain(chainId, flags);
  if (!chain.ok) {
    emit(name, { success: false, errors: [chain.detail], nextActions: ["BLOCKED"] }, { json });
    return EXIT.UNKNOWN_CHAIN_STATE;
  }

  const resolved = await AR.resolveRuntime({ rpcUrl: chain.rpcUrl, registry: chain.registry, runtimeId: art.doc.runtimeId });
  if (!resolved.ok) {
    // AN UNREAD CHAIN IS `UNKNOWN`, NOT "THIS RUNTIME IS ABSENT". The exit code says which.
    emit(name, {
      success: false,
      result: { chainId, rpcSource: chain.rpcSource, state: resolved.state },
      errors: [resolved.detail],
      nextActions: ["BLOCKED"],
    }, { json });
    return resolved.state === "UNKNOWN" ? EXIT.UNKNOWN_CHAIN_STATE : EXIT.BLOCKED;
  }

  const renderer = AR.createRenderer({ rpcUrl: chain.rpcUrl, chainId, resolved, concurrency: Number(flags.concurrency ?? 8) });
  const ceiling = Number(flags.ceiling ?? DEFAULT_CEILING);

  const out = await AR.step({
    workspace,
    renderer,
    runtimeAddress: resolved.address,
    chainId,
    ceiling,
    templateId: flags.template ?? art.doc.templateId ?? null,
  });

  const result = {
    chainId,
    chainLabel: chain.label,
    rpcSource: chain.rpcSource,
    runtimeId: art.doc.runtimeId,
    runtimeAddress: resolved.address,
    registryId: resolved.registryId,
    configHash: art.configHash,
    configBytes: art.configBytes.length,
    iterationCeiling: ceiling,
    ...out,
  };

  const accepted = out.outcome === "ART_ACCEPTED";
  if (accepted) {
    // THE ACCEPTANCE JOINS THE HASH-LINKED CHAIN, not just `art-review.json`. Two records, and
    // they answer different questions: the receipt chain proves nothing was inserted or edited
    // after the fact, and `art-review.json` carries the verdict, the critique history and the
    // configuration digest that voids it. A run that had only the second one could have its whole
    // review history written after the launch it was supposed to gate.
    const { writeReceipt } = await import("@relics/agent-flow");
    writeReceipt(workspace, {
      phase: "ART_REVIEW",
      chainId,
      addresses: { artRuntime: resolved.address },
      body: {
        runtimeId: art.doc.runtimeId,
        templateId: result.templateId ?? art.doc.templateId ?? null,
        acceptedConfigHash: out.acceptedConfigHash,
        iterations: out.iterations,
        iterationCeiling: ceiling,
        reviewerId: out.reviewerId,
        receipt: out.receipt,
      },
    });
  }
  emit(name, {
    success: accepted,
    result,
    errors: accepted ? [] : [out.detail],
    warnings: chain.rpcSource === "PUBLIC_FALLBACK"
      ? ["reading through the public fallback endpoint; a review is ~150 chain calls and public endpoints rate-limit. A partial render is refused rather than reviewed, so set the chain's own RPC before a real run."]
      : [],
    nextActions: [
      accepted ? "READY_FOR_PREFLIGHT"
        : out.outcome === "AWAITING_VISUAL_REVIEW" ? "REVIEW_ART"
        : out.outcome === "ART_QUALITY_NOT_ACCEPTABLE" ? "BLOCKED"
        : "FIX_ART",
    ],
  }, { json });

  return accepted ? EXIT.OK : EXIT.BLOCKED;
}

/**
 * THE GATE. Every launch-proving command calls this FIRST and RETURNS on its answer.
 *
 * It is a separate export rather than a check inside `cmdArtReview` because the property that
 * matters is not "the review can be run" — it is "nothing downstream can run without it". The
 * command list it guards is DERIVED FROM THE FILESYSTEM by `scripts/check-art-review.mjs`, so a
 * launch-proving command added later and left unguarded fails the gate rather than being omitted
 * from a hand-maintained list nobody re-reads.
 *
 * THERE IS NO `--skip-art-review`. Not for an autonomous run, not for a hurry, not for a re-run of
 * work that was accepted yesterday against different bytes. A creator sitting at a terminal who
 * wants to launch art nobody reviewed can do it: they set `goal: "BUILD_ONLY"`, sign the built
 * transaction themselves, and own that decision. What is refused is an AGENT doing it on their
 * behalf, which is the case where nobody is looking by construction.
 */
export async function requireArtAccepted(workspace, { goal } = {}) {
  const applicability = artReviewApplies(workspace);
  if (!applicability.applies) {
    return { ok: true, applicable: false, reasonCode: "ART_REVIEW_NOT_APPLICABLE", detail: applicability.detail };
  }
  const AR = await artReview();
  const art = AR.readArtDocument(workspace);
  if (!art.ok && applicability.reason === "APPLIES_TEMPLATE_CHOSEN") {
    return {
      ok: false,
      applicable: true,
      reasonCode: "ART_REVIEW_REQUIRED_NO_ART_DOCUMENT",
      goal: goal ?? null,
      detail: applicability.detail,
      invalidatedBy: [],
      remedy: `npm run kit -- agent art-review --workspace <dir> --scaffold ${applicability.templateId?.split("/")[0] ?? "<runtime>"} --template ${applicability.templateId ?? "<template>"}`,
    };
  }
  const brief = join(workspace, "brief.md");
  const check = AR.verifyAcceptance(workspace, {
    configBytes: art.ok ? art.configBytes : undefined,
    briefText: existsSync(brief) ? readFileSync(brief, "utf8") : undefined,
    runtimeId: art.ok ? art.doc.runtimeId : undefined,
  });
  if (check.accepted) return { ok: true, applicable: true, record: check.record };
  return {
    ok: false,
    applicable: true,
    reasonCode: check.reasonCode,
    goal: goal ?? null,
    detail: check.detail,
    invalidatedBy: check.invalidatedBy,
    remedy: "npm run kit -- agent art-review --workspace <dir> --chain <id> --json",
  };
}

/**
 * Whether this workspace uses the review loop at all.
 *
 * THREE ANSWERS, NOT TWO, and collapsing them is how a guard becomes either a nuisance or a hole.
 *
 *   APPLIES_ART_DOCUMENT   `art.json` is here: the workspace declares a Wave-1 configuration and
 *                          the guard binds.
 *   APPLIES_TEMPLATE_CHOSEN a Wave-1 template was selected for this run and recorded in the
 *                          receipt chain, and `art.json` is absent. THIS IS THE HOLE THAT WOULD
 *                          OTHERWISE EXIST: applicability must not be decided by the presence of a
 *                          file the author can simply not create. A run that selected a Wave-1
 *                          template and then has nothing to review is REFUSED, not waved through.
 *   NOT_APPLICABLE         neither. The project is authored against something this loop cannot
 *                          draw — every pre-existing project is — and the guard stands aside and
 *                          says so, rather than passing silently.
 */
export function artReviewApplies(workspace) {
  if (existsSync(join(workspace, "art.json"))) {
    return { applies: true, reason: "APPLIES_ART_DOCUMENT", detail: "art.json declares a Wave-1 art configuration for this workspace" };
  }
  const selection = join(workspace, ".relics-agent", "receipts");
  if (existsSync(selection)) {
    for (const f of readdirSync(selection)) {
      if (!f.endsWith("-template-selected.json")) continue;
      try {
        const r = JSON.parse(readFileSync(join(selection, f), "utf8"));
        const id = r?.body?.templateId ?? null;
        if (typeof id === "string" && id.length > 0) {
          return {
            applies: true,
            reason: "APPLIES_TEMPLATE_CHOSEN",
            detail: `${id} was selected for this run and recorded in the receipt chain, but there is no art.json to review. A selected template with nothing to review is a refusal, not an exemption.`,
            templateId: id,
          };
        }
      } catch {
        // An unreadable receipt is not evidence that nothing was selected; fall through and let the
        // receipt-chain verifier report it as the broken link it is.
      }
    }
  }
  return { applies: false, reason: "NOT_APPLICABLE", detail: "the workspace declares no Wave-1 art configuration and selected no Wave-1 template, so there is nothing this loop can render" };
}

/**
 * The review's state, as the closed vocabulary `decideNextAction` branches on.
 *
 * READ FROM DISK, NEVER ASSUMED. `undefined` means the loop does not apply to this run — and it is
 * `undefined` rather than `"NOT_REVIEWED"` on purpose, because every project authored against
 * something this loop cannot draw would otherwise be told it had skipped a step it never had.
 * An UNREAD state is never quietly reported as an accepted one: the only path to `"ACCEPTED"` is a
 * receipt that verifies against the configuration bytes on disk right now.
 */
export async function artReviewState(workspace) {
  const applicability = artReviewApplies(workspace);
  if (!applicability.applies) return { state: undefined, critique: [] };
  const AR = await artReview();
  const art = AR.readArtDocument(workspace);
  if (!art.ok) return { state: "NOT_REVIEWED", critique: [], detail: art.detail };

  const brief = join(workspace, "brief.md");
  const check = AR.verifyAcceptance(workspace, {
    configBytes: art.configBytes,
    briefText: existsSync(brief) ? readFileSync(brief, "utf8") : undefined,
    runtimeId: art.doc.runtimeId,
  });
  if (check.accepted) return { state: "ACCEPTED", critique: [] };

  const rounds = AR.listRounds(workspace).map((n) => AR.readRound(workspace, n)).filter(Boolean);
  if (rounds.length === 0) return { state: "NOT_REVIEWED", critique: [] };
  const judged = rounds.filter((r) => r.verdict);
  const last = rounds[rounds.length - 1];
  if (judged.length >= DEFAULT_CEILING && last.verdict !== "SHIP") {
    return { state: "REFUSED", critique: last.critique ?? [] };
  }
  if (!last.verdict) {
    // A ROUND WHOSE CONFIGURATION HAS MOVED IS NOT AWAITING A JUDGEMENT — it is awaiting a
    // re-render, because the pictures in its packet are not the pictures these bytes draw.
    return { state: last.configHash === art.configHash ? "AWAITING" : "NOT_REVIEWED", critique: [] };
  }
  return { state: "REVISE", critique: last.critique ?? [] };
}
