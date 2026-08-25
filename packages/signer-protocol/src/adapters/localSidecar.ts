// SPDX-License-Identifier: MIT
// ================================================================================================
// THE SIDECAR ADAPTER — the shape this system is meant to run in.
//
// The key lives in a separate process. This adapter speaks to it over loopback HTTP and holds
// nothing: no key, no keystore path, no passphrase, no derivation. What the agent's process
// contains, in full, is a URL. If the agent is compromised the attacker gets the ability to ASK for
// a signature, and the sidecar's own copy of the policy guard is what decides whether asking is
// enough — which is the entire reason the boundary is a process boundary and not a function call.
//
// LOOPBACK ONLY, AND ENFORCED RATHER THAN DOCUMENTED. Plain HTTP to another host puts an
// unsigned-but-complete launch transaction on the wire in clear text, where anything on the path
// can read the recipient it names or replace the body before it reaches the signer. A remote signer
// is a legitimate thing to want; it is not this transport, and silently allowing it here would let
// one environment variable turn a local boundary into a network one.
// ================================================================================================
import { SignerRefusedError, SignerTransportError, type SignerAdapter } from "../index.ts";
import type { Address, SignerResult, SigningRequest } from "../contracts.ts";
import { decodeSignerRefusal, decodeSignerResult, encodeSigningRequest } from "../wire.ts";

/** The one environment variable this adapter reads. It carries a URL and never a credential. */
export const SIGNER_URL_ENV = "RELICS_SIGNER_URL";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export interface LocalSidecarOptions {
  /** Overrides the environment. Useful in tests, where the server's port is ephemeral. */
  readonly url?: string;
  readonly id?: string;
  /** Milliseconds. A signer that never answers must not hang a launch forever. */
  readonly timeoutMs?: number;
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

function resolveBaseUrl(options: LocalSidecarOptions): URL {
  const raw = options.url ?? process.env[SIGNER_URL_ENV];
  if (!raw) {
    throw new SignerTransportError("SIGNER_URL_NOT_CONFIGURED", `${SIGNER_URL_ENV} is not set and no url was supplied; there is no signer to ask`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw new SignerTransportError("SIGNER_URL_MALFORMED", `${SIGNER_URL_ENV} is not a URL`, { cause });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SignerTransportError("SIGNER_URL_UNSUPPORTED_SCHEME", `expected http: or https:, got ${url.protocol}`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new SignerTransportError("SIGNER_URL_NOT_LOOPBACK", `${url.hostname} is not a loopback host; this transport carries a complete transaction body and is not for off-box signers`);
  }
  return url;
}

/**
 * A signer that lives in another process on this machine.
 *
 * The three methods are the whole protocol: `GET /address`, `GET /supports-chain?chainId=…`,
 * `POST /sign`. Nothing else is reachable, so a compromised agent cannot ask the sidecar to do
 * anything the launch flow does not need.
 */
export function createLocalSidecarSigner(options: LocalSidecarOptions = {}): SignerAdapter {
  const base = resolveBaseUrl(options);
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const id = options.id ?? `local-sidecar:${base.origin}`;

  async function call(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
    const target = new URL(path, base);
    let response: Response;
    try {
      response = await doFetch(target, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      throw new SignerTransportError("SIGNER_UNREACHABLE", `${target.href} did not answer within ${timeoutMs}ms or refused the connection`, { cause });
    }
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch (cause) {
        throw new SignerTransportError("SIGNER_RESPONSE_NOT_JSON", `${target.href} answered ${response.status} with a body that is not JSON`, { cause });
      }
    }
    return { status: response.status, body };
  }

  return {
    id,

    async getAddress(): Promise<Address> {
      const { status, body } = await call("/address");
      const address = (body as { address?: unknown } | null)?.address;
      if (status !== 200 || typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        throw new SignerTransportError("SIGNER_BAD_ADDRESS_RESPONSE", `expected 200 with {"address":"0x…"}, got ${status} ${JSON.stringify(body)}`);
      }
      return address as Address;
    },

    async supportsChain(chainId: number): Promise<boolean> {
      const { status, body } = await call(`/supports-chain?chainId=${encodeURIComponent(String(chainId))}`);
      const supported = (body as { supported?: unknown } | null)?.supported;
      // A malformed answer is NOT a `false`. Reporting it as one would tell an agent the signer
      // declined this chain, when what happened is that nobody understood the question.
      if (status !== 200 || typeof supported !== "boolean") {
        throw new SignerTransportError("SIGNER_BAD_SUPPORT_RESPONSE", `expected 200 with {"supported":bool}, got ${status} ${JSON.stringify(body)}`);
      }
      return supported;
    },

    async sign(req: SigningRequest): Promise<SignerResult> {
      const { status, body } = await call("/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(encodeSigningRequest(req)),
      });
      // 403 IS THE REFUSAL CHANNEL. It arrives as the same typed `SignerRefusal` the in-process
      // guard produces, so a caller branches on `.code` without caring which side refused.
      if (status === 403) throw new SignerRefusedError(decodeSignerRefusal(body));
      if (status !== 200) {
        const detail = typeof (body as { detail?: unknown } | null)?.detail === "string" ? (body as { detail: string }).detail : JSON.stringify(body);
        throw new SignerTransportError("SIGNER_ERROR_RESPONSE", `the signer answered ${status}: ${detail}`);
      }
      return decodeSignerResult(body);
    },
  };
}
