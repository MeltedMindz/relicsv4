// SPDX-License-Identifier: MIT
// Typed LaunchParams builder. Mirrors LaunchpadFactory._validate so obviously-invalid params are
// caught client-side before a wallet ever signs anything; the contract's own checks remain the
// final authority (see readiness.ts, which simulates the real call).
import { keccak256, type Address, type Hex } from "viem";
import { WHOLE_UNIT, MAX_COLLABORATORS } from "./constants.js";
import {
  AntiSnipeMode,
  ArtMode,
  BurnPolicy,
  StartingPreset,
  metadataDigestForUri,
  type AntiSnipeElection,
  type ArtModeValue,
  type BurnPolicyValue,
  type Collaborator,
  type LaunchParams,
  type StartingPresetValue,
} from "./types.js";
import {
  NO_CREATOR_EARNINGS,
  creatorEarningsProblems,
  packCreatorEarnings,
  unpackCreatorEarnings,
  type CreatorEarningsElection,
} from "./creatorEarnings.js";

export interface CreatorInput {
  name: string;
  symbol: string;
  /** Whole-token supply (e.g. 1_000_000n for 1,000,000 tokens); converted to wei internally. */
  totalSupplyWhole: bigint;
  /** Whole units reserved as artwork backing (== MAX_ACTIVE_ARTWORKS). */
  artworkBackingUnits: bigint;
  /**
   * Whole project tokens escrowed per artwork — "tokens required to awaken each NFT". Optional
   * here and ONLY here: omitting it means `1n`, full parity, which is what every RC6 launch did
   * before the term was configurable. THE UNIT IS WHOLE TOKENS: 25,000 tokens per artwork is
   * `25_000n`, never `25_000n * WHOLE_UNIT`.
   */
  backingUnitsPerArtwork?: bigint;
  startingPreset: StartingPresetValue;
  creatorRecipient: Address;
  collaborators?: Collaborator[];
  /**
   * The creator-selected, IMMUTABLE {BurnPolicy}. Optional here and ONLY here: omitting it means
   * `NONE`, which is the on-chain default and the state in which nothing is pre-selected. It is
   * never inferred from anything else, and a non-`NONE` value must be an explicit creator choice.
   */
  burnPolicy?: BurnPolicyValue;
  /**
   * THE CREATOR'S LAUNCH-PROTECTION ELECTION. REQUIRED, like `metadataUri` and unlike `burnPolicy`.
   *
   * `BurnPolicy.NONE` is a real thing a creator can mean by silence: it is the on-chain default and
   * the state in which nothing is pre-selected. `AntiSnipeMode` has no such value. Its zero is
   * `UNSPECIFIED`, which the factory REFUSES — deliberately, so that a lane which forgot to plumb
   * the election through produces a revert rather than an unprotected launch that reads as
   * deliberate. Making this optional here would put that default back, one layer up.
   *
   * Only `NONE` and `PROTECTED_98_MINUTES` are admitted; the type says so.
   */
  antiSnipeMode: AntiSnipeElection;
  /**
   * THE CREATOR'S NFT-EARNINGS ELECTION, settled INSIDE the launch.
   *
   * Optional here, like `burnPolicy` and unlike `antiSnipeMode`, and for the same reason: NONE is a
   * real thing a creator can mean by silence — it is the ERC-721 that pays nobody and validates
   * nothing, and it is what an RC6 collection used to be before anybody configured it. Omitting
   * this elects NONE explicitly, and the launch SETTLES that election rather than leaving a latch
   * open.
   *
   * ENFORCED IS NEVER REACHED BY SILENCE. It has to be named, with a rate and (on Robinhood Chain)
   * a policy version, and a chain that resolves no vetted validator REFUSES the whole launch rather
   * than quietly downgrading it.
   */
  creatorEarnings?: CreatorEarningsElection;
  /**
   * The canonical `ipfs://` metadata URI, ALREADY pinned, read back and verified.
   *
   * REQUIRED — deliberately not optional, unlike `burnPolicy`. `BurnPolicy.NONE` is a real default
   * a creator can mean; there is no metadata a creator can mean by silence. Omitting this would
   * either commit an empty collection or make this layer invent a URI on their behalf, and the
   * collection is complete-at-birth, so neither is correctable afterwards.
   *
   * The digest that reaches calldata is derived from it here, so the URI the server published to
   * the resolver and the digest the launch carries cannot come from two different strings.
   */
  metadataUri: string;
  /** SOLIDITY_SVG: a registered template id + its config bytes. JAVASCRIPT: raw script bytes. */
  art:
    | { mode: typeof ArtMode.SOLIDITY_SVG; artTemplateId: bigint; artConfig: Hex }
    | { mode: typeof ArtMode.JAVASCRIPT; artConfig: Hex };
  marketStateConfig?: Hex;
}

