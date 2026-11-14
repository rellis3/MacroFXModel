// node --test js/replayCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from './replayCore.js';
import { shapeBars, oiEntries, forecastOf, notableDays } from './replayRoutes.js';
import { upTo, buildStrengthSeries } from './replayStrength.js';
import { PAIRS } from './ccyStrengthCore.js';

const MIN = 60e3, HOUR = 3600e3;

test('London calendar: a session is the Europe/London day, 23/24/25 hours across a clock change', () => {
  const w = R.sessionWindow('2026-11-12');                       // winter: London = UTC
  assert.equal(new Date(w.start).toISOString(), '2026-11-12T00:00:00.000Z');
  assert.equal(w.end - w.start, 24 * HOUR);
  const s = R.sessionWindow('2026-07-15');                       // summer: London midnight is 23:00 UTC the day before
  assert.equal(new Date(s.start).toISOString(), '2026-07-14T23:00:00.000Z');
  assert.equal(R.sessionWindow('2026-10-25').end - R.sessionWindow('2026-10-25').start, 25 * HOUR);   // clocks go back
  assert.equal(R.sessionWindow('2026-03-29').end - R.sessionWindow('2026-03-29').start, 23 * HOUR);   // clocks go forward
  assert.equal(R.londonDate(Date.parse('2026-07-14T23:30:00Z')), '2026-07-15');
  assert.equal(R.londonHM(Date.parse('2026-07-14T23:30:00Z')), '00:30');
  assert.equal(R.validDate('2026-02-30'), false);
});

test('deep link: London wall clock by default, Z means UTC, bad input is refused', () => {
  const a = R.parseReplayHash('#replay/NQ/2026-07-15T14:30');
  assert.equal(new Date(a.ts).toISOString(), '2026-07-15T13:30:00.000Z');
  assert.equal(a.date, '2026-07-15');
  const b = R.parseReplayHash('#replay/nq/2026-07-15T14:30Z');
  assert.equal(new Date(b.ts).toISOString(), '2026-07-15T14:30:00.000Z');
  assert.deepEqual(R.parseReplayHash('#replay/NQ'), { inst: 'NQ', date: null, ts: null });
  assert.equal(R.parseReplayHash('#replay/XXX/2026-07-15'), null);
  assert.equal(R.parseReplayHash('#replay/NQ/2026-13-45'), null);
  assert.equal(R.parseReplayHash('#replay/NQ/2026-07-15T25:00'), null);
  assert.equal(R.parseReplayHash('#pair=EURUSD'), null);
  const ts = a.ts;
  assert.equal(R.formatReplayHash('NQ', ts), '#replay/NQ/2026-07-15T14:30');
});

test('clock: play advances by speed, stops at the end, step is clamped and pauses; a gap is skipped', () => {
  const win = { start: 0, end: 10 * HOUR };
  let st = { ts: 0, speed: 60, playing: true };
  st = R.advance(st, 1000, win);
  assert.equal(st.ts, 60e3);
  assert.equal(R.advance({ ts: 5, speed: 1, playing: false }, 1000, win).ts, 5);
  const end = R.advance({ ts: 10 * HOUR - 500, speed: 1, playing: true }, 5000, win);
  assert.equal(end.ts, win.end); assert.equal(end.playing, false); assert.equal(end.ended, true);
  const s2 = R.stepTo({ ts: 0, speed: 1, playing: true }, -HOUR, win);
  assert.equal(s2.ts, 0); assert.equal(s2.playing, false);
  const m1 = [[0, 1, 1, 1, 1], [MIN, 1, 1, 1, 1], [5 * HOUR, 1, 1, 1, 1]];
  assert.equal(R.gapJump(m1, 3 * MIN), 5 * HOUR);                // hours of nothing: jump to the next bar
  assert.equal(R.gapJump(m1, MIN / 2), null);                    // inside a bar: nothing to skip
  assert.equal(R.gapJump(m1, 5 * HOUR + 10 * MIN), null);        // after the last bar
});

