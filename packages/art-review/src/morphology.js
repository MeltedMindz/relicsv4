// SPDX-License-Identifier: MIT
// ================================================================================================
// MORPHOLOGY — the two shape questions `inkCoverage` and `meanDeltaE` cannot answer.
//
// WHY THESE TWO AND NOT MORE. Every measurement in this package exists because a specific verdict
// turned on it and no number could be produced. Twelve blind reviews of the first benchmark round
// named exactly two shape facts, over and over, that the pipeline had no way to state:
//
//   "every token is a centred island with wide empty margins on all four sides, nothing bleeds,
//    nothing touches an edge"                                              — seven of twelve
//   "the mass does not fracture under stress, it consolidates and brightens ... there are no
//    members in them to separate"                                          — the fracture briefs
//
// The first is EXTENT: how much of the frame the drawing reaches. `inkCoverage` cannot see it —
// a tight dense cluster and a wide sparse lattice can carry identical ink. The second is
// CONNECTEDNESS: how many separate pieces the drawing is in. `meanDeltaE` cannot see it either —
// a mass that breaks into four pieces and a mass that merely brightens can move the same distance
// in Lab.
//
// WHAT THEY ARE NOT. Neither is a quality score and neither may ever become one. Extent is not
// "good composition" — B05 asks for a form held well clear of every edge, and a low extent is the
// brief being obeyed. Component count is not "fracture" — it is the raw count, and whether a rise
// in it under stress is the fracture a brief asked for is a question for a reviewer looking at the
// pictures. These produce two numbers about a raster. The judgement stays where it was.
//
// BOTH ARE MEASURED ON THE SAME PLANE `inkCoverage` USES, at the same browse size, against the
// same modal ground, so a reader comparing them is comparing three readings of one image rather
// than three rasterisations.
// ================================================================================================

import { ground } from "./perceptual.js";

/**
 * The boolean ink mask: true where the pixel is further than `threshold` dE from the modal ground.
 *
 * Identical predicate to `inkCoverage`'s, deliberately — a mask that disagreed with the coverage
 * fraction about what counts as drawing would produce an extent for pixels the ink number says are
 * background.
 */
export function inkMask(plane, threshold = 8, groundLab = null) {
  const g = groundLab ?? ground(plane);
  const { lab, width, height } = plane;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < width * height; i += 1, p += 3) {
    if (Math.hypot(lab[p] - g[0], lab[p + 1] - g[1], lab[p + 2] - g[2]) >= threshold) mask[i] = 1;
  }
  return { mask, width, height };
}

/**
 * How far the drawing reaches, as a fraction of the frame in each axis, plus edge contact.
 *
 * `edgeContact` is counted on a ONE-PIXEL border rather than inferred from `extentX === 1`,
 * because at 120px a form that stops one pixel short reads as "held clear of the edge" and one
 * that touches reads as "bleeding", and rounding an extent fraction cannot tell them apart.
 *
 * A blank plane returns zeros and `empty: true` rather than NaN. A caller that treats an empty
 * frame as extent 0 is right; one that divides by it is not, and NaN would let it.
 */
export function extentOf(plane, threshold = 8, groundLab = null) {
  const { mask, width, height } = inkMask(plane, threshold, groundLab);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      n += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (n === 0) {
    return { empty: true, extentX: 0, extentY: 0, extent: 0, edgeContact: 0, marginMin: 0.5, pixels: 0 };
  }
  const extentX = (maxX - minX + 1) / width;
  const extentY = (maxY - minY + 1) / height;
  let edge = 0;
  for (let x = 0; x < width; x += 1) { if (mask[x]) edge += 1; if (mask[(height - 1) * width + x]) edge += 1; }
  for (let y = 0; y < height; y += 1) { if (mask[y * width]) edge += 1; if (mask[y * width + width - 1]) edge += 1; }
  // The smallest of the four margins, as a fraction. This is the number the "centred island with
  // dead margin on all four sides" complaint is about, and it is the one a brief asking for a form
  // "held well clear of every edge" wants LARGE.
  const marginMin = Math.min(minX / width, minY / height, (width - 1 - maxX) / width, (height - 1 - maxY) / height);
  return {
    empty: false,
    extentX: Number(extentX.toFixed(3)),
    extentY: Number(extentY.toFixed(3)),
    extent: Number(Math.max(extentX, extentY).toFixed(3)),
    edgeContact: edge,
    marginMin: Number(marginMin.toFixed(3)),
    pixels: n,
  };
}

