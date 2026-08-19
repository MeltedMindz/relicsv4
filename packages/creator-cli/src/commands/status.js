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
  CHAIN_LABELS,
  CURRENT_DEPLOYED_GENERATION,
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
} from "../schema.js";
import { bold, cyan, dim, heading, yellow } from "../report.js";

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
    const deployedCount = Object.values(table).filter((entry) => entry !== null).length;

    const badge = generation.status === "DEPLOYED" ? `${deployedCount} chain${deployedCount === 1 ? "" : "s"}` : "NOT DEPLOYED";
    const heading_ = `  ${bold(`${generation.id}  ${generation.tag}`)}  ${generation.status === "DEPLOYED" ? dim(badge) : yellow(badge)}`;
    console.log(heading_);
    if (generation.deployedAt) console.log(`  ${dim("deployed at")}    ${generation.deployedAt}`);
    if (generation.freezeCommit) console.log(`  ${dim("freeze commit")}  ${generation.freezeCommit}`);
    console.log(`  ${dim(generation.summary)}`);
    console.log("");

    for (const chainId of chains) {
      const entry = Object.hasOwn(table, chainId) ? table[chainId] : undefined;
      const availability = entry === undefined ? `${generation.id} does not describe this chain` : launchAvailability(chainId, generationId);

      if (!entry) {
        // THE ROW THAT USED TO BE MISSING.
        console.log(`  ${bold(chainLabel(chainId).padEnd(chainWidth))}  ${yellow("—".padEnd(8))}  ${dim("no factory address published".padEnd(42))}  ${availability}`);
        continue;
      }
      const access = entry.launchAccess === "PUBLIC" ? entry.launchAccess.padEnd(8) : yellow(entry.launchAccess.padEnd(8));
      console.log(`  ${bold(chainLabel(chainId).padEnd(chainWidth))}  ${access}  ${cyan(entry.contracts.launchpadFactory)}  ${availability}`);
      if (acceptsPublicLaunches(chainId, generationId)) anyOpen += 1;
    }
    console.log("");
  }

  if (anyOpen === 0) {
    console.log(yellow("  Public creator launches are closed on every generation and every chain."));
    console.log(dim("  You can build, validate and export .relics bundles today; do not broadcast a launch transaction yet."));
  }
  const undeployed = PLATFORM_GENERATION_IDS.filter((id) => PLATFORM_GENERATIONS[id].status === "NOT_DEPLOYED");
  if (undeployed.length > 0) {
    console.log("");
    console.log(yellow(`  ${undeployed.join(", ")} ${undeployed.length === 1 ? "is" : "are"} not on any chain, so this kit publishes no ${undeployed.join("/")} address.`));
    console.log(dim("  Those addresses are derived from the source tree and move whenever it does — a copyable address"));
    console.log(dim("  that is not the contract you launch through is worse than no address at all."));
  }

  console.log("");
  console.log(dim(`  Robinhood quote reference: ${ROBINHOOD_STOCK_TOKEN_COUNT} official stock/ETF tokens (${ROBINHOOD_STOCK_TOKENS_VERSION}).`));
  console.log(
    dim(
      `  ${CURRENT_DEPLOYED_GENERATION} canary metadata: ${RC5_CANARY_METADATA_PROOF.projects[1].canary} contractURI + tokenURI(1) verified on ${Object.keys(RC5_CANARY_METADATA_PROOF.projects).length} chains.`,
    ),
  );
  return 0;
}
