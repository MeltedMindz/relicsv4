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
//   RC5  is DEPLOYED on Ethereum, Base and Robinhood Chain. Permissionless creation is NOT OPEN:
//        every factory is in `PREPARED`, which refuses an ordinary `launch`. Opening public creation
//        is a separate, ONE-WAY timelock operation that has not been scheduled.
//
//   RC6  is NOT DEPLOYED ANYWHERE. Its deployment packages exist, are unsigned and unbroadcast, and
//        their deterministic addresses still move whenever the source tree moves. This file
//        therefore publishes NO RC6 ADDRESS AT ALL — a predicted address is worse than an absent
//        one, because it is copyable.
//
// So today you can build, validate and export a real `.relics` bundle and see exactly which
// generation and which contracts it would target; you cannot broadcast one yet.
//
// THE RC6 ENTRIES ARE GENERATED, NEVER HAND-EDITED. When a generation is broadcast, run
//
//     npm run kit:deployments:sync
//
// which reads the launchpad's own deployment packages and refuses to publish an address from a
// package that is not broadcast. `npm run kit:deployments:check` re-verifies it in CI.

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
 * `publishesAddresses` is the field that keeps this honest. A generation whose packages are
 * deterministic but unbroadcast HAS addresses — they are computable, they are in the launchpad's
 * own packages, and they are wrong the moment the source tree moves. Publishing them in a creator
 * kit would hand a creator something copyable that will not be the contract they launch through.
 */
export const PLATFORM_GENERATIONS = Object.freeze({
  RC5: Object.freeze({
    id: "RC5",
    tag: "v1.0.0-rc5",
    status: /** @type {GenerationStatus} */ ("DEPLOYED"),
    freezeCommit: "d68469c93f3972a78a42e23578fcf9e685a9274d",
    solidityTree: "e451884c71bc93de52a110bf37daa98b5d153a92",
    deployedAt: "2026-08-13",
    externalAudit: "NOT_PERFORMED",
    publishesAddresses: true,
    summary: "Deployed and source-verified on Ethereum, Base and Robinhood Chain. Every factory is PREPARED, so public creator launches are closed.",
  }),
  RC6: Object.freeze({
    id: "RC6",
    tag: "v1.0.0-rc6",
    status: /** @type {GenerationStatus} */ ("NOT_DEPLOYED"),
    freezeCommit: null,
    solidityTree: null,
    deployedAt: null,
    externalAudit: "NOT_PERFORMED",
    publishesAddresses: false,
    summary:
      "Not deployed on any chain. Its deployment packages are unsigned and unbroadcast, and every derived address — including the mined hook addresses — still moves when the source tree moves, so this kit publishes none of them.",
  }),
});

/**
 * The RC5 release record. Kept as its own export because tools and docs already read it by name;
 * it is the same object as `PLATFORM_GENERATIONS.RC5`.
 */
export const PLATFORM_RELEASE = PLATFORM_GENERATIONS.RC5;

/**
 * RC5 platform contracts per chain.
 *
 * `null` for a chain means NOT DEPLOYED — not "unknown", and never a reason to substitute an
 * address from another chain. Chain 56 (BNB) is null for a stated reason: its buy-and-entomb half
 * has no egress route in this generation, so deploying it would strand funds. It is deferred rather
 * than shipped half-working, and it stays in the table as a null so `relics status` can say that in
 * words instead of leaving a creator to infer it from a missing row.
 */
