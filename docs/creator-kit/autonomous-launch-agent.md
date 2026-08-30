# The autonomous launch agent — MODE B

This page is the whole of MODE B: what it is, what it needs, the one interactive session that
authorizes it, the exact shape of the files that carry that authorization, what the signer checks,
how a run is resumed without launching twice, and a prompt you can paste into a coding agent.

**If you want the four-line version, read §0 and stop there.** The rest of this page is why each
line is the way it is.

**If you only want a `.relics` bundle, you do not need this page.** That is MODE A — offline, no
wallet, no network — and it is documented in [Create with an agent](./create-with-an-agent.md) and
[Getting started](./getting-started.md). MODE B is the same authoring work with a chain-facing tail
bolted to the end of it.

---

## 0. The short version

Three commands, and only one of them is the agent's.

```bash
npm run kit -- agent setup                                   # you, once, at a terminal
npm run kit -- agent ready                                   # you or your agent: one status screen
npm run kit -- agent run --workspace ../my-project --json    # your agent: the whole launch
```

**`agent setup` is the wizard, and it is interactive on purpose.** It configures the launch wallet,
the address your creator earnings go to, the chains an agent may use, the metadata pinning
provider and the RPC endpoints, and it ends by granting an authorization. Anything secret — a
keystore passphrase, a provider token, a credentialled RPC URL — is asked for at a real terminal
prompt rather than through a flag, an environment variable or an agent's stdin. That is what makes
the next sentence true: an agent cannot run this step for you, and cannot read back what you typed.

**What you are authorizing:**

| Preset | What it permits |
| --- | --- |
| `BUILD_ONLY` | Everything up to a built, simulated, policy-approved transaction. Nothing is signed and nothing is sent. |
| `SAFE_AUTONOMOUS` | **One** launch. It expires — 24 hours unless you choose otherwise — and `agent revoke` ends it at any moment. Inside it, the agent picks the chain, the quote asset and the launch-protection election from what you allowed. |
| `CUSTOM` | You answer each bound yourself. |

**One spend limit, in ETH: the maximum network fee** you are willing to pay for the launch
transaction. It is stored as `maxTotalGasCostWei` and it is a **total** — gas limit × max fee per
gas — rather than two separate large ceilings whose product is a number you never chose. A gas
limit of 16,000,000 and a max fee of 50 gwei each look reasonable and multiply to 0.8 ETH.

**The wallet in the signer is a gas-only execution key.** Your earnings go to `creatorRecipient`,
which is a different address you name in setup — a cold wallet, a hardware wallet or a Safe — and
the launch wallet cannot spend from it. Keep gas in the launch wallet and nothing else; the design
assumes that key can be lost and that losing it costs the gas in it.

**The grant is bounded, expiring and revocable, and it lives with the signer.** It is spent by the
launch that uses it, so a second project needs a second grant. `agent revoke` ends it immediately
and the record is kept rather than deleted, so `agent ready` can say *why* it is refusing instead
of reporting an absence. An agent that edits either the grant or `relics.agent.json` invalidates
it — the fingerprint over the authority fields is what catches that — and you have to run setup
again.

