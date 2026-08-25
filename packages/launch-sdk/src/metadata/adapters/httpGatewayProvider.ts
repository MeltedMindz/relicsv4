// SPDX-License-Identifier: MIT
// ================================================================================================
// A READ-ONLY PUBLIC-GATEWAY ADAPTER — the independent half of the read-back.
//
// WHY IT EXISTS SEPARATELY FROM THE PIN ADAPTER. A pin provider that both accepts the bytes and
// reports them retrievable is grading its own homework. That is enough to catch a provider which
// dropped the object; it is not enough to catch one which serves it only to us, or which returns a
// CID its own gateway is warm for and nobody else's is. Pass one of these as `pinAndVerify`'s
// `verifier` and the write path and the read path become different parties.
//
// IT REFUSES TO PIN, AND THE REFUSAL IS THE FEATURE. A public gateway cannot publish; an adapter
// that quietly returned a computed CID for a `pin` it never performed would hand back a perfectly
// well-formed address for content nobody is hosting, and the read-back a moment later might even
// succeed off a warm cache. So `pin` answers `PROVIDER_IS_READ_ONLY` and `available` is false.
//
// A GATEWAY URL IS NEVER CANONICAL. This adapter reads through a host; the URI that reaches a chain
// is always `ipfs://<cid>`. A gateway URL hashes to a different resolver key, so committing one
// would leave `contractURI()` resolving to nothing — a failure that surfaces only after launch.
//
// SIZE IS CAPPED WHILE READING. A collection-metadata document is a few hundred bytes; a gateway
// answering with something enormous is a failure, not an input, and buffering it first to find out
// is how a verification step becomes a memory exhaustion.
// ================================================================================================

import { MetadataRefusal } from "../errors.js";
import type { MetadataProvider, PinReceipt } from "../provider.js";

export interface HttpGatewayProviderOptions {
  /**
   * The gateway base, e.g. `https://ipfs.io/ipfs` or `https://<host>/ipfs`. The CID is appended
   * with a single `/`. Configurable because gateways come and go and hardwiring one is how a kit
   * acquires a dependency on somebody's uptime.
   */
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly attempts?: number;
  readonly delayMs?: number;
  /** Hard ceiling on the response body. Default 1 MiB — orders of magnitude above a real document. */
  readonly maxBytes?: number;
  /** Injected for tests. Production passes nothing and the global `fetch` is used. */
  readonly fetchImpl?: typeof fetch;
  /** Label for receipts, when a caller runs several gateways and wants to tell them apart. */
  readonly id?: string;
}

const DEFAULT_BASE_URL = "https://ipfs.io/ipfs";

export function createHttpGatewayProvider(opts: HttpGatewayProviderOptions = {}): MetadataProvider {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 1_500;
  const maxBytes = opts.maxBytes ?? 1_048_576;
  const doFetch = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const id = opts.id ?? "http-gateway";

  const gatewayUrl = (cid: string) => `${baseUrl}/${cid}`;

  return {
    id,
    // False, and not because a credential is missing: this adapter can never pin at all.
    available: false,
    gatewayUrl,

    async pin(): Promise<PinReceipt> {
      throw new MetadataRefusal(
        "PROVIDER_IS_READ_ONLY",
        "PIN",
        `"${id}" is a read-only gateway adapter and cannot publish. Use it as the verifier of a pin performed elsewhere.`,
      );
    },

    async fetchByCid(cid: string): Promise<Uint8Array> {
      const url = gatewayUrl(cid);
      let lastStatus = 0;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await doFetch(url, { signal: controller.signal });
          lastStatus = res.status;
          if (res.ok) {
            const declared = Number(res.headers?.get?.("content-length") ?? Number.NaN);
            if (Number.isFinite(declared) && declared > maxBytes) {
              throw new MetadataRefusal("FETCH_BACK_FAILED", "FETCH_BACK", `the gateway declared ${declared} bytes for ${cid}, over the ${maxBytes}-byte ceiling`);
            }
            const body = new Uint8Array(await res.arrayBuffer());
            if (body.length > maxBytes) {
              // A gateway that under-declares its own length still does not get to decide how much
              // memory this process spends on a collection-metadata document.
              throw new MetadataRefusal("FETCH_BACK_FAILED", "FETCH_BACK", `the gateway served ${body.length} bytes for ${cid}, over the ${maxBytes}-byte ceiling`);
            }
            return body;
          }
        } catch (err) {
          // A ceiling breach is a verdict, not a transient failure — do not retry into it.
          if (err instanceof MetadataRefusal) throw err;
        } finally {
          clearTimeout(timer);
        }
        if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
      }
      throw new MetadataRefusal("FETCH_BACK_FAILED", "FETCH_BACK", `${id} did not serve ${cid} after ${attempts} attempts (last HTTP ${lastStatus})`);
    },
  };
}
