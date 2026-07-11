import test from 'node:test';
import assert from 'node:assert/strict';
import { fillRealismLadder } from './fillRealismEngine.js';

// Synthetic 1-min M1: each broker-day session rises to a peak mid-session then
// reverts toward the open — a clean fade setup — with intrabar wobble so a coarse
// bar hides the touch order the fine bar resolves. Sessions split at 22:00 UTC.
function synthM1(nDays, step = 1) {
  const bars = [];
  const startSec = Math.floor(Date.UTC(2020, 0, 1, 22, 0, 0) / 1000);
  const perDay = Math.floor((24 * 60) / step);
  let px = 100;
  for (let d = 0; d < nDays; d++) {
    px *= 1 + (((d % 5) - 2) * 0.0005);                 // slow drift so σ is finite
    // Day-varying amplitude so only the big days pierce the (calibrated) band and
    // then revert — a realistic fade setup, not every day identical.
    const amp = 0.006 + 0.020 * Math.abs(Math.sin(d * 1.3) * Math.cos(d * 0.7));
    for (let m = 0; m < perDay; m++) {
      const frac = m / perDay;                          // 0..1 across the session
      const shape = Math.sin(frac * Math.PI);           // up then back to ~open
      const mid = px * (1 + amp * shape);
      const wob = px * 0.0006 * Math.sin(frac * Math.PI * 40);
      const o = mid, c = mid + wob * 0.2;
      const hi = Math.max(o, c) + Math.abs(wob) + px * 0.0002;
      const lo = Math.min(o, c) - Math.abs(wob) - px * 0.0002;
      bars.push({ time: startSec + (d * perDay + m) * step * 60, open: o, high: hi, low: lo, close: c });
    }
  }
  return bars;
}

// Coarse-resample a 1-min series to `step` minutes (aggregate OHLC per bucket).
function resample(bars1, step) {
  const out = new Map();
  for (const b of bars1) {
    const bucket = Math.floor(b.time / (step * 60)) * step * 60;
    const cur = out.get(bucket);
    if (!cur) out.set(bucket, { time: bucket, open: b.open, high: b.high, low: b.low, close: b.close });
    else { if (b.high > cur.high) cur.high = b.high; if (b.low < cur.low) cur.low = b.low; cur.close = b.close; }
  }
  return [...out.values()].sort((a, b) => a.time - b.time);
}

test('fillRealismLadder: runs the report fade at multiple resolutions and reports per-step OOS', () => {
  const m1 = synthM1(260);
  const r = fillRealismLadder({ '1': m1, '15': resample(m1, 15), '60': resample(m1, 60) }, { pair: 'EURUSD' });
  assert.ok(!r.insufficient, 'enough data across granularities');
  assert.deepEqual(r.steps, [1, 15, 60], 'three granularities resolved');
  for (const st of r.steps) {
    assert.ok(typeof r.perStep[st].oos.sharpe === 'number', `step ${st} has OOS sharpe`);
    assert.ok(typeof r.perStep[st].zeroDurPct === 'number', `step ${st} has zero-duration %`);
  }
});

test('fillRealismLadder: coarser bars are more zero-duration-heavy than 1-min', () => {
  const m1 = synthM1(260);
  const r = fillRealismLadder({ '1': m1, '60': resample(m1, 60) }, { pair: 'EURUSD' });
  assert.ok(r.perStep[60].zeroDurPct >= r.perStep[1].zeroDurPct,
    `coarse zero-dur ${r.perStep[60].zeroDurPct}% ≥ fine ${r.perStep[1].zeroDurPct}%`);
});

test('fillRealismLadder: reports the honest-vs-coarse verdict fields', () => {
  const m1 = synthM1(260);
  const r = fillRealismLadder({ '1': m1, '60': resample(m1, 60) }, { pair: 'EURUSD' });
  assert.equal(r.fineStep, 1);
  assert.equal(r.coarseStep, 60);
  assert.equal(typeof r.artifact, 'boolean');
  assert.ok('sharpeDrop' in r && 'fracRetained' in r, 'drop + retained present');
});

test('fillRealismLadder: insufficient data flagged, not thrown', () => {
  const r = fillRealismLadder({ '1': synthM1(20) }, { pair: 'EURUSD' });
  assert.ok(r.insufficient, 'flagged insufficient');
});
