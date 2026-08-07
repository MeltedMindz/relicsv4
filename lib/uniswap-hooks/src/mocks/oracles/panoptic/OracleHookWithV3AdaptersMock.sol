// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// External imports
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
// Internal imports
import {OracleHookWithV3Adapters} from "../../../oracles/panoptic/OracleHookWithV3Adapters.sol";
import {BaseHook} from "../../../base/BaseHook.sol";

contract OracleHookWithV3AdaptersMock is OracleHookWithV3Adapters {
    constructor(IPoolManager _poolManager, int24 _maxAbsTickDelta)
        OracleHookWithV3Adapters(_maxAbsTickDelta)
        BaseHook(_poolManager)
    {}

    // exclude from coverage report
    function test() public {}
}
