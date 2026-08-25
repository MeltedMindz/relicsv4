// SPDX-License-Identifier: MIT
// The public SDK's ABI loader. Reads the COMMITTED artifacts under `contracts-abi/rc6/`, which are
// the same artifacts the canonical production SDK uses (digest-pinned in VENDOR.json) and are
// published and source-verified on all three block explorers. A public consumer needs no private
// tree to load them.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi } from "viem";

const ABI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "contracts-abi", "rc6");
const cache = new Map<string, Abi>();

export function rc6Abi(name: string): Abi {
  const hit = cache.get(name);
  if (hit) return hit;
  const raw: unknown = JSON.parse(readFileSync(join(ABI_DIR, `${name}.json`), "utf8"));
  const abi = (Array.isArray(raw) ? raw : (raw as { abi?: unknown }).abi) as Abi | undefined;
  if (!abi) throw new Error(`rc6Abi(${name}): artifact has no abi`);
  cache.set(name, abi);
  return abi;
}

export const FACTORY_ABI = () => rc6Abi("LaunchpadFactoryV1");
export const METADATA_RESOLVER_ABI = () => rc6Abi("MetadataResolverRc6");
export const PROJECT_REGISTRY_ABI = () => rc6Abi("ProjectRegistryV1");
export const PROJECT_COLLECTION_ABI = () => rc6Abi("ProjectCollectionV1");
export const PROJECT_TOKEN_ABI = () => rc6Abi("ProjectTokenV1");
export const ART_HOOK_ABI = () => rc6Abi("ArtHookRc6");

/**
 * `ArtRuntimeRegistryV1`'s read surface. Declared inline because the registry's own artifact is not
 * among the published launch artifacts, and this is the whole surface the SDK needs.
 *
 * `runtimeInfo` returns the FULL record including `exists` and `active`. Both booleans are
 * load-bearing: the call DOES NOT REVERT for an unregistered id — it returns a well-formed record
 * with the zero address and `exists: false`. A "did it resolve?" check reads that as success, which
 * is why every consumer here must require a non-zero address WITH CODE, active, and identity-matched.
 */
export const ART_RUNTIME_REGISTRY_ABI = [
  {
    type: "function",
    name: "runtimeInfo",
    stateMutability: "view",
    inputs: [{ name: "runtimeId", type: "uint32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "runtime", type: "address" },
          { name: "codeHash", type: "bytes32" },
          { name: "tag", type: "bytes32" },
          { name: "version", type: "uint16" },
          { name: "mode", type: "uint8" },
          { name: "active", type: "bool" },
          { name: "exists", type: "bool" },
          { name: "label", type: "string" },
        ],
      },
    ],
  },
  { type: "function", name: "runtimeCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
] as const satisfies Abi;
