#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE DOCUMENTATION FACT GENERATOR.
//
//   node scripts/generate-doc-assets.mjs            # write assets + generated doc blocks
//   node scripts/generate-doc-assets.mjs --check    # write nothing; exit 1 if anything is stale
//   node scripts/generate-doc-assets.mjs --json     # machine-readable report
//
// WHY THIS EXISTS. A protocol value typed into nine markdown pages goes stale in eight of them,
// and a stale number in a document stays plausible forever because nobody re-derives it after the
// first review. So the documentation does not type protocol values. It carries GENERATED BLOCKS —
//
//     <!-- generated:chains -->  ...machine-written...  <!-- /generated:chains -->
//
// — and this script is the only thing that writes inside them. `--check` re-renders every block
// and every asset and fails on any divergence, which is what makes the gate real rather than a
// convention people remember for two months.
//
// HUMAN PROSE STAYS HUMAN. Only load-bearing values are generated: the hook mask, the protection
// schedule, launch-mode availability, the chain table, the fee allocation, the immutability table.
// Everything a reader actually reads for meaning is written by a person and left alone.
//
// WHERE THE VALUES COME FROM — two sources, and neither of them is this file.
//
//   1. THE FEE ALLOCATION is imported from `packages/project-schema/src/economics.js`, which is
//      the ONE place this repository may declare it. `npm run kit:economics` fails any second
//      declaration, so re-typing 75/12.50/12.50 here would break that gate, correctly.
//
//   2. EVERY OTHER FAST-MOVING VALUE is read from `docs/launchpad/protocol-facts.json`, the
//      documentation's single declaration, where each field carries the contract constant, config
//      file or package export it mirrors.
//
// NO PICTURE IS HAND-DRAWN, AND NONE IS INVENTED. `docs/assets/hero.svg` is a contact sheet of
// REAL renders: this script loads the shipped starter templates and runs the creator kit's own
// generator sandbox on them, in process, so every tile is byte-identical to what
// `relics preview` writes for the same template and seed. A hand-drawn approximation of what the
// art "looks like" would be the one image in this repository a reader could not reproduce.
//
// THE DRAWING TYPES NO NUMBER. The fee curve in `docs/assets/launch-protection.svg` is plotted by
// running the schedule arithmetic in {@link buyFeePipsAt} over the declared constants — the same
// add-on form the hook runs, not the endpoint form, which differs by a pip almost everywhere
// between the endpoints. A chart is copy; most readers meet the fee only as a picture.
//
// FUTURE: if `@relics/project-schema` ever exports the launch-protection constants directly (the
// launchpad's own `launch-protection` package is the upstream authority), {@link resolveProtection}
// will prefer them automatically and the JSON declaration becomes a fallback. The named exports it
// looks for are listed in PROTECTION_EXPORT_CONTRACT below.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { NOMINAL_ALLOCATION_PERCENT, PLATFORM_SUBDIVISION_PROSE } from "../packages/project-schema/index.js";
import { readConfig, readProjectFiles, generatorSources } from "../packages/creator-cli/src/project.js";
import { createVmModule } from "../packages/creator-cli/src/sandbox.js";
import { buildRenderContext, deriveTraits } from "../packages/creator-cli/src/schema.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FACTS_PATH = join(ROOT, "docs", "launchpad", "protocol-facts.json");
const ASSETS_DIR = join(ROOT, "docs", "assets");
const DOCS_DIR = join(ROOT, "docs");

const CHECK = process.argv.includes("--check");
const JSON_OUT = process.argv.includes("--json");

const facts = JSON.parse(readFileSync(FACTS_PATH, "utf8"));

// ---------------------------------------------------------------------------------------------
// THE PROTECTION CONSTANTS, AND WHERE THEY ARE ALLOWED TO COME FROM
// ---------------------------------------------------------------------------------------------

/** The named exports a canonical upstream package must provide before it can replace the JSON. */
const PROTECTION_EXPORT_CONTRACT = [
  "FEE_PIPS_DENOMINATOR",
  "ANTI_SNIPE_WINDOW_SECONDS",
  "ANTI_SNIPE_START_FEE_PIPS",
  "ANTI_SNIPE_END_FEE_PIPS",
  "ANTI_SNIPE_INITIAL_ADDON_PIPS",
  "SELL_FEE_PIPS",
];

/**
 * Resolve the schedule constants from the canonical package export, and CROSS-CHECK them against
 * the JSON declaration rather than falling back to it.
 *
 * This used to prefer the package "if it ever appears" and silently use the JSON otherwise. That
 * was written when `packages/project-schema/src/launch-protection.js` was missing from this branch
 * — and a silent fallback is how nobody noticed. The module is the canonical declaration now, so a
 * missing export is a broken package and must say so, not quietly restore a hand-maintained copy.
 *
 * The JSON stays, and stays checked. It is the mirror of the launchpad's own source and carries the
 * per-field `source` notes a reader needs; keeping both and asserting they agree turns two
 * declarations into one verified fact instead of two that drift until someone reads both.
 */
