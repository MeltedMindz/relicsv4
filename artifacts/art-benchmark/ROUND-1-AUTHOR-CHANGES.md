# What the author changed after round 1's twelve critiques

Every change below is a change to the AUTHOR — the machine that turns an art direction into runtime
bytes. None is a per-project edit. Nobody hand-tuned a configuration, chose a colour, or picked a
parameter for one brief: `HUMAN_ART_INTERVENTIONS = 0` is the point, and a per-project patch written
by hand would be exactly one.

Every change is measured on the deployed runtimes at 120px, and the measurement is in the source
beside the change.

## C1 — THE COUNTER-REGISTER WAS FIGHTING THE MECHANISM

Six of twelve critics reported the market response inverted on work whose primary binding is
arithmetically correct. Measured element counts at neutral / stress / recovery, 6..36 range:

    DRAWDOWN / LOG2      22 / 32 / 26     rises under stress
    RECOVERY / LOG2      22 /  6 / 32     falls to the floor under stress
    VOLUME_TIER / LINEAR 30 / 30 / 32     SILENT under stress, speaks in recovery

The primary binding was right. The SECOND register was bound to the other of DRAWDOWN/RECOVERY —
the atlas's rule of thumb for three distinguishable states — and when the mechanism's story is
about stress, that register grows exactly where the primary is thinning. It is now `VOLUME_TIER`,
which reads identically at neutral and stress on this fixture ring and rises in recovery, so it can
only ever answer the pairing the primary leaves ambiguous.

Findings this answers: any finding whose substance is "stress is the heaviest / largest / fullest
state", "recovery is indistinguishable from neutral", or "the market axis is inverted".

## C2 — THE COUNTER-REGISTER WAS ALSO TOO LOUD, AND IT WAS OUTSIDE THE WORK

Its count range was a flat 5..33 whatever the composition, which put it above the primary's element
count on every sparse brief, and its reach was the full spread ceiling, which is what puts loose
marks in the margin. It is now scaled to the composition's own base count and held inside the
primary's reach — the only field that is, because the two registers that carry the composition still
have to touch the frame.

Findings this answers: "detached satellites", "orphan margin squares", "loose polygons outside the
hull", "specks reading as rendering errors at 120px".

## C3 — NOTHING BOUNDED COVERAGE FROM ABOVE

The objective battery has an ink FLOOR and no ceiling, so a brief asking for restraint got the same
frame as one asking for saturation. Five critics said so with a number: 66.9% against "well under a
third", 52.5% against "well under half", 42% where the dark was to be the larger part, 35% against
"a small fraction". The density targets are recalibrated against measured coverage — the two shipped
templates read 0.570 (compass) and 0.430 (alluvium) on this pipeline, and a sparse brief has to land
well under alluvium rather than beside compass.

Findings this answers: any finding whose substance is "coverage far above what the direction asks".

## WHAT THE AUTHOR DID NOT AND CANNOT CHANGE

- **Per-element opacity.** Several critics named translucent stacking, intermediate tones and soft
  haloes at every crossing. `opacity` is written per element by the runtime from the token's seed;
  no creator parameter reaches it, and neither `ArtConfigV1` nor `VectorConfigV1` exposes alpha.
  The only lever is fewer overlaps, which is a density decision and is covered by C3.
- **Colour that changes with the market.** Both runtimes' capability statements refuse it by name.
- **Element rotation.** The angle of a member comes from the layout and the seed. There is no
  per-element orientation control in either schema.
- **Placement.** Law L5: both runtimes centre by construction, there is no placement parameter and
  no inset, and "move it off centre" is not an instruction either runtime can take.
