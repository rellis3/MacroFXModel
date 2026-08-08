/**
 * harIvShadowFields — the COG-v2 gold σ leg. Pure, synthetic, no network.
 * Verifies: it produces forecaster-band fields from a HAR-IV σ; nulls gracefully
 * on a length mismatch or no IV coverage; and the fields use the commodity
 * (calibrated, NON-COG-widened) band math.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { harIvShadowFields, forecastFields } from './forecastExport.js';
import { realizedVarSeries, sigmaSeriesForExport, ivVarSeries } from './volForecastBench.js';

function synthGold(n = 1200, ivFromBar = 200, seed = 5) {
  let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const bars = []; const ivPct = []; let px = 2000, reg = 0.011;
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.03) reg = 0.006 + 0.012 * rnd();
    const sig = reg * (0.6 + 0.8 * rnd());
    const o = px, c = px * (1 + (rnd() - 0.5) * sig * 2);
    const hi = Math.max(o, c) * (1 + sig * 0.5), lo = Math.min(o, c) * (1 - sig * 0.5);
    bars.push({ open: o, high: hi, low: lo, close: c, time: i * 86400 }); px = c;
    ivPct.push(i < ivFromBar ? NaN : Math.sqrt(Math.max(reg, 1e-9)) * Math.sqrt(252) * 100 * (0.9 + 0.2 * rnd()));
  }
  return { bars, ivPct };
}

test('harIvShadowFields: produces gold forecast fields from a HAR-IV σ', () => {
  const { bars, ivPct } = synthGold();
  const f = harIvShadowFields(bars, ivPct, 'commodity');
  assert.ok(f && f.vol_annual > 0 && f.hl_median > 0 && f.hl_75 > f.hl_median, 'sane fields');
  assert.equal(f.news_mult, 1);
});

test('harIvShadowFields: nulls on length mismatch and on no IV coverage', () => {
  const { bars, ivPct } = synthGold();
  assert.equal(harIvShadowFields(bars, ivPct.slice(0, 10), 'commodity'), null, 'length mismatch → null');
  assert.equal(harIvShadowFields(bars, ivPct.map(() => NaN), 'commodity'), null, 'no IV → null');
});

test('harIvShadowFields: uses the commodity (calibrated, non-COG) band math', () => {
  const { bars, ivPct } = synthGold();
  const f = harIvShadowFields(bars, ivPct, 'commodity');
  // reconstruct the same σ the shadow used and run forecastFields directly → identical bands
  const { series, sigmaFwd } = sigmaSeriesForExport(bars, 'harIV',
    { rv: realizedVarSeries(bars, 'gk'), ivVar: ivVarSeries(ivPct) });
  const ref = forecastFields(series, sigmaFwd, bars, 'commodity');
  assert.ok(Math.abs(f.hl_median - ref.hl_median) < 1e-9 && Math.abs(f.hl_75 - ref.hl_75) < 1e-9,
    'bands == forecaster commodity math on the HAR-IV σ');
});
