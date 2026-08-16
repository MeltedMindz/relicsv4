<!-- RETIRED_CLAIM_DETECTOR_SELF_REFERENCE — the "Language rules" section names the banned phrasings
     in order to ban them, so the phrase scan skips this page wholesale. Every other rule in
     scripts/check-launch-protection.mjs still applies to it, including every derived fact. -->

# 12 — Launch protection

Every figure on this page is derived from one declaration,
[`packages/project-schema/src/launch-protection.js`](../../packages/project-schema/src/launch-protection.js),
and `npm run kit:protection` fails if this page and that declaration disagree. If you are reading a
number here, it is the number the kit exports.

---

## The schedule

From the instant a project's canonical Uniswap v4 pool is initialized, the **buy-side LP fee decays
linearly from 99% to 1% over 98 minutes**. The **sell-side LP fee is a flat 1%** for the whole life
of the market — it does not decay, because it never rises.

| | |
| --- | --- |
| Window | 5880 seconds — 98 minutes |
| Buy-side fee | 990,000 pips → 10,000 pips, linear |
| Sell-side fee | 10,000 pips, constant |
| Anchor | the second the pool is initialized |
| Opt-out | none |

**It is 98 minutes because 99 − 1 = 98.** The fee falls one percentage point per minute, and the
schedule is named for the span it crosses. Do not describe it as a 99-minute decay; that is a
different schedule belonging to a different protocol, and the gate rejects the phrase.

Fees are expressed in **pips**, which is how Uniswap v4 states LP fees: 1,000,000 pips = 100%. So
990,000 pips is 99% and 10,000 pips is 1%.

### It cannot be disabled

Launch protection is mandatory. There is no constructor argument, no factory parameter and no
governance action that turns it off for a project, and there is no "protected" and "unprotected"
launch to choose between.

### There are no privileged exemptions

The creator, the platform, the deployer, the protocol Safe and every router pay the same buy-side
fee as anyone else. The fee is a function of elapsed time alone, and the hook holds no allowlist to
consult. If you are building a launch UI, there is no "creator buy" path that pays less — quote the
creator the same fee you quote everyone.

This is worth stating plainly because it is not the norm. Several launchpads exempt the creator's
first purchase, which means the creator buys at the terminal rate while the first outside buyer pays
the opening rate. Nothing here does that.

### What it does, and what it does not do

It makes buying in the first minutes of a market cost a multiple of what the same buy costs later.
That removes the advantage of being first in the block, because being first is exactly when the fee
is highest.

It does **not** guarantee equal allocation, it does **not** identify anyone, and it does **not**
stop a buyer from waiting for the fee to fall and then buying. It prices the opening minutes; it
does not decide who may transact in them. Do not describe it as preventing bots or as producing
fair distribution — a patient bot is exactly what it does not stop.

### Sale modes: the window belongs to the pool

There is **no fee decay during the sale** itself. A sale escrow and the pool a sale graduates into
are two different markets at two different prices.

A sale-mode project's pool is created at finalization, so it opens at the full 99% and runs the
whole window from there — however long the sale ran beforehand. A pool that has never traded gets
its own window, because its opening price is one the sale never set.

---

## Hook generations — read the status before the mask

Two hook generations exist. **Only one is deployed.** Getting this backwards in either direction is
the mistake most likely to waste your time.

| Generation | Mask | Status | LP fee | Callbacks |
| --- | --- | --- | --- | --- |
| RC5 | `0x1440` | **Deployed** on Ethereum, Base and Robinhood Chain, all `PREPARED` | static pool fee | `afterInitialize`, `afterAddLiquidity`, `afterSwap` |
| RC6 | `0x14C0` | **Not deployed** anywhere | dynamic, set in `beforeSwap` | `afterInitialize`, `afterAddLiquidity`, `beforeSwap`, `afterSwap` |

`PREPARED` means the factory is live but refuses an ordinary creator launch. See
[08 — Status](08-status.md).

RC6 adds exactly one callback, `beforeSwap`, and that callback is what makes the decay possible: it
returns a per-swap LP fee override. RC5 has no `beforeSwap` and therefore no dynamic-fee path at
all, which is why its pool fee is structural.

