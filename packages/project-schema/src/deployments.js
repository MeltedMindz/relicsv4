// SPDX-License-Identifier: MIT
//
// PLATFORM DEPLOYMENTS, BY GENERATION — the addresses a bundle would actually be launched against.
//
// This file exists so a creator can answer four questions from the kit alone, without trusting a
// website: which PLATFORM GENERATION each address belongs to, which chains that generation is
// deployed on, what its contracts are, and whether the chain will currently accept THEIR launch.
//
// THE GENERATION IS PART OF EVERY ANSWER, AND THAT IS THE POINT.
//
// This file used to publish one flat address table. Every address in it was real, source-verified
// and correctly labelled — and a creator reading it beside a kit built for a LATER generation would
// still conclude, reasonably, that those were the contracts their bundle was about to be launched
// through. An address that is true about the wrong generation is not a small error: it is the one a
// reader has no way to detect, because nothing about it looks wrong.
//
// So no address appears here without a generation, and NO CHAIN IS EVER OMITTED. A chain a
// generation is not deployed on gets an explicit `null` record with a stated reason, and `relics
// status` prints it as a row that says so. Absence reads as "fine" — the same vacuous-pass shape as
// a checklist that reports success because it found nothing to check — so absence is not used to
// mean anything here.
//
// READ THIS BEFORE PLANNING A LAUNCH DATE:
//
//   RC6  is the LIVE generation and PERMISSIONLESS CREATION IS OPEN. Its factory is at the same
//        CREATE2 address on Ethereum (1), Base (8453) and Robinhood Chain (4663), and on all three
//        `launchAccessState()` reads 1 (`PUBLIC`). `openPublicLaunches()` has been executed on each
//        and is IRREVERSIBLE — there is no `closePublicLaunches` and no selector that writes the
//        state again. An ordinary creator launch is ADMITTED on all three chains. It is NOT
//        deployed on BNB Smart Chain (56), which is deferred.
//
//   RC5  is SUPERSEDED. Its contracts still hold code on the three chains they were deployed to and
//        still read `PREPARED`, so they never accepted a public launch and never will. This kit
//        publishes none of their addresses: a superseded platform address in a creator kit is
//        exactly the copyable-but-wrong contract the generational split exists to prevent.
//
// DEPLOYED AND PUBLISHED-HERE ARE TWO DIFFERENT FACTS, AND THIS FILE KEEPS THEM APART.
//
// Whether a chain accepts your launch is read from that chain's factory. Whether THIS KIT prints an
// address for it is a separate publication decision, carried by `publishesAddresses` and, per
// generation, by `chainLaunchAccess`. The two were collapsed once and the kit reported a live,
// publicly-open chain as "not deployed"; they do not share a field again.
//
// THE RC6 ADDRESS ENTRIES ARE GENERATED, NEVER HAND-EDITED. Regenerate with
//
//     RELICS_LAUNCHPAD_DIR=… npm run kit:deployments:sync
//
// which reads the launchpad's own chain profiles and publishes an address only from a profile that
// states the addresses were read back off the chain. `npm run kit:deployments:check` re-verifies it
// in CI.
//
// THE MULTI-QUOTE LANE IS NOT PUBLISHED HERE. Robinhood Chain is the only chain with a second,
// non-WETH quote lane, and its registry/kernel addresses are recorded upstream as a prose note
// rather than a structured field. `factory.multiQuoteLane()` returns them on chain and is the
// authority; this kit does not print an address it would have had to parse out of a sentence.

/** @typedef {"PREPARED"|"PUBLIC"} LaunchAccess */

/**
 * @typedef {"DEPLOYED"|"NOT_DEPLOYED"} GenerationStatus
 * A generation is DEPLOYED when its contracts exist on at least one chain. It says nothing about
 * whether that chain accepts public launches — that is `launchAccess`, and the two are independent.
 */

/** Generation ids, oldest first. Every deployment record names one of these. */
export const PLATFORM_GENERATION_IDS = Object.freeze(["RC5", "RC6"]);

/**
 * WHAT EACH GENERATION IS, AND WHETHER IT EXISTS ON CHAIN.
 *
 * `publishesAddresses` is the field that keeps this honest, and it answers a PUBLICATION question,
 * never a deployment one. A generation can be on chain and still print nothing here — RC5 is
 * exactly that: superseded, still holding code, and deliberately unpublished, because a copyable
 * address for a platform that will never accept a launch is worse than no address at all.
 */
