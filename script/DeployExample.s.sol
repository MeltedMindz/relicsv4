// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ChainConfig } from "./ChainConfig.s.sol";
import { console2 } from "forge-std/Script.sol";
import { HookMiner } from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { ExampleToken } from "../src/ExampleToken.sol";
import { ExampleV4Hook } from "../src/ExampleV4Hook.sol";
import { ExampleOnchainRenderer } from "../src/ExampleOnchainRenderer.sol";
import { ExampleArtNFT } from "../src/ExampleArtNFT.sol";

/// @notice Deploy the full stack in the correct order: token -> hook (CREATE2, flag-mined) ->
/// renderer -> NFT. Broadcast with:
///
///   POOL_MANAGER=0x... WETH=0x... INITIAL_HOLDER=0x... HOOK_OWNER=0x... \
///     forge script script/DeployExample.s.sol --tc DeployExample \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
///
/// The hook is deployed through the deterministic CREATE2 factory using a freshly mined salt,
/// so its address is a pure function of (factory, salt, initCode ++ args) — exactly what
/// HookMiner searched. This is why we mine INLINE against the real constructor args here.
contract DeployExample is ChainConfig {
    function run() external {
        address poolManager = _poolManager();
        address weth = _weth();
        address initialHolder = _initialHolder();
        address hookOwner = vm.envAddress("HOOK_OWNER");

        vm.startBroadcast();

        // 1) Token: entire fixed supply to the initial holder.
        ExampleToken token = new ExampleToken(initialHolder);

        // 2) Hook: mine a salt for a 0x1440 address, then deploy via the CREATE2 factory.
        bytes memory args = abi.encode(IPoolManager(poolManager), address(token), hookOwner);
        (address predictedHook, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, HOOK_FLAGS, type(ExampleV4Hook).creationCode, args);
        bytes memory initCode = abi.encodePacked(type(ExampleV4Hook).creationCode, args);
        (bool ok,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
        require(ok, "hook CREATE2 deploy failed");
        ExampleV4Hook hook = ExampleV4Hook(predictedHook);
        require(address(hook).code.length > 0, "hook not deployed");

        // 3) Renderer + 4) NFT (immutably wired to token + hook + renderer).
        ExampleOnchainRenderer renderer = new ExampleOnchainRenderer();
        ExampleArtNFT nft = new ExampleArtNFT(address(token), address(hook), address(renderer));

        vm.stopBroadcast();

        _logHeader("Deployed");
        console2.log("ExampleToken:   ", address(token));
        console2.log("ExampleV4Hook:  ", address(hook));
        console2.log("Renderer:       ", address(renderer));
        console2.log("ExampleArtNFT:  ", address(nft));
        console2.log("hook flag bits (want 0x1440):", uint160(address(hook)) & 0x3FFF);

        // Sort-order lesson: for app.uniswap.org to route the FIRST buy on a single-sided pool,
        // the art token generally wants to be currency0 (sort BELOW the quote token). If it
        // does not, consider mining a CREATE2 salt for the TOKEN too. See docs/12.
        if (address(token) < weth) {
            console2.log("token sorts as currency0 (art < weth): good for single-sided routing");
        } else {
            console2.log(
                "WARNING: token sorts as currency1 (art > weth). Review docs/12-token-sort-order.md"
            );
        }
    }
}
