// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ArtDNA
/// @notice Pure helpers that slice a 32-byte immutable DNA word into named, bounded traits.
///
/// The whole point of an on-chain generative collection is that DNA is fixed at mint and the
/// *rendering* of it can still evolve as market state changes. This library only decodes the
/// FIXED part. Nothing here touches storage, so it is trivially deterministic and testable.
///
/// Layout (read from the low bytes up; each field masks its own bits):
///   byte 0      -> palette      (0..PALETTE_COUNT-1)
///   byte 1      -> sides        (3..8)   polygon sided-ness of the core sigil
///   byte 2      -> ringCount    (2..6)   concentric rings drawn around the core
///   byte 3      -> rotation     (0..359) base rotation in degrees
///   byte 4      -> coreScale    (28..60) core radius in SVG units
///   byte 5      -> jitter       (0..15)  per-vertex wobble amount
///   bytes 6..7  -> hueSeed      (0..65535) extra hue entropy
library ArtDNA {
    uint256 internal constant PALETTE_COUNT = 6;

    struct Traits {
        uint256 palette;
        uint256 sides;
        uint256 ringCount;
        uint256 rotation;
        uint256 coreScale;
        uint256 jitter;
        uint256 hueSeed;
    }

    function decode(bytes32 dna) internal pure returns (Traits memory t) {
        uint256 d = uint256(dna);
        t.palette = _byte(d, 0) % PALETTE_COUNT;
        t.sides = 3 + (_byte(d, 1) % 6); // 3..8
        t.ringCount = 2 + (_byte(d, 2) % 5); // 2..6
        t.rotation = (uint256(_byte(d, 3)) * 360) / 256; // 0..359
        t.coreScale = 28 + (_byte(d, 4) % 33); // 28..60
        t.jitter = _byte(d, 5) % 16; // 0..15
        t.hueSeed = (_byte(d, 6) << 8) | _byte(d, 7); // 0..65535
    }

    /// @notice A short, deterministic archetype name derived purely from DNA. Neutral,
    /// geometric vocabulary — this is a starter's placeholder identity, not any real art.
    function archetypeName(uint256 sides) internal pure returns (string memory) {
        if (sides <= 3) return "Trigon";
        if (sides == 4) return "Quadric";
        if (sides == 5) return "Pentode";
        if (sides == 6) return "Hexal";
        if (sides == 7) return "Septet";
        return "Octave";
    }

    function _byte(uint256 d, uint256 index) private pure returns (uint256) {
        return (d >> (index * 8)) & 0xff;
    }
}
