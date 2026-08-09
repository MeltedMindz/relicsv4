# On-chain JavaScript

The JAVASCRIPT art runtime stores your generator **with the project** and re-runs it on every
read. That makes the script itself part of the artwork, and it makes size a design constraint
rather than an afterthought.

The public per-project script budget is **36,000 bytes**. `relics validate` prints the script
size and fails the byte-budget check above the budget, so you always know where you stand.

Writing for the budget, in rough order of what pays off:

1. **Fewer constants.** A palette table of five entries costs real bytes. Derive shades from one
   base colour instead of listing them.
2. **One drawing primitive.** A generator that only emits `<path>` is smaller than one that
   emits six element types, and usually reads better.
3. **Short local names inside hot loops**, ordinary names everywhere else. Do not obfuscate the
   whole file — a generator nobody can read is a generator nobody can verify.
4. **No dead branches.** Every parameter you expose is bytes you pay for on every read.

What does *not* help: minifying comments (they are yours to keep — strip them at export time if
you must), or splitting the file, which the format refuses because exactly one script is stored.

## Files

| File | What it is |
| --- | --- |
| `relics.config.json` | your project configuration. The exporter turns it into the bundle manifest. |
| `generator/generate.js` | the art. One `render(context)` export, deterministic, no imports. |
| `traits/schema.json` | the trait dimensions and how values are weighted. |
| `market/mappings.json` | sensor → transform → art-parameter wiring. |
| `metadata/collection.json` | collection-level metadata (name, symbol, description, images). |

## Before you export

Set `earnings.creatorRecipient` in `relics.config.json` to your own address. The template ships
with a placeholder, and validation refuses to package a placeholder recipient.

## Loop

```bash
relics dev .                      # local studio: any seed, market sliders, live traits
relics preview . --count 12       # deterministic SVGs into previews/
relics test-seeds . --count 100   # sample the collection at scale
relics validate .                 # every check; writes nothing
relics export . --output my-project.relics
```

`export` runs validation first and refuses to write a bundle that fails. Import the `.relics`
file in the launchpad creator app; it derives the same hashes the CLI printed.
