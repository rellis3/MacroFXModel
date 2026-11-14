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

// ── same-day row type (forge/BIAS_SCOREBOARD_PREREG.md) ──────────────────────────────────────────────────────────
const SD = await import('./directionLedger.js');
const sdBase = { version: 'b0-test', instruments: Object.fromEntries(Object.keys(SD.SAMEDAY_INSTRUMENTS).map(i => [i, { d21: { p0: 0.5 }, n07: { p0: 0.52 }, d5: { p0: 0.51 } }])) };
const D = '2026-11-13';   // a Friday, GMT

ok('sameday: London clock, weekdays, Fri -> Mon for n07, d5 = 5th weekday', () => {
  assert.equal(new Date(SD.londonMs(D, 7)).toISOString(), '2026-11-13T07:00:00.000Z');
  assert.equal(new Date(SD.londonMs('2026-07-01', 21)).toISOString(), '2026-07-01T20:00:00.000Z');   // BST
  assert.equal(new Date(SD.targetEndMs(D, 'n07')).toISOString(), '2026-11-16T07:00:00.000Z');
  assert.equal(new Date(SD.targetEndMs(D, 'd5')).toISOString(), '2026-11-20T07:00:00.000Z');
  assert.equal(SD.addWeekdays('2026-11-16', -1), '2026-11-13');
});

ok('sameday: anchor = max(07:00, knowable rounded up to the minute)', () => {
  assert.equal(SD.anchorMs(D, SD.londonMs(D, 6, 30)), SD.londonMs(D, 7));
  assert.equal(SD.anchorMs(D, SD.londonMs(D, 7, 10) + 1500), SD.londonMs(D, 7, 11));
  assert.equal(SD.anchorMs(D, SD.londonMs(D, 7, 10)), SD.londonMs(D, 7, 10));
  assert.equal(SD.anchorMs(D, null), SD.londonMs(D, 7));
});

ok('sameday: mid at T = close of the last bar starting in [T-5m, T)', () => {
  const T = SD.londonMs(D, 7), bars = [{ time: (T - 6 * 60e3) / 1000, close: 1 }, { time: (T - 2 * 60e3) / 1000, close: 2 }, { time: (T - 60e3) / 1000, close: 3 }, { time: T / 1000, close: 9 }];
  assert.equal(SD.midAt(bars, T), 3);
  assert.equal(SD.midAt(bars.slice(0, 1), T), null);
});

ok('sameday: sigma uses 60 returns of closes dated before D only', () => {
  const C = Array.from({ length: 70 }, (_, i) => ({ date: SD.addWeekdays('2026-08-03', i), c: 100 * Math.exp(0.01 * (i % 2)) }));
  const d = C[65].date, s = SD.sigmaDay(C, d);
  assert.ok(s > 0.009 && s < 0.011);
  assert.equal(SD.sigmaDay(C.slice(0, 60), C[59].date), null);
  assert.equal(SD.sigmaDay([...C.slice(0, 66), { date: d, c: 1e6 }], d), s);   // the close dated D is not used
});

const views = [
  { model_id: 'm', model_version: 'm-v1', inst: 'eurusd', speaks: true, side: 1, shift: 0.04, knowable_ms: SD.londonMs(D, 7, 9) + 1, conviction: 'medium' },
  { model_id: 'm', model_version: 'm-v1', inst: 'gold', speaks: false, side: 0, shift: 0, knowable_ms: SD.londonMs(D, 7) },
  { model_id: 'm', model_version: 'm-v1', inst: 'usdjpy', speaks: true, side: -1, shift: 0.05, knowable_ms: SD.londonMs(D, 16, 1) },
];
const sdRec = SD.issueSameDay({ date: D, source: 'base', views, baselines: sdBase, sigma: { eurusd: 0.005 }, issuedAt: 't', withB0: true, insts: ['eurusd', 'gold', 'usdjpy'] });

