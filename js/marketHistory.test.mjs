/**
 * marketHistory — parsers and committed seeds, no network.
 * Run: node --test js/marketHistory.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCboeCsv, parseYahooChart, loadSeed, mergeByDate, CBOE_INDICES, YAHOO_LONG } from './marketHistory.js';

test('Cboe CSV: OHLC files take CLOSE; single-column files take the value', () => {
  assert.deepEqual(parseCboeCsv('DATE,OPEN,HIGH,LOW,CLOSE\n01/02/1990,17.24,17.24,17.24,17.24\n10/30/2026,18.4,23.9,18.0,19.42'), [{ date: '1990-01-02', value: 17.24 }, { date: '2026-10-30', value: 19.42 }]);
  assert.deepEqual(parseCboeCsv('DATE,SKEW\n10/30/2026,149.76'), [{ date: '2026-10-30', value: 149.76 }]);
  assert.deepEqual(parseCboeCsv('<html>'), []);
});

test('Yahoo: FX dated by London date of (stamp − 1 min); indices by exchange date; last value per date', () => {
  const p = { chart: { result: [{ meta: { gmtoffset: -14400 }, timestamp: [Date.parse('2026-06-15T23:00:00Z') / 1000, Date.parse('2026-01-13T00:00:00Z') / 1000], indicators: { quote: [{ close: [1.1, 1.2] }] } }] } };
  assert.deepEqual(parseYahooChart(p, { fx: true }).map(x => x.date), ['2026-01-12', '2026-06-15']);
  const q = { chart: { result: [{ meta: { gmtoffset: -14400 }, timestamp: [Date.parse('2026-10-30T13:30:00Z') / 1000, Date.parse('2026-10-30T20:00:00Z') / 1000], indicators: { quote: [{ close: [95, 96] }] } }] } };
  assert.deepEqual(parseYahooChart(q), [{ date: '2026-10-30', value: 96 }]);
});

test('committed seeds give long history from the first boot', () => {
  const vix = loadSeed('cboe', 'VIX');
  assert.equal(vix[0].date, '1990-01-02');
  assert.ok(vix.length > 9000);
  assert.equal(CBOE_INDICES.length, 21);
  for (const s of CBOE_INDICES) assert.ok(loadSeed('cboe', s).length > 100, s);
  const move = loadSeed('yahoo', 'MOVE');
  assert.ok(move[0].date <= '2002-12-31' && move.length > 5000);
  const tnx = loadSeed('yahoo', 'TNX');
  assert.ok(tnx[0].date <= '1970-12-31');
  const brl = loadSeed('yahoo', 'FX_BRL');
  assert.ok(brl.length > 3000);
  assert.ok(Object.keys(YAHOO_LONG).length >= 28);
});

test('mergeByDate: later lists win, order by date', () => {
  assert.deepEqual(mergeByDate([{ date: '2026-01-02', value: 1 }, { date: '2026-01-01', value: 0 }], [{ date: '2026-01-02', value: 2 }]),
    [{ date: '2026-01-01', value: 0 }, { date: '2026-01-02', value: 2 }]);
});
