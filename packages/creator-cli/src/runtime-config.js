// SPDX-License-Identifier: MIT
// ================================================================================================
// THE ONE PLACE THE CLI HANDS A WAVE-1 ENGINE'S CODEC TO THE SCHEMA.
//
// `@relics/project-schema` is dependency-free and deliberately carries no `GRV1`/`VCV1` codec:
// both are transcriptions of frozen Solidity that already have exactly one off-chain
// implementation, and a second copy would be a byte layout waiting to disagree with an art binding
// that is immutable the moment a launch lands. So the schema takes the codec as a capability and
// this file supplies it — the same shape as the sandbox `evaluate` the validator already takes.
//
// THE DISPATCH IS `@relics/art-review`'S OWN DECLARATION, not a second table. `runtimeFor` throws
// on a runtime it cannot draw, and the magic assertion below is a genuine cross-check between two
// independently maintained statements of the same fact: the schema derives the four magic bytes
// from the FORMAT NAME, and art-review transcribes `configMagic` from the runtime's Solidity. They
// are computed from different sources, so agreeing means something.
//
// NOTHING NETWORKED IS ON THIS IMPORT CHAIN. `runtimes.js` imports only the two codecs and they
// import only their shared vocabulary; there is no viem and no sharp here, which is what lets the
// offline half of the kit keep working.
// ================================================================================================
import { RUNTIMES, encodeConfig } from "../../art-review/src/runtimes.js";

/**
 * The schema's `encodeRuntimeConfig` capability.
 *
 * @param {{ runtime: string, runtimeId: string, configFormat: string, document: unknown }} input
 * @returns {string} `0x`-prefixed bytes
 */
export function encodeRuntimeConfig({ runtime, runtimeId, configFormat, document }) {
  const declared = RUNTIMES[runtimeId];
  if (!declared) {
    throw new Error(
      `${runtimeId} is not a runtime this kit can encode a configuration for. It can encode ${Object.keys(RUNTIMES).join(" and ")}. ` +
        "A runtime absent here is one whose byte layout this kit does not carry — which is a refusal, not a finding about the chain.",
    );
  }
  if (declared.configMagic !== configFormat) {
    // TWO INDEPENDENT STATEMENTS OF THE SAME FACT, COMPARED. The schema knows this format's magic
    // from the format's own name; art-review knows it from the runtime's Solidity. A disagreement
    // means one of them has drifted, and the cheapest moment to find out is before the bytes are
    // committed into a binding nobody can change.
    throw new Error(
      `${runtimeId} writes ${declared.configMagic} bytes and the schema asked for ${configFormat}. ` +
        "These two facts are declared in different packages from different sources; they have drifted.",
    );
  }
  void runtime;
  return encodeConfig(runtimeId, document);
}

/** The runtime ids this kit can encode a configuration for. Reported, never assumed. */
export const ENCODABLE_RUNTIME_IDS = Object.freeze(Object.keys(RUNTIMES));