async function resolveProtection() {
  const pkg = await import("../packages/project-schema/index.js");
  const missing = PROTECTION_EXPORT_CONTRACT.filter((k) => typeof pkg[k] !== "number");
  if (missing.length > 0) {
    throw new Error(
      `@relics/project-schema does not export ${missing.join(", ")} as numbers. The launch-protection ` +
        `declaration is the source for these figures; a generated asset must not be produced from a ` +
        `second copy while the first one is broken.`,
    );
  }

  const resolved = {
    provenance: "@relics/project-schema",
    denominator: pkg.FEE_PIPS_DENOMINATOR,
    durationSeconds: pkg.ANTI_SNIPE_WINDOW_SECONDS,
    maxBuyPips: pkg.ANTI_SNIPE_START_FEE_PIPS,
    basePips: pkg.ANTI_SNIPE_END_FEE_PIPS,
    addonPips: pkg.ANTI_SNIPE_INITIAL_ADDON_PIPS,
    sellPips: pkg.SELL_FEE_PIPS,
  };

  const p = facts.launchProtection;
  const mirror = {
    denominator: p.feePipsDenominator,
    durationSeconds: p.durationSeconds,
    maxBuyPips: p.maxEffectiveBuyFeePips,
    basePips: p.baseLpFeePips,
    addonPips: p.initialAddonPips,
    sellPips: p.sellFeePips,
  };
  const disagreements = Object.entries(mirror)
    .filter(([k, v]) => resolved[k] !== v)
    .map(([k, v]) => `${k}: declaration ${resolved[k]}, docs/launchpad/protocol-facts.json ${v}`);
  if (disagreements.length > 0) {
    throw new Error(
      `the launch-protection declaration and its JSON mirror disagree:\n  ${disagreements.join("\n  ")}\n` +
        `One of them is wrong about a fee a reader will act on. Fix the wrong one; do not generate from either.`,
    );
  }

  return resolved;
}

const P = await resolveProtection();

/**
 * THE SCHEDULE, in the add-on form the hook runs.
 *
 *   fee = BASE + floor(ADDON * max(DURATION - elapsed, 0) / DURATION), clamped to [BASE, MAX]
 *
 * NOT `MAX - floor(span * elapsed / DURATION)`. Those agree at both endpoints and differ by one
 * pip almost everywhere between them, because the floor falls on the other side.
 */
function buyFeePipsAt(elapsedSeconds) {
  if (elapsedSeconds <= 0) return P.maxBuyPips;
  if (elapsedSeconds >= P.durationSeconds) return P.basePips;
  const remaining = P.durationSeconds - elapsedSeconds;
  const addon = Math.floor((P.addonPips * remaining) / P.durationSeconds);
  return Math.min(P.maxBuyPips, Math.max(P.basePips, P.basePips + addon));
}

const pctOfPips = (pips) => (pips / P.denominator) * 100;
/** "99%" / "1%" / "68.7%" — trailing zeros trimmed, because a fee is read here, not reconciled. */
const pipsLabel = (pips) => `${Number(pctOfPips(pips).toFixed(2))}%`;

// ---------------------------------------------------------------------------------------------
// THE FEE-CURVE ASSET
// ---------------------------------------------------------------------------------------------

/**
 * The published checkpoints. Chosen for a reader (round minutes), computed for the chain.
 *
 * These same values render as the SVG's plotted line AND as the markdown table beneath it, from
 * one array, so the picture and its text equivalent cannot disagree.
 */
function checkpointMinutes() {
  const totalMinutes = P.durationSeconds / 60;
  const out = [0, 1, 10, 30, 60, 90, totalMinutes];
  return [...new Set(out.filter((m) => m <= totalMinutes))].sort((a, b) => a - b);
}

const CHECKPOINTS = checkpointMinutes().map((m) => ({
  minutes: m,
  seconds: Math.round(m * 60),
  buyPips: buyFeePipsAt(Math.round(m * 60)),
}));

/**
 * The launch-protection curve.
 *
 * DESIGN CONSTRAINTS, all of them load-bearing rather than decorative:
 *
 *   * SELF-CONTAINED PANEL. GitHub renders this through an `<img>` tag, and an `<img>`-embedded
 *     SVG cannot reliably read the host page's colour scheme. So the graphic paints its own
 *     ground instead of inheriting one, and reads identically under the light and the dark
 *     README. No `prefers-color-scheme`, no `currentColor`, no transparency over an unknown page.
 *   * NEVER COLOUR ALONE. The three series differ by stroke pattern (solid / long-dash /
 *     short-dash) and each carries a label attached to the line itself, so the chart survives
 *     greyscale printing and every form of colour blindness.
 *   * A TEXT EQUIVALENT TRAVELS WITH IT. `<title>` and `<desc>` are the accessible name and
 *     description; the generated checkpoint table sits directly beneath it in the page.
 *   * NO EMBEDDED FONT AND NO EXTERNAL REFERENCE. System font stack only; nothing is fetched.
 */