**The wallet commands**: `npm run kit -- wallet create` · `unlock` · `lock` · `status` · `backup` ·
`list`. There is deliberately no command that prints a private key: an interface that can return
one is an interface an agent can be talked into calling. `backup` copies the keystore file, which
is already encrypted at rest, and a backup you cannot decrypt without the passphrase is the point.

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
IDEA → ART → TEST → CONFIGURE → LIVE CHAIN PREFLIGHT → VISUAL REVIEW → SIMULATE → POLICY → SIGN → BROADCAST → VERIFY
└────────────── MODE A: offline, no wallet ─────────────┘└──────────────────── MODE B adds this ────────────────────┘
```

Everything left of the preflight is identical in both modes and runs on a machine with no network.
Everything right of it is a live read, a pin, one signature and one transaction.

**The visual review is not a formality between the preflight and the pin.** It is the step that
stops the run from being `CREATE → VALIDATE → LAUNCH`. `TEST` above settles what a machine can
settle — the configuration is legal, deterministic, in budget, byte-distinct across market states —
and every one of those is also true of a configuration that draws the wrong thing. One did: a
variant that read as industrial crates and scaffolding full of confetti, against a brief asking for
botanical work, cleared every gate this repository had, because nothing looked. See §6a.

---

## 2. What it requires

Four preconditions plus a live authorization, and being told up front which one is missing is more
useful than discovering it after an hour of art iteration.

**All of them are configured in one place — `npm run kit -- agent setup` (§0).** The table below is
what that session produces, and it is written out here because a precondition you can only satisfy
through a wizard is a precondition you cannot debug.

| # | Requirement | How it is supplied | What breaks without it |
| --- | --- | --- | --- |
| 1 | **A policy** | `relics.agent.json` in the workspace | Nothing may be signed or sent. This is the authorization boundary; its absence is a refusal, not a default. |
| 2 | **A signer** | `RELICS_SIGNER_URL`, pointing at a process that holds the key | There is nothing to hand a signing request to. The agent holds no key of its own, by design. |
| 3 | **A metadata provider** | `PINATA_JWT`, or `RELICS_METADATA_PROVIDER` naming another adapter wired through `packages/launch-sdk/src/metadata/provider.ts` | Collection metadata is written at birth and no selector moves it afterwards, so it has to be pinned and read back before anything is built. |
| 4 | **A credentialled RPC per chain** | `ETHEREUM_RPC_URL`, `BASE_RPC_URL`, `ROBINHOOD_RPC_URL` | No chain passes admission. See the note below — this one is not obvious. |

Plus the fifth, which is not a machine fact: **a live authorization.** A grant that has expired,
been revoked or already been spent is not a weaker authorization — it is none. The four states are
four different sentences, and only the creator can issue a new one.

Check all of it at once, offline:

```bash
npm run kit -- agent ready --json
```

`agent doctor --workspace ../my-project --json` is the older per-precondition view of the machine
half and still answers; it reads no chain at all. `ready` does read the allowed chains, and
`--offline` tells it not to. Two things follow. An unread chain comes back `UNKNOWN`, never
`MISSING` — those look alike on a screen and mean opposite things, and reporting the second as the
first invents a fact about a chain nobody asked. And every blocker `ready` prints carries an
**owner**: `AGENT_CAN_FIX`, `CREATOR_ACTION_REQUIRED`, `EXTERNAL_SERVICE` or `CHAIN_STATE`. That
field is what turns a checklist into a division of labour — without it an agent reads "metadata
document missing" and asks the creator to write one, when authoring metadata is the agent's entire
job.

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

**Two files carry the authorization and they are not interchangeable.** `relics.agent.json` sits in
the workspace and describes what a launch may look like — chains, runtimes, quotes, elections,
ceilings. The **grant** sits with the signer, outside the workspace, and describes what a human
agreed to: which preset, how many launches, until when, for which signer, and whether it has been
revoked. A shape is not a permission, and a permission is not a shape; separating them is what lets
"and only once, and only today, and I have changed my mind" exist at all.

`agent setup` writes both. `npm run kit -- agent init --workspace <dir> --json` writes only the
first, with every ceiling present and `allowBroadcast` off — the starting point for a hand-written
policy, not a working configuration: `creatorRecipient` is the zero address and the command warns
about it.

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

### The grant, and the one number you type in ETH

The grant is what `agent setup` produces at the end of the session. It records the preset, whether
it permits one launch or several, when it expires, when it was revoked if it was, the signer
address it was issued for, the creator recipient, the bounds the agent may choose inside, and the
launch plan hashes it has already spent. It also carries the hash of the policy it was issued
against, so a changed policy does not silently inherit an old permission.

**`maxTotalGasCostWei` is the ceiling that matters, and a human types it in ETH.** The wizard asks
for one number — the maximum network fee you will pay for this launch — and stores the total: gas
limit × max fee per gas. Two separate ceilings were the older shape and they multiply, which is how
a 16,000,000 gas limit and a 50 gwei max fee, each individually unremarkable, become 0.8 ETH that
nobody agreed to.

Three properties follow from where the grant lives rather than from anything an agent does:

- **It is spent by the launch that uses it**, recorded by launch plan hash. Re-signing the *same*
  launch after a crash is recognised as the same launch rather than counted twice, so the
  duplicate-launch guard (§8) and the single-use grant cannot disagree and strand a launch that
  actually landed.
- **It is bound to one signer address.** A grant presented by a different key is refused by name.
- **Revocation keeps the record.** A revoked grant is marked, not deleted, so `agent ready` reports
  *why* it is refusing instead of reporting an absence — and an absence and a revocation would
  otherwise look identical to a reader.

An agent must never edit either file. The grant's authority fields are fingerprinted, so widening
one is detectable; but detection after the fact is not the point. Editing it invalidates it, and
the creator has to run `agent setup` again.

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

`BRIEF_RECEIVED` → `PROJECT_SCAFFOLDED` → `ART_AUTHORED` → `ART_PROVEN` → `ART_ACCEPTED` →
`PROJECT_CONFIGURED` →
`VALIDATED` → `EXPORTED` → `CHAIN_SELECTED` → `CHAIN_PREFLIGHT_PASSED` → `METADATA_PUBLISHED` →
`PREPARED` → `PREDICTED` → `SIMULATED` → `BUILT` → `POLICY_APPROVED` → `SIGNED` → `BROADCAST` →
`CONFIRMED` → `VERIFIED` → `COMPLETE`

**`ART_PROVEN` and `ART_ACCEPTED` are different states and the difference is the point.** Proven is
what a machine settles. Accepted means a reviewer that was not the author looked at rendered images
and said so. A configuration reaching `ART_PROVEN` and being read as accepted is exactly the defect
§6a exists to close.

### The actions

A closed set of nineteen:

`SELECT_TEMPLATE` · `WRITE_ART` · `REVIEW_ART` · `FIX_ART` · `FIX_VALIDATION` · `CONFIGURE_PROJECT` · `CONFIGURE_PROVIDER` ·
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

**`ART_ACCEPTED` rests on the art AND on the brief**, which is why `BRIEF` is a facet of its own.
Brief fidelity is a gate in the visual review, so a changed brief invalidates the acceptance exactly
as a changed configuration does. Without that, retargeting the brief after acceptance would leave a
green receipt asserting fidelity to a document nobody reviewed against.

Gas is the boundary worth knowing: gas parameters are not part of the launch parameters, so
changing them does **not** invalidate `PREPARED`, `PREDICTED` or `SIMULATED` — but they **are** part
of the signing request the signer applies its ceiling to, so they invalidate `BUILT` and everything
after it. Too wide and every gas nudge re-pins metadata; too narrow and a transaction is signed
with a gas limit nobody checked.

**`BROADCAST` and after depend on nothing local.** Once bytes are on a public network, no local
edit can un-send them. Invalidating `BROADCAST` because a file changed would invite a resume to
send a second launch.

### The commands that exist

The `wallet` group is **not** under `agent`: `agent wallet …` is refused by name and points at the
real command. That namespace is the list a program is told to enumerate, and a human-only step on
it is a step an agent will try.

```bash
# --- the creator's, at a terminal. An agent runs none of these. ---
npm run kit -- agent setup                                      # the interactive wizard (§0)
npm run kit -- agent revoke                                     # end the authorization now
npm run kit -- wallet create                                    # top level, not under `agent`
npm run kit -- wallet unlock | lock | status | backup | list