export const PLATFORM_GENERATIONS = Object.freeze({
  RC5: Object.freeze({
    id: "RC5",
    tag: "v1.0.0-rc5",
    status: /** @type {GenerationStatus} */ ("DEPLOYED"),
    freezeCommit: "d68469c93f3972a78a42e23578fcf9e685a9274d",
    solidityTree: "e451884c71bc93de52a110bf37daa98b5d153a92",
    deployedAt: "2026-08-13",
    publishesAddresses: false,
    supersededBy: "RC6",
    /**
     * RC5's factories were never opened. `PREPARED` is the zero value a freshly initialized factory
     * is born in, and these three still read it — so an ordinary creator launch was refused for the
     * whole life of the generation and is refused today.
     */
    chainLaunchAccess: Object.freeze({
      1: /** @type {LaunchAccess} */ ("PREPARED"),
      8453: /** @type {LaunchAccess} */ ("PREPARED"),
      4663: /** @type {LaunchAccess} */ ("PREPARED"),
      56: null,
    }),
    addressPublication:
      "Withdrawn. RC5 is superseded by RC6 and this kit no longer prints its platform addresses. The contracts still hold code on Ethereum, Base and Robinhood Chain and still read PREPARED, so they refuse an ordinary launch; publishing them would hand a creator a contract they can reach and cannot use. Read them off a block explorer if you are auditing history.",
    summary:
      "Superseded by RC6. Its contracts remain on Ethereum, Base and Robinhood Chain and remain PREPARED, so they never accepted a public creator launch. No RC5 address is published in this kit.",
  }),
  RC6: Object.freeze({
    id: "RC6",
    tag: "v1.0.0-rc6",
    status: /** @type {GenerationStatus} */ ("DEPLOYED"),
    freezeCommit: "63b3a5bb3a2a8f3835e7f17be68ea88242555ab2",
    solidityTree: null,
    deployedAt: "2026-08-19",
    publishesAddresses: true,
    supersededBy: null,
    /**
     * WHAT EACH CHAIN'S FACTORY ANSWERS RIGHT NOW — read from the chain, not from a package.
     *
     * `null` means no RC6 factory exists on that chain at all. `"PREPARED"` and `"PUBLIC"` are the
     * two states a deployed factory can hold; `PREPARED` is the zero value a freshly initialized
     * factory is born in and `PUBLIC` is reached exactly once, by `openPublicLaunches()`.
     *
     * This map exists because a chain's launch access and this kit's willingness to print an
     * address are answered by different evidence, and collapsing them made the kit assert that RC6
     * was "not deployed on any chain" for a chain that was live and open to creators. Publishing
     * no address is a publication decision; being closed is a chain fact. They are not the same
     * sentence and they must not share a field.
     */
    chainLaunchAccess: Object.freeze({
      1: /** @type {LaunchAccess} */ ("PUBLIC"),
      8453: /** @type {LaunchAccess} */ ("PUBLIC"),
      4663: /** @type {LaunchAccess} */ ("PUBLIC"),
      56: null,
    }),
    addressPublication:
      "Published, from the launchpad's chain profiles, for every chain whose profile states the addresses were read back off the chain. Chain 56 is deferred and prints nothing.",
    summary:
      "Live and open to permissionless creator launches on Ethereum (1), Base (8453) and Robinhood Chain (4663) — one factory address, the same on all three. Not deployed on BNB Smart Chain (56).",
  }),
});

/**
 * The LIVE release record. Kept as its own export because tools and docs already read it by name;
 * it is the same object as `PLATFORM_GENERATIONS.RC6`.
 *
 * It moved from RC5 to RC6 when RC6 went live. A name like this one is read as "the platform", so
 * leaving it pinned to a superseded generation is how a caller ends up describing the wrong one
 * while every individual field it prints is true.
 */
export const PLATFORM_RELEASE = PLATFORM_GENERATIONS.RC6;