/** Full parity: one whole project token backs one artwork. The launch default. */
export const DEFAULT_BACKING_UNITS_PER_ARTWORK = 1n;

/** {LaunchPolicyV1}'s width guard on the per-artwork backing — the sale lane's own uint128. */
export const MAX_BACKING_UNITS_PER_ARTWORK = (1n << 128n) - 1n;

export class LaunchParamsValidationError extends Error {}

/** Client-side mirror of LaunchpadFactory._validate (excluding template-registry state, which
 * requires a live read — see readiness.ts). */
export function validateCreatorInput(input: CreatorInput): string[] {
  const problems: string[] = [];
  if (input.creatorRecipient === "0x0000000000000000000000000000000000000000") problems.push("creatorRecipient is the zero address");
  if (input.totalSupplyWhole <= 0n) problems.push("totalSupply must be > 0");
  // On-chain check is `artworkBackingUnits * WHOLE_UNIT > totalSupply` where totalSupply is
  // already in wei; totalSupplyWhole here is whole tokens, so scale both sides consistently.
  const backingPer = input.backingUnitsPerArtwork ?? DEFAULT_BACKING_UNITS_PER_ARTWORK;
  problems.push(...backingUnitsProblems(backingPer));
  if (input.artworkBackingUnits * backingPer > input.totalSupplyWhole) {
    problems.push("artworkBackingUnits * backingUnitsPerArtwork exceeds totalSupply (in whole-token terms)");
  }
  if (input.art.mode === ArtMode.SOLIDITY_SVG && input.art.artTemplateId === 0n) {
    problems.push("SOLIDITY_SVG mode requires a non-zero artTemplateId");
  }
  if (
    input.burnPolicy !== undefined &&
    input.burnPolicy !== BurnPolicy.NONE &&
    input.burnPolicy !== BurnPolicy.HOLDER_BURN &&
    input.burnPolicy !== BurnPolicy.HOLDER_AND_ALLOWANCE_BURN
  ) {
    problems.push(`burnPolicy ${String(input.burnPolicy)} is not admitted (NONE=0, HOLDER_BURN=1, HOLDER_AND_ALLOWANCE_BURN=2)`);
  }
  const collaborators = input.collaborators ?? [];
  if (collaborators.length > MAX_COLLABORATORS) problems.push(`too many collaborators (max ${MAX_COLLABORATORS})`);
  let bpsSum = 0;
  for (const c of collaborators) {
    if (c.recipient === "0x0000000000000000000000000000000000000000" || c.bps === 0) {
      problems.push(`invalid collaborator entry (${c.recipient}, ${c.bps}bps)`);
    }
    bpsSum += c.bps;
  }
  if (bpsSum > 10_000) problems.push("collaborator bps sum exceeds 10,000 (the full creator share)");
  problems.push(...antiSnipeProblems(input.antiSnipeMode));
  problems.push(...creatorEarningsProblems(input.creatorEarnings ?? NO_CREATOR_EARNINGS));
  return problems;
}

