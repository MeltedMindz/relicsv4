import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <span className="badge">Educational starter · not audited</span>
      <h1>Fully on-chain generative art, forged by a Uniswap v4 pool</h1>
      <p className="muted">
        A clean-room teaching repo. It shows how three contracts compose into a living
        collection: a fixed-supply ERC-20, an ERC-721 whose SVG is computed on chain, and a
        Uniswap v4 hook that turns real market activity into visual entropy.
      </p>

      <div className="panel">
        <strong>The idea in one line</strong>
        <p style={{ margin: "8px 0 0" }}>
          <code>global market state + immutable DNA = live phenotype</code> — there is no stored
          image, no IPFS, no API. <code>tokenURI</code> reads Ethereum state at query time.
        </p>
      </div>

      <h2>Start here</h2>
      <ul className="tight">
        <li>
          <Link href="/acquire">Acquire</Link> — how the token trades on a single-sided v4 pool.
        </li>
        <li>
          <Link href="/mint">Mint / Awaken</Link> — explicitly materialize a piece from your
          holdings.
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
          <li>This is a learning artifact. It is NOT audited and ships with NO warranty.</li>
          <li>
            It is NOT affiliated with or endorsed by Uniswap, OpenZeppelin, OpenSea, or any
            production collection.
          </li>
          <li>
            Get your own security, legal, and economic review before deploying or trading
            anything.
          </li>
        </ul>
      </div>
    </div>
  );
}
