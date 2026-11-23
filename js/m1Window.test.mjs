// js/m1Window.test.mjs: the window loader must return exactly the last rows of the full decoded snapshot, and refuse (null) when anything does not match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { _loadM1WindowForPair } from './volBacktestM1Engine.js';

const ETAG = '"abc123def456"';
function snapshot(n, { etag = ETAG, ver = 1, perDay = 1000, step = 60 } = {}) {   // same layout as packToBinary
  const eb = Buffer.from(etag), pad = Math.ceil(eb.length / 4) * 4, base = 12 + pad;
  const buf = Buffer.alloc(base + n * 24);
  buf.writeUInt32LE(n, 0); buf.writeUInt32LE(ver, 4); buf.writeUInt32LE(eb.length, 8); eb.copy(buf, 12);
  const cols = [new Int32Array(buf.buffer, buf.byteOffset + base, n)]; for (let c = 1; c < 6; c++) cols.push(new Float32Array(buf.buffer, buf.byteOffset + base + c * n * 4, n));
  for (let i = 0; i < n; i++) { cols[0][i] = 1.7e9 + Math.floor(i / perDay) * 86400 + (i % perDay) * step; for (let c = 1; c < 6; c++) cols[c][i] = c * 1000 + (i % 977) / 7; }
  return { buf, cols };
}
const fake = (buf, etag = ETAG) => ({ send: async cmd => {
  const name = cmd.constructor.name;
  if (name === 'HeadObjectCommand') return { ETag: etag };
  const m = /bytes=(\d+)-(\d+)/.exec(cmd.input.Range); const part = buf.subarray(Number(m[1]), Math.min(buf.length, Number(m[2]) + 1));
  return { Body: { transformToByteArray: async () => new Uint8Array(part) } };
} });

test('window equals the last rows of every column of the full snapshot', async () => {
  const n = 60000, { buf, cols } = snapshot(n);
  const w = await _loadM1WindowForPair('eurusd', 10, fake(buf));   // 10 days × 1440 + 5000 = 19,400 rows
  assert.ok(w); assert.equal(w.n, 19400);
  const from = n - w.n;
  assert.deepEqual(Array.from(w.times), Array.from(cols[0].subarray(from)));
  ['opens', 'highs', 'lows', 'closes', 'volumes'].forEach((k, i) => assert.deepEqual(Array.from(w[k]), Array.from(cols[i + 1].subarray(from)), k));
});
test('a short history returns all of it', async () => {
  const { buf, cols } = snapshot(3000); const w = await _loadM1WindowForPair('x', 180, fake(buf));
  assert.equal(w.n, 3000); assert.deepEqual(Array.from(w.times), Array.from(cols[0]));
});
test('changed source file, wrong decode version, or too-dense data all fall back (null)', async () => {
  const { buf } = snapshot(60000);
  assert.equal(await _loadM1WindowForPair('x', 10, fake(buf, '"other"')), null);
  assert.equal(await _loadM1WindowForPair('x', 10, fake(snapshot(60000, { ver: 2 }).buf)), null);
  assert.equal(await _loadM1WindowForPair('x', 10, fake(snapshot(60000, { perDay: 60000, step: 1 }).buf)), null);   // 60k bars inside one day (1 s apart): 19,400 rows span under 10 days, so the window is too short
  assert.equal(await _loadM1WindowForPair('x', 10, null), null);
});
