"use client";

import { useConnect, useAccount, useDisconnect } from "wagmi";

/**
 * Wallet connect using EIP-6963 discovered connectors (no WalletConnect projectId needed).
 * wagmi exposes every discovered injected provider in `connectors`; we render one button each.
 */
export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="wallet">
        <span className="addr" title={address}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  // De-duplicate connectors by name (EIP-6963 can surface multiple entries).
  const seen = new Set<string>();
  const unique = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div className="wallet">
      {unique.length === 0 ? (
        <span className="muted">No injected wallet detected</span>
      ) : (
        unique.map((connector) => (
          <button
            key={connector.uid}
            disabled={isPending}
            onClick={() => connect({ connector })}
          >
            Connect {connector.name}
          </button>
        ))
      )}
    </div>
  );
}