/**
 * The per-artwork backing check, shared by both validators so "which values are admitted" has one
 * answer. Mirrors {LaunchPolicyV1.validateLaunchParams}: zero is refused rather than defaulted, and
 * the value is uint128-bounded so the escrow product the collection computes cannot overflow.
 *
 * The message names WHOLE TOKENS deliberately. The likeliest way to get this field wrong is to send
 * a wei amount, and `66666000000000000000000` reads as a plausible number until you notice it is
 * 10^18 times the intended one.
 */
function backingUnitsProblems(units: bigint | undefined): string[] {
  if (units === undefined) {
    return ["backingUnitsPerArtwork is missing — the backing terms are written at the collection's birth and have no later transaction"];
  }
  if (units <= 0n) {
    return ["backingUnitsPerArtwork must be at least 1 (whole project tokens per artwork; 1 == full parity)"];
  }
  if (units > MAX_BACKING_UNITS_PER_ARTWORK) {
    return [`backingUnitsPerArtwork ${units} exceeds uint128 — the value is WHOLE tokens, not wei`];
  }
  return [];
}

/**
 * The election check, shared by both validators so "which values are admitted" has one answer.
 *
 * Mirrors `AntiSnipeModeLib.isAdmitted`: exactly `NONE` and `PROTECTED_98_MINUTES`. `UNSPECIFIED`
 * gets its own sentence because "0 is not admitted" reads like an off-by-one to whoever hits it,
 * and the actual meaning — nobody chose — is what they need to act on.
 */
function antiSnipeProblems(mode: unknown): string[] {
  if (mode === AntiSnipeMode.NONE || mode === AntiSnipeMode.PROTECTED_98_MINUTES) return [];
  if (mode === AntiSnipeMode.UNSPECIFIED) {
    return [
      "antiSnipeMode is UNSPECIFIED (0), which the factory refuses. It is not 'no protection' — " +
        "that is AntiSnipeMode.NONE (1), an election a creator makes and acknowledges. Zero means " +
        "nobody chose, and a launch cannot proceed on a schedule nobody chose and nobody can change.",
    ];
  }
  if (mode === undefined || mode === null) {
    return ["antiSnipeMode is missing — the creator's launch-protection election has no default and no later transaction to set it in"];
  }
  return [`antiSnipeMode ${String(mode)} is not an admitted AntiSnipeMode (NONE=1, PROTECTED_98_MINUTES=2)`];
}

/**
 * Builds a full LaunchParams from creator input + already-mined salts. Does NOT touch the
 * network; pure data assembly. `artScriptHash` is always recomputed as keccak256(artConfig) so it
 * can never drift from the bytes actually being submitted (LaunchpadFactory._storeArt reverts
 * BadArtHash otherwise).
 */
