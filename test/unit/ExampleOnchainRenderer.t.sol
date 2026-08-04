// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { ExampleOnchainRenderer } from "../../src/ExampleOnchainRenderer.sol";
import { IExampleHook } from "../../src/interfaces/IExampleHook.sol";

contract ExampleOnchainRendererTest is Test {
    ExampleOnchainRenderer internal renderer;

    function setUp() public {
        renderer = new ExampleOnchainRenderer();
    }

    function _emptyMarket() internal pure returns (IExampleHook.MarketState memory m) {
        // all zero
    }

    function test_tokenURIisBase64Json() public view {
        string memory uri = renderer.tokenURI(1, keccak256("dna-1"), _emptyMarket());
        assertTrue(_startsWith(uri, "data:application/json;base64,"), "json data uri prefix");
    }

    function test_svgHasCoreShapeAndBackground() public view {
        string memory svg = renderer.renderSVG(7, keccak256("dna-7"), _emptyMarket());
        assertTrue(_contains(svg, "<svg"), "has svg root");
        assertTrue(_contains(svg, "<polygon"), "has core polygon");
        assertTrue(_contains(svg, "<rect"), "has background rect");
    }

    function test_deterministicForSameInputs() public view {
        bytes32 dna = keccak256("determinism");
        IExampleHook.MarketState memory m = _emptyMarket();
        assertEq(renderer.renderSVG(3, dna, m), renderer.renderSVG(3, dna, m));
    }

    function test_differentDnaProducesDifferentArt() public view {
        IExampleHook.MarketState memory m = _emptyMarket();
        string memory a = renderer.renderSVG(3, keccak256("a"), m);
        string memory b = renderer.renderSVG(3, keccak256("b"), m);
        assertTrue(
            keccak256(bytes(a)) != keccak256(bytes(b)), "distinct DNA should render differently"
        );
    }

    function test_marketStateModulatesRender() public view {
        bytes32 dna = keccak256("same-dna");
        IExampleHook.MarketState memory calm = _emptyMarket();
        IExampleHook.MarketState memory stressed = _emptyMarket();
        stressed.drawdownBand = 5000;
        stressed.volatility = 30;
        stressed.swapCount = 9;
        stressed.epoch = 4;
        assertTrue(
            keccak256(bytes(renderer.renderSVG(3, dna, calm)))
                != keccak256(bytes(renderer.renderSVG(3, dna, stressed))),
            "market state should change the render even with identical DNA"
        );
    }

    function test_orbitersAreBoundedByMaxCap() public view {
        // Even an absurd swap count must not blow up: the renderer hard-caps orbiters.
        IExampleHook.MarketState memory m = _emptyMarket();
        m.swapCount = type(uint64).max;
        string memory svg = renderer.renderSVG(1, keccak256("cap"), m);
        assertTrue(_contains(svg, "</text>"), "renders footer despite huge swap count");
    }

    function test_runtimeSizeUnderEip170() public view {
        // The renderer is the size-critical contract in a real project. Pin it well under the
        // 24,576-byte EIP-170 runtime limit; see docs/16-renderer-size-budget.md.
        uint256 size = address(renderer).code.length;
        assertLt(size, 24_576, "renderer exceeds EIP-170 runtime limit");
    }

    // --- tiny string helpers ---

    function _startsWith(string memory s, string memory prefix) private pure returns (bool) {
        bytes memory sb = bytes(s);
        bytes memory pb = bytes(prefix);
        if (sb.length < pb.length) return false;
        for (uint256 i = 0; i < pb.length; ++i) {
            if (sb[i] != pb[i]) return false;
        }
        return true;
    }

    function _contains(string memory s, string memory needle) private pure returns (bool) {
        bytes memory sb = bytes(s);
        bytes memory nb = bytes(needle);
        if (nb.length == 0 || sb.length < nb.length) return false;
        for (uint256 i = 0; i <= sb.length - nb.length; ++i) {
            bool ok = true;
            for (uint256 j = 0; j < nb.length; ++j) {
                if (sb[i + j] != nb[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
