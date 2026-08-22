# Requesting a custom art runtime

Almost every project should stop reading here and use the generic runtime, which needs no request,
no contract and no permission. This page is for the rare project whose art cannot be expressed by
the generic runtime's vocabulary at all, and it describes how to ask RELICS to add one.

[15 — The art runtime contract](../launchpad/15-art-runtimes.md) is the companion page. It covers
what a runtime is handed, the rule that it may make no external call, and why successful
registration proves almost nothing about your art. Read it first. This page covers the **process**:
what to build, how to open the pull request, what gets reviewed, and what happens afterwards.

---

## Most projects do not need one

The launchable path is `SOLIDITY_SVG` — one shared generic runtime per chain that you configure
with ACV1 parameters carried in your `.relics` bundle. You deploy nothing, you register nothing,
and you wait for nobody. Its vocabulary is:

- a palette of up to 8 RGB entries, plus a background slot;
- up to 8 layers, each a drawing primitive (`STRATA`, `RINGS`, `BARS`, `GRID`, `SHARDS`, `VEIL`), a
  market sensor that drives its magnitude, a response curve (`LINEAR`, `LOG2`, `EASE`, `STEP`), a
  palette slot and an element-count band;
- up to 8 traits, each a name, a source and a style;
- an optional title, and an `ANIMATE` flag.

Two projects on that runtime look different because their configurations differ. Before you decide
it is not enough, scaffold a template and look at what the parameters actually do:

```bash
npm run kit -- templates            # what ships, and which runtime each sits on
npm run kit -- init --template <id>
```

**A custom runtime buys exactly one thing: a drawing program the parameters above cannot express.**
It buys no economic behaviour, no market behaviour and no fee behaviour. A runtime is a `view`
function that returns a picture and some traits; it is not on the swap path and cannot touch one.

What it costs:

| | |
| --- | --- |
| A Solidity contract you write, deploy and pay for | on every chain you want it on |
| A review whose timing you do not control | no turnaround is promised |
| A permanent registration | there is no way to un-register a runtime; only its active flag can be turned off again |
| One failure mode you cannot recover from | a runtime that reverts at render time cannot be swapped out for a collection that already launched |

That last row is the reason this page is cautious. A project's runtime address and codehash are
copied into its own binding at launch, the binding is one-shot and has no setter, and nobody —
including RELICS — can repoint it afterwards.

---

## What to build

### The interface

Seven methods, all of `IArtRuntimeV1`. The table in
[15 — The art runtime contract](../launchpad/15-art-runtimes.md) lists each one with its
obligations. The four properties that decide whether your submission is reviewable at all:

**It makes no external call.** `renderV1` and `tokenUriV1` are `view` and must not call out to
anything, including your own contracts. Everything the runtime needs is passed in. This is the
interface's own requirement, not a style preference, and it is what makes a render replayable by
anyone from chain state alone.

**It is deterministic.** The same request must return the same bytes forever. Nothing may depend on
the caller, on gas, on block data, on randomness, or on storage that anything can write. The
request struct deliberately carries no caller address, no block and no timestamp so that this is
hard to get wrong by accident.

**You define your own configuration bytes.** `validateConfigV1(bytes)` returns
`(uint8 code, bytes32 traitSchemaHash)`, where `0` means accepted. Your runtime is the only thing
that validates its own format, and it must be exhaustive: a configuration it accepts and your
renderer cannot draw becomes a live collection that renders nothing. Your format does not have to
be ACV1 and usually should not be — 666's runtime takes four bytes and refuses everything else.

**It fits.** A runtime is a singleton, so it has the whole 24,576-byte EIP-170 budget to itself and
not one byte more. Measure it, do not estimate it:

```bash
forge build --sizes
```

Also make `maxOutputBytes()` honest. It is published so that an integrator can size a read without
discovering the bound at runtime.

Finally: **no owner, no admin, no setter, no proxy, no `delegatecall`.** A runtime whose behaviour
an address can change is a runtime whose art an address can change, and the codehash pin exists
precisely to make that impossible.

