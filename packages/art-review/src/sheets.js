// SPDX-License-Identifier: MIT
// ================================================================================================
// THE SHEETS A REVIEWER ACTUALLY LOOKS AT.
//
// FIVE ARTIFACTS, AND EACH ONE ANSWERS A QUESTION THE OTHERS CANNOT:
//
//   singles/            three states of one seed at 512px — detail, clipping, collisions
//   contact.png         twelve seeds at 256px, one market state — composition and palette
//   contact-thumb.png   the same twelve at TRUE 120px — thumbnail survival and seed diversity
//   states.png          four seeds x three states at 256px — does the market change the work
//   states-thumb.png    twelve seeds x three states at 120px, one ROW per state — market response
//                       at browse size, which is the only size the response is ever seen at
//
// THE THUMBNAIL SHEETS ARE NOT PREVIEWS OF THE BIG ONES. Every verdict in this program was
// actually decided at 120px: a frame that reads as varied at 512 reads as one repeated stamp at
// 120, and a state change that looks dramatic full-size can vanish at the size a collection is
// browsed at. Producing only the large sheets would reproduce the exact blind spot that let a
// template through with a topologically identical frame on every seed.
//
// STATE ROWS, NOT STATE COLUMNS, in `states-thumb`. Twelve tiles across is one row per market
// state, so the reviewer's eye compares neutral against stress along a straight line. Laid out the
// other way the comparison is a saccade across a column boundary and the difference stops being
// visible, which is a real effect and not a preference.
// ================================================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MARKET_STATES, REVIEW_SEEDS } from "./market.js";
import { CONTACT_PX, SINGLE_PX, THUMB_PX, cellsOf, grid, rasterize } from "./raster.js";
import { sha256 } from "./render.js";

/** The seed a single render is inspected on. Fixed so two rounds are comparable. */
export const DETAIL_SEED = REVIEW_SEEDS[2];
/** The seeds the large state sheet uses. Four is what fits at 256px without scrolling. */
export const STATE_SHEET_SEEDS = REVIEW_SEEDS.slice(0, 4);

/**
 * Render the review ring and write every sheet.
 *
 * Returns a manifest of RELATIVE PATHS AND DIGESTS — never image bytes. A receipt that embeds
 * pictures is a receipt nobody reads and a diff nobody can review.
 */
export async function buildSheets({ renderer, configBytes, outDir, contactState = "neutral" }) {
  mkdirSync(join(outDir, "singles"), { recursive: true });
  mkdirSync(join(outDir, "svg"), { recursive: true });

  const cells = REVIEW_SEEDS.flatMap((seed) => MARKET_STATES.map((state) => ({ seed, state })));
  const records = await renderer.renderMany(configBytes, cells);
  const failed = records.filter((r) => !r.ok);
  if (failed.length > 0) {
    return {
      ok: false,
      detail: `${failed.length} of ${records.length} renders were refused by the runtime (failure codes ${[...new Set(failed.map((r) => r.failure))].join(", ")}). No sheet is written from a partial ring: a contact sheet with holes in it invites a reviewer to judge the holes.`,
    };
  }

  const by = new Map(records.map((r) => [`${r.seed}|${r.state}`, r]));
  const artifacts = [];
  const write = (name, buf) => {
    writeFileSync(join(outDir, name), buf);
    artifacts.push({ path: name, bytes: buf.length, sha256: sha256(buf) });
  };

  // The raw documents, kept beside the pictures so a later reader can re-rasterise rather than
  // trust this run's rasteriser. They are NOT what the reviewer is given.
  for (const r of records) {
    const name = `svg/seed${r.seed}-${r.state}.svg`;
    writeFileSync(join(outDir, name), r.svg);
  }

  for (const state of MARKET_STATES) {
    const r = by.get(`${DETAIL_SEED}|${state}`);
    write(`singles/seed${DETAIL_SEED}-${state}.png`, await rasterize(r.svg, SINGLE_PX));
  }

  const contactCells = REVIEW_SEEDS.map((s) => by.get(`${s}|${contactState}`));
  write("contact.png", await grid(cellsOf(contactCells), { px: CONTACT_PX, cols: 6 }));
  write("contact-thumb.png", await grid(cellsOf(contactCells), { px: THUMB_PX, cols: 6, captionPx: 8 }));

  const stateCells = STATE_SHEET_SEEDS.flatMap((s) => MARKET_STATES.map((st) => by.get(`${s}|${st}`)));
  write("states.png", await grid(cellsOf(stateCells), { px: CONTACT_PX, cols: 3 }));

  const stateRowCells = MARKET_STATES.flatMap((st) => REVIEW_SEEDS.map((s) => by.get(`${s}|${st}`)));
  write("states-thumb.png", await grid(cellsOf(stateRowCells), { px: THUMB_PX, cols: REVIEW_SEEDS.length, captionPx: 8 }));

  return {
    ok: true,
    renders: records.length,
    seeds: REVIEW_SEEDS,
    states: MARKET_STATES,
    contactState,
    artifacts,
    /**
     * The commitment over what was drawn, in the SAME form the template catalog publishes:
     * sha256 of sorted `"<name> <sha256(bytes)>"` lines joined by newline. A commitment nobody can
     * recompute is a number rather than a commitment, so the algorithm is named where it is used.
     */
    renderCommitment: {
      algorithm: "sha256-of-sorted-name-space-sha256-lines-joined-by-newline",
      renders: records.length,
      digest: sha256(
        records
          .map((r) => `seed${r.seed}-${r.state}.svg ${r.svgSha256}`)
          .sort()
          .join("\n"),
      ),
    },
  };
}
