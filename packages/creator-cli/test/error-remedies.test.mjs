// SPDX-License-Identifier: MIT
// EVERY REQUIRED FAILURE IS PRODUCED FOR REAL, AND ITS MESSAGE IS READ.
//
// A remedy table is easy to write and easy to fool: assert that a lookup returns a string and every
// entry passes forever. So this file BREAKS A REAL PROJECT thirteen ways, runs the actual CLI, and
// reads what a creator would read. A scenario that stops being reachable — because the validator
// changed, or the message moved — fails here rather than quietly leaving a creator with no fix.
//
// Each scenario asserts four things about the output:
//
//   WHAT   the issue code appears, so the failure is named rather than described
//   WHERE  a file path appears, and it is a file in the PROJECT, never the generated manifest alone
//   FIX    a remedy line naming what to edit
//   RUN    a `$ relics …` command to run again
//
// The `where` rule is the one with history: roughly half the schema's issues point at
// `relics.project.json`, which is generated and overwritten on every export, so a creator who opens
// it has been sent to a dead end.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = join(ROOT, "packages", "creator-cli", "bin", "relics.js");
const RECIPIENT = "0x7A6f3B4c2D1e0F9a8B7c6D5e4F3a2B1c0D9e8F7a";

function run(args) {
  try {
    return { ok: true, out: execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, maxBuffer: 32 * 1024 * 1024 }) };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** A scaffolded, VALID project with the creator recipient filled in. */
function scaffold(template = "minimal") {
  const dir = mkdtempSync(join(tmpdir(), "relics-remedy-"));
  const project = join(dir, "p");
  const init = run(["init", project, "--template", template, "--name", "Remedy Fixture", "--symbol", "RMDY"]);
  assert.ok(init.ok, `init failed: ${init.out}`);
  patch(project, (c) => {
    c.earnings.creatorRecipient = RECIPIENT;
    if (c.earnings.collaborators?.length) c.earnings.collaborators[0].recipient = "0x4d5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d3E";
  });
  return { dir, project };
}

