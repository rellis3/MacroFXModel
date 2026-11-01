// node js/directionResearch.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lastPct, volFlags, RESEARCH, EXCESS, VIX_BETA_CHANGE, COT_STATE_D, POST_FOMC_USD_DRIFT } from './directionResearch.js';
import { issueRecord, HORIZONS, INSTRUMENTS } from './directionLedger.js';
import { parseCboeCsv } from './marketHistory.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok ', name); };

ok('lastPct: average rank like pandas rank(pct=True), needs min periods', () => {
  const v = Array.from({ length: 252 }, (_, i) => i);
  assert.equal(lastPct(v), 1);                                     // the largest of 252 distinct values
  assert.equal(lastPct([...v.slice(0, 251), 0]), (0 + (2 + 1) / 2) / 252);   // ties with one other 0: average rank 1.5
  assert.equal(lastPct(v.slice(0, 100)), null);
});

ok('volFlags: reproduces scripts/vix-signals-forward/score.py on the local copies (2026-10-20)', () => {
  const cboe = n => parseCboeCsv(fs.readFileSync(new URL(`../analysis/surfaces/cboe/${n}.csv`, import.meta.url), 'utf8'));
  const ndx = fs.readFileSync(new URL('../analysis/output/yield-predictive-ladder/raw/NASDAQ100.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1)
    .map(l => l.split(',')).filter(c => Number.isFinite(+c[1])).map(c => ({ date: c[0], value: +c[1] }));
  const r = volFlags({ VIX: cboe('VIX'), VVIX: cboe('VVIX'), VXN: cboe('VXN'), NDX: ndx });
  // expected values printed by score.py's own formulas (pandas) on the same files
  assert.equal(r.date, '2026-10-20');
  assert.ok(Math.abs(r.dBPct - 0.05952380952380952) < 1e-12);
  assert.ok(Math.abs(r.dRimpPct - 0.23015873015873015) < 1e-12);
  assert.ok(Math.abs(r.dB - -2.5130306274937655) < 1e-9);
});

ok('volFlags: missing a series gives null, not a guess', () => {
  assert.equal(volFlags({ VIX: [], VVIX: [], VXN: [], NDX: [] }), null);
});

const base = { p0: 0.6, mu0: 0.001, p2_pos: 0.6, p2_neg: 0.45 };
const fc = (R, ctx) => R.forecast({ baseline: base, ...ctx });

ok('vix-beta-change: nq h5 only, only when the date matches and the percentile is in the bottom decile', () => {
  const ext = { vol: { date: '2026-11-02', dBPct: 0.05, dRimpPct: 0.5 } };
  const f = fc(VIX_BETA_CHANGE, { date: '2026-11-02', inst: 'nq', h: 5, external: ext });
  assert.equal(f.decision, 'LONG'); assert.equal(f.p_up, 0.6 + EXCESS['vix-beta-change']);
  assert.equal(fc(VIX_BETA_CHANGE, { date: '2026-11-02', inst: 'nq', h: 20, external: ext }), null);
  assert.equal(fc(VIX_BETA_CHANGE, { date: '2026-11-02', inst: 'es', h: 5, external: ext }), null);
  assert.equal(fc(VIX_BETA_CHANGE, { date: '2026-11-03', inst: 'nq', h: 5, external: ext }), null);   // stale vol data is not used
  assert.equal(fc(VIX_BETA_CHANGE, { date: '2026-11-02', inst: 'nq', h: 5, external: { vol: { ...ext.vol, dBPct: 0.2 } } }), null);
  assert.equal(fc(VIX_BETA_CHANGE, { date: '2026-11-02', inst: 'nq', h: 5, external: {} }), null);
});

ok('cot-state-d: only state D, h20, side = trend; one event per COT report', () => {
  const ext = { cot: { EURUSD: { state: 'D', trend: -1, reportDate: '2026-10-27' }, GOLD: { state: 'A', trend: 1, reportDate: '2026-10-27' } } };
  const f = fc(COT_STATE_D, { date: '2026-11-02', inst: 'eurusd', h: 20, external: ext });
  assert.equal(f.decision, 'SHORT'); assert.equal(f.p_up, 0.6 - EXCESS['cot-state-d']);
  assert.equal(f.inputs.event_key, 'eurusd|2026-10-27');
  assert.equal(fc(COT_STATE_D, { date: '2026-11-02', inst: 'gold', h: 20, external: ext }), null);
  assert.equal(fc(COT_STATE_D, { date: '2026-11-02', inst: 'eurusd', h: 5, external: ext }), null);
});

ok('post-fomc-usd-drift: decision days only, USD up = EURUSD/GBPUSD down, USDJPY up, flagged FRAGILE', () => {
  const ext = { fomcDates: ['2026-12-09'] };
  const e = fc(POST_FOMC_USD_DRIFT, { date: '2026-12-09', inst: 'eurusd', h: 5, external: ext });
  assert.equal(e.decision, 'SHORT'); assert.ok(e.p_up < base.p0); assert.deepEqual(e.flags, ['FRAGILE']);
  assert.equal(fc(POST_FOMC_USD_DRIFT, { date: '2026-12-09', inst: 'usdjpy', h: 5, external: ext }).decision, 'LONG');
  assert.equal(fc(POST_FOMC_USD_DRIFT, { date: '2026-12-10', inst: 'eurusd', h: 5, external: ext }), null);
  assert.equal(fc(POST_FOMC_USD_DRIFT, { date: '2026-12-09', inst: 'nq', h: 5, external: ext }), null);
});

ok('probabilities stay inside (0,1) however large the baseline', () => {
  const f = POST_FOMC_USD_DRIFT.forecast({ date: 'd', inst: 'usdjpy', h: 5, baseline: { ...base, p0: 0.98 }, external: { fomcDates: ['d'] } });
  assert.ok(f.p_up <= 0.99);
});

ok('ledger: research rows sit beside B0/B1/B2 with inputs and flags, and the record notes the external status', () => {
  const days = []; for (let d = new Date('2025-06-02T00:00:00Z'); days.length < 300; d = new Date(d.getTime() + 86400_000)) if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10));
  const closes = Object.fromEntries(Object.keys(INSTRUMENTS).map(i => [i, days.map((date, k) => ({ date, c: 100 * Math.exp(0.001 * k) }))]));
  const baselines = { version: 't', instruments: Object.fromEntries(Object.keys(INSTRUMENTS).map(i => [i, Object.fromEntries(HORIZONS.map(h => [h, base]))])) };
  const date = days.at(-1);
  const rec = issueRecord({ date, closes, baselines, issuedAt: 'now', research: RESEARCH, externalStatus: { vol: 'ok' },
    external: { vol: { date, dBPct: 0.01, dRimpPct: 0.95 }, fomcDates: [date], cot: { NQ: { state: 'D', trend: 1, reportDate: '2026-10-27' } } } });
  const ids = rec.forecasts.filter(f => f.family === 'research').map(f => `${f.model_id}|${f.inst}|${f.h}`).sort();
  assert.deepEqual(ids, ['cot-state-d|nq|20', 'post-fomc-usd-drift|eurusd|5', 'post-fomc-usd-drift|gbpusd|5', 'post-fomc-usd-drift|usdjpy|5',
    'vix-beta-change|nq|5', 'vix-second-derivative|nq|20']);
  const r = rec.forecasts.find(f => f.model_id === 'vix-beta-change');
  assert.equal(r.inputs.close > 0, true); assert.equal(r.inputs.cell, 'vix-beta-change');
  assert.deepEqual(rec.external_status, { vol: 'ok' });
  assert.ok(rec.forecasts.filter(f => f.family === 'baseline').length === 6 * 4 * 3);
  const none = issueRecord({ date, closes, baselines, issuedAt: 'now', research: RESEARCH, external: {} });
  assert.equal(none.forecasts.filter(f => f.family === 'research').length, 0);   // no external data: baselines only
});

console.log(`\n${passed} passed`);
