// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ChainConfig } from "./ChainConfig.s.sol";
import { console2 } from "forge-std/Script.sol";
import { ExampleV4Hook } from "../src/ExampleV4Hook.sol";
import { ExampleArtNFT } from "../src/ExampleArtNFT.sol";

/// @notice Read-only post-deployment checks. Reverts on the first inconsistency, so it doubles
/// as a CI/operational gate. Point it at your deployed addresses:
///
///   TOKEN=0x... HOOK=0x... RENDERER=0x... NFT=0x... \
///     forge script script/VerifyDeployment.s.sol --tc VerifyDeployment --rpc-url $SEPOLIA_RPC_URL
contract VerifyDeployment is ChainConfig {
    function run() external view {
        address token = vm.envAddress("TOKEN");
        address hookAddr = vm.envAddress("HOOK");
        address renderer = vm.envAddress("RENDERER");
        address nftAddr = vm.envAddress("NFT");

        ExampleV4Hook hook = ExampleV4Hook(hookAddr);
        ExampleArtNFT nft = ExampleArtNFT(nftAddr);

        require(uint160(hookAddr) & 0x3FFF == 0x1440, "hook flag bits != 0x1440");
        require(hook.artToken() == token, "hook.artToken mismatch");
        require(hook.isPoolBound(), "canonical pool not bound");
        require(address(nft.token()) == token, "nft.token mismatch");
        require(address(nft.hook()) == hookAddr, "nft.hook mismatch");
        require(address(nft.renderer()) == renderer, "nft.renderer mismatch");

        _logHeader("Deployment verified");
        console2.log("token:   ", token);
        console2.log("hook:    ", hookAddr);
        console2.log("renderer:", renderer);
        console2.log("nft:     ", nftAddr);
        console2.log("canonical poolId:");
        console2.logBytes32(hook.canonicalPoolId());
    }
}
