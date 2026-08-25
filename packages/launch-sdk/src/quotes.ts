// SPDX-License-Identifier: MIT
// ================================================================================================
// QUOTE ASSET SELECTION — READ LIVE, NEVER HARDCODED TO WETH.
//
// WHY THIS IS ITS OWN CAREFUL MODULE. The 666 launch settles its royalties in USDG while the
// revenue collector's asset is immutable WETH, so the money was unreachable until somebody
// converted it. That is what "assume WETH" costs after the fact: not a wrong label, an
// unclaimable balance on an immutable contract. A quote asset is a per-chain, per-market fact and
// every field below — address, decimals, admission — is READ, not assumed.
//
// DECIMALS ARE READ FROM THE TOKEN. Assuming 18 is the specific mistake that turns a 6-decimal
// quote into a 10^12 error in every price this SDK would compute. Robinhood's stock tokens are not
// all 18.
//
// A CHAIN WITH NO MULTI-QUOTE LANE HAS EXACTLY ONE QUOTE: its wrapped native. That is read from the
// factory's own `chainBinding()`, not from a table here.
// ================================================================================================
import { getAddress, type Address, type PublicClient } from "viem";
import { FACTORY_ABI } from "./abi.js";
import type { Evidence } from "./contracts.js";

const ERC20_METADATA_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/**
 * `QuoteAssetRegistryV1`'s read surface, taken from the deployed Solidity rather than guessed.
 *
 * THE FIRST VERSION OF THIS GUESSED `assetCount()`/`assetAt()` AND WAS WRONG. Those selectors
 * revert on the deployed registry, so enumeration never ran — and the failure was SILENT in the
 * worst possible way: the revert landed in `errors`, `complete` went false, and the selector still
 * confidently returned the wrapped native. An unread registry produced a confident answer, which is
 * the precise failure this whole module exists to prevent. Both halves are fixed: the right
 * selectors, and a refusal below when the inventory is incomplete.
 *
 * `isSelectableForNewLaunch` IS A DIFFERENT QUESTION FROM `isAdmitted` AND IS THE ONE A LAUNCH
 * NEEDS. An asset can be admitted to the registry — historically valid, existing pools quoted
 * against it — while no longer being offered for NEW launches. Choosing on admission alone would
 * build a launch the factory then refuses.
 */
