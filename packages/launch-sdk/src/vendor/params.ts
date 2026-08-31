// SPDX-License-Identifier: MIT
// Typed LaunchParams builder. Mirrors LaunchpadFactory._validate so obviously-invalid params are
// caught client-side before a wallet ever signs anything; the contract's own checks remain the
// final authority (see readiness.ts, which simulates the real call).
import { keccak256, type Address, type Hex } from "viem";
import { WHOLE_UNIT, MAX_COLLABORATORS } from "./constants.js";
import { LIMITS, decodeArtSelector, isRuntimeElection, ArtSelectorError } from "@relics/project-schema";
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
  /**
   * SOLIDITY_SVG: a registered template id + its config bytes. JAVASCRIPT: raw script bytes.
   *
   * `artTemplateId` IS THE PACKED SELECTOR WORD, not the bare template id, and the name is the
   * chain's. It carries the registered template in its low 224 bits and the ELECTED ART RUNTIME's
   * per-chain `uint32` registry key in its top 32. A caller that has already composed the word
   * passes it here; a caller holding the two halves should compose it with `encodeArtSelector`
   * from `@relics/project-schema` — the one public implementation of the shift — rather than
   * open-coding `<< 224n`.
   *
   * A runtime half of ZERO is legal and means "no preference": the chain resolves its generic
   * runtime. It can never NAME a runtime, because zero is the registry's own reserved id.
   */
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
/**
 * THE COLLECTION IDENTITY IS THE SECOND UNBOUNDED INPUT TO THE SAME RENDER, and until this check
 * existed only the first one was bounded.
 *
 * Every art runtime bounds its ART CONFIG against `PORTABLE_ETH_CALL_GAS_BUDGET = 10,000,000`, and
 * `npm run launchpad:rendbudget` proves it for every runtime on disk. `TokenIdentityV1` carries two
 * further creator-authored strings into the SAME document — `collectionName`, which the metadata
 * JSON emits TWICE, and `collectionSymbol` — and nothing on chain bounds either. Measured through
 * `test/rc6/runtimes/IdentityLengthGas.t.sol`, one fresh call frame per point: the name costs
 * ~1,034 gas per byte (~1,556 when every byte escapes) and the symbol ~518. Against the dearest
 * max-legal configuration the release admits, `tokenUriV1` stops fitting the budget at a name of
 * 630 escaped or 948 plain characters.
 *
 * A collection whose `tokenURI` exceeds what an indexer will execute renders as nothing, on every
 * marketplace, PERMANENTLY: the art binding is one-shot and there is no transaction that repairs
 * it. It harms only that creator's own collection, so it is a footgun rather than an attack — but
 * a silent, irreversible one, and an autonomous agent generating launch parameters is exactly the
 * caller that finds it.
 *
 * THE NUMBER IS NOT INVENTED HERE. `@relics/project-schema` already declares `maxNameLength: 64`
 * and `maxSymbolLength: 11`, so every bundle-borne launch has always been bounded; the gap was the
 * DIRECT-CONTRACT path, which skips the bundle and is the path an agent takes. This makes the two
 * agree rather than adding a third opinion. At 64 characters — up to 256 UTF-8 bytes, because
 * `AppendBuffer.appendJson` passes every byte above 0x7F through unescaped — the whole identity
 * costs 272,754 gas against the 820,265 the tightest runtime leaves.
 *
 * LENGTH ONLY, DELIBERATELY. The schema also constrains the symbol's CHARACTER SET; that is a
 * format rule, not a gas rule, and imposing it here would refuse launches the chain accepts and
 * that already exist. Characters, not bytes, for the same reason: it is the unit the schema bounds,
 * and the byte worst case it implies is measured and fits.
 */
/**
 * The two bounds, READ from `@relics/project-schema` rather than restated, with a refusal instead
 * of a fallback. A default here would be a second declaration wearing a helpful face: it would
 * survive the schema losing the key and would then bound the direct-contract path to a number no
 * bundle is held to.
 */
function schemaIdentityLimit(key: "maxNameLength" | "maxSymbolLength"): number {
  const declared = (LIMITS as Record<string, unknown>)[key];
  if (typeof declared !== "number" || !Number.isInteger(declared) || declared < 1) {
    throw new Error(
      `@relics/project-schema declares no usable LIMITS.${key}, so the collection-identity bound has no source. ` +
        "Refusing rather than substituting a number the bundle format is not held to.",
    );
  }
  return declared;
}

