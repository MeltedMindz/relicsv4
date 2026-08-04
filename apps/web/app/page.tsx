import Link from "next/link";
import { collectionConfig } from "@config";

const SIGNAL_LABELS: Record<string, string> = {
  swaps: "swaps",
  buySellBalance: "buy/sell balance",
  volatility: "volatility",
  drawdown: "drawdown",
  recovery: "recovery",
  liquidityEvents: "liquidity events",
  holderGrowth: "holder growth",
};

export default function HomePage() {
  const c = collectionConfig;
  const activeSignals = Object.entries(c.signals)
    .filter(([, on]) => on)
    .map(([k]) => SIGNAL_LABELS[k] ?? k);

  return (
    <div>
      <span className="badge">Fork-and-launch template · educational · not audited</span>
      <h1>{c.nftName}</h1>
      <p style={{ fontSize: 18 }}>
        A fully on-chain, fully customizable art collection linked to an ERC-20, with Uniswap v4
        hooks transforming swaps, liquidity, volatility, and market history into live artistic
        evolution. Contracts. Renderer. Hook logic. Deployment tooling.
      </p>
      <p style={{ fontSize: 20, fontWeight: 700 }}>{c.tagline}</p>

      <div className="panel">
        <strong>Fork it. Customize four layers. Launch.</strong>
        <ol className="tight">
          <li>
            Fork the repo and edit one config (<code>config/collection.config.ts</code> + your{" "}
            <code>.env</code>).
          </li>
          <li>
            Customize the <strong>ERC-20 token</strong>, the <strong>v4 hook</strong> (market → art
            mapping), the <strong>on-chain renderer</strong> (your art), and the{" "}
            <strong>deployment tooling</strong>.
          </li>
          <li>Run the tests and generate art locally.</li>
          <li>Deploy to a testnet, create the pool, add + lock liquidity.</li>
          <li>Go to mainnet after your own security + legal review.</li>
        </ol>
      </div>

      <h2>This build</h2>
      <div className="panel">
        <div>
          Token: <code>{c.tokenName}</code> (<code>{c.tokenSymbol}</code>), supply{" "}
          <code>{c.tokenSupply}</code>
        </div>
        <div>
          Collection: <code>{c.nftName}</code>, max <code>{c.maxNftSupply.toLocaleString()}</code>
        </div>
        <div>
          Art system: <code>{c.rendererStyle}</code>
        </div>
        <div>
          Market signals driving the art: <code>{activeSignals.join(", ")}</code>
        </div>
      </div>

      <h2>Start here</h2>
      <ul className="tight">
        <li>
          <Link href="/acquire">Acquire</Link> — how the token trades on a single-sided v4 pool.
        </li>
        <li>
          <Link href="/mint">Mint / Awaken</Link> — materialize a piece from your holdings.
        </li>
        <li>
          <Link href="/explore">Explore</Link> — browse deterministic local sample art.
        </li>
        <li>
          <Link href="/technical">Technical</Link> — the architecture and the hard-won lessons.
        </li>
      </ul>

      <div className="panel">
        <strong>Please read before you do anything real</strong>
        <ul className="tight">
          <li>Educational template. NOT audited. NO warranty.</li>
          <li>
            Works with Uniswap v4, but is NOT affiliated with or endorsed by Uniswap, OpenZeppelin,
            OpenSea, or any auditor.
          </li>
          <li>Get your own security, legal, and economic review before launching.</li>
        </ul>
      </div>
    </div>
  );
}
