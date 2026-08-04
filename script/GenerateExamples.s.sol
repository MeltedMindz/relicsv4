// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { IExampleRenderer } from "../src/interfaces/IExampleRenderer.sol";
import { ExampleOnchainRenderer } from "../src/ExampleOnchainRenderer.sol";
import { StrataRenderer } from "../src/StrataRenderer.sol";
import { OrbitalRenderer } from "../src/OrbitalRenderer.sol";
import { IExampleHook } from "../src/interfaces/IExampleHook.sol";

/// @notice Render a deterministic corpus of example pieces to `output/examples/` as raw SVG
/// files, so you can eyeball an art system offline without any network. Regeneration at the same
/// commit is byte-identical — that reproducibility IS your art-integrity check.
///
///   RENDERER_STYLE=orbital forge script script/GenerateExamples.s.sol --tc GenerateExamples
///
/// Optional: RENDERER_STYLE (sigil|strata|orbital), EXAMPLE_COUNT (default 24), MARKET_DRAWDOWN,
/// MARKET_SWAPS, MARKET_VOLATILITY, MARKET_HOLDERS, MARKET_EPOCH to preview market response.
contract GenerateExamples is Script {
    function run() external {
        IExampleRenderer renderer = _renderer(vm.envOr("RENDERER_STYLE", string("sigil")));
        uint256 count = vm.envOr("EXAMPLE_COUNT", uint256(24));

        IExampleHook.MarketState memory market;
        market.drawdownBand = uint32(vm.envOr("MARKET_DRAWDOWN", uint256(0)));
        market.swapCount = uint64(vm.envOr("MARKET_SWAPS", uint256(0)));
        market.volatility = uint32(vm.envOr("MARKET_VOLATILITY", uint256(0)));
        market.holderCount = uint64(vm.envOr("MARKET_HOLDERS", uint256(0)));
        market.epoch = uint64(vm.envOr("MARKET_EPOCH", uint256(0)));

        for (uint256 i = 1; i <= count; ++i) {
            bytes32 dna = keccak256(abi.encode("relics-v4-starter/example", i));
            string memory svg = renderer.renderSVG(i, dna, market);
            string memory path = string.concat("output/examples/piece-", vm.toString(i), ".svg");
            vm.writeFile(path, svg);
        }

        console2.log("Wrote", count, "example SVGs to output/examples/");
    }

    function _renderer(string memory style) internal returns (IExampleRenderer) {
        bytes32 s = keccak256(bytes(style));
        if (s == keccak256("strata")) return new StrataRenderer();
        if (s == keccak256("orbital")) return new OrbitalRenderer();
        return new ExampleOnchainRenderer();
    }
}
