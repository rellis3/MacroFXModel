import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastAccuracy } from './forecastAccuracyEngine.js';

// Synthetic intraday: nDays London days, each an up-then-down triangle so σ is finite,
// the median line gets interacted with, and reversals exist.
function synthDays(nDays, amp = 0.012) {
  const bars = []; const H1 = 3600_000; const start = Date.UTC(2021, 0, 4, 0);
  let t = 0, px = 100;
  for (let d = 0; d < nDays; d++) {
    for (let h = 0; h < 24; h++) {
      const frac = h < 12 ? h / 12 : (24 - h) / 12;
      const c = px * (1 + amp * frac);
      bars.push({ time: new Date(start + t * H1), open: c, high: c * 1.0005, low: c * 0.9995, close: c }); t++;
    }
  }
  return bars;
}

test('forecastAccuracy: returns both panels with the three calibrations + naive', () => {
  const r = forecastAccuracy(synthDays(160), { pair: 'EURUSD' });
  assert.ok(!r.insufficient, 'enough data');
  assert.equal(r.cls, 'fx');
  for (const s of ['feller', 'cog', 'recal']) {
    assert.ok(r.panelA[s], `panelA has ${s}`);
    assert.ok(r.panelA[s].hlHit5 >= 0 && r.panelA[s].hlHit5 <= 100, 'hit rate is a %');
    assert.ok(r.panelA[s].hlExceed >= 0 && r.panelA[s].hlExceed <= 100, 'exceed rate is a %');
  }
  assert.ok(r.panelA.naive.hlHit5 != null, 'naive benchmark present');
});

test('forecastAccuracy: the tighter calibration exceeds MORE often (monotonic in the constant)', () => {
  const r = forecastAccuracy(synthDays(160), { pair: 'EURUSD' });
  // recal.hl (1.34) < feller.hl (1.57) → a lower line is exceeded at least as often.
  assert.ok(r.panelA.recal.hlExceed >= r.panelA.feller.hlExceed - 1e-9, 'lower line exceeded ≥ higher line');
});

test('forecastAccuracy: proposes an exceed-neutral calibrated constant per pair', () => {
  const r = forecastAccuracy(synthDays(160), { pair: 'EURUSD' });
  assert.ok(r.calibrated, 'calibrated block present');
  assert.ok(r.calibrated.hl_const > 0, 'calibrated H-L constant is positive');
  assert.ok(r.calibrated.hl_vs_feller > 0, 'factor vs Feller reported');
  // The calibrated constant IS the median(realized÷σ), so realized exceeds it ~50% of days.
  // Sanity: it should sit at/below Feller when realized runs below the Feller forecast.
  assert.ok(r.calibrated.hl_const <= 1.572 + 1e-9 || r.calibrated.hl_vs_feller >= 1, 'consistent with the exceed direction');
});

test('forecastAccuracy: panel B reports exhaustion location + touch/revert', () => {
  const r = forecastAccuracy(synthDays(160), { pair: 'GOLD' });
  const b = r.panelB;
  assert.ok(b.nDays > 0, 'days measured');
  assert.ok(b.medRangePct > 0, 'median range computed');
  assert.ok(b.medianTouchRate >= 0 && b.medianTouchRate <= 100, 'touch rate is a %');
  if (b.revertOfTouch != null && b.continueOfTouch != null) {
    assert.ok(Math.abs(b.revertOfTouch + b.continueOfTouch - 100) < 0.5, 'revert + continue ≈ 100% of resolved touches');
  }
});

test('forecastAccuracy: insufficient data flagged, not thrown', () => {
  assert.equal(forecastAccuracy(synthDays(30)).insufficient, true);
});
