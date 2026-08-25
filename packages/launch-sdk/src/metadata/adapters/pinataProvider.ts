// SPDX-License-Identifier: MIT
// ================================================================================================
// A PINATA ADAPTER. One company's API, held entirely behind `MetadataProvider`.
//
// THE CREDENTIAL COMES FROM THE ENVIRONMENT AND GOES NOWHERE ELSE. `PINATA_JWT` is read at
// construction, kept in a closure, and sent in exactly one `Authorization` header. It is never
// written into a project file, a `.relics` bundle, a receipt, an error message, a thrown value or a
// log line — this module logs nothing at all. Error messages carry an HTTP STATUS and never a
// response body, which is deliberate: a service that echoed the request headers into an error body
// would otherwise put the token into a receipt, a log and a bug report in one step.
//
// AND IT IS NOT HARDWIRED THROUGH THE SDK. Nothing outside this file knows Pinata exists. A creator
// who uses a different service writes another adapter; the pipeline, the commitment and the launch
// path do not change.
//
// MISSING CREDENTIAL => UNAVAILABLE, NOT A CRASH. Constructing this with no token returns a provider
// that reports `available: false` and refuses each call with `PROVIDER_UNAVAILABLE`. It does not
// throw at import time, because a module that throws on import takes the whole CLI down when a
// creator is only trying to validate a bundle offline — turning a missing optional token into a
// broken tool.
// ================================================================================================

import { MetadataRefusal } from "../errors.js";
import type { MetadataProvider, PinReceipt } from "../provider.js";

const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const DEFAULT_GATEWAY_HOST = "gateway.pinata.cloud";

export interface PinataProviderOptions {
  /**
   * SERVER-ONLY secret. Omit it and the value is read from `PINATA_JWT`; supply it only from a
   * caller that itself read the environment. Never from a file inside the project.
   */
  readonly jwt?: string;
  /** Public gateway host. NOT a secret — it names a host, and a host is not content. */
  readonly gatewayHost?: string;
  readonly pinTimeoutMs?: number;
  readonly gatewayTimeoutMs?: number;
  /** Read attempts. IPFS propagation can lag a pin by a moment; one 404 is not yet a failure. */
  readonly retrieveAttempts?: number;
  readonly retrieveDelayMs?: number;
  /** Injected for tests. Production passes nothing and the global `fetch` is used. */
  readonly fetchImpl?: typeof fetch;
}

/** Read an environment variable without assuming a `process` exists (this may run in a browser). */
function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A provider that answers honestly about having no credential, and refuses rather than pretending. */
function unavailable(reason: string): MetadataProvider {
  const refuse = (): never => {
    throw new MetadataRefusal("PROVIDER_UNAVAILABLE", "PROVIDER", reason);
  };
  return {
    id: "pinata",
    available: false,
    async pin(): Promise<PinReceipt> {
      return refuse();
    },
    async fetchByCid(): Promise<Uint8Array> {
      return refuse();
    },
    gatewayUrl(cid: string) {
      return `https://${DEFAULT_GATEWAY_HOST}/ipfs/${cid}`;
    },
  };
}

export function createPinataProvider(opts: PinataProviderOptions = {}): MetadataProvider {
  const jwt = opts.jwt ?? env("PINATA_JWT");
  if (jwt === undefined) {
    return unavailable(
      "PINATA_JWT is not set. Set it in the environment, out of band — never in the project, the bundle, a receipt or a committed file.",
    );
  }

  const gatewayHost = (opts.gatewayHost ?? env("PINATA_GATEWAY_HOST") ?? DEFAULT_GATEWAY_HOST).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const pinTimeoutMs = opts.pinTimeoutMs ?? 30_000;
  const gatewayTimeoutMs = opts.gatewayTimeoutMs ?? 15_000;
  const retrieveAttempts = opts.retrieveAttempts ?? 6;
  const retrieveDelayMs = opts.retrieveDelayMs ?? 1_500;
  const doFetch = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  const gatewayUrl = (cid: string) => `https://${gatewayHost}/ipfs/${cid}`;

  return {
    id: "pinata",
    available: true,
    gatewayUrl,

    async pin(bytes: Uint8Array, filename: string): Promise<PinReceipt> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), pinTimeoutMs);
      try {
        const form = new FormData();
        // Copy into a standalone ArrayBuffer so the Blob captures the exact bytes and nothing else
        // that happens to share the underlying buffer.
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        form.append("file", new Blob([ab], { type: "application/json" }), filename);
        form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
        form.append("pinataMetadata", JSON.stringify({ name: filename }));

        const res = await doFetch(PINATA_PIN_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}` },
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) {
          // Status only. Never a response body — see the header note about credential echo.
          throw new MetadataRefusal("PIN_FAILED", "PIN", `the pin service answered HTTP ${res.status}`);
        }
        const json = (await res.json()) as { IpfsHash?: string };
        if (typeof json?.IpfsHash !== "string" || json.IpfsHash.length === 0) {
          throw new MetadataRefusal("PROVIDER_RETURNED_EMPTY_CID", "PIN", "the pin service answered without a CID");
        }
        return { cid: json.IpfsHash };
      } catch (err) {
        if (err instanceof MetadataRefusal) throw err;
        if ((err as { name?: string })?.name === "AbortError") {
          throw new MetadataRefusal("PIN_FAILED", "PIN", `the pin request timed out after ${pinTimeoutMs}ms`);
        }
        throw new MetadataRefusal("PIN_FAILED", "PIN", "the pin request failed");
      } finally {
        clearTimeout(timer);
      }
    },

    async fetchByCid(cid: string): Promise<Uint8Array> {
      const url = gatewayUrl(cid);
      let lastStatus = 0;
      for (let attempt = 0; attempt < retrieveAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), gatewayTimeoutMs);
        try {
          const res = await doFetch(url, { signal: controller.signal });
          lastStatus = res.status;
          if (res.ok) return new Uint8Array(await res.arrayBuffer());
        } catch {
          // Swallowed on purpose: a transport failure on one attempt is not yet a verdict, and the
          // loop's exit below is the verdict. Nothing here is logged.
        } finally {
          clearTimeout(timer);
        }
        if (attempt < retrieveAttempts - 1) await new Promise((r) => setTimeout(r, retrieveDelayMs));
      }
      throw new MetadataRefusal("FETCH_BACK_FAILED", "FETCH_BACK", `the gateway did not serve ${cid} after ${retrieveAttempts} attempts (last HTTP ${lastStatus})`);
    },
  };
}