const mk = (n, t0 = 0) => Array.from({ length: n }, (_, i) => [t0 + i * MIN, 100 + i, 101 + i, 99 + i, 100.5 + i]);

test('candles: only finished minutes count, the forming bar is built from the minutes so far', () => {
  const m1 = mk(12);
  assert.equal(R.m1Count(m1, 0), 0);
  assert.equal(R.m1Count(m1, MIN), 1);
  assert.equal(R.m1Count(m1, MIN + 30e3), 1);                    // half way through the second minute: it has not finished
  assert.equal(R.m1Count(m1, 99 * MIN), 12);
  const agg = R.aggregateM1(m1, 5);
  assert.equal(agg.length, 3);
  assert.deepEqual([agg[0].o, agg[0].h, agg[0].l, agg[0].c, agg[0].i0, agg[0].i1], [100, 105, 99, 104.5, 0, 4]);
  const at3 = R.barsAt(agg, m1, 3);                              // three minutes into the first 5-minute bar
  assert.equal(at3.length, 1);
  assert.deepEqual([at3[0].h, at3[0].l, at3[0].c, at3[0].forming], [103, 99, 102.5, true]);
  const at7 = R.barsAt(agg, m1, 7);
  assert.equal(at7.length, 2); assert.equal(at7[0].forming, undefined); assert.equal(at7[1].forming, true);
  assert.equal(R.barsAt(agg, m1, 12).length, 3);
  assert.deepEqual(R.barsAt(agg, m1, 0), []);
  assert.deepEqual(R.sessionOpen(m1, { start: 3 * MIN, end: 99 * MIN }), { price: 103, t: 3 * MIN });
});

const E = (date, savedAtMs, extra = {}) => ({ date, savedAtMs, asOf: null, callWalls: [{ strike: 110, oi: 900, tier: 'strong' }, { strike: 120, oi: 100, tier: 'moderate' }],
  putWalls: [{ strike: 90, oi: 800, tier: 'strong' }], maxPain: 100, gammaFlip: 95, gexFlips: [{ price: 98, dir: 'short->long' }], ...extra });

test('levels are point-in-time: a capture is shown only from the time it was SAVED, the latest one wins, old ones go stale', () => {
  const e1 = E('2026-11-11', 1000), e2 = E('2026-11-12', 5000, { maxPain: 105 });
  assert.equal(R.activeOi([e1, e2], 999), null);
  assert.equal(R.activeOi([e1, e2], 1000).date, '2026-11-11');
  assert.equal(R.activeOi([e1, e2], 4999).date, '2026-11-11');
  assert.equal(R.activeOi([e1, e2], 5000).date, '2026-11-12');
  const ls = R.oiLines(e1);
  assert.deepEqual(ls.map(l => l.type), ['call', 'call', 'put', 'maxpain', 'gammaflip', 'gexflip']);
  assert.equal(ls[0].price, 110);                                // biggest open interest first
  const ctx = { oi: [e1], open: { price: 100, t: 2000 }, fc: { hl_median: 2, hl_75: 3, knownFrom: 3000 } };
  assert.ok(R.levelsAt(ctx, 1500).every(l => l.kind === 'oi'));  // no open and no forecast before the session has opened
  assert.ok(R.levelsAt(ctx, 2500).some(l => l.kind === 'open') && !R.levelsAt(ctx, 2500).some(l => l.kind === 'fc'));   // forecast not yet computed
  const fc = R.levelsAt(ctx, 3500).filter(l => l.kind === 'fc');
  assert.equal(fc.length, 4);
  assert.ok(Math.abs(fc.find(l => l.type === 'H50').price - 102) < 1e-9 && Math.abs(fc.find(l => l.type === 'L75').price - 97) < 1e-9);
  // walls far from the spot are left off while nearer ones exist; with none near, the biggest are used
  const far = { ...e1, spot: 100, callWalls: [{ strike: 106, oi: 10 }, { strike: 130, oi: 999 }, { strike: 102, oi: 5 }, { strike: 101, oi: 6 }], putWalls: [{ strike: 70, oi: 50 }] };
  assert.deepEqual(R.oiLines(far).filter(l => l.type === 'call').map(l => l.price), [101, 102]);
  assert.deepEqual(R.oiLines(far).filter(l => l.type === 'put').map(l => l.price), [70]);
  assert.equal(R.levelsAt(ctx, 1000 + 4 * 86400e3).find(l => l.kind === 'oi').stale, true);
  assert.equal(R.levelsAt(ctx, 2500).find(l => l.kind === 'oi').publishedDate, '2026-11-11');
});

