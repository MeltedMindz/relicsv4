# 10 — Deployments and quote assets

This is the public RC5 address and quote-asset reference for `.relics` authors and integrators.
The machine-readable source is `@relics/project-schema`.

## Launch state

RC5 platform contracts are deployed on Ethereum, Base and Robinhood Chain. They are still in
`PREPARED`, so ordinary creator launches remain closed until the operator opens public creation.
BNB Smart Chain is deferred in this release.

Run the same check locally:

```bash
npm run kit:status
```

Or import it:

```js
import {
  PLATFORM_DEPLOYMENTS,
  acceptsPublicLaunches,
  platformDeployment,
} from "@relics/project-schema";

const robinhood = platformDeployment(4663);
console.log(robinhood.contracts.launchpadFactory);
console.log(acceptsPublicLaunches(4663)); // false while RC5 remains PREPARED
```

## Platform contracts

| Chain | Chain ID | Launch access | Factory | Registry | Locker |
| --- | ---: | --- | --- | --- | --- |
| Ethereum | 1 | `PREPARED` | `0xe887e4601fde28e1981142e715b4b2e9b4ab2319` | `0x277aaa0673fbfbdd182907af3491f8da8a0fdb84` | `0xfcc073d0e863dee90e9795f551f0748ceb6bfd8d` |
| Base | 8453 | `PREPARED` | `0x62a6c28ce2622dcb2acf3ff89e6f9dae3d1d92c2` | `0x5df3bcd0bd2a74d00b4490e1c799a8d8d3947da9` | `0xba2172316bbd48ad6b6d018c93b41da5f16e5f3b` |
| Robinhood Chain | 4663 | `PREPARED` | `0x7694f2b0db5c33df40c3a5fd5c41a16ff471afcf` | `0x2b73450dd74b06d0c45567847fcd1889c4663926` | `0x9fb8f21253f33d978e974938a296b2f1a03e07d2` |
| BNB Smart Chain | 56 | `DEFERRED` | none | none | none |

Full per-chain records include ProjectRights, ScriptStorage, template/runtime registries,
timelocks and Robinhood's multi-quote contracts:

```js
import { PLATFORM_DEPLOYMENTS } from "@relics/project-schema";

for (const [chainId, deployment] of Object.entries(PLATFORM_DEPLOYMENTS)) {
  console.log(chainId, deployment?.contracts ?? "deferred");
}
```

## Quote assets in `.relics` bundles

A bundle may request a quote asset; it cannot approve one. The importer resolves the request
against the launchpad registry on the target chain.

```json
{
  "market": {
    "chainId": 4663,
    "quoteAsset": {
      "mode": "ADDRESS",
      "address": "0x1b0E319c6A659F002271B69dB8A7df2F911c153E",
      "expectedKind": "STOCK_TOKEN",
      "registryVersion": "rc5-genesis-admission-2026-08-13"
    }
  }
}
```

Ethereum and Base use WETH as the only canonical quote in RC5. Robinhood Chain has a complete
stock/ETF quote-token reference exported from the schema package:

```js
import {
  ROBINHOOD_STOCK_TOKEN_COUNT,
  robinhoodStockTokenBySymbol,
} from "@relics/project-schema";

console.log(ROBINHOOD_STOCK_TOKEN_COUNT); // 194
console.log(robinhoodStockTokenBySymbol("GME"));
```

The reference is generated from Robinhood's official asset source and is intentionally complete;
do not copy a partial list into an app. If you need a selector, import the list and filter it.

## Conversion and settlement notes

Quote admission and WETH conversion are separate. A stock-token market can be safe to launch even
while the platform buyback half is quote-denominated and awaiting an approved route to WETH. The
creator's `QUOTE_ONLY` fee mode is also a separate promise: offer it only when the project-token to
selected-quote conversion route has been proven for that market.

Interfaces should display the selected quote asset they read. Do not relabel a Robinhood stock
token entitlement as WETH, and do not treat `PREPARED` as public launch availability.