export const RC5_DEPLOYMENTS = Object.freeze({
  1: Object.freeze({
    chainId: 1,
    label: "Ethereum",
    generation: "RC5",
    launchAccess: /** @type {LaunchAccess} */ ("PREPARED"),
    explorer: "https://etherscan.io",
    contracts: Object.freeze({
      launchpadFactory: "0xe887e4601fde28e1981142e715b4b2e9b4ab2319",
      artStreamableFeesLocker: "0xfcc073d0e863dee90e9795f551f0748ceb6bfd8d",
      projectRegistry: "0x277aaa0673fbfbdd182907af3491f8da8a0fdb84",
      projectMetadataRegistry: "0xfba3d24cca78cc6e7a2aafb656d1239233c5a4c0",
      projectRights: "0x431142516526f93221715aada5525f9882beeee8",
      scriptStorage: "0xf0e549c64d786fb1fd4f659a01030d22b82e9212",
      templateRegistry: "0x63abbb660d043f3f134f12c81a0ed3251101c941",
      artRuntimeRegistry: "0x927ccc48ebbd6d2dd9cd6f8c4abaf6ae670a2818",
      solidityGenerativeRuntimeV1: "0x3effc28b622b5368ef848c233df3baecedb82617",
      protocolTimelock: "0xe7476fcca36933076af8af5c6693d8c2c2bc24cc",
    }),
  }),
  8453: Object.freeze({
    chainId: 8453,
    label: "Base",
    generation: "RC5",
    launchAccess: /** @type {LaunchAccess} */ ("PREPARED"),
    explorer: "https://basescan.org",
    contracts: Object.freeze({
      launchpadFactory: "0x62a6c28ce2622dcb2acf3ff89e6f9dae3d1d92c2",
      artStreamableFeesLocker: "0xba2172316bbd48ad6b6d018c93b41da5f16e5f3b",
      projectRegistry: "0x5df3bcd0bd2a74d00b4490e1c799a8d8d3947da9",
      projectMetadataRegistry: "0xb2df764e3923dc225a4f4a4d8db8edb7defe2a5d",
      projectRights: "0xc75e5d4abb60f75d59a0bd96e3ef4627d003eff4",
      scriptStorage: "0x8f05f5480437a23b7e773af1c31e7d0a7aa9f0a8",
      templateRegistry: "0xec1def5ac7582852bfc289171c640f56fe3291ea",
      artRuntimeRegistry: "0x8afa6bdc3bb6f11d8654885b2b12b78e3da39849",
      solidityGenerativeRuntimeV1: "0xeb96fcb36c4fa60e60bc13123d238d41b8daaa35",
      protocolTimelock: "0x10bc62c7c9ccbf90c5965583c86987c1dc9eb918",
    }),
  }),
  4663: Object.freeze({
    chainId: 4663,
    label: "Robinhood Chain",
    generation: "RC5",
    launchAccess: /** @type {LaunchAccess} */ ("PREPARED"),
    explorer: "https://robinhoodchain.blockscout.com",
    contracts: Object.freeze({
      launchpadFactory: "0x7694f2b0db5c33df40c3a5fd5c41a16ff471afcf",
      artStreamableFeesLocker: "0x9fb8f21253f33d978e974938a296b2f1a03e07d2",
      projectRegistry: "0x2b73450dd74b06d0c45567847fcd1889c4663926",
      projectMetadataRegistry: "0xb2df764e3923dc225a4f4a4d8db8edb7defe2a5d",
      projectRights: "0x088e8c6da4296dc79bb25f9b89430da2b70f9a6d",
      scriptStorage: "0x8468b289bc286ce319c43b512ee0bee0b265606d",
      templateRegistry: "0xdb1f0a2d245658afa60ce43e93db962adcb9dfb0",
      artRuntimeRegistry: "0xbb5721ff1c07c5a3d537a586e1ef3c8e0e615850",
      solidityGenerativeRuntimeV1: "0x7e34f2aeed7c7ae2fb16a13bb3556f411725050b",
      protocolTimelock: "0x4cd1999847ec56650735620d423d2686c37639c1",
      // Robinhood is the ONLY chain with a second, non-WETH quote lane.
      quoteAssetRegistry: "0x84c253821cf2a967ebe1840cc350b2d60b07d861",
      multiQuoteEconomicKernel: "0x078f997f0b694b3bb4a807c4e7b65d519f073eee",
      immutableLiquidityKernel: "0x82c43a8afd304732698f086fdbb6e62a0a6813cc",
      robinhoodV4SwapRouter: "0x567ac7b2b70c8a134b7796816e0b465cc2791d16",
    }),
  }),
  56: null, // BNB Smart Chain — deferred: no proven egress route for the buy-and-entomb half.
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
 * RC6 platform contracts per chain — GENERATED, and currently `null` everywhere.
 *
 * The launchpad's own RC6 deployment packages carry deterministic addresses for all four chains.
 * They are not published here, and the reason is not caution for its own sake: those packages are
 * `PREPARED_UNSIGNED` with `signed: false` and `broadcast: false`, so nothing at those addresses
 * exists, and they are re-derived from the source tree — an in-flight change to the factory moves
 * every one of them, including all ten mined hook addresses. An address a creator can copy but
 * cannot use is worse than one they have to go and ask for.
 *
 * `npm run kit:deployments:sync` fills this in from the launchpad's packages and REFUSES to write
 * an address from a package that is not broadcast, so the emptiness below cannot be filled by
 * mistake — only by a real broadcast.
 */
export const RC6_DEPLOYMENTS = Object.freeze({
  1: null, // not deployed — package is PREPARED_UNSIGNED (signed: false, broadcast: false)
  56: null, // not deployed — package is PREPARED_UNSIGNED (signed: false, broadcast: false)
  4663: null, // not deployed — package is PREPARED_UNSIGNED (signed: false, broadcast: false)
  8453: null, // not deployed — package is PREPARED_UNSIGNED (signed: false, broadcast: false)
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

/** @deprecated Prefer `deploymentsFor(generation)`; this is the current DEPLOYED generation's table. */
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

/** Chain ids with a live platform in `generation`, ascending. Does NOT imply public launches. */
export function deployedChainIds(generation = CURRENT_DEPLOYED_GENERATION) {
  const table = deploymentsFor(generation);
  return Object.keys(table)
    .map(Number)
    .filter((id) => table[id] !== null)
    .sort((a, b) => a - b);
}

/** Chain ids with a live platform in the current DEPLOYED generation, ascending. */
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
 * Whether `chainId` will accept an ordinary creator launch right now, in `generation`.
 * Currently false everywhere. Kept as a function rather than a constant so tools read the CURRENT
 * record instead of baking in today's answer.
 * @param {number} chainId
 * @param {string} [generation]
 */
export function acceptsPublicLaunches(chainId, generation = CURRENT_DEPLOYED_GENERATION) {
  const d = platformDeployment(chainId, generation);
  return d !== null && d.launchAccess === "PUBLIC";
}

/**
 * A one-line, honest status string for CLI output. Always names the generation, because "not
 * deployed" and "deployed but closed" are different sentences and a creator needs to know which
 * generation each one is about.
 * @param {number} chainId
 * @param {string} [generation]
 */
export function launchAvailability(chainId, generation = CURRENT_DEPLOYED_GENERATION) {
  const g = platformGeneration(generation);
  const d = platformDeployment(chainId, generation);
  if (d === null) {
    return g.status === "NOT_DEPLOYED" ? `${g.id} is not deployed on any chain` : `${g.id} is not deployed on this chain`;
  }
  if (d.launchAccess === "PUBLIC") return `${g.id} live — accepting creator launches`;
  return `${g.id} contracts live, public creation not yet open`;
}

/** Explorer URL for a contract on `chainId`. @param {number} chainId @param {string} address */
export function explorerAddressUrl(chainId, address, generation = CURRENT_DEPLOYED_GENERATION) {
  const d = platformDeployment(chainId, generation);
  if (d === null) throw new Error(`explorerAddressUrl(${chainId}, ${JSON.stringify(generation)}): that generation has no deployment on this chain`);
  return `${d.explorer}/address/${address}`;
}
