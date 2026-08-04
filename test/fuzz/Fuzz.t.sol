// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";
import { ArtDNA } from "../../src/libraries/ArtDNA.sol";
import { Trig } from "../../src/libraries/Trig.sol";
import { ExampleOnchainRenderer } from "../../src/ExampleOnchainRenderer.sol";
import { ExampleToken } from "../../src/ExampleToken.sol";
import { IExampleHook } from "../../src/interfaces/IExampleHook.sol";

contract FuzzTest is Test {
    using ArtDNA for bytes32;

    ExampleOnchainRenderer internal renderer;
    ExampleToken internal token;
    address internal deployer = address(this);

    function setUp() public {
        renderer = new ExampleOnchainRenderer();
        token = new ExampleToken(deployer);
    }

    /// @dev DNA decoding must ALWAYS yield in-range traits, for any 32 bytes.
    function testFuzz_dnaTraitsAlwaysInRange(bytes32 dna) public pure {
        ArtDNA.Traits memory t = dna.decode();
        assertLt(t.palette, ArtDNA.PALETTE_COUNT);
        assertTrue(t.sides >= 3 && t.sides <= 8);
        assertTrue(t.ringCount >= 2 && t.ringCount <= 6);
        assertLt(t.rotation, 360);
        assertTrue(t.coreScale >= 28 && t.coreScale <= 60);
        assertLt(t.jitter, 16);
    }

    /// @dev Trig outputs are always within the [-1000, 1000] scaled circle.
    function testFuzz_trigBounded(uint256 deg) public pure {
        uint256 dir = Trig.dirFromDegrees(deg % 3600);
        int256 c = Trig.cosDir(dir);
        int256 s = Trig.sinDir(dir);
        assertTrue(c >= -1000 && c <= 1000);
        assertTrue(s >= -1000 && s <= 1000);
    }

    /// @dev The renderer is a pure function of its inputs: same inputs, identical bytes.
    function testFuzz_renderDeterministic(
        uint256 id,
        bytes32 dna,
        uint32 drawdown,
        uint64 swaps
    )
        public
        view
    {
        IExampleHook.GlobalMarketState memory m;
        m.drawdownBand = drawdown;
        m.swapCount = swaps;
        string memory a = renderer.renderSVG(id, dna, m);
        string memory b = renderer.renderSVG(id, dna, m);
        assertEq(keccak256(bytes(a)), keccak256(bytes(b)));
    }

    /// @dev Total supply is conserved across any single transfer, and the active flag is
    /// consistent with the post-transfer balance.
    function testFuzz_transferConservesSupplyAndFlag(address to, uint256 amount) public {
        vm.assume(to != address(0) && to != deployer);
        amount = bound(amount, 0, token.balanceOf(deployer));
        token.transfer(to, amount);
        assertEq(token.totalSupply(), token.FIXED_SUPPLY());
        assertEq(token.isActiveHolder(to), token.balanceOf(to) >= token.HOLDER_THRESHOLD());
    }
}
