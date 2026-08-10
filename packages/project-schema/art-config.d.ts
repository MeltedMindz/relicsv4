// SPDX-License-Identifier: MIT
// Types for `@relics/project-schema/art-config` — the ACV1 creator art configuration.

/** A drawing primitive. Index in this tuple is the on-chain `kind` value. */
export type Acv1LayerKind = "STRATA" | "RINGS" | "BARS" | "GRID" | "SHARDS" | "VEIL";

/** A market sensor. Index in this tuple is the on-chain `sensor` value. */
export type Acv1Sensor =
  | "VOLUME_TIER"
  | "EPOCH"
  | "DRAWDOWN"
  | "RECOVERY"
  | "VOLATILITY"
  | "STRESS"
  | "LIQUIDITY"
  | "FLOW_BIAS"
  | "QUOTE_VOLUME"
  | "FRAGMENTATION";

/**
 * The sensors a LAYER may name. `FRAGMENTATION` is absent by construction: it is the organic swap
 * COUNT, and letting it drive a visual magnitude would let a dust swarm walk the artwork. It stays
 * legal as a trait source.
 */
export type Acv1LayerSensor = Exclude<Acv1Sensor, "FRAGMENTATION">;

export type Acv1DnaSlot = "DNA_SLOT_0" | "DNA_SLOT_1" | "DNA_SLOT_2" | "DNA_SLOT_3";
export type Acv1TraitSource = Acv1Sensor | Acv1DnaSlot;
export type Acv1Curve = "LINEAR" | "LOG2" | "EASE" | "STEP";
export type Acv1TraitStyle = "NUMBER" | "WORD" | "HEX";

export interface Acv1Layer {
  kind: Acv1LayerKind;
  /** A layer may not name FRAGMENTATION; the on-chain validator refuses it with ERR_LAYER_SENSOR. */
  sensor: Acv1LayerSensor;
  curve: Acv1Curve;
  /** Index into `palette`. */
  palette: number;
  /** Element count at the sensor floor. */
  amountMin: number;
  /** Element count at the sensor ceiling. 1..32, and the sum across layers is capped at 96. */
  amountMax: number;
}

export interface Acv1Trait {
  /** 1..24 printable ASCII characters, excluding `"` and `\`. */
  name: string;
  source: Acv1TraitSource;
  style: Acv1TraitStyle;
}

/** A decoded — or authored — ACV1 configuration. */
export interface ArtConfigV1 {
  version: 1;
  format: "ACV1";
  animate: boolean;
  /** Index into `palette`. */
  background: number;
  /** 1..8 `#RRGGBB` colours. */
  palette: string[];
  /** 1..8 layers. */
  layers: Acv1Layer[];
  /** 0..8 traits. */
  traits: Acv1Trait[];
  /** 0..32 printable ASCII characters, excluding `"` and `\`. */
  title: string;
}

export interface Acv1DecodeResult {
  ok: boolean;
  code: number;
  name: string;
  reason: string;
  config: ArtConfigV1 | null;
  /** The opaque committed appendix as bare hex. Never interpreted; always inside `artConfigHash`. */
  appendix: string;
}

export interface Acv1ValidateResult {
  ok: boolean;
  code: number;
  name: string;
  reason: string;
  issues: string[];
}

export const ACV1_FORMAT: "ACV1";
export const ACV1_VERSION: 1;
export const ACV1_MAGIC: string;
export const ACV1_TERMINATOR: number;
export const ACV1_FLAGS: Readonly<{ ANIMATE: number }>;
export const ACV1_LIMITS: Readonly<{
  maxPalette: number;
  maxLayers: number;
  maxTraits: number;
  maxTraitName: number;
  maxTitle: number;
  maxLayerElements: number;
  maxTotalElements: number;
  /** The smallest VALID document: 21 bytes. */
  minBytes: number;
  /** The largest INTERPRETED document: 332 bytes. */
  maxBytes: number;
  /** The header's cheap early-out (19). NOT the minimum — never use it as one. */
  headerGateBytes: number;
}>;
export const ACV1_LAYER_KINDS: readonly Acv1LayerKind[];
export const ACV1_SENSORS: readonly Acv1Sensor[];
export const ACV1_LAYER_SENSORS: readonly Acv1LayerSensor[];
export const ACV1_DNA_SLOTS: readonly Acv1DnaSlot[];
export const ACV1_TRAIT_SOURCES: readonly Acv1TraitSource[];
export const ACV1_CURVES: readonly Acv1Curve[];
export const ACV1_TRAIT_STYLES: readonly Acv1TraitStyle[];
export const ACV1_ERROR_CODES: Readonly<Record<number, string>>;

export function acv1Reason(code: number): string;

/** Faithful mirror of `ArtConfigV1Encoder.encode`, INCLUDING its refusal to validate. */
export function encodeArtConfigV1(config: ArtConfigV1): Uint8Array;
/** {encodeArtConfigV1}, refusing bytes the on-chain validator would reject. */
export function encodeArtConfigV1Checked(config: ArtConfigV1): Uint8Array;
export function withArtConfigV1Appendix(document: Uint8Array, appendix: Uint8Array): Uint8Array;
export function decodeArtConfigV1(bytes: Uint8Array): Acv1DecodeResult;
export function validateArtConfigV1(configOrBytes: Uint8Array | ArtConfigV1): Acv1ValidateResult;
export function isArtConfigV1(bytes: Uint8Array): boolean;
/** keccak256 over the EXACT transmitted bytes, appendix included. Bare lowercase hex. */
export function hashArtConfigV1(bytes: Uint8Array): string;
export function describeArtConfigV1(decoded: ArtConfigV1 | null, bytes?: Uint8Array): Record<string, unknown> | null;
/** The all-null authoring skeleton — never a default, always a thing the creator must fill. */
export function emptyArtConfigV1(): Record<string, null | number | string>;
export function worstCaseElementsV1(config: Pick<ArtConfigV1, "layers">): number;

export function visualHashArtConfigV1(config: ArtConfigV1): string;
export function traitSchemaHashArtConfigV1(config: ArtConfigV1): string;
export function runtimeCommitmentArtConfigV1(configCommitment: string, visualHash: string, traitSchemaHash: string): string;

export class ArtConfigV1Error extends Error {}