/**
 * How much of the drawing reaches the CORNERS and the EDGE of the frame.
 *
 * THE THIRD SHAPE QUESTION, AND ROUND TWO IS WHY IT IS HERE. Five of twelve final blind reviewers
 * refused work whose bounding-box extent measures 0.52 to 0.99 with the same sentence: "a centred
 * heap floating in empty black with dead corners", "a small centred patch of slats in wide empty
 * margins", "every token sits in a clear black margin". `extentOf` cannot see it — a bounding box
 * says how far the drawing reaches in x and y and says nothing about the region between.
 *
 * Measured on the twelve accepted configurations, six seeds each: corner occupancy runs 0.000 to
 * 0.130 against overall coverage of 0.18 to 0.66, and FOUR of the twelve put literally nothing in
 * any corner or on any edge while reporting an extent of 0.52 to 0.71.
 *
 * IT IS A MEASURE AND NOT A FLOOR, deliberately. A brief asking for a form held well clear of every
 * edge wants this number at zero, and one asking for a section that fills the frame edge to edge
 * wants it high; which is right is the brief's business. What was missing was any way to say the
 * number at all.
 *
 * THE CAUSE IS STRUCTURAL AND WORTH KNOWING BEFORE READING IT AS A BUG. Both runtimes place their
 * marks within a half-extent about the canvas centre, so the reachable region is a DISC inscribed
 * in a square frame and the corners are outside it for every polar and scatter layout. A cell grid
 * reaches them and measures highest here (0.130); a radial one cannot and measures zero.
 */
export function cornerOccupancy(plane, { threshold = 8, groundLab = null, cornerFraction = 0.21, edgePixels = 4 } = {}) {
  const { mask, width, height } = inkMask(plane, threshold, groundLab);
  const q = Math.round(width * cornerFraction);
  let corner = 0;
  let cornerTotal = 0;
  let edge = 0;
  let edgeTotal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inCorner = (x < q || x >= width - q) && (y < q || y >= height - q);
      const onEdge = x < edgePixels || x >= width - edgePixels || y < edgePixels || y >= height - edgePixels;
      if (inCorner) { cornerTotal += 1; if (mask[y * width + x]) corner += 1; }
      if (onEdge) { edgeTotal += 1; if (mask[y * width + x]) edge += 1; }
    }
  }
  return {
    cornerInk: Number((corner / cornerTotal).toFixed(4)),
    edgeInk: Number((edge / edgeTotal).toFixed(4)),
    cornerPixels: cornerTotal,
    edgePixels: edgeTotal,
  };
}

/**
 * How many separate pieces the drawing is in, ignoring specks.
 *
 * FOUR-CONNECTED, and `minPixels` defaults to 4 of 14,400. At browse size a single stray pixel is
 * an antialiasing artefact of the rasteriser rather than a member of the composition, and counting
 * it would make the number track the renderer instead of the picture — the same class of mistake
 * as the corner-sampled background measure this project already caught.
 */
export function componentCount(plane, { threshold = 8, minPixels = 4, groundLab = null } = {}) {
  const { mask, width, height } = inkMask(plane, threshold, groundLab);
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let components = 0;
  let largest = 0;
  let total = 0;
  const sizes = [];
  for (let start = 0; start < width * height; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let size = 0;
    while (sp > 0) {
      const i = stack[--sp];
      size += 1;
      const x = i % width;
      const y = (i - x) / width;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < width - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && mask[i - width] && !seen[i - width]) { seen[i - width] = 1; stack[sp++] = i - width; }
      if (y < height - 1 && mask[i + width] && !seen[i + width]) { seen[i + width] = 1; stack[sp++] = i + width; }
    }
    total += size;
    if (size >= minPixels) { components += 1; sizes.push(size); }
    if (size > largest) largest = size;
  }
  return {
    components,
    largest,
    inkPixels: total,
    // The share of the drawing that is in its biggest piece. 1.0 is one connected mass; a mass
    // that severs into four equal members reads 0.25. This is what a fracture claim moves.
    largestShare: total > 0 ? Number((largest / total).toFixed(3)) : 0,
    sizes: sizes.sort((a, b) => b - a).slice(0, 12),
  };
}

/**
 * Where the drawing's weight sits, as a fraction of the frame, and how far that is from centre.
 *
 * THE MEASURE THAT SETTLES AN ARGUMENT ABOUT AN OFF-CENTRE SUBJECT. Both Wave-1 capability
 * statements refuse an off-centre subject by name -- one cites "an off-centre subject", the other
 * "per-element coordinates" -- and until this measure existed those refusals rested on reading the
 * Solidity, which is precisely the method that produced this project's one false structural
 * conclusion. `offset` makes the claim checkable against the deployed runtimes: sweep the legal
 * space, read the largest offset any configuration reaches, and let THAT decide whether the
 * refusal stands.
 *
 * An empty frame reports the centre with `empty: true` rather than NaN, for the same reason
 * `extentOf` does: a caller that treats an empty frame as centred is right; one that divides by it
 * is not.
 */
export function centroidOf(plane, { threshold = 8, groundLab = null } = {}) {
  const { mask, width, height } = inkMask(plane, threshold, groundLab);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      sx += x; sy += y; n += 1;
    }
  }
  if (n === 0) return { empty: true, cx: 0.5, cy: 0.5, offset: 0 };
  const cx = sx / n / (width - 1);
  const cy = sy / n / (height - 1);
  return {
    empty: false,
    cx: Number(cx.toFixed(4)),
    cy: Number(cy.toFixed(4)),
    offset: Number(Math.hypot(cx - 0.5, cy - 0.5).toFixed(4)),
  };
}

