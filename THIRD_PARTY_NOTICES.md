# Third-party notices

This project's own source code (everything under `src/`, `script/`, `test/`, `apps/web/`,
`docs/`, and the root config) is licensed **MIT** (see `LICENSE`).

It **depends on** third-party open-source software. Those dependencies are fetched as **git
submodules** (Solidity) or from the **public npm registry** (web app) — their source is **not
copied into this repository**, so this repo does not redistribute their code. Each dependency
remains under its own license, reproduced/summarized below. When you `git clone --recursive` and
`npm install`, you are obtaining those components directly from their upstream sources.

## Solidity dependencies (git submodules)

| Component | Upstream | License | Notes |
| --- | --- | --- | --- |
| forge-std | foundry-rs/forge-std | MIT OR Apache-2.0 | Test/utility library. |
| OpenZeppelin Contracts | OpenZeppelin/openzeppelin-contracts | MIT | ERC-20/721, access, utils, Base64. Transitive via uniswap-hooks. |
| OpenZeppelin uniswap-hooks | OpenZeppelin/uniswap-hooks | MIT | `BaseHook` base class. |
| Uniswap v4-periphery | Uniswap/v4-periphery | MIT | PositionManager interfaces, Actions, HookMiner. Transitive. |
| Uniswap v4-core | Uniswap/v4-core | **BUSL-1.1** | Core pool/hook types and libraries. Transitive. **See the important note below.** |
| Permit2 | Uniswap/permit2 | MIT | Transitive; used only by the AddLiquidity template. |

### Important: Uniswap v4-core is BUSL-1.1

`v4-core` is licensed under the **Business Source License 1.1 (BUSL-1.1)** — a *source-available*
license with usage restrictions and a "Change Date" after which it converts to a more permissive
license. It is **not** an MIT/OSI-approved open-source license.

- This repository is **compatible** with using v4-core as a **build-time dependency**: v4-core
  source is never copied here (it is a submodule reference), and this project's own MIT code merely
  imports its interfaces and libraries at compile time — the same pattern every Uniswap v4 hook
  project uses.
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
