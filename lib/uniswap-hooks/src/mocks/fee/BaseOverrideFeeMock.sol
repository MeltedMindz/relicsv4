// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// External imports
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
// Internal imports
import {BaseOverrideFee} from "../../fee/BaseOverrideFee.sol";
import {BaseHook} from "../../base/BaseHook.sol";

contract BaseOverrideFeeMock is BaseOverrideFee {
    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    uint24 private _fee;

    function _getFee(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        internal
        view
        override
        returns (uint24)
    {
        return _fee;
    }

    function setFee(uint24 fee_) public {
        _fee = fee_;
    }

    // Exclude from coverage report
    function test() public {}
}
