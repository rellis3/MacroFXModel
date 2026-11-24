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
