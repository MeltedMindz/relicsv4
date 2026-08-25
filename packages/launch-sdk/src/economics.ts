// SPDX-License-Identifier: MIT
// ================================================================================================
// ECONOMIC RECONSTRUCTION FROM THE FINAL CALLDATA.
//
// THE INPUT IS THE BYTES THAT WILL BE SIGNED, NOT THE OBJECT THAT BUILT THEM. Everything here is
// DECODED back out of `data` using the committed RC6 ABI, then re-derived. That is the whole point:
// a UI-friendly summary computed earlier, from the same object that produced the calldata, cannot
// catch a divergence between the two — it agrees with the object by construction. Decoding the
// bytes is the only reconstruction that can disagree.
//
// LABELS ARE NOT NUMBERS. `startingPreset` is LOW/MID/HIGH on the wire; this module reports the
// preset AND says plainly that its numeric effect is set by the deployed policy contract rather
// than by a constant here, because inventing the geometry would be exactly the fabrication the
// rest of this SDK refuses.
// ================================================================================================
import { decodeFunctionData, formatUnits, type Abi, type Address, type Hex } from "viem";
import { FACTORY_ABI } from "./abi.js";
import { AntiSnipeMode, BurnPolicy, ArtMode, StartingPreset, type LaunchParams } from "./vendor/types.js";
import { unpackCreatorEarnings } from "./vendor/creatorEarnings.js";
import { WHOLE_UNIT } from "./vendor/constants.js";
import type { AgentPolicy } from "./contracts.js";

const NAME_OF = <T extends Record<string, number>>(obj: T, v: number): string => Object.entries(obj).find(([, n]) => n === v)?.[0] ?? `UNKNOWN(${v})`;

export interface QuoteAssetFact {
  readonly symbol: string;
  readonly address: Address;
  readonly decimals: number;
}

export interface ReconstructedEconomics {
  readonly decodedFromCalldata: true;
  readonly name: string;
  readonly symbol: string;
  readonly totalSupplyWei: bigint;
  readonly totalSupplyWhole: string;
  readonly artworkSupply: bigint;
  readonly backingUnitsPerArtwork: bigint;
  /** Whole project tokens escrowed to awaken the ENTIRE artwork supply. */
  readonly totalBackingWhole: bigint;
  readonly backingShareOfSupply: string;
  readonly startingPreset: string;
  readonly openingGeometry: string;
  readonly quote: QuoteAssetFact | null;
  readonly artMode: string;
  readonly artTemplateId: bigint;
  readonly artConfigBytes: number;
  readonly antiSnipeMode: string;
  readonly burnPolicy: string;
  readonly creatorRecipient: Address;
  readonly collaborators: readonly { recipient: Address; bps: number }[];
  readonly creatorEarnings: { mode: number; royaltyBps: number; policyVersion: number };
  readonly feeSplit: { creatorBps: number; platformBps: number; note: string };
  readonly metadataUriHash: Hex;
}

export interface EconomicSanityResult {
  readonly ok: boolean;
  readonly economics: ReconstructedEconomics;
  readonly problems: readonly { code: string; detail: string }[];
  readonly warnings: readonly string[];
}

/** Decode the 19-field tuple back out of the exact bytes that will be signed. */
export function decodeLaunchCalldata(data: Hex, abi: Abi = FACTORY_ABI()): LaunchParams {
  const { functionName, args } = decodeFunctionData({ abi, data });
  if (functionName !== "launch") throw new Error(`decodeLaunchCalldata: calldata calls ${functionName}(), not launch()`);
  return (args as readonly unknown[])[0] as LaunchParams;
}

/**
 * Reconstruct the opening economics, then check them against the creator's intent and the policy.
 *
 * `intent` is what the project SAID it wanted. Disagreement between it and the bytes is a refusal,
 * not a warning: it means the thing about to be signed is not the thing that was configured.
 */
