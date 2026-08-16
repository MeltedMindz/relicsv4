# 11 — Governance and upgradeability

> **Status: RC5 deployed, public launch closed.** Platform contracts are live on Ethereum (1), Base
> (8453) and Robinhood Chain (4663); every factory is still `PREPARED`. This page describes the
> architecture you launch into.

Who can change the code your project depends on, how fast they can do it, and which parts nobody
can change at all.

Read this before you launch. It is more useful than a review-status claim, because it is entirely
checkable: every statement here corresponds to a storage slot you can read or a function that does
or does not exist in a verified source.

---

## The short version

> RELICS uses direct 2-of-3 Safe governance with no mandatory governance timelock. Most persistent
> protocol and project infrastructure uses stable upgradeable addresses. Each project's ArtHook and
> the protocol liquidity custodians are permanently immutable.
>
> The liquidity custodians have no upgrade path, no principal-withdrawal function and no migration
> function. Fee collection does not require principal withdrawal.
>
> Each ArtHook is immutable at launch. Its market state evolves from Uniswap v4 activity, but its
> bytecode and callback permissions cannot be changed.

Both halves matter. A protocol claiming blanket finality across its whole stack would be lying —
the metadata registry has been a UUPS proxy since RC5, and you can read its EIP-1967 slot yourself.
A protocol claiming the opposite would also be lying, and in the more dangerous direction, because
it would obscure the two components that genuinely cannot be touched.

---

## Authority

| | |
| --- | --- |
| Upgrade authority | A 2-of-3 Safe |
| Governance timelock | **None** |
| Execution | Immediate, the moment the second signature lands |

Two of three signers must execute a change. The threshold is the fact worth knowing; the signer set
includes the protocol's automated deployment broadcaster alongside the hardware signers, so read
this as "two of three keys", not "two independent people".

There is no `TimelockController`, no schedule/execute split, and no delay on upgrades, quote-asset
admission, template or runtime activation, route updates, or public opening.

**Protocol-mechanic time windows are not governance timelocks**, and those are retained: TWAP and
oracle observation windows, sale durations, auction periods, signature expirations. "No timelock"
is a statement about governance, not about whether anything in the protocol ever waits.

---

## What can never change

Two components, both deployed by direct CREATE2 with no proxy and no implementation slot. Reading
their EIP-1967 slot returns zero, which is a fact you can check rather than a promise you have to
accept.

### Your project's ArtHook

Deployed fresh for your project at launch. No admin, no upgrade authority, no delegatecall.

Its callback permission bitmap is fixed at `0x1440`:

| Bit | Callback | Enabled |
| --- | --- | :-: |
| | `afterInitialize` | yes |
| | `afterAddLiquidity` | yes |
| | `afterSwap` | yes |
| | `beforeSwap` | no |
| | `afterRemoveLiquidity` | no |
| | return-delta permissions | no |
| | dynamic fees | no |

The bitmap is mined into the hook's own address — `address & 0x3FFF == 0x1440` — so the permission
set is a property of where the contract lives. No transaction can widen it. This is why the hook
can record market state but cannot alter, tax, or refuse a trade.

The hook's *state* evolves continuously as your pool trades. Its *code* does not.

### The liquidity custodian — and there are two of them

Which one holds your principal depends on the lane your market uses. Both have identical
properties; naming only the first would point a Robinhood multi-quote creator at a contract that is
not holding their money.

| Lane | Custodian |
| --- | --- |
| WETH lane (all chains) | `ArtStreamableFeesLocker` |
| Multi-quote lane (Robinhood Chain, 4663) | `ImmutableLiquidityKernel` |

Your custodian owns your project's genesis Uniswap v4 position directly inside the PoolManager.
There is no LP token and no PositionManager NFT.

- No proxy, no UUPS, no beacon, no implementation slot, no delegatecall.
- No owner, no admin, no upgrade authority.
- No principal-withdrawal function, no migration function, no arbitrary external call.

Fee collection pokes the position at **zero liquidity delta**, so collecting fees never moves
principal. That is the design reason the locker needs no withdrawal path at all: the operation you
might expect to require one does not.

Because they can never be patched, the custodians carry the same severity as the hook, and all are
proven pre-deployment rather than fixed post-deployment.

