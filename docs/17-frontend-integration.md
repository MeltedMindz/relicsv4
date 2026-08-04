# 17 — Frontend integration (`apps/web`)

A neutral Next.js (App Router) starter using wagmi + viem. It has five pages: Home, Acquire,
Mint/Awaken, Explore, Technical. It needs **no** WalletConnect projectId and **no** private API
key for its core flows.

## Static public env access — the rule that bites

Next.js inlines `process.env.NEXT_PUBLIC_FOO` into the browser bundle **only when the key is a
static string literal**. These do NOT work and will read as `undefined` in the browser (or leak
server vars):

```ts
process.env[key];              // dynamic key — NOT inlined
Object.entries(process.env);   // NOT inlined
const all = { ...process.env }; // NOT inlined
```

So `lib/env.ts` reads every `NEXT_PUBLIC_*` var by its **literal name**, once, in one place:

```ts
export const publicEnv = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  tokenAddress: process.env.NEXT_PUBLIC_TOKEN_ADDRESS,
  // ...one static line per key
} as const;
```

Do not "DRY this up" into a loop. The staticness is the feature.

## Fail closed

`lib/registry.ts` returns `undefined` for any address that is unset or a zero placeholder, and the
pages render an honest "not configured" state. The app **never** invents a placeholder address or
a fake counter. Degraded RPC states should read "awaiting record," never a fabricated zero.

## Wallets: EIP-6963, no projectId

`lib/wagmi.ts` uses `injected()` plus wagmi's default EIP-6963 multi-injected provider discovery.
Every discovered browser wallet (and mobile in-app browser) appears as a connect button, with no
third-party project id or API key. Add WalletConnect yourself later if you want universal mobile
deep links.

## No signing secrets in the host environment

The web app's reads use a **public** RPC. It never needs a deploy key, mnemonic, or wallet JSON.
Never set those in your hosting provider's environment — a public deployment has no use for a
signing secret, and putting one there is how keys leak.

## Marketplace metadata is a cache

The canonical art is the contract's on-chain `tokenURI`. Market state reshapes every token, but
you cannot emit a per-token `MetadataUpdate` for all of them without an unbounded loop, so
indexers and marketplaces will lag. Show live on-chain reads where it matters, and treat the
indexed view as a projection that catches up.

## Deterministic local fixtures

`lib/fixtures.ts` renders sample sigils client-side from a seed, so `Explore` works with no chain,
no RPC, and no secrets. These are neutral previews of the concept — not the canonical artwork.
