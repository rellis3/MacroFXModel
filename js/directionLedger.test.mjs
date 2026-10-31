// node js/directionLedger.test.mjs
import assert from 'node:assert/strict';
import { closesFromCandles, issueRecord, outcomeRecord, summarise, INSTRUMENTS, HORIZONS } from './directionLedger.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok ', name); };

// 300 weekday closes per instrument, rising 0.1% a day
const days = [];
for (let d = new Date('2025-06-02T00:00:00Z'); days.length < 300; d = new Date(d.getTime() + 86400_000)) if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10));
const series = (k = 1) => days.map((date, i) => ({ date, c: 100 * Math.exp(0.001 * k * i) }));
const closes = Object.fromEntries(Object.keys(INSTRUMENTS).map(i => [i, series(i === 'gold' ? -1 : 1)]));
const baselines = { version: 'test', instruments: Object.fromEntries(Object.keys(INSTRUMENTS).map(i => [i, Object.fromEntries(HORIZONS.map(h => [h, { p0: 0.55, mu0: 0.001, p2_pos: 0.6, p2_neg: 0.45 }]))])) };

ok('candles: complete only, close date = open + 1 day, sorted', () => {
  const c = closesFromCandles([
    { time: '2026-10-29T21:00:00.000000000Z', complete: true, mid: { c: '2' } },
    { time: '2026-10-28T21:00:00.000000000Z', complete: true, mid: { c: '1' } },
    { time: '2026-10-30T21:00:00.000000000Z', complete: false, mid: { c: '3' } },
  ]);
  assert.deepEqual(c, [{ date: '2026-10-29', c: 1 }, { date: '2026-10-30', c: 2 }]);
});

const issueDay = days[260];
const cut = Object.fromEntries(Object.entries(closes).map(([k, v]) => [k, v.slice(0, 261)]));
const rec = issueRecord({ date: issueDay, closes: cut, baselines, issuedAt: 'now' });

ok('issue: B0/B1/B2 for every instrument x horizon, B2 follows momentum sign', () => {
  assert.equal(rec.forecasts.length, 6 * 4 * 3);
  const g = rec.forecasts.find(f => f.inst === 'gold' && f.h === 20 && f.model_id === 'B2');
  assert.equal(g.decision, 'SHORT'); assert.equal(g.p_up, 0.45);
  const n = rec.forecasts.find(f => f.inst === 'nq' && f.h === 20 && f.model_id === 'B2');
  assert.equal(n.decision, 'LONG'); assert.equal(n.p_up, 0.6);
  assert.equal(rec.forecasts.find(f => f.model_id === 'B0').decision, 'NO-TRADE');
});

ok('issue: an instrument whose last close is not the issue day is skipped', () => {
  const c2 = { ...cut, es: cut.es.slice(0, -1) };
  const r2 = issueRecord({ date: issueDay, closes: c2, baselines, issuedAt: 'now' });
  assert.ok(!r2.forecasts.some(f => f.inst === 'es'));
});

ok('issue: research forecasters are recorded and a throwing one is ignored', () => {
  const research = [{ model_id: 'R1', model_version: 'v0', prereg: 'x', forecast: () => ({ p_up: 0.7, decision: 'LONG' }) },
    { model_id: 'R2', model_version: 'v0', prereg: 'y', forecast: () => { throw new Error('boom'); } }];
  const r3 = issueRecord({ date: issueDay, closes: cut, baselines, issuedAt: 'now', research });
  assert.equal(r3.forecasts.filter(f => f.model_id === 'R1').length, 24);
  assert.equal(r3.forecasts.filter(f => f.model_id === 'R2').length, 0);
});

ok('outcome: null until h closes exist; then realised return and scores', () => {
  assert.equal(outcomeRecord(rec, 60, cut, 't'), null);
  const o = outcomeRecord(rec, 20, closes, 't');
  assert.equal(o.outcomes.nq.date_th, days[280]);
  assert.equal(o.outcomes.nq.up, 1); assert.equal(o.outcomes.gold.up, 0);
  assert.ok(Math.abs(o.scores[`${issueDay}|nq|20|B0`].brier - 0.45 ** 2) < 1e-12);
});

ok('summary: skill vs B0 on the same rows; B1 hits count LONG calls', () => {
  const o = outcomeRecord(rec, 20, closes, 't');
  const S = summarise([rec], [o]);
  const b0 = S.find(c => c.model_id === 'B0' && c.inst === 'nq' && c.h === 20);
  assert.equal(b0.bss_vs_b0, 0);
  const b2g = S.find(c => c.model_id === 'B2' && c.inst === 'gold' && c.h === 20);
  assert.ok(b2g.bss_vs_b0 > 0); assert.equal(b2g.hits, 1);
});

console.log(`\n${passed} passed`);