export function buildLaunchParams(input: CreatorInput, salts: { tokenSalt: Hex; hookSalt: Hex }): LaunchParams {
  const problems = validateCreatorInput(input);
  if (problems.length > 0) {
    throw new LaunchParamsValidationError(`invalid creator input: ${problems.join("; ")}`);
  }

  const totalSupply = input.totalSupplyWhole * WHOLE_UNIT;
  const artScriptHash = keccak256(input.art.artConfig);

  const params: LaunchParams = {
    name: input.name,
    symbol: input.symbol,
    totalSupply,
    artworkBackingUnits: input.artworkBackingUnits,
    startingPreset: input.startingPreset,
    tokenSalt: salts.tokenSalt,
    hookSalt: salts.hookSalt,
    artMode: input.art.mode as ArtModeValue,
    artTemplateId: input.art.mode === ArtMode.SOLIDITY_SVG ? input.art.artTemplateId : 0n,
    artScriptHash,
    artConfig: input.art.artConfig,
    marketStateConfig: input.marketStateConfig ?? "0x",
    creatorRecipient: input.creatorRecipient,
    collaborators: input.collaborators ?? [],
    burnPolicy: input.burnPolicy ?? BurnPolicy.NONE,
    // NO `??` HERE, AND THAT ASYMMETRY WITH `burnPolicy` ABOVE IS THE POINT. There is no
    // anti-snipe mode a creator means by silence; the on-chain zero is `UNSPECIFIED` and the
    // factory refuses it. `validateCreatorInput` has already refused an absent or inadmissible
    // election, so this is a carry, not a choice.
    antiSnipeMode: input.antiSnipeMode,
    // Derived from the URI, never accepted as a separate argument. Two inputs that must agree is
    // two inputs that can disagree, and the disagreement would only surface after the launch when
    // contractURI() resolved to nothing.
    metadataUriHash: metadataDigestForUri(input.metadataUri),
    // PACKED HERE, ONCE, by the module that mirrors the on-chain decoder. `?? NO_CREATOR_EARNINGS`
    // is the same asymmetry `burnPolicy` has and `antiSnipeMode` does not: NONE is a real election
    // a creator can mean by silence, and it is SETTLED rather than left open.
    creatorEarnings: packCreatorEarnings(input.creatorEarnings ?? NO_CREATOR_EARNINGS),
    // `?? 1n` is the `burnPolicy` asymmetry, not the `antiSnipeMode` one: full parity IS a real
    // election a creator can mean by silence, and it is what every RC6 launch before this field
    // existed made. The on-chain zero is refused, so the default is applied HERE, once, in whole
    // tokens — never in wei.
    backingUnitsPerArtwork: input.backingUnitsPerArtwork ?? DEFAULT_BACKING_UNITS_PER_ARTWORK,
  };

  if (params.artworkBackingUnits * params.backingUnitsPerArtwork * WHOLE_UNIT > params.totalSupply) {
    throw new LaunchParamsValidationError(
      `artworkBackingUnits (${params.artworkBackingUnits}) * backingUnitsPerArtwork ` +
        `(${params.backingUnitsPerArtwork}) * 1e18 exceeds totalSupply (${params.totalSupply})`,
    );
  }

  return params;
}

export interface LaunchParamsValidation {
  ok: boolean;
  problems: string[];
}

/**
 * FROZEN SDK export. Validates an ALREADY-BUILT `LaunchParams` object client-side, mirroring
 * `LaunchpadFactory._validate` field-for-field (creatorRecipient, totalSupply, artworkBackingUnits
 * vs whole-unit supply, SOLIDITY_SVG/JAVASCRIPT template-id shape, collaborator bounds/bps sum) —
 * plus the `_storeArt` art-hash/byte-limit checks. This is distinct from `validateCreatorInput`
 * (which validates the pre-build `CreatorInput` shape): `validateLaunchParams` is for a caller
 * that already has (or is editing) a raw `LaunchParams`, e.g. after `predictProjectAddresses`
 * round-trips one back, or a UI that lets an operator hand-edit params before mining salts.
 *
 * `templateIsActive` is OPTIONAL live state (TemplateRegistry.isActive(artTemplateId)) this
 * function cannot know off-chain; when omitted, the SOLIDITY_SVG template-active check is simply
 * skipped (never assumed true) — callers that need the full picture should also run
 * `simulateAtomicLaunch()`, which is the final authority (a real `eth_call` against the deployed
 * factory) and will catch a stale/deactivated template regardless.
 */
