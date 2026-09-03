# Holdout rounds — reviewer-side

This directory is **outside the author-visible source surface** (`AUTHOR_VISIBLE_ROOTS` in
`../src/holdout.js`). It holds the round registry and quarantined reviewer material. Nothing here
is read by the author lane, and nothing here may be moved into `../src/`.

## Why the holdout stopped being a constant

Until 2026-09-03 `FINAL_HOLDOUT_SEEDS` was `base + i * stride` with both numbers written out in
`../src/seeds.js` — the module `author.js` imports. The header said "THE AUTHOR NEVER SEES THEM"
four lines above the generator that produced them. The same twelve served both completed benchmark
rounds, byte for byte, and a round-one holdout reviewer's sentence naming one of them was quoted
verbatim in `author.js` before round two was authored.

So a holdout is now **committed to in advance and derived from a salt that is not in this
repository**. The source is public; the seeds are not.

## Running a round

**1. Generate a salt and keep it out of the repository.** Anything with at least 16 characters of
real entropy. Do not commit it, do not paste it into a source file, do not put it in a `.env` that
is tracked.

```
openssl rand -hex 32 > ~/.relics/holdout/wave2-round-1.salt
chmod 600 ~/.relics/holdout/wave2-round-1.salt
```

**2. Publish the commitment BEFORE authoring starts.** This is what makes the round honest: it
fixes the holdout without revealing it, so nobody can choose a flattering set after seeing the work.

```
node -e 'import("./packages/art-direction/src/seeds.js").then(async (m) => {
  const { readFileSync } = await import("node:fs");
  console.log(m.holdoutSaltCommitment(readFileSync(process.argv[1], "utf8").trim()));
})' ~/.relics/holdout/wave2-round-1.salt
```

Add a round to `registry.json` with the printed `saltCommitment`, `derivation: "COUNTER_SHA256_V1"`,
`integrity: "HELD"` and `seedsDigest: null`. Commit that before the first `author` run.

**3. Author and revise with no salt in the environment.** The author and development phases must
not be able to resolve the holdout at all. `finalHoldoutSeeds` throws without a salt, which is the
behaviour you want: absence of the salt is a refusal, never a fallback.

**4. Freeze the holdout.** Only this phase needs the salt.

```
RELICS_ART_HOLDOUT_ROUND_ID=wave2-round-1 \
RELICS_ART_HOLDOUT_SALT_FILE=~/.relics/holdout/wave2-round-1.salt \
npm run art:benchmark holdout
```

It prints the round id and the seed digest, and deliberately does **not** print the seeds.

**5. Pin `seedsDigest` in `registry.json`** from what step 4 printed, so a receipt can be traced to
its round afterwards without anyone re-deriving the salt.

**6. Build receipts.** `npm run art:benchmark receipt` measures `authorSawHoldout` by scanning
author-visible source for the round's seeds and records the result with the files and lines behind
it.

**7. Verify.** `npm run kit:artreceipts` reads every committed receipt against the artifacts it
names, and `npm run kit:holdout` re-runs the containment tests.

## Reproducing a round as a reviewer

Given the salt and the round id:

```
node -e 'import("./packages/art-direction/src/seeds.js").then(async (m) => {
  const { readFileSync } = await import("node:fs");
  const salt = readFileSync(process.argv[2], "utf8").trim();
  console.log("commitment", m.holdoutSaltCommitment(salt));
  const seeds = m.deriveHoldoutSeeds({ roundId: process.argv[1], salt });
  console.log("digest", m.holdoutSeedsDigest(seeds));
  console.log("seeds", seeds.join(","));
})' wave2-round-1 ~/.relics/holdout/wave2-round-1.salt
```

The commitment must equal the one published before authoring, and the digest must equal the one in
`registry.json` and in every receipt. Those two equalities are the whole guarantee: the set that
was judged is the set that was fixed in advance.

## What this does not claim

This is a scan of source text and a discipline about where a salt lives. It is not a capability
boundary. An author agent that opens `artifacts/` or this directory can read a seed, and nothing
here stops it. What it does is make the leak that actually happened — a seed pasted into the
author's own source, where it is read on every subsequent run — detectable, mutation-provable and
recorded in the receipt.
