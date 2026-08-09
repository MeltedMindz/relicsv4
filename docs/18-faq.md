# 18 — FAQ

**Is this audited / production-ready?**
No. It is an educational starter with no warranty. Get your own security, legal, and economic
review before deploying or trading anything.

**Is this affiliated with Uniswap, OpenZeppelin, OpenSea, or any collection?**
No. It uses their open-source libraries and standards, but nothing here is endorsed by or
affiliated with them, or with any production project.

**Do I need a WalletConnect projectId or an API key to run the web app?**
No. Wallet discovery uses EIP-6963 + injected connectors. Core reads use a public RPC. No secret
is required for the core flows.

**Where does the art come from? Is there an image file or IPFS?**
Neither. `ExampleArtNFT.tokenURI(id)` computes a base64 JSON + base64 SVG on chain from the token's
immutable DNA and the hook's live market state, at query time.

**What is ERC-4906?**
An ERC-721 extension that lets a contract emit `MetadataUpdate` / `BatchMetadataUpdate` events so
marketplaces know to refresh cached metadata. This starter advertises it and emits an update on
awaken. Global market changes can't emit per-token events without a loop, so caches still lag.

**Why must the hook live at a special address?**
A v4 hook's low address bits declare which callbacks it uses. You mine a CREATE2 salt to find a
matching address. See [13](13-mining-hook-address.md).

**Why can't I predict the LP position id?**
It comes from a shared counter that other transactions also advance. Read it from your confirmed
receipt/ownership. See [11](11-position-manager-token-id.md).

**Why single-sided liquidity? Does zero seeded quote mean zero price?**
No. A single-sided pool has a valid initialized price and zero quote reserves — two different
facts. See [08](08-genesis-liquidity.md) and [15](15-launch-economics.md).

**Can I say the LP is "burned"?**
Not if you used the locker. Say "principal held by an ownerless custodian with no withdrawal
path; fees route to recipients fixed at construction." Burning the
position NFT would also kill fee collection forever. See [09](09-locker-and-lp-finality.md).

**Can market state or `block.prevrandao` decide a payout or mint order?**
No. They are art entropy only. Money decisions must be deterministic and adversary-resistant. See
[07](07-market-state-as-art.md).

**Can I put my deploy key in Vercel/Netlify env so the site can deploy contracts?**
No. Never put signing secrets in a hosting environment. The web app needs none. Deploy from your
operator machine with Foundry.

**How big can the renderer get?**
Runtime bytecode must be ≤ 24,576 bytes (EIP-170). Measure with `forge build --sizes` after every
edit. See [16](16-renderer-size-budget.md).

**How do I run the tests / generate art / start the app?**
See the root `README.md` quick start, or:
```bash
forge test
forge script script/GenerateExamples.s.sol --tc GenerateExamples
npm install && npm run web:dev
```

**Is production RELICS in here?**
No. This is a clean-room starter *inspired by lessons* from building on-chain art on v4. It
contains no production contracts, addresses, keys, proofs, or private material.