/**
 * RC5 platform contracts per chain — WITHDRAWN, every chain `null`.
 *
 * `null` HERE MEANS "THIS KIT PUBLISHES NO ADDRESS". For chains 1, 8453 and 4663 the contracts do
 * still exist: they hold code and they read `PREPARED`, which is the state a factory is born in and
 * the state RC5 never left. That is precisely why the addresses came out. A creator who copies one
 * reaches a real, source-verified contract that will refuse their launch forever, and nothing about
 * the address looks wrong on the way there.
 *
 * Chain 56 (BNB) was never deployed at all in this generation: its buy-and-entomb half has no
 * egress route, so it was deferred rather than shipped half-working. It stays in the table as a
 * stated null so `relics status` can say that in words instead of leaving a creator to infer it
 * from a missing row.
 *
 * `PLATFORM_GENERATIONS.RC5.chainLaunchAccess` is what still answers "is that chain open" for this
 * generation, and it answers `PREPARED` on the three it was deployed to. Withdrawing an address is
 * a publication decision; it does not erase the chain fact beside it.
 */
export const RC5_DEPLOYMENTS = Object.freeze({
  1: null, // superseded by RC6 — contracts remain on chain, PREPARED, and are not published here
  8453: null, // superseded by RC6 — contracts remain on chain, PREPARED, and are not published here
  4663: null, // superseded by RC6 — contracts remain on chain, PREPARED, and are not published here
  56: null, // BNB Smart Chain — never deployed in this generation: no egress route for the buy-and-entomb half
});

/** Public proof that the RC5 canary metadata path is live for the published TEST-INSTANT canaries. */
export const RC5_CANARY_METADATA_PROOF = Object.freeze({
  repairedAt: "2026-08-14",
  media: Object.freeze({
    imageUri: "ipfs://bafkreicwcpyuqhcj5mtofwruwnn32vectrxbetjvvfgimbikqevxhzrqni",
    gatewayUrl: "https://gateway.pinata.cloud/ipfs/bafkreicwcpyuqhcj5mtofwruwnn32vectrxbetjvvfgimbikqevxhzrqni",
  }),
  expectation: Object.freeze({
    contractURI: "non-empty ERC-7572 collection/project JSON with the IPFS image above",
    tokenURI: "data:application/json;base64 with embedded on-chain SVG artwork",
  }),
  projects: Object.freeze({
    1: Object.freeze({
      chainId: 1,
      label: "Ethereum",
      symbol: "TEST",
      canary: "TEST-INSTANT",
      projectId: 1,
      projectToken: "0x311a8d905133ffbe3821b2f7eae2c9883c2d78fb",
      projectCollection: "0x76554dfe06cf995e4a188cca8944932c4d551247",
      artHook: "0x05f1a785d0fc4426cf46af1d5a1114cd22d15440",
      poolId: "0x574d2d6bd040127fdce7f43d099c74314d2b027e7eddafff163444214036b7d9",
      verifiedTokenId: 1,
    }),
    8453: Object.freeze({
      chainId: 8453,
      label: "Base",
      symbol: "TEST",
      canary: "TEST-INSTANT",
      projectId: 1,
      projectToken: "0x094cb741b622816eaf462ba4f025c3804256b98e",
      projectCollection: "0x93c51fb38fbe818303a404fa86dd57ff365f87aa",
      artHook: "0xb12b78a9293f7d86ce69ae73210f0bcabde61440",
      poolId: "0xac14ceed1f11c58526b22721338525580024b5e1e37e6cc0cd7aaba422d62b8c",
      verifiedTokenId: 1,
    }),
    4663: Object.freeze({
      chainId: 4663,
      label: "Robinhood Chain",
      symbol: "TEST",
      canary: "TEST-INSTANT",
      projectId: 1,
      projectToken: "0x0126cbfecd9a7293f5d03d0ff64f811798f9a31d",
      projectCollection: "0xcafb2a774512daab8c7b2bc64e967532c48137dc",
      artHook: "0x4eda55c785e2c195b1d9d4e1db89508c0820d440",
      poolId: "0x8d6ba20b3f98813eda6cff5067f9adeb7d099833fcc67066a97ddba3c06dc6d3",
      verifiedTokenId: 1,
    }),
  }),
});

