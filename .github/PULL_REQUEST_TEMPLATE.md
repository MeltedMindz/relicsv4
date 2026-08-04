# Pull request

## What & why

<!-- What does this change and why? Link any related issue. -->

## Checklist

- [ ] `forge fmt` and `forge test` pass locally.
- [ ] If I touched the renderer, I ran `forge build --sizes` and it is still under 24,576 bytes.
- [ ] If I changed contracts/tokenomics/deployment behavior, I updated the relevant `docs/` and
      `CLAUDE.md`.
- [ ] The web app still builds (`npm run web:build`) and lints (`npm run web:lint`).
- [ ] I did NOT add any secret, private key, mnemonic, real deployment address, tx hash, or other
      non-public material. This repo is public and clean-room.
- [ ] I am not implying endorsement by Uniswap, OpenZeppelin, OpenSea, or any auditor.

## Notes for reviewers

<!-- Anything you were unsure about, or that needs a closer look. -->
