// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library SVG {
    function u(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            ++digits;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            buffer[--digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function i(int256 value) internal pure returns (string memory) {
        if (value >= 0) return u(uint256(value));
        return string.concat("-", u(uint256(-value)));
    }

    function attr(string memory key, string memory value) internal pure returns (string memory) {
        return string.concat(" ", key, "=\"", value, "\"");
    }

    function tag(string memory name, string memory attrs) internal pure returns (string memory) {
        return string.concat("<", name, attrs, "/>");
    }

    function rect(
        uint256 x,
        uint256 y,
        uint256 width,
        uint256 height,
        string memory fill,
        string memory extra
    )
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            "<rect x=\"",
            u(x),
            "\" y=\"",
            u(y),
            "\" width=\"",
            u(width),
            "\" height=\"",
            u(height),
            "\" fill=\"",
            fill,
            "\"",
            extra,
            "/>"
        );
    }

    function circle(
        uint256 cx,
        uint256 cy,
        uint256 r,
        string memory fill,
        string memory extra
    )
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            "<circle cx=\"",
            u(cx),
            "\" cy=\"",
            u(cy),
            "\" r=\"",
            u(r),
            "\" fill=\"",
            fill,
            "\"",
            extra,
            "/>"
        );
    }

    function line(
        uint256 x1,
        uint256 y1,
        uint256 x2,
        uint256 y2,
        string memory stroke,
        uint256 width,
        string memory extra
    )
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            "<line x1=\"",
            u(x1),
            "\" y1=\"",
            u(y1),
            "\" x2=\"",
            u(x2),
            "\" y2=\"",
            u(y2),
            "\" stroke=\"",
            stroke,
            "\" stroke-width=\"",
            u(width),
            "\"",
            extra,
            "/>"
        );
    }

    function jsonEscape(string memory value) internal pure returns (string memory) {
        bytes memory input = bytes(value);
        bytes memory output = new bytes(input.length * 2);
        uint256 j;
        for (uint256 i_; i_ < input.length; ++i_) {
            bytes1 char = input[i_];
            if (char == '"' || char == "\\") {
                output[j++] = "\\";
            }
            output[j++] = char;
        }
        bytes memory trimmed = new bytes(j);
        for (uint256 k; k < j; ++k) {
            trimmed[k] = output[k];
        }
        return string(trimmed);
    }
}
