// The correlation build's maths (js/corrHistoryCompute.js), moved out of server.js into a worker:
// the records it always produced, the KV summary, and the Desk Terminal's daily panel.   node js/corrHistoryCompute.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCorrHistory, alertsSummary, dailyCloses, nyDay, buildPanel, pearson, ols, trendRegime } from './corrHistoryCompute.js';

const H4 = 4 * 3600_000, T0 = Date.UTC(2026, 0, 4, 22);   // Sunday 22:00 UTC (17:00 New York, EST): the week's first H4 bar
/** n H4 bars Mon-Fri (six a day from 22:00 UTC), closes from fn(i). */
function bars(n, fn) {
  const closes = [], timestamps = [];
  for (let k = 0, i = 0; i < n; k++) {
    const t = T0 + k * H4, d = new Date(t + 3 * 3600_000).getUTCDay();
    if (d === 0 || d === 6) continue;
    closes.push(fn(i)); timestamps.push(t); i++;
  }
  return { closes, timestamps };
}
const wave = (i, a = 1, p = 7) => 1 + 0.01 * Math.sin(i / p) * a + i * 1e-5;

test('pearson / ols / trendRegime', () => {
  assert.equal(+pearson([1, 2, 3, 4], [2, 4, 6, 8]).toFixed(6), 1);
  assert.equal(pearson([1, 2], [1, 2]), null);
  assert.deepEqual(ols([2, 4, 6, 8], [1, 2, 3, 4]), [2, 1]);
  assert.equal(trendRegime(Array.from({ length: 80 }, (_, i) => 1 + i * 0.002)), 'BULL');
  assert.equal(trendRegime(Array.from({ length: 80 }, (_, i) => 2 - i * 0.002)), 'BEAR');
  assert.equal(trendRegime([1, 1, 1]), 'RANGE');
});

test('nyDay: the 17:00 New York roll in winter and summer', () => {
  assert.equal(nyDay(Date.UTC(2026, 0, 5, 22)), '2026-01-06');   // 17:00 EST Monday -> Tuesday
  assert.equal(nyDay(Date.UTC(2026, 0, 5, 18)), '2026-01-05');   // 13:00 EST -> same day
  assert.equal(nyDay(Date.UTC(2026, 6, 6, 21)), '2026-07-07');   // 17:00 EDT -> next day
  assert.equal(nyDay(Date.UTC(2026, 6, 6, 17)), '2026-07-06');
});

test('dailyCloses: the last close of each New York day', () => {
  const b = bars(12, i => i + 1), m = dailyCloses(b);
  assert.deepEqual([...m.entries()], [['2026-01-05', 6], ['2026-01-06', 12]]);
});

test('computeCorrHistory: same record shape as server.js always wrote, sensible signs, summaries', () => {
  const barData = { EURUSD: bars(200, i => wave(i)), GBPUSD: bars(200, i => wave(i, 0.8)), USDJPY: bars(200, i => 150 / wave(i)), USDCHF: bars(200, i => 1 / wave(i, 1, 3)) };
  const out = computeCorrHistory(barData, { pairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'NOPE'], factorProxies: { dxy: { sym: 'EURUSD', sign: -1.2 }, rates: { sym: 'USDJPY', sign: 1 }, vix: { sym: 'USDCHF', sign: -1 } }, window: 60, step: 6, years: 1, now: Date.UTC(2026, 1, 1) });
  assert.deepEqual(out.pairs, ['EURUSD', 'GBPUSD', 'USDJPY']);
  assert.equal(out.records.length, Math.floor((199 - 60) / 6) + 1);
  const r = out.records.at(-1);
  assert.deepEqual(Object.keys(r), ['ts', 'ts_str', 'regime', 'corr', 'beta']);
  assert.ok(r.corr.EURUSD_GBPUSD > 0.9); assert.ok(r.corr.EURUSD_USDJPY < -0.9);
  assert.ok(Math.abs(r.beta.EURUSD.dxy + 1 / 1.2) < 1e-3);
  assert.ok(out.avg_corr.EURUSD_GBPUSD > 0.9 && out.regime_corr && out.regime_stats.EURUSD);
  assert.equal(out.generated, '2026-02-01T00:00:00.000Z');
  const a = alertsSummary({ ...out, cot_corr: { EUR_GBP: 0.1 } });
  assert.equal(a.last_corr.EURUSD_GBPUSD, r.corr.EURUSD_GBPUSD);
  assert.deepEqual(a.last_betas, r.beta); assert.deepEqual(a.last_cot_corr, { EUR_GBP: 0.1 });
  assert.ok(a.corr_std.EURUSD_GBPUSD >= 0);
  assert.equal(computeCorrHistory({}, { pairs: ['EURUSD'], factorProxies: {}, window: 60, step: 6, years: 1 }), null);
});

test('buildPanel: aligned weekday closes, nulls where a market did not trade, regime per day, size bound', () => {
  const eur = bars(300, i => wave(i)), gold = bars(300, i => 2000 * wave(i));
  gold.closes.splice(0, 30); gold.timestamps.splice(0, 30);   // gold starts later
  const records = [{ ts: eur.timestamps[100], regime: 'BULL' }];
  const p = buildPanel({ EURUSD: eur, XAUUSD: gold, EMPTY: { closes: [], timestamps: [] } }, { days: 40, records, now: Date.UTC(2026, 2, 1) });
  assert.deepEqual(p.syms, ['EURUSD', 'XAUUSD']);
  assert.equal(p.dates.length, 40);
  assert.ok(p.dates.every(d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6; }));
  assert.equal(p.closes.EURUSD.length, 40); assert.equal(p.to, p.dates.at(-1));
  const all = buildPanel({ EURUSD: eur, XAUUSD: gold }, { days: 1000, records });
  assert.equal(all.closes.XAUUSD[0], null); assert.ok(all.closes.XAUUSD.at(-1) > 0);
  assert.equal(all.trend.filter(Boolean).length, 1); assert.equal(all.trendOf, 'EURUSD');
  assert.equal(buildPanel({}, {}), null);
});
