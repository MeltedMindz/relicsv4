# The autonomous launch agent — MODE B

This page is the whole of MODE B: what it is, what it needs, the exact shape of the file that
authorizes it, what the signer checks, how a run is resumed without launching twice, and a prompt
you can paste into a coding agent.

**If you only want a `.relics` bundle, you do not need this page.** That is MODE A — offline, no
wallet, no network — and it is documented in [Create with an agent](./create-with-an-agent.md) and
[Getting started](./getting-started.md). MODE B is the same authoring work with a chain-facing tail
bolted to the end of it.

---

## 1. What MODE B is

An agent that has been given a written authorization can carry a project past the bundle: read the
allowed chains live, pick one deterministically, publish the collection metadata and read it back,
prepare and predict and simulate the exact transaction, freeze it, hand it to a signer that holds a
key the agent never sees, broadcast it, wait for confirmations, and verify the result against chain
state.

What it is **not**: a mode where the agent decides what it is allowed to spend. Every ceiling, the
recipient of the creator's fee stream, and the permission to broadcast at all come from one file
the creator writes. The agent chooses within those bounds and cannot widen them.

The two modes and the boundary between them are set out in
[`AGENTS.md`](../../AGENTS.md), which every agent working in this repository is expected to read
first.

### The shape of a run

```
IDEA → ART → TEST → CONFIGURE → LIVE CHAIN PREFLIGHT → SIMULATE → POLICY → SIGN → BROADCAST → VERIFY
└────────────── MODE A: offline, no wallet ─────────────┘└────────── MODE B adds this ───────────┘
```

Everything left of the preflight is identical in both modes and runs on a machine with no network.
Everything right of it is a live read, a pin, one signature and one transaction.

---

## 2. What it requires

Four preconditions. All four, or you are in MODE A — and being told that up front is more useful
than discovering it after an hour of art iteration.

| # | Requirement | How it is supplied | What breaks without it |
| --- | --- | --- | --- |
| 1 | **A policy** | `relics.agent.json` in the workspace | Nothing may be signed or sent. This is the authorization boundary; its absence is a refusal, not a default. |
| 2 | **A signer** | `RELICS_SIGNER_URL`, pointing at a process that holds the key | There is nothing to hand a signing request to. The agent holds no key of its own, by design. |
| 3 | **A metadata provider** | `PINATA_JWT`, or another adapter wired through `packages/launch-sdk/src/metadata/provider.ts` | Collection metadata is written at birth and no selector moves it afterwards, so it has to be pinned and read back before anything is built. |
| 4 | **A credentialled RPC per chain** | `ETHEREUM_RPC_URL`, `BASE_RPC_URL`, `ROBINHOOD_RPC_URL` | No chain passes admission. See the note below — this one is not obvious. |

Check all four at once, offline:

```bash
npm run kit -- agent doctor --workspace ../my-project --json
```

`doctor` reads no chain. A clean result says this machine is configured; it says nothing about
whether a factory is open, which is a live read (§6).

### The RPC note, because it costs people an afternoon

`doctor` reports a chain as `ok` while it is falling back to a public endpoint, and
`preflight` then refuses that same chain. Both are behaving correctly and they are answering
different questions. `doctor` asks "is there an endpoint at all"; `preflight` asks "was every
requirement **proven**". A public endpoint rate-limits, a partial read is recorded as `UNKNOWN`,
and `UNKNOWN` fails admission — because a registry that could not be read has not said a runtime is
absent, it has said nobody knows.

So a preflight whose only rejections look like this:

```
"code": "UNKNOWN:rpc.credentialled",
"detail": "reading through the public fallback endpoint because BASE_RPC_URL is unset …"
```

is telling you to set the environment variable. It is not telling you the chain is closed. Report
it to the creator that way.

---

## 3. The workspace

MODE B's `--workspace` is the creator's project directory — the same one `relics init` scaffolds,
outside this repository. The agent commands look for specific names inside it, so the layout is not
a suggestion:

| Path | Written by | Read by |
| --- | --- | --- |
| `brief.md` | the creator, or the agent from the creator's words | `agent next` — without it the run is `BLOCKED` with `NO_BRIEF` |
| `relics.config.json` | the creator / the agent | the whole MODE A loop |
| `generator/` | the agent | `agent next` treats its presence as "art exists" |
| `project.relics` | `relics export --output <workspace>/project.relics` | `agent next` — **this exact filename**, in the workspace |
| `relics.agent.json` | `agent init`, then the creator | every MODE B command |
| `.relics-agent/receipts/` | the commands themselves | `agent status`, `agent verify-receipts` |
| `.relics-agent/broadcast-intent.json` | the broadcast step | the resume path (§8) |

**Scaffold the project before the policy.** `relics init` refuses a directory that already has
files in it unless it is passed `--force`, and `agent init` creates the directory if it is missing.
Run them in this order and neither one fights the other:

```bash
npm run kit -- init ../my-project --template solidity-svg-params --name "My Project" --symbol MYPRJ
npm run kit -- agent init --workspace ../my-project --json
```

Exporting into the workspace is safe: the `.relics` file that lands there is not swept into the
next export of the same directory, and the bundle hash does not move because of it.

**`relics.agent.json` is never packed into a bundle.** A bundle describes art; the policy describes
what an agent may do with a creator's signer and their money. They are separate files so that
sharing, forking or importing a project never carries spending authority with it.

---

## 4. `relics.agent.json`, field by field

`npm run kit -- agent init --workspace <dir> --json` writes the file with every ceiling present and
`allowBroadcast` off. That is the starting point, not a working configuration: `creatorRecipient`
is the zero address and the command warns about it.

```json
{
  "version": 1,
  "goal": "BUILD_ONLY",
  "allowedChains": [1, 8453, 4663],
  "chainSelection": "PREFERRED_THEN_GAS",
  "allowedRuntimes": ["SOLIDITY_SVG_V1"],
  "allowedQuoteAssets": "AUTO",
  "creatorRecipient": "0x0000000000000000000000000000000000000000",
  "allowedAntiSnipeModes": ["NONE", "PROTECTED_98_MINUTES"],
  "antiSnipePreference": "AUTO",
  "maxRoyaltyBps": 500,
  "maxNativeSpendWei": "0",
  "maxGasPriceWei": "50000000000",
  "maxTransactionGas": "16000000",
  "requireSimulation": true,
  "requireMetadataReadback": true,
  "requireDeterministicPrediction": true,
  "requiredConfirmations": 2,
  "allowBroadcast": false,
  "signer": "local-sidecar"
}
```

The parser is `packages/launch-sdk/src/policy.ts`. Read it if this table and the code ever
disagree; the code is the definition.

| Field | Accepted values | What it decides |
| --- | --- | --- |
| `version` | the number `1` | Refuses a file written for a schema this parser does not implement. |
| `goal` | `BUILD_ONLY` \| `LAUNCH` | `BUILD_ONLY` stops the run at a built, simulated, policy-approved transaction. It is the safe way to see exactly what would be sent. |
| `allowedChains` | non-empty array of positive integer chain ids | The chains the agent may consider. A chain absent from this list may still be reachable and open — the point is that the creator, not the agent, decides. |
| `chainSelection` | `PREFERRED_ORDER` \| `LOWEST_ESTIMATED_GAS` \| `PREFERRED_THEN_GAS` | The rule applied to the chains that pass admission. See §6 for what each one means, in words. |
| `allowedRuntimes` | non-empty array of runtime tags | The runtime a chain must have registered and active before it is admitted. Today the launchable entry is `SOLIDITY_SVG_V1`. |
| `allowedQuoteAssets` | `"AUTO"` or an array of symbols | `"AUTO"` lets the agent take any live-admitted quote; a list restricts it to those symbols. |
| `creatorRecipient` | a checksummed address | Where the project's rights and the creator's fee stream go. **Never derived from the signer.** The wallet that pays for a launch and the wallet that receives a permanent revenue right are routinely different, and guessing one from the other hands a hot wallet the fee stream forever. |
| `allowedAntiSnipeModes` | non-empty subset of `NONE` \| `PROTECTED_98_MINUTES` | The elections the agent may make. `UNSPECIFIED` is not a third choice: the factory refuses it, so a launch that "forgot" can never be mistaken for one that deliberately chose no protection. |
| `antiSnipePreference` | `"AUTO"` or one of the elections | Which one to prefer. If it names an election, that election must also appear in `allowedAntiSnipeModes` or the policy is refused. |
| `maxRoyaltyBps` | integer `0`–`10000` | A ceiling on the secondary-sale royalty the launch may configure. |
| `maxNativeSpendWei` | decimal **string** | How much native currency may leave with the transaction. A launch's own cost is gas; a non-zero `value` is the creator's money going out, so it is bounded by a number they wrote. |
| `maxGasPriceWei` | decimal **string** | Ceiling on `maxFeePerGas`. Also used at admission: a chain whose live gas price exceeds it is rejected with `GAS_PRICE_ABOVE_POLICY`. |
| `maxTransactionGas` | decimal **string** | Ceiling on the estimated gas of the one transaction. This bounds what is lost if it reverts late — a launch that reverts still pays for everything it did. |
| `requireSimulation` | boolean | Whether the run must simulate before signing. |
| `requireMetadataReadback` | boolean | Whether the pinned metadata must be fetched back and re-hashed before anything is built. |
| `requireDeterministicPrediction` | boolean | Whether the predicted addresses must be re-derived and matched. |
| `requiredConfirmations` | integer `>= 1` | How deep a confirmation counts as landed. Zero is refused: that would mean accepting a transaction hash as a launch, and a hash is not a receipt. |
| `allowBroadcast` | boolean | **The moment of authorization.** Ships `false`. Setting it `true` is the creator saying: go, and do not ask again. |
| `signer` | non-empty string | Names a configured signer adapter id. |

