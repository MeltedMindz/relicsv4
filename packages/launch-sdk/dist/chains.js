// SPDX-License-Identifier: MIT
// Chain profiles for the public launch SDK.
//
// THE CHECKED-IN RECORD IS AN EXPECTATION, NEVER AN AUTHORITY. `@relics/project-schema`'s
// `RC6_DEPLOYMENTS` carries addresses AND a `launchAccess` string. The addresses are stable facts
// about where to look; `launchAccess` is a snapshot of a value that lives on chain and can change
// without this file changing. This module therefore exposes the record as `expected*` and every
// consumer is required to CONTRADICT it with a live read before acting.
//
// That distinction is the whole reason `STALE_DOC_CAN_ENABLE_CHAIN=NO` is testable: nothing in this
// SDK reads `expectedLaunchAccess` to decide whether a launch may proceed. It is carried only so a
// preflight can say "the record said PUBLIC and the chain says PREPARED", which is a more useful
// refusal than either half alone.
import { createPublicClient, defineChain, http } from "viem";
import { RC6_DEPLOYMENTS } from "@relics/project-schema";
/**
 * NATIVE CURRENCY IS A CHAIN-LOCAL FACT AND THERE IS DELIBERATELY NO `?? "ETH"`.
 *
 * BNB settles in WBNB and pays gas in BNB. A plausible wrong symbol printed beside a creator's gas
 * balance is worse than a refusal, so an unknown chain throws rather than guessing.
 */
const NATIVE_SYMBOL = { 1: "ETH", 8453: "ETH", 4663: "ETH", 56: "BNB" };
const RPC_ENV_KEY = { 1: "ETHEREUM_RPC_URL", 8453: "BASE_RPC_URL", 4663: "ROBINHOOD_RPC_URL", 56: "BNB_RPC_URL" };
const PUBLIC_FALLBACK = {
    1: "https://eth.drpc.org",
    8453: "https://mainnet.base.org",
    4663: "https://rpc.robinhoodchain.com",
    56: null,
};
/** Every chain the public record knows about, deployed or not. Deployment is checked separately. */
export function knownChainIds() {
    return Object.keys(RC6_DEPLOYMENTS)
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
}
export function getChainProfile(chainId) {
    const record = RC6_DEPLOYMENTS[String(chainId)];
    if (!record)
        return null;
    const nativeSymbol = NATIVE_SYMBOL[chainId];
    if (!nativeSymbol) {
        throw new Error(`getChainProfile(${chainId}): no native currency symbol is declared for this chain. ` +
            "There is deliberately no default — printing a plausible wrong symbol beside a gas balance " +
            "is worse than refusing. Add the chain to NATIVE_SYMBOL when it is genuinely supported.");
    }
    return {
        chainId,
        label: record.label ?? String(chainId),
        explorer: record.explorer ?? "",
        nativeSymbol,
        contracts: Object.freeze({ ...(record.contracts ?? {}) }),
        expectedLaunchAccess: record.launchAccess ?? null,
        rpcEnvKey: RPC_ENV_KEY[chainId] ?? `CHAIN_${chainId}_RPC_URL`,
        publicFallbackRpc: PUBLIC_FALLBACK[chainId] ?? null,
    };
}
/**
 * Which endpoint this chain will be read through, and WHERE that came from — but never the value
 * in any returned diagnostic. A credentialed URL leaking into a receipt or a log line is the exact
 * shape of secret disclosure this whole system is built to avoid, so `source` is what callers print.
 */
export function resolveRpc(profile, explicitUrl) {
    if (explicitUrl)
        return { url: explicitUrl, source: "EXPLICIT", envKey: profile.rpcEnvKey };
    const fromEnv = process.env[profile.rpcEnvKey];
    if (fromEnv && fromEnv.length > 0)
        return { url: fromEnv, source: "ENV", envKey: profile.rpcEnvKey };
    if (profile.publicFallbackRpc)
        return { url: profile.publicFallbackRpc, source: "PUBLIC_FALLBACK", envKey: profile.rpcEnvKey };
    return null;
}
export function makeClient(profile, explicitUrl) {
    const rpc = resolveRpc(profile, explicitUrl);
    if (!rpc)
        return null;
    const chain = defineChain({
        id: profile.chainId,
        name: profile.label,
        nativeCurrency: { name: profile.nativeSymbol, symbol: profile.nativeSymbol, decimals: 18 },
        rpcUrls: { default: { http: [rpc.url] } },
    });
    return { client: createPublicClient({ chain, transport: http(rpc.url, { timeout: 20_000 }) }), rpc };
}
