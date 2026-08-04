"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { getRegistry } from "@/lib/registry";
import { nftAbi } from "@/lib/abis";

export default function MintPage() {
  const registry = getRegistry();
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, data: txHash, error } = useWriteContract();
  const [count, setCount] = useState(1);

  const capacityQuery = useReadContract({
    abi: nftAbi,
    address: registry.nft,
    functionName: "latentCapacity",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(registry.nft && address) },
  });

  if (!registry.configured || !registry.nft) {
    return (
      <div>
        <h1>Mint / Awaken</h1>
        <div className="panel">
          <span className="badge">Not configured</span>
          <p style={{ margin: "8px 0 0" }}>
            No NFT address is set for this build. Configure{" "}
            <code>NEXT_PUBLIC_NFT_ADDRESS</code> to enable awakening.
          </p>
        </div>
      </div>
    );
  }

  const capacity = capacityQuery.data ? Number(capacityQuery.data) : 0;

  return (
    <div>
      <h1>Mint / Awaken</h1>
      <p className="muted">
        Receiving the token does not mint anything. You explicitly <code>awaken</code> up to your
        latent capacity (whole units held minus pieces already awakened), bounded to 8 per call.
      </p>

      {!isConnected ? (
        <div className="panel">Connect a wallet to see your capacity.</div>
      ) : (
        <div className="panel">
          <div>
            Your latent capacity: <code>{capacityQuery.isLoading ? "…" : capacity}</code>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
            <input
              type="number"
              min={1}
              max={8}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value))))}
              style={{
                width: 72,
                padding: "6px 8px",
                background: "#0f1723",
                color: "var(--ink)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            />
            <button
              disabled={isPending || capacity === 0}
              onClick={() =>
                writeContract({
                  abi: nftAbi,
                  address: registry.nft!,
                  functionName: "awaken",
                  args: [BigInt(count)],
                })
              }
            >
              {isPending ? "Awakening…" : `Awaken ${count}`}
            </button>
          </div>
          {txHash && (
            <p className="muted" style={{ marginTop: 10 }}>
              Submitted: <code>{txHash}</code>
            </p>
          )}
          {error && (
            <p style={{ marginTop: 10, color: "#e0605a" }}>{error.message.split("\n")[0]}</p>
          )}
        </div>
      )}
    </div>
  );
}
