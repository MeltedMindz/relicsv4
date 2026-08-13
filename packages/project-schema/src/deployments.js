// SPDX-License-Identifier: MIT
//
// LIVE PLATFORM DEPLOYMENTS — the addresses a bundle will actually be launched against.
//
// This file exists so a creator can answer three questions from the kit alone, without trusting a
// website: which chains are live, what the platform contracts are on each, and whether the chain
// will currently accept THEIR launch. Every address below is source-verified on that chain's
// explorer; the whole set is CREATE2-derived from one frozen source tree and was reconciled
// address-by-address after deployment.
//
// READ THIS BEFORE PLANNING A LAUNCH DATE:
//
//   The contracts are DEPLOYED. Permissionless creation is NOT OPEN.
//
// Every factory is in `PREPARED`, which refuses an ordinary `launch` — only a bounded set of
// deployer-only canaries is admissible. Opening public creation is a separate, ONE-WAY timelock
// operation that has not been scheduled. So today you can build, validate and export a real
// `.relics` bundle and confirm exactly which contracts it targets; you cannot broadcast one yet.
// That is a deliberate sequencing decision, not a missing feature, and this file will say
// `launchAccess: "PUBLIC"` when it changes.

/** @typedef {"PREPARED"|"PUBLIC"} LaunchAccess */

export const PLATFORM_RELEASE = Object.freeze({
  tag: "v1.0.0-rc5",
  freezeCommit: "d68469c93f3972a78a42e23578fcf9e685a9274d",
  solidityTree: "e451884c71bc93de52a110bf37daa98b5d153a92",
  deployedAt: "2026-08-13",
  externalAudit: "NOT_PERFORMED",
});

/**
 * Deployed platform contracts per chain.
 *
 * `null` for a chain means NOT DEPLOYED — not "unknown", and never a reason to substitute an
 * address from another chain. Chain 56 (BNB) is deliberately absent: its buy-and-entomb half has
 * no egress route in this release, so deploying it would strand funds. It is deferred to a future
 * generation rather than shipped half-working.
 */
export const PLATFORM_DEPLOYMENTS = Object.freeze({
  1: Object.freeze({
    chainId: 1,
    label: "Ethereum",
    launchAccess: /** @type {LaunchAccess} */ ("PREPARED"),
    explorer: "https://etherscan.io",
    contracts: Object.freeze({
      launchpadFactory: "0xe887e4601fde28e1981142e715b4b2e9b4ab2319",
      artStreamableFeesLocker: "0xfcc073d0e863dee90e9795f551f0748ceb6bfd8d",
      projectRegistry: "0x277aaa0673fbfbdd182907af3491f8da8a0fdb84",
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
    launchAccess: /** @type {LaunchAccess} */ ("PREPARED"),
    explorer: "https://basescan.org",
    contracts: Object.freeze({
      launchpadFactory: "0x62a6c28ce2622dcb2acf3ff89e6f9dae3d1d92c2",
      artStreamableFeesLocker: "0xba2172316bbd48ad6b6d018c93b41da5f16e5f3b",
      projectRegistry: "0x5df3bcd0bd2a74d00b4490e1c799a8d8d3947da9",
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
    launchAccess: /** @type {LaunchAccess} */ ("PREPARED"),
    explorer: "https://robinhoodchain.blockscout.com",
    contracts: Object.freeze({
      launchpadFactory: "0x7694f2b0db5c33df40c3a5fd5c41a16ff471afcf",
      artStreamableFeesLocker: "0x9fb8f21253f33d978e974938a296b2f1a03e07d2",
      projectRegistry: "0x2b73450dd74b06d0c45567847fcd1889c4663926",
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
    }),
  }),
  56: null, // BNB Smart Chain — deferred, see the note at the top of this file.
});

/** Chain ids with a live platform, ascending. Does NOT imply they accept public launches. */
export const DEPLOYED_CHAIN_IDS = Object.freeze(
  Object.keys(PLATFORM_DEPLOYMENTS)
    .map(Number)
    .filter((id) => PLATFORM_DEPLOYMENTS[id] !== null)
    .sort((a, b) => a - b),
);

/**
 * The deployment record for `chainId`.
 * THROWS on an unknown chain rather than returning undefined: a caller that silently proceeds with
 * `undefined.contracts.launchpadFactory` produces a far worse error later, and there is no sensible
 * default platform to fall back to.
 * @param {number} chainId
 */
export function platformDeployment(chainId) {
  if (!(chainId in PLATFORM_DEPLOYMENTS)) {
    throw new Error(
      `platformDeployment(${chainId}): unknown chain. Supported: ${Object.keys(PLATFORM_DEPLOYMENTS).join(", ")}`,
    );
  }
  return PLATFORM_DEPLOYMENTS[chainId];
}

/** @param {number} chainId */
export function isPlatformDeployed(chainId) {
  return platformDeployment(chainId) !== null;
}

/**
 * Whether `chainId` will accept an ordinary creator launch right now.
 * Currently false everywhere — see the header. Kept as a function rather than a constant so tools
 * read the CURRENT record instead of baking in today's answer.
 * @param {number} chainId
 */
export function acceptsPublicLaunches(chainId) {
  const d = platformDeployment(chainId);
  return d !== null && d.launchAccess === "PUBLIC";
}

/**
 * A one-line, honest status string for CLI output.
 * @param {number} chainId
 */
export function launchAvailability(chainId) {
  const d = platformDeployment(chainId);
  if (d === null) return "not deployed — deferred to a future release";
  if (d.launchAccess === "PUBLIC") return "live — accepting creator launches";
  return "contracts live, public creation not yet open";
}

/** Explorer URL for a contract on `chainId`. @param {number} chainId @param {string} address */
export function explorerAddressUrl(chainId, address) {
  const d = platformDeployment(chainId);
  if (d === null) throw new Error(`explorerAddressUrl(${chainId}): chain has no deployment`);
  return `${d.explorer}/address/${address}`;
}
