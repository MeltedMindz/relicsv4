// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IExampleToken
/// @notice Minimal surface the art layer reads from the fixed-supply ERC-20.
interface IExampleToken is IERC20 {
    /// @notice Number of addresses holding at least `HOLDER_THRESHOLD`. Art entropy only.
    function activeHolderCount() external view returns (uint256);

    /// @notice True if `account` currently holds at least `HOLDER_THRESHOLD`.
    function isActiveHolder(address account) external view returns (bool);
}