# --- the read side. Safe for an agent, and none of these signs anything. ---
npm run kit -- agent ready           --json                     # one status screen: machine + grant + live chains
npm run kit -- agent ready           --offline --json           # the same screen, this machine only
npm run kit -- agent help            [<sub>]                    # the agent group's own help
npm run kit -- agent init            --workspace <dir> --json   # scaffold relics.agent.json
npm run kit -- agent status          --workspace <dir> --json   # disk + policy verdict + receipt integrity
npm run kit -- agent doctor          --workspace <dir> --json   # can this machine run a launch at all
npm run kit -- agent next            --workspace <dir> --json   # what do I do now
npm run kit -- agent capabilities    --workspace <dir> --json   # live per-chain evidence   [reads a chain]
npm run kit -- agent quotes          --workspace <dir> --chain <id> --json   # live quote inventory [reads a chain]
npm run kit -- agent preflight       --workspace <dir> --json   # admission + scoring       [reads a chain]
npm run kit -- agent art-review      --workspace <dir> --chain <id> --json   # render, sheet, package, judge  [reads a chain]
npm run kit -- agent art-review      --workspace <dir> --scaffold <RUNTIME>  # write a starting art.json
npm run kit -- agent provenance      --json                     # which generation these types came from
npm run kit -- agent verify-receipts --workspace <dir> --json   # prove the receipt chain is unedited