export function validateLaunchParams(params: LaunchParams, opts?: { scriptByteLimit?: number; templateIsActive?: boolean }): LaunchParamsValidation {
  const problems: string[] = [];
  if (params.creatorRecipient === "0x0000000000000000000000000000000000000000") {
    problems.push("creatorRecipient is the zero address");
  }
  if (params.totalSupply <= 0n) problems.push("totalSupply must be > 0");
  problems.push(...backingUnitsProblems(params.backingUnitsPerArtwork));
  if (params.backingUnitsPerArtwork > 0n && params.artworkBackingUnits * params.backingUnitsPerArtwork * WHOLE_UNIT > params.totalSupply) {
    problems.push("artworkBackingUnits * backingUnitsPerArtwork exceeds the whole-unit supply that could ever back it");
  }
  if (params.artMode === ArtMode.SOLIDITY_SVG) {
    if (params.artTemplateId === 0n) problems.push("SOLIDITY_SVG mode requires a non-zero artTemplateId");
    if (opts?.templateIsActive === false) problems.push(`artTemplateId ${params.artTemplateId} is not active (or not registered)`);
  } else if (params.artTemplateId !== 0n) {
    problems.push("JAVASCRIPT mode must carry artTemplateId 0");
  }
  // THE RUNTIME THIS RELEASE IMPLEMENTS. Refused HERE, in the builder, and not only at the HTTP
  // boundary — an integrator holding this SDK never touches the site's routes, and a validator that
  // accepts params the chain will reject is a validator that hands someone a reverting transaction.
  //
  // This is a RELEASE fact, not a chain read: `ArtRuntimeRegistryV1.modeAvailable` is `pure` and
  // admits `SOLIDITY_SVG_V1` alone, so `registerRuntime` reverts `RuntimeModeNotAvailable` for the
  // JavaScript mode and no authority can enable it. Nothing here is chain-dependent, so nothing
  // here needs a chain. Per-chain REGISTRATION (a Solidity runtime deregistered or deactivated on
  // one chain) is a live question and belongs to the server resolver, not to this pure function.
  if (params.artMode === ArtMode.JAVASCRIPT) {
    problems.push(
      "ONCHAIN_JAVASCRIPT_V1 is not implemented in this release, so this launch cannot be built: the collection reverts " +
        "ArtModeNotAvailable and the registry cannot hold a JavaScript runtime to bind. JavaScript projects can still be " +
        "authored, previewed, validated and exported — only the on-chain launch is unavailable.",
    );
  }
  const scriptHash = keccak256(params.artConfig);
  if (scriptHash !== params.artScriptHash) problems.push("artScriptHash does not match keccak256(artConfig)");
  if (opts?.scriptByteLimit !== undefined) {
    const bytes = (params.artConfig.length - 2) / 2;
    if (bytes > opts.scriptByteLimit) problems.push(`artConfig ${bytes} bytes exceeds scriptByteLimit ${opts.scriptByteLimit}`);
  }
  if (params.collaborators.length > MAX_COLLABORATORS) problems.push(`too many collaborators (max ${MAX_COLLABORATORS})`);
  let bpsSum = 0;
  for (const c of params.collaborators) {
    if (c.recipient === "0x0000000000000000000000000000000000000000" || c.bps === 0) {
      problems.push(`invalid collaborator entry (${c.recipient}, ${c.bps}bps)`);
    }
    bpsSum += c.bps;
  }
  if (bpsSum > 10_000) problems.push("collaborator bps sum exceeds 10,000 (the full creator share)");
  problems.push(...antiSnipeProblems(params.antiSnipeMode));
  if (params.creatorEarnings === undefined) {
    problems.push("creatorEarnings is missing — the election is settled inside the launch and has no later transaction");
  } else {
    try {
      // Decoding is the check: it refuses a reserved bit and an unknown mode exactly as the chain
      // does, so a params object that would revert on chain is refused here instead.
      problems.push(...creatorEarningsProblems(unpackCreatorEarnings(params.creatorEarnings)));
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(params.metadataUriHash ?? "") || /^0x0{64}$/.test(params.metadataUriHash ?? "")) {
    // Zero is refused on chain for the same reason `UNSPECIFIED` is: a launch that forgot its
    // metadata must not be mistaken for one that deliberately has none, and there is no second
    // transaction in which to add it.
    problems.push("metadataUriHash is missing or zero — the collection resolves contractURI() through this key and is complete at birth");
  }
  return { ok: problems.length === 0, problems };
}

export { ArtMode, StartingPreset };
