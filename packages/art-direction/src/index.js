// SPDX-License-Identifier: MIT
// ================================================================================================
// EVERYTHING THAT HAPPENS BEFORE THERE IS A CONFIGURATION, plus the two roles that are not the
// author.
//
// `@relics/art-review` renders, measures and carries the judged loop. This package holds the four
// things that were missing around it, and the order they run in is the whole design:
//
//   admission   is this brief representable by the two-template Wave-1 catalog at all
//   direction   what the work IS, written down, before a parameter exists
//   atlas       what each parameter measurably does, so a value is chosen rather than guessed
//   binding     does the claimed market response resolve to different numbers -- arithmetic, no chain
//   seeds       who is allowed to see which tokens, so a final verdict is not an overfit
//   author      composition first: silhouette, focus, space, rhythm, secondary, palette, detail, market
//   critique    a development critic that is not the author, and a structured response to it
//   acceptance  the receipt binding all of the above to the exact bytes a launch would commit
//
// It renders nothing and judges no picture: rendering belongs to `@relics/art-review` and judging
// belongs to an agent that is not this code.
// ================================================================================================

export * from "./atlas.js";
export * from "./capabilities.js";
export * from "./admission.js";
export * from "./direction.js";
export * from "./seeds.js";
export * from "./binding.js";
export * from "./author.js";
export * from "./critique.js";
export * from "./acceptance.js";