# --- the write side. Each is independently runnable and each writes a receipt. ---
npm run kit -- agent metadata        --workspace <dir> --json   # pin, fetch BACK, verify bytes  [writes to a provider]
npm run kit -- agent prepare         --workspace <dir> --json   # build the canonical LaunchParams
npm run kit -- agent predict         --workspace <dir> --signer <addr> --json  # the DEPLOYED factory's own answer [reads a chain]
npm run kit -- agent simulate        --workspace <dir> --signer <addr> --json  # real eth_call of the exact tx     [reads a chain]
npm run kit -- agent build           --workspace <dir> --json   # freeze the immutable SigningRequest
npm run kit -- agent policy-check    --workspace <dir> --json   # recompute policy from the FINAL calldata
npm run kit -- agent broadcast       --workspace <dir> --json   # sign through the scoped signer and send [WRITES A CHAIN]
npm run kit -- agent confirm         --workspace <dir> --json   # wait for a receipt with status 1        [reads a chain]
npm run kit -- agent verify          --workspace <dir> --json   # read the result back and compare        [reads a chain]
npm run kit -- agent resume          --workspace <dir> --json   # reconcile local state against the CHAIN [reads a chain]
npm run kit -- agent run             --workspace <dir> --json   # every phase above, in order, stopping at the first refusal
```

`agent metadata` takes `--dry-run` to use the in-memory provider: the fetch-back and byte
comparison really run, but nothing is pinned anywhere a third party can read. It is how you
exercise the pipeline without publishing.

`chains` is an alias for `capabilities`, `plan` is an alias for `preflight`, and the group answers
to both `agent` and `launch`. Other flags the group reads: `--policy <path>` to point at a policy
outside the workspace, `--signer <address>` for preflight (or `RELICS_SIGNER_ADDRESS`), and
`--force` for `agent init`.

**Every command `next` names is one the CLI answers to, and that is enforced rather than
promised.** `npm run agent:commands` derives the real surface from the dispatcher and compares it
against the next-action contract in both directions, so a `commands` entry naming a subcommand
nobody wrote fails the build. It exists because two of them did: `agent finalise` and
`agent art-check` were named by `next` and implemented nowhere, and an agent following `commands`
literally — which is the entire point of that field — got `unknown subcommand` and exit 2.

If you are an agent and `next` still names something the CLI does not answer to, say so and stop.
Do not invent a subcommand name, and do not treat the gap as permission to hand-roll a transaction.

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

## 6a. The visual review — the art gets looked at, and not by the thing that made it

### The defect this closes

The autonomous agent used to produce a configuration that was legal, deterministic, inside its
render budget and byte-distinct across every market state — and proceed. Each of those is a real
check that really passed, and none of them is a statement about what the picture depicts.

The pattern is older than one bad variant. Four separate times in this program a number was computed
correctly and the conclusion drawn from it was wrong: an occupancy bitmap that ranked seed diversity
backwards, a template mean of 4.85 that hid two structurally dead fields, byte-distinct renders that
turned out to be visually identical, and a pixelwise delta-E that ranked a rejected template above
three shipped ones. Every time, a person looking at a contact sheet was right in seconds. **Numeric
evidence said fine, visual review said bad, and visual review was right every time.**

### The loop

```
BRIEF → SELECT RUNTIME/TEMPLATE → CREATE CONFIG → RENDER → VISUAL REVIEW
      → CRITIQUE → MODIFY → RENDER AGAIN → OBJECTIVE TESTS
      → VISUAL ACCEPTANCE → VALIDATE → LAUNCH FLOW
