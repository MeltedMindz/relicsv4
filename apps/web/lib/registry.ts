import { publicEnv, readAddress, readChainId } from "./env";
import { collectionConfig, type ChainAddresses } from "@config";

/**
 * Fail-closed contract registry. Addresses come from TWO places, in priority order:
 *   1. NEXT_PUBLIC_* env vars (runtime override — handy for previews / per-deploy hosting), then
 *   2. `config/collection.config.ts` -> `addressesByChain[chainId]` (the committed source).
 * If neither provides a valid, non-placeholder address, that surface is "not configured" and the
 * UI renders an honest empty state. There are NO production addresses baked into this starter.
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

function bytes32(value: string | undefined): `0x${string}` | undefined {
  if (value && /^0x[0-9a-fA-F]{64}$/.test(value.trim())) return value.trim() as `0x${string}`;
  return undefined;
}

export function getRegistry(): Registry {
  const chainId = readChainId();
  const fromConfig: ChainAddresses = collectionConfig.addressesByChain[chainId] ?? {};

  const token = readAddress(publicEnv.tokenAddress) ?? fromConfig.token;
  const nft = readAddress(publicEnv.nftAddress) ?? fromConfig.nft;
  const hook = readAddress(publicEnv.hookAddress) ?? fromConfig.hook;
  const renderer = readAddress(publicEnv.rendererAddress) ?? fromConfig.renderer;
  const poolId = bytes32(publicEnv.poolId) ?? fromConfig.poolId;

  return {
    chainId,
    token,
    nft,
    hook,
    renderer,
    poolId,
    configured: Boolean(token && nft),
  };
}
