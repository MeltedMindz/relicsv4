# 10 — Twenty hard-won lessons

Generic engineering lessons for shipping on-chain art on Uniswap v4. No project-specific
incidents, addresses, or timelines — just the principles, each with the "why."

### Contracts, hooks, and pools

1. **Never predict a shared PositionManager token id from simulation — read it from the confirmed
   receipt or on-chain ownership.** Position ids are a shared, monotonic counter across *all*
   users of the PositionManager. Any other transaction landing in the same block shifts it. Bind
   your locker/records to the id you *observe*, not the one you *simulated*. See [11](11-position-manager-token-id.md).

2. **A hook address encodes its permission flags; mine the salt against the exact init code and
   constructor args.** The address is `f(deployer, salt, keccak256(initCode ++ args))`. Change any
   constructor argument and the mined salt is invalid. Mine inline, at deploy, against the real
   args. See [13](13-mining-hook-address.md).

3. **Bind the canonical PoolKey before the pool is initialized.** Recording the expected identity
   and price *first* is what lets `afterInitialize` reject a wrong opening price. Bind after, and
   the pool could already be initialized at a price you did not choose.

4. **Validate the launch price and the token ordering explicitly.** Assert the exact
   `sqrtPriceX96` / initial tick in `afterInitialize`, and decide token sort order deliberately —
   do not leave it to deployment nonce luck. See [12](12-token-sort-order.md).

5. **Test both currency orderings.** Buy/sell sign conventions, single-sided range direction, and
   router eligibility all flip with ordering. Write the test for `artIsCurrency0` *and*
   `artIsCurrency1`.

6. **Keep hook callbacks bounded.** Fixed-size struct writes, saturating adds, no arrays, no
   external calls into untrusted code. A swap must not be able to run your hook out of gas.

7. **Never render inside a swap callback.** SVG/JSON generation is expensive and unbounded-ish.
   The hook stores compact state; the renderer runs only in a `view` `tokenURI` call.

8. **Avoid amount-proportional NFT work in swaps.** Do not mint/burn/transfer NFTs in proportion
   to swap size or whole units received. That relocates unbounded work onto the trade path. Keep
   awakening an explicit, separately-bounded action.

### LP finality and fees

9. **Do not burn a PositionManager NFT if fee collection must remain possible.** Burning makes
   principal permanent but also permanently kills fee collection. Use a custodian instead.

10. **A fee-forwarding locker must separate principal finality from fee collection.** Lock the
    principal (no transfer/decrease-of-principal in bytecode) while exposing a permissionless fee
    crank.

11. **Do NOT route fee assets through a contract balance when unsolicited balances can alter
    behavior (donation-DoS).** If control flow reads your own balance, an attacker can donate to
    change it. Name the final recipients directly in the `TAKE` actions.

12. **Use a zero-liquidity DECREASE to realize fees without withdrawing principal.** It is the
    canonical v4 fee poke; the `liquidity` argument should be a literal `0` so a principal
    withdrawal cannot be expressed.

### Launch economics

13. **Distinguish initialized price from reserve inventory.** The opening `sqrtPriceX96` sets a
    price; it does not create quote reserves. They are different facts; label them differently.

14. **Single-sided liquidity can have a valid initialized price with zero quote reserve.** "No
    seeded quote" does not mean "no price." Never say "zero quote means zero price," and never
    present initialized FDV as market-validated.

### Truth and process

15. **Don't let stale docs override current source.** When code changes, update the docs and this
    memory in the same change set. A confident, wrong doc is worse than no doc — replace stale
    claims, don't append to them.

16. **Never access browser env dynamically in Next.js.** `process.env[key]`,
    `Object.entries(process.env)`, and `{ ...process.env }` are not inlined and read as undefined
    in the browser. Reference each `NEXT_PUBLIC_*` key by its literal name. See [17](17-frontend-integration.md).

17. **Never put signing secrets in your hosting provider's environment.** Deploy keys, mnemonics,
    and wallet JSON stay on the operator machine. A public web app needs none of them; its reads
    use a public RPC.

18. **Treat marketplace metadata as a cached projection of the canonical `tokenURI`.** Global
    market changes reshape every token but cannot emit per-token update events without an unbounded
    loop. The chain is the source of truth; caches lag.

### Cross-cutting

19. **Randomness and market signals never gate financial outcomes.** `block.prevrandao`, ticks,
    and volumes are art entropy. Money decisions must be deterministic and adversary-resistant.

20. **Respect EIP-170 (24,576-byte runtime limit) as a hard wall.** The renderer is the usual
    offender. Measure after every edit; free bytes before spending them. See [16](16-renderer-size-budget.md).