function renderProtectionSvg() {
  const W = 880;
  const H = 470;
  const M = { top: 62, right: 34, bottom: 92, left: 74 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const totalMinutes = P.durationSeconds / 60;
  const maxPct = pctOfPips(P.maxBuyPips);

  const x = (minutes) => M.left + (minutes / totalMinutes) * plotW;
  const y = (pct) => M.top + plotH - (pct / maxPct) * plotH;

  // 1 point per 30 s: fine enough that the integer floor's staircase disappears at this scale,
  // coarse enough that the file stays small and the diff stays reviewable.
  const step = 30;
  const points = [];
  for (let s = 0; s <= P.durationSeconds; s += step) {
    points.push([x(s / 60), y(pctOfPips(buyFeePipsAt(s)))]);
  }
  points.push([x(totalMinutes), y(pctOfPips(P.basePips))]);
  const protectedPath = points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");

  // THE TWO FLAT SERIES COINCIDE, AND THE PICTURE SAYS SO RATHER THAN FAKING A GAP. An unprotected
  // buy and a sell in either mode are BOTH exactly the base fee — the same number, at every
  // instant — so they are drawn as ONE line at the true value, carrying two dash patterns that
  // interleave: the long teal dashes are the unprotected buy, and the short violet dashes fall in
  // their gaps and are the sell side.
  //
  // The rejected alternative was to offset one of them by a few pixels. At this scale 1% is about
  // three pixels off the axis, so any offset large enough to see is large enough to read as a
  // different fee — and a chart that invents a gap between two identical numbers is worse than one
  // that admits they are the same line.
  const flatY = y(pctOfPips(P.basePips));
  const flatPath = `M${x(0).toFixed(1)} ${flatY.toFixed(1)} L${x(totalMinutes).toFixed(1)} ${flatY.toFixed(1)}`;

  const yTicks = [0, 20, 40, 60, 80, 99].filter((v) => v <= maxPct);
  const xTicks = [0, 20, 40, 60, 80, totalMinutes];

  const grid = [
    ...yTicks.map(
      (v) =>
        `<line x1="${M.left}" y1="${y(v).toFixed(1)}" x2="${(M.left + plotW).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/>` +
        `<text x="${M.left - 12}" y="${(y(v) + 4).toFixed(1)}" class="tick" text-anchor="end">${v}%</text>`,
    ),
    ...xTicks.map(
      (v) =>
        `<line x1="${x(v).toFixed(1)}" y1="${M.top}" x2="${x(v).toFixed(1)}" y2="${(M.top + plotH).toFixed(1)}" class="grid"/>` +
        `<text x="${x(v).toFixed(1)}" y="${(M.top + plotH + 24).toFixed(1)}" class="tick" text-anchor="middle">${v}</text>`,
    ),
  ].join("\n    ");

  const markers = CHECKPOINTS.filter((c) => c.minutes !== 0 && c.minutes !== totalMinutes && c.minutes !== 1)
    .map((c) => `<circle cx="${x(c.minutes).toFixed(1)}" cy="${y(pctOfPips(c.buyPips)).toFixed(1)}" r="3.5" class="dot"/>`)
    .join("\n    ");

  const desc =
    `Buy-side LP fee against minutes since the pool opened. With PROTECTED_98_MINUTES the buy fee starts at ` +
    `${pipsLabel(P.maxBuyPips)} and falls to ${pipsLabel(P.basePips)} over ${totalMinutes} minutes; ` +
    CHECKPOINTS.map((c) => `${c.minutes} min ${pipsLabel(c.buyPips)}`).join(", ") +
    `. With NONE the buy fee is a flat ${pipsLabel(P.basePips)} from the first block. The sell fee is a flat ` +
    `${pipsLabel(P.sellPips)} in both modes, at every instant. The three series are distinguished by line ` +
    `pattern as well as colour: the decaying buy fee is a solid line, the unprotected buy fee is long-dashed, ` +
    `and the sell fee is short-dashed. The unprotected buy fee and the sell fee are the same number at ` +
    `every instant, so they share one line: the long teal dashes are the unprotected buy and the short ` +
    `violet dashes between them are the sell side.`;

  // The legend sits inside the plot, in the top-right quadrant the decaying curve never enters.
  const lx = M.left + plotW - 262;
  const ly = M.top + 16;
  const legendRow = (i, cls, dash, name, sub) =>
    `<line x1="${lx + 12}" y1="${ly + 26 + i * 26}" x2="${lx + 52}" y2="${ly + 26 + i * 26}" class="${cls}"/>` +
    `<text x="${lx + 62}" y="${ly + 30 + i * 26}" class="lbl ${dash}">${esc(name)}</text>` +
    `<text x="${lx + 62}" y="${ly + 43 + i * 26}" class="sub ${dash}">${esc(sub)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="lp-title lp-desc" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">
  <title id="lp-title">RELICS Launchpad launch-protection fee schedule</title>
  <desc id="lp-desc">${esc(desc)}</desc>
  <style>
    .bg{fill:#0b0e13}
    .panel{fill:none;stroke:#2a3340;stroke-width:1}
    .grid{stroke:#1c2430;stroke-width:1}
    .axis{stroke:#5a6878;stroke-width:1.5}
    .tick{fill:#8b98a8;font-size:12px}
    .h1{fill:#e8eaed;font-size:17px;letter-spacing:.06em}
    .h2{fill:#8b98a8;font-size:12px;letter-spacing:.04em}
    .note{fill:#7f8c9c;font-size:11px}
    .onLine{fill:#a8b6c6;font-size:11.5px}
    .lead{stroke:#4a5765;stroke-width:1}
    .lbl{font-size:12.5px}
    .sub{font-size:10.5px;opacity:.72}
    .legendBox{fill:#101620;stroke:#2a3340;stroke-width:1}
    .protectedLine{fill:none;stroke:#e0a04a;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
    .protectedLbl{fill:#e0a04a}
    .noneLine{fill:none;stroke:#63b7c9;stroke-width:3;stroke-dasharray:14 14;stroke-linecap:butt}
    .noneLbl{fill:#63b7c9}
    .sellLine{fill:none;stroke:#b3a4dd;stroke-width:3;stroke-dasharray:6 22;stroke-dashoffset:-18;stroke-linecap:butt}
    .sellSwatch{fill:none;stroke:#b3a4dd;stroke-width:3;stroke-dasharray:5 5;stroke-linecap:butt}
    .sellLbl{fill:#b3a4dd}
    .dot{fill:#e0a04a;stroke:#0b0e13;stroke-width:1.5}
  </style>
  <rect class="bg" x="0" y="0" width="${W}" height="${H}"/>
  <rect class="panel" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}"/>
  <text x="${M.left}" y="32" class="h1">LAUNCH PROTECTION — LP FEE BY SIDE</text>
  <text x="${M.left}" y="50" class="h2">${esc(`Creator election · ${totalMinutes}-minute decay if taken · anchored at pool initialization · no exemptions`)}</text>
  <g>
    ${grid}
  </g>
  <line class="axis" x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${M.top + plotH}"/>
  <line class="axis" x1="${M.left}" y1="${M.top + plotH}" x2="${M.left + plotW}" y2="${M.top + plotH}"/>
  <path class="noneLine" d="${flatPath}"/>
  <path class="sellLine" d="${flatPath}"/>
  <line class="lead" x1="${x(22).toFixed(1)}" y1="${(flatY - 4).toFixed(1)}" x2="${x(22).toFixed(1)}" y2="${(flatY - 46).toFixed(1)}"/>
  <text x="${x(22).toFixed(1)}" y="${(flatY - 52).toFixed(1)}" class="onLine" text-anchor="middle">${esc(`${pipsLabel(P.basePips)} — NONE buy AND sell side, coincident`)}</text>
  <path class="protectedLine" d="${protectedPath}"/>
  <g>
    ${markers}
  </g>
  <g>
    <rect class="legendBox" x="${lx}" y="${ly}" width="262" height="94" rx="2"/>
    ${legendRow(0, "protectedLine", "protectedLbl", "PROTECTED_98_MINUTES", "buy side — solid")}
    ${legendRow(1, "noneLine", "noneLbl", "NONE", "buy side — long dash")}
    ${legendRow(2, "sellSwatch", "sellLbl", "SELL SIDE", "both modes — short dash")}
  </g>
  <text x="${(M.left + plotW / 2).toFixed(1)}" y="${(M.top + plotH + 48).toFixed(1)}" class="tick" text-anchor="middle">MINUTES SINCE THE POOL OPENED</text>
  <text x="20" y="${(M.top + plotH / 2).toFixed(1)}" class="tick" text-anchor="middle" transform="rotate(-90 20 ${(M.top + plotH / 2).toFixed(1)})">LP FEE ON THE SWAP INPUT</text>
  <text x="${M.left}" y="${H - 30}" class="note">${esc(`Unprotected buy and sell are the same number, so they share one line: long teal dashes, short violet dashes between.`)}</text>
  <text x="${M.left}" y="${H - 14}" class="note">${esc(`Plotted from the hook's own add-on arithmetic, never from typed checkpoints.`)}</text>
</svg>
`;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------------------------
// THE GENERATED DOC BLOCKS
// ---------------------------------------------------------------------------------------------

const totalMinutes = P.durationSeconds / 60;

const BLOCKS = {
  /**
   * The status line every launchpad page opens with. One sentence, one source.
   *
   * THE OPEN/CLOSED LINE IS COUNTED, NOT TYPED. It used to read "closed on all N configured chains"
   * as a literal, which stayed on every page for as long as it took someone to notice a chain had
   * opened. Now the sentence cannot disagree with the chain table beneath it, because both are the
   * same array.
   */
  "status-banner": () => {
    const open = facts.chains.filter((c) => c.publicCreatorLaunch === "OPEN");
    const closed = facts.chains.filter((c) => c.publicCreatorLaunch !== "OPEN");
    const names = (list) => list.map((c) => `${c.displayName} (${c.chainId})`).join(", ");
    const access =
      open.length === 0
        ? `> Public creator launch is **closed** on all ${facts.chains.length} configured chains.`
        : closed.length === 0
          ? `> Public creator launch is **open** on all ${facts.chains.length} configured chains.`
          : `> Public creator launch is **open** on ${names(open)} and **closed** on the other ${closed.length} configured chain${closed.length === 1 ? "" : "s"}.`;
    return [
      `> **${facts.generation.id} is ${facts.deployment.status}.** ${facts.deployment.statusSentence}`,
      access,
      `> See [08 — Status and limitations](08-status.md).`,
    ].join("\n");
  },

  /** The chain table. All four chains, truthful per-chain status, no addresses. */
  chains: () =>
    [
      "| Chain | Chain ID | RC6 launch status | Default quote | Additional quote support | Explorer |",
      "| --- | ---: | --- | --- | --- | --- |",
      ...facts.chains.map(
        (c) =>
          `| ${c.displayName} | ${c.chainId} | \`${c.rc6Status}\` · public launch ${c.publicCreatorLaunch.toLowerCase()} | ${c.defaultQuote} | ${c.additionalQuoteSupport} | \`${c.explorer.replace(/^https:\/\//, "")}\` |`,
      ),
      "",
      facts.chainsNote,
    ].join("\n"),

  /** The permission mask, spelled out from its flag bits. */
  "hook-mask": () =>
    [
      "```",
      facts.hook.callbacks
        .map((cb) => `${cb.padEnd(20)} ${facts.hook.flagBits[cb]}`)
        .join("\n") + `\n${"".padEnd(20)} ${"-".repeat(20)}\n${"MASK".padEnd(20)} ${facts.hook.permissionMask}`,
      "```",
      "",
      `No return-delta permission, no donate permission, no \`beforeInitialize\`, no remove-liquidity callback.`,
      `Hook generation \`${facts.hook.generation}\`, classified \`${facts.hook.classification}\`.`,
      "",
      `> \`${facts.hook.supersededMask}\` is **not** this mask. ${facts.hook.supersededMaskNote}`,
    ].join("\n"),

  /** The two elections plus the sentinel, with the schedule numbers. */
  "launch-protection": () => {
    const rows = facts.launchProtection.modes.map((m) => {
      if (!m.selectable) {
        return `| \`${m.id}\` | ${m.wireValue} | **not selectable** | — | — | ${m.summary} |`;
      }
      const buy = m.protected
        ? `${pipsLabel(m.startBuyFeePips)} → ${pipsLabel(m.terminalBuyFeePips)} over ${m.durationSeconds / 60} min`
        : `${pipsLabel(m.startBuyFeePips)} flat, from the first block`;
      return `| \`${m.id}\` | ${m.wireValue} | selectable | ${buy} | ${pipsLabel(m.sellFeePips)} flat | ${m.summary} |`;
    });
    return [
      "| Mode | Enum | Creator may elect | Buy-side LP fee | Sell-side LP fee | What it is |",
      "| --- | ---: | --- | --- | --- | --- |",
      ...rows,
      "",
      `**Schedule:** \`${facts.launchProtection.scheduleFormula}\`, with`,
      `\`BASE = ${facts.launchProtection.baseLpFeePips}\` pips, \`ADDON = ${facts.launchProtection.initialAddonPips}\` pips,`,
      `\`MAX_EFFECTIVE_BUY = ${facts.launchProtection.maxEffectiveBuyFeePips}\` pips and \`DURATION = ${facts.launchProtection.durationSeconds}\` s`,
      `(pips of the swap input; \`${facts.launchProtection.feePipsDenominator}\` pips = 100%).`,
      "",
      `**Anchor:** ${facts.launchProtection.anchor}. ${facts.launchProtection.anchorNote}`,
      "",
      `**Exemptions:** ${facts.launchProtection.exemptions}. ${facts.launchProtection.exemptionsNote}`,
      "",
      `**Mutable after launch:** ${facts.launchProtection.mutableAfterLaunch ? "yes" : "no"}.`,
      `**Protection mandatory:** ${facts.launchProtection.protectionIsMandatory ? "yes" : "no"} — it is a creator election.`,
      `**Studio default:** \`${facts.launchProtection.studioDefaultMode}\`; electing \`NONE\` requires an explicit acknowledgement.`,
    ].join("\n");
  },

  /** The checkpoint table — the fee curve's text equivalent. */
  "launch-protection-checkpoints": () =>
    [
      `| Minutes since the pool opened | Seconds | Buy-side LP fee (\`PROTECTED_98_MINUTES\`) | Buy-side LP fee (\`NONE\`) | Sell-side LP fee (both) |`,
      "| ---: | ---: | ---: | ---: | ---: |",
      ...CHECKPOINTS.map(
        (c) =>
          `| ${c.minutes} | ${c.seconds} | ${pipsLabel(c.buyPips)} | ${pipsLabel(P.basePips)} | ${pipsLabel(P.sellPips)} |`,
      ),
      `| ${totalMinutes}+ | ${P.durationSeconds}+ | ${pipsLabel(P.basePips)} | ${pipsLabel(P.basePips)} | ${pipsLabel(P.sellPips)} |`,
    ].join("\n"),

  /** Which launch methods a creator may actually select. */
  "launch-modes": () =>
    [
      "| Launch method | Enum | Offered to creators | What it does |",
      "| --- | ---: | --- | --- |",
      ...facts.launchModes.map(
        (m) =>
          `| ${m.label} (\`${m.id}\`) | ${m.wireValue} | ${m.availability === "AVAILABLE" ? "**yes**" : `**no** — \`${m.availability}\``} | ${m.summary} |`,
      ),
      "",
      ...facts.launchModes
        .filter((m) => m.reason)
        .map((m) => `**Why \`${m.id}\` is not offered.** ${m.reason}`),
    ].join("\n"),

  /**
   * The fee allocation. Every figure here is imported from the schema package's economics
   * declaration; none is typed in this file or in protocol-facts.json.
   */
  "fee-allocation": () =>
    [
      "| Slice | Share of collected LP fees | Notes |",
      "| --- | ---: | --- |",
      `| Creator entitlement | ${NOMINAL_ALLOCATION_PERCENT.creator} | Claimed by the \`ProjectRights\` holder. Collaborator sub-splits come out of this share and can never reach the platform's. |`,
      `| $RELICS buy-and-entomb allocation | ${NOMINAL_ALLOCATION_PERCENT.relicsBuybackReserve} | ${PLATFORM_SUBDIVISION_PROSE.relicsBuybackReserve} of the platform share. |`,
      `| Retained protocol treasury | ${NOMINAL_ALLOCATION_PERCENT.platformTreasury} | ${PLATFORM_SUBDIVISION_PROSE.platformTreasury} of the platform share. |`,
      "",
      `These are ratios applied to **collected LP fees**, never to trading volume, and the settled figures differ by floor-division rounding. The declaration is \`packages/project-schema/src/economics.js\`; \`npm run kit:economics\` fails any second declaration of it.`,
    ].join("\n"),

  /** Which components a creator's project depends on, and which of them can change. */
  immutability: () =>
    [
      "| Component | Scope | Upgradeable | Authority |",
      "| --- | --- | --- | --- |",
      ...facts.components.map(
        (c) =>
          `| \`${c.name}\` | ${c.scope} | ${c.upgradeable ? "**yes**" : "no"} | ${c.upgradeable ? c.authority : "none — no proxy, no admin, no upgrade path"} |`,
      ),
      "",
      `Upgrade authority: ${facts.governance.upgradeAuthority}. Governance timelock: **${facts.governance.governanceTimelock}**.`,
      facts.governance.governanceTimelockNote,
    ].join("\n"),

  /** The two digests, and which one reaches a chain. */
  "metadata-commitment": () =>
    [
      "| Value | Where it lives | Definition |",
      "| --- | --- | --- |",
      `| \`${facts.metadata.onChainField}\` | \`LaunchParams\`, on chain | ${facts.metadata.onChainFieldDefinition} |`,
      `| \`${facts.metadata.offChainField}\` | the \`.relics\` bundle and the studio, off chain | ${facts.metadata.offChainFieldDefinition} |`,
      "",
      facts.metadata.confusionNote,
      "",
      `- Zero \`${facts.metadata.onChainField}\` is **refused** at the launch gate.`,
      `- \`contractURI()\` is non-empty in the launch receipt state: **${facts.metadata.contractUriNonEmptyAtReceipt ? "yes" : "no"}**.`,
      `- A second, post-launch metadata-bind transaction: **${facts.metadata.postLaunchBindTransaction ? "yes" : "no"}**. ${facts.metadata.postLaunchBindTransactionNote}`,
      `- ${facts.metadata.addressInvarianceNote}`,
    ].join("\n"),

  /**
   * Enforced creator royalties, per chain. The table exists because the answer is NOT the same on
   * every chain and the difference is a launch-time revert, not a footnote.
   */
  "creator-earnings": () =>
    [
      "| Policy version | Validator architecture | Validator address | Chains that resolve it | Default? |",
      "| ---: | --- | --- | --- | --- |",
      ...facts.creatorEarnings.policyVersions.map(
        (v) =>
          `| ${v.version} | ${v.architecture} | \`${v.validator}\` | ${v.chainIds.join(", ")} | ${v.isDefault ? "**yes**" : "no"} |`,
      ),
      "",
      `A creator elects a **mode** — \`${facts.creatorEarnings.modes.join("`, `")}\` — and, for \`ENFORCED\`, a **policy version**. They never name a validator address; the version resolves one, per chain, against a codehash pinned for that chain.`,
      "",
      `- Expressing no preference resolves to policy version **${facts.creatorEarnings.defaultPolicyVersion}**. The highest version this build knows is **${facts.creatorEarnings.latestPolicyVersion}**; above it the launch reverts \`InvalidValidatorPolicyVersion\`.`,
      `- On a chain where the requested version resolves to nothing, the launch reverts \`EnforcedEarningsUnavailableOnChain(chainId, policyVersion)\`. **There is no silent downgrade to another version, and no fallback to \`OPTIONAL\`.**`,
      `- Ceiling: **${facts.creatorEarnings.maxRoyaltyBps} bps**. ${facts.creatorEarnings.maxRoyaltyBpsNote}`,
      `- \`ENFORCED\` is unavailable on chain ${facts.creatorEarnings.enforcedUnavailableChainIds.join(", ")}. ${facts.creatorEarnings.enforcedUnavailableNote}`,
      "",
      facts.creatorEarnings.policyVersionNote,
    ].join("\n"),

  /** The creator's fee-asset election. */
  "creator-payout": () =>
    [
      "| Mode | Enum | What the creator claims |",
      "| --- | ---: | --- |",
      ...facts.creatorPayout.modes.map((m) => `| \`${m.id}\` | ${m.wireValue} | ${m.summary} |`),
      "",
      `Elected once, at launch, and **immutable for the life of the project**. ${facts.creatorPayout.defaultedNote}`,
      `Both modes are available on both lanes, including the wrapped-native lane.`,
    ].join("\n"),
};

