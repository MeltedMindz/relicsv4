// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { DeployConfig } from "./config/DeployConfig.s.sol";
import { console2 } from "forge-std/Script.sol";
import { HookMiner } from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { ExampleToken } from "../src/ExampleToken.sol";
import { ExampleV4Hook } from "../src/ExampleV4Hook.sol";
import { ExampleOnchainRenderer } from "../src/ExampleOnchainRenderer.sol";
import { StrataRenderer } from "../src/StrataRenderer.sol";
import { OrbitalRenderer } from "../src/OrbitalRenderer.sol";
import { ExampleArtNFT } from "../src/ExampleArtNFT.sol";

/// @notice Deploy the full stack in the correct order: token -> hook (CREATE2, flag-mined) ->
/// renderer -> NFT. Everything comes from your config/.env (see script/config/DeployConfig.s.sol),
/// so deploying the sample needs only infra addresses, and making it yours needs only a few env
/// vars — NO code edits.
///
///   POOL_MANAGER=0x... WETH=0x... INITIAL_HOLDER=0x... HOOK_OWNER=0x... \
///   COLLECTION_TOKEN_NAME="Aurora Machines" COLLECTION_TOKEN_SYMBOL=AURA \
///   COLLECTION_NFT_NAME="Aurora" COLLECTION_NFT_SYMBOL=AUR RENDERER_STYLE=orbital \
///     forge script script/DeployExample.s.sol --tc DeployExample \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract DeployExample is DeployConfig {
    function run() external {
        address poolManager = _poolManager();
        address weth = _weth();
        address initialHolder = _initialHolder();
        address hookOwner = vm.envAddress("HOOK_OWNER");

        vm.startBroadcast();

        // 1) Token: entire fixed supply to the initial holder.
        ExampleToken token =
            new ExampleToken(_tokenName(), _tokenSymbol(), _tokenSupply(), initialHolder);

        // 2) Hook: mine a salt for a 0x1440 address, then deploy via the CREATE2 factory.
        bytes memory args = abi.encode(IPoolManager(poolManager), address(token), hookOwner);
        (address predictedHook, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, HOOK_FLAGS, type(ExampleV4Hook).creationCode, args);
        bytes memory initCode = abi.encodePacked(type(ExampleV4Hook).creationCode, args);
        (bool ok,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
        require(ok, "hook CREATE2 deploy failed");
        ExampleV4Hook hook = ExampleV4Hook(predictedHook);
        require(address(hook).code.length > 0, "hook not deployed");

        // 3) Renderer: pick one of the three sample art systems (or deploy your own and set NFT
        //    to point at it). 4) NFT: immutably wired to token + hook + renderer.
        address renderer = _deployRenderer();
        ExampleArtNFT nft = new ExampleArtNFT(
            _nftName(), _nftSymbol(), _maxNftSupply(), address(token), address(hook), renderer
        );

        vm.stopBroadcast();

        _logHeader("Deployed");
        console2.log("ExampleToken:   ", address(token));
        console2.log("ExampleV4Hook:  ", address(hook));
        console2.log("Renderer:       ", renderer);
        console2.log("ExampleArtNFT:  ", address(nft));
        console2.log("hook flag bits (want 0x1440):", uint160(address(hook)) & 0x3FFF);

        // Sort-order lesson (docs/12): for app.uniswap.org to route the first buy on a
        // single-sided pool, the art token generally wants to be currency0 (sort BELOW weth).
        if (address(token) < weth) {
            console2.log("token sorts as currency0 (art < weth): good for single-sided routing");
        } else {
            console2.log(
                "WARNING: token sorts as currency1 (art > weth). See docs/12-token-sort-order.md"
            );
        }
    }

    function _deployRenderer() internal returns (address) {
        bytes32 style = keccak256(bytes(_rendererStyle()));
        if (style == keccak256("strata")) return address(new StrataRenderer());
        if (style == keccak256("orbital")) return address(new OrbitalRenderer());
        return address(new ExampleOnchainRenderer()); // "sigil" (default)
    }
}
