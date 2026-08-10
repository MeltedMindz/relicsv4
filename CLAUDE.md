# CLAUDE.md — relics-v4-starter

Read [`AGENTS.md`](AGENTS.md) for the full, tool-agnostic guide. This file front-loads the one
request this repository exists to answer, so you can act on it immediately.

---

## IF THE USER ASKS "HOW DO I CREATE A PROJECT?" — DO THIS

They want a `.relics` bundle: one file describing a generative art project, which they import
into the RELICS Launchpad creator app. Everything happens locally. Nothing here signs a
transaction, contacts a network, or touches a chain.

```bash
npm install                                  # once
npm run kit -- templates                     # see what they can start from
npm run kit -- init my-project --template minimal
# REQUIRED before export: set earnings.creatorRecipient in my-project/relics.config.json
# to your own wallet. The scaffold ships a placeholder and validation fails until you change it.
npm run kit -- dev my-project                # local studio on 127.0.0.1
npm run kit -- test-seeds my-project --count 100
npm run kit -- validate my-project           # every check, writes nothing
npm run kit -- export my-project --output my-project.relics
```

`npm run kit -- <command>` is the invocation. The `--` matters: without it npm eats the flags.

**Templates:** `minimal`, `solidity-svg-params`, `onchain-js`, `market-responsive`,
`static-art`. Start a beginner on `minimal`. Use `market-responsive` when they want the pool's
own history to drive the image — that is the point of the platform, and the template shows the
sensor→transform→destination vocabulary without them inventing it.

**What they actually edit:** `generator/` (the art), `traits/schema.json`,
`market/mappings.json`, `metadata/collection.json`. Read
[`docs/creator-kit/`](docs/creator-kit/) before improvising — the manifest key space is closed
and the validator is the authority, not your intuition.

**`export` refuses to write a bundle that fails validation, and there is no `--force`.** When
it fails, fix the project. Never work around the validator, never hand-assemble a `.relics`
file, and never edit one after export — every file is digest-pinned and the importer checks.

### Debugging a failed `validate`

Read the error; it names the file and the rule. The failures that actually happen:

- **`EARNINGS_RECIPIENT_PLACEHOLDER`** — the scaffold ships a placeholder wallet. Fix it in
  `relics.config.json`. Be aware the message cites `relics.project.json#earnings.creatorRecipient`:
  that is the path inside the *generated bundle manifest*, not a file in their project
  directory. Point them at `relics.config.json`.
- **Non-determinism** — the same seed must produce the same output forever. `Math.random()`,
  `Date.now()`, any ambient state carried between renders. Use the seeded PRNG the template
  gives you.
- **Byte budget** — the script is stored on chain; there is a hard ceiling.
- **Network access** — a generator that fetches anything is refused. All assets travel inside
  the bundle.
- **Blank or duplicate output** — `test-seeds --count 100` catches a collection that collapses
  to one image or renders nothing at some seeds.
- **Market mapping out of the vocabulary** — sensors, transforms and destinations are a closed
  set; check `market/mappings.json` against the schema.

---

## THINGS YOU MUST NOT TELL A CREATOR

These are accuracy rules, not style. Getting one wrong publishes a false claim.

- **The launchpad is not deployed.** `PREPARED_NOT_DEPLOYED` on Ethereum (1), Base (8453) and
  Robinhood Chain (4663). There is no launchpad address to give anyone. A creator can build and
  export a bundle today; they cannot launch.
- **There has been no external audit.** Review has been internal only. Never write "audited",
  "security reviewed" or anything a reader would take as third-party assurance.
- **Creator art is not yet bound to `tokenURI`.** In the frozen release the collection contract
  renders a small built-in placeholder — rings derived from DNA and the pool's swap counter,
  the same for every collection. The bundle carries the creator's generator and the import
  round-trip is exact, but on-chain artwork binding is unfinished work. Say so if they ask what
  their token will look like on chain. See `docs/creator-kit/cli.md` and
  `docs/launchpad/05-creator-flow.md`.
- **Fees are a share of collected LP fees, never of volume.** Creator 75%; platform 25%, of
  which 6.25% of collected fees buys $RELICS and 18.75% is retained.
- **On $RELICS removal, always state both halves:** circulating supply falls, and `totalSupply`
  stays fixed at 10,000 forever because the token has no burn function. Never imply the ledger
  supply shrinks.
- **Never call locked LP "burned"**, and never write "locked forever", "permanent" or "fees
  route immutably" about any custody arrangement.
- **A bundle can never carry protocol code.** The manifest key space is closed and `.sol`,
  `.vy`, `.yul` and `.wasm` are refused by extension, so no bundle can replace the hook, the
  project token, the collection, the escrow, the router or the buyback. If a user asks for a
  custom hook, tell them that needs a separate reviewed process — do not try to smuggle it into
  a bundle.

---

## WORKING IN THIS REPO

- **Never commit a secret.** No keys, mnemonics, `.env` values or RPC credentials. Run
  `npm run secrets:scan` before you commit, and treat a failure as a stop.
- **Never modify `packages/project-schema/`.** It is the single definition of the `.relics`
  format and the launchpad mirrors it byte for byte. A schema that is closed on one side and
  open on the other is not closed.
- **Dependencies under `lib/` are vendored, pinned and byte-exact.** Do not float or partially
  update them.
- **Do not publish.** Commit locally and stop. Pushing is the owner's decision.
- Gates: `npm run kit:test`, `npm run kit:templates`, `npm run kit:fixtures`,
  `npm run secrets:scan`.

## WHAT ELSE IS HERE

This repo holds three separate things; do not blend them.

1. **The creator kit** — `packages/creator-cli/`, `packages/project-schema/`,
   `docs/creator-kit/`. The subject of this file.
2. **A clean-room fork-and-launch template** — `src/`, `script/`, `docs/00-*`…, for building
   your own on-chain generative collection bound to a Uniswap v4 pool. Shares no code with the
   launchpad.
3. **`flagship/`** — the operator-authorized production reference for the live RELICS artwork
   at `https://www.relics.wtf`. Verified source and public on-chain facts only.

Full detail, repo map and the reasoning behind each rule: [`AGENTS.md`](AGENTS.md).
