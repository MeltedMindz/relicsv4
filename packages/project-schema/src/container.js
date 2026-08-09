// SPDX-License-Identifier: MIT
// The `.relics` container: a STORE-only (uncompressed) ZIP written in one fixed, normalized form.
//
// WHY STORE-ONLY, AND WHY THAT IS SAFER THAN A COMPRESSED ZIP
// -----------------------------------------------------------
//  * Determinism. Two bundles with the same files are byte-identical everywhere. A deflated ZIP
//    is only as deterministic as the zlib build that produced it: the same input at the same
//    level can compress differently across zlib versions and across Node/browser implementations,
//    which would silently change the bundle hash for reasons that have nothing to do with the
//    project.
//  * Zip bombs become structurally impossible. Stored entries have an expansion ratio of exactly
//    1:1, so `uncompressedSize == compressedSize` is an invariant the reader enforces before it
//    allocates anything. There is no decompressor to attack and no ratio to bound.
//  * No decompression dependency. The same reader runs in Node, in a browser main thread and in
//    a worker with no polyfill and no streaming API.
//
// The cost is size: JSON and JavaScript are stored raw. Bundles are small (the whole format is
// capped at 20 MB and a project's script at 36,000 bytes), and PNG/WebP assets are already
// compressed, so the trade is worth it.
//
// Everything a normal ZIP leaves free-form is pinned: entries are sorted by path, timestamps are
// the fixed 1980-01-01 DOS epoch, general-purpose flags are 0, external attributes are 0 (which
// is also what refuses symlinks), no directory entries are stored, no extra fields are written,
// and the archive comment is the bundle magic.

import { LIMITS } from "./limits.js";
import { normalizeEntryPath, collisionKey } from "./paths.js";
import { BUNDLE_MAGIC } from "./version.js";
import { utf8, fromUtf8 } from "./sha256.js";

export class ContainerError extends Error {}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIG = 0x07064b50;

/** 1980-01-01T00:00:00 in DOS format — the conventional "no timestamp" value. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @typedef {{ path: string, bytes: Uint8Array }} BundleEntry
 */

/**
 * Writes a deterministic container. Entries are sorted by path; the same input always produces
 * the same bytes.
 *
 * @param {BundleEntry[]} entries
 * @returns {Uint8Array}
 */
export function writeContainer(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new ContainerError("a bundle needs at least one entry");
  if (entries.length > LIMITS.maxEntries) throw new ContainerError(`too many entries (${entries.length} > ${LIMITS.maxEntries})`);

  const seen = new Set();
  const normalized = entries.map((entry) => {
    const path = normalizeEntryPath(entry.path);
    const key = collisionKey(path);
    if (seen.has(key)) throw new ContainerError(`duplicate entry path: ${path}`);
    seen.add(key);
    if (!(entry.bytes instanceof Uint8Array)) throw new ContainerError(`entry ${path} has no byte content`);
    if (entry.bytes.length > LIMITS.maxEntryBytes) throw new ContainerError(`entry ${path} is larger than ${LIMITS.maxEntryBytes} bytes`);
    return { path, bytes: entry.bytes, nameBytes: utf8(path), crc: crc32(entry.bytes) };
  });
  normalized.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const total = normalized.reduce((sum, e) => sum + e.bytes.length, 0);
  if (total > LIMITS.maxTotalEntryBytes) throw new ContainerError(`bundle content is larger than ${LIMITS.maxTotalEntryBytes} bytes`);

  const commentBytes = utf8(BUNDLE_MAGIC);
  let size = 0;
  for (const e of normalized) size += 30 + e.nameBytes.length + e.bytes.length + 46 + e.nameBytes.length;
  size += 22 + commentBytes.length;

  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let offset = 0;
  const offsets = [];

  for (const e of normalized) {
    offsets.push(offset);
    dv.setUint32(offset, LOCAL_SIG, true);
    dv.setUint16(offset + 4, 20, true); // version needed
    dv.setUint16(offset + 6, 0, true); // general purpose flags
    dv.setUint16(offset + 8, 0, true); // method: STORE
    dv.setUint16(offset + 10, DOS_TIME, true);
    dv.setUint16(offset + 12, DOS_DATE, true);
    dv.setUint32(offset + 14, e.crc, true);
    dv.setUint32(offset + 18, e.bytes.length, true);
    dv.setUint32(offset + 22, e.bytes.length, true);
    dv.setUint16(offset + 26, e.nameBytes.length, true);
    dv.setUint16(offset + 28, 0, true); // extra field length
    out.set(e.nameBytes, offset + 30);
    out.set(e.bytes, offset + 30 + e.nameBytes.length);
    offset += 30 + e.nameBytes.length + e.bytes.length;
  }

  const centralStart = offset;
  normalized.forEach((e, i) => {
    dv.setUint32(offset, CENTRAL_SIG, true);
    dv.setUint16(offset + 4, 20, true); // version made by (MS-DOS host, so external attrs stay 0)
    dv.setUint16(offset + 6, 20, true); // version needed
    dv.setUint16(offset + 8, 0, true); // flags
    dv.setUint16(offset + 10, 0, true); // method
    dv.setUint16(offset + 12, DOS_TIME, true);
    dv.setUint16(offset + 14, DOS_DATE, true);
    dv.setUint32(offset + 16, e.crc, true);
    dv.setUint32(offset + 20, e.bytes.length, true);
    dv.setUint32(offset + 24, e.bytes.length, true);
    dv.setUint16(offset + 28, e.nameBytes.length, true);
    dv.setUint16(offset + 30, 0, true); // extra
    dv.setUint16(offset + 32, 0, true); // comment
    dv.setUint16(offset + 34, 0, true); // disk number start
    dv.setUint16(offset + 36, 0, true); // internal attributes
    dv.setUint32(offset + 38, 0, true); // external attributes — 0 refuses symlink/permission bits
    dv.setUint32(offset + 42, offsets[i], true);
    out.set(e.nameBytes, offset + 46);
    offset += 46 + e.nameBytes.length;
  });
  const centralSize = offset - centralStart;

  dv.setUint32(offset, EOCD_SIG, true);
  dv.setUint16(offset + 4, 0, true);
  dv.setUint16(offset + 6, 0, true);
  dv.setUint16(offset + 8, normalized.length, true);
  dv.setUint16(offset + 10, normalized.length, true);
  dv.setUint32(offset + 12, centralSize, true);
  dv.setUint32(offset + 16, centralStart, true);
  dv.setUint16(offset + 20, commentBytes.length, true);
  out.set(commentBytes, offset + 22);

  return out;
}