/**
 * RC6 platform contracts per chain — GENERATED. Do not hand-edit.
 *
 * `null` HERE MEANS "THIS KIT PUBLISHES NO ADDRESS", NOT "NOTHING IS DEPLOYED", and the two are
 * still answered by different evidence. Today only chain 56 is null, and for it both readings are
 * true. `PLATFORM_GENERATIONS.RC6.chainLaunchAccess` is the field that answers the access question,
 * and `launchAvailability()` reads it rather than inferring an answer from this table.
 *
 * ONE FACTORY ADDRESS, THREE CHAINS. `launchpadFactory` is the same CREATE2 address on Ethereum,
 * Base and Robinhood Chain. That is not a copy-paste error in this file; it is what a deterministic
 * deployment produces, and it is worth checking against a block explorer rather than assumed wrong.
 * It is an ERC-1967 proxy: `launchpadFactoryImplementation` is what it currently points at, the
 * PROXY is the stable address every launch is built against, and the implementation moves under it.
 *
 * `RELICS_LAUNCHPAD_DIR=… npm run kit:deployments:sync` fills this in from the launchpad's chain
 * profiles and publishes an address only from a profile that states the addresses were read back
 * off the chain, so a row here cannot be filled in by mistake — only by a real, verified deployment.
 */
export const RC6_DEPLOYMENTS = Object.freeze({
  1: Object.freeze({
    chainId: 1,
    label: "Ethereum",
    generation: "RC6",
    launchAccess: /** @type {LaunchAccess} */ ("PUBLIC"),
    explorer: "https://etherscan.io",
    contracts: Object.freeze({
      launchpadFactory: "0x25003C3EBC2036CfE9E4037d4e7E6F840a06522E",
      launchpadFactoryImplementation: "0xFeeCB1F1e96328E270d67CeD79D4e3492894ac8c",
      artStreamableFeesLocker: "0x895a416BCCdadDE85559806D44D20158E46c4294",
      projectRegistry: "0x7EDb27147e4f12D8E4100E1681d2c873D4Bb60f3",
      projectRights: "0xBae5e9Cc5BFEAF17aFAc5C75a3b32210eBC92fc2",
      scriptStorage: "0x057135CbeB1b9689678900b89b13188EE3d9bDff",
      templateRegistry: "0xb3F2EDaf7dF7d0A98E3F45A55EC7c20855c2E932",
      feeAccounting: "0x9fB49C18361133dD57DD996ABa0cDEaa6c93ae00",
      metadataResolver: "0x112D480aeD3f6F6761E8136F4372AEbd48455e1b",
    }),
  }),
  56: null, // not deployed — chain profile says platformContracts.status is "PREPARED_NOT_DEPLOYED" (deployment package is PREPARED_UNSIGNED)
  4663: Object.freeze({
    chainId: 4663,
    label: "Robinhood Chain",
    generation: "RC6",
    launchAccess: /** @type {LaunchAccess} */ ("PUBLIC"),
    explorer: "https://robinhoodchain.blockscout.com",
    contracts: Object.freeze({
      launchpadFactory: "0x25003C3EBC2036CfE9E4037d4e7E6F840a06522E",
      launchpadFactoryImplementation: "0xFeeCB1F1e96328E270d67CeD79D4e3492894ac8c",
      artStreamableFeesLocker: "0xE043F620CBb582FD4C132e72fEaEd8E4EA47c7E4",
      projectRegistry: "0x7EDb27147e4f12D8E4100E1681d2c873D4Bb60f3",
      projectRights: "0xBae5e9Cc5BFEAF17aFAc5C75a3b32210eBC92fc2",
      scriptStorage: "0x057135CbeB1b9689678900b89b13188EE3d9bDff",
      templateRegistry: "0xb3F2EDaf7dF7d0A98E3F45A55EC7c20855c2E932",
      feeAccounting: "0x0Be6edd65708022e661d8c5C002d50a99b38E1c5",
      metadataResolver: "0x112D480aeD3f6F6761E8136F4372AEbd48455e1b",
      swapRouter: "0x581c8EaeB2b051632d27Bb49157d6424C0D7eBF1",
    }),
  }),
  8453: Object.freeze({
    chainId: 8453,
    label: "Base",
    generation: "RC6",
    launchAccess: /** @type {LaunchAccess} */ ("PUBLIC"),
    explorer: "https://basescan.org",
    contracts: Object.freeze({
      launchpadFactory: "0x25003C3EBC2036CfE9E4037d4e7E6F840a06522E",
      launchpadFactoryImplementation: "0xFeeCB1F1e96328E270d67CeD79D4e3492894ac8c",
      artStreamableFeesLocker: "0xDacbcC9E63B22101890ead535b2038f714Fe47B8",
      projectRegistry: "0x7EDb27147e4f12D8E4100E1681d2c873D4Bb60f3",
      projectRights: "0xBae5e9Cc5BFEAF17aFAc5C75a3b32210eBC92fc2",
      scriptStorage: "0x057135CbeB1b9689678900b89b13188EE3d9bDff",
      templateRegistry: "0xb3F2EDaf7dF7d0A98E3F45A55EC7c20855c2E932",
      feeAccounting: "0x8D23741ef600a426DBd44E507Bc377e7991A14f6",
      metadataResolver: "0x112D480aeD3f6F6761E8136F4372AEbd48455e1b",
    }),
  }),
});

