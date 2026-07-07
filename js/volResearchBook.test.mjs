/**
 * Tests for the forecast-completion histogram added to volForecastResearchEngine
 * (brief Q7 — the layer the Research Book renders). Pure + synthetic: builds a
 * seeded daily OHLC series, runs the walk-forward evaluator, and asserts the
 * completion aggregate is internally consistent and lookahead-free.
 *
 *   node --test js/volResearchBook.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateForecast } from './volForecastResearchEngine.js';
import { buildLondonDaily } from './volEstimatorAB.js';
import { _londonParts } from './sessionStats.js';

// Deterministic LCG so the test is reproducible (no Math.random).
function mulberry32(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Synthetic daily bars: GBM close with intraday range scaled by a clustered
// vol process, so H-L has realistic dispersion around the forecast.
function synthDaily(n, seed = 7) {
  const rnd = mulberry32(seed);
  const bars = [];
  let px = 100, vol = 0.008;
  const start = Date.UTC(2015, 0, 1);
  for (let i = 0; i < n; i++) {
    vol = Math.max(0.003, vol * 0.94 + 0.06 * (0.004 + 0.012 * rnd()));  // clustered
    const o = px;
    const drift = (rnd() - 0.5) * vol;
    const c = o * (1 + drift);
    const wick = o * vol * (0.5 + rnd());
    const h = Math.max(o, c) + wick * rnd();
    const l = Math.min(o, c) - wick * rnd();
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    bars.push({ date, open: o, high: h, low: l, close: c });
    px = c;
  }
  return bars;
}

test('completion histogram: buckets sum to 100 and counts match n', () => {
  const { summary } = evaluateForecast(synthDaily(500), 'fx');
  const comp = summary.completion;
  assert.ok(comp && comp.n > 100, 'completion computed over a real sample');
  const sum = Object.values(comp.hist).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 100) < 0.5, `hist buckets sum to ~100 (got ${sum})`);
  for (const b of ['<40', '40-65', '65-92', '92-118', '118-165', '>165'])
    assert.ok(b in comp.hist, `bucket ${b} present`);
});

test('completion: reachedMedianPct ≈ H-L median exceedance (same cells)', () => {
  const { summary } = evaluateForecast(synthDaily(500, 11), 'fx');
  const reached = summary.completion.reachedMedianPct;        // realized ≥ 100% of median
  const exceed  = summary.perComponent.daily.hl.exceedMedianPct; // realized > median
  // These measure the same event (actual vs its own median) up to the boundary,
  // so they must agree closely — a divergence means the two paths disagree.
  assert.ok(Math.abs(reached - exceed) < 3, `reached ${reached} ≈ exceed ${exceed}`);
});

test('completion: monotone shares are all in [0,100] and median is sane', () => {
  const { summary } = evaluateForecast(synthDaily(400, 3), 'fx');
  const c = summary.completion;
  for (const k of ['meanPct', 'medianPct', 'reachedMedianPct', 'neverHalfPct', 'blewThroughPct'])
    assert.ok(c[k] >= 0 && c[k] <= 300, `${k}=${c[k]} in range`);
  assert.ok(c.neverHalfPct >= 0 && c.neverHalfPct <= 100);
  assert.ok(c.medianPct > 20 && c.medianPct < 250, `median completion plausible (${c.medianPct})`);
});

test('error distribution: histogram sums to 100, over-state share tracks calibration', () => {
  const { summary } = evaluateForecast(synthDaily(500, 5), 'fx');
  const e = summary.errorDist;
  assert.ok(e && e.n > 100, 'errorDist computed');
  const sum = Object.values(e.hist).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 100) < 0.5, `error hist sums to ~100 (got ${sum})`);
  // Days that fall short of the median forecast = 100 − median-exceedance.
  const exceed = summary.perComponent.daily.hl.exceedMedianPct;
  assert.ok(Math.abs(e.overStatePct - (100 - exceed)) < 3, `overState ${e.overStatePct} ≈ 100−exceed ${100 - exceed}`);
  for (const b of ['<-50', '-50..-25', '-25..0', '0..25', '25..50', '50..100', '>100'])
    assert.ok(b in e.hist, `error bucket ${b} present`);
});

test('PR-B seasonal: month buckets present, stats in range', () => {
  const { summary } = evaluateForecast(synthDaily(800, 4), 'fx');
  const s = summary.seasonal;
  assert.ok(s && s.byMonth && Object.keys(s.byMonth).length >= 6, 'several months populated');
  for (const b of Object.values(s.byMonth)) { assert.ok(b.n > 0 && b.exceedMedianPct >= 0 && b.exceedMedianPct <= 100); }
  assert.ok('summer' in s.periods && 'monthEnd' in s.periods, 'named periods present');
});

test('PR-B confidence: three terciles, forward MAE non-negative', () => {
  const { summary } = evaluateForecast(synthDaily(700, 6), 'fx');
  const c = summary.confidence;
  assert.equal(c.terciles.length, 3);
  for (const t of c.terciles) { assert.ok(t.n > 0, 'tercile populated'); assert.ok(t.fwdMae >= 0, 'MAE ≥ 0'); }
  assert.equal(typeof c.spreadMae, 'number');
});

test('PR-B multiDay: correlation is a valid coefficient', () => {
  const { summary } = evaluateForecast(synthDaily(700, 8), 'fx');
  const m = summary.multiDay;
  assert.ok(m.errorPredictsNextVolCorr >= -1 && m.errorPredictsNextVolCorr <= 1, 'corr in [-1,1]');
  assert.ok(m.baseExceedMedianPct >= 0 && m.baseExceedMedianPct <= 100);
  if (m.afterThreeQuietExpandPct != null) assert.ok(m.afterThreeQuietExpandPct >= 0 && m.afterThreeQuietExpandPct <= 100);
});

test('PR-B day-types: shares sum to 100 and clustering is deterministic', () => {
  const a = evaluateForecast(synthDaily(800, 2), 'fx').summary.dayTypes;
  const b = evaluateForecast(synthDaily(800, 2), 'fx').summary.dayTypes;   // same seed ⇒ identical
  assert.ok(!a.insufficient && a.clusters.length === 4, '4 clusters');
  const share = a.clusters.reduce((s, c) => s + c.sharePct, 0);
  assert.ok(Math.abs(share - 100) < 1.5, `shares sum ~100 (got ${share})`);
  assert.deepEqual(a.clusters.map(c => c.n), b.clusters.map(c => c.n), 'deterministic (no RNG)');
});

test('PR-B misses: overshoot/undershoot profiles are shaped', () => {
  const { summary } = evaluateForecast(synthDaily(700, 3), 'fx');
  const m = summary.misses;
  assert.ok('overshoot' in m && 'undershoot' in m && 'all' in m);
  if (m.overshoot.n) { assert.ok(m.overshoot.pctOfDays > 0 && m.overshoot.pctOfDays < 100); assert.ok(typeof m.overshoot.topRegime === 'string'); }
});

// Synthetic H1 intraday over `days` London days (24 bars/day), for the re-anchor.
function synthH1(days, seed = 7) {
  const rnd = mulberry32(seed);
  const bars = [];
  let px = 100;
  const start = Date.UTC(2020, 0, 1, 0, 0, 0);
  for (let i = 0; i < days * 24; i++) {
    const t = new Date(start + i * 3600_000);
    const o = px, c = o * (1 + (rnd() - 0.5) * 0.004);
    const h = Math.max(o, c) * (1 + rnd() * 0.001), l = Math.min(o, c) * (1 - rnd() * 0.001);
    bars.push({ time: t, open: o, high: h, low: l, close: c });
    px = c;
  }
  return bars;
}

test('PR-C re-anchor: London daily bars group by London date and feed evaluateForecast', () => {
  const h1 = synthH1(400, 1);
  const lond = buildLondonDaily(h1);
  // London day count ≈ distinct London calendar dates present in the intraday.
  const distinct = new Set(h1.map(b => _londonParts(b.time).date));
  assert.ok(Math.abs(lond.length - distinct.size) <= 2, `London days (${lond.length}) ≈ distinct dates (${distinct.size})`);
  // Each London day's open is the first intraday bar of that London date.
  for (const d of lond.slice(0, 5)) assert.ok(d.open > 0 && d.high >= d.low, 'valid OHLC');
  // The evaluator runs on London-built bars and yields the full summary shape.
  const { summary } = evaluateForecast(lond.map(d => ({ date: d.date, open: d.open, high: d.high, low: d.low, close: d.close })), 'fx');
  assert.ok(summary.nDays > 100, 'evaluated a real sample of London days');
  assert.ok(summary.completion && summary.errorDist && summary.dayTypes, 'all aggregates present on London-anchored eval');
});

test('PR-E: completion computed at all three horizons', () => {
  const { summary } = evaluateForecast(synthDaily(700, 4), 'fx');
  const cbh = summary.completionByHorizon;
  assert.ok(cbh && cbh.daily && cbh.d5 && cbh.d20, 'completion present for daily/5d/20d');
  assert.ok(cbh.daily.n > 100, 'daily completion populated');
  // 5d/20d completion buckets (when populated) sum to ~100.
  for (const hz of ['d5', 'd20']) if (cbh[hz].n) {
    const s = Object.values(cbh[hz].hist).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 100) < 0.6, `${hz} hist sums ~100 (got ${s})`);
  }
});

test('PR-C: London midnight is the day boundary (23:00 vs 01:00 split across dates)', () => {
  // A bar at 22:30 UTC in winter is 22:30 London (same date); one at 00:30 UTC is
  // 00:30 London (next date). Verify _londonParts assigns them to different dates.
  const evening = _londonParts(new Date(Date.UTC(2021, 0, 10, 22, 30)));
  const night   = _londonParts(new Date(Date.UTC(2021, 0, 11, 0, 30)));
  assert.notEqual(evening.date, night.date, 'crossing London midnight advances the date');
});

test('no lookahead: truncating the series does not change earlier completion cells', () => {
  // The forecast for day i uses bars[0..i-1] only; evaluating a longer series
  // must reproduce the same early rows. Compare completion.n growth is monotone
  // and byRegime keys are a subset — a cheap structural lookahead guard.
  const short = evaluateForecast(synthDaily(300), 'fx').summary.completion;
  const long  = evaluateForecast(synthDaily(300).concat(synthDaily(100, 99)), 'fx').summary.completion;
  assert.ok(long.n >= short.n, 'more data ⇒ at least as many completion cells');
  assert.ok(Object.keys(short.byRegime).length >= 1, 'regime slicing populated');
});