/**
 * Reads an UNTRUSTED container. Every structural field is checked before a single byte is copied
 * out, and every refusal names the reason.
 *
 * @param {Uint8Array} bytes
 * @param {{ requireMagic?: boolean }} [options]
 * @returns {{ entries: BundleEntry[], byPath: Map<string, Uint8Array>, comment: string }}
 */
export function readContainer(bytes, options = {}) {
  const requireMagic = options.requireMagic ?? true;
  if (!(bytes instanceof Uint8Array)) throw new ContainerError("expected the container as a Uint8Array");
  if (bytes.length < 22) throw new ContainerError("file is too small to be a container");
  if (bytes.length > LIMITS.maxBundleBytes) throw new ContainerError(`container is larger than ${LIMITS.maxBundleBytes} bytes`);

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // A ZIP64 end-of-central-directory locator anywhere in the tail means the archive claims a
  // 64-bit layout this reader deliberately does not implement.
  const scanFrom = Math.max(0, bytes.length - (0xffff + 22));
  let eocd = -1;
  for (let i = bytes.length - 22; i >= scanFrom; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ContainerError("no end-of-central-directory record — not a container");
  for (let i = scanFrom; i <= bytes.length - 4; i++) {
    if (dv.getUint32(i, true) === ZIP64_EOCD_LOCATOR_SIG) throw new ContainerError("ZIP64 containers are refused");
  }

  const diskNumber = dv.getUint16(eocd + 4, true);
  const cdDisk = dv.getUint16(eocd + 6, true);
  if (diskNumber !== 0 || cdDisk !== 0) throw new ContainerError("multi-disk containers are refused");
  const entriesOnDisk = dv.getUint16(eocd + 8, true);
  const entryCount = dv.getUint16(eocd + 10, true);
  if (entriesOnDisk !== entryCount) throw new ContainerError("central-directory entry counts disagree");
  if (entryCount === 0) throw new ContainerError("container has no entries");
  if (entryCount > LIMITS.maxEntries) throw new ContainerError(`container declares ${entryCount} entries (max ${LIMITS.maxEntries})`);
  const centralSize = dv.getUint32(eocd + 12, true);
  const centralStart = dv.getUint32(eocd + 16, true);
  const commentLength = dv.getUint16(eocd + 20, true);
  if (eocd + 22 + commentLength !== bytes.length) throw new ContainerError("trailing bytes after the end-of-central-directory record");
  if (centralStart + centralSize !== eocd) throw new ContainerError("central directory does not end where the end record begins");
  if (centralStart > bytes.length || centralSize > bytes.length) throw new ContainerError("central directory offsets are out of range");

  const comment = fromUtf8(bytes.subarray(eocd + 22, eocd + 22 + commentLength));
  if (requireMagic && comment !== BUNDLE_MAGIC) {
    throw new ContainerError(`container is not a ${BUNDLE_MAGIC} bundle (comment was ${JSON.stringify(comment)})`);
  }

  /** @type {BundleEntry[]} */
  const entries = [];
  const byPath = new Map();
  const seen = new Set();
  const consumed = [];
  let cursor = centralStart;
  let totalBytes = 0;

  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > centralStart + centralSize) throw new ContainerError("central directory is truncated");
    if (dv.getUint32(cursor, true) !== CENTRAL_SIG) throw new ContainerError(`central-directory entry ${i} has a bad signature`);
    const flags = dv.getUint16(cursor + 8, true);
    const method = dv.getUint16(cursor + 10, true);
    const crc = dv.getUint32(cursor + 16, true);
    const compressedSize = dv.getUint32(cursor + 20, true);
    const uncompressedSize = dv.getUint32(cursor + 24, true);
    const nameLength = dv.getUint16(cursor + 28, true);
    const extraLength = dv.getUint16(cursor + 30, true);
    const commentLen = dv.getUint16(cursor + 32, true);
    const startDisk = dv.getUint16(cursor + 34, true);
    const externalAttributes = dv.getUint32(cursor + 38, true);
    const localOffset = dv.getUint32(cursor + 42, true);

    if (flags & 0x0001) throw new ContainerError(`entry ${i} is encrypted`);
    if (flags & 0x0008) throw new ContainerError(`entry ${i} uses a streaming data descriptor`);
    if (method !== 0) throw new ContainerError(`entry ${i} is compressed (method ${method}); the container is STORE-only`);
    if (compressedSize !== uncompressedSize) throw new ContainerError(`entry ${i} declares different stored and unstored sizes`);
    if (startDisk !== 0) throw new ContainerError(`entry ${i} claims to live on another disk`);
    if (externalAttributes !== 0) {
      const unixMode = externalAttributes >>> 16;
      const kind = (unixMode & 0xf000) === 0xa000 ? "a symbolic link" : "non-zero external attributes";
      throw new ContainerError(`entry ${i} has ${kind}; the container stores plain files only`);
    }
    if (cursor + 46 + nameLength + extraLength + commentLen > centralStart + centralSize) throw new ContainerError("central directory is truncated");

    const rawName = fromUtf8(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const path = normalizeEntryPath(rawName);
    const key = collisionKey(path);
    if (seen.has(key)) throw new ContainerError(`duplicate entry path after normalization: ${path}`);
    seen.add(key);

    if (uncompressedSize > LIMITS.maxEntryBytes) throw new ContainerError(`entry ${path} is larger than ${LIMITS.maxEntryBytes} bytes`);
    totalBytes += uncompressedSize;
    if (totalBytes > LIMITS.maxTotalEntryBytes) throw new ContainerError(`container content exceeds ${LIMITS.maxTotalEntryBytes} bytes`);

    if (localOffset + 30 > bytes.length) throw new ContainerError(`entry ${path} points past the end of the container`);
    if (dv.getUint32(localOffset, true) !== LOCAL_SIG) throw new ContainerError(`entry ${path} has a bad local header`);
    const localMethod = dv.getUint16(localOffset + 8, true);
    const localCrc = dv.getUint32(localOffset + 14, true);
    const localCompressed = dv.getUint32(localOffset + 18, true);
    const localUncompressed = dv.getUint32(localOffset + 22, true);
    const localNameLength = dv.getUint16(localOffset + 26, true);
    const localExtraLength = dv.getUint16(localOffset + 28, true);
    if (localMethod !== 0) throw new ContainerError(`entry ${path} has a compressed local header`);
    if (localCrc !== crc || localCompressed !== compressedSize || localUncompressed !== uncompressedSize) {
      throw new ContainerError(`entry ${path} disagrees with its central-directory record`);
    }
    const localName = fromUtf8(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== rawName) throw new ContainerError(`entry ${path} has a different name in its local header`);

    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + uncompressedSize;
    if (dataEnd > centralStart) throw new ContainerError(`entry ${path} overlaps the central directory`);
    for (const span of consumed) {
      if (dataStart < span.end && span.start < dataEnd) throw new ContainerError(`entry ${path} overlaps another entry's data`);
    }
    consumed.push({ start: localOffset, end: dataEnd });

    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== crc) throw new ContainerError(`entry ${path} fails its CRC check`);

    entries.push({ path, bytes: data });
    byPath.set(path, data);
    cursor += 46 + nameLength + extraLength + commentLen;
  }

  if (cursor !== centralStart + centralSize) throw new ContainerError("central directory has trailing bytes");

  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { entries, byPath, comment };
}