export function reconstructAndCheck(args: {
  data: Hex;
  policy: AgentPolicy;
  quote: QuoteAssetFact | null;
  intent?: { totalSupplyWhole?: bigint; artworkSupply?: bigint; antiSnipeMode?: string; royaltyBps?: number };
  abi?: Abi;
}): EconomicSanityResult {
  const p = decodeLaunchCalldata(args.data, args.abi ?? FACTORY_ABI());
  const problems: { code: string; detail: string }[] = [];
  const warnings: string[] = [];

  const earnings = unpackCreatorEarnings(p.creatorEarnings);
  const totalBackingWhole = p.artworkBackingUnits * p.backingUnitsPerArtwork;
  const totalSupplyWhole = p.totalSupply / WHOLE_UNIT;

  const economics: ReconstructedEconomics = {
    decodedFromCalldata: true,
    name: p.name,
    symbol: p.symbol,
    totalSupplyWei: p.totalSupply,
    totalSupplyWhole: formatUnits(p.totalSupply, 18),
    artworkSupply: p.artworkBackingUnits,
    backingUnitsPerArtwork: p.backingUnitsPerArtwork,
    totalBackingWhole,
    backingShareOfSupply: totalSupplyWhole > 0n ? `${(Number((totalBackingWhole * 10000n) / totalSupplyWhole) / 100).toFixed(2)}%` : "n/a",
    startingPreset: NAME_OF(StartingPreset as unknown as Record<string, number>, Number(p.startingPreset)),
    // THE PRESET'S NUMERIC EFFECT IS A CONTRACT FACT, NOT A CONSTANT HERE. `LaunchPolicyV1` decides
    // the opening tick and liquidity for a preset; restating a number in this file would be a
    // second declaration that agrees until the policy contract is upgraded, and then silently lies.
    openingGeometry: `startingPreset=${NAME_OF(StartingPreset as unknown as Record<string, number>, Number(p.startingPreset))}; the opening tick and genesis liquidity are computed on chain by LaunchPolicyV1 and are returned by simulate() as genesisLiquidity/poolId. This SDK does not restate them.`,
    quote: args.quote,
    artMode: NAME_OF(ArtMode as unknown as Record<string, number>, Number(p.artMode)),
    artTemplateId: p.artTemplateId,
    artConfigBytes: (p.artConfig.length - 2) / 2,
    antiSnipeMode: NAME_OF(AntiSnipeMode as unknown as Record<string, number>, Number(p.antiSnipeMode)),
    burnPolicy: NAME_OF(BurnPolicy as unknown as Record<string, number>, Number(p.burnPolicy)),
    creatorRecipient: p.creatorRecipient,
    collaborators: p.collaborators.map((c) => ({ recipient: c.recipient, bps: c.bps })),
    // `policyVersion` is the vendored field name; 0 means "no preference", which the chain
    // resolves to its default — and which Robinhood Chain then REFUSES for an ENFORCED election,
    // because version 1's validator holds no code there. Reported as read, never normalised.
    creatorEarnings: { mode: earnings.mode, royaltyBps: earnings.royaltyBps, policyVersion: earnings.policyVersion ?? 0 },
    feeSplit: {
      creatorBps: 7500,
      platformBps: 2500,
      note: "Collected LP fees split 75% creator / 25% platform. The platform's own 25% splits in half: retained treasury and RELICS buy-and-entomb. Conversion costs fall on the platform share alone, never on a creator's.",
    },
    metadataUriHash: p.metadataUriHash,
  };

  // ---- structural sanity, derived from the bytes -----------------------------------------------
  if (p.totalSupply <= 0n) problems.push({ code: "ZERO_SUPPLY", detail: "totalSupply is zero" });
  if (p.artworkBackingUnits <= 0n) problems.push({ code: "ZERO_ARTWORK_SUPPLY", detail: "artworkBackingUnits is zero: the collection could never mint an artwork" });
  if (p.backingUnitsPerArtwork <= 0n) problems.push({ code: "ZERO_BACKING", detail: "backingUnitsPerArtwork is zero, which the factory refuses" });
  if (totalBackingWhole * WHOLE_UNIT > p.totalSupply) {
    problems.push({ code: "BACKING_EXCEEDS_SUPPLY", detail: `awakening every artwork would escrow ${totalBackingWhole} whole tokens, more than the ${totalSupplyWhole} that exist` });
  }
  if (p.creatorRecipient === "0x0000000000000000000000000000000000000000") {
    problems.push({ code: "ZERO_RECIPIENT", detail: "creatorRecipient is the zero address: the creator fee stream would be unclaimable forever" });
  }
  if (Number(p.antiSnipeMode) === AntiSnipeMode.UNSPECIFIED) {
    problems.push({ code: "ANTISNIPE_UNSPECIFIED", detail: "antiSnipeMode is UNSPECIFIED (0), which the factory refuses. A launch that forgot to elect must not be mistaken for one that chose no protection." });
  }
  const collabBps = p.collaborators.reduce((s, c) => s + Number(c.bps), 0);
  if (collabBps > 10_000) problems.push({ code: "COLLABORATORS_OVER_100", detail: `collaborator shares total ${collabBps} bps of the creator's 75%, which exceeds 100%` });

  // ---- POLICY BOUNDS, recomputed from the bytes rather than from the plan ------------------------
  if (p.creatorRecipient.toLowerCase() !== args.policy.creatorRecipient.toLowerCase()) {
    problems.push({ code: "RECIPIENT_NOT_POLICY_RECIPIENT", detail: `the calldata pays ${p.creatorRecipient} but the policy authorises ${args.policy.creatorRecipient}` });
  }
  if (earnings.royaltyBps > args.policy.maxRoyaltyBps) {
    problems.push({ code: "ROYALTY_ABOVE_POLICY", detail: `royalty ${earnings.royaltyBps} bps exceeds policy.maxRoyaltyBps ${args.policy.maxRoyaltyBps}` });
  }
  const electionName = economics.antiSnipeMode as "NONE" | "PROTECTED_98_MINUTES";
  if (!args.policy.allowedAntiSnipeModes.includes(electionName)) {
    problems.push({ code: "ANTISNIPE_NOT_ALLOWED", detail: `the calldata elects ${electionName}, which policy.allowedAntiSnipeModes does not permit` });
  }

  // ---- INTENT, if the caller stated one ----------------------------------------------------------
  if (args.intent?.totalSupplyWhole !== undefined && args.intent.totalSupplyWhole !== totalSupplyWhole) {
    problems.push({ code: "SUPPLY_NOT_AS_CONFIGURED", detail: `the project configured ${args.intent.totalSupplyWhole} whole tokens; the calldata carries ${totalSupplyWhole}` });
  }
  if (args.intent?.artworkSupply !== undefined && args.intent.artworkSupply !== p.artworkBackingUnits) {
    problems.push({ code: "ARTWORK_SUPPLY_NOT_AS_CONFIGURED", detail: `the project configured ${args.intent.artworkSupply} artworks; the calldata carries ${p.artworkBackingUnits}` });
  }
  if (args.intent?.antiSnipeMode !== undefined && args.intent.antiSnipeMode !== electionName) {
    problems.push({ code: "ANTISNIPE_NOT_AS_CONFIGURED", detail: `the project elected ${args.intent.antiSnipeMode}; the calldata carries ${electionName}` });
  }

  if (args.quote === null) {
    warnings.push("no quote asset fact was supplied, so the implied opening price and FDV cannot be stated in quote units. An unstated price is reported as absent, never as zero.");
  }

  return { ok: problems.length === 0, economics, problems, warnings };
}
