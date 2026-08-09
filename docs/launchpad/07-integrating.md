# 07 — Integrating: the SDK and ABI surface

> Not deployed on any chain yet, and the SDK is not published to npm. Internal review only — no
> external audit. See [08 — Status and limitations](08-status.md).

This page is for people building a marketplace view, an indexer, a custom mint page, or a portfolio
tool against launchpad projects. It describes the shapes you would work with.

## Distribution status

The SDK is a private workspace package (`@v4-art-launchpad/sdk`, version `0.1.0`), not published to
npm and not resolvable as an installed dependency. There is no `npm install` for it today. Treat
the surface below as a specification of the shapes, and read the contract ABIs as the durable
interface — those are what will still be true after any packaging decision.

## The one rule the whole surface follows

Every read returns an envelope, and **a failed read is `null` with a populated `error`** — never
`0`, never `false`, never a zero address:

```ts
{ chainId, blockNumber, source, projectId, poolId, error }
```

`source` is a provenance string (`"onchain:factory.predict"`, `"onchain:receipt:Launched-event"`,
`"chain-registry:platform-not-deployed"`, and so on) so a UI can always say where a number came
from. And every `build*()` function returns an **inert** prepared transaction — the SDK does not
sign or broadcast. Exactly one function submits anything, and it refuses unless readiness passed.

If you build on this, keep that property. A dashboard that prints `0` where it means "could not
read" is how people get hurt.

## Chain registry

```ts
type SupportedChainId = 1 | 8453 | 4663;
type PlatformDeploymentStatus = "PREPARED_NOT_DEPLOYED" | "DEPLOYED";
```

`isPlatformDeployed(chainId)` is the non-throwing check for UI; `requireDeployedPlatform(chainId)`
throws `PlatformNotDeployedError` unless the status is `DEPLOYED` **and** every required address is
non-null. Today every chain returns `PREPARED_NOT_DEPLOYED` with every platform address `null`, so
every launch and read path short-circuits with that as the stated source. Build your integration to
handle that state honestly rather than special-casing it away.

External addresses (Uniswap v4 PoolManager, WETH, Permit2, Quoter, StateView) are real and
populated per chain — those are pre-existing third-party contracts, not launchpad ones.

## Composing a launch

The order is: mine two salts → build params → validate → predict → simulate → estimate → sign.

```ts
// 1. Mine both salts. Each address has a constraint: the token must sort correctly
//    against WETH, and the hook must land on the 0x1440 mask. Both miners must also
//    check for live code at the candidate address, not just the mask.
const hookMine = await mineArtHookSalt(chainId, { publicClient });
const tokenSalt = /* token-salt miner, direction "belowWeth" for single-sided routing */;

// 2. Build the canonical params from creator input.
const params = buildLaunchParams(chainId, creatorInput, {
  tokenSalt,
  hookSalt: hookMine.salt,
});

// 3. Validate off chain before spending anything.
const check = validateLaunchParams(chainId, params, { scriptByteLimit: 36_000 });
if (!check.ok) throw new Error(check.problems.join("; "));

// 4. Canonical address prediction -- an eth_call to factory.predict().
const predicted = await predictProjectAddresses(chainId, { publicClient, params, creator });

// 5. Real dry run. This is the authority on whether launch() will succeed.
const built = await buildAtomicLaunch(chainId, { publicClient, creator, params });
if (!built.ok) throw new Error(built.error);

// 6. Gas and byte budget, from the live estimate rather than a curve fit.
const gas    = await estimateAtomicLaunchGas(chainId, { publicClient, creator, params });
const budget = getScriptByteBudget(chainId, scriptBytes, { live: { estimatedGas: gas.estimatedGas } });

// 7. The creator's wallet signs `built.tx`. Nothing before this point moves anything.
```

Notes that save time:

- `factory.predict()` is canonical. The SDK also ships pure off-chain address math, but that is a
  cross-check, not a substitute — the collection is deployed by a helper contract with a derived
  salt, so hand-rolled prediction is easy to get subtly wrong.
- `artScriptHash` is recomputed as `keccak256(artConfig)` when params are built, and re-checked on
  chain. Do not pass a hash you computed separately and hope.
- Salt mining must run against **live code checks** for address collisions, not just the flag mask.
- On Base and Robinhood Chain, `getScriptByteBudget` returns a null maximum and an explicit
  "not measured for this chain" error rather than borrowing Ethereum's 36,000.

After the transaction confirms, `parseLaunchReceipt(chainId, receipt)` decodes the `Launched` event
into `{ projectToken, projectCollection, artHook, projectId, poolId, genesisLiquidity }`. Read it
from the confirmed receipt — never from a simulation.

## Reading a live project

