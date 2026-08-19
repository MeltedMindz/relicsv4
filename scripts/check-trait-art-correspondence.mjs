#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// THE TRAIT-LABEL DISCLOSURE GATE — a shipped template may not imply its labels describe its art.
//
//   node scripts/check-trait-art-correspondence.mjs             # human output, non-zero on failure
//   node scripts/check-trait-art-correspondence.mjs --json      # machine output
//   node scripts/check-trait-art-correspondence.mjs --controls  # prove it can fail
//
// WHY THIS EXISTS
//
// `deriveTraits` draws each dimension from its own stream, `<seed>:trait:<dimension>`. The render
// context a generator receives carries `seed`, `random`, `market`, `sensors`, `size` and `project`
// — and no traits. So a generator that picks its palette with `random.pick(PALETTES)` is drawing
// off `makeRandom(seed)`, a different stream entirely.
//
// The shipped `market-responsive` template does exactly that, from a five-entry palette carrying
// THE SAME FIVE NAMES as its `Palette` trait dimension. Measured on the pristine template, seeds
// 1-8: the label and the rendered palette agree 0 times out of 8. They are not weakly correlated;
// they are unrelated, and the shared vocabulary makes the coincidence look like a relationship.
//
// That is a defensible design — labels are metadata, and this kit has said so in the launchpad
// glossary for a long time — but it was never said where a creator meets it, and several documents
// implied the opposite. A collection whose trait labels do not describe its images is a real
// product defect if a creator ships it without knowing.
//
// WHY THE FIX IS DISCLOSURE AND NOT PLUMBING
//
// Passing the derived traits into the render context is the tempting fix and it is a trap. The
// production importer runs a byte-for-byte mirror of `packages/project-schema`, and a generator
// that read `context.traits` here would render DIFFERENTLY there — where the field does not exist
// — and the bundle's own `representativeOutputsHash` would then refuse it at import. The kit would
// be handing creators a feature that breaks their bundle at the last step. Adding the field is a
// change both repositories have to make in the same release; it is not a change this repository
// can make alone, and pretending otherwise would be a worse defect than the one being fixed.
//
// WHAT IS ENFORCED
//
//   DISCLOSURE — every template shipping a trait schema states, in words a creator will read, that
//                labels are metadata drawn independently of the image.
//   COLLISION  — a template whose generator picks from names its own trait schema also declares
//                must say so specifically. That is the case where silence is actively misleading,
//                because the two vocabularies match and the draws do not.
//   THE HERO   — the generated contact sheet captions every tile with trait labels, so its
//                accessible description carries the disclosure too.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = join(ROOT, "packages", "creator-cli", "templates");
const HERO = join(ROOT, "docs", "assets", "hero.svg");
const JSON_OUT = process.argv.includes("--json");
const CONTROLS = process.argv.includes("--controls");

/**
 * The required sentences, as verbatim fragments.
 *
 * Fragments rather than whole sentences so the surrounding prose can fit its file, and verbatim
 * rather than keyword-matched so the disclosure cannot soften into "traits are separate" and still
 * satisfy the gate. If you want to reword these, reword them HERE and the templates fail until they
 * follow — which is the direction that keeps them saying the same thing.
 */
export const DISCLOSURE_FRAGMENT = "drawn from their own seeded stream";
export const COLLISION_FRAGMENT = "agree only by coincidence";

/** Files inside a template where a creator would actually read the disclosure. */
const DISCLOSURE_FILES = ["README.md", join("generator", "generate.js")];

