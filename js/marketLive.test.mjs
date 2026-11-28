import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, step, view, ccyStrength, legs, PATH_STEP_MS } from './marketLive.js';

const L = (open, d) => ({ open, up: { p50: open + d, p75: open + 1.5 * d, p90: open + 2 * d }, down: { p50: open - d, p75: open - 1.5 * d, p90: open - 2 * d } });
const cards = { GBPJPY: { levels: L(208.12, 0.58) }, EURUSD: { levels: L(1.05, 0.004) }, XAUUSD: {} };
const t0 = 1_700_000_000;   // s
const bars = {
  GBPJPY: [{ time: t0, open: 208.1, high: 208.2, low: 208.08, close: 208.15 }, { time: t0 + 60, open: 208.15, high: 208.72, low: 208.1, close: 208.6 }],
  EURUSD: [{ time: t0, open: 1.05, high: 1.051, low: 1.0485, close: 1.049 }],
  XAUUSD: [{ time: t0, open: 2650, high: 2660, low: 2645, close: 2655 }],
};

test('legs: FX pairs only', () => {
  assert.deepEqual(legs('GBPJPY'), ['GBP', 'JPY']);
  assert.equal(legs('XAUUSD'), null);
  assert.equal(legs('NAS100'), null);
});

test('seed: the card open where it has one, else the first bar; high and low from the bars', () => {
  const s = seed(cards, bars, '2026-11-23');
  assert.equal(s.markets.GBPJPY.open, 208.12);
  assert.equal(s.markets.GBPJPY.hi, 208.72);
  assert.equal(s.markets.GBPJPY.lo, 208.08);
  assert.equal(s.markets.GBPJPY.last, 208.6);
  assert.equal(s.markets.XAUUSD.open, 2650);
});

test('step and view: the move in u, lines touched, position in the range, the 5-minute path', () => {
  const s = seed(cards, bars, '2026-11-23');
  step(s, { GBPJPY: 208.64, NOPE: 1 }, (t0 + 60) * 1000 + 30_000);
  step(s, { GBPJPY: 208.5 }, (t0 + 60) * 1000 + PATH_STEP_MS);
  const v = view(s, cards);
  assert.equal(v.GBPJPY.last, 208.5);
  assert.equal(v.GBPJPY.nowU, 0.66);            // (208.5 - 208.12) / 0.58
  assert.equal(v.GBPJPY.highU, 1.03);
  assert.deepEqual(v.GBPJPY.touched, ['up p50']);
  assert.ok(v.GBPJPY.pos > 0.6 && v.GBPJPY.pos < 0.7);
  assert.ok(v.GBPJPY.path.length >= 2 && v.GBPJPY.path.at(-1) === 208.5);
  assert.equal(v.XAUUSD.nowU, null);            // no lines, no unit
  assert.equal(v.XAUUSD.chgPct, 0.189);
});

test('ccyStrength: base counts for, quote against, ranked', () => {
  const rows = ccyStrength({ GBPJPY: { nowU: 1 }, EURUSD: { nowU: -0.5 }, EURJPY: { nowU: 0.2 }, XAUUSD: { nowU: 3 } });
  const by = Object.fromEntries(rows.map(r => [r.ccy, r]));
  assert.equal(by.GBP.score, 1);
  assert.equal(by.JPY.score, -0.6);              // mean of -1 and -0.2
  assert.equal(by.USD.score, 0.5);
  assert.equal(by.EUR.score, -0.15);
  assert.equal(rows[0].ccy, 'GBP');
  assert.equal(rows.at(-1).ccy, 'JPY');
  assert.equal(by.GBP.rank, 1);
});

import { dayType, riskTape, tapeHistory, tapeSince, priceAt, reaction, retailSince, nudges, sessionOf } from './marketLive.js';

test('dayType: the day forecaster\'s rule', () => {
  assert.equal(dayType(0.2, 0.3), 'quiet');
  assert.equal(dayType(0.9, 1.0), 'trend up');
  assert.equal(dayType(-0.6, 1.0), 'trend down');
  assert.equal(dayType(0.2, 1.0), 'range');
  assert.equal(dayType(null, null, 5, 8), 'trend up');   // no unit: the raw move against the raw range
});

test('sessionOf: London wall hours', () => {
  assert.equal(sessionOf(Date.parse('2026-11-23T03:00:00Z')), 'asia');
  assert.equal(sessionOf(Date.parse('2026-11-23T09:00:00Z')), 'london');
  assert.equal(sessionOf(Date.parse('2026-11-23T15:00:00Z')), 'ny');
  assert.equal(sessionOf(Date.parse('2026-07-01T06:30:00Z')), 'london');   // BST: 07:30 London
});