const QUOTE_REGISTRY_ABI = [
  { type: "function", name: "isAdmitted", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isSelectableForNewLaunch", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "admittedCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "admittedAt", stateMutability: "view", inputs: [{ name: "i", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

export interface QuoteCandidate {
  readonly chainId: number;
  readonly symbol: string;
  readonly address: Address;
  readonly decimals: number;
  /** PROVEN only when the chain said so. An unread registry is UNKNOWN, never "not admitted". */
  readonly admitted: Evidence;
  readonly isWrappedNative: boolean;
  readonly detail: string;
}

export interface QuoteInventory {
  readonly chainId: number;
  readonly multiQuoteWired: boolean;
  readonly candidates: readonly QuoteCandidate[];
  readonly errors: readonly string[];
  /** True only when every candidate's admission was actually established. */
  readonly complete: boolean;
}

/**
 * Read this chain's usable quote assets from the chain.
 *
 * The wrapped native comes from `factory.chainBinding()`, which is the factory's own statement of
 * what it settles in — not from a symbol table that could disagree with the deployment.
 */
export async function getQuoteAssets(client: PublicClient, factory: Address): Promise<QuoteInventory> {
  const errors: string[] = [];
  const candidates: QuoteCandidate[] = [];
  let chainId = 0;
  let multiQuoteWired = false;

  let wrappedNative: Address | null = null;
  try {
    const binding = (await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "chainBinding" })) as readonly unknown[];
    chainId = Number(binding[0]);
    wrappedNative = getAddress(binding[2] as Address);
  } catch (err) {
    errors.push(`chainBinding() failed: ${err instanceof Error ? err.message : String(err)}`);
    return { chainId, multiQuoteWired, candidates, errors, complete: false };
  }

  let registry: Address | null = null;
  try {
    const lane = (await client.readContract({ address: factory, abi: FACTORY_ABI(), functionName: "multiQuoteLane" })) as readonly unknown[];
    multiQuoteWired = Boolean(lane[4]);
    const candidateRegistry = getAddress(lane[0] as Address);
    if (multiQuoteWired && candidateRegistry !== "0x0000000000000000000000000000000000000000") registry = candidateRegistry;
  } catch (err) {
    errors.push(`multiQuoteLane() failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ---- the wrapped native is always a quote on a chain that settles in it ---------------------
  const wn = await describeToken(client, wrappedNative, errors);
  candidates.push({
    chainId, symbol: wn.symbol, address: wrappedNative, decimals: wn.decimals,
    admitted: wn.read ? "PROVEN" : "UNKNOWN",
    isWrappedNative: true,
    detail: wn.read
      ? `the factory's own chainBinding() names ${wn.symbol} as this chain's wrapped native settlement asset`
      : "the wrapped native's metadata could not be read; its admission is UNKNOWN rather than assumed",
  });

  // ---- the multi-quote registry, when this chain has one --------------------------------------
  if (registry) {
    try {
      const count = Number(await client.readContract({ address: registry, abi: QUOTE_REGISTRY_ABI, functionName: "admittedCount" }));
      for (let i = 0; i < count; i++) {
        try {
          const asset = getAddress((await client.readContract({ address: registry, abi: QUOTE_REGISTRY_ABI, functionName: "admittedAt", args: [BigInt(i)] })) as Address);
          if (asset === wrappedNative) continue;
          const selectable = (await client.readContract({ address: registry, abi: QUOTE_REGISTRY_ABI, functionName: "isSelectableForNewLaunch", args: [asset] })) as boolean;
          const meta = await describeToken(client, asset, errors);
          candidates.push({
            chainId, symbol: meta.symbol, address: asset, decimals: meta.decimals,
            admitted: !meta.read ? "UNKNOWN" : selectable ? "PROVEN" : "REFUTED",
            isWrappedNative: false,
            detail: !meta.read ? "token metadata unreadable, so selectability cannot be asserted" : selectable ? "selectable for a new launch by the quote registry" : "admitted to the registry but NOT selectable for a new launch",
          });
        } catch (err) {
          errors.push(`quote asset ${i} could not be read: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`quote registry enumeration failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { chainId, multiQuoteWired, candidates, errors, complete: errors.length === 0 };
}

/**
 * Choose a quote deterministically within policy.
 *
 * PREFERS THE WRAPPED NATIVE when policy allows it, because it is the one asset every chain's
 * buy-and-entomb route can already settle. A non-native quote is a real choice with a real
 * consequence — an allocation can rest in that asset indefinitely when no approved route exists —
 * so it is taken only when the policy names it.
 */
export function selectQuote(inventory: QuoteInventory, allowed: "AUTO" | readonly string[]): { quote: QuoteCandidate | null; reason: string } {
  // AN INCOMPLETE INVENTORY REFUSES. This guard is here because its absence shipped: with the
  // wrong enumeration selectors the registry read reverted, `complete` went false, and this
  // function cheerfully returned the wrapped native anyway. The caller could not tell "this chain
  // offers only WETH" from "we failed to ask what this chain offers", and those are the same
  // sentence with opposite meanings. A quote is immutable for the life of a market, so guessing
  // it is not a recoverable mistake.
  if (!inventory.complete) {
    return {
      quote: null,
      reason: `the quote inventory for chain ${inventory.chainId} is INCOMPLETE, so no quote may be selected from it: ${inventory.errors.join("; ") || "one or more reads failed"}. This is an unread registry, not an empty one — the remedy is to retry, never to fall back to the wrapped native.`,
    };
  }
  const usable = inventory.candidates.filter((c) => c.admitted === "PROVEN");
  if (usable.length === 0) {
    const unknowns = inventory.candidates.filter((c) => c.admitted === "UNKNOWN");
    return {
      quote: null,
      reason: unknowns.length > 0
        ? `no quote asset could be PROVEN admitted on chain ${inventory.chainId}; ${unknowns.length} could not be read at all. That is an unread registry, not an empty one — retrying is the remedy, and inventing a quote is not.`
        : `no quote asset is admitted on chain ${inventory.chainId}`,
    };
  }
  if (allowed === "AUTO") {
    const native = usable.find((c) => c.isWrappedNative);
    if (native) return { quote: native, reason: `AUTO selected ${native.symbol}, this chain's wrapped native settlement asset` };
    return { quote: usable[0]!, reason: `AUTO selected ${usable[0]!.symbol}: the only admitted quote on this chain` };
  }
  for (const symbol of allowed) {
    const hit = usable.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
    if (hit) return { quote: hit, reason: `policy named ${symbol} and the chain reports it admitted` };
  }
  return { quote: null, reason: `none of the policy's quote assets (${allowed.join(", ")}) is admitted on chain ${inventory.chainId}. The admitted ones are: ${usable.map((u) => u.symbol).join(", ") || "none"}.` };
}

async function describeToken(client: PublicClient, address: Address, errors: string[]): Promise<{ symbol: string; decimals: number; read: boolean }> {
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: ERC20_METADATA_ABI, functionName: "symbol" }) as Promise<string>,
      client.readContract({ address, abi: ERC20_METADATA_ABI, functionName: "decimals" }) as Promise<number>,
    ]);
    return { symbol, decimals: Number(decimals), read: true };
  } catch (err) {
    errors.push(`token metadata at ${address} unreadable: ${err instanceof Error ? err.message : String(err)}`);
    // NOT a default of 18. The caller marks admission UNKNOWN on `read: false`, and this number is
    // never used to compute a price — a wrong decimals is a 10^12 error in every figure downstream.
    return { symbol: "UNREADABLE", decimals: -1, read: false };
  }
}
