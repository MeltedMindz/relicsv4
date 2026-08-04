// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";

/// @title ChainConfig
/// @notice Shared, env-driven configuration for the deployment scripts. NOTHING is hardcoded
/// to a production network here on purpose — you supply the infrastructure addresses for your
/// target chain via environment variables, and the scripts fail fast if one is missing.
///
/// Look up the canonical Uniswap v4 PoolManager / PositionManager / Permit2 addresses for your
/// chain in the official Uniswap deployments documentation, and WETH for your chain. This
/// starter deliberately does not ship a baked-in address book, so it can never point you at a
/// stale or wrong contract.
///
/// The standard deterministic CREATE2 factory below is the same on every EVM chain and is the
/// `deployer` you mine the hook salt against for `forge script` broadcasts.
abstract contract ChainConfig is Script {
    /// @notice Deterministic CREATE2 deployer proxy (present on most chains via Foundry).
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    uint24 internal constant POOL_FEE = 3000; // 0.30%
    int24 internal constant TICK_SPACING = 60;

    /// @notice The exact permission bits this starter's hook must carry: afterInitialize |
    /// afterAddLiquidity | afterSwap == 0x1440.
    uint160 internal constant HOOK_FLAGS = uint160(
        Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_SWAP_FLAG
    );

    function _poolManager() internal view returns (address) {
        return vm.envAddress("POOL_MANAGER");
    }

    function _positionManager() internal view returns (address) {
        return vm.envAddress("POSITION_MANAGER");
    }

    function _weth() internal view returns (address) {
        return vm.envAddress("WETH");
    }

    /// @dev Address that receives the entire fixed token supply at deploy time (usually the
    /// broadcaster). This holder then seeds the pool as one-sided liquidity.
    function _initialHolder() internal view returns (address) {
        return vm.envAddress("INITIAL_HOLDER");
    }

    function _treasury() internal view returns (address) {
        return vm.envAddress("TREASURY");
    }

    function _logHeader(string memory label) internal pure {
        console2.log("=====================================================");
        console2.log(label);
        console2.log("=====================================================");
    }
}
