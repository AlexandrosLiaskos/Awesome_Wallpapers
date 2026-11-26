import { inflateSync } from 'node:zlib';

/**
 * Unpacks a WOFF font into the plain TrueType/OpenType file it wraps.
 *
 * The site's fonts ship as WOFF, which browsers read but the text renderer
 * used for the brand images does not. WOFF is only a container: the same
 * tables, each optionally zlib-compressed, behind a different header.
 */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.length < 44 || woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('Not a WOFF file');

  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const totalSize = woff.readUInt32BE(16);

  const out = Buffer.alloc(totalSize);
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - searchRange, 10);

  let offset = 12 + numTables * 16;
  for (let index = 0; index < numTables; index++) {
    const entry = 44 + index * 20;
    const start = woff.readUInt32BE(entry + 4);
    const packedLength = woff.readUInt32BE(entry + 8);
    const length = woff.readUInt32BE(entry + 12);
    const packed = woff.subarray(start, start + packedLength);
    const table = packedLength < length ? inflateSync(packed) : packed;

    const record = 12 + index * 16;
    woff.copy(out, record, entry, entry + 4); // tag
    out.writeUInt32BE(woff.readUInt32BE(entry + 16), record + 4); // checksum
    out.writeUInt32BE(offset, record + 8);
    out.writeUInt32BE(length, record + 12);

    table.copy(out, offset);
    offset += Math.ceil(length / 4) * 4; // tables start on four-byte boundaries
  }

  return out;
}
