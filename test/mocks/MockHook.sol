// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IExampleHook } from "../../src/interfaces/IExampleHook.sol";

/// @dev A settable IExampleHook stand-in so NFT/renderer tests do not need a CREATE2-mined,
/// PoolManager-bound real hook. The real hook is exercised in ExampleV4Hook.t.sol.
contract MockHook is IExampleHook {
    MarketState internal _state;

    function setState(MarketState calldata s) external {
        _state = s;
    }

    function getMarketState() external view returns (MarketState memory) {
        return _state;
    }

    function canonicalPoolId() external pure returns (bytes32) {
        return bytes32(0);
    }

    function isPoolBound() external pure returns (bool) {
        return true;
    }

    function expectedSqrtPriceX96() external pure returns (uint160) {
        return 0;
    }

    function expectedInitialTick() external pure returns (int24) {
        return 0;
    }
}
