# 02 — Contracts and the token

## ExampleToken (ERC-20)

A deliberately boring, fully auditable fixed-supply token:

- The **entire supply is minted once**, in the constructor, to a single holder.
- **No** mint function, **no** owner, **no** tax/fee-on-transfer, **no** blacklist/allowlist,
  **no** pause, **no** proxy/upgrade. `totalSupply()` is constant forever.
- One teaching feature on top of a plain ERC-20: an **O(1) active-holder count** maintained
  inside `_update`. It shows how to keep an on-chain aggregate correct under *every* transfer
  path (mint, `transfer`, `transferFrom`) without ever looping over holders.

```solidity
function _update(address from, address to, uint256 value) internal override {
    super._update(from, to, value);
    if (from != address(0)) _refreshActiveHolder(from);
    if (to != address(0)) _refreshActiveHolder(to);
}
```

The active-holder count is **art entropy only**. It is manipulable by anyone willing to hold the
threshold, and it resists dust spam but not capital-backed Sybil behavior. Never use it as a
governance oracle.

## The ERC-20 ↔ ERC-721 relationship

This starter keeps the two token standards as **two independent contracts**. It is **not**
ERC-404/DN-404 (no fractional hybrid accounting) and **not** a wrapper (the NFT is natively
ERC-721; there is no wrap step).

The link is one-directional and explicit:

```
wholeUnits(a)      = ExampleToken.balanceOf(a) / 1e18
awakened(a)        = ExampleArtNFT.balanceOf(a)
latentCapacity(a)  = max(0, wholeUnits(a) - awakened(a))   // DERIVED, never stored
```

- **Receiving the token does nothing.** There is no auto-mint on inflow. A swap that sends you
  tokens raises your latent capacity — a number with no storage slot — and materializes nothing.
- **Awakening is explicit.** A holder calls `awaken(count)`; it is `msg.sender`-only and bounded
  per call. See [05 — NFT and awakening](05-nft-and-awakening.md).

> Design note: unlike some production designs, this starter does **not** retire NFTs when tokens
> flow out. Once awakened, a piece is an independent ERC-721. Coupling burn-on-outflow is a
> separate, advanced exercise; keeping them decoupled makes the starter easy to reason about.

## What this token is not

Not a meme coin scaffold, not a tax token, not a rebasing token, not an upgradeable token. If you
fork this, keep those properties or you change the security story entirely.
