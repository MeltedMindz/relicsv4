// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { ExampleOnchainRenderer } from "../src/ExampleOnchainRenderer.sol";
import { IExampleHook } from "../src/interfaces/IExampleHook.sol";

/// @notice Render a deterministic corpus of example sigils to `output/examples/` as raw SVG
/// files, so you can eyeball the art system offline without any network. Regeneration at the
/// same commit is byte-identical — that reproducibility IS your art-integrity check.
///
///   forge script script/GenerateExamples.s.sol --tc GenerateExamples
///
/// Optional: EXAMPLE_COUNT (default 24), MARKET_DRAWDOWN, MARKET_SWAPS to preview how market
/// state changes the render.
contract GenerateExamples is Script {
    function run() external {
        ExampleOnchainRenderer renderer = new ExampleOnchainRenderer();
        uint256 count = vm.envOr("EXAMPLE_COUNT", uint256(24));

        IExampleHook.GlobalMarketState memory market;
        market.drawdownBand = uint32(vm.envOr("MARKET_DRAWDOWN", uint256(0)));
        market.swapCount = uint64(vm.envOr("MARKET_SWAPS", uint256(0)));
        market.volatility = uint32(vm.envOr("MARKET_VOLATILITY", uint256(0)));

        for (uint256 i = 1; i <= count; ++i) {
            bytes32 dna = keccak256(abi.encode("relics-v4-starter/example", i));
            string memory svg = renderer.renderSVG(i, dna, market);
            string memory path = string.concat("output/examples/sigil-", vm.toString(i), ".svg");
            vm.writeFile(path, svg);
        }

        console2.log("Wrote", count, "example SVGs to output/examples/");
    }
}
