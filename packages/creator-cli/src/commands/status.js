// SPDX-License-Identifier: MIT
// `relics status` — print the public launchpad deployment state the kit was built against.

import {
  DEPLOYED_CHAIN_IDS,
  PLATFORM_DEPLOYMENTS,
  PLATFORM_RELEASE,
  ROBINHOOD_STOCK_TOKEN_COUNT,
  ROBINHOOD_STOCK_TOKENS_VERSION,
  acceptsPublicLaunches,
  launchAvailability,
} from "../schema.js";
import { bold, cyan, dim, heading, yellow } from "../report.js";

const DISPLAY_CHAIN_ORDER = [1, 8453, 4663];

export function printStatus() {
  heading("launchpad status");
  console.log(`  ${dim("release")}       ${PLATFORM_RELEASE.tag}`);
  console.log(`  ${dim("freeze commit")} ${PLATFORM_RELEASE.freezeCommit}`);
  console.log(`  ${dim("deployed at")}   ${PLATFORM_RELEASE.deployedAt}`);
  console.log("");

  const rows = DISPLAY_CHAIN_ORDER.filter((chainId) => DEPLOYED_CHAIN_IDS.includes(chainId)).map((chainId) => {
    const deployment = PLATFORM_DEPLOYMENTS[chainId];
    return {
      chainId,
      chain: `${deployment.label} (${chainId})`,
      access: deployment.launchAccess,
      factory: deployment.contracts.launchpadFactory,
      availability: launchAvailability(chainId),
    };
  });

  const chainWidth = Math.max(...rows.map((r) => r.chain.length));
  const accessWidth = Math.max(...rows.map((r) => r.access.length));
  for (const row of rows) {
    const paddedAccess = row.access.padEnd(accessWidth);
    const access = row.access === "PUBLIC" ? paddedAccess : yellow(paddedAccess);
    console.log(`  ${bold(row.chain.padEnd(chainWidth))}  ${access}  ${cyan(row.factory)}  ${row.availability}`);
  }

  const open = rows.filter((r) => acceptsPublicLaunches(r.chainId)).length;
  console.log("");
  if (open === 0) {
    console.log(yellow("  Public creator launches are still closed. You can build, validate and export .relics bundles; do not broadcast launch transactions yet."));
  }
  console.log(dim(`  Robinhood quote reference: ${ROBINHOOD_STOCK_TOKEN_COUNT} official stock/ETF tokens (${ROBINHOOD_STOCK_TOKENS_VERSION}).`));
  return 0;
}