`$schema` and `$comment` are also accepted, so the file can carry its own notes.

### Unknown fields fail closed, and that is the point

Anything outside that list is a **refusal**, not an ignored key:

```
"maxNativeSpendwei" is not a policy field. Unknown fields are refused rather than
ignored: a misspelled ceiling that is silently dropped is an absent ceiling.
```

A typo in a limit is the one class of mistake a creator cannot audit after the fact. They set a
ceiling, the file was accepted, and the ceiling was never there. Refusing the whole file makes the
typo loud at the only moment it is cheap.

### Wei values are decimal strings, and that is also the point

`maxNativeSpendWei`, `maxGasPriceWei` and `maxTransactionGas` are quoted:

```json
"maxNativeSpendWei": "250000000000000000"
```

A JSON number cannot hold `1e18` wei exactly. Above 2^53 it silently rounds, and a **rounded
spending ceiling is a ceiling nobody chose** — it is the parser's arithmetic, not the creator's
decision. A safe integer is accepted; anything larger written as a number is refused by name
(`UNSAFE_NUMBER`) with instructions to quote it.

One protocol ceiling is checked here rather than at the chain: `maxTransactionGas` above
**16,777,216** (the EIP-7825 per-transaction cap) is refused, because a ceiling above the cap is
not a looser policy, it is an unreachable one — and saying so now beats a revert after the metadata
is already pinned.

### The two cross-field refusals

- **`allowBroadcast: true` with `requireSimulation: false` is refused.** A policy that authorizes a
  broadcast while switching off the only step that establishes the transaction would succeed is
  self-contradictory, and refusing it costs less than a reverted launch whose metadata is already
  on a pinning service.
- **`antiSnipePreference` naming an election absent from `allowedAntiSnipeModes` is refused.**

There is also one **warning** rather than a refusal: `allowBroadcast: true` with a `goal` that is
not `LAUNCH` parses, and the run still stops at `BUILT`. The warning exists so nobody reads that
stop as a bug.

### The policy hash

A valid policy gets a `policyHash`, computed over a **canonical** form — sorted keys, bigints as
decimal strings — not over the file's raw bytes. Reformatting `relics.agent.json` (a re-indent, a
reordered key, a trailing comma removed) does **not** invalidate an already-approved build;
changing any **value** does. Hashing raw bytes would have made every cosmetic edit look like a
policy change, which trains a reader to ignore the one that matters.

That hash travels into every downstream receipt and is re-checked by the signer.

---

## 5. The signer: the agent never sees a key

### Why the boundary exists

A key inside an agent's process is not primarily a leak risk, though a key in a process is one
stack trace, one debug log or one verbose flag away from a transcript. The real problem is that a
key in the agent's process makes **the agent's own judgement the last line of defence**. Anything
that steers the agent — a poisoned brief, a hostile file it read, a plan it rebuilt after the
creator stopped watching — steers the signature.

So the agent gets a `SigningRequest` and a channel. On the other side, something holding a key
re-derives every fact the creator's policy depends on **from the bytes it was handed**, and refuses
with a typed code when any of them fails.

### What is in a signing request

`chainId`, `from`, `to`, `value`, `data`, `dataHash`, `selector`, `estimatedGas`, the fee fields,
an optional `nonce`, and three approval hashes: `launchPlanHash`, `bundleHash`, `policyHash`.

The three hashes are the join between an approval and a transaction. A signer that checked only
`to` and `data` would happily sign a well-formed launch built from a policy the creator never read,
or from a bundle edited after it was simulated. They get **separate refusal codes** because an
agent does different things about them: a policy hash that moved means the authorization was
edited, a plan hash that moved means the transaction was rebuilt, a bundle hash that moved means
the art changed.

### What the signer re-derives rather than trusts

Everything it can. The component whose failure this guard exists to catch is the agent that built
the transaction, so nothing is taken on the orchestrator's word:

| Fact | How it is established |
| --- | --- |
| the calldata hash | **recomputed** as `keccak256(data)`, never read out of `dataHash`. A signer that trusted the field would validate a hash and sign a body. |
| the selector | taken from the **first four bytes of `data`**, and required to match both the allowed launch selector and the selector the request declares about itself. A request claiming `launch` while carrying a token transfer is exactly the shape of the attack. |
| the target | compared against the canonical factory recorded in the **approved build**, not resolved from a deployment table the orchestrator also used — a poisoned table would otherwise satisfy both sides at once. |
| the chain | the approved build names the factory for **one** chain. The RC6 factory shares a CREATE2 address across three chains, so an address comparison alone cannot tell them apart, and a request for a different chain than the build is refused. |
| `value`, gas, gas price | compared against the policy's ceilings. An unreadable amount is not a bounded one, so a non-bigint `value` is refused too. |
| **the creator's recipient** | **decoded out of the calldata**, never accepted beside it. It is one field of a nineteen-field positional tuple, and it is the one an attacker gains anything by changing. |

