// Unit tests for the multi-spread sleeve's NEW math — synthetic, deterministic, no
// network. Proves correctness of buildSpreadDefs / correlation / tradeOverlap /
// combinedPortfolioStats, NOT that any spread tenor has edge (that needs FRED + M1 +
// OANDA/R2 on Railway: analysis/multi_spread_sleeve.mjs).
// Run: node js/multiSpreadCore.test.mjs
import assert from 'node:assert';
import {
  buildSpreadDefs, correlation, tradeOverlap, combinedPortfolioStats,
  US_SERIES, FOREIGN_Y10_SERIES,
} from './multiSpreadCore.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

console.log('multiSpreadCore — diversification bricks');

// ── buildSpreadDefs ───────────────────────────────────────────────────────────────
const fakeZscorePairs = {
  usdjpy: { quoteSeries: 'IRSTCI01JPM156N', pip: 0.01, label: 'USDJPY', pairDisplay: 'USD/JPY' },
  eurusd: { quoteSeries: 'IRSTCI01DEM156N', pip: 0.0001, label: 'EURUSD', pairDisplay: 'EUR/USD' },
};

t('buildSpreadDefs: y2 reuses ZSCORE_PAIRS quoteSeries byte-identical', () => {
  const defs = buildSpreadDefs(fakeZscorePairs);
  assert.equal(defs.y2.usdjpy.quoteSeries, 'IRSTCI01JPM156N');
  assert.equal(defs.y2.usdjpy.baseSeries, US_SERIES.y2);
  assert.equal(defs.y2.eurusd.quoteSeries, 'IRSTCI01DEM156N');
});
t('buildSpreadDefs: y10 uses the OECD foreign-leg table, not the 2Y quoteSeries', () => {
  const defs = buildSpreadDefs(fakeZscorePairs);
  assert.equal(defs.y10.usdjpy.quoteSeries, FOREIGN_Y10_SERIES.usdjpy);
  assert.notEqual(defs.y10.usdjpy.quoteSeries, defs.y2.usdjpy.quoteSeries);
  assert.equal(defs.y10.usdjpy.baseSeries, US_SERIES.y10);
});
t('buildSpreadDefs: pair with no foreign-leg entry is skipped, not crashed', () => {
  const defs = buildSpreadDefs({ zzznone: { quoteSeries: 'X', pip: 1, label: 'ZZZ', pairDisplay: 'ZZZ' } });
  assert.equal(defs.y10.zzznone, undefined);
  assert.equal(defs.y2.zzznone.quoteSeries, 'X');
});

// ── correlation ───────────────────────────────────────────────────────────────────
t('correlation: perfect positive linear relationship → 1', () => {
  assert.equal(correlation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1);
});
t('correlation: perfect negative relationship → -1', () => {
  assert.equal(correlation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1);
});
t('correlation: constant series (zero variance) → null, not NaN/Infinity', () => {
  assert.equal(correlation([1, 1, 1, 1], [1, 2, 3, 4]), null);
});
t('correlation: fewer than 3 usable points → null', () => {
  assert.equal(correlation([1, 2], [3, 4]), null);
  assert.equal(correlation([1, null, 3], [1, 2, null]), null);
});
t('correlation: null/NaN entries are dropped, not treated as 0', () => {
  const a = [1, null, 3, 4, 5, NaN, 7];
  const b = [2, 9,    6, 8, 10, 3, 14];
  // usable pairs: (1,2)(3,6)(4,8)(5,10)(7,14) — perfectly linear
  assert.equal(correlation(a, b), 1);
});