### Exercise it before you ask anyone to look

There is no RELICS-supplied test harness for a third-party runtime. You are expected to bring your
own evidence, and "it compiled" is not evidence. At minimum:

- Render **every** configuration your `validateConfigV1` accepts — including the boundary cases you
  never drew by hand. Those are the ones that revert in production.
- Prove the render is non-reverting by construction rather than by luck: every loop bounded by a
  validated count, every buffer preallocated to a capacity the validated budget cannot exceed,
  every arithmetic operation bounded or saturating.
- Run against real launched state on a fork, not only against a locally deployed stack.
- Check the codehash you intend to have pinned is the codehash you deployed.

---

## Opening the pull request

Repository: **`https://github.com/MeltedMindz/relicsv4`**. It is public at all times. Nothing you
add may contain a key, a mnemonic, a credentialed RPC URL or any other private material.

Branch: `art-runtime/<project-slug>` — for example, `art-runtime/666`.

### What to add

| | |
| --- | --- |
| Your runtime's Solidity source, or a link to the repository and commit where it lives | RELICS does not host a third party's art contract, and either form is fine |
| The deployed address and chain id, with the explorer's verified-source URL | the deployed address is the thing being reviewed |
| `runtimeMode`, `runtimeVersion`, `runtimeTag` and `maxOutputBytes` as your contract reports them | so the record and the contract can be compared |
| The `forge build --sizes` line for the runtime | EIP-170 headroom, stated rather than implied |
| Your configuration format, and the exact bytes you intend to launch with | plus what `validateConfigV1` returns for them |
| Your tests, and how to run them | render coverage over every accepted configuration |

### What the description must state

In your own words, not as ticked boxes:

- what the generic runtime could not express, specifically;
- that the contract makes no external call, and how you satisfied yourself of that;
- that it has no owner, admin or setter;
- which chains you are asking for, and why each one.

### Checks that must be green before review

The repository's own CI: the creator-kit, docs, contracts, launch-protection and reserved-terms
workflows. Two are easy to forget:

```bash
npm run docs:links          # links, anchors, and every npm script your prose names
npm run export:manifest     # required whenever a pull request adds a tracked file
```

Use the **Art runtime request** pull request template, which carries the checklist.

---

## What RELICS reviews

The source, not the description. Specifically:

- **Determinism.** No caller, block, timestamp, gas, randomness or mutable storage on the render
  path.
- **No external call, no `delegatecall`, no contract creation, no self-destruct** — read off the
  compiled artifact rather than off your comments.
- **No owner, admin, setter, proxy or implementation slot.** Nothing may change what the contract
  draws after it is registered.
- **It cannot alter a market or a fee.** A runtime is `staticcall`ed from a collection and is not
  on the swap path. A submission implying otherwise has misread the interface.
- **Non-reverting by construction.** See above; this is the failure that cannot be undone.
- **`validateConfigV1` is exhaustive** and accepts nothing your renderer cannot draw.
- **Gas and size against the launch budget** — under 24,576 bytes, honest `maxOutputBytes`, and a
  `tokenUriV1` that returns within a sane read.
- **The output is real on-chain art.** A complete `data:` URI computed from the request. Not an
  HTTP redirect, not a gateway URL, not an IPFS pointer, not a placeholder. A runtime that returns
  a link has moved the art off chain, which is the one thing the whole design exists to prevent.
- **Source verification on every chain you asked for**, resolving by name against the deployed
  bytecode.

RELICS reviews the contract. It does not review whether the art is good, and approval is not an
endorsement of your project.

---

## What happens after approval

The protocol Safe calls `registerRuntime(uint32 runtimeId, address runtime, string label)` on that
chain's art runtime registry. Registration is an operator action — there is no permissionless path
— and the runtime is active from the moment it is registered.

Two properties worth understanding before you ask:

**Registration is permanent; activation is reversible.** There is no way to un-register a runtime.
The reversible control is its active flag, and turning it off stops the **next** launch from naming
it.

