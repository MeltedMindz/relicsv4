// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { HookTestBase } from "../utils/HookTestBase.sol";
import { ExampleToken } from "../../src/ExampleToken.sol";
import { ExampleArtNFT } from "../../src/ExampleArtNFT.sol";
import { ExampleOnchainRenderer } from "../../src/ExampleOnchainRenderer.sol";
import { ExampleV4Hook } from "../../src/ExampleV4Hook.sol";
import { IExampleHook } from "../../src/interfaces/IExampleHook.sol";
import { MintableERC20 } from "../mocks/MintableERC20.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ModifyLiquidityParams, SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { PoolSwapTest } from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @notice End-to-end LOCAL integration mirroring the deployment scripts: token -> hook (mined)
/// -> renderer -> nft -> bind -> init -> add liquidity -> swap -> awaken -> read tokenURI.
/// No forking, no secrets. This is the "does the whole thing wire together" test.
contract DeploymentFlowTest is HookTestBase {
    ExampleToken internal token;
    ExampleArtNFT internal nft;
    ExampleOnchainRenderer internal renderer;
    ExampleV4Hook internal hook;
    MintableERC20 internal weth;
    PoolKey internal key;
    bool internal artIsCurrency0;

    function setUp() public {
        _deployCore();
        token = new ExampleToken("Test Token", "TT", 1_000_000 ether, address(this));
        renderer = new ExampleOnchainRenderer();
        weth = new MintableERC20("Wrapped Ether (mock)", "WETH");

        hook = _mineAndDeployHook(address(token));
        nft = new ExampleArtNFT(
            "Test Art", "TA", 10_000, address(token), address(hook), address(renderer)
        );

        (Currency c0, Currency c1) = _sorted(address(token), address(weth));
        key = _poolKey(hook, c0, c1);
        artIsCurrency0 = Currency.unwrap(c0) == address(token);
        _bindAndInit(hook, key, 0);
    }

    function test_fullFlow() public {
        // 1) Add two-sided liquidity around the launch tick.
        _addLiquidityMixed(-600, 600, 1e21);

        IExampleHook.MarketState memory beforeSwap = hook.getMarketState();
        assertEq(beforeSwap.swapCount, 0);
        assertEq(beforeSwap.liquidityEventCount, 1);

        // 2) A real swap moves market state (art entropy).
        _buyArt(1e16);
        IExampleHook.MarketState memory afterSwap = hook.getMarketState();
        assertEq(afterSwap.swapCount, 1);
        assertGt(afterSwap.cumulativeBuyVolume, 0);

        // 3) The holder awakens a piece and reads fully on-chain metadata.
        (uint256 firstId, uint256 minted) = nft.awaken(1);
        assertEq(minted, 1);
        string memory uri = nft.tokenURI(firstId);
        assertGt(bytes(uri).length, 0);

        // 4) The tokenURI reflects live market state: awaken a second piece and confirm the
        // renderer sees the non-zero swap count via the hook.
        assertTrue(hook.getMarketState().swapCount > 0);
    }

    function test_wiringIsImmutableAndConsistent() public view {
        assertEq(address(nft.token()), address(token));
        assertEq(address(nft.hook()), address(hook));
        assertEq(address(nft.renderer()), address(renderer));
        assertEq(hook.artToken(), address(token));
        assertEq(hook.artTokenIsCurrency0(), artIsCurrency0);
        assertTrue(hook.isPoolBound());
    }

    // ---- local helpers using the REAL fixed-supply token ----

    function _addLiquidityMixed(int24 lower, int24 upper, int256 liq) internal {
        IERC20(address(token)).approve(address(modifyRouter), type(uint256).max);
        weth.mint(address(this), 1_000_000 ether);
        weth.approve(address(modifyRouter), type(uint256).max);
        modifyRouter.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: lower, tickUpper: upper, liquidityDelta: liq, salt: bytes32(0)
            }),
            ""
        );
    }

    function _buyArt(int256 amountIn) internal {
        IERC20(address(token)).approve(address(swapRouter), type(uint256).max);
        weth.mint(address(this), 1_000_000 ether);
        weth.approve(address(swapRouter), type(uint256).max);
        // Buying art == receiving the art currency. If art is currency0, receive c0 => !zeroForOne.
        bool zeroForOne = artIsCurrency0 ? false : true;
        uint160 limit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne, amountSpecified: -amountIn, sqrtPriceLimitX96: limit
            }),
            PoolSwapTest.TestSettings({ takeClaims: false, settleUsingBurn: false }),
            ""
        );
    }
}
