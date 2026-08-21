# Security

**relics-v4-starter is an educational project. It ships with NO warranty and is NOT
production-ready.** Do not deploy it, or anything derived from it, to a network holding real value
without your own independent security, legal, and economic review.

## Scope and status

This repository exists to teach patterns. The contracts compile, are tested, and illustrate sound
techniques. Testing is not review: a passing suite says the code does what its author expected, and
says nothing about what an attacker expected. Treat every contract here as a starting point to be
reviewed, not a finished product. What you can check yourself is the source — read it, and read the
verified source of anything you deploy against on a block explorer.

## Reporting

If you find a security issue in the starter itself, please open an issue **without** a working
exploit against any live deployment, or contact the maintainers privately if the repository lists
a contact. The starter contracts in this repository are educational and are deployed nowhere, so
there is no bug bounty for them. That is a statement about THIS code only: the platform addresses
this kit publishes are live contracts on Ethereum, Base and Robinhood Chain, they are not part of
the starter, and a finding against one of them belongs with the protocol, not here.

## Known risk areas (read these before forking)

- **Hook callback cost.** v4 hook callbacks run during pool actions. Any expensive write, external
  call, or revert affects swaps and liquidity. `ExampleV4Hook` writes a fixed-size struct only —
  keep that property. Never render, loop over NFTs, or call untrusted code in a callback.
- **Pool spoofing.** Only the one canonical pool may drive art state. The hook validates the full
  `PoolKey`, including `hooks == address(this)`. Do not weaken this.
- **Reentrancy.** The hook makes no untrusted external calls during observation. `awaken` uses
  `_mint` (not `_safeMint`) deliberately; the locker is `nonReentrant` and holds no fee assets.
- **Gas griefing.** No swap path loops over NFTs. `awaken` is bounded to 8 per call. `tokenURI`
  is still relatively expensive on-chain SVG — profile before relying on it in hot paths.
- **Holder-count manipulation.** `activeHolderCount` resists dust but not capital-backed Sybils.
  It is art entropy, never a governance oracle.
- **Randomness limits.** `block.prevrandao`, block data, and market state are for art entropy
  only. They must NEVER decide payouts, mint access, lotteries, or financial rewards.
- **Oracle manipulation.** Ticks, volumes, and liquidity are manipulable, especially in shallow
  liquidity. This project records them as art history, never as a financial oracle.
- **Metadata / DoS.** On-chain SVG + base64 is gas-heavy; keep loops bounded (rings, vertices,
  orbiters are all capped). Respect the EIP-170 24,576-byte runtime limit.
- **Marketplace caching.** Dynamic metadata is cached by indexers. ERC-4906 events cannot cover
  global market changes without an unbounded loop; the on-chain `tokenURI` is the source of truth.
- **Upgradeability.** There is none, on purpose. This removes upgrade/admin risk but means fixes
  require redeploys.

## Secrets hygiene (this is a public repo)

- Never commit a private key, mnemonic, wallet JSON, keystore, or an RPC URL with an embedded API
  key. `.gitignore`, `.gitleaks.toml`, and `scripts/secret-scan.sh` guard against it; CI runs a
  secret scan.
- Never put a signing secret in a hosting provider's environment. The web app needs none.

## Audit checklist for forks

- Verify the hook address flag bits and CREATE2 mining.
- Verify canonical `PoolKey` validation (including the hooks field).
- Verify swap amount sign conventions for both currency orderings.
- Verify there are no unbounded loops in the hook or renderer.
- Verify holder-count accounting under every ERC-20 transfer path.
- Verify `tokenURI` for representative token ids and market states.
- Verify the locker holds no fee asset and that donations cannot alter fee collection.
- Verify v4 behavior against the exact periphery version you deploy with, on a fork.
