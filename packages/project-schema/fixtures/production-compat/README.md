# production-compat

Bundles produced by the public creator path (`relics init` -> fill the creator recipient ->
`relics validate` -> `relics export`), with every value the RELICS Launchpad importer derives
from them recorded in `compat.json`.

GENERATED. Re-create with:

    npm run kit:parity:update

Never hand-edit a bundle or a digest here. If a value moved, either the kit changed what it
exports or the importer changed what it derives — both are drift, and the fix is upstream of
this directory.

`creatorRecipient` is a deterministic test address with no known key — the same one the
`.relics` fixture corpus uses. It is not a real payee, and it is deliberately not a Hardhat or
Anvil default, whose private keys are published.
