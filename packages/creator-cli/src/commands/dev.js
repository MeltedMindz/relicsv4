// SPDX-License-Identifier: MIT
// `relics dev` — a local studio. It serves one page on 127.0.0.1 that renders the project's
// generator for any seed and lets a creator drag the market destinations around to see how the
// art responds before a single token exists.
//
// The server re-reads the project on every request, so editing generate.js and refreshing is the
// whole loop. It binds to loopback only, serves nothing outside the project's own preview surface,
// and never reaches the network — the "market" values are sliders, not chain reads.

import { createServer } from "node:http";
import { safeJsonParse, fromUtf8, buildRenderContext, inspectRenderOutput, deriveTraits, evaluateMappings, neutralSensors, ART_DESTINATIONS, MARKET_SENSORS } from "../schema.js";
import { readConfig, readProjectFiles, generatorSources } from "../project.js";
import { createVmModule } from "../sandbox.js";
import { bold, cyan, dim, red, heading } from "../report.js";

/**
 * @param {string} root
 * @param {{ port?: number }} [options]
 */
export function devServer(root, options = {}) {
  const port = options.port ?? 4321;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname === "/") return send(res, 200, "text/html; charset=utf-8", page());
      if (url.pathname === "/render") return send(res, 200, "image/svg+xml; charset=utf-8", renderOne(root, url.searchParams));
      if (url.pathname === "/state") return send(res, 200, "application/json; charset=utf-8", JSON.stringify(state(root)));
      return send(res, 404, "text/plain; charset=utf-8", "not found");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return send(res, 500, "text/plain; charset=utf-8", message);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      heading("dev");
      console.log(`  ${bold("http://127.0.0.1:" + port)}`);
      console.log(`  ${dim("project")}  ${root}`);
      console.log(`  ${dim("edit generator/generate.js and refresh; ctrl-c to stop")}`);
      console.log("");
    });
    server.on("close", () => resolve(0));
    process.on("SIGINT", () => {
      console.log("");
      server.close();
      resolve(0);
    });
  });
}

function load(root) {
  const config = readConfig(root);
  const files = readProjectFiles(root, { includePreviews: false });
  const sources = generatorSources(files);
  const parse = (path) => (files.has(path) ? safeJsonParse(fromUtf8(files.get(path))) : null);
  return {
    config,
    sources,
    traitSchema: parse("traits/schema.json"),
    marketDocument: parse("market/mappings.json"),
    manifest: { project: config.project ?? {}, supply: config.supply ?? {}, art: { ...(config.art ?? {}), scriptBytes: files.get("generator/generate.js")?.length ?? 0 } },
  };
}

function state(root) {
  const { config, traitSchema, marketDocument } = load(root);
  return {
    name: config.project?.name ?? "",
    symbol: config.project?.symbol ?? "",
    seed: config.art?.seed ?? "1",
    runtime: config.art?.runtime ?? "JAVASCRIPT",
    destinations: ART_DESTINATIONS.map((d) => ({ id: d.id, label: d.label })),
    sensors: MARKET_SENSORS.map((s) => ({ id: s.id, label: s.label })),
    mappings: marketDocument?.mappings ?? [],
    traits: traitSchema ? deriveTraits(traitSchema, String(config.art?.seed ?? "1")) : [],
  };
}

function renderOne(root, params) {
  const { sources, manifest, marketDocument } = load(root);
  const seed = params.get("seed") ?? "1";
  const module = createVmModule(sources);

  const sensors = neutralSensors(seed);
  for (const sensor of MARKET_SENSORS) {
    const override = params.get(`sensor.${sensor.id}`);
    if (override !== null && Number.isFinite(Number(override))) sensors[sensor.id] = Number(override);
  }

  const context = buildRenderContext({ manifest, marketDocument, seed, sensors });
  const overriddenMarket = { ...context.market };
  for (const destination of ART_DESTINATIONS) {
    const override = params.get(`market.${destination.id}`);
    if (override !== null && Number.isFinite(Number(override))) overriddenMarket[destination.id] = Number(override);
  }

  const svg = module.render({ ...context, market: overriddenMarket, sensors, size: Number(params.get("size") ?? 1000) || 1000 });
  const problems = inspectRenderOutput(`seed=${seed}`, svg).filter((i) => i.severity === "error");
  if (problems.length > 0) throw new Error(problems.map((p) => p.message).join("; "));
  return svg;
}

function send(res, status, type, body) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
  });
  res.end(body);
}

