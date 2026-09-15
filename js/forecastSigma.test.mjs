/**
 * Tests for the ladder's volatility estimators — js/forecastSigma.js.
 *
 *   node --test js/forecastSigma.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SIGMA_ESTIMATORS, asOfYesterday, harRvLogSigma, forecastSigma } from './forecastSigma.js';
import { realizedVarSeries, harRvLogPred } from './volForecastBench.js';

test('every JS estimator reproduces the Python (forge/vol.py) it was fit with', () => {
  const fx = JSON.parse(readFileSync(new URL('./forecastSigma.fixture.json', import.meta.url)));
  for (const [name, fn] of Object.entries(SIGMA_ESTIMATORS)) {
    const got = fn(fx.bars), want = fx.expected[name];
    assert.ok(want, `fixture has no expected column for "${name}" — regenerate it`);
    for (let i = 0; i < want.length; i++) {
      const w = want[i], g = got[i];
      const wF = w !== null && Number.isFinite(w);
      assert.equal(wF, Number.isFinite(g), `${name}[${i}]: finite mismatch`);
      if (wF) assert.ok(Math.abs(w - g) / Math.abs(w) < 1e-10, `${name}[${i}]: ${w} vs ${g}`);
    }
  }
});

// harRvLogSigma is deliberately pre-shifted one step EARLY (index i holds the
// forecast for bar i+1, not bar i) so that asOfYesterday's later right-shift lands
// back on the correct day — see the function's own docstring. Getting that
// direction backwards would silently serve a forecast one day stale: still
// numerically finite, still plausible-looking, wrong. This test catches that class
// of bug directly, by composing harRvLogSigma with asOfYesterday (the exact way
// build_forecast_frame/build_forecast_frame's JS counterpart uses every estimator)
// and checking the result lands on the SAME index as the already-tested,
// independently-validated harRvLogPred computed directly on the same bars — no
// adapter in the loop, nothing to get the direction of wrong.
test('harRvLogSigma + asOfYesterday round-trips to the same index as harRvLogPred', () => {
  const N = 400;
  const bars = [];
  let px = 1.1000;
  for (let i = 0; i < N; i++) {
    const sig = 0.004 + 0.003 * Math.sin(i / 60);
    const ret = sig * Math.sin(i / 3.3);
    const o = px;
    const c = o * (1 + ret);
    const hi = Math.max(o, c) * (1 + Math.abs(sig) * 0.8);
    const lo = Math.min(o, c) * (1 - Math.abs(sig) * 0.8);
    bars.push({ open: o, high: hi, low: lo, close: c });
    px = c;
  }

  const forecastReady = asOfYesterday(harRvLogSigma(bars));   // annualized %, index i = forecast FOR day i
  const rv = realizedVarSeries(bars, 'gk');
  const directVar = harRvLogPred(rv);                          // already forecast-for-day-i, in variance units

  let checked = 0;
  for (let i = 0; i < N; i++) {
    const fr = forecastReady[i];
    const dv = directVar[i];
    const drFinite = Number.isFinite(fr);
    const dvFinite = Number.isFinite(dv) && dv > 1e-15;   // harRvLogPred floors rather than NaNs
    if (!drFinite || !dvFinite) continue;
    // annualized % -> daily variance, same convention forecastSigma.js's forecastSigma() uses
    const impliedVar = (fr / 100 / Math.sqrt(252)) ** 2;
    assert.ok(Math.abs(impliedVar - dv) / dv < 1e-6,
      `index ${i}: shifted forecastSigma implies var=${impliedVar}, harRvLogPred says ${dv}`);
    checked++;
  }
  assert.ok(checked > 200, `only ${checked} overlapping finite indices — test isn't exercising enough of the series`);
});

test('harRvLogSigma returns NaN for the last bar (no day n+1 to forecast)', () => {
  const bars = Array.from({ length: 100 }, (_, i) => ({
    open: 100 + i * 0.01, high: 100.5 + i * 0.01, low: 99.5 + i * 0.01, close: 100.1 + i * 0.01,
  }));
  const out = harRvLogSigma(bars);
  assert.equal(out.length, bars.length);
  assert.ok(!Number.isFinite(out[out.length - 1]), 'last element should be NaN — no future bar to forecast');
});

// Regression: forecastSigma(bars, 'har_rv_log') is the actual call atlasWalk/the
// live forecaster make, ONE TRUNCATED SLICE AT A TIME (`forecastSigma(d1.slice(0,
// i), est)` — never the whole series at once). The generic path (`fn(bars)`, then
// read the LAST array element) works for every other estimator because a
// contemporaneous-then-persisted forecast is index-shift-symmetric — but
// harRvLogSigma's array form is deliberately shaped for forge/vol.py's
// compute-once-then-shift pipeline, where its LAST element is UNCONDITIONALLY
// NaN by design (see the test above). Fed through the generic path on a
// truncated slice, that NaN-last-element never goes away no matter how much
// history precedes it — this exact bug produced ZERO touches for every
// instrument the first time Vote Atlas v2's build script ran (caught by its own
// "insufficient OOS touches" guard, not silently). forecastSigma() now special-
// cases har_rv_log via harRvLogForecastNext instead; this test is the guard
// against that regression coming back unnoticed.
test('forecastSigma(bars, "har_rv_log") returns a real number on a TRUNCATED slice — the actual atlasWalk/live calling pattern', () => {
  const N = 400;
  const bars = [];
  let px = 1.1;
  for (let i = 0; i < N; i++) {
    const sig = 0.004 + 0.003 * Math.sin(i / 60);
    const ret = sig * Math.sin(i / 3.3);
    const o = px, c = o * (1 + ret);
    const hi = Math.max(o, c) * (1 + Math.abs(sig) * 0.8);
    const lo = Math.min(o, c) * (1 - Math.abs(sig) * 0.8);
    bars.push({ open: o, high: hi, low: lo, close: c });
    px = c;
  }
  let checked = 0;
  for (let i = 90; i <= N; i += 15) {
    const slice = bars.slice(0, i);
    const s = forecastSigma(slice, 'har_rv_log');
    assert.ok(Number.isFinite(s) && s > 0, `forecastSigma at truncation ${i}: expected a positive daily sigma, got ${s}`);
    checked++;
  }
  assert.ok(checked > 10, `only ${checked} truncation points checked — test isn't exercising enough of the series`);
});

test('forecastSigma(bars, "har_rv_log") returns null on too little history, never throws', () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({
    open: 100 + i * 0.01, high: 100.5 + i * 0.01, low: 99.5 + i * 0.01, close: 100.1 + i * 0.01,
  }));
  assert.equal(forecastSigma(bars, 'har_rv_log'), null);
});

console.log('forecastSigma.test.mjs: run via `node --test js/forecastSigma.test.mjs`');