/** Every generation's per-chain deployment table, keyed by generation id. */
export const DEPLOYMENTS_BY_GENERATION = Object.freeze({
  RC5: RC5_DEPLOYMENTS,
  RC6: RC6_DEPLOYMENTS,
});

/**
 * The CURRENT generation's table, for callers that only ever meant "the live platform".
 *
 * It resolves to the newest generation that is actually DEPLOYED — not the newest generation that
 * exists. A kit built alongside an undeployed generation must not start answering "what are the
 * contracts" with addresses that are not on any chain.
 */
export const CURRENT_DEPLOYED_GENERATION = PLATFORM_GENERATION_IDS.filter((id) => PLATFORM_GENERATIONS[id].status === "DEPLOYED").at(-1) ?? null;

/**
 * @deprecated Prefer `deploymentsFor(generation)`; this is the current DEPLOYED generation's table.
 * It is currently RC6's. It is a table of PUBLISHED ADDRESSES, not of deployments — read
 * `launchAccessFor(chainId)` for whether a chain is live.
 */
export const PLATFORM_DEPLOYMENTS = CURRENT_DEPLOYED_GENERATION ? DEPLOYMENTS_BY_GENERATION[CURRENT_DEPLOYED_GENERATION] : Object.freeze({});

/** Every chain id any generation names, ascending. Includes chains nothing is deployed on. */
export const KNOWN_DEPLOYMENT_CHAIN_IDS = Object.freeze(
  [...new Set(Object.values(DEPLOYMENTS_BY_GENERATION).flatMap((table) => Object.keys(table).map(Number)))].sort((a, b) => a - b),
);

/**
 * The deployment table for `generation`.
 * THROWS on an unknown generation: there is no sensible default platform generation, and answering
 * with the current one would be the exact substitution this file exists to prevent.
 * @param {string} generation
 */
export function deploymentsFor(generation) {
  if (!Object.hasOwn(DEPLOYMENTS_BY_GENERATION, generation)) {
    throw new Error(`deploymentsFor(${JSON.stringify(generation)}): unknown generation. Known: ${PLATFORM_GENERATION_IDS.join(", ")}`);
  }
  return DEPLOYMENTS_BY_GENERATION[generation];
}

/** The generation record for `generation`. THROWS on an unknown id. @param {string} generation */
export function platformGeneration(generation) {
  if (!Object.hasOwn(PLATFORM_GENERATIONS, generation)) {
    throw new Error(`platformGeneration(${JSON.stringify(generation)}): unknown generation. Known: ${PLATFORM_GENERATION_IDS.join(", ")}`);
  }
  return PLATFORM_GENERATIONS[generation];
}

/**
 * Chain ids `generation` PUBLISHES AN ADDRESS FOR here, ascending. Does NOT imply public launches,
 * and — since RC6 — does not imply a chain is undeployed when it is absent. `liveChainIds` is the
 * one that answers "where does this generation exist".
 * @param {string} [generation]
 */
export function deployedChainIds(generation = CURRENT_DEPLOYED_GENERATION) {
  const table = deploymentsFor(generation);
  return Object.keys(table)
    .map(Number)
    .filter((id) => table[id] !== null)
    .sort((a, b) => a - b);
}

/** Chain ids the current DEPLOYED generation publishes an address for here, ascending. */
export const DEPLOYED_CHAIN_IDS = Object.freeze(CURRENT_DEPLOYED_GENERATION ? deployedChainIds(CURRENT_DEPLOYED_GENERATION) : []);

/**
 * The deployment record for `chainId` in `generation`.
 * THROWS on an unknown chain rather than returning undefined: a caller that silently proceeds with
 * `undefined.contracts.launchpadFactory` produces a far worse error later, and there is no sensible
 * default platform to fall back to.
 * @param {number} chainId
 * @param {string} [generation]
 */