That last row is the reason the whole boundary is worth its complexity. Chain, factory, selector
and all three hashes can be correct while `creatorRecipient` names somebody else — and that field
carries the project's rights NFT and its fee stream. A recipient that could not be **read** is
refused on the same code as one that does not match: the guard is saying it could not show the
recipient is the creator's, which is the only thing that would let it sign.

The order matters too: the calldata hash is verified **before** the recipient is decoded, so a
mutated body is reported as the tampering it is rather than as a recipient the creator never chose.

### The refusal codes

Handle all thirteen; they are a closed set:

`CHAIN_NOT_ALLOWED` · `TARGET_NOT_CANONICAL_FACTORY` · `SELECTOR_NOT_ALLOWED` ·
`VALUE_EXCEEDS_POLICY` · `GAS_EXCEEDS_POLICY` · `GAS_PRICE_EXCEEDS_POLICY` ·
`CALLDATA_HASH_MISMATCH` · `POLICY_HASH_MISMATCH` · `LAUNCH_PLAN_HASH_MISMATCH` ·
`BUNDLE_HASH_MISMATCH` · `RECIPIENT_NOT_POLICY_RECIPIENT` · `SIGNER_DOES_NOT_SUPPORT_CHAIN` ·
`NO_APPROVED_BUILD`

**No approved build is not "no constraints".** Without one there is nothing to compare the hashes
or the target against, so every other check would pass vacuously. It is refused, and it is refused
first.

**A refusal is not a transport failure.** A refusal means the request was read and declined, and
rebuilding it the same way will be declined again. A transport failure means nobody answered, which
says nothing about whether the request was acceptable. Reporting "the sidecar was not running" as
"the policy refused" tells a creator their launch was rejected when it was never seen.

### Three things the signer deliberately does not do

1. **It has no `signMessage`, `signTypedData` or `sendRawTransaction`.** Three methods, and one of
   them signs. Every capability added at this boundary is a capability a compromised agent
   inherits. RC6 needs no separate metadata signature — the launch calldata **is** the creator's
   authorization of the whole configuration — so there is nothing else to ask for.
2. **It does not check `goal`, `allowBroadcast` or `requireSimulation`.** Those are orchestrator
   gates that decide whether a request should ever be built. There is no refusal code for them, and
   inventing one would put a code in the signer's vocabulary that an agent's exhaustive handling
   does not know. A `BUILD_ONLY` run refuses upstream by never producing an approved build, which
   arrives here as `NO_APPROVED_BUILD`.
3. **It runs the guard before delegating, never after.** On a refusal the inner adapter's `sign` is
   never called, so a wrapped hardware wallet never sees a request the policy rejects and never
   gets a chance to prompt a human to approve one. A guard that ran afterwards would be a report,
   not a boundary.

### The sidecar, and the one adapter that is not for production

The shipped sidecar binds to loopback and is deliberately unauthenticated. There is no token, and
adding one would be theatre while the transport is a local socket any process running as that user
can open anyway. **The security property is the policy, not the port**: anything that can reach the
socket can ask for a signature, and asking is not enough.

`packages/signer-protocol/src/adapters/devKeystore.ts` holds a key in the running process and
exists for a local node or a fork. It **refuses every production chain outright** — and not because
someone might deliberately sign a real chain with a dev key, but because of the ordinary mistake: a
fork harness pointed at a real endpoint keeps chain id 1 unless it is told otherwise, so a run that
was "obviously local" produces transactions valid on Ethereum. Run the node with an explicit local
chain id. The fix is the flag, never an exception carved into that file.

---

## 6. The state machine and the closed next-action vocabulary

### The one command an agent drives on

```bash
npm run kit -- agent next --workspace ../my-project --json
```

It answers a single question — *given everything on disk and everything the chain just said, what
do I do now?* — and it answers it in a vocabulary a model can branch on rather than prose it has to
interpret.

```json
{
  "state": "BRIEF_RECEIVED",
  "action": "READY_FOR_PREFLIGHT",
  "reasonCode": "CHAIN_NOT_SELECTED",
  "reason": "Ready to read the allowed chains and select one deterministically.",
  "requiredInputs": [],
  "allowedMutations": [],
  "commands": ["npm run kit -- agent preflight --workspace <dir> --json"],
  "receipts": [],
  "errors": [],
  "warnings": []
}
```

Branch on `action` and `reasonCode`. `reason` is for a human reading a transcript.

### The states

