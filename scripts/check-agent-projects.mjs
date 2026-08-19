#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// THREE NATURAL-LANGUAGE BRIEFS, BUILT WITH THE PUBLIC CREATOR WORKFLOW ONLY.
//
// The briefs are in scripts/agent-projects/BRIEFS.md. Each one is scaffolded with `relics init`,
// then the authored generator, mappings, traits and metadata are copied over it — which is exactly
// what an agent following docs/creator-kit/create-with-an-agent.md does, and exactly what a person
// does by hand. Nothing here reaches into the schema, nothing copies a fixture, and no case in the
// validator knows these projects exist.
//
// WHY THE ASSERTIONS ARE ABOUT MECHANICS, NOT ABOUT SUCCESS.
//
// "It exported" is a weak claim: a generator that ignores its own market mappings exports perfectly
// well. So each project asserts the thing its brief actually promised — the exact mapping count, the
// exact sensor/destination pairs, and that the art responds to them — and the static one asserts the
// opposite, that it declares no mappings at all and still completes every step.
//
// Emits NATURAL_LANGUAGE_AGENT_PROJECTS_EXPORTED.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readContainer, stripComments, validateBundleBytes } from "../packages/project-schema/index.js";
import { ROOT, runLifecycle } from "./lib/lifecycle.mjs";

const PROJECTS_DIR = join(ROOT, "scripts", "agent-projects");

/**
 * Each entry restates its brief and the mechanics that brief promised. The `expect` block is the
 * contract: a project that stops honouring its own brief fails here rather than passing because the
 * pipeline still ran.
 */
const PROJECTS = [
  {
    name: "monochrome-pixel-field",
    template: "minimal",
    projectName: "Monochrome Pixel Field",
    symbol: "MPXF",
    brief: "A 512-piece monochrome pixel collection where drawdowns introduce damage and volatility increases visual noise.",
    expect: {
      artworkSupply: "512",
      mappings: [
        { sensor: "drawdown", destination: "fracture" },
        { sensor: "volatility", destination: "distortion" },
      ],
      marketResponsive: true,
    },
  },
  {
    name: "geometric-abstract",
    template: "minimal",
    projectName: "Geometric Abstract",
    symbol: "GEOAB",
    brief: "A geometric abstract collection where liquidity changes density and holder growth changes symmetry.",
    expect: {
      artworkSupply: "1000",
      mappings: [
        { sensor: "liquidity", destination: "density" },
        { sensor: "holder_growth", destination: "symmetry" },
      ],
      marketResponsive: true,
    },
  },
  {
    name: "static-generative",
    template: "minimal",
    projectName: "Static Generative",
    symbol: "STATG",
    brief: "A static generative collection with no market mappings.",
    expect: {
      artworkSupply: "500",
      mappings: [],
      marketResponsive: false,
    },
  },
];

const failures = [];
const lines = [];

for (const project of PROJECTS) {
  const overlayDir = join(PROJECTS_DIR, project.name);
  if (!existsSync(overlayDir)) {
    failures.push(project.name);
    lines.push(`FAIL  ${project.name.padEnd(24)} no authored files at ${overlayDir}`);
    continue;
  }
  const configPatch = JSON.parse(readFileSync(join(overlayDir, "config.patch.json"), "utf8"));

  const run = runLifecycle({
    name: project.name,
    template: project.template,
    projectName: project.projectName,
    symbol: project.symbol,
    overlayDir,
    configPatch,
    seeds: 48,
    previews: 4,
    keep: true,
  });

  if (!run.ok) {
    failures.push(project.name);
    const failed = run.steps.find((s) => !s.ok) ?? run.steps.at(-1);
    lines.push(`FAIL  ${project.name.padEnd(24)} ${failed?.step ?? "?"}: ${failed?.detail || `exit ${failed?.code}`}`);
    continue;
  }

  const r = run.result;
  const problems = [];

  // ---- the brief's own mechanics, read back out of the EXPORTED BYTES ------------------------
  const bytes = new Uint8Array(readFileSync(r.bundlePath));
  const report = validateBundleBytes(bytes, { skipExecution: true });
  const container = readContainer(bytes);
  const mappings = report.marketMappings?.mappings ?? [];

  if (String(r.artworkSupply) !== project.expect.artworkSupply) {
    problems.push(`artwork supply is ${r.artworkSupply}, the brief said ${project.expect.artworkSupply}`);
  }
  if (mappings.length !== project.expect.mappings.length) {
    problems.push(`${mappings.length} market mapping(s); the brief describes ${project.expect.mappings.length}`);
  }
  for (const wanted of project.expect.mappings) {
    if (!mappings.some((m) => m.sensor === wanted.sensor && m.destination === wanted.destination)) {
      problems.push(`the brief's "${wanted.sensor} -> ${wanted.destination}" mapping is missing`);
    }
  }

  // DOES THE ART ACTUALLY READ ITS MARKET? A generator can carry perfect mappings and ignore them.
  //
  // COMMENTS ARE STRIPPED FIRST, using the schema's own `stripComments` — the same function its
  // static analysis uses, so this agrees with the validator about what counts as code. Without it
  // the static project failed this check by saying "the market is not consulted" in a comment,
  // which is a detector reading prose and calling it behaviour.
  const source = stripComments(new TextDecoder().decode(container.byPath.get("generator/generate.js")));
  const readsMarket = /context\s*\.\s*market\b/.test(source) || /\bmarket\b\s*[,}][^]*?=\s*context\b/.test(source) || /\bmarket\s*\./.test(source);
  if (project.expect.marketResponsive && !readsMarket) {
    problems.push("the generator declares market mappings but never reads context.market");
  }
  if (!project.expect.marketResponsive && readsMarket) {
    problems.push("a project that declares no mappings still reads context.market");
  }

  if (r.seeds.failed !== 0 || r.seeds.blank !== 0 || r.seeds.nonDeterministic !== 0) {
    problems.push(`test-seeds: ${r.seeds.failed} failed / ${r.seeds.blank} blank / ${r.seeds.nonDeterministic} non-deterministic`);
  }

  if (problems.length > 0) {
    failures.push(project.name);
    lines.push(`FAIL  ${project.name.padEnd(24)} ${problems.join("; ")}`);
    continue;
  }

  const responds = project.expect.marketResponsive ? project.expect.mappings.map((m) => `${m.sensor}->${m.destination}`).join(" ") : "no market mappings (by design)";
  lines.push(
    `PASS  ${project.name.padEnd(24)} ${String(r.artworkSupply).padStart(5)} pieces · ${r.seeds.distinct}/${r.seeds.rendered?.[1]} distinct · ${String(r.bundleBytes).padStart(7)} B · ${String(r.bundleHash).slice(0, 12)}…`,
  );
  lines.push(`      ${" ".repeat(24)} ${responds}`);
}

console.log("");
console.log("  three natural-language briefs, built with `relics init` plus ordinary file edits");
console.log("");
for (const line of lines) console.log(`  ${line}`);
console.log("");
console.log(`  ${PROJECTS.length - failures.length}/${PROJECTS.length} briefs exported a valid .relics bundle`);
console.log("");
console.log(`NATURAL_LANGUAGE_AGENT_PROJECTS_EXPORTED=${PROJECTS.length - failures.length}/${PROJECTS.length}${failures.length > 0 ? ` (failed: ${failures.join(", ")})` : ""}`);
process.exitCode = failures.length === 0 ? 0 : 1;
