# Autonomous art creation — where it stands

This page exists because two capabilities ship in one command surface and they are not at the same
maturity. Flattening them into one sentence would sell the weaker on the evidence of the stronger,
so they are separated here and the separation is enforced by a gate rather than by good intentions.

Nothing on this page changes what you can do. It changes what you should expect.

---

## The three statuses

| | status | what it means |
| --- | --- | --- |
| **Autonomous launch of accepted art** | `PRODUCTION_READY` | An agent takes a project whose art already carries a current acceptance and does the rest by itself: chain selection, quote selection, metadata birth, prepare, predict, simulate, build, policy check, protected signing, broadcast, confirmation, verification. |
| **Autonomous art creation** | `EXPERIMENTAL` | An agent may interpret a brief, choose a runtime, build a configuration, render it, critique it, iterate and present the work. What it may not do is put art nobody accepted onto a chain while nobody is watching. |
| **The human creator flow** | permissionless | Unchanged, and deliberately so. You author, validate and export offline, and a subjective visual verdict is a **warning** on a launch you are driving — not a refusal. |

`npm run kit:artauthority` prints all of it, and every value is produced by running the shipped
gate on real receipts through the real CLI rather than by asserting a constant.

---

## What "already carries an acceptance" admits

Four kinds of art, and only the fourth involves the review loop at all:

- art a person made;
- a `.relics` bundle imported from this kit;
- studio art the creator accepted;
- agent-made art that **passed** the independent final visual review.

The first three never enter the review loop, because there is nothing for it to review: the gate
answers `ART_REVIEW_NOT_APPLICABLE`, says so on the record rather than passing silently, and writes
no receipt of its own. That is the permissionless creator path and it stays permissionless.

---

## What the art author has actually produced

Three rounds, each authored by the agent and then judged by independent reviewers who were shown
the pictures and not the brief, and not told what the author thought of the work.

```
AUTONOMOUS_AUTHOR_ROUNDS        3
AUTONOMOUS_AUTHOR_BLIND_PASSES  0/12
```

Zero accepted configurations. Rounds one and two additionally ran on a holdout the author could
compute from a module it imports — recorded in
[`packages/art-direction/rounds/registry.json`](../../packages/art-direction/rounds/registry.json)
as `COMPROMISED`, with the consequence stated plainly: no false PASS was produced, because all
twenty-four verdicts were refusals, but the score cannot be re-cleaned without a fresh round.
Round three's holdout was committed to before the first author run, derived from a salt outside
this repository, and overlaps the earlier set by zero seeds — structurally, since the two
derivations draw from disjoint ranges. It scored 0/12 as well.

The round-three refusals are specific and they are worth reading rather than summarising: seven of
eleven independently reached for the same word for what they were looking at, before any of them
had read a line of the brief. The findings are in
[`artifacts/art-benchmark-round3/`](../../artifacts/art-benchmark-round3/).

**A fourth round has not been run, and that is a decision rather than an omission.** The capability
the last round was short of has not changed, so a fourth round under the same capability would
re-measure the same thing and produce the same number.

```
REDUNDANT_FOURTH_AUTHOR_ROUND_RUN  NO
```

---

## What the gate refuses, and what it merely warns about

The distinction is not "how bad was it". It is **what failed** — a judgement, or the record itself.

**Subjective results.** A reviewer looked and formed a view, or nobody formed one. The art is
valid, it renders, it is inside its budget; a judgement went against it.

`NO_ART_ACCEPTANCE` · `ART_NOT_ACCEPTED` · `ART_QUALITY_NOT_ACCEPTABLE` ·
`ART_ACCEPTANCE_INVALIDATED` · `ART_REVIEW_REQUIRED_NO_ART_DOCUMENT`

**Broken records.** The receipt is claiming something it does not establish. Nobody can overrule
these by looking harder, because what failed is not the work.

`FINAL_REVIEW_VERDICT_SELF_ATTESTED` · `FINAL_REVIEW_NOT_BLINDED` · `FINAL_REVIEW_ROLE_COLLISION` ·
`FINAL_REVIEW_HOLDOUT_COMPROMISED` · `FINAL_REVIEW_CONFIG_MUTATION_AFTER_UNBLIND` ·
`FINAL_REVIEW_VERDICT_DOCUMENT_ALTERED` · `FINAL_REVIEW_VERDICT_DOCUMENT_MISSING` ·
`FINAL_REVIEW_VERDICT_UNBOUND` · `CRITIQUE_WITHOUT_AUTHOR_RESPONSE` · `ART_ACCEPTANCE_UNREADABLE`

Then the run's own authority decides what happens:

| | subjective result | broken record |
| --- | --- | --- |
| **run can broadcast unattended** | REFUSE | REFUSE |
| **run is human-controlled** (`goal: "BUILD_ONLY"`, or `allowBroadcast: false`) | **WARN** — you see the verdict and may proceed | REFUSE |

An unreadable or unrecognised policy counts as broadcast-capable. The permissive answer needs
positive evidence, so a policy that fails to load can never be the reason a refusal softened.

---

## A warning is not an acceptance

This is the one property worth stating on its own, because breaking it would be silent and would
matter later rather than now.

When you proceed past a warning on a build you are signing yourself, **nothing is written that says
a reviewer accepted the work.** The `ART_REVIEW` receipt is created in exactly one place, on a real
acceptance. A later run that *can* broadcast unattended therefore asks the same question again and
gets the same refusal — your override does not travel forward, and it does not travel to anybody
else.

```
HUMAN_OVERRIDE_CREATES_ART_ACCEPTED_RECEIPT  NO
```

That is checked by digesting the whole receipts directory before and after a real CLI run, rather
than by asserting that a call is absent from the source.

---

## Running the checks yourself

```bash
npm run kit:artauthority     # the three statuses, proved by execution — 12 cases
npm run kit:boundary         # no document claims more than the above
npm run kit:boundary:controls # that gate can both catch and allow
npm run kit:artreview        # the review loop's own gate
npm run kit:artreceipts      # every committed receipt, re-verified
npm run e2e:autonomous       # the production path, end to end, on a local fork
```

`kit:artauthority` runs a positive control first and refuses to report anything if it fails: a gate
that refuses everything would make every refusal below it true and meaningless.
