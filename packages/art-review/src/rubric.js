// SPDX-License-Identifier: MIT
// ================================================================================================
// THE RUBRIC — the nine things a reviewer is asked about, and the one that can end the review.
//
// IT IS A CLOSED LIST BECAUSE A CRITIQUE HAS TO BE ADDRESSABLE. "Not good enough" is not a
// finding; it is a mood. Every axis here names something an author can change, and every verdict
// has to attach its observations to one of them, so that what comes back is a work order rather
// than an opinion.
//
// BRIEF FIDELITY IS A GATE AND NOT AN AXIS. The other eight are judgements about quality that a
// reviewer weighs; this one is a question with a yes or a no, and a no ends the round whatever
// else is true. The reason is the defect this whole loop exists to close: a variant called
// `espalier` passed every technical gate — legal, deterministic, in budget, byte-distinct across
// market states — and read as industrial crates and scaffolding full of confetti for a brief that
// asked for botanical work. Nothing caught it because nothing looked, and if something had looked
// while treating fidelity as one axis among nine it could still have been averaged away.
//
// TECHNICAL LEGALITY CANNOT OVERRULE IT. A configuration the chain accepts is a configuration that
// will render; it is not a configuration that draws what was asked for. Those are different
// questions and only one of them has an on-chain answer.
// ================================================================================================

export const RUBRIC_AXES = Object.freeze([
  Object.freeze({
    id: "briefFidelity",
    gate: true,
    title: "Brief fidelity",
    ask:
      "Read the brief, then look at the pictures. Does the work read as the thing the brief asked for — " +
      "not as something legal, not as something competent, but as THAT thing? Brief says botanical and the " +
      "output reads industrial: FAIL. Brief says monumental and sparse and the output is confetti-dense: FAIL. " +
      "Brief claims the work fractures under drawdown and the stress row is indistinguishable from the " +
      "neutral row at browse size: FAIL. This is a gate. If it fails, the verdict cannot be SHIP however " +
      "good the work is on its own terms.",
  }),
  Object.freeze({
    id: "composition",
    title: "Composition",
    ask:
      "Is there a focal hierarchy, or does the frame read as an even field of incident? Does anything " +
      "dominate, and is that deliberate? Is the frame used, or is the work floating in the middle of it?",
  }),
  Object.freeze({
    id: "collectionCoherence",
    title: "Coherence as a collection",
    ask:
      "Laid out together on the contact sheet, do these read as members of ONE project? A collection whose " +
      "tokens share nothing is a folder, not a collection.",
  }),
  Object.freeze({
    id: "palette",
    title: "Palette intent",
    ask:
      "Does the colour look chosen? Is the contrast range doing work, or is it noise? Does the ground " +
      "support the drawing or compete with it?",
  }),
  Object.freeze({
    id: "seedVariation",
    title: "Seed variation without losing identity",
    ask:
      "Across the twelve seeds, are these different WORKS or one work at twelve rotations? And in the other " +
      "direction — is the variation so wide that the project stops being one project? Both failures are real " +
      "and they pull opposite ways.",
  }),
  Object.freeze({
    id: "thumbnailSurvival",
    title: "Thumbnail survival",
    ask:
      "Look at the 120px sheets and only at them. At browse size, does the work still read? Do the twelve " +
      "seeds still look like twelve things? This is the size a collection is actually seen at, and it is " +
      "where every verdict in this program was really decided — a frame that is varied at 512px and one " +
      "repeated stamp at 120px is a frame that fails here and nowhere else.",
  }),
  Object.freeze({
    id: "marketResponse",
    title: "Market response where claimed",
    ask:
      "If the brief or the work claims the market changes it, compare the state rows. Is the change VISIBLE, " +
      "and is it the change that was claimed? A state transition that is real in the bytes and invisible on " +
      "the sheet has not been delivered.",
  }),
  Object.freeze({
    id: "tokenIdentity",
    title: "Token identity across states",
    ask:
      "Same seed, three states, side by side: is it still recognisably the same token? A work that becomes a " +
      "different object under drawdown has not responded to the market, it has been replaced by another work.",
  }),
  Object.freeze({
    id: "artifacts",
    title: "Visual artifacts",
    ask:
      "Clipping at the frame edge, elements colliding into mush, overlaps that read as a mistake, strokes " +
      "that vanish, a shape cut in half by the viewBox. Name what you see and where.",
  }),
]);

export const RUBRIC_AXIS_IDS = Object.freeze(RUBRIC_AXES.map((a) => a.id));
export const GATE_AXIS = "briefFidelity";

/** The verdicts a reviewer may return. Closed, so a run can branch on it without reading prose. */
export const VERDICTS = Object.freeze(["SHIP", "REVISE", "REJECT"]);

/** Per-axis judgements. `WEAK` exists so a reviewer is not forced to call a soft problem a failure. */
export const AXIS_JUDGEMENTS = Object.freeze(["PASS", "WEAK", "FAIL"]);

/** The rubric as the markdown a reviewer is handed. Generated, never hand-maintained twice. */
export function rubricMarkdown() {
  const lines = [
    "# The rubric",
    "",
    "Judge the IMAGES in this packet. Not the file names, not the captions, not any number —",
    "the pictures. Every axis below wants an observation you could only have made by looking.",
    "",
  ];
  for (const a of RUBRIC_AXES) {
    lines.push(`## ${a.title}${a.gate ? "  — THIS ONE IS A GATE" : ""}`, "", a.ask, "");
  }
  lines.push(
    "## What to return",
    "",
    "A verdict of `SHIP`, `REVISE` or `REJECT`, a judgement of `PASS` / `WEAK` / `FAIL` on each axis,",
    "and a critique.",
    "",
    "**The critique has to be actionable.** Not \"not good enough\" — something an author can execute:",
    "*\"no focal hierarchy; peripheral blocks overwhelm the central form. Cut peripheral density by about",
    "40%, narrow the palette contrast, raise the central recursion scale.\"* Name the axis, say what you",
    "saw, then say what to do about it with a direction and a magnitude.",
    "",
    "`briefFidelity: FAIL` forbids `SHIP`. That is not a suggestion the review may weigh; it is a gate,",
    "and technical legality does not overrule it.",
    "",
  );
  return lines.join("\n");
}
