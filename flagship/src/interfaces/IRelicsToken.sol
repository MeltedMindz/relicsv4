// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IRelicsToken {
    event HolderThresholdCrossed(address indexed account, bool active, uint256 balance);
    event RelicSyncConfigured(address indexed relicsNFT);
    event RelicSyncPoolSet(address indexed pool);
    event RelicLockerSet(address indexed locker);

    function HOLDER_THRESHOLD() external view returns (uint256);
    function UNIT_PER_RELIC() external view returns (uint256);
    function ENTOMBMENT_ADDRESS() external view returns (address);
    function relicsNFT() external view returns (address);
    function relicSyncPool() external view returns (address);
    function relicLocker() external view returns (address);
    function activeHolderCount() external view returns (uint256);
    function isActiveHolder(address account) external view returns (bool);
    /// @notice The whole-unit backing line. Cannot revert.
    function relicEntitlement(address account) external view returns (uint256);
    function canReceiveRelic(address account) external view returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function transferRelicToken(address from, address to) external;
}
