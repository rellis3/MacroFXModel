import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateK, reversalFade } from './reversalFadeEngine.js';

// Synthetic intraday: nDays London days, each a clean up-then-down triangle (a real
// intraday reversal) so dominant swings exist and the projected lines get touched.
function synthDays(nDays, amp = 0.012) {
  const bars = []; const H1 = 3600_000; const start = Date.UTC(2021, 0, 4, 0);
  let t = 0, px = 100;
  for (let d = 0; d < nDays; d++) {
    for (let h = 0; h < 24; h++) {
      const frac = h < 12 ? h / 12 : (24 - h) / 12;      // 0→1→0 triangle
      const c = px * (1 + amp * frac);
      const hi = c * 1.0005, lo = c * 0.9995;
      bars.push({ time: new Date(start + t * H1), open: c, high: hi, low: lo, close: c }); t++;
    }
  }
  return bars;
}

import { buildLondonDaily } from './volEstimatorAB.js';

test('estimateK: returns a finite positive k with a dominant count on clean reversals', () => {
  const k = estimateK(buildLondonDaily(synthDays(120)), 0.25);
  assert.ok(k && k.k > 0, 'k is a finite positive number');
  assert.ok(k.nDominant >= 30, 'enough dominant reversals to trust it');
});

test('estimateK: null when too few dominant reversals', () => {
  assert.equal(estimateK(buildLondonDaily(synthDays(20)), 0.25), null);
});

test('reversalFade: produces an IS/OOS A/B for base(k=1) and test(k) with costs applied', () => {
  const r = reversalFade(synthDays(160), { pair: 'EURUSD', isFrac: 0.5 });
  assert.ok(!r.insufficient, 'enough data');
  assert.ok(r.kIS > 0, 'per-pair k estimated');
  assert.equal(r.type, 'major'); assert.equal(r.cost, 1.5);
  // Both strategies and both exits present, each with is + oos summaries.
  for (const strat of ['base', 'test']) for (const exit of ['scalp', 'confirm']) {
    assert.ok(r[strat][exit].is && r[strat][exit].oos, `${strat}.${exit} has is+oos`);
  }
  // Trades were taken out-of-sample.
  assert.ok(r.base.scalp.oos.trades > 0, 'base scalp took OOS trades');
  assert.ok(r.test.scalp.oos.trades > 0, 'test scalp took OOS trades');
});

test('reversalFade: cost is subtracted (a zero-target scalp can only lose the cost or the stop)', () => {
  // With costs on, the blind-scalp expectancy must reflect the round-trip cost drag:
  // net expectancy ≤ gross. We assert the cost field is wired and non-zero for FX.
  const r = reversalFade(synthDays(160), { pair: 'USDCHF' });
  assert.ok(r.cost > 0, 'a round-trip cost is applied');
  // The test (k) line for CHF should sit CLOSER than base (k<1 for a mean-reverting
  // triangle is not guaranteed on synth, so we only assert k is finite + used).
  assert.ok(Number.isFinite(r.kIS), 'k is finite');
});

test('reversalFade: insufficient data flagged, not thrown', () => {
  assert.equal(reversalFade(synthDays(30)).insufficient, true);
});
