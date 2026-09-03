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
export function inkMask(plane, threshold = 8) {
  const g = ground(plane);
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
export function extentOf(plane, threshold = 8) {
  const { mask, width, height } = inkMask(plane, threshold);
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
 * How many separate pieces the drawing is in, ignoring specks.
 *
 * FOUR-CONNECTED, and `minPixels` defaults to 4 of 14,400. At browse size a single stray pixel is
 * an antialiasing artefact of the rasteriser rather than a member of the composition, and counting
 * it would make the number track the renderer instead of the picture — the same class of mistake
 * as the corner-sampled background measure this project already caught.
 */
export function componentCount(plane, { threshold = 8, minPixels = 4 } = {}) {
  const { mask, width, height } = inkMask(plane, threshold);
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
