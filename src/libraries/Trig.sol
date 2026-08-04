// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title Trig
/// @notice Tiny fixed-point trig for on-chain SVG geometry. The EVM has no floats, so we
/// snap every angle to one of 24 directions (15-degree resolution) and read cos/sin from a
/// 7-entry first-quadrant table (scaled by 1000), reflected into the other three quadrants.
///
/// This is a deliberately simple, bytecode-cheap approach for a teaching renderer. It is
/// not high precision; 15-degree snapping is plenty for a stylized sigil.
library Trig {
    int256 internal constant SCALE = 1000;

    /// @notice cos(15 * k degrees) * 1000, for any integer direction index k.
    function cosDir(uint256 k) internal pure returns (int256) {
        k %= 24;
        if (k <= 6) return _cosQuadrant(k);
        if (k <= 12) return -_cosQuadrant(12 - k);
        if (k <= 18) return -_cosQuadrant(k - 12);
        return _cosQuadrant(24 - k);
    }

    /// @notice sin(theta) = cos(theta - 90 degrees); -90 degrees is -6 direction steps.
    function sinDir(uint256 k) internal pure returns (int256) {
        return cosDir(k + 18);
    }

    /// @notice Round an angle in degrees to the nearest 15-degree direction index (0..23).
    function dirFromDegrees(uint256 degrees) internal pure returns (uint256) {
        return ((degrees + 7) / 15) % 24;
    }

    /// @dev First-quadrant cosine table: cos(0,15,30,45,60,75,90) * 1000.
    function _cosQuadrant(uint256 i) private pure returns (int256) {
        if (i == 0) return 1000;
        if (i == 1) return 966;
        if (i == 2) return 866;
        if (i == 3) return 707;
        if (i == 4) return 500;
        if (i == 5) return 259;
        return 0; // i == 6 -> 90 degrees
    }
}
