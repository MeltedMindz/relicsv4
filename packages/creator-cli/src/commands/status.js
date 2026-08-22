// SPDX-License-Identifier: MIT
// `relics status` — the launchpad deployment state the kit was built against, BY GENERATION.
//
// TWO RULES, AND THE SECOND ONE IS THE IMPORTANT ONE.
//
//   1. Every address is printed under the generation it belongs to. An address that is true about
//      the wrong generation is the error a reader cannot detect, because nothing about it looks
//      wrong.
//
//   2. NO CHAIN IS EVER OMITTED. A chain a generation is not deployed on prints a row that says so
//      in words. This used to filter the rows down to chains with a deployment, which meant "not
//      deployed" and "not mentioned" looked identical — and a missing row reads as fine, in exactly
//      the way a checklist reports success because it found nothing to check.

import {
  APPROVED_ART_RUNTIMES,
  ART_RUNTIME_IDS,
  CHAIN_LABELS,
  KNOWN_DEPLOYMENT_CHAIN_IDS,
  PLATFORM_GENERATIONS,
  PLATFORM_GENERATION_IDS,
  PROTOCOL_RELEASE_COMPATIBILITY,
  RC5_CANARY_METADATA_PROOF,
  ROBINHOOD_STOCK_TOKEN_COUNT,
  ROBINHOOD_STOCK_TOKENS_VERSION,
  acceptsPublicLaunches,
  deploymentsFor,
  launchAvailability,
  isRuntimeLaunchable,
  liveChainIds,
} from "../schema.js";
import { bold, cyan, dim, green, heading, yellow } from "../report.js";

/** Display order. Any chain a generation names that is not listed here is appended, never dropped. */
const PREFERRED_CHAIN_ORDER = [1, 8453, 4663, 56];

function chainOrder() {
  const known = [...KNOWN_DEPLOYMENT_CHAIN_IDS];
  const ordered = PREFERRED_CHAIN_ORDER.filter((id) => known.includes(id));
  return [...ordered, ...known.filter((id) => !ordered.includes(id))];
}

function chainLabel(chainId) {
  return `${CHAIN_LABELS[chainId] ?? `chain ${chainId}`} (${chainId})`;
}

/**
 * WHAT EACH ART RUNTIME CAN AND CANNOT DO — authoring and launch, never one answer for both.
 *
 * A runtime the FORMAT accepts is not a runtime the PROTOCOL will bind, and the kit has to say so
 * on its own status screen rather than only at the moment a bundle is inspected. A creator picking
 * a template asks this question before they have a bundle to inspect.
 *
 * The three flags are printed as flags, in a fixed vocabulary, because they are read by people
 * checking a claim as well as by people building a project:
 *
 *   RUNTIME_AUTHORING  can you write and export a project on it
 *   RUNTIME_PREVIEW    can you see what it draws
 *   RUNTIME_LAUNCH     will a launch bind and render it
 *
 * Every value is DERIVED from the schema's own lists. Nothing here is typed twice: gating a runtime
 * off is still the one-line edit in `LAUNCHABLE_ART_RUNTIMES`, and this screen follows it.
 */
function printRuntimeCapability() {
  console.log("");
  heading("art runtimes");
  console.log(dim("  Authoring and launch are separate questions. A runtime can be fully authorable and not yet launchable."));
  console.log("");
  const width = Math.max(...APPROVED_ART_RUNTIMES.map((r) => (ART_RUNTIME_IDS[r] ?? r).length));
  for (const runtime of APPROVED_ART_RUNTIMES) {
    const id = ART_RUNTIME_IDS[runtime] ?? runtime;
    const launchable = isRuntimeLaunchable(runtime);
    console.log(`  ${bold(id.padEnd(width))}  RUNTIME_AUTHORING=${green("SUPPORTED")}  RUNTIME_PREVIEW=${green("SUPPORTED")}  RUNTIME_LAUNCH=${launchable ? green("SUPPORTED") : yellow("UNAVAILABLE")}`);
  }
  console.log("");
  const gated = APPROVED_ART_RUNTIMES.filter((r) => !isRuntimeLaunchable(r));
  if (gated.length > 0) {
    for (const runtime of gated) {
      const id = ART_RUNTIME_IDS[runtime] ?? runtime;
      console.log(yellow(`  ${id} projects can be built, previewed and exported now, but this runtime is not yet`));
      console.log(yellow("  available for on-chain launch. Your project and artwork remain saved."));
    }
    console.log("");
  }
  // TARGET-CHAIN CAPABILITY. Registration is PER CHAIN, and this kit ships no per-chain runtime
  // table on purpose: it would be a cached answer to a question whose only correct source is the
  // chain. Say where to ask instead of guessing.
  console.log(dim("  Launch capability is resolved PER CHAIN against that chain's ArtRuntimeRegistry at launch time."));
  console.log(dim("  A runtime registered on one chain is not thereby registered on another, and this kit does not"));
  console.log(dim("  cache that answer — the launchpad reads the registry live and refuses a runtime it cannot resolve."));
  console.log(dim("  Custom runtimes are not permissionless: registration is an operator action, per chain."));
}

