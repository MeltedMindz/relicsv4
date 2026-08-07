// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// External imports
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
// Internal imports
import {LiquidityPenaltyHook} from "../../general/LiquidityPenaltyHook.sol";
import {BaseHook} from "../../base/BaseHook.sol";

contract LiquidityPenaltyHookMock is LiquidityPenaltyHook {
    constructor(IPoolManager _poolManager, uint48 _blockNumberOffset)
        LiquidityPenaltyHook(_blockNumberOffset)
        BaseHook(_poolManager)
    {}

    // exclude from coverage report
    function test() public {}
}
