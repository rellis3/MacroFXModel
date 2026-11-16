// js/zipRead.js: a small, dependency-free zip reader (stored and deflate entries, no ZIP64), plus a reader that fetches ONE entry of a remote zip with HTTP
// range requests. Built for the Bank of England's yield-curve downloads (js/boePath.js): the daily file is a 300 KB zip, and the 2025-to-present history
// is one 1.4 MB entry inside an 11.8 MB archive that the server lets us read by byte range, so a one-off backfill costs 1.4 MB, not 11.8 MB.
// Pure apart from the injected fetch. Tested in js/zipRead.test.mjs with an in-memory zip and a fake fetch that honours Range.
import zlib from 'node:zlib';

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

/** CRC-32 of a buffer (the zip checksum). */
let CRC_T = null;
export function crc32(buf) {
  if (!CRC_T) { CRC_T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c; } }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** The end-of-central-directory record inside `tail` (the last bytes of the file): { entries, cdSize, cdOffset } or null. */
export function findEocd(tail) {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_EOCD) {
      const commentLen = tail.readUInt16LE(i + 20);
      if (i + 22 + commentLen > tail.length) continue;
      return { entries: tail.readUInt16LE(i + 10), cdSize: tail.readUInt32LE(i + 12), cdOffset: tail.readUInt32LE(i + 16) };
    }
  }
  return null;
}

/** Parse a central directory buffer -> [{ name, method, compSize, size, crc, localOffset }]. */
export function parseCentral(cd, count) {
  const out = [];
  let p = 0;
  while (p + 46 <= cd.length && out.length < count) {
    if (cd.readUInt32LE(p) !== SIG_CEN) throw new Error('zip: bad central directory entry');
    const method = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16), compSize = cd.readUInt32LE(p + 20), size = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32), localOffset = cd.readUInt32LE(p + 42);
    if (compSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) throw new Error('zip: ZIP64 is not supported');
    out.push({ name: cd.toString('utf8', p + 46, p + 46 + nameLen), method, compSize, size, crc, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The entries of a whole zip held in memory. */
export function listEntries(buf) {
  const tail = buf.subarray(Math.max(0, buf.length - 70_000));
  const e = findEocd(tail);
  if (!e) throw new Error('zip: no end-of-central-directory record (not a zip file)');
  return parseCentral(buf.subarray(e.cdOffset, e.cdOffset + e.cdSize), e.entries);
}

/** Decode one entry from `data`, the bytes starting at the entry's LOCAL header (the header may be longer or shorter than the central directory implies). */
export function decodeEntry(entry, data) {
  if (data.length < 30 || data.readUInt32LE(0) !== SIG_LOC) throw new Error('zip: bad local header');
  const start = 30 + data.readUInt16LE(26) + data.readUInt16LE(28);
  const comp = data.subarray(start, start + entry.compSize);
  if (comp.length < entry.compSize) throw new Error('zip: entry data is cut short');
  let raw;
  if (entry.method === 0) raw = Buffer.from(comp);
  else if (entry.method === 8) raw = zlib.inflateRawSync(comp);
  else throw new Error(`zip: unsupported compression method ${entry.method}`);
  if (raw.length !== entry.size) throw new Error('zip: entry size does not match');
  if (crc32(raw) !== entry.crc) throw new Error('zip: entry checksum does not match');
  return raw;
}

/** One entry of a zip held in memory, by exact name or RegExp. */
export function readEntry(buf, which) {
  const entries = listEntries(buf);
  const entry = entries.find(e => (which instanceof RegExp ? which.test(e.name) : e.name === which));
  if (!entry) throw new Error(`zip: no entry matching ${which} (has: ${entries.map(e => e.name).join(', ')})`);
  return { name: entry.name, data: decodeEntry(entry, buf.subarray(entry.localOffset)) };
}

/**
 * One entry of a REMOTE zip by byte ranges: the tail (end record + central directory), then only that entry's bytes.
 * fetchImpl(url, { headers }) must answer 206 to a Range request (the Bank's site does). Falls back to nothing: a server that ignores Range returns the whole
 * file with 200, which this reports as an error instead of silently downloading 12 MB.
 * Returns { name, data, bytesFetched }.
 */
export async function readRemoteEntry(url, which, { fetchImpl = fetch, headers = {}, tailBytes = 65_536, timeoutMs = 60_000 } = {}) {
  let bytesFetched = 0;
  const range = async (spec, need206 = true) => {
    const r = await fetchImpl(url, { headers: { ...headers, Range: `bytes=${spec}` }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    if (r.status !== 206) throw new Error(need206 ? `the server did not honour a Range request (HTTP ${r.status})` : `HTTP ${r.status}`);
    const b = Buffer.from(await r.arrayBuffer());
    bytesFetched += b.length;
    return b;
  };
  const tail = await range(`-${tailBytes}`);
  const e = findEocd(tail);
  if (!e) throw new Error('zip: no end-of-central-directory record in the last bytes');
  // the central directory is almost always inside the tail we already hold; if not, fetch it
  let cd;
  const eocdAt = (() => { for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === SIG_EOCD) return i; return -1; })();   // the directory ends right where the end record starts
  if (e.cdSize <= eocdAt) cd = tail.subarray(eocdAt - e.cdSize, eocdAt);
  else cd = await range(`${e.cdOffset}-${e.cdOffset + e.cdSize - 1}`);
  const entries = parseCentral(cd, e.entries);
  const entry = entries.find(x => (which instanceof RegExp ? which.test(x.name) : x.name === which));
  if (!entry) throw new Error(`zip: no entry matching ${which} (has: ${entries.map(x => x.name).join(', ')})`);
  const data = await range(`${entry.localOffset}-${entry.localOffset + 30 + 1024 + entry.name.length + entry.compSize - 1}`);
  return { name: entry.name, data: decodeEntry(entry, data), bytesFetched };
}
