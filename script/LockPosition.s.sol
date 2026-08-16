// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ChainConfig } from "./ChainConfig.s.sol";
import { console2 } from "forge-std/Script.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { ImmutablePositionLocker } from "../src/ImmutablePositionLocker.sol";

/// @dev The PositionManager is an ERC-721; this is the read/transfer surface this script needs.
interface IPositionNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/// @notice Deploy the immutable locker and hand the genesis position NFT into permanent
/// custody. After this, principal is locked forever but fees remain permissionlessly
/// collectable and route directly to the immutable recipients.
///
/// CRITICAL: use the REAL position id read from the mint receipt / ownership — never a
/// simulated guess (docs/11). The locker's constructor re-verifies the id, its pool currencies
/// and its nonzero liquidity on chain before you transfer, so a wrong id cannot be locked.
///
///   POSITION_MANAGER=0x... ART_TOKEN=0x... WETH=0x... TREASURY=0x... \
///   ENTOMBMENT=0x000000000000000000000000000000000000dEaD POSITION_ID=... \
///     forge script script/LockPosition.s.sol --tc LockPosition \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract LockPosition is ChainConfig {
    function run() external {
        address positionManager = _positionManager();
        address artToken = vm.envAddress("ART_TOKEN");
        address weth = _weth();
        address treasury = _treasury();
        address entombment = vm.envAddress("ENTOMBMENT");
        uint256 positionId = vm.envUint("POSITION_ID");

        // Recipients are ordered to match the pool's (currency0, currency1). If the art token is
        // currency0, its fees go to `entombment` and the quote fees go to `treasury`.
        bool artIsCurrency0 = artToken < weth;
        (address currency0, address currency1) =
            artIsCurrency0 ? (artToken, weth) : (weth, artToken);
        (address recipient0, address recipient1) =
            artIsCurrency0 ? (entombment, treasury) : (treasury, entombment);

        vm.startBroadcast();
        ImmutablePositionLocker locker = new ImmutablePositionLocker(
            positionManager, currency0, currency1, recipient0, recipient1, positionId
        );
        IPositionNFT(positionManager).safeTransferFrom(msg.sender, address(locker), positionId);
        vm.stopBroadcast();

        require(locker.positionSecured(), "position not secured");
        require(
            IPositionNFT(positionManager).ownerOf(positionId) == address(locker), "custody failed"
        );

        _logHeader(
            "Genesis position locked (no withdrawal path; fees to construction-fixed recipients)"
        );
        console2.log("locker:", address(locker));
        console2.log("recipient0 (currency0 fees):", recipient0);
        console2.log("recipient1 (currency1 fees):", recipient1);
        console2.logBytes32(locker.feePolicyHash());
    }
}