// ---------------------------------------------------------------------------------------------
// THE HERO CONTACT SHEET — REAL KIT OUTPUT, NOT AN ILLUSTRATION
// ---------------------------------------------------------------------------------------------

/**
 * The four tiles, and why these four.
 *
 * One render from each of four DIFFERENT shipped templates rather than four seeds of one, because
 * the thing a reader is deciding is which template to start from. Four seeds of `minimal` would
 * show that the seed changes the image — true, and not the question anybody arrives with.
 *
 * `static-art` is deliberately absent: it is the template whose whole point is that it does not
 * vary, so a contact sheet is the one place it says the least.
 */
const HERO_TILES = [
  { template: "minimal", seed: "1" },
  { template: "solidity-svg-params", seed: "2" },
  { template: "onchain-js", seed: "3" },
  { template: "market-responsive", seed: "4" },
];

/**
 * Render one tile THROUGH THE KIT, not beside it.
 *
 * This is the creator CLI's own `previewProject` path, minus the file writing: the same
 * `readProjectFiles`, the same `generatorSources`, the same `createVmModule` sandbox and the same
 * `buildRenderContext`. That is what makes the claim under the picture checkable — the bytes here
 * are the bytes `relics preview <template> --seeds N` writes, and
 * `packages/creator-cli/templates/<t>/previews/seed-N.svg` is a third copy of them.
 *
 * If a template's generator ever stops being deterministic, this throws during generation rather
 * than quietly producing a different hero.
 */
