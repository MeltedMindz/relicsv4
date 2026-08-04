// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PositionInfo } from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

/// @title MockPositionManager
/// @notice A DELIBERATELY MINIMAL stand-in for the Uniswap v4 PositionManager, implementing
/// ONLY the surface {ImmutablePositionLocker} touches. It lets the locker tests run fast and
/// deterministically without deploying Permit2 + a full PositionManager.
///
/// It faithfully models the one property that matters for the locker: a fee "poke"
/// (DECREASE_LIQUIDITY with liquidity = 0) leaves PRINCIPAL untouched and routes the two
/// TAKEs DIRECTLY to the recipients named in the action params. The locker's own balance is
/// never involved — exactly as on mainnet. The real integration is covered by the fork test.
contract MockPositionManager {
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => uint128) private _liquidity;
    mapping(uint256 => PoolKey) private _poolKey;

    // Fees the next collect will route directly to the recipients named in the payload.
    uint256 public pendingFee0;
    uint256 public pendingFee1;

    /// @notice Create a position `id` owned by `to`, in pool `key`, with `liquidity`.
    function mintPosition(uint256 id, address to, PoolKey memory key, uint128 liquidity) external {
        require(ownerOf[id] == address(0), "exists");
        ownerOf[id] = to;
        balanceOf[to] += 1;
        _liquidity[id] = liquidity;
        _poolKey[id] = key;
    }

    /// @notice Preload the fees the next {modifyLiquidities} call will pay out. The mock must
    /// already hold enough of both currencies to pay them (fund it in the test).
    function setPendingFees(uint256 fee0, uint256 fee1) external {
        pendingFee0 = fee0;
        pendingFee1 = fee1;
    }

    function getPositionLiquidity(uint256 id) external view returns (uint128) {
        return _liquidity[id];
    }

    function getPoolAndPositionInfo(uint256 id)
        external
        view
        returns (PoolKey memory, PositionInfo)
    {
        return (_poolKey[id], PositionInfo.wrap(0));
    }

    /// @notice ERC-721 safe transfer used to deliver the position NFT into custody.
    function safeTransferFrom(address from, address to, uint256 id) external {
        require(ownerOf[id] == from, "not owner");
        ownerOf[id] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
        if (to.code.length > 0) {
            require(
                IERC721Receiver(to).onERC721Received(msg.sender, from, id, "")
                    == IERC721Receiver.onERC721Received.selector,
                "bad receiver"
            );
        }
    }

    /// @notice Decodes the locker's action payload and routes the preloaded fees DIRECTLY to
    /// the recipients named in the two TAKE params — never to the caller (the locker).
    function modifyLiquidities(bytes calldata unlockData, uint256) external {
        (, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        // params[1] = (currency0, recipient0, amount); params[2] = (currency1, recipient1, amount)
        (Currency c0, address r0,) = abi.decode(params[1], (Currency, address, uint256));
        (Currency c1, address r1,) = abi.decode(params[2], (Currency, address, uint256));
        uint256 f0 = pendingFee0;
        uint256 f1 = pendingFee1;
        pendingFee0 = 0;
        pendingFee1 = 0;
        if (f0 > 0) IERC20(Currency.unwrap(c0)).transfer(r0, f0);
        if (f1 > 0) IERC20(Currency.unwrap(c1)).transfer(r1, f1);
        // NOTE: `_liquidity[id]` is intentionally NOT changed — a zero-liquidity decrease only
        // realizes fees; principal is preserved, which the locker asserts as an invariant.
    }
}
