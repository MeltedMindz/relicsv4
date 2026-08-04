"use client";

import { useMemo, useState } from "react";
import { samplePreviews, svgToDataUri, type PreviewMarket } from "@/lib/fixtures";
import { ExportPngButton } from "@/components/export-png-button";
import { collectionConfig } from "@config";

export default function ExplorePage() {
  const [drawdown, setDrawdown] = useState(0);
  const [activity, setActivity] = useState(6);
  const style = collectionConfig.rendererStyle;

  const market: PreviewMarket = useMemo(
    () => ({
      drawdownBand: drawdown,
      recoveryBand: Math.max(0, 10000 - drawdown),
      swaps: activity,
      epoch: Math.floor(activity / 2),
      holders: activity * 3,
      buyDominant: drawdown < 5000,
    }),
    [drawdown, activity],
  );

  const previews = useMemo(() => samplePreviews(style, 12, market), [style, market]);

  return (
    <div>
      <h1>Explore {collectionConfig.nftName}</h1>
      <p className="muted">
        Deterministic LOCAL previews of the <code>{style}</code> art system — no chain, no RPC, no
        secrets. They mirror the on-chain renderer&rsquo;s concept so you can see how market state
        reshapes the same DNA. The canonical artwork always comes from the contract&rsquo;s on-chain{" "}
        <code>tokenURI</code>; this is a neutral placeholder identity.
      </p>

      <div className="panel">
        <label>
          Drawdown band: <code>{drawdown}</code>
          <input type="range" min={0} max={10000} step={500} value={drawdown}
            onChange={(e) => setDrawdown(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
        </label>
        <label style={{ display: "block", marginTop: 12 }}>
          Market activity: <code>{activity}</code>
          <input type="range" min={0} max={40} step={1} value={activity}
            onChange={(e) => setActivity(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
        </label>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Drag to simulate a drawing-down or recovering market and more trading activity — the art
          responds live.
        </p>
      </div>

      <div className="grid">
        {previews.map((s) => (
          <div className="card" key={s.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={svgToDataUri(s.svg)} alt={s.label} />
            <div className="meta">
              <div style={{ marginBottom: 8 }}>{s.label}</div>
              <ExportPngButton tokenId={s.id} svg={s.svg} fileName={`${style}-${s.id}.png`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
