/**
 * Tests for js/levelAtlasRoutes.js's fast live-poll cache — the piece that
 * makes the drawer's "Approaching" ticker pollable every few seconds instead
 * of waiting on a 40-160s full walk. `boundPacked` is tested on synthetic
 * data (pure, no network); `getFastLive` is tested end-to-end against REAL
 * EURUSD M1 (needs the same R2/disk access the live server has) because the
 * whole point being verified is real-world latency, not mocked timing.
 *   node js/levelAtlasRoutes.test.mjs
 */
import assert from 'node:assert/strict';
import { boundPacked, getFastLive, liveCache, liveWarming, pickFresher } from './levelAtlasRoutes.js';

let passed = 0;
const results = [];
async function t(n, f) {
  try { await f(); passed++; results.push(`  ✓ ${n}`); }
  catch (e) { results.push(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; }
}

console.log('levelAtlasRoutes');

// ── boundPacked — pure, synthetic ────────────────────────────────────────
function packedSpanning(days) {
  const n = days * 1440;   // one bar per minute
  const T0 = 1700000000;
  const times = new Int32Array(n), opens = new Float32Array(n), highs = new Float32Array(n),
        lows = new Float32Array(n), closes = new Float32Array(n), volumes = new Float32Array(n);
  for (let i = 0; i < n; i++) { times[i] = T0 + i * 60; opens[i] = 100 + i * 0.0001; closes[i] = opens[i]; highs[i] = opens[i] + 0.01; lows[i] = opens[i] - 0.01; volumes[i] = 10; }
  return { n, times, opens, highs, lows, closes, volumes };
}

await t('boundPacked trims to roughly the requested trailing days', () => {
  const p = packedSpanning(300);
  const b = boundPacked(p, 180);
  const spanDays = (b.times[b.n - 1] - b.times[0]) / 86400;
  assert.ok(spanDays <= 181 && spanDays >= 179, `expected ~180 days, got ${spanDays.toFixed(1)}`);
  assert.equal(b.times[b.n - 1], p.times[p.n - 1], 'must keep the newest bar');
});

await t('boundPacked returns the input unchanged when it is already shorter than the window', () => {
  const p = packedSpanning(50);
  const b = boundPacked(p, 180);
  assert.equal(b.n, p.n, 'a 50-day series asked to bound at 180 days should be untouched');
  assert.equal(b, p, 'should be the SAME object, not a needless copy');
});

await t('boundPacked handles an empty/null packed without throwing', () => {
  assert.equal(boundPacked(null, 180), null);
  assert.equal(boundPacked({ n: 0 }, 180)?.n, 0);
});

await t('boundPacked never drops the newest bar even at a 1-day window', () => {
  const p = packedSpanning(300);
  const b = boundPacked(p, 1);
  assert.equal(b.times[b.n - 1], p.times[p.n - 1]);
  assert.ok(b.n < p.n, 'must actually be smaller than the input');
});

// ── getFastLive — real EURUSD, end-to-end (needs R2/local M1 access) ─────
await t('getFastLive returns {warming:true} IMMEDIATELY on a cold cache (non-blocking)', async () => {
  liveCache.delete('eurusd'); liveWarming.delete('eurusd');
  const t0 = Date.now();
  const r = await getFastLive('eurusd');
  const ms = Date.now() - t0;
  assert.equal(r.warming, true, 'a cold cache must report warming, not block for the full load');
  assert.ok(ms < 2000, `expected an near-instant response on cold start, took ${ms}ms — the load must be backgrounded, not awaited inline`);
});

await t('getFastLive eventually warms up and returns real touches/pending, matching the canonical walk shape', async () => {
  const deadline = Date.now() + 120_000;
  let r;
  while (Date.now() < deadline) {
    r = await getFastLive('eurusd');
    if (!r.warming) break;
    await new Promise(res => setTimeout(res, 2000));
  }
  assert.ok(r && !r.warming, 'cold start never finished within 120s — investigate before trusting this path in production');
  assert.ok(r.date, 'expected a live date once warm');
  assert.ok(Array.isArray(r.touches) && Array.isArray(r.pending), 'expected touches/pending arrays');
});

await t('a SECOND warm call is dramatically faster than the cold path (cache hit, no recompute unless a new bar closed)', async () => {
  const t0 = Date.now();
  const r1 = await getFastLive('eurusd');
  const ms1 = Date.now() - t0;
  const t1 = Date.now();
  const r2 = await getFastLive('eurusd');
  const ms2 = Date.now() - t1;
  console.log(`    (warm call 1: ${ms1}ms, warm call 2: ${ms2}ms)`);
  assert.equal(r1.warming, false); assert.equal(r2.warming, false);
  assert.ok(ms2 < 5000, `expected a warm poll well under 5s (this is the number the whole redesign was for), took ${ms2}ms`);
  assert.equal(r1.date, r2.date, 'same live date across both warm calls');
});

// ── pickFresher — pure, synthetic. The exact bug this guards: a nightly
// Railway run landing between two pushes leaves R2 holding real but OLDER
// data than a freshly-pushed local bootstrap file (hit for real 2026-08-26,
// R2 was missing a field a same-day local rebuild had) — "R2 always wins"
// would silently keep serving the older copy forever.
await t('pickFresher picks R2 when it is newer than local', () => {
  const r2 = { generatedAt: '2026-08-26T20:00:00.000Z', v: 'r2' };
  const local = { generatedAt: '2026-08-26T10:00:00.000Z', v: 'local' };
  assert.equal(pickFresher(r2, local).v, 'r2');
});
await t('pickFresher picks LOCAL when it is newer than R2 — the exact staleness bug this exists to prevent', () => {
  const r2 = { generatedAt: '2026-08-26T10:00:00.000Z', v: 'r2' };
  const local = { generatedAt: '2026-08-26T20:00:00.000Z', v: 'local' };
  assert.equal(pickFresher(r2, local).v, 'local');
});
await t('pickFresher falls back to whichever source exists when the other is null', () => {
  assert.equal(pickFresher(null, { v: 'local' }).v, 'local');
  assert.equal(pickFresher({ v: 'r2' }, null).v, 'r2');
  assert.equal(pickFresher(null, null), null);
});

console.log(results.join('\n'));
console.log(`\n${passed} passed${process.exitCode ? ' — FAILURES ABOVE' : ''}`);