test('riskTape: equities for, havens against, AUD/NZD for; gold shown, not scored', () => {
  const t = riskTape({ NQ: { nowU: 0.8 }, SPX500: { nowU: 0.6 }, GOLD: { nowU: -0.3 } }, [{ ccy: 'JPY', score: -0.6 }, { ccy: 'CHF', score: -0.2 }, { ccy: 'AUD', score: 0.3 }]);
  assert.equal(t.label, 'risk-on');
  assert.equal(t.legs.equities, 0.7);
  assert.equal(t.legs.havens, -0.4);
  assert.equal(t.legs.gold, -0.3);
  assert.equal(t.score, 0.47);                    // mean of 0.7, 0.4, 0.3
  assert.equal(riskTape({}, []), null);
  const h = []; tapeHistory(h, t, 1); tapeHistory(h, t, 2); tapeHistory(h, { label: 'mixed' }, 3);
  assert.deepEqual(h.map(x => x.at), [1, 3]);
});

test('tapeSince: "since at least" when the history began mid-day with one label (a restart with no saved history)', () => {
  const day = Date.parse('2026-11-27T00:00:00Z'), restart = Date.parse('2026-11-27T18:31:00Z');
  assert.deepEqual(tapeSince([{ at: restart, label: 'risk-on' }], restart, day), { since: restart, atLeast: true });
  // seen from the start of the day: the time is exact
  assert.deepEqual(tapeSince([{ at: day + 60_000, label: 'risk-on' }], day + 60_000, day), { since: day + 60_000, atLeast: false });
  // a change seen after the restart is exact too
  assert.equal(tapeSince([{ at: restart, label: 'mixed' }, { at: restart + 600_000, label: 'risk-on' }], restart, day).atLeast, false);
  assert.equal(tapeSince([], restart, day), null);
});

test('reaction: the currency\'s move over 15 minutes after a print, across its pairs', () => {
  const t = Date.parse('2026-11-23T09:30:00Z'), P = 5 * 60_000;
  const state = { markets: { GBPUSD: { path: [[t - P, 1.30], [t, 1.301], [t + 3 * P, 1.304]] }, EURGBP: { path: [[t - P, 0.85], [t + 3 * P, 0.848]] } } };
  const cards = { GBPUSD: { unit: 0.004 }, EURGBP: { unit: 0.002 } };
  assert.equal(priceAt(state.markets.GBPUSD.path, t + 60_000), 1.301);
  assert.equal(reaction(state, cards, 'GBP', t, 15, t + 10 * 60_000), null);   // too early
  assert.equal(reaction(state, cards, 'GBP', t, 15, t + 20 * 60_000), 1);      // GBPUSD +1u, EURGBP -1u for EUR = +1u for GBP
});

test('retailSince: now against the first row of the morning', () => {
  const open = Date.parse('2026-11-23T07:00:00Z') / 1000;
  const r = retailSince([[open - 600, 0, 88], [open + 60, 0, 86.2], [open + 7200, 0, 79]], open * 1000);
  assert.deepEqual([r.longPct, r.atOpen, r.d], [79, 86.2, -7.2]);
  assert.equal(retailSince([], 0), null);
});

test('nudges: new p75/p90 lines, a new strongest or weakest, a tape turn; each once', () => {
  const fired = new Set();
  const prev = { markets: { GBPJPY: { touched: ['up p50'] } }, ccy: [{ ccy: 'GBP' }, { ccy: 'JPY' }], tape: { label: 'mixed' } };
  const cur = { markets: { GBPJPY: { touched: ['up p50', 'up p75'], nowU: 1.6 } }, ccy: [{ ccy: 'AUD' }, { ccy: 'JPY' }], tape: { label: 'risk-on', score: 0.4, legs: {} } };
  const n = nudges(prev, cur, fired);
  assert.deepEqual(n.map(x => x.key.split(':')[0]), ['line', 'top', 'tape']);
  assert.equal(nudges(prev, cur, fired).length, 0);
  assert.equal(nudges(null, cur, fired).length, 0);
});

import { refLevels } from './marketLive.js';
test('refLevels: yesterday and the week open', () => {
  const d1 = [{ date: '2026-11-20', open: 1, high: 2, low: 0.5, close: 1.5 }, { date: '2026-11-23', open: 1.5, high: 2.5, low: 1.2, close: 2.2 }, { date: '2026-11-24', open: 2.2, high: 3, low: 2, close: 2.9 }];
  assert.deepEqual(refLevels(d1, '2026-11-25'), { pdh: 3, pdl: 2, pdc: 2.9, pdDate: '2026-11-24', wo: 1.5 });
  assert.equal(refLevels(d1, '2026-11-23').wo, null);      // a Monday: no completed bar this week yet
  assert.equal(refLevels(d1, '2026-11-23').pdh, 2);
  assert.equal(refLevels([], '2026-11-23'), null);
});
test('view: unit, span used, path times', () => {
  const v = view({ markets: { X: { open: 100, hi: 101, lo: 99.5, last: 100.5, path: [[0, 100], [300000, 100.5]] } } }, { X: { levels: { open: 100, up: { p50: 101 }, down: { p50: 99 } } } });
  assert.equal(v.X.u, 1);
  assert.equal(v.X.spanUsed, 0.75);
  assert.deepEqual(v.X.pathT, [0, 300000]);
});
