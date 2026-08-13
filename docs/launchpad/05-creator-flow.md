# 05 — The creator flow, end to end

> RC5 platform contracts are deployed on Ethereum, Base and Robinhood Chain, but public creator
> launches are still closed (`PREPARED`). The creator app is not publicly hosted; route paths below
> are the app's own routes, not URLs you can visit today. See
> [08 — Status and limitations](08-status.md).

The flow is: **pick a chain → work in the studio → review → sign once.** One transaction does the
launch. There is no multi-step deployment you have to babysit, and no point at which a half-built
project exists on chain.

## Step 0 — Pick a chain

Three deployed RC5 cards: Ethereum (1), Base (8453), Robinhood Chain (4663). BNB Smart Chain (56)
stays in the schema vocabulary for compatibility, but this release marks it deferred. None is
pre-selected, and the studio does not open until you choose one.

Each card shows the chain id, the gas currency, the WETH address, a live estimated launch cost from
a real block and gas-price read, the maximum script bytes for that chain, whether your wallet is
ready, and whether the platform is deployed there. Any fiat figure only appears if you type an
ETH/USD rate yourself — there is no price oracle inventing one for you.

**The chain is permanent.** Once a project is launched the cards go inert. There is no migration.

## Step 1 — Draft

`/create` opens an implicit default draft. `/studio/<draftId>` opens a named one, and you can fork
the current work into a new named draft at any time. Drafts live in your browser's local storage,
so they are per-device and per-browser: nothing is uploaded, and nothing is recoverable if you
clear site data.

A toggle in the status bar switches between **Simple** and **Advanced**, and it only ever moves
when you click it — no validation error, chain choice, or field value silently promotes you.

Simple mode shows: name, symbol, description, template-or-code, image/logo, website, X handle,
total supply, artwork-backing units, starting-price preset, chain, and collaborator splits.
Advanced adds the exact seed field and seed history, the full sandbox, the market-to-art builder,
trait dimensions, a bps-to-percent readout, exact curve geometry, the raw metadata JSON tabs, the
license field, and a technical appendix to the governance disclosure.

Two things stay visible in Simple mode on purpose: the market-state simulation panel and the fee
disclosure, because they are comprehension and safety information rather than complexity. And
predicted contract addresses stay visible in both modes, because "read every field before you
sign" is treated as everyone's right, not a power-user feature.

## Step 2 — ART

Pick a template or write code. In Simple mode custom code is a compact text area; Advanced adds
seed controls and a link to the full sandbox at `/studio/<draftId>/sandbox`.

Always visible on this tab: a **script byte meter** showing your script size against the chain's
maximum and hard ceiling, and a market-state panel labeled SIMULATION.

The sandbox gives you a larger canvas, manual/random/sequential seeds, a saved-seed list, PNG
export, a contact sheet of up to 100 thumbnails with exact-seed duplicate detection, eleven labeled
market-simulation presets (genesis, first buys, accumulation, volatility, drawdown, recovery, thick
and thin liquidity, quiet, holder growth, fee conversion), and preview frames at app-icon,
marketplace-square, marketplace-card and social-card sizes.

Remember what [03](03-art-runtimes.md) says about the preview: it is a shared deterministic preview
renderer, not the on-chain renderer, and the market presets are simulated, not read. Use it for
composition and byte budget, not as proof.

## Step 3 — COLLECTION

Name, symbol, description, website, X handle. Total supply and artwork-backing units, with a
backing model of full parity (one token per artwork) or partial. Your creator recipient, prefilled
from the connected wallet. Collaborator fee splits — address plus bps of **your 75%**, summed live,
warned past 10,000 bps, capped at 16 on chain. Separately, attribution collaborators with roles,
which are metadata credits and carry no money. License, in Advanced, defaulting to CC0-1.0.

### Collection media

Two options: **generate from your artwork** (the default) or **upload custom media**.