export function platformDeployment(chainId, generation = CURRENT_DEPLOYED_GENERATION) {
  const table = deploymentsFor(generation);
  if (!(chainId in table)) {
    throw new Error(`platformDeployment(${chainId}, ${JSON.stringify(generation)}): unknown chain. Known: ${Object.keys(table).join(", ")}`);
  }
  return table[chainId];
}

/** @param {number} chainId @param {string} [generation] */
export function isPlatformDeployed(chainId, generation = CURRENT_DEPLOYED_GENERATION) {
  return platformDeployment(chainId, generation) !== null;
}

/**
 * What `chainId`'s factory answers in `generation`: `"PREPARED"`, `"PUBLIC"`, or `null` when no
 * factory of that generation exists on that chain.
 *
 * IT DOES NOT ASK WHETHER AN ADDRESS IS PUBLISHED. A published deployment record carries its own
 * `launchAccess` and is preferred, because it was generated from the same source as the address
 * beside it. When no address is published, the generation's `chainLaunchAccess` map answers — a
 * value read from the chain's own factory. Deriving launch access from the presence of an address
 * is what made this kit report a live, publicly-open chain as "not deployed on any chain".
 *
 * THROWS on an unknown chain, exactly as `platformDeployment` does.
 * @param {number} chainId
 * @param {string} [generation]
 * @returns {LaunchAccess|null}
 */
export function launchAccessFor(chainId, generation = CURRENT_DEPLOYED_GENERATION) {
  const d = platformDeployment(chainId, generation);
  if (d !== null) return d.launchAccess;
  const declared = platformGeneration(generation).chainLaunchAccess;
  return declared?.[chainId] ?? null;
}

/** Chain ids `generation` is LIVE on, published address or not, ascending. @param {string} [generation] */
export function liveChainIds(generation = CURRENT_DEPLOYED_GENERATION) {
  return Object.keys(deploymentsFor(generation))
    .map(Number)
    .filter((id) => launchAccessFor(id, generation) !== null)
    .sort((a, b) => a - b);
}

/**
 * Whether `chainId` will accept an ordinary creator launch right now, in `generation`.
 * Kept as a function rather than a constant so tools read the CURRENT record instead of baking in
 * today's answer — which is exactly what happened when every answer was no.
 * @param {number} chainId
 * @param {string} [generation]
 */
export function acceptsPublicLaunches(chainId, generation = CURRENT_DEPLOYED_GENERATION) {
  return launchAccessFor(chainId, generation) === "PUBLIC";
}

/**
 * A one-line, honest status string for CLI output. Always names the generation, because "not
 * deployed", "deployed but closed" and "superseded" are three different sentences and a creator
 * needs to know which generation each one is about.
 * @param {number} chainId
 * @param {string} [generation]
 */
export function launchAvailability(chainId, generation = CURRENT_DEPLOYED_GENERATION) {
  const g = platformGeneration(generation);
  const d = platformDeployment(chainId, generation);
  const access = launchAccessFor(chainId, generation);
  if (access === null) {
    return g.status === "NOT_DEPLOYED" ? `${g.id} is not deployed on any chain` : `${g.id} is not deployed on this chain`;
  }
  // Live. Say so, and say separately whether this kit prints the address — the reader is about to
  // go looking for one, and "no address here" is a different problem from "no factory there".
  const withheld = d === null ? ", address not published in this kit" : "";
  // A SUPERSEDED GENERATION IS NEVER "not YET open". Its contracts are on chain and closed, and
  // they will stay closed — the successor is where launches go. "Not yet" is a claim about the
  // future, and making it about a generation nothing will reopen is the friendliest way to send a
  // creator to wait for a state that will not arrive.
  if (g.supersededBy) return `${g.id} superseded by ${g.supersededBy} — contracts remain on chain, closed to creator launches${withheld}`;
  if (access === "PUBLIC") return `${g.id} live — accepting creator launches${withheld}`;
  return `${g.id} contracts live, public creation not yet open${withheld}`;
}

/** Explorer URL for a contract on `chainId`. @param {number} chainId @param {string} address */
export function explorerAddressUrl(chainId, address, generation = CURRENT_DEPLOYED_GENERATION) {
  const d = platformDeployment(chainId, generation);
  if (d === null) throw new Error(`explorerAddressUrl(${chainId}, ${JSON.stringify(generation)}): that generation has no deployment on this chain`);
  return `${d.explorer}/address/${address}`;
}
