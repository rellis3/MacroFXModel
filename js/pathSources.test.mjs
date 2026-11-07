// Path sources: GLD → XAU mapping, Cboe expiry books, merging CME with Cboe, the horizon, the volume centre.
//   node js/pathSources.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from './pathSources.js';
import { zoneWalk } from './swingPaths.js';
import { parseCboeChain } from './cboeChain.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('horizon: one constant, 200 days; the core window stays 100', () => {
  assert.equal(P.PATH_HORIZON_DAYS, 200);
  assert.equal(P.PATH_CORE_DAYS, 100);
  const rows = ['2026-11-05', '2026-11-06', '2027-05-25', '2027-05-26', '2026-12-28'].map(expiry => ({ expiry }));
  assert.deepEqual(P.withinHorizon(rows, { today: '2026-11-06' }).map(r => r.expiry), ['2026-11-06', '2026-12-28', '2027-05-25']);
  assert.deepEqual(P.withinHorizon(rows, { today: '2026-11-06', days: 100 }).map(r => r.expiry), ['2026-11-06', '2026-12-28']);
  assert.deepEqual(P.withinHorizon(rows, {}), []);
  assert.equal(P.addDaysIso('2026-11-06', 200), '2027-05-25');
});

test('sources: which instruments have a Cboe book, and ?source= parsing (default CME)', () => {
  assert.equal(P.normaliseSource('GOLD', undefined), 'cme');
  assert.equal(P.normaliseSource('GOLD', 'gld'), 'cboe');
  assert.equal(P.normaliseSource('GOLD', 'cboe'), 'cboe');
  assert.equal(P.normaliseSource('GOLD', 'COMBINED'), 'combined');
  assert.equal(P.normaliseSource('SPX500', 'spx'), 'cboe');
  assert.equal(P.normaliseSource('NQ', 'ndx'), 'cboe');
  assert.equal(P.normaliseSource('EURUSD', 'cboe'), 'cme', 'no Cboe book for FX');
  assert.equal(P.normaliseSource('GOLD', 'nonsense'), 'cme');
  assert.deepEqual(P.sourceChoices('GOLD').map(c => c.label), ['CME', 'GLD (Cboe)', 'CME + GLD']);
  assert.equal(P.sourceChoices('EURUSD').length, 1);
});

test('GLD → XAU: the live ratio maps strikes, contracts become ounces', () => {
  const m = P.gldXauMap({ xauSpot: 4073.37, gldSpot: 372.929 });
  assert.ok(near(m.ratio, 10.922642, 1e-5));
  assert.ok(near(m.ozPerShare, 0.091553, 1e-6));
  assert.ok(near(m.ozPerContract, 9.1553, 1e-4), 'one contract = 100 shares');
  assert.ok(near(m.toXau(372.929), 4073.37, 1e-6), 'GLD spot maps to XAU spot');
  assert.ok(near(m.toXau(400), 400 * m.ratio, 1e-3));
  assert.equal(P.gldXauMap({ xauSpot: 4000, gldSpot: 0 }), null);
  assert.equal(P.gldXauMap({ xauSpot: 4000, gldSpot: 4000 }), null, 'ratio 1 is a wrong quote');
  const f = P.indexCfdMap({ scale: 1, cfdOffset: 3.5 }); assert.equal(f(6000), 6003.5);
  assert.equal(P.indexCfdMap({ scale: 100, cfdOffset: null })(470), 47000);
});

test('volume centre: volume-weighted strike in mapped terms, null when nothing traded', () => {
  const cs = [{ K: 100, vol: 10, cp: 'C' }, { K: 110, vol: 30, cp: 'P' }, { K: 120, vol: 0, cp: 'C' }];
  const v = P.volumeCentre(cs, k => k * 10);
  assert.equal(v.px, 1075); assert.equal(v.volume, 40); assert.equal(v.calls, 10); assert.equal(v.puts, 30);
  assert.equal(P.volumeCentre([{ K: 100, vol: 0, cp: 'C' }]), null);
  assert.equal(P.atmIv([{ K: 100, iv: 0.2, cp: 'C' }, { K: 100, iv: 0.3, cp: 'P' }, { K: 120, iv: 0.5, cp: 'C' }], 104), 0.25);
});

// a small real-shaped Cboe payload: GLD at 373, three expiries (one past the horizon)
const opt = (sym, oi, vol, iv) => ({ option: sym, open_interest: oi, volume: vol, iv, gamma: 0.01, delta: 0.5 });
const payload = { timestamp: '2026-11-06 19:04:24', data: { current_price: 373, options: [
  opt('GLD261113C00375000', 1000, 50, 0.22), opt('GLD261113P00370000', 3000, 150, 0.23), opt('GLD261113C00380000', 500, 0, 0.22),
  opt('GLD261120C00390000', 4000, 10, 0.23), opt('GLD261120P00360000', 1000, 5, 0.24),
  opt('GLD271217C00400000', 900, 0, 0.25), opt('GLD271217P00350000', 900, 0, 0.25),
] } };