function renderTile({ template, seed }) {
  const root = join(ROOT, "packages", "creator-cli", "templates", template);
  const config = readConfig(root);
  const files = readProjectFiles(root, { includePreviews: false });
  const mod = createVmModule(generatorSources(files));
  const decode = (p) => (files.has(p) ? new TextDecoder().decode(files.get(p)) : null);
  const traitSchemaRaw = decode("traits/schema.json");
  const marketRaw = decode("market/mappings.json");
  const manifest = {
    project: config.project ?? {},
    supply: config.supply ?? {},
    art: { ...(config.art ?? {}), scriptBytes: files.get("generator/generate.js")?.length ?? 0 },
  };
  const marketDocument = marketRaw ? JSON.parse(marketRaw) : null;
  const svg = mod.render(buildRenderContext({ manifest, marketDocument, seed }));
  // Determinism, asserted where it is cheap: the same context twice must produce the same bytes.
  const again = mod.render(buildRenderContext({ manifest, marketDocument, seed }));
  if (svg !== again) throw new Error(`template ${template} rendered differently twice for seed ${seed}`);
  const traits = traitSchemaRaw ? deriveTraits(JSON.parse(traitSchemaRaw), seed) : [];
  return { template, seed, svg, traits, bytes: svg.length };
}

/** Strip the outer `<svg …>` wrapper so the render can be nested with our own geometry. */
function innerOf(svg) {
  const open = svg.indexOf(">");
  const close = svg.lastIndexOf("</svg>");
  return svg.slice(open + 1, close);
}