test('touches: once until price has gone away, counted per line, lookahead-free, the open is not a touch', () => {
  // price walks up to 110, chops on it, goes away, comes back
  const px = [100, 104, 108, 109.99, 110.01, 109.97, 110.02, 104, 100, 104, 109.99];
  const m1 = px.map((p, i) => [i * MIN, p, p + 0.02, p - 0.02, p]);
  const ctx = { oi: [{ ...E('d', 0), callWalls: [{ strike: 110, oi: 5, tier: 'strong' }], putWalls: [], maxPain: null, gammaFlip: null, gexFlips: [] }], open: { price: 100, t: 0 } };
  const ev = R.scanTouches(m1, ctx);
  const calls = ev.filter(e => e.type === 'call');
  assert.equal(calls.length, 2);                                 // one touch on the way up (chopping counts once), one on the return
  assert.deepEqual(calls.map(e => e.n), [1, 2]);
  assert.equal(calls[0].from, 'below');
  assert.ok(!ev.some(e => e.type === 'open'));
  assert.equal(R.touchesAt(ev, calls[0].t - 1).filter(e => e.type === 'call').length, 0);
  assert.equal(R.touchesAt(ev, calls[0].t).filter(e => e.type === 'call').length, 1);
});

test('strength and the desk: as-of, never a guess', () => {
  const series = { ccys: ['USD', 'EUR'], stepMs: 900e3, steps: [{ t: 0, closed: false, h: { '1H': [1.2, -1.2], '4H': null } }, { t: 900e3, ok: false }, { t: 1800e3, closed: true, h: { '1H': [-0.5, 0.5] } }] };
  assert.equal(R.strengthAt(series, -1), null);
  assert.deepEqual(R.ranked(R.strengthAt(series, 100e3), '1H'), [{ ccy: 'USD', score: 1.2 }, { ccy: 'EUR', score: -1.2 }]);
  assert.equal(R.ranked(R.strengthAt(series, 100e3), '4H'), null);
  assert.equal(R.strengthAt(series, 1000e3), null);              // a step that could not be built is "unknown", not the one before
  assert.equal(R.strengthAt(series, 2000e3).closed, true);
  const pts = [{ ts: 100, inputs: { desk: { asOf: 'A' } }, d: { desk: { tone: 'risk_off', ccy: { USD: 2 }, instruments: { NQ: { rating: 'SHORT', conviction: 'medium' } } } } }, { ts: 300, d: { stress: {} } }];
  assert.equal(R.deskAt({ points: pts, ts: 50, inst: 'NQ' }), null);
  const s = R.deskAt({ points: pts, ts: 400, inst: 'NQ' });
  assert.deepEqual([s.source, s.rating, s.conviction, s.ccy.USD], ['snapshot', 'SHORT', 'medium', 2]);
  const dawn = { finishedMs: 200, finishedAt: 'F', tone: 'risk_on', rating: 'LONG' };
  assert.equal(R.deskAt({ dawn, ts: 100, inst: 'NQ' }), null);   // the morning book is not shown before it had finished
  assert.equal(R.deskAt({ dawn, ts: 200, inst: 'NQ' }).rating, 'LONG');
  assert.equal(R.deskAt({ points: pts, dawn, ts: 400, inst: 'NQ' }).source, 'snapshot');
});

