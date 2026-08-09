// SPDX-License-Identifier: MIT
//
// ON-CHAIN JAVASCRIPT TEMPLATE — written with the byte budget in view.
//
// The JAVASCRIPT runtime stores this file with the project and re-runs it on every read, so the
// script IS part of the artwork. The public per-project budget is 36,000 bytes; `relics validate`
// prints the current size and fails above the budget.
//
// The techniques on show here:
//   * one drawing primitive (<path>) instead of six element types
//   * colours derived from one hue rather than a palette table
//   * one loop that does the whole composition
//   * every parameter earns its bytes
//
// Comments are free to keep while you work — strip them at export time if you need the room.

export const manifest = {
  title: "On-chain JS",
  description: "One hue, one loop, one primitive.",
  destinations: ["distortion", "palette"],
};

export function render(context) {
  const { random, market, size } = context;

  // `palette` arrives in [0,1] from the holder-growth mapping; it selects a hue, not a table.
  const paletteDrive = num(market.palette, random.next());
  const distortion = num(market.distortion, 0.25);

  const hue = Math.round(paletteDrive * 340);
  const ink = `hsl(${hue} 45% 78%)`;
  const glow = `hsl(${(hue + 40) % 360} 62% 58%)`;
  const ground = `hsl(${hue} 28% 6%)`;

  const arms = random.int(5, 13);
  const turns = random.float(1.6, 4.2);
  const centre = size / 2;
  const radius = size * 0.42;

  let paths = "";
  for (let arm = 0; arm < arms; arm++) {
    const phase = (arm / arms) * Math.PI * 2;
    const wobble = random.float(0.4, 1.6);
    let d = "";
    for (let step = 0; step <= 48; step++) {
      const t = step / 48;
      const angle = phase + t * turns * Math.PI * 2;
      const warp = 1 + Math.sin(angle * wobble) * distortion * 0.5;
      const x = centre + Math.cos(angle) * radius * t * warp;
      const y = centre + Math.sin(angle) * radius * t * warp;
      d += `${step === 0 ? "M" : "L"} ${r(x)} ${r(y)} `;
    }
    paths += `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity="${r(0.2 + 0.5 * (1 - arm / arms))}" stroke-width="${r(random.float(0.6, 2.2))}"/>`;
  }

  paths += `<path d="M ${r(centre)} ${r(centre - size * 0.03)} L ${r(centre + size * 0.03)} ${r(centre)} L ${r(centre)} ${r(centre + size * 0.03)} L ${r(centre - size * 0.03)} ${r(centre)} Z" fill="${glow}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${ground}"/>${paths}</svg>`;
}

function num(candidate, fallback) {
  return typeof candidate === "number" ? candidate : fallback;
}

function r(n) {
  return Math.round(n * 10) / 10;
}