function viewBoxOf(svg) {
  const m = svg.match(/viewBox="([^"]+)"/);
  return m ? m[1] : "0 0 1000 1000";
}

/**
 * The hero: four real renders, side by side, each captioned with its template, its seed and the
 * traits the kit derived for that seed.
 *
 * THE CAPTION IS TWO UNRELATED FACTS SIDE BY SIDE, and the description has to say so. A tile's
 * image comes off `context.random`; its labels come off `<seed>:trait:<dimension>`. Printing them
 * together is useful and would be a lie by juxtaposition without the disclosure in `<desc>`.
 *
 * Same panel discipline as the fee chart — its own ground, its own accessible name and
 * description, no external reference, no embedded font — for the same reason: GitHub serves this
 * through an `<img>`, so it cannot borrow the README's colours.
 */
function renderHeroSvg(tiles) {
  const W = 1200;
  const TILE = 252;
  const GAP = 24;
  const LEFT = 60;
  const TOP = 108;
  const captionLines = 2 + Math.max(...tiles.map((t) => t.traits.length));
  const H = TOP + TILE + 26 + captionLines * 17 + 66;

  const cells = tiles
    .map((t, i) => {
      const x = LEFT + i * (TILE + GAP);
      const cap = [];
      let cy = TOP + TILE + 28;
      cap.push(`<text x="${x}" y="${cy}" class="tileName">${esc(t.template)}</text>`);
      cy += 18;
      cap.push(`<text x="${x}" y="${cy}" class="tileMeta">${esc(`seed ${t.seed} · ${t.bytes.toLocaleString("en-US")} B`)}</text>`);
      for (const tr of t.traits) {
        cy += 17;
        cap.push(`<text x="${x}" y="${cy}" class="tileTrait">${esc(`${tr.name}: ${tr.value}`)}</text>`);
      }
      return (
        `<rect x="${x - 1}" y="${TOP - 1}" width="${TILE + 2}" height="${TILE + 2}" class="tileEdge"/>` +
        `<svg x="${x}" y="${TOP}" width="${TILE}" height="${TILE}" viewBox="${viewBoxOf(t.svg)}" preserveAspectRatio="xMidYMid meet">${innerOf(t.svg)}</svg>` +
        cap.join("")
      );
    })
    .join("\n  ");

  const desc =
    `A contact sheet of four deterministic renders from the shipped starter templates, left to right: ` +
    tiles
      .map(
        (t) =>
          `${t.template}, seed ${t.seed}${t.traits.length ? ` (${t.traits.map((x) => `${x.name}: ${x.value}`).join(", ")})` : ""}`,
      )
      .join("; ") +
    `. Every image came out of the creator kit's own preview command — this file is generated by running the kit's ` +
    `generator sandbox on the templates in this repository, so each tile is byte-identical to the preview the ` +
    `kit writes for the same template and seed. The trait labels in each caption are metadata: they are drawn from ` +
    `their own seeded stream, independently of the image above them, so a label names the token rather than ` +
    `describing what it looks like.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="hero-title hero-desc" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">
  <title id="hero-title">Four deterministic renders from the shipped RELICS starter templates</title>
  <desc id="hero-desc">${esc(desc)}</desc>
  <style>
    .bg{fill:#0b0e13}
    .panel{fill:none;stroke:#2a3340;stroke-width:1}
    .rule{stroke:#2a3340;stroke-width:1}
    .h1{fill:#e8eaed;font-size:20px;letter-spacing:.3em}
    .h2{fill:#8b98a8;font-size:11.5px;letter-spacing:.18em}
    .tileEdge{fill:none;stroke:#39434f;stroke-width:1}
    .tileName{fill:#e0a04a;font-size:13px;letter-spacing:.08em}
    .tileMeta{fill:#8b98a8;font-size:11px}
    .tileTrait{fill:#6f7d8d;font-size:11px}
    .foot{fill:#8b98a8;font-size:11.5px}
    .footDim{fill:#5f6e7e;font-size:11.5px}
  </style>
  <rect class="bg" x="0" y="0" width="${W}" height="${H}"/>
  <rect class="panel" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}"/>
  <text x="${LEFT}" y="52" class="h1">RELICS CREATOR KIT</text>
  <text x="${LEFT}" y="76" class="h2">FOUR DETERMINISTIC RENDERS FROM THE SHIPPED STARTER TEMPLATES</text>
  <line class="rule" x1="${LEFT}" y1="${TOP - 20}" x2="${W - LEFT}" y2="${TOP - 20}"/>
  ${cells}
  <line class="rule" x1="${LEFT}" y1="${H - 46}" x2="${W - LEFT}" y2="${H - 46}"/>
  <text x="${LEFT}" y="${H - 24}" class="foot">Every image above came out of \`relics preview\`.</text>
  <text x="${W - LEFT}" y="${H - 24}" class="footDim" text-anchor="end">same seed, same bytes, every time</text>
</svg>
`;
}