test('caption describes, never predicts; says where price is against the lines, the touch count and who is strong', () => {
  const lines = [{ id: 'a', kind: 'oi', type: 'put', label: 'Put wall', price: 27814 }, { id: 'b', kind: 'oi', type: 'call', label: 'Call wall', price: 29214 }, { id: 'open', kind: 'open', label: 'Session open', price: 27900 }];
  const strength = { ccys: ['NZD', 'JPY', 'USD'], h: { '4H': [1.4, -1.9, 0.1] } };
  const ts = Date.parse('2026-11-12T14:35:00Z');
  const c = R.captionFor({ ts, inst: 'NQ', price: 27851, lines, open: { price: 27900 }, strength, hz: '4H', fc: { hl_median: 3 }, dayHi: 28000, dayLo: 27800, desk: { source: 'dawn', rating: 'SHORT' } });
  assert.match(c, /14:35 London \(14:35 UTC\)/);
  assert.match(c, /between the put wall 27,814\.0 \(37 pts below\) and the call wall 29,214\.0 \(1,363 pts above\)/);
  assert.match(c, /strongest currency is NZD \(\+1\.4σ\) and the weakest JPY \(−1\.9σ\)/);
  assert.match(c, /range so far is 24% of the forecast median range/);
  assert.match(c, /morning book on this market: short/);
  assert.doesNotMatch(c, /will|expect|likely|should|buy|sell|target|stop/i);
  const at = R.captionFor({ ts, inst: 'NQ', price: 27814.5, lines, counts: { a: 3 }, hz: '4H' });
  assert.match(at, /price is at the put wall 27,814\.0, its 3rd touch so far/);
  assert.match(R.captionFor({ ts, inst: 'NQ', price: null }), /no price yet/);
});

