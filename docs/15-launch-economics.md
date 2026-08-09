# 15 — Launch economics and honest language

On-chain art launches attract a lot of confident, wrong claims. This page is about saying only
what is true.

## Terms, defined

- **Initialized price** — the price implied by the pool's opening `sqrtPriceX96`. Real, but set by
  you, not by any trade.
- **Initialized FDV** — supply × initialized price. A modeling number. Always label the ETH/USD
  rate you used as **illustrative**.
- **Executable ask liquidity** — the tokens available to buy at and above the launch price. In a
  single-sided launch this is (nearly) the whole supply.
- **Genesis bid depth** — the quote-token depth available to sell *into*. In a single-sided
  launch this is **zero** until a real buyer's quote token accumulates in the pool.
- **Buyer-created bid depth** — bid depth that exists only because independent buyers traded.
- **Circulating supply** — tokens outside the pool, the locker, and any provably inaccessible
  addresses.
- **Market-established price** — a price backed by real, independent trading. Only this deserves
  to be called "the price."

## Things never to say

- "Zero seeded quote means zero price." (False: the pool has an initialized price.)
- "Two-sided liquidity at launch." (If you seeded one side, say so.)
- "The initialized FDV is already market-validated." (It is not; no trade happened.)
- "Pre-funded floor" / "the pool has sell depth before buyer quote exists." (There is no bid depth
  at genesis in a single-sided launch.)
- "LP burned." (If you locked it in a custodian that still forwards fees, describe it by what the
  bytecode does: "held by an ownerless custodian with no withdrawal path; fees route to recipients
  fixed at construction.")
- "Locked forever." State the mechanism and let the reader verify it. Adjectives are not evidence,
  and a third-party lock service is not the same claim as ownerless bytecode — say which one you
  actually used.

## No project-funded bootstrap buy

Do not have the deployer/treasury/team buy the token at launch to manufacture initial volume,
holders, or apparent demand. It is dishonest, it is often illegal (market manipulation /
wash trading), and it corrupts every downstream analytics signal. A launch should stand on real,
independent trades.

## Fees and disclosure

If the locker forwards fees to a treasury, **disclose that treasury fee right** next to any
"no hidden reserves" claim. Transparency about who receives fees is part of honest launch
language.

> None of this is legal advice. Launch economics and token distribution can carry serious legal
> and regulatory consequences. Get qualified counsel before launching anything.
