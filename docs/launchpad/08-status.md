# 08 — Status and limitations

Read this before you plan a launch, a listing, an integration, or an announcement.

## Deployment status: nothing is deployed

The launchpad's platform contracts are marked `PREPARED_NOT_DEPLOYED` on **every** target chain:

| Chain | Chain ID | Factory | Locker | Registry | Script storage | Project rights |
| --- | --- | --- | --- | --- | --- | --- |
| Ethereum | 1 | none | none | none | none | none |
| Base | 8453 | none | none | none | none | none |
| Robinhood Chain | 4663 | none | none | none | none | none |

There is no factory address to call, no locker to claim from, and no registry to read. Any
address you see presented as a live launchpad contract today is wrong. The SDK and the app are
built to fail closed on this: address *prediction* works offline from parameters, but preflight
reports a failing `factory-codehash` check because no factory has code on any chain, and the
app renders `PREPARED_NOT_DEPLOYED` rather than inventing state.

Treasury addresses and the release source commit are also still pending owner input, so even the
deployment package is not finalized.

## Review status: internal only

Everything done so far is **internal review**. There has been **no external audit** and no
third-party security review. Do not describe the launchpad as audited, reviewed, or verified by
anyone outside the project, and do not repeat internal verdict language as if it were an audit
finding.

What internal work does exist is fork-based: the launch path, fee accounting, and buyback
behaviour have been exercised against pinned mainnet forks of all three target chains. Fork-proven
is a real signal about correctness under the tested conditions. It is not deployment-proven, and it
is not an audit.

## Known limits worth planning around

- **One transaction, one gas budget.** A launch is a single atomic call, and it must fit under the
  chain's per-transaction gas cap. That is what forces the script byte budget in
  [04 — Constraints](04-constraints.md). Ethereum's budget has been measured; Base and Robinhood
  Chain are marked `TBD_MEASURED` and must be measured independently rather than assumed.
- **Fee tier is fixed at 1%.** Not configurable per project.
- **Genesis liquidity is single-sided.** There is no bid depth at launch until real buyers add
  quote currency. Nobody is obliged to buy.
- **No upgrade path for your project.** The factory, and the artifacts it deploys, are
  non-upgradeable by design. Your art configuration and script bytes are what they are once the
  launch transaction confirms.
- **Chain-specific gaps exist.** Not every routing and indexing convenience is available on every
  chain; per-chain limitations are disclosed per chain rather than papered over.

## How to talk about this honestly

If you are writing about a project you intend to launch here:

- Say "prepared, not deployed" — not "live", "launched", or "shipping".
- Say "internally reviewed" — not "audited" or "security reviewed".
- Say "75% of collected LP fees" — not "0.75% of volume forever".
- Say "$RELICS bought and sent permanently to a dead address; circulating supply falls,
  `totalSupply` stays fixed at 10,000" — not "supply is burned".
- Say "initialized price" for the price you open the pool at, and never call it a floor, a
  valuation, or a market price. Only trades make a market price.

## Reporting a problem

If you find a security-relevant issue in anything published in this repository, follow
[`SECURITY.md`](../../SECURITY.md). Do not open a public issue with a working exploit path.
