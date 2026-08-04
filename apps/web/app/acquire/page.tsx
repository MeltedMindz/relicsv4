import { getRegistry } from "@/lib/registry";
import { collectionConfig } from "@config";

export default function AcquirePage() {
  const registry = getRegistry();

  return (
    <div>
      <h1>Acquire {collectionConfig.tokenSymbol}</h1>
      <p className="muted">
        The art token trades on a single Uniswap v4 pool. At genesis the whole supply sits in a
        one-sided position: it is executable ask liquidity, with no bid depth until a real buyer
        arrives. The first buy creates the first bid.
      </p>

      <div className="panel">
        <strong>Initialized price is not a market price</strong>
        <p style={{ margin: "8px 0 0" }}>
          A single-sided pool has a valid <em>initialized price</em> from its opening{" "}
          <code>sqrtPriceX96</code>, but zero quote reserves until someone trades. Do not present
          the initialized price as a market-established value. See{" "}
          <code>docs/15-launch-economics.md</code>.
        </p>
      </div>

      <h2>This deployment</h2>
      {registry.configured ? (
        <div className="panel">
          <div>
            Chain id: <code>{registry.chainId}</code>
          </div>
          <div>
            Token: <code>{registry.token}</code>
          </div>
          {registry.poolId ? (
            <div>
              Pool id: <code>{registry.poolId}</code>
            </div>
          ) : (
            <div className="muted">Pool id not configured.</div>
          )}
          <p className="muted" style={{ marginTop: 10 }}>
            To trade, use a Uniswap v4-capable interface or a direct swap against the canonical
            pool. This starter intentionally does not embed a swap widget or router address.
          </p>
        </div>
      ) : (
        <div className="panel">
          <span className="badge">Not configured</span>
          <p style={{ margin: "8px 0 0" }}>
            No token address is set for this build. This is the fail-closed default: the app
            shows nothing rather than invent a placeholder. Point it at your own deployment with{" "}
            <code>NEXT_PUBLIC_TOKEN_ADDRESS</code> and friends (see <code>.env.example</code>).
          </p>
        </div>
      )}
    </div>
  );
}
