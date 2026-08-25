// SPDX-License-Identifier: MIT
// ================================================================================================
// THE HASH-LINKED RECEIPT CHAIN.
//
// Every deterministic phase writes one receipt, and each carries the hash of the one before it. A
// receipt edited after the fact breaks every link after it, so "the run says it simulated" becomes
// something a reader can CHECK rather than believe.
//
// RECEIPTS LIVE OUTSIDE THE `.relics` BUNDLE, in `.relics-agent/`. A bundle is the artwork and is
// hashed into the launch itself; run history is not part of the art and must never change the
// bundle's digest by existing.
//
// NEVER A SECRET. No private key, mnemonic, RPC URL or pinning token is written here — not even
// redacted, because a redacted secret in a committed file still tells an attacker which file to
// look in next time. The secret gate asserts this on the WRITTEN FILES, not on intent.
// ================================================================================================
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export const AGENT_DIR = ".relics-agent";
export const RECEIPTS_DIR = "receipts";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
/** Stable stringify — sorted keys, bigints as decimal strings — so a hash is over VALUES. */
export function canonical(value) {
    return JSON.stringify(value, (_k, v) => {
        if (typeof v === "bigint")
            return v.toString();
        if (v && typeof v === "object" && !Array.isArray(v)) {
            return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
        }
        return v;
    });
}
export function receiptsPath(workspace) {
    return join(workspace, AGENT_DIR, RECEIPTS_DIR);
}
/**
 * Every receipt on disk, in sequence order.
 *
 * ORDERED BY THE FILENAME'S NUMERIC PREFIX, not by directory listing order. `readdir` is not sorted
 * on every filesystem, and a chain verified in the wrong order verifies nothing.
 */
export function listReceipts(workspace) {
    const dir = receiptsPath(workspace);
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]))
        .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}
export function hashOfReceipt(r) {
    return sha256(canonical(r));
}
/** Append one receipt, linked to the current tip. */
export function writeReceipt(workspace, input) {
    const dir = receiptsPath(workspace);
    mkdirSync(dir, { recursive: true });
    const existing = listReceipts(workspace);
    const previous = existing.length > 0 ? hashOfReceipt(existing[existing.length - 1]) : null;
    const sequence = existing.length + 1;
    const bodyCanonical = canonical(input.body);
    const receipt = {
        version: 1,
        phase: input.phase,
        // ISO-8601 UTC. Present for a human reading the chain; NOT part of any hash that must stay
        // stable across a resume, which is why `launchPlanHash` and friends are computed from content.
        timestamp: new Date().toISOString(),
        chainId: input.chainId ?? null,
        projectBundleHash: input.projectBundleHash ?? null,
        policyHash: input.policyHash ?? null,
        launchPlanHash: input.launchPlanHash ?? null,
        inputHash: input.inputHash ?? sha256(bodyCanonical),
        outputHash: sha256(bodyCanonical),
        previousReceiptHash: previous,
        addresses: input.addresses ?? {},
        body: input.body,
        sequence,
    };
    const name = `${String(sequence).padStart(3, "0")}-${input.phase.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    // SERIALISED THE SAME WAY IT IS HASHED. `canonical()` converts bigints and this write used a
    // bare JSON.stringify, so a body carrying a gas estimate hashed fine and then THREW on the way to
    // disk — a receipt that could be committed to but not recorded. The two paths now agree; the
    // pretty-printing is separate from the canonicalisation on purpose, since a hash must not depend
    // on whitespace.
    writeFileSync(join(dir, name), `${JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`);
    return receipt;
}
/**
 * Walk the chain and prove each link. This is what makes an edited receipt detectable: recomputing
 * a receipt's hash and comparing it to what the NEXT one recorded as its predecessor.
 */
export function verifyReceiptChain(workspace) {
    const receipts = listReceipts(workspace);
    if (receipts.length === 0)
        return { intact: true, length: 0, brokenAt: null, detail: "no receipts yet" };
    if (receipts[0].previousReceiptHash !== null) {
        return { intact: false, length: receipts.length, brokenAt: 1, detail: "the first receipt claims a predecessor" };
    }
    for (let i = 1; i < receipts.length; i++) {
        const expected = hashOfReceipt(receipts[i - 1]);
        if (receipts[i].previousReceiptHash !== expected) {
            return {
                intact: false,
                length: receipts.length,
                brokenAt: i + 1,
                detail: `receipt ${i + 1} (${receipts[i].phase}) records a predecessor hash that does not match receipt ${i} (${receipts[i - 1].phase}). Something between them was edited or removed after the fact.`,
            };
        }
    }
    return { intact: true, length: receipts.length, brokenAt: null, detail: `${receipts.length} receipts, every link verified` };
}
/** The most recent receipt for a phase, or null. Used by resume to find where the run got to. */
export function latestReceipt(workspace, phase) {
    const all = listReceipts(workspace).filter((r) => r.phase === phase);
    return all.length > 0 ? all[all.length - 1] : null;
}