// ---------------------------------------------------------------------------------------------
// APPLY
// ---------------------------------------------------------------------------------------------

const START = (id) => `<!-- generated:${id} -->`;
const END = (id) => `<!-- /generated:${id} -->`;
const WARNING = "<!-- Generated by scripts/generate-doc-assets.mjs. Do not edit inside this block. -->";

function* walkMarkdown(dir) {
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walkMarkdown(full);
    else if (st.isFile() && extname(full) === ".md") yield full;
  }
}

const results = { assets: [], files: [], unknownBlocks: [], unusedBlocks: [], provenance: P.provenance };
const usedBlocks = new Set();

function applyBlocks(text, relPath) {
  let out = text;
  const found = [...text.matchAll(/<!-- generated:([a-z0-9-]+) -->/g)].map((m) => m[1]);
  for (const id of found) {
    if (!BLOCKS[id]) {
      results.unknownBlocks.push({ file: relPath, id });
      continue;
    }
    usedBlocks.add(id);
    const startTag = START(id);
    const endTag = END(id);
    const startIdx = out.indexOf(startTag);
    const endIdx = out.indexOf(endTag, startIdx);
    if (startIdx === -1 || endIdx === -1) {
      results.unknownBlocks.push({ file: relPath, id, reason: "unterminated block" });
      continue;
    }
    const body = `${startTag}\n${WARNING}\n\n${BLOCKS[id]()}\n\n${endTag}`;
    out = out.slice(0, startIdx) + body + out.slice(endIdx + endTag.length);
  }
  return out;
}