ok('sameday issue: B0 rows on every instrument x target, views expanded, late view dropped and listed', () => {
  assert.equal(sdRec.forecasts.filter(f => f.model_id === 'B0').length, 9);
  const e = sdRec.forecasts.find(f => f.id === `${D}|eurusd|d21|m`);
  assert.equal(e.p_up, 0.54); assert.equal(e.b0_p, 0.5); assert.equal(e.decision, 'LONG');
  assert.equal(e.anchor_ts, new Date(SD.londonMs(D, 7, 10)).toISOString());
  assert.equal(sdRec.forecasts.find(f => f.id === `${D}|eurusd|n07|m`).p_up, 0.56);
  const g = sdRec.forecasts.find(f => f.id === `${D}|gold|d21|m`);
  assert.equal(g.speaks, false); assert.equal(g.p_up, 0.5); assert.equal(g.decision, 'NO-TRADE');
  assert.ok(!sdRec.forecasts.some(f => f.inst === 'usdjpy' && f.model_id === 'm'));
  assert.equal(sdRec.late[0].inst, 'usdjpy');
  assert.equal(sdRec.row_type, 'sameday');
});

// prices: everything 1.0 at 07:00; EURUSD 1.002 from 07:05; gold 2000 then down; end prices fixed
const px = (inst, ms) => {
  if (inst === 'usdjpy') return null;
  if (inst === 'eurusd') return ms >= SD.londonMs(D, 7, 5) ? (ms >= SD.londonMs(D, 21) ? 1.01 : 1.002) : 1.0;
  if (inst === 'gold') return ms >= SD.londonMs(D, 21) ? 1990 : 2000;
};
const sdOut = await SD.outcomeSameDay([sdRec], 'd21', async (i, ms) => px(i, ms), { now: SD.londonMs(D, 21, 6), resolvedAt: 't' });

const sdEarly = await SD.outcomeSameDay([sdRec], 'd21', async () => 1, { now: SD.londonMs(D, 21, 4), resolvedAt: 't' });
ok('sameday outcome: null before end + 5 min', () => assert.equal(sdEarly, null));

ok('sameday outcome: each row scored at its own anchor; B0 scored on the same y; unresolved listed', () => {
  const s = sdOut.scores[`${D}|eurusd|d21|m`], b = sdOut.scores[`${D}|eurusd|d21|B0`];
  assert.equal(s.y, 1); assert.equal(s.hit, 1);
  assert.ok(Math.abs(s.r_log - Math.log(1.01 / 1.002)) < 1e-12);       // anchor 07:10, not 07:00
  assert.ok(Math.abs(b.r_log - Math.log(1.01)) < 1e-12);
  assert.ok(Math.abs(s.R - Math.log(1.01 / 1.002) / 0.005) < 1e-9);
  assert.ok(Math.abs(s.b0_log - Math.log(0.5)) < 1e-12 && s.log > s.b0_log);
  assert.equal(sdOut.scores[`${D}|gold|d21|m`].hit, null);
  assert.equal(sdOut.unresolved[`${D}|usdjpy|d21|B0`], 'no anchor price');
});

ok('sameday summary: coverage over eligible B0 rows, log diff vs B0, unresolved counted', () => {
  const S = SD.summariseSameDay([sdRec], [sdOut], { insts: ['eurusd', 'gold', 'usdjpy'] });
  const m = S.find(c => c.model_id === 'm' && c.target === 'd21' && c.inst === '*');
  assert.equal(m.n, 1); assert.equal(m.eligible, 2); assert.equal(m.coverage, 0.5); assert.equal(m.hit_rate, 1);
  assert.ok(m.logdiff > 0);
  const b0 = S.find(c => c.model_id === 'B0' && c.target === 'd21' && c.inst === '*');
  assert.equal(b0.n, 0); assert.equal(b0.unresolved, 0);
});

console.log(`\n${passed} passed`);