Uploads go through a signed session and a one-time, scoped authorization, then a server pipeline
that sniffs the real file type, rejects anything animated or carrying an embedded second format,
normalizes to PNG at the exact role dimensions, pins to IPFS, then **fetches the asset back by its
CID and re-hashes it** before calling it verified. The status ladder you will watch is
`GENERATING → NORMALIZING → PINNING TO IPFS → VERIFYING → READY`, and a launch is blocked until it
reaches READY. See [04 — Constraints](04-constraints.md) for the exact media rules.

If you do not upload anything, a cover is generated deterministically from your own project
configuration — square, banner and featured — at a labeled neutral genesis state, and it must be
displayed with the label "Automatically generated collection cover". It is derived from
`keccak256(projectConfigHash, chainId, domain tag)`, so it is reproducible, chain-separated, and
never another project's art or a generic placeholder. Change your project config and the cover
goes stale and must be regenerated and repinned.

## Step 4 — MARKET

Choose a **starting-price tier** — LOW, MID or HIGH — which is the only raw pricing input you
supply. Everything else (tick, opening price, range, liquidity, token amounts) is computed by the
factory. In Advanced you can see the exact tick magnitudes behind each tier: HIGH is the highest
starting price, LOW the lowest.

Choose a **launch method**: instant, fixed-price sale, or bonding curve. Sale modes add a sale
allocation, a curve preset, a duration, a minimum raise, and optional price/target overrides.

Non-editable and displayed here: the 1% LP fee, the 75/25 split, and the fact that the project
funds no WETH of its own into the pool.

## Step 5 — LAUNCH: review, preflight, one signature

This tab does the work, in order, against the server:

1. **Prepare** — validates your input and builds the single canonical `LaunchParams`. If the chain
   is deferred, or public launch access is still closed, the response says that directly rather
   than fabricating salts or addresses.
2. **Predict** — returns the token, collection, hook and pool id your parameters will produce.
3. **Mine the hook salt** — searches for a salt whose resulting address carries the `0x1440` mask.
4. **Preflight** — a 15-point checklist. Eleven checks run server-side: chain identity, gas
   balance, predicted addresses, hook salt, pool key, recomputed gas, re-simulation, script size,
   factory codehash, external addresses, treasury. Four run locally in your browser, including the
   last one before signing: **your wallet is on the target chain right now**.
5. **Simulate** — a real `eth_call` dry run of the launch.
6. **Build** — re-simulates, then hands back an inert prepared transaction. The server never signs.
7. **You sign.** The button names the chain explicitly — "LAUNCH ON BASE", not a generic "Launch".

Also on this tab: a metadata preview (marketplace card, project page, social card in Simple;
raw ERC-7572 JSON, JSON-LD and explorer packets in Advanced) and a plain-language governance and
fee disclosure that is always visible in both modes.

Today, preflight stops before ordinary creator launch because every deployed RC5 factory remains
`PREPARED`. The factory codehash should be checked; it is no longer the expected failing check on
the deployed chains.

## Step 6 — After the launch

- Your pool is live and tradeable at the end of the launch transaction (or at graduation, in a sale
  mode).
- Holders call `awaken(count)` themselves to mint artworks against escrowed backing tokens. A buy
  materializes nothing on its own — see [02](02-what-a-launch-produces.md).
- Fees accrue in the selected quote asset and in your project token. Anyone may call `collectFees`
  and `claimCreator`; the destination is resolved from your ProjectRights, so a stranger
  triggering a claim only ever pays you. See [06 — Fees and revenue](06-fees-and-revenue.md).
- Project and token pages live at `/p/<chainSlug>/<projectId>` and
  `/p/<chainSlug>/<projectId>/<tokenId>`; creator revenue at `/dashboard/fees`; a chain-filtered
  index at `/discover`.

## What you cannot change afterwards

The chain, the art bytes, the art mode, the market mapping, the supply, the backing ratio, the fee
tier, the split, and the collaborator shares. You can change your payout recipient and your profile
links. That is the whole list — see [04 — Constraints](04-constraints.md).
