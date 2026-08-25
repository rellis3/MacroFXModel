/**
 * Tests for js/sessionPathRoutes.js's fast live-poll cache — same design and
 * same reason for testing it end-to-end against real data as
 * js/levelAtlasRoutes.test.mjs (the thing being verified is real-world
 * latency, not mocked timing).
 *   node js/sessionPathRoutes.test.mjs
 */
import assert from 'node:assert/strict';
import { boundPacked, getFastLive, liveCache, liveWarming } from './sessionPathRoutes.js';

let passed = 0;
async function t(n, f) {
  try { await f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; }
}

console.log('sessionPathRoutes');

await t('boundPacked trims to roughly the requested trailing days', () => {
  const n = 300 * 1440, T0 = 1700000000;
  const times = new Int32Array(n), opens = new Float32Array(n), highs = new Float32Array(n), lows = new Float32Array(n), closes = new Float32Array(n), volumes = new Float32Array(n);
  for (let i = 0; i < n; i++) { times[i] = T0 + i * 60; opens[i] = 100; closes[i] = 100; highs[i] = 100.01; lows[i] = 99.99; volumes[i] = 10; }
  const b = boundPacked({ n, times, opens, highs, lows, closes, volumes }, 180);
  const spanDays = (b.times[b.n - 1] - b.times[0]) / 86400;
  assert.ok(spanDays <= 181 && spanDays >= 179);
});

await t('getFastLive returns {warming:true} IMMEDIATELY on a cold cache (non-blocking)', async () => {
  liveCache.delete('eurusd'); liveWarming.delete('eurusd');
  const t0 = Date.now();
  const r = await getFastLive('eurusd');
  const ms = Date.now() - t0;
  assert.equal(r.warming, true);
  assert.ok(ms < 2000, `expected near-instant on cold start, took ${ms}ms`);
});

await t('getFastLive eventually warms up with real today-checkpoint rows', async () => {
  const deadline = Date.now() + 180_000;   // the walk itself is slower than Level Atlas's (extra dimensions + two-pass peak tracking) — generous timeout
  let r;
  while (Date.now() < deadline) {
    r = await getFastLive('eurusd');
    if (!r.warming) break;
    await new Promise(res => setTimeout(res, 3000));
  }
  assert.ok(r && !r.warming, 'cold start never finished within 180s');
  assert.ok(r.date, 'expected a live date once warm');
  assert.ok(Array.isArray(r.rows));
});

await t('a SECOND warm call is dramatically faster than the cold path', async () => {
  const t0 = Date.now();
  const r1 = await getFastLive('eurusd');
  const t1 = Date.now();
  const r2 = await getFastLive('eurusd');
  const ms2 = Date.now() - t1;
  console.log(`    (warm call 1: ${t1 - t0}ms, warm call 2: ${ms2}ms)`);
  assert.equal(r1.warming, false); assert.equal(r2.warming, false);
  assert.ok(ms2 < 8000, `expected a warm poll well under the cold-path cost, took ${ms2}ms`);
});

console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