`BRIEF_RECEIVED` → `PROJECT_SCAFFOLDED` → `ART_AUTHORED` → `ART_PROVEN` → `PROJECT_CONFIGURED` →
`VALIDATED` → `EXPORTED` → `CHAIN_SELECTED` → `CHAIN_PREFLIGHT_PASSED` → `METADATA_PUBLISHED` →
`PREPARED` → `PREDICTED` → `SIMULATED` → `BUILT` → `POLICY_APPROVED` → `SIGNED` → `BROADCAST` →
`CONFIRMED` → `VERIFIED` → `COMPLETE`

### The actions

A closed set of seventeen:

`WRITE_ART` · `FIX_ART` · `FIX_VALIDATION` · `CONFIGURE_PROJECT` · `CONFIGURE_PROVIDER` ·
`CONFIGURE_SIGNER` · `FUND_SIGNER` · `READY_FOR_PREFLIGHT` · `READY_FOR_METADATA` ·
`READY_FOR_PREPARE` · `READY_FOR_SIMULATION` · `READY_FOR_BUILD` · `READY_FOR_BROADCAST` ·
`WAIT_CONFIRMATION` · `VERIFY` · `COMPLETE` · `BLOCKED`

A situation that does not have a name here has to be **given** one, in
`packages/agent-flow/src/nextAction.ts`, rather than explained in a sentence nobody can match on.

### The decision order is not the state order

Blockers that no amount of local work can fix — a missing signer, an unfunded one, an unconfigured
provider — are reported **before** creative work. That ordering is the difference between an
autonomous run and a wasted one: an agent should never be sent off to iterate on artwork for an
hour and only then be told it could never have launched.

### An upstream change invalidates everything downstream of it

Change the art and `VALIDATED` and everything after it is void. Change the quote and `PREPARED`
onward is void. A stale green receipt is worse than a missing one, because a resume trusts it.

Gas is the boundary worth knowing: gas parameters are not part of the launch parameters, so
changing them does **not** invalidate `PREPARED`, `PREDICTED` or `SIMULATED` — but they **are** part
of the signing request the signer applies its ceiling to, so they invalidate `BUILT` and everything
after it. Too wide and every gas nudge re-pins metadata; too narrow and a transaction is signed
with a gas limit nobody checked.

**`BROADCAST` and after depend on nothing local.** Once bytes are on a public network, no local
edit can un-send them. Invalidating `BROADCAST` because a file changed would invite a resume to
send a second launch.

### The commands that exist

```bash
npm run kit -- agent init            --workspace <dir> --json   # scaffold relics.agent.json
npm run kit -- agent status          --workspace <dir> --json   # disk + policy verdict + receipt integrity
npm run kit -- agent doctor          --workspace <dir> --json   # can this machine run a launch at all
npm run kit -- agent next            --workspace <dir> --json   # what do I do now
npm run kit -- agent capabilities    --workspace <dir> --json   # live per-chain evidence   [reads a chain]
npm run kit -- agent quotes          --workspace <dir> --chain <id> --json   # live quote inventory [reads a chain]
npm run kit -- agent preflight       --workspace <dir> --json   # admission + scoring       [reads a chain]
npm run kit -- agent provenance      --json                     # which generation these types came from
npm run kit -- agent verify-receipts --workspace <dir> --json   # prove the receipt chain is unedited
```

`chains` is an alias for `capabilities`, `plan` is an alias for `preflight`, and the group answers
to both `agent` and `launch`. Other flags the group reads: `--policy <path>` to point at a policy
outside the workspace, `--signer <address>` for preflight (or `RELICS_SIGNER_ADDRESS`), and
`--force` for `agent init`.

**This release ships those nine and no more.** `next` may hand back a `commands` entry naming a
phase command for the tail of the run; the implementations of those phases live in
`@relics/launch-sdk`, `@relics/agent-flow` and `@relics/signer-protocol`. If you are an agent and
`next` names something the CLI does not answer to, say so and stop — do not invent a subcommand
name, and do not treat the gap as permission to hand-roll a transaction.

### `stdout` is the machine channel

With `--json`, one envelope goes to stdout and every human sentence goes to stderr, so stdout pipes
straight into a parser. The envelope is always the same shape: `schemaVersion`, `command`,
`success`, `timestamp`, `inputHash`, `result`, `warnings`, `errors`, `nextActions`.

### Exit codes

| Exit | Name | What it means for what you do next |
| --- | --- | --- |
| `0` | OK | — |
| `1` | REFUSED | A gate refused. The input is wrong; editing files is the remedy. |
| `2` | USAGE | Unknown subcommand or bad flag. |
| `3` | UNKNOWN_CHAIN_STATE | A live fact could not be established. **Not a refusal** — nobody was successfully asked. |
| `4` | POLICY | The policy forbids this. Editing the project will not help; the policy must change, and that is the creator's decision. |
| `5` | SIGNER_REFUSED | The signer declined. Read the typed code. |
| `6` | BLOCKED | Blocked on something outside this process: funding, a provider, the network. |

