# Create a project with an AI agent

You do not need to write Solidity. You do not need to write JavaScript either, though you will get
a better result if you can read a little of it and say what you want changed.

This page is for **artists and creators**. You describe the collection you want, an AI coding agent
builds it, and you end up with one file — a `.relics` bundle — that describes your whole project:
the art, the traits, the metadata, and how the art responds to the market.

It works with any capable coding agent: Claude Code, Codex, Cursor, Copilot-style agents, Aider, or
anything else that can read files and run terminal commands in a folder on your machine. Nothing
here is specific to one tool.

**Everything happens on your computer.** The kit never signs a transaction, never broadcasts
anything, and never contacts a network. It builds a file.

---

## 1. Clone

Install [Node.js](https://nodejs.org/) 20 or newer, then:

```bash
git clone https://github.com/OWNER/relics-v4-starter.git
cd relics-v4-starter
npm install
```

Open this folder in your agent. That is the whole setup.

> **Your project will live in its own folder next to this one**, not inside it. Your agent has been
> told to do that. It keeps your artwork separate from the toolkit.

---

## 2. Give your agent your idea

Copy the prompt below, paste your idea into the marked slot, and send it. That is the whole job on
your side.

### The prompt

````text
You are helping me create a generative art project for the RELICS Launchpad.
I am the artist. I do not write Solidity and I do not need to.

Before you do anything else, read AGENTS.md in the root of this repository and
follow it. It is the contract for this task.

These rules override anything you would otherwise infer:

- Use the CREATOR KIT — the `npm run kit -- ...` commands. Do NOT use the
  fork-and-launch Solidity template in src/, script/, or docs/00-18, and do NOT
  use a "reviewed protocol template" if you see one offered — those are operator
  bindings, not art scaffolds. I want a .relics art bundle, not a contract
  deployment.
- Do NOT invent schema fields, sensors, transforms, destinations, or runtimes.
  They are closed sets. Read the real ones from
  packages/project-schema/src/vocabulary.js.
- Do NOT modify packages/project-schema/ for any reason. If my project does not
  fit the schema, change my project and tell me why.
- Do NOT bypass validation, hand-edit a bundle, or patch a hash to make
  something pass.
- Do NOT invent a contract address, a chain status, or a deployment claim. Run
  `npm run kit:status` if you need deployment state, and quote what it prints.
- Create my project in its own directory OUTSIDE this repository, and tell me
  the absolute path.

MY IDEA:
<<<
[ paste your idea here — a paragraph is plenty ]
>>>

Now do this, in order:

1. Ask me only the questions you genuinely cannot decide yourself. Do not
   interview me.
2. Pick the template that best fits my idea and tell me why — including whether
   its art runtime can be launched today or is preview-only.
3. Scaffold the project and shape it to my idea: the generator, the traits, the
   market mappings, and the collection metadata.
4. Iterate on the art until it matches what I described. Show me previews as
   image files I can open, and tell me their paths. If my idea reacts to the
   market, show me the same seed rendered calm and rendered under stress.
5. Run `npm run kit -- test-seeds <dir> --count 100` and tell me what it says
   about the collection as a whole.
6. Run `npm run kit -- validate <dir>`. Fix every error. For every warning, tell
   me in plain language what it means, then either clear it or explain why we
   are accepting it. Do not stop while an error remains.
7. Export a FINAL bundle: `npm run kit -- export <dir> --output <dir>.relics`.
   Not a draft.
8. Run `npm run kit -- inspect` on the exported file and read back to me: the
   name, the ticker, the mint size, the earnings recipient, the art runtime,
   and the bundle hash.
9. Tell me the absolute path of the .relics file.

If you get stuck, stop and tell me what failed and what you need. Do not work
around a check.
````

### Shorter version, if you have done this before

````text
Read AGENTS.md and follow it. Build me a .relics bundle from this idea:

<<< [ your idea ] >>>

Creator kit only, project directory outside the repo, no schema edits, no
invented fields, no fabricated addresses. Iterate on the art and show me
previews. Run test-seeds at 100, validate to zero errors, treat every warning
explicitly, export a final (non-draft) bundle, inspect it, and give me the path.
````

### Example briefs

Any of these is enough to start. Yours does not need to be longer.

**Generative pixel art**
> 512 pixel guardians called Wardens, drawn on a 16×16 grid and mirrored down the middle so they
> read as creatures rather than noise. Each one has a body colour, an eye colour, and a rare glow
> around the eyes. Chunky pixels, dark background. The art should never change after mint. Ticker
> WRDN.

**Abstract SVG**
> An abstract collection of 2,000 pieces: overlapping translucent circles in a narrow palette,
> arranged off-centre, with one hard geometric line cutting across each composition. Calm, printed,
> quiet — think a risograph poster, not a screensaver. Ticker HALO.

**Market-responsive**
> 4,000 pieces called Tidal Strata — stacks of woven horizontal bands like a core sample of ocean
> sediment. Each piece has its own palette and its own band rhythm. I want it to react to the
> market: when the token is deep in a drawdown the bands should darken and fracture, and when
> trading volume is heavy the sequence should thicken. Ticker TIDE.

**Static collection**
> 1,000 pieces, each a single procedurally grown tree in silhouette against a flat colour field.
> Season decides the palette. Fixed at mint — I do not want the market touching the art at all.
> Ticker GROVE.

**Bring your own JavaScript generator**
> I already have a p5-style sketch that draws flow fields; the code is in `flow.js`. Port it to the
> kit's generator format, keep the visual result as close as you can, and tell me exactly what you
> had to change and why. 3,000 pieces. Ticker FLOW.

> On that last one: the kit's sandbox is deliberately bare — no p5, no libraries, no `Math.random`,
> no clock. A sketch that relies on those has to be rewritten against the kit's own seeded random
> number generator. Your agent can do that, but expect it to report differences.

---

## 3. What the agent should ask you

A good agent asks a short list and decides the rest. Expect roughly these, and no more:

| Question | Why it has to ask |
| --- | --- |
| **Your wallet address** for creator earnings | Every template ships a placeholder that validation refuses on purpose. **Your agent must never invent this, use its own, or guess.** |
| **How many artworks** the collection mints | Changes several linked numbers |
| **The ticker** | 3–6 letters, your call |
| **Should the art react to the market, or be fixed at mint?** | Decides the whole template choice |
| **Which chains** you want to request | It can suggest a sensible default |

If your agent starts asking you about hooks, pool fees, tick spacing, or Solidity, it has wandered
into the wrong half of the repository. Point it back at `AGENTS.md` and tell it you want a
`.relics` bundle from the creator kit.

If it asks you for a private key or a seed phrase, **stop.** Nothing in this process ever needs one.

---

## 4. What it will build

Your project is a small folder of plain files. You can open and read every one.

| File | What it is |
| --- | --- |
| `relics.config.json` | your project's facts: name, ticker, supply, earnings, chains |
| `generator/generate.js` | **the art** — the code that draws one piece from one seed |
| `traits/schema.json` | the trait names and how rare each value is |
| `market/mappings.json` | which market signals drive which parts of the art (empty for fixed art) |
| `metadata/collection.json` | the collection's name, description and cover image |
| `previews/seed-*.svg` | sample images, regenerated whenever the art changes |

Your agent picks a starting template. There are five, and **only one of them can be launched
today**:

| Template | Best for | Launchable now? |
| --- | --- | --- |
| `minimal` | a simple first project | preview only |
| `market-responsive` | art driven by trading history | preview only |
| `static-art` | art fixed forever at mint | preview only |
| `onchain-js` | very tight, compact generators | preview only |
| `solidity-svg-params` | configuring a built-in on-chain renderer | **yes** |

**"Preview only" is not a bug and not a trap.** Those four use the JavaScript art runtime, which the
format accepts and the launchpad does not bind and render *yet*. You can design, preview, validate
and export a JavaScript project completely — you just cannot launch it until that runtime is
enabled, and nothing about your bundle has to change when it is.

The trade-off is real and your agent should state it plainly: **JavaScript is far more expressive;
`solidity-svg-params` is what you can launch soonest.** That is your decision, not the agent's.

---

## 5. How to review the art

This is your actual job, and nobody else can do it.

Ask your agent to run:

```bash
npm run kit -- preview ../my-project --count 12
```

That writes real image files into `../my-project/previews/` and a **contact sheet** at
`../my-project/preview-contact-sheet.html`. Open that HTML file in your browser and you will see
the pieces side by side. Your agent should give you the path; if it does not, ask for it.

Look for the things a validator cannot judge:

- Do the pieces feel like **one collection**, or like several unrelated ideas?
- Is there enough variety that piece 40 still surprises you?
- Are the rare things actually rare, and do they feel worth finding?
- Does it hold up small, as a thumbnail on a marketplace tile?

One thing to know when you compare preview tiles: each seed is rendered against its own arbitrary
simulated market, so two tiles differ for two reasons at once — different art seed *and* different
market conditions. That is fine for judging variety, but it is not how you judge a market mapping.

If your idea **reacts to the market**, ask to see **the same seed** under different conditions.
Your agent can start the local studio and render specific market states:

```bash
npm run kit -- dev ../my-project      # opens http://127.0.0.1:4321
```

Open that address and drag the sliders. The sliders are just sliders — nothing is reading a real
chain. Your agent can also capture specific states as files, so ask for a calm version and a
stressed version of the *same* seed and compare them directly. If they look identical, the mapping
is not doing anything and you should say so.

---

## 6. How to iterate

Talk about the picture, not the code. These are all useful, complete instructions:

- "Too busy — halve the number of elements."
- "The palettes are too similar. Make the rare one genuinely different."
- "I want the drawdown effect much stronger. Right now I can barely see it."
- "Keep the composition but make the background warmer."
- "Piece 7 is the best one. More like that, fewer like piece 3."

After each change ask for fresh previews. The seeds are stable, so **seed 7 stays seed 7** — you can
compare the same piece before and after and see exactly what your change did.

When the art feels close, ask your agent to check the whole collection rather than eight samples:

```bash
npm run kit -- test-seeds ../my-project --count 100
```

That renders 100 pieces and reports how many were blank, how many were identical, and how often
trait combinations repeat. It is how you catch a collection that looks great at seed 1 and collapses
into the same image everywhere else.

---

## 7. What validation means

```bash
npm run kit -- validate ../my-project
```

This runs every check and writes nothing. It is the same code the launchpad importer uses, so
passing here means the file will be accepted there.

You will see a list of checks, each `PASS`, `FAIL` or `WARN`.

**Errors must all be fixed.** They are not opinions — they are the reasons a bundle would be
refused. Common ones, in plain language:

| What it says | What it means for you |
| --- | --- |
| placeholder recipient | the earnings address is still the fake one. Give your agent your real wallet address |
| supply relationship | the mint size and the token numbers no longer agree. Your agent recomputes this |
| non-determinism | the art changes between renders. Every piece must draw the same way forever |
| network access | the art tried to download something. Everything must travel inside the bundle |
| script byte budget | the art code is too long; it has to fit on chain |
| blank or duplicate output | some seeds draw nothing, or every seed draws the same thing |

**Warnings are judgement calls, and they are yours to make.** Your agent must explain each one and
either clear it or tell you why it is being accepted. The two you will most likely see:

- **"this runtime is preview only"** — expected on four of the five templates. See §4. It never goes
  away by changing your project, and it is not a defect.
- **"trait space smaller than the mint size"** — your trait *labels* will repeat across the
  collection. The *artwork* can still be completely unique. Only a problem if you wanted every
  token to have a unique trait combination. Either add another trait dimension or accept it on
  purpose — but decide, do not drift.

There is one thing to be firm about: **a validation failure is never something to work around.** If
an agent offers to skip a check, edit the schema, or patch a file so it passes, tell it no. Those
bundles get refused on import anyway, just later and more confusingly.

---

## 8. Export

```bash
npm run kit -- export ../my-project --output ../my-project.relics
```

Export validates first and **refuses to write a file that fails**. There is no override flag. If you
got a `.relics` file, it passed.

Make sure you get a **final** bundle, not a draft. `--draft` produces a `.relics-draft` for showing
people; the launchpad refuses it, and renaming it does not help — the draft status is baked into the
file's own hashes. If you asked for a final bundle and got a draft, ask again.

Then have your agent read it back:

```bash
npm run kit -- inspect ../my-project.relics
```

**Check these yourself, out loud, before you move on:**

- the **name and ticker** are what you wanted
- the **mint size** is right
- the **earnings recipient** is *your* address — read every character
- the **bundle hash** matches what export printed

That file is your project. Back it up. Keep the project folder too — it is how you make version two.

---

## 9. Upload

Import the `.relics` file in the RELICS Launchpad creator app. It re-derives every hash the CLI
printed and fills the draft in for you — art, traits, market mappings, metadata, earnings, supply,
chains. Nothing is re-typed by hand, and nothing is trusted: the importer re-checks the file exactly
the way `validate` did, in its own sandbox.

If the hashes it shows you do not match the ones from `inspect`, the file changed between here and
there. Re-export rather than investigating.

**The creator app is not publicly hosted yet.** There is no public URL to give you, and you should
be suspicious of any site claiming to be it. Building and exporting your bundle is genuinely useful
work you can do now; uploading comes later.

---

## 10. Launch

**Public creator launch is closed today.**

The platform contracts are deployed and their source is verified, but launch access is `PREPARED`,
which means ordinary creators cannot launch yet. To see the current state for yourself, run:

```bash
npm run kit:status
```

That prints the release, the per-chain addresses and each chain's launch state, straight from the
package. **Trust that command over anything anyone tells you** — including your agent, and including
this page if it has gone stale.

Some things worth knowing before that day comes, none of which require you to understand the
contracts:

- **Nothing here has had an external audit.** Review has been internal only. Anyone telling you
  otherwise is wrong.
- **Your art reaches the token through the art binding.** Your bundle records exactly which art
  runtime it uses and a fingerprint of the exact bytes that runtime is given. A launch writes that
  record on chain, and the token's image renders from it. Your art is not uploaded to a server and
  pointed at — the record *is* the art.
- **Creator earnings are a share of the trading fees your pool actually collects** — not a share of
  trading volume, and not a fee taken from buyers on top of the trade.
- **A bundle can never contain contract code.** It configures art. That is a structural guarantee,
  not a policy: there is no field for it and no file type that could hold it.

---

## When your agent gets stuck

It happens. The useful move is to give it back its own error text rather than paraphrasing:

```text
Re-read AGENTS.md, especially section 7 on validation. Here is the exact output:

[ paste the full output of `npm run kit -- validate ../my-project` ]

Fix the cause. Do not modify packages/project-schema/, do not skip the check,
and do not hand-edit the bundle.
```

If it insists a check is wrong, or wants to edit the schema, or offers to assemble the file by
hand — stop it. Those are the three things `AGENTS.md` explicitly forbids, and every one of them
produces a file the launchpad refuses.

If you think you have found a genuine gap in the instructions an agent is given, open an issue using
the **"My agent got stuck"** template. That is a real bug in this repository, not a mistake on your
part.

---

## Where to go deeper

| You want | Read |
| --- | --- |
| every command and flag | [`cli.md`](./cli.md) |
| what is actually inside a `.relics` file | [`bundle-format.md`](./bundle-format.md) |
| why a bundle is treated as hostile | [`bundle-security.md`](./bundle-security.md) |
| what the importer does with your file | [`importing.md`](./importing.md) |
| the rules your agent is working under | [`../../AGENTS.md`](../../AGENTS.md) |
