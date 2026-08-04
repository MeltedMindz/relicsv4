"use client";

import { useState } from "react";
import { exportOnchainSvgAsPng, type ExportSize } from "@/lib/export-onchain-svg";

type Status = "idle" | "rendering" | "success" | "error";

const SIZES: ExportSize[] = [1024, 2048, 4096];

/**
 * Drop-in "Export PNG" control. Provide either the decoded on-chain `svg` string or the raw
 * `tokenURI` (it will decode + validate). Handles idle/rendering/success/error states, announces
 * progress via aria-live, and guards against duplicate clicks while a render is in flight.
 */
export function ExportPngButton(props: {
  tokenId: number | string;
  svg?: string;
  tokenURI?: string;
  fileName?: string;
  defaultSize?: ExportSize;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [size, setSize] = useState<ExportSize>(props.defaultSize ?? 2048);
  const [message, setMessage] = useState("");

  async function handleExport() {
    if (status === "rendering") return; // duplicate-click guard
    setStatus("rendering");
    setMessage(`Rendering ${size}×${size} PNG…`);
    try {
      const result = await exportOnchainSvgAsPng({
        tokenId: props.tokenId,
        svg: props.svg,
        tokenURI: props.tokenURI,
        size,
        fileName: props.fileName,
      });
      setStatus("success");
      setMessage(
        result.method === "share" ? "Shared PNG." : result.method === "download" ? "Downloaded PNG." : "Opened PNG in a new tab.",
      );
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Export failed.");
    }
  }

  return (
    <div className="export-png" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <label className="muted" style={{ fontSize: 13 }}>
        Size{" "}
        <select
          value={size}
          onChange={(e) => setSize(Number(e.target.value) as ExportSize)}
          disabled={status === "rendering"}
          style={{
            background: "#0f1723",
            color: "var(--ink)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "4px 6px",
          }}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </label>
      <button onClick={handleExport} disabled={status === "rendering"} aria-busy={status === "rendering"}>
        {status === "rendering" ? "Exporting…" : "Export PNG"}
      </button>
      <span
        role="status"
        aria-live="polite"
        className="muted"
        style={{ fontSize: 13, color: status === "error" ? "#e0605a" : undefined }}
      >
        {message}
      </span>
    </div>
  );
}