**Deactivation never changes art that already exists.** Your project copies the runtime's address
and codehash into its own binding at launch and reads them from there forever. `tokenURI` never
consults the registry, and no function in the registry takes a project id. Whatever happens to the
registry afterwards, your collection renders exactly what it rendered on day one.

A runtime is registered **per chain**. The same runtime on a second chain is a second deployment, a
second review and a second registration.

### How you elect it at launch

Your launch parameters carry one word that holds two choices — the registered template in the low
bits, the elected art runtime in the high bits:

```text
artTemplateId = artRuntimeId << 224 | templateId
```

Zero in the runtime half means "no preference" and resolves to the chain's generic runtime. The two
halves cannot collide, because the template registry refuses to register any template id large
enough to reach into the runtime half.

**An election is admitted or refused, never quietly downgraded.** If the runtime you named is
unknown, inactive, or its code has changed since it was reviewed, the launch reverts. There is no
fallback to the generic runtime, and there must never be one: falling back would ship different art
under your project's name, permanently, with the launch reporting success.

### The 666 example, end to end

666 is the only project that has been through this. Its runtime is registered on Robinhood Chain
(4663):

```text
runtime         0x09A3A77E82F9Eb5816C8EDC09Cc466a9c67B75c2
source          the project's own contract, verified on the chain's explorer and
                resolving by name against the deployed bytecode
size            24,284 bytes of the 24,576 available
mode            1  (SOLIDITY_SVG_V1)        version 1        maxOutputBytes 65,536

registered as   runtime id 2, under the project's own label, by a Safe transaction
                calling registerRuntime(2, 0x09A3...B75c2, <label>)
codehash pinned 0x9460329300b8b4e041d7f854ed303a5f25ac7fbf8e710f2ad18d8bdb649941e8

configuration   0x36363601 — four bytes, in the project's own format, not ACV1
                validateConfigV1(0x36363601) returns 0, meaning accepted

at launch       electing runtime 2 resolves to 0x09A3...B75c2
                electing 0 resolves to the generic runtime, unchanged for everyone else
after launch    the collection's own binding reports runtime id 2 at that codehash, with an
                artConfigHash equal to keccak256(0x36363601)
```

The last line is the part that matters: the bytes reviewed off chain are provably the bytes bound
on chain, and the collection renders through the elected runtime rather than the generic one.

Note that 666's four configuration bytes are not an ACV1 document — they are far too short and
carry no ACV1 magic — so the generic runtime refuses them, just as 666's runtime refuses an ACV1
document. That mutual refusal is deliberate. It is what stops one runtime's configuration being
launched onto the other.

For live platform addresses and the current state of each chain, ask the CLI rather than trusting a
page:

```bash
npm run kit:status
```

---

## Timeline, and what gets refused

**No turnaround is promised.** Review depth scales with the contract, the queue is not published,
and a request can sit. If you need a launch date, use the generic runtime, which requires no review
at all.

Refused without further review:

- Any runtime mode other than `SOLIDITY_SVG_V1`. The registry refuses the others in bytecode, so
  there is nothing to discuss until a published implementation change lands.
- A runtime that makes any external call, or that could be induced to make one.
- An owner, admin, setter, proxy, or any other path that changes what the contract draws.
- Output that is a link rather than art.
- A contract whose source is not verified on the explorer for every chain requested.
- A request that RELICS hold keys, deploy on your behalf, or register an address whose source you
  cannot show you control.

A refusal is about the contract, not about you or your project. The generic runtime stays open, it
needs no permission, and it is what nearly every project should be using.

---

## Where to go next

| | |
| --- | --- |
| [15 — The art runtime contract](../launchpad/15-art-runtimes.md) | what a runtime is handed, and what registration does not prove |
| [03 — Art runtimes](../launchpad/03-art-runtimes.md) | choosing a runtime as a creator |
| [The `.relics` project bundle](./bundle-format.md) | `artBinding`, and why approved is not launchable |
| [Getting started](./getting-started.md) | the generic path, end to end |
