// SPDX-License-Identifier: MIT
// ================================================================================================
// A JSON-RPC ERROR BODY IS A FAILED READ, EVEN UNDER HTTP 200.
//
// THE TRAP, MEASURED ON REAL ENDPOINTS 2026-09-03. `https://base.drpc.org` and
// `https://eth.drpc.org` answer `eth_chainId` in milliseconds and answer a real `eth_call` with
// `{"error":{"code":30,"message":"Request timeout on the free plan, please upgrade to paid plan"}}`.
// `https://cloudflare-eth.com` returns that shape at **HTTP 200**. A client that reads only the
// transport status scores it as a successful read, gets no `result`, and then has to invent a
// meaning for the absence — which in this kit would be a fabricated fact about a chain nobody
// managed to ask.
//
// This is the JSON-RPC form of a lesson this project already paid for once: a Cloudflare
// interstitial scored as a CLEAN measurement because nothing checked the page had loaded. Absence
// of a transport error is not the presence of an answer.
//
// WHY A LOCAL SERVER RATHER THAN A LIVE ENDPOINT. The property under test is about OUR handling,
// not about drpc's uptime, and a control that depends on a third party staying broken is a control
// that goes green when they fix their plan. The server below reproduces the exact body at the exact
// status that fools a status-only client, deterministically and offline.
// ================================================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { getChainCapability } from "../dist/capabilities.js";

/** An endpoint that answers `eth_chainId` honestly and every other method with a 200 + error body. */
async function startTrapRpc({ chainIdHex = "0x2105", status = 200 } = {}) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let method = null;
      try {
        method = JSON.parse(body).method;
      } catch {
        /* a malformed body is answered like any other unknown method */
      }
      seen.push(method);
      const send = (code, payload) => {
        const text = JSON.stringify(payload);
        res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
        res.end(text);
      };
      // The liveness ping succeeds. This is what makes the trap a trap.
      if (method === "eth_chainId") return send(200, { jsonrpc: "2.0", id: 1, result: chainIdHex });
      if (method === "eth_blockNumber") return send(200, { jsonrpc: "2.0", id: 1, result: "0x1" });
      // Everything that would actually read state fails, in the shape that looks like success.
      return send(status, { jsonrpc: "2.0", id: 1, error: { code: 30, message: "Request timeout on the free plan, please upgrade to paid plan" } });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, seen, close: () => new Promise((r) => server.close(r)) };
}

test("an endpoint that pings healthy and errors on every real read is UNKNOWN, never an answer", async () => {
  const trap = await startTrapRpc({ chainIdHex: "0x2105", status: 200 });
  try {
    const cap = await getChainCapability(8453, { rpcUrl: trap.url });

    // THE LIVENESS PROBE PASSED. Without this assertion the test would also pass against an
    // endpoint that refused the connection outright, which is a different and much easier case.
    assert.ok(trap.seen.includes("eth_chainId"), "the harness never reached the liveness probe; this control is not testing the trap");
    assert.equal(cap.findings.find((f) => f.id === "rpc.chainId")?.evidence, "PROVEN", "the endpoint answered eth_chainId, so that finding must be PROVEN — otherwise this is testing an unreachable endpoint, not a lying one");

    // THE SHARPEST ASSERTION IN THIS FILE. A status-only client reads HTTP 200, finds no `result`,
    // and hands `undefined` to the code-size branch — which reports "the factory address holds no
    // code on this chain". That is REFUTED: a false, confident statement about Base, produced by an
    // endpoint that never answered. It has to be UNKNOWN.
    assert.equal(
      cap.findings.find((f) => f.id === "factory.code")?.evidence,
      "UNKNOWN",
      "a getCode that errored must be UNKNOWN — REFUTED here would be the fabricated claim that the RC6 factory holds no code on Base",
    );

    // AND NOTHING DOWNSTREAM INVENTED A VALUE. `launchAccess` is not asked at all once the code
    // read failed, so its finding is ABSENT — which must never become a launch-access answer.
    const access = cap.findings.find((f) => f.id === "factory.launchAccess");
    assert.ok(access === undefined || access.evidence === "UNKNOWN", `launchAccess was scored ${access?.evidence}; an unanswered getter is not a state`);
    assert.equal(cap.liveLaunchAccess, null, `liveLaunchAccess is ${cap.liveLaunchAccess}; an unread getter has no value`);
    assert.equal(cap.launchable, "UNKNOWN", "an endpoint that answered no read must yield UNKNOWN — neither PROVEN nor a refusal of the chain");
    assert.equal(cap.registry?.complete ?? false, false, "the runtime registry cannot be complete when every runtimeInfo call errored");
    assert.equal(cap.registry?.declaredCount ?? null, null, "runtimeCount errored, so there is no declared denominator to report");

    // NOT ONE STATE CLAIM SURVIVED. Anything PROVEN or REFUTED beyond the liveness probe would be a
    // fact this run did not establish.
    const claimed = cap.findings.filter((f) => f.evidence !== "UNKNOWN" && f.id !== "rpc.chainId").map((f) => `${f.id}=${f.evidence}`);
    assert.deepEqual(claimed, [], `these findings claim a fact the endpoint never supplied: ${claimed.join(", ")}`);
  } finally {
    await trap.close();
  }
});

test("the same error body at HTTP 500 is also UNKNOWN, so the verdict does not depend on the status", async () => {
  // The 200 case is the interesting one; this pins that we are not passing it by accident through
  // some status-only branch that happens to agree today.
  const trap = await startTrapRpc({ chainIdHex: "0x2105", status: 500 });
  try {
    const cap = await getChainCapability(8453, { rpcUrl: trap.url });
    assert.equal(cap.findings.find((f) => f.id === "factory.code")?.evidence, "UNKNOWN");
    assert.equal(cap.liveLaunchAccess, null);
    assert.equal(cap.launchable, "UNKNOWN");
  } finally {
    await trap.close();
  }
});

test("an endpoint reporting the WRONG chain is REFUTED, which is a different answer from UNKNOWN", async () => {
  // The counterweight: UNKNOWN must not be the answer to everything, or the two tests above would
  // pass against a reader that had simply stopped reading.
  const trap = await startTrapRpc({ chainIdHex: "0x1", status: 200 });
  try {
    const cap = await getChainCapability(8453, { rpcUrl: trap.url });
    assert.equal(cap.launchable, "REFUTED", "an endpoint serving a different chain is a refutation, not an unknown");
    assert.equal(cap.findings.find((f) => f.id === "rpc.chainId")?.evidence, "REFUTED");
  } finally {
    await trap.close();
  }
});
