// Unit tests for the macro-direction scoring core. Pure math, no network — validates
// CORRECTNESS of the scoring/orientation, NOT edge (the real run needs FRED+M1 on Railway).
// Run: node js/macroDirectionCore.test.mjs
import assert from 'node:assert';
import {
  pairLegs, usdRole, havenTilt, carryVote, realVote, riskVote, macroDirScore,
  forwardReturn, spearman, summarizeDirection, splitByDate,
} from './macroDirectionCore.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('macroDirectionCore — scoring bricks');

// ── geometry ───────────────────────────────────────────────────────────────────────
t('pairLegs splits 6-char pair', () => {
  assert.deepEqual(pairLegs('usdjpy'), { base: 'usd', quote: 'jpy' });
  assert.deepEqual(pairLegs('eurusd'), { base: 'eur', quote: 'usd' });
});
t('usdRole: base / quote / neither', () => {
  assert.equal(usdRole('usdjpy'), 1);
  assert.equal(usdRole('eurusd'), -1);
  assert.equal(usdRole('eurgbp'), 0);
});
t('havenTilt orients risk-off correctly', () => {
  assert(havenTilt('audusd') < 0);   // AUD(-1) − USD(1) = -2 → risk-off sinks AUDUSD
  assert(havenTilt('usdcad') > 0);   // USD(1) − CAD(-1) = +2 → risk-off lifts USDCAD
  assert(havenTilt('usdjpy') < 0);   // USD(1) − JPY(2) = -1 → risk-off sinks USDJPY (JPY stronger haven)
});

// ── votes ────────────────────────────────────────────────────────────────────────────
t('carryVote: widening US-favoured diff lifts USD, oriented by role', () => {
  assert.equal(carryVote(0.1, 1), 1);    // spread up, USD base → long
  assert.equal(carryVote(0.1, -1), -1);  // spread up, USD quote → short
  assert.equal(carryVote(-0.1, -1), 1);  // spread down (USD weaker), USD quote → long
});
t('carryVote null on bad input', () => {
  assert.equal(carryVote(NaN, 1), null);
  assert.equal(carryVote(0.1, 0), null);
});
t('realVote mirrors carry orientation', () => {
  assert.equal(realVote(0.2, 1), 1);
  assert.equal(realVote(0.2, -1), -1);
});
t('riskVote: rising VIX lifts the higher-haven leg', () => {
  assert.equal(riskVote(1, 2), 1);    // vix up, base is haven (tilt>0) → long
  assert.equal(riskVote(1, -2), -1);  // vix up, base is risk (tilt<0) → short
  assert.equal(riskVote(-1, 2), -1);  // vix down (risk-on) hurts haven base → short
});

// ── composite ─────────────────────────────────────────────────────────────────────────
t('macroDirScore averages available votes', () =>
  assert(approx(macroDirScore({ carry: 1, real: 1, risk: -1 }), 1 / 3)));
t('macroDirScore drops null / ablated factors', () => {
  assert(approx(macroDirScore({ carry: 1, real: null, risk: null }), 1));
  assert(approx(macroDirScore({ carry: 1, risk: -1 }, { carry: 1, real: 1, risk: 0 }), 1));
});
t('macroDirScore 0 when nothing votes', () =>
  assert(approx(macroDirScore({ carry: null }), 0)));

// ── forward return & stats ───────────────────────────────────────────────────────────
t('forwardReturn is simple pct change', () => assert(approx(forwardReturn(100, 105), 0.05)));
t('forwardReturn null on bad input', () => assert.equal(forwardReturn(0, 5), null));

t('summarizeDirection: perfect signal → 100% hit, positive sharpe', () => {
  // varying-but-positive returns so variance > 0 (a constant return has 0 variance → Sharpe 0)
  const recs = Array.from({ length: 20 }, (_, i) => ({ date: `2020-01-${String(i + 1).padStart(2, '0')}`, score: 1, fwdRet: 0.006 + (i % 3) * 0.002 }));
  const s = summarizeDirection(recs, { costPct: 0, periodsPerYear: 52 });
  assert.equal(s.hitRate, 100);
  assert(s.sharpe > 0);
});
t('summarizeDirection: anti-signal → 0% hit, negative mean', () => {
  const recs = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}`, score: 1, fwdRet: -0.01 }));
  const s = summarizeDirection(recs, { costPct: 0 });
  assert.equal(s.hitRate, 0);
  assert(s.meanRetPct < 0);
});
t('summarizeDirection ignores flat (score 0) rows', () => {
  const recs = [{ date: 'a', score: 0, fwdRet: 0.05 }, { date: 'b', score: 1, fwdRet: 0.01 }];
  assert.equal(summarizeDirection(recs, { costPct: 0 }).n, 1);
});
t('cost drags the mean return', () => {
  const recs = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}`, score: 1, fwdRet: 0.005 }));
  const free = summarizeDirection(recs, { costPct: 0 }).meanRetPct;
  const paid = summarizeDirection(recs, { costPct: 0.1 }).meanRetPct;
  assert(paid < free);
});

// ── spearman ──────────────────────────────────────────────────────────────────────────
t('spearman: monotonic up → +1, down → −1', () => {
  assert(approx(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1));
  assert(approx(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1));
});

// ── split ─────────────────────────────────────────────────────────────────────────────
t('splitByDate splits at splitFrac on unique dates', () => {
  const recs = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04', '2020-01-05'].map(date => ({ date }));
  const { splitDate, is, oos } = splitByDate(recs, 0.6);
  assert.equal(splitDate, '2020-01-04');
  assert.equal(is.length, 3);
  assert.equal(oos.length, 2);
});

console.log(`\n${passed} passed`);
