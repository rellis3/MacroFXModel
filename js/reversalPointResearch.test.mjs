import test from 'node:test';
import assert from 'node:assert/strict';
import { _zigzag, reversalStudy } from './reversalPointResearch.js';

const b = (t, h, l, c) => ({ time: new Date(Date.UTC(2021, 0, 4, 0) + t * 3600_000), open: c, high: h, low: l, close: c, _t: Date.UTC(2021, 0, 4, 0) + t * 3600_000 });

test('_zigzag: detects an up-then-down swing as a high pivot', () => {
  // Rise 100→110, then fall ≥ thr(3) to 106 → confirms the 110 high as a pivot.
  const bars = [b(0, 100, 99, 100), b(1, 105, 100, 105), b(2, 110, 104, 110), b(3, 109, 106, 106), b(4, 107, 105.5, 106)];
  const piv = _zigzag(bars, 3);
  assert.ok(piv.length >= 1, 'a pivot detected');
  const high = piv.find(p => p.kind === 'high');
  assert.ok(high, 'a high pivot present');
  assert.ok(Math.abs(high.price - 110) < 1e-9, 'high pivot at the swing high (110)');
});

test('_zigzag: sub-threshold wiggle is NOT a pivot', () => {
  // Never retraces ≥ thr(5) from the running extreme → no confirmed reversal.
  const bars = [b(0, 100, 99.5, 100), b(1, 101, 100.5, 101), b(2, 102, 101, 102), b(3, 102.5, 101.5, 102.5)];
  assert.equal(_zigzag(bars, 5).length, 0, 'monotone rise, no ≥thr retrace ⇒ no pivot');
});

// ── Synthetic multi-day intraday with a repeating up/down swing per day ──
function synthDays(nDays) {
  const bars = []; const H1 = 3600_000; const start = Date.UTC(2021, 0, 4, 0);
  let t = 0, px = 100;
  for (let d = 0; d < nDays; d++) {
    // 24 hourly bars: ramp up ~1.2% then back down ~1.2% (a clean intraday reversal).
    for (let h = 0; h < 24; h++) {
      const frac = h < 12 ? h / 12 : (24 - h) / 12;       // 0→1→0 triangle
      const c = px * (1 + 0.012 * frac);
      const hi = c * 1.0005, lo = c * 0.9995;
      const ms = start + (t) * H1;
      bars.push({ time: new Date(ms), open: c, high: hi, low: lo, close: c }); t++;
    }
  }
  return bars;
}

test('reversalStudy: extracts reversals + reports distance from open & running extreme', () => {
  const r = reversalStudy(synthDays(60), { revFrac: 0.25 });
  assert.ok(!r.insufficient, 'enough days');
  assert.ok(r.nReversals > 0, 'reversals extracted');
  assert.ok(r.reversalsPerDay > 0, 'per-day count reported');
  assert.ok(r.runFromExtremePct.n > 0 && r.runFromExtremePct.p50 > 0, 'run-from-extreme distribution present');
  assert.ok(r.fromOpenPct.p50 >= 0, 'from-open distribution present');
  // Percentiles are monotone.
  const q = r.runFromExtremePct;
  assert.ok(q.p25 <= q.p50 + 1e-9 && q.p50 <= q.p75 + 1e-9 && q.p75 <= q.p90 + 1e-9, 'percentiles monotone');
});

test('reversalStudy: splits dominant vs minor and they sum to the total', () => {
  const r = reversalStudy(synthDays(60), { revFrac: 0.25 });
  assert.ok(r.dominant.n > 0, 'dominant reversals present');
  assert.equal(r.dominant.n + r.minor.n, r.runFromExtremePct.n, 'dominant + minor = total reversals');
  // A day has at most 2 dominant reversals (one high, one low) → dominant ≤ 2×nDays.
  assert.ok(r.dominant.n <= 2 * r.nDays, 'at most 2 dominant per day');
});

test('reversalStudy: forecast-zone bands cover every reversal and fractions sum to ~1', () => {
  const r = reversalStudy(synthDays(60), { revFrac: 0.25 });
  const bd = r.bands;
  assert.equal(bd.belowMed + bd.medTo75 + bd.above75, bd.n, 'band counts partition the reversals');
  assert.equal(bd.n, r.runFromExtremePct.n, 'bands cover all reversals');
  assert.ok(Math.abs(bd.fBelowMed + bd.fMedTo75 + bd.fAbove75 - 1) < 0.01, 'band fractions sum to ~1');
  // Dominant/minor band partitions are internally consistent too.
  assert.equal(r.dominantBands.n, r.dominant.n, 'dominant bands cover dominant reversals');
  assert.equal(r.minorBands.n, r.minor.n, 'minor bands cover minor reversals');
});

test('reversalStudy: insufficient data flagged, not thrown', () => {
  assert.equal(reversalStudy(synthDays(5)).insufficient, true);
});
