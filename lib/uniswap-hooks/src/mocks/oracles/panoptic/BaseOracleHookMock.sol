// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// External imports
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
// Internal imports
import {BaseOracleHook} from "../../../oracles/panoptic/BaseOracleHook.sol";
import {BaseHook} from "../../../base/BaseHook.sol";

contract BaseOracleHookMock is BaseOracleHook {
    constructor(IPoolManager _poolManager, int24 _maxAbsTickDelta)
        BaseOracleHook(_maxAbsTickDelta)
        BaseHook(_poolManager)
    {}

    // exclude from coverage report
    function test() public {}
}