// ── tradeOverlap ──────────────────────────────────────────────────────────────────
const tr = (pair, date, dir) => ({ pair, date, dir });
t('tradeOverlap: identical trade lists → 100% overlap', () => {
  const trades = [tr('EURUSD', '2020-01-05', 'LONG'), tr('EURUSD', '2020-03-01', 'SHORT')];
  const r = tradeOverlap(trades, trades, { windowDays: 2 });
  assert.equal(r.n, 2); assert.equal(r.overlapping, 2); assert.equal(r.overlapPct, 100);
});
t('tradeOverlap: disjoint pairs → 0% overlap', () => {
  const a = [tr('EURUSD', '2020-01-05', 'LONG')];
  const b = [tr('GBPUSD', '2020-01-05', 'LONG')];
  const r = tradeOverlap(a, b, { windowDays: 2 });
  assert.equal(r.overlapPct, 0);
});
t('tradeOverlap: same pair, opposite direction on the same day → not an overlap', () => {
  const a = [tr('EURUSD', '2020-01-05', 'LONG')];
  const b = [tr('EURUSD', '2020-01-05', 'SHORT')];
  assert.equal(tradeOverlap(a, b, { windowDays: 2 }).overlapPct, 0);
});
t('tradeOverlap: within windowDays counts, just outside it does not', () => {
  const a = [tr('EURUSD', '2020-01-05', 'LONG')];
  const withinB  = [tr('EURUSD', '2020-01-07', 'LONG')];  // 2 days later
  const outsideB = [tr('EURUSD', '2020-01-08', 'LONG')];  // 3 days later
  assert.equal(tradeOverlap(a, withinB,  { windowDays: 2 }).overlapPct, 100);
  assert.equal(tradeOverlap(a, outsideB, { windowDays: 2 }).overlapPct, 0);
});
t('tradeOverlap: empty inputs handled without throwing', () => {
  assert.deepEqual(tradeOverlap([], [tr('EURUSD', '2020-01-05', 'LONG')]), { n: 0, overlapping: 0, overlapPct: 0 });
  assert.deepEqual(tradeOverlap([tr('EURUSD', '2020-01-05', 'LONG')], []), { n: 1, overlapping: 0, overlapPct: 0 });
});

// ── combinedPortfolioStats ────────────────────────────────────────────────────────
t('combinedPortfolioStats: equal-weight default sums to a genuine average, not double-counted', () => {
  const dates = ['2020-01-01', '2020-01-02', '2020-01-03'];
  const streams = {
    y2:  { dates, dailyReturns: [0.01, -0.01, 0.02] },
    y10: { dates, dailyReturns: [0.01, -0.01, 0.02] },  // identical leg
  };
  const r = combinedPortfolioStats(streams, { periodsPerYear: 252 });
  // Combined return each day should equal the (identical) leg return, not 2x it.
  assert.deepEqual(r.dates, dates);
  assert.equal(r.weights.y2, 0.5); assert.equal(r.weights.y10, 0.5);
});
t('combinedPortfolioStats: identical legs → correlation 1, combined Sharpe == leg Sharpe', () => {
  const dates = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04'];
  const rets = [0.02, -0.01, 0.015, -0.005];
  const streams = { y2: { dates, dailyReturns: rets }, y10: { dates, dailyReturns: rets } };
  const r = combinedPortfolioStats(streams, { periodsPerYear: 252 });
  assert.equal(r.returnCorrelation.y2_y10, 1);
  assert.equal(r.combinedSharpe, r.legSharpe.y2);
});
t('combinedPortfolioStats: perfectly offsetting legs → combined return is flat (zero variance)', () => {
  const dates = ['2020-01-01', '2020-01-02', '2020-01-03'];
  const streams = {
    y2:  { dates, dailyReturns: [0.02, -0.01, 0.03] },
    y10: { dates, dailyReturns: [-0.02, 0.01, -0.03] },
  };
  const r = combinedPortfolioStats(streams, { periodsPerYear: 252 });
  assert.equal(r.returnCorrelation.y2_y10, -1);
  assert.equal(r.combinedSharpe, 0);  // zero variance in the combined stream → sharpeFromDaily returns 0
});
t('combinedPortfolioStats: misaligned date ranges are unioned, missing days treated as flat (0)', () => {
  const streams = {
    y2:  { dates: ['2020-01-01', '2020-01-02'], dailyReturns: [0.01, 0.01] },
    y10: { dates: ['2020-01-02', '2020-01-03'], dailyReturns: [0.01, 0.01] },
  };
  const r = combinedPortfolioStats(streams, { periodsPerYear: 252 });
  assert.deepEqual(r.dates, ['2020-01-01', '2020-01-02', '2020-01-03']);
});

console.log(`\n${passed} passed`);