/** Longest `collectionName` a launch may carry, in characters. */
export const MAX_COLLECTION_NAME_CHARS = schemaIdentityLimit("maxNameLength");
/** Longest `collectionSymbol` a launch may carry, in characters. */
export const MAX_COLLECTION_SYMBOL_CHARS = schemaIdentityLimit("maxSymbolLength");

export function identityLengthProblems(name: string, symbol: string): string[] {
  const problems: string[] = [];
  if (typeof name !== "string" || name.length === 0) {
    problems.push("name is missing — the collection name is written into tokenURI at birth and has no later transaction");
  } else if (name.length > MAX_COLLECTION_NAME_CHARS) {
    problems.push(
      `name is ${name.length} characters, over the ${MAX_COLLECTION_NAME_CHARS}-character bound: it is emitted TWICE into every ` +
        "tokenURI document, so an over-long name can push the render past what an indexer will execute — permanently, " +
        "because the art binding is one-shot",
    );
  }
  if (typeof symbol !== "string" || symbol.length === 0) {
    problems.push("symbol is missing — the collection symbol is written into tokenURI at birth and has no later transaction");
  } else if (symbol.length > MAX_COLLECTION_SYMBOL_CHARS) {
    problems.push(
      `symbol is ${symbol.length} characters, over the ${MAX_COLLECTION_SYMBOL_CHARS}-character bound: it is emitted into every ` +
        "tokenURI document and spends the same render budget the art config is held to",
    );
  }
  return problems;
}

