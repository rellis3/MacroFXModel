import test from 'node:test';
import assert from 'node:assert/strict';
import { feedAB, responsivenessTrace } from './cogGapPoc.js';

// Synthetic daily OHLC — GBM-ish, seeded (no Math.random) so runs are deterministic.
function synthDaily(n, seed = 1, vol = 0.008, px0 = 100) {
  const bars = []; let px = px0, s = seed >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const d0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    const ret = (rng() - 0.5) * 2 * vol;
    const open = px, close = px * (1 + ret);
    const hi = Math.max(open, close) * (1 + rng() * vol), lo = Math.min(open, close) * (1 - rng() * vol);
    bars.push({ date: new Date(d0 + i * 86400000).toISOString().substring(0, 10), open, high: hi, low: lo, close });
    px = close;
  }
  return bars;
}

test('feedAB: same calc on two feeds returns comparable medians + a delta', () => {
  const spot = synthDaily(300, 1, 0.008);
  const fut  = synthDaily(300, 2, 0.010);   // slightly higher vol → wider forecast
  const r = feedAB(spot, fut, 'fx');
  assert.ok(r.spot.hl_median > 0 && r.fut.hl_median > 0, 'both feeds forecast a positive median');
  assert.equal(typeof r.futVsSpotHlPct, 'number', 'delta computed');
  // The higher-vol feed should forecast the wider median → positive futVsSpot.
  assert.ok(r.futVsSpotHlPct > 0, 'higher-vol futures feed forecasts wider median');
});

test('feedAB: identical feeds ⇒ ~0 delta (calc is feed-only, no hidden asymmetry)', () => {
  const bars = synthDaily(300, 7, 0.008);
  const r = feedAB(bars, bars.map(b => ({ ...b })), 'commodity');
  assert.ok(Math.abs(r.futVsSpotHlPct) < 1e-6, 'same data ⇒ zero gap');
});

test('feedAB: insufficient bars flagged, not thrown', () => {
  const r = feedAB(synthDaily(30), synthDaily(300), 'fx');
  assert.equal(r.spot.insufficient, true);
  assert.equal(r.futVsSpotHlPct, null);
});

test('responsivenessTrace: per-estimator trajectory + movement score, fast moves ≥ slow', () => {
  const bars = synthDaily(300, 3, 0.008);
  const r = responsivenessTrace(bars, 8);
  assert.equal(r.dates.length, 8);
  for (const key of ['ewma090', 'hv30', 'yz30']) {
    assert.ok(r.estimators[key], `${key} present`);
    assert.equal(r.estimators[key].traj.length, 8, `${key} trajectory length`);
    assert.ok(r.estimators[key].latest > 0, `${key} latest median positive`);
  }
  // The fast EWMA should move day-to-day at least as much as the slow HV30 (responsiveness).
  const fast = r.estimators.ewma090.movementPct, slow = r.estimators.hv30.movementPct;
  if (fast != null && slow != null) assert.ok(fast >= slow - 1e-9, 'fast estimator moves ≥ slow');
});

test('responsivenessTrace: insufficient data flagged', () => {
  assert.equal(responsivenessTrace(synthDaily(50), 8).insufficient, true);
});
