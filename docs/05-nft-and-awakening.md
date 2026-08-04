# 05 — The NFT and explicit awakening (`ExampleArtNFT`)

`ExampleArtNFT` is a standard OpenZeppelin ERC-721 with:

- **fully on-chain metadata** (`tokenURI` delegates to the renderer),
- **ERC-4906** metadata-update events,
- **immutable per-token DNA** set at mint,
- **no base URI**, **no owner**, **no proxy**, **no off-chain metadata override**.

## Awakening, not minting-on-receipt

The single lesson this contract exists to teach:

> An unsolicited token transfer can **never** force a piece to materialize. Awakening is
> explicit, caller-initiated, capacity-gated, and bounded.

```solidity
function awaken(uint256 count) external returns (uint256 firstId, uint256 minted) {
    if (count == 0) revert AwakenCountZero();
    if (count > MAX_AWAKEN_PER_CALL) revert AwakenCountTooLarge(count, MAX_AWAKEN_PER_CALL);
    uint256 capacity = latentCapacity(msg.sender);
    if (capacity == 0) revert NoLatentCapacity(msg.sender);
    uint256 toMint = count < capacity ? count : capacity;
    // ... clamp to MAX_SUPPLY headroom, then mint `toMint` pieces to msg.sender
}
```

- `msg.sender`-only. There is no recipient parameter, so no one can awaken *into* your address.
- Bounded by `MAX_AWAKEN_PER_CALL = 8`, so the only minting loop is short and gas is predictable.
- `latentCapacity` is **derived, never stored**:
  `max(0, token.balanceOf(a)/1e18 - nft.balanceOf(a))`.

## `_mint`, deliberately not `_safeMint`

The recipient is always `msg.sender` — the account that just called `awaken`. A `_safeMint`
receiver callback would only add a reentrancy/revert surface without adding a real acceptance
check (the caller already consented by calling). So the contract uses `_mint`. If you fork this
and mint to arbitrary recipients, reconsider that trade-off.

## Immutable DNA

```solidity
bytes32 dna = keccak256(abi.encode(tokenId, msg.sender, block.number, block.prevrandao,
                                   blockhash(block.number - 1)));
_dna[tokenId] = dna;
```

DNA is written once and never changes. The *rendering* of that DNA can still evolve as market
state changes — that is the whole point of on-chain generative art.

## ERC-4906 and marketplace caches

`awaken` emits `MetadataUpdate(tokenId)`. But market state changes affect **every** token at
once, and you cannot emit a per-token event for all of them without an unbounded loop. So treat
marketplace metadata as a **cached projection** of the canonical `tokenURI`; the chain is the
source of truth. See [17 — Frontend integration](17-frontend-integration.md).
