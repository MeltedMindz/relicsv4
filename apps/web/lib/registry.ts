import { publicEnv, readAddress, readChainId } from "./env";

/**
 * Fail-closed contract registry. If an address is unset or a zero placeholder, the app treats
 * that surface as "not configured" and renders an honest empty state — it never invents data,
 * and it never shows a production-looking address it does not actually have.
 *
 * There are NO production addresses baked into this starter. You point it at YOUR deployment
 * via NEXT_PUBLIC_* env vars (see .env.example). Local Anvil is the default chain.
 */
export interface Registry {
  chainId: number;
  token?: `0x${string}`;
  nft?: `0x${string}`;
  hook?: `0x${string}`;
  renderer?: `0x${string}`;
  poolId?: `0x${string}`;
  configured: boolean;
}

export function getRegistry(): Registry {
  const token = readAddress(publicEnv.tokenAddress);
  const nft = readAddress(publicEnv.nftAddress);
  const hook = readAddress(publicEnv.hookAddress);
  const renderer = readAddress(publicEnv.rendererAddress);
  const poolId =
    publicEnv.poolId && /^0x[0-9a-fA-F]{64}$/.test(publicEnv.poolId.trim())
      ? (publicEnv.poolId.trim() as `0x${string}`)
      : undefined;

  return {
    chainId: readChainId(),
    token,
    nft,
    hook,
    renderer,
    poolId,
    // "Configured enough to read the collection" == token + nft present.
    configured: Boolean(token && nft),
  };
}