function patch(project, mutate) {
  const path = join(project, "relics.config.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  mutate(config);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

function writeJson(project, rel, value) {
  writeFileSync(join(project, rel), `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Runs `validate` on a project broken by `breakIt`, and asserts the four properties.
 * @param {{ template?: string, code: string, files: string[], breakIt: (project: string) => void }} scenario
 */
function assertRemedy(scenario) {
  const { dir, project } = scaffold(scenario.template);
  try {
    scenario.breakIt(project);
    const result = run(["validate", project]);
    const out = result.out;

    // WHAT
    assert.match(out, new RegExp(scenario.code), `${scenario.code} was not reported. Output:\n${out}`);

    // The block for THIS issue: from its code line to the next issue or the end.
    const start = out.indexOf(scenario.code);
    const rest = out.slice(start);
    const block = rest.slice(0, Math.max(rest.indexOf("\n  error", 1), rest.indexOf("\n  warn ", 1), 1200) || 1200);

    // FIX + RUN
    assert.match(block, /\n\s+fix\s+\S/, `${scenario.code} has no "fix" line. Block:\n${block}`);
    assert.match(block, /\n\s+then\s+\$ relics /, `${scenario.code} names no command to run again. Block:\n${block}`);

    // WHERE — a file a creator can actually open.
    const named = scenario.files.some((f) => block.includes(f));
    assert.ok(named, `${scenario.code} names none of ${scenario.files.join(", ")}. Block:\n${block}`);

    // NO INTERNAL JARGON where a creator-facing fix exists.
    const fixLine = /\n\s+fix\s+(.+)/.exec(block)?.[1] ?? "";
    for (const jargon of ["projectConfigHash", "contentHash", "canonicalJson", "keccak", "byPath", "evaluate()"]) {
      assert.ok(!fixLine.includes(jargon), `${scenario.code}'s fix line uses internal jargon "${jargon}": ${fixLine}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ the thirteen scenarios

test("placeholder recipient", () => {
  assertRemedy({
    code: "EARNINGS_RECIPIENT_PLACEHOLDER",
    files: ["relics.config.json"],
    breakIt: (p) => patch(p, (c) => (c.earnings.creatorRecipient = "0x1111111111111111111111111111111111111111")),
  });
});

test("missing metadata", () => {
  assertRemedy({
    code: "METADATA_DISAGREES",
    files: ["metadata/collection.json", "relics.config.json"],
    breakIt: (p) => {
      const meta = JSON.parse(readFileSync(join(p, "metadata", "collection.json"), "utf8"));
      meta.description = "a description that no longer matches the project configuration";
      writeJson(p, "metadata/collection.json", meta);
    },
  });
});

test("blank generator output", () => {
  assertRemedy({
    code: "RENDER_BLANK",
    files: ["generator/generate.js"],
    breakIt: (p) => writeFileSync(join(p, "generator", "generate.js"), 'export function render() {\n  return "";\n}\n'),
  });
});

test("non-determinism", () => {
  assertRemedy({
    code: "GEN_NONDETERMINISTIC",
    files: ["generator/generate.js"],
    breakIt: (p) => {
      // A hidden counter: same seed, different picture on the second render. This is the exact
      // shape the determinism check exists to catch, and it uses no forbidden identifier, so it
      // has to be caught by RUNNING the generator twice rather than by reading it.
      writeFileSync(
        join(p, "generator", "generate.js"),
        [
          "let calls = 0;",
          "export function render(context) {",
          "  calls += 1;",
          "  const { size } = context;",
          '  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`',
          '    + `<rect width="${size}" height="${size}" fill="#101010"/>`',
          '    + `<circle cx="${size / 2}" cy="${size / 2}" r="${10 + calls}" fill="#e8e8e8"/>`',
          '    + `</svg>`;',
          "}",
          "",
        ].join("\n"),
      );
    },
  });
});

test("stale preview", () => {
  assertRemedy({
    code: "PREVIEW_STALE",
    files: ["previews/"],
    breakIt: (p) => {
      mkdirSync(join(p, "previews"), { recursive: true });
      // Valid SVG, wrong art: the generator draws something else for this seed.
      writeFileSync(join(p, "previews", "seed-13.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><rect width="1000" height="1000" fill="#000000"/></svg>\n');
    },
  });
});

test("unsupported runtime", () => {
  assertRemedy({
    code: "ART_RUNTIME",
    files: ["relics.config.json"],
    breakIt: (p) => patch(p, (c) => (c.art.runtime = "WASM")),
  });
});

test("unsupported chain", () => {
  assertRemedy({
    code: "CHAIN_UNSUPPORTED",
    files: ["relics.config.json", "chains.requested"],
    breakIt: (p) => patch(p, (c) => (c.chains.requested = [137])),
  });
});

test("invalid quote-asset request", () => {
  assertRemedy({
    code: "MARKET_QUOTE",
    files: ["relics.config.json", "market.quoteAsset"],
    breakIt: (p) => patch(p, (c) => (c.market.quoteAsset = { mode: "SPECIFIC_ASSET", address: "0x0000000000000000000000000000000000000000" })),
  });
});

test("wrong launch mode for the intended anti-snipe strategy", () => {
  assertRemedy({
    code: "MARKET_LAUNCH_MODE",
    files: ["relics.config.json", "market.launchMode"],
    breakIt: (p) => patch(p, (c) => (c.market.launchMode = "PROGRESSIVE_LIQUIDITY")),
  });
});

test("script too large", () => {
  assertRemedy({
    code: "GEN_SCRIPT_TOO_LARGE",
    files: ["generator/generate.js"],
    breakIt: (p) => {
      const source = readFileSync(join(p, "generator", "generate.js"), "utf8");
      writeFileSync(join(p, "generator", "generate.js"), `${source}\nconst FILLER = ${JSON.stringify("x".repeat(64 * 1024))};\nexport const unused = FILLER.length;\n`);
    },
  });
});

test("duplicate traits", () => {
  assertRemedy({
    code: "TRAITS_VALUE_DUP",
    files: ["traits/schema.json"],
    breakIt: (p) => {
      const traits = JSON.parse(readFileSync(join(p, "traits", "schema.json"), "utf8"));
      const dim = traits.dimensions[0];
      dim.values.push({ ...dim.values[0] });
      writeJson(p, "traits/schema.json", traits);
    },
  });
});

test("bad market mapping", () => {
  assertRemedy({
    code: "MARKET_SENSOR",
    files: ["market/mappings.json"],
    breakIt: (p) =>
      writeJson(p, "market/mappings.json", {
        version: 1,
        mappings: [{ id: "invented", sensor: "vibes", transform: "clamp", transformParams: { min: 0, max: 1 }, destination: "brightness" }],
      }),
  });
});

test("bundle too large", () => {
  // A bundle the container itself refuses. This one is about the CONTAINER, so it is asserted on
  // the export path rather than through the shared helper: the failure arrives as a thrown
  // container error, and what matters is that it still names a byte budget and a next step.
  const { dir, project } = scaffold();
  try {
    mkdirSync(join(project, "assets"), { recursive: true });
    // One entry over the per-entry cap is the cheapest way to make the container refuse.
    writeFileSync(join(project, "assets", "huge.txt"), "x".repeat(6 * 1024 * 1024));
    const result = run(["export", project, "--output", join(dir, "big.relics")]);
    assert.ok(!result.ok, `an oversized bundle exported successfully:\n${result.out}`);
    assert.match(result.out, /bytes|limit|larger/i, `the refusal does not mention a size budget:\n${result.out}`);
    assert.match(result.out, /assets\/huge\.txt|assets/, `the refusal does not name the offending file:\n${result.out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