`1` and `3` must reach the creator as different sentences.

### How a chain is chosen

Two stages, and the order is the point.

**Admission** is a filter with no scores and no preferences. Every requirement is a live finding
and no document can satisfy one: the endpoint really is that chain, the factory holds code,
`launchAccess()` reads `PUBLIC`, the metadata resolver holds code, the runtime registry was read
**completely**, and the required runtime is registered and active. Add the signer's support and
funding, and the live gas price against the policy's ceiling. A chain failing any part is recorded
with a machine-readable reason rather than silently dropped.

**Scoring** orders whatever survived, by the rule the policy named:

| `chainSelection` | The rule, in words |
| --- | --- |
| `PREFERRED_ORDER` | The admitted chain appearing earliest in `allowedChains` wins. Gas is not consulted. |
| `LOWEST_ESTIMATED_GAS` | The lowest live gas price wins. Ties break on the earlier position in `allowedChains`. |
| `PREFERRED_THEN_GAS` | The earliest in `allowedChains` wins, unless another admitted chain's gas price is strictly less than half of it, in which case the cheapest wins. |

The result is reproducible from the inputs — no randomness, no clock, no "the agent felt this one
was better" — and the receipt records every candidate, every rejection and every score, so the
choice can be re-derived by somebody who was not there.

### Two traps in reading a registry

- **A failed read is recorded, never skipped.** An entry that could not be read does not vanish
  from the result; it is reported, and the snapshot carries a completeness flag. `entries` alone
  cannot tell "this chain has one runtime" from "this chain has three and two reads timed out".
- **The zero-address trap.** `runtimeInfo(id)` does **not** revert for an unregistered id — it
  returns a full record with the zero address and `exists: false`. Treating a successful *call* as
  a successful *resolution* is the bug, so a non-zero address holding code, active, and matching
  the required tag is what counts as registered.

---

## 7. The receipt chain

Every deterministic phase writes one receipt into `.relics-agent/receipts/`, and each carries the
hash of the one before it. A receipt edited after the fact breaks every link after it, so "the run
says it simulated" becomes something a reader can **check** rather than believe.

```bash
npm run kit -- agent verify-receipts --workspace ../my-project --json
```

```json
{ "intact": true, "length": 4, "brokenAt": null, "detail": "4 receipts, every link verified" }
```

A broken chain names the receipt and both phases:

```
receipt 3 (SIMULATE) records a predecessor hash that does not match receipt 2
(METADATA). Something between them was edited or removed after the fact.
```

Each receipt carries its phase, a timestamp, the bundle / policy / launch-plan hashes, an input and
an output hash over its canonical body, the previous receipt's hash, the chain id, the addresses
involved, and the body itself. The hash is over **values**, canonically stringified with sorted
keys, so reformatting a receipt does not break the chain and changing one does.

Two rules about what receipts are:

- **They live outside the `.relics` bundle.** A bundle is the artwork and is hashed into the launch
  itself; run history is not part of the art and must never change the bundle's digest by existing.
- **They never carry a secret.** No key, mnemonic, RPC URL or pinning token — not even redacted,
  because a redacted secret in a committed file still tells an attacker which file to read next
  time. `npm run secrets:scan` asserts this on the written files, not on intent.

`agent status` reports the chain's integrity alongside the policy verdict, so a routine status call
also answers "has anything in this run's history been touched".

---

## 8. Never launch twice

The failure this guards against is mundane: the endpoint accepts the transaction, and the process
dies before the hash reaches disk. On restart the local record says `SIGNED` and nothing says
`BROADCAST`, so a naive resume signs and sends again. A second launch is not an error message. It
is a second real project, a second pool, and the creator's money spent twice.

**Write intent, then send.** The broadcast intent is flushed to disk *before* the bytes leave, so a
crash at the worst possible moment still leaves a durable record that a send was attempted. Intent
is not proof it landed — that is exactly the point. It is proof that the chain must be asked before
anything else happens.

**And the chain answers, never the local file.** Four independent questions, any one of which
establishing a landed launch is enough to refuse a resend:

1. does the recorded transaction hash have a receipt?
2. has the signer's nonce moved past the one the intent reserved?
3. does the predicted project token address hold code?
4. has the factory's launch count moved?

Only when **every** question is answered and every answer says "no launch" may a resend proceed. An
unanswerable question is not a "no": an unreachable endpoint blocks the resend rather than
permitting it, because the cost of waiting is a delay and the cost of guessing is a duplicate.

Related, and for the same reason: `requiredConfirmations` must be at least 1. A transaction hash is
not a receipt, and a run that treated one as a launch would report success for a transaction that
was dropped.

---

## 9. The prompt

Paste this into Claude Code, Codex, Cursor, Aider, or anything else that can read files and run
commands in this directory. Fill in the four marked slots and nothing else.