export function printStatus() {
  const chains = chainOrder();
  const chainWidth = Math.max(...chains.map((id) => chainLabel(id).length));

  heading("launchpad status");
  console.log(`  ${dim("kit built against")}  ${PROTOCOL_RELEASE_COMPATIBILITY}`);
  console.log("");

  let anyOpen = 0;

  for (const generationId of PLATFORM_GENERATION_IDS) {
    const generation = PLATFORM_GENERATIONS[generationId];
    const table = deploymentsFor(generationId);
    // COUNT WHERE IT IS LIVE, NOT WHERE AN ADDRESS IS PRINTED. Counting published records made a
    // generation that is live on one chain and published on none read as "0 chains".
    const liveCount = liveChainIds(generationId).length;

    // THREE BADGES, NOT TWO. "3 chains" beside a superseded generation reads as three chains you
    // could launch on, which is the one thing it does not mean.
    const badge =
      generation.status !== "DEPLOYED"
        ? "NOT DEPLOYED"
        : generation.supersededBy
          ? `SUPERSEDED BY ${generation.supersededBy}`
          : `${liveCount} chain${liveCount === 1 ? "" : "s"}`;
    const neutral = generation.status === "DEPLOYED" && !generation.supersededBy;
    const heading_ = `  ${bold(`${generation.id}  ${generation.tag}`)}  ${neutral ? dim(badge) : yellow(badge)}`;
    console.log(heading_);
    if (generation.deployedAt) console.log(`  ${dim("deployed at")}    ${generation.deployedAt}`);
    if (generation.freezeCommit) console.log(`  ${dim("freeze commit")}  ${generation.freezeCommit}`);
    console.log(`  ${dim(generation.summary)}`);
    console.log("");

    for (const chainId of chains) {
      const entry = Object.hasOwn(table, chainId) ? table[chainId] : undefined;
      const availability = entry === undefined ? `${generation.id} does not describe this chain` : launchAvailability(chainId, generationId);

      // THE ACCESS COLUMN IS A CHAIN FACT; THE ADDRESS COLUMN IS A PUBLICATION DECISION. They are
      // printed side by side and derived separately, because a chain can be open on a factory this
      // kit does not yet print an address for — and reading the first off the second reported
      // exactly that chain as closed.
      const open = entry === undefined ? false : acceptsPublicLaunches(chainId, generationId);
      if (open) anyOpen += 1;

      if (!entry) {
        const accessCell = open ? "PUBLIC".padEnd(8) : yellow("—".padEnd(8));
        // THE ROW THAT USED TO BE MISSING.
        console.log(`  ${bold(chainLabel(chainId).padEnd(chainWidth))}  ${accessCell}  ${dim("no factory address published".padEnd(42))}  ${availability}`);
        continue;
      }
      const access = entry.launchAccess === "PUBLIC" ? entry.launchAccess.padEnd(8) : yellow(entry.launchAccess.padEnd(8));
      console.log(`  ${bold(chainLabel(chainId).padEnd(chainWidth))}  ${access}  ${cyan(entry.contracts.launchpadFactory)}  ${availability}`);
    }
    console.log("");
  }

  if (anyOpen === 0) {
    console.log(yellow("  Public creator launches are closed on every generation and every chain."));
    console.log(dim("  You can build, validate and export .relics bundles today; do not broadcast a launch transaction yet."));
  } else {
    // THE OPEN CASE GETS ITS OWN SENTENCE, and it names the count rather than the chains. The rows
    // above already name them, and a second hand-written list is the copy that goes stale first.
    console.log(`  ${anyOpen} chain/generation pair${anyOpen === 1 ? "" : "s"} accept a permissionless creator launch right now.`);
    console.log(dim("  Read launchAccessState() from the factory before you broadcast: this table is a record, the chain is the fact."));
  }
  const undeployed = PLATFORM_GENERATION_IDS.filter((id) => PLATFORM_GENERATIONS[id].status === "NOT_DEPLOYED");
  if (undeployed.length > 0) {
    console.log("");
    console.log(yellow(`  ${undeployed.join(", ")} ${undeployed.length === 1 ? "is" : "are"} not on any chain, so this kit publishes no ${undeployed.join("/")} address.`));
    console.log(dim("  Those addresses are derived from the source tree and move whenever it does — a copyable address"));
    console.log(dim("  that is not the contract you launch through is worse than no address at all."));
  }

  // A LIVE GENERATION WITH NO PUBLISHED ADDRESS IS ITS OWN STATE, AND IT GETS ITS OWN SENTENCE.
  // Neither of the two paragraphs above describes it, and leaving it to the reader to infer from a
  // dash in the address column is how a creator concludes the chain is closed.
  for (const id of PLATFORM_GENERATION_IDS) {
    const g = PLATFORM_GENERATIONS[id];
    if (g.status !== "DEPLOYED" || g.publishesAddresses || !g.addressPublication) continue;
    console.log("");
    console.log(
      yellow(
        g.supersededBy
          ? `  ${g.id} still holds code on chain and this kit publishes no ${g.id} address.`
          : `  ${g.id} is live and this kit publishes no ${g.id} address.`,
      ),
    );
    console.log(dim(`  ${g.addressPublication}`));
  }

  printRuntimeCapability();

  console.log("");
  console.log(dim(`  Robinhood quote reference: ${ROBINHOOD_STOCK_TOKEN_COUNT} official stock/ETF tokens (${ROBINHOOD_STOCK_TOKENS_VERSION}).`));
  console.log(
    dim(
      // NAMED RC5, NOT "the current generation". This proof is about RC5's canaries; once the
      // current generation moved to RC6 the interpolated label made it an RC6 claim.
      `  RC5 canary metadata: ${RC5_CANARY_METADATA_PROOF.projects[1].canary} contractURI + tokenURI(1) verified on ${Object.keys(RC5_CANARY_METADATA_PROOF.projects).length} chains.`,
    ),
  );
  return 0;
}
