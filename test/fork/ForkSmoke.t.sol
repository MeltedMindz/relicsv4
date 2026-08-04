// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { Test } from "forge-std/Test.sol";

/// @title ForkSmoke
/// @notice A fork test that SKIPS CLEANLY when no RPC secret is present, so `forge test` and
/// the default CI job stay green without any credentials. Provide `MAINNET_RPC_URL` (and
/// optionally `POOL_MANAGER`) to actually fork and sanity-check a live deployment.
///
/// This is the pattern to follow for real fork tests of your own pool: read addresses and the
/// RPC from the environment, and no-op when they are unset. Never hardcode a secret RPC URL.
contract ForkSmokeTest is Test {
    function test_forkSanityOrSkip() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log("SKIP: MAINNET_RPC_URL unset (this is expected in default CI)");
            return;
        }
        vm.createSelectFork(rpc);
        assertGt(block.number, 0, "forked chain should have a positive block number");

        // Optional deeper check: if a PoolManager address is provided, assert it has code.
        address poolManager = vm.envOr("POOL_MANAGER", address(0));
        if (poolManager != address(0)) {
            assertGt(poolManager.code.length, 0, "POOL_MANAGER should be a deployed contract");
        }
    }
}
