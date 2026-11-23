// js/londonKeyFast.test.mjs: the integer London-day key must equal the Date-based one, and the bucketing/range series built on it must be unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { londonDateKeyMs, _londonDateKeySlowForTest as slow, bucketM1IntoSessions } from './forecastAnalyser.js';
import { sessionRangeSeries } from './levelAtlasEngine.js';

test('londonDateKeyMs equals the Date-based key: random instants and every clock-change edge', () => {
  let x = 123456789; const rnd = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 400000; i++) { const ms = Math.floor(rnd() * 2.2e12); assert.equal(londonDateKeyMs(ms), slow(new Date(ms)), String(ms)); }
  for (let y = 1999; y <= 2036; y++) for (const m of [2, 9]) {
    const d = new Date(Date.UTC(y, m, 31, 1)); d.setUTCDate(31 - d.getUTCDay()); const edge = d.getTime();
    for (const off of [-86400000, -3600000 - 1, -3600000, -60000, -1, 0, 1, 59999, 60000, 3599999, 3600000, 3600001, 86400000]) assert.equal(londonDateKeyMs(edge + off), slow(new Date(edge + off)), `${y}-${m} ${off}`);
  }
  for (const ms of [0, 1, 86399999, 86400000, 1e12, 253402300799000]) assert.equal(londonDateKeyMs(ms), slow(new Date(ms)));
  assert.equal(londonDateKeyMs(NaN), slow(new Date(NaN)));
});

// Reference implementations: the originals, verbatim.
function refRange(packed) {
  const { n, times, opens, highs, lows, closes } = packed; const out = new Map();
  const sessionOf = h => (h >= 22 || h < 7) ? 'Asia' : h < 13 ? 'London' : 'NY';
  for (let i = 0; i < n; i++) {
    const t = times[i], d = new Date(t * 1000), h = d.getUTCHours(), sess = sessionOf(h), dayD = new Date(t * 1000);
    if (sess === 'Asia' && h < 7) dayD.setUTCDate(dayD.getUTCDate() - 1);
    const key = `${dayD.toISOString().slice(0, 10)}|${sess}`, cur = out.get(key);
    if (!cur) out.set(key, { hi: highs[i], lo: lows[i], range: 0, open: opens[i], close: closes[i], t0: t });
    else { if (highs[i] > cur.hi) cur.hi = highs[i]; if (lows[i] < cur.lo) cur.lo = lows[i]; cur.close = closes[i]; }
  }
  for (const v of out.values()) v.range = v.hi - v.lo; return out;
}
function refBucket(packed) {
  const map = new Map(); const { n, times, opens, highs, lows, closes, volumes } = packed;
  for (let i = 0; i < n; i++) {
    const t = times[i], dt = new Date(t < 1e12 ? t * 1000 : t), key = slow(dt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i], volume: volumes ? volumes[i] : 0 });
  }
  for (const arr of map.values()) arr.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)); return map;
}
test('sessionRangeSeries and bucketM1IntoSessions give exactly the original maps over a year spanning both clock changes', () => {
  const t0 = Date.UTC(2025, 9, 20) / 1000, n = 60 * 24 * 220;   // 20 Oct 2025 .. late May 2026: autumn and spring clock changes, weekends included
  const times = new Int32Array(n), o = new Float32Array(n), h = new Float32Array(n), l = new Float32Array(n), c = new Float32Array(n), v = new Float32Array(n);
  let p = 1.1; for (let i = 0; i < n; i++) { times[i] = t0 + i * 60; p += Math.sin(i / 97) * 1e-4 + ((i * 7919) % 13 - 6) * 1e-6; o[i] = p; h[i] = p + 2e-4; l[i] = p - 2e-4; c[i] = p + 1e-5; v[i] = 1 + (i % 5); }
  const packed = { n, times, opens: o, highs: h, lows: l, closes: c, volumes: v };
  assert.deepEqual([...sessionRangeSeries(packed)], [...refRange(packed)]);
  assert.deepEqual([...bucketM1IntoSessions(packed, 'Europe/London')], [...refBucket(packed)]);
  const ms = { ...packed, times: Float64Array.from(times, t => t * 1000) };   // epoch-millisecond times take the same path
  assert.deepEqual([...bucketM1IntoSessions(ms, 'Europe/London')], [...refBucket(ms)]);
});
