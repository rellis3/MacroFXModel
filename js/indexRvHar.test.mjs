import test from 'node:test';
import assert from 'node:assert/strict';
import { rvHarSigma } from './indexRvHar.js';

// Synthetic 5-min bars with a KNOWN intraday vol level, so we can assert the
// annualised σ lands in the right ballpark (not halved like the GK shadow).
// Target: ~1% daily σ → ~16% annualised. Build days of 5-min steps whose summed
// squared returns ≈ (0.01)² so realised σ ≈ 1%/day.
function synth5m(nDays, dailySigma = 0.01) {
  const bars = []; const start = Math.floor(Date.UTC(2022, 0, 3, 0, 0, 0) / 1000);
  const perDay = 288;                          // 5-min bars in 24h
  const step = dailySigma / Math.sqrt(perDay); // per-bar σ so Σ steps² ≈ dailySigma²
  let px = 15000;
  for (let d = 0; d < nDays; d++) {
    for (let m = 0; m < perDay; m++) {
      // deterministic pseudo-random sign so realised var ≈ perDay*step² = dailySigma²
      const sign = ((d * 131 + m * 17) % 7) < 3 ? -1 : 1;
      const r = sign * step * (0.6 + 0.8 * (((m * 13 + d) % 5) / 4));
      const o = px, c = px * (1 + r);
      const hi = Math.max(o, c) * (1 + step * 0.3), lo = Math.min(o, c) * (1 - step * 0.3);
      bars.push({ time: start + (d * perDay + m) * 300, open: o, high: hi, low: lo, close: c });
      px = c;
    }
  }
  return bars;
}

test('rvHarSigma: produces a plausible annualised σ from the intraday path (not halved)', () => {
  const r = rvHarSigma(synth5m(200, 0.01));
  assert.ok(!r.insufficient, `enough data (${JSON.stringify(r)})`);
  assert.ok(r.volAnnual > 0, 'positive σ');
  // ~1%/day → ~16% annualised; allow a wide band but reject a halved (~8%) or absurd value
  assert.ok(r.volAnnual > 10 && r.volAnnual < 30, `σ ${r.volAnnual}% is in the plausible index range`);
  assert.ok(r.nDays >= 150, 'built the daily series');
});

test('rvHarSigma: higher intraday vol → higher σ (monotone)', () => {
  const lo = rvHarSigma(synth5m(200, 0.008)).volAnnual;
  const hi = rvHarSigma(synth5m(200, 0.016)).volAnnual;
  assert.ok(hi > lo, `${hi} > ${lo}`);
});

test('rvHarSigma: insufficient data flagged, not thrown', () => {
  assert.ok(rvHarSigma(synth5m(5)).insufficient);
  assert.ok(rvHarSigma([]).insufficient);
});
