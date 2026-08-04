// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ChainConfig } from "../ChainConfig.s.sol";

/// @title DeployConfig — ONE place the deploy scripts read your collection from
/// @notice Every value here comes from an environment variable with a sensible default, so a
/// forker can deploy the SAMPLE end-to-end by setting only infra addresses, and can make it THEIR
/// collection by setting a handful more. Keep these in sync with `config/collection.config.ts`
/// (the web/human source of truth). See docs/00-make-it-your-own.md.
///
/// Env vars (all optional except where a script requires them):
///   COLLECTION_TOKEN_NAME / _SYMBOL / _SUPPLY   -> ExampleToken
///   COLLECTION_NFT_NAME / _SYMBOL / _MAX_SUPPLY -> ExampleArtNFT
///   RENDERER_STYLE  (sigil | strata | orbital)  -> which sample renderer to deploy
///   POOL_FEE, TICK_SPACING, LAUNCH_TICK, LIQUIDITY
///   plus the infra + address vars from ChainConfig (POOL_MANAGER, WETH, INITIAL_HOLDER, ...)
abstract contract DeployConfig is ChainConfig {
    function _tokenName() internal view returns (string memory) {
        return vm.envOr("COLLECTION_TOKEN_NAME", string("Example Onchain Token"));
    }

    function _tokenSymbol() internal view returns (string memory) {
        return vm.envOr("COLLECTION_TOKEN_SYMBOL", string("EXON"));
    }

    function _tokenSupply() internal view returns (uint256) {
        return vm.envOr("COLLECTION_TOKEN_SUPPLY", uint256(1_000_000 ether));
    }

    function _nftName() internal view returns (string memory) {
        return vm.envOr("COLLECTION_NFT_NAME", string("Example Onchain Art"));
    }

    function _nftSymbol() internal view returns (string memory) {
        return vm.envOr("COLLECTION_NFT_SYMBOL", string("EXART"));
    }

    function _maxNftSupply() internal view returns (uint256) {
        return vm.envOr("COLLECTION_MAX_NFT_SUPPLY", uint256(10_000));
    }

    /// @notice Which of the three sample art systems to deploy. One of: "sigil", "strata",
    /// "orbital". Ignored if you deploy your own renderer contract.
    function _rendererStyle() internal view returns (string memory) {
        return vm.envOr("RENDERER_STYLE", string("sigil"));
    }

    function _poolFee() internal view returns (uint24) {
        return uint24(vm.envOr("POOL_FEE", uint256(POOL_FEE)));
    }

    function _tickSpacing() internal view returns (int24) {
        return int24(vm.envOr("TICK_SPACING", int256(TICK_SPACING)));
    }

    function _launchTick() internal view returns (int24) {
        return int24(vm.envInt("LAUNCH_TICK"));
    }

    function _liquidity() internal view returns (uint256) {
        return vm.envUint("LIQUIDITY");
    }
}