export function validateCreatorInput(input: CreatorInput): string[] {
  const problems: string[] = [];
  problems.push(...identityLengthProblems(input.name, input.symbol));
  if (input.creatorRecipient === "0x0000000000000000000000000000000000000000") problems.push("creatorRecipient is the zero address");
  if (input.totalSupplyWhole <= 0n) problems.push("totalSupply must be > 0");
  // On-chain check is `artworkBackingUnits * WHOLE_UNIT > totalSupply` where totalSupply is
  // already in wei; totalSupplyWhole here is whole tokens, so scale both sides consistently.
  const backingPer = input.backingUnitsPerArtwork ?? DEFAULT_BACKING_UNITS_PER_ARTWORK;
  problems.push(...backingUnitsProblems(backingPer));
  if (input.artworkBackingUnits * backingPer > input.totalSupplyWhole) {
    problems.push("artworkBackingUnits * backingUnitsPerArtwork exceeds totalSupply (in whole-token terms)");
  }
  if (input.art.mode === ArtMode.SOLIDITY_SVG) problems.push(...artSelectorProblems(input.art.artTemplateId));
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
export function validateLaunchParams(params: LaunchParams, opts?: { scriptByteLimit?: number; templateIsActive?: boolean; electedRuntime?: ElectedRuntimeCheck }): LaunchParamsValidation {
  const problems: string[] = [];
  problems.push(...identityLengthProblems(params.name, params.symbol));
  if (params.creatorRecipient === "0x0000000000000000000000000000000000000000") {
    problems.push("creatorRecipient is the zero address");
  }
  if (params.totalSupply <= 0n) problems.push("totalSupply must be > 0");
  problems.push(...backingUnitsProblems(params.backingUnitsPerArtwork));
  if (params.backingUnitsPerArtwork > 0n && params.artworkBackingUnits * params.backingUnitsPerArtwork * WHOLE_UNIT > params.totalSupply) {
    problems.push("artworkBackingUnits * backingUnitsPerArtwork exceeds the whole-unit supply that could ever back it");
  }
  if (params.artMode === ArtMode.SOLIDITY_SVG) {
    problems.push(...artSelectorProblems(params.artTemplateId));
    if (opts?.templateIsActive === false) problems.push(`artTemplateId ${params.artTemplateId} is not active (or not registered)`);
    // THE ELECTED RUNTIME, WHEN THE CALLER HAS ESTABLISHED ONE. An integrator holding this SDK
    // never touches an HTTP route, so the refusal lives here as well as upstream — and it is
    // OPTIONAL because "is this runtime active on this chain?" is a LIVE question this pure
    // function cannot answer. Absent means unchecked and says so; it never means "fine".
    if (opts?.electedRuntime !== undefined) problems.push(...electedRuntimeProblems(params.artTemplateId, opts.electedRuntime));
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

/**
 * What a caller must have ESTABLISHED about the runtime a selector elects, when it wants that
 * election checked.
 *
 * EVERY FIELD IS A READING, NOT A PREFERENCE. `artRuntimeId` is the id the caller resolved from
 * `ArtRuntimeRegistryV1` on the chain it is launching on; `state` is what that read returned. The
 * shape exists so a caller cannot express "check the election" without also saying where its
 * answer came from — `resolveArtRuntime` in this SDK produces exactly this.
 */
export interface ElectedRuntimeCheck {
  readonly runtimeTag: string;
  readonly artRuntimeId: number | null;
  readonly state: "ACTIVE" | "INACTIVE" | "NOT_REGISTERED" | "UNKNOWN";
  readonly detail?: string;
}

/**
 * The two halves of `artTemplateId`, checked as the two separate things they are.
 *
 * WHY A BARE `!== 0n` WAS NOT ENOUGH, AND WAS WRONG IN A WAY THAT LOOKS RIGHT. The old rule refused
 * a zero WORD. A selector electing runtime 3 with template 0 is `0x0000_0003 << 224` — a very large
 * non-zero number that sails past it, and then `LaunchPolicyV1.validateLaunchParams` reverts
 * `BadTemplate` on chain because `TemplateRegistryV1` reserves 0 as its no-template sentinel. The
 * check has to look at the TEMPLATE HALF, which is what the chain looks at.
 *
 * The runtime half is deliberately NOT required to be non-zero: zero means the creator expressed no
 * preference and the chain resolves its generic runtime, which is what every launch did before the
 * Wave-1 engines existed and is still a legal launch.
 */
function artSelectorProblems(selector: bigint): string[] {
  let decoded;
  try {
    decoded = decodeArtSelector(selector);
  } catch (err) {
    const named = err as { code?: string; message?: string } | null;
    const why = err instanceof (ArtSelectorError as unknown as { new (...a: any[]): object }) ? `${named?.code}: ${named?.message}` : String(err);
    return [`artTemplateId is not a legal art selector — ${why}`];
  }
  if (decoded.templateId === 0n) {
    return [
      "the art selector's TEMPLATE half is 0, the registry's reserved no-template sentinel. " +
        `The word ${selector} is non-zero because it elects art runtime ${decoded.artRuntimeId}, but ` +
        "`TemplateRegistryV1.registerTemplate` refuses template 0 and `LaunchPolicyV1.validateLaunchParams` reverts `BadTemplate`, " +
        "so a launch carrying it cannot succeed.",
    ];
  }
  return [];
}

/**
 * The elected runtime against what the caller read off the chain.
 *
 * `UNKNOWN` IS REFUSED, AND THAT IS THE POINT. A registry that could not be read does not prove a
 * runtime is absent, and it does not prove one is present either — so a launch built on it would be
 * built on nobody's answer. The refusal names a retry rather than a fact.
 */
function electedRuntimeProblems(selector: bigint, elected: ElectedRuntimeCheck): string[] {
  let decoded;
  try {
    decoded = decodeArtSelector(selector);
  } catch {
    return []; // already reported by artSelectorProblems; one defect, one message
  }
  const problems: string[] = [];
  if (!isRuntimeElection(decoded.artRuntimeId)) {
    problems.push(
      `the caller established the ${elected.runtimeTag} runtime for this launch, but the selector's runtime half is 0 — ` +
        "which is not that runtime, it is the absence of a preference, and the chain would bind its generic runtime instead. " +
        "Compose the selector with `encodeArtSelector(artRuntimeId, templateId)`.",
    );
    return problems;
  }
  if (elected.state !== "ACTIVE") {
    problems.push(
      `the selector elects art runtime ${decoded.artRuntimeId} (${elected.runtimeTag}), and that runtime is ${elected.state} on the target chain` +
        (elected.detail ? `: ${elected.detail}` : "") +
        (elected.state === "UNKNOWN" ? ". An unread registry is not an absence — this is a reason to retry, not a finding about the chain." : ""),
    );
  }
  if (elected.artRuntimeId !== null && elected.artRuntimeId !== decoded.artRuntimeId) {
    problems.push(
      `the selector elects art runtime ${decoded.artRuntimeId} but ${elected.runtimeTag} resolved to id ${elected.artRuntimeId} on the target chain. ` +
        "Registry ids are per chain and chosen by the registering authority; a selector composed against one chain's ids binds a different runtime on another.",
    );
  }
  return problems;
}
