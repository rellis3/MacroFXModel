// Tests for js/validationDesk.js.   node js/validationDesk.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from './statsCore.js';
import { realityCheck, costStress, paramSensitivity, tradeMonteCarlo, liveVsBacktest, cusum, harnessChecklist, validateReview } from './validationDesk.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const rng = mulberry32(7), gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

t('reality check: 20 noise strategies do not pass, while the best one alone can look good; a real edge passes', () => {
  const noise = Array.from({ length: 500 }, () => Array.from({ length: 20 }, () => gauss() * 0.01));
  const r = realityCheck(noise, { nBoot: 400 }); assert.ok(r.ok); assert.ok(r.pValue > 0.05, `p ${r.pValue}`); assert.ok(r.naiveP <= r.pValue);
  const edge = noise.map(row => row.map((x, k) => (k === 3 ? x + 0.003 : x)));
  const e = realityCheck(edge, { nBoot: 400 }); assert.equal(e.best, 3); assert.ok(e.pValue < 0.05, `p ${e.pValue}`);
  assert.equal(realityCheck([[1]]).ok, false);
});
t('cost stress: break-even multiple and the rows', () => {
  const g = Array.from({ length: 300 }, () => 0.001 + gauss() * 0.005), c = g.map(() => 0.0004);
  const r = costStress(g, c); assert.ok(r.ok); assert.equal(r.rows.length, 5); assert.ok(r.rows[0].mean > r.rows[4].mean);
  assert.ok(Math.abs(r.breakEven - g.reduce((a, b) => a + b, 0) / (0.0004 * 300)) < 1e-3);
});
t('parameter sensitivity: plateau vs spike', () => {
  const grid = (f) => [5, 10, 20].flatMap(a => [1, 2, 3].map(b => ({ params: { a, b }, metric: f(a, b) })));
  const plateau = paramSensitivity(grid((a, b) => 1 - 0.02 * Math.abs(a - 10) - 0.05 * Math.abs(b - 2)));
  assert.equal(plateau.shape, 'plateau'); assert.deepEqual(plateau.best.params, { a: 10, b: 2 }); assert.equal(plateau.neighbours, 4);
  const spike = paramSensitivity(grid((a, b) => (a === 10 && b === 2 ? 1 : -0.1)));
  assert.equal(spike.shape, 'spike');
});
t('trade Monte Carlo, live vs backtest, CUSUM', () => {
  const bt = Array.from({ length: 400 }, () => 0.2 + gauss());
  const mc = tradeMonteCarlo(bt, { nSim: 500, ruin: 10 }); assert.ok(mc.ok); assert.ok(mc.drawdown.p95 >= mc.drawdown.p50); assert.ok(mc.pLoss < 0.05);
  const bad = Array.from({ length: 40 }, () => -0.5 + gauss() * 0.5);
  assert.equal(liveVsBacktest(bad, bt).verdict, 'below the backtest'); assert.equal(liveVsBacktest(bt.slice(0, 40), bt).verdict, 'within the backtest');
  const c = cusum([...Array(20).fill(0).map(() => 0.2 + gauss() * 0.1), ...Array(30).fill(-1)], { target: 0.2, sigma: 1 }); assert.ok(c.alarm); assert.ok(c.alarmAt >= 20);
  assert.equal(cusum(Array.from({ length: 50 }, () => 0.2 + gauss() * 0.3), { target: 0.2, sigma: 0.3 }).alarm, false);
});
t('harness checklist on the repo\'s own outputs', () => {
  const h = JSON.parse(readFileSync(new URL('../analysis/output/harness/portfolio-book-S1.json', import.meta.url), 'utf8'));
  const c = harnessChecklist(h); assert.ok(c.ok); assert.equal(c.gates.find(g => g.gate === 'deflated Sharpe').status, 'pass'); assert.equal(c.gates.find(g => g.gate === 'PBO (tuned studies)').status, 'n/a');
  const m = harnessChecklist(JSON.parse(readFileSync(new URL('../analysis/output/harness/multi-spread-sleeve-harness.json', import.meta.url), 'utf8')));
  assert.equal(m.verdict, 'fail'); assert.ok(m.failed.includes('PBO (tuned studies)')); assert.ok(m.failed.includes('survives FDR across its cells'));
  assert.equal(harnessChecklist({}).ok, false);
});
t('bias review reply', () => {
  assert.ok(validateReview({ verdict: 'pass', summary: 'clean' }).ok);
  assert.equal(validateReview({ verdict: 'fix', summary: 's' }).ok, false);
  const v = validateReview({ verdict: 'reject', summary: 's', issues: [{ kind: 'look-ahead', severity: 'high', issue: 'uses the close before 22:00', test: 'shift 1 day' }, { kind: 'weird', issue: 'x' }] });
  assert.equal(v.value.issues[1].kind, 'other');
});
console.log(`validationDesk: ${n} tests passed`);
