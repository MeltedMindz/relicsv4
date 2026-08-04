"use client";

import { useMemo, useState } from "react";
import { sampleSigils, svgToDataUri } from "@/lib/fixtures";
import { ExportPngButton } from "@/components/export-png-button";

export default function ExplorePage() {
  const [drawdown, setDrawdown] = useState(0);
  const sigils = useMemo(() => sampleSigils(12, drawdown), [drawdown]);

  return (
    <div>
      <h1>Explore</h1>
      <p className="muted">
        Deterministic LOCAL previews — no chain, no RPC, no secrets. These mirror the on-chain
        renderer&rsquo;s concept so you can see how market state reshapes the same DNA. The
        canonical artwork always comes from the contract&rsquo;s on-chain <code>tokenURI</code>;
        this is a neutral placeholder identity.
      </p>

      <div className="panel">
        <label>
          Drawdown band: <code>{drawdown}</code>
          <input
            type="range"
            min={0}
            max={10000}
            step={500}
            value={drawdown}
            onChange={(e) => setDrawdown(Number(e.target.value))}
            style={{ width: "100%", marginTop: 8 }}
          />
        </label>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Drag to simulate a drawing-down market; the accent fades — the market leaves a visible
          mark on the art.
        </p>
      </div>

      <div className="grid">
        {sigils.map((s) => (
          <div className="card" key={s.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={svgToDataUri(s.svg)} alt={`Sigil #${s.id}`} />
            <div className="meta">
              <div style={{ marginBottom: 8 }}>
                #{s.id} · {s.archetype}
              </div>
              <ExportPngButton tokenId={s.id} svg={s.svg} fileName={`sigil-${s.id}.png`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
