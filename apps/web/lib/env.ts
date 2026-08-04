/**
 * Public environment access — STATIC ONLY.
 *
 * Every NEXT_PUBLIC_* variable is read by its LITERAL name below. This is required, not
 * stylistic: Next.js inlines `process.env.NEXT_PUBLIC_FOO` at build time only when the key is a
 * static string. Dynamic access — `process.env[key]`, `Object.entries(process.env)`,
 * `{ ...process.env }` — does NOT get inlined and will read as undefined in the browser (or leak
 * server-only vars). Do not "refactor" this into a loop. See docs/17-frontend-integration.md.
 *
 * Nothing secret belongs here. Only NEXT_PUBLIC_* values, which are public by definition.
 */
export const publicEnv = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
  tokenAddress: process.env.NEXT_PUBLIC_TOKEN_ADDRESS,
  nftAddress: process.env.NEXT_PUBLIC_NFT_ADDRESS,
  hookAddress: process.env.NEXT_PUBLIC_HOOK_ADDRESS,
  rendererAddress: process.env.NEXT_PUBLIC_RENDERER_ADDRESS,
  poolId: process.env.NEXT_PUBLIC_POOL_ID,
} as const;

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";

/** A configured, non-placeholder EVM address, or undefined. */
export function readAddress(value: string | undefined): `0x${string}` | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!HEX_ADDRESS.test(v)) return undefined;
  if (v.toLowerCase() === ZERO) return undefined; // fail closed on the zero placeholder
  return v as `0x${string}`;
}

/** The configured chain id, defaulting to a local Anvil chain (31337). */
export function readChainId(): number {
  const parsed = Number.parseInt(publicEnv.chainId ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 31337;
}
