// js/zipRead.test.mjs: the zip reader on an in-memory archive built here, and the range reader against a fake server that honours (and, in one test, ignores) Range.
// node js/zipRead.test.mjs
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { crc32, listEntries, readEntry, readRemoteEntry, findEocd } from './zipRead.js';

let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

/** A minimal zip writer: [{ name, data: Buffer, method: 0|8, localExtra?: number }]. */
function makeZip(files, comment = '') {
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), method = f.method ?? 8, comp = method === 8 ? zlib.deflateRawSync(f.data) : f.data;
    const extra = Buffer.alloc(f.localExtra ?? 0, 0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc32(f.data), 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(extra.length, 28);
    parts.push(lh, name, extra, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc32(f.data), 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += lh.length + name.length + extra.length + comp.length;
  }
  const cd = Buffer.concat(central), com = Buffer.from(comment);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16); eocd.writeUInt16LE(com.length, 20);
  return Buffer.concat([...parts, cd, eocd, com]);
}

/** A fake server for one file: honours Range (suffix and absolute), counts bytes sent. */
function server(buf, { ignoreRange = false } = {}) {
  const stats = { bytes: 0, calls: [] };
  const f = async (_url, init = {}) => {
    const h = init.headers ?? {}, r = /^bytes=(-?)(\d*)-?(\d*)$/.exec(h.Range ?? '');
    stats.calls.push(h.Range ?? null);
    if (!r || ignoreRange) { stats.bytes += buf.length; return new Response(buf, { status: 200 }); }
    let a, b;
    if (r[1] === '-') { a = Math.max(0, buf.length - Number(r[2])); b = buf.length - 1; } else { a = Number(r[2]); b = Math.min(buf.length - 1, Number(r[3] || buf.length - 1)); }
    const slice = buf.subarray(a, b + 1);
    stats.bytes += slice.length;
    return new Response(slice, { status: 206 });
  };
  return { f, stats };
}

const big = Buffer.from('x'.repeat(2000) + 'BOE,3.75\n'.repeat(500));
const small = Buffer.from('hello,zip\n');

await t('crc32 matches the known check value', () => assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926));

await t('lists and reads entries from a zip in memory (deflate and stored, a local header with extra bytes)', () => {
  const z = makeZip([{ name: 'a.xlsx', data: big }, { name: 'b.txt', data: small, method: 0, localExtra: 7 }]);
  const e = listEntries(z);
  assert.deepEqual(e.map(x => x.name), ['a.xlsx', 'b.txt']);
  assert.ok(readEntry(z, 'a.xlsx').data.equals(big));
  assert.ok(readEntry(z, /^b\./).data.equals(small));
});

await t('a zip comment does not hide the end record', () => {
  const z = makeZip([{ name: 'a', data: small }], 'a comment after the directory');
  assert.equal(findEocd(z.subarray(z.length - 200)).entries, 1);
  assert.ok(readEntry(z, 'a').data.equals(small));
});

await t('not a zip, a missing entry and a corrupted entry are errors, never wrong data', () => {
  assert.throws(() => listEntries(Buffer.from('<html>blocked</html>')), /not a zip/);
  const z = makeZip([{ name: 'a', data: big }]);
  assert.throws(() => readEntry(z, 'nope'), /no entry matching/);
  const bad = Buffer.from(z); bad[40] ^= 0xff;   // flip a byte inside the compressed data
  assert.throws(() => readEntry(bad, 'a'));
});

await t('the range reader fetches only the tail and the one entry it wants', async () => {
  const filler = randomBytes(300_000), rnd = randomBytes(300_000);   // incompressible bulk the reader must NOT download
  const z = makeZip([{ name: 'old.xlsx', data: rnd }, { name: 'want.xlsx', data: big }, { name: 'other.xlsx', data: filler }]);
  const { f, stats } = server(z);
  const got = await readRemoteEntry('https://example.test/x.zip', 'want.xlsx', { fetchImpl: f });
  assert.ok(got.data.equals(big));
  assert.ok(stats.bytes < z.length / 2, `fetched ${stats.bytes} of ${z.length}`);
  assert.equal(stats.calls.length, 2);   // tail (holds the directory) + the entry
  assert.equal(got.bytesFetched, stats.bytes);
});

await t('a server that ignores Range is reported, not silently downloaded in full', async () => {
  const z = makeZip([{ name: 'a', data: big }]);
  const { f } = server(z, { ignoreRange: true });
  await assert.rejects(() => readRemoteEntry('https://example.test/x.zip', 'a', { fetchImpl: f }), /did not honour a Range request/);
});

await t('a directory bigger than the tail is fetched by its own range', async () => {
  const files = Array.from({ length: 40 }, (_, i) => ({ name: `file-with-a-fairly-long-name-${i}.xlsx`, data: Buffer.from(`row ${i}\n`.repeat(20)) }));
  const z = makeZip(files);
  const { f, stats } = server(z);
  const got = await readRemoteEntry('https://example.test/x.zip', 'file-with-a-fairly-long-name-39.xlsx', { fetchImpl: f, tailBytes: 400 });
  assert.ok(got.data.equals(Buffer.from('row 39\n'.repeat(20))));
  assert.equal(stats.calls.length, 3);
});

console.log(`zipRead: ${n} tests passed`);