test('coverage names what is missing, per layer', () => {
  const rows = R.coverageRows({ ok: true, instrument: { oi: 'NAS100_USD' }, coverage: { candles: { from: '2018-01-01' }, oi: { from: '2026-08-20', to: '2026-11-14', days: 87 }, forecast: { from: '2026-06-11', to: '2026-11-16' }, desk: { from: '2026-11-03', to: '2026-11-13', days: ['2026-11-03'] }, snapshots: { from: '2026-11-14', to: '2026-11-14', days: ['2026-11-14'] } } });
  assert.equal(rows.length, 6);
  assert.match(rows.find(r => /Option/.test(r.layer)).note, /saved \(about 06:45 London/);
  assert.match(rows.find(r => /snapshots/.test(r.layer)).note, /no backfill/);
  const none = R.coverageRows({ ok: true, instrument: { oi: null }, coverage: {} });
  assert.equal(none.find(r => /Option/.test(r.layer)).status, 'none');
  assert.deepEqual(R.coverageRows(null), []);
});

test('routes: bar shaping, OI trimming by saved time, forecast lookup, notable days', () => {
  const bars = shapeBars([{ t: 120, open: '2', high: '3', low: '1', close: '2.5' }, { t: 60, open: '1', high: '2', low: '0.5', close: '1.5' }, { t: 60, open: '9', high: '9', low: '9', close: '9' }, { t: 180, open: 'x', high: '1', low: '1', close: '1' }]);
  assert.deepEqual(bars, [[60e3, 1, 2, 0.5, 1.5], [120e3, 2, 3, 1, 2.5]]);
  const hist = { NAS100_USD: { '2026-11-12': { savedAtMs: 5000, asOf: '2026-11-11', spot: 1, maxPain: 2, callWalls: [{ strike: 3, oi: 4, tier: 'strong', chg: 9 }], putWalls: [], gexFlips: [{ price: 5, dir: 'x' }], regime: 'pin', extra: 'dropped' }, '2026-11-13': { savedAtMs: 9000 } } };
  const o = oiEntries(hist, 'NAS100_USD', 0, 6000);
  assert.equal(o.entries.length, 1); assert.equal(o.days, 2); assert.equal(o.entries[0].extra, undefined); assert.equal(o.entries[0].callWalls[0].chg, undefined);
  assert.equal(oiEntries(hist, 'EUR/USD', 0, 1e9).entries.length, 0);
  assert.equal(oiEntries(hist, null, 0, 1).days, 0);
  const f = forecastOf({ computed_at: '2026-11-12T00:05:00Z', instruments: { NQ: { hl_median: 3.04, hl_75: 3.76, oc_median: 1.44, oc_75: 2.42, vol_annual: 30.9 } } }, 'nq');
  assert.equal(f.hl_75, 3.76); assert.equal(f.knownFrom, Date.parse('2026-11-12T00:05:00Z'));
  assert.equal(forecastOf({ instruments: {} }, 'nq'), null);
  const d = (date, o, h, l, c) => [R.londonWall(date), o, h, l, c];
  const nd = notableDays([d('2026-11-10', 100, 110, 95, 105), d('2026-11-11', 100, 101, 99, 100), d('2026-11-12', 100, 103, 97, 100)], [E('2026-11-10', 1), E('2026-11-12', 2)], { top: 2 });
  assert.equal(nd.ranges[0].date, '2026-11-10'); assert.equal(nd.ranges[0].rangePct, 15);
  assert.equal(nd.tests[0].date, '2026-11-10');                  // the wide day tested more of the levels (90..110)
  assert.ok(nd.tests[0].levels > nd.tests.find(t => t.date === '2026-11-12').levels);
});

test('strength series: bars are truncated to what had finished (no leak from after the step); a shut market is flagged closed', () => {
  const arr = [{ t: 0, c: 1 }, { t: HOUR, c: 2 }, { t: 2 * HOUR, c: 3 }];
  assert.equal(upTo(arr, HOUR, 2 * HOUR).length, 2);             // the bar opening at 2h has not finished at 2h
  assert.equal(upTo(arr, HOUR, 3 * HOUR).length, 3);
  assert.equal(upTo(arr, HOUR, 0).length, 0);
  // 28 pairs of quiet synthetic bars over a winter weekday: enough history for every window, so the series must come out available
  const t0 = Date.parse('2026-11-11T00:00:00Z');
  const bars = {};
  PAIRS.forEach((p, k) => {
    const h1 = Array.from({ length: 800 }, (_, i) => ({ t: t0 - (800 - i) * HOUR, c: 1 + 0.001 * Math.sin(i / 7 + k) }));
    const d = Array.from({ length: 140 }, (_, i) => ({ t: t0 - (140 - i) * 24 * HOUR, c: 1 + 0.01 * Math.sin(i / 5 + k) }));
    const m5 = Array.from({ length: 12 * 40 }, (_, i) => ({ t: t0 - 6 * HOUR + i * 300e3, c: 1 + 0.0005 * Math.sin(i / 3 + k) }));
    bars[p] = { m5, h1, d };
  });
  const s = buildStrengthSeries({ bars, startMs: t0 + 6 * HOUR, endMs: t0 + 8 * HOUR });
  assert.equal(s.steps.length, 8);
  assert.equal(s.ccys.length, 8);
  assert.ok(s.steps[0].h['1H'] || s.steps[0].h['4H'], 'a window must be built');
  const sat = buildStrengthSeries({ bars, startMs: Date.parse('2026-11-14T12:00:00Z'), endMs: Date.parse('2026-11-14T12:30:00Z') });
  assert.equal(sat.steps[0].closed, true);
  // no leak: bars after the step cannot change the step
  const leaky = JSON.parse(JSON.stringify(bars));
  leaky.EUR_USD.m5.push({ t: t0 + 7 * HOUR, c: 9 });
  const a = buildStrengthSeries({ bars, startMs: t0 + 6 * HOUR, endMs: t0 + 6 * HOUR + 900e3 }), b = buildStrengthSeries({ bars: leaky, startMs: t0 + 6 * HOUR, endMs: t0 + 6 * HOUR + 900e3 });
  assert.deepEqual(a, b);
});
