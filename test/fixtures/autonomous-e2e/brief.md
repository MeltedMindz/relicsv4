<!--
THE MACHINE-READABLE HALF OF THIS BRIEF.

The harness is deterministic and reads THIS block, not the prose below it. That distinction is
stated rather than hidden: a run that claimed to have read the prose would be claiming a language
model ran inside a test, and the whole value of this harness is that its output is reproducible
from its inputs. The prose is what a human wrote; the block is what the harness turns into an
`ACV1` art configuration, a `relics.config.json` and a `LaunchParams`.

Every field below is an ARTISTIC OR ECONOMIC DECISION. None of them has a default anywhere in the
kit, and that is deliberate — see `deriveArtConfig` and `CreatorInput.antiSnipeMode`.
-->
```json e2e-brief
{
  "name": "Fork Assay",
  "symbol": "ASSAY",
  "description": "A deterministic study in market-driven strata, authored and launched entirely against a local fork. Nothing here has ever touched a public chain.",
  "totalSupplyWhole": "10000",
  "artworkSupply": "1000",
  "startingPreset": "MID",
  "antiSnipeElection": "PROTECTED_98_MINUTES",
  "art": {
    "title": "Fork Assay",
    "animate": false,
    "background": 0,
    "palette": ["#08090c", "#e4e0d8", "#8f6f2a", "#5d6f74"],
    "layers": [
      { "kind": "STRATA", "sensor": "QUOTE_VOLUME", "curve": "LOG2", "palette": 1, "amountMin": 4, "amountMax": 16 },
      { "kind": "RINGS", "sensor": "DRAWDOWN", "curve": "EASE", "palette": 2, "amountMin": 2, "amountMax": 9 },
      { "kind": "VEIL", "sensor": "STRESS", "curve": "LINEAR", "palette": 3, "amountMin": 1, "amountMax": 1 }
    ],
    "traits": [
      { "name": "Depth", "source": "VOLUME_TIER", "style": "WORD" },
      { "name": "Drawdown", "source": "DRAWDOWN", "style": "NUMBER" },
      { "name": "Vein", "source": "DNA_SLOT_0", "style": "HEX" }
    ]
  }
}
```

# Fork Assay — a brief

I want a small, quiet generative collection drawn on chain by the vetted Solidity SVG runtime. No
JavaScript renderer, no IPFS-hosted image for the artwork itself: the picture is a function of the
configuration bytes and of what the market has done to the pool.

**The look.** Sedimentary. A dark ground with bands of bone and ochre laid down horizontally, a few
concentric rings cutting across them, and one thin veil over the top so nothing reads as flat. When
the pool is quiet the piece should be sparse; when volume arrives the bands should thicken.

**What drives it.** Three sensors, and each does one job:

- `QUOTE_VOLUME` decides how many strata there are, on a log curve so early volume matters more
  than late volume.
- `DRAWDOWN` decides how many rings cut across, easing in so a shallow dip is barely visible.
- `STRESS` drives the single veil, linearly.

**Supply.** Ten thousand project tokens; a thousand of them reserved as artwork backing, at full
parity — one whole token behind one artwork.

**Protection.** I elect `PROTECTED_98_MINUTES`. I understand it is immutable, that it charges a
decaying fee on acquisitions for 98 minutes of wall-clock time from pool initialization, that
disposals pay the base rate from the first second, and that it is not Sybil resistance and does not
ration allocation. I am electing it anyway, and I am electing it explicitly because there is no
value the protocol will read out of my silence.

**Earnings.** No royalty enforcement and no collaborators for this study — the creator recipient
in `relics.agent.json` is a throwaway local account and the whole run is thrown away with the fork.