test('Cboe expiry rows: GLD books read by expiryView in XAU terms and ounces, inside the horizon', () => {
  const parsed = parseCboeChain(payload);
  const map = P.gldXauMap({ xauSpot: 4073, gldSpot: parsed.spot });
  const rows = P.cboeExpiryRows(parsed, { pair: 'XAU/USD', label: 'GLD', mapPx: map.toXau, oiUnit: map.ozPerContract, unit: 1, unitName: 'oz', today: '2026-11-06' });
  assert.deepEqual(rows.map(r => r.expiry), ['2026-11-13', '2026-11-20'], 'Dec 2027 is past 200 days');
  const a = rows[0];
  assert.equal(a.source, 'cboe'); assert.equal(a.sourceLabel, 'GLD'); assert.equal(a.oiUnit, 'oz'); assert.equal(a.dte, 7);
  assert.ok(near(a.totalOI, 4500 * map.ozPerContract, 0.1), 'OI in ounces');
  assert.ok(near(a.ladder[0][0], 370 * map.ratio, 1e-4), 'strikes in XAU');
  assert.ok(a.centrePx > 370 * map.ratio && a.centrePx < 380 * map.ratio);
  assert.ok(near(a.gammaVolDaily, a.ivAtm / Math.sqrt(252), 1e-6) && a.ivAtm > 0.2, 'ATM IV carried for the gamma weighting');
  assert.ok(near(a.volCentre.px, (50 * 375 + 150 * 370) / 200 * map.ratio, 1e-3));
  assert.ok(a.gamma && a.greeks && Number.isFinite(a.greeks.charmNotional), 'gamma regime and greeks from the same view');
  assert.equal(a.history.length, 1);
});

test('merge: notional-weighted union, same-date books merged, each row labelled', () => {
  const parsed = parseCboeChain(payload);
  const map = P.gldXauMap({ xauSpot: 4073, gldSpot: parsed.spot });
  const cboe = P.cboeExpiryRows(parsed, { pair: 'XAU/USD', label: 'GLD', mapPx: map.toXau, oiUnit: map.ozPerContract, unit: 1, unitName: 'oz', today: '2026-11-06' });
  const cme = [
    { pair: 'XAU/USD', expiry: '2026-11-13', code: 'OG2X6', dte: 7, date: '2026-11-06', totalOI: 300, oiAbove: 200, oiBelow: 100, ladder: [[4000, 0, 100, 5, 10], [4100, 200, 0, null, 0]], zones: [{ px: 4100, oi: 200, call: 200, put: 0 }], history: [['2026-11-06', 7, 0, 0.6, 1, 2, 300, 0]] },
    { pair: 'XAU/USD', expiry: '2026-11-24', code: 'OGZ6', dte: 18, date: '2026-11-06', totalOI: 1000, ladder: [[4050, 500, 500]], zones: [], history: [] },
  ];
  const out = P.mergeSources({ cme, cboe, cmeUnit: 100, cboeUnit: 1, cboeLabel: 'GLD', ref: 4073, today: '2026-11-06' });
  assert.deepEqual(out.map(e => [e.expiry, e.source, e.sourceLabel]), [['2026-11-13', 'combined', 'CME+GLD'], ['2026-11-20', 'cboe', 'GLD'], ['2026-11-24', 'cme', 'CME']]);
  const m = out[0];
  assert.ok(near(m.totalOI, 300 * 100 + cboe[0].totalOI, 0.5), 'CME contracts × 100 oz plus GLD ounces');
  assert.ok(near(m.parts.cme.notional, 30000) && near(m.parts.cboe.notional, cboe[0].totalOI, 1e-6));
  assert.equal(m.ladder.length, cme[0].ladder.length + cboe[0].ladder.length, 'strikes unioned');
  assert.equal(m.gammaVolDaily, cboe[0].gammaVolDaily, 'the Cboe IV drives the merged gamma weighting');
  assert.equal(m.history[0][6], 30000, 'CME history kept, in notional');
  assert.equal(out[2].totalOI, 100000, 'a CME-only date is scaled to notional');
  assert.equal(out[2].ladder[0][1], 50000);
  assert.equal(out[1].totalOI, cboe[1].totalOI, 'a Cboe-only date keeps its ounces');
  // the walk reads the merged rows unchanged, and its points carry the source
  const w = zoneWalk(out, { close: 4073, anchor: 'gammaCentre', includeThin: true, vol: 0.012, date: '2026-11-06', maxDte: P.PATH_HORIZON_DAYS });
  assert.deepEqual(w.points.map(p => p.sourceLabel), ['CME+GLD', 'GLD', 'CME']);
});

