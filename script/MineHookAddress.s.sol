// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ChainConfig } from "./ChainConfig.s.sol";
import { console2 } from "forge-std/Script.sol";
import { HookMiner } from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { ExampleV4Hook } from "../src/ExampleV4Hook.sol";

/// @notice Mine a CREATE2 salt so the hook deploys to an address whose low 14 bits equal the
/// exact permission flags (0x1440). Run this FIRST; feed the printed salt to DeployExample.
///
///   POOL_MANAGER=0x... ART_TOKEN=0x... HOOK_OWNER=0x... \
///     forge script script/MineHookAddress.s.sol --tc MineHookAddress
///
/// IMPORTANT: mine against the EXACT init code + constructor args you will deploy with. A hook
/// address is a function of (deployer, salt, keccak256(initCode ++ constructorArgs)). Change
/// any constructor argument and the mined salt is invalid — you must re-mine. See docs/13.
contract MineHookAddress is ChainConfig {
    function run() external view {
        address poolManager = _poolManager();
        address artToken = vm.envAddress("ART_TOKEN");
        address hookOwner = vm.envAddress("HOOK_OWNER");

        bytes memory constructorArgs = abi.encode(IPoolManager(poolManager), artToken, hookOwner);
        (address predicted, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER, HOOK_FLAGS, type(ExampleV4Hook).creationCode, constructorArgs
        );

        _logHeader("Mined hook address");
        console2.log("deployer (CREATE2 factory):", CREATE2_DEPLOYER);
        console2.log("predicted hook address:    ", predicted);
        console2.log("low-14-bit flags (want 0x1440):", uint160(predicted) & 0x3FFF);
        console2.logBytes32(salt);
    }
}