### Why the hook is immutable, and not only for our own reasons

Uniswap's live hook-allowlist policy states:

> Upgradable hooks and hooks requiring custom data inputs are not approved.

RELICS hooks are immutable, carry no return-delta flags, and pass empty `hookData`. That is what
keeps them eligible for Uniswap's own interface and API routing. Quoted rather than paraphrased,
because the policy is Uniswap's to state and a summary of it would drift into a stronger claim
about approval status than the sentence supports.

---

## What is upgradeable, and what that means for you

Everything else uses a **stable address with a replaceable implementation**. Your integration
addresses do not change when an implementation does.

LaunchpadFactory · ProjectToken · ProjectCollection · ProjectRights · Splitter ·
FixedPriceSaleEscrow · BondingCurveSaleEscrow · economic kernels · fee accounting · ProjectRegistry
· ProjectMetadataRegistry · TemplateRegistry · ArtRuntimeRegistry · QuoteAssetRegistry · routers and
adapters · buyback infrastructure.

**The disclosure consequence, stated plainly:** with no timelock, a 2-of-3 decision takes effect
immediately. There is no pending-change window in which you could observe an upgrade and act before
it lands, so disclosure of an upgrade to this layer is necessarily after the fact.

That caveat applies to this layer and to nothing else. It does not apply to the ArtHook or the
locker, because there can never be an upgrade to either one to disclose.

Deployment-only helpers that hold no persistent state, authority or user value stay immutable. They
are not proxied in order to inflate a coverage statistic.

---

## What you as a creator do and do not choose

| | |
| --- | --- |
| You choose | Your art, supply, sale mode, burn policy, quote asset, creator recipient |
| You do **not** choose | Which implementation your project's components point at |
| You do **not** choose | Who holds upgrade authority |

Creators cannot select implementations or set an upgrade admin. There is one protocol-wide
authority and one implementation per component per chain. This is deliberate: a per-project
upgrade admin would be a per-project attack surface, and creators would be asked to secure
something most of them have no way to secure.

Your project's *identity* — its token address, collection address, hook address, pool — is fixed at
launch and is yours.

---

## Reading it yourself

Every component exposes:

```solidity
function componentType() external view returns (string memory);
function implementationVersion() external view returns (string memory);
```

For a proxied component, the current implementation is in the standard EIP-1967 slot:

```
0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
```

```bash
# Which implementation is this proxy pointing at right now?
cast storage <component> 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc

# Zero means it is not a proxy at all. That is the expected answer for your ArtHook
# and for the ArtStreamableFeesLocker.
```

The SDK does this for you, including the part that is easy to get wrong:

```ts
import { discoverComponent, readUpgradeHistory } from "@relics/sdk";

const c = await discoverComponent(client, address);
// { isProxy, implementation, componentType, implementationVersion, upgradeability }

// Never queries an implementation slot for the hook or the locker — they have none,
// and a zero read is not the same fact as "not applicable".
```

See [07 — Integrating](07-integrating.md) for the full SDK surface.

---

## `.relics` bundle compatibility

Bundle format compatibility is governed by the schema version in your bundle, not by which
implementation is deployed. An implementation upgrade does not invalidate an exported `.relics`
file, and the importer validates against the schema the bundle declares.

If a future implementation requires a new bundle field, that arrives as a **schema major version**
with its own migration path, and both versions are accepted during the overlap. Your exported
bundle does not silently stop being launchable because an implementation changed underneath it.

---

## Four chains

| Chain | ID | Platform | Safe |
| --- | ---: | --- | --- |
| Ethereum | 1 | Deployed | 2-of-3, deployed |
| Base | 8453 | Deployed | 2-of-3, deployed |
| Robinhood Chain | 4663 | Deployed | 2-of-3, deployed |
| BNB Smart Chain | 56 | Deferred | 2-of-3, deployed |

The same Safe address, the same three owners, the same 2-of-3 threshold on all four — including
chain 56, where no platform is deployed. Authority is per-chain: a Safe transaction on Ethereum
changes nothing on Base.

Addresses: [10 — Deployments and quote assets](10-deployments-and-quote-assets.md), or
`npm run kit:status`.
