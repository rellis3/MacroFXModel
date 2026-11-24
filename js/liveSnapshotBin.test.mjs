// js/liveSnapshotBin.test.mjs: the binary live snapshot must round-trip a packed M1 window exactly and refuse anything malformed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { packToBuffer, packFromBuffer } from './levelAtlasRoutes.js';

const make = (n, typed = true) => {
  const T = typed ? Int32Array : Array, F = typed ? Float32Array : Array;
  const p = { n, times: new T(n), opens: new F(n), highs: new F(n), lows: new F(n), closes: new F(n), volumes: new F(n) };
  for (let i = 0; i < n; i++) { p.times[i] = 1_700_000_000 + i * 60; p.opens[i] = Math.fround(1.0812 + i * 1e-5); p.highs[i] = Math.fround(1.0815 + i * 1e-5); p.lows[i] = Math.fround(1.0809 + i * 1e-5); p.closes[i] = Math.fround(1.0813 + i * 1e-5); p.volumes[i] = i % 7; }
  return p;
};

test('round trip is exact for typed and plain arrays, and the file is ~24 bytes per bar', () => {
  for (const typed of [true, false]) {
    const p = make(12345, typed), buf = packToBuffer(p, 1_764_000_000_123);
    assert.equal(buf.byteLength, 16 + 12345 * 24);
    const r = packFromBuffer(buf);
    assert.equal(r.savedAtMs, 1_764_000_000_123); assert.equal(r.packed.n, 12345);
    for (const k of ['times', 'opens', 'highs', 'lows', 'closes', 'volumes']) assert.deepEqual(Array.from(r.packed[k]), Array.from(p[k]), k);
  }
});
test('reads correctly from a Buffer that sits at an unaligned offset inside a bigger ArrayBuffer (as a pooled read does)', () => {
  const buf = packToBuffer(make(1000), 5), big = new Uint8Array(buf.byteLength + 7); big.set(buf, 3);
  const view = Buffer.from(big.buffer, 3, buf.byteLength), r = packFromBuffer(view);
  assert.deepEqual(Array.from(r.packed.closes.subarray(0, 3)), Array.from(make(1000).closes.subarray(0, 3)));
});
test('wrong magic, truncated, extended, empty and missing input all return null', () => {
  const buf = packToBuffer(make(50), 1);
  const bad = Buffer.from(buf); bad[0] ^= 0xff;
  assert.equal(packFromBuffer(bad), null); assert.equal(packFromBuffer(buf.subarray(0, buf.byteLength - 4)), null);
  assert.equal(packFromBuffer(Buffer.concat([buf, Buffer.alloc(4)])), null); assert.equal(packFromBuffer(Buffer.alloc(8)), null);
  assert.equal(packFromBuffer(null), null); assert.equal(packFromBuffer(packToBuffer({ ...make(0), n: 0 }, 1)), null);
});
