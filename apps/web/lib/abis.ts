/**
 * Minimal read-only ABIs for the starter's contracts. Only the functions the UI reads are
 * declared, so the bundle stays small. The canonical source of truth for a token's art is its
 * on-chain `tokenURI` — the marketplace/indexer view is only a cached projection of it.
 */
export const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "activeHolderCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const nftAbi = [
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "totalMinted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "latentCapacity",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "awaken",
    stateMutability: "nonpayable",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      { name: "firstId", type: "uint256" },
      { name: "minted", type: "uint256" },
    ],
  },
] as const;

export const hookAbi = [
  {
    type: "function",
    name: "getGlobalState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "swapCount", type: "uint64" },
          { name: "liquidityEventCount", type: "uint64" },
          { name: "lastActivityBlock", type: "uint64" },
          { name: "epoch", type: "uint64" },
          { name: "cumulativeBuyVolume", type: "uint128" },
          { name: "cumulativeSellVolume", type: "uint128" },
          { name: "lastTick", type: "int24" },
          { name: "highTick", type: "int24" },
          { name: "drawdownBand", type: "uint32" },
          { name: "volatility", type: "uint32" },
          { name: "entropy", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isPoolBound",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;
