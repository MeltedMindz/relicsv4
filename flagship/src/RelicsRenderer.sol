// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IRelicsRenderer } from "./interfaces/IRelicsRenderer.sol";
import { IRelicsToken } from "./interfaces/IRelicsToken.sol";
import { IRelicsHook } from "./interfaces/IRelicsHook.sol";
import { Base64 } from "./libraries/Base64.sol";
import { DNA } from "./libraries/DNA.sol";
import { EvolutionMath } from "./libraries/EvolutionMath.sol";
import { PaletteLib } from "./libraries/PaletteLib.sol";
import { SVG } from "./libraries/SVG.sol";

contract RelicsRenderer is IRelicsRenderer {
    error ZeroAddress();

    IRelicsToken public immutable relicsToken;
    IRelicsHook public immutable marketHook;

    struct R {
        IRelicsHook.GlobalMarketState m;
        PaletteLib.Palette p;
        uint256 holders;
        uint256 seed;
        uint256 mut;
        uint256 scar;
        uint256 rec;
        uint256 scale;
        uint8 species;
        uint8 arch;
        uint8 geom;
        uint8 glyph;
        uint8 energy;
        uint8 civ;
        uint8 hTier;
        uint8 lTier;
        uint8 vTier;
        uint8 hist;
        uint8 density;
    }

    constructor(address relicsToken_, address marketHook_) {
        if (relicsToken_ == address(0) || marketHook_ == address(0)) revert ZeroAddress();
        relicsToken = IRelicsToken(relicsToken_);
        marketHook = IRelicsHook(marketHook_);
    }

    function tokenURI(
        uint256 tokenId,
        uint256 dna,
        uint256 state
    )
        external
        view
        returns (string memory)
    {
        return string.concat(
            "data:application/json;base64,", Base64.encode(bytes(_json(tokenId, dna, state)))
        );
    }

    function _json(
        uint256 tokenId,
        uint256 dna,
        uint256 state
    )
        private
        view
        returns (string memory)
    {
        R memory r = _r(dna, state);
        string memory image = string.concat(
            "data:image/svg+xml;base64,", Base64.encode(bytes(_svgR(tokenId, dna, state, r)))
        );
        return string.concat(
            "{\"name\":\"Relic #",
            SVG.u(tokenId),
            "\",\"description\":\"On-chain relic forged by market history.\",\"image\":\"",
            image,
            "\",\"attributes\":",
            _attrs(state, r),
            "}"
        );
    }

    function _attrs(uint256 state, R memory r) private pure returns (string memory) {
        return string.concat("[", _identity(r), ",", _history(state, r), "]");
    }

    function _r(uint256 dna, uint256 state) private view returns (R memory r) {
        r.m = marketHook.getGlobalState();
        r.holders = relicsToken.activeHolderCount();
        r.hTier = EvolutionMath.holderTier(r.holders);
        r.lTier = EvolutionMath.liquidityTier(r.m.cumulativeLiquidityMagnitude);
        r.vTier = EvolutionMath.volumeTier(r.m.cumulativeBuyVolume, r.m.cumulativeSellVolume);
        r.species = DNA.species(dna);
        r.arch = _arch(r.species);
        r.geom = DNA.geometry(dna);
        r.glyph = uint8((DNA.biome(dna) + r.geom + (uint256(DNA.entropy(dna)) & 7)) % 8);
        r.energy = DNA.energy(dna);
        r.civ = DNA.palette(dna) % 6;
        r.seed = uint256(keccak256(abi.encode(dna, state, r.m.marketSeed, r.holders)));
        r.mut = EvolutionMath.mutationIntensity(dna, state, r.m, r.holders);
        r.scar = EvolutionMath.scarIntensity(dna, state, r.m);
        r.rec = EvolutionMath.recoveryIntensity(state, r.m);
        r.hist = EvolutionMath.historicalRarity(dna, state, r.m, r.holders);
        r.density = uint8(1 + ((r.seed >> 17) % 5) + r.vTier + r.m.stress / 34);
        if (r.density > 9) r.density = 9;
        r.scale = 230 + uint256(r.energy) * 9 + r.mut / 4 + r.lTier * 7;
        r.p = PaletteLib.palette(dna, r.m.epoch, r.m.stress, r.m.drawdownBand, r.hTier, r.lTier);
    }

    function _identity(R memory r) private pure returns (string memory) {
        return string.concat(
            _a("Species", string.concat("Lineage ", SVG.u(r.species))),
            ",",
            _a("Archetype", _archName(r.arch)),
            ",",
            _a("Geometry Class", _geomName(r.geom)),
            ",",
            _a("Glyph Family", string.concat("Rune ", SVG.u(r.glyph))),
            ",",
            _n("Civilization", r.civ),
            ",",
            _a("Energy Signature", _energyName(r.energy))
        );
    }

    function _history(uint256 state, R memory r) private pure returns (string memory) {
        return string.concat(
            _a("Corruption State", _corruptName(r.m.drawdownBand, r.m.stress)),
            ",",
            _a("Historical Tier", _tierName(r.hist)),
            ",",
            _a("Liquidity Exposure", _exposure(r.lTier)),
            ",",
            _a("Volatility Exposure", _volName(r.m.volatility)),
            ",",
            _a("Scar Severity", _scarName(r.scar)),
            ",",
            _a("Recovery State", _recoveryName(r.rec)),
            ",",
            _n("Resonance", EvolutionMath.resonance(state))
        );
    }

    function _svgR(
        uint256 tokenId,
        uint256 dna,
        uint256 state,
        R memory r
    )
        private
        pure
        returns (string memory)
    {
        return string.concat(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1000 1000\">",
            _stage(r),
            _artifact(tokenId, dna, state, r),
            _weather(dna, state, r),
            "</svg>"
        );
    }

    function _stage(R memory r) private pure returns (string memory out) {
        out = string.concat(
            SVG.rect(0, 0, 1000, 1000, r.p.background, ""),
            "<ellipse cx=\"500\" cy=\"540\" rx=\"",
            SVG.u(210 + r.scale / 2),
            "\" ry=\"",
            SVG.u(250 + r.scale / 4),
            "\" fill=\"",
            r.p.glow,
            "\" opacity=\"0.08\"/>",
            "<ellipse cx=\"500\" cy=\"835\" rx=\"270\" ry=\"38\" fill=\"#000\" opacity=\"0.38\"/>"
        );
    }

    function _artifact(
        uint256 tokenId,
        uint256 dna,
        uint256 state,
        R memory r
    )
        private
        pure
        returns (string memory)
    {
        if (r.arch == 0) return _void(tokenId, state, r);
        if (r.arch == 1) return _mech(dna, r);
        if (r.arch == 2) return _crystal(dna, r);
        if (r.arch == 3) return _neural(dna, r);
        if (r.arch == 4) return _ancient(dna, state, r);
        return _energy(dna, r);
    }

    function _void(
        uint256 tokenId,
        uint256 state,
        R memory r
    )
        private
        pure
        returns (string memory out)
    {
        uint256 cx = 473 + ((r.seed >> 6) & 55);
        uint256 cy = 481 + ((r.seed >> 13) & 49);
        out = string.concat(
            "<circle cx=\"",
            SVG.u(cx),
            "\" cy=\"",
            SVG.u(cy),
            "\" r=\"",
            SVG.u(r.scale / 2),
            "\" fill=\"#010103\" stroke=\"",
            r.p.glow,
            "\" stroke-width=\"4\" opacity=\"0.96\"/>",
            "<path d=\"M",
            SVG.u(cx),
            " ",
            SVG.u(cy - (r.scale / 2 + 60)),
            " L",
            SVG.u(cx + r.scale / 3),
            " ",
            SVG.u(cy),
            " L",
            SVG.u(cx),
            " ",
            SVG.u(cy + r.scale / 2 + 70),
            " L",
            SVG.u(cx - r.scale / 3),
            " ",
            SVG.u(cy),
            " Z\" fill=\"",
            r.p.primary,
            "\" opacity=\"0.28\"/>"
        );
        uint256 shards = 6 + r.m.drawdownBand * 2 + r.density / 2;
        for (uint256 i; i < shards; ++i) {
            uint256 x = cx + ((r.seed >> (i * 9)) & 420) - 210;
            uint256 y = cy + ((r.seed >> (i * 7)) & 430) - 215;
            out = string.concat(out, _shard(x, y, 28 + (r.seed >> (i * 5)) % 96, i, r));
        }
        if ((tokenId + state) % 2 == 0) {
            out = string.concat(out, _slash(int256(cx) - 250, int256(cy) + 150, 540, r));
        }
    }

    function _mech(uint256 dna, R memory r) private pure returns (string memory out) {
        uint256 w = 235 + r.scale / 3 + ((r.seed >> 3) & 63);
        uint256 h = 360 + r.scale / 4 + ((r.seed >> 8) & 63);
        uint256 l = 500 - w / 2;
        uint256 t = 500 - h / 2;
        out = string.concat(
            _poly(
                string.concat(
                    "500,",
                    SVG.u(t - 55),
                    " ",
                    SVG.u(l + w),
                    ",",
                    SVG.u(t + 78),
                    " ",
                    SVG.u(l + w - 42),
                    ",",
                    SVG.u(t + h),
                    " 500,",
                    SVG.u(t + h + 72),
                    " ",
                    SVG.u(l + 42),
                    ",",
                    SVG.u(t + h),
                    " ",
                    SVG.u(l),
                    ",",
                    SVG.u(t + 78)
                ),
                r.p.primary,
                r.p.glow,
                "0.76"
            ),
            SVG.rect(l + w / 4, t + 40, w / 2, h - 80, r.p.background, " opacity=\"0.62\"")
        );
        uint256 ribs = 5 + r.vTier + r.density / 3;
        for (uint256 i; i < ribs; ++i) {
            uint256 x = l + 28 + i * ((w - 56) / ribs);
            out = string.concat(
                out,
                SVG.line(x, t + 15, x, t + h - 15, r.p.glow, 2, " opacity=\"0.36\""),
                SVG.circle(
                    x,
                    t + 60 + ((r.seed >> (i * 8)) & (h - 120)),
                    6 + i % 3,
                    r.p.accent,
                    " opacity=\"0.75\""
                )
            );
        }
        if (DNA.geometry(dna) % 2 == 0) out = string.concat(out, _halo(w / 2 + 120, r));
    }

    function _crystal(uint256 dna, R memory r) private pure returns (string memory out) {
        uint256 arms = 6 + (r.geom % 5) + r.lTier;
        uint256 outer = r.scale + 66 + ((r.seed >> 3) & 31);
        out = string.concat(
            _poly(_radial(arms, outer, outer / 2, r.seed, true), r.p.primary, r.p.glow, "0.84"),
            _poly(
                _radial(arms, outer / 2, outer / 5, r.seed >> 4, false),
                r.p.background,
                r.p.accent,
                "0.62"
            )
        );
        for (uint256 i; i < arms; ++i) {
            (uint256 x, uint256 y) = _point(i * (360 / arms), outer + 26 + (r.seed >> (i * 5)) % 34);
            out = string.concat(out, SVG.line(500, 500, x, y, r.p.glow, 2, " opacity=\"0.44\""));
        }
        if (dna % 3 == 0) {
            out = string.concat(
                out, SVG.circle(500, 500, 38 + r.mut / 14, r.p.glow, " opacity=\"0.66\"")
            );
        }
    }

    function _neural(uint256 dna, R memory r) private pure returns (string memory out) {
        uint256 rootX = 500 + ((r.seed >> 6) & 49) - 24;
        uint256 rootY = 555 + ((r.seed >> 12) & 47);
        uint256 hw = r.scale / 2 + ((r.seed >> 21) & 31);
        out = _poly(
            string.concat(
                SVG.u(rootX),
                ",240 ",
                SVG.u(rootX + hw),
                ",650 ",
                SVG.u(rootX),
                ",790 ",
                SVG.u(rootX - hw),
                ",650"
            ),
            r.p.primary,
            r.p.glow,
            "0.4"
        );
        uint256 branches = 5 + r.hTier + r.density / 4;
        for (uint256 i; i < branches; ++i) {
            int256 dx = int256((r.seed >> (i * 9)) & 500) - 250;
            int256 dy = int256((r.seed >> (i * 7)) & 460) - 230;
            uint256 x2 = _coord(int256(rootX) + dx);
            uint256 y2 = _coord(int256(rootY) + dy);
            uint256 mx = _coord((int256(rootX) + int256(x2)) / 2 + int256((i % 3) * 28) - 28);
            uint256 my = _coord((int256(rootY) + int256(y2)) / 2 + int256((i % 2) * 36) - 18);
            out = string.concat(
                out,
                _curve(
                    rootX, rootY, mx, my, x2, y2, i % 2 == 0 ? r.p.glow : r.p.secondary, 4 + r.hTier
                )
            );
        }
        out = string.concat(
            out,
            SVG.circle(
                rootX,
                rootY,
                120 + r.hTier * 5 + ((r.seed >> 33) & 15),
                r.p.primary,
                " opacity=\"0.92\""
            )
        );
        if (DNA.biome(dna) % 2 == 1) {
            out = string.concat(out, _slash(int256(rootX - 160), int256(rootY + 60), 350, r));
        }
    }

    function _ancient(
        uint256 dna,
        uint256 state,
        R memory r
    )
        private
        pure
        returns (string memory out)
    {
        uint256 stones = 4 + (r.seed & 3) + EvolutionMath.evolveCount(state) % 3;
        uint256 w = 240 + r.scale / 3 + ((r.seed >> 3) & 63);
        uint256 top = 690 - r.scale / 2;
        for (uint256 i; i < stones; ++i) {
            uint256 shrink = i * (w / (stones + 3));
            uint256 y = top + i * 58;
            out = string.concat(
                out,
                SVG.rect(
                    500 - w / 2 + shrink / 2 + ((r.seed >> (i * 5)) & 15),
                    y,
                    w - shrink,
                    54 + ((r.seed >> (i * 8)) & 41) + r.m.drawdownBand * 8,
                    i % 2 == 0 ? r.p.primary : r.p.secondary,
                    " opacity=\"0.62\""
                )
            );
        }
        out = string.concat(
            out,
            _poly(
                string.concat(
                    SVG.u(500 - w / 2),
                    ",",
                    SVG.u(top + 190),
                    " 500,",
                    SVG.u(top - 125),
                    " ",
                    SVG.u(500 + w / 2),
                    ",",
                    SVG.u(top + 190)
                ),
                "none",
                r.p.glow,
                "0.42"
            )
        );
        if (DNA.raritySeed(dna) > 54_000) {
            out = string.concat(out, SVG.circle(500, top - 70, 30, r.p.accent, " opacity=\"0.7\""));
        }
    }

    function _energy(uint256 dna, R memory r) private pure returns (string memory out) {
        uint256 hw = 52 + r.scale / 2 + ((r.seed >> 5) & 47);
        uint256 hh = 132 + r.scale / 2 + ((r.seed >> 11) & 47);
        out = string.concat(
            _poly(
                string.concat(
                    SVG.u(500 - hw),
                    ",500 500,",
                    SVG.u(500 - hh),
                    " ",
                    SVG.u(500 + hw),
                    ",500 500,",
                    SVG.u(500 + hh)
                ),
                r.p.primary,
                r.p.accent,
                "0.72"
            ),
            SVG.circle(
                500, 500, 64 + r.mut / 9 + ((r.seed >> 18) & 15), r.p.glow, " opacity=\"0.78\""
            )
        );
        uint256 seals = 1 + r.energy % 3 + r.m.stress / 50;
        for (uint256 i; i < seals; ++i) {
            out = string.concat(
                out,
                "<ellipse cx=\"500\" cy=\"500\" rx=\"",
                SVG.u(hw - 70 + i * 12),
                "\" ry=\"",
                SVG.u(r.scale / 3 - 10 + i * 9),
                "\" fill=\"none\" stroke=\"",
                i % 2 == 0 ? r.p.accent : r.p.secondary,
                "\" stroke-width=\"",
                SVG.u(4 + r.m.drawdownBand),
                "\" opacity=\"0.4\" transform=\"rotate(",
                SVG.u((i * 47 + DNA.palette(dna) * 11) % 180),
                " 500 500)\"/>"
            );
        }
    }

    function _weather(
        uint256 dna,
        uint256 state,
        R memory r
    )
        private
        pure
        returns (string memory out)
    {
        uint256 cracks = 2 + r.m.drawdownBand + r.scar / 58;
        if (cracks > 10) cracks = 10;
        uint256 seed = uint256(keccak256(abi.encode(dna, state, r.m.marketSeed, "damage")));
        for (uint256 i; i < cracks; ++i) {
            int256 x = 470 - int256(r.scale / 2) + int256((seed >> (i * 9)) % (r.scale + 60));
            int256 y = 480 - int256(r.scale / 2) + int256((seed >> (i * 7)) % (r.scale + 60));
            out = string.concat(out, _slash(x, y, 70 + (seed >> (i * 5)) % 145, r));
        }
        if (r.rec > 0) out = string.concat(out, _halo(165 + r.rec, r));
    }

    function _shard(
        uint256 x,
        uint256 y,
        uint256 s,
        uint256 i,
        R memory r
    )
        private
        pure
        returns (string memory)
    {
        return string.concat(
            "<path d=\"M",
            SVG.u(x),
            " ",
            SVG.u(y),
            " L",
            SVG.u(x + s),
            " ",
            SVG.u(y + s / 4),
            " L",
            SVG.u(x + s / 2),
            " ",
            SVG.u(y + s),
            " Z\" fill=\"",
            i % 3 == 0 ? r.p.primary : r.p.secondary,
            "\" stroke=\"",
            r.p.accent,
            "\" stroke-width=\"2\" opacity=\"",
            i % 2 == 0 ? "0.62" : "0.36",
            "\"/>"
        );
    }

    function _slash(
        int256 x,
        int256 y,
        uint256 len,
        R memory r
    )
        private
        pure
        returns (string memory)
    {
        int256 dx = int256(len);
        int256 dy = int256(len / 2);
        if (r.arch == 2) dy = -dy;
        if (r.arch == 4) dx = int256(len / 2);
        if (r.arch == 5) {
            dx = int256(len / 3);
            dy = -int256(len / 3);
        }
        return SVG.line(
            _coord(x),
            _coord(y),
            _coord(x + dx),
            _coord(y + dy),
            r.p.scar,
            3 + r.m.drawdownBand,
            " opacity=\"0.56\""
        );
    }

    function _halo(uint256 radius, R memory r) private pure returns (string memory) {
        return string.concat(
            "<circle cx=\"500\" cy=\"500\" r=\"",
            SVG.u(radius),
            "\" fill=\"none\" stroke=\"",
            r.p.glow,
            "\" stroke-width=\"4\" stroke-dasharray=\"18 34\" opacity=\"0.22\"/>"
        );
    }

    function _curve(
        uint256 x1,
        uint256 y1,
        uint256 mx,
        uint256 my,
        uint256 x2,
        uint256 y2,
        string memory color,
        uint256 w
    )
        private
        pure
        returns (string memory)
    {
        return string.concat(
            "<path d=\"M",
            SVG.u(x1),
            " ",
            SVG.u(y1),
            " Q",
            SVG.u(mx),
            " ",
            SVG.u(my),
            " ",
            SVG.u(x2),
            " ",
            SVG.u(y2),
            "\" fill=\"none\" stroke=\"",
            color,
            "\" stroke-width=\"",
            SVG.u(w),
            "\" opacity=\"0.54\"/>",
            SVG.circle(x2, y2, 7, color, " opacity=\"0.66\"")
        );
    }

    function _poly(
        string memory pts,
        string memory fill,
        string memory stroke,
        string memory op
    )
        private
        pure
        returns (string memory)
    {
        return string.concat(
            "<polygon points=\"",
            pts,
            "\" fill=\"",
            fill,
            "\" stroke=\"",
            stroke,
            "\" stroke-width=\"5\" opacity=\"",
            op,
            "\"/>"
        );
    }

    function _radial(
        uint256 arms,
        uint256 ro,
        uint256 ri,
        uint256 seed,
        bool alt
    )
        private
        pure
        returns (string memory out)
    {
        uint256 points = arms * 2;
        for (uint256 i; i < points; ++i) {
            uint256 rad = i % 2 == 0 || !alt ? ro : ri;
            (uint256 x, uint256 y) = _point(i * (360 / points), rad + ((seed >> (i * 5)) & 19));
            out = string.concat(out, i == 0 ? "" : " ", SVG.u(x), ",", SVG.u(y));
        }
    }

    function _point(uint256 angle, uint256 radius) private pure returns (uint256 x, uint256 y) {
        uint256 a = angle % 360;
        int256 sx;
        int256 sy;
        if (a < 90) {
            sx = int256(a) * 11;
            sy = -1000 + int256(a) * 22;
        } else if (a < 180) {
            sx = 1000 - int256(a - 90) * 22;
            sy = int256(a - 90) * 11;
        } else if (a < 270) {
            sx = -int256(a - 180) * 11;
            sy = 1000 - int256(a - 180) * 22;
        } else {
            sx = -1000 + int256(a - 270) * 22;
            sy = -int256(a - 270) * 11;
        }
        x = _coord(500 + (sx * int256(radius)) / 1000);
        y = _coord(500 + (sy * int256(radius)) / 1000);
    }

    function _coord(int256 v) private pure returns (uint256) {
        if (v < 0) return 0;
        if (v > 1000) return 1000;
        return uint256(v);
    }

    function _a(string memory t, string memory v) private pure returns (string memory) {
        return string.concat("{\"trait_type\":\"", t, "\",\"value\":\"", v, "\"}");
    }

    function _n(string memory t, uint256 v) private pure returns (string memory) {
        return string.concat("{\"trait_type\":\"", t, "\",\"value\":", SVG.u(v), "}");
    }

    function _arch(uint8 s) private pure returns (uint8) {
        if (s == 0 || s == 14) return 0;
        if (s == 2 || s == 8 || s == 12) return 1;
        if (s == 3 || s == 13 || s == 15) return 2;
        if (s == 1 || s == 4 || s == 6) return 3;
        if (s == 5 || s == 10 || s == 11) return 4;
        return 5;
    }

    function _archName(uint8 x) private pure returns (string memory) {
        if (x == 0) return "Abyssal Idol";
        if (x == 1) return "Ritual Machine";
        if (x == 2) return "Sacred Shard";
        if (x == 3) return "Living Archive";
        if (x == 4) return "Buried Monolith";
        return "Containment Core";
    }

    function _geomName(uint8 x) private pure returns (string memory) {
        if (x < 3) return "Monolithic";
        if (x < 6) return "Radial";
        if (x < 9) return "Lattice";
        if (x < 12) return "Fragmented";
        return "Recursive";
    }

    function _energyName(uint8 x) private pure returns (string memory) {
        if (x < 4) return "Dormant";
        if (x < 8) return "Embered";
        if (x < 12) return "Radiant";
        return "Unstable";
    }

    function _corruptName(uint32 drawdown, uint32 stress) private pure returns (string memory) {
        if (drawdown >= 4) return "Abyss Torn";
        if (drawdown >= 2) return "Cracked";
        if (stress > 82) return "Unstable";
        return "Contained";
    }

    function _tierName(uint8 x) private pure returns (string memory) {
        if (x == 0) return "Unrecorded";
        if (x == 1) return "Witness";
        if (x == 2) return "Survivor";
        if (x == 3) return "Archive";
        if (x == 4) return "Mythic";
        return "Genesis";
    }

    function _exposure(uint8 x) private pure returns (string memory) {
        if (x < 2) return "Drought";
        if (x < 4) return "Tidal";
        return "Flooded";
    }

    function _volName(uint32 x) private pure returns (string memory) {
        if (x < 180) return "Quiet";
        if (x < 700) return "Restless";
        if (x < 1300) return "Violent";
        return "Cataclysmic";
    }

    function _scarName(uint256 x) private pure returns (string memory) {
        if (x < 40) return "Unscarred";
        if (x < 100) return "Marked";
        if (x < 180) return "Fractured";
        return "Ruined";
    }

    function _recoveryName(uint256 x) private pure returns (string memory) {
        if (x == 0) return "None";
        if (x < 40) return "Kindling";
        if (x < 90) return "Reconstruction";
        return "Radiant Repair";
    }
}
