# Third-party notices

This project's own source code (everything under `src/`, `script/`, `test/`, `apps/web/`,
`docs/`, and the root config) is licensed **MIT** (see `LICENSE`).

It **redistributes** third-party open-source software: Solidity dependencies are **vendored as
byte-exact, production-pinned trees** under `lib/` (and mirrored where needed inside
`flagship/lib/`), each accompanied by its upstream license file. Web-app dependencies still come
from the **public npm registry** at install time. Each component remains under its own license,
summarized below with the vendored license-file location.

## Solidity dependencies (vendored under `lib/`)

| Component | Upstream | Version | License | License file |
| --- | --- | --- | --- | --- |
| forge-std | foundry-rs/forge-std | 1.16.1 | MIT OR Apache-2.0 | `lib/forge-std/LICENSE-MIT`, `LICENSE-APACHE` |
| OpenZeppelin Contracts | OpenZeppelin/openzeppelin-contracts | 5.6.1 | MIT | `lib/openzeppelin-contracts/LICENSE` |
| OpenZeppelin uniswap-hooks | OpenZeppelin/uniswap-hooks | 1.2.2 | MIT | `lib/uniswap-hooks/LICENSE` |
| Uniswap v4-periphery | Uniswap/v4-periphery | 1.0.3 | MIT | `lib/v4-periphery/LICENSE` |
| Uniswap v4-core | Uniswap/v4-core | 1.0.2 | **Mixed: MIT + BUSL-1.1** | `lib/v4-core/licenses/MIT_LICENSE`, `BUSL_LICENSE` — **see note below** |
| solmate | transmissions11/solmate (v4-core pin) | vendored with v4-core | **AGPL-3.0** | `lib/v4-core/lib/solmate/LICENSE` |
| Permit2 | Uniswap/permit2 | vendored with v4-periphery | MIT | `lib/v4-periphery/lib/permit2/LICENSE` |

### Important: Uniswap v4-core is BUSL-1.1

`v4-core` is licensed under the **Business Source License 1.1 (BUSL-1.1)** — a *source-available*
license with usage restrictions and a "Change Date" after which it converts to a more permissive
license. It is **not** an MIT/OSI-approved open-source license.

- This repository **redistributes** v4-core source under the terms of its licenses, with both
  license texts vendored at `lib/v4-core/licenses/`. The files this project's own code imports
  (interfaces, types, most libraries) carry MIT headers; core implementation files such as
  `PoolManager.sol` carry BUSL-1.1 headers and are included so local test routers compile —
  the deployed system uses only the canonical, Uniswap-deployed PoolManager singleton.
- **If you deploy anything built on v4-core to production**, you are responsible for reviewing the
  BUSL-1.1 terms — including its Additional Use Grant and Change Date — and confirming your use is
  permitted. This starter does not, and cannot, grant you any rights to v4-core; only Uniswap can.

## Web app dependencies (npm, all MIT)

| Component | License |
| --- | --- |
| next | MIT |
| react, react-dom | MIT |
| wagmi | MIT |
| viem | MIT |
| @tanstack/react-query | MIT |
| eslint, eslint-config-next | MIT |
| @playwright/test | Apache-2.0 |
| typescript | Apache-2.0 |

npm dependency licenses are resolved from the public registry at install time; consult each
package for its authoritative license text.

## No endorsement

Use of these libraries and of the ERC-20/721/4906 and Uniswap v4 standards does **not** imply that
Uniswap, OpenZeppelin, OpenSea, Foundry, or any other party endorses, reviews, or is affiliated
with this educational starter.