/**
 * Ink per horizontal band, and how sharply adjacent bands differ.
 *
 * THE MEASURE A STRATIFICATION BRIEF IS ABOUT. B03 asks for "horizontal beds stacked edge to edge,
 * a core sample not a landscape", and neither `extentOf` nor `cornerOccupancy` can tell a stack of
 * registers from an even wash: both can carry the same reach and the same coverage. What separates
 * them is whether the ink ALTERNATES down the frame, which is what `adjacentContrast` reads.
 *
 * IT IS A MEASURE AND NOT A FLOOR. A brief asking for an even all-over field wants this number
 * LOW, and one asking for beds wants it high; which is right is the brief's business. Eight bands
 * because a 120px frame gives fifteen pixels a band -- fewer and a bed vanishes into its
 * neighbour, more and the number starts tracking the rasteriser's antialiasing.
 */
export function bandProfile(plane, { threshold = 8, groundLab = null, bands = 8 } = {}) {
  if (!Number.isInteger(bands) || bands < 2) throw new Error(`bandProfile: ${bands} bands is not a profile`);
  const { mask, width, height } = inkMask(plane, threshold, groundLab);
  const rows = [];
  for (let b = 0; b < bands; b += 1) {
    const y0 = Math.floor((b * height) / bands);
    const y1 = Math.floor(((b + 1) * height) / bands);
    let n = 0;
    let t = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = 0; x < width; x += 1) { t += 1; if (mask[y * width + x]) n += 1; }
    }
    rows.push(t > 0 ? Number((n / t).toFixed(4)) : 0);
  }
  let ac = 0;
  for (let i = 1; i < rows.length; i += 1) ac += Math.abs(rows[i] - rows[i - 1]);
  const filled = rows.filter((r) => r >= 0.04).length;
  return {
    rows,
    bands,
    adjacentContrast: Number((ac / (rows.length - 1)).toFixed(4)),
    /** How many bands carry drawing at all. A section that stops halfway down is not a section. */
    livingBands: filled,
  };
}

/**
 * How evenly the ink is spread over the four quadrants.
 *
 * `evenness` is min/max, so 1.0 is a perfectly balanced field and 0.0 is a quadrant with nothing in
 * it. THE MEASURE AN ALL-OVER FIELD BRIEF IS ABOUT, and the one that separates it from a centred
 * figure whose bounding box happens to be large: a centred figure reaching all four edges still
 * measures high evenness, so evenness is read BESIDE `cornerOccupancy` and `componentCount`, never
 * instead of them.
 */
export function quadrantBalance(plane, { threshold = 8, groundLab = null } = {}) {
  const { mask, width, height } = inkMask(plane, threshold, groundLab);
  const ink = [0, 0, 0, 0];
  const total = [0, 0, 0, 0];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const q = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
      total[q] += 1;
      if (mask[y * width + x]) ink[q] += 1;
    }
  }
  const f = ink.map((v, i) => (total[i] > 0 ? v / total[i] : 0));
  const mn = Math.min(...f);
  const mx = Math.max(...f);
  return {
    quadrants: f.map((v) => Number(v.toFixed(4))),
    evenness: Number((mx > 0 ? mn / mx : 0).toFixed(4)),
  };
}

/**
 * What KIND of mark the drawing is made of: the share of ink pixels that sit on a boundary.
 *
 * THE MEASURE FOUR OF TWELVE ROUND-TWO REFUSALS TURNED ON AND NOTHING COULD STATE. "The dominant
 * mark is a 10:1 rectangular slab, not a rounded cell"; "there is no stroke anywhere in the work,
 * everything is filled translucent shape"; "the body is a fan of filled overlapping gold slabs -- a
 * solid pad, not line work". Every one of those is a claim about the MARK rather than about the
 * composition, and `inkCoverage` cannot make it: a hairline lattice and a solid slab can carry the
 * same coverage.
 *
 * A thread is nearly all boundary and a plate is nearly none, so this ONE number orders the whole
 * member vocabulary. Measured at 120px against the declared ground on the deployed runtimes: a
 * filled RECT reads 0.177 and a POLYLINE reads 0.533, with every other primitive in between.
 *
 * NOT A QUALITY SCORE, and it may never become one -- a brief asking for mass wants it low and one
 * asking for filigree wants it high.
 */
export function strokeSignature(plane, { threshold = 8, groundLab = null } = {}) {
  const { mask, width, height } = inkMask(plane, threshold, groundLab);
  let ink = 0;
  let boundary = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      ink += 1;
      const up = y === 0 || !mask[i - width];
      const dn = y === height - 1 || !mask[i + width];
      const lf = x === 0 || !mask[i - 1];
      const rt = x === width - 1 || !mask[i + 1];
      if (up || dn || lf || rt) boundary += 1;
    }
  }
  return { inkPixels: ink, boundaryShare: ink > 0 ? Number((boundary / ink).toFixed(4)) : 0 };
}