function templateDirs() {
  return readdirSync(TEMPLATES, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

/**
 * The trait value names a template declares, and the ones its generator ALSO writes as literals.
 * A generator that hard-codes a name its trait schema declares is picking from the same vocabulary
 * off a different stream — the collision this gate escalates on.
 */
function analyze(name) {
  const dir = join(TEMPLATES, name);
  const schemaText = read(join(dir, "traits", "schema.json"));
  if (schemaText === null) return { name, hasTraits: false };

  let declared = [];
  try {
    const schema = JSON.parse(schemaText);
    declared = (schema.dimensions ?? []).flatMap((d) => (d.values ?? []).map((v) => v.name));
  } catch {
    return { name, hasTraits: true, unreadableSchema: true, declared: [], collisions: [], disclosed: false, collisionDisclosed: false };
  }

  const generator = read(join(dir, "generator", "generate.js")) ?? "";
  const literals = new Set([...generator.matchAll(/["'`]([^"'`\n]{1,40})["'`]/g)].map((m) => m[1]));
  const collisions = [...new Set(declared.filter((v) => literals.has(v)))];

  const prose = DISCLOSURE_FILES.map((f) => read(join(dir, f)) ?? "").join("\n");
  return {
    name,
    hasTraits: true,
    declared,
    collisions,
    disclosed: prose.includes(DISCLOSURE_FRAGMENT),
    collisionDisclosed: prose.includes(COLLISION_FRAGMENT),
  };
}

function evaluate(reports, heroText) {
  const failures = [];
  for (const r of reports) {
    if (!r.hasTraits) continue;
    if (r.unreadableSchema) {
      failures.push({ rule: "TRAIT_SCHEMA_UNREADABLE", template: r.name, message: "traits/schema.json is not valid JSON, so the correspondence could not be examined" });
      continue;
    }
    if (!r.disclosed) {
      failures.push({
        rule: "TRAIT_DISCLOSURE_MISSING",
        template: r.name,
        message:
          `ships a trait schema and never tells the creator that labels are metadata. Add the fragment ` +
          `"${DISCLOSURE_FRAGMENT}" to its README.md or generator/generate.js. A creator who believes the ` +
          `labels describe the picture will ship a collection whose attributes are wrong about its own images.`,
      });
    }
    if (r.collisions.length > 0 && !r.collisionDisclosed) {
      failures.push({
        rule: "TRAIT_NAME_COLLISION_UNDISCLOSED",
        template: r.name,
        message:
          `its generator writes ${r.collisions.length} name(s) its own trait schema also declares (${r.collisions.join(", ")}), ` +
          `off a different PRNG stream. The shared vocabulary makes the coincidence look like a relationship, so the general ` +
          `disclosure is not enough: add the fragment "${COLLISION_FRAGMENT}" naming this specific case.`,
      });
    }
  }
  if (heroText === null) {
    failures.push({ rule: "HERO_MISSING", template: "docs/assets/hero.svg", message: "the generated contact sheet does not exist" });
  } else if (!heroText.includes(DISCLOSURE_FRAGMENT)) {
    failures.push({
      rule: "HERO_DISCLOSURE_MISSING",
      template: "docs/assets/hero.svg",
      message: `captions every tile with trait labels; its <desc> must carry "${DISCLOSURE_FRAGMENT}" so a screen-reader user is not told the labels describe the image either.`,
    });
  }
  return failures;
}

if (CONTROLS) {
  const base = templateDirs().map(analyze);
  const heroText = read(HERO);
  const baseFailures = evaluate(base, heroText);
  const clone = () => JSON.parse(JSON.stringify(base));
  const newRules = (got) => got.filter((f) => !baseFailures.some((b) => b.rule === f.rule && b.template === f.template)).map((f) => f.rule);

  const mutations = [
    {
      name: "a template drops the disclosure",
      run: () => {
        const w = clone();
        w.find((r) => r.hasTraits).disclosed = false;
        return newRules(evaluate(w, heroText));
      },
      expect: "TRAIT_DISCLOSURE_MISSING",
    },
    {
      name: "a colliding template keeps only the general disclosure",
      run: () => {
        const w = clone();
        const hit = w.find((r) => r.collisions?.length > 0);
        if (!hit) return ["NO_COLLIDING_TEMPLATE"];
        hit.collisionDisclosed = false;
        return newRules(evaluate(w, heroText));
      },
      expect: "TRAIT_NAME_COLLISION_UNDISCLOSED",
    },
    {
      name: "a new template arrives with a trait schema and no disclosure",
      run: () => newRules(evaluate([...clone(), { name: "newcomer", hasTraits: true, declared: ["Ash"], collisions: [], disclosed: false, collisionDisclosed: false }], heroText)),
      expect: "TRAIT_DISCLOSURE_MISSING",
    },
    {
      name: "the hero description loses the disclosure",
      run: () => newRules(evaluate(clone(), "a description with no disclosure in it")),
      expect: "HERO_DISCLOSURE_MISSING",
    },
    {
      name: "the hero disappears",
      run: () => newRules(evaluate(clone(), null)),
      expect: "HERO_MISSING",
    },
  ];

  let caught = 0;
  for (const m of mutations) {
    const rules = m.run();
    if (rules.includes(m.expect)) caught += 1;
    else console.error(`  control NOT caught: ${m.name} (expected ${m.expect}, got ${rules.join(",") || "nothing"})`);
  }
  // A gate that examined no template must not report a pass.
  const emptyRefuses = evaluate([], null).length > 0;
  console.log(`TRAIT_DISCLOSURE_CONTROLS_CAUGHT=${caught}/${mutations.length}`);
  console.log(`TRAIT_DISCLOSURE_CONTROL_EMPTY_INPUT_FAILS=${emptyRefuses ? "yes" : "NO"}`);
  const ok = caught === mutations.length && emptyRefuses;
  console.log(`TRAIT_DISCLOSURE_CONTROLS=${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

const reports = templateDirs().map(analyze);
const withTraits = reports.filter((r) => r.hasTraits);
// INPUT FLOOR. Five templates ship; a run that found fewer than two read the wrong directory.
if (withTraits.length < 2) {
  console.error(`trait-disclosure gate: found only ${withTraits.length} template(s) with a trait schema — refusing rather than reporting a pass it did not earn.`);
  process.exit(1);
}

const failures = evaluate(reports, read(HERO));
const pass = failures.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ TRAIT_DISCLOSURE_GATE: pass ? "PASS" : "FAIL", templates: reports, failures }, null, 2));
} else {
  console.log(`trait-disclosure gate: ${withTraits.length} template(s) ship a trait schema`);
  for (const r of withTraits) {
    const note = r.collisions.length ? `  name collision with the generator: ${r.collisions.join(", ")}` : "  no name collision";
    console.log(`  ${r.name.padEnd(22)}${note}`);
  }
  for (const f of failures) console.error(`  ${f.rule}  ${f.template}\n      ${f.message}`);
  console.log(`TEMPLATES_WITH_TRAITS=${withTraits.length}`);
  console.log(`UNDISCLOSED_TRAIT_ART_SPLITS=${failures.length}`);
  console.log(`TRAIT_DISCLOSURE_GATE=${pass ? "PASS" : "FAIL"}`);
}

process.exit(pass ? 0 : 1);