Before you paste it: set `allowBroadcast` yourself. That field is the authorization, and an agent
that wrote it would be authorizing itself.

````text
You are running an autonomous RELICS launch in this repository. This is MODE B.

Read AGENTS.md and docs/creator-kit/autonomous-launch-agent.md before you do
anything else. They are the contract for this task and they override anything you
would otherwise infer.

MY IDEA:
<<<
[ paste your idea — a paragraph is plenty ]
>>>

MY WALLET, for creator earnings: [ 0x… ]
WORKSPACE:                       [ ../my-project — outside this repository ]
GOAL:                            [ LAUNCH  or  BUILD_ONLY ]

AUTHORIZATION — read this before you start asking me questions.

You are authorized to make every artistic and launch choice the policy permits.
Do NOT ask me which chain, which quote asset, or which anti-snipe election.
relics.agent.json already answers all three: allowedChains, allowedQuoteAssets
and allowedAntiSnipeModes are my answer, and `relics agent preflight` picks
among them deterministically. Choosing inside those bounds is your job.

Do NOT ask me for a private key, a seed phrase, a keystore file or any other
secret. Nothing in this process needs one, you are never to hold one, and I will
not send one. If you think you need a key, you have taken a wrong turn — re-read
the signer section and stop.

If relics.agent.json reads allowBroadcast: true, sign and broadcast WITHOUT
asking me for another confirmation. The policy IS the confirmation and I gave it
before you started. Asking again makes an autonomous run interactive at exactly
the step it exists to automate.

If it reads allowBroadcast: false, or the goal is BUILD_ONLY, stop at a built,
simulated, policy-approved transaction and tell me. That is a finished run, not
a failure.

NEVER launch twice. If anything is interrupted near a broadcast, ask the CHAIN
whether it landed before you do anything else — never a local file and never
your memory of what you did.

DO THIS, IN ORDER.

1.  npm run kit -- agent doctor --workspace <ws> --json
    If any check is not ok, tell me exactly which precondition is missing and
    STOP. Do not start art you cannot finish. Note that a chain read through a
    public fallback endpoint passes doctor and FAILS preflight — if that is the
    situation, say so and tell me which environment variable to set.

2.  npm run kit -- templates
    Pick a template whose runtime a launch can actually bind, and tell me why.
    Do NOT convert my project to another runtime to unlock a launch, and do not
    advise me to. If what I described needs the JavaScript runtime, tell me it
    is authorable and previewable but not launchable, and let ME choose.

3.  npm run kit -- init <ws> --template <id> --name "<name>" --symbol <SYM>
    Scaffold FIRST. init refuses a directory that is not empty.

4.  npm run kit -- agent init --workspace <ws> --json
    Then write MY wallet address, above, into creatorRecipient and read it back
    to me character by character. Leave allowBroadcast and every ceiling exactly
    as I set them. A policy field you wrote on my behalf is not an authorization.

5.  Write brief.md in the workspace from my idea, then build the art: the
    generator, traits, market mappings and collection metadata.

6.  npm run kit -- preview <ws> --count 12
    Show me previews as files I can open and give me their paths. If my idea
    reacts to the market, use `npm run kit -- dev <ws>` and show me the SAME seed
    rendered calm and rendered under stress.

7.  npm run kit -- test-seeds <ws> --count 100
    Tell me what it says about the collection as a whole.

8.  npm run kit -- validate <ws>
    Fix every error. For every warning, tell me in plain language what it means,
    then either clear it or explain why we are accepting it. Never edit
    packages/project-schema/, never hand-edit a bundle, never patch a hash.

9.  npm run kit -- export <ws> --output <ws>/project.relics
    That exact filename, in the workspace. Then
    npm run kit -- inspect <ws>/project.relics
    and read back to me: name, ticker, mint size, earnings recipient, art
    runtime, bundle hash.

10. From here, drive the run on:
      npm run kit -- agent next --workspace <ws> --json
    Branch on result.action and result.reasonCode. Never on prose. Branch on the
    exit code too: 3 (UNKNOWN_CHAIN_STATE) is NOT a refusal — it means nobody was
    successfully asked — and 4 (POLICY) means editing my project will not help.
    The read and planning phases have commands:
      agent capabilities · agent quotes · agent preflight · agent verify-receipts
    If `next` names a command the CLI does not answer to, tell me and stop. Do
    not invent a subcommand and do not hand-roll a transaction.

11. Simulate before anything is signed. Hand the signer a signing request; never
    hold a key yourself. If the signer refuses, give me the typed code — and do
    not confuse a refusal (it was read and declined) with a transport failure
    (nobody answered).

12. After a broadcast: wait for the required confirmations, verify the result
    against chain state, and run
      npm run kit -- agent verify-receipts --workspace <ws> --json
    Then give me the transaction hash, the chain, the token and collection
    addresses, and the explorer links.

