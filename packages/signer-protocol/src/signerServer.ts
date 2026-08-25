// SPDX-License-Identifier: MIT
// ================================================================================================
// THE SIDECAR, SERVER SIDE — the process that holds the key.
//
// Small on purpose. Three routes, one of which does anything, and no state beyond the adapter and
// the approved build it was started with. Everything it will refuse, it refuses with the SAME
// `policyGuard` the agent-side wrapper runs, through the same `createPolicyBoundSigner` — not a
// second implementation that agrees with it today. Two copies of a policy check are two policies,
// and the one that matters is whichever runs next to the key.
//
// WHAT THE SERVER ADDS THAT THE IN-PROCESS WRAPPER CANNOT. The agent-side guard is advice: the
// agent's own code runs it, so the agent's own code can skip it. This one cannot be skipped by
// anything on the other side of the socket, because the socket is the only way to reach the key.
// That is why the same check is run twice and why the duplication is the feature.
//
// BOUND TO LOOPBACK BY DEFAULT AND DELIBERATELY UNAUTHENTICATED. There is no token, and adding one
// would be theatre while the transport is a local socket any process running as this user can open
// anyway. The security property is the POLICY, not the port: anything that can reach this server
// can ask for a signature, and asking is not enough. Binding elsewhere is possible and is the
// caller's decision to justify — `host` exists so a container can bind its own interface, not so a
// signer can be published.
// ================================================================================================
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createPolicyBoundSigner, SignerRefusedError, SignerTransportError, type SignerAdapter } from "./index.ts";
import type { AgentPolicy, SignerRefusal } from "./contracts.ts";
import type { ApprovedBuild } from "./policyGuard.ts";
import { WireFormatError, decodeSigningRequest } from "./wire.ts";

export interface SignerServerOptions {
  /** The thing that actually holds a key. Wrapped in the policy guard before it is ever called. */
  readonly adapter: SignerAdapter;
  readonly policy: AgentPolicy;
  /** `null` is legal and makes every `/sign` answer `NO_APPROVED_BUILD`. */
  readonly approvedBuild: ApprovedBuild | null;
  readonly host?: string;
  /** `0` asks the OS for an ephemeral port, which is what a test harness wants. */
  readonly port?: number;
  /** Cap on one request body. A signer that reads an unbounded body is a one-line denial of service. */
  readonly maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload), "cache-control": "no-store" });
  res.end(payload);
}

async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    // Refused WHILE STREAMING, not after. Checking a completed body's length means the body was
    // already in memory, which is the thing the cap exists to prevent.
    if (size > limit) throw new WireFormatError("body", `exceeds the ${limit}-byte limit`);
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * An HTTP signer for the dev and fork harness.
 *
 * `POST /sign` is the protocol. `GET /address` and `GET /supports-chain?chainId=…` exist because
 * `SignerAdapter` has those two methods and a sidecar client has to be able to answer them without
 * a key of its own.
 */
export function createSignerServer(options: SignerServerOptions): Server {
  const guarded = createPolicyBoundSigner(options.adapter, options.policy, options.approvedBuild);
  const limit = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return createServer((req, res) => {
    void handle(req, res).catch((cause) => {
      // Nothing from the key side reaches a client body. The adapters never put a key in a message,
      // and this arm does not widen that by echoing an arbitrary error.
      sendJson(res, 500, { error: "SIGNER_INTERNAL_ERROR", detail: cause instanceof Error ? cause.name : "unknown" });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://signer.local");

    if (url.pathname === "/address" && req.method === "GET") {
      return sendJson(res, 200, { address: await guarded.getAddress() });
    }

    if (url.pathname === "/supports-chain" && req.method === "GET") {
      const raw = url.searchParams.get("chainId");
      const chainId = raw === null ? Number.NaN : Number(raw);
      if (!Number.isSafeInteger(chainId) || chainId < 0) {
        return sendJson(res, 400, { error: "MALFORMED_QUERY", detail: `chainId must be a non-negative integer, got ${JSON.stringify(raw)}` });
      }
      return sendJson(res, 200, { chainId, supported: await guarded.supportsChain(chainId) });
    }

    if (url.pathname === "/sign") {
      if (req.method !== "POST") return sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", detail: "/sign takes POST" });

      let request;
      try {
        request = decodeSigningRequest(JSON.parse(await readBody(req, limit)));
      } catch (cause) {
        // A BODY THAT DOES NOT PARSE IS NOT A REFUSAL, and it does not get a refusal code. An agent
        // that saw `REFUSED` here would report to a creator that their launch was declined, when
        // what happened is that a request never arrived intact.
        const detail = cause instanceof WireFormatError ? cause.message : "body is not JSON";
        return sendJson(res, 400, { error: "MALFORMED_SIGNING_REQUEST", detail });
      }

      const outcome = await guarded.trySign(request);
      if (outcome.kind === "REFUSED") return sendJson(res, 403, outcome satisfies SignerRefusal);
      return sendJson(res, 200, outcome);
    }

    return sendJson(res, 404, { error: "NOT_FOUND", detail: "this signer serves /address, /supports-chain and /sign" });
  }
}

export interface RunningSignerServer {
  readonly server: Server;
  /** The loopback origin a `createLocalSidecarSigner` should be pointed at. */
  readonly url: string;
  close(): Promise<void>;
}

/** Start the server and report the origin it actually bound, which is what an ephemeral port needs. */
export async function startSignerServer(options: SignerServerOptions): Promise<RunningSignerServer> {
  const server = createSignerServer(options);
  const host = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, resolve);
  });
  const address = server.address() as AddressInfo | null;
  if (address === null || typeof address === "string") {
    server.close();
    throw new SignerTransportError("SIGNER_SERVER_NOT_BOUND", "the server did not report a TCP address after listening");
  }
  const hostForUrl = address.family === "IPv6" ? `[${address.address}]` : address.address;
  return {
    server,
    url: `http://${hostForUrl}:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
