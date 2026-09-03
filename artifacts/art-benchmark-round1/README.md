# Round 1 of the frozen twelve-brief benchmark — kept as it was measured

`BLIND_PASS = 0/12`. Twelve final blind reviewers, twelve refusals, and the report is in
`report.json`. Nothing here has been edited to look better in hindsight; the directions in
`directions.json` are the ones round one actually authored against, and the verdicts are the ones
the reviewers wrote.

It is kept because the round-2 changes were derived FROM it. Almost every finding in the
mechanism vocabulary, the admission routing and the author's composition stages cites a sentence
one of these twelve reviewers wrote — the blank token nobody was measuring for, the centred island
in dead margin, the rosette on a brief about a colonnade, the mass that consolidates where the
brief asked it to fracture. A later reader checking whether a claim about round one is true should
be able to read the verdict rather than take the claim's word for it.

Round 2 is in `../art-benchmark/`. The twelve briefs are the same twelve, frozen before either
round existed and unedited between them.

---

## THE HOLDOUT WAS NOT HELD OUT — recorded 2026-09-03, after the fact

`FINAL_REVIEW_SEEDS_VISIBLE_DURING_AUTHORING=NO` was reported for all twelve cases here, and it was
false. Not because a code path handed the seeds over — none did — but because the seeds were
computable from the source the author reads: `packages/art-direction/src/seeds.js` generated
`FINAL_HOLDOUT_SEEDS` from a base and a stride declared four lines below the sentence
"THE AUTHOR NEVER SEES THEM", in the module `author.js` imports. The flag was also not measured;
`scripts/run-art-benchmark.mjs` wrote the literal `false` into every receipt and `acceptance.js`
read it back out.

**The same twelve seeds served round two, byte for byte.** They are still recorded in each case's
receipt, and they are the only holdout either round ever used.

`packages/art-direction/rounds/registry.json` now records this round as `COMPROMISED` with its
evidence, the twelve receipts here carry `authorSawHoldout: true`, and `verifyArtAcceptance`
refuses a receipt judged under a compromised holdout.

**What that does and does not change.** All twelve verdicts here are `REFUSE`, so nothing was
accepted on a compromised holdout and no false PASS was produced. The `0/12` stands as the number
that was measured. What cannot be done is re-score it clean: a clean score needs a holdout the
author was never exposed to, and that means a fresh round, which is not authorised.