```

### What gets reviewed, and where it comes from

`art.json` in the workspace: the creator configuration in symbolic form, which the runtime's own
encoder turns into the exact bytes a launch commits to. `--scaffold <RUNTIME>` writes one from a
template preset, and the preset is a starting point rather than a cage — nothing anywhere compares
a finished configuration against the preset it began as.

Each round renders **twelve seeds across three market states** through `eth_call` to the deployed
runtime, and rasterises:

| artifact | what only it can answer |
| --- | --- |
| `singles/*.png` at 512px | detail, clipping, collisions |
| `contact.png` at 256px | composition and palette across the collection |
| `contact-thumb.png` at **120px** | thumbnail survival and seed diversity |
| `states.png` at 256px | does the market change the work |
| `states-thumb.png` at **120px**, one row per state | market response at the size it is actually seen |

**The 120px sheets are not previews of the large ones.** Every verdict in this program was decided
at that size. A frame that reads as varied at 512px and as one repeated stamp at 120px fails there
and nowhere else, and that failure removed a runtime from Wave 1.

### The reviewer is a different process

The command renders, writes a packet at `.relics-agent/art-review/round-N/packet/`, and stops with
`AWAITING_VISUAL_REVIEW`. It does not wait. A separate agent reads `reviewer-prompt.md`, opens the
images, and writes `verdict.json`.

**The packet is built by a redactor**, and what it refuses to carry is the point:

- **no author claims.** Not a change log, not an intent statement, not "this addresses the
  critique". The reviewer finds out whether the critique was addressed by looking at the new
  pictures against its own earlier words.
- **no scores before the first judgement.** The objective battery's results are withheld until a
  verdict exists for round 1, and the withholding is a function that refuses rather than a
  convention somebody remembers.
- **no parameters.** No configuration, no byte diff, no trait table, no SVG source. A reviewer given
  parameters reviews parameters.

The reviewer's OWN prior critique **is** carried, from round two on, because without it a reviewer
cannot check whether its own work order was carried out.

A labelled review in this program rated two runtimes highly and a blind pass over the same material
then rejected their templates five for five. The labels were not lies. They were context, and
context was enough.

### The rubric, and the one axis that is a gate

Brief fidelity · composition · coherence as a collection · palette intent · seed variation without
losing identity · thumbnail survival · market response where claimed · token identity across states ·
visual artifacts.

**Brief fidelity is a gate and technical legality cannot overrule it.** A `FAIL` there forbids
`SHIP`, and the verdict schema will not let a reviewer express the contradiction — there is no
`override`, no `waiver`, no `shipAnyway` field to reach for.

### Critique has to be executable

Every critique item names an axis, records what was seen, and gives an instruction with a direction
and either a magnitude or a named thing in the picture. *"No focal hierarchy; peripheral blocks
overwhelm the central form. Cut peripheral density by about 40%, narrow the palette contrast, raise
the central recursion scale."* "Not good enough" is refused by the schema, and so is "make it
better" — a destination is not a work order.

### Four judgements, then a refusal

One first look and three deliberate corrections. Re-rendering before any verdict is recorded does
not spend one; what is bounded is how many times a reviewer is asked.

At the ceiling the loop answers **`ART_QUALITY_NOT_ACCEPTABLE`** and nothing is launched. That is a
normal outcome and a correct one: a critique still unresolved after three deliberate corrections is
usually a brief the chosen template cannot depict, and further rounds launder that rather than fix
it.

### Acceptance, and what voids it

A `SHIP` verdict runs the objective battery — legality against the deployed validator, determinism,
a hundred-seed sweep, blank detection, byte and perceptual duplicates, seed diversity at browse size,
the exact state-identity gate, perceptual separation between market states, a structural role for
every declared record, and the render cost against the portable budget. **Both have to pass.** A
reviewer cannot see a field that draws nothing on any seed; a battery cannot see that the work is
wrong for the brief.

The acceptance is written to `.relics-agent/receipts/art-review.json` and appended to the
hash-linked receipt chain as an `ART_REVIEW` phase.

**It is void the moment the accepted configuration, the brief, the runtime or the runtime's address
changes.** Not stale — void. Change one per cent of one field and the review runs again. The
binding is the full configuration bytes including the opaque appendix, which is stricter than
"render-affecting" on purpose: the appendix changes no pixel and it IS inside `artConfigHash`, which
is what the launch commits to and what is immutable afterwards.

### It cannot be skipped

`agent run` runs `ART_REVIEW` before `METADATA` — metadata is written at birth and cannot be changed
afterwards, so a review after it is a review of something already committed to. `metadata`,
`prepare`, `predict`, `simulate`, `build`, `policy-check` and `broadcast` each call the gate as
their first statement and return on its answer.

**There is no `--skip-art-review`, under any spelling, and there will not be one.** A creator at
their own terminal who wants to launch art nobody reviewed still can: `goal: "BUILD_ONLY"` builds
the transaction and they sign it themselves and own that decision. What is refused is an agent doing
it on their behalf, which is the case where nobody is looking by construction.

Gate: `npm run kit:artreview` (+ `:controls`, + `:test`). Required results:
`AUTONOMOUS_VISUAL_REVIEW_RENDERED_IMAGES=YES` · `BRIEF_FIDELITY_GATE=ENABLED` ·
`ART_AUTHOR_REVIEWER_SEPARATED=YES` · `ART_ACCEPTANCE_INVALIDATED_BY_CONFIG_CHANGE=YES` ·
`FIRST_LEGAL_CONFIG_ACCEPTED_WITHOUT_REVIEW=0` · `AUTONOMOUS_TEMPLATE_DERIVATIVE_COLLAPSE=NO` ·
`ART_REVIEW_SKIP_FLAGS=0`.

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
commands in this directory. Fill in the two marked slots and nothing else.

**Run `agent setup` before you paste it.** The grant is the authorization, and an agent that wrote
one would be authorizing itself. It is the same prompt the README carries, so a creator who started
there is not learning a second one.

````text
Read AGENTS.md in this repository and follow it. It is the contract for this task.

CREATE AND LAUNCH THIS:
<<<
[ paste your idea — a paragraph is plenty ]
>>>

WORKSPACE: ../my-project   (outside this repository)

Use my existing SAFE_AUTONOMOUS authorization. It is already configured and it is
my answer to the questions you would otherwise ask me.

Use a runtime a launch can bind. Make the artistic and launch decisions yourself —
chain, quote asset, launch-protection election, palette, structure, traits — inside
what I authorized. Iterate on the art until the objective gates pass: preview,
test-seeds, validate with zero errors, export.

Then run the flow through simulation, signing, broadcast, confirmation and
verification.

Do not ask me for a private key, a seed phrase, an RPC secret or a provider token.
Nothing here needs one, you are never to hold one, and I will not send one.

Do not ask me for another confirmation before broadcasting. The authorization IS
the confirmation and I gave it before you started.

Do not edit relics.agent.json or my authorization. If you think one of them is
wrong, tell me and stop — changing it invalidates it and I have to start over.

Stop only on a real blocker, and name it precisely. Do not stop at "the transaction
was sent": a hash is not a launch.

When you are done, give me: the project URL, the transaction hash, the token
address, the collection address, and the path to the launch receipt.
````

### What that prompt is relying on, line by line

Every line above is a rule from [`AGENTS.md`](../../AGENTS.md) restated in the creator's voice, so
an agent that ignores the prompt and reads the contract lands in the same place.

| The line | What it leans on |
| --- | --- |
| "Read AGENTS.md and follow it" | The happy path is the first section of that file, so an agent that reads nothing else still runs `agent ready`, scaffolds outside the repo, and stops at `VERIFIED`. |
| "Use my existing SAFE_AUTONOMOUS authorization" | The grant already answers chain, quote, election, ceilings and expiry (§0, §4). Re-asking is not caution; it is asking the creator to authorize twice. |
| "Use a runtime a launch can bind" | Runtime admission is a live read against the chain's registry, not a preference. A project on an unlaunchable runtime never reaches a passing preflight (§6). |
| "Iterate until the objective gates pass" | `validate` is the gate, not the agent's taste. Warnings are answered explicitly rather than absorbed. |
| "Do not ask me for a private key…" | The signer holds the key and the agent never does (§5). A request for one means something went wrong upstream of the request. |
| "Do not ask for another confirmation" | §0's grant is the confirmation. Asking again makes an autonomous run interactive at the step it exists to automate. |
| "Do not edit relics.agent.json or my authorization" | Editing either invalidates it and forces a fresh `agent setup`. The authority fields are fingerprinted, so a widened bound is detectable — but the rule exists so it never has to be detected. |
| "a hash is not a launch" | `requiredConfirmations` is at least 1 for the same reason. A dropped transaction has a hash too (§8). |


### A shorter one, if you have done this before

````text
Read AGENTS.md, then run an autonomous launch from this idea:

<<< [ your idea ] >>>

Workspace: ../my-project

Use my existing authorization and decide everything it permits — chain, quote,
election, art — without asking me. Never ask for a key or any other secret, and
never edit the authorization. `agent ready` first; stop and name the precondition
if it is not ready. Validate to zero errors, treat every warning explicitly,
export to <ws>/project.relics, then `agent run`, branching on action and exit
code. Do not ask me to confirm the broadcast. Never launch twice. Finish at
VERIFIED on chain or a named blocker.
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

**The launch wallet is an execution key, not a vault.** It exists to pay gas and to sign one
validated launch. The keystore is encrypted at rest with a passphrase-derived key, which buys time
against a stolen file and nothing against someone already running code as you — a keylogger, a
debugger attached to the signer, or swapped-out memory all defeat it. So the design assumes the key
can be lost and that losing it costs the gas in it. Keep gas in the launch wallet and nothing else,
and keep `creatorRecipient` on a cold wallet, a hardware wallet or a Safe.

**An authorization bounds what an agent may do, not what a mistake can cost.** A grant limited to
one launch, expiring in a day, with a total gas ceiling, still authorizes a real transaction with
real consequences on a real chain. It makes the blast radius statable in advance; it does not make
it zero.

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
