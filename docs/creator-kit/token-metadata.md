# Token metadata — making your ERC-20 look right everywhere

A launch that succeeds on chain can still look broken everywhere a buyer actually looks. The token
shows up on a DEX as an unnamed address with a grey circle where a logo should be; a wallet lists it
with no symbol; an aggregator shows a supply figure nobody recognises. Nothing failed. The metadata
was never published.

This page is about the **ERC-20 token's** discoverability metadata, and it is the half the launchpad
does not do for you.

## What launch already does, and what it does not

The launchpad handles your **NFT collection's** metadata at birth: media is pinned, metadata is
built and pinned, fetch-back verified, `contractURI` and `metadataUriHash` ride in the single launch
transaction, and `contractURI()` is non-empty in the launch receipt. There is no second bind step
and nothing for you to do by hand. That is documented in
[13 — Collection metadata and `contractURI`](../launchpad/13-metadata-and-contracturi.md).

None of that describes your **token**. DEX front-ends, wallets, price aggregators and indexers do
not read your collection's `contractURI`. They read three other places, and no launch writes them
for you.

## The three surfaces

### 1. `tokenURI()` on the ERC-20 — ERC-1046

[ERC-1046](https://eips.ethereum.org/EIPS/eip-1046) adds a `tokenURI()` to an ERC-20 pointing at a
JSON document describing the token. It is the on-chain, self-describing answer, and it is the one
surface that cannot go stale independently of the contract.

Keep the document small and stable:

```json
{
  "name": "Your Project",
  "symbol": "YOURS",
  "decimals": 18,
  "description": "One or two sentences. What it is, not what it will do for the reader.",
  "image": "ipfs://<cid>/logo.png",
  "external_url": "https://yourproject.example",
  "properties": {
    "chainId": 1,
    "totalSupply": "1000000000000000000000000",
    "burnable": false,
    "socials": { "x": "https://x.com/yourhandle" }
  }
}
```

Pin the JSON and the image to content-addressed storage. An HTTPS URL that you control is a URL you
can break; a CID is not.

### 2. A token-list entry

The [Uniswap token list](https://tokenlists.org) format is what most front-ends ingest. One entry
per token per chain:

```json
{
  "chainId": 1,
  "address": "0x…",
  "name": "Your Project",
  "symbol": "YOURS",
  "decimals": 18,
  "logoURI": "ipfs://<cid>/logo.png"
}
```

`logoURI` should be square, transparent-background PNG or SVG, and readable at 32×32 — most of the
places it appears are small.

### 3. Aggregator metadata

DEX aggregators and chart sites generally want the same fields plus links: website, socials, a short
description, and the token's own contract address as the key. Several will pick up a valid
ERC-1046 `tokenURI()` automatically; the rest have a submission form. Submit after deployment, once,
with the real address.

## The rule builders get wrong most often

**Never put a placeholder contract address in a token list.** Generate the address-bound entry only
*after* deployment.

This feels backwards — you want the file ready in advance — and it is the single most common way a
launch ends up with a wrong token pinned in someone's cache. A placeholder address is worse than an
absent one, because it is copyable and it looks correct. An absent entry makes a front-end show
nothing and prompts someone to ask; a wrong entry makes it show something confidently, and lists get
mirrored, cached and re-hosted faster than they get corrected.

So split the work in two:

1. **Before deployment** — write everything that is not the address: name, symbol, decimals,
   description, logo, links, the JSON structure itself. Pin the image. Get it reviewed.
2. **After deployment** — generate the address-bound entries from the real deployment record, in
   one step, and publish them.

The same rule is why the creator CLI refuses to print an upload URL it cannot confirm, and why this
repository publishes no launchpad address that has not been broadcast. A confident wrong value
travels further than a missing one.

## Supply, and the thing not to say

State supply as an integer in base units, and say which it is. If your token has no burn path, say
`"burnable": false` and mean it — do not describe a mechanism that removes tokens from circulation
as a burn unless `totalSupply` actually falls and a burn event is emitted. If tokens are moved to an
address nobody controls, circulating supply falls and `totalSupply` does not; those are different
claims and aggregators reconcile them differently.

## A checklist

- [ ] Logo pinned to content-addressed storage, square, legible at 32×32
- [ ] Token JSON pinned, reachable through a public gateway, fetch-back verified
- [ ] `tokenURI()` on the ERC-20 returns it
- [ ] Token-list entry generated **from the deployment record**, not hand-typed
- [ ] Supply stated in base units, with decimals
- [ ] Burnability stated accurately
- [ ] Website and socials resolve, and the site names the contract address
- [ ] No placeholder address anywhere in any published file