Neither generation has any return-delta permission. The hook sets the fee the pool charges; it does
not take a cut of the swap through a delta of its own.

### The dynamic-fee PoolKey, and the PoolId mistake

**This is the single likeliest integration error against RC6, so it gets its own heading.**

An RC6 pool is created with a **dynamic-fee `PoolKey`**: the `fee` field carries Uniswap v4's
dynamic-fee sentinel, `0x800000`, and **not a concrete fee**. The sentinel is a flag meaning "this
pool's LP fee is set at runtime by its hook". It is not 0x800000 pips, and it is not a fee you can
substitute a number for.

A `PoolId` is the hash of the whole `PoolKey`. If you build a key with a concrete fee — 10000 for
1%, say, because that is what the pool currently charges — you get a **different hash**, and
therefore a valid-looking `PoolId` for **a pool that does not exist**. Reads against it return
zeroes rather than errors, which is why this fails quietly: your integration looks like it is
working against an empty pool instead of failing against a wrong one.

If a pool read returns all zeroes and you expected liquidity, check the `fee` field in the key you
hashed before you check anything else.

---

## Launch modes

Three modes are defined. **Two may be selected today.**

| Mode | Available today |
| --- | --- |
| `INSTANT_V4` | Yes |
| `BONDING_CURVE_SALE_TO_V4` | Yes |
| `FIXED_PRICE_SALE_TO_V4` | No |

`LAUNCHABLE_MODES` is derived from the availability map rather than listed separately, so a UI that
reads it cannot offer a mode the platform will refuse.

### Why `FIXED_PRICE_SALE_TO_V4` is not offered

> The fixed-price sale phase does not limit how much of a sale any one buyer can take: there is no per-buyer cap, no cooldown and no maximum per transaction. The launch-protection schedule cannot apply there, because it governs the Uniswap v4 pool and that pool does not exist until the sale finalizes. This mode is therefore not offered.

That is the whole reason and it is stated no wider. The mode is **not** insecure: its escrow holds
funds, refunds and settles correctly. What it does not do is cap any single buyer.

**It also implies nothing about the other two modes.** Neither `INSTANT_V4` nor
`BONDING_CURVE_SALE_TO_V4` rations allocation either. What they have is narrower and specific:
`INSTANT_V4` has the fee schedule running from the first instant anyone can trade, and
`BONDING_CURVE_SALE_TO_V4` has a unit cost that rises as one buyer takes more. Neither is fair
distribution and neither is Sybil-resistant, and no page here may imply otherwise.

---

## Genesis liquidity

> Genesis liquidity is held by the immutable locker and cannot be withdrawn through the deployed locker.

Quote that sentence; do not widen it. It is a claim about the deployed bytecode — there is no
withdrawal path in the locker to call — which means you can check it yourself rather than take it
on trust.

> That is a statement about the locker's bytecode, not about every risk. Surrounding protocol components are upgradeable by a 2-of-3 Safe with no timelock, token prices can fall to nothing, and a creator can behave badly in ways no contract prevents.

The limits belong in the same breath as the claim, not a page away. See
[11 — Governance and upgradeability](11-governance-and-upgradeability.md) for who can change what,
and how fast.

---

## Language rules that apply to anything you publish

If you fork this kit and write your own docs, these are the rules the gate enforces here, and they
are worth keeping.

**No audit-status language, in either direction.** Not "not audited", "unaudited", "audit waived",
"owner accepted risk" or "deployed under a waiver" — and equally not "audited", "certified secure"
or "formally verified" without a named report on the same page. The negative invites a reader to
weigh a non-fact; the positive without evidence is worse. Say what is checkable instead: every
deployed contract is source-verified on its chain's explorer, and the runtime bytecode can be read
against the published source.

**No overreach on the liquidity claim.** "Nobody can rug", "rug-proof", "risk-free" and "funds are
safe" are all wider than anything the code supports, and an upgrade authority exists and is
disclosed.

**No overreach on what a fee schedule accomplishes.** It is not Sybil-resistant and it does not
guarantee fair distribution.

Run the gate against your own tree:

```bash
npm run kit:protection            # human output
npm run kit:protection:controls   # prove the gate can fail
```
