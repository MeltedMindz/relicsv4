// SPDX-License-Identifier: MIT
// A deliberately UNSAFE ZIP writer, used only to build hostile fixtures.
//
// The real writer in src/container.js validates every path and refuses anything malformed, which
// makes it useless for producing the archives an attacker would actually send. This forger writes
// exactly what it is told: traversal paths, symlink attributes, compressed methods, lying size
// headers, overlapping data, ZIP64 locators, trailing junk. It exists so the reader can be tested
// against real bytes rather than against a mock.
//
// Nothing in the published package imports this file.

import { crc32 } from "../src/container.js";
import { utf8 } from "../src/sha256.js";

/**
 * @param {{ path: string, bytes: Uint8Array, method?: number, flags?: number, externalAttributes?: number,
 *           declaredUncompressedSize?: number, declaredCompressedSize?: number, localOffsetOverride?: number }[]} entries
 * @param {{ comment?: string, trailingBytes?: Uint8Array, zip64Locator?: boolean, entryCountOverride?: number }} [options]
 */
export function forgeZip(entries, options = {}) {
  const comment = utf8(options.comment ?? "relics-project-bundle/1");
  const prepared = entries.map((entry) => ({
    ...entry,
    nameBytes: utf8(entry.path),
    crc: entry.crcOverride ?? crc32(entry.bytes),
    method: entry.method ?? 0,
    flags: entry.flags ?? 0,
    externalAttributes: entry.externalAttributes ?? 0,
  }));

  const chunks = [];
  const offsets = [];
  let offset = 0;

  for (const entry of prepared) {
    const local = new Uint8Array(30 + entry.nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, entry.flags, true);
    dv.setUint16(8, entry.method, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0x0021, true);
    dv.setUint32(14, entry.crc, true);
    dv.setUint32(18, entry.declaredCompressedSize ?? entry.bytes.length, true);
    dv.setUint32(22, entry.declaredUncompressedSize ?? entry.bytes.length, true);
    dv.setUint16(26, entry.nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(entry.nameBytes, 30);
    offsets.push(offset);
    chunks.push(local, entry.bytes);
    offset += local.length + entry.bytes.length;
  }

  const centralStart = offset;
  prepared.forEach((entry, i) => {
    const central = new Uint8Array(46 + entry.nameBytes.length);
    const dv = new DataView(central.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, entry.flags, true);
    dv.setUint16(10, entry.method, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0x0021, true);
    dv.setUint32(16, entry.crc, true);
    dv.setUint32(20, entry.declaredCompressedSize ?? entry.bytes.length, true);
    dv.setUint32(24, entry.declaredUncompressedSize ?? entry.bytes.length, true);
    dv.setUint16(28, entry.nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, entry.externalAttributes, true);
    dv.setUint32(42, entry.localOffsetOverride ?? offsets[i], true);
    central.set(entry.nameBytes, 46);
    chunks.push(central);
    offset += central.length;
  });
  const centralSize = offset - centralStart;

  if (options.zip64Locator) {
    const locator = new Uint8Array(20);
    new DataView(locator.buffer).setUint32(0, 0x07064b50, true);
    chunks.push(locator);
    offset += 20;
  }

  const eocd = new Uint8Array(22 + comment.length);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(4, 0, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, options.entryCountOverride ?? prepared.length, true);
  dv.setUint16(10, options.entryCountOverride ?? prepared.length, true);
  dv.setUint32(12, centralSize, true);
  dv.setUint32(16, centralStart, true);
  dv.setUint16(20, comment.length, true);
  eocd.set(comment, 22);
  chunks.push(eocd);

  if (options.trailingBytes) chunks.push(options.trailingBytes);

  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}