test('zoneWalk: an expiry\'s own IV (gammaVolDaily) moves the gamma centre; CME rows without it are unchanged', () => {
  const e = { expiry: '2026-12-18', dte: 42, totalOI: 1000, ladder: [[3800, 0, 500], [4300, 500, 0]] };
  const base = { close: 4000, anchor: 'gammaCentre', includeThin: true, vol: 0.01, date: '2026-11-06' };
  const a = zoneWalk([e], base).points[0].px, b = zoneWalk([{ ...e, gammaVolDaily: 0.01 }], base).points[0].px;
  assert.equal(a, b, 'same vol, same centre');
  const c = zoneWalk([{ ...e, gammaVolDaily: 0.03 }], base).points[0].px;
  assert.notEqual(a, c);
  assert.equal(zoneWalk([e], base).points[0].source, 'cme');
});

test('as-of labels: OCC OI is the prior session; greeks at the quote time', () => {
  assert.equal(P.occOiDate(Date.UTC(2026, 10, 6, 19, 4)), '2026-11-05', 'Friday session → Thursday OI');
  assert.equal(P.occOiDate(Date.UTC(2026, 10, 9, 15, 0)), '2026-11-06', 'Monday → Friday');
  assert.equal(P.occOiDate(Date.UTC(2026, 10, 8, 12, 0)), '2026-11-05', 'Sunday: Cboe serves Friday\'s close, OI from Thursday');
  const s = P.sourceAsOf({ id: 'cboe', label: 'GLD', oiDate: '2026-11-05', asOfMs: Date.UTC(2026, 10, 6, 19, 4) });
  assert.equal(s.oi, 'OI as of 2026-11-05 (prior day, OCC)');
  assert.equal(s.greeks, 'greeks as of 19:04 UTC (15-min delayed)');
  assert.match(P.sourceAsOf({ id: 'cme', captureDate: '2026-11-06' }).oi, /2026-11-06/);
});

test('beyond the core window: flagged, thin judged against the core OI', () => {
  const r = P.beyondCoreRows([{ expiry: '2027-03-24', totalOI: 45 }, { expiry: '2027-05-25', totalOI: 5 }], { coreOI: 100, thinFloor: 0.1 });
  assert.deepEqual(r.map(x => [x.beyondCore, x.thin, x.oiShare]), [[true, false, 0.45], [true, true, 0.05]]);
});

test('swingExpiryRow: the CME row shape (every field the server used to build inline)', () => {
  const v = { expiry: '2026-11-24', code: 'OGZ6', n: 2, days: [
    { date: '2026-11-05', dte: 19, stale: false, totalOI: 10, centrePx: 4000, pullPct: 1, shareAbove: 0.5, buildAbove: null, buildBelow: null },
    { date: '2026-11-06', dte: 18, stale: false, totalOI: 12, centrePx: 4010, maxPain: 3990, chgNearSpot: 1, chgAwayFromSpot: 1, zones: [], ladder: [[4000, 1, 1, 0, 0]], oiAbove: 6, oiBelow: 6, shareAbove: 0.5, pullPct: 0.2, buildAbove: 1, buildBelow: 1, gamma: { regime: 'PIN' }, greeks: { charm1d: 1 } }] };
  const row = P.swingExpiryRow('XAU/USD', v, { greeks: d => ({ ...d.greeks, x: 1 }) });
  assert.deepEqual(Object.keys(row), ['pair', 'expiry', 'code', 'dte', 'date', 'stale', 'totalOI', 'totalOIFirst', 'firstSeen', 'nights', 'centrePx', 'centrePxFirst', 'maxPain',
    'chgNearSpot', 'chgAwayFromSpot', 'zones', 'ladder', 'oiAbove', 'oiBelow', 'shareAbove', 'pullPct', 'buildAbove', 'buildBelow', 'gamma', 'greeks', 'history']);
  assert.equal(row.totalOIFirst, 10); assert.equal(row.centrePxFirst, 4000); assert.equal(row.greeks.x, 1); assert.equal(row.history.length, 2);
  assert.equal(P.swingExpiryRow('XAU/USD', null), null);
});

test('merge: a CME expiry dated one day late joins the Cboe book of the day before (not when that day has its own CME)', () => {
  const c = (expiry, oi) => ({ pair: 'SPX500_USD', expiry, dte: 4, date: '2026-11-06', totalOI: oi, ladder: [[7400, oi / 2, oi / 2]], zones: [], history: [] });
  const b = (expiry, oi) => ({ ...c(expiry, oi), source: 'cboe', sourceLabel: 'SPX', ivAtm: 0.15, gammaVolDaily: 0.15 / Math.sqrt(252) });
  const out = P.mergeSources({ cme: [c('2026-11-10', 100), c('2026-11-12', 100), c('2026-11-11', 50)], cboe: [b('2026-11-09', 10), b('2026-11-11', 10)], cmeUnit: 50, cboeUnit: 100, cboeLabel: 'SPX', ref: 7400, today: '2026-11-06' });
  assert.deepEqual(out.map(e => [e.expiry, e.sourceLabel]), [['2026-11-09', 'CME+SPX'], ['2026-11-11', 'CME+SPX'], ['2026-11-12', 'CME']]);
  assert.equal(out[0].parts.cme.expiry, '2026-11-10');
  assert.equal(out[1].parts.cme.expiry, '2026-11-11', 'an exact date wins; 12 Nov stays on its own');
});
