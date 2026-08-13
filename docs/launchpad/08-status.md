# 08 — Status and limitations

Read this before you plan a launch, a listing, an integration, or an announcement.

## Deployment status: RC5 deployed, public launch closed

The launchpad's RC5 platform contracts are deployed on three chains, but every factory is still
`PREPARED`. That means ordinary creator launches are intentionally closed. Public creation opens
only after a separate operator transaction changes launch access to `PUBLIC`.

| Chain | Chain ID | Status |
| --- | ---: | --- |
| Ethereum | 1 | Deployed, `PREPARED` |
| Base | 8453 | Deployed, `PREPARED` |
| Robinhood Chain | 4663 | Deployed, `PREPARED` |
| BNB Smart Chain | 56 | Deferred |

See [10 — Deployments and quote assets](10-deployments-and-quote-assets.md) for the factory,
locker, registry and quote-reference addresses. The same data is exported from
`@relics/project-schema`, and `npm run kit:status` prints it locally.

## Review status: internal only

Everything done so far is **internal review**. There has been **no external audit** and no
third-party security review. Do not describe the launchpad as audited, externally reviewed, or
security-reviewed by a third party.

Internal fork work is still useful evidence: the launch path, fee accounting, art binding and
multi-quote settlement model have been exercised against pinned forks. Fork-proven is a real
signal about the tested conditions. It is not an external audit.

## Known limits worth planning around

- **Public launch is closed.** Creators can build, validate and export real `.relics` bundles, but
  should not broadcast launch transactions while factories remain `PREPARED`.
- **BNB Smart Chain is deferred.** Chain 56 remains in the schema vocabulary for compatibility, but
  there is no RC5 deployment there.
- **One transaction, one gas budget.** A launch is a single atomic call, and it must fit under the
  chain's per-transaction gas cap. That is what forces the script byte budget in
  [04 — Constraints](04-constraints.md). Ethereum's budget has been measured; Base and Robinhood
  Chain are marked `TBD_MEASURED` and must be measured independently rather than assumed.
- **Fee tier is fixed at 1%.** Not configurable per project.
- **Genesis liquidity is single-sided.** There is no bid depth at launch until real buyers add
  quote currency. Nobody is obliged to buy.
- **Quote admission and WETH conversion are separate.** A quote can be enabled for launch before
  its route to WETH is proven; the buyback half then remains quote-denominated and visibly pending.
- **No upgrade path for your project.** The factory, and the artifacts it deploys, are
  non-upgradeable by design. Your art configuration and script bytes are what they are once the
  launch transaction confirms.

## How to talk about this honestly

If you are writing about a project you intend to launch here:

- Say "RC5 deployed, public launch closed" — not "permissionless launches are open".
- Say "internally reviewed" — not "audited" or "security reviewed".
- Say "75% of collected LP fees" — not "0.75% of volume forever".
- Say "the platform share is denominated in the selected quote asset" — not "everything settles in
  WETH".
- Say "$RELICS bought and sent permanently to a dead address; circulating supply falls,
  `totalSupply` stays fixed at 10,000" — not "supply is burned".
- Say "initialized price" for the price you open the pool at, and never call it a floor, a
  valuation, or a market price. Only trades make a market price.

## Reporting a problem

If you find a security-relevant issue in anything published in this repository, follow
[`SECURITY.md`](../../SECURITY.md). Do not open a public issue with a working exploit path.
