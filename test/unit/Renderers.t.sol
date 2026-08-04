// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { IExampleRenderer } from "../../src/interfaces/IExampleRenderer.sol";
import { IExampleHook } from "../../src/interfaces/IExampleHook.sol";
import { ExampleOnchainRenderer } from "../../src/ExampleOnchainRenderer.sol";
import { StrataRenderer } from "../../src/StrataRenderer.sol";
import { OrbitalRenderer } from "../../src/OrbitalRenderer.sol";

/// @dev Coverage across all three shipped sample renderers via the shared interface, so a forker
/// can trust the "swap the renderer" seam. Each must be under EIP-170, deterministic, valid SVG,
/// and responsive to market state.
contract RenderersTest is Test {
    IExampleRenderer[3] internal renderers;
    string[3] internal names = ["Sigil", "Strata", "Orbital"];

    function setUp() public {
        renderers[0] = new ExampleOnchainRenderer();
        renderers[1] = new StrataRenderer();
        renderers[2] = new OrbitalRenderer();
    }

    function _calm() internal pure returns (IExampleHook.MarketState memory m) { }

    function _busy() internal pure returns (IExampleHook.MarketState memory m) {
        m.swapCount = 40;
        m.epoch = 9;
        m.drawdownBand = 6000;
        m.recoveryBand = 3000;
        m.volatility = 55;
        m.holderCount = 30;
        m.cumulativeBuyVolume = 5 ether;
        m.cumulativeSellVolume = 2 ether;
    }

    function test_allRenderersUnderEip170() public view {
        for (uint256 i = 0; i < 3; ++i) {
            assertLt(address(renderers[i]).code.length, 24_576, names[i]);
        }
    }

    function test_allRenderersProduceValidSvgAndJson() public view {
        for (uint256 i = 0; i < 3; ++i) {
            string memory svg = renderers[i].renderSVG(1, keccak256("dna"), _busy());
            assertTrue(_contains(svg, "<svg"), names[i]);
            assertTrue(_contains(svg, "<rect"), names[i]);
            string memory uri = renderers[i].tokenURI(1, keccak256("dna"), _busy());
            assertTrue(_startsWith(uri, "data:application/json;base64,"), names[i]);
        }
    }

    function test_allRenderersDeterministic() public view {
        for (uint256 i = 0; i < 3; ++i) {
            bytes32 dna = keccak256(abi.encode("det", i));
            assertEq(
                keccak256(bytes(renderers[i].renderSVG(3, dna, _busy()))),
                keccak256(bytes(renderers[i].renderSVG(3, dna, _busy()))),
                names[i]
            );
        }
    }

    function test_allRenderersRespondToMarketState() public view {
        for (uint256 i = 0; i < 3; ++i) {
            bytes32 dna = keccak256(abi.encode("resp", i));
            assertTrue(
                keccak256(bytes(renderers[i].renderSVG(3, dna, _calm())))
                    != keccak256(bytes(renderers[i].renderSVG(3, dna, _busy()))),
                names[i]
            );
        }
    }

    function test_orbitalRespondsToHolderCount() public view {
        OrbitalRenderer orbital = OrbitalRenderer(address(renderers[2]));
        IExampleHook.MarketState memory a = _busy();
        IExampleHook.MarketState memory b = _busy();
        b.holderCount = 1; // fewer holders => smaller nucleus
        assertTrue(
            keccak256(bytes(orbital.renderSVG(1, keccak256("h"), a)))
                != keccak256(bytes(orbital.renderSVG(1, keccak256("h"), b))),
            "holder growth should change Orbital art"
        );
    }

    // --- helpers ---
    function _startsWith(string memory s, string memory p) private pure returns (bool) {
        bytes memory sb = bytes(s);
        bytes memory pb = bytes(p);
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
