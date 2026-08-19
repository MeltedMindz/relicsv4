// SPDX-License-Identifier: MIT
// `relics doctor` — can this machine actually run the kit?
//
// Scope is deliberately narrow. It answers ONE question — "is this environment capable" — and it
// answers it OFFLINE. It never contacts a chain, an RPC, a registry or a package index, so a green
// result means the local toolchain is sound and says nothing about anything remote. `relics status`
// is the command that reports the launchpad's state; conflating the two would produce a "doctor"
// whose verdict depends on someone else's uptime.
//
// It is also not a wizard. Onboarding is solved by `relics init` plus the agent path; a long
// interactive setup flow would be a second, drifting copy of the getting-started guide.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CREATOR_KIT_VERSION, PROTOCOL_RELEASE_COMPATIBILITY, RUNTIME_VERSION, SCHEMA_VERSION, LIMITS, APPROVED_ART_RUNTIMES, LAUNCHABLE_ART_RUNTIMES } from "../schema.js";
import { listTemplates } from "./init.js";
import { renderSeedsIsolated } from "../sandbox.js";
import { bold, cyan, dim, green, heading, red, yellow } from "../report.js";

const MIN_NODE_MAJOR = 20;

export function doctor() {
  const rows = [];
  let blocking = 0;

  const ok = (name, detail) => rows.push({ status: "ok", name, detail });
  const warn = (name, detail, fix) => rows.push({ status: "warn", name, detail, fix });
  const bad = (name, detail, fix) => {
    blocking += 1;
    rows.push({ status: "fail", name, detail, fix });
  };

  // ---- Node ---------------------------------------------------------------------------------
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(major) && major >= MIN_NODE_MAJOR) ok("node", `v${process.versions.node} (needs >= ${MIN_NODE_MAJOR})`);
  else bad("node", `v${process.versions.node} is below the required v${MIN_NODE_MAJOR}`, `Install Node ${MIN_NODE_MAJOR} or newer, then run this again.`);

  // ---- dependencies -------------------------------------------------------------------------
  //
  // The honest answer here is "none", and saying it is the point: a creator who has been told a
  // tool has no dependencies should be able to confirm it rather than take it on trust.
  const cliPkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"));
  const deps = Object.keys(cliPkg.dependencies ?? {}).filter((d) => d !== "@relics/project-schema");
  if (deps.length === 0) ok("dependencies", "none — plain ESM, no build step, nothing to install for the kit itself");
  else warn("dependencies", `${deps.length} runtime dependenc(ies): ${deps.join(", ")}`, "The kit is meant to be dependency-free; a new one is worth questioning.");

  // ---- the schema package -------------------------------------------------------------------
  ok("schema", `${SCHEMA_VERSION} bundle format · kit ${CREATOR_KIT_VERSION} · ${RUNTIME_VERSION}`);
  ok("protocol", `built against ${PROTOCOL_RELEASE_COMPATIBILITY} — run \`relics status\` for what is deployed`);

  // ---- templates ----------------------------------------------------------------------------
  let templates = [];
  try {
    templates = listTemplates();
  } catch (err) {
    bad("templates", `the template directory could not be read: ${err instanceof Error ? err.message : String(err)}`, "Re-clone or re-install the kit; `packages/creator-cli/templates/` is missing or unreadable.");
  }
  if (templates.length > 0) {
    const launchable = templates.filter((t) => t.launchable).length;
    const bad_ = templates.filter((t) => !APPROVED_ART_RUNTIMES.includes(t.runtime));
    if (bad_.length > 0) bad("templates", `${bad_.length} template(s) target an unapproved runtime: ${bad_.map((t) => t.id).join(", ")}`, "That template can never be launched. Re-install the kit, or report it.");
    else if (launchable === 0) {
      // NOT A FAILURE, and not silence either. Every template being preview-only is a real state
      // of the world — the launchpad binds one runtime today — and a creator should meet it here
      // rather than at export time.
      warn("templates", `${templates.length} available; NONE on a currently launchable runtime (${LAUNCHABLE_ART_RUNTIMES.join(", ")} is bound)`, "You can author, preview, validate and export today. Launching waits on the runtime being bound; nothing about your bundle has to change.");
    } else ok("templates", `${templates.length} available, ${launchable} on a launchable runtime`);
  }

  // ---- the local sandbox --------------------------------------------------------------------
  //
  // The capability that actually decides whether this machine can validate anything: the isolated
  // worker that renders a generator. It is checked by RUNNING one, because "the module imported"
  // is not evidence that a render completes inside the budget.
  try {
    const probe = renderSeedsIsolated({
      sources: new Map([["generator/generate.js", 'export function render({ size }) {\n  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#101010"/><circle cx="${size / 2}" cy="${size / 2}" r="${size / 4}" fill="#e8e8e8"/></svg>`;\n}\n']]),
      seeds: ["1", "2"],
      manifest: null,
      marketDocument: null,
    });
    if (probe.ok) ok("sandbox", "an isolated worker rendered a probe generator");
    else bad("sandbox", `the isolated worker could not run: ${probe.error}`, "Validation and export both need it. Check that this Node build supports worker threads and that no policy blocks them.");
  } catch (err) {
    bad("sandbox", `the isolated worker could not start: ${err instanceof Error ? err.message : String(err)}`, "Validation and export both need it.");
  }

  // ---- budgets, so the numbers are on screen before they bite -------------------------------
  ok("budgets", `generator ${LIMITS.maxScriptBytes.toLocaleString()} B · bundle ${LIMITS.maxBundleBytes.toLocaleString()} B · ${LIMITS.maxEntries} entries`);

  // ---- what was NOT checked ------------------------------------------------------------------
  // Named, because a doctor that reports only what it looked at reads as a full verdict.
  heading("doctor");
  const width = Math.max(...rows.map((r) => r.name.length));
  for (const row of rows) {
    const tag = row.status === "ok" ? green("ok  ") : row.status === "warn" ? yellow("warn") : red("FAIL");
    console.log(`  ${tag}  ${bold(row.name.padEnd(width))}  ${row.detail}`);
    if (row.fix) console.log(`        ${" ".repeat(width)}  ${dim(row.fix)}`);
  }

  console.log("");
  if (blocking === 0) console.log(green("  READY — this machine can author, preview, validate and export."));
  else console.log(red(`  NOT READY — ${blocking} blocking problem(s) above.`));
  console.log("");
  console.log(dim("  Not checked: anything off this machine. No network, no RPC, no chain, no package index."));
  console.log(dim(`  For the launchpad's deployment and launch-access state, run ${bold("relics status")}.`));
  return blocking === 0 ? 0 : 1;
}
