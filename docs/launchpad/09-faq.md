# 09 — FAQ

> RC5 platform contracts are deployed on Ethereum, Base and Robinhood Chain, but public creator
> launches are still closed (`PREPARED`).
> See [08 — Status and limitations](08-status.md).

**Can I launch today?**
Not yet. RC5 contracts are deployed on Ethereum, Base and Robinhood Chain, but every factory is
still `PREPARED`, so ordinary creator launches are closed. You can build, validate and export a
real `.relics` file today. Do not broadcast a launch transaction until `acceptsPublicLaunches`
returns true for your chain.

**How do I verify what I am launching against?**
Every deployed contract is source-verified on its chain's explorer. Read the runtime bytecode against the published source before relying on any
description of it. Do not describe the protocol as audited, externally reviewed, or
security-reviewed by a third party — no such report exists to point at.

**What does it cost me to launch?**
Gas, and afterwards 25% of the LP fees your pool collects. There is no listing fee, no fee on
sale-phase purchases, and no upfront charge.

**Do I get 0.75% of trading volume?**
No, and the difference matters. You get **75% of the LP fees actually collected** by the genesis
position. If Uniswap governance enables a protocol fee on your pool, the fees your position earns
per unit of volume fall — while your 75% share of what *is* collected stays exactly the same. See
[06](06-fees-and-revenue.md).

**Where does the platform's 25% go?**
It is split in half, **in the market's selected quote asset**. **50% of the launchpad's net
platform-fee revenue is allocated to $RELICS buy-and-entomb** — that half stays quote-denominated
until an approved route converts it to WETH, and only then does the reserve buy $RELICS and send it
permanently to `0x…dEaD`. The other 50% is retained by the protocol Safe, claimable in the quote
asset immediately. Nominally that is 12.50% and 12.50% of collected LP fees. Both are compile-time
constants with no setter, and neither touches the creator's 75%.

On a WETH-quoted market both halves are WETH straight away — that is the special case, not the
rule. A buyback half sitting in USDG is *allocated*, not *settled*, and any honest interface shows
it that way.

Read "50% of net platform-fee revenue" literally: not 50% of all trading fees, not 50% of creator
fees, not 50% of the pool fee, and nothing to do with Uniswap's protocol fee. The exact invariant
is on net *settled* platform WETH, after conversion fees, slippage and rounding — costs that fall
on the platform's share alone.

**So $RELICS gets burned?**
Say it precisely: bought-back $RELICS is sent to an address nobody controls, so **circulating
supply falls**. But `$RELICS` has **no burn function** — `totalSupply` is fixed at 10,000 and does
not change, ever. The ledger number stays the same; the reachable float shrinks. Anyone telling you
the supply number goes down is wrong.

**Can I withdraw my liquidity?**
No. Genesis liquidity is held by the shared fee locker, not by you. What you hold is the
ProjectRights token carrying the creator fee entitlement. The shipped locker's function surface is
registration, fee collection, conversion, and the two claims — there is no principal-withdrawal
function in it. Verify that against the source rather than taking anyone's word, including this
page's.

**Can I change my art after launch?**
No. Your art bytes are hash-committed in the launch transaction, and there is no proxy, admin key,
or migration path. You can change your payout recipient and your profile links. That is all.

**Does buying the token give me an NFT?**
No. Receiving tokens does nothing to the NFT layer. A holder calls `awaken(count)` themselves,
which escrows backing tokens and mints artworks. `redeem(id)` reverses it and releases the tokens.

**Is this ERC-404 / DN-404?**
No. Two ordinary standard contracts with explicit calls between them — no fractional accounting, no
transfer hooks, no wrapper.

**Is it the same model as the RELICS collection?**
No, and the contracts say so explicitly. RELICS uses balance-coupled dormancy; launchpad projects
use explicit escrow. Do not port assumptions between them.

**Can the hook tax or block my trades?**
No. Its permission mask is `0x1440` — three "after" callbacks only, with no return-delta or donate
permissions, and every unused callback reverts. Because `beforeSwap` always reverts, there is no
dynamic-fee path at all, which is why the 1% LP fee is structural rather than a promise.

**Can someone else add liquidity to my pool?**
No. The hook refuses liquidity from any sender other than the locker.

**Can I pick a different fee tier?**
No. Every project pool is 1.00% with tick spacing 60.

**What happens if my JavaScript is not deterministic?**
It launches successfully and then renders differently for every viewer, forever. Nothing validates
this — there is no linter and no banned-API list. See [03](03-art-runtimes.md).

**How big can my script be?**
36,000 bytes on Ethereum. Base and Robinhood Chain are explicitly unmeasured, and the tooling
returns an error instead of assuming Ethereum's number.

**Does the contract run my JavaScript?**
No. It stores the bytes and commits to their hash. Rendering happens off chain, seeded by an
on-chain-derived value so every viewer computes the same image. Note also that the shipped
`tokenURI` draws a small DNA-and-market SVG rather than calling your art — see
[03](03-art-runtimes.md).

**Can I get a token allocation for myself at launch?**
Not today. The supply config has a creator-allocation field and its cap is currently `0`. The field
ships; the capability does not.

**Can buyers exit a bonding-curve sale before it graduates?**
No. There is no sell-back. Buyers claim tokens after a successful sale, or take a full refund if
the sale misses its minimum raise by the deadline. Disclose this plainly.

**Can I launch on more than one chain?**
You can launch separate projects on separate chains, but they are distinct instances. A project is
identified as `eip155:<chainId>:<token>`; identical addresses on different chains are not the same
thing, and nothing should be aggregated across them.

**Can I move a project between chains?**
No.

**Can the platform change the fee split later?**
Not on the shipped path — the split and its subdivision are compile-time constants in
non-upgradeable contracts with no setters. Judge that claim against the deployed bytecode for the
chain you use.

**Who can trigger a fee claim?**
Anyone. But the destination is resolved from your ProjectRights and the deployed fee policy, so a
stranger calling it only ever pays you. There is no caller-chosen recipient.

**What happens if I sell my ProjectRights token?**
Every unclaimed and future creator fee goes with it, immediately. Already-claimed revenue does not.
The contract carries this warning on chain.

**Can I burn my ProjectRights?**
No. Transfers to the zero address revert, and no burn function exists.

**Is `relics.wtf` the launchpad?**
No. `https://www.relics.wtf` is the RELICS art collection — a separate, already-live property. The
creator app is not publicly hosted, and route paths in [05](05-creator-flow.md) are the app's own
routes, not links.

**Where do I report a security issue?**
[`SECURITY.md`](../../SECURITY.md). Do not open a public issue containing a working exploit path.
