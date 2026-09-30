/**
 * Unit tests for js/voteAtlasV4Lines.js. Synthetic data, no network.
 *   node js/voteAtlasV4Lines.test.mjs
 *
 * The load-bearing tests are the CAUSALITY ones. Vote Atlas v1-v3's backtest was
 * inflated for months by a feature that read a touch's own future outcome
 * (fixed 2026-09-29, 34d3438) — a bug these tests are shaped to catch in v4: a
 * touch's line level and bar index must be IDENTICAL when everything after it is
 * deleted, and when everything after it is replaced with different prices.
 */
import assert from 'node:assert/strict';
import { v4Days, firstTouches, nyCloseDailyBars, linesAtBar } from './voteAtlasV4Lines.js';

let passed = 0;
const t = (n, f) => { try { f(); passed++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; } };

// Deterministic PRNG + weekday-only M1 random walk.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function synth({ days = 140, seed = 7, start = Date.UTC(2025, 0, 6) / 1000, px = 1.1 } = {}) {
  const r = rng(seed), times = [], opens = [], highs = [], lows = [], closes = [], volumes = [];
  let p = px;
  for (let d = 0; d < days; d++) {
    const day0 = start + d * 86400, dow = new Date(day0 * 1000).getUTCDay();
    if (dow === 6) continue;                               // Saturday closed
    for (let m = 0; m < 1440; m++) {
      const tt = day0 + m * 60;
      if (dow === 5 && m >= 22 * 60) continue;             // Friday close
      if (dow === 0 && m < 22 * 60) continue;              // Sunday open 22:00Z
      const o = p, step = (r() - 0.5) * p * 0.0006;
      p = Math.max(1e-6, p + step);
      times.push(tt); opens.push(o); closes.push(p);
      highs.push(Math.max(o, p) * (1 + r() * 0.0001)); lows.push(Math.min(o, p) * (1 - r() * 0.0001)); volumes.push(1);
    }
  }
  return { n: times.length, times, opens, highs, lows, closes, volumes };
}
const slice = (p, end) => ({ n: end, times: p.times.slice(0, end), opens: p.opens.slice(0, end), highs: p.highs.slice(0, end),
  lows: p.lows.slice(0, end), closes: p.closes.slice(0, end), volumes: p.volumes.slice(0, end) });
function scramble(p, from, seed) {        // replace every bar >= from with a DIFFERENT walk
  const r = rng(seed), q = slice(p, p.n);
  let px = q.closes[from - 1];
  for (let i = from; i < q.n; i++) {
    const o = px; px = Math.max(1e-6, px + (r() - 0.5) * px * 0.002);
    q.opens[i] = o; q.closes[i] = px; q.highs[i] = Math.max(o, px) * 1.0002; q.lows[i] = Math.min(o, px) * 0.9998;
  }
  return q;
}
const OPTS = { instrument: 'EURUSD', assetClass: 'fx', eventTagFor: () => 'none' };
const touchesOf = packed => v4Days(packed, OPTS).flatMap(d => firstTouches(d).map(x => ({ ...x, date: d.date })));

console.log('voteAtlasV4Lines');
const P = synth();
const all = touchesOf(P);
const idxOfTime = new Map(P.times.map((tt, i) => [tt, i]));
// Sample touches spread across the series, every line type represented.
const sample = all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 60)) === 0);

t('synthetic series produces touches on every line family', () => {
  assert.ok(all.length > 100, `only ${all.length} touches`);
  for (const fam of ['OH_', 'OL_', 'CloseUp', 'CloseDn', 'ProjH', 'ProjL'])
    assert.ok(all.some(x => x.line.startsWith(fam)), `no ${fam} touch`);
});

t('TRUNCATION: every sampled touch is identical when all later data is deleted', () => {
  for (const x of sample) {
    const cut = idxOfTime.get(x.time) + 1;                  // keep the touch bar itself
    const again = touchesOf(slice(P, cut)).find(y => y.date === x.date && y.line === x.line);
    assert.ok(again, `${x.date} ${x.line} vanished when future deleted`);
    assert.equal(again.k, x.k); assert.equal(again.level, x.level);
  }
});

t('FUTURE-SCRAMBLE: every sampled touch is identical when later prices are replaced', () => {
  for (const x of sample) {
    const from = idxOfTime.get(x.time) + 1;
    if (from >= P.n) continue;
    const again = touchesOf(scramble(P, from, 99)).find(y => y.date === x.date && y.line === x.line);
    assert.ok(again, `${x.date} ${x.line} vanished when future replaced`);
    assert.equal(again.k, x.k); assert.equal(again.level, x.level);
  }
});

t('a day\'s ladder is unchanged when that day and everything after it is replaced', () => {
  const days = v4Days(P, OPTS);
  for (const d of days.filter((_, i) => i % 10 === 5)) {
    const from = idxOfTime.get(d.openSec);
    const d2 = v4Days(scramble(P, from, 3), OPTS).find(y => y.date === d.date);
    assert.ok(d2); assert.deepEqual(d2.ladder, d.ladder); assert.equal(d2.lastNyKey, d.lastNyKey);
  }
});

t('ladder only uses NY-17:00 daily bars that closed before the London open', () => {
  for (const d of v4Days(P, OPTS)) {
    const ny = nyCloseDailyBars(P).filter(b => b.n >= 60);
    const used = ny.find(b => b.key === d.lastNyKey);
    assert.ok(used.endSec <= d.openSec, `${d.date} used a NY day ending after its open`);
  }
});

t('NY day ends at 17:00 New York in both EST (22:00Z) and EDT (21:00Z)', () => {
  const ny = nyCloseDailyBars(P);
  const jan = ny.find(b => b.key === '2025-01-15'), may = ny.find(b => b.key === '2025-05-15');
  assert.equal(new Date(jan.endSec * 1000).toISOString(), '2025-01-15T22:00:00.000Z');
  assert.equal(new Date(may.endSec * 1000).toISOString(), '2025-05-15T21:00:00.000Z');
});

t('Proj lines at bar k use extremes through bar k-1 only (not bar k\'s own)', () => {
  const day = { static: {}, ladder: { hl: { p50: 1, p75: 2 } } };
  const lv = linesAtBar(day, 5, 110, 100);
  assert.equal(lv.ProjH_p50, 100 * 1.01); assert.equal(lv.ProjL_p50, 110 * 0.99);
  // firstTouches: a bar that sets a NEW low must not lower Proj H for itself.
  const bars = [{ time: 0, open: 100, high: 100, low: 100, close: 100 },
                { time: 60, open: 100, high: 100.5, low: 99, close: 99.5 }];
  const d = { open: 100, bars, static: {}, ladder: { hl: { p50: 1.4, p75: 5 } } };
  // With bar 1's own new low (99) Proj H would be 100.386 and bar 1's high 100.5
  // would "touch" it; causally Proj H is 100*1.014 = 101.4, untouched.
  assert.ok(!firstTouches(d).some(x => x.line === 'ProjH_p50'));
});

console.log(`\n${passed} passed${process.exitCode ? ', FAILURES above' : ''}`);