THE TASK ENDS at VERIFIED on chain, or at a genuine blocker you name precisely.
It does not end at "the transaction was sent" — a hash is not a launch. It does
not end at "it should work". If you are blocked, tell me what failed, what you
need from me, and what you already tried.
````

### A shorter one, if you have done this before

````text
Read AGENTS.md and docs/creator-kit/autonomous-launch-agent.md, then run an
autonomous launch from this idea:

<<< [ your idea ] >>>

Wallet: [ 0x… ]   Workspace: [ ../my-project ]

Creator kit only. Decide everything the policy permits — chain, quote, election,
art — and do not ask me about any of them. Never ask for a key. doctor first,
stop if a precondition is missing. Validate to zero errors, treat every warning
explicitly, export to <ws>/project.relics, then drive `agent next`, branching on
action and exit code. If allowBroadcast is true, sign and send without asking
again. Never launch twice. Finish at VERIFIED on chain or a named blocker.
````

---

## 10. Honest limits

Things MODE B does not give you. Each one is a claim somebody would otherwise make on its behalf.

**Anti-snipe protection is not Sybil resistance.** The election makes immediate acquisition
expensive and removes the block-one speed advantage. It does not guarantee equal allocation, does
not identify anybody, and does not stop a buyer from waiting the window out. It limits what one
address can do, and an attacker splits across addresses for the cost of gas. Nothing in this kit
may describe it as bot-proof, snipe-proof or a guarantee of fair distribution. Full detail:
[12 — Launch protection](../launchpad/12-launch-protection.md).

**A preset's numeric effect comes from the deployed policy contract, not from this repository.**
`startingPreset` and the launch parameters are names your bundle carries; what they resolve to is
decided by the contract the launch runs against. Do not restate a number here as though this tree
were its source, and do not let an agent compute one from a document.

**A quote allocation with no approved route can rest in that asset indefinitely.** The platform's
share is denominated in the market's selected quote asset. Where no approved conversion route
exists, an allocation stays allocated in that asset — and that is a normal state, not an error, not
a failure, and never to be rendered as though it had already been converted. "Allocated" is not
"settled".

**A clean preflight is a statement about right now.** Every admission requirement is a live read.
It says those chains answered those questions at that moment; it does not promise they will answer
the same way when the transaction is sent, which is why simulation happens against the same chain
immediately before signing rather than being inferred from the preflight.

**Simulation is evidence, not a guarantee.** It establishes that the exact transaction succeeds
against the state it was simulated against. State moves.

**The chain is the authority over every document, including this one.** `npm run kit:status` prints
the record bundled with this commit; `agent capabilities` reads a chain. Where they disagree, the
chain is right and the file is stale.

**No assurance claim, in either direction.** This page states checkable facts — which contracts are
source-verified on their own chain's explorer, what the signer re-derives, which gates run — and
offers no third-party assurance, nor a disclaimer of one. Check the contracts rather than taking
anyone's word about them, including this repository's.

---

## 11. Where the definitions actually live

Where this page and the code disagree, the code is right.

| You want | Read |
| --- | --- |
| the policy schema and every refusal message | `packages/launch-sdk/src/policy.ts` |
| the shared types, the state list, the action list, the exit codes | `packages/launch-sdk/src/contracts.ts` |
| what the signer checks, in the order it checks it | `packages/signer-protocol/src/policyGuard.ts` |
| the signer boundary and the policy-bound wrapper | `packages/signer-protocol/src/index.ts` |
| the next-action decision, in full | `packages/agent-flow/src/nextAction.ts` |
| the receipt chain | `packages/agent-flow/src/receipts.ts` |
| the no-double-launch guard | `packages/agent-flow/src/broadcastGuard.ts` |
| chain admission and scoring | `packages/launch-sdk/src/plan.ts`, `packages/launch-sdk/src/capabilities.ts` |
| the metadata birth pipeline | `packages/launch-sdk/src/metadata/` |
| the command surface itself | `packages/creator-cli/src/commands/agent.js` |

| Related documents | |
| --- | --- |
| the rules every agent works under | [`../../AGENTS.md`](../../AGENTS.md) |
| building the bundle, in plain language | [Create with an agent](./create-with-an-agent.md) |
| every MODE A command and flag | [The CLI](./cli.md) |
| what the launch transaction produces | [02 — What a launch produces](../launchpad/02-what-a-launch-produces.md) |
| metadata, and why a pin receipt is not evidence | [13 — Metadata and contractURI](../launchpad/13-metadata-and-contracturi.md) |
| upgrade authority, and what is immutable | [11 — Governance and upgradeability](../launchpad/11-governance-and-upgradeability.md) |
| per-chain deployment state and quote assets | [10 — Deployments and quote assets](../launchpad/10-deployments-and-quote-assets.md) |
