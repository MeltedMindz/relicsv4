// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { DeployConfig } from "./config/DeployConfig.s.sol";
import { console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import { Actions } from "@uniswap/v4-periphery/src/libraries/Actions.sol";

/// @dev Minimal Permit2 approval surface used by this script (declared inline to avoid extra
/// remappings). The v4 PositionManager pulls tokens via Permit2, so you must approve twice:
/// ERC20 -> Permit2, then Permit2 -> PositionManager.
interface IPermit2Approve {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/// @notice Add a SINGLE-SIDED liquidity position: the whole art-token supply from the launch
/// tick up to the max usable tick, with ZERO quote (WETH) seeded. The pool then opens with the
/// art token as executable ask liquidity and no bid depth until a real buyer arrives.
///
/// This is a TEMPLATE. Read docs/08-genesis-liquidity.md and docs/14-deploy-and-pool.md, and
/// ALWAYS read the resulting PositionManager token id from the confirmed receipt / on-chain
/// ownership — NEVER predict it from simulation. See docs/11-position-manager-token-id.md.
///
///   POSITION_MANAGER=0x... PERMIT2=0x... ART_TOKEN=0x... WETH=0x... \
///   LP_RECIPIENT=0x... LAUNCH_TICK=-23040 LIQUIDITY=1000000000000000000000 \
///     forge script script/AddLiquidity.s.sol --tc AddLiquidity \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract AddLiquidity is DeployConfig {
    function run() external {
        IPositionManager positionManager = IPositionManager(_positionManager());
        address permit2 = vm.envAddress("PERMIT2");
        address artToken = vm.envAddress("ART_TOKEN");
        address weth = _weth();
        address recipient = vm.envAddress("LP_RECIPIENT");
        uint24 fee = _poolFee();
        int24 tickSpacing = _tickSpacing();
        int24 launchTick = _launchTick();
        uint256 liquidity = _liquidity();
        require(launchTick % tickSpacing == 0, "LAUNCH_TICK misaligned");

        bool artIsCurrency0 = artToken < weth;
        (Currency c0, Currency c1) = artIsCurrency0
            ? (Currency.wrap(artToken), Currency.wrap(weth))
            : (Currency.wrap(weth), Currency.wrap(artToken));

        PoolKey memory key = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(vm.envAddress("HOOK"))
        });

        // Single-sided range. If the art token is currency0, the active range is
        // [launchTick, maxUsableTick); if currency1, it is (minUsableTick, launchTick]. Here we
        // show the currency0 case; mirror it for currency1 (see docs/12).
        int24 maxTick = (TickMath.MAX_TICK / tickSpacing) * tickSpacing;
        int24 minTick = (TickMath.MIN_TICK / tickSpacing) * tickSpacing;
        (int24 tickLower, int24 tickUpper) =
            artIsCurrency0 ? (launchTick, maxTick) : (minTick, launchTick);

        vm.startBroadcast();
        // Approve both tokens through Permit2 (the art side supplies the tokens; the quote side
        // needs no balance for a single-sided mint, but approving both keeps the script general).
        _approve(artToken, permit2, address(positionManager));
        _approve(weth, permit2, address(positionManager));

        bytes memory actions = abi.encodePacked(
            bytes1(uint8(Actions.MINT_POSITION)), bytes1(uint8(Actions.SETTLE_PAIR))
        );
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key,
            tickLower,
            tickUpper,
            liquidity,
            type(uint128).max, // amount0Max
            type(uint128).max, // amount1Max
            recipient,
            bytes("")
        );
        params[1] = abi.encode(c0, c1);
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp + 300);
        vm.stopBroadcast();

        _logHeader("Single-sided liquidity minted");
        console2.log("tickLower:", int256(tickLower));
        console2.log("tickUpper:", int256(tickUpper));
        console2.log("liquidity:", liquidity);
        console2.log("READ the new position id from the tx receipt / PositionManager ownership.");
    }

    function _approve(address token, address permit2, address spender) private {
        IERC20(token).approve(permit2, type(uint256).max);
        IPermit2Approve(permit2).approve(token, spender, type(uint160).max, type(uint48).max);
    }
}