| Concern | Call | Returns |
| --- | --- | --- |
| Project record | `readProject(chainId, projectId, { publicClient })` | Published flag, launch result, canonical `eip155:<chainId>:<token>` identity |
| Fee state | `readProjectFeeState(chainId, {...})` | LP fee pips, live protocol fee both directions, compounded effective fees, the 7500/2500 split bps, and the disclosure string |
| Creator revenue | `readCreatorRevenue(chainId, projectId, {...})` | Accrued and claimable WETH and token, plus nested rights info |
| Platform revenue | `readPlatformRevenue(chainId, projectId, {...})` | Accrued WETH, pending token conversion bucket, claimable WETH |
| Rights | `readProjectRights(chainId, projectId, {...})` | Owner, payout recipient, and the on-chain transfer warning |
| Art state | `readArtState(chainId, projectId, {...})` | Backing token, max active artworks, active count, available capacity, dormant count, fully-backed flag |
| Market state | `readMarketState(chainId, projectId, {...})` | Organic swap count, buy/sell volume, net flow, oracle readiness, sqrt price, tick, fees, liquidity |
| Sale state | `readSaleState(chainId, projectId, {...})` | `OPEN` / `FINALIZED` / `FAILED`, plus buyer position |

Transaction builders mirror them: `buildCreatorClaim`, `buildPlatformClaim`,
`buildPlatformConversion`, `buildAwaken`, `buildRedeem`, `buildBuy`, `buildSell`, and the sale
builders. `buildAwaken` returns a required ERC-20 approval transaction first when the allowance is
short, so an integrator does not have to discover that at signing time.

Three behaviours worth designing around:

- **`buildPlatformConversion` refuses rather than guesses.** It returns a null transaction with
  stated reasons unless a real simulation clears, and it surfaces the decoded revert name. There is
  no off-chain tick math substituting for the chain's answer.
- **Bonding-curve sell-back always refuses**, with a source of `"sale-design:no-sell-back"`. It is
  not a missing feature; the escrow is one-way by design.
- **The rights transfer warning is read live** from `TRANSFER_WARNING()`. If you build a transfer
  UI, display the string you read, not one you copied.

## Contract-level ABI, if you skip the SDK

The durable interface. These are the entry points worth building against directly:

```solidity
// Factory
function launch(LaunchParams calldata params) external returns (LaunchResult memory);
function predict(LaunchParams calldata params, address creator) external view
    returns (address projectToken, address projectCollection, address artHook, PoolId poolId);
function launchSale(LaunchParams calldata params, LaunchMode mode, SaleTerms calldata terms)
    external returns (uint256 projectId, address escrow);
function finalizeSale(uint256 projectId) external returns (LaunchResult memory);
function projectConfigHash(LaunchParams calldata p) external pure returns (bytes32);

// Collection (ERC-721)
function awaken(uint256 count) external returns (uint256[] memory ids);
function redeem(uint256 id) external;
function redeemMany(uint256[] calldata ids) external;
function tokenURI(uint256 id) external view returns (string memory);
function dnaOf(uint256 id) external view returns (bytes32);
function historyOf(uint256 id) external view returns (uint64 bornBlock, uint32 awakenCount);
function dormantCount() external view returns (uint256);
function isFullyBacked() external view returns (bool);
function contractURI() external view returns (string memory);   // ERC-7572

// Hook
function organicSwapCount()  external view returns (uint256);
function organicBuyVolume()  external view returns (uint256);
function organicSellVolume() external view returns (uint256);
function organicNetFlow()    external view returns (int256);

// Fee locker
function collectFees(PoolId poolId) external;
function claimCreator(uint256 projectId) external;
function claimPlatformWeth(uint256 projectId) external;
function claimableCreatorWeth(uint256 projectId)  external view returns (uint256);
function claimableCreatorToken(uint256 projectId) external view returns (uint256);
function claimablePlatformWeth(uint256 projectId) external view returns (uint256);
function genesisLiquidity(PoolId poolId) external view returns (uint128);
function poolIdOf(uint256 projectId) external view returns (PoolId);

// Rights
function setPayoutRecipient(uint256 projectId, address recipient) external;
function TRANSFER_WARNING() external view returns (string memory);
```

Errors you will want to decode and render: `BadArtHash`, `BadTemplate`, `ScriptTooLarge`,
`BadSupply`, `BadBacking`, `BadCollaborator`, `TooManyCollaborators`, `BadRecipient`,
`BadHookAddress`, `NotWired`, `WrongChain`.

## Indexing notes

- **Script bytes need indexing to recover.** The factory emits `ArtStored(projectId, scriptHash,
  length)` and the store emits `ScriptStored(scriptHash, totalLength, chunkCount)`, but the factory
  does not retain the chunk pointers. Reconstruction is an indexer job; always verify
  `keccak256(bytes) == scriptHash` before rendering.
- **Do not merge venues.** Market state is the canonical pool only. Aggregating a secondary venue
  into a project's art history is wrong.
- **Do not aggregate across chains.** A project is `eip155:<chainId>:<token>`; identical addresses
  on different chains are distinct instances.
- **Entombment is not a burn.** If you index the $RELICS buyback, render it as "entombed" or
  "permanently removed". `totalSupply` does not decrease. See
  [06 — Fees and revenue](06-fees-and-revenue.md).
- **Fees are not volume.** Display "75% of collected LP fees", and compute the trader's effective
  fee from live pool state rather than printing a hardcoded 1%.