// --- assets ---
mkdirSync(ASSETS_DIR, { recursive: true });
const HERO_RENDERS = HERO_TILES.map(renderTile);
const assetTargets = [
  { path: join(ASSETS_DIR, "launch-protection.svg"), content: renderProtectionSvg() },
  { path: join(ASSETS_DIR, "hero.svg"), content: renderHeroSvg(HERO_RENDERS) },
];

// `market-as-medium.svg` is the one CONCEPTUAL asset, and it is hand-authored on purpose: it draws
// a relationship, not data, and there is nothing to derive it from. It is still gated — a page that
// points at a missing file renders a broken image, and a diagram that reaches for an external host
// breaks the "repository-local, no externally hosted image" rule the day that host goes away.
const CONCEPTUAL = join(ASSETS_DIR, "market-as-medium.svg");
if (!existsSync(CONCEPTUAL)) {
  results.assets.push({ file: relative(ROOT, CONCEPTUAL), stale: true, reason: "missing" });
} else {
  const art = readFileSync(CONCEPTUAL, "utf8");
  if (/(?:href|src)\s*=\s*["']https?:/i.test(art) || /@import|url\(\s*['"]?https?:/i.test(art)) {
    results.assets.push({ file: relative(ROOT, CONCEPTUAL), stale: true, reason: "references an external host" });
  }
  if (!/<title[ >]/.test(art)) {
    results.assets.push({ file: relative(ROOT, CONCEPTUAL), stale: true, reason: "no <title> for its accessible name" });
  }
}

for (const a of assetTargets) {
  const rel = relative(ROOT, a.path);
  const current = existsSync(a.path) ? readFileSync(a.path, "utf8") : null;
  const stale = current !== a.content;
  results.assets.push({ file: rel, stale });
  if (stale && !CHECK) writeFileSync(a.path, a.content);
}

// --- doc blocks ---
for (const abs of walkMarkdown(DOCS_DIR)) {
  const rel = relative(ROOT, abs);
  const current = readFileSync(abs, "utf8");
  const next = applyBlocks(current, rel);
  const stale = next !== current;
  if (stale) results.files.push({ file: rel, stale });
  if (stale && !CHECK) writeFileSync(abs, next);
}

results.unusedBlocks = Object.keys(BLOCKS).filter((id) => !usedBlocks.has(id));

const staleAssets = results.assets.filter((a) => a.stale);
const ok = staleAssets.length === 0 && results.files.length === 0 && results.unknownBlocks.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ ok, check: CHECK, ...results }, null, 2));
} else {
  console.log(`doc assets — constants from ${P.provenance}`);
  if (results.unknownBlocks.length) {
    console.log("\nUNKNOWN OR UNTERMINATED BLOCKS:");
    for (const b of results.unknownBlocks) console.log(`  ${b.file}: generated:${b.id}${b.reason ? ` (${b.reason})` : ""}`);
  }
  if (results.unusedBlocks.length) console.log(`\nDefined but unused blocks: ${results.unusedBlocks.join(", ")}`);
  if (CHECK) {
    if (ok) {
      console.log("\nPASS — every generated block and asset is current.");
    } else {
      console.log("\nSTALE:");
      for (const a of staleAssets) console.log(`  ${a.file}${a.reason ? ` (${a.reason})` : ""}`);
      for (const f of results.files) console.log(`  ${f.file}`);
      console.log("\nRun `node scripts/generate-doc-assets.mjs` and commit the result.");
    }
  } else {
    console.log(`\nwrote ${staleAssets.length} asset(s), updated ${results.files.length} file(s).`);
  }
}

process.exit(CHECK && !ok ? 1 : results.unknownBlocks.length ? 1 : 0);
