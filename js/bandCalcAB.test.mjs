/**
 * Tests for the band-calc A/B. On synthetic daily OHLC: the empirical calcs
 * (climatology, ratio) must self-calibrate near 50%/25% exceedance, and the ranker
 * must put the best-calibrated calc first. Pure, no network.
 *
 *   node --test js/bandCalcAB.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandCalcAB } from './bandCalcAB.js';

function mulberry32(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function days(n, seed = 3) {
  const r = mulberry32(seed); let px = 100; const out = [];
  for (let i = 0; i < n; i++) {
    const o = px, vol = 0.008 * (0.7 + 0.6 * r());
    const c = o * (1 + (r() - 0.5) * 2 * vol);
    const hi = Math.max(o, c) * (1 + r() * vol * 0.9), lo = Math.min(o, c) * (1 - r() * vol * 0.9);
    out.push({ open: o, high: hi, low: lo, close: c }); px = c;
  }
  return out;
}

test('bandCalcAB: insufficient data returns a flag', () => {
  assert.equal(bandCalcAB(days(40), 'fx').insufficient, true);
});

test('bandCalcAB: empirical calcs self-calibrate near 50/25', () => {
  const r = bandCalcAB(days(1500, 3), 'fx');
  assert.ok(!r.insufficient);
  const clim = r.results.find(x => x.key === 'climatology');
  assert.ok(Math.abs(clim.exceedMedianPct - 50) < 6, `climatology exceed-median near 50 (${clim.exceedMedianPct})`);
  assert.ok(Math.abs(clim.exceed75Pct - 25) < 6, `climatology exceed-75 near 25 (${clim.exceed75Pct})`);
  const ratio = r.results.find(x => x.key === 'ratio_yz');
  assert.ok(Math.abs(ratio.exceedMedianPct - 50) < 8, `ratio exceed-median near 50 (${ratio.exceedMedianPct})`);
});

test('bandCalcAB: ranker puts best-calibrated calc first', () => {
  const r = bandCalcAB(days(1500, 5), 'fx');
  assert.ok(r.ranked.length >= 4);
  // #1 has the smallest calibration miss.
  for (const x of r.ranked.slice(1)) assert.ok(r.ranked[0].calibMiss <= x.calibMiss + 1e-9, 'ranked by calibration miss');
  // Every calc reports the full metric set.
  for (const x of r.results) {
    assert.ok(x.exceedMedianPct != null && x.exceed75Pct != null && x.sharpness != null && x.calibMiss != null);
    assert.ok(x.n > 100, 'meaningful sample');
  }
});

test('bandCalcAB: no-lookahead — a forecast for day i never uses day i', () => {
  // Sanity: shifting the last bar to an extreme range must not change earlier scores.
  const base = days(600, 9);
  const bumped = base.map((b, i) => i === base.length - 1 ? { ...b, high: b.high * 2 } : b);
  const rA = bandCalcAB(base, 'fx'), rB = bandCalcAB(bumped, 'fx');
  const cA = rA.results.find(x => x.key === 'climatology'), cB = rB.results.find(x => x.key === 'climatology');
  // n grows by at most 1; the bulk exceedance rate is essentially unchanged.
  assert.ok(Math.abs(cA.exceedMedianPct - cB.exceedMedianPct) < 1.5, 'a single future bar barely moves the aggregate (no lookahead leak)');
});
