/**
 * ┌───────────────────────────────────────────────────────────────────────────────────────┐
 * │  collection.config.ts — THE ONE FILE YOU EDIT TO MAKE THIS COLLECTION YOURS (web side)   │
 * │                                                                                          │
 * │  This is the human + frontend source of truth. The Foundry deploy scripts read the SAME  │
 * │  values from your .env via script/config/DeployConfig.s.sol — keep the two in sync.       │
 * │  See docs/00-make-it-your-own.md for the full walkthrough.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Pure data only (no imports), so it is trivially portable across the web app and any tooling.
 */

export type RendererStyle = "sigil" | "strata" | "orbital";

/** Which market signals drive the art, and a note on how strongly (mirrors the hook). */
export interface SignalMap {
  swaps: boolean; // swap activity -> orbiting marks / bodies
  buySellBalance: boolean; // buy vs sell -> palette / band skew
  volatility: boolean; // tick turbulence -> geometry twist / spread
  drawdown: boolean; // distance below the all-time-high -> fade / darken
  recovery: boolean; // climb back from the low -> brighten / horizon
  liquidityEvents: boolean; // add-liquidity events -> structure / age
  holderGrowth: boolean; // active holders -> nucleus size (Orbital)
}

export interface ChainAddresses {
  /** Deployed contract addresses for this chain. Leave blank until you deploy. */
  token?: `0x${string}`;
  nft?: `0x${string}`;
  hook?: `0x${string}`;
  renderer?: `0x${string}`;
  poolId?: `0x${string}`;
}

export interface CollectionConfig {
  // --- identity ---
  tokenName: string;
  tokenSymbol: string;
  nftName: string;
  nftSymbol: string;
  tagline: string;
  description: string;

  // --- tokenomics (must match your deploy .env: COLLECTION_TOKEN_SUPPLY etc.) ---
  tokenSupply: string; // human, e.g. "1,000,000"
  tokenDecimals: number; // 18 standard
  maxNftSupply: number;

  // --- art ---
  rendererStyle: RendererStyle; // which sample art system (or "bring your own")
  signals: SignalMap;

  // --- pool (must match your deploy .env: POOL_FEE / TICK_SPACING) ---
  poolFee: number; // e.g. 3000 == 0.30%
  tickSpacing: number; // e.g. 60

  // --- chain / rpc defaults (env NEXT_PUBLIC_* can override at runtime) ---
  defaultChainId: number; // 31337 anvil, 11155111 sepolia, 1 mainnet
  addressesByChain: Record<number, ChainAddresses>;
}

/**
 * EDIT ME. These defaults describe the neutral SAMPLE collection ("Sigil" art system) on local
 * Anvil. Change the identity, pick your art system, set your signals, and — after you deploy —
 * fill in `addressesByChain`.
 */
export const collectionConfig: CollectionConfig = {
  tokenName: "Example Onchain Token",
  tokenSymbol: "EXON",
  nftName: "Example Onchain Art",
  nftSymbol: "EXART",
  tagline: "The market becomes the art.",
  description:
    "A fully on-chain generative collection linked to an ERC-20, with a Uniswap v4 hook turning swaps, liquidity, volatility, and market history into live artistic evolution.",

  tokenSupply: "1,000,000",
  tokenDecimals: 18,
  maxNftSupply: 10_000,

  rendererStyle: "sigil",
  signals: {
    swaps: true,
    buySellBalance: true,
    volatility: true,
    drawdown: true,
    recovery: true,
    liquidityEvents: true,
    holderGrowth: true,
  },

  poolFee: 3000,
  tickSpacing: 60,

  defaultChainId: 31337,
  addressesByChain: {
    // 31337: local Anvil — fill in after `forge script ... DeployExample` against your node.
    31337: {},
    // 11155111: Sepolia — fill in after your testnet deploy.
    11155111: {},
    // 1: mainnet — fill in only after a reviewed mainnet launch.
    1: {},
  },
};

export default collectionConfig;
