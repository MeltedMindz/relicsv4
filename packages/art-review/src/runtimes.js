// SPDX-License-Identifier: MIT
// ================================================================================================
// WHICH RUNTIMES THIS LOOP CAN RENDER, AND WHAT A CONFIGURATION FOR EACH ONE LOOKS LIKE.
//
// TWO, AND ONLY BECAUSE TWO ARE REGISTERED. `GEOMETRIC_RECURSION_V1` (registry id 3) and
// `VECTOR_COMPOSITION_V1` (registry id 4) are the Wave-1 SHIP runtimes. THE IDS ARE NOT ASSERTED
// HERE AS FACTS ABOUT A CHAIN: `expectedRegistryId` is a starting point for a lookup that is then
// CONTRADICTED by a live `runtimeInfo` read matching on TAG, because registry ids are per-chain
// and an id that is right on three chains today is still not a property of this file. The zero
// address trap applies — `runtimeInfo` does not revert for an unregistered id, it returns a
// well-formed record with the zero address and `exists: false`.
//
// THE PRESET BYTES BELOW ARE A STARTING POINT AND NOTHING ELSE. They are the two published Wave-1
// template configurations, and the whole point of the loop this package implements is that a
// creator's configuration MOVES away from them. `packages/template-catalog` says the same thing in
// its `mutation` block on every descriptor. Nothing here compares a finished configuration against
// the preset it began as, and nothing should start.
// ================================================================================================
import { decodeGrv1, encodeGrv1 } from "./codec/grv1.js";
import { decodeVcv1, encodeVcv1 } from "./codec/vcv1.js";

export const RUNTIMES = Object.freeze({
  GEOMETRIC_RECURSION_V1: Object.freeze({
    id: "GEOMETRIC_RECURSION_V1",
    tagPreimage: "V4ART.RUNTIME.GEOMETRIC_RECURSION_V1",
    configMagic: "GRV1",
    configSchemaVersion: 2,
    expectedRegistryId: 3,
    templateId: "GEOMETRIC_RECURSION_V1/compass",
    encode: encodeGrv1,
    decode: decodeGrv1,
    /** The name of the repeated structural record, so a critique can address it by the right noun. */
    unit: "rules",
    presetName: "compass",
    presetBytes:
      "0x475256310202020006070f0c08e0b44a3f7e72ede4d0a8492a7c8aa6241c14021c1b010301020303035a18077303003030020200000104024e0c03510300020b47656e65726174696f6e7303000b436f6d7072657373696f6e020107436f6d70617373ff",
  }),
  VECTOR_COMPOSITION_V1: Object.freeze({
    id: "VECTOR_COMPOSITION_V1",
    tagPreimage: "V4ART.RUNTIME.VECTOR_COMPOSITION_V1",
    configMagic: "VCV1",
    configSchemaVersion: 1,
    expectedRegistryId: 4,
    templateId: "VECTOR_COMPOSITION_V1/alluvium",
    encode: encodeVcv1,
    decode: decodeVcv1,
    unit: "fields",
    presetName: "alluvium",
    presetBytes:
      "0x564356310100010004060b0c108c6a3fd8cbb03f5a63161a20a33b24030400010200000822147a0000050402030100091c147600000906050500011a1a106e00000204426564730200064e6f64756c65050108416c6c757669756dff",
  }),
});

export const RUNTIME_IDS = Object.freeze(Object.keys(RUNTIMES));

export function runtimeFor(id) {
  const r = RUNTIMES[id];
  if (!r) {
    throw new Error(
      `${JSON.stringify(id)} is not a runtime this review loop can render. The two it can are ` +
        `${RUNTIME_IDS.join(" and ")}. A runtime absent here is not a runtime this package has ` +
        `judged — it is one it cannot draw, which is a refusal rather than a finding.`,
    );
  }
  return r;
}

/** The runtime a template id belongs to, from the id's own first segment. */
export function runtimeForTemplate(templateId) {
  return runtimeFor(String(templateId).split("/")[0]);
}

/** The preset, decoded, as the symbolic document an author edits. Fresh object every call. */
export function presetConfig(runtimeId) {
  const r = runtimeFor(runtimeId);
  return r.decode(r.presetBytes);
}

/** Symbolic document -> `0x`-prefixed bytes, through the runtime's own encoder. */
export function encodeConfig(runtimeId, config) {
  return `0x${runtimeFor(runtimeId).encode(config).toString("hex")}`;
}

/** Bytes -> symbolic document, through the runtime's own decoder. */
export function decodeConfig(runtimeId, bytes) {
  return runtimeFor(runtimeId).decode(bytes);
}
