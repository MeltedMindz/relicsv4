import { createConfig, http } from "wagmi";
import { anvil, sepolia, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { publicEnv, readChainId } from "./env";

/**
 * wagmi config with NO WalletConnect projectId required.
 *
 * Wallet discovery uses EIP-6963 (multi-injected provider discovery), which wagmi enables by
 * default, plus a generic `injected()` fallback. This means the app works with any injected
 * browser wallet and mobile in-app browsers, with zero third-party project id or API key. If
 * you later want WalletConnect/mobile deep links across the board, add that connector yourself.
 */
const chainId = readChainId();

// Prefer the configured chain first so wagmi defaults to it.
const orderedChains =
  chainId === mainnet.id
    ? ([mainnet, sepolia, anvil] as const)
    : chainId === sepolia.id
      ? ([sepolia, anvil, mainnet] as const)
      : ([anvil, sepolia, mainnet] as const);

export const wagmiConfig = createConfig({
  chains: orderedChains,
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: {
    [anvil.id]: http(publicEnv.rpcUrl || "http://127.0.0.1:8545"),
    [sepolia.id]: http(publicEnv.rpcUrl || undefined),
    [mainnet.id]: http(publicEnv.rpcUrl || undefined),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