/** The dev page. Self-contained: no CDN, no fonts, no analytics, nothing to fetch. */
function page() {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>relics dev</title>
<style>
  :root { color-scheme: dark; --bg:#0b0b0c; --fg:#e8e6e3; --dim:#8a8681; --line:#26241f; --accent:#c9a227; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; }
  header { padding:1rem 1.25rem; border-bottom:1px solid var(--line); display:flex; gap:1rem; align-items:baseline; flex-wrap:wrap; }
  h1 { margin:0; font-size:13px; letter-spacing:.2em; text-transform:uppercase; }
  .muted { color:var(--dim); }
  main { display:grid; grid-template-columns:minmax(320px,1fr) 320px; gap:1.5rem; padding:1.25rem; align-items:start; }
  @media (max-width: 860px) { main { grid-template-columns:1fr; } }
  #art { width:100%; aspect-ratio:1; background:#000; border:1px solid var(--line); }
  fieldset { border:1px solid var(--line); margin:0 0 1rem; padding:.75rem .9rem 1rem; }
  legend { color:var(--dim); text-transform:uppercase; letter-spacing:.16em; font-size:11px; padding:0 .4rem; }
  label { display:grid; grid-template-columns:1fr auto; gap:.25rem; margin-bottom:.5rem; }
  input[type=range] { grid-column:1/-1; width:100%; accent-color:var(--accent); }
  input[type=text] { background:#111; color:var(--fg); border:1px solid var(--line); padding:.35rem .5rem; font:inherit; width:100%; }
  button { background:#151513; color:var(--fg); border:1px solid var(--line); padding:.4rem .8rem; font:inherit; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  #err { color:#e06c5a; white-space:pre-wrap; }
  ul { list-style:none; margin:0; padding:0; }
  li { display:flex; justify-content:space-between; gap:1rem; border-bottom:1px dotted var(--line); padding:.2rem 0; }
</style>
<header>
  <h1 id="title">relics dev</h1>
  <span class="muted" id="subtitle"></span>
</header>
<main>
  <div>
    <img id="art" alt="deterministic preview">
    <p id="err"></p>
  </div>
  <div>
    <fieldset>
      <legend>seed</legend>
      <input type="text" id="seed" value="1">
      <div style="display:flex; gap:.5rem; margin-top:.5rem;">
        <button id="prev">&larr; prev</button>
        <button id="next">next &rarr;</button>
        <button id="reload">reload</button>
      </div>
    </fieldset>
    <fieldset><legend>market destinations</legend><div id="dests"></div></fieldset>
    <fieldset><legend>traits</legend><ul id="traits"></ul></fieldset>
  </div>
</main>
<script>
  const state = { destinations: [], overrides: {} };
  const el = (id) => document.getElementById(id);

  async function boot() {
    const res = await fetch("/state");
    const data = await res.json();
    el("title").textContent = data.name || "relics dev";
    el("subtitle").textContent = [data.symbol, data.runtime, data.mappings.length + " mapping(s)"].filter(Boolean).join(" · ");
    el("seed").value = data.seed;
    state.destinations = data.destinations;
    el("dests").innerHTML = data.destinations.map((d) =>
      '<label><span>' + d.label + '</span><span class="muted" id="v-' + d.id + '">auto</span>' +
      '<input type="range" min="0" max="1" step="0.01" value="0" data-dest="' + d.id + '" disabled></label>' +
      '<div style="margin:-.35rem 0 .6rem"><label style="grid-template-columns:auto 1fr"><input type="checkbox" data-enable="' + d.id + '"><span class="muted">override</span></label></div>'
    ).join("");
    el("traits").innerHTML = (data.traits || []).map((t) => '<li><span class="muted">' + t.name + '</span><span>' + t.value + '</span></li>').join("") || '<li class="muted">no trait dimensions</li>';

    el("dests").addEventListener("input", (e) => {
      const target = e.target;
      if (target.dataset.dest) {
        state.overrides[target.dataset.dest] = target.value;
        el("v-" + target.dataset.dest).textContent = Number(target.value).toFixed(2);
        draw();
      }
      if (target.dataset.enable) {
        const id = target.dataset.enable;
        const slider = document.querySelector('[data-dest="' + id + '"]');
        slider.disabled = !target.checked;
        if (!target.checked) { delete state.overrides[id]; el("v-" + id).textContent = "auto"; }
        else { state.overrides[id] = slider.value; el("v-" + id).textContent = Number(slider.value).toFixed(2); }
        draw();
      }
    });
    draw();
  }

  function draw() {
    const params = new URLSearchParams({ seed: el("seed").value || "1" });
    for (const [k, v] of Object.entries(state.overrides)) params.set("market." + k, v);
    const url = "/render?" + params.toString() + "&t=" + Date.now();
    el("err").textContent = "";
    fetch(url).then(async (r) => {
      const body = await r.text();
      if (!r.ok) { el("err").textContent = body; return; }
      el("art").src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(body)));
    });
  }

  el("seed").addEventListener("change", draw);
  el("prev").addEventListener("click", () => { el("seed").value = String(Math.max(1, (Number(el("seed").value) || 1) - 1)); draw(); });
  el("next").addEventListener("click", () => { el("seed").value = String((Number(el("seed").value) || 1) + 1); draw(); });
  el("reload").addEventListener("click", boot);
  boot();
</script>
`;
}
