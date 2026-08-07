// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Base64 as OZBase64 } from "@openzeppelin/contracts/utils/Base64.sol";

library Base64 {
    function encode(bytes memory data) internal pure returns (string memory) {
        return OZBase64.encode(data);
    }
}
