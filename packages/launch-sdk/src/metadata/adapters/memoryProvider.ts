// SPDX-License-Identifier: MIT
// ================================================================================================
// THE IN-PROCESS PROVIDER — for a local run, a fork harness, or CI with no network and no account.
//
// IT COMPUTES REAL CIDs, THE REAL WAY. CIDv1, raw codec (0x55), sha2-256 multihash, base32 with the
// `b` multibase prefix — the same `bafkrei…` address a real pinning service returns for the same
// bytes. That is the whole point: a fake CID would make every local run pass on an address that
// resolves nowhere, and the first time anyone used a real provider the shape of the value would
// change underneath them. Verified against the canonical implementation's own vectors — sha256 of
// "hello world" gives `bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e`, which is the
// well-known IPFS CID for those bytes.
//
// IT BEHAVES LIKE A PROVIDER, INCLUDING WHEN IT FAILS. `fetchByCid` on an address it never stored
// refuses exactly as a gateway would, rather than returning empty bytes — so the read-back check is
// exercised for real in a local run and not merely satisfied by a cooperative stub.
//
// SINGLE-BLOCK ONLY, AND IT SAYS SO. Above one IPFS block the correct CID is a dag-pb root over raw
// leaves, a different codec with different framing. A collection-metadata document is a few hundred
// bytes, so the branch is unreachable in practice; computing it approximately would produce a
// plausible CID that addresses nothing, which is worse than a refusal.
// ================================================================================================

import { sha256Bytes } from "@relics/project-schema";
import { MetadataRefusal } from "../errors.js";
import type { MetadataProvider, PinReceipt } from "../provider.js";

/** One IPFS block. Above this a real provider chunks and roots the object with a different codec. */
export const IPFS_CHUNK_SIZE = 262_144;

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"; // RFC 4648 lowercase, no padding

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The CIDv1 string for a single-block raw object: `0x01 0x55 0x12 0x20 || sha256(bytes)`, base32,
 * multibase-`b`. Exported because a caller predicting an address (a receipt, a fixture) should use
 * the same arithmetic rather than a second copy of it.
 */
export function computeRawCidV1(bytes: Uint8Array): string {
  if (bytes.length > IPFS_CHUNK_SIZE) {
    throw new MetadataRefusal(
      "DOCUMENT_TOO_LARGE",
      "PIN",
      `the memory provider content-addresses a single ${IPFS_CHUNK_SIZE}-byte block only; ${bytes.length} bytes needs a dag-pb root, which this adapter will not approximate`,
    );
  }
  const digest = sha256Bytes(bytes);
  const cid = new Uint8Array(4 + digest.length);
  cid.set([0x01, 0x55, 0x12, 0x20], 0); // CIDv1, raw codec, sha2-256, 32-byte length
  cid.set(digest, 4);
  return "b" + base32(cid);
}

export interface MemoryProvider extends MetadataProvider {
  /** Everything this provider is holding, by CID. For assertions in a harness; never for a launch. */
  readonly store: ReadonlyMap<string, Uint8Array>;
}

/**
 * A provider backed by a `Map`. No network, no credential, nothing to configure — and therefore
 * nothing that could leak.
 */
export function createMemoryProvider(): MemoryProvider {
  const store = new Map<string, Uint8Array>();

  return {
    id: "memory",
    available: true,
    store,

    async pin(bytes: Uint8Array): Promise<PinReceipt> {
      const cid = computeRawCidV1(bytes);
      // Copy on the way in. Holding the caller's buffer would let a later mutation of it rewrite
      // history, and "the bytes came back unchanged" would then be true of a document nobody pinned.
      store.set(cid, Uint8Array.from(bytes));
      return { cid };
    },

    async fetchByCid(cid: string): Promise<Uint8Array> {
      const found = store.get(cid);
      if (found === undefined) {
        throw new MetadataRefusal("FETCH_BACK_FAILED", "FETCH_BACK", `the memory provider is not holding ${cid}`);
      }
      return Uint8Array.from(found);
    },
  };
}
